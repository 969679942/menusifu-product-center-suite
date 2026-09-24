const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateEntrypoints } = require('../validate-cross-repository-contract.cjs');

const root = path.resolve(__dirname, '..', '..');
const bundledMcRoot = path.join(root, 'projects', 'merchant-center');
const bundledTapRoot = path.join(root, 'tap');
const mcRoot = path.resolve(process.env.MC_SOURCE_ROOT || (fs.existsSync(path.join(bundledMcRoot, 'Merchant Center UITest', 'scripts', 'validate-product-center-runtime-config.ts')) ? bundledMcRoot : path.join(root, '..', '_release-main-mc')));
const tapRoot = path.resolve(process.env.TAP_SOURCE_ROOT || bundledTapRoot);

test('当前 PCS、MC、TAP 的跨仓入口合同完整', () => {
  assert.deepEqual(validateEntrypoints({ pcsRoot: root, mcRoot, tapRoot }), []);
});

test('缺少 MC 入口时必须在业务执行前阻断', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-repository-contract-'));
  try {
    const errors = validateEntrypoints({ pcsRoot: root, mcRoot: fixture, tapRoot });
    assert.ok(errors.includes('mc-runtime-validator-missing'));
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('缺少 TAP 公共导出时必须在业务执行前阻断', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-repository-contract-'));
  try {
    const bundle = path.join(fixture, 'src', 'ci');
    fs.mkdirSync(bundle, { recursive: true });
    fs.copyFileSync(path.join(tapRoot, 'src', 'ci', 'result-bundle.cjs'), path.join(bundle, 'result-bundle.cjs'));
    const file = path.join(bundle, 'result-bundle.cjs');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(',redactDiagnosticText', ''));
    const errors = validateEntrypoints({ pcsRoot: root, mcRoot, tapRoot: fixture });
    assert.ok(errors.includes('tap-export-missing:redactDiagnosticText'));
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
