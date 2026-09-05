const fs=require('node:fs'),path=require('node:path');
const {verifyAllureAttachments,writeBundleManifest,verifyReportSelection}=require('../tap/src/ci/result-bundle.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/ci');
const envelopePath=path.join(out,process.env.RUN_SCOPE==='pilot'?'pilot-envelope.json':'result-envelope.json');
const envelope=fs.existsSync(envelopePath)?JSON.parse(fs.readFileSync(envelopePath,'utf8')):{};
const businessRoot=path.join(out,'business');
let audit;
try {
if((process.env.RUN_SCOPE==='pilot' || process.env.RUN_SCOPE==='full-regression') && fs.existsSync(businessRoot)) {
  const dirs=fs.readdirSync(businessRoot).map(n=>path.join(businessRoot,n,'allure-results')).filter(p=>fs.existsSync(p));
  const expected=process.env.RUN_SCOPE==='pilot'?1:2;
  const target=path.join(out,'allure-results');
  if(process.env.RUN_SCOPE==='pilot') fs.rmSync(target,{recursive:true,force:true});
  fs.mkdirSync(target,{recursive:true});
  if(process.env.RUN_SCOPE==='pilot' && dirs.length!==expected)throw new Error(`Expected ${expected} business Allure runs, got ${dirs.length}`);
  if(process.env.RUN_SCOPE==='full-regression' && dirs.length<expected && fs.readdirSync(target).length===0)throw new Error(`Expected at least ${expected} business Allure runs, got ${dirs.length}`);
  if(fs.readdirSync(target).length===0) for(const dir of dirs) for(const name of fs.readdirSync(dir)) {
    const dest=path.join(target,name);
    if(fs.existsSync(dest))throw new Error(`duplicate-allure-result:${name}`);
    fs.copyFileSync(path.join(dir,name),dest);
  }
}
audit=verifyAllureAttachments(path.join(out,'allure-results'));
if(process.env.RUN_SCOPE==='pilot' || process.env.RUN_SCOPE==='full-regression') {
  const dir=path.join(out,'allure-results');
  const results=fs.readdirSync(dir).filter(n=>n.endsWith('-result.json')).map(n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8')));
  // MC supplies the case identity mapping; the selection and pass arbiter are public TAP contracts.
  const projected=results.map(r=>({caseId:r.labels?.find(l=>l.name==='caseId')?.value || r.labels?.find(l=>l.name==='tag' && l.value?.startsWith('case-'))?.value.slice(5),status:r.status}));
  if(process.env.RUN_SCOPE==='full-regression' && envelope.kind==='governed-business-full-product-center') {
    audit.selection=verifyReportSelection(projected,envelope.selectedCaseIds,(envelope.caseAudit||[]).map(c=>({caseId:c.caseId,accepted:c.accepted===true && c.status==='passed'})));
  } else {
  const ledgers=process.env.RUN_SCOPE==='pilot'
    ? [path.join(businessRoot,envelope.runId,'evidence-ledger.json')]
    : fs.readdirSync(businessRoot).map(n=>path.join(businessRoot,n,'evidence-ledger.json')).filter(fs.existsSync);
  const ledgerCases=ledgers.flatMap(file=>JSON.parse(fs.readFileSync(file,'utf8')).cases||[]);
  const receipts=ledgerCases.map(c=>({caseId:c.caseId,accepted:c.playwrightStatus==='passed' && c.evidence?.status==='complete' && envelope.receiptAudit?.cases?.find(a=>a.caseId===c.caseId)?.status==='complete'}));
  audit.selection=verifyReportSelection(projected,envelope.selectedCaseIds,receipts);
  }
}
}
catch(error){audit={status:'incomplete',reason:error.message};process.exitCode=2;}
fs.writeFileSync(path.join(out,'allure-audit.json'),JSON.stringify(audit,null,2));
writeBundleManifest(out,{gitSha:envelope.gitSha,buildNumber:String(process.env.BUILD_NUMBER),requestId:process.env.REQUEST_ID,
  runScope:process.env.RUN_SCOPE,selectionFingerprint:envelope.selectionFingerprint,reportStatus:audit.status});
