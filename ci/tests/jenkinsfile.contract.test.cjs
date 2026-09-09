const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const pipeline=fs.readFileSync(path.join(root,'Jenkinsfile'),'utf8');

test('dedicated Jenkins job always leaves a terminal report and preserves invocation identity',()=>{
  assert.match(pipeline,/ws\("\$\{env\.WORKSPACE\}-isolated"\)/);
  assert.match(pipeline,/if \(!\(intentId ==~ \/\[0-9a-f-\]\{36\}\//);
  assert.match(pipeline,/jenkins-invocation\.json/);
  assert.doesNotMatch(pipeline,/writeFile file: 'suite-src\/output\/ci\/execution-intent\.json'/);
  assert.match(pipeline,/if \(!fileExists\('suite-src\/output\/ci\/execution-report\.html'\)\)/);
  assert.match(pipeline,/jenkins-terminal-report\.html/);
  assert.ok(pipeline.includes("archiveArtifacts artifacts: 'suite-src/output/ci/**/*,jenkins-terminal-report.html'"));
});

// One asynchronous dispatch after releasing the executor avoids same-job deadlock.
test('automatic continuation requires an explicit flag and preserves pinned identities',()=>{
 assert.match(pipeline,/params.AUTO_CHAIN == true/);
 assert.match(pipeline,/currentBuild.currentResult == 'SUCCESS'/);
 assert.match(pipeline,/build job: 'menusifu-product-center-suite', wait: false/);
 for(const name of ['GIT_SHA','MC_GIT_SHA','TAP_GIT_SHA']) assert.ok(pipeline.includes(`string(name: '${name}', value: params.${name})`));
 assert.ok(pipeline.includes("string(name: 'INTENT_ID', value: intentId)"));
 assert.match(pipeline,/password\(name: 'MC_RUNTIME_ENV'/);
 assert.doesNotMatch(pipeline,/params.MC_RUNTIME_ENV\?\.trim/);
 assert.match(pipeline,/env.MC_RUNTIME_ENV\?\.trim/);
 assert.match(pipeline,/chain-checkpoint.json/);
 assert.equal((pipeline.match(/build job:/g)||[]).length,1);
});

test('normalized identities reach child processes and survive the node scope',()=>{
 const preamble=pipeline.slice(0,pipeline.indexOf('node {'));
 for(const name of ['requestId','intentId']) {
   assert.ok(preamble.includes(`def ${name} = null`));
   assert.equal((pipeline.match(new RegExp(`def ${name}\\b`,'g'))||[]).length,1);
 }
 assert.ok(pipeline.includes('withEnv(["REQUEST_ID=${requestId}", "INTENT_ID=${intentId}"])'));
 assert.ok(pipeline.includes('if (!intentId) intentId = UUID.randomUUID().toString()'));
 assert.ok(pipeline.includes('if (!requestId) requestId = "jenkins-${env.BUILD_NUMBER}-${UUID.randomUUID()}"'));
});
