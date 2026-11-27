import {
  SubscriptionPlan,
  Tenant,
  BillingLicense,
  AmazonShop,
  FreightChannelQuote,
  LocalMaterialSku,
  AmazonListingItem,
  AmazonOrderItem,
  SupplierProfile,
  BomAssemblyOrder,
  PurchaseOrder1688,
  WarehouseStockLedger,
  FbaShipmentPlan,
  AdCampaignItem,
  AdSearchTermItem,
  SettlementPeriodItem,
  ExchangeRateItem,
  LingxingProfitSummaryItem,
  ExtraExpenseItem,
  RbacRoleDefinition,
  RbacTeamMember,
  ErpAppModule,
  TenantInstalledModule,
  TenantInvitation,
  McpTokenItem,
  AuditLogItem,
} from '../types/erp';
import {
  SUBSCRIPTION_PLANS,
  INITIAL_TENANTS,
  INITIAL_LICENSES,
  INITIAL_SHOPS,
  INITIAL_FREIGHT_QUOTES,
  INITIAL_LOCAL_SKUS,
  INITIAL_LISTINGS,
  INITIAL_ORDERS,
  INITIAL_SUPPLIERS,
  INITIAL_BOM_ASSEMBLIES,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_WAREHOUSE_LEDGERS,
  INITIAL_FBA_SHIPMENTS,
  INITIAL_AD_CAMPAIGNS,
  INITIAL_SEARCH_TERMS,
  INITIAL_SETTLEMENTS,
  INITIAL_EXTRA_EXPENSES,
  INITIAL_RBAC_ROLES,
  INITIAL_TEAM_MEMBERS,
  INITIAL_APP_MODULES,
  INITIAL_INSTALLED_MODULES,
  INITIAL_INVITATIONS,
  INITIAL_MCP_TOKENS,
  INITIAL_AUDIT_LOGS,
} from '../data/initialErpData';
import {
  SupabaseConnectionConfig,
  getDynamicSupabaseClient,
  isMissingTableError,
  isSupabaseConfigured,
} from './supabaseClient';

export type ErpEntityType =
  | 'plans'
  | 'tenants'
  | 'licenses'
  | 'shops'
  | 'freightQuotes'
  | 'localSkus'
  | 'listings'
  | 'orders'
  | 'suppliers'
  | 'bomOrders'
  | 'purchaseOrders'
  | 'warehouseLedgers'
  | 'fbaShipments'
  | 'adCampaigns'
  | 'searchTerms'
  | 'settlements'
  | 'exchangeRates'
  | 'profitSummaries'
  | 'extraExpenses'
  | 'rbacRoles'
  | 'teamMembers'
  | 'appModules'
  | 'installedModules'
  | 'invitations'
  | 'mcpTokens'
  | 'auditLogs';

export interface ErpDatabaseSnapshot {
  plans: SubscriptionPlan[];
  tenants: Tenant[];
  licenses: BillingLicense[];
  shops: AmazonShop[];
  freightQuotes: FreightChannelQuote[];
  localSkus: LocalMaterialSku[];
  listings: AmazonListingItem[];
  orders: AmazonOrderItem[];
  suppliers: SupplierProfile[];
  bomOrders: BomAssemblyOrder[];
  purchaseOrders: PurchaseOrder1688[];
  warehouseLedgers: WarehouseStockLedger[];
  fbaShipments: FbaShipmentPlan[];
  adCampaigns: AdCampaignItem[];
  searchTerms: AdSearchTermItem[];
  settlements: SettlementPeriodItem[];
  exchangeRates: ExchangeRateItem[];
  profitSummaries: LingxingProfitSummaryItem[];
  extraExpenses: ExtraExpenseItem[];
  rbacRoles: RbacRoleDefinition[];
  teamMembers: RbacTeamMember[];
  appModules: ErpAppModule[];
  installedModules: TenantInstalledModule[];
  invitations: TenantInvitation[];
  mcpTokens: McpTokenItem[];
  auditLogs: AuditLogItem[];
}

export type DatabaseLoadStatus =
  | 'UNCONFIGURED'
  | 'SCHEMA_MISSING'
  | 'EMPTY_DB'
  | 'LOADED'
  | 'ERROR';

