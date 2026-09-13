const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const policy=JSON.parse(fs.readFileSync(path.join(root,'ci/trigger-policy.json'),'utf8'));
const transport=fs.readFileSync(path.join(root,'ci/jenkins.py'),'utf8');
const ps1=fs.readFileSync(path.join(root,'ci/jenkins.ps1'),'utf8');

test('trigger policy keeps cross-repository source identity explicit',()=>{
  assert.deepEqual(policy.sourceRepositories.sort(),[
    '969679942/Merchant-Center',
    '969679942/Test-Automation-Platform',
  ]);
  assert.equal(policy.transportRepository,'menusifu-product-center-suite');
  assert.equal(policy.defaultTriggerMode,'manual-parameterized');
  assert.equal(policy.fullRegression.requiresExplicitScope,true);
  assert.deepEqual(policy.requiredIdentity,[
    'GIT_SHA','REQUEST_ID','INTENT_ID','RUN_SCOPE','TRIGGER_SOURCE',
  ]);
});

test('transport exposes read-only health and configurable endpoint without printing secrets',()=>{
  assert.match(transport,/def configured_base\(\)/);
  assert.match(transport,/def health\(\)/);
  assert.match(transport,/connection-status\.json/);
  assert.match(transport,/choices=\['configure','submit','poll','watch','health'\]/);
  assert.doesNotMatch(transport,/print\([^\n]*SUITE_JENKINS_TOKEN/);
  assert.match(ps1,/Import-Clixml/);
  assert.match(ps1,/Remove-Item Env:SUITE_JENKINS_USER,Env:SUITE_JENKINS_TOKEN/);
});

test('full regression is not the implicit push trigger',()=>{
  assert.equal(policy.fullRegression.defaultOnPush,'contracts');
  assert.equal(policy.governance.separateTriggerFromBusinessExecution,true);
  assert.equal(policy.governance.separateServerReachabilityFromTriggerConfiguration,true);
});
