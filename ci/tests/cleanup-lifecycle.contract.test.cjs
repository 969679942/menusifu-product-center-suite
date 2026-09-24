const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('bundle cleanup is limited to generated PCS transients', () => {
  const source = fs.readFileSync(path.join(root, 'clean-bundle-transients.cjs'), 'utf8');
  assert.match(source, /projects\/project-a\/\.memory/);
  assert.match(source, /projects\/project-a\/MEMORY\.md/);
  assert.match(source, /projects\/project-a\/contracts/);
  assert.match(source, /projects\/project-b/);
  assert.match(source, /--clean/);
  assert.match(fs.readFileSync(path.join(root, '..', 'Jenkinsfile'), 'utf8'), /clean-bundle-transients\.cjs --root/);
});
