import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {standardNameFormatIdentity} from '../../test-data/product-center/item-216/standard-item-216.factory';
import {createStandardItemAuditPng} from '../../test-data/product-center/item-216/standard-item-image-data';
import baseline from '../fixtures/standard-item-image-byte-baseline.json';
import {fingerprintProductCenterItemImplementation} from '../../adapters/product-center/product-center-item-implementation';
import {StandardItem216Flow} from '../../flows/product-center/item-216/standard-item-216.flow';
import {StandardNameFormatPage} from '../../pages/product-management/item/standard-name-format.page';
import bindings from '../../contracts/product-center/test-cases/standard-name-format-bindings.json';

test('名称边界数据恰好100字符且唯一一个空格在中间，emoji变体保留唯一身份',()=>{
  const name=standardNameFormatIdentity('TC-ITEM-STD-102','AUTO_AUDIT_123');
  expect(name.length).toBe(100); expect([...name].filter(c=>c===' ')).toHaveLength(1); expect(name[49]).toBe(' ');
  expect(name.trim()).toBe(name);
  const emoji=standardNameFormatIdentity('TC-ITEM-STD-103','AUTO_AUDIT_456');
  expect(emoji).toContain('😀'); expect(emoji.replace('😀','')).toContain('AUTO_AUDIT_456');
  expect(()=>standardNameFormatIdentity('TC-ITEM-STD-102','existing-data')).toThrow('NAME_FORMAT_IDENTITY_INVALID');
});
test('图片数据拆分保持三个原始样本逐字节哈希',()=>{
  for(const row of baseline)expect(createHash('sha256').update(createStandardItemAuditPng(row.seed)).digest('hex')).toBe(row.sha256);
});
test('标准名称绑定具有真实可执行动作且不改变已验收加料实现指纹',()=>{
  const root=process.cwd(),source=fs.readFileSync(path.join(root,'tests/generated/product-center-item-standard-216.generated.spec.ts'),'utf8');
  for(const row of bindings.cases)expect(source).toContain(`caseId: '${row.caseId}', title: '${row.title}', action: '${row.action}'`);
  const previous=JSON.parse(fs.readFileSync(path.join(root,'deliverables/system-test-platform/current-item-gap-classification.json'),'utf8'));
  for(const [id,value] of Object.entries(previous.dependencyDecision.before))expect(fingerprintProductCenterItemImplementation(root,id)).toBe((value as any).fingerprint);
});
test('名称格式读取只消费名称自身可见错误',async()=>{
  const probe=Object.create(StandardNameFormatPage.prototype) as any;
  let errors:any[]=[];
  probe.form={itemNameInput:{evaluate:async(read:any)=>read({value:'AUTO_AUDIT_😀',getAttribute:()=>null,
    closest:()=>({classList:{contains:()=>false},querySelectorAll:()=>errors})})}};
  expect((await probe.readNameFeedback()).errors).toEqual([]);
  errors=[{getClientRects:()=>[1],textContent:'Invalid character'}];
  expect((await probe.readNameFeedback()).errors).toEqual(['Invalid character']);
});
test('字段报错后写响应迟到仍登记异常创建，不授权emoji拦截通过',async()=>{
  const flow=Object.create(StandardItem216Flow.prototype) as any;
  const listeners=new Map<string,any>();let registered=false;
  const request={method:()=> 'POST',url:()=> 'https://example.invalid/ops-brand/brand-items/standard'};
  flow.page={on:(event:string,fn:any)=>listeners.set(event,fn),off:(event:string)=>listeners.delete(event),url:()=> 'https://example.invalid/pp/brand/create/standard'};
  flow.factory={prepare:async()=>({originalIdentity:'AUTO_AUDIT_😀',cleanupIdentityVariants:['AUTO_AUDIT_😀','AUTO_AUDIT_']}),itemRecordCount:async()=>0,
    registerCreated:async()=>{registered=true;return {id:1};}};
  flow.trackedItemIdentities=new Set();flow.cleanupRegistry={};
  flow.createFlow={openStandardCreateFromList:async()=>({fillItemName:async()=>{},ensureAdvancedSettingsExpanded:async()=>{},fillMinimumOrderQuantity:async()=>{},fillStandardPrice:async()=>{},
    clickSave:async()=>{listeners.get('request')(request);setTimeout(()=>listeners.get('response')?.({request:()=>request,ok:()=>true,json:async()=>({success:true,data:{id:1}})}),150);},readSuccessMessageCount:async()=>0})};
  const probe={readNameFeedback:async()=>({value:'AUTO_AUDIT_😀',invalid:true,errors:['Invalid character']})};
  await expect(flow.verifyFormalNameFormat('TC-ITEM-STD-103',{allowedMessages:['ok'],matches:()=>true},probe)).rejects.toThrow('TC-ITEM-STD-103:expectation-1');
  expect(registered).toBe(true);expect(listeners.size).toBe(0);
});
