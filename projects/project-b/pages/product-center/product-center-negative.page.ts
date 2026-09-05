import type { Locator, Page } from '@playwright/test';
import type { ProductCenterNegativeCase } from '../../sop/product-center/product-center-negative-sop.catalog';
import { generateProductCenterSopCases } from '../../sop/product-center/product-center-sop-generator';
import { productCenterSopCatalog } from '../../sop/product-center/product-center-sop.catalog';
import { ProductCenterSopPage } from './product-center-sop.page';
import type { ProductCenterSopSeedRecord } from '../../test-data/product-center/sop/product-center-sop-data.factory';
import { settleInput } from '../../utils/input-settle';
import { step } from '../../utils/step';
import { waitUntil } from '../../utils/wait';

type TagBoundaryLocatorKey = 'tag-second-language' | 'tag-group-second-language';
type TagRoute = '/pp/brand/tag/statistic' | '/pp/brand/tag/description';

export class ProductCenterNegativePage {
  readonly main: Locator;
  readonly createTagButton: Locator;
  readonly createTagDialog: Locator;
  private readonly createTagDialogCloseButton: Locator;
  private readonly tagSecondLanguageInput: Locator;
  private readonly tagGroupSecondLanguageInput: Locator;
  private readonly categoryNameInput: Locator;
  private readonly categorySaveButton: Locator;
  private readonly categorySearchInput: Locator;

  constructor(private readonly page: Page) {
    this.main = page.locator('main:visible');
    this.createTagButton = page.getByRole('button', { name: 'plus Add', exact: true });
    this.createTagDialog = page.locator('[role=dialog]:visible');
    this.createTagDialogCloseButton = this.createTagDialog.getByRole('button', { name: 'close', exact: true });
    this.tagSecondLanguageInput = this.createTagDialog.locator('input[type="text"][maxlength="50"]');
    this.tagGroupSecondLanguageInput = this.createTagDialog.locator('input[type="text"][maxlength="10"]');
    this.categoryNameInput = this.main.locator('input[placeholder="Required"]:visible');
    this.categorySaveButton = page.getByRole('button', { name: 'Save', exact: true });
    this.categorySearchInput = page.getByRole('textbox', { name: 'Category Name', exact: true });
  }

  @step('执行商品中心负向场景：{0}')
  async execute(
    definition: ProductCenterNegativeCase,
    record?: ProductCenterSopSeedRecord,
  ): Promise<Record<string, unknown>> {
    if (isTagBoundaryCase(definition)) {
      await this.openTagCreateDialog(definition.route);
      try {
        return await this.readBoundaryResult(
          definition.boundary.locatorKey,
          definition.boundary.acceptedLength,
          definition.boundary.rejectedLength,
        );
      } finally {
        await this.closeTagCreateDialog();
      }
    }
    if (definition.id === 'category-required') return this.verifyCategoryRequired();
    if (definition.id === 'category-max-length') return this.verifyCategoryMaxLength(definition);
    if (definition.id === 'method-required') return this.verifyMethodRequired();
    if (definition.id === 'method-max-length') return this.verifyMethodMaxLength(definition);
    if (definition.id === 'addon-prerequisite') return this.verifyAddonPrerequisite();
    if (definition.id === 'printer-required') return this.verifyPrinterRequired();
    if (definition.id === 'category-cancel-delete') return this.verifyCategoryCancelDelete(requireSeedRecord(record));
    throw new Error(`未接入负向场景：${definition.id}`);
  }

  @step('打开标签页面并进入创建标签弹窗')
  async openTagCreateDialog(route: TagRoute): Promise<void> {
    const listResponse = this.page.waitForResponse(
      (response) => /brand-tags\/page/.test(response.url()) && response.status() === 200,
      { timeout: 60_000 },
    );
    await this.page.goto(route, { waitUntil: 'domcontentloaded' });
    await listResponse;
    await waitUntil(() => this.createTagButton.count(), (count) => count === 1, {
      timeout: 30_000,
      message: `${route} 创建标签入口未唯一显示`,
    });
    await this.createTagButton.click();
    await waitUntil(() => this.createTagDialog.count(), (count) => count === 1, {
      timeout: 30_000,
      message: `${route} 创建标签弹窗未唯一显示`,
    });
  }

