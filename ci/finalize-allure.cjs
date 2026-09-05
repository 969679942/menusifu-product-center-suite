const fs=require('node:fs'),path=require('node:path');
const {verifyAllureAttachments,writeBundleManifest,verifyReportSelection}=require('../tap/src/ci/result-bundle.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/ci');
const envelopePath=path.join(out,process.env.RUN_SCOPE==='pilot'?'pilot-envelope.json':'result-envelope.json');
const envelope=fs.existsSync(envelopePath)?JSON.parse(fs.readFileSync(envelopePath,'utf8')):{};
const businessRoot=path.join(out,'business');
let audit;
try {
if(process.env.RUN_SCOPE==='pilot' && fs.existsSync(businessRoot)) {
  const dirs=fs.readdirSync(businessRoot).map(n=>path.join(businessRoot,n,'allure-results')).filter(p=>fs.existsSync(p));
  if(dirs.length!==1)throw new Error('Exactly one business Allure run required');
  fs.cpSync(dirs[0],path.join(out,'allure-results'),{recursive:true});
}
audit=verifyAllureAttachments(path.join(out,'allure-results'));
if(process.env.RUN_SCOPE==='pilot') {
  const dir=path.join(out,'allure-results');
  const results=fs.readdirSync(dir).filter(n=>n.endsWith('-result.json')).map(n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8')));
  // MC supplies the case identity mapping; the selection and pass arbiter are public TAP contracts.
  const projected=results.map(r=>({caseId:r.labels?.find(l=>l.name==='caseId')?.value || r.labels?.find(l=>l.name==='tag' && l.value?.startsWith('case-'))?.value.slice(5),status:r.status}));
  const ledger=JSON.parse(fs.readFileSync(path.join(businessRoot,envelope.runId,'evidence-ledger.json'),'utf8'));
  const receipts=ledger.cases.map(c=>({caseId:c.caseId,accepted:c.playwrightStatus==='passed' && c.evidence?.status==='complete' && envelope.receiptAudit?.cases?.find(a=>a.caseId===c.caseId)?.status==='complete'}));
  audit.selection=verifyReportSelection(projected,envelope.selectedCaseIds,receipts);
}
}
catch(error){audit={status:'incomplete',reason:error.message};process.exitCode=2;}
fs.writeFileSync(path.join(out,'allure-audit.json'),JSON.stringify(audit,null,2));
writeBundleManifest(out,{gitSha:envelope.gitSha,buildNumber:String(process.env.BUILD_NUMBER),requestId:process.env.REQUEST_ID,
  runScope:process.env.RUN_SCOPE,selectionFingerprint:envelope.selectionFingerprint,reportStatus:audit.status});
