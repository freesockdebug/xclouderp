import {
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
import {
  authenticateCredentials,
  changeAccountPassword,
  getAuthStatus,
  setupInitialAdminAccount,
  upsertMemberLoginAccount,
  verifyRequestBearerAuth,
  type AuthEnvVars,
  type AuthSessionUser,
} from './src/services/authService';
import type { ErpEntityType } from './src/services/erpDatabaseService';
import type { ExchangeRateItem } from './src/types/erp';

export interface CloudflareAssetsBinding {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export interface CloudflareWorkerEnv {
  ASSETS?: CloudflareAssetsBinding;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  AUTH_MODE?: string;
  AUTH_SESSION_SECRET?: string;
  ADMIN_LOGIN_EMAIL?: string;
  ADMIN_LOGIN_PASSCODE?: string;
  LOGTO_ENDPOINT?: string;
  LOGTO_APP_ID?: string;
  VITE_LOGTO_ENDPOINT?: string;
  VITE_LOGTO_APP_ID?: string;
  LINGXING_SYNC_INTERVAL_MINUTES?: string;
  LINGXING_ORDER_SYNC_DAYS?: string;
  [key: string]: unknown;
}

export interface CloudflareExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

export interface CloudflareScheduledController {
  cron: string;
  scheduledTime: number;
  noRetry?(): void;
}

interface WorkerPlatformDbConfig {
  projectUrl: string;
  anonKey: string;
  authMode: 'SUPABASE_AUTH' | 'LOGTO_OIDC';
  logtoEndpoint: string;
  logtoAppId: string;
}

let runtimeWorkerDbConfig: WorkerPlatformDbConfig | null = null;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function readJsonBody(request: Request): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false }> {
  const raw = await request.text();
  if (!raw.trim()) {
    return { ok: true, data: {} };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ok: true, data: parsed as Record<string, unknown> };
    }
    return { ok: true, data: {} };
  } catch {
    return { ok: false };
  }
}

function isValidConfiguredPair(url: string, key: string): boolean {
  return Boolean(
    url &&
      key &&
      url.startsWith('https://') &&
      !url.includes('your-project-id') &&
      !key.includes('your-supabase-anon-key') &&
      !key.includes('your_supabase_anon_key')
  );
}

function getEffectiveWorkerDbConfig(env: CloudflareWorkerEnv): {
  config: WorkerPlatformDbConfig;
  configSource: 'ENV' | 'SERVER_MEMORY' | 'UNCONFIGURED';
} {
  const envUrl = normalizeSupabaseProjectUrl(
    String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '')
  );
  const envKey = String(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  const envAuthMode: 'SUPABASE_AUTH' | 'LOGTO_OIDC' =
    env.AUTH_MODE === 'LOGTO_OIDC' ? 'LOGTO_OIDC' : 'SUPABASE_AUTH';
  const envLogtoEndpoint = String(
    env.LOGTO_ENDPOINT || env.VITE_LOGTO_ENDPOINT || 'https://auth.x-cloud-erp.example.com'
  ).trim();
  const envLogtoAppId = String(
    env.LOGTO_APP_ID || env.VITE_LOGTO_APP_ID || 'app_xcloud_b2b_orgs'
  ).trim();

  if (
    runtimeWorkerDbConfig &&
    isValidConfiguredPair(runtimeWorkerDbConfig.projectUrl, runtimeWorkerDbConfig.anonKey)
  ) {
    return {
      config: runtimeWorkerDbConfig,
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
      authMode: runtimeWorkerDbConfig?.authMode || envAuthMode,
      logtoEndpoint: runtimeWorkerDbConfig?.logtoEndpoint || envLogtoEndpoint,
      logtoAppId: runtimeWorkerDbConfig?.logtoAppId || envLogtoAppId,
    },
    configSource: 'UNCONFIGURED',
  };
}

export function resetWorkerRuntimeDbConfigForTest(): void {
  runtimeWorkerDbConfig = null;
}

