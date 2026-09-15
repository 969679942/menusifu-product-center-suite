const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const pipeline=fs.readFileSync(path.join(root,'Jenkinsfile'),'utf8');
const sourceRunner=fs.readFileSync(path.join(root,'projects/merchant-center/Merchant Center UITest/scripts/run-product-center-source-governed.ts'),'utf8');
const auditStore=fs.readFileSync(path.join(root,'tap/src/audit/event-log.ts'),'utf8');
const auditRuntime=fs.readFileSync(path.join(root,'projects/merchant-center/Merchant Center UITest/utils/product-center-audit-runtime.ts'),'utf8');
const fullRegressionRunner=fs.readFileSync(path.join(root,'ci/run-product-center-full.ts'),'utf8');
const transport=fs.readFileSync(path.join(root,'ci/jenkins.py'),'utf8');
const branchPolicy=JSON.parse(fs.readFileSync(path.join(root,'ci/trigger-policy.json'),'utf8')).fixedBranches;

test('dedicated Jenkins job always leaves a terminal report and preserves invocation identity',()=>{
  assert.equal((pipeline.match(/\{/g)||[]).length,(pipeline.match(/\}/g)||[]).length);
  assert.equal((pipeline.match(/stage\('Persist chain decision'\)/g)||[]).length,1);
  assert.match(pipeline,/ws\("\$\{env\.WORKSPACE\}@\$\{env\.BUILD_NUMBER\}-isolated"\)/);
  assert.match(pipeline,/params\.RUN_SCOPE == 'full-regression' \? 360 : 180/);
  assert.match(pipeline,/if \(!\(params\.INTENT_ID ==~ \/\[0-9a-f-\]\{36\}\//);
  assert.match(pipeline,/jenkins-invocation\.json/);
  assert.doesNotMatch(pipeline,/writeFile file: 'suite-src\/output\/ci\/execution-intent\.json'/);
  assert.match(pipeline,/if \(!fileExists\('suite-src\/output\/ci\/execution-report\.html'\)\)/);
  assert.match(pipeline,/jenkins-terminal-report\.html/);
  assert.ok(pipeline.includes("archiveArtifacts artifacts: 'suite-src/output/ci/**/*,jenkins-terminal-report.html'"));
});

test('Jenkins checks the fixed branch tip for all three repositories',()=>{
  assert.deepEqual(branchPolicy,{pcs:'master',mc:'main',tap:'main',enforcement:'exact-branch-tip'});
  assert.match(pipeline,/fixedBranches\s*=\s*\[pcs: 'master', mc: 'main', tap: 'main'\]/);
  assert.match(pipeline,/--branch master --single-branch/);
  assert.match(pipeline,/git -c http\.proxy= -c http\.https:\/\/github\.com\.proxy= clone/);
  assert.doesNotMatch(pipeline,/-c https\.proxy=/);
  assert.match(pipeline,/echo \/ci\/\*\*& echo \/Jenkinsfile& echo \/suite\.json/);
  assert.doesNotMatch(pipeline,/echo \/projects\/merchant-center\/\*\*/);
  assert.match(pipeline,/refs\/remotes\/origin\/master/);
  assert.match(pipeline,/branch: fixedBranches\.tap/);
  assert.match(pipeline,/branch: fixedBranches\.mc/);
  assert.match(pipeline,/refs\/heads\/\$\{dependency\.branch\}/);
  assert.match(pipeline,/pcsBranch: fixedBranches\.pcs/);
  assert.match(pipeline,/mcBranch: fixedBranches\.mc/);
  assert.match(pipeline,/tapBranch: fixedBranches\.tap/);
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

test('parallel audit events are worker-sharded and merged before report aggregation',()=>{
  assert.match(sourceRunner,/SYSTEM_TEST_RUN_ID: runId/);
  assert.match(sourceRunner,/SYSTEM_TEST_AUDIT_EVENT_LOG_SHARDING: 'worker'/);
  assert.match(sourceRunner,/mergeAuditEventLogShards\(auditEventLogPath, \{ runId \}\)/);
  assert.match(sourceRunner,/auditShardMerge: auditShardMerge/);
  assert.match(auditStore,/env\.TEST_WORKER_INDEX/);
  assert.match(auditStore,/appendExistingEvents/);
  assert.match(auditStore,/eventSequence: sequence, previousEventHash/);
  assert.match(auditRuntime,/SYSTEM_TEST_RUN_ID/);
  assert.match(auditRuntime,/run-started:\$\{runId\}/);
});
