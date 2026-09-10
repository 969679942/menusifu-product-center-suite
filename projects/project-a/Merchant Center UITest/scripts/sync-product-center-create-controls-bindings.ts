import fs from 'node:fs';
import path from 'node:path';
import contract from '../contracts/product-center/test-cases/standard-create-controls-acceptance.json';
import {createControlsSpecPath} from '../adapters/product-center/product-center-item-create-controls-specs';
export function syncCreateControlsBindings(root=process.cwd()) {
  const file=path.join(root,'contracts/product-center/test-plan-additional-automation-bindings.json');const document=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const item of contract.cases){const previous=document.bindings.find((b:{caseId:string})=>b.caseId===item.caseId);document.bindings=document.bindings.filter((b:{caseId:string})=>b.caseId!==item.caseId);document.bindings.push({...previous,caseId:item.caseId,title:item.title,module:'item',handlerId:`item-create-controls:${item.caseId}`,bindingFingerprint:item.caseFingerprint,scriptPath:createControlsSpecPath,runnerId:'item',runtimeReadiness:'ready',status:'landed',runtimeStatus:'not-run',blockingReasons:[],reason:'创建页250字符、规格组新增目标及称重禁用断言按当前DOM实现；当前合格资格必须消费真实收据',source:contract.metadata.sourceArtifacts[0]});}
  fs.writeFileSync(file,JSON.stringify(document,null,2)+'\n');
}
if(require.main===module)syncCreateControlsBindings();