export interface DatabaseLoadResult {
  status: DatabaseLoadStatus;
  snapshot: ErpDatabaseSnapshot;
  recordCount: number;
  latencyMs: number;
  message: string;
}

interface DomainRecordRow {
  entity_type: string;
  record_id: string;
  tenant_id: string;
  payload: unknown;
}

export function createEmptyErpSnapshot(): ErpDatabaseSnapshot {
  return {
    plans: [],
    tenants: [],
    licenses: [],
    shops: [],
    freightQuotes: [],
    localSkus: [],
    listings: [],
    orders: [],
    suppliers: [],
    bomOrders: [],
    purchaseOrders: [],
    warehouseLedgers: [],
    fbaShipments: [],
    adCampaigns: [],
    searchTerms: [],
    settlements: [],
    exchangeRates: [],
    profitSummaries: [],
    extraExpenses: [],
    rbacRoles: [],
    teamMembers: [],
    appModules: [],
    installedModules: [],
    invitations: [],
    mcpTokens: [],
    auditLogs: [],
  };
}

export function buildStandardSeedSnapshot(): ErpDatabaseSnapshot {
  return {
    plans: SUBSCRIPTION_PLANS,
    tenants: INITIAL_TENANTS,
    licenses: INITIAL_LICENSES,
    shops: INITIAL_SHOPS,
    freightQuotes: INITIAL_FREIGHT_QUOTES,
    localSkus: INITIAL_LOCAL_SKUS,
    listings: INITIAL_LISTINGS,
    orders: INITIAL_ORDERS,
    suppliers: INITIAL_SUPPLIERS,
    bomOrders: INITIAL_BOM_ASSEMBLIES,
    purchaseOrders: INITIAL_PURCHASE_ORDERS,
    warehouseLedgers: INITIAL_WAREHOUSE_LEDGERS,
    fbaShipments: INITIAL_FBA_SHIPMENTS,
    adCampaigns: INITIAL_AD_CAMPAIGNS,
    searchTerms: INITIAL_SEARCH_TERMS,
    settlements: INITIAL_SETTLEMENTS,
    exchangeRates: [],
    profitSummaries: [],
    extraExpenses: INITIAL_EXTRA_EXPENSES,
    rbacRoles: INITIAL_RBAC_ROLES,
    teamMembers: INITIAL_TEAM_MEMBERS,
    appModules: INITIAL_APP_MODULES,
    installedModules: INITIAL_INSTALLED_MODULES,
    invitations: INITIAL_INVITATIONS,
    mcpTokens: INITIAL_MCP_TOKENS,
    auditLogs: INITIAL_AUDIT_LOGS,
  };
}

function getRecordId(entityType: ErpEntityType, item: unknown): string {
  const rec = item as Record<string, unknown>;
  if (entityType === 'plans') return String(rec.planCode || rec.id || '');
  if (entityType === 'appModules') return String(rec.moduleCode || rec.id || '');
  if (entityType === 'freightQuotes') return String(rec.id || rec.carrierName || '');
  return String(rec.id || '');
}

function getRecordTenantId(entityType: ErpEntityType, item: unknown): string {
  const rec = item as Record<string, unknown>;
  if (entityType === 'tenants') return String(rec.id || 'platform');
  if (typeof rec.tenantId === 'string' && rec.tenantId) return rec.tenantId;
  return 'platform';
}

function toSysTenantRow(t: Tenant) {
  return {
    tenant_code: t.tenantCode,
    slug: t.slug,
    company_name: t.companyName,
    logto_org_id: t.logtoOrgId || null,
    isolation_mode: t.isolationMode,
    byod_supabase_url: t.byodSupabaseUrl || null,
    plan_code: t.planCode,
    subscription_status: t.subscriptionStatus,
    base_currency: t.baseCurrency,
    subscription_ends_at: t.subscriptionEndsAt,
    grace_ends_at: t.graceEndsAt,
    lingxing_mcp_url: t.lingxingMcpUrl,
    lingxing_mcp_key: t.lingxingMcpKey,
    lingxing_app_id: t.lingxingAppId || null,
    lingxing_connection_status: t.lingxingConnectionStatus,
    workspace_settings: t.workspaceSettings,
    used_mcp_calls_month: t.usedMcpCallsMonth,
    updated_at: new Date().toISOString(),
  };
}

