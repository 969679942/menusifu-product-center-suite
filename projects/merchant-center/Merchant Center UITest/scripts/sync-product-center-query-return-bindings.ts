import fs from 'node:fs';
import path from 'node:path';
import contract from '../contracts/product-center/test-cases/standard-query-return.json';
import {queryReturnSpecPath} from '../adapters/product-center/product-center-item-spec-dispatch';

export function syncQueryReturnBindings(rootDir=process.cwd()) {
  const target=path.join(rootDir,'contracts/product-center/test-plan-additional-automation-bindings.json');
  const document=JSON.parse(fs.readFileSync(target,'utf8'));
  for(const item of contract.cases) {
    const previous=document.bindings.find((binding:{caseId:string})=>binding.caseId===item.caseId);
    const binding={...previous,caseId:item.caseId,title:item.title,module:'item',handlerId:`item-query-return:${item.caseId}`,bindingFingerprint:item.caseFingerprint,scriptPath:queryReturnSpecPath,runnerId:'item',runtimeReadiness:item.sourceReady?'ready':'source-blocked',status:'landed',runtimeStatus:item.sourceReady?'not-run':'blocked-source',reason:item.sourceReady?'独立来源场景已实现；通过资格必须消费当前标准收据':'中文/英文正确文案与核对范围缺少正式来源；已登记阻断入口不表示可执行',blockingReasons:item.sourceReady?[]:['中文/英文正确文案与核对范围缺少正式来源'],source:contract.metadata.sourceArtifacts[0]};
    document.bindings=document.bindings.filter((value:{caseId:string})=>value.caseId!==item.caseId);document.bindings.push(binding);
  }
  fs.writeFileSync(target,JSON.stringify(document,null,2)+'\n');
}
if(require.main===module)syncQueryReturnBindings();

