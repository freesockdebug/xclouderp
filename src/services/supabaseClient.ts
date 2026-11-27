import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getAuthHeaders, notifyUnauthorized } from './authClient';

export type SupabaseConfigSource = 'ENV' | 'SERVER_MEMORY' | 'CLIENT_MEMORY' | 'UNCONFIGURED';

export interface SupabaseConnectionConfig {
  projectUrl: string;
  anonKey: string;
  serviceRoleKey?: string;
  authMode: 'SUPABASE_AUTH' | 'LOGTO_OIDC';
  logtoEndpoint?: string;
  logtoAppId?: string;
  configSource?: SupabaseConfigSource;
}

const LEGACY_STORAGE_KEY = 'xcloud_erp_supabase_config_v1';

// Pure JS/React runtime memory store — browser localStorage persistence for DB config is strictly disabled.
let runtimeSupabaseConfig: SupabaseConnectionConfig | null = null;

// Persist singleton clients on globalThis to prevent duplicate GoTrueClient instances
// across repeated probes, saves, or Vite reloads in the same browser context.
const globalClientStore = globalThis as typeof globalThis & {
  __xcloudSupabaseClientPool?: Map<string, SupabaseClient>;
};

function getClientPool(): Map<string, SupabaseClient> {
  if (!globalClientStore.__xcloudSupabaseClientPool) {
    globalClientStore.__xcloudSupabaseClientPool = new Map<string, SupabaseClient>();
  }
  return globalClientStore.__xcloudSupabaseClientPool;
}

/**
 * Purges any legacy browser localStorage database config left over from earlier versions.
 */
export function clearLegacyBrowserSupabaseConfig(): void {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      globalThis.localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  } catch {
    // ignore storage access errors in restricted iframes / SSR
  }
}

/**
 * Normalizes a Supabase Project URL:
 * - Converts Supabase Dashboard URLs (https://supabase.com/dashboard/project/<ref>) -> https://<ref>.supabase.co
 * - Strips accidental API suffixes (/rest/v1, /auth/v1, /storage/v1) and trailing slashes
 */
export function normalizeSupabaseProjectUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';

  const dashboardMatch = /^https?:\/\/(?:app\.)?supabase\.com\/dashboard\/project\/([a-z0-9-]+)(?:\/.*)?$/i.exec(
    trimmed
  );
  if (dashboardMatch) {
    return `https://${dashboardMatch[1].toLowerCase()}.supabase.co`;
  }

  return trimmed
    .replace(/\/+(rest|auth|storage|realtime|functions)\/v\d+\/?$/i, '')
    .replace(/\/+$/, '');
}

export function isSupabaseConfigured(config?: SupabaseConnectionConfig): boolean {
  const cfg = config || loadSupabaseConfig();
  const url = normalizeSupabaseProjectUrl(cfg.projectUrl);
  const key = (cfg.anonKey || '').trim();
  return Boolean(
    url &&
      key &&
      url.startsWith('http') &&
      !url.includes('your-project-id') &&
      !key.includes('your_supabase_anon_key')
  );
}

function readBuildEnvSupabaseConfig(): SupabaseConnectionConfig {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
  const url = normalizeSupabaseProjectUrl(env.VITE_SUPABASE_URL || '');
  const key = (env.VITE_SUPABASE_ANON_KEY || '').trim();
  const configured = Boolean(
    url &&
      key &&
      url.startsWith('http') &&
      !url.includes('your-project-id') &&
      !key.includes('your_supabase_anon_key')
  );
  return {
    projectUrl: configured ? url : '',
    anonKey: configured ? key : '',
    serviceRoleKey: '',
    authMode: 'SUPABASE_AUTH',
    logtoEndpoint: env.VITE_LOGTO_ENDPOINT || 'https://auth.x-cloud-erp.example.com',
    logtoAppId: env.VITE_LOGTO_APP_ID || 'app_xcloud_b2b_orgs',
    configSource: configured ? 'ENV' : 'UNCONFIGURED',
  };
}

/**
 * Loads the active runtime Supabase configuration from in-memory runtime state or build env.
 * Browser localStorage is intentionally disabled and any legacy key is automatically purged.
 */
export function loadSupabaseConfig(): SupabaseConnectionConfig {
  clearLegacyBrowserSupabaseConfig();
  if (runtimeSupabaseConfig) {
    return runtimeSupabaseConfig;
  }
  return readBuildEnvSupabaseConfig();
}

/**
 * Updates the in-memory runtime Supabase configuration without writing to browser localStorage.
 */
