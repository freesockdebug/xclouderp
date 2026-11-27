import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ALL_DOMAIN_SUITES } from '../scripts/audits/index';

test('05-security-ops: all 5 orthogonal domain suites and 20 adversarial rules are registered and synced with docs', () => {
  assert.equal(ALL_DOMAIN_SUITES.length, 5);
  let totalRules = 0;
  for (const suite of ALL_DOMAIN_SUITES) {
    assert.ok(fs.existsSync(suite.docPath), `Missing doc ${suite.docPath}`);
    const docText = fs.readFileSync(suite.docPath, 'utf8');
    for (const rule of suite.rules) {
      totalRules += 1;
      assert.ok(
        docText.includes(rule.id),
        `Rule ${rule.id} missing from ${suite.docPath}`
      );
    }
  }
  assert.ok(totalRules >= 20, `Expected >= 20 adversarial rules, found ${totalRules}`);
});

test('05-security-ops: metadata.json and index.html are synchronized to X Cloud ERP', () => {
  const meta = JSON.parse(fs.readFileSync('metadata.json', 'utf8')) as { name: string };
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(meta.name, /X Cloud ERP/);
  assert.match(html, /<title>.*X Cloud ERP.*<\/title>/);
  assert.equal(fs.existsSync('.env.example'), true);
});
