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

