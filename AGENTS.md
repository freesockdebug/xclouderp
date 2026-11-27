# X Cloud ERP — 第一性原理驱动 · 对抗式 AI 自演进工程入口 (`AGENTS.md`)

> 本文件是 **X Cloud ERP** 全栈工程的唯一全局上下文路由器与架构红线宪法。所有开发者与 AI 工程代理在修改任何代码或排查故障前，必须先阅读本文件并严格按业务域按需加载对应架构专篇。

---

## 一、架构文档与对抗挑刺脚本按需路由表 (On-Demand Context & Audit Routing)

> **强制执行指令**：修改代码或排查问题前，**仅根据当前任务命中的业务域**，读取下方对应的 1 个 `/docs/0X-*.md` 架构与接口专篇（避免上下文污染）；修改完成后，必须运行 `npm run check` 触发对应领域的对抗挑刺脚本、文档同步门禁与关联单测。

| 领域编号与涉及模块 | 必读架构与接口专篇 (`docs/0X-*.md`) | 对应对抗挑刺脚本 (`scripts/audits/0X-*.audit.ts`) | 关联运行时对抗单测 (`test/*.test.ts`) |
| --- | --- | --- | --- |
| `01-core-infra-and-sync`<br>Express 网关 (`server.ts`)、领星 MCP 代理、Cloudflare Workers、Supabase 连接器 (`src/services/supabaseClient.ts`) | `docs/01-core-infra-and-sync.md` | `scripts/audits/01-core-infra-and-sync.audit.ts` | `test/01-core-infra.test.ts` |
| `02-db-auth-and-rbac`<br>多租户 PostgreSQL RLS Schema、双模认证 (Supabase Auth / Logto OIDC)、双门户物理隔离、三级 RBAC 权限树 (`SuperAdminConsoleView`, `RbacPermissionCenterView`, `TenantSubscriptionView`) | `docs/02-db-auth-and-rbac.md` | `scripts/audits/02-db-auth-and-rbac.audit.ts` | `test/02-db-auth-rbac.test.ts` |
| `03-erp-domain-and-mcp`<br>核心业财核算引擎 (`src/lib/erpEngine.ts`)、多维利润、FBA 泡重计费、智能补货/BOM/财务结算、下游 `/api/mcp` JSON-RPC 2.0 网关 | `docs/03-erp-domain-and-mcp.md` | `scripts/audits/03-erp-domain-and-mcp.audit.ts` | `test/03-erp-domain-mcp.test.ts` |
| `04-frontend-ui-and-state`<br>React 19 视图层 (`src/App.tsx`, `src/components/*`)、Tailwind v4 主题 (`src/index.css`)、双门户动态路由、品牌脱敏与 IFrame 规范 | `docs/04-frontend-ui-and-state.md` | `scripts/audits/04-frontend-ui-and-state.audit.ts` | `test/04-frontend-ui.test.ts` |
| `05-security-ops-and-runtime`<br>密钥防泄漏、XSS/代码注入防线、工程门禁脚本 (`package.json`, `scripts/check-preflight.ts`)、环境契约 (`.env.example`, `metadata.json`) | `docs/05-security-ops-and-runtime.md` | `scripts/audits/05-security-ops-and-runtime.audit.ts` | `test/05-security-ops.test.ts` |

---

## 二、全局第一性原理硬性红线 (Global Invariants)

1. **双门户最小特权隔离公理 (Dual-Portal Least-Privilege Isolation)**：
   - 平台超管控制台 (`PLATFORM_SUPER_ADMIN`) 与卖家租户工作台 (`TENANT_WORKSPACE`) 必须物理分离；租户管理员严禁访问跨租户列表、全局套餐定价或激活码签发器，超管进入租户必须经由审计留痕的代管动作。
2. **订阅失效全链路写熔断公理 (Subscription Write Circuit-Breaker)**：
   - 当租户处于 `EXPIRED_READONLY` 或 `SUSPENDED` 状态时，UI 按钮层、Express/Worker 边缘网关层 (`/api/lingxing/mcp-proxy` & `/api/mcp` 返回 HTTP `402`)、以及 Supabase PostgreSQL RLS 内核层 (`is_tenant_writable()`) 必须同步阻断一切写操作与定时同步。
