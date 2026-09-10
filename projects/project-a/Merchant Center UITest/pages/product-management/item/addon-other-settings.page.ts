import type {Page} from '@playwright/test';
import {ItemCreateSideLocators} from './item-create-side-locators';
export class AddonOtherSettingsPage {
  private readonly controls:ItemCreateSideLocators;
  constructor(page:Page){this.controls=new ItemCreateSideLocators(page);}
  async readAvailableControls(){
    const l=this.controls;
    if(await l.otherSettingsExpandButton.count()===1&&await l.otherSettingsExpandButton.isVisible())await l.otherSettingsExpandButton.click();
    const locators={detailImageUpload:l.detailImageUploadButton,descriptionLabels:l.descriptionLabelsAddButton,badges:l.badgesAddButton,stats:l.statsAddButton,ingredientInfo:l.ingredientInfoAddButton},controls:Record<string,{count:number;visible:boolean;enabled:boolean}>={};
    for(const[key,locator]of Object.entries(locators)){await locator.waitFor({state:'visible',timeout:8000});controls[key]={count:await locator.count(),visible:await locator.isVisible(),enabled:await locator.isEnabled()};}
    return {controls,uploadInput:{count:await l.detailImageFileInput.count(),enabled:await l.detailImageFileInput.isEnabled()}};
  }
}
