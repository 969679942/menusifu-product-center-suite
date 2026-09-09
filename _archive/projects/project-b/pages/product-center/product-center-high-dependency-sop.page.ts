import type { Locator, Page, Response } from '@playwright/test';
import type { HighDependencySopDefinition } from '../../sop/product-center/product-center-high-dependency-sop.catalog';
import type { HighDependencySeedRecord } from '../../test-data/product-center/sop/product-center-high-dependency-data.factory';
import { step } from '../../utils/step';
import { waitUntil } from '../../utils/wait';

type HighDependencySopCase = HighDependencySopDefinition & { action: 'edit' | 'delete' };

export class ProductCenterHighDependencySopPage {
  readonly main: Locator;
  readonly locators: {
    loadingSpinner: Locator;
    recipeCategory: Locator;
    menuRecord: (identity: string) => Locator;
    printerRecord: (identity: string) => Locator;
    tableRecord: (id: number | string) => Locator;
    actionTrigger: (owner: Locator) => Locator;
    menuAction: (action: string) => Locator;
    relatedPrintersTitle: Locator;
    printerCard: (identity: string) => Locator;
    printerNameInput: (identity: string) => Locator;
    dialogConfirmButton: Locator;
    recipeShortNameInput: (shortName: string) => Locator;
    requiredNameInput: (identity: string) => Locator;
    pageConfirmButton: Locator;
    visibleDialog: Locator;
    deleteButton: (dialog: Locator) => Locator;
    exactText: (text: string) => Locator;
    exactTextWithin: (owner: Locator, text: string) => Locator;
  };

  constructor(private readonly page: Page) {
    this.main = page.locator('main:visible');
    this.locators = {
      loadingSpinner: this.main.locator('.ant-spin-spinning:visible'),
      recipeCategory: this.main.getByText('cc', { exact: true }),
      menuRecord: (identity) => this.main.locator('div[class^="listItem___"]:visible').filter({ hasText: identity }),
      printerRecord: (identity) => this.main.locator('tr:visible').filter({ hasText: identity }),
      tableRecord: (id) => this.main.locator(`[data-row-key="${id}"]:visible`),
      actionTrigger: (owner) => owner.locator('.ant-dropdown-trigger:visible'),
      menuAction: (action) => this.page.locator('.ant-dropdown:visible [role=menuitem]:visible').filter({ hasText: action }),
      relatedPrintersTitle: this.main.getByText('Related Printers', { exact: true }),
      printerCard: (identity) => this.main.locator('div[class^="printerCard___"]:visible').filter({ hasText: identity }),
      printerNameInput: (identity) => this.page.locator(`[role=dialog]:visible input[aria-required="true"][value="${identity}"]:visible`),
      dialogConfirmButton: this.page.locator('[role=dialog]:visible').getByRole('button', { name: 'Confirm', exact: true }),
      recipeShortNameInput: (shortName) => this.page.locator(`input[value="${shortName}"]:visible`),
      requiredNameInput: (identity) => this.page.locator(`input[aria-required="true"][value="${identity}"]:visible`),
      pageConfirmButton: this.page.getByRole('button', { name: 'Confirm', exact: true }),
      visibleDialog: this.page.locator('[role=dialog]:visible'),
      deleteButton: (dialog) => dialog.getByRole('button', { name: 'Delete', exact: true }),
      exactText: (text) => this.main.getByText(text, { exact: true }),
      exactTextWithin: (owner, text) => owner.getByText(text, { exact: true }),
    };
  }

  @step('打开高依赖实体页面并等待审计记录显示')
  async open(sopCase: HighDependencySopCase, record: HighDependencySeedRecord): Promise<void> {
    await this.openRoute(sopCase);
    await this.recordOwner(sopCase, record);
  }

  @step('打开高依赖实体路由并等待列表终态')
  async openRoute(sopCase: HighDependencySopCase, expandRecipeCategory = true): Promise<void> {
    if (sopCase.entityKey === 'printer') {
      await this.page.goto(sopCase.route, { waitUntil: 'domcontentloaded' });
    } else {
      const list = this.page.waitForResponse((response) => sopCase.listResponse.test(response.url()) && response.status() === 200, { timeout: 60_000 });
      await this.page.goto(sopCase.route, { waitUntil: 'domcontentloaded' });
      await list;
    }
    await this.main.waitFor({ state: 'visible', timeout: 30_000 });
    await waitUntil(
      () => this.locators.loadingSpinner.count(),
      (count) => count === 0,
      { timeout: 15_000, message: '高依赖实体列表加载状态未结束' },
    );
    if (sopCase.entityKey === 'recipe-ingredient' && expandRecipeCategory) await this.expandRecipeCategory();
  }

