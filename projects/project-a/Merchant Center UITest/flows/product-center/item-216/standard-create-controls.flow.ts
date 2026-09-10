import {test,type Page} from '@playwright/test';
import type {StandardCreateControlsPage} from '../../../pages/product-management/item/standard-create-controls.page';
import {startExecutableOperation,finishExecutableOperation} from '../../../utils/executable-operation-receipt';
import contract from '../../../contracts/product-center/test-cases/standard-create-controls-acceptance.json';
export class StandardCreateControlsFlow {
  readonly assertions:Array<Record<string,unknown>>=[];
  readonly observations:Record<string,unknown>={};
  stateRestored=false;assertionRoute:string|undefined;
  constructor(private readonly page:Page,private readonly controls:StandardCreateControlsPage,private readonly prepare:(caseId:string)=>Promise<unknown>,private readonly restore:()=>Promise<void>){}
  private async action<T>(caseId:string,index:number,title:string,run:()=>Promise<T>):Promise<T>{return test.step(`业务操作：${title}`,async()=>{const receipt=startExecutableOperation({executionId:test.info().testId,operationKey:`${caseId}:action-${index}`,title,method:'ui'});try{const value=await run();finishExecutableOperation(receipt,'passed');return value;}catch(error){finishExecutableOperation(receipt,'failed');throw error;}});}
  async execute(caseId:string){
    const item=contract.cases.find(c=>c.caseId===caseId);if(!item)throw Error('UNREGISTERED_CREATE_CONTROLS_CASE');
    try{
      this.observations.preconditions=await test.step('前置条件：核验正式条件并打开标准商品创建页',async()=>{const value=await this.prepare(caseId);await test.info().attach('正式前置条件实际观察',{body:JSON.stringify(value),contentType:'application/json'});return value;});
      this.assertionRoute=new URL(this.page.url()).pathname;if(this.assertionRoute!=='/pp/brand/create/standard')throw Error('CREATE_CONTROLS_ROUTE_MISMATCH');
      const action=<T>(index:number,run:()=>Promise<T>)=>this.action(caseId,index,item.steps[index-1],run);
      let actualValue:unknown,expectedValue:unknown;
      if(caseId==='TC-ITEM-STD-045'){
        await action(1,()=>this.controls.fillDescription());await action(2,()=>this.controls.appendDescriptionCharacter());actualValue=await action(3,()=>this.controls.readDescription());expectedValue=contract.metadata.expectedDescription;
      }else{
        await action(1,()=>this.controls.selectMulti());
        if(caseId==='TC-ITEM-STD-048'){actualValue=await action(2,()=>this.controls.openSpecificationCreate());expectedValue=contract.metadata.expectedSpec;}
        else{actualValue=await action(2,()=>this.controls.readWeight());expectedValue=contract.metadata.expectedWeight;}
      }
      await test.step(`断言：${item.expectedResults[0]}`,async()=>{
        const matched=JSON.stringify(actualValue)===JSON.stringify(expectedValue),receipt={claimId:item.assertionIds[0],status:matched?'verified':'observed-mismatch',actualValue,expectedValue,actualStatus:'observed',observationChannel:'ui',authority:'user-visible',comparison:matched?'matched':'mismatched'};
        this.assertions.push(receipt);await test.info().attach('期望与当前页面观察',{body:JSON.stringify(receipt),contentType:'application/json'});
        if(!matched){await test.info().attach('断言失败当前页面',{body:await this.controls.failureScreenshot(),contentType:'image/png'});throw Error('创建页正式断言不匹配：'+caseId);}
      });
    }finally{await test.step('清理：关闭本次规格组窗口并返回商品列表',async()=>{try{await this.controls.closeCreatedPages();}finally{await this.restore();}this.stateRestored=true;});}
  }
}
