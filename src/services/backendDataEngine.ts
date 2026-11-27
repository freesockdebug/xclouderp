import {
  AmazonListingItem,
  AmazonOrderItem,
  AdCampaignItem,
  AdSearchTermItem,
  AuditLogItem,
  BomAssemblyOrder,
  ExchangeRateItem,
  FbaShipmentPlan,
  LocalMaterialSku,
  PurchaseOrder1688,
  SettlementPeriodItem,
  WarehouseStockLedger,
} from '../types/erp';
import {
  convertAmountToUsd,
  deduplicateAmazonOrders,
  getOrderEffectiveDateStr,
  getTargetDateRangeForMarketplace,
  isOrderCanceled,
  isOrderReplacement,
  SalesTimeWindow,
  SiteDateMode,
} from '../lib/erpEngine';
import {
  getDynamicSupabaseClient,
  isMissingTableError,
  isSupabaseConfigured,
  SupabaseConnectionConfig,
} from './supabaseClient';
import type { DatabaseLoadStatus, ErpEntityType } from './erpDatabaseService';

/**
 * Lightweight metadata loaded at app bootstrap (zero heavy operational tables).
 * Typically < 50 rows total so entering the app never stalls on a full DB dump.
 */
export const BOOTSTRAP_ENTITY_TYPES: readonly ErpEntityType[] = [
  'plans',
  'tenants',
  'rbacRoles',
  'teamMembers',
  'appModules',
  'installedModules',
  'shops',
] as const;

/**
 * Global (non-tenant-partitioned or cross-tenant) entity types.
 */
const GLOBAL_ENTITY_TYPES = new Set<ErpEntityType>([
  'plans',
  'tenants',
  'licenses',
  'appModules',
  'installedModules',
  'freightQuotes',
]);

/**
 * Strict per-page allowlist of entities required when opening each page.
 * Heavy list tables (orders on amazon tab, warehouseLedgers on warehouse tab,
 * searchTerms on ads tab) are served via paginated POST /api/erp/query instead
 * of bulk-loading into browser memory.
 */
export const PAGE_ENTITY_REQUIREMENTS: Record<string, readonly ErpEntityType[]> = {
  // Portal B: Tenant Workspace pages
  overview: [
    'listings',
    'orders',
    'localSkus',
    'purchaseOrders',
    'fbaShipments',
    'adCampaigns',
    'settlements',
    'exchangeRates',
    'profitSummaries',
  ],
  product_performance: ['listings', 'orders', 'localSkus', 'adCampaigns', 'exchangeRates'],
  amazon: ['listings', 'exchangeRates'], // orders loaded via POST /api/erp/query pagination
  inventory: ['localSkus', 'listings', 'purchaseOrders', 'suppliers', 'bomOrders'],
  warehouse: ['localSkus'], // warehouseLedgers loaded via POST /api/erp/query pagination
  fba: ['fbaShipments', 'localSkus', 'listings', 'freightQuotes'],
  ads: ['adCampaigns'], // searchTerms loaded via POST /api/erp/query pagination
  finance: [
    'settlements',
    'listings',
    'localSkus',
    'extraExpenses',
    'orders',
    'adCampaigns',
    'exchangeRates',
    'profitSummaries',
  ],
  ops_tools: ['listings', 'localSkus', 'adCampaigns', 'purchaseOrders', 'fbaShipments', 'settlements'],
  lingxing: ['orders'], // filtered server-side to PENDING orders only + exact counts for all domains
  mcp_downstream: ['mcpTokens'],
  rbac_center: ['rbacRoles', 'teamMembers', 'invitations', 'shops', 'auditLogs'],
  tenant_subscription: ['plans', 'licenses', 'shops', 'teamMembers', 'localSkus'],
  app_marketplace: ['appModules', 'installedModules'],
  workspace_settings: ['tenants'],

  // Portal A: Super Admin Console pages
  platform_overview: ['plans', 'tenants', 'licenses', 'appModules', 'installedModules', 'auditLogs'],
  tenants_billing: ['plans', 'tenants', 'licenses', 'appModules', 'installedModules'],
  app_catalog_manager: ['appModules', 'installedModules', 'tenants'],
  infra_auth_deploy: ['tenants', 'plans'],
  platform_audit: ['auditLogs', 'tenants'],
};

/**
 * Allowlist of entity types queryable via paginated POST /api/erp/query.
 */
