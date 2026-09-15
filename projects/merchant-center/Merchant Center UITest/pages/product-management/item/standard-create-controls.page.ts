import type {Page,Locator} from '@playwright/test';
import {ItemCreateStandardLocators} from './item-create-standard-locators';
import {waitUntil} from '../../../utils/wait';
export class StandardCreateControlsPage {
  private readonly form:ItemCreateStandardLocators;
  private readonly openedPages:Page[]=[];
  private initialLength:number|undefined;
  constructor(private readonly page:Page){this.form=new ItemCreateStandardLocators(page);}
  private async unique(locator:Locator){if(await locator.count()!==1||!await locator.isVisible())throw Error('CREATE_CONTROL_IDENTITY_INCOMPLETE');}
  async fillDescription(){await this.unique(this.form.descriptionInput);await this.form.descriptionInput.fill('D'.repeat(250));this.initialLength=(await this.form.descriptionInput.inputValue()).length;}
  async appendDescriptionCharacter(){await this.form.descriptionInput.press('End');await this.form.descriptionInput.pressSequentially('X');}
  async readDescription(){await this.unique(this.form.descriptionInput);await this.unique(this.form.descriptionCounter);return {initialLength:this.initialLength,finalLength:(await this.form.descriptionInput.inputValue()).length,maxlength:await this.form.descriptionInput.getAttribute('maxlength'),counterText:(await this.form.descriptionCounter.innerText()).trim()};}
  async selectMulti(){await this.unique(this.form.multiSpecRadio);await this.form.multiSpecRadio.check();await waitUntil(()=>this.form.multiSpecRadio.isChecked(),v=>v,{timeout:8000,interval:100,message:'多规格未选中'});}
  async readWeight(){await this.unique(this.form.weightBasedYesRadio);return {multiChecked:await this.form.multiSpecRadio.isChecked(),disabled:await this.form.weightBasedYesRadio.isDisabled(),visible:await this.form.weightBasedYesRadio.isVisible(),disabledStyle:await this.form.weightBasedYesRadio.evaluate(n=>n.closest('label')?.classList.contains('ant-radio-wrapper-disabled')===true)};}
  async openSpecificationCreate(){
    await this.form.addSpecGroupButton.click();await this.form.specGroupDialog.waitFor({state:'visible'});await this.unique(this.form.specGroupCreateEntry);
    const popupPromise=this.page.waitForEvent('popup',{timeout:10000});
    await this.form.specGroupCreateEntry.click();const popup=await popupPromise;this.openedPages.push(popup);
    await popup.waitForLoadState('domcontentloaded');
    await popup.getByRole('heading',{name:'Basic Info',exact:true}).waitFor({state:'visible',timeout:10000});
    return {route:new URL(popup.url()).pathname,basicHeading:await popup.getByRole('heading',{name:'Basic Info',exact:true}).isVisible(),groupHeading:await popup.getByRole('heading',{name:'Specification in Group',exact:true}).isVisible(),nameLabel:await popup.getByText('Specification Group Name',{exact:true}).isVisible()};
  }
  async failureScreenshot(){return (this.openedPages.find(p=>!p.isClosed())??this.page).screenshot();}
  async closeCreatedPages(){for(const p of this.openedPages)if(!p.isClosed())await p.close();if(this.openedPages.some(p=>!p.isClosed()))throw Error('SPEC_CREATE_POPUP_RESTORE_INCOMPLETE');}
}
