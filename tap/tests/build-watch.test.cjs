const {test} = require('node:test');
const assert = require('node:assert/strict');
const {planBuildReviews} = require('../src/ci/build-watch-contract.cjs');
const build = {buildNumber:7, gitSha:'a'.repeat(40), requestId:'request-7', intentId:'123e4567-e89b-12d3-a456-426614174000', runScope:'reports', building:false};
const plan = (extra={}) => planBuildReviews({firstBuildNumber:7, builds:[build], ...extra});
test('terminal build discovered without any local submission needs collection',()=>assert.equal(plan()[0].action,'collect'));
test('artifact analysis is not an AI review',()=>assert.equal(plan({analyses:{7:build}})[0].action,'review'));
test('an evidenced completed AI review suppresses duplicate work',()=>assert.equal(plan({reviews:{7:{...build,status:'complete',actionRequired:'none',conclusion:'Reviewed',evidence:['ledger.json']}}})[0].action,'done'));
test('stale, incomplete and repair-pending reviews cannot close current work',()=>{
  for(const patch of [{gitSha:'b'.repeat(40)},{requestId:'other'},{intentId:'123e4567-e89b-12d3-a456-426614174001'},{runScope:'pilot'},{evidence:[]},{conclusion:''},{actionRequired:'repair'}]) {
    assert.equal(plan({reviews:{7:{...build,status:'complete',actionRequired:'none',conclusion:'Reviewed',evidence:['ledger.json'],...patch}}})[0].action,'collect');
  }
});
test('running builds wait and missing identity remains a technical finding',()=>{
  assert.equal(plan({builds:[{...build,building:true}]})[0].action,'wait');
  assert.equal(plan({builds:[{...build,gitSha:null}]})[0].action,'diagnose-identity');
});
test('backlog is ordered, baseline respected and duplicates rejected',()=>{
  assert.deepEqual(plan({builds:[{...build,buildNumber:9},build,{...build,buildNumber:6}]}).map(x=>x.buildNumber),[7,9]);
  assert.throws(()=>plan({builds:[build,build]}),/duplicate/);
});
