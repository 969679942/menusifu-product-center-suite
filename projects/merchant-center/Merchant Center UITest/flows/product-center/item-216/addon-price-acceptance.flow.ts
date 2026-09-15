import {test,type Page,type Request,type Response} from '@playwright/test';
import type {AddonPriceAcceptancePage} from '../../../pages/product-management/item/addon-price-acceptance.page';
import type {AddonPricePersistence} from '../../../api/product-center/addon-price-persistence';
import {ItemListPage} from '../../../pages/product-management/item/item-list.page';
import {ProductCenterSidebarNavigationPage} from '../../../pages/product-center/product-center-sidebar-navigation.page';
import {startExecutableOperation,finishExecutableOperation} from '../../../utils/executable-operation-receipt';
import {waitUntil} from '../../../utils/wait';
import {matchesBusinessFeedbackMessage} from '../../../utils/business-feedback-contract';
import submitFeedback from '../../../contracts/product-center/feedback/item-create-submitted.json';
import contract from '../../../contracts/product-center/test-cases/addon-price-acceptance.json';
import {addonZeroPricePresentations,matchesAddonZeroPrice} from '../../../test-data/product-center/addon-price';
type Persistence=Pick<AddonPricePersistence,'prepare'|'records'|'registerResponse'|'reconcile'|'cleanup'|'registeredServerIds'|'readDetail'>;
export class AddonPriceAcceptanceFlow {
 readonly assertions:Array<Record<string,unknown>>=[];readonly observations:Record<string,unknown>={};
 stateRestored=false;assertionRoute='/pp/brand/create/side';businessName='';saveActions=0;
 cleanupEvidence:Awaited<ReturnType<AddonPricePersistence['cleanup']>>|undefined;uiResidue:number|undefined;
 private pendingWrites=()=>0;private flushRegistrations=async()=>{};private detachWrites=()=>{};
 constructor(private readonly page:Page,private readonly form:AddonPriceAcceptancePage,private readonly persistence:Persistence,private readonly list:ItemListPage,private readonly navigation:ProductCenterSidebarNavigationPage){}
 private async action<T>(id:string,index:number,title:string,run:()=>Promise<T>){return test.step(`业务操作：${title}`,async()=>{const r=startExecutableOperation({executionId:test.info().testId,operationKey:`${id}:action-${index}`,title,method:'ui'});try{const value=await run();finishExecutableOperation(r,'passed');return value;}catch(error){finishExecutableOperation(r,'failed');throw error;}});}
 private async claim(id:string,index:number,title:string,actualValue:unknown,expectedValue:unknown,matched:boolean){await test.step(`断言：${title}`,async()=>{const receipt={claimId:`${id}:expectation-${index}`,status:matched?'verified':'observed-mismatch',actualValue,expectedValue,actualStatus:'observed',observationChannel:'ui',authority:'user-visible',comparison:matched?'matched':'mismatched'};this.assertions.push(receipt);await test.info().attach('价格业务期望与实际',{body:JSON.stringify(receipt),contentType:'application/json'});if(!matched){await test.info().attach('价格断言失败当前页面',{body:await this.page.screenshot(),contentType:'image/png'});throw Error('加料价格正式断言不匹配：'+id+':'+index);}});}
 private async save(){
  if(this.saveActions!==0)throw Error('ADDON_PRICE_SAVE_REPLAY_FORBIDDEN');
  const writes=new Map<Request,{response?:Response;failed?:boolean}>(),registrations:Promise<void>[]=[];let registrationFailed=false;
  const requestListener=(request:Request)=>{if(request.method()==='POST'&&new URL(request.url()).pathname.includes('/ops-brand/brand-items/')&&!new URL(request.url()).pathname.endsWith('/pageQuery'))writes.set(request,{});};
  const responseListener=(response:Response)=>{const write=writes.get(response.request());if(!write)return;write.response=response;registrations.push((async()=>{const body=await response.json();if(response.ok())this.persistence.registerResponse(body);})().catch(()=>{registrationFailed=true;}));};
  const failedListener=(request:Request)=>{const write=writes.get(request);if(write)write.failed=true;};
  this.page.on('request',requestListener);this.page.on('response',responseListener);this.page.on('requestfailed',failedListener);
  this.pendingWrites=()=>[...writes.values()].filter(w=>!w.response&&!w.failed).length;this.flushRegistrations=async()=>{await Promise.all(registrations);};this.detachWrites=()=>{this.page.off('request',requestListener);this.page.off('response',responseListener);this.page.off('requestfailed',failedListener);};
  const successPromise=this.form.readSaveSuccessText(8000).catch(()=>'');
  try{
   this.saveActions++;await this.form.clickSave();
   await waitUntil(async()=>({writes:writes.size,route:new URL(this.page.url()).pathname,invalid:new URL(this.page.url()).pathname==='/pp/brand/create/side'?(await this.form.readPriceFieldFeedback()).fieldInvalid:false}),s=>s.writes>0||s.route==='/pp/brand/list'||s.invalid,{timeout:8000,interval:150,message:'加料价格保存未形成可核验的字段、请求或导航终态'});
   await waitUntil(()=>[...writes.values()].every(w=>w.response||w.failed),Boolean,{timeout:8000,interval:150,message:'价格保存请求尚未完成，不能开始清理或重放'});
   await Promise.all(registrations);const records=await this.persistence.reconcile();
   const network={attempted:writes.size,responses:[...writes.values()].filter(w=>w.response).length,failed:[...writes.values()].filter(w=>w.failed).length,pending:[...writes.values()].filter(w=>!w.response&&!w.failed).length,registrationFailed};
   if(network.failed||network.pending||registrationFailed)throw Error('ADDON_PRICE_WRITE_EVIDENCE_INCOMPLETE');
   return {successText:await successPromise,route:new URL(this.page.url()).pathname,records,network,registeredServerIds:[...this.persistence.registeredServerIds]};
  }finally{await this.flushRegistrations();this.observations.writeSettlement={attempted:writes.size,pending:this.pendingWrites(),registrationFailed};}
 }
 async execute(caseId:string,name:string){
  const item=contract.cases.find(c=>c.caseId===caseId);if(!item)throw Error('UNKNOWN_ADDON_PRICE_CASE');this.businessName=name;
  const act=<T>(i:number,run:()=>Promise<T>)=>this.action(caseId,i,item.steps[i-1],run);
  try{
   await test.step('前置条件：核验唯一名称不存在并打开加料创建页',async()=>{const uniqueName=await this.persistence.prepare(name,caseId);await this.navigation.openFromSidebar('/pp/brand/list');await this.form.open();this.observations.preconditions={uniqueName,route:new URL(this.page.url()).pathname};await test.info().attach('正式前置条件实际观察',{body:JSON.stringify(this.observations.preconditions),contentType:'application/json'});});
   let saved:Awaited<ReturnType<AddonPriceAcceptanceFlow['save']>>;
   if(caseId==='TC-ITEM-ADD-008'){
    await act(1,()=>this.navigation.openFromSidebar('/pp/brand/list'));const types=await act(2,()=>this.list.enterCreateTypePage());await act(3,()=>types.enterSideCreate());
    await act(4,async()=>{await this.form.fillItemName(name);await this.form.clearPrice();});saved=await act(5,()=>this.save());this.observations.save=saved;
    await this.claim(caseId,1,item.expectedResults[0],{route:saved.route,successText:saved.successText,created:saved.records.length},{route:'/pp/brand/create/side',successText:'',created:0},saved.route==='/pp/brand/create/side'&&saved.successText===''&&saved.records.length===0);
    const field=await test.step('读取核验：标准价字段自身必填错误',()=>this.form.readPriceFieldFeedback());
    await this.claim(caseId,2,item.expectedResults[1],field,{value:'',fieldInvalid:true},field.value===''&&field.fieldInvalid);
    await test.step('读取核验：按正式名称查询无本次新增记录',async()=>{await this.list.open();await this.list.fillSearchAndWait(name);const uiCount=await this.list.readVisibleIdentityCount(name),apiCount=(await this.persistence.records()).length;await this.claim(caseId,3,item.expectedResults[2],{uiCount,apiCount},{uiCount:0,apiCount:0},uiCount===0&&apiCount===0);});
   }else if(caseId==='TC-ITEM-ADD-011'){
    await act(1,()=>this.form.open());
    await act(2,()=>this.form.fillItemName(name));
    await act(3,()=>this.form.fillObservedPrice('10.00'));
    await act(4,()=>this.form.fillPackagingFee('1.00'));
    await act(5,()=>this.form.fillCost('3.50'));
    saved=await act(6,()=>this.save());this.observations.save=saved;
    const createdId=saved.records[0]?.id;if(!createdId)throw Error('ADD011_CREATED_ID_MISSING');
    const detail=await test.step('读取核验：详情API包装费与成本回读',()=>this.persistence.readDetail(createdId));
    const sku=(detail as any)?.data?.skuList?.[0];const actual={successText:saved.successText,packagingFee:String(sku?.packageFee??''),cost:String(sku?.costPrice??'')};
    await this.claim(caseId,1,item.expectedResults[0],actual.successText,['提交成功','Successfully Submitted'],matchesBusinessFeedbackMessage(actual.successText,submitFeedback));
    await this.claim(caseId,2,item.expectedResults[1],actual,{packagingFee:'1.00',cost:'3.50',comparison:'numeric-equivalence-preserving-raw'},Number(actual.packagingFee)===1&&Number(actual.cost)===3.5);
    this.observations.detailReadback=actual;
   }else{
    if(caseId==='TC-ITEM-ADD-009'){
     await act(1,()=>this.form.fillItemName(name));this.observations.input=await act(2,()=>this.form.fillObservedPrice('0.00'));saved=await act(3,()=>this.save());
    }else{
     await act(1,async()=>{await this.form.open();await this.form.fillItemName(name);});saved=await act(2,async()=>{this.observations.input=await this.form.typeObservedNegative();return this.save();});
    }
    this.observations.save=saved;
    const listed=await act(caseId==='TC-ITEM-ADD-009'?4:3,async()=>{await this.list.open();await this.list.fillSearchAndWait(name);await this.list.expectUniqueItemVisible(name);return {count:await this.list.readVisibleIdentityCount(name),price:await this.list.readItemPriceText(name)};});
    if(caseId==='TC-ITEM-ADD-009'){
     await this.claim(caseId,1,item.expectedResults[0],saved.successText,submitFeedback.allowedMessages,matchesBusinessFeedbackMessage(saved.successText,submitFeedback));
     await this.claim(caseId,2,item.expectedResults[1],listed,{count:1,amount:'0.00',allowedPricePresentations:addonZeroPricePresentations},listed.count===1&&matchesAddonZeroPrice(listed.price));
    }else{const actual={negativeEntered:this.observations.input,created:saved.records.length,list:listed};await this.claim(caseId,1,item.expectedResults[0],actual,{negativeEntered:'-1.00',created:1,list:{count:1,amount:'0.00',allowedPricePresentations:addonZeroPricePresentations}},this.observations.input==='-1.00'&&saved.records.length===1&&listed.count===1&&matchesAddonZeroPrice(listed.price));}
   }
  }finally{
   await test.step('清理：按登记ID回收并核验API/UI零残留',async()=>{
    await this.flushRegistrations();const unsettled=this.pendingWrites()>0;
    let cleanupError:unknown;try{this.cleanupEvidence=await this.persistence.cleanup();}catch(error){cleanupError=error;}
    try{await this.list.open();await this.list.fillSearchAndWait(name);this.uiResidue=await this.list.readVisibleIdentityCount(name);await this.list.open();await this.list.expectLoaded();this.stateRestored=!unsettled&&this.cleanupEvidence?.exactNameCount===0&&this.uiResidue===0;}
    finally{this.detachWrites();if(cleanupError)throw cleanupError;}
    if(!this.stateRestored)throw Error('ADDON_PRICE_API_UI_RESTORATION_INCOMPLETE');
   });
  }
 }
}
