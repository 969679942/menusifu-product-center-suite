const path=require('node:path');
const AdmZip=require(path.resolve(__dirname,'../projects/project-a/Merchant Center UITest/node_modules/adm-zip'));
function sanitizeTraceSecrets(file, secrets) {
  const zip=new AdmZip(file);let changed=0;
  for(const entry of zip.getEntries()) {
    if(entry.isDirectory)continue;
    const data=entry.getData();let text=data.toString('utf8');
    if(!Buffer.from(text,'utf8').equals(data))continue;
    const before=text;
    for(const secret of secrets.filter(x=>typeof x==='string'&&x.length>3)) {
      for(const encoded of new Set([secret,JSON.stringify(secret).slice(1,-1),encodeURIComponent(secret)]))text=text.split(encoded).join('<redacted>');
    }
    text=text.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,'<redacted>');
    if(text!==before){zip.updateFile(entry.entryName,Buffer.from(text,'utf8'));changed++;}
  }
  if(changed)zip.writeZip(file);
  return changed;
}
module.exports={sanitizeTraceSecrets};