export function saveSupabaseConfig(config: SupabaseConnectionConfig): SupabaseConnectionConfig {
  clearLegacyBrowserSupabaseConfig();
  const normalized: SupabaseConnectionConfig = {
    projectUrl: normalizeSupabaseProjectUrl(config.projectUrl),
    anonKey: (config.anonKey || '').trim(),
    serviceRoleKey: '',
    authMode: config.authMode === 'LOGTO_OIDC' ? 'LOGTO_OIDC' : 'SUPABASE_AUTH',
    logtoEndpoint: (config.logtoEndpoint || 'https://auth.x-cloud-erp.example.com').trim(),
    logtoAppId: (config.logtoAppId || 'app_xcloud_b2b_orgs').trim(),
    configSource: config.configSource || 'CLIENT_MEMORY',
  };
  runtimeSupabaseConfig = normalized;
  return normalized;
}

/**
 * Fetches server-managed Supabase configuration (process.env first, then server runtime memory)
 * so the SPA works across browsers/devices without browser localStorage persistence.
 */
export async function fetchServerSupabaseConfig(): Promise<SupabaseConnectionConfig> {
  clearLegacyBrowserSupabaseConfig();
  const fallback = loadSupabaseConfig();
  if (typeof fetch !== 'function') return fallback;
  try {
    const res = await fetch('/api/platform/db-config', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      ok?: boolean;
      config?: Partial<SupabaseConnectionConfig>;
      configSource?: SupabaseConfigSource;
    };
    if (!data?.ok || !data.config) return fallback;
    const serverUrl = normalizeSupabaseProjectUrl(data.config.projectUrl || '');
    const serverKey = (data.config.anonKey || '').trim();
    if (serverUrl && serverKey) {
      return saveSupabaseConfig({
        projectUrl: serverUrl,
        anonKey: serverKey,
        authMode: data.config.authMode === 'LOGTO_OIDC' ? 'LOGTO_OIDC' : 'SUPABASE_AUTH',
        logtoEndpoint: data.config.logtoEndpoint || fallback.logtoEndpoint,
        logtoAppId: data.config.logtoAppId || fallback.logtoAppId,
        configSource: data.configSource || 'ENV',
      });
    }
    return {
      ...fallback,
      authMode: data.config.authMode === 'LOGTO_OIDC' ? 'LOGTO_OIDC' : fallback.authMode,
      logtoEndpoint: data.config.logtoEndpoint || fallback.logtoEndpoint,
      logtoAppId: data.config.logtoAppId || fallback.logtoAppId,
      configSource: fallback.projectUrl && fallback.anonKey ? fallback.configSource : 'UNCONFIGURED',
    };
  } catch {
    return fallback;
  }
}

/**
 * Sends platform DB configuration to Express server runtime memory (never browser localStorage, never plaintext disk files).
 */
export async function saveServerSupabaseConfig(
  config: SupabaseConnectionConfig
): Promise<{ ok: boolean; config: SupabaseConnectionConfig; message?: string }> {
  const normalized = saveSupabaseConfig({
    ...config,
    configSource: 'SERVER_MEMORY',
  });
  if (typeof fetch !== 'function') {
    return { ok: true, config: normalized };
  }
  try {
    const res = await fetch('/api/platform/db-config', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        portalMode: 'PLATFORM_SUPER_ADMIN',
        projectUrl: normalized.projectUrl,
        anonKey: normalized.anonKey,
        authMode: normalized.authMode,
        logtoEndpoint: normalized.logtoEndpoint,
        logtoAppId: normalized.logtoAppId,
      }),
    });
    if (res.status === 401) {
      notifyUnauthorized();
      return {
        ok: false,
        config: saveSupabaseConfig({ ...normalized, configSource: 'CLIENT_MEMORY' }),
        message: '登录会话已失效，请重新登录超级管理员账号后再保存配置。',
      };
    }
    const data = (await res.json()) as {
      ok?: boolean;
      config?: Partial<SupabaseConnectionConfig>;
      configSource?: SupabaseConfigSource;
      message?: string;
    };
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        config: saveSupabaseConfig({ ...normalized, configSource: 'CLIENT_MEMORY' }),
        message: data?.message || '服务端保存数据库运行态配置失败',
      };
    }
    const confirmed = saveSupabaseConfig({
      projectUrl: data.config?.projectUrl || normalized.projectUrl,
      anonKey: data.config?.anonKey || normalized.anonKey,
      authMode: data.config?.authMode === 'LOGTO_OIDC' ? 'LOGTO_OIDC' : normalized.authMode,
      logtoEndpoint: data.config?.logtoEndpoint || normalized.logtoEndpoint,
      logtoAppId: data.config?.logtoAppId || normalized.logtoAppId,
      configSource: data.configSource || 'SERVER_MEMORY',
    });
    return { ok: true, config: confirmed, message: data.message };
  } catch (err: unknown) {
    return {
      ok: false,
      config: saveSupabaseConfig({ ...normalized, configSource: 'CLIENT_MEMORY' }),
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function getDynamicSupabaseClient(
  config?: SupabaseConnectionConfig
): SupabaseClient | null {
  const cfg = config || loadSupabaseConfig();
  const url = normalizeSupabaseProjectUrl(cfg.projectUrl);
  const key = (cfg.anonKey || '').trim();

  if (!url || !key || url.includes('your-project-id') || !url.startsWith('http')) {
    return null;
  }

  const cacheKey = `${url}::${key}`;
  const pool = getClientPool();
  const existing = pool.get(cacheKey);
  if (existing) {
    return existing;
  }

  try {
    const isBrowser = typeof window !== 'undefined';
    const client = createClient(url, key, {
      auth: {
        persistSession: isBrowser,
        autoRefreshToken: isBrowser,
      },
    });
    pool.set(cacheKey, client);
    return client;
  } catch {
    return null;
  }
}

export function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST204' ||
    error.code === 'PGRST205' ||
    msg.includes('relation') ||
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('could not find the table')
  );
}

