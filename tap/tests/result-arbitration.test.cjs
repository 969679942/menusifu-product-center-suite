const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arbitrateBuildResult } = require('../src/ci/result-arbitration.cjs');
function envelope(patch = {}) { return { selectedCaseIds: ['A', 'B'], terminalCaseIds: ['A', 'B'], status: 'completed', publicReceiptAccepted: true, ...patch }; }
test('build 108 style gaps are technical blockers, never product failures', () => {
  const result = arbitrateBuildResult({ jenkinsResult: 'FAILURE',
    envelope: envelope({ terminalCaseIds: [], status: 'blocked', publicReceiptAccepted: false }),
    errors: ['allure-evidence-incomplete', 'bundle-file-missing', 'selection-drift-or-incomplete', 'execution-incomplete', 'standard-business-ledger-missing'] });
  assert.equal(result.executionStatus, 'blocked');
  assert.equal(result.actionRequired, 'technical-remediation-required');
  assert.deepEqual(result.failureCategories, ['evidence-incomplete', 'execution-incomplete', 'transport-blocked']);
});
test('Jenkins failure alone cannot create a product failure', () => {
  const result = arbitrateBuildResult({ jenkinsResult: 'FAILURE', envelope: envelope(), errors: [] });
  assert.deepEqual(result.failureCategories, ['infrastructure-interrupted']);
});
test('explicit product mismatch completes with findings', () => {
  const result = arbitrateBuildResult({ jenkinsResult: 'FAILURE', errors: [],
    envelope: envelope({ status: 'completed-with-findings', publicReceiptAccepted: false, runReport: { failureCategories: ['product-failure'] } }) });
  assert.equal(result.executionStatus, 'completed-with-findings');
  assert.equal(result.actionRequired, 'business-review-required');
});
test('clean current receipts are the only business pass authority', () => {
  const result = arbitrateBuildResult({ jenkinsResult: 'SUCCESS', envelope: envelope(), errors: [] });
  assert.equal(result.businessPassAuthority, true); assert.equal(result.actionRequired, 'none');
});