  @step('验证标签第二语言字段边界：{0}')
  async readBoundaryResult(
    locatorKey: TagBoundaryLocatorKey,
    acceptedLength: number,
    rejectedLength: number,
  ): Promise<{
    acceptedValue: string;
    rejectedValue: string;
    maxLengthAttribute: string | null;
    locatorCount: number;
    visible: boolean;
    enabled: boolean;
  }> {
    const input = this.boundaryInput(locatorKey);
    await waitUntil(
      async () => ({
        count: await input.count(),
        visible: await input.isVisible().catch(() => false),
        enabled: await input.isEnabled().catch(() => false),
      }),
      (state) => state.count === 1 && state.visible && state.enabled,
      { timeout: 30_000, message: `${locatorKey} 输入框发生 locator drift` },
    );
    await input.fill('A'.repeat(acceptedLength));
    const acceptedValue = await input.inputValue();
    await input.fill('B'.repeat(rejectedLength));
    return {
      acceptedValue,
      rejectedValue: await input.inputValue(),
      maxLengthAttribute: await input.getAttribute('maxlength'),
      locatorCount: await input.count(),
      visible: await input.isVisible(),
      enabled: await input.isEnabled(),
    };
  }

  @step('关闭创建标签弹窗')
  async closeTagCreateDialog(): Promise<void> {
    await this.clickUnique(this.createTagDialogCloseButton, '创建标签弹窗关闭按钮');
    await waitUntil(() => this.createTagDialog.count(), (count) => count === 0, {
      timeout: 10_000,
      message: '创建标签弹窗未关闭',
    });
  }

  private boundaryInput(locatorKey: TagBoundaryLocatorKey): Locator {
    return locatorKey === 'tag-second-language'
      ? this.tagSecondLanguageInput
      : this.tagGroupSecondLanguageInput;
  }

  @step('打开商品分类创建页')
  async openCategoryCreate(): Promise<void> {
    const list = this.page.waitForResponse(
      (response) => /brand-categories\/treeList/.test(response.url()) && response.status() === 200,
      { timeout: 60_000 },
    );
    await this.page.goto('/pp/brand/category', { waitUntil: 'domcontentloaded' });
    await list;
    const entry = this.main.locator('span[class^="plusText___"]:visible').filter({ hasText: 'Add Category' });
    await this.clickUnique(entry, '商品分类创建入口');
  }

  @step('打开商品分类树')
  async openCategoryTree(): Promise<void> {
    const list = this.page.waitForResponse(
      (response) => /brand-categories\/treeList/.test(response.url()) && response.status() === 200,
      { timeout: 60_000 },
    );
    await this.page.goto('/pp/brand/category', { waitUntil: 'domcontentloaded' });
    await list;
  }

  @step('在父分类 {0} 下尝试新增子分类 {1}')
  async attemptAddChildCategory(
    parentCategoryName: string,
    childCategoryName: string,
  ): Promise<void> {
    await this.filterCategoryByName(parentCategoryName);
    await this.clickUnique(this.categoryAddChildButton(parentCategoryName), `${parentCategoryName}新增子分类入口`);
    await this.fillUnique(this.categoryNameInput, childCategoryName, '子分类名称');
    await settleInput();
    await this.clickUnique(this.categorySaveButton, '子分类保存按钮');
  }

  @step('读取父分类 {0} 下候选子分类 {1} 是否显示')
  async isChildCategoryVisible(
    parentCategoryName: string,
    childCategoryName: string,
  ): Promise<boolean> {
    await this.filterCategoryByName(parentCategoryName);
    const parentAction = this.categoryAddChildButton(parentCategoryName);
    await waitUntil(() => parentAction.count(), (count) => count === 1, {
      timeout: 30_000,
      message: `${parentCategoryName}新增子分类入口未唯一显示`,
    });
    return this.main.getByText(childCategoryName, { exact: true }).isVisible().catch(() => false);
  }

  @step('按分类名称过滤：{0}')
  async filterCategoryByName(categoryName: string): Promise<void> {
    const list = this.page.waitForResponse(
      (response) => /brand-categories\/treeList/.test(response.url()) && response.status() === 200,
      { timeout: 60_000 },
    );
    await this.categorySearchInput.fill(categoryName);
    await list;
    await waitUntil(
      () => this.page.locator('.ant-spin-spinning:visible').count(),
      (count) => count === 0,
      { timeout: 30_000, message: '分类搜索加载状态未结束' },
    );
  }

