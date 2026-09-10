import { test } from '../../fixtures/product-center-advanced-settings.fixture';
import contract from '../../contracts/product-center/test-cases/standard-advanced-settings-acceptance.json';
import { consumeExecutableOperationReceipts } from '../../utils/executable-operation-receipt';
import { fingerprintReceiptEvidence } from '../../utils/playwright-execution-receipt';
import { fingerprintProductCenterItemImplementation } from '../../adapters/product-center/product-center-item-implementation';
import { readProductCenterApplicationVersion } from '../../utils/product-center-application-version';
import { appConfig } from '../../test-data/env';
import fs from 'node:fs';
import path from 'node:path';
import {publishImmutableArtifact} from '../../../Test Automation Platform/src/utils/immutable-artifact';
import {fingerprintExecutionIntent,fingerprintExecutionSelection} from '../../../Test Automation Platform/src/governance/execution-intent';

const selected=(process.env.PC_ITEM_SELECTED_CASE_IDS??'').split(',').filter(Boolean);
test.describe('标准商品高级设置默认与展开正式验收',()=>{
  for(const item of contract.cases.filter(row=>selected.includes(row.caseId))) {
    test(item.title,{tag:['@商品'],annotation:[{type:'canonical-case-id',description:item.caseId}]},async({page,standardAdvancedSettingsFlow:flow},testInfo)=>{
      test.setTimeout(120000);
      const intentPath=process.env.PC_PROJECT_EXECUTION_INTENT_PATH;
      if(!intentPath)throw Error('CURRENT_EXECUTION_INTENT_REQUIRED');
      const intent=JSON.parse(fs.readFileSync(intentPath,'utf8'));
      if(!intent.selectedCaseIds.includes(item.caseId))throw Error('CASE_OUTSIDE_CURRENT_INTENT');
      let failure:unknown;
      try { if(!item.sourceReady)throw Error('SOURCE_CONTRACT_MISSING');await flow.execute(item.caseId);if(!flow.stateRestored)throw Error('ADVANCED_RESTORATION_EVIDENCE_INCOMPLETE'); }
      catch(error){failure=error;}
      finally {
        const failed=failure!==undefined||testInfo.errors.length>0;
        if(failed)await test.step('失败诊断：保留业务观察和状态恢复结果',async()=>{
          await testInfo.attach('清理后的页面',{body:await page.screenshot(),contentType:'image/png'});
          await testInfo.attach('中文诊断',{body:JSON.stringify({conclusion:failure?String(failure):'当前高级设置行为不满足正式预期，见逐项期望与实际',category:String(failure).includes('BUSINESS_CONTROL_ABSENT')||flow.assertions.some(a=>a.status==='observed-mismatch')?'business-behavior-difference':'automation-or-source-gap',phase:'advanced-settings',expected:item.assertionIds,actual:flow.assertions,stateRestored:flow.stateRestored,observations:flow.observations}),contentType:'application/json'});
        });
        const version=await readProductCenterApplicationVersion(page);
        const operations=consumeExecutableOperationReceipts(testInfo.testId);
        const receipt={receiptVersion:'4.0.0' as const,caseId:item.caseId,caseFingerprint:item.caseFingerprint,semanticCaseFingerprint:item.semanticCaseFingerprint,
          implementationFingerprint:fingerprintProductCenterItemImplementation(process.cwd(),item.caseId),
          executionContext:{applicationVersionFingerprint:version.fingerprint??undefined,environmentId:appConfig.environmentId,tenantScope:appConfig.brandId,locale:await page.evaluate(()=>document.documentElement.lang||'und'),roleId:process.env.MC_TEST_ROLE??'merchant-operator',route:flow.assertionRoute??new URL(page.url()).pathname},
          releaseObservation:{...version,observedAt:new Date().toISOString()},executionEpochId:process.env.PC_ITEM_RUN_ID??'unassigned',
          operationReceipts:operations.filter(operation=>operation.operationKey.startsWith(item.caseId+':action-')),supportingOperationReceipts:operations.filter(operation=>!operation.operationKey.startsWith(item.caseId+':action-')),assertionReceipts:flow.assertions,claims:{required:item.assertionIds,observed:flow.assertions.map(a=>a.claimId as string),verified:flow.assertions.filter(a=>a.status==='verified').map(a=>a.claimId as string)},
          cleanup:{apiZeroResidue:true,uiZeroResidue:flow.stateRestored,apiIdentityCounts:{},uiIdentityCounts:{},uiVerificationObserved:flow.stateRestored,required:false,reason:'无业务数据写入；未提交创建表单，返回列表已核验'},
          terminalFailure:failed?{status:'failed',unreachedSourceOperations:item.steps.map((_,i)=>`${item.caseId}:action-${i+1}`).filter(key=>!operations.some(o=>o.operationKey===key)),reason:failure?String(failure):'formal-assertion-mismatch'}:undefined,
        };
        const standardReceipt={...receipt,evidenceFingerprint:fingerprintReceiptEvidence(receipt as Parameters<typeof fingerprintReceiptEvidence>[0])};
        await testInfo.attach('test-execution-receipt',{body:JSON.stringify(standardReceipt),contentType:'application/json'});
        const run=(process.env.PC_ITEM_RUN_ID??'unassigned').replace(/[^a-zA-Z0-9_-]/g,'_');
        publishImmutableArtifact({outputRoot:process.cwd(),relativePath:`output/checkpoints/item/${run}/terminal-${item.caseId}.json`,content:JSON.stringify({intentFingerprint:fingerprintExecutionIntent(intent),selectionFingerprint:fingerprintExecutionSelection(intent.selectedCaseIds),selectedCaseIds:intent.selectedCaseIds,terminalCaseIds:[item.caseId],status:failed?'failed':'passed',receipt:standardReceipt},null,2),reason:'persist-case-terminal-and-standard-receipt-immediately'});
      }
      if(failure)throw failure;
    });
  }
});


