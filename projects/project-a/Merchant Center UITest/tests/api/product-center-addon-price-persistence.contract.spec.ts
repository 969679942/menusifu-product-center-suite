import {test,expect} from '@playwright/test';
import {readAddonPriceQuery,readAddonPriceCreatedId,AddonPricePersistence,createAddonPriceOwnershipWriter} from '../../api/product-center/addon-price-persistence';
import {ProductCenterExecutionLedger} from '../../api/product-center/execution-ledger';
import path from 'node:path';
import {CleanupRegistry} from '../../api/product-center/cleanup-registry';
import fs from 'node:fs';
import {fingerprintProductCenterItemImplementation} from '../../adapters/product-center/product-center-item-implementation';
import {partitionProductCenterItemSpecs,addonPriceSpecPath} from '../../adapters/product-center/product-center-item-addon-price-specs';
import {buildAddonPriceSourceName} from '../../test-data/product-center/addon-price';
test('精确查询不把缺少结构、未完整分页或错误ID当成零记录',()=>{expect(readAddonPriceQuery({data:{totalCount:0,list:[]}},'owned')).toEqual([]);expect(readAddonPriceQuery({data:{totalCount:1,list:[{itemBasic:{id:12,name:'owned'}}]}},'owned')).toEqual([{id:12,name:'owned'}]);for(const body of [null,{}, {data:{totalCount:1,list:[]}}, {data:{totalCount:1,list:[{id:12,name:'owned'}]}}, {success:false,data:{totalCount:0,list:[]}}, {data:{totalCount:1,list:[{itemBasic:{id:0,name:'owned'}}]}}])expect(()=>readAddonPriceQuery(body,'owned')).toThrow();});
test('重复服务器ID及名称不精确不能被当成唯一归属',()=>{expect(readAddonPriceQuery({data:{totalCount:1,list:[{itemBasic:{id:12,name:'owned-extra'}}]}},'owned')).toEqual([]);expect(()=>readAddonPriceQuery({data:{totalCount:2,list:[{itemBasic:{id:12,name:'owned'}},{itemBasic:{id:12,name:'owned'}}]}},'owned')).toThrow('DUPLICATE_SERVER_ID');});
test('创建ID严格拒绝零、负数、无ID及失败响应',()=>{for(const b of [null,{}, {data:null},{data:0},{data:-1},{success:false,data:12}])expect(readAddonPriceCreatedId(b)).toBeUndefined();expect(readAddonPriceCreatedId({data:12})).toBe(12);expect(readAddonPriceCreatedId({data:{id:12}})).toBe(12);});
test('未核验名称不存在前禁止登记创建ID',()=>{const store=new AddonPricePersistence({} as never,{} as never,{} as CleanupRegistry,()=>{});expect(()=>store.registerResponse({data:12})).toThrow('CREATED_BEFORE_ABSENCE_CHECK');});
test('正式名称严格保留中文原文及空格',()=>{expect(buildAddonPriceSourceName('TC-ITEM-ADD-009',123)).toBe('加料商品-标准价为 0 创建-123');expect(buildAddonPriceSourceName('TC-ITEM-ADD-008',123)).toBe('加料商品-标准价缺失创建-123');expect(()=>buildAddonPriceSourceName('UNKNOWN',123)).toThrow();});
test('创建ID立即登记；删除超时但已生效时先查询后结束，不重复删除',async()=>{
 let records:Array<{id:number;name:string}>=[],deleted=false,deletes=0;
 const store=new AddonPricePersistence({} as never,{deleteBomProduct:async()=>{deletes++;deleted=true;records=[];throw Error('synthetic-timeout-after-delete');},productDetail:async()=>{if(deleted)throw Error('HTTP 404');return {data:{itemBasic:{id:12}}};}},new CleanupRegistry(),()=>{});
 store.records=async()=>records;await store.prepare('中文测试-123','TC-ITEM-ADD-009');records=[{id:12,name:'中文测试-123'}];store.registerResponse({data:12});expect([...store.registeredServerIds]).toEqual([12]);const result=await store.cleanup();expect(result.exactNameCount).toBe(0);expect(deletes).toBe(1);expect(result.registeredServerIds).toEqual([12]);
});
test('名字不匹配但服务器ID仍存在时拒绝删除',async()=>{
 let records:Array<{id:number;name:string}>=[],deletes=0;
 const store=new AddonPricePersistence({} as never,{deleteBomProduct:async()=>{deletes++;return {};},productDetail:async()=>({data:{itemBasic:{id:12}}})},new CleanupRegistry(),()=>{});
 store.records=async()=>records;await store.prepare('中文测试-123','TC-ITEM-ADD-009');store.registerResponse({data:12});await expect(store.cleanup()).rejects.toThrow('IDENTITY_DRIFT');expect(deletes).toBe(0);
});
test('16条当前合格指纹保持',()=>{const before=JSON.parse(fs.readFileSync('deliverables/system-test-platform/addon-price-prior-fingerprints.json','utf8'));expect(Object.keys(before)).toHaveLength(16);for(const[id,hash]of Object.entries(before))expect(fingerprintProductCenterItemImplementation(process.cwd(),id)).toBe(hash);});
test('价格三条与既有入口完整分区，禁止重复选择',()=>{const ids=['TC-ITEM-ADD-008','TC-ITEM-ADD-009','TC-ITEM-ADD-010','TC-ITEM-ADD-002','TC-ITEM-STD-045','TC-ITEM-STD-041','TC-ITEM-ADD-005'],routes=partitionProductCenterItemSpecs(ids);expect(routes.flatMap(r=>r.caseIds).sort()).toEqual([...ids].sort());expect(routes.find(r=>r.specPath===addonPriceSpecPath)?.caseIds).toEqual(ids.slice(0,3));expect(()=>partitionProductCenterItemSpecs([ids[0],ids[0]])).toThrow('ITEM_SPEC_DUPLICATE_SELECTION');});
test('真实台账接受审计标识，正式中文名称及服务器ID先落盘，最终清理到零',async({},info)=>{
 const root=info.outputPath('ownership'),intentPath=path.join(root,'intent.json');fs.mkdirSync(root,{recursive:true});
 fs.writeFileSync(intentPath,fs.readFileSync('deliverables/system-test-platform/addon-price-execution-intent.json'));
 const ledger=new ProductCenterExecutionLedger({rootDir:path.join(root,'ledger'),runId:'synthetic-ledger'});
 const journal=createAddonPriceOwnershipWriter(root,'synthetic-run',intentPath);
 let records:Array<{id:number;name:string}>=[],deleted=false;
 const store=new AddonPricePersistence({} as never,{deleteBomProduct:async()=>{deleted=true;records=[];return {};},productDetail:async()=>{if(deleted)throw Error('HTTP 404');return {data:{itemBasic:{id:12}}};}},new CleanupRegistry(ledger),journal);
 store.records=async()=>records;await store.prepare('加料商品-标准价为 0 创建-123','TC-ITEM-ADD-009');records=[{id:12,name:'加料商品-标准价为 0 创建-123'}];store.registerResponse({data:12});
 const dir=path.join(root,'output/checkpoints/addon-price-ownership');const created=JSON.parse(fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(n=>n.endsWith('-12.json'))!),'utf8'));
 expect(created).toMatchObject({serverId:12,actualFormalName:records[0].name,runId:'synthetic-run',caseId:'TC-ITEM-ADD-009',absenceVerified:true});expect(created.intentFingerprint).toMatch(/^[a-f0-9]{64}$/);
 expect(ledger.snapshot().entries[0].identityVariants).toEqual([created.auditIdentity]);
 await store.cleanup();expect(ledger.incompleteEntries()).toEqual([]);
 expect(()=>ledger.recordCreated({entryId:'bad',entityKind:'item',entity:'synthetic',serverId:99,identity:'AUTO_AUDIT_bad',identityVariants:['中文未审计名称'],cleanupOrder:50})).toThrow('禁止记录非审计数据');
});
test('登记抛错时仍可从磁盘恢复原名称和ID，重协调不重复已登记任务',async({},info)=>{
 const root=info.outputPath('interrupted'),intentPath=path.join(root,'intent.json');fs.mkdirSync(root,{recursive:true});fs.writeFileSync(intentPath,fs.readFileSync('deliverables/system-test-platform/addon-price-execution-intent.json'));
 let attempts=0;const registry={register:()=>{attempts++;if(attempts===1)throw Error('synthetic-ledger-disk-failure');}};
 const store=new AddonPricePersistence({} as never,{} as never,registry as never,createAddonPriceOwnershipWriter(root,'synthetic-run',intentPath));
 store.records=async()=>[];await store.prepare('加料商品-标准价为 0 创建-123','TC-ITEM-ADD-009');expect(()=>store.registerResponse({data:12})).toThrow('synthetic-ledger-disk-failure');
 const dir=path.join(root,'output/checkpoints/addon-price-ownership');const record=JSON.parse(fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(n=>n.endsWith('-12.json'))!),'utf8'));expect(record.serverId).toBe(12);expect(record.actualFormalName).toBe('加料商品-标准价为 0 创建-123');expect([...store.registeredServerIds]).toEqual([]);
 store.registerResponse({data:12});store.registerResponse({data:12});expect(attempts).toBe(2);expect([...store.registeredServerIds]).toEqual([12]);
});
test('归属持久化失败时不允许继续准备或进入台账登记',async()=>{
 let registered=false;const store=new AddonPricePersistence({} as never,{} as never,{register:()=>{registered=true;}} as never,()=>{throw Error('synthetic-journal-unwritable');});store.records=async()=>[];
 await expect(store.prepare('中文测试','TC-ITEM-ADD-009')).rejects.toThrow('synthetic-journal-unwritable');expect(()=>store.registerResponse({data:12})).toThrow('synthetic-journal-unwritable');expect(registered).toBe(false);
});
