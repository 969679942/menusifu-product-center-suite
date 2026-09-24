const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const pipeline=fs.readFileSync(path.join(root,'Jenkinsfile'),'utf8');
const businessPipeline=fs.readFileSync(path.join(root,'ci/pipeline.groovy'),'utf8');
const sourceRunner=fs.readFileSync(path.join(root,'projects/merchant-center/Merchant Center UITest/scripts/run-product-center-source-governed.ts'),'utf8');
const auditStore=fs.readFileSync(path.join(root,'tap/src/audit/event-log.ts'),'utf8');
const auditRuntime=fs.readFileSync(path.join(root,'projects/merchant-center/Merchant Center UITest/utils/product-center-audit-runtime.ts'),'utf8');
const fullRegressionRunner=fs.readFileSync(path.join(root,'ci/run-product-center-full.ts'),'utf8');
const transport=fs.readFileSync(path.join(root,'ci/jenkins.py'),'utf8');
const branchPolicy=JSON.parse(fs.readFileSync(path.join(root,'ci/trigger-policy.json'),'utf8')).fixedBranches;
const contractSelection=JSON.parse(fs.readFileSync(path.join(root,'ci/contract-selection.json'),'utf8'));
const contractRunner=fs.readFileSync(path.join(root,'ci/run-contracts.cjs'),'utf8');

