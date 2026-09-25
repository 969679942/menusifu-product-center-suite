const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const pipeline = fs.readFileSync(path.join(root, 'Jenkinsfile'), 'utf8');

test('PCS Jenkins 只承载 MC 单项目执行壳', () => {
  assert.match(pipeline, /MC_GIT_SHA/);
  assert.match(pipeline, /@menusifu\/tap-contract@1\.1\.3/);
  assert.match(pipeline, /"RUN_SCOPE=\$\{params\.RUN_SCOPE\}"/);
  assert.match(pipeline, /mc-single-project/);
  assert.match(pipeline, /Checkout MC main/);
  assert.match(pipeline, /core\.autocrlf false/);
  assert.match(pipeline, /GIT_CONFIG_KEY_1=core\.autocrlf/);
  assert.match(pipeline, /Install and preflight contract/);
  assert.match(pipeline, /Run MC UI automation/);
  assert.match(pipeline, /TAP post-run analysis/);
  assert.doesNotMatch(pipeline, /suite-src/);
  assert.doesNotMatch(pipeline, /load\(['"]suite-src/);
});

test('旧三仓库 Bundle 只能被明确拒绝，不能进入业务执行', () => {
  assert.match(pipeline, /PCS_BUNDLE_DEPRECATED_USE_MC_ONLY_PIPELINE/);
  assert.match(pipeline, /LEGACY_MULTI_REPOSITORY_SHA_PARAMETERS_FORBIDDEN/);
  assert.doesNotMatch(pipeline, /bundle\.repositories/);
  assert.doesNotMatch(pipeline, /BUNDLE_JSON.*build job/);
  assert.doesNotMatch(pipeline, /Test Automation Platform/);
  assert.doesNotMatch(pipeline, /TAP_CONTRACT_REF/);
});

test('TAP 分析失败不会覆盖 MC 业务执行状态', () => {
  assert.match(pipeline, /catchError\(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE'\)/);
  assert.match(pipeline, /businessExitCode = bat\(returnStatus: true, script: 'npm run ci:product-center'\)/);
  assert.ok(pipeline.indexOf("stage('TAP post-run analysis')") < pipeline.indexOf('if (businessExitCode != 0)'));
  assert.match(pipeline, /if \(!fileExists\("\$\{sourceRoot\}\\\\Merchant Center UITest\\\\output\\\\ci\\\\product-center-ci-summary.json"\)\)/);
  assert.match(pipeline, /businessExecutionStatus/);
  assert.match(pipeline, /analysisStatus/);
});

test('私有 MC main 必须通过 Jenkins Git 凭据签出并核对精确 SHA', () => {
  assert.match(pipeline, /checkout\(\[\$class: 'GitSCM'/);
  assert.match(pipeline, /branches: \[\[name: 'refs\/heads\/main'\]\]/);
  assert.match(pipeline, /credentialsId: 'menusifu-github-readonly'/);
  assert.match(pipeline, /shallow: true, depth: 1, timeout: 5/);
  assert.match(pipeline, /git config --local core\.longpaths true/);
  assert.match(pipeline, /git config --local http\.proxy ""/);
  assert.match(pipeline, /git config --local http\.https:\/\/github\.com\.proxy ""/);
  assert.ok(pipeline.indexOf('git config --local http.proxy ""') < pipeline.indexOf("checkout([$class: 'GitSCM'"));
  assert.match(pipeline, /checkoutResult\.GIT_COMMIT != mcRevision/);
  assert.match(pipeline, /checkedOut != mcRevision/);
  assert.doesNotMatch(pipeline, /git (?:clone|fetch) .*github\.com\/969679942\/Merchant-Center/);
  assert.doesNotMatch(pipeline, /fetch [^\n]*\$\{mcRevision\}/);
});
