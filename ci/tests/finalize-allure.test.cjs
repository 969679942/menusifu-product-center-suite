const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
test('MC Allure adapter uses public selection gate and still archives a failing audit',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'suite-allure-'));
 try {
  for(const rel of ['ci/finalize-allure.cjs','tap/src/ci/result-bundle.cjs']) {
   const file=path.join(root,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.resolve(__dirname,'../..',rel),file);
  }
  const out=path.join(root,'output/ci'),business=path.join(out,'business/sample'),allure=path.join(business,'allure-results');fs.mkdirSync(allure,{recursive:true});
  const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value));
  write(path.join(out,'pilot-envelope.json'),{runId:'sample',gitSha:'a'.repeat(40),selectedCaseIds:['C1'],receiptAudit:{cases:[{caseId:'C1',status:'complete'}]}});
  write(path.join(business,'evidence-ledger.json'),{cases:[{caseId:'C1',playwrightStatus:'passed',evidence:{status:'complete'}}]});
  write(path.join(allure,'one-result.json'),{labels:[{name:'tag',value:'case-C1'}],status:'passed'});
  const execute=()=>spawnSync(process.execPath,[path.join(root,'ci/finalize-allure.cjs')],{env:{...process.env,RUN_SCOPE:'pilot',BUILD_NUMBER:'1',REQUEST_ID:'fixture'},encoding:'utf8'});
  assert.equal(execute().status,0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out,'allure-audit.json'))).selection.status,'complete');
  write(path.join(allure,'one-result.json'),{labels:[{name:'caseId',value:'WRONG'}],status:'passed'});
  assert.equal(execute().status,2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out,'bundle-manifest.json'))).reportStatus,'incomplete');
 } finally {assert.ok(root.startsWith(path.join(os.tmpdir(),'suite-allure-')));fs.rmSync(root,{recursive:true});}
});
