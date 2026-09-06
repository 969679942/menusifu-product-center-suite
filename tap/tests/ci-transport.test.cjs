const {test}=require('node:test');
const assert=require('node:assert/strict');
const {selectionFingerprint,verifyBuildEnvelope}=require('../src/ci/transport-contract.cjs');
const identity={gitSha:'a'.repeat(40),buildNumber:7,requestId:'request-7',intentId:'123e4567-e89b-12d3-a456-426614174000',runScope:'reports'};
function baseline(){return {...identity,selectedCaseIds:['case-a','case-b'],terminalCaseIds:['case-b','case-a'],selectionFingerprint:selectionFingerprint(['case-a','case-b']),status:'completed-with-findings'};}
test('terminal failures remain valid transport evidence without granting a business pass',()=>{
  assert.deepEqual(verifyBuildEnvelope(baseline(),identity),[]);
});
for(const key of ['gitSha','buildNumber','requestId','intentId','runScope']) test('reject unrelated '+key,()=>{
  assert.ok(verifyBuildEnvelope({...baseline(),[key]:'different'},identity).includes(key+'-mismatch'));
});
test('reject missing, unexpected, duplicated and stale selections',()=>{
  for(const terminalCaseIds of [['case-a'],['case-a','case-c'],['case-a','case-b','case-b']]) {
    assert.ok(verifyBuildEnvelope({...baseline(),terminalCaseIds},identity).length);
  }
  assert.ok(verifyBuildEnvelope({...baseline(),selectionFingerprint:'old'},identity).includes('selection-fingerprint-mismatch'));
});
test('incomplete or empty runs cannot be accepted',()=>{
  assert.ok(verifyBuildEnvelope({...baseline(),status:'blocked'},identity).includes('execution-incomplete'));
  assert.ok(verifyBuildEnvelope({...baseline(),selectedCaseIds:[],terminalCaseIds:[]},identity).length);
});
