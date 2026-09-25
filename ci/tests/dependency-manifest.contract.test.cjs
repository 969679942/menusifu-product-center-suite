const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('dependency manifest identifies MC and the fixed TAP Contract Package', () => {
  const file = path.resolve(__dirname, '../dependency-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(manifest.projectId, 'merchant-center');
  assert.equal(manifest.policy.exactPackageVersionRequired, true);
  assert.equal(manifest.repositories.mc.role, 'business-source');
  assert.equal(manifest.repositories.tapContractPackage.name, '@menusifu/tap-contract');
  assert.equal(manifest.repositories.tapContractPackage.version, '1.1.3');
  assert.equal(manifest.repositories.tapContractPackage.checkout, null);
});
