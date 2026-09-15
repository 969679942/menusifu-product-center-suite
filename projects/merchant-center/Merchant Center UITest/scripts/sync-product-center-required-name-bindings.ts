import fs from 'node:fs';
import path from 'node:path';
import contract from '../contracts/product-center/test-cases/standard-required-name-acceptance.json';
import {requiredNameSpecPath} from '../adapters/product-center/product-center-item-required-name-specs';
export function syncRequiredNameBindings(root=process.cwd()) {
  const file=path.join(root,'contracts/product-center/test-plan-additional-automation-bindings.json');const document=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const item of contract.cases){const previous=document.bindings.find((b:{caseId:string})=>b.caseId===item.caseId);document.bindings=document.bindings.filter((b:{caseId:string})=>b.caseId!==item.caseId);document.bindings.push({...previous,caseId:item.caseId,title:item.title,module:'item',handlerId:`item-required-name:${item.caseId}`,bindingFingerprint:item.caseFingerprint,scriptPath:requiredNameSpecPath,runnerId:'item',runtimeReadiness:'ready',status:'landed',runtimeStatus:'not-run',blockingReasons:[],reason:'正式名称必填六动作和三断言已独立实现；当前合格资格必须消费真实收据',source:contract.metadata.sourceArtifacts[0]});}
  fs.writeFileSync(file,JSON.stringify(document,null,2)+'\n');
}
if(require.main===module)syncRequiredNameBindings();
