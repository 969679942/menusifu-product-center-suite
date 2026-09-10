import {expect,test} from '@playwright/test';
import {StandardQueryReturnPage,type ItemTypeFilter} from '../../../pages/product-management/item/standard-query-return.page';
import {step} from '../../../utils/step';
import {startExecutableOperation,finishExecutableOperation} from '../../../utils/executable-operation-receipt';

export class StandardQueryReturnFlow {
  readonly assertions:Array<Record<string,unknown>>=[];
  readonly observations:Record<string,unknown>={};
  stateRestored=false;
  constructor(private readonly list:StandardQueryReturnPage) {}
  private async action(index:number,title:string,run:()=>Promise<void>) {
    return test.step(`业务操作：${title}`,async()=>{const receipt=startExecutableOperation({executionId:test.info().testId,operationKey:`TC-ITEM-STD-030:action-${index}`,title,method:'ui'});try{await run();finishExecutableOperation(receipt,'passed');}catch(error){finishExecutableOperation(receipt,'failed');throw error;}});
  }
  @step('验证切换页面后类型筛选清空并恢复初始状态')
  async execute(caseId:string) {
    if(caseId!=='TC-ITEM-STD-030')throw Error('UNREGISTERED_QUERY_RETURN_CASE');
    let original:ItemTypeFilter[]|undefined;
    try {
      await this.action(1,'进入商品列表并准备标准商品筛选',async()=>{await this.list.open();original=await this.list.readTypes();this.observations.initialTypes=original;await this.list.selectTypes(['Standard']);this.observations.filteredTypes=await this.list.readTypes();});
      await this.action(2,'进入分类页面后通过侧边栏返回商品列表',()=>this.list.navigateAwayAndReturn());
      await this.action(3,'核对返回列表后的类型筛选为空',async()=>{const observation=await this.list.readSettledTypes([]);this.observations.returnedTypeTimeline=observation;await test.info().attach("返回后类型筛选时间序列",{body:JSON.stringify(observation),contentType:"application/json"});if(observation.outcome!=="satisfied"&&!observation.unchangedAcrossWindow)throw Error("EVIDENCE_INCOMPLETE:类型状态在观察窗口内变化，不能判定稳定业务偏差");const actualValue=observation.actualValue;const matched=observation.outcome==="satisfied"&&actualValue.length===0;const receipt={claimId:`${caseId}:expectation-1`,status:matched?'verified':'observed-mismatch',actualValue,expectedValue:[],actualStatus:'observed',observationChannel:'ui',authority:'user-visible',comparison:matched?'matched':'mismatched'};this.assertions.push(receipt);await test.step('断言：返回列表后类型筛选条件为空',async()=>{await test.info().attach('类型筛选期望与实际',{body:JSON.stringify(receipt),contentType:'application/json'});expect(actualValue).toEqual([]);});});
    } finally {
      if(original!==undefined)await test.step('清理：恢复并核验初始类型筛选',async()=>{await this.list.open();await this.list.selectTypes(original!);this.observations.restoredTypes=await this.list.readTypes();this.stateRestored=true;});
    }
  }
}

