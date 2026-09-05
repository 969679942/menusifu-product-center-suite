import {test,expect} from '../projects/project-a/Merchant Center UITest/node_modules/@playwright/test';
test('报告集成合同样本：中文步骤及附件（非业务用例）',async({},info)=>{
  await test.step('断言：实际观测与期望一致',async()=>{
    const receipt={expectedValue:2,actualValue:1+1,comparison:'matched',authority:'synthetic-report-contract'};
    expect(receipt.actualValue).toBe(receipt.expectedValue);
    await info.attach('隔离样本断言收据',{body:Buffer.from(JSON.stringify(receipt)),contentType:'application/json'});
  });
});
