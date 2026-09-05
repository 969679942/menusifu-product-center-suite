const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const AdmZip=require('../../projects/project-a/Merchant Center UITest/node_modules/adm-zip');
const {sanitizeTraceSecrets}=require('../sanitize-trace.cjs');
test('trace action values and embedded request bodies are redacted while screenshot bytes survive',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ci-trace-contract-'));
  try {
    const file=path.join(dir,'trace.zip'),zip=new AdmZip();
    zip.addFile('0-trace.trace',Buffer.from(JSON.stringify({params:{value:'fixture-password-731'}})));
    zip.addFile('0-trace.network',Buffer.from(JSON.stringify({postData:{text:'{"password":"fixture-password-731"}'}})));
    const binary=Buffer.from([137,80,78,71,255]);zip.addFile('screen.png',binary);zip.writeZip(file);
    assert.equal(sanitizeTraceSecrets(file,['fixture-password-731']),2);
    const result=new AdmZip(file);
    assert.ok(!result.readAsText('0-trace.network').includes('fixture-password-731'));
    assert.ok(!result.readAsText('0-trace.trace').includes('fixture-password-731'));
    assert.deepEqual(result.readFile('screen.png'),binary);
    assert.equal(sanitizeTraceSecrets(file,['fixture-password-731']),0);
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
