const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const suiteRoot=path.resolve(__dirname,'../..');
const tapRoot=path.resolve(process.env.TAP_SOURCE_ROOT||path.join(suiteRoot,'tap'));
const sourceFile=rel=>rel.startsWith('tap/')?path.join(tapRoot,rel.slice(4)):path.join(suiteRoot,rel);
test('MC Allure adapter uses public selection gate and still archives a failing audit',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'suite-allure-'));
 try {
  for(const rel of ['ci/finalize-allure.cjs','tap/src/ci/result-bundle.cjs']) {
   const file=path.join(root,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(sourceFile(rel),file);
  }
  const out=path.join(root,'output/ci'),business=path.join(out,'business/sample'),allure=path.join(business,'allure-results');fs.mkdirSync(allure,{recursive:true});
  const raw=path.join(out,'allure-results');fs.mkdirSync(raw,{recursive:true});
  const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value));
  write(path.join(out,'pilot-envelope.json'),{runId:'sample',gitSha:'a'.repeat(40),selectedCaseIds:['C1'],receiptAudit:{cases:[{caseId:'C1',status:'complete'}]}});
  write(path.join(business,'evidence-ledger.json'),{cases:[{caseId:'C1',playwrightStatus:'passed',evidence:{status:'complete'}}]});
  write(path.join(allure,'one-result.json'),{labels:[{name:'tag',value:'case-C1'}],status:'passed'});
  // The same UUID can be present in the root transport directory and in a
  // business shard. Finalization must publish one case result, preferring the
  // richer business copy instead of aborting on a duplicate filename.
  write(path.join(raw,'one-result.json'),{labels:[{name:'tag',value:'case-C1'}],status:'passed',steps:[{name:'业务步骤',status:'passed'}]});
  const execute=()=>spawnSync(process.execPath,[path.join(root,'ci/finalize-allure.cjs')],{env:{...process.env,RUN_SCOPE:'pilot',BUILD_NUMBER:'1',REQUEST_ID:'fixture'},encoding:'utf8'});
  assert.equal(execute().status,0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out,'allure-audit.json'))).selection.status,'complete');
  assert.equal(fs.readdirSync(path.join(out,'allure-results-business')).filter(name=>name.endsWith('-result.json')).length,1);
  write(path.join(allure,'one-result.json'),{labels:[{name:'caseId',value:'WRONG'}],status:'passed'});
  write(path.join(raw,'one-result.json'),{labels:[{name:'caseId',value:'WRONG'}],status:'passed'});
  assert.equal(execute().status,2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out,'bundle-manifest.json'))).reportStatus,'incomplete');
 } finally {assert.ok(root.startsWith(path.join(os.tmpdir(),'suite-allure-')));fs.rmSync(root,{recursive:true});}
});

test('full regression publishes one governed Allure node for every formal case, including exclusions',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'suite-allure-formal-'));
 try {
  for(const rel of ['ci/finalize-allure.cjs','tap/src/ci/result-bundle.cjs']) {
   const file=path.join(root,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(sourceFile(rel),file);
  }
  const out=path.join(root,'output/ci'),business=path.join(out,'business/sample'),allure=path.join(business,'allure-results');fs.mkdirSync(allure,{recursive:true});
  const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value));
  write(path.join(out,'result-envelope.json'),{kind:'governed-business-full-product-center',formalScopeCaseIds:['C1','C2'],plannedCaseIds:['C1','C2'],selectedCaseIds:['C1'],classifiedExclusions:['C2'],exclusionReasons:{C2:'deferred:外部依赖未就绪'},caseAudit:[{caseId:'C1',status:'passed',accepted:true}]});
  write(path.join(allure,'one-result.json'),{labels:[{name:'caseId',value:'C1'}],status:'passed',steps:[{name:'[业务操作] C1',status:'passed'}]});
  write(path.join(business,'evidence-ledger.json'),{cases:[{caseId:'C1',playwrightStatus:'passed',evidence:{status:'complete'}}]});
  const execute=()=>spawnSync(process.execPath,[path.join(root,'ci/finalize-allure.cjs')],{env:{...process.env,RUN_SCOPE:'full-regression',BUILD_NUMBER:'1',REQUEST_ID:'fixture'},encoding:'utf8'});
  assert.equal(execute().status,0);
  const files=fs.readdirSync(path.join(out,'allure-results-business')).filter(name=>name.endsWith('-result.json'));
  assert.equal(files.length,2);
  const published=files.map(name=>JSON.parse(fs.readFileSync(path.join(out,'allure-results-business',name),'utf8')));
  assert.equal(published.filter(item=>item.labels.some(label=>label.name==='caseId'&&label.value==='C2'))[0].status,'skipped');
 } finally {assert.ok(root.startsWith(path.join(os.tmpdir(),'suite-allure-formal-')));fs.rmSync(root,{recursive:true});}
});

test('technical preflight failure publishes a diagnostic Allure node without business authority',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'suite-allure-technical-'));
 try {
  for(const rel of ['ci/finalize-allure.cjs','tap/src/ci/result-bundle.cjs']) {
   const file=path.join(root,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(sourceFile(rel),file);
  }
  const out=path.join(root,'output/ci');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'jenkins-invocation.json'),JSON.stringify({gitSha:'a'.repeat(40)}));
  fs.writeFileSync(path.join(out,'dependency-checkout.json'),JSON.stringify({tapGitSha:'b'.repeat(40),mcGitSha:'c'.repeat(40)}));
  const execution=spawnSync(process.execPath,[path.join(root,'ci/finalize-allure.cjs')],{env:{...process.env,RUN_SCOPE:'full-regression',BUILD_NUMBER:'117',REQUEST_ID:'fixture-technical'},encoding:'utf8'});
  assert.equal(execution.status,2,execution.stderr||execution.stdout);
  assert.equal(fs.existsSync(path.join(out,'allure-technical-publishable.marker')),true);
  assert.equal(fs.existsSync(path.join(out,'allure-business-publishable.marker')),false);
  const technicalDir=path.join(out,'allure-results-technical');
  const result=JSON.parse(fs.readFileSync(path.join(technicalDir,'technical-terminal-result.json'),'utf8'));
  assert.equal(result.status,'broken');
  assert.equal(result.labels.some(label=>label.name==='executionDisposition'&&label.value==='technical-blocked'),true);
  assert.equal(result.labels.some(label=>label.name==='caseId'),false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out,'bundle-manifest.json'))).reportStatus,'incomplete');
 } finally {assert.ok(root.startsWith(path.join(os.tmpdir(),'suite-allure-technical-')));fs.rmSync(root,{recursive:true});}
});
