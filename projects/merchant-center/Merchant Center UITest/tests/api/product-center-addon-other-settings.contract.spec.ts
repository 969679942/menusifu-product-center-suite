import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import {AddonOtherSettingsFlow} from '../../flows/product-center/item-216/addon-other-settings.flow';
import type {AddonOtherSettingsPage} from '../../pages/product-management/item/addon-other-settings.page';
import {consumeExecutableOperationReceipts} from '../../utils/executable-operation-receipt';
import {fingerprintProductCenterItemImplementation} from '../../adapters/product-center/product-center-item-implementation';
import {partitionProductCenterItemSpecs,addonOtherSettingsSpecPath} from '../../adapters/product-center/product-center-item-addon-other-settings-specs';
const keys=['detailImageUpload','descriptionLabels','badges','stats','ingredientInfo'];
function setup(mode:'valid'|'hidden'|'disabled'|'missing-upload'|'read-error'|'restore-error'='valid'){
  let restored=false;const controls=Object.fromEntries(keys.map(k=>[k,{count:1,visible:true,enabled:true}]));if(mode==='hidden')controls.badges.visible=false;if(mode==='disabled')controls.stats.enabled=false;
  const page={url:()=> 'https://synthetic.invalid/pp/brand/create/side',screenshot:async()=>Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lN8AAAAASUVORK5CYII=','base64')} as unknown as Page;
  const settings={readAvailableControls:async()=>{if(mode==='read-error')throw Error('synthetic-read-error');return {controls,uploadInput:{count:mode==='missing-upload'?0:1,enabled:true}};}} as AddonOtherSettingsPage;
  return {flow:new AddonOtherSettingsFlow(page,settings,async()=>({route:'/pp/brand/create/side'}),async()=>{restored=true;if(mode==='restore-error')throw Error('synthetic-restore-error');}),restored:()=>restored};
}
test('一动作一断言包含完整五入口及上传支持',async({},info)=>{const s=setup();await s.flow.execute('TC-ITEM-ADD-002');expect(s.flow.assertions).toHaveLength(1);expect(s.flow.assertions[0].status).toBe('verified');expect(s.flow.stateRestored).toBe(true);expect(consumeExecutableOperationReceipts(info.testId).filter(r=>r.operationKey==='TC-ITEM-ADD-002:action-1')).toHaveLength(1);});
for(const mode of ['hidden','disabled','missing-upload'] as const)test(`缺失能力不能通过：${mode}`,async()=>{const s=setup(mode);await expect(s.flow.execute('TC-ITEM-ADD-002')).rejects.toThrow('正式断言不匹配');expect(s.flow.assertions[0].status).toBe('observed-mismatch');expect(s.restored()).toBe(true);});
test('读取异常不授权通过且执行恢复',async()=>{const s=setup('read-error');await expect(s.flow.execute('TC-ITEM-ADD-002')).rejects.toThrow('synthetic-read-error');expect(s.flow.assertions).toHaveLength(0);expect(s.restored()).toBe(true);});
test('恢复异常不能标记恢复完成',async()=>{const s=setup('restore-error');await expect(s.flow.execute('TC-ITEM-ADD-002')).rejects.toThrow('synthetic-restore-error');expect(s.flow.stateRestored).toBe(false);});
test('15条当前合格指纹保持',()=>{const before=JSON.parse(fs.readFileSync('deliverables/system-test-platform/addon-other-settings-prior-fingerprints.json','utf8'));expect(Object.keys(before)).toHaveLength(15);for(const[id,hash]of Object.entries(before))expect(fingerprintProductCenterItemImplementation(process.cwd(),id)).toBe(hash);});
test('ADD002独立路由与现有路由完整分区',()=>{const ids=['TC-ITEM-ADD-002','TC-ITEM-STD-045','TC-ITEM-STD-041','TC-ITEM-ADD-005'],routes=partitionProductCenterItemSpecs(ids);expect(routes.flatMap(r=>r.caseIds).sort()).toEqual([...ids].sort());expect(routes.find(r=>r.specPath===addonOtherSettingsSpecPath)?.caseIds).toEqual([ids[0]]);expect(()=>partitionProductCenterItemSpecs([ids[0],ids[0]])).toThrow('ITEM_SPEC_DUPLICATE_SELECTION');});
