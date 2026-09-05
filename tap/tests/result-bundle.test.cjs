const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {verifyAllureAttachments,writeBundleManifest}=require('../src/ci/result-bundle.cjs');
function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'tap-bundle-'));try{fn(root);}finally{assert.ok(root.startsWith(path.join(os.tmpdir(),'tap-bundle-')));fs.rmSync(root,{recursive:true});}}
test('complete Allure attachment package has content hashes',()=>fixture(root=>{
 fs.writeFileSync(path.join(root,'receipt.txt'),'observed value');
 fs.writeFileSync(path.join(root,'case-result.json'),JSON.stringify({attachments:[{source:'receipt.txt'}]}));
 assert.equal(verifyAllureAttachments(root).resultCount,1);
 assert.equal(writeBundleManifest(root,{gitSha:'a'.repeat(40)}).artifacts.length,2);
}));
test('missing attachment is not a complete report',()=>fixture(root=>{
 fs.writeFileSync(path.join(root,'case-result.json'),JSON.stringify({steps:[{attachments:[{source:'missing.txt'}]}]}));
 assert.throws(()=>verifyAllureAttachments(root),/missing/);
}));
test('traversal and empty report are rejected',()=>fixture(root=>{
 assert.throws(()=>verifyAllureAttachments(root),/empty/);
 fs.writeFileSync(path.join(root,'case-result.json'),JSON.stringify({attachments:[{source:'../outside'}]}));
 assert.throws(()=>verifyAllureAttachments(root),/rejected/);
}));
