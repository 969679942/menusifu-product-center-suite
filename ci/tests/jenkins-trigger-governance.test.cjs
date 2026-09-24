const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const policy=JSON.parse(fs.readFileSync(path.join(root,'ci/trigger-policy.json'),'utf8'));
const transport=fs.readFileSync(path.join(root,'ci/jenkins.py'),'utf8');
const ps1=fs.readFileSync(path.join(root,'ci/jenkins.ps1'),'utf8');
const pipeline=fs.readFileSync(path.join(root,'ci/pipeline.groovy'),'utf8');
const pilotRunner=fs.readFileSync(path.join(root,'ci/run-pilot.ts'),'utf8');
const fullRunner=fs.readFileSync(path.join(root,'ci/run-product-center-full.ts'),'utf8');
const triggerContract=require(path.join(root,'tap/src/ci/jenkins-trigger-contract.cjs'));
const branchPolicy=JSON.parse(fs.readFileSync(path.join(root,'ci/branch-policy.json'),'utf8'));

test('trigger policy keeps cross-repository source identity explicit',()=>{
  assert.deepEqual(policy.sourceRepositories.sort(),[
    '969679942/Merchant-Center',
    '969679942/Test-Automation-Platform',
  ]);
  assert.equal(policy.transportRepository,'menusifu-product-center-suite');
  assert.equal(policy.defaultTriggerMode,'manual-parameterized');
  assert.equal(policy.fullRegression.requiresExplicitScope,true);
  assert.equal(policy.fullRegression.minimumSelectedCaseCount,400);
  assert.equal(policy.fullRegression.timeoutMinutes,360);
  assert.equal(policy.executionIsolation.disableConcurrentBuildsRequired,true);
  assert.equal(policy.executionIsolation.workspaceTemplate,'${WORKSPACE}@${BUILD_NUMBER}-isolated');
  assert.equal(policy.executionIsolation.auditEventLogMode,'worker-sharded-then-merged');
  assert.deepEqual(policy.requiredIdentity,[
    'BUNDLE_JSON','REQUEST_ID','INTENT_ID','RUN_SCOPE','TRIGGER_SOURCE',
  ]);
});

test('transport exposes read-only health and configurable endpoint without printing secrets',()=>{
  assert.match(transport,/def configured_base\(\)/);
  assert.match(transport,/def health\(\)/);
  assert.match(transport,/connection-status\.json/);
  assert.match(transport,/concurrentBuildProtectionConfigured/);
  assert.match(transport,/pipelineGovernanceConfigured/);
  assert.match(transport,/BUILD_STRING_PARAMETERS = \[/);
  assert.match(transport,/release-bundle\.cjs/);
  assert.match(transport,/configure-governed-pipeline-definition/);
  assert.match(transport,/DisableConcurrentBuildsJobProperty/);
  assert.match(transport,/choices=\['configure','submit','poll','watch','health'\]/);
  assert.doesNotMatch(transport,/print\([^\n]*SUITE_JENKINS_TOKEN/);
  assert.doesNotMatch(transport,/job-config-before\.xml/);
  assert.match(transport,/job-config-before\.json/);
  assert.match(transport,/hashlib\.sha256\(old\)\.hexdigest\(\)/);
  assert.match(ps1,/Import-Clixml/);
  assert.match(ps1,/Remove-Item Env:SUITE_JENKINS_USER,Env:SUITE_JENKINS_TOKEN/);
});

test('full regression is not the implicit push trigger',()=>{
  assert.equal(policy.fullRegression.defaultOnPush,'contracts');
  assert.equal(policy.governance.separateTriggerFromBusinessExecution,true);
  assert.equal(policy.governance.separateServerReachabilityFromTriggerConfiguration,true);
  assert.equal(policy.governance.releasePreflightRequired,true);
  assert.equal(policy.governance.forcePushForbidden,true);
  assert.equal(policy.governance.preflightScript,'ci/release-preflight.ps1');
});

test('local transport resolves the same three-repository identity required by Jenkins',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'ci/dependency-manifest.json'),'utf8'));
  const payload={bundleId:'a'.repeat(64),
    requestId:'request-1',intentId:'123e4567-e89b-12d3-a456-426614174000',runScope:'full-regression',triggerSource:'explicit-local-submit'};
  assert.deepEqual(triggerContract.validateJenkinsInvocation(payload),[]);
  assert.match(transport,/submission_parameters\(scope, request_id, intent_id, auto_chain=False\)/);
  assert.match(transport,/BUNDLE_JSON/);
  assert.match(transport,/release-bundle\.cjs/);
  assert.match(transport,/parameterContractConfigured/);
  assert.match(transport,/configure-job-parameter-contract/);
});

test('all Jenkins source repositories use their fixed integration branches',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'ci/dependency-manifest.json'),'utf8'));
  assert.equal(branchPolicy.requiredIntegrationBranch,'main');
  assert.deepEqual(branchPolicy.dependencies,{'Merchant-Center':'main','Test-Automation-Platform':'main'});
  assert.equal(manifest.repositories.pcs.branch,'main');
  assert.equal(manifest.repositories.mc.branch,'main');
  assert.equal(manifest.repositories.tap.branch,'main');
  assert.match(transport,/fixed-branch-policy-violation/);
});

test('full regression checks current MC adapter fingerprints before browser execution',()=>{
  assert.match(pipeline,/params\.RUN_SCOPE in \['pilot','full-regression'\]/);
  assert.match(pipeline,/refresh-seasoning-implementation-contract\.ts" --check/);
  assert.match(pipeline,/TAP_SOURCE_ROOT=%CD%\\\\suite-src\\\\tap/);
  assert.match(pipeline,/run-pilot\.ts --plan-only/);
  assert.match(pipeline,/Technical Pilot authorization/);
  assert.match(pipeline,/verify-pilot-authorization\.cjs/);
  assert.ok(pipeline.indexOf('refresh-seasoning-implementation-contract.ts') < pipeline.indexOf("stage('Full Merchant Center product-center regression')"));
});

test('full regression materializes scoped task authorization before business execution',()=>{
  assert.match(pilotRunner,/prepareFullRegressionTaskScopeAuthorization/);
  assert.match(pilotRunner,/createSystemTestTaskScopeAuthorization/);
  assert.match(pilotRunner,/SYSTEM_TEST_TASK_SCOPE_AUTHORIZATION_PATH/);
  assert.match(pilotRunner,/SYSTEM_TEST_TASK_SCOPE_CASE_IDENTITIES/);
  assert.match(pilotRunner,/explicit-full-regression/);
  assert.match(pilotRunner,/manifest\.system\.portabilityScope\.applicationId/);
  assert.doesNotMatch(pilotRunner,/applicationId:\s*'merchant-center-product-center-seasoning'/);
});

test('Jenkins analysis uses the TAP deterministic result arbiter instead of AI as state authority',()=>{
  assert.match(transport,/tap\/src\/ci\/result-arbitration\.cjs/);
  assert.match(transport,/arbitrate_result\(errors,envelope,info\['result'\]\)/);
  assert.doesNotMatch(transport,/else 'ai-evidence-review'/);
});

test('full regression counts only executable terminal receipts and never treats skipped registration as execution',()=>{
  assert.match(fullRunner,/\['passed', 'failed', 'blocked', 'interrupted'\]/);
  assert.doesNotMatch(fullRunner,/\['passed', 'failed', 'skipped'\]/);
  assert.match(fullRunner,/assertExecutionIntentCompletion/);
});
