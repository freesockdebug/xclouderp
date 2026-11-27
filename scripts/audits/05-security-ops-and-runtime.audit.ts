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
