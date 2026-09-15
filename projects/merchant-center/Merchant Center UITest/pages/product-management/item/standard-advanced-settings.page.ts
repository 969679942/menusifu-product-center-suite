import type {Page,Locator} from '@playwright/test';
import {ItemCreateStandardLocators} from './item-create-standard-locators';
import {step} from '../../../utils/step';
import {waitUntil} from '../../../utils/wait';

export type AdvancedFieldState={count:number;visible:boolean};
export type AdvancedSettingsState={state:'collapsed'|'expanded';icon:'down'|'up';fields:Record<string,AdvancedFieldState>};
export function interpretAdvancedToggle(icons:string[]):'collapsed'|'expanded'{
  if(icons.length!==1||!['down','up'].includes(icons[0]))throw Error('ADVANCED_TOGGLE_EVIDENCE_INCOMPLETE');
  return icons[0]==='down'?'collapsed':'expanded';
}
export class StandardAdvancedSettingsPage {
  private readonly form:ItemCreateStandardLocators;
  private readonly icons:Locator;
  private readonly fields:Record<string,Locator>;
  constructor(page:Page){
    this.form=new ItemCreateStandardLocators(page);this.icons=this.form.advancedSettingsButton.locator('[data-icon]');
    this.fields={posName:this.form.posNameInput,kitchenName:this.form.kitchenNameInput,mnemonicCode:this.form.mnemonicCodeInput,industryGoods:this.form.industryGoodsInput,itemCode:this.form.itemCodeInput,unit:this.form.unitInput,deviceCode:this.form.deviceCodeInput,minimumOrderQuantity:this.form.minimumOrderQuantityInput};
  }
  private async readRaw():Promise<AdvancedSettingsState>{
    if(await this.form.advancedSettingsButton.count()!==1||!await this.form.advancedSettingsButton.isVisible())throw Error('ADVANCED_TOGGLE_SURFACE_MISSING');
    const icons=await this.icons.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-icon')??''));
    const state=interpretAdvancedToggle(icons),fields:Record<string,AdvancedFieldState>={};
    for(const [key,locator] of Object.entries(this.fields)){const count=await locator.count();if(count>1)throw Error('ADVANCED_FIELD_IDENTITY_AMBIGUOUS:'+key);fields[key]={count,visible:count===1?await locator.isVisible():false};}
    return {state,icon:icons[0] as 'down'|'up',fields};
  }
  @step('独立读取高级设置图标状态及八个字段',{executableOperation:false})
  async readState(){return this.readRaw();}
  @step('点击高级设置展开入口')
  async expand(){
    if((await this.readRaw()).state!=='collapsed')throw Error('ADVANCED_EXPAND_PRECONDITION_NOT_COLLAPSED');
    await this.form.advancedSettingsButton.click();
    await waitUntil(()=>this.readRaw(),state=>state.state==='expanded',{timeout:8000,interval:200,message:'高级设置展开图标未出现'});
  }
  @step('核验展开后的八个字段身份与可见性',{executableOperation:false})
  async readExpandedIdentities(){
    return waitUntil(()=>this.readRaw(),state=>state.state==='expanded'&&Object.values(state.fields).every(field=>field.count===1&&field.visible),{timeout:8000,interval:200,message:'高级设置当前字段身份或展开观察不完整'});
  }
}