export const ALLOWED_QUERY_ENTITIES = new Set<ErpEntityType>([
  'orders',
  'listings',
  'warehouseLedgers',
  'searchTerms',
  'purchaseOrders',
  'fbaShipments',
  'adCampaigns',
  'settlements',
  'localSkus',
  'bomOrders',
  'auditLogs',
]);

export interface PagedEntityQueryInput {
  entityType: ErpEntityType;
  tenantId?: string;
  roleCode?: string;
  allowedShopIds?: string[];
  page?: number;
  pageSize?: number;
  search?: string;
  filters?: {
    channel?: 'ALL' | 'FBA' | 'FBM' | 'MCF';
    dateWindow?: 'ALL' | SalesTimeWindow;
    dateMode?: SiteDateMode;
    excludeCanceled?: boolean;
    excludeReplacement?: boolean;
    warehouseName?: string;
    scope?: string;
  };
  exchangeRates?: ExchangeRateItem[];
  nowDate?: Date;
}

export interface PagedEntityQuerySummary {
  totalUnits?: number;
  revenueUsd?: number;
  excludedCanceledCount?: number;
  excludedReplacementCount?: number;
}

export interface PagedEntityQueryResult<T = unknown> {
  entityType: ErpEntityType;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  items: T[];
  summary?: PagedEntityQuerySummary;
}

function passesShopScope(
  item: Record<string, unknown>,
  roleCode?: string,
  allowedShopIds?: string[]
): boolean {
  if (!roleCode || roleCode === 'TENANT_ADMIN') return true;
  const shopId = typeof item.shopId === 'string' ? item.shopId : '';
  if (!shopId) return true;
  if (!Array.isArray(allowedShopIds) || allowedShopIds.length === 0) return false;
  return allowedShopIds.includes(shopId);
}

/**
 * Pure server-side filter, shop-scope isolation, summary aggregation, and pagination slicer.
 * Guarantees the browser receives ONLY the requested page slice while totals stay 100% accurate.
 */
