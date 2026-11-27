import type { DomainAuditSuite, AuditViolation } from './types';
import { findLineNumber } from './types';

const DOMAIN = '05-security-ops-and-runtime';
const DOC_PATH = 'docs/05-security-ops-and-runtime.md';

export const securityOpsRuntimeAuditSuite: DomainAuditSuite = {
  domain: DOMAIN,
  name: '安全防线、工程门禁与运行时约束域',
  docPath: DOC_PATH,
  triggerPatterns: [
    /^package\.json$/,
    /^\.env\.example$/,
    /^AGENTS\.md$/,
    /^docs\//,
    /^scripts\//,
    /^metadata\.json$/,
    /^index\.html$/,
    /^\.github\/workflows\//,
    /^wrangler\.toml$/,
  ],
  unitTestFiles: ['test/05-security-ops.test.ts'],
  rules: [
    {
      id: 'SEC-ADV-01',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '源码严禁硬编码真实 JWT Token 或生产活体 API 密钥前缀',
      historicalContext: '硬编码凭据随构建产物下发浏览器将导致数据库与第三方账户被直接接管。',
      remediation: '删除硬编码密钥，改为服务端 process.env 或运行时脱敏演示占位符。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const files = [...ctx.listFiles('src', /\.(ts|tsx)$/), 'server.ts'].filter((f) =>
          ctx.fileExists(f)
        );
        const liveKeyRegex = new RegExp(
          ['eyJhbGciOi[A-Za-z0-9_-]{15,}', ['lx_mcp', '_live_'].join(''), 'sk-live-[A-Za-z0-9]{10,}'].join(
            '|'
          )
        );
        for (const relPath of files) {
          const content = ctx.readFile(relPath);
          const match = liveKeyRegex.exec(content);
          if (match) {
            violations.push({
              ruleId: 'SEC-ADV-01',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `检测到疑似硬编码真实密钥/JWT (${relPath})`,
              historicalContext: '真实密钥严禁进入源码或前端产物。',
              file: relPath,
              line: findLineNumber(content, match.index),
              snippet: match[0].slice(0, 30),
              remediation: '改用环境变量或脱敏 demo 占位符。',
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'SEC-ADV-02',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '严禁使用 dangerouslySetInnerHTML 或 eval() 防御 XSS / 代码注入',
      historicalContext: '亚马逊商品标题与搜索词源自外部输入，原始 HTML 注入会引发存储型 XSS。',
      remediation: '使用 React 默认安全 JSX 文本绑定替代原始 HTML 注入。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const files = [...ctx.listFiles('src', /\.(ts|tsx)$/), 'server.ts'].filter((f) =>
          ctx.fileExists(f)
        );
        for (const relPath of files) {
          const content = ctx.readFile(relPath);
          const match = /dangerouslySetInnerHTML|\beval\s*\(/.exec(content);
          if (match) {
            violations.push({
              ruleId: 'SEC-ADV-02',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `检测到高危注入原语: ${match[0]}`,
              historicalContext: '禁止在 React/Express 中使用危险 HTML 注入或动态 eval。',
              file: relPath,
              line: findLineNumber(content, match.index),
              remediation: '改用安全的 React JSX 渲染。',
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'SEC-ADV-03',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'package.json 必须完整配置 check、check:fast、check:full、lint 与 test 门禁脚本',
      historicalContext: '缺少标准门禁脚本会导致 CI 与开发者无法一键触发对抗自检闭环。',
      remediation: '在 package.json 的 scripts 字段补全 check、check:fast、check:full、lint、test。',
      check(ctx) {
        const pkgRaw = ctx.readFile('package.json');
        const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
        const requiredScripts = ['check', 'check:fast', 'check:full', 'lint', 'test'];
        const missing = requiredScripts.filter((s) => !pkg.scripts?.[s]);
        if (missing.length > 0) {
          return [
            {
              ruleId: 'SEC-ADV-03',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `package.json 缺失门禁脚本: ${missing.join(', ')}`,
              historicalContext: '工程自循环闭环依赖统一的 npm scripts 入口。',
              file: 'package.json',
              remediation: `在 package.json scripts 中补齐: ${missing.join(', ')}。`,
            },
          ];
        }
        return [];
      },
    },
    {
      id: 'SEC-ADV-04',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '只增不擅删防线：AGENTS.md 与全部 5 篇领域架构专篇必须存在且非空',
      historicalContext: '防止重构期间误删工程宪法或领域架构文档导致历史防重契约丢失。',
      remediation: '确保 AGENTS.md 及 docs/01-*.md ~ docs/05-*.md 全部完整存在。',
      check(ctx) {
        const requiredDocs = [
          'AGENTS.md',
          'docs/01-core-infra-and-sync.md',
          'docs/02-db-auth-and-rbac.md',
          'docs/03-erp-domain-and-mcp.md',
          'docs/04-frontend-ui-and-state.md',
          'docs/05-security-ops-and-runtime.md',
        ];
        const violations: AuditViolation[] = [];
        for (const doc of requiredDocs) {
          if (!ctx.fileExists(doc) || ctx.readFile(doc).trim().length < 200) {
            violations.push({
              ruleId: 'SEC-ADV-04',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `核心架构文档缺失或内容过短: ${doc}`,
              historicalContext: '严格遵循只增不擅删红线，禁止清空或删除架构专篇。',
              file: doc,
              remediation: `恢复并完善 ${doc}。`,
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'SEC-ADV-05',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'GitHub Push 自动部署 Cloudflare 流水线契约：最小权限、构建前门禁、严禁硬编码令牌且保留控制台环境变量 (keep_vars)',
      historicalContext:
        '缺少 CI/CD 校验或硬编码 Cloudflare Token 会引发凭据泄漏与带病上线，且 wrangler deploy 若未启用 keep_vars = true 会意外清空 Cloudflare Dashboard 中配置的明文环境变量。',
      remediation:
        '保持 .github/workflows/deploy-cloudflare.yml 监听 push (main/master) 与 workflow_dispatch、声明 contents: read 最小权限、部署前执行 npm run check:full 与 npm run build、仅引用 secrets.CLOUDFLARE_API_TOKEN 与 secrets.CLOUDFLARE_ACCOUNT_ID，并在 wrangler.toml 启用 keep_vars = true。',
      check(ctx) {
        const violations: AuditViolation[] = [];
        const wfPath = '.github/workflows/deploy-cloudflare.yml';
        if (!ctx.fileExists(wfPath)) {
          return [
            {
              ruleId: 'SEC-ADV-05',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: '缺失 GitHub Actions 自动部署流水线 .github/workflows/deploy-cloudflare.yml',
              historicalContext: '推送 GitHub 自动部署 Cloudflare 依赖标准 workflow 定义。',
              file: wfPath,
              remediation: '恢复 .github/workflows/deploy-cloudflare.yml。',
            },
          ];
        }
        const wf = ctx.readFile(wfPath);
        const wrangler = ctx.fileExists('wrangler.toml') ? ctx.readFile('wrangler.toml') : '';

        if (
          !/push:/.test(wf) ||
          !/workflow_dispatch:/.test(wf) ||
          !/contents:\s*read/.test(wf) ||
          !/npm run check:full/.test(wf) ||
          !/npm run build/.test(wf) ||
          !/cloudflare\/wrangler-action@v3/.test(wf) ||
          !/secrets\.CLOUDFLARE_API_TOKEN/.test(wf) ||
          !/secrets\.CLOUDFLARE_ACCOUNT_ID/.test(wf)
        ) {
          violations.push({
            ruleId: 'SEC-ADV-05',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'deploy-cloudflare.yml 缺少触发器、最小权限、发布前门禁或标准 Secrets 引用',
            historicalContext: 'CI 自动部署必须先过门禁再发布，且凭据仅允许来自 GitHub Secrets。',
            file: wfPath,
            remediation: '补齐 push/workflow_dispatch、contents: read、npm run check:full、npm run build 与 secrets.CLOUDFLARE_* 配置。',
          });
        }
        if (/(?:account_id|apiToken)\s*[:=]\s*["']?[0-9a-fA-F_-]{20,}["']?/.test(wf) || /account_id\s*=\s*["'][0-9a-f]{32}["']/i.test(wrangler)) {
          violations.push({
            ruleId: 'SEC-ADV-05',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: '检测到在工作流或 wrangler.toml 中硬编码真实 Cloudflare Account ID 或 API Token',
            historicalContext: '账户标识与 API Token 应统一存放于 GitHub Actions Secrets，禁止硬编码进公开仓库。',
            file: wfPath,
            remediation: '改用 ${{ secrets.CLOUDFLARE_ACCOUNT_ID }} 与 ${{ secrets.CLOUDFLARE_API_TOKEN }} 注入。',
          });
        }
        if (!/keep_vars\s*=\s*true/.test(wrangler)) {
          violations.push({
            ruleId: 'SEC-ADV-05',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'wrangler.toml 未启用 keep_vars = true，CI 自动部署可能覆盖 Cloudflare 控制台环境变量',
            historicalContext: 'Wrangler 默认会在部署时清空未写入 wrangler.toml 的控制台明文变量。',
            file: 'wrangler.toml',
            remediation: '在 wrangler.toml 顶层添加 keep_vars = true。',
          });
        }
        return violations;
      },
    },
  ],
  async verify(ctx) {
    const violations: AuditViolation[] = [];
    if (!ctx.fileExists('.env.example')) {
      violations.push({
        ruleId: 'SEC-ADV-01',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存校验失败: 根目录缺失 .env.example 模板文件',
        historicalContext: '所有环境变量契约必须在 .env.example 中声明。',
        file: '.env.example',
        remediation: '恢复根目录 .env.example。',
      });
    }
    const html = ctx.readFile('index.html');
    const meta = JSON.parse(ctx.readFile('metadata.json')) as { name?: string };
    if (!meta.name || !html.includes('X Cloud ERP')) {
      violations.push({
        ruleId: 'SEC-ADV-04',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '内存校验失败: index.html 与 metadata.json 的应用名称未同步为 X Cloud ERP',
        historicalContext: 'HTML 标题必须与 metadata.json 品牌一致。',
        file: 'index.html',
        remediation: '确保 index.html <title> 与 metadata.json name 均包含 X Cloud ERP。',
      });
    }
    return violations;
  },
};
