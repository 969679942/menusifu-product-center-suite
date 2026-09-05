const fs=require('node:fs'),path=require('node:path');
const {verifyAllureAttachments,writeBundleManifest}=require('../tap/src/ci/result-bundle.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/ci');
const envelopePath=path.join(out,process.env.RUN_SCOPE==='pilot'?'pilot-envelope.json':'result-envelope.json');
const envelope=fs.existsSync(envelopePath)?JSON.parse(fs.readFileSync(envelopePath,'utf8')):{};
const businessRoot=path.join(out,'business');
if(process.env.RUN_SCOPE==='pilot' && fs.existsSync(businessRoot)) {
  const dirs=fs.readdirSync(businessRoot).map(n=>path.join(businessRoot,n,'allure-results')).filter(p=>fs.existsSync(p));
  if(dirs.length!==1)throw new Error('Exactly one business Allure run required');
  fs.cpSync(dirs[0],path.join(out,'allure-results'),{recursive:true});
}
let audit;
try { audit=verifyAllureAttachments(path.join(out,'allure-results')); }
catch(error){audit={status:'incomplete',reason:error.message};process.exitCode=2;}
fs.writeFileSync(path.join(out,'allure-audit.json'),JSON.stringify(audit,null,2));
writeBundleManifest(out,{gitSha:envelope.gitSha,buildNumber:String(process.env.BUILD_NUMBER),requestId:process.env.REQUEST_ID,
  runScope:process.env.RUN_SCOPE,selectionFingerprint:envelope.selectionFingerprint,reportStatus:audit.status});