export async function probeSupabaseConnection(
  config: SupabaseConnectionConfig
): Promise<{
  connected: boolean;
  schemaInitialized: boolean;
  domainStoreReady: boolean;
  latencyMs: number;
  normalizedUrl: string;
  message: string;
}> {
  const start = Date.now();
  const normalizedUrl = normalizeSupabaseProjectUrl(config.projectUrl);
  const client = getDynamicSupabaseClient({ ...config, projectUrl: normalizedUrl });

  if (!client) {
    return {
      connected: false,
      schemaInitialized: false,
      domainStoreReady: false,
      latencyMs: 0,
      normalizedUrl,
      message: '尚未配置有效的 Supabase Project URL 与 Anon/Publishable Key，请填入后保存连接。',
    };
  }

  try {
    const [{ error: tenantErr }, { error: domainErr }] = await Promise.all([
      client.from('sys_tenants').select('id').limit(1),
      client.from('erp_domain_records').select('record_id').limit(1),
    ]);
    const latencyMs = Date.now() - start;

    if (!tenantErr && !domainErr) {
      return {
        connected: true,
        schemaInitialized: true,
        domainStoreReady: true,
        latencyMs,
        normalizedUrl,
        message: `已成功直连 Supabase PostgreSQL (${normalizedUrl})，多租户主表 [sys_tenants] 与全量业务存储表 [erp_domain_records] 均已就绪 (${latencyMs}ms)`,
      };
    }

    if (!tenantErr && isMissingTableError(domainErr)) {
      return {
        connected: true,
        schemaInitialized: true,
        domainStoreReady: false,
        latencyMs,
        normalizedUrl,
        message: `Supabase 主库连接成功 (${latencyMs}ms)，检测到 [sys_tenants] 已存在，但尚未创建全量持久化表 [erp_domain_records]。请复制最新「Supabase RLS SQL」到 SQL Editor 执行一次即可开启全量实时落库。`,
      };
    }

    if (isMissingTableError(tenantErr)) {
      return {
        connected: true,
        schemaInitialized: false,
        domainStoreReady: false,
        latencyMs,
        normalizedUrl,
        message: `Supabase 实例连接成功 (${latencyMs}ms)，但尚未执行 X Cloud ERP 多租户建表脚本。请复制下方 SQL 在 Supabase SQL Editor 中执行。`,
      };
    }

    const activeErr = tenantErr || domainErr;
    return {
      connected: false,
      schemaInitialized: false,
      domainStoreReady: false,
      latencyMs,
      normalizedUrl,
      message: `Supabase 响应异常: ${activeErr?.message || '未知错误'} (Code: ${activeErr?.code || 'UNKNOWN'})`,
    };
  } catch (err: unknown) {
    return {
      connected: false,
      schemaInitialized: false,
      domainStoreReady: false,
      latencyMs: Date.now() - start,
      normalizedUrl,
      message: `无法连接到 Supabase URL (${normalizedUrl}): ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
