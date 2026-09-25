const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('full regression uses the MC compiled contract and does not require an embedded MC checkout', () => {
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'ci/trigger-policy.json'), 'utf8'));
  const pipeline = fs.readFileSync(path.join(root, 'Jenkinsfile'), 'utf8');
  const suite = JSON.parse(fs.readFileSync(path.join(root, 'suite.json'), 'utf8'));
  assert.equal(policy.fullRegression.requiresExplicitScope, true);
  assert.equal(policy.fullRegression.selectionAuthority, 'mc-compiled-contract-exact-set');
  assert.equal(policy.fullRegression.minimumSelectedCaseCount, undefined);
  assert.match(pipeline, /RUN_SCOPE=\$\{params\.RUN_SCOPE\}/);
  assert.match(pipeline, /npm run contract:product-center:preflight/);
  assert.match(pipeline, /npm run ci:product-center/);
  assert.doesNotMatch(pipeline, /run-product-center-full\.ts|tap\/src\/governance\/execution-intent/);
  assert.equal(suite.execution.model, 'mc-single-project');
});