const ALL_ENTITY_KEYS: ErpEntityType[] = [
  'plans',
  'tenants',
  'licenses',
  'shops',
  'freightQuotes',
  'localSkus',
  'listings',
  'orders',
  'suppliers',
  'bomOrders',
  'purchaseOrders',
  'warehouseLedgers',
  'fbaShipments',
  'adCampaigns',
  'searchTerms',
  'settlements',
  'exchangeRates',
  'profitSummaries',
  'extraExpenses',
  'rbacRoles',
  'teamMembers',
  'appModules',
  'installedModules',
  'invitations',
  'mcpTokens',
  'auditLogs',
];

/**
 * Loads ALL ERP & Multi-Tenant records directly from Supabase PostgreSQL.
 * Never silently falls back to hardcoded demo data.
 */
export async function loadErpDatabaseSnapshot(
  config: SupabaseConnectionConfig
): Promise<DatabaseLoadResult> {
  const start = Date.now();
  const empty = createEmptyErpSnapshot();

  if (!isSupabaseConfigured(config)) {
    return {
      status: 'UNCONFIGURED',
      snapshot: empty,
      recordCount: 0,
      latencyMs: 0,
      message: '尚未配置平台 Supabase 数据库连接，请先在平台超管控制台配置并测试连接。',
    };
  }

  const client = getDynamicSupabaseClient(config);
  if (!client) {
    return {
      status: 'UNCONFIGURED',
      snapshot: empty,
      recordCount: 0,
      latencyMs: 0,
      message: 'Supabase 客户端初始化失败，请检查 Project URL 与 Anon/Publishable Key。',
    };
  }

  try {
    // Paginate with .range() in 1,000-row chunks so Supabase PostgREST's default 1,000-row max-rows cap never truncates data
    const DB_PAGE_SIZE = 1000;
    const MAX_DB_PAGES = 150; // up to 150,000 records (supports 365-day orders + 6,000+ warehouse ledgers)
    const typedRows: DomainRecordRow[] = [];

    for (let page = 0; page < MAX_DB_PAGES; page++) {
      const from = page * DB_PAGE_SIZE;
      const to = from + DB_PAGE_SIZE - 1;
      const { data: chunk, error } = await client
        .from('erp_domain_records')
        .select('entity_type, record_id, tenant_id, payload')
        .order('entity_type', { ascending: true })
        .order('record_id', { ascending: true })
        .range(from, to);

      if (error) {
        const latencyMs = Date.now() - start;
        if (isMissingTableError(error)) {
          return {
            status: 'SCHEMA_MISSING',
            snapshot: empty,
            recordCount: 0,
            latencyMs,
            message:
              'Supabase 实例已连接，但尚未创建 [erp_domain_records] 全量持久化表。请复制最新「Supabase RLS SQL」到 Supabase SQL Editor 中执行一次。',
          };
        }
        if (error.code === '42501') {
          return {
            status: 'ERROR',
            snapshot: empty,
            recordCount: 0,
            latencyMs,
            message:
              '数据库表权限不足 (Code: 42501: permission denied)：请重新复制「平台超管控制台 → 全局认证与云端部署」中最新的 Supabase RLS SQL（已包含 GRANT 授权语句）到 Supabase SQL Editor 执行一次。',
          };
        }
        return {
          status: 'ERROR',
          snapshot: empty,
          recordCount: 0,
          latencyMs,
          message: `读取 Supabase 数据库失败: ${error.message} (Code: ${error.code || 'UNKNOWN'})`,
        };
      }

      const rowsChunk = (chunk || []) as DomainRecordRow[];
      typedRows.push(...rowsChunk);
      if (rowsChunk.length < DB_PAGE_SIZE) {
        break;
      }
    }

    const latencyMs = Date.now() - start;
    if (typedRows.length === 0) {
      return {
        status: 'EMPTY_DB',
        snapshot: empty,
        recordCount: 0,
        latencyMs,
        message:
          '已成功直连 Supabase 数据库，当前数据库为空（0 条记录）。可在平台超管控制台新建租户，或点击「一键初始化标准业务数据到 Supabase」写入初始基础表。',
      };
    }

    const snapshot = createEmptyErpSnapshot();
    const bucketMap = snapshot as unknown as Record<string, unknown[]>;
    for (const row of typedRows) {
      if (row.entity_type in bucketMap && row.payload && typeof row.payload === 'object') {
        bucketMap[row.entity_type].push(row.payload);
      }
    }

    // Merge authoritative Lingxing MCP fields from sys_tenants if present
    const { data: sysTenantRows } = await client
      .from('sys_tenants')
      .select(
        'tenant_code, lingxing_mcp_url, lingxing_mcp_key, lingxing_app_id, lingxing_connection_status, byod_supabase_url'
      );

    if (Array.isArray(sysTenantRows) && sysTenantRows.length > 0 && snapshot.tenants.length > 0) {
      const byCode = new Map(
        sysTenantRows.map((r: Record<string, unknown>) => [String(r.tenant_code), r])
      );
      snapshot.tenants = snapshot.tenants.map((t) => {
        const dbRow = byCode.get(t.tenantCode);
        if (!dbRow) return t;
        return {
          ...t,
          lingxingMcpUrl:
            typeof dbRow.lingxing_mcp_url === 'string' && dbRow.lingxing_mcp_url
              ? dbRow.lingxing_mcp_url
              : t.lingxingMcpUrl,
          lingxingMcpKey:
            typeof dbRow.lingxing_mcp_key === 'string' && dbRow.lingxing_mcp_key
              ? dbRow.lingxing_mcp_key
              : t.lingxingMcpKey,
          lingxingAppId:
            typeof dbRow.lingxing_app_id === 'string' ? dbRow.lingxing_app_id : t.lingxingAppId,
          lingxingConnectionStatus:
            dbRow.lingxing_connection_status === 'CONNECTED' ||
            dbRow.lingxing_connection_status === 'AUTH_ERROR' ||
            dbRow.lingxing_connection_status === 'PAUSED_BY_EXPIRY'
              ? dbRow.lingxing_connection_status
              : t.lingxingConnectionStatus,
          byodSupabaseUrl:
            typeof dbRow.byod_supabase_url === 'string'
              ? dbRow.byod_supabase_url
              : t.byodSupabaseUrl,
        };
      });
    }

    return {
      status: 'LOADED',
      snapshot,
      recordCount: typedRows.length,
      latencyMs,
      message: `已从 Supabase 实时加载 ${typedRows.length} 条真实业务记录 (${latencyMs}ms)`,
    };
  } catch (err: unknown) {
    return {
      status: 'ERROR',
      snapshot: empty,
      recordCount: 0,
      latencyMs: Date.now() - start,
      message: `连接 Supabase 异常: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Computes diff between previous and next ERP snapshot and persists ONLY changed/added/deleted records directly to Supabase.
 */
export async function syncErpSnapshotDiff(
  config: SupabaseConnectionConfig,
  prev: ErpDatabaseSnapshot,
  next: ErpDatabaseSnapshot,
  onlyEntityTypes?: Set<ErpEntityType>
): Promise<{
  ok: boolean;
  upserted: number;
  deleted: number;
  changedTypes?: ErpEntityType[];
  error?: string;
}> {
  const client = getDynamicSupabaseClient(config);
  if (!client) {
    return { ok: false, upserted: 0, deleted: 0, error: 'Supabase 未连接' };
  }

  const upsertRows: Array<{
    entity_type: string;
    record_id: string;
    tenant_id: string;
    payload: unknown;
    updated_at: string;
  }> = [];
  const deleteTargets: Array<{ entityType: ErpEntityType; recordId: string }> = [];
  const changedTenants: Tenant[] = [];
  const changedTypesSet = new Set<ErpEntityType>();
  const nowIso = new Date().toISOString();

  for (const entityType of ALL_ENTITY_KEYS) {
    if (onlyEntityTypes && !onlyEntityTypes.has(entityType)) continue;
    const prevList = prev[entityType] as unknown[];
    const nextList = next[entityType] as unknown[];
    if (prevList === nextList) continue;

    const prevMap = new Map<string, string>();
    for (const item of prevList) {
      const id = getRecordId(entityType, item);
      if (id) prevMap.set(id, JSON.stringify(item));
    }

    const nextIds = new Set<string>();
    for (const item of nextList) {
      const id = getRecordId(entityType, item);
      if (!id) continue;
      nextIds.add(id);
      const serialized = JSON.stringify(item);
      if (prevMap.get(id) !== serialized) {
        changedTypesSet.add(entityType);
        upsertRows.push({
          entity_type: entityType,
          record_id: id,
          tenant_id: getRecordTenantId(entityType, item),
          payload: item,
          updated_at: nowIso,
        });
        if (entityType === 'tenants') {
          changedTenants.push(item as Tenant);
        }
      }
    }

    for (const oldId of prevMap.keys()) {
      if (!nextIds.has(oldId)) {
        changedTypesSet.add(entityType);
        deleteTargets.push({ entityType, recordId: oldId });
      }
    }
  }

  if (upsertRows.length === 0 && deleteTargets.length === 0) {
    return { ok: true, upserted: 0, deleted: 0, changedTypes: [] };
  }

  try {
    if (upsertRows.length > 0) {
      for (let i = 0; i < upsertRows.length; i += 200) {
        const chunk = upsertRows.slice(i, i + 200);
        const { error } = await client
          .from('erp_domain_records')
          .upsert(chunk, { onConflict: 'entity_type,record_id' });
        if (error) {
          return {
            ok: false,
            upserted: 0,
            deleted: 0,
            error: `写入 Supabase 失败: ${error.message} (${error.code || 'UNKNOWN'})`,
          };
        }
      }
    }

    if (changedTenants.length > 0) {
      await client
        .from('sys_tenants')
        .upsert(changedTenants.map(toSysTenantRow), { onConflict: 'tenant_code' });
    }

    for (const target of deleteTargets) {
      await client
        .from('erp_domain_records')
        .delete()
        .eq('entity_type', target.entityType)
        .eq('record_id', target.recordId);
    }

    return {
      ok: true,
      upserted: upsertRows.length,
      deleted: deleteTargets.length,
      changedTypes: Array.from(changedTypesSet),
    };
  } catch (err: unknown) {
    return {
      ok: false,
      upserted: 0,
      deleted: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Direct upsert for targeted records on server-paginated tables (e.g., orders, warehouseLedgers, searchTerms)
 * without needing the full collection loaded in browser memory.
 */
export async function upsertErpEntityRecords(
  config: SupabaseConnectionConfig,
  entityType: ErpEntityType,
  items: unknown[]
): Promise<{ ok: boolean; upserted: number; error?: string }> {
  const client = getDynamicSupabaseClient(config);
  if (!client) {
    return { ok: false, upserted: 0, error: 'Supabase 未连接' };
  }
  if (!items || items.length === 0) {
    return { ok: true, upserted: 0 };
  }
  const nowIso = new Date().toISOString();
  const rows = items
    .map((item) => {
      const id = getRecordId(entityType, item);
      if (!id) return null;
      return {
        entity_type: entityType,
        record_id: id,
        tenant_id: getRecordTenantId(entityType, item),
        payload: item,
        updated_at: nowIso,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) {
    return { ok: true, upserted: 0 };
  }

  try {
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await client
        .from('erp_domain_records')
        .upsert(rows.slice(i, i + 200), { onConflict: 'entity_type,record_id' });
      if (error) {
        return { ok: false, upserted: 0, error: error.message };
      }
    }
    return { ok: true, upserted: rows.length };
  } catch (err: unknown) {
    return { ok: false, upserted: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Direct awaited write for Lingxing MCP credentials into BOTH erp_domain_records AND sys_tenants.
 */
export async function persistTenantLingxingToSupabase(
  config: SupabaseConnectionConfig,
  updatedTenant: Tenant
): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  const start = Date.now();
  const client = getDynamicSupabaseClient(config);
  if (!client) {
    return {
      ok: false,
      latencyMs: 0,
      message: '未连接到 Supabase 数据库，无法保存领星 MCP 配置。请先由平台超管配置数据库。',
    };
  }

  try {
    const nowIso = new Date().toISOString();
    const { error: recordErr } = await client.from('erp_domain_records').upsert(
      {
        entity_type: 'tenants',
        record_id: updatedTenant.id,
        tenant_id: updatedTenant.id,
        payload: updatedTenant,
        updated_at: nowIso,
      },
      { onConflict: 'entity_type,record_id' }
    );

    if (recordErr) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        message: isMissingTableError(recordErr)
          ? '保存失败：Supabase 中尚未执行最新建表 SQL（缺少 erp_domain_records 表）。请先在超管控制台复制 SQL 执行。'
          : `写入 Supabase 失败: ${recordErr.message} (Code: ${recordErr.code || 'UNKNOWN'})`,
      };
    }

    // Mirror into sys_tenants table as well
    const { error: sysErr } = await client
      .from('sys_tenants')
      .upsert(toSysTenantRow(updatedTenant), { onConflict: 'tenant_code' });

    const latencyMs = Date.now() - start;
    if (sysErr) {
      return {
        ok: true,
        latencyMs,
        message: `已保存至 Supabase [erp_domain_records] (${latencyMs}ms)，刷新不丢失（sys_tenants 镜像提示: ${sysErr.message}）`,
      };
    }

    return {
      ok: true,
      latencyMs,
      message: `已成功持久化写入 Supabase 数据库 [sys_tenants & erp_domain_records] (${latencyMs}ms)，刷新页面后自动加载。`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: `数据库保存异常: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Explicit Super Admin action: seeds an empty Supabase database with initial standard plans, tenants, and ERP records.
 */
export async function seedStandardErpDataToSupabase(
  config: SupabaseConnectionConfig
): Promise<{ ok: boolean; count: number; message: string }> {
  const client = getDynamicSupabaseClient(config);
  if (!client) {
    return { ok: false, count: 0, message: '请先配置并连接有效的 Supabase 数据库。' };
  }

  const seed = buildStandardSeedSnapshot();
  const nowIso = new Date().toISOString();
  const rows: Array<{
    entity_type: string;
    record_id: string;
    tenant_id: string;
    payload: unknown;
    updated_at: string;
  }> = [];

  for (const entityType of ALL_ENTITY_KEYS) {
    const items = seed[entityType] as unknown[];
    for (const item of items) {
      const id = getRecordId(entityType, item);
      if (!id) continue;
      rows.push({
        entity_type: entityType,
        record_id: id,
        tenant_id: getRecordTenantId(entityType, item),
        payload: item,
        updated_at: nowIso,
      });
    }
  }

  try {
    // 1. Ensure plans exist in sys_subscription_plans before sys_tenants foreign key upsert
    await client.from('sys_subscription_plans').upsert(
      seed.plans.map((p) => ({
        plan_code: p.planCode,
        plan_name: p.planName,
        monthly_price_cny: p.monthlyPriceCny,
        annual_price_cny: p.annualPriceCny,
        max_shops: p.maxShops,
        max_users: p.maxUsers,
        max_skus: p.maxSkus,
        max_dayparting_rules: p.maxDaypartingRules,
        mcp_calls_quota: p.mcpCallsQuota,
        sync_interval_minutes: p.syncIntervalMinutes,
      })),
      { onConflict: 'plan_code' }
    );

    // 2. Mirror tenants into sys_tenants
    await client
      .from('sys_tenants')
      .upsert(seed.tenants.map(toSysTenantRow), { onConflict: 'tenant_code' });

    // 3. Upsert all records into erp_domain_records in chunks of 100
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error } = await client
        .from('erp_domain_records')
        .upsert(chunk, { onConflict: 'entity_type,record_id' });
      if (error) {
        return {
          ok: false,
          count: 0,
          message: isMissingTableError(error)
            ? '初始化失败：请先在 Supabase SQL Editor 执行最新「Supabase RLS SQL」创建 erp_domain_records 表。'
            : `写入初始数据失败: ${error.message} (${error.code || 'UNKNOWN'})`,
        };
      }
    }

    return {
      ok: true,
      count: rows.length,
      message: `已成功将 ${rows.length} 条标准架构与业务基础数据写入 Supabase 真实数据库。`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      count: 0,
      message: `初始化异常: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Directly persists normalized Lingxing MCP entities across all 12 ERP domains
 * (shops, local SKUs, listings/ASINs, orders, suppliers, purchase orders, BOM processing orders,
 * warehouse ledgers, FBA shipments, ad campaigns, ad search terms, settlements) and updated tenant metadata
 * into Supabase erp_domain_records & sys_tenants.
 */
export async function persistLingxingSyncedEntities(
  config: SupabaseConnectionConfig,
  params: {
    tenant: Tenant;
    shops: AmazonShop[];
    localSkus?: LocalMaterialSku[];
    listings: AmazonListingItem[];
    orders: AmazonOrderItem[];
    suppliers?: SupplierProfile[];
    purchaseOrders?: PurchaseOrder1688[];
    bomOrders?: BomAssemblyOrder[];
    warehouseLedgers?: WarehouseStockLedger[];
    fbaShipments?: FbaShipmentPlan[];
    adCampaigns: AdCampaignItem[];
    searchTerms?: AdSearchTermItem[];
    settlements: SettlementPeriodItem[];
    exchangeRates?: ExchangeRateItem[];
    profitSummaries?: LingxingProfitSummaryItem[];
    updatedTeamMembers?: RbacTeamMember[];
    deleteDemoRecordIds?: Array<{ entityType: ErpEntityType; recordId: string }>;
    pruneStaleDomains?: ErpEntityType[];
    orderWindowStartDate?: string;
  }
): Promise<{ ok: boolean; upserted: number; deleted: number; latencyMs: number; message: string }> {
  const start = Date.now();
  const client = getDynamicSupabaseClient(config);
  if (!client) {
    return {
      ok: false,
      upserted: 0,
      deleted: 0,
      latencyMs: 0,
      message: '未连接到 Supabase 数据库，领星同步数据无法持久化。请先由平台超管配置数据库。',
    };
  }

  const localSkus = params.localSkus || [];
  const suppliers = params.suppliers || [];
  const purchaseOrders = params.purchaseOrders || [];
  const bomOrders = params.bomOrders || [];
  const warehouseLedgers = params.warehouseLedgers || [];
  const fbaShipments = params.fbaShipments || [];
  const searchTerms = params.searchTerms || [];
  const exchangeRates = params.exchangeRates || [];
  const profitSummaries = params.profitSummaries || [];
  const updatedTeamMembers = params.updatedTeamMembers || [];

  const nowIso = new Date().toISOString();
  const upsertRows: Array<{
    entity_type: string;
    record_id: string;
    tenant_id: string;
    payload: unknown;
    updated_at: string;
  }> = [
    {
      entity_type: 'tenants',
      record_id: params.tenant.id,
      tenant_id: params.tenant.id,
      payload: params.tenant,
      updated_at: nowIso,
    },
  ];

  const syncedIdsByDomain = new Map<ErpEntityType, Set<string>>();

  const pushBucket = (entityType: ErpEntityType, list: Array<{ id: string; tenantId: string }>) => {
    const idSet = new Set<string>();
    for (const item of list) {
      idSet.add(item.id);
      upsertRows.push({
        entity_type: entityType,
        record_id: item.id,
        tenant_id: item.tenantId || params.tenant.id,
        payload: item,
        updated_at: nowIso,
      });
    }
    if (idSet.size > 0) {
      syncedIdsByDomain.set(entityType, idSet);
    }
  };

  pushBucket('shops', params.shops);
  pushBucket('localSkus', localSkus);
  pushBucket('listings', params.listings);
  pushBucket('orders', params.orders);
  pushBucket('suppliers', suppliers);
  pushBucket('purchaseOrders', purchaseOrders);
  pushBucket('bomOrders', bomOrders);
  pushBucket('warehouseLedgers', warehouseLedgers);
  pushBucket('fbaShipments', fbaShipments);
  pushBucket('adCampaigns', params.adCampaigns);
  pushBucket('searchTerms', searchTerms);
  pushBucket('settlements', params.settlements);
  pushBucket('exchangeRates', exchangeRates);
  pushBucket('profitSummaries', profitSummaries);
  pushBucket('teamMembers', updatedTeamMembers);

  try {
    let deletedCount = 0;
    if (params.deleteDemoRecordIds && params.deleteDemoRecordIds.length > 0) {
      for (const del of params.deleteDemoRecordIds) {
        const { error: delErr } = await client
          .from('erp_domain_records')
          .delete()
          .eq('entity_type', del.entityType)
          .eq('record_id', del.recordId);
        if (!delErr) deletedCount++;
      }
    }

    // Upsert fresh records first so a failed write never leaves the database empty
    for (let i = 0; i < upsertRows.length; i += 200) {
      const chunk = upsertRows.slice(i, i + 200);
      const { error } = await client
        .from('erp_domain_records')
        .upsert(chunk, { onConflict: 'entity_type,record_id' });
      if (error) {
        return {
          ok: false,
          upserted: 0,
          deleted: deletedCount,
          latencyMs: Date.now() - start,
          message:
            error.code === '42501'
              ? '写入 Supabase 被拒绝 (42501)：请在 Supabase SQL Editor 执行最新 GRANT 授权语句后重试。'
              : `写入 Supabase 失败: ${error.message} (Code: ${error.code || 'UNKNOWN'})`,
        };
      }
    }

    // Prune stale lx-* records for domains that completed a full paginated sync
    // (preserves non-lx-* user-created local records such as manual MCF orders or draft POs)
    const pruneDomains = params.pruneStaleDomains || [];
    const orderWindowStart = (params.orderWindowStartDate || '').trim().slice(0, 10);
    for (const entityType of pruneDomains) {
      const freshIds = syncedIdsByDomain.get(entityType);
      if (!freshIds || freshIds.size === 0) continue;
      const staleIds: string[] = [];
      const PAGE = 1000;
      const useOrderWindowGuard =
        entityType === 'orders' && /^\d{4}-\d{2}-\d{2}$/.test(orderWindowStart);
      for (let p = 0; p < 150; p++) {
        const from = p * PAGE;
        const to = from + PAGE - 1;
        const { data: existingRows, error: fetchErr } = await client
          .from('erp_domain_records')
          .select(useOrderWindowGuard ? 'record_id, payload' : 'record_id')
          .eq('tenant_id', params.tenant.id)
          .eq('entity_type', entityType)
          .like('record_id', 'lx-%')
          .order('record_id', { ascending: true })
          .range(from, to);
        if (fetchErr || !Array.isArray(existingRows)) break;
        for (const row of existingRows as Array<{ record_id?: string; payload?: { purchaseDate?: string } }>) {
          const rid = typeof row.record_id === 'string' ? row.record_id : '';
          if (!rid || freshIds.has(rid)) continue;
          if (useOrderWindowGuard) {
            const pDate =
              typeof row.payload?.purchaseDate === 'string'
                ? row.payload.purchaseDate.slice(0, 10)
                : '';
            // Preserve valid historical orders older than the currently synced window
            if (/^\d{4}-\d{2}-\d{2}$/.test(pDate) && pDate < orderWindowStart) {
              continue;
            }
          }
          staleIds.push(rid);
        }
        if (existingRows.length < PAGE) break;
      }
      for (let i = 0; i < staleIds.length; i += 200) {
        const batch = staleIds.slice(i, i + 200);
        const { error: pruneErr } = await client
          .from('erp_domain_records')
          .delete()
          .eq('tenant_id', params.tenant.id)
          .eq('entity_type', entityType)
          .in('record_id', batch);
        if (!pruneErr) deletedCount += batch.length;
      }
    }

    await client
      .from('sys_tenants')
      .upsert(toSysTenantRow(params.tenant), { onConflict: 'tenant_code' });

    const latencyMs = Date.now() - start;
    const entityCount =
      params.shops.length +
      localSkus.length +
      params.listings.length +
      params.orders.length +
      suppliers.length +
      purchaseOrders.length +
      bomOrders.length +
      warehouseLedgers.length +
      fbaShipments.length +
      params.adCampaigns.length +
      searchTerms.length +
      params.settlements.length +
      exchangeRates.length +
      profitSummaries.length;

    return {
      ok: true,
      upserted: entityCount,
      deleted: deletedCount,
      latencyMs,
      message: `已将领星全量真实数据持久化至 Supabase (${latencyMs}ms${deletedCount > 0 ? `，清理陈旧/重复记录 ${deletedCount} 条` : ''})：店铺 ${params.shops.length} · 本地SKU ${localSkus.length} · ASIN ${params.listings.length} · 订单 ${params.orders.length} · 供应商 ${suppliers.length} · 采购单 ${purchaseOrders.length} · BOM加工 ${bomOrders.length} · 仓流水 ${warehouseLedgers.length} · FBA货件 ${fbaShipments.length} · 广告 ${params.adCampaigns.length} · 搜索词 ${searchTerms.length} · 财务 ${params.settlements.length}${exchangeRates.length > 0 ? ` · 汇率 ${exchangeRates.length}` : ''}${profitSummaries.length > 0 ? ` · 利润统计 ${profitSummaries.length}` : ''}`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      upserted: 0,
      deleted: 0,
      latencyMs: Date.now() - start,
      message: `领星数据写入 Supabase 异常: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

