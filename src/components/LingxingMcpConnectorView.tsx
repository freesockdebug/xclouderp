import React, { useState, useEffect, useCallback } from 'react';
import { getAuthHeaders, notifyUnauthorized } from '../services/authClient';
import {
  Tenant,
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
  SubscriptionPlan,
  LingxingSyncMode,
  LingxingIncrementalStrategy,
  LingxingDomainWatermark,
} from '../types/erp';
import { SupabaseConnectionConfig } from '../services/supabaseClient';
import {
  DEFAULT_ORDER_SYNC_DAYS,
  ORDER_SYNC_DAY_OPTIONS,
  DiscoveredMcpTool,
  LingxingSyncDomain,
  LINGXING_OPENMCP_CORE_TOOLS,
  isLingxingOpenMcpGateway,
  classifyLingxingToolDomain,
  buildDefaultArgsForTool,
  collectAllPaginatedRecords,
  collectChunkedDateRangeRecords,
  collectPendingOrderRefreshRecords,
  discoverOpenMcpToolByKeywords,
  extractRecordsFromMcpResult,
  normalizeLingxingRecordsForDomain,
  recordSignature,
  resolveIncrementalSyncPlan,
} from '../services/lingxingMcpSync';
import { TablePagination, useTablePagination } from './TablePagination';
import {
  RefreshCw,
  Link2,
  CheckCircle2,
  AlertCircle,
  Terminal,
  Play,
  Database,
  ShieldCheck,
  DownloadCloud,
  SlidersHorizontal,
  Clock,
  Pause,
} from 'lucide-react';

export interface LingxingApplySyncPayload {
  toolNames: string[];
  shops: AmazonShop[];
  localSkus: LocalMaterialSku[];
  listings: AmazonListingItem[];
  orders: AmazonOrderItem[];
  suppliers: SupplierProfile[];
  purchaseOrders: PurchaseOrder1688[];
  bomOrders: BomAssemblyOrder[];
  warehouseLedgers: WarehouseStockLedger[];
  fbaShipments: FbaShipmentPlan[];
  adCampaigns: AdCampaignItem[];
  searchTerms: AdSearchTermItem[];
  settlements: SettlementPeriodItem[];
  exchangeRates?: ExchangeRateItem[];
  profitSummaries?: LingxingProfitSummaryItem[];
  clearDemoForTenant: boolean;
  completedDomains?: Array<
    | 'shops'
    | 'localSkus'
    | 'listings'
    | 'orders'
    | 'suppliers'
    | 'purchaseOrders'
    | 'bomOrders'
    | 'warehouseLedgers'
    | 'fbaShipments'
    | 'adCampaigns'
    | 'searchTerms'
    | 'settlements'
    | 'exchangeRates'
    | 'profitSummaries'
  >;
  orderWindowStartDate?: string;
  updatedWatermarks?: Partial<Record<string, LingxingDomainWatermark>>;
}

interface SchedulerDomainStatView {
  domain: LingxingSyncDomain;
  toolName: string;
  pagesFetched: number;
  fetchedCount: number;
  upstreamTotal: number | null;
  complete: boolean;
  strategy?: LingxingIncrementalStrategy;
  windowLabel?: string;
}

interface SchedulerStatusView {
  enabled: boolean;
  running: boolean;
  runtimeMode?: 'NODE_INTERVAL' | 'CLOUDFLARE_CRON';
  cronSchedule?: string | null;
  isSyncingNow: boolean;
  intervalMinutes: number;
  orderSyncDays?: number;
  syncMode?: LingxingSyncMode;
  orderLookbackDays?: number;
  supabaseConfigured: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'ERROR';
  lastSummary: string;
  lastError: string | null;
  runCount: number;
  lastDomainStats?: SchedulerDomainStatView[];
}

interface LingxingMcpConnectorViewProps {
  currentTenant: Tenant;
  currentPlan?: SubscriptionPlan;
  supabaseConfig?: SupabaseConnectionConfig;
  shops: AmazonShop[];
  listings: AmazonListingItem[];
  ordersCount: number;
  existingOrders?: AmazonOrderItem[];
  existingDomainCounts?: Partial<Record<LingxingSyncDomain, number>>;
  localSkus: LocalMaterialSku[];
  isReadOnlyExpired: boolean;
  mcpModuleEnabled?: boolean;
  onUpdateTenantLingxingConfig: (
    url: string,
    key: string,
    appId: string
  ) => Promise<{ ok: boolean; message: string }>;
  onUpdateListingMapping: (listingId: string, newLocalSkuCode: string) => void;
  onApplyLingxingSyncResult: (
    payload: LingxingApplySyncPayload
  ) => Promise<{ ok: boolean; upserted: number; message: string }>;
  onReloadFromDb?: () => Promise<void>;
}

const DOMAIN_LABELS: Record<LingxingSyncDomain, string> = {
  SHOPS: '店铺 SHOPS',
  LOCAL_SKUS: '本地SKU/库存 LOCAL_SKUS',
  LISTINGS: 'ASIN/Listing LISTINGS',
  ORDERS: '订单 ORDERS',
  SUPPLIERS: '供应商 SUPPLIERS',
  PURCHASE_ORDERS: '采购单 PURCHASE',
  BOM_ORDERS: '加工单/BOM BOM_ORDERS',
  WAREHOUSE_LEDGERS: '仓流水 LEDGERS',
  FBA_SHIPMENTS: 'FBA货件 SHIPMENTS',
  ADS: '广告活动 ADS',
  SEARCH_TERMS: '广告搜索词 SEARCH_TERMS',
  SETTLEMENTS: '财务结算 SETTLEMENTS',
  EXCHANGE_RATES: '汇率 EXCHANGE_RATES',
  PROFIT_SUMMARY: '利润统计 PROFIT_SUMMARY',
  UNKNOWN: '通用工具',
};

