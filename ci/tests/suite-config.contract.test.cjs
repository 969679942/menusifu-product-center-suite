const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('suite configuration passes identity, path and single TAP source gate', () => {
  const root = path.resolve(__dirname, '../..');
  const result = spawnSync(process.execPath, [path.join(root, 'ci/validate-suite-config.cjs')], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const suite = JSON.parse(fs.readFileSync(path.join(root, 'suite.json'), 'utf8'));
  assert.deepEqual(suite.projects.map((item) => item.id), ['merchant-center']);
  assert.equal(suite.projects[0].root, 'projects/merchant-center');
});
