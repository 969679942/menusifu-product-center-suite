const {test}=require('node:test'), assert=require('node:assert/strict'), crypto=require('node:crypto');
const {planNext}=require('../chain-next.cjs');
function fixture(scope='contracts') {
  const invocation={runScope:scope,gitSha:'a'.repeat(40),mcGitSha:'b'.repeat(40),tapGitSha:'c'.repeat(40),requestId:'test-request',intentId:'test-intent',buildNumber:1};
  return {enabled:true,result:'SUCCESS',scope,invocation,envelope:{...invocation,status:'completed',selectedCaseIds:['C1'],terminalCaseIds:['C1'],selectionFingerprint:crypto.createHash('sha256').update(JSON.stringify(['C1'])).digest('hex'),publicReceiptAccepted:true},audit:{status:'complete',selection:{status:'complete'}}};
}
test('chain advances contracts to reports to pilot and terminates',()=>{
  assert.equal(planNext(fixture()).nextScope,'reports');
  assert.equal(planNext(fixture('reports')).nextScope,'pilot');
  assert.equal(planNext(fixture('pilot')).status,'completed');
  assert.deepEqual(planNext(fixture()),planNext(fixture()));
});
test('standalone, failure and abort never schedule another build',()=>{
  assert.equal(planNext({...fixture(),enabled:false}).nextScope,null);
  for (const result of ['FAILURE','ABORTED','UNSTABLE']) assert.equal(planNext({...fixture(),result}).nextScope,null);
});
test('chain rejects stale identity, short revisions, missing results and selection drift',()=>{
  for(const mutate of [x=>x.invocation.mcGitSha='abc1234',x=>x.envelope.requestId='stale',x=>x.envelope.terminalCaseIds=[],x=>x.envelope.terminalCaseIds=['C1','C1'],x=>x.envelope.selectionFingerprint='stale',x=>x.envelope=null]) {
    const x=fixture();mutate(x);assert.throws(()=>planNext(x),/CHAIN_/);
  }
});
test('reports and pilot require current complete report evidence',()=>{
  assert.throws(()=>planNext({...fixture('reports'),audit:null}),/REPORT_INCOMPLETE/);
  const x=fixture('pilot');x.envelope.publicReceiptAccepted=false;
  assert.throws(()=>planNext(x),/BUSINESS_EVIDENCE_INCOMPLETE/);
});