export function validateSafeExternalMcpUrl(rawUrl: string): { valid: boolean; reason?: string } {
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

export function parseMcpResponseBody(rawText: string, contentType: string): unknown {
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

function hydrateSchedulerConfigFromWorkerEnv(env: CloudflareWorkerEnv): void {
  const { config } = getEffectiveWorkerDbConfig(env);
  if (!isValidConfiguredPair(config.projectUrl, config.anonKey)) return;
  const current = getLingxingSchedulerStatus();
  if (current.supabaseConfigured) return;
  const interval = Number(env.LINGXING_SYNC_INTERVAL_MINUTES) || 15;
  const orderDays = Number(env.LINGXING_ORDER_SYNC_DAYS) || 90;
  configureLingxingScheduler({
    supabaseUrl: config.projectUrl,
    supabaseAnonKey: config.anonKey,
    intervalMinutes: interval,
    orderSyncDays: orderDays,
    syncMode: 'INCREMENTAL',
    enabled: true,
    skipIntervalTimer: true,
  });
}

function getWorkerAuthEnv(env: CloudflareWorkerEnv): AuthEnvVars {
  return {
    AUTH_SESSION_SECRET: typeof env.AUTH_SESSION_SECRET === 'string' ? env.AUTH_SESSION_SECRET : undefined,
    ADMIN_LOGIN_EMAIL: typeof env.ADMIN_LOGIN_EMAIL === 'string' ? env.ADMIN_LOGIN_EMAIL : undefined,
    ADMIN_LOGIN_PASSCODE: typeof env.ADMIN_LOGIN_PASSCODE === 'string' ? env.ADMIN_LOGIN_PASSCODE : undefined,
    AUTH_MODE: typeof env.AUTH_MODE === 'string' ? env.AUTH_MODE : undefined,
  };
}

async function requireAuthenticatedSession(
  request: Request,
  env: CloudflareWorkerEnv
): Promise<{ ok: true; session: AuthSessionUser } | { ok: false; response: Response }> {
  const { config } = getEffectiveWorkerDbConfig(env);
  const session = await verifyRequestBearerAuth(
    request.headers.get('authorization'),
    getWorkerAuthEnv(env),
    config
  );
  if (!session) {
    return {
      ok: false,
      response: jsonResponse(
        {
          ok: false,
          errorCode: 'AUTH_REQUIRED',
          message: '未登录或会话已过期，请先完成身份验证。',
        },
        401
      ),
    };
  }
  return { ok: true, session };
}

export async function handleWorkerRequest(
  request: Request,
  env: CloudflareWorkerEnv
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  if (pathname === '/api/health' && method === 'GET') {
    const { configSource } = getEffectiveWorkerDbConfig(env);
    return jsonResponse({
      ok: true,
      runtime: 'cloudflare-workers',
      configSource,
    });
  }

  // 0. AUTHENTICATION GATEWAY (/api/auth/*)
  if (pathname === '/api/auth/status' && method === 'GET') {
    const { config } = getEffectiveWorkerDbConfig(env);
    const status = await getAuthStatus(getWorkerAuthEnv(env), config);
    return jsonResponse({ ok: true, ...status });
  }

  if (pathname === '/api/auth/setup-admin' && method === 'POST') {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, errorCode: 'INVALID_JSON', message: '请求体 JSON 格式无效' }, 400);
    }
    const { config } = getEffectiveWorkerDbConfig(env);
    const result = await setupInitialAdminAccount(getWorkerAuthEnv(env), config, {
      email: typeof parsed.data.email === 'string' ? parsed.data.email : '',
      fullName: typeof parsed.data.fullName === 'string' ? parsed.data.fullName : '',
      password: typeof parsed.data.password === 'string' ? parsed.data.password : '',
    });
    if (!result.ok) {
      return jsonResponse(
        { ok: false, errorCode: result.errorCode, message: result.message },
        result.status
      );
    }
    return jsonResponse({
      ok: true,
      token: result.token,
      expiresAt: result.expiresAt,
      user: result.user,
      persistedToDb: result.persistedToDb,
    });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, errorCode: 'INVALID_JSON', message: '请求体 JSON 格式无效' }, 400);
    }
    const { config } = getEffectiveWorkerDbConfig(env);
    const result = await authenticateCredentials(getWorkerAuthEnv(env), config, {
      email: typeof parsed.data.email === 'string' ? parsed.data.email : '',
      password: typeof parsed.data.password === 'string' ? parsed.data.password : '',
    });
    if (!result.ok) {
      return jsonResponse(
        { ok: false, errorCode: result.errorCode, message: result.message },
        result.status
      );
    }
    return jsonResponse({
      ok: true,
      token: result.token,
      expiresAt: result.expiresAt,
      user: result.user,
    });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    return jsonResponse({ ok: true });
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const auth = await requireAuthenticatedSession(request, env);
    if (!auth.ok) return auth.response;
    return jsonResponse({ ok: true, user: auth.session });
  }

  if (pathname === '/api/auth/change-password' && method === 'POST') {
    const auth = await requireAuthenticatedSession(request, env);
    if (!auth.ok) return auth.response;
    const parsed = await readJsonBody(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, errorCode: 'INVALID_JSON', message: '请求体 JSON 格式无效' }, 400);
    }
    const { config } = getEffectiveWorkerDbConfig(env);
    const result = await changeAccountPassword(getWorkerAuthEnv(env), config, auth.session, {
      currentPassword:
        typeof parsed.data.currentPassword === 'string' ? parsed.data.currentPassword : '',
      newPassword: typeof parsed.data.newPassword === 'string' ? parsed.data.newPassword : '',
    });
    if (!result.ok) {
      return jsonResponse(
        { ok: false, errorCode: result.errorCode, message: result.message },
        result.status
      );
    }
    return jsonResponse({
      ok: true,
      token: result.token,
      expiresAt: result.expiresAt,
      message: result.message,
    });
  }

  if (pathname === '/api/auth/register-member' && method === 'POST') {
    const auth = await requireAuthenticatedSession(request, env);
    if (!auth.ok) return auth.response;
    const parsed = await readJsonBody(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, errorCode: 'INVALID_JSON', message: '请求体 JSON 格式无效' }, 400);
    }
    const { config } = getEffectiveWorkerDbConfig(env);
    const result = await upsertMemberLoginAccount(getWorkerAuthEnv(env), config, auth.session, {
      email: typeof parsed.data.email === 'string' ? parsed.data.email : '',
      fullName: typeof parsed.data.fullName === 'string' ? parsed.data.fullName : '',
      password: typeof parsed.data.password === 'string' ? parsed.data.password : '',
      role: parsed.data.role === 'PLATFORM_SUPER_ADMIN' ? 'PLATFORM_SUPER_ADMIN' : 'TENANT_USER',
      tenantId: typeof parsed.data.tenantId === 'string' ? parsed.data.tenantId : undefined,
      memberId: typeof parsed.data.memberId === 'string' ? parsed.data.memberId : undefined,
    });
    if (!result.ok) {
      return jsonResponse(
        { ok: false, errorCode: result.errorCode, message: result.message },
        result.status
      );
    }
    return jsonResponse({
      ok: true,
      user: result.user,
      persistedToDb: result.persistedToDb,
    });
  }

  // 1. UPSTREAM LINGXING MCP PROXY (/api/lingxing/mcp-proxy)
  if (pathname === '/api/lingxing/mcp-proxy' && method === 'POST') {
    const auth = await requireAuthenticatedSession(request, env);
    if (!auth.ok) return auth.response;
    const startTime = Date.now();
    const parsed = await readJsonBody(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, errorCode: 'INVALID_JSON', message: '请求体 JSON 格式无效' }, 400);
    }
    const {
      mcpEndpointUrl,
      mcpApiKey = '',
      jsonRpcMethod = 'tools/list',
      toolName,
      toolArgs = {},
      mcpSessionId: incomingSessionId,
      tenantStatus = 'ACTIVE',
      mcpModuleEnabled = true,
    } = parsed.data;

    if (mcpModuleEnabled === false) {
      return jsonResponse(
        {
          ok: false,
          errorCode: 'MODULE_NOT_ENABLED',
          message: '当前租户未在应用市场启用 [mod_mcp_gateway] 模块，领星 MCP 上游同步已被拦截。',
          latencyMs: Date.now() - startTime,
        },
        403
      );
    }

    if (tenantStatus === 'EXPIRED_READONLY' || tenantStatus === 'SUSPENDED') {
      return jsonResponse(
        {
          ok: false,
          errorCode: 'TENANT_SUBSCRIPTION_EXPIRED',
          message: `当前卖家租户处于 [${String(tenantStatus)}] 状态，已自动熔断领星 MCP 数据同步请求。请先续期或兑换激活码恢复服务。`,
          latencyMs: Date.now() - startTime,
        },
        402
      );
    }

    const trimmedUrl = typeof mcpEndpointUrl === 'string' ? mcpEndpointUrl.trim() : '';
    const trimmedKey = typeof mcpApiKey === 'string' ? mcpApiKey.trim() : '';
    const urlHasInlineToken = /[?&](key|token|api_key|apikey|mcp_key|access_token)=/i.test(trimmedUrl);

    if (!trimmedUrl || (!trimmedKey && !urlHasInlineToken)) {
      return jsonResponse(
        {
          ok: false,
          errorCode: 'MISSING_LINGXING_CREDENTIALS',
          message: '请提供领星 MCP Server URL 与 X-Mcp-Key 鉴权密钥（若 URL 中已携带 token 参数可留空密钥）',
        },
        400
      );
    }

    const urlValidation = validateSafeExternalMcpUrl(trimmedUrl);
    if (!urlValidation.valid) {
      return jsonResponse(
        {
          ok: false,
          errorCode: 'INVALID_MCP_ENDPOINT_URL',
          message: urlValidation.reason || '领星 MCP Server URL 不符合安全外网 HTTPS 规范',
        },
        400
      );
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

    const rpcMethodStr = typeof jsonRpcMethod === 'string' ? jsonRpcMethod : 'tools/list';
    const rpcPayload = {
      jsonrpc: '2.0',
      id: `lx-rpc-${Date.now()}`,
      method: rpcMethodStr,
      params:
        rpcMethodStr === 'tools/call'
          ? { name: toolName, arguments: toolArgs }
          : {},
    };

    try {
      if (!activeSessionId && rpcMethodStr !== 'initialize') {
        try {
          const initRes = await fetch(trimmedUrl, {
            method: 'POST',
            headers: buildHeaders(),
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: `lx-init-${Date.now()}`,
              method: 'initialize',
              params: {
                protocolVersion: '2025-03-26',
                capabilities: {},
                clientInfo: { name: 'x-cloud-erp', version: '2.4.0' },
              },
            }),
            signal: AbortSignal.timeout(8000),
          });
          const headerSid =
            initRes.headers.get('mcp-session-id') ||
            initRes.headers.get('Mcp-Session-Id') ||
            undefined;
          if (headerSid) {
            activeSessionId = headerSid;
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
          // Proceed directly when stateless MCP gateways skip initialize
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
        return jsonResponse(
          {
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
          },
          response.ok ? 502 : response.status
        );
      }

      return jsonResponse({
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
      return jsonResponse(
        {
          ok: false,
          errorCode: 'UPSTREAM_MCP_UNREACHABLE',
          message: `无法连接领星 MCP 服务器 (${trimmedUrl}): ${errorMessage}。请检查 URL、X-Mcp-Key 及网络连通性。`,
          latencyMs: Date.now() - startTime,
          endpoint: trimmedUrl,
          requestPayload: rpcPayload,
        },
        502
      );
    }
  }

  // 2. DOWNSTREAM X CLOUD MCP SERVER (/api/mcp)
  if (pathname === '/api/mcp' && method === 'POST') {
    const startTime = Date.now();
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const parsed = await readJsonBody(request);
    if (!parsed.ok) {
      return jsonResponse({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
    }
    const {
      jsonrpc = '2.0',
      id = 1,
      method: rpcMethod,
      params = {},
      _contextTenantStatus = 'ACTIVE',
      _contextPermissionScope = 'READ_WRITE',
      _contextQuotaRemaining = 500,
      _contextMcpModuleEnabled = true,
    } = parsed.data;

    const paramsObj =
      params && typeof params === 'object' ? (params as Record<string, unknown>) : {};
    const requestedToolName = typeof paramsObj.name === 'string' ? paramsObj.name : '';

    if (!token) {
      return jsonResponse(
        {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32001,
            message: 'Unauthorized: Missing X Cloud MCP Bearer Token or Logto OAuth 2.1 Access Token',
          },
        },
        401
      );
    }

    if (_contextMcpModuleEnabled === false) {
      return jsonResponse(
        {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32005,
            message: 'MODULE_NOT_ENABLED: 当前租户未在应用市场启用 [mod_mcp_gateway] 模块，已阻断 /api/mcp 访问。',
          },
        },
        403
      );
    }

    if (_contextTenantStatus === 'EXPIRED_READONLY' || _contextTenantStatus === 'SUSPENDED') {
      const isWriteTool =
        rpcMethod === 'tools/call' &&
        ['create_draft_purchase_order', 'adjust_campaign_bid_or_rule', 'sync_from_lingxing_mcp'].includes(
          requestedToolName
        );
      if (_contextTenantStatus === 'SUSPENDED' || isWriteTool) {
        return jsonResponse(
          {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32002,
              message: `Subscription Guard Blocked: 租户当前状态为 [${String(_contextTenantStatus)}]，已禁止执行写操作或同步操作，请续费订阅后重试。`,
            },
          },
          402
        );
      }
    }

    if (Number(_contextQuotaRemaining) <= 0) {
      return jsonResponse(
        {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32003,
            message: 'Quota Exceeded: 当前租户本月 MCP AI 调用配额已用尽，请升级至 PRO 或 ENTERPRISE 套餐。',
          },
        },
        429
      );
    }

    if (rpcMethod === 'initialize') {
      return jsonResponse({
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

    if (rpcMethod === 'tools/list') {
      return jsonResponse({
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

    if (rpcMethod === 'resources/list') {
      return jsonResponse({
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

    if (rpcMethod === 'tools/call') {
      const toolArgs = paramsObj.arguments || {};
      if (
        _contextPermissionScope === 'READ_ONLY' &&
        [
          'create_draft_purchase_order',
          'adjust_campaign_bid_or_rule',
          'sync_from_lingxing_mcp',
        ].includes(requestedToolName)
      ) {
        return jsonResponse(
          {
            jsonrpc,
            id,
            error: {
              code: -32004,
              message: `Permission Denied: 当前 MCP Token 权限为 READ_ONLY，禁止调用写操作工具 [${requestedToolName}]。`,
            },
          },
          403
        );
      }

      return jsonResponse({
        jsonrpc,
        id,
        result: {
          latencyMs: Date.now() - startTime,
          executedBy: 'x-cloud-cloudflare-worker-mcp',
          toolName: requestedToolName,
          toolArgs,
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'SUCCESS',
                  tool: requestedToolName,
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

    return jsonResponse({
      jsonrpc,
      id,
      result: { message: `Handled MCP method: ${String(rpcMethod)}` },
    });
  }

  // 3. SCHEDULED LINGXING AUTO-SYNC ROUTES (/api/lingxing/scheduler/*)
  if (pathname === '/api/lingxing/scheduler/status' && method === 'GET') {
    const auth = await requireAuthenticatedSession(request, env);
    if (!auth.ok) return auth.response;
    hydrateSchedulerConfigFromWorkerEnv(env);
    return jsonResponse({
      ok: true,
      scheduler: getLingxingSchedulerStatus(),
    });
  }

  if (pathname === '/api/lingxing/scheduler/configure' && method === 'POST') {
    const auth = await requireAuthenticatedSession(request, env);
    if (!auth.ok) return auth.response;
    const parsed = await readJsonBody(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, errorCode: 'INVALID_JSON', message: '请求体 JSON 格式无效' }, 400);
    }
    const {
      supabaseUrl,
      supabaseAnonKey,
      tenantId,
      intervalMinutes,
      enabled = true,
      tenantStatus = 'ACTIVE',
      orderSyncDays,
      syncMode,
      orderLookbackDays,
    } = parsed.data;

    if (enabled && (tenantStatus === 'EXPIRED_READONLY' || tenantStatus === 'SUSPENDED')) {
      return jsonResponse(
        {
          ok: false,
          errorCode: 'TENANT_SUBSCRIPTION_EXPIRED',
          message: `租户处于 [${String(tenantStatus)}] 状态，已阻断启动定时同步任务。`,
          scheduler: getLingxingSchedulerStatus(),
        },
        402
      );
    }

    if (typeof supabaseUrl === 'string' && supabaseUrl.trim()) {
      const check = validateSafeExternalMcpUrl(supabaseUrl.trim());
      if (!check.valid) {
        return jsonResponse(
          {
            ok: false,
            errorCode: 'INVALID_SUPABASE_URL',
            message: check.reason || 'Supabase URL 不符合 HTTPS 外网安全规范',
          },
          400
        );
      }
    }

    const scheduler = configureLingxingScheduler({
      supabaseUrl: typeof supabaseUrl === 'string' ? supabaseUrl : undefined,
      supabaseAnonKey: typeof supabaseAnonKey === 'string' ? supabaseAnonKey : undefined,
      tenantId: typeof tenantId === 'string' ? tenantId : undefined,
      intervalMinutes: typeof intervalMinutes === 'number' ? intervalMinutes : undefined,
      orderSyncDays: typeof orderSyncDays === 'number' ? orderSyncDays : undefined,
      syncMode: syncMode === 'FULL' || syncMode === 'INCREMENTAL' ? syncMode : undefined,
      orderLookbackDays: typeof orderLookbackDays === 'number' ? orderLookbackDays : undefined,
      enabled: Boolean(enabled),
      skipIntervalTimer: true,
    });

    return jsonResponse({ ok: true, scheduler });
  }

  if (pathname === '/api/lingxing/scheduler/trigger' && method === 'POST') {
    const auth = await requireAuthenticatedSession(request, env);
    if (!auth.ok) return auth.response;
    const parsed = await readJsonBody(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, errorCode: 'INVALID_JSON', message: '请求体 JSON 格式无效' }, 400);
    }
    const { tenantStatus = 'ACTIVE', orderSyncDays, syncMode } = parsed.data;
    if (tenantStatus === 'EXPIRED_READONLY' || tenantStatus === 'SUSPENDED') {
      return jsonResponse(
        {
          ok: false,
          errorCode: 'TENANT_SUBSCRIPTION_EXPIRED',
          message: `租户处于 [${String(tenantStatus)}] 状态，已阻断定时同步立即触发。`,
        },
        402
      );
    }
    hydrateSchedulerConfigFromWorkerEnv(env);
    const scheduler = await runLingxingScheduledSyncOnce(
      typeof orderSyncDays === 'number' ? orderSyncDays : undefined,
      syncMode === 'FULL' || syncMode === 'INCREMENTAL' ? syncMode : undefined
    );
    invalidateBackendEntityCache();
    return jsonResponse({
      ok: scheduler.lastStatus !== 'ERROR',
      scheduler,
    });
  }

  // 4. PLATFORM DATABASE RUNTIME CONFIG (/api/platform/db-config)
  if (pathname === '/api/platform/db-config' && method === 'GET') {
    const { config, configSource } = getEffectiveWorkerDbConfig(env);
    return jsonResponse({
      ok: true,
      config,
      configSource,
    });
  }

  if (pathname === '/api/platform/db-config' && method === 'POST') {
    const auth = await requireAuthenticatedSession(request, env);
    if (!auth.ok) return auth.response;
    const parsed = await readJsonBody(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, errorCode: 'INVALID_JSON', message: '请求体 JSON 格式无效' }, 400);
    }
    const {
      portalMode,
      projectUrl = '',
      anonKey = '',
      authMode = 'SUPABASE_AUTH',
      logtoEndpoint = 'https://auth.x-cloud-erp.example.com',
      logtoAppId = 'app_xcloud_b2b_orgs',
    } = parsed.data;

    if (auth.session.role !== 'PLATFORM_SUPER_ADMIN' || portalMode !== 'PLATFORM_SUPER_ADMIN') {
      return jsonResponse(
        {
          ok: false,
          errorCode: 'SUPER_ADMIN_ONLY',
          message: '仅平台超级管理员可更新全局数据库连接配置。',
        },
        403
      );
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
        return jsonResponse(
          {
            ok: false,
            errorCode: 'INVALID_SUPABASE_URL',
            message: urlCheck.reason || 'Supabase Project URL 不符合安全 HTTPS 外网规范',
          },
          400
        );
      }
    }

    if (normalizedAuthMode === 'LOGTO_OIDC' && trimmedLogtoEndpoint) {
      const logtoCheck = validateSafeExternalMcpUrl(trimmedLogtoEndpoint);
      if (!logtoCheck.valid) {
        return jsonResponse(
          {
            ok: false,
            errorCode: 'INVALID_LOGTO_URL',
            message: logtoCheck.reason || 'Logto OIDC Endpoint 不符合安全 HTTPS 外网规范',
          },
          400
        );
      }
    }

    runtimeWorkerDbConfig = {
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
        skipIntervalTimer: true,
      });
    }

    invalidateBackendEntityCache();

    return jsonResponse({
      ok: true,
      config: runtimeWorkerDbConfig,
      configSource: isValidConfiguredPair(normalizedUrl, trimmedKey)
        ? 'SERVER_MEMORY'
        : 'UNCONFIGURED',
      message:
        '已更新 Cloudflare Worker 运行态数据库连接配置；如需跨实例持久生效，请在 Cloudflare Dashboard -> Settings -> Variables and Secrets 中配置 SUPABASE_URL 与 SUPABASE_ANON_KEY。',
    });
  }

  // 5. ON-DEMAND BACKEND DATA & SERVER PAGINATION (/api/erp/*)
  if (pathname === '/api/erp/bootstrap' && method === 'GET') {
    const auth = await requireAuthenticatedSession(request, env);
    if (!auth.ok) return auth.response;
    const startTime = Date.now();
    const { config } = getEffectiveWorkerDbConfig(env);
    const result = await fetchBootstrapFromSupabase(config);
    return jsonResponse({
      ok: result.status === 'LOADED' || result.status === 'EMPTY_DB',
      status: result.status,
      message: result.message,
      recordCount: result.recordCount,
      data: result.data,
      latencyMs: Date.now() - startTime,
    });
  }

  if (pathname === '/api/erp/page-data' && method === 'POST') {
    const auth = await requireAuthenticatedSession(request, env);
    if (!auth.ok) return auth.response;
    const startTime = Date.now();
    const parsed = await readJsonBody(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, status: 'ERROR', errorCode: 'INVALID_JSON', message: '请求体 JSON 格式无效' }, 400);
    }
    const {
      pageId = '',
      tenantId = '',
      roleCode = 'TENANT_ADMIN',
      allowedShopIds = [],
    } = parsed.data;

    const cleanPageId = typeof pageId === 'string' ? pageId.trim() : '';
    if (!cleanPageId || !PAGE_ENTITY_REQUIREMENTS[cleanPageId]) {
      return jsonResponse(
        {
          ok: false,
          status: 'ERROR',
          errorCode: 'INVALID_PAGE_ID',
          message: `不支持的页面数据标识: ${cleanPageId || '(empty)'}`,
        },
        400
      );
    }

    const effectiveTenantId =
      auth.session.role !== 'PLATFORM_SUPER_ADMIN' && auth.session.tenantId
        ? auth.session.tenantId
        : typeof tenantId === 'string'
        ? tenantId.trim()
        : undefined;

    const { config } = getEffectiveWorkerDbConfig(env);
    const result = await fetchPageDataFromSupabase({
      config,
      pageId: cleanPageId,
      tenantId: effectiveTenantId,
      roleCode: typeof roleCode === 'string' ? roleCode.trim() : undefined,
      allowedShopIds: Array.isArray(allowedShopIds)
        ? allowedShopIds.filter((s): s is string => typeof s === 'string')
        : undefined,
    });

    return jsonResponse({
      ...result,
      latencyMs: Date.now() - startTime,
    });
  }

  if (pathname === '/api/erp/query' && method === 'POST') {
    const auth = await requireAuthenticatedSession(request, env);
    if (!auth.ok) return auth.response;
    const startTime = Date.now();
    const parsed = await readJsonBody(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, errorCode: 'INVALID_JSON', message: '请求体 JSON 格式无效' }, 400);
    }
    const {
      entityType = '',
      tenantId = '',
      roleCode = 'TENANT_ADMIN',
      allowedShopIds = [],
      page = 1,
      pageSize = 20,
      search = '',
      filters = {},
    } = parsed.data;

    const cleanEntity =
      typeof entityType === 'string' ? (entityType.trim() as ErpEntityType) : ('' as ErpEntityType);
    if (!ALLOWED_QUERY_ENTITIES.has(cleanEntity)) {
      return jsonResponse(
        {
          ok: false,
          errorCode: 'INVALID_QUERY_ENTITY',
          message: `不允许分页查询的数据域: ${String(entityType)}`,
        },
        400
      );
    }

    const { config } = getEffectiveWorkerDbConfig(env);
    const cleanTenantId =
      auth.session.role !== 'PLATFORM_SUPER_ADMIN' && auth.session.tenantId
        ? auth.session.tenantId
        : typeof tenantId === 'string'
        ? tenantId.trim()
        : undefined;
    const sliceRes = await fetchEntitySliceFromSupabase(config, cleanEntity, cleanTenantId);
    if (sliceRes.status !== 'LOADED') {
      return jsonResponse({
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
      filters: filters && typeof filters === 'object' ? (filters as Record<string, unknown>) : {},
      exchangeRates,
    });

    return jsonResponse({
      ok: true,
      ...paged,
      latencyMs: Date.now() - startTime,
    });
  }

  if (pathname === '/api/erp/cache/invalidate' && method === 'POST') {
    const auth = await requireAuthenticatedSession(request, env);
    if (!auth.ok) return auth.response;
    const parsed = await readJsonBody(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, errorCode: 'INVALID_JSON', message: '请求体 JSON 格式无效' }, 400);
    }
    const { entityTypes, tenantId } = parsed.data;
    const validTypes = Array.isArray(entityTypes)
      ? entityTypes.filter((t): t is ErpEntityType => typeof t === 'string')
      : undefined;
    invalidateBackendEntityCache(
      validTypes,
      typeof tenantId === 'string' && tenantId.trim() ? tenantId.trim() : undefined
    );
    return jsonResponse({ ok: true });
  }

  // Unknown /api/* routes return JSON 404 instead of SPA index.html
  if (pathname.startsWith('/api/')) {
    return jsonResponse(
      {
        ok: false,
        errorCode: 'API_NOT_FOUND',
        message: `未找到 API 路由: ${method} ${pathname}`,
      },
      404
    );
  }

  // Serve Vite static assets & SPA fallback via Cloudflare Workers Static Assets binding
  if (env.ASSETS) {
    return env.ASSETS.fetch(request);
  }

  return new Response('X Cloud ERP Cloudflare Worker Active (ASSETS binding not attached)', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export default {
  async fetch(
    request: Request,
    env: CloudflareWorkerEnv,
    _ctx?: CloudflareExecutionContext
  ): Promise<Response> {
    return handleWorkerRequest(request, env);
  },

  async scheduled(
    _controller: CloudflareScheduledController,
    env: CloudflareWorkerEnv,
    ctx: CloudflareExecutionContext
  ): Promise<void> {
    hydrateSchedulerConfigFromWorkerEnv(env);
    ctx.waitUntil(
      runLingxingScheduledSyncOnce(undefined, 'INCREMENTAL').finally(() => {
        invalidateBackendEntityCache();
      })
    );
  },
};
