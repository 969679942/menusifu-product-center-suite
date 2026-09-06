const fs = require('node:fs');
const path = require('node:path');
const {spawnSync, execFileSync} = require('node:child_process');
const {selectionFingerprint: fingerprintSelection} = require('../tap/src/ci/transport-contract.cjs');
const root = path.resolve(__dirname, '..');
const project = path.join(root, 'projects/project-a/Merchant Center UITest');
const out = path.join(root, 'output/ci');
fs.mkdirSync(out, {recursive:true});
const sha = execFileSync('git', ['rev-parse','HEAD'], {cwd:root,encoding:'utf8'}).trim();
const selection = JSON.parse(fs.readFileSync(path.join(__dirname,'contract-selection.json')));
const files = selection.files.map(f=>'tests/api/'+f);
const cli = path.join(project,'node_modules/@playwright/test/cli.js');
const listed = spawnSync(process.execPath,[cli,'test',...files,'--project=api','--list','--reporter=json'],{cwd:project,encoding:'utf8',windowsHide:true});
if (listed.status !== 0) throw new Error('Contract collection failed: '+listed.stderr);
function cases(report) {
  const all=[];
  function walk(suite, parents=[]) {
    for(const spec of suite.specs || []) for(const t of spec.tests || []) all.push({
      caseId:[spec.file,...parents,spec.title,t.projectName].join('::'),
      file:spec.file,title:spec.title,expectedStatus:t.expectedStatus,
      outcome:t.status,results:t.results || []
    });
    for(const child of suite.suites || []) walk(child,[...parents,child.title]);
  }
  walk(report); return all;
}
const plan=cases(JSON.parse(listed.stdout)).map(c=>c.caseId).sort();
const selectionFingerprint=fingerprintSelection(plan);
const intent={schemaVersion:1,kind:selection.kind,businessPassAuthority:false,gitSha:sha,
  buildNumber:process.env.BUILD_NUMBER||null,requestId:process.env.REQUEST_ID||null,
  intentId:process.env.INTENT_ID||null,runScope:process.env.RUN_SCOPE||'contracts',
  selectionFingerprint,selectedCaseIds:plan,files};
fs.writeFileSync(path.join(out,'execution-intent.json'),JSON.stringify(intent,null,2));
const resultPath=path.join(out,'playwright.json');
const run=spawnSync(process.execPath,[cli,'test',...files,'--project=api','--workers=1','--reporter=line,json'],{
  cwd:project,stdio:'inherit',windowsHide:true,
  env:{...process.env,CI:'1',PLAYWRIGHT_JSON_OUTPUT_FILE:resultPath,PC_PLAYWRIGHT_OUTPUT_DIR:path.join(out,'test-results')}
});
let records=[],collectionErrors=[];
if(fs.existsSync(resultPath)) {const r=JSON.parse(fs.readFileSync(resultPath));records=cases(r);collectionErrors=r.errors||[];}
const terminal=records.filter(r=>r.results.length).map(r=>r.caseId).sort();
const missing=plan.filter(id=>!terminal.includes(id));
const unexpected=terminal.filter(id=>!plan.includes(id));
const failures=records.filter(r=>!['expected','skipped'].includes(r.outcome));
const envelope={...intent,buildNumber:process.env.BUILD_NUMBER||null,requestId:process.env.REQUEST_ID||null,
  exitCode:run.status,terminalCaseIds:terminal,missing,unexpected,collectionErrors,
  status:missing.length||unexpected.length||collectionErrors.length?'blocked':failures.length?'completed-with-findings':'completed',
  passed:records.filter(r=>r.outcome==='expected').length,failed:failures.length,skipped:records.filter(r=>r.outcome==='skipped').length,
  records};
fs.writeFileSync(path.join(out,'result-envelope.json'),JSON.stringify(envelope,null,2));
process.exitCode=run.status|| (envelope.status!=='completed'?2:0);
