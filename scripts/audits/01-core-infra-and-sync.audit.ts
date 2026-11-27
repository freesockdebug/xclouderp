import type { DomainAuditSuite, AuditViolation } from './types';
import { findLineNumber } from './types';
import {
  isTenantWritable,
  calculateLingxingWindowSales,
} from '../../src/lib/erpEngine';
import {
  normalizeSupabaseProjectUrl,
  clearLegacyBrowserSupabaseConfig,
  loadSupabaseConfig,
  saveSupabaseConfig,
} from '../../src/services/supabaseClient';
import {
  LINGXING_OPENMCP_CORE_TOOLS,
  extractRecordsFromMcpResult,
  extractTotalCountFromMcpResult,
  collectAllPaginatedRecords,
  collectChunkedDateRangeRecords,
  buildDateWindowChunks,
  resolveIncrementalSyncPlan,
  collectPendingOrderRefreshRecords,
  recordSignature,
  normalizeLingxingShops,
  normalizeLingxingListings,
  normalizeLingxingOrders,
  normalizeLingxingBomOrders,
  normalizeLingxingWarehouseLedgers,
  getCurrencyIcon,
  mergeSyncedEntities,
} from '../../src/services/lingxingMcpSync';
import {
  BOOTSTRAP_ENTITY_TYPES,
  PAGE_ENTITY_REQUIREMENTS,
  executePagedEntityQuery,
} from '../../src/services/backendDataEngine';
import {
  handleWorkerRequest,
  resetWorkerRuntimeDbConfigForTest,
} from '../../worker';

const DOMAIN = '01-core-infra-and-sync';
const DOC_PATH = 'docs/01-core-infra-and-sync.md';

