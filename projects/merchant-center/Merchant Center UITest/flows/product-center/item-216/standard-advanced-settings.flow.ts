import {test,type Page} from '@playwright/test';
import type {StandardAdvancedSettingsPage,AdvancedSettingsState} from '../../../pages/product-management/item/standard-advanced-settings.page';
import {step} from '../../../utils/step';
import {startExecutableOperation,finishExecutableOperation} from '../../../utils/executable-operation-receipt';
import contract from '../../../contracts/product-center/test-cases/standard-advanced-settings-acceptance.json';

export class StandardAdvancedSettingsFlow {
  readonly assertions:Array<Record<string,unknown>>=[];
  readonly observations:Record<string,unknown>={};
  stateRestored=false;
  assertionRoute:string|undefined;
  constructor(private readonly page:Page,private readonly advanced:StandardAdvancedSettingsPage,private readonly prepare:(caseId:string)=>Promise<unknown>,private readonly restore:()=>Promise<void>){}
  private async action<T>(caseId:string,index:number,title:string,run:()=>Promise<T>):Promise<T>{return test.step(`业务操作：${title}`,async()=>{const receipt=startExecutableOperation({executionId:test.info().testId,operationKey:`${caseId}:action-${index}`,title,method:'ui'});try{const value=await run();finishExecutableOperation(receipt,'passed');return value;}catch(error){finishExecutableOperation(receipt,'failed');throw error;}});}
  private async claim(caseId:string,index:number,title:string,actualValue:unknown,expectedValue:unknown){
    const mismatch=Error(`高级设置断言不匹配：${caseId}:expectation-${index}`);
    try{await test.step(`断言：${title}`,async()=>{const matched=JSON.stringify(actualValue)===JSON.stringify(expectedValue),receipt={claimId:`${caseId}:expectation-${index}`,status:matched?'verified':'observed-mismatch',actualValue,expectedValue,actualStatus:'observed',observationChannel:'ui',authority:'user-visible',comparison:matched?'matched':'mismatched'};this.assertions.push(receipt);await test.info().attach('期望与当前页面观察',{body:JSON.stringify(receipt),contentType:'application/json'});if(!matched){await test.info().attach('断言失败时的当前页面',{body:await this.page.screenshot(),contentType:'image/png'});throw mismatch;}});}catch(error){if(error!==mismatch)throw error;}
  }
  @step('执行标准商品高级设置默认与展开状态正式验收')
  async execute(caseId:string){
    if(!['TC-ITEM-STD-041','TC-ITEM-STD-042'].includes(caseId))throw Error('UNREGISTERED_ADVANCED_SETTINGS_CASE');
    try{
      this.observations.preconditions=await test.step('前置条件：核验正式条件并打开标准商品创建页',async()=>{const observed=await this.prepare(caseId);await test.info().attach('正式前置条件实际观察',{body:JSON.stringify(observed),contentType:'application/json'});return observed;});
      this.assertionRoute=new URL(this.page.url()).pathname;
      if(this.assertionRoute!=='/pp/brand/create/standard')throw Error('ADVANCED_ASSERTION_ROUTE_MISMATCH');
      let initial:AdvancedSettingsState|undefined,current:AdvancedSettingsState;
      if(caseId==='TC-ITEM-STD-041'){
        initial=await this.action(caseId,1,'查看基础信息下方的默认高级设置状态',()=>this.advanced.readState());this.observations.initial=initial;
        await this.claim(caseId,1,'高级设置默认收起',initial.state,'collapsed');
        if(initial.state!=='collapsed')throw Error('高级设置默认展开，与正式预期不符');
        current=await test.step('读取核验：保留初始观察后展开确认八个字段身份',async()=>{await this.advanced.expand();return this.advanced.readExpandedIdentities();});
      }else{
        await this.action(caseId,1,'点击高级设置展开入口',()=>this.advanced.expand());
        current=await this.action(caseId,2,'查看展开后的八个字段',()=>this.advanced.readExpandedIdentities());
        await this.claim(caseId,1,'高级设置成功展开',current.state,'expanded');
      }
      this.observations.expandedIdentityConfirmation=current;
      const fieldKeys=contract.metadata.expectedFieldKeys;
      if(JSON.stringify(Object.keys(current.fields).sort())!==JSON.stringify([...fieldKeys].sort())||Object.values(current.fields).some(field=>field.count!==1||!field.visible))throw Error('ADVANCED_CURRENT_FIELD_IDENTITIES_INCOMPLETE');
      if(initial&&JSON.stringify(Object.keys(initial.fields).sort())!==JSON.stringify([...fieldKeys].sort()))throw Error('ADVANCED_INITIAL_FIELD_SURFACES_INCOMPLETE');
      const actual=Object.fromEntries(fieldKeys.map(key=>[key,{visible:(initial??current).fields[key].visible,currentIdentityCount:current.fields[key].count}]));
      const expected=Object.fromEntries(fieldKeys.map(key=>[key,{visible:caseId==='TC-ITEM-STD-042',currentIdentityCount:1}]));
      await this.claim(caseId,2,caseId==='TC-ITEM-STD-041'?'默认不展示八个高级字段且当前身份已确认':'展开后展示八个高级字段且身份唯一',actual,expected);
      if(this.assertions.some(a=>a.status!=='verified'))throw Error('高级设置正式断言存在不匹配，见逐项观察');
    }finally{await test.step('清理：离开未提交表单并确认返回商品列表',async()=>{await this.restore();this.stateRestored=true;});}
  }
}