  @step('展开配方原料分类 cc')
  async expandRecipeCategory(): Promise<void> {
    const category = this.locators.recipeCategory;
    await waitUntil(() => category.count(), (count) => count === 1, { timeout: 30_000, message: '配方原料分类 cc 未唯一显示' });
    await category.click();
  }

  @step('精确定位高依赖审计记录')
  async recordOwner(sopCase: HighDependencySopCase, record: HighDependencySeedRecord): Promise<Locator> {
    let owner: Locator;
    if (sopCase.entityKey === 'menu') owner = this.locators.menuRecord(record.originalIdentity);
    else if (sopCase.entityKey === 'printer') owner = this.locators.printerRecord(record.originalIdentity);
    else owner = this.locators.tableRecord(record.id);
    await waitUntil(() => owner.count(), (count) => count === 1, { timeout: 60_000, message: `${sopCase.entityName}审计记录发生 locator drift` });
    return owner;
  }

  @step('打开高依赖实体操作菜单')
  async openActionMenu(sopCase: HighDependencySopCase, record: HighDependencySeedRecord): Promise<void> {
    const owner = await this.recordOwner(sopCase, record);
    const trigger = this.locators.actionTrigger(owner);
    await waitUntil(() => trigger.count(), (count) => count === 1, { timeout: 10_000, message: `${sopCase.entityName}菜单按钮未唯一显示` });
    await trigger.click();
  }

  @step('选择高依赖菜单动作：{0}')
  async chooseMenuAction(action: string): Promise<void> {
    const item = this.locators.menuAction(action);
    await waitUntil(() => item.count(), (count) => count === 1, { timeout: 10_000, message: `菜单动作 ${action} 未唯一显示` });
    await item.click();
  }

  @step('进入打印机二级相关页面')
  async enterPrinterRelated(sopCase: HighDependencySopCase, record: HighDependencySeedRecord): Promise<void> {
    await this.openActionMenu(sopCase, record);
    await this.chooseMenuAction('Related Printers');
    const title = this.locators.relatedPrintersTitle;
    await waitUntil(() => title.count(), (count) => count === 1, { timeout: 30_000, message: '关联打印机页面未显示' });
  }

  @step('定位打印机二级卡片')
  async printerCard(record: HighDependencySeedRecord): Promise<Locator> {
    const card = this.locators.printerCard(record.originalIdentity);
    await waitUntil(() => card.count(), (count) => count === 1, { timeout: 30_000, message: '打印机卡片未唯一显示' });
    return card;
  }

  @step('执行高依赖实体 UI 编辑')
  async editIdentity(sopCase: HighDependencySopCase, record: HighDependencySeedRecord): Promise<Response> {
    if (sopCase.entityKey === 'printer') {
      await this.enterPrinterRelated(sopCase, record);
      const card = await this.printerCard(record);
      await this.locators.actionTrigger(card).click();
      await this.chooseMenuAction('Edit');
      const input = this.locators.printerNameInput(record.originalIdentity);
      await waitUntil(() => input.count(), (count) => count === 1, { timeout: 60_000, message: '打印机名称输入框未完成原始身份回填' });
      await input.fill(record.editedIdentity);
      await this.waitInputSettled();
      const responsePromise = this.waitForEditResponse(sopCase, record);
      await this.locators.dialogConfirmButton.click();
      return responsePromise;
    }
    await this.openActionMenu(sopCase, record);
    await this.chooseMenuAction(sopCase.entityKey === 'menu' ? 'Edit Menu' : 'Edit');
    if (sopCase.entityKey === 'recipe-ingredient') {
      const input = this.locators.recipeShortNameInput(String(record.metadata.originalShortName));
      await waitUntil(() => input.count(), (count) => count === 1, { timeout: 30_000, message: '配方原料缩写输入框未唯一显示' });
      await input.fill(String(record.metadata.editedShortName));
    } else {
      const input = this.locators.requiredNameInput(record.originalIdentity);
      await waitUntil(() => input.count(), (count) => count === 1, { timeout: 60_000, message: '菜单名称输入框未完成原始身份回填' });
      await input.fill(record.editedIdentity);
    }
    await this.waitInputSettled();
    const responsePromise = this.waitForEditResponse(sopCase, record);
    await this.locators.pageConfirmButton.click();
    return responsePromise;
  }

