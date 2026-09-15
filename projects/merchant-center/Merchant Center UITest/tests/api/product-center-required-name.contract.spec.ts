import {test,expect,type Page,type Request,type Response} from '@playwright/test';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {StandardRequiredNameFlow} from '../../flows/product-center/item-216/standard-required-name.flow';
import {classifyRequiredNameWrite,readRequiredNameListPage,type RequiredNamePersistence} from '../../api/product-center/required-name-persistence';
import type {ItemListPage} from '../../pages/product-management/item/item-list.page';
import type {StandardListAcceptancePage} from '../../pages/product-management/item/standard-list-acceptance.page';
import type {StandardRequiredNamePage} from '../../pages/product-management/item/standard-required-name.page';
import {consumeExecutableOperationReceipts} from '../../utils/executable-operation-receipt';
import {fingerprintProductCenterItemImplementation} from '../../adapters/product-center/product-center-item-implementation';
import {partitionProductCenterItemSpecs,requiredNameSpecPath} from '../../adapters/product-center/product-center-item-required-name-specs';

test('名称必填写请求正确区分业务拒绝、创建和证据不完整',()=>{
  expect(classifyRequiredNameWrite(200,{success:false})).toEqual({status:'rejected'});
  expect(classifyRequiredNameWrite(422,{success:false})).toEqual({status:'rejected'});
  expect(classifyRequiredNameWrite(200,{success:true,data:{id:88}})).toEqual({status:'created',serverId:88});
  for(const status of [401,403,408,429,500,503])expect(classifyRequiredNameWrite(status,{success:false})).toEqual({status:'incomplete'});
  for(const body of [null,{}, {success:true,data:null},{success:true,data:{id:0}},{success:true,data:{id:''}}])expect(classifyRequiredNameWrite(200,body)).toEqual({status:'incomplete'});
});
test('名称独立实现保留九条合格用例指纹',()=>{const before=JSON.parse(fs.readFileSync('deliverables/system-test-platform/required-name-prior-fingerprints.json','utf8'));expect(Object.keys(before)).toHaveLength(9);for(const[id,hash]of Object.entries(before))expect(fingerprintProductCenterItemImplementation(process.cwd(),id)).toBe(hash);});
test('当前接口只用itemBasic.id识别商品，不误用根ID或SKU ID',()=>{expect(readRequiredNameListPage({success:true,data:{totalCount:1,list:[{id:999,itemBasic:{id:88},skuList:[{id:123,itemId:88}]}]}})).toEqual({ids:[88],total:1});for(const list of [[{id:88,skuList:[{id:123}]}],[{itemBasic:{id:88}},{itemBasic:{id:88}}]])expect(()=>readRequiredNameListPage({data:{totalCount:list.length,list}})).toThrow();});
test('名称必填与已有执行路由完整分区且不混入旧标准商品整组',()=>{const ids=['TC-ITEM-STD-005','TC-ITEM-STD-019','TC-ITEM-STD-030','TC-ITEM-STD-063','TC-ITEM-ADD-005'];const routes=partitionProductCenterItemSpecs(ids);expect(routes).toHaveLength(5);expect(routes.flatMap(r=>r.caseIds).sort()).toEqual([...ids].sort());expect(routes.find(r=>r.specPath===requiredNameSpecPath)?.caseIds).toEqual(['TC-ITEM-STD-005']);expect(()=>partitionProductCenterItemSpecs(['TC-ITEM-STD-005','TC-ITEM-STD-005'])).toThrow('ITEM_SPEC_DUPLICATE_SELECTION');});
test('正式名称必填只登记一个当前用例入口且真实收据仍待执行',()=>{const bindings=JSON.parse(fs.readFileSync('contracts/product-center/test-plan-additional-automation-bindings.json','utf8')).bindings.filter((b:{caseId:string})=>b.caseId==='TC-ITEM-STD-005');expect(bindings).toHaveLength(1);expect(bindings[0].scriptPath).toBe(requiredNameSpecPath);expect(bindings[0].runtimeStatus).toBe('not-run');const source=JSON.parse(fs.readFileSync('contracts/product-center/test-cases/standard-required-name-acceptance.json','utf8')).cases[0];expect(source.steps).toHaveLength(6);expect(source.assertionIds).toHaveLength(3);});

