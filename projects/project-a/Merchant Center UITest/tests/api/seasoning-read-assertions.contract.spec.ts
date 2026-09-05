import { test,expect } from '@playwright/test';
import { recordSeasoningReadAssertion } from '../../adapters/product-center/seasoning-read-assertions';
import { verifyCiBusinessReceipts } from '../../../../Test Automation Platform/scripts/verify-ci-business-receipts';
const call={adapterId:'read-list',claimIds:['claim-1']};
const contract={cases:[{caseId:'reference-read',requiredOperationKeys:[],expectationClaims:[{claimId:'claim-1'}]}]};
function fixture(){return {recipe:{caseId:'reference-read',assertionContracts:[{claimId:'claim-1',adapterId:'read-list',observationChannel:'ui',authority:'user-visible'}]},assertionReceipts:[],results:{}} as any;}
test('读取断言必须记录期望、实际观测、比较结果及来源权威',()=>{
  const context=fixture();recordSeasoningReadAssertion(context,call,{name:'target'},{name:'target'},true);
  expect(verifyCiBusinessReceipts({cases:[{caseId:'reference-read',runtimeEvidence:context}]},contract).status).toBe('complete');
  expect(context.assertionReceipts[0]).toMatchObject({expectedValue:{name:'target'},actualValue:{name:'target'},actualStatus:'observed',comparison:'matched',observationChannel:'ui',authority:'user-visible'});
});
test('无实际观测或仅有已验证标记不得授权完整收据',()=>{
  const context=fixture();recordSeasoningReadAssertion(context,call,{name:'target'},undefined,false);
  expect(verifyCiBusinessReceipts({cases:[{caseId:'reference-read',runtimeEvidence:context}]},contract).status).toBe('incomplete');
  context.assertionReceipts=[{claimId:'claim-1',status:'verified'}];
  expect(verifyCiBusinessReceipts({cases:[{caseId:'reference-read',runtimeEvidence:context}]},contract).status).toBe('incomplete');
});
