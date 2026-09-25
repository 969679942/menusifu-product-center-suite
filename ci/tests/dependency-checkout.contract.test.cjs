const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('contract package verification never checks out TAP source', () => {
  const file = path.resolve(__dirname, '../verify-contract-package.ps1');
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /@menusifu\/tap-contract/);
  assert.match(source, /1\.1\.3/);
  assert.doesNotMatch(source, /git clone|git checkout|Test-Automation-Platform/);
});
