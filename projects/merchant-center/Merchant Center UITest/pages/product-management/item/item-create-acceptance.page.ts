import { ItemCreateSidePage } from './item-create-side.page';
import { step } from '../../../utils/step';

export class ItemCreateAcceptancePage extends ItemCreateSidePage {
  @step('读取商品名称字段自身的必填反馈')
  async readNameRequiredFeedback() {
    return this.locators.itemNameInput.evaluate(input => {
      const field = input.closest('.ant-form-item');
      const errors = Array.from(field?.querySelectorAll('.ant-form-item-explain-error') ?? [])
        .filter(element => element.getClientRects().length > 0).map(element => (element.textContent ?? '').trim());
      return { value: (input as HTMLInputElement).value,
        invalid: input.getAttribute('aria-invalid') === 'true' || input.classList.contains('ant-input-status-error')
          || field?.classList.contains('ant-form-item-has-error') === true,
        errors };
    });
  }

  @step('读取保存成功提示的实际文案')
  async readSaveSuccessText(timeout = 15_000): Promise<string> {
    await this.locators.successMessage.waitFor({ state: 'visible', timeout });
    return (await this.locators.successMessage.innerText()).trim();
  }

  @step('读取当前商品分类选择值')
  async readCategorySelection(): Promise<string> {
    return (await this.locators.categorySelectedValue.allTextContents()).join('').trim();
  }
}
