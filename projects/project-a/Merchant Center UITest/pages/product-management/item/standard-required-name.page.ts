import type {Page} from '@playwright/test';
import {ItemCreateStandardLocators} from './item-create-standard-locators';
import {step} from '../../../utils/step';
import {waitUntil} from '../../../utils/wait';

export class StandardRequiredNamePage {
  private readonly form:ItemCreateStandardLocators;
  constructor(private readonly page:Page){this.form=new ItemCreateStandardLocators(page);}
  private async readValidationState(){
    const route=new URL(this.page.url()).pathname;
    const feedback=route==='/pp/brand/create/standard'?await this.form.itemNameInput.evaluate(input=>{const field=input.closest('.ant-form-item');if(!field)throw Error('REQUIRED_NAME_FIELD_SURFACE_MISSING');return {value:(input as HTMLInputElement).value,invalid:input.getAttribute('aria-invalid')==='true'||field.classList.contains('ant-form-item-has-error'),errors:Array.from(field.querySelectorAll('.ant-form-item-explain-error')).filter(element=>element.getClientRects().length>0).map(element=>(element.textContent??'').trim())};}):null;
    return {route,successVisible:await this.form.successMessage.isVisible(),feedback};
  }
  @step('连续观察名称必填反馈与页面状态并保留时间线',{executableOperation:false})
  async observeValidationWindow(){
    const timeline:Array<{elapsedMs:number;state:Awaited<ReturnType<StandardRequiredNamePage['readValidationState']>>}>=[],start=Date.now();
    await waitUntil(async()=>{const sample={elapsedMs:Date.now()-start,state:await this.readValidationState()};timeline.push(sample);return sample;},sample=>sample.elapsedMs>=5000,{timeout:8000,interval:250,probeTimeout:1500,message:'名称校验观察窗口未完整结束'});
    return timeline;
  }
}
