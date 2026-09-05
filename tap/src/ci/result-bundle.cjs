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
module.exports={verifyAllureAttachments,writeBundleManifest};
