import {
  SupabaseConnectionConfig,
  getDynamicSupabaseClient,
  isSupabaseConfigured,
  normalizeSupabaseProjectUrl,
} from './supabaseClient';

export type AuthUserRole = 'PLATFORM_SUPER_ADMIN' | 'TENANT_USER';
export type AuthProviderType = 'LOCAL_DB' | 'ENV_PASSCODE' | 'SUPABASE_AUTH';

export interface AuthSessionUser {
  id: string;
  email: string;
  fullName: string;
  role: AuthUserRole;
  tenantId?: string;
  memberId?: string;
  authProvider: AuthProviderType;
}

export interface StoredAuthAccount {
  id: string;
  email: string;
  fullName: string;
  role: AuthUserRole;
  tenantId?: string;
  memberId?: string;
  passwordHash: string;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  updatedAt: string;
}

export interface AuthEnvVars {
  AUTH_SESSION_SECRET?: string;
  ADMIN_LOGIN_EMAIL?: string;
  ADMIN_LOGIN_PASSCODE?: string;
  AUTH_MODE?: string;
}

export interface AuthStatusPayload {
  authEnabled: true;
  needsInitialSetup: boolean;
  envAdminConfigured: boolean;
  supabaseAuthAvailable: boolean;
  accountCount: number;
  authMode: 'SUPABASE_AUTH' | 'LOGTO_OIDC';
  defaultAdminEmailHint?: string;
}

const AUTH_ACCOUNTS_ENTITY = 'authAccounts';
const AUTH_CREDENTIALS_ENTITY = 'authCredentials';
const SESSION_KEY_RECORD_ID = '__session_key__';
const PBKDF2_ITERATIONS = 100000;
const SESSION_TTL_SECONDS = 24 * 60 * 60; // 24 hours

// In-memory fallback store (used when Supabase is not yet configured or in isolated tests)
const memoryAccounts = new Map<string, StoredAuthAccount>();
let cachedDbSigningSecret: { key: string; secret: string } | null = null;
let ephemeralProcessSecret: string | null = null;

function getWebCrypto(): Crypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  throw new Error('Web Crypto API (crypto.subtle) is unavailable in this runtime.');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function utf8ToBytes(str: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(str);
  const out = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  out.set(encoded);
  return out;
}

function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export function constantTimeEqualString(a: string, b: string): boolean {
  return constantTimeEqualBytes(utf8ToBytes(a), utf8ToBytes(b));
}

export function generateRandomSecret(byteLength = 32): string {
  const cryptoApi = getWebCrypto();
  const buf = new Uint8Array(byteLength);
  cryptoApi.getRandomValues(buf);
  return bytesToBase64Url(buf);
}

/**
 * Hashes a password with PBKDF2-SHA256 (100,000 iterations + 16-byte cryptographic salt).
 * Format: pbkdf2_sha256$<iterations>$<saltBase64Url>$<hashBase64Url>
 */
