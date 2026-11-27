# 05. 安全防线、工程门禁与运行时约束域 (`05-security-ops-and-runtime`)

## 1. 适用场景声明
当修改或排查以下目录与文件时，**必读本篇**：
- `/package.json`（依赖与自演进工程门禁脚本）
- `/.env.example`（环境变量模板，严禁填写真实密钥）
- `/metadata.json` 与 `/index.html`（应用名称与描述同步）
- `/AGENTS.md`、`/docs/01-*.md` ~ `/docs/05-*.md`
- `/scripts/check-preflight.ts` 与 `/scripts/audits/*`
- `/test/01-*.test.ts` ~ `/test/05-*.test.ts`

---

## 2. 第一性原理推导 (First-Principles Derivation)
1. **为什么把“文档与代码同步”上升为编译级硬门禁 (`DOC-SYNC-GUARD`)**：
   - 软件工程中文档腐烂的根本原因是“文档是被动副产物而非构建依赖”。将 `scripts/audits/0X-*.audit.ts` 中的每一条 `*-ADV-*` 规则 ID 与 `/docs/0X-*.md` 做双向 1:1 集合相等校验（$R_{\text{code}} = R_{\text{doc}}$），把文档同步转化为可验证的数学不变量，从根源消灭“改了代码忘改文档”或“删了测试留死文档”。
2. **为什么构建「只增不擅删」与「零硬编码密钥/XSS」防线**：
   - AI 辅助迭代最危险的退化模式是“为快速通过测试而静默删除断言/文档”或“调试时把真实 JWT 写入前端源码”。通过独立的安全与工程运维巡检域持续守护密钥零泄露、XSS 零注入与工程文档完整存在。

---

## 3. 总体架构拓扑与核心数据流

```mermaid
flowchart TD
    Dev[代码修改完成] --> Cmd[npm run check / check:fast / check:full]
    Cmd --> Router[git diff 智能领域路由]
    Router --> Static[静态 AST/正则对抗探针: 20 条 *-ADV-* 规则]
    Router --> Verify[内存级运行时故障注入 verify()]
    Router --> DocGuard[DOC-SYNC-GUARD: .audit.ts <-> docs/0X-*.md 双向 1:1 校验]
    Static --> Tsc[tsc --noEmit 类型安全校验]
    Verify --> Tsc
    DocGuard --> Tsc
    Tsc --> Tests[npx tsx --test 关联业务域单测]
    Tests --> Pass[0 Error 放行构建]
```

| 门禁命令 | 适用阶段 | 执行内容 |
| --- | --- | --- |
| `npm run check` | 日常增量开发 | `git diff` 自动命中受影响域 → 静态探针 + 内存 `verify()` + `DOC-SYNC-GUARD` + `tsc --noEmit` + 对应域单测 |
| `npm run check:fast` | 高频自检 (`< 2s`) | 跳过子进程单测，快速执行静态探针 + 内存 `verify()` + `DOC-SYNC-GUARD` + `tsc --noEmit` |
| `npm run check:full` | 提交/发布全量验收 | 强制全量扫描全部 5 大业务域 + 全部 20 条 `*-ADV-*` 规则 + 全部 5 组 `verify()` + 全量单元测试 |

---

## 4. 详细设计方案与代码契约
1. **统一巡检类型契约 (`/scripts/audits/types.ts`)**：
   - `AuditViolation` 必须包含 `ruleId`, `domain`, `docPath`, `title`, `historicalContext`, `file`, `line`, `remediation`，保证每次拦截都能直指根因与对应架构文档。
2. **环境变量契约 (`/.env.example`)**：
   - 仅保留变量名与脱敏示例占位符，严禁写入真实 Supabase Service Role Key、Logto App Secret 或领星生产密钥。
3. **元数据对齐契约**：
   - `metadata.json` 的 `name` 字段与 `index.html` 的 `<title>` 必须包含一致的应用品牌名 `X Cloud ERP`。

---

## 5. 接口详细文档 (API & Data Contracts)

### CLI 门禁参数契约 (`npx tsx scripts/check-preflight.ts`)
- `--full`：忽略 `git diff` 增量过滤，强制执行全部 5 个 `DomainAuditSuite`。
- `--fast`：跳过 `npx tsx --test` 子进程执行，用于快速验证静态红线、内存故障注入与 `DOC-SYNC-GUARD`。
- **退出码契约**：
  - `0`：所有静态规则、内存 `verify()`、文档双向同步、`tsc --noEmit` 与单测全部通过。
  - `1`：任一门禁失败，并输出结构化违规报告与修复指引。

---

## 6. 历史故障与对抗挑刺规则索引 (`scripts/audits/05-security-ops-and-runtime.audit.ts`)

| 规则 / 测试 ID | 挑刺检查目标 | 历史故障根因与防重契约 |
| --- | --- | --- |
| `SEC-ADV-01` | 扫描 `src/` 与 `server.ts` 严禁硬编码真实 JWT (`eyJhbGci`) 或生产活体密钥前缀 | 防止密钥随前端 Bundle 打包泄露或误提交至代码仓库 |
| `SEC-ADV-02` | 扫描 `src/` 与 `server.ts` 严禁使用 `dangerouslySetInnerHTML` 或动态 `eval(` | 防止来自领星/亚马逊商品标题的恶意 HTML 载荷触发存储型 XSS |
| `SEC-ADV-03` | 校验 `package.json` 必须完整声明 `check`、`check:fast`、`check:full`、`lint`、`test` 脚本 | 防止误改 `package.json` 导致工程门禁与 CI 自动化入口失效 |
| `SEC-ADV-04` | 校验 `/AGENTS.md` 与全部 5 篇 `/docs/01-*.md` ~ `/docs/05-*.md` 均存在且包含强制规则索引章 | 落地“只增不擅删”工程宪法，防止架构文档被误删或清空 |
