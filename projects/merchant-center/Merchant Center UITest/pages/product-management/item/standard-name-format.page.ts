import type { Page, Locator } from '@playwright/test';
import { ItemCreateStandardLocators } from './item-create-standard-locators';
import { ItemListLocators } from './item-list-locators';
import { step } from '../../../utils/step';

export class StandardNameFormatPage {
  private readonly form: ItemCreateStandardLocators;
  private readonly list: ItemListLocators;
  constructor(page: Page) { this.form = new ItemCreateStandardLocators(page); this.list = new ItemListLocators(page); }
  private exactName(itemName: string): Locator { return this.list.rowsByItemName(itemName).locator('td').nth(1).getByText(itemName, { exact: true }); }

  @step('读取商品名称字段自身的格式校验反馈')
  async readNameFeedback() {
    return this.form.itemNameInput.evaluate(input => {
      const field = input.closest('.ant-form-item');
      return { value: (input as HTMLInputElement).value,
        invalid: input.getAttribute('aria-invalid') === 'true' || field?.classList.contains('ant-form-item-has-error') === true,
        errors: Array.from(field?.querySelectorAll('.ant-form-item-explain-error') ?? [])
          .filter(element => element.getClientRects().length > 0).map(element => (element.textContent ?? '').trim()) };
    });
  }
  @step('读取标准商品创建成功提示')
  async readSaveSuccessText(): Promise<string> {
    await this.form.successMessage.waitFor({state:'visible',timeout:15_000});
    return (await this.form.successMessage.innerText()).trim();
  }
  @step('读取列表中完整商品名称的精确匹配：{itemName}')
  async readExactName(itemName: string) {
    const target=this.exactName(itemName),count=await target.count();
    return {count,actualName:count===1?(await target.innerText()).trim():null};
  }
}
export function createStandardNameFormatPage(page: Page): StandardNameFormatPage { return new StandardNameFormatPage(page); }
