import type { DomainAuditSuite, AuditViolation } from './types';
import {
  canAccessPortal,
  resolveMemberPermissions,
  filterByShopScope,
  checkTenantQuota,
  validateTenantSlug,
  resolveTenantByPathSlug,
  canTenantInstallModule,
  isModuleEnabledForTenant,
  generateTenantSchemaSql,
  isValidImpersonationSession,
  evaluateMcpAccess,
} from '../../src/lib/erpEngine';
import {
  INITIAL_RBAC_ROLES,
  INITIAL_TEAM_MEMBERS,
  INITIAL_TENANTS,
  SUBSCRIPTION_PLANS,
  INITIAL_LISTINGS,
  INITIAL_APP_MODULES,
  INITIAL_INSTALLED_MODULES,
} from '../../src/data/initialErpData';
import {
  authenticateCredentials,
  buildSessionCookieHeader,
  createSignedSessionToken,
  extractSessionTokenFromCookie,
  hashPassword,
  resetAuthServiceStateForTest,
  setupInitialAdminAccount,
  verifyPassword,
  verifyRequestAuth,
  verifySignedSessionToken,
} from '../../src/services/authService';

const DOMAIN = '02-db-auth-and-rbac';
const DOC_PATH = 'docs/02-db-auth-and-rbac.md';

