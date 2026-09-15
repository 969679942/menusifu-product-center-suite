const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'release-repositories.json'), 'utf8'));
const script = fs.readFileSync(path.join(root, 'release-preflight.ps1'), 'utf8');

test('release preflight fixes the three integration branches and never triggers Jenkins', () => {
  assert.deepEqual(policy.repositories.map(item => [item.id, item.branch]), [
    ['pcs', 'master'], ['tap', 'main'], ['mc', 'main'],
  ]);
  assert.equal(policy.rules.allowForcePush, false);
  assert.equal(policy.rules.jenkinsTrigger, 'never');
  assert.match(script, /requireCleanWorktree/);
  assert.match(script, /symbolic-ref.*HEAD/);
  assert.match(script, /ls-remote/);
  assert.match(script, /rejectDivergedHistory/);
  assert.match(script, /jenkinsTriggered = \$false/);
  assert.match(script, /exit 2/);
});
