import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');

test('report-only 前置缺失必须生成可审计阻断而不是丢失上下文', () => {
  const pageContract = JSON.parse(fs.readFileSync(
    path.join(projectRoot, 'output/page-contract/product-center-page-contract-finding-review-queue.blocked.json'),
    'utf8',
  )) as Record<string, unknown>;
  const historical = JSON.parse(fs.readFileSync(
    path.resolve(projectRoot, '../deliverables/test-plan-governance/product-center-historical-receipt-compatibility.blocked.json'),
    'utf8',
  )) as Record<string, unknown>;
  const ruleAudit = JSON.parse(fs.readFileSync(
    path.resolve(projectRoot, '../deliverables/test-plan-governance/product-center-business-rule-audit.blocked.json'),
    'utf8',
  )) as Record<string, unknown>;

  expect(pageContract).toMatchObject({
    status: 'blocked',
    code: 'PAGE_CONTRACT_DIFF_MISSING',
    scope: 'report-only',
    businessExecutionStarted: false,
    existingPassedCasesInvalidated: false,
  });
  expect(pageContract.missingInputs).toContain('output/page-contract/product-center-page-contract-diff.json');
  const upstreamBlocker = pageContract.upstreamBlocker as { code?: string; evidenceRef?: string; unresolvedRoutes?: unknown[] };
  expect(upstreamBlocker).toMatchObject({
    code: 'PAGE_CONTRACT_PROBE_EXTERNAL_AUTH_BLOCKED',
    evidenceRef: 'output/page-contract/product-center-current-release-probe.blocked.json',
  });
  expect(upstreamBlocker.unresolvedRoutes).toHaveLength(19);
  expect(historical).toMatchObject({
    status: 'blocked',
    code: 'PRE_CLOSURE_AUDIT_MISSING',
    scope: 'report-only',
    businessExecutionStarted: false,
    existingPassedCasesInvalidated: false,
  });
  expect(ruleAudit).toMatchObject({
    status: 'blocked',
    code: 'BUSINESS_RULE_AUDIT_PREFLIGHT_INPUTS_MISSING',
    scope: 'report-only',
    guardrails: {
      businessExecutionStarted: false,
      existingPassedCasesInvalidated: false,
      formalRulesModified: false,
    },
  });
  expect(ruleAudit.missingInputs).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: 'output/product-center-item-final-status.json', stageId: 'business-rule-evaluation-events' }),
  ]));
});