function scenario(options:{writeStatus?:number;writeBody?:unknown;unexpectedListId?:number;feedbackInvalid?:boolean;price?:string}={}){
  const events=new EventEmitter(),actions:string[]=[];let restored=0;
  const form={fillItemName:async(value:string)=>{actions.push('name:'+value);},readItemName:async()=>'',selectSingleSpec:async()=>{actions.push('single');},fillStandardPrice:async(value:string)=>{actions.push('price:'+value);},isSingleSpecSelected:async()=>true,readStandardPriceValue:async()=>options.price??'10.00',clickSave:async()=>{actions.push('save');if(options.writeStatus){const request={method:()=> 'POST',url:()=> 'https://synthetic.invalid/ops-brand/brand-items/standard'} as Request;events.emit('request',request);events.emit('response',{request:()=>request,status:()=>options.writeStatus,json:async()=>options.writeBody} as Response);}}};
  const list={enterCreateTypePage:async()=>({enterStandardCreate:async()=>form})} as unknown as ItemListPage;
  const listEvidence={enterFromSidebar:async()=>{actions.push('sidebar');},open:async()=>{restored++;},readPagination:async()=>({total:options.unexpectedListId&&restored?2:1})} as unknown as StandardListAcceptancePage;
  const validation={observeValidationWindow:async()=>[4000,4500,5000].map(elapsedMs=>({elapsedMs,state:{route:'/pp/brand/create/standard',successVisible:false,feedback:{value:'',invalid:options.feedbackInvalid??true,errors:[]}}}))} as unknown as StandardRequiredNamePage;
  const persistence={snapshotIds:async()=>options.unexpectedListId&&restored?[1,options.unexpectedListId]:[1],removeCorrelatedCreation:async()=>{throw Error('UNEXPECTED_DELETION');}} as unknown as RequiredNamePersistence;
  return {flow:new StandardRequiredNameFlow(events as unknown as Page,list,listEvidence,validation,persistence,()=>listEvidence.enterFromSidebar()),actions,getRestored:()=>restored};
}
test('服务端明确拒绝的创建请求仍可满足名称必填正式预期',async({},info)=>{const setup=scenario({writeStatus:200,writeBody:{success:false}});await setup.flow.execute('TC-ITEM-STD-005');expect(setup.actions).toEqual(['sidebar','name:','single','price:10.00','save']);expect(setup.flow.assertions).toHaveLength(3);expect(setup.flow.assertions.every(a=>a.status==='verified')).toBe(true);expect(setup.flow.apiZeroResidue&&setup.flow.uiZeroResidue).toBe(true);const operations=consumeExecutableOperationReceipts(info.testId).filter(r=>r.operationKey.startsWith('TC-ITEM-STD-005:action-'));expect(operations.map(o=>o.operationKey)).toEqual([1,2,3,4,5,6].map(i=>`TC-ITEM-STD-005:action-${i}`));});
test('列表无关新增不能误判为本次产品创建失败或通过',async()=>{const setup=scenario({unexpectedListId:9});await expect(setup.flow.execute('TC-ITEM-STD-005')).rejects.toThrow('REQUIRED_NAME_UNATTRIBUTED_LIST_CHANGE');expect(setup.flow.assertions).toHaveLength(2);expect(setup.flow.uiZeroResidue).toBe(false);expect(setup.getRestored()).toBeGreaterThan(0);});
test('名称反馈缺失保存实际不匹配收据并执行恢复',async()=>{const setup=scenario({feedbackInvalid:false});await expect(setup.flow.execute('TC-ITEM-STD-005')).rejects.toThrow();expect(setup.flow.assertions[1]).toMatchObject({status:'observed-mismatch',actualValue:false,expectedValue:true});expect(setup.flow.stateRestored).toBe(true);});
test('标准价未按正式来源生效时不点击保存',async()=>{const setup=scenario({price:'0'});await expect(setup.flow.execute('TC-ITEM-STD-005')).rejects.toThrow();expect(setup.actions).not.toContain('save');expect(setup.getRestored()).toBeGreaterThan(0);});
test('上游限流保留证据缺口而不认定产品失败',async()=>{const setup=scenario({writeStatus:429,writeBody:{success:false}});await expect(setup.flow.execute('TC-ITEM-STD-005')).rejects.toThrow('REQUIRED_NAME_WRITE_EVIDENCE_INCOMPLETE');expect(setup.flow.assertions).toHaveLength(0);expect(setup.flow.apiZeroResidue).toBe(false);});
test('异常创建必须先持久化精确ID再清理且保留失败断言',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tap-required-name-'));
  const events=new EventEmitter();let created=false,cleaned=false;
  const run=(process.env.PC_ITEM_RUN_ID??'unassigned').replace(/[^a-zA-Z0-9_-]/g,'_');
  const evidence=path.join(root,`output/checkpoints/item/${run}/unexpected-TC-ITEM-STD-005-88.json`);
  const form={fillItemName:async()=>{},readItemName:async()=>'',selectSingleSpec:async()=>{},fillStandardPrice:async()=>{},isSingleSpecSelected:async()=>true,readStandardPriceValue:async()=> '10.00',clickSave:async()=>{created=true;const request={method:()=> 'POST',url:()=> 'https://synthetic.invalid/ops-brand/brand-items/standard'} as Request;events.emit('request',request);events.emit('response',{request:()=>request,status:()=>200,json:async()=>({success:true,data:{id:88}})} as Response);}};
  const list={enterCreateTypePage:async()=>({enterStandardCreate:async()=>form})} as unknown as ItemListPage;
  const listEvidence={enterFromSidebar:async()=>{},open:async()=>{},readPagination:async()=>({total:created&&!cleaned?2:1})} as unknown as StandardListAcceptancePage;
  const validation={observeValidationWindow:async()=>[4000,4500,5000].map(elapsedMs=>({elapsedMs,state:{route:'/pp/brand/create/standard',successVisible:false,feedback:{value:'',invalid:true,errors:[]}}}))} as unknown as StandardRequiredNamePage;
  const persistence={snapshotIds:async()=>created&&!cleaned?[1,88]:[1],removeCorrelatedCreation:async(id:number,before:number[])=>{expect(id).toBe(88);expect(before).toEqual([1]);expect(JSON.parse(fs.readFileSync(evidence,'utf8')).serverId).toBe(88);cleaned=true;}} as unknown as RequiredNamePersistence;
  const flow=new StandardRequiredNameFlow(events as unknown as Page,list,listEvidence,validation,persistence,()=>listEvidence.enterFromSidebar(),root);
  await expect(flow.execute('TC-ITEM-STD-005')).rejects.toThrow();
  expect(flow.assertions[2]).toMatchObject({status:'observed-mismatch',actualValue:{correlatedCreatedIds:[88],newIds:[88],uiTotal:2}});
  expect(cleaned&&flow.apiZeroResidue&&flow.uiZeroResidue).toBe(true);
  expect(JSON.parse(fs.readFileSync(path.join(root,`output/checkpoints/item/${run}/cleanup-TC-ITEM-STD-005-88.json`),'utf8')).cleanupStatus).toBe('verified-zero');
});
