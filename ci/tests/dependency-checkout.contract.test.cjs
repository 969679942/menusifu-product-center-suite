const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('dependency checkout script requires exact MC and TAP revisions', () => {
  const file = path.resolve(__dirname, '../checkout-dependencies.ps1');
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /McSha/);
  assert.match(source, /TapSha/);
  assert.match(source, /\^\[0-9a-fA-F\]\{40\}\$/);
  assert.match(source, /--no-checkout/);
  assert.match(source, /checkout --detach/);
  assert.match(source, /mcGitSha/);
  assert.match(source, /tapGitSha/);
});
