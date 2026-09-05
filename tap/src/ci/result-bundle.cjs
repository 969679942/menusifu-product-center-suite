const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
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
  const artifacts=files(root).filter(f=>path.basename(f)!=='bundle-manifest.json').map(file=>({
    path:path.relative(root,file).split(path.sep).join('/'),size:fs.statSync(file).size,
    sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
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
module.exports={verifyAllureAttachments,writeBundleManifest,verifyReportSelection};
