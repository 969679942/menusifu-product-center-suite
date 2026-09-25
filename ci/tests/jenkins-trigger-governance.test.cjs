const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'ci/trigger-policy.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'ci/dependency-manifest.json'), 'utf8'));

test('触发身份只包含 MC SHA、合同包版本和执行意图', () => {
  assert.deepEqual(policy.requiredIdentity, [
    'MC_GIT_SHA', 'REQUEST_ID', 'INTENT_ID', 'RUN_SCOPE', 'TRIGGER_SOURCE',
  ]);
  assert.equal(manifest.executionModel, 'mc-single-project');
  assert.equal(manifest.repositories.pcs, undefined);
  assert.equal(manifest.repositories.mc.branch, 'main');
  assert.equal(manifest.repositories.tapContractPackage.name, '@menusifu/tap-contract');
  assert.equal(manifest.repositories.tapContractPackage.checkout, null);
});

test('全量回归不再隐式由推送触发', () => {
  assert.equal(policy.fullRegression.requiresExplicitScope, true);
  assert.equal(policy.fullRegression.selectionAuthority, 'mc-compiled-contract-exact-set');
  assert.equal(policy.fullRegression.minimumSelectedCaseCount, undefined);
  assert.equal(policy.fullRegression.defaultOnPush, 'pilot');
  assert.equal(policy.governance.separateTriggerFromBusinessExecution, true);
});
