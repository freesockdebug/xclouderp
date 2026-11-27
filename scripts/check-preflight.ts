import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { ALL_DOMAIN_SUITES } from './audits/index';
import type { AuditContext, AuditViolation, DomainAuditSuite } from './audits/types';

const ROOT_DIR = process.cwd();
const args = new Set(process.argv.slice(2));
const isFull = args.has('--full');
const isFast = args.has('--fast');

function createAuditContext(rootDir: string): AuditContext {
  return {
    rootDir,
    readFile(relPath: string): string {
      const full = path.join(rootDir, relPath);
      if (!fs.existsSync(full)) return '';
      return fs.readFileSync(full, 'utf8');
    },
    fileExists(relPath: string): boolean {
      return fs.existsSync(path.join(rootDir, relPath));
    },
    listFiles(dirRelPath: string, extRegex?: RegExp): string[] {
      const base = path.join(rootDir, dirRelPath);
      if (!fs.existsSync(base)) return [];
      const results: string[] = [];
      const walk = (current: string) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
            continue;
          }
          const fullPath = path.join(current, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else {
            const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');
            if (!extRegex || extRegex.test(rel)) {
              results.push(rel);
            }
          }
        }
      };
      walk(base);
      return results;
    },
  };
}

function getChangedFiles(): string[] {
  try {
    const tracked = execSync('git diff --name-only HEAD', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const untracked = execSync('git ls-files --others --exclude-standard', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    return Array.from(new Set([...tracked, ...untracked]));
  } catch {
    return [];
  }
}

function selectSuites(): { suites: DomainAuditSuite[]; reason: string } {
  if (isFull) {
    return { suites: ALL_DOMAIN_SUITES, reason: '--full 全量扫描全部 5 大正交业务域' };
  }
  const changed = getChangedFiles();
  if (changed.length === 0) {
    return {
      suites: ALL_DOMAIN_SUITES,
      reason: '未检测到增量 git diff，自动回退为全量 5 大业务域扫描',
    };
  }
  const matched = ALL_DOMAIN_SUITES.filter((suite) =>
    changed.some((file) => suite.triggerPatterns.some((re) => re.test(file)))
  );
  if (matched.length === 0) {
    return {
      suites: ALL_DOMAIN_SUITES,
      reason: '变更文件未精确命中单一域，安全回退为全量扫描',
    };
  }
  return {
    suites: matched,
    reason: `git diff 智能路由命中 ${matched.length} 个受影响域 (${changed.length} 个变更文件)`,
  };
}

/**
 * DOC-SYNC-GUARD: Bidirectional 1:1 rule ID synchronization gate
 * Ensures every rule.id in 0X-*.audit.ts is documented in docs/0X-*.md
 * AND every *-ADV-* ID listed in docs/0X-*.md exists in 0X-*.audit.ts.
 */
function runDocSyncGuard(ctx: AuditContext, suites: DomainAuditSuite[]): AuditViolation[] {
  const violations: AuditViolation[] = [];
  for (const suite of suites) {
    if (!ctx.fileExists(suite.docPath)) {
      violations.push({
        ruleId: 'DOC-SYNC-GUARD',
        domain: suite.domain,
        docPath: suite.docPath,
        title: `缺失业务域架构专篇文档: ${suite.docPath}`,
        historicalContext: '每个正交业务域必须维护独立的架构与规则索引专篇。',
        file: suite.docPath,
        remediation: `创建并补充 ${suite.docPath}。`,
      });
      continue;
    }

    const docText = ctx.readFile(suite.docPath);
    const codeRuleIds = new Set(suite.rules.map((r) => r.id));
    const docRuleMatches = docText.match(/\b[A-Z]+-ADV-\d+\b/g) || [];
    const docRuleIds = new Set(docRuleMatches);

    for (const ruleId of codeRuleIds) {
      if (!docRuleIds.has(ruleId)) {
        violations.push({
          ruleId: 'DOC-SYNC-GUARD',
          domain: suite.domain,
          docPath: suite.docPath,
          title: `代码规则 [${ruleId}] 未同步登记至架构文档 ${suite.docPath}`,
          historicalContext:
            '新增或修改 *-ADV-* 挑刺规则却忘记更新架构专篇，将导致团队上下文与代码约束脱节。',
          file: suite.docPath,
          remediation: `在 ${suite.docPath} 第 6 章规则索引表中登记 [${ruleId}] 的检查目标与防重契约。`,
        });
      }
    }

    for (const docId of docRuleIds) {
      if (!codeRuleIds.has(docId)) {
        violations.push({
          ruleId: 'DOC-SYNC-GUARD',
          domain: suite.domain,
          docPath: suite.docPath,
          title: `文档 ${suite.docPath} 登记了未在代码中实现的规则 [${docId}]`,
          historicalContext: '文档中存在“纸面规则”而无对应自动化巡检脚本，会造成虚假安全感。',
          file: `scripts/audits/${suite.domain}.audit.ts`,
          remediation: `在对应 .audit.ts 中实现 [${docId}] 或核对规则 ID 拼写。`,
        });
      }
    }
  }
  return violations;
}

async function main() {
  const startMs = Date.now();
  const ctx = createAuditContext(ROOT_DIR);
  const { suites, reason } = selectSuites();

  console.log(`\n[X Cloud ERP Preflight Gate] ${reason}`);
  console.log(`命中业务域: ${suites.map((s) => s.domain).join(', ')}\n`);

  const allViolations: AuditViolation[] = [];
  let totalRulesChecked = 0;

  // 1. Static Adversarial Rules + In-Memory Fault Injection verify()
  for (const suite of suites) {
    for (const rule of suite.rules) {
      totalRulesChecked += 1;
      const found = rule.check(ctx);
      allViolations.push(...found);
    }
    if (suite.verify) {
      const verifyViolations = await suite.verify(ctx);
      allViolations.push(...verifyViolations);
    }
  }

  // 2. Bidirectional DOC-SYNC-GUARD
  const docSyncViolations = runDocSyncGuard(ctx, suites);
  allViolations.push(...docSyncViolations);

  if (allViolations.length > 0) {
    console.error(`❌ 发现 ${allViolations.length} 项对抗门禁违规:\n`);
    for (const v of allViolations) {
      console.error(`  [${v.ruleId}] (${v.domain}) ${v.title}`);
      console.error(`    文件: ${v.file}${v.line ? `:${v.line}` : ''}`);
      console.error(`    背景: ${v.historicalContext}`);
      console.error(`    修复: ${v.remediation}`);
      console.error(`    专篇: ${v.docPath}\n`);
    }
    process.exit(1);
  }

  console.log(
    `✅ 静态对抗规则 (${totalRulesChecked} 条) + 内存故障注入 verify() + DOC-SYNC-GUARD 全部 0 违规 (${
      Date.now() - startMs
    }ms)`
  );

  // 3. TypeScript strict type-check (tsc --noEmit)
  const tscResult = spawnSync('npx', ['tsc', '--noEmit'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });
  if (tscResult.status !== 0) {
    console.error('❌ TypeScript 类型检查 (tsc --noEmit) 未通过。');
    process.exit(tscResult.status || 1);
  }
  console.log('✅ TypeScript 类型检查 (tsc --noEmit) 通过');

  // 4. Selective Unit Tests (skipped in --fast mode)
  if (!isFast) {
    const testFiles = Array.from(
      new Set(suites.flatMap((s) => s.unitTestFiles))
    ).filter((f) => ctx.fileExists(f));
    if (testFiles.length > 0) {
      console.log(`\n运行关联对抗单测: ${testFiles.join(', ')}`);
      const testResult = spawnSync('npx', ['tsx', '--test', ...testFiles], {
        cwd: ROOT_DIR,
        stdio: 'inherit',
      });
      if (testResult.status !== 0) {
        console.error('❌ 运行时对抗单测未通过。');
        process.exit(testResult.status || 1);
      }
      console.log('✅ 所有关联对抗单测全部通过');
    }
  } else {
    console.log('⚡ --fast 模式已跳过子进程单测');
  }

  console.log(`\n🎉 X Cloud ERP 工程闭环总控门禁通过 (总耗时 ${Date.now() - startMs}ms)\n`);
}

main().catch((err) => {
  console.error('❌ Preflight Gate 执行异常:', err);
  process.exit(1);
});
