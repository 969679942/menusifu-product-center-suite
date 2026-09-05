const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..','..');
test('pilot keeps one Jenkins executor while allowing the governed system cap',()=>{
 const source=fs.readFileSync(path.join(root,'ci/run-pilot.ts'),'utf8');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'projects/project-a/Merchant Center UITest/systems/merchant-center-product-center-seasoning/manifest.json'),'utf8'));
 assert.equal(manifest.execution.workers,2);
 assert.doesNotMatch(source,/SYSTEM_TEST_WORKERS\s*=\s*['"]1['"]/);
 assert.match(source,/public concurrency resolver clamps/);
 const jenkinsfile=fs.readFileSync(path.join(root,'Jenkinsfile'),'utf8');
 assert.match(jenkinsfile,/node \{/);
 assert.doesNotMatch(jenkinsfile,/parallel\s*\{/);
});