export async function hashPassword(password: string): Promise<string> {
  const cryptoApi = getWebCrypto();
  const salt = new Uint8Array(16);
  cryptoApi.getRandomValues(salt);

  const keyMaterial = await cryptoApi.subtle.importKey(
    'raw',
    utf8ToBytes(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await cryptoApi.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const hashBytes = new Uint8Array(derivedBits);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hashBytes)}`;
}

/**
 * Verifies a plaintext password against a stored PBKDF2-SHA256 hash using constant-time comparison.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;

  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 10000 || iterations > 1000000) return false;

  let salt: Uint8Array<ArrayBuffer>;
  let expectedBytes: Uint8Array<ArrayBuffer>;
  try {
    salt = base64UrlToBytes(parts[2]);
    expectedBytes = base64UrlToBytes(parts[3]);
  } catch {
    return false;
  }

  const cryptoApi = getWebCrypto();
  const keyMaterial = await cryptoApi.subtle.importKey(
    'raw',
    utf8ToBytes(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await cryptoApi.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    expectedBytes.length * 8
  );

  return constantTimeEqualBytes(new Uint8Array(derivedBits), expectedBytes);
}

async function hmacSign(signingInput: string, secret: string): Promise<Uint8Array> {
  const cryptoApi = getWebCrypto();
  const key = await cryptoApi.subtle.importKey(
    'raw',
    utf8ToBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await cryptoApi.subtle.sign('HMAC', key, utf8ToBytes(signingInput));
  return new Uint8Array(sig);
}

/**
 * Creates a stateless HMAC-SHA256 signed Bearer session token.
 */
export async function createSignedSessionToken(
  user: AuthSessionUser,
  secret: string,
  ttlSeconds = SESSION_TTL_SECONDS,
  nowMs = Date.now()
): Promise<{ token: string; expiresAt: string }> {
  const iat = Math.floor(nowMs / 1000);
  const exp = iat + Math.max(60, Math.floor(ttlSeconds));
  const headerB64 = bytesToBase64Url(utf8ToBytes(JSON.stringify({ alg: 'HS256', typ: 'XCLOUD_SESSION' })));
  const payloadB64 = bytesToBase64Url(
    utf8ToBytes(
      JSON.stringify({
        sub: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId || undefined,
        memberId: user.memberId || undefined,
        authProvider: user.authProvider,
        iat,
        exp,
      })
    )
  );
  const signingInput = `${headerB64}.${payloadB64}`;
  const sigBytes = await hmacSign(signingInput, secret);
  return {
    token: `${signingInput}.${bytesToBase64Url(sigBytes)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

/**
 * Verifies a Bearer session token's HMAC-SHA256 signature and expiry timestamp.
 */
export async function verifySignedSessionToken(
  token: string,
  secret: string,
  nowMs = Date.now()
): Promise<AuthSessionUser | null> {
  if (!token || !secret || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) return null;

  try {
    const expectedSig = await hmacSign(`${headerB64}.${payloadB64}`, secret);
    const actualSig = base64UrlToBytes(sigB64);
    if (!constantTimeEqualBytes(expectedSig, actualSig)) {
      return null;
    }

    const payloadJson = bytesToUtf8(base64UrlToBytes(payloadB64));
    const payload = JSON.parse(payloadJson) as {
      sub?: string;
      email?: string;
      fullName?: string;
      role?: string;
      tenantId?: string;
      memberId?: string;
      authProvider?: string;
      exp?: number;
    };

    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs) {
      return null;
    }
    if (!payload.sub || !payload.email) {
      return null;
    }

    const role: AuthUserRole =
      payload.role === 'PLATFORM_SUPER_ADMIN' ? 'PLATFORM_SUPER_ADMIN' : 'TENANT_USER';
    const authProvider: AuthProviderType =
      payload.authProvider === 'ENV_PASSCODE' || payload.authProvider === 'SUPABASE_AUTH'
        ? payload.authProvider
        : 'LOCAL_DB';

    return {
      id: payload.sub,
      email: payload.email,
      fullName: payload.fullName || payload.email,
      role,
      tenantId: payload.tenantId,
      memberId: payload.memberId,
      authProvider,
    };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = 'xcloud_session';

export function extractBearerToken(authHeader?: string | null): string {
  if (!authHeader || typeof authHeader !== 'string') return '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match ? match[1].trim() : '';
}

export function extractSessionTokenFromCookie(cookieHeader?: string | null): string {
  if (!cookieHeader || typeof cookieHeader !== 'string') return '';
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx <= 0) continue;
    const name = pair.slice(0, eqIdx).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    const rawVal = pair.slice(eqIdx + 1).trim();
    if (!rawVal) return '';
    try {
      return decodeURIComponent(rawVal);
    } catch {
      return rawVal;
    }
  }
  return '';
}

/**
 * Builds a Set-Cookie header for the signed HttpOnly session cookie.
 * Uses HttpOnly; Secure; SameSite=None; Partitioned over HTTPS (supports both
 * top-level Cloudflare domains and embedded HTTPS previews), and HttpOnly on plain HTTP loopback.
 */
export function buildSessionCookieHeader(
  token: string,
  options: { isHttps: boolean; clear?: boolean; maxAgeSeconds?: number }
): string {
  const maxAge = options.clear
    ? 0
    : Math.max(60, Math.floor(options.maxAgeSeconds ?? SESSION_TTL_SECONDS));
  const value = options.clear ? '' : encodeURIComponent(token);
  const parts = [`${SESSION_COOKIE_NAME}=${value}`, 'Path=/', 'HttpOnly', `Max-Age=${maxAge}`];
  if (options.isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  }
  return parts.join('; ');
}

export function isSameOriginHeader(
  originHeader?: string | null,
  hostHeader?: string | null,
  forwardedHostHeader?: string | null
): boolean {
  if (!originHeader || typeof originHeader !== 'string') return false;
  const expectedHost = (
    (typeof forwardedHostHeader === 'string' && forwardedHostHeader.split(',')[0]?.trim()) ||
    (typeof hostHeader === 'string' && hostHeader.trim()) ||
    ''
  ).toLowerCase();
  if (!expectedHost) return false;
  try {
    const parsed = new URL(originHeader.trim());
    return parsed.host.toLowerCase() === expectedHost;
  } catch {
    return false;
  }
}

function isNonPlaceholderSecret(val?: string): boolean {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (trimmed.length < 6) return false;
  if (/^(your[-_]|my[-_]|changeme|placeholder)/i.test(trimmed)) return false;
  return true;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getEnvAdminCredentials(env: AuthEnvVars): {
  configured: boolean;
  email: string;
  passcode: string;
} {
  const passcode = typeof env.ADMIN_LOGIN_PASSCODE === 'string' ? env.ADMIN_LOGIN_PASSCODE.trim() : '';
  const configured = isNonPlaceholderSecret(passcode);
  const rawEmail = typeof env.ADMIN_LOGIN_EMAIL === 'string' ? env.ADMIN_LOGIN_EMAIL.trim() : '';
  const email = normalizeEmail(rawEmail || 'admin@x-cloud-erp.local');
  return { configured, email, passcode };
}

/**
 * Resolves the HMAC session signing key:
 * 1. Explicit AUTH_SESSION_SECRET environment variable (recommended for production)
 * 2. Database-persisted random 32-byte key in erp_domain_records (keeps multi-isolate Workers consistent)
 * 3. Cryptographically random per-process key in memory (never a hardcoded string)
 */
export async function resolveSessionSigningSecret(
  env: AuthEnvVars,
  dbConfig?: SupabaseConnectionConfig
): Promise<string> {
  const envSecret = typeof env.AUTH_SESSION_SECRET === 'string' ? env.AUTH_SESSION_SECRET.trim() : '';
  if (envSecret.length >= 16 && !/^(your[-_]|my[-_]|changeme)/i.test(envSecret)) {
    return envSecret;
  }

  if (dbConfig && isSupabaseConfigured(dbConfig)) {
    const cacheKey = `${normalizeSupabaseProjectUrl(dbConfig.projectUrl)}::${dbConfig.anonKey.slice(0, 12)}`;
    if (cachedDbSigningSecret && cachedDbSigningSecret.key === cacheKey) {
      return cachedDbSigningSecret.secret;
    }

    const client = getDynamicSupabaseClient(dbConfig);
    if (client) {
      try {
        const { data, error } = await client
          .from('erp_domain_records')
          .select('payload')
          .eq('entity_type', AUTH_CREDENTIALS_ENTITY)
          .eq('record_id', SESSION_KEY_RECORD_ID)
          .maybeSingle();

        const existingSecret =
          !error && data?.payload && typeof (data.payload as { secret?: unknown }).secret === 'string'
            ? (data.payload as { secret: string }).secret
            : '';

        if (existingSecret && existingSecret.length >= 32) {
          cachedDbSigningSecret = { key: cacheKey, secret: existingSecret };
          return existingSecret;
        }

        if (!error) {
          const generated = generateRandomSecret(32);
          const { error: upsertErr } = await client.from('erp_domain_records').upsert(
            {
              entity_type: AUTH_CREDENTIALS_ENTITY,
              record_id: SESSION_KEY_RECORD_ID,
              tenant_id: 'platform',
              payload: {
                secret: generated,
                createdAt: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'entity_type,record_id' }
          );
          if (!upsertErr) {
            cachedDbSigningSecret = { key: cacheKey, secret: generated };
            return generated;
          }
        }
      } catch {
        // Fall through to ephemeral cryptographic key
      }
    }
  }

  if (!ephemeralProcessSecret) {
    ephemeralProcessSecret = generateRandomSecret(32);
  }
  return ephemeralProcessSecret;
}

async function listStoredAccounts(dbConfig?: SupabaseConnectionConfig): Promise<StoredAuthAccount[]> {
  if (dbConfig && isSupabaseConfigured(dbConfig)) {
    const client = getDynamicSupabaseClient(dbConfig);
    if (client) {
      try {
        const { data, error } = await client
          .from('erp_domain_records')
          .select('payload')
          .eq('entity_type', AUTH_ACCOUNTS_ENTITY)
          .limit(200);
        if (!error && Array.isArray(data)) {
          const rows: StoredAuthAccount[] = [];
          for (const row of data) {
            const p = row?.payload as Partial<StoredAuthAccount> | undefined;
            if (p && typeof p.email === 'string' && typeof p.passwordHash === 'string') {
              rows.push(p as StoredAuthAccount);
            }
          }
          return rows;
        }
      } catch {
        // Fall through to memory store
      }
    }
  }
  return Array.from(memoryAccounts.values());
}

async function findStoredAccountByEmail(
  email: string,
  dbConfig?: SupabaseConnectionConfig
): Promise<StoredAuthAccount | null> {
  const normalized = normalizeEmail(email);
  if (dbConfig && isSupabaseConfigured(dbConfig)) {
    const client = getDynamicSupabaseClient(dbConfig);
    if (client) {
      try {
        const { data, error } = await client
          .from('erp_domain_records')
          .select('payload')
          .eq('entity_type', AUTH_ACCOUNTS_ENTITY)
          .eq('record_id', normalized)
          .maybeSingle();
        if (!error && data?.payload) {
          const p = data.payload as Partial<StoredAuthAccount>;
          if (typeof p.email === 'string' && typeof p.passwordHash === 'string') {
            return p as StoredAuthAccount;
          }
        }
      } catch {
        // Fall through
      }
    }
  }
  return memoryAccounts.get(normalized) || null;
}

async function saveStoredAccount(
  account: StoredAuthAccount,
  dbConfig?: SupabaseConnectionConfig
): Promise<{ persistedToDb: boolean }> {
  const normalized = normalizeEmail(account.email);
  const record: StoredAuthAccount = { ...account, email: normalized };
  memoryAccounts.set(normalized, record);

  if (dbConfig && isSupabaseConfigured(dbConfig)) {
    const client = getDynamicSupabaseClient(dbConfig);
    if (client) {
      try {
        const { error } = await client.from('erp_domain_records').upsert(
          {
            entity_type: AUTH_ACCOUNTS_ENTITY,
            record_id: normalized,
            tenant_id: record.tenantId || 'platform',
            payload: record,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'entity_type,record_id' }
        );
        if (!error) {
          return { persistedToDb: true };
        }
      } catch {
        // Keep in-memory copy if DB write fails
      }
    }
  }
  return { persistedToDb: false };
}

function toSafeSessionUser(
  account: StoredAuthAccount,
  authProvider: AuthProviderType = 'LOCAL_DB'
): AuthSessionUser {
  return {
    id: account.id,
    email: account.email,
    fullName: account.fullName,
    role: account.role,
    tenantId: account.tenantId,
    memberId: account.memberId,
    authProvider,
  };
}

/**
 * Returns public authentication bootstrap status (never leaks secrets or password hashes).
 */
export async function getAuthStatus(
  env: AuthEnvVars,
  dbConfig?: SupabaseConnectionConfig
): Promise<AuthStatusPayload> {
  const envAdmin = getEnvAdminCredentials(env);
  const accounts = await listStoredAccounts(dbConfig);
  const activeAdmins = accounts.filter(
    (a) => a.status === 'ACTIVE' && a.role === 'PLATFORM_SUPER_ADMIN'
  );
  const supabaseAuthAvailable = Boolean(dbConfig && isSupabaseConfigured(dbConfig));
  const needsInitialSetup = !envAdmin.configured && activeAdmins.length === 0;

  return {
    authEnabled: true,
    needsInitialSetup,
    envAdminConfigured: envAdmin.configured,
    supabaseAuthAvailable,
    accountCount: accounts.length,
    authMode:
      env.AUTH_MODE === 'LOGTO_OIDC' || dbConfig?.authMode === 'LOGTO_OIDC'
        ? 'LOGTO_OIDC'
        : 'SUPABASE_AUTH',
    defaultAdminEmailHint: envAdmin.configured ? envAdmin.email : undefined,
  };
}

/**
 * One-time first-run Super Admin registration/claim.
 * Permanently locks itself (409 ALREADY_INITIALIZED) once any admin exists or ADMIN_LOGIN_PASSCODE is set.
 */
export async function setupInitialAdminAccount(
  env: AuthEnvVars,
  dbConfig: SupabaseConnectionConfig | undefined,
  input: { email: string; fullName?: string; password: string }
): Promise<
  | { ok: true; token: string; expiresAt: string; user: AuthSessionUser; persistedToDb: boolean }
  | { ok: false; status: number; errorCode: string; message: string }
> {
  const status = await getAuthStatus(env, dbConfig);
  if (!status.needsInitialSetup) {
    return {
      ok: false,
      status: 409,
      errorCode: 'ALREADY_INITIALIZED',
      message: '系统已完成管理员初始化，禁止重复注册初始超级管理员账号。请直接使用已有账号登录。',
    };
  }

  const email = normalizeEmail(typeof input.email === 'string' ? input.email : '');
  const password = typeof input.password === 'string' ? input.password : '';
  const fullName =
    typeof input.fullName === 'string' && input.fullName.trim()
      ? input.fullName.trim().slice(0, 64)
      : 'Platform Super Admin';

  if (!isValidEmail(email)) {
    return {
      ok: false,
      status: 400,
      errorCode: 'INVALID_EMAIL',
      message: '请输入有效的管理员登录邮箱地址。',
    };
  }

  if (password.length < 8) {
    return {
      ok: false,
      status: 400,
      errorCode: 'WEAK_PASSWORD',
      message: '管理员登录密码长度不能少于 8 位。',
    };
  }

  const nowIso = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  const account: StoredAuthAccount = {
    id: `usr_admin_${generateRandomSecret(8)}`,
    email,
    fullName,
    role: 'PLATFORM_SUPER_ADMIN',
    passwordHash,
    status: 'ACTIVE',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const { persistedToDb } = await saveStoredAccount(account, dbConfig);
  const sessionUser = toSafeSessionUser(account, 'LOCAL_DB');
  const signingSecret = await resolveSessionSigningSecret(env, dbConfig);
  const { token, expiresAt } = await createSignedSessionToken(sessionUser, signingSecret);

  return {
    ok: true,
    token,
    expiresAt,
    user: sessionUser,
    persistedToDb,
  };
}

/**
 * Authenticates email + password via:
 * 1. Server environment ADMIN_LOGIN_PASSCODE (if configured)
 * 2. PBKDF2-SHA256 hashed account stored in Supabase erp_domain_records (or memory fallback)
 * 3. Optional Supabase GoTrue password grant (/auth/v1/token?grant_type=password) with hard timeout
 */
export async function authenticateCredentials(
  env: AuthEnvVars,
  dbConfig: SupabaseConnectionConfig | undefined,
  input: { email: string; password: string }
): Promise<
  | { ok: true; token: string; expiresAt: string; user: AuthSessionUser }
  | { ok: false; status: number; errorCode: string; message: string }
> {
  const email = normalizeEmail(typeof input.email === 'string' ? input.email : '');
  const password = typeof input.password === 'string' ? input.password : '';

  if (!email || !password) {
    return {
      ok: false,
      status: 400,
      errorCode: 'MISSING_CREDENTIALS',
      message: '请输入登录邮箱与密码。',
    };
  }

  const signingSecret = await resolveSessionSigningSecret(env, dbConfig);

  // 1. Environment variable Super Admin passcode override
  const envAdmin = getEnvAdminCredentials(env);
  if (
    envAdmin.configured &&
    constantTimeEqualString(email, envAdmin.email) &&
    constantTimeEqualString(password, envAdmin.passcode)
  ) {
    const user: AuthSessionUser = {
      id: 'usr_env_super_admin',
      email: envAdmin.email,
      fullName: 'Platform Super Admin',
      role: 'PLATFORM_SUPER_ADMIN',
      authProvider: 'ENV_PASSCODE',
    };
    const { token, expiresAt } = await createSignedSessionToken(user, signingSecret);
    return { ok: true, token, expiresAt, user };
  }

  // 2. Stored hashed account in Supabase erp_domain_records (or in-memory fallback)
  const stored = await findStoredAccountByEmail(email, dbConfig);
  if (stored) {
    if (stored.status !== 'ACTIVE') {
      return {
        ok: false,
        status: 403,
        errorCode: 'ACCOUNT_DISABLED',
        message: '该登录账号已被停用，请联系管理员恢复权限。',
      };
    }
    const valid = await verifyPassword(password, stored.passwordHash);
    if (valid) {
      const user = toSafeSessionUser(stored, 'LOCAL_DB');
      const { token, expiresAt } = await createSignedSessionToken(user, signingSecret);
      return { ok: true, token, expiresAt, user };
    }
    return {
      ok: false,
      status: 401,
      errorCode: 'INVALID_CREDENTIALS',
      message: '登录邮箱或密码错误，请检查后重试。',
    };
  }

  // 3. Optional Supabase GoTrue password verification when Supabase is configured
  if (dbConfig && isSupabaseConfigured(dbConfig)) {
    const baseUrl = normalizeSupabaseProjectUrl(dbConfig.projectUrl);
    if (baseUrl.startsWith('https://')) {
      try {
        const res = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: dbConfig.anonKey,
          },
          body: JSON.stringify({ email, password }),
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            user?: {
              id?: string;
              email?: string;
              user_metadata?: Record<string, unknown>;
              app_metadata?: Record<string, unknown>;
            };
          };
          const supaUser = data?.user;
          if (supaUser?.id && supaUser.email) {
            const rawRole =
              supaUser.app_metadata?.role || supaUser.user_metadata?.role || 'TENANT_USER';
            const role: AuthUserRole =
              rawRole === 'PLATFORM_SUPER_ADMIN' ? 'PLATFORM_SUPER_ADMIN' : 'TENANT_USER';
            const user: AuthSessionUser = {
              id: supaUser.id,
              email: normalizeEmail(supaUser.email),
              fullName:
                typeof supaUser.user_metadata?.full_name === 'string' &&
                supaUser.user_metadata.full_name.trim()
                  ? supaUser.user_metadata.full_name.trim()
                  : supaUser.email,
              role,
              tenantId:
                typeof supaUser.app_metadata?.tenant_id === 'string'
                  ? supaUser.app_metadata.tenant_id
                  : typeof supaUser.user_metadata?.tenant_id === 'string'
                  ? supaUser.user_metadata.tenant_id
                  : undefined,
              authProvider: 'SUPABASE_AUTH',
            };
            const { token, expiresAt } = await createSignedSessionToken(user, signingSecret);
            return { ok: true, token, expiresAt, user };
          }
        }
      } catch {
        // Ignore upstream GoTrue error and return unified 401
      }
    }
  }

  return {
    ok: false,
    status: 401,
    errorCode: 'INVALID_CREDENTIALS',
    message: '登录邮箱或密码错误，请检查后重试。',
  };
}

/**
 * Verifies an incoming Authorization: Bearer <token> header.
 */
export async function verifyRequestBearerAuth(
  authHeader: string | null | undefined,
  env: AuthEnvVars,
  dbConfig?: SupabaseConnectionConfig
): Promise<AuthSessionUser | null> {
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const signingSecret = await resolveSessionSigningSecret(env, dbConfig);
  return verifySignedSessionToken(token, signingSecret);
}

/**
 * Verifies authentication via either Authorization: Bearer <token> OR the signed HttpOnly cookie.
 * When authenticating a mutating request (POST/PUT/PATCH/DELETE) via cookie alone, enforces
 * CSRF verification via X-Requested-With header or matching Origin vs Host/X-Forwarded-Host.
 */
export async function verifyRequestAuth(
  params: {
    authHeader?: string | null;
    cookieHeader?: string | null;
    method?: string;
    requestedWithHeader?: string | null;
    originHeader?: string | null;
    hostHeader?: string | null;
    forwardedHostHeader?: string | null;
  },
  env: AuthEnvVars,
  dbConfig?: SupabaseConnectionConfig
): Promise<AuthSessionUser | null> {
  const bearerToken = extractBearerToken(params.authHeader);
  const signingSecret = await resolveSessionSigningSecret(env, dbConfig);
  if (bearerToken) {
    const bearerUser = await verifySignedSessionToken(bearerToken, signingSecret);
    if (bearerUser) return bearerUser;
  }

  const cookieToken = extractSessionTokenFromCookie(params.cookieHeader);
  if (!cookieToken) return null;

  const upperMethod = (params.method || 'GET').toUpperCase();
  const isMutating = upperMethod !== 'GET' && upperMethod !== 'HEAD' && upperMethod !== 'OPTIONS';
  if (isMutating) {
    const hasCustomHeader =
      typeof params.requestedWithHeader === 'string' &&
      params.requestedWithHeader.trim().toLowerCase() === 'xmlhttprequest';
    const hasMatchingOrigin = isSameOriginHeader(
      params.originHeader,
      params.hostHeader,
      params.forwardedHostHeader
    );
    if (!hasCustomHeader && !hasMatchingOrigin) {
      return null;
    }
  }

  return verifySignedSessionToken(cookieToken, signingSecret);
}

/**
 * Allows a signed-in local DB user to update their own password.
 */
export async function changeAccountPassword(
  env: AuthEnvVars,
  dbConfig: SupabaseConnectionConfig | undefined,
  session: AuthSessionUser,
  input: { currentPassword: string; newPassword: string }
): Promise<
  | { ok: true; token: string; expiresAt: string; message: string }
  | { ok: false; status: number; errorCode: string; message: string }
> {
  if (session.authProvider === 'ENV_PASSCODE') {
    return {
      ok: false,
      status: 400,
      errorCode: 'ENV_MANAGED_ACCOUNT',
      message: '当前登录凭据由服务端环境变量 ADMIN_LOGIN_PASSCODE 托管，请在环境变量面板修改密码。',
    };
  }
  if (session.authProvider === 'SUPABASE_AUTH') {
    return {
      ok: false,
      status: 400,
      errorCode: 'EXTERNAL_AUTH_ACCOUNT',
      message: '当前账号由 Supabase Auth 托管，请在 Supabase Auth 面板修改密码。',
    };
  }

  const currentPassword = typeof input.currentPassword === 'string' ? input.currentPassword : '';
  const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';
  if (newPassword.length < 8) {
    return {
      ok: false,
      status: 400,
      errorCode: 'WEAK_PASSWORD',
      message: '新密码长度不能少于 8 位。',
    };
  }

  const existing = await findStoredAccountByEmail(session.email, dbConfig);
  if (!existing) {
    return {
      ok: false,
      status: 404,
      errorCode: 'ACCOUNT_NOT_FOUND',
      message: '未找到当前登录账号记录。',
    };
  }

  const validCurrent = await verifyPassword(currentPassword, existing.passwordHash);
  if (!validCurrent) {
    return {
      ok: false,
      status: 401,
      errorCode: 'INVALID_CURRENT_PASSWORD',
      message: '当前密码验证失败，请核对后重试。',
    };
  }

  const updated: StoredAuthAccount = {
    ...existing,
    passwordHash: await hashPassword(newPassword),
    updatedAt: new Date().toISOString(),
  };
  await saveStoredAccount(updated, dbConfig);
  const signingSecret = await resolveSessionSigningSecret(env, dbConfig);
  const { token, expiresAt } = await createSignedSessionToken(session, signingSecret);
  return {
    ok: true,
    token,
    expiresAt,
    message: '登录密码已更新，当前会话已自动刷新。',
  };
}

/**
 * Allows Platform Super Admin to provision or reset a member login account.
 */
export async function upsertMemberLoginAccount(
  _env: AuthEnvVars,
  dbConfig: SupabaseConnectionConfig | undefined,
  actor: AuthSessionUser,
  input: {
    email: string;
    fullName?: string;
    password: string;
    role?: AuthUserRole;
    tenantId?: string;
    memberId?: string;
  }
): Promise<
  | { ok: true; user: AuthSessionUser; persistedToDb: boolean }
  | { ok: false; status: number; errorCode: string; message: string }
> {
  if (actor.role !== 'PLATFORM_SUPER_ADMIN') {
    return {
      ok: false,
      status: 403,
      errorCode: 'SUPER_ADMIN_ONLY',
      message: '仅平台超级管理员可签发或重置登录账号凭据。',
    };
  }

  const email = normalizeEmail(typeof input.email === 'string' ? input.email : '');
  const password = typeof input.password === 'string' ? input.password : '';
  if (!isValidEmail(email)) {
    return {
      ok: false,
      status: 400,
      errorCode: 'INVALID_EMAIL',
      message: '请输入有效的成员登录邮箱地址。',
    };
  }
  if (password.length < 8) {
    return {
      ok: false,
      status: 400,
      errorCode: 'WEAK_PASSWORD',
      message: '账号初始密码长度不能少于 8 位。',
    };
  }

  const existing = await findStoredAccountByEmail(email, dbConfig);
  const nowIso = new Date().toISOString();
  const role: AuthUserRole =
    input.role === 'PLATFORM_SUPER_ADMIN' ? 'PLATFORM_SUPER_ADMIN' : 'TENANT_USER';
  const account: StoredAuthAccount = {
    id: existing?.id || `usr_${generateRandomSecret(8)}`,
    email,
    fullName:
      typeof input.fullName === 'string' && input.fullName.trim()
        ? input.fullName.trim().slice(0, 64)
        : existing?.fullName || email,
    role,
    tenantId: typeof input.tenantId === 'string' && input.tenantId.trim() ? input.tenantId.trim() : existing?.tenantId,
    memberId: typeof input.memberId === 'string' && input.memberId.trim() ? input.memberId.trim() : existing?.memberId,
    passwordHash: await hashPassword(password),
    status: 'ACTIVE',
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  const { persistedToDb } = await saveStoredAccount(account, dbConfig);
  return {
    ok: true,
    user: toSafeSessionUser(account, 'LOCAL_DB'),
    persistedToDb,
  };
}

export function resetAuthServiceStateForTest(): void {
  memoryAccounts.clear();
  cachedDbSigningSecret = null;
  ephemeralProcessSecret = null;
}