export const LingxingMcpConnectorView: React.FC<LingxingMcpConnectorViewProps> = ({
  currentTenant,
  currentPlan,
  supabaseConfig,
  shops,
  listings,
  ordersCount,
  existingOrders = [],
  existingDomainCounts,
  localSkus,
  isReadOnlyExpired,
  mcpModuleEnabled = true,
  onUpdateTenantLingxingConfig,
  onUpdateListingMapping,
  onApplyLingxingSyncResult,
  onReloadFromDb,
}) => {
  const [mcpUrl, setMcpUrl] = useState(currentTenant.lingxingMcpUrl);
  const [mcpKey, setMcpKey] = useState(currentTenant.lingxingMcpKey);
  const [appId, setAppId] = useState(currentTenant.lingxingAppId || '');
  const [mcpSessionId, setMcpSessionId] = useState<string>('');
  const [isOpenMcpGateway, setIsOpenMcpGateway] = useState<boolean>(false);
  const [adProfileIds, setAdProfileIds] = useState<string[]>([]);

  const [scheduler, setScheduler] = useState<SchedulerStatusView | null>(null);
  const [schedulerInterval, setSchedulerInterval] = useState<number>(
    currentPlan?.syncIntervalMinutes || 15
  );
  const [orderSyncDays, setOrderSyncDays] = useState<number>(DEFAULT_ORDER_SYNC_DAYS);
  const [syncMode, setSyncMode] = useState<LingxingSyncMode>('INCREMENTAL');
  const [isUpdatingScheduler, setIsUpdatingScheduler] = useState(false);

  const [isCalling, setIsCalling] = useState(false);
  const [isFullSyncing, setIsFullSyncing] = useState(false);
  const [clearDemoOnSync, setClearDemoOnSync] = useState(true);
  const [discoveredTools, setDiscoveredTools] = useState<DiscoveredMcpTool[]>([]);
  const [editingArgsTool, setEditingArgsTool] = useState<string | null>(null);
  const [customArgsMap, setCustomArgsMap] = useState<Record<string, string>>({});
  const [syncSteps, setSyncSteps] = useState<string[]>([]);

  const [selectedTool, setSelectedTool] = useState<string>('tools/list');
  const [rpcLog, setRpcLog] = useState<string>(
    JSON.stringify(
      {
        info: '请先点击 [探测工具] 获取领星 MCP 真实工具列表，或直接点击 [一键通过领星 MCP 同步全部真实数据到 Supabase] 拉取店铺、ASIN、库存、订单、广告与结算数据写入数据库。',
        tenantCode: currentTenant.tenantCode,
        subscriptionStatus: currentTenant.subscriptionStatus,
      },
      null,
      2
    )
  );
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [statusIsError, setStatusIsError] = useState<boolean>(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const mappingPagination = useTablePagination(listings, 20);

  useEffect(() => {
    setMcpUrl(currentTenant.lingxingMcpUrl);
    setMcpKey(currentTenant.lingxingMcpKey);
    setAppId(currentTenant.lingxingAppId || '');
    setMcpSessionId('');
    setStatusMessage('');
    setStatusIsError(false);
  }, [
    currentTenant.id,
    currentTenant.lingxingMcpUrl,
    currentTenant.lingxingMcpKey,
    currentTenant.lingxingAppId,
  ]);

  const fetchSchedulerStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/lingxing/scheduler/status', {
        credentials: 'include',
        headers: { Accept: 'application/json', ...getAuthHeaders() },
      });
      if (res.status === 401) {
        notifyUnauthorized();
        return;
      }
      const data = await res.json();
      if (data?.scheduler) {
        setScheduler(data.scheduler);
        if (data.scheduler.intervalMinutes) {
          setSchedulerInterval(data.scheduler.intervalMinutes);
        }
        if (typeof data.scheduler.orderSyncDays === 'number' && data.scheduler.orderSyncDays >= 31) {
          setOrderSyncDays(data.scheduler.orderSyncDays);
        }
        if (data.scheduler.syncMode === 'FULL' || data.scheduler.syncMode === 'INCREMENTAL') {
          setSyncMode(data.scheduler.syncMode);
        }
      }
    } catch {
      // ignore polling error
    }
  }, []);

  useEffect(() => {
    void fetchSchedulerStatus();
  }, [fetchSchedulerStatus]);

  const handleToggleScheduler = async (
    nextEnabled: boolean,
    overrideInterval?: number,
    overrideOrderDays?: number,
    overrideSyncMode?: LingxingSyncMode
  ) => {
    setIsUpdatingScheduler(true);
    try {
      const targetDays = overrideOrderDays ?? orderSyncDays;
      const targetMode = overrideSyncMode ?? syncMode;
      const res = await fetch('/api/lingxing/scheduler/configure', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          supabaseUrl: supabaseConfig?.projectUrl,
          supabaseAnonKey: supabaseConfig?.anonKey,
          tenantId: currentTenant.id,
          intervalMinutes: overrideInterval ?? schedulerInterval,
          orderSyncDays: targetDays,
          syncMode: targetMode,
          enabled: nextEnabled,
          tenantStatus: currentTenant.subscriptionStatus,
        }),
      });
      if (res.status === 401) {
        notifyUnauthorized();
        return;
      }
      const data = await res.json();
      if (data?.scheduler) {
        setScheduler(data.scheduler);
      }
      if (!res.ok) {
        setStatusIsError(true);
        setStatusMessage(data?.message || '更新定时同步任务失败');
      } else {
        setStatusIsError(false);
        const modeText =
          data?.scheduler?.runtimeMode === 'CLOUDFLARE_CRON'
            ? `Cloudflare Cron (${data.scheduler.cronSchedule || '*/15 * * * *'}) 定时同步已启动`
            : '服务端定时同步已启动';
        setStatusMessage(
          nextEnabled
            ? `${modeText}（每 ${overrideInterval ?? schedulerInterval} 分钟，${
                targetMode === 'INCREMENTAL' ? '智能增量模式' : `全量回溯 ${targetDays} 天`
              }）`
            : '服务端定时同步已暂停'
        );
      }
    } catch (err: unknown) {
      setStatusIsError(true);
      setStatusMessage(`配置定时同步异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUpdatingScheduler(false);
    }
  };

  const handleTriggerSchedulerNow = async () => {
    setIsUpdatingScheduler(true);
    setStatusMessage('');
    try {
      if (!scheduler?.supabaseConfigured && supabaseConfig?.projectUrl && supabaseConfig?.anonKey) {
        await fetch('/api/lingxing/scheduler/configure', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            supabaseUrl: supabaseConfig.projectUrl,
            supabaseAnonKey: supabaseConfig.anonKey,
            tenantId: currentTenant.id,
            intervalMinutes: schedulerInterval,
            orderSyncDays,
            syncMode,
            enabled: true,
            tenantStatus: currentTenant.subscriptionStatus,
          }),
        });
      }
      const res = await fetch('/api/lingxing/scheduler/trigger', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          tenantStatus: currentTenant.subscriptionStatus,
          orderSyncDays,
          syncMode,
        }),
      });
      if (res.status === 401) {
        notifyUnauthorized();
        return;
      }
      const data = await res.json();
      if (data?.scheduler) {
        setScheduler(data.scheduler);
      }
      setStatusIsError(!data?.ok);
      setStatusMessage(data?.scheduler?.lastSummary || data?.message || '后台同步完成');
      if (data?.ok && onReloadFromDb) {
        await onReloadFromDb();
      }
    } catch (err: unknown) {
      setStatusIsError(true);
      setStatusMessage(`触发定时同步异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUpdatingScheduler(false);
    }
  };

  const callLingxingProxy = async (params: {
    jsonRpcMethod: 'tools/list' | 'tools/call';
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    sessionIdOverride?: string;
  }) => {
    const res = await fetch('/api/lingxing/mcp-proxy', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        mcpEndpointUrl: mcpUrl.trim(),
        mcpApiKey: mcpKey.trim(),
        jsonRpcMethod: params.jsonRpcMethod,
        toolName: params.toolName,
        toolArgs: params.toolArgs || {},
        mcpSessionId: params.sessionIdOverride || mcpSessionId || undefined,
        tenantStatus: currentTenant.subscriptionStatus,
        mcpModuleEnabled,
      }),
    });
    if (res.status === 401) {
      notifyUnauthorized();
    }
    const data = await res.json();
    if (typeof data.mcpSessionId === 'string' && data.mcpSessionId) {
      setMcpSessionId(data.mcpSessionId);
    }
    setLastLatencyMs(typeof data.latencyMs === 'number' ? data.latencyMs : 0);
    setRpcLog(JSON.stringify(data, null, 2));
    const isToolError = data.responsePayload?.result?.isError === true;
    return { httpOk: res.ok && data.ok !== false && !isToolError, data };
  };

  const invokeBusinessTool = async (
    tool: DiscoveredMcpTool,
    businessParams: Record<string, unknown>,
    sessionIdOverride?: string
  ) => {
    if (tool.gatewayToolId || isOpenMcpGateway) {
      return callLingxingProxy({
        jsonRpcMethod: 'tools/call',
        toolName: 'action',
        toolArgs: {
          toolId: tool.gatewayToolId || tool.name,
          params: businessParams,
        },
        sessionIdOverride,
      });
    }
    return callLingxingProxy({
      jsonRpcMethod: 'tools/call',
      toolName: tool.name,
      toolArgs: businessParams,
      sessionIdOverride,
    });
  };

  const handleSaveCredentials = async () => {
    if (isReadOnlyExpired) {
      setStatusIsError(true);
      setStatusMessage(
        '当前租户处于 EXPIRED_READONLY 只读保护期，无法修改领星 MCP 密钥配置，请先在租户订阅中心续费或兑换激活码。'
      );
      return;
    }
    setSavingConfig(true);
    setStatusMessage('');
    setStatusIsError(false);
    try {
      const result = await onUpdateTenantLingxingConfig(
        mcpUrl.trim(),
        mcpKey.trim(),
        appId.trim()
      );
      setStatusIsError(!result.ok);
      setStatusMessage(result.message);
    } catch (err: unknown) {
      setStatusIsError(true);
      setStatusMessage(
        `保存失败: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setSavingConfig(false);
    }
  };

  const discoverRealTools = async (): Promise<{
    ok: boolean;
    tools: DiscoveredMcpTool[];
    gatewayMode: boolean;
    sessionId?: string;
    errorMessage?: string;
  }> => {
    setSelectedTool('tools/list');
    const { httpOk, data } = await callLingxingProxy({ jsonRpcMethod: 'tools/list' });

    if (!httpOk) {
      return {
        ok: false,
        tools: [],
        gatewayMode: false,
        errorMessage: data.message || '领星 MCP 握手或工具探测失败，请检查 URL 与 X-Mcp-Key',
      };
    }

    const rawTools = data.responsePayload?.result?.tools;
    if (!Array.isArray(rawTools) || rawTools.length === 0) {
      return {
        ok: false,
        tools: [],
        gatewayMode: false,
        sessionId: data.mcpSessionId,
        errorMessage:
          '已连通领星 MCP，但 tools/list 未返回可用工具列表（请查看右侧 JSON-RPC 原始报文）。',
      };
    }

    if (isLingxingOpenMcpGateway(rawTools)) {
      setIsOpenMcpGateway(true);
      setDiscoveredTools(LINGXING_OPENMCP_CORE_TOOLS);
      return {
        ok: true,
        tools: LINGXING_OPENMCP_CORE_TOOLS,
        gatewayMode: true,
        sessionId: data.mcpSessionId,
      };
    }

    setIsOpenMcpGateway(false);
    const normalizedTools: DiscoveredMcpTool[] = rawTools.map(
      (t: {
        name?: string;
        description?: string;
        domain?: string;
        inputSchema?: DiscoveredMcpTool['inputSchema'];
      }) => ({
        name: String(t.name || ''),
        description: String(t.description || '领星 MCP 远端工具'),
        inputSchema: t.inputSchema,
        domain: classifyLingxingToolDomain(t),
      })
    );

    setDiscoveredTools(normalizedTools);
    return {
      ok: true,
      tools: normalizedTools,
      gatewayMode: false,
      sessionId: data.mcpSessionId,
    };
  };

  const handleDiscoverTools = async () => {
    setIsCalling(true);
    setStatusMessage('');
    setStatusIsError(false);
    try {
      const result = await discoverRealTools();
      if (!result.ok) {
        setStatusIsError(true);
        setStatusMessage(result.errorMessage || '探测失败');
      } else {
        setStatusIsError(false);
        setStatusMessage(
          result.gatewayMode
            ? '已识别领星官方 OpenMCP 网关模式 (help → search → action)，自动挂载 12 大全业务域真实同步工具（店铺/SKU/Listing/订单/供应商/采购单/BOM加工单/仓流水/FBA货件/广告/搜索词/结算）。点击「一键同步」即可直接落库。'
            : `成功连通真实领星 MCP，探测到 ${result.tools.length} 个可用工具。现在可点击「一键同步全部真实数据到 Supabase」或单个工具拉取入库。`
        );
      }
    } catch (err: unknown) {
      setStatusIsError(true);
      setStatusMessage(`探测请求异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsCalling(false);
    }
  };

  const resolveToolArgs = (
    tool: DiscoveredMcpTool,
    activeShops: AmazonShop[],
    activeProfileIds: string[]
  ): Record<string, unknown> => {
    const customRaw = customArgsMap[tool.name];
    if (customRaw && customRaw.trim()) {
      return JSON.parse(customRaw);
    }
    return buildDefaultArgsForTool(tool, activeShops, activeProfileIds);
  };

  const fetchAdProfileIdsIfNeeded = async (
    sessionIdOverride?: string
  ): Promise<string[]> => {
    if (adProfileIds.length > 0) return adProfileIds;
    const { httpOk, data } = await callLingxingProxy({
      jsonRpcMethod: 'tools/call',
      toolName: 'action',
      toolArgs: { toolId: 'ad_auth_shops', params: {} },
      sessionIdOverride,
    });
    if (!httpOk) return [];
    const recs = extractRecordsFromMcpResult(data.responsePayload);
    const ids = recs
      .map((r) => (typeof r.profile_id === 'string' || typeof r.profile_id === 'number' ? String(r.profile_id) : ''))
      .filter(Boolean);
    if (ids.length > 0) setAdProfileIds(ids);
    return ids;
  };

  const handleExecuteToolSync = async (tool: DiscoveredMcpTool) => {
    if (isReadOnlyExpired) {
      setStatusIsError(true);
      setStatusMessage('当前租户处于只读到期状态，无法执行领星数据同步写入。');
      return;
    }

    setIsCalling(true);
    setSelectedTool(tool.name);
    setStatusMessage('');
    setStatusIsError(false);
    try {
      let activeProfiles = adProfileIds;
      const tid = tool.gatewayToolId || tool.name;
      if ((tid === 'ad_campaign_report' || tid === 'ad_campaign_search_term_report') && activeProfiles.length === 0) {
        activeProfiles = await fetchAdProfileIdsIfNeeded();
      }

      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = resolveToolArgs(tool, shops, activeProfiles);
      } catch (err: unknown) {
        setStatusIsError(true);
        setStatusMessage(
          `工具 [${tool.name}] 的自定义 JSON 参数格式有误: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        return;
      }

      let activeSession = mcpSessionId;
      let firstPageError = '';
      const hasCustomArgs = Boolean(customArgsMap[tool.name] && customArgsMap[tool.name].trim());
      const toolLogs: string[] = [];
      const pushToolLog = (line: string) => {
        toolLogs.push(line);
        setSyncSteps([...toolLogs]);
      };

      const fetchPageFn = async (pageArgs: Record<string, unknown>) => {
        const { httpOk, data } = await invokeBusinessTool(tool, pageArgs, activeSession);
        if (typeof data.mcpSessionId === 'string' && data.mcpSessionId) {
          activeSession = data.mcpSessionId;
        }
        if (!httpOk) {
          if (!firstPageError) firstPageError = data.message || `调用领星 MCP 工具 [${tool.name}] 失败`;
          return { ok: false, payload: null, errorMessage: data.message };
        }
        return { ok: true, payload: data.responsePayload };
      };

      const plan = !hasCustomArgs
        ? resolveIncrementalSyncPlan({
            tool,
            syncMode,
            fullOrderSyncDays: orderSyncDays,
            domainWatermark: currentTenant.lingxingSyncWatermarks?.[tool.domain] || null,
            tenantLastSyncAt: currentTenant.lastLingxingSyncAt,
            existingDomainCount:
              existingDomainCounts?.[tool.domain] ??
              (tool.domain === 'ORDERS' ? ordersCount : 0),
            existingTenantOrders: tool.domain === 'ORDERS' ? existingOrders : undefined,
          })
        : null;
      const effectiveArgs = plan ? { ...parsedArgs, ...plan.argsPatch } : parsedArgs;

      let orderWindowStartDate: string | undefined;
      const paged =
        tool.domain === 'ORDERS' && !hasCustomArgs
          ? await (async () => {
              const targetDays = plan?.effectiveTotalDays ?? orderSyncDays;
              pushToolLog(
                `→ [${plan?.strategy === 'LOOKBACK_WINDOW_INCREMENTAL' ? '智能增量' : '全量回溯'}] ${
                  plan?.summary || `按 30 天分片拉取近 ${targetDays} 天订单`
                } [${tool.name}] ...`
              );
              const chunked = await collectChunkedDateRangeRecords({
                tool,
                baseArgs: effectiveArgs,
                totalDays: targetDays,
                chunkDays: 30,
                startDateKey: 'startDate',
                endDateKey: 'endDate',
                includeTomorrow: true,
                fetchPage: fetchPageFn,
                onChunkStart: ({ chunkIndex, totalChunks, chunk }) => {
                  pushToolLog(
                    `   ▸ 订单分片 ${chunkIndex + 1}/${totalChunks} (${chunk.label}) 开始拉取...`
                  );
                },
                onPageFetched: ({
                  chunkIndex,
                  totalChunks,
                  pageNumber,
                  pageCount,
                  chunkAccumulated,
                  chunkUpstreamTotal,
                  totalAccumulated,
                }) => {
                  if (pageNumber === 1 || pageNumber % 3 === 0 || (chunkUpstreamTotal !== null && chunkAccumulated >= chunkUpstreamTotal)) {
                    pushToolLog(
                      `     ↳ [分片 ${chunkIndex + 1}/${totalChunks}] 第 ${pageNumber} 页 ${pageCount} 条（片内 ${chunkAccumulated}${
                        chunkUpstreamTotal !== null ? `/${chunkUpstreamTotal}` : ''
                      } · 累计 ${totalAccumulated} 条）`
                    );
                  }
                },
              });
              orderWindowStartDate = chunked.windowStartDate || undefined;
              return chunked;
            })()
          : await (async () => {
              pushToolLog(
                `→ 正在拉取 [${DOMAIN_LABELS[tool.domain]}] ${tool.name}${
                  plan ? `（${plan.summary}）` : ''
                } ...`
              );
              return collectAllPaginatedRecords({
                tool,
                baseArgs: effectiveArgs,
                fetchPage: fetchPageFn,
                onPageFetched: ({ pageNumber, pageCount, accumulated, upstreamTotal }) => {
                  if (pageNumber > 1 || (upstreamTotal !== null && upstreamTotal > pageCount)) {
                    pushToolLog(
                      `   ↳ ${tool.name} 第 ${pageNumber} 页拉取 ${pageCount} 条，累计 ${accumulated}${
                        upstreamTotal !== null ? ` / ${upstreamTotal}` : ''
                      } 条`
                    );
                  }
                },
              });
            })();

      let combinedRecords = paged.records;
      let extraPages = 0;
      let pendingCheckedCount = 0;
      if (tool.domain === 'ORDERS' && plan && plan.pendingOrdersToRefresh.length > 0) {
        pushToolLog(
          `   ▸ 正在按单号精准复查 ${plan.pendingOrdersToRefresh.length} 笔窗口外历史 PENDING 订单状态...`
        );
        const pendingRes = await collectPendingOrderRefreshRecords({
          tool,
          baseArgs: effectiveArgs,
          pendingOrders: plan.pendingOrdersToRefresh,
          fetchPage: fetchPageFn,
        });
        extraPages = pendingRes.pagesFetched;
        pendingCheckedCount = pendingRes.checkedCount;
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
        pushToolLog(`   ✓ 历史 PENDING 订单复查完成，回写 ${pendingRes.records.length} 条最新状态`);
      }

      if (paged.pagesFetched === 0 && firstPageError) {
        pushToolLog(`✗ 拉取失败: ${firstPageError}`);
        setStatusIsError(true);
        setStatusMessage(firstPageError);
        return;
      }

      const normalized = normalizeLingxingRecordsForDomain(
        tool.name,
        tool.domain,
        combinedRecords,
        currentTenant.id,
        shops,
        listings
      );

      const totalNormalized =
        normalized.shops.length +
        normalized.localSkus.length +
        normalized.listings.length +
        normalized.orders.length +
        normalized.suppliers.length +
        normalized.purchaseOrders.length +
        normalized.bomOrders.length +
        normalized.warehouseLedgers.length +
        normalized.fbaShipments.length +
        normalized.adCampaigns.length +
        normalized.searchTerms.length +
        normalized.settlements.length +
        normalized.exchangeRates.length +
        normalized.profitSummaries.length;

      pushToolLog(
        `✓ ${tool.name} 完成：共拉取 ${paged.pagesFetched + extraPages} 页，归档 ${totalNormalized} 条${
          paged.upstreamTotal !== null ? `（领星总计 ${paged.upstreamTotal} 条）` : ''
        }`
      );

      const nowWmStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const updatedWatermarks: Partial<Record<string, LingxingDomainWatermark>> = plan
        ? {
            [tool.domain]: {
              lastSyncedAt: nowWmStr,
              lastWindowStartDate:
                tool.domain === 'ORDERS'
                  ? orderWindowStartDate || plan.effectiveStartDate
                  : plan.effectiveStartDate,
              lastWindowEndDate: plan.effectiveEndDate,
              mode: plan.mode,
              strategy: plan.strategy,
              pendingOrdersChecked: pendingCheckedCount > 0 ? pendingCheckedCount : undefined,
            },
          }
        : {};

      if (totalNormalized === 0) {
        if (plan?.preserveExistingOutsideDelta) {
          const dbRes = await onApplyLingxingSyncResult({
            toolNames: [tool.name],
            shops: [],
            localSkus: [],
            listings: [],
            orders: [],
            suppliers: [],
            purchaseOrders: [],
            bomOrders: [],
            warehouseLedgers: [],
            fbaShipments: [],
            adCampaigns: [],
            searchTerms: [],
            settlements: [],
            clearDemoForTenant: false,
            completedDomains: [],
            updatedWatermarks,
          });
          setStatusIsError(!dbRes.ok);
          setStatusMessage(
            `增量检查 [${tool.name}] 完成（${plan.summary}）：周期内无新增或变更记录，已保留全部历史数据并更新水位线。`
          );
          return;
        }
        setStatusIsError(false);
        setStatusMessage(
          `领星 MCP 工具 [${tool.name}] 分页拉取完成（共 ${paged.pagesFetched} 页，${normalized.rawCount} 条原始记录），未识别出可映射的业务字段。`
        );
        return;
      }

      const domainEntityMap: Partial<
        Record<LingxingSyncDomain, NonNullable<LingxingApplySyncPayload['completedDomains']>[number]>
      > = {
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
      const isComplete =
        !paged.truncatedByCap &&
        (paged.upstreamTotal === null || paged.records.length >= paged.upstreamTotal);
      const completedEntity =
        isComplete && !plan?.preserveExistingOutsideDelta ? domainEntityMap[tool.domain] : undefined;

      const dbRes = await onApplyLingxingSyncResult({
        toolNames: [tool.name],
        shops: normalized.shops,
        localSkus: normalized.localSkus,
        listings: normalized.listings,
        orders: normalized.orders,
        suppliers: normalized.suppliers,
        purchaseOrders: normalized.purchaseOrders,
        bomOrders: normalized.bomOrders,
        warehouseLedgers: normalized.warehouseLedgers,
        fbaShipments: normalized.fbaShipments,
        adCampaigns: normalized.adCampaigns,
        searchTerms: normalized.searchTerms,
        settlements: normalized.settlements,
        exchangeRates: normalized.exchangeRates,
        profitSummaries: normalized.profitSummaries,
        clearDemoForTenant: clearDemoOnSync,
        completedDomains: completedEntity ? [completedEntity] : [],
        orderWindowStartDate,
        updatedWatermarks,
      });

      pushToolLog(dbRes.ok ? `✓ ${dbRes.message}` : `✗ 写库失败: ${dbRes.message}`);
      setStatusIsError(!dbRes.ok);
      setStatusMessage(dbRes.message);
    } catch (err: unknown) {
      setStatusIsError(true);
      setStatusMessage(`调用异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsCalling(false);
    }
  };

  const handleFullSyncAllToDb = async () => {
    if (isReadOnlyExpired) {
      setStatusIsError(true);
      setStatusMessage('当前租户处于只读到期状态，已熔断领星全量同步写入。');
      return;
    }

    setIsFullSyncing(true);
    setIsCalling(true);
    setStatusMessage('');
    setStatusIsError(false);
    const logs: string[] = [];
    const pushLog = (line: string) => {
      logs.push(line);
      setSyncSteps([...logs]);
    };

    try {
      let activeSession = mcpSessionId;
      let tools = discoveredTools;
      let gatewayMode = isOpenMcpGateway;

      if (tools.length === 0) {
        pushLog('1. 正在连接领星 MCP 探测协议模式与工具清单 (tools/list)...');
        const disc = await discoverRealTools();
        if (!disc.ok) {
          pushLog(`✗ 探测失败: ${disc.errorMessage}`);
          setStatusIsError(true);
          setStatusMessage(disc.errorMessage || '领星 MCP 工具探测失败');
          return;
        }
        tools = disc.tools;
        gatewayMode = disc.gatewayMode;
        if (disc.sessionId) activeSession = disc.sessionId;
        pushLog(
          gatewayMode
            ? '✓ 已识别领星 OpenMCP 网关 (help/search/action)，就绪 12 大全业务域拉取管线'
            : `✓ 已探测到 ${tools.length} 个领星 MCP 工具`
        );
      }

      const domainOrder: LingxingSyncDomain[] = [
        'EXCHANGE_RATES',
        'SHOPS',
        'LOCAL_SKUS',
        'LISTINGS',
        'ORDERS',
        'SUPPLIERS',
        'PURCHASE_ORDERS',
        'BOM_ORDERS',
        'WAREHOUSE_LEDGERS',
        'FBA_SHIPMENTS',
        'ADS',
        'SEARCH_TERMS',
        'SETTLEMENTS',
        'PROFIT_SUMMARY',
      ];
      let effectiveTools = [...tools];
      if (gatewayMode) {
        const callMetaTool = async (
          metaToolName: 'search' | 'help',
          args: Record<string, unknown>
        ): Promise<{ ok: boolean; payload: unknown }> => {
          const { httpOk, data } = await callLingxingProxy({
            jsonRpcMethod: 'tools/call',
            toolName: metaToolName,
            toolArgs: args,
            sessionIdOverride: activeSession,
          });
          if (typeof data.mcpSessionId === 'string' && data.mcpSessionId) {
            activeSession = data.mcpSessionId;
          }
          return { ok: httpOk, payload: data.responsePayload };
        };

        if (!effectiveTools.some((t) => t.domain === 'EXCHANGE_RATES')) {
          pushLog('→ 正在通过 OpenMCP search 探测领星实时币种汇率工具...');
          const fxTool = await discoverOpenMcpToolByKeywords({
            keywords: ['汇率', '币种汇率', 'currency'],
            domain: 'EXCHANGE_RATES',
            includeRegex: /汇率|币种|币别|currency|exchange.?rate/i,
            excludeRegex: /修改|更新|编辑|update|edit|set/i,
            callMetaTool,
          }).catch(() => null);
          if (fxTool) {
            effectiveTools = [fxTool, ...effectiveTools];
            pushLog(`✓ 已自动探测领星汇率工具: ${fxTool.name}`);
          } else {
            pushLog('ℹ 未探测到独立汇率接口，将优先使用已有汇率库与兜底汇率');
          }
        }

        if (!effectiveTools.some((t) => t.domain === 'PROFIT_SUMMARY')) {
          pushLog('→ 正在通过 OpenMCP search 探测领星利润统计工具...');
          const profitTool = await discoverOpenMcpToolByKeywords({
            keywords: ['利润统计', '结算毛利润', '店铺利润'],
            domain: 'PROFIT_SUMMARY',
            includeRegex: /利润|profit/i,
            excludeRegex: /重算|修改|删除|recalc|edit|update/i,
            callMetaTool,
          }).catch(() => null);
          if (profitTool) {
            effectiveTools = [...effectiveTools, profitTool];
            pushLog(`✓ 已自动探测领星利润统计工具: ${profitTool.name}`);
          }
        }
      }

      const syncQueue: DiscoveredMcpTool[] = [];
      for (const dom of domainOrder) {
        const matched = effectiveTools.filter((t) => t.domain === dom);
        syncQueue.push(...matched.slice(0, 1));
      }

      if (syncQueue.length === 0) {
        pushLog('✗ 未自动识别出领星业务工具，请在下方手动选择工具拉取。');
        setStatusIsError(true);
        setStatusMessage('未匹配到可自动同步的工具，请在下方列表中手动触发。');
        return;
      }

      let accShops: AmazonShop[] = [...shops];
      let accListings: AmazonListingItem[] = [...listings];
      let accExchangeRates: ExchangeRateItem[] = [];
      let activeProfiles = [...adProfileIds];
      const syncedShopsMap = new Map<string, AmazonShop>();
      const syncedLocalSkusMap = new Map<string, LocalMaterialSku>();
      const syncedListingsMap = new Map<string, AmazonListingItem>();
      const syncedOrdersMap = new Map<string, AmazonOrderItem>();
      const syncedSuppliersMap = new Map<string, SupplierProfile>();
      const syncedPosMap = new Map<string, PurchaseOrder1688>();
      const syncedBomMap = new Map<string, BomAssemblyOrder>();
      const syncedLedgersMap = new Map<string, WarehouseStockLedger>();
      const syncedFbaMap = new Map<string, FbaShipmentPlan>();
      const syncedAdsMap = new Map<string, AdCampaignItem>();
      const syncedSearchTermsMap = new Map<string, AdSearchTermItem>();
      const syncedSettlementsMap = new Map<string, SettlementPeriodItem>();
      const syncedExchangeRatesMap = new Map<string, ExchangeRateItem>();
      const syncedProfitSummariesMap = new Map<string, LingxingProfitSummaryItem>();
      const succeededToolNames: string[] = [];
      const completedDomains = new Set<NonNullable<LingxingApplySyncPayload['completedDomains']>[number]>();
      const domainEntityMap: Partial<
        Record<LingxingSyncDomain, NonNullable<LingxingApplySyncPayload['completedDomains']>[number]>
      > = {
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

      let fullSyncOrderWindowStart: string | undefined;
      const syncRunAtStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const updatedWatermarks: Partial<Record<string, LingxingDomainWatermark>> = {};

      for (const tool of syncQueue) {
        setSelectedTool(tool.name);
        const tid = tool.gatewayToolId || tool.name;
        if ((tid === 'ad_campaign_report' || tid === 'ad_campaign_search_term_report') && activeProfiles.length === 0) {
          pushLog('→ 正在调用 ad_auth_shops 获取广告授权店铺 Profile IDs...');
          activeProfiles = await fetchAdProfileIdsIfNeeded(activeSession);
          pushLog(`✓ 获取到 ${activeProfiles.length} 个广告 Profile IDs`);
          if (activeProfiles.length === 0) continue;
        }

        const plan = resolveIncrementalSyncPlan({
          tool,
          syncMode,
          fullOrderSyncDays: orderSyncDays,
          domainWatermark: currentTenant.lingxingSyncWatermarks?.[tool.domain] || null,
          tenantLastSyncAt: currentTenant.lastLingxingSyncAt,
          existingDomainCount:
            existingDomainCounts?.[tool.domain] ??
            (tool.domain === 'ORDERS' ? ordersCount : 0),
          existingTenantOrders: tool.domain === 'ORDERS' ? existingOrders : undefined,
        });

        const baseArgs = {
          ...buildDefaultArgsForTool(tool, accShops, activeProfiles),
          ...plan.argsPatch,
        };
        pushLog(
          `→ 正在拉取 [${DOMAIN_LABELS[tool.domain]}] ${tool.name}（${plan.summary}）...`
        );

        let firstErr = '';
        const fetchPageFn = async (pageArgs: Record<string, unknown>) => {
          const { httpOk, data } = await (tool.gatewayToolId || gatewayMode
            ? callLingxingProxy({
                jsonRpcMethod: 'tools/call',
                toolName: 'action',
                toolArgs: { toolId: tool.gatewayToolId || tool.name, params: pageArgs },
                sessionIdOverride: activeSession,
              })
            : callLingxingProxy({
                jsonRpcMethod: 'tools/call',
                toolName: tool.name,
                toolArgs: pageArgs,
                sessionIdOverride: activeSession,
              }));

          if (typeof data.mcpSessionId === 'string' && data.mcpSessionId) {
            activeSession = data.mcpSessionId;
          }
          if (!httpOk) {
            if (!firstErr) firstErr = data.message || '返回错误';
            return { ok: false, payload: null, errorMessage: data.message };
          }
          return { ok: true, payload: data.responsePayload };
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
                onChunkStart: ({ chunkIndex, totalChunks, chunk }) => {
                  pushLog(`   ▸ 订单分片 ${chunkIndex + 1}/${totalChunks} (${chunk.label}) ...`);
                },
                onPageFetched: ({
                  chunkIndex,
                  totalChunks,
                  pageNumber,
                  pageCount,
                  chunkAccumulated,
                  chunkUpstreamTotal,
                  totalAccumulated,
                }) => {
                  if (pageNumber === 1 || pageNumber % 3 === 0 || (chunkUpstreamTotal !== null && chunkAccumulated >= chunkUpstreamTotal)) {
                    pushLog(
                      `     ↳ [分片 ${chunkIndex + 1}/${totalChunks}] 第 ${pageNumber} 页 ${pageCount} 条（片内 ${chunkAccumulated}${
                        chunkUpstreamTotal !== null ? `/${chunkUpstreamTotal}` : ''
                      } · 累计 ${totalAccumulated} 条）`
                    );
                  }
                },
              })
            : await collectAllPaginatedRecords({
                tool,
                baseArgs,
                fetchPage: fetchPageFn,
                onPageFetched: ({ pageNumber, pageCount, accumulated, upstreamTotal }) => {
                  if (pageNumber > 1 || (upstreamTotal !== null && upstreamTotal > pageCount)) {
                    pushLog(
                      `   ↳ ${tool.name} 第 ${pageNumber} 页拉取 ${pageCount} 条，累计 ${accumulated}${
                        upstreamTotal !== null ? ` / ${upstreamTotal}` : ''
                      } 条`
                    );
                  }
                },
              });

        let combinedRecords = paged.records;
        let extraPages = 0;
        let pendingCheckedCount = 0;
        if (tool.domain === 'ORDERS' && plan.pendingOrdersToRefresh.length > 0) {
          pushLog(
            `   ▸ 正在精准复查 ${plan.pendingOrdersToRefresh.length} 笔窗口外历史 PENDING 订单状态...`
          );
          const pendingRes = await collectPendingOrderRefreshRecords({
            tool,
            baseArgs,
            pendingOrders: plan.pendingOrdersToRefresh,
            fetchPage: fetchPageFn,
          });
          extraPages = pendingRes.pagesFetched;
          pendingCheckedCount = pendingRes.checkedCount;
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
          pushLog(`   ✓ 历史 PENDING 复查完成，回写 ${pendingRes.records.length} 条`);
        }

        if (
          tool.domain === 'ORDERS' &&
          'windowStartDate' in paged &&
          typeof paged.windowStartDate === 'string' &&
          paged.windowStartDate
        ) {
          fullSyncOrderWindowStart = paged.windowStartDate;
        }

        if (paged.pagesFetched === 0) {
          pushLog(`⚠ 工具 ${tool.name} 调用失败: ${firstErr || '返回错误'}（继续下一域）`);
          continue;
        }

        updatedWatermarks[tool.domain] = {
          lastSyncedAt: syncRunAtStr,
          lastWindowStartDate:
            tool.domain === 'ORDERS'
              ? fullSyncOrderWindowStart || plan.effectiveStartDate
              : plan.effectiveStartDate,
          lastWindowEndDate: plan.effectiveEndDate,
          mode: plan.mode,
          strategy: plan.strategy,
          pendingOrdersChecked: pendingCheckedCount > 0 ? pendingCheckedCount : undefined,
        };

        const bundle = normalizeLingxingRecordsForDomain(
          tool.name,
          tool.domain,
          combinedRecords,
          currentTenant.id,
          accShops,
          accListings,
          accExchangeRates
        );

        succeededToolNames.push(tool.name);
        const domainComplete =
          !paged.truncatedByCap &&
          combinedRecords.length > 0 &&
          (paged.upstreamTotal === null || paged.records.length >= paged.upstreamTotal);
        const mappedEntity = domainEntityMap[tool.domain];
        if (domainComplete && mappedEntity && !plan.preserveExistingOutsideDelta) {
          completedDomains.add(mappedEntity);
        }
        for (const s of bundle.shops) syncedShopsMap.set(s.id, s);
        for (const sk of bundle.localSkus) syncedLocalSkusMap.set(sk.id, sk);
        for (const l of bundle.listings) syncedListingsMap.set(l.id, l);
        for (const o of bundle.orders) syncedOrdersMap.set(o.id, o);
        for (const sup of bundle.suppliers) syncedSuppliersMap.set(sup.id, sup);
        for (const po of bundle.purchaseOrders) syncedPosMap.set(po.id, po);
        for (const bom of bundle.bomOrders) syncedBomMap.set(bom.id, bom);
        for (const wh of bundle.warehouseLedgers) syncedLedgersMap.set(wh.id, wh);
        for (const fba of bundle.fbaShipments) syncedFbaMap.set(fba.id, fba);
        for (const a of bundle.adCampaigns) syncedAdsMap.set(a.id, a);
        for (const st of bundle.searchTerms) syncedSearchTermsMap.set(st.id, st);
        for (const se of bundle.settlements) syncedSettlementsMap.set(se.id, se);
        for (const fx of bundle.exchangeRates) syncedExchangeRatesMap.set(fx.id, fx);
        for (const pf of bundle.profitSummaries) syncedProfitSummariesMap.set(pf.id, pf);

        if (bundle.exchangeRates.length > 0) {
          accExchangeRates = Array.from(syncedExchangeRatesMap.values());
        }
        if (bundle.shops.length > 0) {
          accShops = [...bundle.shops, ...accShops.filter((s) => !syncedShopsMap.has(s.id))];
        }
        if (bundle.listings.length > 0) {
          accListings = [...bundle.listings, ...accListings.filter((l) => !syncedListingsMap.has(l.id))];
        }

        const gotCount =
          bundle.shops.length +
          bundle.localSkus.length +
          bundle.listings.length +
          bundle.orders.length +
          bundle.suppliers.length +
          bundle.purchaseOrders.length +
          bundle.bomOrders.length +
          bundle.warehouseLedgers.length +
          bundle.fbaShipments.length +
          bundle.adCampaigns.length +
          bundle.searchTerms.length +
          bundle.settlements.length +
          bundle.exchangeRates.length +
          bundle.profitSummaries.length;

        pushLog(
          `✓ ${tool.name} 完成：共拉取 ${paged.pagesFetched + extraPages} 页，归档 ${gotCount} 条${
            paged.upstreamTotal !== null ? `（领星总计 ${paged.upstreamTotal} 条）` : ''
          }`
        );
      }

      const finalShops = Array.from(syncedShopsMap.values());
      const finalLocalSkus = Array.from(syncedLocalSkusMap.values());
      const finalListings = Array.from(syncedListingsMap.values());
      const finalOrders = Array.from(syncedOrdersMap.values());
      const finalSuppliers = Array.from(syncedSuppliersMap.values());
      const finalPos = Array.from(syncedPosMap.values());
      const finalBoms = Array.from(syncedBomMap.values());
      const finalLedgers = Array.from(syncedLedgersMap.values());
      const finalFba = Array.from(syncedFbaMap.values());
      const finalAds = Array.from(syncedAdsMap.values());
      const finalSearchTerms = Array.from(syncedSearchTermsMap.values());
      const finalSettlements = Array.from(syncedSettlementsMap.values());
      const finalExchangeRates = Array.from(syncedExchangeRatesMap.values());
      const finalProfitSummaries = Array.from(syncedProfitSummariesMap.values());
      const totalSynced =
        finalShops.length +
        finalLocalSkus.length +
        finalListings.length +
        finalOrders.length +
        finalSuppliers.length +
        finalPos.length +
        finalBoms.length +
        finalLedgers.length +
        finalFba.length +
        finalAds.length +
        finalSearchTerms.length +
        finalSettlements.length +
        finalExchangeRates.length +
        finalProfitSummaries.length;

      if (totalSynced === 0) {
        pushLog('⚠ 未解析到有效业务记录，请检查右侧 JSON-RPC 原始报文。');
        setStatusIsError(true);
        setStatusMessage('本次拉取未解析到可入库记录，请查看右侧 JSON-RPC 报文。');
        return;
      }

      pushLog(`→ 正在将 ${totalSynced} 条真实领星数据批量写入 Supabase...`);
      const dbRes = await onApplyLingxingSyncResult({
        toolNames: succeededToolNames,
        shops: finalShops,
        localSkus: finalLocalSkus,
        listings: finalListings,
        orders: finalOrders,
        suppliers: finalSuppliers,
        purchaseOrders: finalPos,
        bomOrders: finalBoms,
        warehouseLedgers: finalLedgers,
        fbaShipments: finalFba,
        adCampaigns: finalAds,
        searchTerms: finalSearchTerms,
        settlements: finalSettlements,
        exchangeRates: finalExchangeRates,
        profitSummaries: finalProfitSummaries,
        clearDemoForTenant: clearDemoOnSync,
        completedDomains: Array.from(completedDomains),
        orderWindowStartDate: fullSyncOrderWindowStart,
        updatedWatermarks,
      });

      pushLog(dbRes.ok ? `✓ ${dbRes.message}` : `✗ 写库失败: ${dbRes.message}`);
      setStatusIsError(!dbRes.ok);
      setStatusMessage(dbRes.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      pushLog(`✗ 同步异常: ${msg}`);
      setStatusIsError(true);
      setStatusMessage(`全量同步异常: ${msg}`);
    } finally {
      setIsFullSyncing(false);
      setIsCalling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Credentials & One-Click Real Sync Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              01. 领星 ERP MCP 上游真实数据接入与直连落库中心
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-4xl">
              通过服务端 Streamable HTTP / SSE 代理直连您配置的领星 MCP Server，自动完成 MCP 协议握手、拉取真实店铺、ASIN/MSKU、FBA 库存、订单与广告数据，并实时持久化写入 Supabase PostgreSQL。
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-slate-500">
              已入库: 店铺 {shops.length} · ASIN {listings.length} · 订单 {ordersCount}
            </span>
            <span
              className={`font-semibold ${
                currentTenant.lingxingConnectionStatus === 'CONNECTED'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {currentTenant.lingxingConnectionStatus}
            </span>
          </div>
        </div>

        {/* Credentials Configuration Form */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="md:col-span-5">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              领星 MCP Server URL (HTTPS Streamable HTTP / SSE)
            </label>
            <input
              type="text"
              value={mcpUrl}
              onChange={(e) => setMcpUrl(e.target.value)}
              disabled={isReadOnlyExpired}
              placeholder="https://mcp.lingxing.com/..."
              className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 disabled:opacity-50"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              领星 MCP 鉴权密钥 (X-Mcp-Key，若 URL 已带 token 可留空)
            </label>
            <input
              type="password"
              value={mcpKey}
              onChange={(e) => setMcpKey(e.target.value)}
              disabled={isReadOnlyExpired}
              placeholder="X-Mcp-Key / Bearer Token"
              className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 disabled:opacity-50"
            />
          </div>
          <div className="md:col-span-3 flex items-end gap-2">
            <button
              type="button"
              onClick={handleSaveCredentials}
              disabled={isReadOnlyExpired || savingConfig}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {savingConfig ? '写入中...' : '保存配置'}
            </button>
            <button
              type="button"
              onClick={handleDiscoverTools}
              disabled={isCalling}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCalling && !isFullSyncing ? 'animate-spin' : ''}`} />
              <span>探测工具</span>
            </button>
          </div>
        </div>

        {/* One-Click Hybrid Incremental / Full Real Sync Bar */}
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={clearDemoOnSync}
                  onChange={(e) => setClearDemoOnSync(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>同步真实数据时，自动清理当前租户历史虚拟样本</span>
              </label>

              <div className="inline-flex items-center gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  同步策略:
                </span>
                <select
                  value={syncMode}
                  disabled={isCalling || isUpdatingScheduler || isReadOnlyExpired}
                  onChange={(e) => {
                    const nextMode: LingxingSyncMode =
                      e.target.value === 'FULL' ? 'FULL' : 'INCREMENTAL';
                    setSyncMode(nextMode);
                    if (scheduler?.running) {
                      void handleToggleScheduler(true, undefined, undefined, nextMode);
                    }
                  }}
                  className="px-2.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
                >
                  <option value="INCREMENTAL">智能增量同步 (推荐)</option>
                  <option value="FULL">全量历史回溯</option>
                </select>
              </div>

              <div className="inline-flex items-center gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {syncMode === 'INCREMENTAL' ? '首次/全量订单跨度:' : '订单拉取跨度 (30天分片):'}
                </span>
                <select
                  value={orderSyncDays}
                  disabled={isCalling || isUpdatingScheduler || isReadOnlyExpired}
                  onChange={(e) => {
                    const days = Number(e.target.value);
                    setOrderSyncDays(days);
                    if (scheduler?.running) {
                      void handleToggleScheduler(true, undefined, days);
                    }
                  }}
                  className="px-2.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
                >
                  {ORDER_SYNC_DAY_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      近 {d} 天{d === 90 ? ' (推荐)' : d === 365 ? ' (全年)' : d === 180 ? ' (半年)' : ' (快速)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleFullSyncAllToDb}
              disabled={isCalling || isReadOnlyExpired}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <DownloadCloud className={`w-4 h-4 ${isFullSyncing ? 'animate-bounce' : ''}`} />
              <span>
                {isFullSyncing
                  ? syncMode === 'INCREMENTAL'
                    ? '正在执行智能增量同步...'
                    : `正在全量同步全部业务域（近 ${orderSyncDays} 天订单）...`
                  : syncMode === 'INCREMENTAL'
                    ? '一键智能增量同步到 Supabase'
                    : `一键全量回溯同步（含近 ${orderSyncDays} 天订单）`}
              </span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              增量策略：订单按上次水位线 + 7 天回溯窗口拉取并批量复查历史 PENDING 单；仓流水 / FBA 发货单 / BOM 加工单按领星原生 update_time 增量拉取（首次或空表自动全量）。
            </span>
            {currentTenant.lastLingxingSyncAt && (
              <span className="font-mono text-slate-600 dark:text-slate-300">
                当前水位线: {currentTenant.lingxingSyncWatermarks?.ORDERS?.lastSyncedAt || currentTenant.lastLingxingSyncAt}
              </span>
            )}
          </div>
        </div>

        {/* Server-Side Scheduled Auto-Sync Bar */}
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs">
            <Clock
              className={`w-4 h-4 shrink-0 ${
                scheduler?.running
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400'
              }`}
            />
            <div>
              <div className="font-medium text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                <span>服务端定时自动同步：</span>
                <span
                  className={`font-mono font-semibold ${
                    scheduler?.running
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {scheduler?.running
                    ? scheduler.runtimeMode === 'CLOUDFLARE_CRON'
                      ? `运行中 · Cloudflare Cron（每 ${scheduler.intervalMinutes} 分钟 · ${scheduler.cronSchedule || '*/15 * * * *'}）`
                      : `运行中（每 ${scheduler.intervalMinutes} 分钟）`
                    : '未启动 / 已暂停'}
                </span>
                {scheduler && (
                  <span className="text-[11px] font-mono text-slate-500">
                    · 累计执行 {scheduler.runCount} 次
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                {scheduler?.lastRunAt
                  ? `上次执行: ${scheduler.lastRunAt.replace('T', ' ').slice(0, 19)}`
                  : '上次执行: 暂无'}
                {scheduler?.nextRunAt
                  ? ` · 下次预计: ${scheduler.nextRunAt.replace('T', ' ').slice(0, 19)}`
                  : ''}
                {scheduler?.runtimeMode === 'CLOUDFLARE_CRON'
                  ? ' · 状态已持久化至云端数据库'
                  : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={schedulerInterval}
              disabled={isUpdatingScheduler || isReadOnlyExpired}
              onChange={(e) => {
                const mins = Number(e.target.value);
                setSchedulerInterval(mins);
                if (scheduler?.running) {
                  void handleToggleScheduler(true, mins);
                }
              }}
              className="px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
            >
              <option value={5}>每 5 分钟</option>
              <option value={15}>每 15 分钟 (PRO 默认)</option>
              <option value={30}>每 30 分钟</option>
              <option value={60}>每 60 分钟</option>
            </select>
            <button
              type="button"
              disabled={isUpdatingScheduler || isReadOnlyExpired}
              onClick={() => void handleToggleScheduler(!scheduler?.running)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {scheduler?.running ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>暂停定时同步</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>启动定时同步</span>
                </>
              )}
            </button>
            <button
              type="button"
              disabled={isUpdatingScheduler || isReadOnlyExpired}
              onClick={() => void handleTriggerSchedulerNow()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isUpdatingScheduler ? 'animate-spin' : ''}`} />
              <span>立即触发后台同步</span>
            </button>
          </div>
        </div>

        {scheduler?.lastDomainStats && scheduler.lastDomainStats.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-2">
              最近一次全量分页同步完整性核对（各域拉取页数 / 已拉取条数 / 领星上游总数）：
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-[11px] font-mono tabular-nums">
              {scheduler.lastDomainStats.map((st) => (
                <div
                  key={st.toolName}
                  className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-2"
                >
                  <span className="truncate text-slate-600 dark:text-slate-300">
                    {DOMAIN_LABELS[st.domain].split(' ')[0]}
                  </span>
                  <span
                    className={
                      st.complete
                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap'
                        : 'text-amber-600 dark:text-amber-400 font-semibold whitespace-nowrap'
                    }
                  >
                    {st.fetchedCount}
                    {st.upstreamTotal !== null ? `/${st.upstreamTotal}` : ''} · {st.pagesFetched}页
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {syncSteps.length > 0 && (
          <div className="mt-3 p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-300 space-y-1 max-h-48 overflow-y-auto">
            {syncSteps.map((line, idx) => (
              <div key={idx}>{line}</div>
            ))}
          </div>
        )}

        {statusMessage && (
          <div
            className={`mt-3 p-3 rounded text-xs flex items-center gap-2 ${
              statusIsError
                ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
            }`}
          >
            {statusIsError ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* 2-Column Split: Discovered Real Lingxing MCP Tools & Live JSON-RPC 2.0 Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  02. 已探测的真实领星 MCP 工具列表 ({discoveredTools.length})
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-500">
                {mcpSessionId ? `Session: ${mcpSessionId.slice(0, 10)}...` : 'Streamable HTTP'}
              </span>
            </div>

            {discoveredTools.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  尚未探测远端领星 MCP 工具清单（不展示硬编码假工具）。
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  请点击上方「探测工具」或「一键通过领星 MCP 同步全部真实数据到 Supabase」。
                </p>
              </div>
            ) : (
              <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800 max-h-96 overflow-y-auto pr-1">
                {discoveredTools.map((tool) => {
                  const isEditing = editingArgsTool === tool.name;
                  const defaultJson = JSON.stringify(
                    buildDefaultArgsForTool(tool, shops, adProfileIds),
                    null,
                    2
                  );
                  return (
                    <div key={tool.name} className="py-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono font-semibold text-slate-900 dark:text-white">
                              {tool.name}
                            </span>
                            <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400">
                              · {DOMAIN_LABELS[tool.domain]}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                            {tool.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              if (!customArgsMap[tool.name]) {
                                setCustomArgsMap((prev) => ({
                                  ...prev,
                                  [tool.name]: defaultJson,
                                }));
                              }
                              setEditingArgsTool(isEditing ? null : tool.name);
                            }}
                            title="自定义 JSON 参数"
                            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExecuteToolSync(tool)}
                            disabled={isCalling || isReadOnlyExpired}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                          >
                            <Play className="w-3 h-3" />
                            <span>拉取并入库</span>
                          </button>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-800">
                          <div className="text-[11px] text-slate-500 mb-1">
                            自定义工具调用参数 (JSON)：
                          </div>
                          <textarea
                            rows={4}
                            value={customArgsMap[tool.name] ?? defaultJson}
                            onChange={(e) =>
                              setCustomArgsMap((prev) => ({
                                ...prev,
                                [tool.name]: e.target.value,
                              }))
                            }
                            className="w-full p-2 text-[11px] font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 flex items-center justify-between gap-2 flex-wrap">
            <span>
              已入库店铺:{' '}
              {shops.length > 0
                ? shops.map((s) => `${s.shopName}(${s.marketplace})`).slice(0, 4).join(' / ')
                : '暂无'}
            </span>
            <span className="font-mono">最近同步: {currentTenant.lastLingxingSyncAt}</span>
          </div>
        </div>

        {/* Right 6 Cols: JSON-RPC 2.0 Packet Inspector */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  03. 领星 MCP JSON-RPC 2.0 真实报文观测台
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-500">
                Tool: {selectedTool} {lastLatencyMs !== null ? `· ${lastLatencyMs}ms` : ''}
              </span>
            </div>

            <pre className="mt-3 p-3.5 bg-slate-950 text-slate-200 text-[11px] font-mono rounded-md overflow-x-auto max-h-80 leading-relaxed">
              {rpcLog}
            </pre>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>已启用 HTTPS 外网代理校验、流式 SSE 解析与过期租户 HTTP 402 熔断</span>
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Table: Amazon ASIN/MSKU <-> Local ERP 1688 SKU Mapping Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              04. 领星亚马逊 Listing (ASIN / MSKU) 与本地仓库 SKU 映射配对表
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              同步入库的真实亚马逊 ASIN / MSKU 可在此关联本地物料 SKU，自动打通采购成本核算与 FBA 补货计算
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">
            已入库 Listing: {listings.length} 条
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-4">站点 / 店铺</th>
                <th className="py-2.5 px-4">亚马逊 ASIN / MSKU / FNSKU</th>
                <th className="py-2.5 px-4">线上商品标题</th>
                <th className="py-2.5 px-4">绑定本地仓库 SKU</th>
                <th className="py-2.5 px-3 text-right">1688采购价 + 头程</th>
                <th className="py-2.5 px-4 text-right">FBA可售 / 本地可用库存</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {listings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    暂无已入库 Listing，请点击上方「一键通过领星 MCP 同步全部真实数据到 Supabase」。
                  </td>
                </tr>
              ) : (
                mappingPagination.pageItems.map((item) => {
                  const matchedSku = localSkus.find((s) => s.sku === item.localSkuCode);
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        {item.marketplace} · {item.shopName}
                      </td>
                      <td className="py-3 px-4 font-mono whitespace-nowrap">
                        <div className="font-semibold text-blue-600 dark:text-blue-400">
                          {item.asin}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {item.msku} {item.fnsku ? `· ${item.fnsku}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate text-slate-700 dark:text-slate-300">
                        {item.title}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Link2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <select
                            value={item.localSkuCode}
                            disabled={isReadOnlyExpired}
                            onChange={(e) => onUpdateListingMapping(item.id, e.target.value)}
                            className="px-2.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 disabled:opacity-50"
                          >
                            <option value="">-- 未绑定本地 SKU --</option>
                            {localSkus.map((sku) => (
                              <option key={sku.id} value={sku.sku}>
                                {sku.sku} — {sku.name.slice(0, 18)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        ¥{(matchedSku?.purchaseCostCny ?? 0).toFixed(1)} + 运¥
                        {(matchedSku?.headFreightPerUnitCny ?? 0).toFixed(1)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="text-slate-900 dark:text-white font-semibold">
                          FBA {item.fbaAvailable}
                        </span>{' '}
                        / 本地 {matchedSku?.localAvailableQty || 0}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={mappingPagination.page}
          pageSize={mappingPagination.pageSize}
          totalItems={mappingPagination.totalItems}
          totalPages={mappingPagination.totalPages}
          onPageChange={mappingPagination.setPage}
          onPageSizeChange={mappingPagination.setPageSize}
          itemLabel="条 Listing 映射"
        />
      </div>
    </div>
  );
};
