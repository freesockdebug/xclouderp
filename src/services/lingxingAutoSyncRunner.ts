import { isTenantWritable } from '../lib/erpEngine';
import {
  normalizeSupabaseProjectUrl,
  SupabaseConnectionConfig,
} from './supabaseClient';
import {
  ErpEntityType,
  loadErpDatabaseSnapshot,
  persistLingxingSyncedEntities,
} from './erpDatabaseService';
import {
  DEFAULT_ORDER_SYNC_DAYS,
  DEFAULT_ORDER_INCREMENTAL_LOOKBACK_DAYS,
  DiscoveredMcpTool,
  LINGXING_OPENMCP_CORE_TOOLS,
  LingxingSyncDomain,
  buildDefaultArgsForTool,
  collectAllPaginatedRecords,
  collectChunkedDateRangeRecords,
  collectPendingOrderRefreshRecords,
  discoverOpenMcpToolByKeywords,
  extractRecordsFromMcpResult,
  isDemoFixtureRecord,
  normalizeLingxingRecordsForDomain,
  recordSignature,
  resolveIncrementalSyncPlan,
} from './lingxingMcpSync';
import type {
  LingxingSyncMode,
  LingxingIncrementalStrategy,
  LingxingDomainWatermark,
  AmazonShop,
  AmazonListingItem,
  AmazonOrderItem,
  AdCampaignItem,
  AdSearchTermItem,
  SettlementPeriodItem,
  ExchangeRateItem,
  LingxingProfitSummaryItem,
  LocalMaterialSku,
  SupplierProfile,
  PurchaseOrder1688,
  BomAssemblyOrder,
  WarehouseStockLedger,
  FbaShipmentPlan,
  RbacTeamMember,
  Tenant,
} from '../types/erp';

export interface LingxingSchedulerCounts {
  shops: number;
  localSkus: number;
  listings: number;
  orders: number;
  suppliers: number;
  purchaseOrders: number;
  bomOrders: number;
  warehouseLedgers: number;
  fbaShipments: number;
  adCampaigns: number;
  searchTerms: number;
  settlements: number;
  exchangeRates: number;
  profitSummaries: number;
  deletedDemoRecords: number;
}

export interface LingxingDomainSyncStat {
  domain: LingxingSyncDomain;
  toolName: string;
  pagesFetched: number;
  fetchedCount: number;
  upstreamTotal: number | null;
  complete: boolean;
  strategy?: LingxingIncrementalStrategy;
  windowLabel?: string;
}

export interface LingxingSchedulerStatus {
  enabled: boolean;
  running: boolean;
  isSyncingNow: boolean;
  intervalMinutes: number;
  orderSyncDays: number;
  syncMode: LingxingSyncMode;
  orderLookbackDays: number;
  supabaseConfigured: boolean;
  targetTenantId: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'ERROR';
  lastSummary: string;
  lastError: string | null;
  runCount: number;
  lastCounts: LingxingSchedulerCounts | null;
  lastDomainStats: LingxingDomainSyncStat[];
}

interface SchedulerInternalState {
  enabled: boolean;
  intervalMinutes: number;
  orderSyncDays: number;
  syncMode: LingxingSyncMode;
  orderLookbackDays: number;
  supabaseConfig: SupabaseConnectionConfig | null;
  targetTenantId: string | null;
  timer: ReturnType<typeof setInterval> | null;
  isSyncingNow: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'ERROR';
  lastSummary: string;
  lastError: string | null;
  runCount: number;
  lastCounts: LingxingSchedulerCounts | null;
  lastDomainStats: LingxingDomainSyncStat[];
}

const state: SchedulerInternalState = {
  enabled: false,
  intervalMinutes: 15,
  orderSyncDays: DEFAULT_ORDER_SYNC_DAYS,
  syncMode: 'INCREMENTAL',
  orderLookbackDays: DEFAULT_ORDER_INCREMENTAL_LOOKBACK_DAYS,
  supabaseConfig: null,
  targetTenantId: null,
  timer: null,
  isSyncingNow: false,
  lastRunAt: null,
  nextRunAt: null,
  lastStatus: 'IDLE',
  lastSummary: '尚未启动服务端定时同步任务',
  lastError: null,
  runCount: 0,
  lastCounts: null,
  lastDomainStats: [],
};

function isSafeHttpsUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function parseSseOrJson(rawText: string, contentType: string): unknown {
  const trimmed = rawText.trim();
  if (!trimmed) return {};
  if (contentType.includes('text/event-stream') || /^event:|^data:/m.test(trimmed)) {
    const dataLines = trimmed
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter((chunk) => chunk && chunk !== '[DONE]');
    for (let i = dataLines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(dataLines[i]);
      } catch {
        // continue
      }
    }
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return { rawText: trimmed.slice(0, 600) };
  }
}

async function callUpstreamLingxingMcp(params: {
  endpointUrl: string;
  apiKey: string;
  method: string;
  rpcParams?: Record<string, unknown>;
  sessionId?: string;
}): Promise<{ data: unknown; sessionId?: string }> {
  if (!isSafeHttpsUrl(params.endpointUrl)) {
    throw new Error('Blocked unsafe non-HTTPS or private MCP endpoint URL');
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (params.apiKey.trim()) {
    headers['X-Mcp-Key'] = params.apiKey.trim();
    headers.Authorization = `Bearer ${params.apiKey.trim()}`;
  }
  if (params.sessionId) {
    headers['Mcp-Session-Id'] = params.sessionId;
  }
  const res = await fetch(params.endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `lx-cron-${Date.now()}`,
      method: params.method,
      params: params.rpcParams || {},
    }),
    signal: AbortSignal.timeout(15000),
  });
  const nextSid =
    res.headers.get('mcp-session-id') ||
    res.headers.get('Mcp-Session-Id') ||
    params.sessionId;
  const text = await res.text();
  const parsed = parseSseOrJson(text, res.headers.get('content-type') || '');
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 180)}`);
  }
  return { data: parsed, sessionId: nextSid };
}

export async function syncSingleTenantFromLingxing(
  supabaseConfig: SupabaseConnectionConfig,
  tenant: Tenant,
  snapshot: Awaited<ReturnType<typeof loadErpDatabaseSnapshot>>['snapshot'] | null,
  clearDemoFixtures = true,
  orderSyncDays = state.orderSyncDays,
  syncMode: LingxingSyncMode = state.syncMode,
  orderLookbackDays = state.orderLookbackDays
): Promise<{
  ok: boolean;
  tenantCode: string;
  counts: LingxingSchedulerCounts;
  domainStats: LingxingDomainSyncStat[];
  message: string;
}> {
  const emptyCounts: LingxingSchedulerCounts = {
    shops: 0,
    localSkus: 0,
    listings: 0,
    orders: 0,
    suppliers: 0,
    purchaseOrders: 0,
    bomOrders: 0,
    warehouseLedgers: 0,
    fbaShipments: 0,
    adCampaigns: 0,
    searchTerms: 0,
    settlements: 0,
    exchangeRates: 0,
    profitSummaries: 0,
    deletedDemoRecords: 0,
  };

  if (!isTenantWritable(tenant)) {
    return {
      ok: false,
      tenantCode: tenant.tenantCode,
      counts: emptyCounts,
      domainStats: [],
      message: `租户 [${tenant.tenantCode}] 状态为 ${tenant.subscriptionStatus}，已触发订阅熔断跳过同步`,
    };
  }

  const endpointUrl = (tenant.lingxingMcpUrl || '').trim();
  const apiKey = (tenant.lingxingMcpKey || '').trim();
  if (!endpointUrl || !isSafeHttpsUrl(endpointUrl)) {
    return {
      ok: false,
      tenantCode: tenant.tenantCode,
      counts: emptyCounts,
      domainStats: [],
      message: `租户 [${tenant.tenantCode}] 未配置有效的 HTTPS 领星 MCP 地址`,
    };
  }

  // 1. Initialize MCP session
  let sessionId: string | undefined;
  try {
    const init = await callUpstreamLingxingMcp({
      endpointUrl,
      apiKey,
      method: 'initialize',
      rpcParams: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'x-cloud-erp-scheduler', version: '2.4.0' },
      },
    });
    sessionId = init.sessionId;
    if (sessionId) {
      await callUpstreamLingxingMcp({
        endpointUrl,
        apiKey,
        method: 'notifications/initialized',
        rpcParams: {},
        sessionId,
      }).catch(() => undefined);
    }
  } catch {
    // Proceed even if stateless gateway skips initialize
  }

  // 2. Fetch ad_auth_shops profile IDs and map sid/name -> profile_id
  let adProfileIds: string[] = [];
  const profileBySid = new Map<string, string>();
  const profileByShopName = new Map<string, string>();
  try {
    const adAuth = await callUpstreamLingxingMcp({
      endpointUrl,
      apiKey,
      method: 'tools/call',
      rpcParams: { name: 'action', arguments: { toolId: 'ad_auth_shops', params: {} } },
      sessionId,
    });
    sessionId = adAuth.sessionId || sessionId;
    const adRecords = extractRecordsFromMcpResult(adAuth.data);
    adProfileIds = adRecords
      .map((r) => String(r.profile_id || '').trim())
      .filter(Boolean);
    for (const r of adRecords) {
      const pid = String(r.profile_id || '').trim();
      if (!pid) continue;
      if (r.sid !== undefined && r.sid !== null) {
        profileBySid.set(String(r.sid), pid);
      }
      if (typeof r.name === 'string' && r.name.trim()) {
        profileByShopName.set(r.name.trim().toLowerCase(), pid);
      }
    }
  } catch {
    adProfileIds = [];
  }

  // 2.5 Dynamically discover Lingxing OpenMCP Exchange Rates & Profit Summary tools via search + help
  const callOpenMcpMetaTool = async (
    metaToolName: 'search' | 'help',
    args: Record<string, unknown>
  ): Promise<{ ok: boolean; payload: unknown }> => {
    try {
      const res = await callUpstreamLingxingMcp({
        endpointUrl,
        apiKey,
        method: 'tools/call',
        rpcParams: { name: metaToolName, arguments: args },
        sessionId,
      });
      sessionId = res.sessionId || sessionId;
      return { ok: true, payload: res.data };
    } catch {
      return { ok: false, payload: null };
    }
  };

  let fxTool: DiscoveredMcpTool | null = null;
  let profitTool: DiscoveredMcpTool | null = null;
  try {
    fxTool = await discoverOpenMcpToolByKeywords({
      keywords: ['汇率', '币种汇率', 'currency'],
      domain: 'EXCHANGE_RATES',
      includeRegex: /汇率|币种|币别|currency|exchange.?rate/i,
      excludeRegex: /修改|更新|编辑|update|edit|set/i,
      callMetaTool: callOpenMcpMetaTool,
    });
  } catch {
    fxTool = null;
  }
  try {
    profitTool = await discoverOpenMcpToolByKeywords({
      keywords: ['利润统计', '结算毛利润', '店铺利润'],
      domain: 'PROFIT_SUMMARY',
      includeRegex: /利润|profit/i,
      excludeRegex: /重算|修改|删除|recalc|edit|update/i,
      callMetaTool: callOpenMcpMetaTool,
    });
  } catch {
    profitTool = null;
  }

  // 3. Sequentially execute FX tool first (so live rates are available), then 12 core read tools, then Profit Summary
  let shops: AmazonShop[] = [];
  let localSkus: LocalMaterialSku[] = [];
  let listings: AmazonListingItem[] = [];
  let orders: AmazonOrderItem[] = [];
  let suppliers: SupplierProfile[] = [];
  let purchaseOrders: PurchaseOrder1688[] = [];
  let bomOrders: BomAssemblyOrder[] = [];
  let warehouseLedgers: WarehouseStockLedger[] = [];
  let fbaShipments: FbaShipmentPlan[] = [];
  let adCampaigns: AdCampaignItem[] = [];
  let searchTerms: AdSearchTermItem[] = [];
  let settlements: SettlementPeriodItem[] = [];
  let exchangeRates: ExchangeRateItem[] = [];
  let profitSummaries: LingxingProfitSummaryItem[] = [];

  const domainStats: LingxingDomainSyncStat[] = [];
  const preservedIncrementalDomains = new Set<LingxingSyncDomain>();
  const nextWatermarks: Partial<Record<string, LingxingDomainWatermark>> = {
    ...(tenant.lingxingSyncWatermarks || {}),
  };
  const syncRunAtStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const existingTenantOrders = (snapshot?.orders || []).filter((o) => o.tenantId === tenant.id);
  const existingDomainCounts: Partial<Record<LingxingSyncDomain, number>> = {
    ORDERS: existingTenantOrders.length,
    WAREHOUSE_LEDGERS: (snapshot?.warehouseLedgers || []).filter((x) => x.tenantId === tenant.id).length,
    FBA_SHIPMENTS: (snapshot?.fbaShipments || []).filter((x) => x.tenantId === tenant.id).length,
    BOM_ORDERS: (snapshot?.bomOrders || []).filter((x) => x.tenantId === tenant.id).length,
  };
  let orderWindowStartDate: string | undefined;
  const toolsToRun: DiscoveredMcpTool[] = [
    ...(fxTool ? [fxTool] : []),
    ...LINGXING_OPENMCP_CORE_TOOLS,
    ...(profitTool ? [profitTool] : []),
  ];

  for (const tool of toolsToRun) {
    if ((tool.domain === 'ADS' || tool.domain === 'SEARCH_TERMS') && adProfileIds.length === 0) {
      continue;
    }
    try {
      const plan = resolveIncrementalSyncPlan({
        tool,
        syncMode,
        fullOrderSyncDays: orderSyncDays,
        orderLookbackDays,
        domainWatermark: tenant.lingxingSyncWatermarks?.[tool.domain] || null,
        tenantLastSyncAt: tenant.lastLingxingSyncAt,
        existingDomainCount: existingDomainCounts[tool.domain] ?? 0,
        existingTenantOrders: tool.domain === 'ORDERS' ? existingTenantOrders : undefined,
      });
      if (plan.preserveExistingOutsideDelta) {
        preservedIncrementalDomains.add(tool.domain);
      }

      const baseArgs = {
        ...buildDefaultArgsForTool(tool, shops, adProfileIds),
        ...plan.argsPatch,
      };
      const fetchPageFn = async (pageArgs: Record<string, unknown>) => {
        try {
          const res = await callUpstreamLingxingMcp({
            endpointUrl,
            apiKey,
            method: 'tools/call',
            rpcParams: {
              name: 'action',
              arguments: { toolId: tool.gatewayToolId || tool.name, params: pageArgs },
            },
            sessionId,
          });
          sessionId = res.sessionId || sessionId;
          return { ok: true, payload: res.data };
        } catch (err: unknown) {
          return {
            ok: false,
            payload: null,
            errorMessage: err instanceof Error ? err.message : String(err),
          };
        }
      };

      const paged =
        tool.domain === 'ORDERS'
          ? await collectChunkedDateRangeRecords({
              tool,
              baseArgs,
              totalDays: plan.effectiveTotalDays ?? orderSyncDays,
              chunkDays: 30,
              startDateKey: 'startDate',
              endDateKey: 'endDate',
              includeTomorrow: true,
              fetchPage: fetchPageFn,
            })
          : await collectAllPaginatedRecords({
              tool,
              baseArgs,
              fetchPage: fetchPageFn,
            });

      let combinedRecords = paged.records;
      let extraPagesFetched = 0;
      let pendingOrdersChecked = 0;
      if (tool.domain === 'ORDERS' && plan.pendingOrdersToRefresh.length > 0) {
        const pendingRes = await collectPendingOrderRefreshRecords({
          tool,
          baseArgs,
          pendingOrders: plan.pendingOrdersToRefresh,
          fetchPage: fetchPageFn,
        });
        extraPagesFetched = pendingRes.pagesFetched;
        pendingOrdersChecked = pendingRes.checkedCount;
        if (pendingRes.records.length > 0) {
          const seenSigs = new Set(combinedRecords.map((r) => recordSignature(r, 'ORDERS')));
          combinedRecords = [...combinedRecords];
          for (const rec of pendingRes.records) {
            const sig = recordSignature(rec, 'ORDERS');
            if (!seenSigs.has(sig)) {
              seenSigs.add(sig);
              combinedRecords.push(rec);
            }
          }
        }
      }

      if (
        tool.domain === 'ORDERS' &&
        'windowStartDate' in paged &&
        typeof paged.windowStartDate === 'string' &&
        paged.windowStartDate
      ) {
        orderWindowStartDate = paged.windowStartDate;
      }

      const normalized = normalizeLingxingRecordsForDomain(
        tool.name,
        tool.domain,
        combinedRecords,
        tenant.id,
        shops,
        listings,
        exchangeRates
      );

      const totalPages = paged.pagesFetched + extraPagesFetched;
      const domainComplete =
        !paged.truncatedByCap &&
        (paged.upstreamTotal === null || paged.records.length >= paged.upstreamTotal);

      if (totalPages > 0) {
        nextWatermarks[tool.domain] = {
          lastSyncedAt: syncRunAtStr,
          lastWindowStartDate:
            tool.domain === 'ORDERS'
              ? orderWindowStartDate || plan.effectiveStartDate
              : plan.effectiveStartDate,
          lastWindowEndDate: plan.effectiveEndDate,
          mode: plan.mode,
          strategy: plan.strategy,
          pendingOrdersChecked: pendingOrdersChecked > 0 ? pendingOrdersChecked : undefined,
        };
      }

      domainStats.push({
        domain: tool.domain,
        toolName: tool.name,
        pagesFetched: totalPages,
        fetchedCount: combinedRecords.length,
        upstreamTotal: paged.upstreamTotal,
        complete: domainComplete,
        strategy: plan.strategy,
        windowLabel: plan.summary,
      });

      if (normalized.shops.length > 0) {
        shops = normalized.shops.map((s) => {
          const matchedProfile =
            (s.sid !== undefined ? profileBySid.get(String(s.sid)) : undefined) ||
            profileByShopName.get(s.shopName.toLowerCase());
          return matchedProfile ? { ...s, adProfileId: matchedProfile } : s;
        });
      }
      if (normalized.localSkus.length > 0) localSkus = normalized.localSkus;
      if (normalized.listings.length > 0) listings = normalized.listings;
      if (normalized.orders.length > 0) orders = normalized.orders;
      if (normalized.suppliers.length > 0) suppliers = normalized.suppliers;
      if (normalized.purchaseOrders.length > 0) purchaseOrders = normalized.purchaseOrders;
      if (normalized.bomOrders.length > 0) bomOrders = normalized.bomOrders;
      if (normalized.warehouseLedgers.length > 0) warehouseLedgers = normalized.warehouseLedgers;
      if (normalized.fbaShipments.length > 0) fbaShipments = normalized.fbaShipments;
      if (normalized.adCampaigns.length > 0) adCampaigns = normalized.adCampaigns;
      if (normalized.searchTerms.length > 0) searchTerms = normalized.searchTerms;
      if (normalized.settlements.length > 0) settlements = normalized.settlements;
      if (normalized.exchangeRates.length > 0) exchangeRates = normalized.exchangeRates;
      if (normalized.profitSummaries.length > 0) profitSummaries = normalized.profitSummaries;
    } catch {
      // Individual domain failure does not abort remaining domains
    }
  }

  // Link listing localSkuId to real synced localSkus when SKU matches
  if (localSkus.length > 0 && listings.length > 0) {
    const skuMap = new Map(localSkus.map((s) => [s.sku, s.id]));
    listings = listings.map((l) => {
      const matchedId = l.localSkuCode ? skuMap.get(l.localSkuCode) : undefined;
      return matchedId ? { ...l, localSkuId: matchedId } : l;
    });
  }

  // Collect all leftover virtual/demo fixture records for this tenant across ALL business tables
  const deleteDemoRecordIds: Array<{ entityType: ErpEntityType; recordId: string }> = [];
  if (clearDemoFixtures && snapshot) {
    const collectDemo = (
      entityType: ErpEntityType,
      items: Array<{
        id: string;
        tenantId: string;
        shopName?: string;
        asin?: string;
        amazonOrderId?: string;
        sku?: string;
        shipmentId?: string;
        targetAsin?: string;
      }>
    ) => {
      for (const item of items) {
        if (item.tenantId === tenant.id && isDemoFixtureRecord(item)) {
          deleteDemoRecordIds.push({ entityType, recordId: item.id });
        }
      }
    };
    collectDemo('shops', snapshot.shops);
    collectDemo('localSkus', snapshot.localSkus);
    collectDemo('listings', snapshot.listings);
    collectDemo('orders', snapshot.orders);
    collectDemo('suppliers', snapshot.suppliers);
    collectDemo('purchaseOrders', snapshot.purchaseOrders);
    collectDemo('bomOrders', snapshot.bomOrders);
    collectDemo('warehouseLedgers', snapshot.warehouseLedgers);
    collectDemo('fbaShipments', snapshot.fbaShipments);
    collectDemo('adCampaigns', snapshot.adCampaigns);
    collectDemo('searchTerms', snapshot.searchTerms);
    collectDemo('settlements', snapshot.settlements);
    collectDemo('extraExpenses', snapshot.extraExpenses);
  }

  // Repair any tenant teamMembers whose allowedShopIds still reference deleted demo shop IDs
  const realShopIds = shops.map((s) => s.id);
  const updatedTeamMembers: RbacTeamMember[] = [];
  if (snapshot && realShopIds.length > 0) {
    for (const m of snapshot.teamMembers) {
      if (m.tenantId !== tenant.id) continue;
      if (m.allowedShopIds.some((sid) => /^shop-(us|de|uk|jp)-0\d$/.test(sid))) {
        updatedTeamMembers.push({
          ...m,
          allowedShopIds: m.roleCode === 'TENANT_ADMIN' ? ['ALL'] : realShopIds,
        });
      }
    }
  }

  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const updatedTenant: Tenant = {
    ...tenant,
    lastLingxingSyncAt: nowStr,
    lingxingSyncWatermarks: nextWatermarks,
    lingxingConnectionStatus: 'CONNECTED',
    usedShopsCount: shops.length || tenant.usedShopsCount,
    usedSkusCount: Math.max(listings.length, localSkus.length) || tenant.usedSkusCount,
  };

  const DOMAIN_TO_ENTITY: Partial<Record<LingxingSyncDomain, ErpEntityType>> = {
    SHOPS: 'shops',
    LOCAL_SKUS: 'localSkus',
    LISTINGS: 'listings',
    ORDERS: 'orders',
    SUPPLIERS: 'suppliers',
    PURCHASE_ORDERS: 'purchaseOrders',
    BOM_ORDERS: 'bomOrders',
    WAREHOUSE_LEDGERS: 'warehouseLedgers',
    FBA_SHIPMENTS: 'fbaShipments',
    ADS: 'adCampaigns',
    SEARCH_TERMS: 'searchTerms',
    SETTLEMENTS: 'settlements',
    EXCHANGE_RATES: 'exchangeRates',
    PROFIT_SUMMARY: 'profitSummaries',
  };
  const pruneStaleDomains: ErpEntityType[] = domainStats
    .filter((st) => st.complete && st.fetchedCount > 0 && !preservedIncrementalDomains.has(st.domain))
    .map((st) => DOMAIN_TO_ENTITY[st.domain])
    .filter((et): et is ErpEntityType => Boolean(et));

  const persistRes = await persistLingxingSyncedEntities(supabaseConfig, {
    tenant: updatedTenant,
    shops,
    localSkus,
    listings,
    orders,
    suppliers,
    purchaseOrders,
    bomOrders,
    warehouseLedgers,
    fbaShipments,
    adCampaigns,
    searchTerms,
    settlements,
    exchangeRates,
    profitSummaries,
    updatedTeamMembers,
    deleteDemoRecordIds,
    pruneStaleDomains,
    orderWindowStartDate,
  });

  const counts: LingxingSchedulerCounts = {
    shops: shops.length,
    localSkus: localSkus.length,
    listings: listings.length,
    orders: orders.length,
    suppliers: suppliers.length,
    purchaseOrders: purchaseOrders.length,
    bomOrders: bomOrders.length,
    warehouseLedgers: warehouseLedgers.length,
    fbaShipments: fbaShipments.length,
    adCampaigns: adCampaigns.length,
    searchTerms: searchTerms.length,
    settlements: settlements.length,
    exchangeRates: exchangeRates.length,
    profitSummaries: profitSummaries.length,
    deletedDemoRecords: persistRes.deleted,
  };

  return {
    ok: persistRes.ok,
    tenantCode: tenant.tenantCode,
    counts,
    domainStats,
    message: persistRes.message,
  };
}

export async function runLingxingScheduledSyncOnce(
  overrideOrderSyncDays?: number,
  overrideSyncMode?: LingxingSyncMode
): Promise<LingxingSchedulerStatus> {
  if (state.isSyncingNow) {
    return getLingxingSchedulerStatus();
  }
  if (!state.supabaseConfig) {
    state.lastStatus = 'ERROR';
    state.lastError = '未配置 Supabase 数据库连接，定时同步无法读写数据库';
    return getLingxingSchedulerStatus();
  }

  state.isSyncingNow = true;
  state.lastStatus = 'RUNNING';
  state.lastError = null;

  try {
    const snap = await loadErpDatabaseSnapshot(state.supabaseConfig);
    if (snap.status !== 'LOADED' || !snap.snapshot) {
      throw new Error(snap.message || '读取 Supabase 租户列表失败');
    }

    const candidates = snap.snapshot.tenants.filter((t) => {
      if (state.targetTenantId && t.id !== state.targetTenantId) return false;
      return Boolean(t.lingxingMcpUrl && t.lingxingMcpUrl.trim().startsWith('https://'));
    });

    if (candidates.length === 0) {
      state.lastRunAt = new Date().toISOString();
      state.lastStatus = 'SUCCESS';
      state.lastSummary = '未发现已配置领星 MCP 的活跃租户';
      return getLingxingSchedulerStatus();
    }

    const summaries: string[] = [];
    const totalCounts: LingxingSchedulerCounts = {
      shops: 0,
      localSkus: 0,
      listings: 0,
      orders: 0,
      suppliers: 0,
      purchaseOrders: 0,
      bomOrders: 0,
      warehouseLedgers: 0,
      fbaShipments: 0,
      adCampaigns: 0,
      searchTerms: 0,
      settlements: 0,
      exchangeRates: 0,
      profitSummaries: 0,
      deletedDemoRecords: 0,
    };
    let syncedTenantCount = 0;
    let hadError = false;
    const latestDomainStats: LingxingDomainSyncStat[] = [];

    for (const tenant of candidates) {
      if (!isTenantWritable(tenant)) {
        summaries.push(`[${tenant.tenantCode}] 跳过(${tenant.subscriptionStatus})`);
        continue;
      }
      const effectiveOrderDays =
        typeof overrideOrderSyncDays === 'number' && Number.isFinite(overrideOrderSyncDays)
          ? Math.max(7, Math.min(730, Math.round(overrideOrderSyncDays)))
          : state.orderSyncDays;
      const effectiveSyncMode: LingxingSyncMode =
        overrideSyncMode === 'FULL' || overrideSyncMode === 'INCREMENTAL'
          ? overrideSyncMode
          : state.syncMode;
      const res = await syncSingleTenantFromLingxing(
        state.supabaseConfig,
        tenant,
        snap.snapshot,
        true,
        effectiveOrderDays,
        effectiveSyncMode,
        state.orderLookbackDays
      );
      syncedTenantCount += 1;
      latestDomainStats.push(...res.domainStats);
      totalCounts.shops += res.counts.shops;
      totalCounts.localSkus += res.counts.localSkus;
      totalCounts.listings += res.counts.listings;
      totalCounts.orders += res.counts.orders;
      totalCounts.suppliers += res.counts.suppliers;
      totalCounts.purchaseOrders += res.counts.purchaseOrders;
      totalCounts.bomOrders += res.counts.bomOrders;
      totalCounts.warehouseLedgers += res.counts.warehouseLedgers;
      totalCounts.fbaShipments += res.counts.fbaShipments;
      totalCounts.adCampaigns += res.counts.adCampaigns;
      totalCounts.searchTerms += res.counts.searchTerms;
      totalCounts.settlements += res.counts.settlements;
      totalCounts.exchangeRates += res.counts.exchangeRates;
      totalCounts.profitSummaries += res.counts.profitSummaries;
      totalCounts.deletedDemoRecords += res.counts.deletedDemoRecords;
      summaries.push(`[${tenant.tenantCode}] ${res.message}`);
      if (!res.ok) hadError = true;
    }

    state.runCount += 1;
    state.lastRunAt = new Date().toISOString();
    state.lastCounts = syncedTenantCount > 0 ? totalCounts : null;
    state.lastDomainStats = latestDomainStats;
    state.lastStatus = hadError ? 'ERROR' : 'SUCCESS';
    state.lastSummary = summaries.join(' | ');
    if (state.enabled) {
      state.nextRunAt = new Date(Date.now() + state.intervalMinutes * 60 * 1000).toISOString();
    }
  } catch (err: unknown) {
    state.lastRunAt = new Date().toISOString();
    state.lastStatus = 'ERROR';
    state.lastError = err instanceof Error ? err.message : String(err);
    state.lastSummary = `定时同步异常: ${state.lastError}`;
    if (state.enabled) {
      state.nextRunAt = new Date(Date.now() + state.intervalMinutes * 60 * 1000).toISOString();
    }
  } finally {
    state.isSyncingNow = false;
  }

  return getLingxingSchedulerStatus();
}

export function configureLingxingScheduler(opts: {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  tenantId?: string | null;
  intervalMinutes?: number;
  orderSyncDays?: number;
  syncMode?: LingxingSyncMode;
  orderLookbackDays?: number;
  enabled: boolean;
  skipIntervalTimer?: boolean;
}): LingxingSchedulerStatus {
  if (opts.supabaseUrl && opts.supabaseAnonKey) {
    const cleanUrl = normalizeSupabaseProjectUrl(opts.supabaseUrl);
    if (isSafeHttpsUrl(cleanUrl)) {
      state.supabaseConfig = {
        projectUrl: cleanUrl,
        anonKey: opts.supabaseAnonKey.trim(),
        authMode: 'SUPABASE_AUTH',
      };
    }
  }

  if (opts.tenantId !== undefined) {
    state.targetTenantId = opts.tenantId || null;
  }

  if (typeof opts.intervalMinutes === 'number' && Number.isFinite(opts.intervalMinutes)) {
    state.intervalMinutes = Math.max(5, Math.min(1440, Math.round(opts.intervalMinutes)));
  }

  if (typeof opts.orderSyncDays === 'number' && Number.isFinite(opts.orderSyncDays)) {
    state.orderSyncDays = Math.max(7, Math.min(730, Math.round(opts.orderSyncDays)));
  }

  if (opts.syncMode === 'FULL' || opts.syncMode === 'INCREMENTAL') {
    state.syncMode = opts.syncMode;
  }

  if (typeof opts.orderLookbackDays === 'number' && Number.isFinite(opts.orderLookbackDays)) {
    state.orderLookbackDays = Math.max(1, Math.min(30, Math.round(opts.orderLookbackDays)));
  }

  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }

  state.enabled = Boolean(opts.enabled && state.supabaseConfig);

  if (state.enabled) {
    const intervalMs = state.intervalMinutes * 60 * 1000;
    state.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
    state.lastSummary =
      state.runCount > 0
        ? state.lastSummary
        : `服务端定时同步已启动（每 ${state.intervalMinutes} 分钟自动同步，模式：${
            state.syncMode === 'INCREMENTAL'
              ? `智能增量 / 订单回溯 ${state.orderLookbackDays} 天`
              : `全量回溯 ${state.orderSyncDays} 天`
          }）`;
    if (!opts.skipIntervalTimer) {
      state.timer = setInterval(() => {
        void runLingxingScheduledSyncOnce();
      }, intervalMs);
    }
  } else {
    state.nextRunAt = null;
    if (!state.supabaseConfig) {
      state.lastSummary = '待绑定 Supabase 数据库后启动定时同步';
    } else {
      state.lastSummary = '服务端定时同步已暂停';
    }
  }

  return getLingxingSchedulerStatus();
}

export function bootstrapLingxingSchedulerFromEnv(): void {
  const env = typeof process !== 'undefined' && process.env ? process.env : {};
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
  const interval = Number(env.LINGXING_SYNC_INTERVAL_MINUTES) || 15;
  const orderDays = Number(env.LINGXING_ORDER_SYNC_DAYS) || DEFAULT_ORDER_SYNC_DAYS;
  if (url && key) {
    configureLingxingScheduler({
      supabaseUrl: url,
      supabaseAnonKey: key,
      intervalMinutes: interval,
      orderSyncDays: orderDays,
      syncMode: 'INCREMENTAL',
      enabled: true,
    });
  }
}

export function getLingxingSchedulerStatus(): LingxingSchedulerStatus {
  return {
    enabled: state.enabled,
    running: state.timer !== null,
    isSyncingNow: state.isSyncingNow,
    intervalMinutes: state.intervalMinutes,
    orderSyncDays: state.orderSyncDays,
    syncMode: state.syncMode,
    orderLookbackDays: state.orderLookbackDays,
    supabaseConfigured: state.supabaseConfig !== null,
    targetTenantId: state.targetTenantId,
    lastRunAt: state.lastRunAt,
    nextRunAt: state.nextRunAt,
    lastStatus: state.lastStatus,
    lastSummary: state.lastSummary,
    lastError: state.lastError,
    runCount: state.runCount,
    lastCounts: state.lastCounts,
    lastDomainStats: state.lastDomainStats,
  };
}
