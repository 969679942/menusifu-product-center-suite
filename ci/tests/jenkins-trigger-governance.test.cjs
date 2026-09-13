const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const policy=JSON.parse(fs.readFileSync(path.join(root,'ci/trigger-policy.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'ci/dependency-manifest.json'),'utf8'));
const transport=fs.readFileSync(path.join(root,'ci/jenkins.py'),'utf8');

test('dependency manifest pins reachable immutable source revisions',()=>{
  for (const key of ['mc','tap']) {
    assert.match(manifest.repositories[key].revision,/^[0-9a-f]{40}$/);
    assert.match(manifest.repositories[key].repository,/github\.com/);
  }
  assert.equal(manifest.policy.exactRevisionRequired,true);
  assert.equal(manifest.repositories.mc.revision,'4aaa46a0cf8adba1a8d3765cfef532837f46b8a8');
  assert.equal(manifest.repositories.tap.revision,'e4bd995c65b4533074ed37efafcf6c8b7c83ea69');
});

test('trigger policy keeps full regression explicit and identities complete',()=>{
  assert.equal(policy.defaultTriggerMode,'manual-parameterized');
  assert.equal(policy.fullRegression.requiresExplicitScope,true);
  assert.equal(policy.fullRegression.defaultOnPush,'contracts');
  assert.deepEqual(policy.requiredIdentity,['GIT_SHA','MC_GIT_SHA','TAP_GIT_SHA','REQUEST_ID','INTENT_ID','RUN_SCOPE']);
});

test('transport configuration is environment-driven and never exposes secrets',()=>{
  assert.match(transport,/JENKINS_BASE_URL/);
  assert.match(transport,/submission_parameters\(/);
  assert.match(transport,/MC_GIT_SHA/);
  assert.match(transport,/TAP_GIT_SHA/);
  assert.doesNotMatch(transport,/print\([^\n]*MC_RUNTIME_ENV/);
});
