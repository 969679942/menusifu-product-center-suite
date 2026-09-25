const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('三仓库 Bundle 已退出业务触发入口', () => {
  const root = path.resolve(__dirname, '../..');
  const pipeline = fs.readFileSync(path.join(root, 'Jenkinsfile'), 'utf8');
  assert.match(pipeline, /PCS_BUNDLE_DEPRECATED_USE_MC_ONLY_PIPELINE/);
  assert.doesNotMatch(pipeline, /release-bundle\.cjs/);
  assert.doesNotMatch(pipeline, /bundle\.repositories/);
});