3. **上游数据源单一协议公理 (Lingxing MCP Only)**：
   - 亚马逊线上数据统一经由租户绑定的 **领星 ERP MCP** (`Streamable HTTP` + `X-Mcp-Key`) 拉取归一化，禁止在业务界面重新引入繁琐的 Amazon SP-API / Advertising API AWS SigV4 密钥配置表单。
4. **外部网络调用刚性超时公理 (Hard Network Timeout Bound)**：
   - 服务端与边缘 Worker 发起的所有外部 `fetch()` 请求必须绑定刚性超时信号 (`AbortSignal.timeout(...)` 或等价 `signal`)，杜绝上游挂起耗尽事件循环与 Worker 并发槽位。
5. **业财数值零异常与单一计算真理公理 (Zero-NaN Financial Single Source of Truth)**：
   - 所有利润核算、FBA 泡重计费、配额校验与 RBAC 鉴权必须收敛在纯函数引擎 `src/lib/erpEngine.ts` 中，对除零、负尺寸、零营收、零汇率做显式防御，保证 UI、边缘网关与内存故障注入测试同源一致。
6. **数据级行隔离与成本脱敏公理 (Shop-Scope RLS & Cost Masking)**：
   - 非 `TENANT_ADMIN` 员工仅可见 `allowedShopIds` 白名单内的店铺数据 (`filterByShopScope`)；当 `hidePurchaseCost === true` 或缺少 `finance:cost_view` 权限时，前端列表与 CSV 导出必须强制脱敏采购成本与净利润。
7. **品牌纯净、零硬编码密钥与 IFrame 安全公理 (Clean Brand & Runtime Safety)**：
   - 全仓库品牌统一为 **X Cloud ERP** (`XC-` / `xcloud://`)，严禁出现未脱敏真实企业/个人隐私信息、真实 JWT/Live Key、`window.alert`、`window.open` 或 `dangerouslySetInnerHTML`。

---

## 三、对抗性历史挑刺与架构文档自演进闭环 (Adversarial Self-Evolving Gate)

1. **强制工具门禁**：
   - 每次代码变更完成后，必须运行 `npm run check`（基于 `git diff` 智能路由受影响域）或全量验收 `npm run check:full`（执行全部 5 大业务域静态对抗规则 + 内存级 `verify()` 故障注入 + `DOC-SYNC-GUARD` + `tsc --noEmit` + 全量单元测试）。
   - 快速开发迭代期间可使用 `npm run check:fast`（2 秒内完成静态探针 + 内存故障注入 + 文档同步校验）。
2. **故障沉淀与文档双向同步（核心自循环引擎）**：
   - 每当修复一类新 Bug、接口边界缺陷或完成架构演进时：
     1. 若属**静态边界 / 架构反模式**，必须在对应的 `scripts/audits/0X-*.audit.ts` 中新增一条 `*-ADV-*` 对抗挑刺规则（拒绝泛泛样式检查，专抓必炸边界点）；
     2. 若属**运行时状态 / 计算边界 / 并发契约**，必须在对应领域的 `verify()` 内存故障注入函数及 `test/*.test.ts` 中补充对抗性断言；
     3. **强制同步文档**：新增或变更任何 `*-ADV-*` 规则 ID 或核心接口契约后，必须同步更新对应的 `/docs/0X-*.md` 第六章规则登记表。`scripts/check-preflight.ts` 内置 **`DOC-SYNC-GUARD`** 双向 1:1 校验，代码与文档任意一侧漏登都将直接阻断构建。

---

## 四、只增不擅删与无损迁移确认红线 (Zero Unauthorized Deletion Invariant)

- 修改或重构任何架构宪法 (`AGENTS.md`)、领域专篇 (`docs/01-*.md` ~ `docs/05-*.md`)、对抗巡检脚本 (`scripts/audits/*.ts`) 或对抗单测 (`test/*.test.ts`) 时，必须严格遵守 **“只增不擅删、可无损迁移但严禁直接丢弃历史规则与契约”** 原则。
- 若因架构重构确实需要废弃某条历史 `*-ADV-*` 规则，必须在对应 `/docs/0X-*.md` 中保留废弃迁移说明并经人工明确确认，严禁为了绕过报错而静默删除规则或削弱断言。
