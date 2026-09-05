import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runSystemTest } from '../projects/Test Automation Platform/scripts/run-system-test';
import { buildSystemTestArtifacts } from '../projects/Test Automation Platform/scripts/build-system-test-contract';
import { verifyCiBusinessReceipts } from '../tap/scripts/verify-ci-business-receipts';
import { sanitizePlaywrightTraceText } from '../tap/src/reporters/allure-report-integrity';
import { sanitizeMerchantCenterPlaywrightTraceArchive } from '../projects/project-a/Merchant Center UITest/adapters/test-automation-platform/allure-reporting';
const { selectionFingerprint } = require('../tap/src/ci/transport-contract.cjs');
const { sanitizeTraceSecrets } = require('./sanitize-trace.cjs');
const root=path.resolve(__dirname,'..');
const project=path.join(root,'projects/project-a/Merchant Center UITest');
const out=path.join(root,'output/ci');
const selection=JSON.parse(fs.readFileSync(path.join(__dirname,'business-selection.json'),'utf8'));
const gitSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const runId=`jenkins-${process.env.BUILD_NUMBER}-${process.env.REQUEST_ID}`;
const source=path.join(project,'output/system-test/merchant-center-product-center-seasoning',runId);
const secretValues:string[]=[];
for(const line of (process.env.MC_RUNTIME_ENV||'').split(/\r?\n/)) {
  const split=line.indexOf('=');
  if(split<1 || line.trimStart().startsWith('#')) continue;
  const key=line.slice(0,split).trim(), value=line.slice(split+1);
  if(!/^(MC_|PLAYWRIGHT_)/.test(key)) continue;
  process.env[key]=value;
  if(/PASSWORD|TOKEN|SECRET/i.test(key) && value.length>3)secretValues.push(value);
}
delete process.env.MC_RUNTIME_ENV;
process.env.CI='true';
process.env.MC_BRAND_ID='000407';
process.env.SYSTEM_TEST_EXECUTION_CONTEXT_PROFILE=selection.contextProfile;
// The system manifest declares the business-worker cap (currently 7). Do not
// force CI back to one worker here; the public concurrency resolver clamps the
// request by project policy, CPU, memory, and selected-case count. Jenkins
// still owns one executor; these are Playwright workers inside that executor.
process.env.MC_STORAGE_STATE_PATH=path.join(project,'output','private',runId,'auth-state.json');
process.env.SYSTEM_TEST_AUDIT_EVENT_LOG=path.join(source,'events.jsonl');
process.env.SYSTEM_TEST_RUN_ID=runId;
process.env.SYSTEM_TEST_ADDITIONAL_REPORTERS=path.join(project,'reporters/product-center-system-allure.reporter.ts');
function safeText(text:string) {
  let clean=sanitizePlaywrightTraceText(text).text;
  for(const secret of secretValues) clean=clean.split(secret).join('<redacted>');
  return clean;
}
function archive(dir:string, dest:string) {
  if(!fs.existsSync(dir))return;
  fs.mkdirSync(dest,{recursive:true});
  for(const item of fs.readdirSync(dir,{withFileTypes:true})) {
    const from=path.join(dir,item.name), to=path.join(dest,item.name);
    if(item.isSymbolicLink() || /auth-state|storage-state|execution-grant/i.test(item.name))continue;
    if(item.isDirectory()){archive(from,to);continue;}
    if(/\.(json|jsonl|log|txt|md|html|xml|csv|svg|properties)$/.test(item.name))fs.writeFileSync(to,safeText(fs.readFileSync(from,'utf8')));
    else if(/\.(png|webp|jpg|jpeg|webm|mp4|pdf)$/.test(item.name))fs.copyFileSync(from,to);
    else if(/\.zip$/.test(item.name)){fs.copyFileSync(from,to);sanitizeMerchantCenterPlaywrightTraceArchive(to);sanitizeTraceSecrets(to,secretValues);}
  }
}
async function main() {
  fs.mkdirSync(out,{recursive:true});
  if(process.argv.includes('--plan-only')) {
    const compiled=buildSystemTestArtifacts({rootDir:project,manifestPath:selection.manifest,caseIds:selection.selectedCaseIds});
    process.stdout.write(JSON.stringify({selected:compiled.contract.cases.length,errors:compiled.errors,onboarding:compiled.onboarding},null,2));
    process.exitCode=compiled.errors.length?2:0;
    return;
  }
  let code=2, diagnostic='';
  try {
    if(process.cwd().toLowerCase()!==project.toLowerCase())throw new Error('Pilot must start from the MC project root');
    if(selection.selectedCaseIds.length!==10 || new Set(selection.selectedCaseIds).size!==10)throw new Error('Exact ten-case selection required');
    code=await runSystemTest({manifestPath:selection.manifest,runId,caseIds:selection.selectedCaseIds,
      executionIntent:'full-regression',fullRegressionAuthorized:true,auditEventLogPath:process.env.SYSTEM_TEST_AUDIT_EVENT_LOG});
  } catch(error) { diagnostic=safeText(error instanceof Error ? error.stack||error.message : String(error)); }
  finally {
    archive(source,path.join(out,'business',runId));
    const load=(name:string)=>fs.existsSync(path.join(source,name))?JSON.parse(fs.readFileSync(path.join(source,name),'utf8')):null;
    const report=load('run-report.json'), ledger=load('evidence-ledger.json');
    const receiptAudit=verifyCiBusinessReceipts(ledger,load('contract.json'));
    const records=ledger?.cases||[];
    const terminalCaseIds=records.map((item:any)=>item.caseId);
    const publicReceiptAccepted=code===0 && receiptAudit.status==='complete' && report?.receiptImport?.records===10 && report?.receiptImport?.diagnostics?.length===0 && records.length===10;
    if(code===0 && !publicReceiptAccepted)code=3;
    const envelope={schemaVersion:1,kind:selection.kind,gitSha,buildNumber:process.env.BUILD_NUMBER,requestId:process.env.REQUEST_ID,
      selectedCaseIds:selection.selectedCaseIds,selectionFingerprint:selectionFingerprint(selection.selectedCaseIds),terminalCaseIds,
      publicReceiptAccepted,receiptAudit,status:terminalCaseIds.length<10?'blocked':publicReceiptAccepted?'completed':'completed-with-findings',
      passed:records.filter((x:any)=>x.playwrightStatus==='passed'&&x.evidence?.status==='complete').length,
      failed:records.filter((x:any)=>x.playwrightStatus==='failed').length,skipped:0,exitCode:code,diagnostic,runId,runReport:report};
    fs.writeFileSync(path.join(out,'pilot-envelope.json'),safeText(JSON.stringify(envelope,null,2)));
    // Session secrets are private to this build and never archived.
    if(fs.existsSync(process.env.MC_STORAGE_STATE_PATH!))fs.unlinkSync(process.env.MC_STORAGE_STATE_PATH!);
  }
  process.exitCode=code;
}
void main();
