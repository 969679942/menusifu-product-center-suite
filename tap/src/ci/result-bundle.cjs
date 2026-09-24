const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
function redactDiagnosticText(value) {
  return String(value ?? '')
    .replace(/(password|token|secret|authorization|cookie)=([^\s&]+)/gi, '$1=<redacted>')
    .replace(/(bearer\s+)[A-Za-z0-9._-]+/gi, '$1<redacted>')
    .replace(/(set-cookie:\s*)[^\r\n]+/gi, '$1<redacted>')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 4000);
}
function files(root, directory=root) {
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const target=path.join(directory,entry.name);
    if(entry.isSymbolicLink()) throw new Error('bundle-symlink-rejected');
    return entry.isDirectory()?files(root,target):[target];
  });
}
function verifyAllureAttachments(root) {
  const results=files(root).filter(f=>f.endsWith('-result.json'));
  if(!results.length)throw new Error('allure-results-empty');
  function visit(value) {
    if(!value || typeof value!=='object')return;
    for(const attachment of value.attachments??[]) {
      const source=attachment.source;
      if(typeof source!=='string' || path.isAbsolute(source) || source.includes('\\') || source.split('/').includes('..'))throw new Error('allure-attachment-path-rejected');
      const file=path.resolve(root,source);
      if(!file.startsWith(path.resolve(root)+path.sep)||!fs.existsSync(file))throw new Error('allure-attachment-missing');
    }
    for(const v of Object.values(value))if(v && typeof v==='object')Array.isArray(v)?v.forEach(visit):visit(v);
  }
  for(const file of files(root).filter(f=>f.endsWith('.json')))visit(JSON.parse(fs.readFileSync(file,'utf8')));
  return {status:'complete',resultCount:results.length};
}
function writeBundleManifest(root,identity) {
  // Raw Playwright output is intentionally not transported: it can be deeply
  // nested on Windows and is not governed evidence.  Keep the manifest aligned
  // with the receiver's archive filter so every declared item is retrievable.
  const artifacts=files(root).filter(f=>{
    const relative=path.relative(root,f).split(path.sep);
    // The manifest describes the payload; it cannot include its own previous
    // bytes or a second finalize would necessarily invalidate its hash.
    return path.basename(f)!=='bundle-manifest.json' && !relative.includes('test-results') && !relative.some(part=>part.startsWith('.playwright-artifacts-'));
  }).map(file=>({
    path:path.relative(root,file).split(path.sep).join('/'),size:fs.statSync(file).size,
    sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),policy:'required'
  }));
  const manifest={schemaVersion:1,...identity,artifacts};
  fs.writeFileSync(path.join(root,'bundle-manifest.json'),JSON.stringify(manifest,null,2));
  return manifest;
}
function verifyReportSelection(results,selectedCaseIds,receipts) {
  const selected=new Set(selectedCaseIds), seen=new Set(), issues=[];
  if(selected.size!==selectedCaseIds.length || !selected.size)issues.push('invalid-selection');
  const byCase=new Map(receipts.map(r=>[r.caseId,r]));
  for(const result of results) {
    if(!selected.has(result.caseId))issues.push('unexpected-case');
    if(seen.has(result.caseId))issues.push('duplicate-case');
    seen.add(result.caseId);
    const receipt=byCase.get(result.caseId);
    if(!receipt || (result.status==='passed' && !receipt.accepted))issues.push('report-pass-without-receipt');
    if(receipt?.accepted && result.status!=='passed')issues.push('report-status-conflict');
  }
  if([...selected].some(id=>!seen.has(id)))issues.push('missing-case');
  if(issues.length)throw new Error([...new Set(issues)].join(','));
  return {status:'complete',selectedCount:selected.size};
}
function writeTechnicalAllureDiagnostic(root, metadata = {}) {
  fs.mkdirSync(root, { recursive: true });
  const result = { uuid: `technical-${metadata.buildNumber || 'unknown'}-${metadata.requestId || 'unknown'}`, name: `技术阻断诊断｜${metadata.runScope || 'unknown'}｜${metadata.phase || 'unknown'}`, fullName: `商品中心.技术诊断.${metadata.runScope || 'unknown'}`, status: 'broken', stage: 'finished', statusDetails: { message: redactDiagnosticText(metadata.reason || '技术阶段阻断') }, labels: [{ name: 'parentSuite', value: metadata.applicationName || '商品中心' }, { name: 'suite', value: '技术诊断' }, { name: 'subSuite', value: '执行基础设施' }, { name: 'severity', value: 'blocker' }, { name: 'executionDisposition', value: 'technical-blocked' }], steps: [{ name: `[技术阶段] ${metadata.phase || 'unknown'}`, status: 'broken', stage: 'finished' }, { name: '[业务执行资格] 未授权', status: 'skipped', stage: 'finished' }], attachments: [] };
  fs.writeFileSync(path.join(root, 'technical-terminal-result.json'), JSON.stringify(result));
  fs.writeFileSync(path.join(root, 'environment.properties'), 'Execution disposition=TECHNICAL_BLOCKED\nBusiness pass authority=FALSE\n');
  return { resultCount: 1 };
}
module.exports={verifyAllureAttachments,writeBundleManifest,verifyReportSelection,writeTechnicalAllureDiagnostic,redactDiagnosticText};
