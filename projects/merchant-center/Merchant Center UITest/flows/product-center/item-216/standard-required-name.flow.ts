import {expect,test,type Page,type Request,type Response} from '@playwright/test';
import type {ItemListPage} from '../../../pages/product-management/item/item-list.page';
import type {StandardListAcceptancePage} from '../../../pages/product-management/item/standard-list-acceptance.page';
import type {StandardRequiredNamePage} from '../../../pages/product-management/item/standard-required-name.page';
import {classifyRequiredNameWrite,type RequiredNamePersistence,type RequiredNameWrite} from '../../../api/product-center/required-name-persistence';
import {step} from '../../../utils/step';
import {waitUntil} from '../../../utils/wait';
import {startExecutableOperation,finishExecutableOperation} from '../../../utils/executable-operation-receipt';
import {publishImmutableArtifact} from '../../../../Test Automation Platform/src/utils/immutable-artifact';

const caseId='TC-ITEM-STD-005',createRoute='/pp/brand/create/standard';
type Write={result?:RequiredNameWrite;transportFailed?:boolean;processing?:Promise<void>;error?:unknown};
export class StandardRequiredNameFlow {
  readonly assertions:Array<Record<string,unknown>>=[];
  readonly observations:Record<string,unknown>={};
  readonly createdIds:number[]=[];
  assertionRoute=createRoute;
  stateRestored=false;
  apiZeroResidue=false;
  uiZeroResidue=false;
  constructor(private readonly page:Page,private readonly list:ItemListPage,private readonly listEvidence:StandardListAcceptancePage,private readonly validation:StandardRequiredNamePage,private readonly persistence:RequiredNamePersistence,private readonly enterListFromSidebar:()=>Promise<unknown>,private readonly evidenceRoot=process.cwd()){}
  private async action<T>(index:number,title:string,run:()=>Promise<T>):Promise<T>{return test.step(`业务操作：${title}`,async()=>{const receipt=startExecutableOperation({executionId:test.info().testId,operationKey:`${caseId}:action-${index}`,title,method:'ui'});try{const result=await run();finishExecutableOperation(receipt,'passed');return result;}catch(error){finishExecutableOperation(receipt,'failed');throw error;}});}
  private async claim(index:number,title:string,actualValue:unknown,expectedValue:unknown){return test.step(`断言：${title}`,async()=>{const matched=JSON.stringify(actualValue)===JSON.stringify(expectedValue);const receipt={claimId:`${caseId}:expectation-${index}`,status:matched?'verified':'observed-mismatch',actualValue,expectedValue,actualStatus:'observed',observationChannel:'ui',authority:'user-visible',comparison:matched?'matched':'mismatched'};this.assertions.push(receipt);await test.info().attach(title,{body:JSON.stringify(receipt),contentType:'application/json'});});}
  @step('验证标准商品名称缺失时阻止创建并核验列表无新增')
  async execute(selectedCaseId:string){
    if(selectedCaseId!==caseId)throw Error('UNREGISTERED_REQUIRED_NAME_CASE');
    let before:number[]|undefined,beforeUi:number|undefined;
    const writes=new Map<Request,Write>();
    const onRequest=(request:Request)=>{if(request.method()==='POST'&&new URL(request.url()).pathname.endsWith('/ops-brand/brand-items/standard'))writes.set(request,{});};
    const onFailed=(request:Request)=>{const write=writes.get(request);if(write)write.transportFailed=true;};
    const onResponse=(response:Response)=>{const write=writes.get(response.request());if(!write)return;write.processing=(async()=>{let body:unknown;try{body=await response.json();}catch{write.result={status:'incomplete'};return;}write.result=classifyRequiredNameWrite(response.status(),body);if(write.result.serverId){const id=write.result.serverId;this.createdIds.push(id);const run=(process.env.PC_ITEM_RUN_ID??'unassigned').replace(/[^a-zA-Z0-9_-]/g,'_');publishImmutableArtifact({outputRoot:this.evidenceRoot,relativePath:`output/checkpoints/item/${run}/unexpected-${caseId}-${id}.json`,content:JSON.stringify({caseId,serverId:id,originalName:'',requestPath:'/ops-brand/brand-items/standard',httpStatus:response.status(),observedAt:new Date().toISOString(),cleanupStatus:'pending'}),reason:'record-correlated-unexpected-creation-before-assertion'});}})().catch(error=>{write.error=error;write.result={status:'incomplete'};});};
    try{
      await this.action(1,'通过侧边栏进入商品列表',()=>this.enterListFromSidebar());
      before=await this.persistence.snapshotIds();beforeUi=(await this.listEvidence.readPagination()).total;
      if(!Number.isSafeInteger(beforeUi)||beforeUi!==before.length)throw Error('REQUIRED_NAME_BASELINE_UI_API_SCOPE_MISMATCH');
      const types=await this.action(2,'点击新增商品进入商品类型选择页',()=>this.list.enterCreateTypePage());
      const form=await this.action(3,'选择标准商品并进入创建页',()=>types.enterStandardCreate());
      await this.action(4,'保持商品名称为空',async()=>{await form.fillItemName('');expect(await form.readItemName()).toBe('');});
      await this.action(5,'选择单规格并输入标准价10.00',async()=>{await form.selectSingleSpec();await form.fillStandardPrice('10.00');expect(await form.isSingleSpecSelected()).toBe(true);expect(Number(await form.readStandardPriceValue())).toBe(10);});
      this.page.on('request',onRequest);this.page.on('response',onResponse);this.page.on('requestfailed',onFailed);
      const timeline=await this.action(6,'点击保存并观察名称校验和创建请求终态',async()=>{await form.clickSave();const observed=await this.validation.observeValidationWindow();await waitUntil(()=>[...writes.values()].every(w=>w.result||w.transportFailed),Boolean,{timeout:8000,interval:250,message:'创建请求尚未达到可核验终态'});await Promise.all([...writes.values()].map(w=>w.processing));return observed;});
      this.observations.timeline=timeline;this.observations.network=[...writes.values()].map(w=>({result:w.result,transportFailed:w.transportFailed===true}));
      await test.info().attach('保存观察时间线及请求终态',{body:JSON.stringify(this.observations),contentType:'application/json'});
      if([...writes.values()].some(w=>w.transportFailed||!w.result||w.result.status==='incomplete'))throw Error('REQUIRED_NAME_WRITE_EVIDENCE_INCOMPLETE');
      const stable=timeline.filter(sample=>sample.elapsedMs>=4000);
      if(stable.length<3)throw Error('REQUIRED_NAME_UI_STABILITY_EVIDENCE_INCOMPLETE');
      const last=timeline[timeline.length-1].state;
      const uiBlocked={route:last.route,successObserved:timeline.some(sample=>sample.state.successVisible)};
      const feedbackStates=stable.map(sample=>sample.state.feedback?.value===''&&(sample.state.feedback.invalid||sample.state.feedback.errors.length>0));
      if(new Set(feedbackStates).size!==1||new Set(stable.map(sample=>sample.state.route)).size!==1)throw Error('REQUIRED_NAME_UI_NOT_SETTLED');
      const feedbackPresent=feedbackStates.every(Boolean);
      await this.claim(1,'保存后仍停留创建页且未出现成功提示',uiBlocked,{route:createRoute,successObserved:false});
      await this.claim(2,'空名称字段出现稳定必填校验反馈',feedbackPresent,true);
      await this.listEvidence.open();this.stateRestored=true;
      const after=await this.persistence.snapshotIds(),afterUi=(await this.listEvidence.readPagination()).total;
      const changedIds=after.filter(id=>!before!.includes(id));
      this.observations.list={beforeApiTotal:before.length,afterApiTotal:after.length,beforeUiTotal:beforeUi,afterUiTotal:afterUi,newIds:changedIds,correlatedCreatedIds:this.createdIds};
      if(this.createdIds.length===0&&(JSON.stringify(before)!==JSON.stringify(after)||beforeUi!==afterUi))throw Error('REQUIRED_NAME_UNATTRIBUTED_LIST_CHANGE');
      await this.claim(3,'返回列表后无本次操作产生的新商品',{correlatedCreatedIds:this.createdIds,newIds:changedIds,uiTotal:afterUi},{correlatedCreatedIds:[],newIds:[],uiTotal:beforeUi});
      expect(this.assertions.every(a=>a.status==='verified'),'正式必填用例存在不匹配断言，见逐项收据').toBe(true);
    }finally{
      try{
        // Settle already-issued writes before deciding which correlated IDs need cleanup.
        let unsettled=false;
        try{await waitUntil(()=>[...writes.values()].every(w=>w.result||w.transportFailed),Boolean,{timeout:8000,interval:250,message:'清理前创建请求仍未终结'});}catch{unsettled=true;}
        await Promise.all([...writes.values()].map(w=>w.processing));
        if(unsettled)this.observations.pendingCreation=true;
        await test.step('清理：核对本次创建ID并恢复商品列表',async()=>{
          if(this.createdIds.length&&!before)throw Error('REQUIRED_NAME_CLEANUP_BASELINE_MISSING');
          for(const id of [...new Set(this.createdIds)])await this.persistence.removeCorrelatedCreation(id,before!);
          await this.listEvidence.open();this.stateRestored=true;
          if(before){const after=await this.persistence.snapshotIds();const total=(await this.listEvidence.readPagination()).total;const uncertain=[...writes.values()].some(w=>!w.result||w.transportFailed||w.result.status==='incomplete');this.apiZeroResidue=!uncertain&&this.createdIds.every(id=>!after.includes(id));this.uiZeroResidue=this.apiZeroResidue&&Number.isSafeInteger(total)&&total===beforeUi&&JSON.stringify(after)===JSON.stringify(before);this.observations.cleanup={apiTotal:after.length,uiTotal:total,apiZeroResidue:this.apiZeroResidue,uiZeroResidue:this.uiZeroResidue};}
          const run=(process.env.PC_ITEM_RUN_ID??'unassigned').replace(/[^a-zA-Z0-9_-]/g,'_');
          for(const id of [...new Set(this.createdIds)])publishImmutableArtifact({outputRoot:this.evidenceRoot,relativePath:`output/checkpoints/item/${run}/cleanup-${caseId}-${id}.json`,content:JSON.stringify({caseId,serverId:id,observedAt:new Date().toISOString(),cleanupStatus:this.apiZeroResidue&&this.uiZeroResidue?'verified-zero':'verification-incomplete',evidence:this.observations.cleanup}),reason:'preserve-correlated-creation-cleanup-verdict'});
        });
      }finally{this.page.off('request',onRequest);this.page.off('response',onResponse);this.page.off('requestfailed',onFailed);}
    }
  }
}
