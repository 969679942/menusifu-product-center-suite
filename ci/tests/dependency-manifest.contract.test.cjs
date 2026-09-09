const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('dependency manifest identifies independent MC and TAP revisions', () => {
  const file = path.resolve(__dirname, '../dependency-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(manifest.projectId, 'merchant-center');
  assert.equal(manifest.policy.exactRevisionRequired, true);
  assert.equal(manifest.repositories.mc.role, 'business-source');
  assert.equal(manifest.repositories.tap.role, 'public-runtime');
  assert.notEqual(manifest.repositories.mc.checkout, manifest.repositories.tap.checkout);
});
