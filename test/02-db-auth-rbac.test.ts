import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  canAccessPortal,
  resolveMemberPermissions,
  hasPermission,
  filterByShopScope,
  checkTenantQuota,
  validateTenantSlug,
  resolveTenantByPathSlug,
  canTenantInstallModule,
  isModuleEnabledForTenant,
  generateTenantSchemaSql,
  isValidImpersonationSession,
  evaluateMcpAccess,
} from '../src/lib/erpEngine';
import {
  INITIAL_RBAC_ROLES,
  INITIAL_TEAM_MEMBERS,
  INITIAL_LISTINGS,
  INITIAL_TENANTS,
  SUBSCRIPTION_PLANS,
  INITIAL_APP_MODULES,
  INITIAL_INSTALLED_MODULES,
} from '../src/data/initialErpData';
import {
  authenticateCredentials,
  changeAccountPassword,
  createSignedSessionToken,
  hashPassword,
  resetAuthServiceStateForTest,
  setupInitialAdminAccount,
  verifyPassword,
  verifySignedSessionToken,
} from '../src/services/authService';
import { handleWorkerRequest, resetWorkerRuntimeDbConfigForTest } from '../worker';

test('02-db-auth-rbac: strict portal boundary isolation rejects cross-portal elevation', () => {
  assert.equal(canAccessPortal('PLATFORM_SUPER_ADMIN', 'PLATFORM_SUPER_ADMIN'), true);
  assert.equal(canAccessPortal('TENANT_WORKSPACE', 'TENANT_WORKSPACE'), true);
  assert.equal(canAccessPortal('TENANT_WORKSPACE', 'PLATFORM_SUPER_ADMIN'), false);
  assert.equal(canAccessPortal('PLATFORM_SUPER_ADMIN', 'TENANT_WORKSPACE'), false);
});

test('02-db-auth-rbac: disabled or cross-tenant member receives empty permission set', () => {
  const admin = INITIAL_TEAM_MEMBERS[0];
  assert.equal(hasPermission(admin, INITIAL_RBAC_ROLES, 'rbac:manage'), true);

  const disabled = { ...admin, status: 'DISABLED' as const };
  assert.equal(resolveMemberPermissions(disabled, INITIAL_RBAC_ROLES).size, 0);

  const spoofedTenant = { ...admin, tenantId: 'tenant-attacker-99' };
  assert.equal(resolveMemberPermissions(spoofedTenant, INITIAL_RBAC_ROLES).size, 0);
});

test('02-db-auth-rbac: shop scope isolation restricts non-admin operator to allowedShopIds only', () => {
  const operator = INITIAL_TEAM_MEMBERS.find((m) => m.roleCode === 'AMAZON_OPERATOR')!;
  const scoped = filterByShopScope(INITIAL_LISTINGS, operator);
  assert.ok(scoped.length > 0);
  assert.ok(scoped.every((l) => operator.allowedShopIds.includes(l.shopId)));
  assert.ok(scoped.length < INITIAL_LISTINGS.length);
});

test('02-db-auth-rbac: checkTenantQuota blocks over-limit user seat addition', () => {
  const freePlan = SUBSCRIPTION_PLANS.find((p) => p.planCode === 'FREE')!;
  const atLimit = { ...INITIAL_TENANTS[0], usedUsersCount: freePlan.maxUsers };
  const result = checkTenantQuota(atLimit, freePlan, 'USERS');
  assert.equal(result.allowed, false);
  assert.ok(result.reason && result.reason.includes('配额超限'));
});

test('02-db-auth-rbac: unified path slug validator rejects reserved words, duplicates, and invalid lengths', () => {
  assert.equal(validateTenantSlug('admin', INITIAL_TENANTS).valid, false);
  assert.equal(validateTenantSlug('alpha', INITIAL_TENANTS).valid, false);
  assert.equal(validateTenantSlug('a', INITIAL_TENANTS).valid, false);
  const ok = validateTenantSlug('Delta-Global', INITIAL_TENANTS);
  assert.equal(ok.valid, true);
  assert.equal(ok.normalized, 'delta-global');
  assert.equal(resolveTenantByPathSlug('alpha', INITIAL_TENANTS)?.id, 'tenant-alpha-01');
  assert.equal(resolveTenantByPathSlug('unknown-slug', INITIAL_TENANTS), null);
});

