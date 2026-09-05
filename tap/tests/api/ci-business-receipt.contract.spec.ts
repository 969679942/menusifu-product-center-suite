import {test,expect} from '@playwright/test';
import {verifyCiBusinessReceipts} from '../../scripts/verify-ci-business-receipts';
const contract={cases:[{caseId:'reference.case',requiredOperationKeys:[],expectationClaims:[{claimId:'field.name'}]}]};
const receipt={claimId:'field.name',status:'verified',expectedValue:'expected-name',actualValue:'expected-name',actualStatus:'observed',observationChannel:'ui',authority:'user-visible',comparison:'matched'};
test('CI 消费者必须拒绝只有通过标记的旧断言收据',()=>{
  const ledger={cases:[{caseId:'reference.case',runtimeEvidence:{assertionReceipts:[{claimId:'field.name',status:'verified'}]}}]};
  expect(verifyCiBusinessReceipts(ledger,contract).status).toBe('incomplete');
  ledger.cases[0].runtimeEvidence.assertionReceipts=[receipt];
  expect(verifyCiBusinessReceipts(ledger,contract).status).toBe('complete');
});
test('CI 消费者必须拒绝缺案、重复案和不匹配身份',()=>{
  const item={caseId:'reference.case',runtimeEvidence:{assertionReceipts:[receipt]}};
  for(const cases of [[],[item,item],[{...item,caseId:'other.case'}]]) {
    expect(verifyCiBusinessReceipts({cases},contract).status).toBe('incomplete');
  }
});
