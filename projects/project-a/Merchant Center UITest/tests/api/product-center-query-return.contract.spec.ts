import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {partitionProductCenterItemSpecs,queryReturnSpecPath} from '../../adapters/product-center/product-center-item-spec-dispatch';
import {fingerprintProductCenterItemImplementation} from '../../adapters/product-center/product-center-item-implementation';
import {StandardQueryReturnFlow} from '../../flows/product-center/item-216/standard-query-return.flow';
import {StandardQueryReturnPage} from '../../pages/product-management/item/standard-query-return.page';
import {consumeExecutableOperationReceipts} from '../../utils/executable-operation-receipt';

test('查询独立路由和既有列表路由无遗漏且重复选择硬阻断',()=>{
  const ids=['TC-ITEM-STD-030','TC-ITEM-STD-063','TC-ITEM-ADD-005'];
  const routes=partitionProductCenterItemSpecs(ids);
  expect(routes).toHaveLength(3);expect(routes.flatMap(r=>r.caseIds).sort()).toEqual([...ids].sort());
  expect(routes.find(r=>r.specPath===queryReturnSpecPath)?.caseIds).toEqual([ids[0]]);
  expect(()=>partitionProductCenterItemSpecs([ids[0],ids[0]])).toThrow('ITEM_SPEC_DUPLICATE_SELECTION');
});
test('查询新增实现不改变八条已合格用例的业务依赖指纹',()=>{
  const original=JSON.parse(fs.readFileSync('deliverables/system-test-platform/query-return-prior-fingerprints.json','utf8'));
  expect(Object.keys(original)).toHaveLength(8);
  for(const [id,hash] of Object.entries(original))expect(fingerprintProductCenterItemImplementation(process.cwd(),id)).toBe(hash);
});
test('导航中断仍恢复初始筛选并保留失败动作且不伪造断言',async({},info)=>{
  let restored=false;
  const page={open:async()=>{},readTypes:async()=>[],selectTypes:async(names:string[])=>{if(!names.length)restored=true;},navigateAwayAndReturn:async()=>{throw Error('synthetic-navigation-interruption');}} as unknown as StandardQueryReturnPage;
  const flow=new StandardQueryReturnFlow(page);
  await expect(flow.execute('TC-ITEM-STD-030')).rejects.toThrow('synthetic-navigation-interruption');
  expect(restored).toBe(true);expect(flow.stateRestored).toBe(true);expect(flow.assertions).toEqual([]);
  expect(consumeExecutableOperationReceipts(info.testId).filter(r=>r.operationKey.startsWith('TC-ITEM-STD-030:')).map(r=>r.status)).toEqual(['passed','failed']);
});

for(const stable of [false,true])test(`返回状态${stable?'稳定保留':'仍在变化'}时准确区分业务观察和证据缺口`,async()=>{
  const page={open:async()=>{},readTypes:async()=>[],selectTypes:async()=>{},navigateAwayAndReturn:async()=>{},readSettledTypes:async()=>({actualValue:['Standard'],samples:[],outcome:'condition-timeout',configuredWindowMs:5000,unchangedAcrossWindow:stable})} as unknown as StandardQueryReturnPage;
  const flow=new StandardQueryReturnFlow(page);await expect(flow.execute('TC-ITEM-STD-030')).rejects.toThrow();expect(flow.stateRestored).toBe(true);if(stable)expect(flow.assertions[0].status).toBe('observed-mismatch');else expect(flow.assertions).toEqual([]);
});
test('页面读取异常不能冒充空筛选或稳定业务不符',async()=>{
  const page=Object.create(StandardQueryReturnPage.prototype) as StandardQueryReturnPage;Object.assign(page,{openTypes:async()=>{},readTypeValues:async()=>{throw Error('synthetic-locator-error');}});
  await expect(page.readSettledTypes([])).rejects.toThrow('synthetic-locator-error');
});
test('稳定观察修复不改变第九条称重用例实现指纹',()=>{
  const result=JSON.parse(fs.readFileSync('deliverables/system-test-platform/weight-units-unit-result.json','utf8'));expect(fingerprintProductCenterItemImplementation(process.cwd(),'TC-ITEM-STD-019')).toBe(result.currentContract.implementationFingerprint);
});

test('有界观察允许稍后清空，且保留连续两次空值证据',async()=>{
  let calls=0;const page=Object.create(StandardQueryReturnPage.prototype) as StandardQueryReturnPage;Object.assign(page,{openTypes:async()=>{},readTypeValues:async()=>++calls===1?['Standard']:[]});
  const result=await page.readSettledTypes([]);expect(result.outcome).toBe('satisfied');expect(result.samples.length).toBeGreaterThanOrEqual(3);expect(result.samples.slice(-2).every(sample=>sample.types.length===0)).toBe(true);
});
test('持续保留筛选覆盖观察窗口并留下实际样本',async()=>{
  const page=Object.create(StandardQueryReturnPage.prototype) as StandardQueryReturnPage;Object.assign(page,{openTypes:async()=>{},readTypeValues:async()=>['Standard']});
  const result=await page.readSettledTypes([]);expect(result.outcome).toBe('condition-timeout');expect(result.unchangedAcrossWindow).toBe(true);expect(result.samples.at(-1)!.elapsedMs).toBeGreaterThanOrEqual(4500);
});