export function executePagedEntityQuery<T = unknown>(
  rawRecords: unknown[],
  input: PagedEntityQueryInput
): PagedEntityQueryResult<T> {
  const pageSize = Math.max(5, Math.min(200, Math.floor(Number(input.pageSize) || 20)));
  const requestedPage = Math.max(1, Math.floor(Number(input.page) || 1));
  const search = (input.search || '').trim().toLowerCase();
  const tenantId = (input.tenantId || '').trim();
  const filters = input.filters || {};

  // 1. Tenant isolation & shop-scope isolation
  const scoped = rawRecords.filter((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const rec = entry as Record<string, unknown>;
    if (tenantId && typeof rec.tenantId === 'string' && rec.tenantId !== tenantId) {
      return false;
    }
    if (
      input.entityType === 'orders' ||
      input.entityType === 'listings' ||
      input.entityType === 'adCampaigns' ||
      input.entityType === 'settlements'
    ) {
      if (!passesShopScope(rec, input.roleCode, input.allowedShopIds)) {
        return false;
      }
    }
    return true;
  });

  // 2. Specialized server-side filtering + summary for Amazon Orders
  if (input.entityType === 'orders') {
    const deduped = deduplicateAmazonOrders(scoped as AmazonOrderItem[]);
    const nowDate = input.nowDate || new Date();
    const channel = filters.channel || 'ALL';
    const dateWindow = filters.dateWindow || 'ALL';
    const dateMode: SiteDateMode =
      filters.dateMode === 'LATEST_SITE' || filters.dateMode === 'BEIJING'
        ? filters.dateMode
        : 'PER_SITE';
    const excludeCanceled = filters.excludeCanceled !== false;
    const excludeReplacement = filters.excludeReplacement !== false;
    const exchangeRates = input.exchangeRates || [];

    let canceledCnt = 0;
    let replacementCnt = 0;
    let totalUnits = 0;
    let totalRevenueUsd = 0;
    const matched: AmazonOrderItem[] = [];

    for (const o of deduped) {
      const matchChannel = channel === 'ALL' || o.fulfillmentChannel === channel;
      const matchQuery =
        !search ||
        (o.amazonOrderId || '').toLowerCase().includes(search) ||
        (o.asin || '').toLowerCase().includes(search) ||
        (o.msku || '').toLowerCase().includes(search) ||
        (o.shopName || '').toLowerCase().includes(search);
      if (!matchChannel || !matchQuery) continue;

      if (dateWindow !== 'ALL') {
        const range = getTargetDateRangeForMarketplace(
          o.marketplace,
          dateWindow,
          dateMode,
          nowDate
        );
        const effDate = getOrderEffectiveDateStr(o, dateMode);
        if (!effDate || effDate < range.startDate || effDate > range.endDate) {
          continue;
        }
      }

      if (isOrderCanceled(o)) {
        canceledCnt += 1;
        if (excludeCanceled) continue;
      }

      if (isOrderReplacement(o)) {
        replacementCnt += 1;
        if (excludeReplacement) continue;
      }

      matched.push(o);
      totalUnits += Math.max(1, Math.round(o.quantity || 1));
      totalRevenueUsd += convertAmountToUsd(
        o.orderAmountUsd,
        o.currency,
        o.marketplace,
        exchangeRates
      );
    }

    matched.sort((a, b) => String(b.purchaseDate || '').localeCompare(String(a.purchaseDate || '')));

    const totalItems = matched.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(requestedPage, totalPages);
    const startIndex = (safePage - 1) * pageSize;

    return {
      entityType: 'orders',
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
      items: matched.slice(startIndex, startIndex + pageSize) as unknown as T[],
      summary: {
        totalUnits,
        revenueUsd: Number(totalRevenueUsd.toFixed(2)),
        excludedCanceledCount: canceledCnt,
        excludedReplacementCount: replacementCnt,
      },
    };
  }

  // 3. Listings search & pagination
  if (input.entityType === 'listings') {
    const matched = (scoped as AmazonListingItem[]).filter(
      (l) =>
        !search ||
        (l.asin || '').toLowerCase().includes(search) ||
        (l.msku || '').toLowerCase().includes(search) ||
        (l.title || '').toLowerCase().includes(search) ||
        (l.localSkuCode || '').toLowerCase().includes(search)
    );
    const totalItems = matched.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(requestedPage, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    return {
      entityType: 'listings',
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
      items: matched.slice(startIndex, startIndex + pageSize) as unknown as T[],
    };
  }

  // 4. Warehouse stock ledgers search, newest-first sort & pagination
  if (input.entityType === 'warehouseLedgers') {
    const matched = (scoped as WarehouseStockLedger[]).filter((l) => {
      if (filters.warehouseName && filters.warehouseName !== 'ALL' && l.warehouseName !== filters.warehouseName) {
        return false;
      }
      if (!search) return true;
      return (
        (l.localSkuCode || '').toLowerCase().includes(search) ||
        (l.warehouseName || '').toLowerCase().includes(search) ||
        (l.referenceDoc || '').toLowerCase().includes(search) ||
        (l.ledgerNo || '').toLowerCase().includes(search) ||
        (l.batchNo || '').toLowerCase().includes(search) ||
        (l.orderSn || '').toLowerCase().includes(search) ||
        (l.purchaseOrderSn || '').toLowerCase().includes(search) ||
        (l.batchRemark || '').toLowerCase().includes(search)
      );
    });
    matched.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const totalItems = matched.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(requestedPage, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    return {
      entityType: 'warehouseLedgers',
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
      items: matched.slice(startIndex, startIndex + pageSize) as unknown as T[],
    };
  }

  // 5. Ad search terms search & pagination
  if (input.entityType === 'searchTerms') {
    const matched = (scoped as AdSearchTermItem[]).filter(
      (t) =>
        !search ||
        (t.searchTerm || '').toLowerCase().includes(search) ||
        (t.campaignName || '').toLowerCase().includes(search) ||
        (t.adGroupName || '').toLowerCase().includes(search)
    );
    const totalItems = matched.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(requestedPage, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    return {
      entityType: 'searchTerms',
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
      items: matched.slice(startIndex, startIndex + pageSize) as unknown as T[],
    };
  }

  // 6. Generic search & pagination for other allowed entity types
  const matched = scoped.filter((entry) => {
    if (input.entityType === 'auditLogs' && filters.scope) {
      if ((entry as AuditLogItem).scope !== filters.scope) return false;
    }
    if (input.entityType === 'localSkus' && filters.warehouseName && filters.warehouseName !== 'ALL') {
      if ((entry as LocalMaterialSku).warehouseName !== filters.warehouseName) return false;
    }
    if (!search) return true;
    const obj = entry as Record<string, unknown>;
    for (const val of Object.values(obj)) {
      if (typeof val === 'string' && val.toLowerCase().includes(search)) {
        return true;
      }
    }
    return false;
  });

  if (input.entityType === 'purchaseOrders') {
    (matched as PurchaseOrder1688[]).sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
  } else if (input.entityType === 'fbaShipments') {
    (matched as FbaShipmentPlan[]).sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
  } else if (input.entityType === 'bomOrders') {
    (matched as BomAssemblyOrder[]).sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
  } else if (input.entityType === 'settlements') {
    (matched as SettlementPeriodItem[]).sort((a, b) =>
      String(b.periodRange || '').localeCompare(String(a.periodRange || ''))
    );
  } else if (input.entityType === 'adCampaigns') {
    (matched as AdCampaignItem[]).sort((a, b) => (b.spend30dUsd || 0) - (a.spend30dUsd || 0));
  }

  const totalItems = matched.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(requestedPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;

  return {
    entityType: input.entityType,
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
    items: matched.slice(startIndex, startIndex + pageSize) as unknown as T[],
  };
}

// ============================================================================
// Server-Side Targeted Supabase Fetcher with Short-TTL Entity Cache
// ============================================================================

interface CachedEntitySlice {
  records: unknown[];
  fetchedAtMs: number;
}

const SERVER_CACHE_TTL_MS = 30_000;
const entitySliceCache = new Map<string, CachedEntitySlice>();

function buildCacheKey(projectUrl: string, entityType: ErpEntityType, tenantId?: string): string {
  const scope = !GLOBAL_ENTITY_TYPES.has(entityType) && tenantId ? tenantId : '__ALL__';
  return `${projectUrl}|${entityType}|${scope}`;
}

export function invalidateBackendEntityCache(entityTypes?: ErpEntityType[], tenantId?: string): void {
  if (!entityTypes || entityTypes.length === 0) {
    entitySliceCache.clear();
    return;
  }
  const typeSet = new Set(entityTypes);
  for (const key of Array.from(entitySliceCache.keys())) {
    const [, cachedType, cachedScope] = key.split('|');
    if (typeSet.has(cachedType as ErpEntityType)) {
      if (!tenantId || cachedScope === '__ALL__' || cachedScope === tenantId) {
        entitySliceCache.delete(key);
      }
    }
  }
}

export interface BackendEntityFetchResult {
  status: DatabaseLoadStatus;
  message: string;
  records: unknown[];
}

export async function fetchEntitySliceFromSupabase(
  config: SupabaseConnectionConfig,
  entityType: ErpEntityType,
  tenantId?: string
): Promise<BackendEntityFetchResult> {
  if (!isSupabaseConfigured(config)) {
    return {
      status: 'UNCONFIGURED',
      message: '尚未配置平台 Supabase 数据库连接，请先在平台超管控制台配置并测试连接。',
      records: [],
    };
  }

  const cacheKey = buildCacheKey(config.projectUrl, entityType, tenantId);
  const cached = entitySliceCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAtMs < SERVER_CACHE_TTL_MS) {
    return {
      status: 'LOADED',
      message: 'OK',
      records: cached.records,
    };
  }

  const client = getDynamicSupabaseClient(config);
  if (!client) {
    return {
      status: 'UNCONFIGURED',
      message: 'Supabase 客户端初始化失败，请检查 Project URL 与 Anon/Publishable Key。',
      records: [],
    };
  }

  const DB_PAGE_SIZE = 1000;
  const MAX_DB_PAGES = 150;
  const records: unknown[] = [];

  try {
    for (let page = 0; page < MAX_DB_PAGES; page++) {
      const from = page * DB_PAGE_SIZE;
      const to = from + DB_PAGE_SIZE - 1;
      let query = client
        .from('erp_domain_records')
        .select('payload')
        .eq('entity_type', entityType);

      if (!GLOBAL_ENTITY_TYPES.has(entityType) && tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data: chunk, error } = await query
        .order('record_id', { ascending: true })
        .range(from, to);

      if (error) {
        if (isMissingTableError(error)) {
          return {
            status: 'SCHEMA_MISSING',
            message:
              'Supabase 实例已连接，但尚未创建 [erp_domain_records] 全量持久化表。请复制最新「Supabase RLS SQL」到 Supabase SQL Editor 中执行一次。',
            records: [],
          };
        }
        return {
          status: 'ERROR',
          message: `读取 Supabase [${entityType}] 失败: ${error.message} (Code: ${error.code || 'UNKNOWN'})`,
          records: [],
        };
      }

      const rows = (chunk || []) as Array<{ payload: unknown }>;
      for (const r of rows) {
        if (r && r.payload && typeof r.payload === 'object') {
          records.push(r.payload);
        }
      }
      if (rows.length < DB_PAGE_SIZE) {
        break;
      }
    }

    entitySliceCache.set(cacheKey, { records, fetchedAtMs: Date.now() });
    return { status: 'LOADED', message: 'OK', records };
  } catch (err: unknown) {
    return {
      status: 'ERROR',
      message: `读取 Supabase [${entityType}] 异常: ${err instanceof Error ? err.message : String(err)}`,
      records: [],
    };
  }
}

export async function fetchEntityCountsFromSupabase(
  config: SupabaseConnectionConfig,
  tenantId?: string
): Promise<Partial<Record<ErpEntityType, number>>> {
  const client = getDynamicSupabaseClient(config);
  if (!client) return {};

  const targetTypes: ErpEntityType[] = [
    'shops',
    'localSkus',
    'listings',
    'orders',
    'suppliers',
    'purchaseOrders',
    'bomOrders',
    'warehouseLedgers',
    'fbaShipments',
    'adCampaigns',
    'searchTerms',
    'settlements',
    'exchangeRates',
    'profitSummaries',
  ];

  const counts: Partial<Record<ErpEntityType, number>> = {};
  await Promise.all(
    targetTypes.map(async (entityType) => {
      try {
        let q = client
          .from('erp_domain_records')
          .select('record_id', { count: 'exact', head: true })
          .eq('entity_type', entityType);
        if (!GLOBAL_ENTITY_TYPES.has(entityType) && tenantId) {
          q = q.eq('tenant_id', tenantId);
        }
        const { count } = await q;
        counts[entityType] = typeof count === 'number' ? count : 0;
      } catch {
        counts[entityType] = 0;
      }
    })
  );

  return counts;
}

export async function fetchBootstrapFromSupabase(
  config: SupabaseConnectionConfig
): Promise<{
  status: DatabaseLoadStatus;
  message: string;
  recordCount: number;
  data: Partial<Record<ErpEntityType, unknown[]>>;
}> {
  if (!isSupabaseConfigured(config)) {
    return {
      status: 'UNCONFIGURED',
      message: '尚未配置平台 Supabase 数据库连接，请先在平台超管控制台配置并测试连接。',
      recordCount: 0,
      data: {},
    };
  }

  const client = getDynamicSupabaseClient(config);
  if (!client) {
    return {
      status: 'UNCONFIGURED',
      message: 'Supabase 客户端初始化失败，请检查 Project URL 与 Anon/Publishable Key。',
      recordCount: 0,
      data: {},
    };
  }

  try {
    // Single lightweight query for shell metadata only (zero orders/listings/ledgers/ads)
    const { data: rows, error } = await client
      .from('erp_domain_records')
      .select('entity_type, payload')
      .in('entity_type', [...BOOTSTRAP_ENTITY_TYPES])
      .order('entity_type', { ascending: true })
      .order('record_id', { ascending: true })
      .range(0, 999);

    if (error) {
      if (isMissingTableError(error)) {
        return {
          status: 'SCHEMA_MISSING',
          message:
            'Supabase 实例已连接，但尚未创建 [erp_domain_records] 全量持久化表。请复制最新「Supabase RLS SQL」到 Supabase SQL Editor 中执行一次。',
          recordCount: 0,
          data: {},
        };
      }
      return {
        status: 'ERROR',
        message: `读取 Supabase 元数据失败: ${error.message} (Code: ${error.code || 'UNKNOWN'})`,
        recordCount: 0,
        data: {},
      };
    }

    const grouped: Partial<Record<ErpEntityType, unknown[]>> = {};
    for (const key of BOOTSTRAP_ENTITY_TYPES) {
      grouped[key] = [];
    }
    const typedRows = (rows || []) as Array<{ entity_type: string; payload: unknown }>;
    for (const r of typedRows) {
      const et = r.entity_type as ErpEntityType;
      if (grouped[et] && r.payload && typeof r.payload === 'object') {
        grouped[et]!.push(r.payload);
      }
    }

    // Lightweight total row count across all entity types via head:true count query
    const { count: totalCount } = await client
      .from('erp_domain_records')
      .select('record_id', { count: 'exact', head: true });

    const effectiveTotal = typeof totalCount === 'number' ? totalCount : typedRows.length;
    if (effectiveTotal === 0) {
      return {
        status: 'EMPTY_DB',
        message:
          '已成功连接 Supabase [erp_domain_records]，但当前库内暂无任何业务记录。可在平台超管控制台一键初始化标准演示账套。',
        recordCount: 0,
        data: grouped,
      };
    }

    return {
      status: 'LOADED',
      message: `已连接后台实时数据库 (共 ${effectiveTotal.toLocaleString()} 条业务记录，按页面按需查询)`,
      recordCount: effectiveTotal,
      data: grouped,
    };
  } catch (err: unknown) {
    return {
      status: 'ERROR',
      message: `连接 Supabase 异常: ${err instanceof Error ? err.message : String(err)}`,
      recordCount: 0,
      data: {},
    };
  }
}

/**
 * Loads ONLY the entities required by a specific pageId from Supabase on the backend.
 * For overview / product_performance, trims orders to the page's active analysis window
 * so multi-year order archives stay in the backend database.
 */
export async function fetchPageDataFromSupabase(params: {
  config: SupabaseConnectionConfig;
  pageId: string;
  tenantId?: string;
  roleCode?: string;
  allowedShopIds?: string[];
}): Promise<{
  ok: boolean;
  status: DatabaseLoadStatus;
  message: string;
  pageId: string;
  requiredEntities: ErpEntityType[];
  data: Partial<Record<ErpEntityType, unknown[]>>;
  entityCounts?: Partial<Record<ErpEntityType, number>>;
}> {
  const required = PAGE_ENTITY_REQUIREMENTS[params.pageId];
  if (!required) {
    return {
      ok: false,
      status: 'ERROR',
      message: `未知页面标识: ${params.pageId}`,
      pageId: params.pageId,
      requiredEntities: [],
      data: {},
    };
  }

  const data: Partial<Record<ErpEntityType, unknown[]>> = {};
  let finalStatus: DatabaseLoadStatus = 'LOADED';
  let finalMessage = 'OK';

  await Promise.all(
    required.map(async (entityType) => {
      const res = await fetchEntitySliceFromSupabase(params.config, entityType, params.tenantId);
      if (res.status !== 'LOADED') {
        finalStatus = res.status;
        finalMessage = res.message;
        data[entityType] = [];
        return;
      }

      let rows = res.records;

      // Apply server-side shop-scope filtering for non-admin tenant roles
      if (
        entityType === 'orders' ||
        entityType === 'listings' ||
        entityType === 'adCampaigns' ||
        entityType === 'settlements'
      ) {
        rows = rows.filter((entry) =>
          entry && typeof entry === 'object'
            ? passesShopScope(entry as Record<string, unknown>, params.roleCode, params.allowedShopIds)
            : false
        );
      }

      // Page-specific slimming: never send unnecessary historical rows to browser
      if (entityType === 'orders' && params.pageId === 'overview') {
        const cutoff = new Date(Date.now() - 70 * 86400000).toISOString().slice(0, 10);
        rows = (rows as AmazonOrderItem[]).filter(
          (o) => !o.purchaseDate || o.purchaseDate.slice(0, 10) >= cutoff
        );
      } else if (entityType === 'orders' && params.pageId === 'product_performance') {
        const cutoff = new Date(Date.now() - 100 * 86400000).toISOString().slice(0, 10);
        rows = (rows as AmazonOrderItem[]).filter(
          (o) => !o.purchaseDate || o.purchaseDate.slice(0, 10) >= cutoff
        );
      } else if (entityType === 'orders' && params.pageId === 'lingxing') {
        // Lingxing sync view only needs PENDING orders for incremental status re-check
        rows = (rows as AmazonOrderItem[]).filter((o) => o.orderStatus === 'PENDING');
      }

      data[entityType] = rows;
    })
  );

  let entityCounts: Partial<Record<ErpEntityType, number>> | undefined;
  if (params.pageId === 'lingxing' || params.pageId === 'overview') {
    entityCounts = await fetchEntityCountsFromSupabase(params.config, params.tenantId);
  }

  return {
    ok: finalStatus === 'LOADED',
    status: finalStatus,
    message: finalMessage,
    pageId: params.pageId,
    requiredEntities: [...required],
    data,
    entityCounts,
  };
}
