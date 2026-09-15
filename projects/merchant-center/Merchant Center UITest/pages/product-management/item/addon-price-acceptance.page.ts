import {ItemCreateAcceptancePage} from './item-create-acceptance.page';
export class AddonPriceAcceptancePage extends ItemCreateAcceptancePage {
 async readPriceFieldFeedback(){const state=await this.readStandardPriceValidationState();const affixError=await this.locators.standardPriceInput.evaluate(input=>input.closest('.ant-input-number-affix-wrapper')?.classList.contains('ant-input-number-status-error')===true);return {value:await this.readStandardPriceValue(),inputAriaInvalid:state.inputAriaInvalid,controlErrorState:state.controlErrorState||affixError,formItemErrorState:state.formItemErrorState,fieldInvalid:state.inputAriaInvalid||state.controlErrorState||affixError||state.formItemErrorState};}
 async clearPrice(){await this.locators.standardPriceInput.fill('');if(await this.readStandardPriceValue()!=='')throw Error('ADDON_PRICE_EMPTY_INPUT_NOT_ESTABLISHED');}
 async fillObservedPrice(value:string){await this.locators.standardPriceInput.fill(value);return this.readStandardPriceValue();}
 async typeObservedNegative(){await this.locators.standardPriceInput.press('ControlOrMeta+A');await this.locators.standardPriceInput.pressSequentially('-1.00');const value=await this.readStandardPriceValue();if(value!=='-1.00')throw Error('ADDON_PRICE_NEGATIVE_INPUT_NOT_OBSERVED');return value;}
}
