import type { Locator, Page, Response } from '@playwright/test';
import type { ProductCenterCreateSopDefinition } from '../../sop/product-center/product-center-create-sop.catalog';
import type { ProductCenterCreateContext } from '../../test-data/product-center/sop/product-center-create-data.factory';
import type { ProductCenterSopSeedRecord } from '../../test-data/product-center/sop/product-center-sop-data.factory';
import { assertNoProductCenterServerError } from '../../utils/product-center-page-health';
import { step } from '../../utils/step';
import { waitUntil } from '../../utils/wait';

export class ProductCenterCreateSopPage {
  readonly main: Locator;
  private readonly methodAddButton: Locator;
  private readonly methodGroupNameInput: Locator;
  private readonly methodDetailNameInput: Locator;

  constructor(private readonly page: Page) {
    this.main = page.locator('main:visible');
    this.methodAddButton = this.main.locator('button:visible').filter({ hasText: 'Add' });
    this.methodGroupNameInput = page.locator('input[aria-required="true"]:visible');
    this.methodDetailNameInput = page.locator('input[placeholder="eg: Sweet"]:visible');
  }

  @step('打开创建目标列表并等待业务接口终态')
  async openList(definition: ProductCenterCreateSopDefinition): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (response) => definition.listResponse.test(response.url()) && response.status() === 200,
      { timeout: 60_000 },
    );
    await this.page.goto(definition.route, { waitUntil: 'domcontentloaded' });
    await responsePromise;
    await waitUntil(async () => {
      await assertNoProductCenterServerError(this.page);
      return this.main.count();
    }, (count) => count === 1, {
      timeout: 30_000,
      message: `${definition.entityName}列表 main 容器不唯一`,
    });
  }

  @step('通过 UI 创建商品中心主实体')
  async create(
    definition: ProductCenterCreateSopDefinition,
    context: ProductCenterCreateContext,
  ): Promise<Response> {
    await this.openList(definition);
    if (definition.entityKey === 'category') return this.createCategory(definition, context);
    if (definition.entityKey === 'method') return this.createMethod(definition, context);
    if (definition.entityKey === 'material') return this.createMaterial(definition, context);
    if (definition.entityKey === 'seasoning') return this.createSeasoning(definition, context);
    return this.createBom(definition, context);
  }

  @step('创建商品分类')
  async createCategory(
    definition: ProductCenterCreateSopDefinition,
    context: ProductCenterCreateContext,
  ): Promise<Response> {
    const entry = this.main
      .locator('span[class^="plusText___"]:visible')
      .filter({ hasText: 'Add Category' });
    await this.clickUnique(entry, '商品分类创建入口');
    await this.fillUnique(this.main.locator('input[placeholder="Required"]:visible'), context.originalIdentity, '商品分类名称');
    await this.fillUnique(this.main.locator('input[placeholder="Optional"]:visible'), '审计分类', '商品分类第二语言');
    await this.fillUnique(this.main.locator('input[placeholder^="Example:"]:visible'), String(context.metadata.code), '商品分类编码');
    return this.submit(definition, 'Save');
  }

  @step('创建做法组')
  async createMethod(
    definition: ProductCenterCreateSopDefinition,
    context: ProductCenterCreateContext,
  ): Promise<Response> {
    await this.clickUnique(this.methodAddButton, '做法组创建入口');
    await waitUntil(() => new URL(this.page.url()).pathname, (pathname) => pathname.endsWith('/create'), {
      timeout: 30_000,
      message: '做法组未进入创建页面',
    });
    await this.fillUnique(this.methodGroupNameInput, context.originalIdentity, '做法组名称');
    await this.fillUnique(this.methodDetailNameInput, String(context.metadata.optionName), '做法项名称');
    return this.submit(definition, 'Confirm');
  }

  @step('创建做法组并采集做法明细名称边界证据')
  async createMethodDetailBoundary(
    definition: ProductCenterCreateSopDefinition,
    context: ProductCenterCreateContext,
    requestedDetailName: string,
  ): Promise<{
    response: Response;
    requestedLength: number;
    inputLengthBeforeSubmit: number;
    maxLengthAttribute: string | null;
  }> {
    await this.clickUnique(this.methodAddButton, '做法组创建入口');
    await waitUntil(() => new URL(this.page.url()).pathname, (pathname) => pathname.endsWith('/create'), {
      timeout: 30_000,
      message: '做法组未进入创建页面',
    });
    await this.fillUnique(this.methodGroupNameInput, context.originalIdentity, '做法组名称');
    await this.fillUnique(this.methodDetailNameInput, requestedDetailName, '做法明细名称');
    const inputLengthBeforeSubmit = (await this.methodDetailNameInput.inputValue()).length;
    const maxLengthAttribute = await this.methodDetailNameInput.getAttribute('maxlength');
    const response = await this.submit(definition, 'Confirm');
    return {
      response,
      requestedLength: requestedDetailName.length,
      inputLengthBeforeSubmit,
      maxLengthAttribute,
    };
  }

  @step('验证已保存做法明细名称在列表中可见')
  async expectMethodDetailVisible(recordId: number, detailName: string): Promise<void> {
    await waitUntil(() => new URL(this.page.url()).pathname, (pathname) => pathname === '/pp/brand/option-group/method', {
      timeout: 30_000,
      message: '做法明细保存后未返回做法组列表',
    });
    const row = this.methodRecordRow(recordId);
    const detailCells = this.methodDetailCells(recordId, detailName);
    await waitUntil(
      async () => ({
        rowCount: await row.count(),
        detailCellCount: await detailCells.count(),
      }),
      (state) => state.rowCount === 1 && state.detailCellCount === 1,
      { timeout: 60_000, interval: 500, message: '做法明细保存后的 UI 终态不正确' },
    );
  }

  @step('创建原料')
  async createMaterial(
    definition: ProductCenterCreateSopDefinition,
    context: ProductCenterCreateContext,
  ): Promise<Response> {
    await this.clickUnique(this.main.locator('button:visible').filter({ hasText: 'Add' }), '原料创建入口');
    await waitUntil(() => new URL(this.page.url()).pathname, (pathname) => pathname.endsWith('/create'), {
      timeout: 30_000,
      message: '原料未进入创建页面',
    });
    await this.fillUnique(this.page.locator('#name input:visible'), context.originalIdentity, '原料名称');
    await this.fillUnique(this.page.locator('#secondName input:visible'), '原料审计', '原料第二语言');
    await this.clickUnique(this.page.locator('#category:visible'), '原料分类选择器');
    await this.clickUnique(
      this.page.locator('.ant-cascader-menu:visible').getByText(String(context.metadata.categoryRootName), { exact: true }),
      '原料一级分类',
    );
    await this.clickUnique(
      this.page.locator('.ant-cascader-menu:visible').getByText(String(context.metadata.categoryChildName), { exact: true }),
      '原料二级分类',
    );
    return this.submit(definition, 'Confirm');
  }

  @step('创建品牌调味')
  async createSeasoning(
    definition: ProductCenterCreateSopDefinition,
    context: ProductCenterCreateContext,
  ): Promise<Response> {
    await this.clickUnique(this.main.locator('button:visible').filter({ hasText: 'Add Seasoning' }), '品牌调味创建入口');
    const menuItem = this.page
      .locator('.ant-dropdown:visible [role=menuitem]:visible')
      .filter({ hasText: 'Add Seasoning' });
    await this.clickUnique(menuItem, '品牌调味自定义创建菜单');
    await waitUntil(() => new URL(this.page.url()).pathname, (pathname) => pathname.endsWith('/create'), {
      timeout: 30_000,
      message: '品牌调味未进入创建页面',
    });
    await this.fillUnique(this.page.locator('input[aria-required="true"]:visible'), context.originalIdentity, '品牌调味名称');
    await this.fillUnique(this.page.locator('input[placeholder="eg: Sweet"]:visible'), String(context.metadata.optionName), '品牌调味项名称');
    return this.submit(definition, 'Confirm');
  }

  @step('创建配方单')
  async createBom(
    definition: ProductCenterCreateSopDefinition,
    context: ProductCenterCreateContext,
  ): Promise<Response> {
    await this.clickUnique(this.main.locator('button:visible').filter({ hasText: 'New Recipe' }), '配方单创建入口');
    await waitUntil(() => new URL(this.page.url()).pathname, (pathname) => pathname.endsWith('/create'), {
      timeout: 30_000,
      message: '配方单未进入创建页面',
    });
    const productSearch = this.page.locator('#itemId:visible');
    await this.fillUnique(productSearch, String(context.metadata.productIdentity), '配方单商品');
    const productOption = this.page
      .locator('.ant-select-dropdown:visible .ant-select-item-option:visible')
      .filter({ hasText: String(context.metadata.productIdentity) });
    await this.clickUnique(productOption, '配方单商品选项');
    await this.fillUnique(
      this.page.locator('input[placeholder="Please enter Recipe name"]:visible'),
      context.originalIdentity,
      '配方单名称',
    );
    const ingredientSearch = this.page.locator('input[type="search"][readonly]:visible');
    await this.clickUnique(ingredientSearch, '配方原料选择器');
    const ingredientOption = this.page
      .locator('.ant-select-dropdown:visible .ant-select-item-option:visible')
      .filter({ hasText: String(context.metadata.materialIdentity) });
    await this.clickUnique(ingredientOption, '配方原料选项');
    const formulaRow = this.page.locator('tr:visible').filter({ has: ingredientSearch });
    await waitUntil(() => formulaRow.count(), (count) => count === 1, {
      timeout: 10_000,
      message: '配方原料行不唯一',
    });
    await this.fillUnique(formulaRow.locator('input[placeholder="Input"]:visible'), '1', '配方用量');
    await this.fillUnique(this.page.locator('input[placeholder="eg:CHA"]:visible'), `A${String(Date.now()).slice(-8)}`, '配方缩写');
    return this.submit(definition, 'Save');
  }

  @step('重新打开列表并验证 UI 创建终态')
  async verifyCreatedUi(
    definition: ProductCenterCreateSopDefinition,
    record: ProductCenterSopSeedRecord,
  ): Promise<void> {
    await this.openList(definition);
    const owner = definition.entityKey === 'seasoning'
      ? this.main.locator('div[class*=groupItemContainer]').filter({ hasText: record.originalIdentity })
      : definition.entityKey === 'category'
        ? this.main.locator('tr:visible').filter({ hasText: record.originalIdentity })
        : this.main.locator(`tr[data-row-key="${record.id}"]:visible`);
    await waitUntil(
      async () => ({
        owner: await owner.count(),
        identity: await owner.getByText(record.originalIdentity, { exact: true }).count(),
      }),
      (state) => state.owner === 1 && state.identity > 0,
      { timeout: 60_000, message: `${definition.entityName}UI 创建终态不正确` },
    );
  }

  @step('等待输入状态稳定并提交创建')
  async submit(definition: ProductCenterCreateSopDefinition, buttonName: 'Save' | 'Confirm'): Promise<Response> {
    const startedAt = Date.now();
    await waitUntil(() => Date.now() - startedAt, (elapsed) => elapsed >= 200, {
      timeout: 1_000,
      interval: 25,
      message: '创建输入未完成 200ms 稳定等待',
    });
    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        definition.createResponse.test(response.url()) &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 60_000 },
    );
    const submit = this.page.getByRole('button', { name: buttonName, exact: true });
    await this.clickUnique(submit, `${definition.entityName}${buttonName}按钮`);
    return responsePromise;
  }

  @step('填写唯一字段：{2}')
  async fillUnique(locator: Locator, value: string, fieldName: string): Promise<void> {
    await waitUntil(async () => {
      await assertNoProductCenterServerError(this.page);
      return locator.count();
    }, (count) => count === 1, {
      timeout: 30_000,
      message: `${fieldName}不唯一`,
    });
    await locator.fill(value);
  }

  @step('点击唯一控件：{1}')
  async clickUnique(locator: Locator, controlName: string): Promise<void> {
    await waitUntil(
      async () => ({
        healthy: await assertNoProductCenterServerError(this.page).then(() => true),
        count: await locator.count(),
        visible: await locator.isVisible().catch(() => false),
        enabled: await locator.isEnabled().catch(() => false),
      }),
      (state) => state.healthy && state.count === 1 && state.visible && state.enabled,
      { timeout: 30_000, message: `${controlName}不可唯一操作` },
    );
    await locator.click();
  }

  private methodRecordRow(recordId: number): Locator {
    return this.main.locator(`tr[data-row-key="${recordId}"]:visible`);
  }

  private methodDetailCells(recordId: number, detailName: string): Locator {
    return this.methodRecordRow(recordId).locator('td:visible').filter({ hasText: detailName });
  }
}


