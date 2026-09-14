const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const pipeline=fs.readFileSync(path.join(root,'Jenkinsfile'),'utf8');
const sourceRunner=fs.readFileSync(path.join(root,'projects/project-a/Merchant Center UITest/scripts/run-product-center-source-governed.ts'),'utf8');
const auditStore=fs.readFileSync(path.join(root,'tap/src/audit/event-log.ts'),'utf8');
const auditRuntime=fs.readFileSync(path.join(root,'projects/project-a/Merchant Center UITest/utils/product-center-audit-runtime.ts'),'utf8');

test('dedicated Jenkins job always leaves a terminal report and preserves invocation identity',()=>{
  assert.match(pipeline,/ws\("\$\{env\.WORKSPACE\}@\$\{env\.BUILD_NUMBER\}-isolated"\)/);
  assert.match(pipeline,/params\.RUN_SCOPE == 'full-regression' \? 360 : 180/);
  assert.match(pipeline,/if \(!\(params\.INTENT_ID ==~ \/\[0-9a-f-\]\{36\}\//);
  assert.match(pipeline,/jenkins-invocation\.json/);
  assert.doesNotMatch(pipeline,/writeFile file: 'suite-src\/output\/ci\/execution-intent\.json'/);
  assert.match(pipeline,/if \(!fileExists\('suite-src\/output\/ci\/execution-report\.html'\)\)/);
  assert.match(pipeline,/jenkins-terminal-report\.html/);
  assert.ok(pipeline.includes("archiveArtifacts artifacts: 'suite-src/output/ci/**/*,jenkins-terminal-report.html'"));
});

test('parallel audit events are worker-sharded and merged before report aggregation',()=>{
  assert.match(sourceRunner,/SYSTEM_TEST_RUN_ID: runId/);
  assert.match(sourceRunner,/SYSTEM_TEST_AUDIT_EVENT_LOG_SHARDING: 'worker'/);
  assert.match(sourceRunner,/mergeAuditEventLogShards\(auditEventLogPath, \{ runId \}\)/);
  assert.match(sourceRunner,/auditShardMerge: auditShardMerge/);
  assert.match(auditStore,/env\.TEST_WORKER_INDEX/);
  assert.match(auditStore,/appendExistingEvents/);
  assert.match(auditStore,/eventSequence: sequence, previousEventHash/);
  assert.match(auditRuntime,/SYSTEM_TEST_AUDIT_INVOCATION_ID \?\? String\(process\.pid\)/);
  assert.match(auditRuntime,/run-started:\$\{runId\}:\$\{auditInvocationId\}/);
});
