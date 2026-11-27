import type { AuthSessionUser, AuthStatusPayload, AuthUserRole } from './authService';

// Strictly memory-only Bearer token store — never written to persistent browser web storage.
let memoryAuthToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function getAuthToken(): string | null {
  return memoryAuthToken;
}

export function setAuthToken(token: string | null): void {
  memoryAuthToken = token && token.trim() ? token.trim() : null;
}

export function clearAuthToken(): void {
  memoryAuthToken = null;
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (memoryAuthToken) {
    headers.Authorization = `Bearer ${memoryAuthToken}`;
  }
  return headers;
}

export function registerUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export function notifyUnauthorized(): void {
  clearAuthToken();
  if (unauthorizedHandler) {
    unauthorizedHandler();
  }
}

export async function fetchAuthStatus(): Promise<AuthStatusPayload> {
  const res = await fetch('/api/auth/status', {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!res.ok) {
    throw new Error(`无法获取登录服务状态 (HTTP ${res.status})`);
  }
  const data = (await res.json()) as Partial<AuthStatusPayload>;
  return {
    authEnabled: true,
    needsInitialSetup: Boolean(data.needsInitialSetup),
    envAdminConfigured: Boolean(data.envAdminConfigured),
    supabaseAuthAvailable: Boolean(data.supabaseAuthAvailable),
    accountCount: Number(data.accountCount || 0),
    authMode: data.authMode === 'LOGTO_OIDC' ? 'LOGTO_OIDC' : 'SUPABASE_AUTH',
    defaultAdminEmailHint:
      typeof data.defaultAdminEmailHint === 'string' ? data.defaultAdminEmailHint : undefined,
  };
}

export async function setupInitialAdmin(params: {
  email: string;
  fullName?: string;
  password: string;
}): Promise<
  | { ok: true; user: AuthSessionUser; expiresAt: string; persistedToDb: boolean }
  | { ok: false; errorCode?: string; message: string }
> {
  try {
    const res = await fetch('/api/auth/setup-admin', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data?.ok || !data?.token || !data?.user) {
      return {
        ok: false,
        errorCode: data?.errorCode,
        message: data?.message || '初始化管理员账号失败',
      };
    }
    setAuthToken(String(data.token));
    return {
      ok: true,
      user: data.user as AuthSessionUser,
      expiresAt: String(data.expiresAt || ''),
      persistedToDb: Boolean(data.persistedToDb),
    };
  } catch (err: unknown) {
    return {
      ok: false,
      message: `无法连接认证接口: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function loginWithPassword(params: {
  email: string;
  password: string;
}): Promise<
  | { ok: true; user: AuthSessionUser; expiresAt: string }
  | { ok: false; errorCode?: string; message: string }
> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data?.ok || !data?.token || !data?.user) {
      return {
        ok: false,
        errorCode: data?.errorCode,
        message: data?.message || '登录验证失败，请核对邮箱与密码',
      };
    }
    setAuthToken(String(data.token));
    return {
      ok: true,
      user: data.user as AuthSessionUser,
      expiresAt: String(data.expiresAt || ''),
    };
  } catch (err: unknown) {
    return {
      ok: false,
      message: `无法连接登录接口: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Restores the current authenticated session from either the in-memory Bearer token
 * or the server-managed HttpOnly session cookie (survives page refresh cleanly).
 */
export async function fetchCurrentAuthUser(): Promise<AuthSessionUser | null> {
  try {
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json', ...getAuthHeaders() },
    });
    if (res.status === 401) {
      clearAuthToken();
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ok && data?.user ? (data.user as AuthSessionUser) : null;
  } catch {
    return null;
  }
}

export async function logoutAuthSession(): Promise<void> {
  const headers = { Accept: 'application/json', ...getAuthHeaders() };
  clearAuthToken();
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers,
    });
  } catch {
    // Stateless logout succeeds locally even if network is offline
  }
}

export async function changeOwnPassword(params: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(params),
    });
    if (res.status === 401) {
      const data = await res.json().catch(() => ({}));
      if (data?.errorCode === 'AUTH_REQUIRED') {
        notifyUnauthorized();
      }
      return { ok: false, message: data?.message || '认证失效或当前密码不正确' };
    }
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      return { ok: false, message: data?.message || '修改密码失败' };
    }
    if (typeof data.token === 'string' && data.token) {
      setAuthToken(data.token);
    }
    return { ok: true, message: data.message || '密码已更新' };
  } catch (err: unknown) {
    return {
      ok: false,
      message: `修改密码请求异常: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function registerMemberAccount(params: {
  email: string;
  fullName?: string;
  password: string;
  role?: AuthUserRole;
  tenantId?: string;
  memberId?: string;
}): Promise<{ ok: boolean; user?: AuthSessionUser; message?: string }> {
  try {
    const res = await fetch('/api/auth/register-member', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(params),
    });
    if (res.status === 401) {
      notifyUnauthorized();
      return { ok: false, message: '登录会话已过期，请重新登录' };
    }
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      return { ok: false, message: data?.message || '创建登录账号失败' };
    }
    return { ok: true, user: data.user as AuthSessionUser };
  } catch (err: unknown) {
    return {
      ok: false,
      message: `创建登录账号异常: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