  @step('执行高依赖实体 UI 删除')
  async deleteIdentity(sopCase: HighDependencySopCase, record: HighDependencySeedRecord): Promise<Response> {
    await this.openActionMenu(sopCase, record);
    await this.chooseMenuAction('Delete');
    const dialog = this.locators.visibleDialog;
    await waitUntil(() => dialog.count(), (count) => count === 1, { timeout: 30_000, message: `${sopCase.entityName}删除确认弹窗未唯一显示` });
    const responsePromise = this.waitForDeleteResponse(sopCase, record);
    const button = this.locators.deleteButton(dialog);
    await waitUntil(() => button.count(), (count) => count === 1, { timeout: 10_000, message: `${sopCase.entityName}删除确认按钮未唯一显示` });
    await button.click();
    return responsePromise;
  }

  @step('验证高依赖实体 UI 编辑终态')
  async verifyEditedUi(sopCase: HighDependencySopCase, record: HighDependencySeedRecord): Promise<void> {
    await this.open(sopCase, record);
    if (sopCase.entityKey === 'recipe-ingredient') {
      const owner = await this.recordOwner(sopCase, record);
      await waitUntil(() => this.locators.exactTextWithin(owner, String(record.metadata.editedShortName)).count(), (count) => count > 0, { timeout: 30_000, message: '配方原料编辑后缩写未显示' });
      return;
    }
    const text = this.locators.exactText(record.editedIdentity);
    await waitUntil(() => text.count(), (count) => count > 0, { timeout: 60_000, message: `${sopCase.entityName}编辑后 UI 终态不正确` });
  }

  @step('验证高依赖实体 UI 删除终态')
  async verifyDeletedUi(sopCase: HighDependencySopCase, record: HighDependencySeedRecord): Promise<void> {
    await this.openRoute(sopCase, false);
    if (sopCase.entityKey === 'recipe-ingredient') {
      const category = this.locators.recipeCategory;
      const categoryCount = await category.count();
      if (categoryCount === 0) return;
      if (categoryCount !== 1) throw new Error('配方原料分类 cc 未唯一显示');
      await category.click();
    }
    await waitUntil(() => this.locators.exactText(record.originalIdentity).count(), (count) => count === 0, { timeout: 10_000, message: `${sopCase.entityName}删除后 UI 仍存在审计身份` });
  }

  @step('等待高依赖实体编辑接口终态')
  async waitForEditResponse(sopCase: HighDependencySopCase, record: HighDependencySeedRecord): Promise<Response> {
    return this.page.waitForResponse((response) => response.request().method() === 'PUT' && response.ok() && mutationMatches(sopCase.entityKey, record, response.url()), { timeout: 60_000 });
  }
  @step('等待高依赖实体删除接口终态')
  async waitForDeleteResponse(sopCase: HighDependencySopCase, record: HighDependencySeedRecord): Promise<Response> {
    return this.page.waitForResponse((response) => response.request().method() === 'DELETE' && response.ok() && mutationMatches(sopCase.entityKey, record, response.url()), { timeout: 60_000 });
  }
  @step('等待输入状态稳定至少二百毫秒')
  async waitInputSettled(): Promise<void> { const at = Date.now(); await waitUntil(() => Date.now() - at, (elapsed) => elapsed >= 200, { timeout: 1_000, interval: 25, message: '输入状态未完成 200ms 稳定等待' }); }
}

function mutationMatches(entityKey: string, record: HighDependencySeedRecord, url: string): boolean {
  if (entityKey === 'recipe-ingredient') return url.includes(`/recipe-ingredients/${record.id}`);
  if (entityKey === 'menu') return url.includes(`/brand-menus/${record.id}`);
  if (entityKey === 'printer') return url.includes(`/printers/${record.id}`);
  return url.includes(`/brand-sections/${record.id}`);
}
