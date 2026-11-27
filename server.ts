import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import {
  bootstrapLingxingSchedulerFromEnv,
  configureLingxingScheduler,
  getLingxingSchedulerStatus,
  runLingxingScheduledSyncOnce,
} from './src/services/lingxingAutoSyncRunner';
import { normalizeSupabaseProjectUrl } from './src/services/supabaseClient';
import {
  ALLOWED_QUERY_ENTITIES,
  PAGE_ENTITY_REQUIREMENTS,
  executePagedEntityQuery,
  fetchBootstrapFromSupabase,
  fetchEntitySliceFromSupabase,
  fetchPageDataFromSupabase,
  invalidateBackendEntityCache,
} from './src/services/backendDataEngine';
import type { ErpEntityType } from './src/services/erpDatabaseService';
import type { ExchangeRateItem } from './src/types/erp';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '5mb' }));

  // ============================================================================
  // 1. UPSTREAM LINGXING MCP PROXY (/api/lingxing/mcp-proxy)
  // Bridges browser/Cloudflare Worker to Lingxing ERP MCP Server (Streamable HTTP + SSE)
  // ============================================================================
  app.post('/api/lingxing/mcp-proxy', async (req, res) => {
    const startTime = Date.now();
    const {
      mcpEndpointUrl,
      mcpApiKey = '',
      jsonRpcMethod = 'tools/list',
      toolName,
      toolArgs = {},
      mcpSessionId: incomingSessionId,
      tenantStatus = 'ACTIVE',
      mcpModuleEnabled = true,
    } = req.body || {};

    if (mcpModuleEnabled === false) {
      return res.status(403).json({
        ok: false,
        errorCode: 'MODULE_NOT_ENABLED',
        message: '当前租户未在应用市场启用 [mod_mcp_gateway] 模块，领星 MCP 上游同步已被拦截。',
        latencyMs: Date.now() - startTime,
      });
    }

    // Layer 3 Edge Guard: Block expired or suspended tenants from executing upstream syncs
    if (tenantStatus === 'EXPIRED_READONLY' || tenantStatus === 'SUSPENDED') {
      return res.status(402).json({
        ok: false,
        errorCode: 'TENANT_SUBSCRIPTION_EXPIRED',
        message: `当前卖家租户处于 [${tenantStatus}] 状态，已自动熔断领星 MCP 数据同步请求。请先续期或兑换激活码恢复服务。`,
        latencyMs: Date.now() - startTime,
      });
    }

    const trimmedUrl = typeof mcpEndpointUrl === 'string' ? mcpEndpointUrl.trim() : '';
    const trimmedKey = typeof mcpApiKey === 'string' ? mcpApiKey.trim() : '';
    const urlHasInlineToken = /[?&](key|token|api_key|apikey|mcp_key|access_token)=/i.test(trimmedUrl);

    if (!trimmedUrl || (!trimmedKey && !urlHasInlineToken)) {
      return res.status(400).json({
        ok: false,
        errorCode: 'MISSING_LINGXING_CREDENTIALS',
        message: '请提供领星 MCP Server URL 与 X-Mcp-Key 鉴权密钥（若 URL 中已携带 token 参数可留空密钥）',
      });
    }

    const urlValidation = validateSafeExternalMcpUrl(trimmedUrl);
    if (!urlValidation.valid) {
      return res.status(400).json({
        ok: false,
        errorCode: 'INVALID_MCP_ENDPOINT_URL',
        message: urlValidation.reason || '领星 MCP Server URL 不符合安全外网 HTTPS 规范',
      });
    }

    const buildHeaders = (sessionId?: string): Record<string, string> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      };
      if (trimmedKey) {
        headers['X-Mcp-Key'] = trimmedKey;
        headers.Authorization = `Bearer ${trimmedKey}`;
      }
      if (sessionId) {
        headers['Mcp-Session-Id'] = sessionId;
      }
      return headers;
    };

    let activeSessionId: string | undefined =
      typeof incomingSessionId === 'string' && incomingSessionId.trim()
        ? incomingSessionId.trim()
        : undefined;

    const rpcPayload = {
      jsonrpc: '2.0',
      id: `lx-rpc-${Date.now()}`,
      method: jsonRpcMethod,
      params:
        jsonRpcMethod === 'tools/call'
          ? { name: toolName, arguments: toolArgs }
          : {},
    };

    try {
      // MCP Streamable HTTP (2025-03-26) session handshake when no session ID is present yet
      if (!activeSessionId && jsonRpcMethod !== 'initialize') {
        try {
          const initPayload = {
            jsonrpc: '2.0',
            id: `lx-init-${Date.now()}`,
            method: 'initialize',
            params: {
              protocolVersion: '2025-03-26',
              capabilities: {},
              clientInfo: { name: 'x-cloud-erp', version: '2.4.0' },
            },
          };
          const initRes = await fetch(trimmedUrl, {
            method: 'POST',
            headers: buildHeaders(),
            body: JSON.stringify(initPayload),
            signal: AbortSignal.timeout(8000),
          });
          const headerSid =
            initRes.headers.get('mcp-session-id') ||
            initRes.headers.get('Mcp-Session-Id') ||
            undefined;
          if (headerSid) {
            activeSessionId = headerSid;
            // Best-effort MCP notifications/initialized acknowledgement
            await fetch(trimmedUrl, {
              method: 'POST',
              headers: buildHeaders(activeSessionId),
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'notifications/initialized',
                params: {},
              }),
              signal: AbortSignal.timeout(8000),
            }).catch(() => undefined);
          }
        } catch {
          // Some stateless MCP gateways don't require initialize; proceed directly to target RPC
        }
      }

      const response = await fetch(trimmedUrl, {
        method: 'POST',
        headers: buildHeaders(activeSessionId),
        body: JSON.stringify(rpcPayload),
        signal: AbortSignal.timeout(15000),
      });

      const returnedSessionId =
        response.headers.get('mcp-session-id') ||
        response.headers.get('Mcp-Session-Id') ||
        activeSessionId;
      const contentType = response.headers.get('content-type') || '';
      const rawText = await response.text();
      const parsedData = parseMcpResponseBody(rawText, contentType);

      const rpcError =
        parsedData && typeof parsedData === 'object' && 'error' in parsedData
          ? (parsedData as { error?: { message?: string; code?: number } }).error
          : undefined;

      if (!response.ok || rpcError) {
        return res.status(response.ok ? 502 : response.status).json({
          ok: false,
          status: response.status,
          mcpSessionId: returnedSessionId,
          errorCode: rpcError ? 'UPSTREAM_MCP_RPC_ERROR' : 'UPSTREAM_MCP_HTTP_ERROR',
          message: rpcError?.message
            ? `领星 MCP 返回错误 (${rpcError.code ?? 'RPC'}): ${rpcError.message}`
            : `领星 MCP 返回 HTTP ${response.status}: ${rawText.slice(0, 240)}`,
          latencyMs: Date.now() - startTime,
          endpoint: trimmedUrl,
          requestPayload: rpcPayload,
          responsePayload: parsedData,
        });
      }

      return res.status(200).json({
        ok: true,
        status: response.status,
        mcpSessionId: returnedSessionId,
        latencyMs: Date.now() - startTime,
        endpoint: trimmedUrl,
        requestPayload: rpcPayload,
        responsePayload: parsedData,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return res.status(502).json({
        ok: false,
        errorCode: 'UPSTREAM_MCP_UNREACHABLE',
        message: `无法连接领星 MCP 服务器 (${trimmedUrl}): ${errorMessage}。请检查 URL、X-Mcp-Key 及网络连通性。`,
        latencyMs: Date.now() - startTime,
        endpoint: trimmedUrl,
        requestPayload: rpcPayload,
      });
    }
  });

  // ============================================================================
  // 2. DOWNSTREAM X CLOUD MCP SERVER (/api/mcp)
  // Exposes Model Context Protocol (JSON-RPC 2.0) to Claude Desktop / Cursor / Dify
  // ============================================================================
  app.post('/api/mcp', async (req, res) => {
    const startTime = Date.now();
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const {
      jsonrpc = '2.0',
      id = 1,
      method,
      params = {},
      _contextTenantStatus = 'ACTIVE',
      _contextPermissionScope = 'READ_WRITE',
      _contextQuotaRemaining = 500,
      _contextMcpModuleEnabled = true,
    } = req.body || {};

    if (!token) {
      return res.status(401).json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32001,
          message: 'Unauthorized: Missing X Cloud MCP Bearer Token or Logto OAuth 2.1 Access Token',
        },
      });
    }

    if (_contextMcpModuleEnabled === false) {
      return res.status(403).json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32005,
          message: 'MODULE_NOT_ENABLED: 当前租户未在应用市场启用 [mod_mcp_gateway] 模块，已阻断 /api/mcp 访问。',
        },
      });
    }

    if (_contextTenantStatus === 'EXPIRED_READONLY' || _contextTenantStatus === 'SUSPENDED') {
      const isWriteTool =
        method === 'tools/call' &&
        ['create_draft_purchase_order', 'adjust_campaign_bid_or_rule', 'sync_from_lingxing_mcp'].includes(
          params?.name
        );
      if (_contextTenantStatus === 'SUSPENDED' || isWriteTool) {
        return res.status(402).json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32002,
            message: `Subscription Guard Blocked: 租户当前状态为 [${_contextTenantStatus}]，已禁止执行写操作或同步操作，请续费订阅后重试。`,
          },
        });
      }
    }

    if (_contextQuotaRemaining <= 0) {
      return res.status(429).json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32003,
          message: 'Quota Exceeded: 当前租户本月 MCP AI 调用配额已用尽，请升级至 PRO 或 ENTERPRISE 套餐。',
        },
      });
    }

    if (method === 'initialize') {
      return res.json({
        jsonrpc,
        id,
        result: {
          protocolVersion: '2025-03-26',
          serverInfo: {
            name: 'x-cloud-erp-mcp-server',
            version: '2.4.0',
          },
          capabilities: {
            resources: { subscribe: false, listChanged: false },
            tools: { listChanged: false },
            prompts: { listChanged: false },
          },
        },
      });
    }

    if (method === 'tools/list') {
      return res.json({
        jsonrpc,
        id,
        result: {
          tools: [
            {
              name: 'get_asin_profit_breakdown',
              description: '查询指定 ASIN 或 MSKU 的多维实时利润核算拆解（融合领星 MCP 营收/FBA费/广告费 + 本地 ERP 1688 采购成本与头程运费）',
              inputSchema: {
                type: 'object',
                properties: {
                  asin: { type: 'string', description: '亚马逊 10 位 ASIN 编码' },
                  marketplace: { type: 'string', description: '站点代码，如 US, UK, DE, JP' },
                  days: { type: 'number', description: '统计天数，默认 30' },
                },
                required: ['asin'],
              },
            },
            {
              name: 'calculate_smart_restock_plan',
              description: '智能补货计算器：结合领星 MCP 7/14/30天加权日均销量、FBA可售+在途库存、本地仓库存及采购交期，计算需向1688采购及FBA发货建议量',
              inputSchema: {
                type: 'object',
                properties: {
                  targetCoverDays: { type: 'number', description: '目标安全备货覆盖天数，如 45 或 60' },
                  shippingMode: { type: 'string', enum: ['SEA', 'AIR', 'EXPRESS'], description: '头程物流方式' },
                },
                required: ['targetCoverDays'],
              },
            },
            {
              name: 'diagnose_advertising_campaigns',
              description: '基于领星 MCP 同步的 SP/SB/SD 广告报表与小时级转化数据，筛选高 ACOS 异常活动并输出分时调价建议',
              inputSchema: {
                type: 'object',
                properties: {
                  maxTargetAcos: { type: 'number', description: '目标最大 ACOS 百分比阈值，如 25' },
                },
                required: ['maxTargetAcos'],
              },
            },
            {
              name: 'create_draft_purchase_order',
              description: '[受控写操作] 在本地 ERP 中自动创建一张状态为 DRAFT（待审核）的 1688 采购计划单，并记录 MCP 审计日志',
              inputSchema: {
                type: 'object',
                properties: {
                  localSku: { type: 'string', description: '本地 SKU 编码' },
                  quantity: { type: 'number', description: '建议采购数量' },
                  supplierName: { type: 'string', description: '供应商名称' },
                },
                required: ['localSku', 'quantity'],
              },
            },
            {
              name: 'sync_from_lingxing_mcp',
              description: '[上游同步] 触发当前租户绑定的领星 MCP 连接器，按需拉取最新亚马逊销量、库存或广告数据至 Supabase',
              inputSchema: {
                type: 'object',
                properties: {
                  domain: {
                    type: 'string',
                    enum: ['SHOPS', 'LISTINGS', 'ORDERS', 'FBA_INVENTORY', 'ADS_REPORTS', 'PROFIT_LEDGER'],
                  },
                },
                required: ['domain'],
              },
            },
          ],
        },
      });
    }

    if (method === 'resources/list') {
      return res.json({
        jsonrpc,
        id,
        result: {
          resources: [
            {
              uri: 'xcloud://tenant/overview',
              name: '当前卖家租户概览与订阅配额快照',
              mimeType: 'application/json',
            },
            {
              uri: 'xcloud://inventory/alerts',
              name: 'FBA 与本地仓断货预警 SKU 清单',
              mimeType: 'application/json',
            },
            {
              uri: 'xcloud://finance/profit-summary',
              name: '多站点 ASIN 实时毛利与净利率汇总表',
              mimeType: 'application/json',
            },
          ],
        },
      });
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      if (
        _contextPermissionScope === 'READ_ONLY' &&
        [
          'create_draft_purchase_order',
          'adjust_campaign_bid_or_rule',
          'sync_from_lingxing_mcp',
        ].includes(toolName)
      ) {
        return res.status(403).json({
          jsonrpc,
          id,
          error: {
            code: -32004,
            message: `Permission Denied: 当前 MCP Token 权限为 READ_ONLY，禁止调用写操作工具 [${toolName}]。`,
          },
        });
      }

      return res.json({
        jsonrpc,
        id,
        result: {
          latencyMs: Date.now() - startTime,
          executedBy: 'x-cloud-edge-mcp',
          toolName,
          toolArgs,
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'SUCCESS',
                  tool: toolName,
                  arguments: toolArgs,
                  timestamp: new Date().toISOString(),
                  note: 'Executed against Multi-Tenant RLS Context & Lingxing MCP Normalized Ledger',
                },
                null,
                2
              ),
            },
          ],
        },
      });
    }

    return res.json({
      jsonrpc,
      id,
      result: { message: `Handled MCP method: ${method}` },
    });
  });

  // ============================================================================
  // 3. SERVER-SIDE SCHEDULED LINGXING MCP AUTO-SYNC ENGINE (/api/lingxing/scheduler/*)
  // Runs periodic 11-domain real Lingxing OpenMCP sync directly into Supabase
  // ============================================================================
  app.get('/api/lingxing/scheduler/status', (_req, res) => {
    return res.status(200).json({
      ok: true,
      scheduler: getLingxingSchedulerStatus(),
    });
  });

  app.post('/api/lingxing/scheduler/configure', (req, res) => {
    const {
      supabaseUrl,
      supabaseAnonKey,
      tenantId,
      intervalMinutes,
      enabled = true,
      tenantStatus = 'ACTIVE',
    } = req.body || {};

    if (enabled && (tenantStatus === 'EXPIRED_READONLY' || tenantStatus === 'SUSPENDED')) {
      return res.status(402).json({
        ok: false,
        errorCode: 'TENANT_SUBSCRIPTION_EXPIRED',
        message: `租户处于 [${tenantStatus}] 状态，已阻断启动定时同步任务。`,
        scheduler: getLingxingSchedulerStatus(),
      });
    }

    if (typeof supabaseUrl === 'string' && supabaseUrl.trim()) {
      const check = validateSafeExternalMcpUrl(supabaseUrl.trim());
      if (!check.valid) {
        return res.status(400).json({
          ok: false,
          errorCode: 'INVALID_SUPABASE_URL',
          message: check.reason || 'Supabase URL 不符合 HTTPS 外网安全规范',
        });
      }
    }

    const scheduler = configureLingxingScheduler({
      supabaseUrl: typeof supabaseUrl === 'string' ? supabaseUrl : undefined,
      supabaseAnonKey: typeof supabaseAnonKey === 'string' ? supabaseAnonKey : undefined,
      tenantId: typeof tenantId === 'string' ? tenantId : undefined,
      intervalMinutes: typeof intervalMinutes === 'number' ? intervalMinutes : undefined,
      orderSyncDays:
        typeof req.body?.orderSyncDays === 'number' ? req.body.orderSyncDays : undefined,
      syncMode:
        req.body?.syncMode === 'FULL' || req.body?.syncMode === 'INCREMENTAL'
          ? req.body.syncMode
          : undefined,
      orderLookbackDays:
        typeof req.body?.orderLookbackDays === 'number' ? req.body.orderLookbackDays : undefined,
      enabled: Boolean(enabled),
    });

    return res.status(200).json({
      ok: true,
      scheduler,
    });
  });

  app.post('/api/lingxing/scheduler/trigger', async (req, res) => {
    const { tenantStatus = 'ACTIVE', orderSyncDays, syncMode } = req.body || {};
    if (tenantStatus === 'EXPIRED_READONLY' || tenantStatus === 'SUSPENDED') {
      return res.status(402).json({
        ok: false,
        errorCode: 'TENANT_SUBSCRIPTION_EXPIRED',
        message: `租户处于 [${tenantStatus}] 状态，已阻断定时同步立即触发。`,
      });
    }
    const scheduler = await runLingxingScheduledSyncOnce(
      typeof orderSyncDays === 'number' ? orderSyncDays : undefined,
      syncMode === 'FULL' || syncMode === 'INCREMENTAL' ? syncMode : undefined
    );
    invalidateBackendEntityCache();
    return res.status(200).json({
      ok: scheduler.lastStatus !== 'ERROR',
      scheduler,
    });
  });

  // ============================================================================
  // 4. PLATFORM DATABASE RUNTIME CONFIG (/api/platform/db-config)
  // Browser localStorage persistence for DB config is disabled.
  // Reads process.env first, falling back to Express runtime memory (never written to disk).
  // ============================================================================
  interface ServerPlatformDbConfig {
    projectUrl: string;
    anonKey: string;
    authMode: 'SUPABASE_AUTH' | 'LOGTO_OIDC';
    logtoEndpoint: string;
    logtoAppId: string;
  }

  let runtimeServerDbConfig: ServerPlatformDbConfig | null = null;

  const isValidConfiguredPair = (url: string, key: string): boolean =>
    Boolean(
      url &&
        key &&
        url.startsWith('https://') &&
        !url.includes('your-project-id') &&
        !key.includes('your-supabase-anon-key') &&
        !key.includes('your_supabase_anon_key')
    );

  const getEffectiveServerDbConfig = (): {
    config: ServerPlatformDbConfig;
    configSource: 'ENV' | 'SERVER_MEMORY' | 'UNCONFIGURED';
  } => {
    const envUrl = normalizeSupabaseProjectUrl(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
    );
    const envKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
    const envAuthMode: 'SUPABASE_AUTH' | 'LOGTO_OIDC' =
      process.env.AUTH_MODE === 'LOGTO_OIDC' ? 'LOGTO_OIDC' : 'SUPABASE_AUTH';
    const envLogtoEndpoint = (
      process.env.LOGTO_ENDPOINT ||
      process.env.VITE_LOGTO_ENDPOINT ||
      'https://auth.x-cloud-erp.example.com'
    ).trim();
    const envLogtoAppId = (
      process.env.LOGTO_APP_ID ||
      process.env.VITE_LOGTO_APP_ID ||
      'app_xcloud_b2b_orgs'
    ).trim();

    if (runtimeServerDbConfig && isValidConfiguredPair(runtimeServerDbConfig.projectUrl, runtimeServerDbConfig.anonKey)) {
      return {
        config: runtimeServerDbConfig,
        configSource: 'SERVER_MEMORY',
      };
    }

    if (isValidConfiguredPair(envUrl, envKey)) {
      return {
        config: {
          projectUrl: envUrl,
          anonKey: envKey,
          authMode: envAuthMode,
          logtoEndpoint: envLogtoEndpoint,
          logtoAppId: envLogtoAppId,
        },
        configSource: 'ENV',
      };
    }

    return {
      config: {
        projectUrl: '',
        anonKey: '',
        authMode: runtimeServerDbConfig?.authMode || envAuthMode,
        logtoEndpoint: runtimeServerDbConfig?.logtoEndpoint || envLogtoEndpoint,
        logtoAppId: runtimeServerDbConfig?.logtoAppId || envLogtoAppId,
      },
      configSource: 'UNCONFIGURED',
    };
  };

  app.get('/api/platform/db-config', (_req, res) => {
    const { config, configSource } = getEffectiveServerDbConfig();
    return res.status(200).json({
      ok: true,
      config,
      configSource,
    });
  });

  app.post('/api/platform/db-config', (req, res) => {
    const {
      portalMode,
      projectUrl = '',
      anonKey = '',
      authMode = 'SUPABASE_AUTH',
      logtoEndpoint = 'https://auth.x-cloud-erp.example.com',
      logtoAppId = 'app_xcloud_b2b_orgs',
    } = req.body || {};

    if (portalMode !== 'PLATFORM_SUPER_ADMIN') {
      return res.status(403).json({
        ok: false,
        errorCode: 'SUPER_ADMIN_ONLY',
        message: '仅平台超级管理员可更新全局数据库连接配置。',
      });
    }

    const normalizedUrl = normalizeSupabaseProjectUrl(
      typeof projectUrl === 'string' ? projectUrl : ''
    );
    const trimmedKey = typeof anonKey === 'string' ? anonKey.trim() : '';
    const normalizedAuthMode: 'SUPABASE_AUTH' | 'LOGTO_OIDC' =
      authMode === 'LOGTO_OIDC' ? 'LOGTO_OIDC' : 'SUPABASE_AUTH';
    const trimmedLogtoEndpoint =
      typeof logtoEndpoint === 'string' && logtoEndpoint.trim()
        ? logtoEndpoint.trim()
        : 'https://auth.x-cloud-erp.example.com';
    const trimmedLogtoAppId =
      typeof logtoAppId === 'string' && logtoAppId.trim()
        ? logtoAppId.trim()
        : 'app_xcloud_b2b_orgs';

    if (normalizedUrl) {
      const urlCheck = validateSafeExternalMcpUrl(normalizedUrl);
      if (!urlCheck.valid) {
        return res.status(400).json({
          ok: false,
          errorCode: 'INVALID_SUPABASE_URL',
          message: urlCheck.reason || 'Supabase Project URL 不符合安全 HTTPS 外网规范',
        });
      }
    }

    if (normalizedAuthMode === 'LOGTO_OIDC' && trimmedLogtoEndpoint) {
      const logtoCheck = validateSafeExternalMcpUrl(trimmedLogtoEndpoint);
      if (!logtoCheck.valid) {
        return res.status(400).json({
          ok: false,
          errorCode: 'INVALID_LOGTO_URL',
          message: logtoCheck.reason || 'Logto OIDC Endpoint 不符合安全 HTTPS 外网规范',
        });
      }
    }

    runtimeServerDbConfig = {
      projectUrl: normalizedUrl,
      anonKey: trimmedKey,
      authMode: normalizedAuthMode,
      logtoEndpoint: trimmedLogtoEndpoint,
      logtoAppId: trimmedLogtoAppId,
    };

    if (isValidConfiguredPair(normalizedUrl, trimmedKey)) {
      const currentSched = getLingxingSchedulerStatus();
      configureLingxingScheduler({
        supabaseUrl: normalizedUrl,
        supabaseAnonKey: trimmedKey,
        intervalMinutes: currentSched.intervalMinutes,
        orderSyncDays: currentSched.orderSyncDays,
        enabled: currentSched.enabled,
      });
    }

    invalidateBackendEntityCache();

    return res.status(200).json({
      ok: true,
      config: runtimeServerDbConfig,
      configSource: isValidConfiguredPair(normalizedUrl, trimmedKey)
        ? 'SERVER_MEMORY'
        : 'UNCONFIGURED',
      message:
        '已更新服务端运行态数据库连接配置（浏览器 localStorage 已停用；如需服务重启后持久保留请配置服务端环境变量 SUPABASE_URL / SUPABASE_ANON_KEY）。',
    });
  });

  // ============================================================================
  // 5. ON-DEMAND BACKEND DATA & SERVER PAGINATION (/api/erp/*)
  // Keeps full datasets in backend/database; serves only current page & page slice.
  // ============================================================================
  app.get('/api/erp/bootstrap', async (_req, res) => {
    const startTime = Date.now();
    const { config } = getEffectiveServerDbConfig();
    const result = await fetchBootstrapFromSupabase(config);
    return res.status(200).json({
      ok: result.status === 'LOADED' || result.status === 'EMPTY_DB',
      status: result.status,
      message: result.message,
      recordCount: result.recordCount,
      data: result.data,
      latencyMs: Date.now() - startTime,
    });
  });

  app.post('/api/erp/page-data', async (req, res) => {
    const startTime = Date.now();
    const {
      pageId = '',
      tenantId = '',
      roleCode = 'TENANT_ADMIN',
      allowedShopIds = [],
    } = req.body || {};

    const cleanPageId = typeof pageId === 'string' ? pageId.trim() : '';
    if (!cleanPageId || !PAGE_ENTITY_REQUIREMENTS[cleanPageId]) {
      return res.status(400).json({
        ok: false,
        status: 'ERROR',
        errorCode: 'INVALID_PAGE_ID',
        message: `不支持的页面数据标识: ${cleanPageId || '(empty)'}`,
      });
    }

    const { config } = getEffectiveServerDbConfig();
    const result = await fetchPageDataFromSupabase({
      config,
      pageId: cleanPageId,
      tenantId: typeof tenantId === 'string' ? tenantId.trim() : undefined,
      roleCode: typeof roleCode === 'string' ? roleCode.trim() : undefined,
      allowedShopIds: Array.isArray(allowedShopIds)
        ? allowedShopIds.filter((s): s is string => typeof s === 'string')
        : undefined,
    });

    return res.status(200).json({
      ...result,
      latencyMs: Date.now() - startTime,
    });
  });

  app.post('/api/erp/query', async (req, res) => {
    const startTime = Date.now();
    const {
      entityType = '',
      tenantId = '',
      roleCode = 'TENANT_ADMIN',
      allowedShopIds = [],
      page = 1,
      pageSize = 20,
      search = '',
      filters = {},
    } = req.body || {};

    const cleanEntity = typeof entityType === 'string' ? (entityType.trim() as ErpEntityType) : ('' as ErpEntityType);
    if (!ALLOWED_QUERY_ENTITIES.has(cleanEntity)) {
      return res.status(400).json({
        ok: false,
        errorCode: 'INVALID_QUERY_ENTITY',
        message: `不允许分页查询的数据域: ${String(entityType)}`,
      });
    }

    const { config } = getEffectiveServerDbConfig();
    const cleanTenantId = typeof tenantId === 'string' ? tenantId.trim() : undefined;
    const sliceRes = await fetchEntitySliceFromSupabase(config, cleanEntity, cleanTenantId);
    if (sliceRes.status !== 'LOADED') {
      return res.status(200).json({
        ok: false,
        entityType: cleanEntity,
        page: 1,
        pageSize: Number(pageSize) || 20,
        totalItems: 0,
        totalPages: 1,
        items: [],
        message: sliceRes.message,
        latencyMs: Date.now() - startTime,
      });
    }

    let exchangeRates: ExchangeRateItem[] | undefined;
    if (cleanEntity === 'orders') {
      const fxRes = await fetchEntitySliceFromSupabase(config, 'exchangeRates', cleanTenantId);
      if (fxRes.status === 'LOADED') {
        exchangeRates = fxRes.records as ExchangeRateItem[];
      }
    }

    const paged = executePagedEntityQuery(sliceRes.records, {
      entityType: cleanEntity,
      tenantId: cleanTenantId,
      roleCode: typeof roleCode === 'string' ? roleCode.trim() : undefined,
      allowedShopIds: Array.isArray(allowedShopIds)
        ? allowedShopIds.filter((s): s is string => typeof s === 'string')
        : undefined,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
      search: typeof search === 'string' ? search : '',
      filters: filters && typeof filters === 'object' ? filters : {},
      exchangeRates,
    });

    return res.status(200).json({
      ok: true,
      ...paged,
      latencyMs: Date.now() - startTime,
    });
  });

  app.post('/api/erp/cache/invalidate', (req, res) => {
    const { entityTypes, tenantId } = req.body || {};
    const validTypes = Array.isArray(entityTypes)
      ? entityTypes.filter((t): t is ErpEntityType => typeof t === 'string')
      : undefined;
    invalidateBackendEntityCache(
      validTypes,
      typeof tenantId === 'string' && tenantId.trim() ? tenantId.trim() : undefined
    );
    return res.status(200).json({ ok: true });
  });

  // Vite middleware for development or static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    bootstrapLingxingSchedulerFromEnv();
    console.log(`X Cloud ERP Server running on http://0.0.0.0:${PORT}`);
  });
}