test('02-db-auth-rbac: app marketplace enforces plan tier gating and HTTP 403 MODULE_NOT_ENABLED', () => {
  const mcpMod = INITIAL_APP_MODULES.find((m) => m.moduleCode === 'mod_mcp_gateway')!;
  assert.equal(canTenantInstallModule('FREE', mcpMod).allowed, false);
  assert.equal(canTenantInstallModule('PRO', mcpMod).allowed, true);
  assert.equal(
    isModuleEnabledForTenant('tenant-alpha-01', 'mod_ads_dayparting', INITIAL_INSTALLED_MODULES, INITIAL_APP_MODULES),
    true
  );
  assert.equal(
    isModuleEnabledForTenant('tenant-beta-02', 'mod_ads_dayparting', INITIAL_INSTALLED_MODULES, INITIAL_APP_MODULES),
    false
  );
  const blocked = evaluateMcpAccess({
    tenantStatus: 'ACTIVE',
    permissionScope: 'READ_WRITE',
    quotaRemaining: 1000,
    toolName: 'get_asin_profit_breakdown',
    mcpModuleEnabled: false,
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.httpStatus, 403);
  assert.equal(blocked.errorCode, -32005);
});

test('02-db-auth-rbac: 3-tier isolation SQL generator and impersonation session validation', () => {
  const schemaTenant = INITIAL_TENANTS[0];
  const byodTenant = INITIAL_TENANTS[2];
  assert.ok(generateTenantSchemaSql(schemaTenant).includes(`CREATE SCHEMA IF NOT EXISTS ${schemaTenant.dbSchemaName}`));
  assert.ok(generateTenantSchemaSql(byodTenant).includes('BYOD Dedicated Supabase Mode'));

  assert.equal(
    isValidImpersonationSession(
      {
        sessionId: 'IMP-123',
        platformAdminName: 'Platform Super Admin',
        targetTenantId: 'tenant-alpha-01',
        targetTenantCode: 'TENANT-ALPHA',
        targetTenantSlug: 'alpha',
        startedAt: '2026-11-25 10:00:00',
      },
      INITIAL_TENANTS
    ),
    true
  );
  assert.equal(isValidImpersonationSession(null, INITIAL_TENANTS), false);
});

test('02-db-auth-rbac: database & auth config is strictly isolated to Super Admin while tenant admins retain Lingxing MCP entry', () => {
  const appSource = fs.readFileSync('src/App.tsx', 'utf8');
  const modalSource = fs.readFileSync('src/components/SupabaseSetupModal.tsx', 'utf8');
  const tenantSettingsSource = fs.readFileSync('src/components/TenantWorkspaceSettingsView.tsx', 'utf8');

  assert.match(
    appSource,
    /portalMode\s*===\s*'PLATFORM_SUPER_ADMIN'\s*&&\s*\(\s*<SupabaseSetupModal/,
    'SupabaseSetupModal must only mount inside PLATFORM_SUPER_ADMIN portal'
  );
  assert.match(
    appSource,
    /hasPerm\('lingxing:manage'\)/,
    'Tenant admins must retain Lingxing MCP quick entry in header'
  );
  assert.equal(
    /lingxingMcp(Key|Url)/.test(modalSource),
    false,
    'Super Admin DB/Auth modal must not mix tenant Lingxing MCP credentials'
  );
  assert.equal(
    /setByodUrl|logtoEndpoint/.test(tenantSettingsSource),
    false,
    'TenantWorkspaceSettingsView must not allow editing DB URLs or auth providers'
  );
});

test('02-db-auth-rbac: end-to-end login authentication, PBKDF2/HMAC signing, one-time setup lock, and Worker 401/403 guards (AUTH-ADV-08)', async () => {
  resetAuthServiceStateForTest();
  resetWorkerRuntimeDbConfigForTest();
  try {
    // 1. Client auth module must never touch localStorage or sessionStorage
    const authClientSource = fs.readFileSync('src/services/authClient.ts', 'utf8');
    assert.equal(/\b(localStorage|sessionStorage)\b/.test(authClientSource), false);

    // 2. PBKDF2-SHA256 salted password hashing & constant-time verification
    const hashA = await hashPassword('StrongPass#2026');
    const hashB = await hashPassword('StrongPass#2026');
    assert.ok(hashA.startsWith('pbkdf2_sha256$100000$'));
    assert.notEqual(hashA, hashB, 'Same password must produce distinct random salts');
    assert.equal(await verifyPassword('StrongPass#2026', hashA), true);
    assert.equal(await verifyPassword('WrongPass#2026', hashA), false);

    // 3. HMAC-SHA256 session token signing, tamper detection, and expiration
    const secret = 'test_hmac_session_secret_at_least_32_chars';
    const issued = await createSignedSessionToken(
      {
        id: 'usr-1',
        email: 'admin@x-cloud-erp.example.com',
        fullName: 'Super Admin',
        role: 'PLATFORM_SUPER_ADMIN',
        authProvider: 'LOCAL_DB',
      },
      secret,
      3600
    );
    const verified = await verifySignedSessionToken(issued.token, secret);
    assert.equal(verified?.email, 'admin@x-cloud-erp.example.com');
    assert.equal(verified?.role, 'PLATFORM_SUPER_ADMIN');
    assert.equal(await verifySignedSessionToken(`${issued.token}tamper`, secret), null);
    assert.equal(await verifySignedSessionToken(issued.token, 'wrong_secret_value_12345'), null);
    assert.equal(
      await verifySignedSessionToken(issued.token, secret, Date.now() + 3601 * 1000),
      null
    );

    // 4. First-run admin claim locks permanently after initial registration
    const env = { AUTH_SESSION_SECRET: secret };
    const statusBefore = await handleWorkerRequest(
      new Request('https://xclouderp.workers.dev/api/auth/status'),
      env
    );
    assert.equal(statusBefore.status, 200);
    const statusBeforeJson = (await statusBefore.json()) as { needsInitialSetup: boolean };
    assert.equal(statusBeforeJson.needsInitialSetup, true);

    const setupRes = await handleWorkerRequest(
      new Request('https://xclouderp.workers.dev/api/auth/setup-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'owner@x-cloud-erp.example.com',
          fullName: 'Platform Owner',
          password: 'Initial#Password99',
        }),
      }),
      env
    );
    assert.equal(setupRes.status, 200);
    const setupJson = (await setupRes.json()) as {
      ok: boolean;
      token: string;
      user: { email: string; role: string; passwordHash?: string };
    };
    assert.equal(setupJson.ok, true);
    assert.equal(setupJson.user.role, 'PLATFORM_SUPER_ADMIN');
    assert.equal(setupJson.user.passwordHash, undefined, 'Password hash must never leak in response');

    const secondSetupRes = await handleWorkerRequest(
      new Request('https://xclouderp.workers.dev/api/auth/setup-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'hacker@x-cloud-erp.example.com',
          password: 'Hacker#Password99',
        }),
      }),
      env
    );
    assert.equal(secondSetupRes.status, 409);

    // 5. Protected routes reject unauthenticated calls with 401 and allow verified Bearer tokens
    const unauthBoot = await handleWorkerRequest(
      new Request('https://xclouderp.workers.dev/api/erp/bootstrap'),
      env
    );
    assert.equal(unauthBoot.status, 401);

    const unauthDbWrite = await handleWorkerRequest(
      new Request('https://xclouderp.workers.dev/api/platform/db-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalMode: 'PLATFORM_SUPER_ADMIN', projectUrl: 'https://x.supabase.co', anonKey: 'k' }),
      }),
      env
    );
    assert.equal(unauthDbWrite.status, 401);

    const meRes = await handleWorkerRequest(
      new Request('https://xclouderp.workers.dev/api/auth/me', {
        headers: { Authorization: `Bearer ${setupJson.token}` },
      }),
      env
    );
    assert.equal(meRes.status, 200);

    // 6. Password change invalidates old password and enables new password
    const pwdChange = await changeAccountPassword(env, undefined, {
      id: 'usr-owner',
      email: 'owner@x-cloud-erp.example.com',
      fullName: 'Platform Owner',
      role: 'PLATFORM_SUPER_ADMIN',
      authProvider: 'LOCAL_DB',
    }, {
      currentPassword: 'Initial#Password99',
      newPassword: 'Rotated#Password88',
    });
    assert.equal(pwdChange.ok, true);

    const oldLogin = await authenticateCredentials(env, undefined, {
      email: 'owner@x-cloud-erp.example.com',
      password: 'Initial#Password99',
    });
    assert.equal(oldLogin.ok, false);
    const newLogin = await authenticateCredentials(env, undefined, {
      email: 'owner@x-cloud-erp.example.com',
      password: 'Rotated#Password88',
    });
    assert.equal(newLogin.ok, true);

    // 7. Tenant-role token is blocked with 403 on POST /api/platform/db-config even if portalMode is spoofed
    const tenantIssued = await createSignedSessionToken(
      {
        id: 'usr-tenant-1',
        email: 'ops@seller.example.com',
        fullName: 'Tenant Ops',
        role: 'TENANT_USER',
        tenantId: 'tenant-alpha-01',
        authProvider: 'LOCAL_DB',
      },
      secret,
      3600
    );
    const tenantDbWrite = await handleWorkerRequest(
      new Request('https://xclouderp.workers.dev/api/platform/db-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantIssued.token}`,
        },
        body: JSON.stringify({
          portalMode: 'PLATFORM_SUPER_ADMIN',
          projectUrl: 'https://evil.supabase.co',
          anonKey: 'k',
        }),
      }),
      env
    );
    assert.equal(tenantDbWrite.status, 403);
  } finally {
    resetAuthServiceStateForTest();
    resetWorkerRuntimeDbConfigForTest();
  }
});

