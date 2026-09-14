const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const policy=JSON.parse(fs.readFileSync(path.join(root,'ci/trigger-policy.json'),'utf8'));
const transport=fs.readFileSync(path.join(root,'ci/jenkins.py'),'utf8');
const ps1=fs.readFileSync(path.join(root,'ci/jenkins.ps1'),'utf8');
const triggerContract=require(path.join(root,'tap/src/ci/jenkins-trigger-contract.cjs'));

test('trigger policy keeps cross-repository source identity explicit',()=>{
  assert.deepEqual(policy.sourceRepositories.sort(),[
    '969679942/Merchant-Center',
    '969679942/Test-Automation-Platform',
  ]);
  assert.equal(policy.transportRepository,'menusifu-product-center-suite');
  assert.equal(policy.defaultTriggerMode,'manual-parameterized');
  assert.equal(policy.fullRegression.requiresExplicitScope,true);
  assert.equal(policy.fullRegression.timeoutMinutes,360);
  assert.equal(policy.executionIsolation.disableConcurrentBuildsRequired,true);
  assert.equal(policy.executionIsolation.workspaceTemplate,'${WORKSPACE}@${BUILD_NUMBER}-isolated');
  assert.equal(policy.executionIsolation.auditEventLogMode,'worker-sharded-then-merged');
  assert.deepEqual(policy.requiredIdentity,[
    'GIT_SHA','REQUEST_ID','INTENT_ID','RUN_SCOPE','TRIGGER_SOURCE',
  ]);
});

test('transport exposes read-only health and configurable endpoint without printing secrets',()=>{
  assert.match(transport,/def configured_base\(\)/);
  assert.match(transport,/def health\(\)/);
  assert.match(transport,/connection-status\.json/);
  assert.match(transport,/concurrentBuildProtectionConfigured/);
  assert.match(transport,/pipelineGovernanceConfigured/);
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
});

test('local transport resolves the same three-repository identity required by Jenkins',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'ci/dependency-manifest.json'),'utf8'));
  const payload={gitSha:'a'.repeat(40),mcGitSha:manifest.repositories.mc.revision,tapGitSha:manifest.repositories.tap.revision,
    requestId:'request-1',intentId:'123e4567-e89b-12d3-a456-426614174000',runScope:'full-regression',triggerSource:'explicit-local-submit'};
  assert.deepEqual(triggerContract.validateJenkinsInvocation(payload),[]);
  assert.match(transport,/submission_parameters\(sha, scope, request_id, intent_id\)/);
  assert.match(transport,/MC_GIT_SHA/);
  assert.match(transport,/TAP_GIT_SHA/);
});