  @step('打开做法组创建页')
  async openMethodCreate(): Promise<void> {
    const list = this.page.waitForResponse(
      (response) => /brand-modifiers\/page/.test(response.url()) && response.status() === 200,
      { timeout: 60_000 },
    );
    await this.page.goto('/pp/brand/option-group/method', { waitUntil: 'domcontentloaded' });
    await list;
    await this.clickUnique(this.main.locator('button:visible').filter({ hasText: 'Add' }), '做法组创建入口');
    await waitUntil(() => new URL(this.page.url()).pathname, (path) => path.endsWith('/create'), {
      timeout: 30_000,
      message: '做法组未进入创建页',
    });
  }

  @step('验证商品分类必填负向场景')
  async verifyCategoryRequired(): Promise<Record<string, unknown>> {
    await this.openCategoryCreate();
    const mutationCounter = this.countMutations(/brand-categories$/);
    const save = this.page.getByRole('button', { name: 'Save', exact: true });
    const disabled = await save.isDisabled();
    return { success: disabled && mutationCounter.count() === 0, mutationCount: mutationCounter.count() };
  }

  @step('验证商品分类长度边界')
  async verifyCategoryMaxLength(definition: ProductCenterNegativeCase): Promise<Record<string, unknown>> {
    const boundary = requireBoundary(definition);
    await this.openCategoryCreate();
    const input = this.main.locator('input[placeholder="Required"]:visible');
    await this.fillUnique(input, 'A'.repeat(boundary.acceptedLength), '商品分类名称');
    const acceptedValue = await input.inputValue();
    await this.fillUnique(input, 'B'.repeat(boundary.rejectedLength), '商品分类名称');
    return {
      acceptedValue,
      rejectedValue: await input.inputValue(),
      maxLengthAttribute: await input.getAttribute('maxlength'),
    };
  }

  @step('验证做法组必填负向场景')
  async verifyMethodRequired(): Promise<Record<string, unknown>> {
    await this.openMethodCreate();
    const mutationCounter = this.countMutations(/brand-modifiers$/);
    await this.clickUnique(this.page.getByRole('button', { name: 'Confirm', exact: true }), '做法组确认按钮');
    const errorCount = await waitUntil(
      () => this.page.locator('.ant-form-item-explain-error:visible').count(),
      (count) => count > 0,
      { timeout: 10_000, message: '做法组必填错误未显示' },
    );
    return { success: errorCount > 0 && mutationCounter.count() === 0, mutationCount: mutationCounter.count() };
  }

  @step('验证做法组长度边界')
  async verifyMethodMaxLength(definition: ProductCenterNegativeCase): Promise<Record<string, unknown>> {
    const boundary = requireBoundary(definition);
    await this.openMethodCreate();
    const input = this.page.locator('input[aria-required="true"]:visible');
    await this.fillUnique(input, 'A'.repeat(boundary.acceptedLength), '做法组名称');
    const acceptedValue = await input.inputValue();
    await this.fillUnique(input, 'B'.repeat(boundary.rejectedLength), '做法组名称');
    return {
      acceptedValue,
      rejectedValue: await input.inputValue(),
      maxLengthAttribute: await input.getAttribute('maxlength'),
    };
  }

  @step('验证加料组缺少加料项前置负向场景')
  async verifyAddonPrerequisite(): Promise<Record<string, unknown>> {
    const list = this.page.waitForResponse(
      (response) => /brand-addon-group/.test(response.url()) && response.status() === 200,
      { timeout: 60_000 },
    );
    await this.page.goto('/pp/brand/option-group/additional', { waitUntil: 'domcontentloaded' });
    await list;
    await this.clickUnique(this.main.locator('button:visible').filter({ hasText: 'Add' }), '加料组创建入口');
    await waitUntil(() => new URL(this.page.url()).pathname, (path) => path.endsWith('/create'), {
      timeout: 30_000,
      message: '加料组未进入创建页',
    });
    const confirm = this.page.getByRole('button', { name: 'Confirm', exact: true });
    const disabled = await confirm.isDisabled();
    return { success: disabled, mutationCount: 0 };
  }

