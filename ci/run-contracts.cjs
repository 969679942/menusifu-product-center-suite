const fs = require('node:fs');
const path = require('node:path');
const {spawnSync, execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const project = process.env.MC_SOURCE_ROOT
  ? path.join(path.resolve(process.env.MC_SOURCE_ROOT),'Merchant Center UITest')
  : path.join(root, 'projects/merchant-center/Merchant Center UITest');
const tap = path.resolve(process.env.TAP_SOURCE_ROOT||path.join(root, 'tap'));
const {selectionFingerprint: fingerprintSelection} = require(path.join(tap,'src/ci/transport-contract.cjs'));
const out = path.join(root, 'output/ci');
fs.mkdirSync(out, {recursive:true});
const sha = execFileSync('git', ['rev-parse','HEAD'], {cwd:root,encoding:'utf8'}).trim();
const selection = JSON.parse(fs.readFileSync(path.join(__dirname,'contract-selection.json')));
const suites = [
  {id:'merchant-center-adapter',cwd:project,files:selection.files.map(f=>'tests/api/'+f)},
  {id:'tap-public-runtime',cwd:tap,files:(selection.tapFiles||[]).map(f=>'tests/api/'+f)},
].filter(suite=>suite.files.length);
for (const suite of suites) suite.cli=path.join(suite.cwd,'node_modules/@playwright/test/cli.js');
function cases(report, suiteId) {
  const all=[];
  function walk(suite, parents=[]) {
    for(const spec of suite.specs || []) for(const t of spec.tests || []) all.push({
      caseId:[suiteId,spec.file,...parents,spec.title,t.projectName].join('::'),
      suiteId,file:spec.file,title:spec.title,expectedStatus:t.expectedStatus,
      outcome:t.status,results:t.results || []
    });
    for(const child of suite.suites || []) walk(child,[...parents,child.title]);
  }
  walk(report); return all;
}
const collected=[];
for (const suite of suites) {
  const listed=spawnSync(process.execPath,[suite.cli,'test',...suite.files,'--project=api','--list','--reporter=json'],{
    cwd:suite.cwd,encoding:'utf8',windowsHide:true,
  });
  if (listed.status !== 0) throw new Error(`${suite.id} contract collection failed: ${listed.stderr}`);
  collected.push(...cases(JSON.parse(listed.stdout),suite.id));
}
const plan=collected.map(c=>c.caseId).sort();
const selectionFingerprint=fingerprintSelection(plan);
const intent={schemaVersion:1,kind:selection.kind,businessPassAuthority:false,gitSha:sha,
  buildNumber:process.env.BUILD_NUMBER||null,requestId:process.env.REQUEST_ID||null,
  intentId:process.env.INTENT_ID||null,runScope:process.env.RUN_SCOPE||'contracts',
  selectionFingerprint,selectedCaseIds:plan,
  files:suites.flatMap(suite=>suite.files.map(file=>`${suite.id}:${file}`))};
fs.writeFileSync(path.join(out,'execution-intent.json'),JSON.stringify(intent,null,2));
let records=[],collectionErrors=[],exitCode=0;
for (const suite of suites) {
  const resultPath=path.join(out,`playwright-${suite.id}.json`);
  fs.rmSync(resultPath,{force:true});
  const run=spawnSync(process.execPath,[suite.cli,'test',...suite.files,'--project=api','--workers=1','--reporter=line,json'],{
    cwd:suite.cwd,stdio:'inherit',windowsHide:true,
    env:{...process.env,CI:'1',PLAYWRIGHT_JSON_OUTPUT_FILE:resultPath,PC_PLAYWRIGHT_OUTPUT_DIR:path.join(out,`test-results-${suite.id}`)}
  });
  const suiteExitCode=Number.isInteger(run.status)?run.status:1;
  if (!exitCode && suiteExitCode) exitCode=suiteExitCode;
  if(fs.existsSync(resultPath)) {
    const report=JSON.parse(fs.readFileSync(resultPath));
    records.push(...cases(report,suite.id));
    collectionErrors.push(...(report.errors||[]).map(error=>({suiteId:suite.id,...error})));
  } else collectionErrors.push({suiteId:suite.id,message:'playwright-result-missing'});
}
const terminal=records.filter(r=>r.results.length).map(r=>r.caseId).sort();
const missing=plan.filter(id=>!terminal.includes(id));
const unexpected=terminal.filter(id=>!plan.includes(id));
const failures=records.filter(r=>!['expected','skipped'].includes(r.outcome));
const envelope={...intent,buildNumber:process.env.BUILD_NUMBER||null,requestId:process.env.REQUEST_ID||null,
  exitCode,terminalCaseIds:terminal,missing,unexpected,collectionErrors,
  status:missing.length||unexpected.length||collectionErrors.length?'blocked':failures.length?'completed-with-findings':'completed',
  passed:records.filter(r=>r.outcome==='expected').length,failed:failures.length,skipped:records.filter(r=>r.outcome==='skipped').length,
  records};
fs.writeFileSync(path.join(out,'result-envelope.json'),JSON.stringify(envelope,null,2));
process.exitCode=exitCode|| (envelope.status!=='completed'?2:0);
