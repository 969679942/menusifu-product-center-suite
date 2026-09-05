import type { Locator, Page } from '@playwright/test';
import { itemAddToMenuDom } from '../../../test-data/item-list';
import { settleInput } from '../../../utils/input-settle';
import { step } from '../../../utils/step';

export class ItemAddToMenuPage {
  private readonly heading: Locator;
  private readonly targetMenuHeading: Locator;
  private readonly searchInput: Locator;
  private readonly saveButton: Locator;
  private readonly closeButton: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: itemAddToMenuDom.heading, level: 4, exact: true });
    this.targetMenuHeading = page.getByRole('heading', { name: itemAddToMenuDom.targetMenuHeading, level: 5, exact: true });
    this.searchInput = page.getByRole('textbox', { name: itemAddToMenuDom.searchPlaceholder, exact: true });
    this.saveButton = page.getByRole('button', { name: itemAddToMenuDom.saveButton, exact: true });
    this.closeButton = page.getByRole('button', { name: itemAddToMenuDom.closeButton, exact: true });
  }

  @step('等待批量添加至菜单页面加载完成')
  async expectLoaded(): Promise<void> {
    await this.heading.waitFor({ state: 'visible', timeout: 30_000 });
    await this.targetMenuHeading.waitFor({ state: 'visible', timeout: 30_000 });
    await this.searchInput.waitFor({ state: 'visible', timeout: 30_000 });
  }

  @step('选择目标菜单 {menuName} 的区块 {sectionName}')
  async selectTargetMenu(menuName: string, sectionName: string): Promise<void> {
    await this.searchInput.fill(sectionName);
    await this.page.getByText(itemAddToMenuDom.loadingMenus, { exact: true }).waitFor({
      state: 'hidden',
      timeout: 30_000,
    });
    const treeItem = this.page.getByRole('treeitem').filter({
      has: this.page.getByRole('button', { name: `${menuName} Menu`, exact: true }),
    });
    await treeItem.waitFor({ state: 'visible', timeout: 30_000 });
    await treeItem.getByRole('checkbox', { name: 'Select tree node', exact: true }).check();
  }

  @step('保存商品菜单绑定')
  async save(): Promise<void> {
    await settleInput();
    await this.saveButton.click();
  }

  @step('关闭批量添加至菜单页面')
  async close(): Promise<void> {
    await this.closeButton.click();
    await this.heading.waitFor({ state: 'hidden', timeout: 10_000 });
  }
}
