import type { DomainAuditSuite, AuditViolation } from './types';
import { findLineNumber } from './types';
import {
  ALL_PERMISSIONS_TREE,
  INITIAL_RBAC_ROLES,
  INITIAL_LISTINGS,
  INITIAL_LOCAL_SKUS,
  INITIAL_SHOPS,
} from '../../src/data/initialErpData';

const DOMAIN = '04-frontend-ui-and-state';
const DOC_PATH = 'docs/04-frontend-ui-and-state.md';

export const frontendUiStateAuditSuite: DomainAuditSuite = {
  domain: DOMAIN,
  name: '前端视图架构、主题系统与状态一致性域',
  docPath: DOC_PATH,
  triggerPatterns: [
    /^src\/index\.css$/,
    /^src\/App\.tsx$/,
    /^src\/components\//,
    /^index\.html$/,
    /^metadata\.json$/,
    /^docs\/04-frontend-ui-and-state\.md$/,
    /^scripts\/audits\/04-/,
  ],
  unitTestFiles: ['test/04-frontend-ui.test.ts'],
  rules: [
    {
      id: 'UI-ADV-01',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'src/index.css 必须在 @import "tailwindcss"; 后声明 @custom-variant dark',
      historicalContext:
        'Tailwind CSS v4 默认遵循系统媒体查询，漏加 @custom-variant dark 会导致手动点击切换暗色模式完全失效。',
      remediation:
        '在 src/index.css 中紧随 @import "tailwindcss"; 声明 @custom-variant dark (&:where(.dark, .dark *));。',
      check(ctx) {
        const css = ctx.readFile('src/index.css');
        if (!/@import\s+["']tailwindcss["'];/.test(css) || !/@custom-variant\s+dark/.test(css)) {
          return [
            {
              ruleId: 'UI-ADV-01',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: 'src/index.css 缺少 Tailwind v4 @custom-variant dark 声明',
              historicalContext: '缺少该声明会导致类名驱动的深浅色切换彻底损坏。',
              file: 'src/index.css',
              remediation: '添加 @custom-variant dark (&:where(.dark, .dark *));。',
            },
          ];
        }
        return [];
      },
    },
    {
      id: 'UI-ADV-02',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '全仓源码与元数据严禁残留旧品牌词、旧前缀或未脱敏个人邮箱',
      historicalContext:
        '项目已完成品牌重塑为 X Cloud ERP 并全面脱敏，任何旧参考品牌字眼或个人真实邮箱回流均属合规事故。',
      remediation: '将相关文本替换为 X Cloud ERP / XC- / xcloud:// 或标准脱敏示例数据。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        // Construct prohibited brand/PII tokens dynamically to keep audit source clean
        const forbiddenTerms = [
          ['wim', 'oor'].join(''),
          ['anker', 'tech'].join(''),
          ['forhai', 'some@gmail.com'].join(''),
          ['wm_mcp', '_'].join(''),
        ];
        const regex = new RegExp(forbiddenTerms.join('|'), 'i');
        const targetFiles = [
          ...ctx.listFiles('src', /\.(ts|tsx|css)$/),
          'server.ts',
          'index.html',
          'metadata.json',
        ].filter((f) => ctx.fileExists(f));

        for (const relPath of targetFiles) {
          const content = ctx.readFile(relPath);
          const match = regex.exec(content);
          if (match) {
            violations.push({
              ruleId: 'UI-ADV-02',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `检测到未脱敏或已废弃品牌标识 (${relPath})`,
              historicalContext: '品牌重塑与数据脱敏要求全仓零旧品牌与个人隐私残留。',
              file: relPath,
              line: findLineNumber(content, match.index),
              snippet: content.slice(Math.max(0, match.index - 20), match.index + 40),
              remediation: '替换为 X Cloud ERP / XC- / 脱敏占位数据。',
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'UI-ADV-03',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '前端代码严禁调用阻塞式 window.alert() 或受限的 window.open()',
      historicalContext: 'IFrame 沙盒预览环境会静默吞掉 window.alert 与 window.open 导致交互失灵。',
      remediation: '使用页内非阻塞 Toast 提示或原生 DOM 下载/window.print()。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const srcFiles = ctx.listFiles('src', /\.(ts|tsx)$/);
        for (const relPath of srcFiles) {
          const content = ctx.readFile(relPath);
          const match = /\bwindow\.(alert|open)\s*\(/.exec(content);
          if (match) {
            violations.push({
              ruleId: 'UI-ADV-03',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `检测到被 IFrame 禁止的浏览器调用: ${match[0]}`,
              historicalContext: '原生弹窗和外链弹窗在沙盒容器中不可用。',
              file: relPath,
              line: findLineNumber(content, match.index),
              remediation: '改为使用页内状态提示或 Modal 组件。',
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'UI-ADV-04',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'src/App.tsx 必须完整装配全部 13 个双门户与 1:1 业务视图模块',
      historicalContext: '子页面组件若未挂载到 App.tsx 主路由会成为不可达的死代码。',
      remediation: '在 src/App.tsx 中导入并渲染全部 13 个核心视图组件。',
      check(ctx) {
        const appCode = ctx.readFile('src/App.tsx');
        const requiredViews = [
          'SuperAdminConsoleView',
          'RbacPermissionCenterView',
          'TenantSubscriptionView',
          'TenantAppMarketplaceView',
          'TenantWorkspaceSettingsView',
          'DashboardOverview',
          'AmazonOrdersAndListingsView',
          'InventorySupplyChainView',
          'WarehouseInventoryView',
          'FbaShipmentsView',
          'AdvertisingDaypartingView',
          'FinanceAccountingView',
          'McpAndCloudDeployView',
        ];
        const missing = requiredViews.filter(
          (name) => !new RegExp(`<${name}\\b`).test(appCode)
        );
        if (missing.length > 0) {
          return [
            {
              ruleId: 'UI-ADV-04',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `src/App.tsx 未挂载以下核心视图组件: ${missing.join(', ')}`,
              historicalContext: '1:1 ERP 子页面与双门户组件必须全部接入路由，杜绝孤岛代码。',
              file: 'src/App.tsx',
              remediation: `在 src/App.tsx 中导入并挂载: ${missing.join(', ')}。`,
            },
          ];
        }
        return [];
      },
    },
    {
      id: 'UI-ADV-05',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'src/App.tsx 必须同时实现移动端左折叠抽屉与桌面端左折叠图标栏',
      historicalContext:
        '固定宽度的侧边栏在移动端 (<1024px) 会直接挤压主视口导致表格截断与溢出；同时宽表 ERP 在桌面端需支持左折叠释放横向空间。',
      remediation:
        '在 src/App.tsx 中保留 mobileSidebarOpen（含 -translate-x-full / lg:translate-x-0）与 desktopSidebarCollapsed（含 lg:w-16）双端左折叠状态机。',
      check(ctx) {
        const appCode = ctx.readFile('src/App.tsx');
        const requiredTokens = [
          'mobileSidebarOpen',
          '-translate-x-full',
          'lg:translate-x-0',
          'desktopSidebarCollapsed',
          'lg:w-16',
        ];
        const missing = requiredTokens.filter((token) => !appCode.includes(token));
        if (missing.length > 0) {
          return [
            {
              ruleId: 'UI-ADV-05',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `src/App.tsx 缺少响应式左折叠侧边栏关键契约: ${missing.join(', ')}`,
              historicalContext:
                '缺失移动抽屉或桌面折叠态会导致窄屏布局挤压与宽表视口空间退化。',
              file: 'src/App.tsx',
              remediation: `补齐 src/App.tsx 中的响应式左折叠实现: ${missing.join(', ')}。`,
            },
          ];
        }
        return [];
      },
    },
    {
      id: 'UI-ADV-06',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '领星式首页驾驶舱、产品表现与运营工具台视图必须完整挂载且无死路由',
      historicalContext:
        '仿领星重构新增「统计 · 产品表现」与「工具 · 预警/试算/审批」两大工作台，以及驾驶舱全球站点时钟与三态断货监测，必须确保全部挂载至 App.tsx 主导航。',
      remediation:
        '确保 src/App.tsx 挂载 <ProductPerformanceView 与 <OperationsToolsView，且 DashboardOverview.tsx 保留 GLOBAL_SITE_CLOCKS 与 STOCKOUT_CERTAIN 监测契约。',
      check(ctx) {
        const appCode = ctx.readFile('src/App.tsx');
        const dashCode = ctx.readFile('src/components/DashboardOverview.tsx');
        const missing: string[] = [];
        if (!/<ProductPerformanceView\b/.test(appCode)) missing.push('<ProductPerformanceView>');
        if (!/<OperationsToolsView\b/.test(appCode)) missing.push('<OperationsToolsView>');
        if (!dashCode.includes('GLOBAL_SITE_CLOCKS')) missing.push('DashboardOverview:GLOBAL_SITE_CLOCKS');
        if (!dashCode.includes('STOCKOUT_CERTAIN')) missing.push('DashboardOverview:STOCKOUT_CERTAIN');
        if (missing.length > 0) {
          return [
            {
              ruleId: 'UI-ADV-06',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `领星式核心视图或驾驶舱契约缺失: ${missing.join(', ')}`,
              historicalContext: '新增统计与工具模块及驾驶舱核心指标不可退化为未挂载代码。',
              file: 'src/App.tsx',
              remediation: `补齐挂载与核心契约: ${missing.join(', ')}。`,
            },
          ];
        }
        return [];
      },
    },
    {
      id: 'UI-ADV-07',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '全站 10 个核心业务数据视图必须接入统一分页组件 TablePagination 与 useTablePagination',
      historicalContext:
        '当领星全量分页同步入库数百上千条 ASIN、订单、库存流水与广告词后，未分页列表或硬编码 .slice(0, 60) 会造成页面卡顿或后端已有数据无法在前端完整翻阅。',
      remediation:
        '保留 src/components/TablePagination.tsx，并确保全部 10 个核心数据视图导入并渲染 <TablePagination。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const compPath = 'src/components/TablePagination.tsx';
        if (!ctx.fileExists(compPath)) {
          return [
            {
              ruleId: 'UI-ADV-07',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: '缺少通用分页组件 src/components/TablePagination.tsx',
              historicalContext: '大表分页浏览需要统一的可复用分页栏与自动越界页码修正 Hook。',
              file: compPath,
              remediation: '创建并导出 TablePagination 与 useTablePagination。',
            },
          ];
        }
        const compCode = ctx.readFile(compPath);
        if (!/export\s+function\s+useTablePagination/.test(compCode) || !/export\s+const\s+TablePagination/.test(compCode)) {
          violations.push({
            ruleId: 'UI-ADV-07',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'TablePagination.tsx 缺少 useTablePagination 或 TablePagination 导出',
            historicalContext: '分页组件与 Hook 必须统一导出供所有业务视图复用。',
            file: compPath,
            remediation: '确保导出 useTablePagination 与 TablePagination。',
          });
        }
        const requiredPaginatedViews = [
          'src/components/DashboardOverview.tsx',
          'src/components/ProductPerformanceView.tsx',
          'src/components/AmazonOrdersAndListingsView.tsx',
          'src/components/InventorySupplyChainView.tsx',
          'src/components/WarehouseInventoryView.tsx',
          'src/components/FbaShipmentsView.tsx',
          'src/components/AdvertisingDaypartingView.tsx',
          'src/components/FinanceAccountingView.tsx',
          'src/components/OperationsToolsView.tsx',
          'src/components/LingxingMcpConnectorView.tsx',
        ];
        const missingViews = requiredPaginatedViews.filter((viewPath) => {
          if (!ctx.fileExists(viewPath)) return true;
          const code = ctx.readFile(viewPath);
          return !/<TablePagination\b/.test(code) || !/useTablePagination/.test(code);
        });
        if (missingViews.length > 0) {
          violations.push({
            ruleId: 'UI-ADV-07',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: `以下业务数据视图未接入分页查看组件 <TablePagination>: ${missingViews.join(', ')}`,
            historicalContext: '全量同步后每个核心业务数据页都必须支持分页切换与页码跳转。',
            file: missingViews[0],
            remediation: `在以下视图导入并挂载 TablePagination 与 useTablePagination: ${missingViews.join(', ')}。`,
          });
        }
        return violations;
      },
    },
  ],
  async verify() {
    const violations: AuditViolation[] = [];
    // Verify TENANT_ADMIN owns 100% of ALL_PERMISSIONS_TREE
    const allTreePerms = ALL_PERMISSIONS_TREE.flatMap((g) => g.permissions.map((p) => p.code));
    const tenantAdmin = INITIAL_RBAC_ROLES.find((r) => r.roleCode === 'TENANT_ADMIN');
    if (!tenantAdmin || allTreePerms.some((code) => !tenantAdmin.permissions.includes(code))) {
      violations.push({
        ruleId: 'UI-ADV-04',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: TENANT_ADMIN 默认角色未覆盖全部权限树',
        historicalContext: '租户管理员必须默认拥有本企业 100% 功能与菜单权限。',
        file: 'src/data/initialErpData.ts',
        remediation: '确保 TENANT_ADMIN.permissions 包含 ALL_PERMISSIONS_TREE 全部权限码。',
      });
    }
    // Verify referential integrity of initial listings -> shops & local SKUs
    const shopIds = new Set(INITIAL_SHOPS.map((s) => s.id));
    const skuCodes = new Set(INITIAL_LOCAL_SKUS.map((s) => s.sku));
    for (const l of INITIAL_LISTINGS) {
      if (!shopIds.has(l.shopId) || !skuCodes.has(l.localSkuCode)) {
        violations.push({
          ruleId: 'UI-ADV-04',
          domain: DOMAIN,
          docPath: DOC_PATH,
          title: `初始数据引用断裂: Listing ${l.asin} 指向了不存在的店铺或本地 SKU`,
          historicalContext: '外键引用不一致会导致前端表格出现 undefined 与 0 成本误差。',
          file: 'src/data/initialErpData.ts',
          remediation: '修正 INITIAL_LISTINGS 的 shopId 与 localSkuCode 映射。',
        });
      }
    }
    return violations;
  },
};
