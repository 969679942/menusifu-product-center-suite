import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {publishItemReportAggregate} from '../../adapters/product-center/product-center-item-report-aggregation';
import {StandardListAcceptanceFlow} from '../../flows/product-center/item-216/standard-list-acceptance.flow';
import {StandardListAcceptancePage} from '../../pages/product-management/item/standard-list-acceptance.page';
import {consumeExecutableOperationReceipts} from '../../utils/executable-operation-receipt';
import {partitionProductCenterItemSpecs,standardListSpecPath} from '../../adapters/product-center/product-center-item-spec-routes';
import {runProductCenterItem213} from '../../scripts/run-product-center-item-213';
import {fingerprintProductCenterItemImplementation} from '../../adapters/product-center/product-center-item-implementation';
import {assertExecutionIntentContract,assertExecutionIntentCompletion} from '../../../Test Automation Platform/src/governance/execution-intent';

test('混合列表与已有商品选择集逐案恰好路由一次，重复选择硬阻断',()=>{
  const ids=['TC-ITEM-STD-102','TC-ITEM-STD-063','TC-ITEM-STD-074','TC-ITEM-ADD-005'];
  const routes=partitionProductCenterItemSpecs(ids);
  expect(routes.flatMap(r=>r.caseIds).sort()).toEqual([...ids].sort());expect(routes).toHaveLength(2);
  expect(routes.find(r=>r.specPath===standardListSpecPath)?.caseIds).toEqual(['TC-ITEM-STD-063','TC-ITEM-STD-074']);
  expect(()=>partitionProductCenterItemSpecs([ids[0],ids[0]])).toThrow('ITEM_SPEC_DUPLICATE_SELECTION');
});
test('已有商品失败后继续独立列表套件，每个子进程仅注册自身选择集',()=>{
  const calls:Array<{args:readonly string[];selected?:string}>=[];
  const result=runProductCenterItem213({caseIds:['TC-ITEM-STD-102','TC-ITEM-STD-063'],shardCount:1,execute:(_root,args,env)=>{calls.push({args,selected:env.PC_ITEM_SELECTED_CASE_IDS});return args.includes('tests/generated/product-center-item-216.generated.spec.ts')?1:0;}});
  expect(result).toBe(1);const executions=calls.filter(c=>c.args.includes('--project=chrome'));expect(executions).toHaveLength(2);
  expect(executions.map(c=>c.selected)).toEqual(['TC-ITEM-STD-102','TC-ITEM-STD-063']);
});
test('列表新增实现没有改变四条已合格业务实现指纹',()=>{
  const original=JSON.parse(fs.readFileSync('deliverables/system-test-platform/standard-list-preserved-fingerprints.json','utf8'));
  for(const [id,fingerprint]of Object.entries(original))expect(fingerprintProductCenterItemImplementation(process.cwd(),id)).toBe(fingerprint);
});
test('公共系统无关意图拒绝路由漏案和非终态完成',()=>{
  const intent={intentId:'synthetic',mode:'incremental' as const,stage:'batch' as const,scopeId:'neutral',scopeFingerprint:'a'.repeat(64),plannedCaseIds:['a','b'],classifiedExclusionCaseIds:[],partitionCaseIds:{one:['a'],two:['b']},selectedCaseIds:['a','b'],routes:{first:['a'],second:['b']}};
  expect(()=>assertExecutionIntentContract({intent})).not.toThrow();
  expect(()=>assertExecutionIntentContract({intent:{...intent,routes:{first:['a']}}})).toThrow();
  expect(()=>assertExecutionIntentCompletion({intent,status:'completed',terminalCaseIds:['a']})).toThrow();
  expect(()=>assertExecutionIntentCompletion({intent,status:'completed-with-findings',terminalCaseIds:['a','b']})).not.toThrow();
});
test('合并入口保留不同套件原始结果和哈希，缺少子报告不得补造',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tap-item-report-'));
  try{
    fs.writeFileSync(path.join(root,'one.json'),JSON.stringify({suites:[{title:'one'}]}));
    expect(()=>publishItemReportAggregate(root,'all.json',['one.json','two.json'])).toThrow('ITEM_PROFILE_REPORT_MISSING');
    fs.writeFileSync(path.join(root,'two.json'),JSON.stringify({suites:[{title:'two'}]}));
    publishItemReportAggregate(root,'all.json',['one.json','two.json']);const report=JSON.parse(fs.readFileSync(path.join(root,'all.json'),'utf8'));
    expect(report.suites).toEqual([{title:'one'},{title:'two'}]);expect(report.sourceReports).toHaveLength(2);expect(report.sourceReports.every((r:{sha256:string})=>/^[a-f0-9]{64}$/.test(r.sha256))).toBe(true);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('商品分片报告必须逐案覆盖选择集，空套件和漏案均阻断',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tap-item-report-coverage-'));
  const report=(caseId:string)=>({suites:[{specs:[{title:caseId,tests:[{status:'expected',annotations:[{type:'canonical-case-id',description:caseId}],results:[{status:'passed'}]}]}]}]});
  try{
    fs.writeFileSync(path.join(root,'one.json'),JSON.stringify(report('TC-ITEM-STD-102')));
    expect(()=>publishItemReportAggregate(root,'all.json',[{reportPath:'one.json',unitId:'names',selectedCaseIds:['TC-ITEM-STD-102','TC-ITEM-STD-103'],shardIndex:1,shardCount:1}]))
      .toThrow('ITEM_PROFILE_TERMINAL_CASE_MISSING:TC-ITEM-STD-103');
    fs.writeFileSync(path.join(root,'two.json'),JSON.stringify(report('TC-ITEM-STD-103')));
    const aggregate=publishItemReportAggregate(root,'all.json',[
      {reportPath:'one.json',unitId:'names',selectedCaseIds:['TC-ITEM-STD-102','TC-ITEM-STD-103'],shardIndex:1,shardCount:2},
      {reportPath:'two.json',unitId:'names',selectedCaseIds:['TC-ITEM-STD-102','TC-ITEM-STD-103'],shardIndex:2,shardCount:2},
    ]);
    expect(aggregate.summary).toMatchObject({selected:2,terminal:2,missingCaseIds:[],unexpectedCaseIds:[]});
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('正式要求的列控件不存在时留下失败动作，仍恢复原状态且后续动作不伪造',async({},info)=>{
  const original=[{name:'Category',checked:true,disabled:false}];let restored=0;
  const page={open:async()=>{},readPagination:async()=>({total:144,size:50,rows:50,text:''}),openColumns:async()=>{},readColumns:async()=>original,readHeaders:async()=>[],closeColumns:async()=>{},selectColumn:async()=>{restored++;}} as unknown as StandardListAcceptancePage;
  const flow=new StandardListAcceptanceFlow(page);await expect(flow.execute('TC-ITEM-STD-003')).rejects.toThrow('BUSINESS_CONTROL_ABSENT:Specification,Price($)');
  expect(flow.stateRestored).toBe(true);expect(restored).toBe(1);
  const sourceOperations=consumeExecutableOperationReceipts(info.testId).filter(r=>r.operationKey.startsWith('TC-ITEM-STD-003:'));
  expect(sourceOperations.map(r=>[r.operationKey,r.status])).toEqual([['TC-ITEM-STD-003:action-1','passed'],['TC-ITEM-STD-003:action-2','failed']]);
});