export const coreInfraAuditSuite: DomainAuditSuite = {
  domain: DOMAIN,
  name: '核心基础设施与领星 MCP 上游同步域',
  docPath: DOC_PATH,
  triggerPatterns: [
    /^server\.ts$/,
    /^worker\.ts$/,
    /^wrangler\.toml$/,
    /^src\/services\//,
    /^src\/components\/LingxingMcpConnectorView\.tsx$/,
    /^src\/components\/SupabaseSetupModal\.tsx$/,
    /^docs\/01-core-infra-and-sync\.md$/,
    /^scripts\/audits\/01-/,
  ],
  unitTestFiles: ['test/01-core-infra.test.ts'],
  rules: [
    {
      id: 'INFRA-ADV-01',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '服务端与 Worker 外部 fetch 必须绑定刚性超时信号 (AbortSignal.timeout / signal)',
      historicalContext:
        '无超时的外部 HTTP 调用会在上游领星接口半开挂起时耗尽 Node 事件循环与 Cloudflare Worker 并发连接池。',
      remediation: '为 fetch(url, { ..., signal: AbortSignal.timeout(8000) }) 显式传入超时信号。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const serverCode = ctx.readFile('server.ts');
        const fetchRegex = /await\s+fetch\s*\(/g;
        let match: RegExpExecArray | null;
        while ((match = fetchRegex.exec(serverCode)) !== null) {
          const endSemi = serverCode.indexOf(';', match.index);
          const stmt = serverCode.slice(
            match.index,
            endSemi > match.index ? endSemi : match.index + 600
          );
          if (!/AbortSignal\.timeout|signal\s*:/.test(stmt)) {
            violations.push({
              ruleId: 'INFRA-ADV-01',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: 'server.ts 中外部 fetch 缺少超时 signal 约束',
              historicalContext:
                '外部请求缺少超时信号会引发长连接堆积与网关尾延迟雪崩。',
              file: 'server.ts',
              line: findLineNumber(serverCode, match.index),
              snippet: stmt.slice(0, 120),
              remediation: '在 fetch options 中添加 signal: AbortSignal.timeout(8000)。',
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'INFRA-ADV-02',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '/api/lingxing/mcp-proxy 必须对 EXPIRED_READONLY/SUSPENDED 返回 HTTP 402 熔断',
      historicalContext:
        '若未在代理入口阻断过期租户，已停费卖家仍能持续穿透调用上游领星 MCP 消耗平台额度。',
      remediation:
        '在 server.ts 的 /api/lingxing/mcp-proxy 路由顶部校验 EXPIRED_READONLY / SUSPENDED 并返回 res.status(402)。',
      check(ctx) {
        const serverCode = ctx.readFile('server.ts');
        const hasStatusCheck =
          /EXPIRED_READONLY/.test(serverCode) &&
          /SUSPENDED/.test(serverCode) &&
          /status\(402\)/.test(serverCode);
        if (!hasStatusCheck) {
          return [
            {
              ruleId: 'INFRA-ADV-02',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: '领星代理路由缺失 HTTP 402 订阅过期熔断检查',
              historicalContext: '过期租户必须被边缘层直接拒绝，禁止穿透到上游领星服务。',
              file: 'server.ts',
              line: 22,
              remediation: '在 /api/lingxing/mcp-proxy 入口恢复 HTTP 402 校验逻辑。',
            },
          ];
        }
        return [];
      },
    },
    {
      id: 'INFRA-ADV-03',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'Supabase 客户端不得硬编码真实项目 URL 或真实 JWT Anon Key',
      historicalContext:
        '历史故障中开发者把个人调试数据库 URL 和 JWT 写入前端源码，导致生产与预览串库泄漏。',
      remediation:
        '在 src/services/supabaseClient.ts 中仅通过 import.meta.env 或服务端 /api/platform/db-config 接口动态读取连接配置。',
      check(ctx) {
        const file = 'src/services/supabaseClient.ts';
        if (!ctx.fileExists(file)) {
          return [
            {
              ruleId: 'INFRA-ADV-03',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: '缺少 src/services/supabaseClient.ts 模块',
              historicalContext: 'Supabase 客户端必须统一收口管理连接凭据。',
              file,
              remediation: '恢复 src/services/supabaseClient.ts。',
            },
          ];
        }
        const content = ctx.readFile(file);
        const hardcodedUrl = /https:\/\/[a-z0-9]{12,}\.supabase\.co/i.exec(content);
        const hardcodedJwt = /eyJhbGciOi[A-Za-z0-9_-]{10,}/.exec(content);
        const violations: AuditViolation[] = [];
        if (hardcodedUrl) {
          violations.push({
            ruleId: 'INFRA-ADV-03',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'supabaseClient.ts 中检测到硬编码真实 Supabase URL',
            historicalContext: '真实数据库实例地址严禁写入代码库。',
            file,
            line: findLineNumber(content, hardcodedUrl.index),
            snippet: hardcodedUrl[0],
            remediation: '改为从 import.meta.env.VITE_SUPABASE_URL 或本地配置读取。',
          });
        }
        if (hardcodedJwt) {
          violations.push({
            ruleId: 'INFRA-ADV-03',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'supabaseClient.ts 中检测到硬编码 JWT Key',
            historicalContext: '真实 JWT Anon/Service Key 严禁写入源码。',
            file,
            line: findLineNumber(content, hardcodedJwt.index),
            snippet: hardcodedJwt[0].slice(0, 32),
            remediation: '移除硬编码 JWT，改用环境变量。',
          });
        }
        return violations;
      },
    },
    {
      id: 'INFRA-ADV-04',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'Express 服务器必须默认绑定 Port 3000 并监听 0.0.0.0',
      historicalContext: '预览容器与反代固定路由至 0.0.0.0:3000，修改默认端口会直接引发 502。',
      remediation: '在 server.ts 中保持 PORT = Number(process.env.PORT) || 3000 与 app.listen(PORT, "0.0.0.0")。',
      check(ctx) {
        const content = ctx.readFile('server.ts');
        if (!/3000/.test(content) || !/app\.listen\(\s*PORT\s*,\s*['"]0\.0\.0\.0['"]/.test(content)) {
          return [
            {
              ruleId: 'INFRA-ADV-04',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: 'server.ts 未遵循 Port 3000 / 0.0.0.0 监听契约',
              historicalContext: '容器网关要求 dev/start 服务严格监听 0.0.0.0:3000。',
              file: 'server.ts',
              remediation: '恢复 const PORT = Number(process.env.PORT) || 3000 与 app.listen(PORT, "0.0.0.0")。',
            },
          ];
        }
        return [];
      },
    },
    {
      id: 'INFRA-ADV-05',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'Supabase 客户端必须提供 URL 规范化与全局单例池，且 App 运行时必须直连真实数据库而非硬编码演示数据',
      historicalContext:
        '历史故障包括：粘贴带 /rest/v1/ 后缀导致 404、saveSupabaseConfig 清空缓存引发 Multiple GoTrueClient 警告、以及 App.tsx 仅改 React 内存导致领星配置刷新丢失。',
      remediation:
        '在 supabaseClient.ts 保留 normalizeSupabaseProjectUrl 与 __xcloudSupabaseClientPool 单例池，并在 App.tsx 通过 loadErpDatabaseSnapshot / syncErpSnapshotDiff 全量直连 Supabase。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const clientCode = ctx.readFile('src/services/supabaseClient.ts');
        const appCode = ctx.readFile('src/App.tsx');

        if (!/export\s+function\s+normalizeSupabaseProjectUrl/.test(clientCode) || !/__xcloudSupabaseClientPool/.test(clientCode)) {
          violations.push({
            ruleId: 'INFRA-ADV-05',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'supabaseClient.ts 缺失 URL 自动规范化或全局单例池防护',
            historicalContext: '缺少单例池会触发 Multiple GoTrueClient 实例冲突，缺少 URL 清洗会因 /rest/v1/ 后缀报错。',
            file: 'src/services/supabaseClient.ts',
            remediation: '保留 normalizeSupabaseProjectUrl 与 __xcloudSupabaseClientPool 单例缓存。',
          });
        }
        if (!ctx.fileExists('src/services/erpDatabaseService.ts')) {
          violations.push({
            ruleId: 'INFRA-ADV-05',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: '缺少全量数据库持久化仓库层 src/services/erpDatabaseService.ts',
            historicalContext: '业务数据必须经由统一仓库层直连 Supabase PostgreSQL 持久化。',
            file: 'src/services/erpDatabaseService.ts',
            remediation: '恢复 src/services/erpDatabaseService.ts。',
          });
        }
        if (
          !/loadErpDatabaseSnapshot/.test(appCode) ||
          /useState<Tenant\[\]>\(\s*INITIAL_TENANTS\s*\)/.test(appCode)
        ) {
          violations.push({
            ruleId: 'INFRA-ADV-05',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/App.tsx 未直连 Supabase 加载数据或仍使用硬编码 INITIAL_TENANTS 作为运行态初始值',
            historicalContext: '前端直接以 INITIAL_TENANTS 渲染会导致数据库配置生效后业务修改无法真实落库。',
            file: 'src/App.tsx',
            remediation: '使用空数组初始化状态并通过 loadErpDatabaseSnapshot / syncErpSnapshotDiff 直连 Supabase。',
          });
        }
        return violations;
      },
    },
    {
      id: 'INFRA-ADV-06',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '领星 MCP 代理必须校验外网 HTTPS 地址防内网穿透、严禁伪造假数据兜底，且必须具备真实实体归一化落库管线',
      historicalContext:
        '历史版本在 /api/lingxing/mcp-proxy 出错时伪造 buildStandardLingxingMcpResponse 假数据返回 200，且前端仅更新同步时间戳未将店铺/ASIN/订单真实写入 Supabase。',
      remediation:
        '在 server.ts 保留 validateSafeExternalMcpUrl 与 parseMcpResponseBody、移除假数据兜底，并保留 src/services/lingxingMcpSync.ts 与 persistLingxingSyncedEntities 真库落库链路。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const serverCode = ctx.readFile('server.ts');
        const dbCode = ctx.readFile('src/services/erpDatabaseService.ts');

        if (/buildStandardLingxingMcpResponse/.test(serverCode)) {
          violations.push({
            ruleId: 'INFRA-ADV-06',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'server.ts 仍残留假数据兜底函数 buildStandardLingxingMcpResponse',
            historicalContext: '上游领星连接失败时必须返回真实错误状态，严禁伪造成功与模拟记录。',
            file: 'server.ts',
            remediation: '彻底移除 buildStandardLingxingMcpResponse 并在异常时返回 HTTP 502 真实诊断。',
          });
        }
        if (!/validateSafeExternalMcpUrl/.test(serverCode) || !/parseMcpResponseBody/.test(serverCode)) {
          violations.push({
            ruleId: 'INFRA-ADV-06',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'server.ts 缺失外部 MCP URL 安全校验或 Streamable HTTP SSE 解析器',
            historicalContext: '必须阻断私网/回环/元数据地址代理请求，并兼容领星 MCP 返回的 text/event-stream 流式响应。',
            file: 'server.ts',
            remediation: '在 server.ts 中保留 validateSafeExternalMcpUrl 与 parseMcpResponseBody。',
          });
        }
        if (!ctx.fileExists('src/services/lingxingMcpSync.ts') || !/persistLingxingSyncedEntities/.test(dbCode)) {
          violations.push({
            ruleId: 'INFRA-ADV-06',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: '缺失领星 MCP 真实数据归一化模块或 Supabase 批量持久化函数',
            historicalContext: '领星拉取的店铺、ASIN/Listing 与订单必须经由归一化后直接写入 Supabase。',
            file: 'src/services/lingxingMcpSync.ts',
            remediation: '保留 src/services/lingxingMcpSync.ts 与 erpDatabaseService.ts 中的 persistLingxingSyncedEntities。',
          });
        }
        return violations;
      },
    },
    {
      id: 'INFRA-ADV-07',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '服务端必须具备领星定时自动同步引擎 (/api/lingxing/scheduler/*) 且业务视图严禁残留虚拟样例兜底值',
      historicalContext:
        '历史版本仅保留静态 Cloudflare Cron 文本而未启动真实服务端定时同步，且 FbaShipmentsView/FinanceAccountingView/McpAndCloudDeployView 中残留 Store-Alpha / B00DEMO001 / X000DEMO01 硬编码兜底。',
      remediation:
        '保留 server.ts 中的 /api/lingxing/scheduler/* 路由与 src/services/lingxingAutoSyncRunner.ts，并杜绝业务视图硬编码虚拟样例兜底。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const serverCode = ctx.readFile('server.ts');
        if (
          !/\/api\/lingxing\/scheduler\/status/.test(serverCode) ||
          !/\/api\/lingxing\/scheduler\/configure/.test(serverCode) ||
          !ctx.fileExists('src/services/lingxingAutoSyncRunner.ts')
        ) {
          violations.push({
            ruleId: 'INFRA-ADV-07',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: '缺失服务端领星定时自动同步路由或 lingxingAutoSyncRunner.ts 引擎',
            historicalContext: '必须运行真实服务端定时同步并在每次同步前校验 isTenantWritable。',
            file: 'server.ts',
            remediation: '在 server.ts 挂载 /api/lingxing/scheduler/* 并保留 src/services/lingxingAutoSyncRunner.ts。',
          });
        }
        const checkedViews = [
          'src/components/FbaShipmentsView.tsx',
          'src/components/FinanceAccountingView.tsx',
          'src/components/McpAndCloudDeployView.tsx',
          'src/components/TenantSubscriptionView.tsx',
        ];
        const forbiddenFallback = /B00DEMO001|X000DEMO01|Store-Alpha-|XC-PRO-365D-DEMO-0001/;
        for (const viewPath of checkedViews) {
          if (!ctx.fileExists(viewPath)) continue;
          const code = ctx.readFile(viewPath);
          const m = forbiddenFallback.exec(code);
          if (m) {
            violations.push({
              ruleId: 'INFRA-ADV-07',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `${viewPath} 残留虚拟样例兜底字符串 [${m[0]}]`,
              historicalContext: '接入真实数据库与领星同步后，运行时业务表单与组件不得回退硬编码虚拟样例。',
              file: viewPath,
              line: findLineNumber(code, m.index),
              snippet: m[0],
              remediation: '改为读取当前租户真实入库数据或空默认值。',
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'INFRA-ADV-08',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '领星 12 域全量数据结构对齐：必须完整支持 MX/BR 站点、多币种符号映射与 BOM 加工单 (warehouse_processing_order_list)',
      historicalContext:
        '历史版本将墨西哥(MX)和巴西(BR)站点强行折叠为 US/USD，前端广告与财务模块硬编码 $ 符号导致日元/墨西哥比索金额错乱，且缺失第 12 域 BOM 加工单同步管线。',
      remediation:
        '在 src/types/erp.ts 保留 CurrencyCode 与包含 MX/BR 的 MarketplaceCode，并在 src/services/lingxingMcpSync.ts 保留 warehouse_processing_order_list (BOM_ORDERS)、normalizeLingxingBomOrders 与 getCurrencyIcon。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const typesCode = ctx.readFile('src/types/erp.ts');
        const syncCode = ctx.readFile('src/services/lingxingMcpSync.ts');

        if (
          !/export\s+type\s+CurrencyCode\s*=/.test(typesCode) ||
          !/'MX'/.test(typesCode) ||
          !/'BR'/.test(typesCode)
        ) {
          violations.push({
            ruleId: 'INFRA-ADV-08',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/types/erp.ts 缺失 CurrencyCode 或 MarketplaceCode 未包含 MX/BR 站点',
            historicalContext: '墨西哥与巴西站点必须以原生 MX/MXN 和 BR/BRL 落库，严禁折叠为 US/USD。',
            file: 'src/types/erp.ts',
            remediation: '恢复 CurrencyCode 类型定义并在 MarketplaceCode 中包含 MX 与 BR。',
          });
        }
        if (
          !/warehouse_processing_order_list/.test(syncCode) ||
          !/export\s+function\s+normalizeLingxingBomOrders/.test(syncCode) ||
          !/export\s+function\s+getCurrencyIcon/.test(syncCode)
        ) {
          violations.push({
            ruleId: 'INFRA-ADV-08',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/services/lingxingMcpSync.ts 缺失 BOM 加工单 12 域工具、归一化器或多币种符号解析',
            historicalContext: '领星全量同步必须覆盖 12 个核心接口（含 BOM 加工单）并保留多币种货币符号。',
            file: 'src/services/lingxingMcpSync.ts',
            remediation: '保留 warehouse_processing_order_list、normalizeLingxingBomOrders 与 getCurrencyIcon。',
          });
        }
        return violations;
      },
    },
    {
      id: 'INFRA-ADV-09',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '领星全量同步必须执行多页分页拉取 (collectAllPaginatedRecords) 且 Supabase 读取必须采用 .range() 分页突破 1000 行静默截断',
      historicalContext:
        '历史版本领星同步仅拉取第 1 页（ASIN 截断在 100 条、采购/广告/结算截断在 50 条），且 erpDatabaseService 使用单次 .limit(5000) 会被 Supabase PostgREST 静默截断至 1000 行导致入库与展示数据不全。',
      remediation:
        '在 lingxingMcpSync.ts 保留 collectAllPaginatedRecords 与 extractTotalCountFromMcpResult，在 lingxingAutoSyncRunner.ts 与 LingxingMcpConnectorView.tsx 接入全页翻页循环，并在 erpDatabaseService.ts 的 loadErpDatabaseSnapshot 中使用 .range(from, to) 循环读取。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const syncCode = ctx.readFile('src/services/lingxingMcpSync.ts');
        const runnerCode = ctx.readFile('src/services/lingxingAutoSyncRunner.ts');
        const dbCode = ctx.readFile('src/services/erpDatabaseService.ts');

        if (
          !/export\s+async\s+function\s+collectAllPaginatedRecords/.test(syncCode) ||
          !/export\s+function\s+extractTotalCountFromMcpResult/.test(syncCode)
        ) {
          violations.push({
            ruleId: 'INFRA-ADV-09',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/services/lingxingMcpSync.ts 缺失全页分页收集器 collectAllPaginatedRecords 或总数解析器',
            historicalContext: '缺少全页翻页器会导致超过单页上限的 ASIN/订单/库存数据静默丢失。',
            file: 'src/services/lingxingMcpSync.ts',
            remediation: '保留 collectAllPaginatedRecords 与 extractTotalCountFromMcpResult。',
          });
        }
        if (!/collectAllPaginatedRecords/.test(runnerCode)) {
          violations.push({
            ruleId: 'INFRA-ADV-09',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/services/lingxingAutoSyncRunner.ts 后台定时同步未调用 collectAllPaginatedRecords',
            historicalContext: '定时同步若仅拉取第 1 页，会在后台持续遗漏第 2 页之后的 ASIN 与订单。',
            file: 'src/services/lingxingAutoSyncRunner.ts',
            remediation: '在 syncSingleTenantFromLingxing 中统一通过 collectAllPaginatedRecords 拉取全部页。',
          });
        }
        if (!/\.range\s*\(/.test(dbCode) || /\.limit\s*\(\s*5000\s*\)/.test(dbCode)) {
          violations.push({
            ruleId: 'INFRA-ADV-09',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/services/erpDatabaseService.ts 未使用 .range() 分页读取或仍残留单次 .limit(5000)',
            historicalContext: 'Supabase PostgREST 默认单次查询最多返回 1000 行，超过部分会被静默截断。',
            file: 'src/services/erpDatabaseService.ts',
            remediation: '在 loadErpDatabaseSnapshot 中使用 deterministic .order() + .range(from, from + DB_PAGE_SIZE - 1) 循环拉取全表。',
          });
        }
        return violations;
      },
    },
    {
      id: 'INFRA-ADV-10',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '订单与销量口径必须严格区分（订单量 vs 件数、剔除 CANCELED、稳定订单主键、全量同步清理陈旧 lx-* 记录）',
      historicalContext:
        '历史版本在首页驾驶舱直接汇总 listings.yesterdayVolume（销量件数）充当昨日订单量，未剔除 Canceled 取消单、未做多币种折算 USD、且 normalizeLingxingOrders 使用含数组下标 String(i) 的不稳定主键且不清理陈旧 lx-* 记录，导致与领星后台昨日订单数严重对不上。',
      remediation:
        '在 erpEngine.ts 保留 calculateLingxingWindowSales、在 DashboardOverview.tsx 调用订单实算引擎、在 lingxingMcpSync.ts 使用稳定主键 lx-ord-${tenantId}-${amazonOrderId} 与独立 CANCELED 状态、并在 erpDatabaseService.ts 支持 pruneStaleDomains 清理陈旧 lx-* 记录。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const engineCode = ctx.readFile('src/lib/erpEngine.ts');
        const dashCode = ctx.readFile('src/components/DashboardOverview.tsx');
        const syncCode = ctx.readFile('src/services/lingxingMcpSync.ts');
        const dbCode = ctx.readFile('src/services/erpDatabaseService.ts');

        if (!/export\s+function\s+calculateLingxingWindowSales/.test(engineCode)) {
          violations.push({
            ruleId: 'INFRA-ADV-10',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/lib/erpEngine.ts 缺少 calculateLingxingWindowSales 实时订单/销量对账引擎',
            historicalContext: '首页与订单中心必须共享单一可信的领星口径订单与销量聚合函数。',
            file: 'src/lib/erpEngine.ts',
            remediation: '在 src/lib/erpEngine.ts 导出 calculateLingxingWindowSales。',
          });
        }
        if (!/calculateLingxingWindowSales/.test(dashCode)) {
          violations.push({
            ruleId: 'INFRA-ADV-10',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'DashboardOverview.tsx 未接入 calculateLingxingWindowSales 订单实算引擎',
            historicalContext: '仅汇总 listings.yesterdayVolume 会把件数/陈旧快照与多币种混算为昨日订单量。',
            file: 'src/components/DashboardOverview.tsx',
            remediation: '在 DashboardOverview.tsx 中调用 calculateLingxingWindowSales 展示有效订单量(单)与总销量(件)。',
          });
        }
        if (!/pruneStaleDomains/.test(dbCode)) {
          violations.push({
            ruleId: 'INFRA-ADV-10',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/services/erpDatabaseService.ts 缺少 pruneStaleDomains 陈旧 lx-* 清理机制',
            historicalContext: '仅 upsert 不清理历史陈旧 lx-* 记录会导致过期销量与重复订单在库中持续累加。',
            file: 'src/services/erpDatabaseService.ts',
            remediation: '在 persistLingxingSyncedEntities 中保留 pruneStaleDomains 清理逻辑。',
          });
        }
        if (/lx-ord-\$\{safeIdPart\(tenantId\)\}-\$\{safeIdPart\(amazonOrderId\)\}-\$\{safeIdPart/.test(syncCode)) {
          violations.push({
            ruleId: 'INFRA-ADV-10',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'normalizeLingxingOrders 仍使用含 ASIN/数组下标的不稳定订单主键',
            historicalContext: 'Pending 订单补齐 ASIN 或分页位置变动时会重复写入同一 amazonOrderId。',
            file: 'src/services/lingxingMcpSync.ts',
            remediation: '使用稳定的 lx-ord-${safeIdPart(tenantId)}-${safeIdPart(amazonOrderId)} 主键。',
          });
        }
        return violations;
      },
    },
    {
      id: 'INFRA-ADV-11',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '领星大表库存流水完整分页防折叠与订单长周期分段同步守卫',
      historicalContext:
        'batch_inventory_statement_list 原先因 recordSignature 误按 msku|wh_id 去重且 maxPages 封顶 30 页导致 6155 条流水被折叠截断为 308 条；amazon_sales_order_list 单次 31 天请求无法同步 90/180/365 天历史订单，且窄窗口同步会误删更早的历史订单。',
      remediation:
        '保持 WAREHOUSE_LEDGERS 全字段复合事件签名与动态页数上限，对 ORDERS 使用 buildDateWindowChunks + collectChunkedDateRangeRecords 分段同步，并在落库清理时按 orderWindowStartDate 保护更早历史订单。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const syncCode = ctx.readFile('src/services/lingxingMcpSync.ts');
        const runnerCode = ctx.readFile('src/services/lingxingAutoSyncRunner.ts');
        const viewCode = ctx.readFile('src/components/LingxingMcpConnectorView.tsx');
        const dbCode = ctx.readFile('src/services/erpDatabaseService.ts');
        if (
          !/export\s+function\s+buildDateWindowChunks/.test(syncCode) ||
          !/export\s+async\s+function\s+collectChunkedDateRangeRecords/.test(syncCode) ||
          !/export\s+function\s+recordSignature/.test(syncCode) ||
          !/ABSOLUTE_MAX_PAGES_CEILING/.test(syncCode)
        ) {
          violations.push({
            ruleId: 'INFRA-ADV-11',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/services/lingxingMcpSync.ts 缺少分段订单同步或动态高分页上限核心导出',
            historicalContext: '缺少分段窗口与动态页数扩展会导致大表流水截断与长周期订单无法拉全。',
            file: 'src/services/lingxingMcpSync.ts',
            remediation: '导出 buildDateWindowChunks、collectChunkedDateRangeRecords、recordSignature 并保留 ABSOLUTE_MAX_PAGES_CEILING。',
          });
        }
        if (
          !/collectChunkedDateRangeRecords/.test(runnerCode) ||
          !/orderSyncDays/.test(runnerCode)
        ) {
          violations.push({
            ruleId: 'INFRA-ADV-11',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/services/lingxingAutoSyncRunner.ts 未接入分段订单同步或缺少 orderSyncDays 配置',
            historicalContext: '定时同步若仍单次拉取 31 天订单将无法持续补齐 90/180/365 天历史订单。',
            file: 'src/services/lingxingAutoSyncRunner.ts',
            remediation: '在 syncSingleTenantFromLingxing 中使用 collectChunkedDateRangeRecords 并支持 orderSyncDays。',
          });
        }
        if (
          !/collectChunkedDateRangeRecords/.test(viewCode) ||
          !/orderSyncDays/.test(viewCode)
        ) {
          violations.push({
            ruleId: 'INFRA-ADV-11',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/components/LingxingMcpConnectorView.tsx 缺少长周期订单范围选择或分段拉取逻辑',
            historicalContext: '前端手动一键同步与单工具同步必须支持按 31/90/180/365 天自动 30 天分段拉取订单。',
            file: 'src/components/LingxingMcpConnectorView.tsx',
            remediation: '在 LingxingMcpConnectorView.tsx 中接入 orderSyncDays 选择器与 collectChunkedDateRangeRecords。',
          });
        }
        if (!/orderWindowStartDate/.test(dbCode)) {
          violations.push({
            ruleId: 'INFRA-ADV-11',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/services/erpDatabaseService.ts 缺少 orderWindowStartDate 历史订单窗口保护',
            historicalContext: '若未按同步窗口起始日期保护历史订单，执行 31 天快速同步会误删库中已有的 180/365 天历史订单。',
            file: 'src/services/erpDatabaseService.ts',
            remediation: '在 persistLingxingSyncedEntities 清理 orders 时保留 purchaseDate < orderWindowStartDate 的历史记录。',
          });
        }
        return violations;
      },
    },
    {
      id: 'INFRA-ADV-12',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '禁止使用浏览器 localStorage 持久化数据库连接配置，必须统一经由服务端 /api/platform/db-config 与环境变量托管',
      historicalContext:
        '历史版本将 Supabase URL 与 Anon Key 写入浏览器 localStorage (xcloud_erp_supabase_config_v1)，导致配置绑定单台浏览器、清除缓存即丢失且在前端持久暴露敏感配置；现已全面停用 localStorage 并改由服务端环境变量与运行内存托管。',
      remediation:
        '在 src/services/supabaseClient.ts 中彻底移除 localStorage.getItem/setItem 并保留 clearLegacyBrowserSupabaseConfig 自动清理旧键及 fetchServerSupabaseConfig/saveServerSupabaseConfig；在 server.ts 保留受 PLATFORM_SUPER_ADMIN 与 validateSafeExternalMcpUrl 保护的 /api/platform/db-config 路由且严禁返回 SUPABASE_SERVICE_ROLE_KEY。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const clientCode = ctx.readFile('src/services/supabaseClient.ts');
        const serverCode = ctx.readFile('server.ts');

        const forbiddenReadWrite = /localStorage\.(getItem|setItem)\s*\(/.exec(clientCode);
        if (forbiddenReadWrite) {
          violations.push({
            ruleId: 'INFRA-ADV-12',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/services/supabaseClient.ts 仍存在禁止的浏览器 localStorage 读写调用',
            historicalContext: '数据库配置已停用浏览器 localStorage 存储，严禁再次读写 localStorage。',
            file: 'src/services/supabaseClient.ts',
            line: findLineNumber(clientCode, forbiddenReadWrite.index),
            snippet: forbiddenReadWrite[0],
            remediation: '移除 localStorage.getItem/setItem，改由服务端 /api/platform/db-config 与内存态托管。',
          });
        }
        if (
          !/export\s+function\s+clearLegacyBrowserSupabaseConfig/.test(clientCode) ||
          !/removeItem\s*\(\s*LEGACY_STORAGE_KEY\s*\)/.test(clientCode) ||
          !/export\s+async\s+function\s+fetchServerSupabaseConfig/.test(clientCode) ||
          !/export\s+async\s+function\s+saveServerSupabaseConfig/.test(clientCode)
        ) {
          violations.push({
            ruleId: 'INFRA-ADV-12',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/services/supabaseClient.ts 缺少旧 localStorage 自动清理或服务端配置读写导出',
            historicalContext: '必须自动清理旧浏览器缓存键并通过 /api/platform/db-config 与服务端同步运行态配置。',
            file: 'src/services/supabaseClient.ts',
            remediation: '保留 clearLegacyBrowserSupabaseConfig、fetchServerSupabaseConfig 与 saveServerSupabaseConfig。',
          });
        }

        const routeIdx = serverCode.indexOf("app.get('/api/platform/db-config'");
        const postIdx = serverCode.indexOf("app.post('/api/platform/db-config'");
        if (routeIdx < 0 || postIdx < 0) {
          violations.push({
            ruleId: 'INFRA-ADV-12',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'server.ts 缺失 GET/POST /api/platform/db-config 服务端数据库配置托管路由',
            historicalContext: '停用浏览器 localStorage 后，前端必须通过 /api/platform/db-config 读取和更新运行态配置。',
            file: 'server.ts',
            remediation: '在 server.ts 挂载 GET 与 POST /api/platform/db-config 路由。',
          });
        } else {
          const routeSlice = serverCode.slice(routeIdx, postIdx + 3200);
          if (
            !/PLATFORM_SUPER_ADMIN/.test(routeSlice) ||
            !/validateSafeExternalMcpUrl/.test(routeSlice) ||
            /SUPABASE_SERVICE_ROLE_KEY/.test(routeSlice)
          ) {
            violations.push({
              ruleId: 'INFRA-ADV-12',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: 'server.ts 中 /api/platform/db-config 缺少超管权限校验、HTTPS URL 校验或错误引用了服务端高危密钥',
              historicalContext: '更新数据库配置必须限制为 PLATFORM_SUPER_ADMIN、校验外网 HTTPS 地址且严禁暴露 SUPABASE_SERVICE_ROLE_KEY。',
              file: 'server.ts',
              line: findLineNumber(serverCode, postIdx),
              remediation: '确保 POST /api/platform/db-config 校验 portalMode 与 validateSafeExternalMcpUrl，且不返回 service role key。',
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'INFRA-ADV-13',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '领星 MCP 混合增量同步契约：3 个原生 update_time 接口增量防误删、订单水位线回溯 + 历史 PENDING 批量复查与水位线持久化',
      historicalContext:
        '历史版本每次同步均全量拉取 90 天订单与全部流水，系统负载高；经在线实测领星 OpenMCP，batch_inventory_statement_list / get_delivery_order_list / warehouse_processing_order_list 支持原生 update_time 增量过滤（必须保护增量外历史记录不被 pruneStaleDomains 误删），而 amazon_sales_order_list 仅支持下单日期区间与 exactSearch=1 按 amazonOrderId 批量精确查询，必须采用水位线回溯窗口 + 历史 PENDING 单批量复查组合策略。',
      remediation:
        '在 src/services/lingxingMcpSync.ts 保留 resolveIncrementalSyncPlan 与 collectPendingOrderRefreshRecords，在 src/services/lingxingAutoSyncRunner.ts 与 src/components/LingxingMcpConnectorView.tsx 接入混合增量计划、水位线持久化 (lingxingSyncWatermarks) 与 preserveExistingOutsideDelta 清理保护，并在 server.ts 透传 syncMode。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const syncCode = ctx.readFile('src/services/lingxingMcpSync.ts');
        const runnerCode = ctx.readFile('src/services/lingxingAutoSyncRunner.ts');
        const viewCode = ctx.readFile('src/components/LingxingMcpConnectorView.tsx');
        const appCode = ctx.readFile('src/App.tsx');
        const serverCode = ctx.readFile('server.ts');

        if (
          !/export\s+function\s+resolveIncrementalSyncPlan/.test(syncCode) ||
          !/export\s+async\s+function\s+collectPendingOrderRefreshRecords/.test(syncCode) ||
          !/time_filter_field:\s*'update_time'/.test(syncCode) ||
          !/time_type:\s*'3'/.test(syncCode) ||
          !/search_field_time:\s*'update_time'/.test(syncCode) ||
          !/exactSearch:\s*1/.test(syncCode) ||
          !/preserveExistingOutsideDelta:\s*true/.test(syncCode)
        ) {
          violations.push({
            ruleId: 'INFRA-ADV-13',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/services/lingxingMcpSync.ts 缺少混合增量同步核心导出、原生 update_time 参数或 exactSearch 复查逻辑',
            historicalContext: '必须保留经在线实测验证的 3 个 update_time 接口参数、preserveExistingOutsideDelta 标志及 PENDING 单批量精确复查。',
            file: 'src/services/lingxingMcpSync.ts',
            remediation: '保留 resolveIncrementalSyncPlan、collectPendingOrderRefreshRecords 与经过实测的参数映射。',
          });
        }
        if (
          !/resolveIncrementalSyncPlan/.test(runnerCode) ||
          !/collectPendingOrderRefreshRecords/.test(runnerCode) ||
          !/preserveExistingOutsideDelta/.test(runnerCode) ||
          !/lingxingSyncWatermarks/.test(runnerCode)
        ) {
          violations.push({
            ruleId: 'INFRA-ADV-13',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/services/lingxingAutoSyncRunner.ts 未接入混合增量同步、水位线落库或 preserveExistingOutsideDelta 防误删保护',
            historicalContext: '后台定时同步必须默认执行混合增量同步，且严禁在原生 update_time 增量模式下裁剪未变更的历史记录。',
            file: 'src/services/lingxingAutoSyncRunner.ts',
            remediation: '在 syncSingleTenantFromLingxing 中接入 resolveIncrementalSyncPlan、collectPendingOrderRefreshRecords、preserveExistingOutsideDelta 与 lingxingSyncWatermarks。',
          });
        }
        if (
          !/resolveIncrementalSyncPlan/.test(viewCode) ||
          !/collectPendingOrderRefreshRecords/.test(viewCode) ||
          !/preserveExistingOutsideDelta/.test(viewCode) ||
          !/updatedWatermarks/.test(viewCode) ||
          !/lingxingSyncWatermarks/.test(appCode)
        ) {
          violations.push({
            ruleId: 'INFRA-ADV-13',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: '前端手动同步视图或 App.tsx 未完整接入混合增量同步、防误删保护与水位线持久化',
            historicalContext: '手动同步与一键同步必须复用同一混合增量引擎并持久化租户级各域水位线。',
            file: 'src/components/LingxingMcpConnectorView.tsx',
            remediation: '在 LingxingMcpConnectorView.tsx 与 App.tsx 中完整保留增量策略计划、preserveExistingOutsideDelta 与 lingxingSyncWatermarks 合并落库。',
          });
        }
        if (!/syncMode/.test(serverCode)) {
          violations.push({
            ruleId: 'INFRA-ADV-13',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'server.ts 定时调度路由未透传 syncMode (INCREMENTAL | FULL) 参数',
            historicalContext: '调度器配置与触发接口必须支持在智能增量与全量回溯之间受控切换。',
            file: 'server.ts',
            remediation: '在 /api/lingxing/scheduler/configure 与 /api/lingxing/scheduler/trigger 透传 syncMode。',
          });
        }
        return violations;
      },
    },
    {
      id: 'INFRA-ADV-14',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '零启动加载阻塞壁垒 + 后端按需分页面加载 (/api/erp/bootstrap, /api/erp/page-data) + 大表真实后端分页查询 (/api/erp/query)',
      historicalContext:
        '历史版本进入系统时全量拉取全部 26 张业务表并在主屏展示「正在从 Supabase 实时数据库加载租户与 ERP 数据...」加载屏，导致订单/流水/搜索词翻页仅做前端内存切片而无真实后端分页查询请求。',
      remediation:
        '在 server.ts 挂载受 allowlist 校验的 /api/erp/bootstrap、/api/erp/page-data、/api/erp/query 与 /api/erp/cache/invalidate；在 App.tsx 使用 fetchErpBootstrap 静默引导并移除启动加载提示，按页面调用 fetchErpPageData；在订单、仓库流水、广告搜索词视图中接入 queryErpPagedData。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const serverCode = ctx.readFile('server.ts');
        const appCode = ctx.readFile('src/App.tsx');
        const ordersViewCode = ctx.readFile('src/components/AmazonOrdersAndListingsView.tsx');
        const whViewCode = ctx.readFile('src/components/WarehouseInventoryView.tsx');
        const adsViewCode = ctx.readFile('src/components/AdvertisingDaypartingView.tsx');

        if (
          !/app\.get\(['"]\/api\/erp\/bootstrap['"]/.test(serverCode) ||
          !/app\.post\(['"]\/api\/erp\/page-data['"]/.test(serverCode) ||
          !/app\.post\(['"]\/api\/erp\/query['"]/.test(serverCode) ||
          !/app\.post\(['"]\/api\/erp\/cache\/invalidate['"]/.test(serverCode) ||
          !/PAGE_ENTITY_REQUIREMENTS/.test(serverCode) ||
          !/ALLOWED_QUERY_ENTITIES/.test(serverCode)
        ) {
          violations.push({
            ruleId: 'INFRA-ADV-14',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'server.ts 缺失 /api/erp/* 按需加载或分页查询路由，或未校验白名单',
            historicalContext: '必须由后端托管全量数据并提供受白名单约束的引导、按页拉取与分页查询接口。',
            file: 'server.ts',
            remediation: '在 server.ts 中挂载 /api/erp/bootstrap、/api/erp/page-data、/api/erp/query 与 /api/erp/cache/invalidate，并校验 PAGE_ENTITY_REQUIREMENTS 与 ALLOWED_QUERY_ENTITIES。',
          });
        }
        if (
          /正在从 Supabase 实时数据库加载租户与 ERP 数据/.test(appCode) ||
          !/fetchErpBootstrap/.test(appCode) ||
          !/fetchErpPageData/.test(appCode) ||
          !/backendQueryContext=\{backendQueryContext\}/.test(appCode)
        ) {
          violations.push({
            ruleId: 'INFRA-ADV-14',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/App.tsx 仍残留启动加载壁垒或未接入按需分页面加载与后端分页上下文',
            historicalContext: '进入系统时不得展示正在加载数据遮罩，且每个页面只应拉取当前页所需数据。',
            file: 'src/App.tsx',
            remediation: '移除启动加载提示文案，使用 fetchErpBootstrap + fetchErpPageData 并向大表视图透传 backendQueryContext。',
          });
        }
        for (const [viewFile, viewCode] of [
          ['src/components/AmazonOrdersAndListingsView.tsx', ordersViewCode],
          ['src/components/WarehouseInventoryView.tsx', whViewCode],
          ['src/components/AdvertisingDaypartingView.tsx', adsViewCode],
        ] as const) {
          if (!/queryErpPagedData/.test(viewCode)) {
            violations.push({
              ruleId: 'INFRA-ADV-14',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `${viewFile} 未接入 queryErpPagedData 后端分页查询接口`,
              historicalContext: '大表分页翻页与搜索过滤必须触发真实后端分页查询请求。',
              file: viewFile,
              remediation: '在视图中接入 backendQueryContext 并调用 queryErpPagedData 拉取当前页切片。',
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'INFRA-ADV-15',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'Cloudflare Workers 全栈资产部署契约：wrangler.toml 必须声明 main = "worker.ts" + [assets] 解除“仅静态资产 Worker 不可加变量”限制，且 worker.ts 完整覆盖 /api/* 安全防线与超时约束',
      historicalContext:
        '缺少 wrangler.toml 与 worker.ts 入口时，Cloudflare 会将 Vite dist 部署为“只有静态资产的 Worker”，不仅在 Settings 添加环境变量/密钥时报错「不能将变量添加到只有静态资产的 Worker」，且所有 /api/* 后台接口均无法生效。',
      remediation:
        '保持根目录 wrangler.toml 声明 main = "worker.ts"、[assets] (directory="./dist", binding="ASSETS", run_worker_first=["/api/*"]) 且无硬编码密钥；保持 worker.ts 挂载全部 /api/* 路由、AbortSignal.timeout、validateSafeExternalMcpUrl、402 熔断、PLATFORM_SUPER_ADMIN 校验与 env.ASSETS.fetch 静态回落。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        if (!ctx.fileExists('wrangler.toml') || !ctx.fileExists('worker.ts')) {
          return [
            {
              ruleId: 'INFRA-ADV-15',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: '缺失根目录 wrangler.toml 或 worker.ts Cloudflare Workers 全栈入口文件',
              historicalContext: '无 main Worker 入口会导致 Cloudflare 将项目识别为仅静态资产 Worker，无法配置环境变量且 /api/* 不可用。',
              file: 'wrangler.toml',
              remediation: '在仓库根目录提供 wrangler.toml (含 main = "worker.ts" 与 [assets]) 及 worker.ts 入口。',
            },
          ];
        }
        const wranglerCode = ctx.readFile('wrangler.toml');
        const workerCode = ctx.readFile('worker.ts');

        if (
          !/main\s*=\s*["']worker\.ts["']/.test(wranglerCode) ||
          !/\[assets\]/.test(wranglerCode) ||
          !/directory\s*=\s*["']\.\/dist["']/.test(wranglerCode) ||
          !/binding\s*=\s*["']ASSETS["']/.test(wranglerCode) ||
          !/run_worker_first\s*=\s*\[\s*["']\/api\/\*["']\s*\]/.test(wranglerCode)
        ) {
          violations.push({
            ruleId: 'INFRA-ADV-15',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'wrangler.toml 缺失 main = "worker.ts" 或 [assets] / run_worker_first = ["/api/*"] 配置',
            historicalContext: '必须声明 Worker 主脚本和 ASSETS 绑定以启用环境变量配置与 /api/* 动态路由。',
            file: 'wrangler.toml',
            remediation: '在 wrangler.toml 中保留 main = "worker.ts"、[assets] directory/binding/run_worker_first。',
          });
        }
        if (/eyJhbGciOi[A-Za-z0-9_-]{10,}|https:\/\/[a-z0-9]{12,}\.supabase\.co/i.test(wranglerCode)) {
          violations.push({
            ruleId: 'INFRA-ADV-15',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'wrangler.toml 中检测到硬编码真实 Supabase URL 或 JWT 密钥',
            historicalContext: '生产数据库连接参数必须通过 Cloudflare Dashboard Variables and Secrets 注入。',
            file: 'wrangler.toml',
            remediation: '移除 wrangler.toml 中的真实密钥，仅在 Cloudflare Dashboard 中配置变量。',
          });
        }

        const requiredWorkerChecks = [
          '/api/platform/db-config',
          '/api/erp/bootstrap',
          '/api/erp/page-data',
          '/api/erp/query',
          '/api/lingxing/mcp-proxy',
          '/api/mcp',
          'env.ASSETS.fetch',
          'PLATFORM_SUPER_ADMIN',
          'validateSafeExternalMcpUrl',
          'PAGE_ENTITY_REQUIREMENTS',
          'ALLOWED_QUERY_ENTITIES',
        ];
        const missingInWorker = requiredWorkerChecks.filter((token) => !workerCode.includes(token));
        if (missingInWorker.length > 0 || /SUPABASE_SERVICE_ROLE_KEY/.test(workerCode)) {
          violations.push({
            ruleId: 'INFRA-ADV-15',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: `worker.ts 缺失关键路由/守卫 (${missingInWorker.join(', ')}) 或错误引用了 SUPABASE_SERVICE_ROLE_KEY`,
            historicalContext: 'Cloudflare Worker 必须与 Express 网关保持完整的安全防线与 API 能力对等，且严禁暴露高危服务密钥。',
            file: 'worker.ts',
            remediation: '在 worker.ts 中保留全部 /api/* 路由、白名单守卫与 env.ASSETS.fetch 回落，且不引用 SUPABASE_SERVICE_ROLE_KEY。',
          });
        }

        // Enforce AbortSignal.timeout on every external fetch in worker.ts
        const fetchRegex = /await\s+fetch\s*\(/g;
        let m: RegExpExecArray | null;
        while ((m = fetchRegex.exec(workerCode)) !== null) {
          const endSemi = workerCode.indexOf(';', m.index);
          const stmt = workerCode.slice(m.index, endSemi > m.index ? endSemi : m.index + 600);
          if (!/AbortSignal\.timeout|signal\s*:/.test(stmt)) {
            violations.push({
              ruleId: 'INFRA-ADV-15',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: 'worker.ts 中外部 fetch 缺少刚性超时信号 (AbortSignal.timeout)',
              historicalContext: 'Cloudflare Worker 外部网络调用必须绑定超时信号防止连接挂起耗尽并发槽位。',
              file: 'worker.ts',
              line: findLineNumber(workerCode, m.index),
              remediation: '为 worker.ts 中的每次外部 fetch 添加 signal: AbortSignal.timeout(...)。',
            });
          }
        }
        return violations;
      },
    },
  ],
  async verify() {
    const violations: AuditViolation[] = [];
    const cases: Array<{ status: 'ACTIVE' | 'TRIALING' | 'GRACE_PERIOD' | 'EXPIRED_READONLY' | 'SUSPENDED'; expected: boolean }> = [
      { status: 'ACTIVE', expected: true },
      { status: 'TRIALING', expected: true },
      { status: 'GRACE_PERIOD', expected: true },
      { status: 'EXPIRED_READONLY', expected: false },
      { status: 'SUSPENDED', expected: false },
    ];
    for (const c of cases) {
      const actual = isTenantWritable({ subscriptionStatus: c.status });
      if (actual !== c.expected) {
        violations.push({
          ruleId: 'INFRA-ADV-02',
          domain: DOMAIN,
          docPath: DOC_PATH,
          title: `内存故障注入失败: isTenantWritable(${c.status}) 返回 ${actual}，预期 ${c.expected}`,
          historicalContext: '租户可写状态机异常会导致过期写锁失效或误封活跃租户。',
          file: 'src/lib/erpEngine.ts',
          remediation: '修复 isTenantWritable 状态集合判断。',
        });
      }
    }
    // Verify URL normalization strips /rest/v1/ and converts dashboard URLs
    const normRest = normalizeSupabaseProjectUrl('https://demo-proj.supabase.co/rest/v1/');
    const normDash = normalizeSupabaseProjectUrl('https://supabase.com/dashboard/project/abc123xyz');
    if (normRest !== 'https://demo-proj.supabase.co' || normDash !== 'https://abc123xyz.supabase.co') {
      violations.push({
        ruleId: 'INFRA-ADV-05',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: `内存故障注入失败: normalizeSupabaseProjectUrl 清洗结果异常 (${normRest} | ${normDash})`,
        historicalContext: '错误后缀会导致 SDK 拼接双 /rest/v1/ 路径连接失败。',
        file: 'src/services/supabaseClient.ts',
        remediation: '修复 normalizeSupabaseProjectUrl 正则剥离与 dashboard 域名转换逻辑。',
      });
    }
    // Verify Lingxing MCP content[].text unwrapping & Shop/ASIN/Order normalization
    const sampleMcpRes = {
      jsonrpc: '2.0',
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              code: 0,
              data: [
                {
                  sid: 1001,
                  name: 'RealStore-US',
                  country: 'US',
                  asin: 'B09REAL001',
                  msku: 'SKU-REAL-01',
                  afn_fulfillable_quantity: 320,
                  price: 29.99,
                  amazon_order_id: '114-9988776-1234567',
                  order_total_amount: 59.98,
                  quantity_ordered: 2,
                },
              ],
            }),
          },
        ],
      },
    };
    const extracted = extractRecordsFromMcpResult(sampleMcpRes);
    const normShops = normalizeLingxingShops(extracted, 'tenant-real-1');
    const normListings = normalizeLingxingListings(extracted, 'tenant-real-1', normShops, []);
    const normOrders = normalizeLingxingOrders(extracted, 'tenant-real-1', normShops);
    if (
      extracted.length !== 1 ||
      normShops.length !== 1 ||
      normListings[0]?.asin !== 'B09REAL001' ||
      normOrders[0]?.amazonOrderId !== '114-9988776-1234567'
    ) {
      violations.push({
        ruleId: 'INFRA-ADV-06',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: 领星 MCP 真实报文解包或店铺/ASIN/订单归一化异常',
        historicalContext: '标准 MCP content[].text JSON 封装必须准确映射为 ERP 实体结构。',
        file: 'src/services/lingxingMcpSync.ts',
        remediation: '检查 extractRecordsFromMcpResult 与 normalizeLingxing* 字段提取逻辑。',
      });
    }
    // Verify 12-domain Lingxing schema alignment: MX/BR sites, multi-currency icons, and BOM processing orders
    const mxBrShops = normalizeLingxingShops(
      [
        { sid: 2001, name: 'Brand-MX', country: 'MX', seller_id: 'A1MX' },
        { sid: 2002, name: 'Brand-BR', country: 'BR', seller_id: 'A1BR' },
      ],
      'tenant-real-1'
    );
    const sampleBom = normalizeLingxingBomOrders(
      [
        {
          process_sn: 'PT261028001',
          type: 1,
          status: 2,
          ware_house_name: '默认仓库',
          create_time: '2026-10-28 10:00:00',
          product_list: [
            {
              sku: 'COMBO-SKU-01',
              product_name: '蝴蝶结组合装',
              quantity: 100,
              sync_amount: '1200.00',
              item_list: [{ sku: 'SUB-SKU-A', product_name: '单件A', quantity_process: 200 }],
            },
          ],
        },
      ],
      'tenant-real-1'
    );
    if (
      LINGXING_OPENMCP_CORE_TOOLS.length < 12 ||
      getCurrencyIcon('JPY') !== 'JP¥' ||
      mxBrShops[0]?.marketplace !== 'MX' ||
      mxBrShops[0]?.currency !== 'MXN' ||
      mxBrShops[1]?.marketplace !== 'BR' ||
      mxBrShops[1]?.currency !== 'BRL' ||
      sampleBom.length !== 1 ||
      sampleBom[0]?.assemblyNo !== 'PT261028001'
    ) {
      violations.push({
        ruleId: 'INFRA-ADV-08',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: 领星 12 域 BOM 加工单、MX/BR 站点或多币种映射异常',
        historicalContext: '12 域全量对齐必须保证 MX/BR 不被折叠、多币种符号准确且 BOM 加工单正常解析。',
        file: 'src/services/lingxingMcpSync.ts',
        remediation: '检查 LINGXING_OPENMCP_CORE_TOOLS、getCurrencyIcon、normalizeLingxingShops 与 normalizeLingxingBomOrders。',
      });
    }
    // Verify INFRA-ADV-09: multi-page Lingxing pagination with upstream page-size cap auto-calibration + duplicate-page guard
    const listingTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'erp_listing')!;
    const mockDataset = Array.from({ length: 250 }, (_, idx) => ({
      asin: `B0PAGETEST${String(idx + 1).padStart(3, '0')}`,
      msku: `MSKU-${idx + 1}`,
      store_id: 1702,
    }));
    const requestedOffsets: number[] = [];
    const paginated = await collectAllPaginatedRecords({
      tool: listingTool,
      baseArgs: { offset: 0, length: 200 },
      fetchPage: async (args) => {
        const off = Number(args.offset ?? 0);
        requestedOffsets.push(off);
        // Simulate Lingxing server capping each page at 100 rows even when 200 was requested
        const slice = mockDataset.slice(off, off + 100);
        return {
          ok: true,
          payload: {
            jsonrpc: '2.0',
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ data: { data: { total: 250, list: slice } } }),
                },
              ],
            },
          },
        };
      },
    });
    const dupGuard = await collectAllPaginatedRecords({
      tool: listingTool,
      baseArgs: { offset: 0, length: 100 },
      fetchPage: async () => ({
        ok: true,
        payload: {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  data: {
                    data: {
                      total: 500,
                      list: mockDataset.slice(0, 100),
                    },
                  },
                }),
              },
            ],
          },
        },
      }),
    });
    const parsedTotal = extractTotalCountFromMcpResult({
      result: { content: [{ type: 'text', text: JSON.stringify({ data: { data: { total: 250, list: [] } } }) }] },
    });
    if (
      parsedTotal !== 250 ||
      paginated.records.length !== 250 ||
      paginated.pagesFetched !== 3 ||
      paginated.truncatedByCap ||
      requestedOffsets.join(',') !== '0,100,200' ||
      dupGuard.pagesFetched !== 2 ||
      dupGuard.records.length !== 100
    ) {
      violations.push({
        ruleId: 'INFRA-ADV-09',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: `内存故障注入失败: 领星多页分页自动步长校准或重复页熔断异常 (fetched=${paginated.records.length}, offsets=${requestedOffsets.join(',')}, dupPages=${dupGuard.pagesFetched})`,
        historicalContext: '上游限流单页 100 条时必须自动以实际页长推进 offset 防止跳页丢数据，并在重复页时安全终止。',
        file: 'src/services/lingxingMcpSync.ts',
        remediation: '检查 collectAllPaginatedRecords 的 effectivePageSize 校准与 duplicate-page 签名守卫。',
      });
    }
    // Verify INFRA-ADV-10: Lingxing order-vs-unit reconciliation, CANCELED exclusion, multi-currency FX, and stale lx-* pruning
    const normReconcileOrders = normalizeLingxingOrders(
      [
        {
          amazonOrderId: '114-1111111-0000001',
          marketplace: 'US',
          orderStatus: 'Shipped',
          orderTotalAmount: '50.00',
          orderTotalCurrencyCode: 'USD',
          purchaseDateLocal: '2026-11-25 10:00:00',
          purchaseDate: '2026-11-25T18:00:00Z',
          slist: [{ asin: 'B0TEST01', sellerSku: 'SKU-1', quantityOrdered: 2 }],
        },
        {
          amazonOrderId: '114-1111111-0000002',
          marketplace: 'JP',
          orderStatus: 'Pending',
          orderTotalAmount: '10000',
          orderTotalCurrencyCode: 'JPY',
          purchaseDateLocal: '2026-11-25 15:00:00',
          purchaseDate: '2026-11-25T06:00:00Z',
          slist: [{ asin: 'B0TEST02', sellerSku: 'SKU-2', quantityOrdered: 3 }],
        },
        {
          amazonOrderId: '114-1111111-0000003',
          marketplace: 'US',
          orderStatus: 'Canceled',
          orderTotalAmount: '99.00',
          orderTotalCurrencyCode: 'USD',
          purchaseDateLocal: '2026-11-25 11:00:00',
          purchaseDate: '2026-11-25T19:00:00Z',
          slist: [{ asin: 'B0TEST03', sellerSku: 'SKU-3', quantityOrdered: 4 }],
        },
      ],
      'tenant-reconcile',
      []
    );
    const fixedNow = new Date('2026-11-26T08:30:00Z'); // 2026-11-26 00:30 PST & 17:30 JST => yesterday is 2026-11-25 for both US & JP
    const winSummary = calculateLingxingWindowSales({
      orders: [...normReconcileOrders, { ...normReconcileOrders[0], id: 'lx-ord-stale-dup-row' }],
      listings: [],
      window: 'YESTERDAY',
      siteDateMode: 'PER_SITE',
      includeCanceled: false,
      nowDate: fixedNow,
    });
    const prunedMerge = mergeSyncedEntities(
      [
        { id: 'lx-ord-t1-stale', tenantId: 't1' },
        { id: 'mcf-local-manual-1', tenantId: 't1' },
        { id: 'lx-ord-t1-fresh', tenantId: 't1' },
      ],
      [{ id: 'lx-ord-t1-fresh', tenantId: 't1' }],
      't1',
      false,
      true
    );
    if (
      normReconcileOrders[0]?.id !== 'lx-ord-tenant-reconcile-114-1111111-0000001' ||
      normReconcileOrders[2]?.orderStatus !== 'CANCELED' ||
      winSummary.orderCount !== 2 ||
      winSummary.unitVolume !== 5 ||
      winSummary.canceledOrderCount !== 1 ||
      winSummary.revenueUsd !== 116 ||
      prunedMerge.length !== 2 ||
      prunedMerge.some((x) => x.id === 'lx-ord-t1-stale') ||
      !prunedMerge.some((x) => x.id === 'mcf-local-manual-1')
    ) {
      violations.push({
        ruleId: 'INFRA-ADV-10',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: `内存故障注入失败: 领星昨日订单/销量对账、取消单剔除、多币种折算或陈旧 lx-* 清理异常 (orders=${winSummary.orderCount}, units=${winSummary.unitVolume}, canceled=${winSummary.canceledOrderCount}, usd=${winSummary.revenueUsd})`,
        historicalContext: '必须精确区分有效订单量(单)与总销量(件)、剔除 Canceled、按汇率折算多币种 USD 并清理陈旧 lx-* 记录。',
        file: 'src/lib/erpEngine.ts',
        remediation: '检查 calculateLingxingWindowSales、normalizeLingxingOrders 与 mergeSyncedEntities 实现。',
      });
    }
    // Verify INFRA-ADV-11: warehouse ledger composite signature (zero collapse across shared msku/order_sn),
    // multi-month order date-window chunking, and historical order window-guarded pruning
    const whTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'batch_inventory_statement_list')!;
    const sharedSkuLedgers = Array.from({ length: 350 }, (_, idx) => ({
      batch_state_id: 900000 + idx,
      batch_no: 'BATCH-SHARED-01',
      order_sn: 'ORD-SHARED-01',
      msku: 'MSKU-SAME',
      sku: 'SKU-SAME',
      wh_id: 101,
      wh_name: 'US-FBA-01',
      type: idx % 2 === 0 ? 1 : 2,
      type_name: idx % 2 === 0 ? '采购入库' : '销售出库',
      batch_time: `2026-11-${String((idx % 25) + 1).padStart(2, '0')} ${String(idx % 24).padStart(2, '0')}:${String(idx % 60).padStart(2, '0')}:00`,
      num: idx % 2 === 0 ? 5 : -2,
      balance_num: 1000 + idx,
    }));
    const whSigA = recordSignature(sharedSkuLedgers[0], 'WAREHOUSE_LEDGERS');
    const whSigB = recordSignature(sharedSkuLedgers[1], 'WAREHOUSE_LEDGERS');
    const whPaged = await collectAllPaginatedRecords({
      tool: whTool,
      baseArgs: { offset: 0, length: 200 },
      fetchPage: async (args) => {
        const off = Number(args.offset ?? 0);
        const slice = sharedSkuLedgers.slice(off, off + 100);
        return {
          ok: true,
          payload: {
            jsonrpc: '2.0',
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ data: { total: 350, list: slice } }),
                },
              ],
            },
          },
        };
      },
    });
    const whNormalized = normalizeLingxingWarehouseLedgers(whPaged.records, 'tenant-wh');
    const chunks180 = buildDateWindowChunks({
      totalDays: 180,
      chunkDays: 30,
      includeTomorrow: true,
      nowDate: new Date('2026-11-26T08:00:00Z'),
    });
    const orderTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'amazon_sales_order_list')!;
    const chunkedOrders = await collectChunkedDateRangeRecords({
      tool: orderTool,
      baseArgs: { offset: 0, length: 200 },
      totalDays: 90,
      chunkDays: 30,
      includeTomorrow: true,
      nowDate: new Date('2026-11-26T08:00:00Z'),
      fetchPage: async (args) => {
        const start = String(args.startDate || '');
        const pageNo = Number(args.pageNo ?? 1);
        const rows =
          pageNo === 1
            ? [
                { amazonOrderId: `ORD-${start}-1`, purchaseDateLocal: `${start} 10:00:00` },
                { amazonOrderId: `ORD-OVERLAP-SHARED`, purchaseDateLocal: `${start} 11:00:00` },
              ]
            : [];
        return {
          ok: true,
          payload: {
            jsonrpc: '2.0',
            result: {
              content: [{ type: 'text', text: JSON.stringify({ data: { total: rows.length, list: rows } }) }],
            },
          },
        };
      },
    });
    const windowGuardedOrders = mergeSyncedEntities(
      [
        { id: 'lx-ord-t1-old-aug', tenantId: 't1', purchaseDate: '2026-08-15' },
        { id: 'lx-ord-t1-stale-nov', tenantId: 't1', purchaseDate: '2026-11-10' },
        { id: 'lx-ord-t1-fresh-nov', tenantId: 't1', purchaseDate: '2026-11-20' },
      ],
      [{ id: 'lx-ord-t1-fresh-nov', tenantId: 't1', purchaseDate: '2026-11-20' }],
      't1',
      false,
      true,
      (item) => String(item.purchaseDate || '').slice(0, 10) >= '2026-10-27'
    );
    if (
      whSigA === whSigB ||
      whPaged.records.length !== 350 ||
      whNormalized.length !== 350 ||
      new Set(whNormalized.map((r) => r.id)).size !== 350 ||
      chunks180.length < 6 ||
      chunkedOrders.totalChunks < 3 ||
      chunkedOrders.records.length !== chunkedOrders.totalChunks + 1 ||
      windowGuardedOrders.length !== 2 ||
      !windowGuardedOrders.some((o) => o.id === 'lx-ord-t1-old-aug') ||
      windowGuardedOrders.some((o) => o.id === 'lx-ord-t1-stale-nov')
    ) {
      violations.push({
        ruleId: 'INFRA-ADV-11',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: `内存故障注入失败: 库存流水签名去重、分段订单拉取或历史订单窗口保护异常 (whRaw=${whPaged.records.length}, whNorm=${whNormalized.length}, chunks180=${chunks180.length}, chunkOrders=${chunkedOrders.records.length})`,
        historicalContext: '同 SKU/同单号库存流水严禁被折叠丢弃，长周期订单需分段拉全并保护窗口外历史订单。',
        file: 'src/services/lingxingMcpSync.ts',
        remediation: '检查 recordSignature(WAREHOUSE_LEDGERS)、normalizeLingxingWarehouseLedgers、buildDateWindowChunks 与 collectChunkedDateRangeRecords。',
      });
    }
    // Verify INFRA-ADV-12: browser localStorage is never read or written for DB config and legacy key is purged
    const origLocalStorageDesc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    let getItemCalls = 0;
    let setItemCalls = 0;
    const removedKeys: string[] = [];
    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
          getItem: () => {
            getItemCalls += 1;
            return null;
          },
          setItem: () => {
            setItemCalls += 1;
          },
          removeItem: (k: string) => {
            removedKeys.push(String(k));
          },
        },
      });
      clearLegacyBrowserSupabaseConfig();
      saveSupabaseConfig({
        projectUrl: 'https://mem-only-check.supabase.co/rest/v1/',
        anonKey: 'sb_publishable_mem_check',
        authMode: 'SUPABASE_AUTH',
        configSource: 'SERVER_MEMORY',
      });
      const loadedCfg = loadSupabaseConfig();
      if (
        getItemCalls !== 0 ||
        setItemCalls !== 0 ||
        !removedKeys.includes('xcloud_erp_supabase_config_v1') ||
        loadedCfg.projectUrl !== 'https://mem-only-check.supabase.co' ||
        loadedCfg.anonKey !== 'sb_publishable_mem_check'
      ) {
        violations.push({
          ruleId: 'INFRA-ADV-12',
          domain: DOMAIN,
          docPath: DOC_PATH,
          title: `内存故障注入失败: Supabase 配置仍尝试读写浏览器 localStorage 或未清理旧键 (get=${getItemCalls}, set=${setItemCalls}, removed=${removedKeys.join(',')})`,
          historicalContext: '已停用浏览器 localStorage 保存数据库配置，必须保持零 getItem/setItem 且主动 removeItem 旧键。',
          file: 'src/services/supabaseClient.ts',
          remediation: '确保 loadSupabaseConfig / saveSupabaseConfig 仅操作运行内存并调用 clearLegacyBrowserSupabaseConfig。',
        });
      }
    } finally {
      saveSupabaseConfig({
        projectUrl: '',
        anonKey: '',
        authMode: 'SUPABASE_AUTH',
        configSource: 'UNCONFIGURED',
      });
      if (origLocalStorageDesc) {
        Object.defineProperty(globalThis, 'localStorage', origLocalStorageDesc);
      } else {
        delete (globalThis as Record<string, unknown>).localStorage;
      }
    }
    // Verify INFRA-ADV-13: hybrid incremental sync strategy (native update_time + order lookback + historical PENDING exact-match refresh + first-sync FULL fallback)
    const incNow = new Date('2026-11-26T08:00:00Z');
    const whLedgerTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'batch_inventory_statement_list')!;
    const fbaDeliveryTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'get_delivery_order_list')!;
    const bomProcessTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'warehouse_processing_order_list')!;
    const salesOrderTool = LINGXING_OPENMCP_CORE_TOOLS.find((t) => t.name === 'amazon_sales_order_list')!;

    const firstSyncWhPlan = resolveIncrementalSyncPlan({
      tool: whLedgerTool,
      syncMode: 'INCREMENTAL',
      domainWatermark: { lastSyncedAt: '2026-11-24 10:00:00', mode: 'FULL', strategy: 'FULL_SNAPSHOT' },
      existingDomainCount: 0,
      nowDate: incNow,
    });
    const incWhPlan = resolveIncrementalSyncPlan({
      tool: whLedgerTool,
      syncMode: 'INCREMENTAL',
      domainWatermark: { lastSyncedAt: '2026-11-24 10:00:00', mode: 'FULL', strategy: 'FULL_SNAPSHOT' },
      existingDomainCount: 6155,
      nowDate: incNow,
    });
    const incFbaPlan = resolveIncrementalSyncPlan({
      tool: fbaDeliveryTool,
      syncMode: 'INCREMENTAL',
      domainWatermark: { lastSyncedAt: '2026-11-24 10:00:00', mode: 'FULL', strategy: 'FULL_SNAPSHOT' },
      existingDomainCount: 28,
      nowDate: incNow,
    });
    const incBomPlan = resolveIncrementalSyncPlan({
      tool: bomProcessTool,
      syncMode: 'INCREMENTAL',
      domainWatermark: { lastSyncedAt: '2026-11-24 10:00:00', mode: 'FULL', strategy: 'FULL_SNAPSHOT' },
      existingDomainCount: 15,
      nowDate: incNow,
    });
    const incOrderPlan = resolveIncrementalSyncPlan({
      tool: salesOrderTool,
      syncMode: 'INCREMENTAL',
      fullOrderSyncDays: 90,
      orderLookbackDays: 7,
      domainWatermark: { lastSyncedAt: '2026-11-24 10:00:00', mode: 'FULL', strategy: 'FULL_SNAPSHOT' },
      existingDomainCount: 3000,
      existingTenantOrders: [
        { amazonOrderId: '114-OLD-PEND-0001', orderStatus: 'PENDING', purchaseDate: '2026-10-12 09:00:00' },
        { amazonOrderId: '114-OLD-SHIP-0002', orderStatus: 'SHIPPED', purchaseDate: '2026-10-12 09:00:00' },
        { amazonOrderId: 'MCF-OLD-PEND-0003', orderStatus: 'PENDING', purchaseDate: '2026-10-12 09:00:00' },
        { amazonOrderId: '114-NEW-PEND-0004', orderStatus: 'PENDING', purchaseDate: '2026-11-22 09:00:00' },
      ],
      nowDate: incNow,
    });
    const capturedPendingArgs: Record<string, unknown>[] = [];
    const pendingRefreshRes = await collectPendingOrderRefreshRecords({
      tool: salesOrderTool,
      baseArgs: { pageNo: 1, pageSize: 200, isMcfOrder: '0' },
      pendingOrders: incOrderPlan.pendingOrdersToRefresh,
      nowDate: incNow,
      fetchPage: async (args) => {
        capturedPendingArgs.push(args);
        return {
          ok: true,
          payload: {
            jsonrpc: '2.0',
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    data: {
                      data: {
                        data: [
                          {
                            amazonOrderId: '114-OLD-PEND-0001',
                            orderStatus: 'Shipped',
                            purchaseDateLocal: '2026-10-12 09:00:00',
                          },
                        ],
                      },
                    },
                  }),
                },
              ],
            },
          },
        };
      },
    });
    if (
      firstSyncWhPlan.strategy !== 'FULL_SNAPSHOT' ||
      incWhPlan.strategy !== 'UPDATE_TIME_INCREMENTAL' ||
      incWhPlan.argsPatch.time_filter_field !== 'update_time' ||
      incWhPlan.preserveExistingOutsideDelta !== true ||
      incFbaPlan.strategy !== 'UPDATE_TIME_INCREMENTAL' ||
      incFbaPlan.argsPatch.time_type !== '3' ||
      incFbaPlan.preserveExistingOutsideDelta !== true ||
      incBomPlan.strategy !== 'UPDATE_TIME_INCREMENTAL' ||
      incBomPlan.argsPatch.search_field_time !== 'update_time' ||
      incBomPlan.preserveExistingOutsideDelta !== true ||
      incOrderPlan.strategy !== 'LOOKBACK_WINDOW_INCREMENTAL' ||
      (incOrderPlan.effectiveTotalDays ?? 999) > 14 ||
      incOrderPlan.pendingOrdersToRefresh.length !== 1 ||
      incOrderPlan.pendingOrdersToRefresh[0]?.amazonOrderId !== '114-OLD-PEND-0001' ||
      capturedPendingArgs.length !== 1 ||
      capturedPendingArgs[0]?.searchField !== 'amazonOrderId' ||
      capturedPendingArgs[0]?.exactSearch !== 1 ||
      capturedPendingArgs[0]?.searchValue !== '114-OLD-PEND-0001' ||
      pendingRefreshRes.records.length !== 1
    ) {
      violations.push({
        ruleId: 'INFRA-ADV-13',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: `内存故障注入失败: 领星混合增量策略、原生 update_time 参数映射或历史 PENDING 精确复查异常`,
        historicalContext: '首次/空库必须自动降级全量回溯；3 个原生接口必须注入 update_time 参数且开启 preserveExistingOutsideDelta；订单增量必须收缩窗口并精确复查窗口外历史 PENDING 单。',
        file: 'src/services/lingxingMcpSync.ts',
        remediation: '检查 resolveIncrementalSyncPlan 与 collectPendingOrderRefreshRecords 实现。',
      });
    }
    // Memory fault injection for INFRA-ADV-14:
    // 1) Bootstrap excludes heavy operational tables; heavy paginated tables excluded from page bulk dump
    const heavyTables = ['orders', 'listings', 'warehouseLedgers', 'searchTerms'] as const;
    const bootstrapLeaksHeavy = heavyTables.some((t) => BOOTSTRAP_ENTITY_TYPES.includes(t));
    const pageBulkLeaksHeavy =
      PAGE_ENTITY_REQUIREMENTS.amazon.includes('orders') ||
      PAGE_ENTITY_REQUIREMENTS.warehouse.includes('warehouseLedgers') ||
      PAGE_ENTITY_REQUIREMENTS.ads.includes('searchTerms');

    // 2) executePagedEntityQuery enforces tenant + shop-scope isolation, canceled exclusion, accurate totals & page 2 slicing
    const mockOrders = [
      {
        id: 'o-1',
        tenantId: 't-alpha',
        shopId: 'shop-1',
        shopName: 'US-Main',
        marketplace: 'US',
        amazonOrderId: '114-0000001-0000001',
        asin: 'B0TEST01',
        msku: 'SKU-1',
        purchaseDate: '2026-11-25 10:00:00',
        fulfillmentChannel: 'FBA',
        orderStatus: 'SHIPPED',
        quantity: 2,
        orderAmountUsd: 50,
        currency: 'USD',
      },
      {
        id: 'o-2',
        tenantId: 't-alpha',
        shopId: 'shop-1',
        shopName: 'US-Main',
        marketplace: 'US',
        amazonOrderId: '114-0000002-0000002',
        asin: 'B0TEST02',
        msku: 'SKU-2',
        purchaseDate: '2026-11-24 10:00:00',
        fulfillmentChannel: 'FBA',
        orderStatus: 'SHIPPED',
        quantity: 1,
        orderAmountUsd: 30,
        currency: 'USD',
      },
      {
        id: 'o-3',
        tenantId: 't-alpha',
        shopId: 'shop-1',
        shopName: 'US-Main',
        marketplace: 'US',
        amazonOrderId: '114-0000003-0000003',
        asin: 'B0TEST03',
        msku: 'SKU-3',
        purchaseDate: '2026-11-23 10:00:00',
        fulfillmentChannel: 'FBA',
        orderStatus: 'CANCELED',
        quantity: 4,
        orderAmountUsd: 100,
        currency: 'USD',
      },
      {
        id: 'o-4',
        tenantId: 't-alpha',
        shopId: 'shop-2',
        shopName: 'US-Restricted',
        marketplace: 'US',
        amazonOrderId: '114-0000004-0000004',
        asin: 'B0TEST04',
        msku: 'SKU-4',
        purchaseDate: '2026-11-22 10:00:00',
        fulfillmentChannel: 'FBA',
        orderStatus: 'SHIPPED',
        quantity: 5,
        orderAmountUsd: 200,
        currency: 'USD',
      },
      {
        id: 'o-5',
        tenantId: 't-other',
        shopId: 'shop-1',
        shopName: 'Other-Tenant',
        marketplace: 'US',
        amazonOrderId: '114-0000005-0000005',
        asin: 'B0TEST05',
        msku: 'SKU-5',
        purchaseDate: '2026-11-21 10:00:00',
        fulfillmentChannel: 'FBA',
        orderStatus: 'SHIPPED',
        quantity: 3,
        orderAmountUsd: 90,
        currency: 'USD',
      },
    ];
    const pagedRes = executePagedEntityQuery<{ id: string }>(mockOrders, {
      entityType: 'orders',
      tenantId: 't-alpha',
      roleCode: 'OPS_STAFF',
      allowedShopIds: ['shop-1'],
      page: 1,
      pageSize: 5,
      filters: { excludeCanceled: true, excludeReplacement: true },
    });
    if (
      bootstrapLeaksHeavy ||
      pageBulkLeaksHeavy ||
      pagedRes.totalItems !== 2 ||
      pagedRes.items.length !== 2 ||
      pagedRes.summary?.totalUnits !== 3 ||
      pagedRes.summary?.revenueUsd !== 80 ||
      pagedRes.summary?.excludedCanceledCount !== 1
    ) {
      violations.push({
        ruleId: 'INFRA-ADV-14',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存故障注入失败: 按需引导边界或后端分页查询隔离/汇总异常',
        historicalContext: '启动引导与大表页面不得全量下发重表；分页查询必须严格隔离租户与店铺并准确计算排除取消单后的总件数与总金额。',
        file: 'src/services/backendDataEngine.ts',
        remediation: '检查 BOOTSTRAP_ENTITY_TYPES、PAGE_ENTITY_REQUIREMENTS 与 executePagedEntityQuery 实现。',
      });
    }
    // Memory fault injection for INFRA-ADV-15: Cloudflare Worker fetch handler parity & security guards
    resetWorkerRuntimeDbConfigForTest();
    try {
      let assetFetchedPath = '';
      const mockEnv = {
        SUPABASE_URL: 'https://cf-worker-test.supabase.co/rest/v1/',
        SUPABASE_ANON_KEY: 'sb_publishable_cf_worker_test',
        SUPABASE_SERVICE_ROLE_KEY: 'secret_must_never_leak_to_client',
        ASSETS: {
          fetch: async (input: Request | string) => {
            const reqUrl = typeof input === 'string' ? input : input.url;
            assetFetchedPath = new URL(reqUrl).pathname;
            return new Response('<html>SPA</html>', { status: 200 });
          },
        },
      };
      const cfgRes = await handleWorkerRequest(
        new Request('https://xclouderp.example.workers.dev/api/platform/db-config'),
        mockEnv
      );
      const cfgRaw = await cfgRes.text();
      const cfgJson = JSON.parse(cfgRaw) as {
        ok?: boolean;
        configSource?: string;
        config?: { projectUrl?: string; anonKey?: string };
      };
      const forbiddenPostRes = await handleWorkerRequest(
        new Request('https://xclouderp.example.workers.dev/api/platform/db-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ portalMode: 'TENANT_WORKSPACE', projectUrl: 'https://a.supabase.co', anonKey: 'k' }),
        }),
        mockEnv
      );
      const expiredProxyRes = await handleWorkerRequest(
        new Request('https://xclouderp.example.workers.dev/api/lingxing/mcp-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantStatus: 'EXPIRED_READONLY', mcpEndpointUrl: 'https://openmcp.lingxing.com', mcpApiKey: 'k' }),
        }),
        mockEnv
      );
      const invalidPageRes = await handleWorkerRequest(
        new Request('https://xclouderp.example.workers.dev/api/erp/page-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageId: '__invalid_page__' }),
        }),
        mockEnv
      );
      const spaRes = await handleWorkerRequest(
        new Request('https://xclouderp.example.workers.dev/overview'),
        mockEnv
      );

      if (
        cfgRes.status !== 200 ||
        cfgJson.configSource !== 'ENV' ||
        cfgJson.config?.projectUrl !== 'https://cf-worker-test.supabase.co' ||
        cfgRaw.includes('secret_must_never_leak_to_client') ||
        forbiddenPostRes.status !== 403 ||
        expiredProxyRes.status !== 402 ||
        invalidPageRes.status !== 400 ||
        spaRes.status !== 200 ||
        assetFetchedPath !== '/overview'
      ) {
        violations.push({
          ruleId: 'INFRA-ADV-15',
          domain: DOMAIN,
          docPath: DOC_PATH,
          title: '内存故障注入失败: Cloudflare Worker 环境变量读取、安全隔离拦截或静态资源回落异常',
          historicalContext: 'worker.ts 必须从 Cloudflare env 读取公开连接配置且绝不泄漏高危密钥，正确执行 403/402/400 防线并将前端路由委派至 env.ASSETS.fetch。',
          file: 'worker.ts',
          remediation: '检查 worker.ts 中的 handleWorkerRequest 实现。',
        });
      }
    } finally {
      resetWorkerRuntimeDbConfigForTest();
    }
    return violations;
  },
};
