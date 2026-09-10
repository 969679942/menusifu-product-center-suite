import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { publishImmutableArtifact } from '../utils/immutable-artifact';
import { parseProductCenterItemCaseSemanticFingerprints } from '../utils/product-center-item-case-semantic-fingerprint';
import bindings from '../contracts/product-center/test-cases/standard-name-format-bindings.json';

const root=process.cwd(),relativePath='tests/generated/product-center-item-standard-216.generated.spec.ts';
const source=fs.readFileSync(path.join(root,relativePath),'utf8');
const formal=parseProductCenterItemCaseSemanticFingerprints(path.resolve(root,bindings.source));
for(const row of bindings.cases) {
  const item=formal.find(c=>c.caseId===row.caseId);
  if(!item || row.action!=='name-format' || !/^TC-ITEM-STD-10[23]$/.test(row.caseId)) throw Error('STANDARD_NAME_BINDING_SOURCE_INVALID');
}
const start='  // BEGIN SOURCE-BOUND STANDARD NAME CASES',end='  // END SOURCE-BOUND STANDARD NAME CASES';
const generated=[start,...bindings.cases.map(row=>`  { caseId: '${row.caseId}', title: '${row.title}', action: '${row.action}' },`),end].join('\n');
let next:string;
if(source.includes(start)) {
  const begin=source.indexOf(start),finish=source.indexOf(end,begin);
  if(finish<begin||source.indexOf(start,begin+start.length)>=0)throw Error('STANDARD_NAME_BINDING_MARKERS_INVALID');
  next=source.slice(0,begin)+generated+source.slice(finish+end.length);
} else {
  const anchor='const cases: readonly StandardCase[] = [';
  if(!source.includes(anchor)||bindings.cases.some(row=>source.includes(`caseId: '${row.caseId}'`)))throw Error('STANDARD_NAME_BINDING_TABLE_INVALID');
  next=source.replace(anchor,anchor+'\n'+generated);
}
if(process.argv.includes('--check')) {
  if(next!==source)throw Error('STANDARD_NAME_BINDINGS_STALE');
} else publishImmutableArtifact({outputRoot:root,relativePath,content:next,reason:'generate-standard-name-actions-from-formal-bound-registry'});
const additionalPath='contracts/product-center/test-plan-additional-automation-bindings.json';
const additional=JSON.parse(fs.readFileSync(path.join(root,additionalPath),'utf8'));
const generatedBindings=bindings.cases.map(row=>({caseId:row.caseId,title:row.title,module:'brand-item',handlerId:`item-216:name-format:${row.caseId}`,
  bindingFingerprint:createHash('sha256').update(JSON.stringify({source:formal.find(c=>c.caseId===row.caseId)!.fingerprint,action:row.action})).digest('hex'),
  scriptPath:'tests/generated/product-center-item-216.generated.spec.ts',runnerId:'item',runtimeReadiness:'ready',status:'landed',runtimeStatus:'not-run',
  reason:'正式来源与名称格式场景已绑定；真实运行与当前收据资格独立验收',bindingSource:'contracts/product-center/test-cases/standard-name-format-bindings.json'}));
const merged={...additional,bindings:[...additional.bindings.filter((row:{caseId:string})=>!bindings.cases.some(item=>item.caseId===row.caseId)),...generatedBindings]};
if(process.argv.includes('--check')) {
  if(JSON.stringify(merged)!==JSON.stringify(additional))throw Error('STANDARD_NAME_ADDITIONAL_BINDINGS_STALE');
} else publishImmutableArtifact({outputRoot:root,relativePath:additionalPath,content:JSON.stringify(merged,null,2)+'\n',reason:'register-source-bound-standard-name-actions-without-claiming-runtime-pass'});
console.log(JSON.stringify({status:process.argv.includes('--check')?'checked':'generated',caseIds:bindings.cases.map(row=>row.caseId)}));
