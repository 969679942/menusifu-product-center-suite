const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('MC-only workspace cleanup does not depend on bundle or TAP source cleanup', () => {
  const pipeline = fs.readFileSync(path.join(root, '..', 'Jenkinsfile'), 'utf8');
  assert.match(pipeline, /deleteDir\(\)/);
  assert.doesNotMatch(pipeline, /clean-bundle-transients/);
  assert.doesNotMatch(pipeline, /Test Automation Platform/);
});
