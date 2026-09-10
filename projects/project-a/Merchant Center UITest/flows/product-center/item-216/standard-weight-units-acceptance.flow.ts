import {expect,test,type Page} from '@playwright/test';
import {ItemCreateFlow} from '../../item-create.flow';
import {StandardListAcceptancePage} from '../../../pages/product-management/item/standard-list-acceptance.page';
import {step} from '../../../utils/step';
import {startExecutableOperation,finishExecutableOperation} from '../../../utils/executable-operation-receipt';

export class StandardWeightUnitsAcceptanceFlow {
  readonly assertions:Array<Record<string,unknown>>=[];
  readonly observations:Record<string,unknown>={};
  stateRestored=false;
  assertionRoute:string|undefined;
  constructor(private readonly page:Page,private readonly create:ItemCreateFlow,private readonly list:StandardListAcceptancePage) {}
  private async action<T>(index:number,title:string,run:()=>Promise<T>):Promise<T> {
    return test.step(`业务操作：${title}`,async()=>{const receipt=startExecutableOperation({executionId:test.info().testId,operationKey:`TC-ITEM-STD-019:action-${index}`,title,method:'ui'});try{const value=await run();finishExecutableOperation(receipt,'passed');return value;}catch(error){finishExecutableOperation(receipt,'failed');throw error;}});
  }
  @step('验证称重销售单位只包含正式规定的三个选项')
  async execute(caseId:string) {
    if(caseId!=='TC-ITEM-STD-019')throw Error('UNREGISTERED_WEIGHT_UNIT_CASE');
    try {
      const form=await this.create.openStandardCreateFromList(this.page);
      await this.action(1,'将标准商品设置为称重商品',()=>form.enableWeightBasedItem());
      const options=await this.action(2,'打开销售单位下拉框并读取全部选项',()=>form.readWeightUnitOptions());
      this.assertionRoute=new URL(this.page.url()).pathname;this.observations.unitOptions=options;
      await test.step('断言：销售单位仅为g、kg、ml且无重复或额外项',async()=>{
        const actualValue=[...options].sort(),expectedValue=['g','kg','ml'];const matched=JSON.stringify(actualValue)===JSON.stringify(expectedValue);
        const receipt={claimId:`${caseId}:expectation-1`,status:matched?'verified':'observed-mismatch',actualValue,expectedValue,actualStatus:'observed',observationChannel:'ui',authority:'user-visible',comparison:matched?'matched':'mismatched'};
        this.assertions.push(receipt);await test.info().attach('销售单位期望与实际',{body:JSON.stringify(receipt),contentType:'application/json'});expect(actualValue).toEqual(expectedValue);
      });
    } finally {await test.step('清理：离开未提交表单并返回商品列表',async()=>{await this.list.open();this.stateRestored=true;});}
  }
}
