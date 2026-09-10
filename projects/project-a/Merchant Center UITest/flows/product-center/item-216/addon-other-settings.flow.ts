import {test,type Page} from '@playwright/test';
import type {AddonOtherSettingsPage} from '../../../pages/product-management/item/addon-other-settings.page';
import {startExecutableOperation,finishExecutableOperation} from '../../../utils/executable-operation-receipt';
import contract from '../../../contracts/product-center/test-cases/addon-other-settings-acceptance.json';
export class AddonOtherSettingsFlow {
  readonly assertions:Array<Record<string,unknown>>=[];readonly observations:Record<string,unknown>={};stateRestored=false;assertionRoute:string|undefined;
  constructor(private readonly page:Page,private readonly settings:AddonOtherSettingsPage,private readonly prepare:()=>Promise<unknown>,private readonly restore:()=>Promise<void>){}
  async execute(caseId:string){
    const item=contract.cases.find(c=>c.caseId===caseId);if(!item)throw Error('UNKNOWN_ADDON_SETTINGS_CASE');
    try{
      this.observations.preconditions=await test.step('前置条件：进入当前品牌加料商品创建页',async()=>{const value=await this.prepare();await test.info().attach('正式前置条件实际观察',{body:JSON.stringify(value),contentType:'application/json'});return value;});
      this.assertionRoute=new URL(this.page.url()).pathname;if(this.assertionRoute!=='/pp/brand/create/side')throw Error('ADDON_SETTINGS_ASSERTION_ROUTE_MISMATCH');
      const actualValue=await test.step(`业务操作：${item.steps[0]}`,async()=>{const receipt=startExecutableOperation({executionId:test.info().testId,operationKey:caseId+':action-1',title:item.steps[0],method:'ui'});try{const value=await this.settings.readAvailableControls();finishExecutableOperation(receipt,'passed');return value;}catch(error){finishExecutableOperation(receipt,'failed');throw error;}});
      const expectedValue={controls:contract.metadata.expectedControls,uploadInput:contract.metadata.expectedUploadInput};
      await test.step(`断言：${item.expectedResults[0]}`,async()=>{const matched=JSON.stringify(actualValue)===JSON.stringify(expectedValue),receipt={claimId:item.assertionIds[0],status:matched?'verified':'observed-mismatch',actualValue,expectedValue,actualStatus:'observed',observationChannel:'ui',authority:'user-visible',comparison:matched?'matched':'mismatched'};this.assertions.push(receipt);await test.info().attach('五项设置期望与实际',{body:JSON.stringify(receipt),contentType:'application/json'});if(!matched){await test.info().attach('断言失败当前页面',{body:await this.page.screenshot(),contentType:'image/png'});throw Error('加料商品五项设置正式断言不匹配');}});
    }finally{await test.step('清理：离开未提交加料表单并确认商品列表',async()=>{await this.restore();this.stateRestored=true;});}
  }
}