export const dbAuthRbacAuditSuite: DomainAuditSuite = {
  domain: DOMAIN,
  name: '多租户数据库、双模认证与企业 RBAC 权限域',
  docPath: DOC_PATH,
  triggerPatterns: [
    /^src\/types\/erp\.ts$/,
    /^src\/lib\/erpEngine\.ts$/,
    /^src\/data\/initialErpData\.ts$/,
    /^src\/components\/SuperAdminConsoleView\.tsx$/,
    /^src\/components\/SupabaseSetupModal\.tsx$/,
    /^src\/components\/RbacPermissionCenterView\.tsx$/,
    /^src\/components\/TenantSubscriptionView\.tsx$/,
    /^src\/components\/TenantAppMarketplaceView\.tsx$/,
    /^src\/components\/TenantWorkspaceSettingsView\.tsx$/,
    /^src\/components\/LoginGateView\.tsx$/,
    /^src\/services\/authService\.ts$/,
    /^src\/services\/authClient\.ts$/,
    /^src\/App\.tsx$/,
    /^server\.ts$/,
    /^worker\.ts$/,
    /^docs\/02-db-auth-and-rbac\.md$/,
    /^scripts\/audits\/02-/,
  ],
  unitTestFiles: ['test/02-db-auth-rbac.test.ts'],
  rules: [
    {
      id: 'AUTH-ADV-01',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'Supabase SQL Schema 必须包含 RLS 开启、超管鉴权函数与租户可写锁函数',
      historicalContext:
        '遗漏 ENABLE ROW LEVEL SECURITY 或 is_tenant_writable() 会导致跨租户串读与过期绕过前端直接写库。',
      remediation:
        '确保 SUPABASE_MULTI_TENANT_SQL_SCHEMA 包含 ENABLE ROW LEVEL SECURITY、is_platform_super_admin() 与 is_tenant_writable()。',
      check(ctx) {
        const dataCode = ctx.readFile('src/data/initialErpData.ts');
        const missing: string[] = [];
        if (!/ENABLE ROW LEVEL SECURITY/.test(dataCode)) missing.push('ENABLE ROW LEVEL SECURITY');
        if (!/is_platform_super_admin\s*\(/.test(dataCode)) missing.push('is_platform_super_admin()');
        if (!/is_tenant_writable\s*\(/.test(dataCode)) missing.push('is_tenant_writable()');
        if (
          !/GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLE\s+public\.erp_domain_records\s+TO\s+anon,\s*authenticated/i.test(
            dataCode
          )
        ) {
          missing.push('GRANT ... ON TABLE public.erp_domain_records TO anon, authenticated');
        }
        if (missing.length > 0) {
          return [
            {
              ruleId: 'AUTH-ADV-01',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `多租户 RLS SQL 缺失关键安全或授权构件: ${missing.join(', ')}`,
              historicalContext:
                '数据库内核级 RLS 策略是多租户隔离的最后一道防线；同时 Supabase 新建表必须显式 GRANT 给 anon/authenticated，否则客户端读写直接触发 PostgreSQL 42501 permission denied。',
              file: 'src/data/initialErpData.ts',
              remediation: `补齐缺失 SQL 定义: ${missing.join(', ')}。`,
            },
          ];
        }
        return [];
      },
    },
    {
      id: 'AUTH-ADV-02',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '平台超管控制台与租户自助订阅视图必须物理分离，严禁残留混杂组件',
      historicalContext:
        '历史版本将平台租户管理和租户订阅混置于 SaasTenantBillingView.tsx，存在租户越权查看其他卖家信息的风险。',
      remediation:
        '保持 SuperAdminConsoleView.tsx 与 TenantSubscriptionView.tsx 独立存在，并确保已移除 SaasTenantBillingView.tsx。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        if (!ctx.fileExists('src/components/SuperAdminConsoleView.tsx')) {
          violations.push({
            ruleId: 'AUTH-ADV-02',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: '缺失独立超管门户组件 SuperAdminConsoleView.tsx',
            historicalContext: '超管功能必须独立归口于 Portal A。',
            file: 'src/components/SuperAdminConsoleView.tsx',
            remediation: '恢复 src/components/SuperAdminConsoleView.tsx。',
          });
        }
        if (!ctx.fileExists('src/components/TenantSubscriptionView.tsx')) {
          violations.push({
            ruleId: 'AUTH-ADV-02',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: '缺失独立租户订阅组件 TenantSubscriptionView.tsx',
            historicalContext: '租户订阅视图必须与超管解耦。',
            file: 'src/components/TenantSubscriptionView.tsx',
            remediation: '恢复 src/components/TenantSubscriptionView.tsx。',
          });
        }
        if (ctx.fileExists('src/components/SaasTenantBillingView.tsx')) {
          violations.push({
            ruleId: 'AUTH-ADV-02',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: '检测到已废弃的超管/租户混杂组件 SaasTenantBillingView.tsx',
            historicalContext: '混杂组件会造成权限边界模糊与越权风险。',
            file: 'src/components/SaasTenantBillingView.tsx',
            remediation: '删除 src/components/SaasTenantBillingView.tsx。',
          });
        }
        return violations;
      },
    },
    {
      id: 'AUTH-ADV-03',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'src/App.tsx 必须对核心店铺数据实体调用 filterByShopScope',
      historicalContext:
        '遗漏店铺行级过滤会导致北美运营专员看到德国/日本站点营收与订单明细。',
      remediation:
        '在 src/App.tsx 中对 listings、orders、adCampaigns、settlements 调用 filterByShopScope(..., activeMember)。',
      check(ctx) {
        const appCode = ctx.readFile('src/App.tsx');
        const matches = appCode.match(/filterByShopScope\s*\(/g) || [];
        if (matches.length < 4) {
          return [
            {
              ruleId: 'AUTH-ADV-03',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `src/App.tsx 中 filterByShopScope 覆盖不足 (当前 ${matches.length} 处，要求 >= 4 处)`,
              historicalContext: '所有按 shopId 隔离的业务列表必须统一经过专人专店过滤器。',
              file: 'src/App.tsx',
              remediation:
                '确保 listings、orders、adCampaigns、settlements 均调用 filterByShopScope。',
            },
          ];
        }
        return [];
      },
    },
    {
      id: 'AUTH-ADV-04',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'ALL_PERMISSIONS_TREE 权限码与 PermissionCode 联合类型必须 100% 同步',
      historicalContext: '权限码拼写漂移会导致 RBAC 树勾选后按钮权限永远无法命中。',
      remediation: '同步 src/types/erp.ts 的 PermissionCode 与 src/data/initialErpData.ts 的 ALL_PERMISSIONS_TREE。',
      check(ctx) {
        const typesCode = ctx.readFile('src/types/erp.ts');
        const dataCode = ctx.readFile('src/data/initialErpData.ts');
        const unionMatch = /export\s+type\s+PermissionCode\s*=([\s\S]*?);/.exec(typesCode);
        const declared = new Set<string>();
        if (unionMatch) {
          const codes = unionMatch[1].match(/'([a-z0-9_:]+)'/g) || [];
          codes.forEach((c) => declared.add(c.replace(/'/g, '')));
        }
        const treeMatch = /export\s+const\s+ALL_PERMISSIONS_TREE[\s\S]*?=\s*\[([\s\S]*?)\];/.exec(
          dataCode
        );
        const treeCodes = new Set<string>();
        if (treeMatch) {
          const matches = treeMatch[1].match(/code:\s*'([a-z0-9_:]+)'/g) || [];
          matches.forEach((m) => treeCodes.add(m.replace(/code:\s*'([^']+)'/, '$1')));
        }
        const violations: AuditViolation[] = [];
        for (const code of declared) {
          if (!treeCodes.has(code)) {
            violations.push({
              ruleId: 'AUTH-ADV-04',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `PermissionCode '${code}' 未注册至 ALL_PERMISSIONS_TREE`,
              historicalContext: '漏注册权限码会导致租户管理员在权限树中无法分配该权限。',
              file: 'src/data/initialErpData.ts',
              remediation: `在 ALL_PERMISSIONS_TREE 中添加权限码 '${code}'。`,
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'AUTH-ADV-05',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '应用市场模块启停必须实现前端菜单过滤与后端网关 HTTP 403 MODULE_NOT_ENABLED 双向守卫',
      historicalContext:
        '仅在前端隐藏停用模块菜单而不在 server.ts 拦截调用，会导致未购买高阶模块的租户直接请求 /api/mcp 绕过付费边界。',
      remediation:
        '确保 server.ts 返回 MODULE_NOT_ENABLED (HTTP 403) 且 src/App.tsx 使用 isModuleEnabledForTenant 过滤可见菜单。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const serverCode = ctx.readFile('server.ts');
        const appCode = ctx.readFile('src/App.tsx');
        if (!/MODULE_NOT_ENABLED/.test(serverCode)) {
          violations.push({
            ruleId: 'AUTH-ADV-05',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'server.ts 缺失应用市场模块停用拦截 (MODULE_NOT_ENABLED)',
            historicalContext: '后端网关必须拒绝已停用 mod_mcp_gateway 模块的租户调用。',
            file: 'server.ts',
            remediation: '在 /api/lingxing/mcp-proxy 与 /api/mcp 校验模块启停并返回 HTTP 403 MODULE_NOT_ENABLED。',
          });
        }
        if (!/isModuleEnabledForTenant\s*\(/.test(appCode)) {
          violations.push({
            ruleId: 'AUTH-ADV-05',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/App.tsx 未使用 isModuleEnabledForTenant 过滤租户侧边栏模块',
            historicalContext: '停用模块后必须立即从租户工作台导航移除入口。',
            file: 'src/App.tsx',
            remediation: '在 src/App.tsx 的 visibleTenantMenuItems 中加入 isModuleEnabledForTenant 校验。',
          });
        }
        return violations;
      },
    },
    {
      id: 'AUTH-ADV-06',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '审计代管模式必须提供显式退出横幅，且自动化租户开户必须校验路径保留字',
      historicalContext:
        '缺少代管顶部横幅易导致超管误改真实卖家数据；缺少 slug 保留字拦截会引发 /t/admin 与平台路由冲突。',
      remediation:
        '在 src/App.tsx 中使用 isValidImpersonationSession 渲染带退出按钮的代管横幅，并在 SuperAdminConsoleView.tsx 中使用 validateTenantSlug。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const appCode = ctx.readFile('src/App.tsx');
        const superCode = ctx.readFile('src/components/SuperAdminConsoleView.tsx');
        if (
          !/isValidImpersonationSession\s*\(/.test(appCode) ||
          !/handleExitImpersonation/.test(appCode)
        ) {
          violations.push({
            ruleId: 'AUTH-ADV-06',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/App.tsx 缺失受审代管会话状态校验或退出代管动作',
            historicalContext: '超管代管租户时必须保持醒目横幅并允许一键安全退回中央面板。',
            file: 'src/App.tsx',
            remediation: '在 src/App.tsx 校验 isValidImpersonationSession 并挂载 handleExitImpersonation 横幅。',
          });
        }
        if (!/validateTenantSlug\s*\(/.test(superCode)) {
          violations.push({
            ruleId: 'AUTH-ADV-06',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'SuperAdminConsoleView.tsx 自动化开户未调用 validateTenantSlug',
            historicalContext: '租户路径标识必须校验长度、字符集、保留字与唯一性。',
            file: 'src/components/SuperAdminConsoleView.tsx',
            remediation: '在开户表单中引入并实时调用 validateTenantSlug(provSlug, tenants)。',
          });
        }
        return violations;
      },
    },
    {
      id: 'AUTH-ADV-07',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '数据库连接与登录认证引擎配置必须严格收口至平台超管，严禁暴露给租户工作台',
      historicalContext:
        '历史版本在顶栏无条件暴露 Supabase & 认证配置弹窗且允许租户设置页修改 BYOD 数据库地址，导致租户管理员与普通员工可越权篡改平台数据库与认证方式。',
      remediation:
        '确保 src/App.tsx 仅在 portalMode === PLATFORM_SUPER_ADMIN 下挂载 SupabaseSetupModal，弹窗剥离租户领星密钥，且 TenantWorkspaceSettingsView 移除可编辑数据库地址。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const appCode = ctx.readFile('src/App.tsx');
        const modalCode = ctx.readFile('src/components/SupabaseSetupModal.tsx');
        const tenantSettingsCode = ctx.readFile('src/components/TenantWorkspaceSettingsView.tsx');

        if (!/portalMode\s*===\s*'PLATFORM_SUPER_ADMIN'\s*&&\s*\(\s*<SupabaseSetupModal/.test(appCode)) {
          violations.push({
            ruleId: 'AUTH-ADV-07',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/App.tsx 未将 SupabaseSetupModal 严格限制在 PLATFORM_SUPER_ADMIN 门户下挂载',
            historicalContext: '数据库与登录认证弹窗必须从条件渲染与 DOM 层彻底与租户工作台隔离。',
            file: 'src/App.tsx',
            remediation: "使用 {portalMode === 'PLATFORM_SUPER_ADMIN' && (<SupabaseSetupModal ... />)} 守卫弹窗渲染。",
          });
        }
        if (/lingxingMcp(Key|Url)/.test(modalCode)) {
          violations.push({
            ruleId: 'AUTH-ADV-07',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'SupabaseSetupModal.tsx 混入了租户领星 MCP 密钥表单',
            historicalContext: '平台数据库/认证配置弹窗严禁与租户业务数据源凭证耦合。',
            file: 'src/components/SupabaseSetupModal.tsx',
            remediation: '移除弹窗中的 lingxingMcpUrl/lingxingMcpKey 字段，租户领星配置归口至 LingxingMcpConnectorView。',
          });
        }
        if (/setByodUrl|logtoEndpoint|authMode/.test(tenantSettingsCode)) {
          violations.push({
            ruleId: 'AUTH-ADV-07',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'TenantWorkspaceSettingsView.tsx 暴露了可编辑的数据库地址或认证引擎配置',
            historicalContext: 'BYOD 数据库地址与全局认证方式仅允许平台超管在超管控制台维护。',
            file: 'src/components/TenantWorkspaceSettingsView.tsx',
            remediation: '移除 setByodUrl 等数据库/认证编辑表单，仅保留只读隔离状态提示。',
          });
        }
        return violations;
      },
    },
    {
      id: 'AUTH-ADV-08',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '系统必须启用全链路登录验证：服务端 PBKDF2/HMAC 签名鉴权、首启一次注册锁定、双网关 401 拦截与纯内存前端 Token',
      historicalContext:
        '未启用登录门禁时，任何访问者均可免密直连全平台 /api/erp/*、领星同步与数据库配置写接口；若前端将 Bearer Token 落入 localStorage 还会放大 XSS 窃取风险。',
      remediation:
        '保留 src/services/authService.ts、src/services/authClient.ts（禁用 localStorage/sessionStorage）、src/components/LoginGateView.tsx，并在 server.ts、worker.ts 与 src/App.tsx 中完整执行 /api/auth/* 与 requireAuthenticatedSession 守卫。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const requiredFiles = [
          'src/services/authService.ts',
          'src/services/authClient.ts',
          'src/components/LoginGateView.tsx',
        ];
        for (const f of requiredFiles) {
          if (!ctx.fileExists(f)) {
            violations.push({
              ruleId: 'AUTH-ADV-08',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `缺失登录认证核心模块: ${f}`,
              historicalContext: '登录验证体系必须包含服务端鉴权内核、客户端内存态令牌模块与登录门禁视图。',
              file: f,
              remediation: `创建并恢复 ${f}。`,
            });
          }
        }
        if (violations.length > 0) return violations;

        const authClientCode = ctx.readFile('src/services/authClient.ts');
        if (/\b(localStorage|sessionStorage)\b/.test(authClientCode)) {
          violations.push({
            ruleId: 'AUTH-ADV-08',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/services/authClient.ts 违规使用 localStorage/sessionStorage 持久化认证 Token',
            historicalContext: '浏览器明文持久化 Bearer Token 在同源脚本风险下会被直接窃取。',
            file: 'src/services/authClient.ts',
            remediation: '仅在模块运行内存中保存 Bearer Token，移除所有 localStorage/sessionStorage 调用。',
          });
        }

        const appCode = ctx.readFile('src/App.tsx');
        if (
          !/<LoginGateView\b/.test(appCode) ||
          !/logoutAuthSession/.test(appCode) ||
          !/fetchCurrentAuthUser/.test(appCode)
        ) {
          violations.push({
            ruleId: 'AUTH-ADV-08',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/App.tsx 未挂载 LoginGateView 登录门禁、缺少 fetchCurrentAuthUser 刷新会话恢复或 logoutAuthSession 退出流',
            historicalContext: '未登录用户严禁进入 ERP 主工作台，已登录用户刷新页面后必须通过 HttpOnly Cookie 自动恢复会话而非重复登录。',
            file: 'src/App.tsx',
            remediation: '在 src/App.tsx 中挂载 <LoginGateView />，启动时调用 fetchCurrentAuthUser 恢复会话，并接入 logoutAuthSession。',
          });
        }

        const serverCode = ctx.readFile('server.ts');
        const workerCode = ctx.readFile('worker.ts');
        const requiredGatewayTokens = [
          '/api/auth/status',
          '/api/auth/setup-admin',
          '/api/auth/login',
          '/api/auth/me',
          'requireAuthenticatedSession',
          'AUTH_REQUIRED',
        ];
        for (const [label, code] of [
          ['server.ts', serverCode],
          ['worker.ts', workerCode],
        ] as const) {
          const missing = requiredGatewayTokens.filter((t) => !code.includes(t));
          if (missing.length > 0) {
            violations.push({
              ruleId: 'AUTH-ADV-08',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `${label} 缺失服务端认证路由或 401 鉴权守卫: ${missing.join(', ')}`,
              historicalContext: 'Node Express 与 Cloudflare Workers 必须对等执行登录验证与受保护 API 拦截。',
              file: label,
              remediation: `在 ${label} 中补齐 /api/auth/* 路由与 requireAuthenticatedSession 守卫。`,
            });
          }
        }
        return violations;
      },
    },
  ],
  async verify() {
    const violations: AuditViolation[] = [];
    // 1. Portal isolation boundary
    if (canAccessPortal('TENANT_WORKSPACE', 'PLATFORM_SUPER_ADMIN')) {
      violations.push({
        ruleId: 'AUTH-ADV-02',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: TENANT_WORKSPACE 越权通过了超管门户校验',
        historicalContext: '跨门户越权是最高危多租户安全漏洞。',
        file: 'src/lib/erpEngine.ts',
        remediation: '确保 canAccessPortal 严格相等校验。',
      });
    }
    // 2. Disabled member & cross-tenant role spoofing
    const disabledMember = { ...INITIAL_TEAM_MEMBERS[0], status: 'DISABLED' as const };
    if (resolveMemberPermissions(disabledMember, INITIAL_RBAC_ROLES).size !== 0) {
      violations.push({
        ruleId: 'AUTH-ADV-04',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: DISABLED 成员依然解析出了权限',
        historicalContext: '已停用离职员工必须零权限。',
        file: 'src/lib/erpEngine.ts',
        remediation: '在 resolveMemberPermissions 中拦截 status !== ACTIVE。',
      });
    }
    // 3. Shop scope leak test for non-admin US-only operator
    const usOperator = INITIAL_TEAM_MEMBERS.find((m) => m.roleCode === 'AMAZON_OPERATOR')!;
    const filtered = filterByShopScope(INITIAL_LISTINGS, usOperator);
    const leaked = filtered.filter((l) => !usOperator.allowedShopIds.includes(l.shopId));
    if (leaked.length > 0) {
      violations.push({
        ruleId: 'AUTH-ADV-03',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: `内存故障注入失败: 专人专店过滤器泄漏了 ${leaked.length} 条非授权店铺记录`,
        historicalContext: '运营专员只能访问 allowedShopIds 内的店铺。',
        file: 'src/lib/erpEngine.ts',
        remediation: '检查 filterByShopScope 过滤逻辑。',
      });
    }
    // 4. Quota overflow check
    const freePlan = SUBSCRIPTION_PLANS.find((p) => p.planCode === 'FREE')!;
    const overloadedTenant = { ...INITIAL_TENANTS[0], usedUsersCount: freePlan.maxUsers };
    if (checkTenantQuota(overloadedTenant, freePlan, 'USERS').allowed) {
      violations.push({
        ruleId: 'AUTH-ADV-01',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: 满额席位租户未被 checkTenantQuota 拦截',
        historicalContext: '配额守卫必须阻断超套餐上限的新增账号操作。',
        file: 'src/lib/erpEngine.ts',
        remediation: '修复 checkTenantQuota 边界比较 (>=)。',
      });
    }
    // 5. Modular entitlement & MCP HTTP 403 MODULE_NOT_ENABLED check
    const mcpMod = INITIAL_APP_MODULES.find((m) => m.moduleCode === 'mod_mcp_gateway')!;
    if (canTenantInstallModule('FREE', mcpMod).allowed) {
      violations.push({
        ruleId: 'AUTH-ADV-05',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: FREE 套餐越权通过了 PRO 级模块安装门槛',
        historicalContext: '低套餐租户不得绕过 minPlanCode 安装高阶付费模块。',
        file: 'src/lib/erpEngine.ts',
        remediation: '校验 PLAN_TIER_RANK[planCode] < PLAN_TIER_RANK[moduleDef.minPlanCode]。',
      });
    }
    const mcpDisabledRes = evaluateMcpAccess({
      tenantStatus: 'ACTIVE',
      permissionScope: 'READ_WRITE',
      quotaRemaining: 100,
      toolName: 'get_asin_profit_breakdown',
      mcpModuleEnabled: false,
    });
    if (mcpDisabledRes.allowed || mcpDisabledRes.httpStatus !== 403) {
      violations.push({
        ruleId: 'AUTH-ADV-05',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: 停用 mod_mcp_gateway 后 evaluateMcpAccess 未返回 403',
        historicalContext: '模块停用后必须立即阻断下游 MCP 工具执行。',
        file: 'src/lib/erpEngine.ts',
        remediation: '在 evaluateMcpAccess 中检查 mcpModuleEnabled === false 并返回 403。',
      });
    }
    if (
      isModuleEnabledForTenant(
        'tenant-beta-02',
        'mod_ads_dayparting',
        INITIAL_INSTALLED_MODULES,
        INITIAL_APP_MODULES
      )
    ) {
      violations.push({
        ruleId: 'AUTH-ADV-05',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: Beta 租户未安装 mod_ads_dayparting 却判定为已启用',
        historicalContext: '未安装模块必须严格返回 false。',
        file: 'src/lib/erpEngine.ts',
        remediation: '检查 isModuleEnabledForTenant 租户匹配逻辑。',
      });
    }
    // 6. Reserved slug rejection, path resolution, Schema SQL & Impersonation check
    if (validateTenantSlug('admin', INITIAL_TENANTS).valid) {
      violations.push({
        ruleId: 'AUTH-ADV-06',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: 平台保留字 slug [admin] 未被拦截',
        historicalContext: '保留字会破坏单域名路径路由 /t/{slug} 隔离。',
        file: 'src/lib/erpEngine.ts',
        remediation: '在 validateTenantSlug 中拒绝平台保留字。',
      });
    }
    if (!resolveTenantByPathSlug('alpha', INITIAL_TENANTS)) {
      violations.push({
        ruleId: 'AUTH-ADV-06',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: resolveTenantByPathSlug 未命中合法租户 alpha',
        historicalContext: '统一路径路由必须可靠解析已激活租户。',
        file: 'src/lib/erpEngine.ts',
        remediation: '检查 resolveTenantByPathSlug 匹配条件。',
      });
    }
    const schemaSql = generateTenantSchemaSql(INITIAL_TENANTS[0]);
    if (!schemaSql.includes('CREATE SCHEMA IF NOT EXISTS')) {
      violations.push({
        ruleId: 'AUTH-ADV-06',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: generateTenantSchemaSql 未生成标准 Schema DDL',
        historicalContext: 'SCHEMA_PER_TENANT 租户依赖标准独立 Schema DDL 初始化。',
        file: 'src/lib/erpEngine.ts',
        remediation: '修复 generateTenantSchemaSql 输出模板。',
      });
    }
    if (
      isValidImpersonationSession(
        {
          sessionId: 'IMP-FAKE',
          platformAdminName: 'Admin',
          targetTenantId: 'non-existent-tenant',
          targetTenantCode: 'FAKE',
          targetTenantSlug: 'fake',
          startedAt: '2026-11-25',
        },
        INITIAL_TENANTS
      )
    ) {
      violations.push({
        ruleId: 'AUTH-ADV-06',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: 指向不存在租户的伪造代管会话通过了校验',
        historicalContext: '代管会话必须严格指向已注册租户。',
        file: 'src/lib/erpEngine.ts',
        remediation: '检查 isValidImpersonationSession 租户存在性验证。',
      });
    }
    // 7. Memory fault injection for AUTH-ADV-08: PBKDF2 hashing, HMAC session tamper/expiry, and one-time admin claim lock
    resetAuthServiceStateForTest();
    try {
      const hash = await hashPassword('XCloud#Strong99');
      const okPwd = await verifyPassword('XCloud#Strong99', hash);
      const badPwd = await verifyPassword('WrongPass!00', hash);
      const signingKey = 'unit_audit_signing_secret_32bytes_min';
      const minted = await createSignedSessionToken(
        {
          id: 'usr-audit-1',
          email: 'admin@x-cloud-erp.example.com',
          fullName: 'Audit Admin',
          role: 'PLATFORM_SUPER_ADMIN',
          authProvider: 'LOCAL_DB',
        },
        signingKey,
        3600
      );
      const verified = await verifySignedSessionToken(minted.token, signingKey);
      const tampered = await verifySignedSessionToken(`${minted.token}x`, signingKey);
      const expired = await verifySignedSessionToken(
        minted.token,
        signingKey,
        Date.now() + 7200 * 1000
      );

      const firstClaim = await setupInitialAdminAccount(
        { AUTH_SESSION_SECRET: signingKey },
        undefined,
        {
          email: 'owner@x-cloud-erp.example.com',
          fullName: 'Owner Admin',
          password: 'Owner#Password2026',
        }
      );
      const secondClaim = await setupInitialAdminAccount(
        { AUTH_SESSION_SECRET: signingKey },
        undefined,
        {
          email: 'attacker@x-cloud-erp.example.com',
          fullName: 'Attacker',
          password: 'Attacker#Password2026',
        }
      );
      const loginOk = await authenticateCredentials(
        { AUTH_SESSION_SECRET: signingKey },
        undefined,
        {
          email: 'owner@x-cloud-erp.example.com',
          password: 'Owner#Password2026',
        }
      );
      const loginBad = await authenticateCredentials(
        { AUTH_SESSION_SECRET: signingKey },
        undefined,
        {
          email: 'owner@x-cloud-erp.example.com',
          password: 'WrongPassword2026',
        }
      );

      const httpsCookieHeader = buildSessionCookieHeader(minted.token, { isHttps: true });
      const extractedCookieToken = extractSessionTokenFromCookie(httpsCookieHeader.split(';')[0]);
      const cookieGetSession = await verifyRequestAuth(
        {
          cookieHeader: httpsCookieHeader.split(';')[0],
          method: 'GET',
        },
        { AUTH_SESSION_SECRET: signingKey }
      );
      const cookiePostNoCsrf = await verifyRequestAuth(
        {
          cookieHeader: httpsCookieHeader.split(';')[0],
          method: 'POST',
        },
        { AUTH_SESSION_SECRET: signingKey }
      );
      const cookiePostWithXhr = await verifyRequestAuth(
        {
          cookieHeader: httpsCookieHeader.split(';')[0],
          method: 'POST',
          requestedWithHeader: 'XMLHttpRequest',
        },
        { AUTH_SESSION_SECRET: signingKey }
      );

      if (
        !hash.startsWith('pbkdf2_sha256$') ||
        !okPwd ||
        badPwd ||
        !verified ||
        verified.email !== 'admin@x-cloud-erp.example.com' ||
        tampered !== null ||
        expired !== null ||
        !firstClaim.ok ||
        secondClaim.ok ||
        secondClaim.status !== 409 ||
        !loginOk.ok ||
        loginBad.ok ||
        loginBad.status !== 401 ||
        !httpsCookieHeader.includes('HttpOnly') ||
        !httpsCookieHeader.includes('Secure') ||
        !httpsCookieHeader.includes('SameSite=None') ||
        !httpsCookieHeader.includes('Partitioned') ||
        extractedCookieToken !== minted.token ||
        cookieGetSession?.email !== 'admin@x-cloud-erp.example.com' ||
        cookiePostNoCsrf !== null ||
        cookiePostWithXhr?.email !== 'admin@x-cloud-erp.example.com'
      ) {
        violations.push({
          ruleId: 'AUTH-ADV-08',
          domain: DOMAIN,
          docPath: DOC_PATH,
          title: '内存故障注入失败: 登录密码哈希、HttpOnly Cookie 刷新恢复、CSRF 防护或首次管理员注册锁定异常',
          historicalContext: '登录认证引擎必须确保密码单向加盐校验、HttpOnly 签名 Cookie 刷新恢复、防伪造签名/CSRF 与一次性初始管理员注册锁定严格生效。',
          file: 'src/services/authService.ts',
          remediation: '检查 hashPassword、verifyPassword、buildSessionCookieHeader、verifyRequestAuth 与 setupInitialAdminAccount 实现。',
        });
      }
    } finally {
      resetAuthServiceStateForTest();
    }
    return violations;
  },
};
