import type { Page, Locator } from '@playwright/test';
import { ItemListLocators } from './item-list-locators';
import { step } from '../../../utils/step';

export class ItemListCreationEvidencePage {
  private readonly locators: ItemListLocators;
  private readonly firstRowNameCell: Locator;
  constructor(page: Page) {
    this.locators = new ItemListLocators(page);
    this.firstRowNameCell = this.locators.tableBodyRows.first().locator('td').nth(1);
  }
  @step('读取新增商品返回列表后的首行及查询条件：{itemName}')
  async readFirstRowIdentity(itemName: string) {
    await this.firstRowNameCell.waitFor({ state: 'visible' });
    return { search: await this.locators.searchInput.inputValue(),
      currentPage: Number((await this.locators.paginationCurrentPage.innerText()).trim()),
      firstRowNameText: (await this.firstRowNameCell.innerText()).trim(),
      firstRowIdentityCount: await this.firstRowNameCell.getByText(itemName, { exact: true }).count() };
  }
}
