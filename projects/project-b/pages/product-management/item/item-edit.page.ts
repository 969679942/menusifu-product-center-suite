import type { Page } from '@playwright/test';
import { ITEM_EDIT_PATHS } from '../../../test-data/item-list';
import type { ItemProductType } from '../../../test-data/item-create';
import { step } from '../../../utils/step';
import { waitUntil } from '../../../utils/wait';
import { settleInput } from '../../../utils/input-settle';
import { ItemCreateComboPage } from './item-create-combo.page';
import { ItemCreateSidePage } from './item-create-side.page';
import { ItemCreateStandardPage } from './item-create-standard.page';
import { ItemEditLocators } from './item-edit-locators';

export type ItemEditPage = ItemEditStandardPage | ItemEditComboPage | ItemEditSidePage;

export class ItemEditStandardPage extends ItemCreateStandardPage {
  private readonly editLocators: ItemEditLocators;

  constructor(page: Page) {
    super(page);
    this.editLocators = new ItemEditLocators(page);
  }

  @step('等待标准商品编辑页加载完成')
  async expectLoaded(): Promise<void> {
    await waitUntil(
      () => new URL(this.page.url()).pathname,
      (pathname) => pathname === ITEM_EDIT_PATHS.standard,
      { timeout: 60_000, message: `编辑页路径未切换到 ${ITEM_EDIT_PATHS.standard}。` },
    );
    await this.editLocators.standardPageTitle.waitFor({ state: 'visible', timeout: 30_000 });
    await this.locators.saveButton.waitFor({ state: 'visible', timeout: 30_000 });
    await this.expectFormStructure();
    await waitUntil(
      async () => ({
        itemName: await this.readItemName(),
        prices: await this.readVisiblePriceValues(),
      }),
      (state) => state.itemName.trim().length > 0
        && state.prices.some((price) => price.trim().length > 0),
      { timeout: 30_000, interval: 100, message: '标准商品编辑页名称与价格未完成回显。' },
    );
  }
}

export class ItemEditComboPage extends ItemCreateComboPage {
  private readonly editLocators: ItemEditLocators;

  constructor(page: Page) {
    super(page);
    this.editLocators = new ItemEditLocators(page);
  }

  @step('通过受控编辑控件填写套餐商品名称：{itemName}')
  async fillItemName(itemName: string): Promise<void> {
    // The legacy combo editor can retain the hydrated value when Playwright's
    // direct fill updates only the DOM. Use key events on this edit-only path
    // and verify the value before Save so the PUT body cannot carry the old
    // package name.
    await this.locators.itemNameInput.click();
    await this.locators.itemNameInput.press('ControlOrMeta+A');
    await this.locators.itemNameInput.press('Backspace');
    await this.locators.itemNameInput.pressSequentially(itemName);
    await this.locators.itemNameInput.press('Tab').catch(() => undefined);
    await settleInput();
    const actual = await this.locators.itemNameInput.inputValue();
    if (actual !== itemName) throw new Error(`套餐商品名称输入未稳定：expected=${itemName} actual=${actual}`);
  }

  @step('等待套餐商品编辑页加载完成')
  async expectLoaded(): Promise<void> {
    await waitUntil(
      () => new URL(this.page.url()).pathname,
      (pathname) => pathname === ITEM_EDIT_PATHS.combo,
      { timeout: 60_000, message: `编辑页路径未切换到 ${ITEM_EDIT_PATHS.combo}。` },
    );
    await this.editLocators.comboPageTitle.waitFor({ state: 'visible', timeout: 30_000 });
    await this.locators.saveButton.waitFor({ state: 'visible', timeout: 30_000 });
    await this.expectFormStructure();
  }
}

export class ItemEditSidePage extends ItemCreateSidePage {
  private readonly editLocators: ItemEditLocators;

  constructor(page: Page) {
    super(page);
    this.editLocators = new ItemEditLocators(page);
  }

  @step('等待加料/配菜商品编辑页加载完成')
  async expectLoaded(): Promise<void> {
    await waitUntil(
      () => new URL(this.page.url()).pathname,
      (pathname) => pathname === ITEM_EDIT_PATHS.side,
      { timeout: 60_000, message: `编辑页路径未切换到 ${ITEM_EDIT_PATHS.side}。` },
    );
    await this.editLocators.sidePageTitle.waitFor({ state: 'visible', timeout: 30_000 });
    await this.locators.saveButton.waitFor({ state: 'visible', timeout: 30_000 });
    await this.expectFormStructure();
    await waitUntil(
      () => this.readItemName(),
      (itemName) => itemName.trim().length > 0,
      { timeout: 30_000, interval: 100, message: '加料商品编辑页名称未完成回显。' },
    );
  }
}

export function createItemEditPage(page: Page, type: ItemProductType): ItemEditPage {
  switch (type) {
    case 'standard':
      return new ItemEditStandardPage(page);
    case 'combo':
      return new ItemEditComboPage(page);
    case 'side':
      return new ItemEditSidePage(page);
    default: {
      const exhaustiveCheck: never = type;
      throw new Error(`Unsupported item type: ${String(exhaustiveCheck)}`);
    }
  }
}
