const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const root=path.resolve(__dirname,'../..');
const project=path.join(root,'projects/project-a/Merchant Center UITest');
const tsx=path.join(project,'node_modules/tsx/dist/cli.mjs');
const unique=items=>[...new Set(items)].sort();

test('full regression freezes its selection before execution without a fixed exclusion count',()=>{
  const isolatedOut=fs.mkdtempSync(path.join(root,'output','intent-contract-'));
  try {
    const result=spawnSync(process.execPath,[tsx,'ci/run-product-center-full.ts','--plan-only'],{
      cwd:root,encoding:'utf8',windowsHide:true,
      env:{...process.env,PC_CI_OUTPUT_DIR:isolatedOut,BUILD_NUMBER:'intent-contract',REQUEST_ID:'intent-contract',INTENT_ID:'123e4567-e89b-12d3-a456-426614174000',RUN_SCOPE:'full-regression'},
    });
    assert.equal(result.status,0,result.stderr);
    const intent=JSON.parse(fs.readFileSync(path.join(isolatedOut,'execution-intent.json'),'utf8'));
    const source=JSON.parse(fs.readFileSync(path.join(root,'projects/project-a/deliverables/product-center-source-governance/execution-plan.json'),'utf8'));
    const seasoning=JSON.parse(fs.readFileSync(path.join(project,'systems/merchant-center-product-center-seasoning/manifest.json'),'utf8'));
    assert.equal(intent.intentId,'123e4567-e89b-12d3-a456-426614174000');
    assert.equal(intent.runScope,'full-regression');
    assert.deepEqual(unique([...intent.selectedCaseIds,...intent.classifiedExclusions]),unique(intent.plannedCaseIds));
    assert.equal(intent.selectedCaseIds.filter(id=>intent.classifiedExclusions.includes(id)).length,0);
    assert.deepEqual(intent.selectedCaseIds,unique([...source.execution.selectedCaseIds,...seasoning.cases.map(item=>item.caseId)]));
    const implementation=fs.readFileSync(path.join(root,'ci/run-product-center-full.ts'),'utf8');
    assert.doesNotMatch(implementation,/classifiedExclusions\.length\s*===\s*\d+/);
    assert.match(implementation,/PC_CI_OUTPUT_DIR/);
    assert.match(implementation,/const selectedCaseIds = selectedIntentCaseIds;/);
  } finally { fs.rmSync(isolatedOut,{recursive:true,force:true}); }
});
