const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {verifyAllureAttachments,writeBundleManifest,verifyReportSelection}=require('../src/ci/result-bundle.cjs');
function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'tap-bundle-'));try{fn(root);}finally{assert.ok(root.startsWith(path.join(os.tmpdir(),'tap-bundle-')));fs.rmSync(root,{recursive:true});}}
test('report selection cannot omit, duplicate or invent passing cases',()=>{
 const selection=['A','B'],receipts=[{caseId:'A',accepted:true},{caseId:'B',accepted:false}];
 const results=[{caseId:'A',status:'passed'},{caseId:'B',status:'broken'}];
 assert.equal(verifyReportSelection(results,selection,receipts).status,'complete');
 assert.throws(()=>verifyReportSelection(results.slice(0,1),selection,receipts),/missing-case/);
 assert.throws(()=>verifyReportSelection([...results,results[0]],selection,receipts),/duplicate/);
 assert.throws(()=>verifyReportSelection([...results,{caseId:'C',status:'passed'}],selection,receipts),/unexpected/);
 assert.throws(()=>verifyReportSelection(results.map(r=>({...r,status:'passed'})),selection,receipts),/without-receipt/);
});
test('complete Allure attachment package has content hashes',()=>fixture(root=>{
 fs.writeFileSync(path.join(root,'receipt.txt'),'observed value');
 fs.writeFileSync(path.join(root,'case-result.json'),JSON.stringify({attachments:[{source:'receipt.txt'}]}));
 fs.mkdirSync(path.join(root,'test-results'));fs.writeFileSync(path.join(root,'test-results','raw.json'),'{}');
 assert.equal(verifyAllureAttachments(root).resultCount,1);
 const manifest=writeBundleManifest(root,{gitSha:'a'.repeat(40)});
 assert.equal(manifest.artifacts.length,2);
 assert.equal(manifest.artifacts.some(item=>item.path.startsWith('test-results/')),false);
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