  @step('验证打印机必填负向场景')
  async verifyPrinterRequired(): Promise<Record<string, unknown>> {
    await this.page.goto('/poi/printer-stall/list', { waitUntil: 'domcontentloaded' });
    const row = this.main.locator('tr:visible').filter({ hasText: '厨房' });
    await waitUntil(() => row.count(), (count) => count === 1, {
      timeout: 60_000,
      message: '厨房打印档口行未唯一显示',
    });
    await row.locator('.ant-dropdown-trigger:visible').click();
    await this.clickUnique(
      this.page.locator('.ant-dropdown:visible [role=menuitem]:visible').filter({ hasText: 'Related Printers' }),
      '关联打印机菜单',
    );
    await waitUntil(() => new URL(this.page.url()).pathname, (path) => path.includes('/related-printer'), {
      timeout: 30_000,
      message: '关联打印机页面未完成导航',
    });
    await this.clickUnique(this.main.locator('button:visible').filter({ hasText: 'Add printer' }), '新增打印机入口');
    const mutationCounter = this.countMutations(/item-printers\/printers$/);
    const dialog = this.page.locator('[role=dialog]:visible');
    await this.clickUnique(dialog.getByRole('button', { name: 'Confirm', exact: true }), '新增打印机确认按钮');
    const errorCount = await waitUntil(
      () => dialog.locator('.ant-form-item-explain-error:visible').count(),
      (count) => count > 0,
      { timeout: 10_000, message: '打印机必填错误未显示' },
    );
    return { success: errorCount > 0 && mutationCounter.count() === 0, mutationCount: mutationCounter.count() };
  }

  @step('验证取消商品分类删除不会触发删除请求')
  async verifyCategoryCancelDelete(record: ProductCenterSopSeedRecord): Promise<Record<string, unknown>> {
    const definition = generateProductCenterSopCases(productCenterSopCatalog)
      .find((item) => item.entityKey === 'category' && item.action === 'delete');
    if (!definition) throw new Error('未找到商品分类删除 SOP 定义');
    const target = new ProductCenterSopPage(this.page);
    await target.open(definition, record);
    await target.openActionMenu(definition, record);
    await target.chooseMenuAction('Delete');
    const mutationCounter = this.countMutations(new RegExp(`/brand-categories/${record.id}$`));
    await this.clickUnique(
      this.page.locator('[role=dialog]:visible').getByRole('button', { name: 'Cancel', exact: true }),
      '商品分类删除取消按钮',
    );
    return { success: mutationCounter.count() === 0, mutationCount: mutationCounter.count() };
  }

  @step('填写唯一负向字段：{2}')
  async fillUnique(locator: Locator, value: string, fieldName: string): Promise<void> {
    await waitUntil(() => locator.count(), (count) => count === 1, {
      timeout: 30_000,
      message: `${fieldName}不唯一`,
    });
    await locator.fill(value);
  }

  @step('点击唯一负向控件：{1}')
  async clickUnique(locator: Locator, controlName: string): Promise<void> {
    await waitUntil(
      async () => ({
        count: await locator.count(),
        visible: await locator.isVisible().catch(() => false),
        enabled: await locator.isEnabled().catch(() => false),
      }),
      (state) => state.count === 1 && state.visible && state.enabled,
      { timeout: 30_000, message: `${controlName}不可唯一操作` },
    );
    await locator.click();
  }

  private categoryAddChildButton(parentCategoryName: string): Locator {
    return this.main.locator('div[class^="addRow___"]', { hasText: parentCategoryName });
  }

  private countMutations(pattern: RegExp): { count: () => number } {
    let mutationCount = 0;
    this.page.on('request', (request) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && pattern.test(request.url())) {
        mutationCount += 1;
      }
    });
    return { count: () => mutationCount };
  }
}

function requireSeedRecord(record: ProductCenterSopSeedRecord | undefined): ProductCenterSopSeedRecord {
  if (!record) throw new Error('负向取消删除缺少前置记录');
  return record;
}

function requireBoundary(definition: ProductCenterNegativeCase): NonNullable<ProductCenterNegativeCase['boundary']> {
  if (!definition.boundary) throw new Error(`负向场景缺少边界定义：${definition.id}`);
  return definition.boundary;
}

export function isTagBoundaryCase(
  definition: ProductCenterNegativeCase,
): definition is ProductCenterNegativeCase & {
  route: TagRoute;
  boundary: NonNullable<ProductCenterNegativeCase['boundary']> & { locatorKey: TagBoundaryLocatorKey };
} {
  return definition.scenario === 'max-length'
    && (definition.route === '/pp/brand/tag/statistic' || definition.route === '/pp/brand/tag/description')
    && (definition.boundary?.locatorKey === 'tag-second-language'
      || definition.boundary?.locatorKey === 'tag-group-second-language');
}