function validateSafeExternalMcpUrl(rawUrl: string): { valid: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, reason: '领星 MCP URL 格式无效，请输入完整的 https:// 地址' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: '安全限制：领星 MCP 上游地址仅允许使用 https:// 协议' };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80:')
  ) {
    return { valid: false, reason: '安全限制：禁止向本地回环地址、内网地址或云元数据地址发起代理请求' };
  }

  const match172 = /^172\.(\d+)\./.exec(host);
  if (match172) {
    const secondOctet = Number(match172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return { valid: false, reason: '安全限制：禁止向私有网段 (172.16.0.0/12) 发起代理请求' };
    }
  }

  return { valid: true };
}

function parseMcpResponseBody(rawText: string, contentType: string): unknown {
  const trimmed = rawText.trim();
  if (!trimmed) return {};

  const looksLikeSse =
    contentType.toLowerCase().includes('text/event-stream') ||
    /(?:^|\n)data:\s*/.test(trimmed);

  if (looksLikeSse) {
    const events: unknown[] = [];
    const lines = trimmed.split(/\r?\n/);
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        events.push(JSON.parse(payload));
      } catch {
        events.push(payload);
      }
    }
    if (events.length > 0) {
      // Prefer the last JSON-RPC object carrying result or error
      for (let i = events.length - 1; i >= 0; i--) {
        const ev = events[i];
        if (ev && typeof ev === 'object' && ('result' in ev || 'error' in ev)) {
          return ev;
        }
      }
      return events[events.length - 1];
    }
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

startServer();