test('dedicated Jenkins job always leaves a terminal report and preserves invocation identity',()=>{
  assert.equal((pipeline.match(/\{/g)||[]).length,(pipeline.match(/\}/g)||[]).length);
  assert.equal((pipeline.match(/stage\('Persist chain decision'\)/g)||[]).length,1);
  assert.match(pipeline,/WINDOWS_SHORT_WORKSPACE_ROOT/);
  assert.ok(pipeline.includes('ws("${shortWorkspaceRoot}\\\\${safeJobName}\\\\${env.BUILD_NUMBER}")'));
  assert.match(pipeline,/params\.RUN_SCOPE == 'full-regression' \? 360 : 180/);
  assert.match(pipeline,/if \(!\(params\.INTENT_ID ==~ \/\[0-9a-f-\]\{36\}\//);
  assert.match(pipeline,/jenkins-invocation\.json/);
  assert.match(pipeline,/allure-technical-publishable\.marker/);
  assert.match(pipeline,/allure-results-technical/);
  assert.match(pipeline,/jenkins-allure-results\/technical-terminal-result\.json/);
  assert.match(pipeline,/executionDisposition.*technical-blocked/);
  assert.match(pipeline,/Business pass authority=FALSE/);
  assert.doesNotMatch(pipeline,/writeFile file: 'suite-src\/output\/ci\/execution-intent\.json'/);
  assert.match(pipeline,/if \(!fileExists\('suite-src\/output\/ci\/execution-report\.html'\)\)/);
  assert.match(pipeline,/jenkins-terminal-report\.html/);
  assert.ok(pipeline.includes("archiveArtifacts artifacts: 'suite-src/output/ci/**/*,jenkins-terminal-report.html,jenkins-allure-results/**/*'"));
});

test('Jenkins consumes the immutable Bundle and checks exact revisions',()=>{
  assert.deepEqual(branchPolicy,{pcs:'main',mc:'main',tap:'main',enforcement:'bundle-declared-branch-with-exact-revision'});
  assert.match(pipeline,/params\.BUNDLE_JSON/);
  assert.match(pipeline,/MC_RUNTIME_ENV=\$\{runtimeEnv\}/);
  assert.match(pipeline,/MC_SECRET_ENV_PATH=\$\{runtimeEnvPath\}/);
  assert.match(pipeline,/D:\\\\Menusifu\\\\Merchant Center\\\\\.secrets\\\\runtime\.env/);
  assert.match(pipeline,/def runtimeEnv = params\.MC_RUNTIME_ENV/);
  assert.match(pipeline,/Free SHA parameters are forbidden/);
  assert.match(pipeline,/git checkout --detach %BUNDLE_PCS_SHA%/);
  assert.match(pipeline,/git cat-file -e %BUNDLE_PCS_SHA%/);
  assert.doesNotMatch(pipeline,/git cat-file -e %BUNDLE_PCS_SHA%\^\{commit\}/);
  assert.match(pipeline,/release-bundle\.cjs validate/);
  assert.match(pipeline,/bundle-validator\.cjs bundle\.json/);
  assert.match(pipeline,/jsonString = \{ value ->/);
  assert.match(pipeline,/adapterContracts/);
  assert.match(pipeline,/core\.longpaths/);
  assert.match(pipeline,/--branch main --single-branch/);
  assert.match(pipeline,/git -c http\.proxy= -c http\.https:\/\/github\.com\.proxy= clone/);
  assert.ok((pipeline.match(/git config --local http\.https:\/\/github\.com\.proxy ""/g)||[]).length>=2);
  assert.doesNotMatch(pipeline,/-c https\.proxy=/);
  assert.match(pipeline,/echo \/ci\/\*\*& echo \/Jenkinsfile& echo \/suite\.json/);
  assert.doesNotMatch(pipeline,/echo \/projects\/merchant-center\/\*\*/);
  assert.doesNotMatch(pipeline,/refs\/remotes\/origin\/master/);
  assert.match(pipeline,/revision: bundle\.repositories\.tap\.revision/);
  assert.match(pipeline,/revision: bundle\.repositories\.mc\.revision/);
  assert.doesNotMatch(pipeline,/refs\/heads\/\$\{dependency\.branch\}/);
});

test('isolated builds resolve TAP from the active workspace directory',()=>{
  assert.ok(businessPipeline.includes('set "TAP_SOURCE_ROOT=%CD%\\\\suite-src\\\\tap"'));
  assert.ok(!businessPipeline.includes('set "TAP_SOURCE_ROOT=%WORKSPACE%\\\\suite-src\\\\tap"'));
});

test('full regression runner resolves the separately checked out MC and TAP roots',()=>{
  assert.match(fullRegressionRunner,/\.\.\/tap\/src\/governance\/execution-intent/);
  assert.match(fullRegressionRunner,/projects\/merchant-center\/Merchant Center UITest/);
  assert.doesNotMatch(fullRegressionRunner,/projects\/project-a|\.\.\/Test Automation Platform/);
});

test('configured Jenkins parameters match the local submission CLI contract',()=>{
  assert.match(transport,/def submit\(scope='contracts', auto_chain=False\)/);
  assert.match(transport,/hudson\.model\.BooleanParameterDefinition/);
  assert.match(transport,/'AUTO_CHAIN': 'true' if auto_chain else 'false'/);
});

test('fixed technical gate covers public and adapter terminal receipt contracts',()=>{
  assert.ok(contractSelection.files.includes('seasoning-read-assertions.contract.spec.ts'));
  assert.ok(contractSelection.files.includes('seasoning-terminal-receipts.contract.spec.ts'));
  assert.deepEqual(contractSelection.tapFiles,[
    'ci-business-receipt.contract.spec.ts',
    'system-test-runtime-contract.contract.spec.ts',
    'system-test-recipe-reporting.contract.spec.ts',
  ]);
  assert.match(contractRunner,/id:'merchant-center-adapter'/);
  assert.match(contractRunner,/id:'tap-public-runtime'/);
  assert.match(contractRunner,/process\.env\.MC_SOURCE_ROOT/);
  assert.match(contractRunner,/process\.env\.TAP_SOURCE_ROOT/);
  assert.match(contractRunner,/for \(const suite of suites\)/);
  assert.match(contractRunner,/records\.push\(\.\.\.cases\(report,suite\.id\)\)/);
});

test('parallel audit events are worker-sharded and merged before report aggregation',()=>{
  assert.match(sourceRunner,/const fullRegression = process\.env\.RUN_SCOPE === 'full-regression'/);
  assert.match(sourceRunner,/requestedCaseIds === null && !fullRegression \? plan\.execution : plan\.revalidation/);
  assert.match(sourceRunner,/SYSTEM_TEST_RUN_ID: runId/);
  assert.match(sourceRunner,/SYSTEM_TEST_AUDIT_EVENT_LOG_SHARDING: 'worker'/);
  assert.match(sourceRunner,/mergeAuditEventLogShards\(auditEventLogPath, \{ runId \}\)/);
  assert.match(sourceRunner,/auditShardMerge: auditShardMerge/);
  assert.match(auditStore,/env\.TEST_WORKER_INDEX/);
  assert.match(auditStore,/appendExistingEvents/);
  assert.match(auditStore,/eventSequence: sequence, previousEventHash/);
  assert.match(auditRuntime,/SYSTEM_TEST_RUN_ID/);
  assert.match(auditRuntime,/buildAuditLifecycleEventId/);
  assert.match(auditRuntime,/SYSTEM_TEST_AUDIT_EVENT_NAMESPACE/);
  assert.match(auditStore,/AUDIT_EVENT_NAMESPACE_INVALID/);
});
