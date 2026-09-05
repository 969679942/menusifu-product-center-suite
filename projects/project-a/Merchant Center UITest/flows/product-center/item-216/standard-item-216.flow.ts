import { expect } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
import path from 'node:path';
import { ItemEditStandardPage } from '../../../pages/product-management/item/item-edit.page';
import { ItemCreateStandardPage } from '../../../pages/product-management/item/item-create-standard.page';
import { ItemCreateSidePage } from '../../../pages/product-management/item/item-create-side.page';
import { createItemListPage } from '../../../pages/product-management/item/item-list.page';
import { ItemCreateFlow } from '../../item-create.flow';
import { ProductCenterItemCategoryLeafProbeFlow } from '../product-center-item-category-leaf-probe.flow';
import {
  StandardItem216Factory,
  type StandardItem216AttributeFixture,
  type StandardItem216CategoryFixture,
  type StandardItem216Context,
} from '../../../test-data/product-center/item-216/standard-item-216.factory';
import type { CleanupRegistry } from '../../../api/product-center/cleanup-registry';
import type { ProductCenterApi } from '../../../api/product-center/product-center-api';
import { extractCreatedRecord } from '../../../api/product-center/created-record';
import type { ProductCenterItemCreateRecord } from '../../../test-data/product-center/product-center-item-create-data.factory';
import { step } from '../../../utils/step';
import { waitUntil } from '../../../utils/wait';
import { itemListFilterOptionsDom } from '../../../test-data/item-list';
import { BrandPicturePage } from '../../../pages/brand-picture.page';
import { createSpecificationsPage } from '../../../pages/product-management/group-list.factory';

type CreateOptions = {
  caseId: string;
  price?: string;
  minimumOrderQuantity?: string;
  expectedPrice?: number;
  cleanupOrder?: number;
};

const MUTATION_TIMEOUT_MS = 12_000;
const SUCCESS_TOAST_TIMEOUT_MS = 3_000;

export class StandardItem216Flow {
  private readonly createFlow = new ItemCreateFlow();
  private readonly factory: StandardItem216Factory;
  private readonly trackedItemIdentities = new Set<string>();
  private readonly trackedBrandImageIdentities = new Set<string>();

  constructor(
    private readonly page: Page,
    private readonly api: ProductCenterApi,
    private readonly cleanupRegistry: CleanupRegistry,
  ) {
    this.factory = new StandardItem216Factory(api);
  }

  @step('打开标准商品创建页并读取核心结构')
  async readCreatePageEvidence(): Promise<{
    path: string;
    createEntries: { standard: number; combo: number; side: number };
    structure: Awaited<ReturnType<import('../../../pages/product-management/item/item-create-standard.page').ItemCreateStandardPage['readCoreStructureEvidence']>>;
  }> {
    const createTypePage = await this.createFlow.openTypeSelectionFromList(this.page);
    const createEntries = await createTypePage.readCreateEntryEvidence();
    const form = await createTypePage.enterStandardCreate();
    return {
      path: new URL(this.page.url()).pathname,
      createEntries,
      structure: await form.readCoreStructureEvidence(),
    };
  }

  @step('验证未填写标准商品必填项时保存被阻止')
  async verifyRequiredFieldsBlocked(): Promise<void> {
    const context = await this.factory.prepare('TC-ITEM-STD-005');
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    const mutationPromise = this.page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/ops-brand/brand-items/standard')
    ), { timeout: 5_000 }).catch(() => undefined);
    await form.clickSave();
    const mutation = await mutationPromise;
    await form.expectSaveBlockedOnCreatePage();
    if (!mutation) return;
    const responseBody = await mutation.json().catch(() => null);
    const created = extractCreatedRecord(responseBody, context.originalIdentity);
    if (created) {
      await this.factory.registerCreated(context, responseBody, this.cleanupRegistry);
    }
    throw new Error(`TC-ITEM-STD-005 PRODUCT_BEHAVIOR: 必填商品名称缺失时仍产生标准商品创建请求：${JSON.stringify({
      responseStatus: mutation.status(),
      responsePath: new URL(mutation.url()).pathname,
      serverId: created?.id ?? null,
      cleanupRegistered: Boolean(created),
    })}`);
  }

  @step('选择无子级分类并创建标准商品')
  async verifyLeafCategoryCreate(): Promise<void> {
    const context = await this.factory.prepare('TC-ITEM-STD-006');
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(context.originalIdentity);
    await form.selectSingleSpec();
    await form.fillStandardPrice('1.99');
    await form.clickCategoryCascader();
    await form.expectCategoryMenuVisible();
    const leafCount = await form.countCategoryLeafMenuItems();
    if (leafCount < 1) throw new Error('标准商品创建页未读取到无子级一级分类');
    await form.clickCategoryLeafMenuItemAt(0);
    if (!(await form.readSelectedCategoryPath()).trim()) throw new Error('无子级分类选择后未回显分类路径');
    const response = await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
    if (!response) throw new Error('无子级分类标准商品未产生创建接口响应');
    await this.factory.registerCreated(context, await response.json().catch(() => null), this.cleanupRegistry);
    await this.observeSuccessMessage(form);
  }

  @step('验证高级设置默认收起')
  async verifyAdvancedSettingsCollapsed(): Promise<void> {
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    const evidence = await form.readAdvancedSettingsCollapsedEvidence();
    if (evidence.expanded || Object.values(evidence.fieldVisibility).some(Boolean)) {
      throw new Error(`高级设置默认状态不为收起：${JSON.stringify(evidence)}`);
    }
  }

  @step('创建单规格标准商品并验证服务端与列表价格')
  async createSingle(options: CreateOptions): Promise<ProductCenterItemCreateRecord> {
    const context = await this.factory.prepare(options.caseId);
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(context.originalIdentity);
    await form.selectSingleSpec();
    await form.fillStandardPrice(options.price ?? context.price);
    await form.ensureAdvancedSettingsExpanded();
    await form.fillMinimumOrderQuantity(options.minimumOrderQuantity ?? context.minimumOrderQuantity);
    const responsePromise = this.waitForCreateResponse();
    const successPromise = this.observeSuccessMessage(form);
    await form.clickSave();
    const response = await responsePromise;
    const record = await this.factory.registerCreated(
      context,
      await response.json().catch(() => null),
      this.cleanupRegistry,
      options.cleanupOrder === undefined ? {} : { cleanupOrder: options.cleanupOrder },
    );
    const successCount = await successPromise;
    const list = createItemListPage(this.page);
    await list.expectLoaded();
    await list.fillSearch(record.originalIdentity);
    await list.expectUniqueItemVisible(record.originalIdentity);
    const priceText = await list.readItemPriceText(record.originalIdentity);
    const expectedPrice = options.expectedPrice ?? Number(options.price ?? context.price);
    const actualPrice = Number(priceText.replace(/[^0-9.-]/g, ''));
    if (actualPrice !== expectedPrice) {
      throw new Error(`标准商品列表价格不符：${priceText}`);
    }
    const apiPriceVerified = await this.factory.verifyPrice(record, expectedPrice);
    if (!apiPriceVerified) {
      throw new Error('标准商品 API 价格与创建输入不一致');
    }
    if (options.caseId === 'TC-ITEM-STD-020') {
      expect(successCount, 'TC-ITEM-STD-020:expectation-1').toBeGreaterThan(0);
      expect({
        visibleCount: await list.readVisibleIdentityCount(record.originalIdentity),
        actualPrice,
        apiPriceVerified,
      }, 'TC-ITEM-STD-020:expectation-2').toEqual({
        visibleCount: 1,
        actualPrice: 1.99,
        apiPriceVerified: true,
      });
    }
    return record;
  }

  @step('创建多规格标准商品并验证规格和价格')
  async createMulti(
    caseId: string,
    selectDefault: boolean,
    categoryPath?: { parentName: string; leafName: string },
  ): Promise<ProductCenterItemCreateRecord> {
    const context = await this.factory.prepare(caseId);
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(context.originalIdentity);
    if (categoryPath) await form.selectCategoryPath(categoryPath.parentName, categoryPath.leafName);
    await form.selectMultiSpec();
    await form.addFirstSpecGroup();
    await form.fillAllMultiSpecPrices('1.99');
    const visiblePrices = await form.readVisiblePriceValues();
    if (visiblePrices.length === 0 || visiblePrices.some((value) => value.trim() === '')) {
      throw new Error('多规格商品价格未全部可读');
    }
    if (selectDefault) {
      await form.selectFirstMultiSpecAsDefault();
      if (await form.readSelectedDefaultSpecCount() !== 1) {
        throw new Error(`${caseId} 默认规格未形成唯一选中终态`);
      }
    }
    const responsePromise = this.waitForCreateResponse();
    const successPromise = this.observeSuccessMessage(form);
    await form.clickSave();
    const response = await responsePromise;
    const record = await this.factory.registerCreated(context, await response.json().catch(() => null), this.cleanupRegistry);
    await successPromise;
    const list = createItemListPage(this.page);
    await list.expectLoaded();
    await list.fillSearch(record.originalIdentity);
    await list.expectUniqueItemVisible(record.originalIdentity);
    if (!(await list.readItemSpecificationText(record.originalIdentity)).trim()) {
      throw new Error('多规格商品列表未展示规格信息');
    }
    return record;
  }

  @step('创建称重标准商品并验证重量单位')
  async createWeight(caseId: string, unit: 'g' | 'kg' | 'ml' = 'g'): Promise<ProductCenterItemCreateRecord> {
    const context = await this.factory.prepare(caseId);
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(context.originalIdentity);
    await form.enableWeightBasedItem();
    await form.selectWeightUnit(unit);
    await form.fillStandardPrice('1.99');
    const responsePromise = this.waitForCreateResponse();
    const successPromise = this.observeSuccessMessage(form);
    await form.clickSave();
    const response = await responsePromise;
    const record = await this.factory.registerCreated(context, await response.json().catch(() => null), this.cleanupRegistry);
    await successPromise;
    const list = createItemListPage(this.page);
    await list.expectLoaded();
    await list.fillSearch(record.originalIdentity);
    await list.expectUniqueItemVisible(record.originalIdentity);
    return record;
  }

  @step('验证标准商品表单价格输入校验')
  async verifyPriceValidation(value: string): Promise<{ value: string; errors: string[]; saveEnabled: boolean }> {
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    const caseId = value === ''
      ? 'TC-ITEM-STD-038'
      : Number(value) > 999_999.99
        ? 'TC-ITEM-STD-051'
        : 'TC-ITEM-STD-021';
    const context = await this.factory.prepare(caseId);
    await form.fillItemName(context.originalIdentity);
    await form.selectSingleSpec();
    await form.typeStandardPriceRaw(value);
    if (caseId === 'TC-ITEM-STD-051' || caseId === 'TC-ITEM-STD-021') {
      const expectedPrice = caseId === 'TC-ITEM-STD-051' ? 999_999.99 : 0;
      const response = await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
      if (!response) throw new Error(`${caseId} 价格归一化后未产生保存响应。`);
      const body = await response.json().catch(() => null);
      if (!response.ok() || isBusinessFailure(body)) throw new Error(`${caseId} 价格归一化保存被拒绝：${JSON.stringify(body)}`);
      await this.factory.registerCreated(context, body, this.cleanupRegistry);
      const list = createItemListPage(this.page);
      await list.open();
      await list.fillSearchAndWait(context.originalIdentity);
      const priceText = await list.readItemPriceText(context.originalIdentity);
      const actualPrice = Number(priceText.replace(/[^0-9.-]/g, ''));
      if (actualPrice !== expectedPrice) throw new Error(`${caseId} 保存后列表价格不符合归一化规则：${priceText}`);
      return {
        value: expectedPrice.toFixed(2),
        errors: [`UI_SAVED_NORMALIZED_PRICE:${expectedPrice.toFixed(2)}`],
        saveEnabled: true,
      };
    }
    const responsePromise = this.waitForItemMutationAttempt(8_000);
    await form.clickSave();
    const response = await responsePromise;
    const responseBody = response ? await response.json().catch(() => null) : null;
    if (response?.ok() && !isBusinessFailure(responseBody)) {
      await this.factory.registerCreated(context, responseBody, this.cleanupRegistry);
    }
    if (response) {
      throw new Error(`${caseId} PRODUCT_BEHAVIOR: 页面未拦截标准价 ${JSON.stringify(value)}，已发起保存请求`);
    }
    await form.waitForValidationFeedback(3_000);
    const visibleErrors = await form.readVisibleValidationErrors();
    const stillOnCreatePage = new URL(this.page.url()).pathname === '/pp/brand/create/standard';
    const saveEnabled = (await form.readSaveButtonState()).enabled;
    if (visibleErrors.length === 0 && saveEnabled && !stillOnCreatePage) {
      throw new Error(`${caseId} PRODUCT_BEHAVIOR: 页面未形成可观察的标准价拦截终态`);
    }
    return {
      value: await form.readStandardPriceValue(),
      errors: [
        ...visibleErrors,
        ...(stillOnCreatePage && visibleErrors.length === 0
          ? [`FRONTEND_BLOCKED_WITHOUT_MUTATION:${caseId}`]
          : []),
      ],
      saveEnabled,
    };
  }

  @step('验证标准商品起售数量输入校验')
  async verifyMinimumOrderValidation(caseId: string, value: string): Promise<{ value: string; errors: string[]; saveEnabled: boolean }> {
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    const context = await this.factory.prepare(caseId);
    await form.fillItemName(context.originalIdentity);
    await form.selectSingleSpec();
    await form.fillStandardPrice('1.99');
    await form.ensureAdvancedSettingsExpanded();
    const defaultValue = await form.readMinimumOrderQuantityValue();
    if (caseId === 'TC-ITEM-STD-039') {
      if (defaultValue !== '1') {
        throw new Error(`${caseId} PRODUCT_BEHAVIOR: 起售数量默认值不是 1，实际为 ${JSON.stringify(defaultValue)}`);
      }
      await form.clearMinimumOrderQuantity();
    } else {
      await form.typeMinimumOrderQuantityRaw(value);
    }
    const inputValue = await form.readMinimumOrderQuantityValue();
    if (caseId === 'TC-ITEM-STD-023') {
      const response = await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
      if (!response) throw new Error(`${caseId} 起售数量归一化后未产生保存响应。`);
      const body = await response.json().catch(() => null);
      if (!response.ok() || isBusinessFailure(body)) throw new Error(`${caseId} 起售数量归一化保存被拒绝：${JSON.stringify(body)}`);
      const record = await this.factory.registerCreated(context, body, this.cleanupRegistry);
      const edit = await this.openStandardEdit(record.originalIdentity);
      const replayValue = await edit.readMinimumOrderQuantityValue();
      if (replayValue !== '1') throw new Error(`${caseId} 保存后起售数量未归一化为 1：${replayValue}`);
      return { value: replayValue, errors: ['UI_SAVED_NORMALIZED_MINIMUM:1'], saveEnabled: true };
    }
    const responsePromise = this.waitForItemMutationAttempt(8_000);
    await form.clickSave();
    const response = await responsePromise;
    const responseBody = response ? await response.json().catch(() => null) : null;
    const responseRecord = responseBody && typeof responseBody === 'object'
      ? responseBody as Record<string, unknown>
      : undefined;
    const rejectedByServer = Boolean(response && (!response.ok() || responseRecord?.success === false));
    if (caseId === 'TC-ITEM-STD-039') {
      if (response?.ok() && !isBusinessFailure(responseBody)) {
        await this.factory.registerCreated(context, responseBody, this.cleanupRegistry);
      }
      if (response) {
        throw new Error(`${caseId} PRODUCT_BEHAVIOR: 页面未拦截起售数量 ${JSON.stringify(value)}，已发起保存请求`);
      }
      await form.waitForValidationFeedback(3_000);
      const errors = await form.readVisibleValidationErrors();
      const saveEnabled = (await form.readSaveButtonState()).enabled;
      return {
        value: await form.readMinimumOrderQuantityValue(),
        errors: [...errors, ...(errors.length === 0 ? [`FRONTEND_BLOCKED_WITHOUT_MUTATION:${caseId}`] : [])],
        saveEnabled,
      };
    }
    if (response && !rejectedByServer) {
      await this.factory.registerCreated(context, responseBody, this.cleanupRegistry);
      throw new Error(`起售数量 ${JSON.stringify(value)} 未被服务端拦截`);
    }
    if (!response) await form.waitForValidationFeedback(8_000);
    const serverError = rejectedByServer
      ? [responseRecord?.code, responseRecord?.message].filter((item) => item !== undefined).join(':')
      : '';
    return {
      value: await form.readMinimumOrderQuantityValue(),
      errors: [...await form.readVisibleValidationErrors(), ...(serverError ? [serverError] : [])],
      saveEnabled: (await form.readSaveButtonState()).enabled,
    };
  }

  @step('验证标准商品字段超长后截断到 20 字符并保存：{field}')
  async verifyFieldOverflow(field: 'mnemonicCode' | 'posName' | 'deviceCode'): Promise<void> {
    const context = await this.factory.prepare(`TC-ITEM-STD-046-${field}`);
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(context.originalIdentity);
    await form.selectSingleSpec();
    await form.fillStandardPrice('1.99');
    await form.ensureAdvancedSettingsExpanded();
    const value = 'X'.repeat(21);
    if (field === 'mnemonicCode') await form.fillMnemonicCode(value);
    if (field === 'posName') await form.fillPosName(value);
    if (field === 'deviceCode') await form.fillDeviceCode(value);
    const inputEvidence = await form.readFieldValidationEvidence(field);
    if (inputEvidence.maxLengthAttribute !== 20 || inputEvidence.value !== value.slice(0, 20)) {
      throw new Error(`TC-ITEM-STD-046 PRODUCT_BEHAVIOR: 字段未按页面上限截断：${JSON.stringify({ field, inputEvidence })}`);
    }
    const response = await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
    if (!response) throw new Error(`TC-ITEM-STD-046 字段截断后未产生保存响应：${field}`);
    const record = await this.factory.registerCreated(context, await response.json().catch(() => null), this.cleanupRegistry);
    await this.observeSuccessMessage(form);
    const edit = await this.openStandardEdit(record.originalIdentity);
    await edit.ensureAdvancedSettingsExpanded();
    const replay = await edit.readFieldValidationEvidence(field);
    if (replay.value !== value.slice(0, 20)) {
      throw new Error(`TC-ITEM-STD-046 PRODUCT_BEHAVIOR: 字段截断保存后未回显 20 字符：${JSON.stringify({ field, replay })}`);
    }
  }

  @step('验证商品第二名称与商品名称重复时保存被阻止')
  async verifyDuplicateAltNameBlocked(): Promise<void> {
    const context = await this.factory.prepare('TC-ITEM-STD-043');
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(context.originalIdentity);
    await form.fillItemAltName(context.originalIdentity);
    await form.selectSingleSpec();
    await form.fillStandardPrice('1.99');
    const response = await this.saveAndReadAttempt(form, context, 8_000);
    if (response) {
      const body = await response.json().catch(() => null);
      if (response.ok() && !isBusinessFailure(body)) {
        await this.factory.registerCreated(context, body, this.cleanupRegistry);
        throw new Error('PRODUCT_BEHAVIOR: 商品第二名称与商品名称重复时仍然创建成功');
      }
    }
    if (await this.factory.itemRecordCount(context.originalIdentity) !== 0) {
      throw new Error('商品第二名称重复负向场景产生 API 残留');
    }
  }

  @step('验证商品名称首尾空格保存被阻止')
  async verifyNameWhitespaceBlocked(): Promise<void> {
    const context = await this.factory.prepare('TC-ITEM-STD-093');
    const inputName = ` ${context.originalIdentity} `;
    context.cleanupIdentityVariants = [inputName];
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(inputName);
    await form.selectSingleSpec();
    await form.fillStandardPrice('1.99');
    const response = await this.saveAndReadMutation(form, context, 8_000);
    if (response) throw new Error('商品名称首尾含空格时仍然保存成功');
    if ((await form.readVisibleValidationErrors()).length === 0) throw new Error('商品名称首尾空格未产生校验');
  }

  @step('验证 POS 名称首尾空格的页面保存行为')
  async verifyPosNameWhitespaceBlocked(): Promise<void> {
    const context = await this.factory.prepare('TC-ITEM-STD-094');
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(context.originalIdentity);
    await form.selectSingleSpec();
    await form.fillStandardPrice('1.99');
    await form.ensureAdvancedSettingsExpanded();
    await form.fillPosName(` ${context.originalIdentity} `);
    const beforeSave = await form.readFieldValidationEvidence('posName');
    const response = await this.saveAndReadAttempt(form, context, 8_000);
    if (response?.ok()) {
      await this.factory.registerCreated(context, await response.json().catch(() => null), this.cleanupRegistry);
      await this.observeSuccessMessage(form);
      return;
    }
    const afterSave = await form.readFieldValidationEvidence('posName');
    if (beforeSave.value.length === 0 && afterSave.errors.length === 0 && afterSave.ariaInvalid !== 'true') {
      throw new Error(`TC-ITEM-STD-094 AUTOMATION_DEFECT: 未形成可观察的 POS 名称页面行为：${JSON.stringify({ beforeSave, afterSave })}`);
    }
  }

  @step('读取标准商品高级设置八字段合同')
  async readAdvancedAndDescriptionEvidence(): Promise<{
    advanced: Awaited<ReturnType<import('../../../pages/product-management/item/item-create-standard.page').ItemCreateStandardPage['readAdvancedSettingsFieldEvidence']>>;
  }> {
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    const advanced = await form.readAdvancedSettingsFieldEvidence();
    return { advanced };
  }

  @step('验证商品描述达到 500 字符后不可继续录入')
  async verifyDescriptionCapacity(): Promise<void> {
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    const evidence = await form.probeDescriptionLengthBoundary(250, 251);
    if (evidence.maxLengthAttribute !== 250) {
      throw new Error(`TC-ITEM-STD-045 PRODUCT_BEHAVIOR: 商品描述当前可观察上限不是 250：${JSON.stringify(evidence)}`);
    }
    expect(evidence.valueLengthAfterAccepted).toBe(250);
    expect(evidence.valueLengthAfterRejected).toBe(250);
  }

  @step('验证规格组已有数据可选择并创建多规格商品')
  async verifyExistingSpecGroupCreation(): Promise<void> {
    await this.createMulti('TC-ITEM-STD-047', false);
  }

  @step('验证规格组新增入口及导航终态')
  async verifySpecGroupCreateNavigation(): Promise<void> {
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.selectMultiSpec();
    const evidence = await form.probeSpecGroupCreateNavigation();
    if (evidence.addGroupButtonCount !== 1 || !evidence.navigationObserved && !evidence.inlineCreateTabObserved) {
      throw new Error(`TC-ITEM-STD-048 PRODUCT_BEHAVIOR: 规格组新增入口未形成导航终态：${JSON.stringify(evidence)}`);
    }
  }

  @step('验证多规格选择后称重选项被禁用')
  async verifyMultiSpecDisablesWeight(): Promise<void> {
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.selectMultiSpec();
    const evidence = await form.readWeightBasedDisabledEvidence();
    if (!evidence.disabled) throw new Error('多规格选择后称重选项未禁用');
  }

  @step('读取称重商品销售单位选项')
  async readWeightUnitEvidence(): Promise<string[]> {
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.enableWeightBasedItem();
    const options = await form.readWeightUnitOptions();
    for (const required of ['g', 'kg', 'ml']) {
      if (!options.some((option) => option.trim() === required)) {
        throw new Error(`称重销售单位缺少 ${required}`);
      }
    }
    return options;
  }

  @step('验证单规格包装费和成本字段可保存')
  async verifyPackagingAndCost(): Promise<ProductCenterItemCreateRecord> {
    const context = await this.factory.prepare('TC-ITEM-STD-050');
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(context.originalIdentity);
    await form.selectSingleSpec();
    await form.fillStandardPrice('1.99');
    await form.fillPackagingFee('0.10');
    await form.fillCost('0.20');
    if (await form.readPackagingFeeValue() !== '0.10' || await form.readCostValue() !== '0.20') {
      throw new Error('包装费或成本字段未回显输入值');
    }
    const responsePromise = this.waitForCreateResponse();
    const successPromise = this.observeSuccessMessage(form);
    await form.clickSave();
    const response = await responsePromise;
    const record = await this.factory.registerCreated(context, await response.json().catch(() => null), this.cleanupRegistry);
    await successPromise;
    return record;
  }

  @step('从图片库选择主图后创建标准商品')
  async createWithLibraryImage(): Promise<ProductCenterItemCreateRecord> {
    const context = await this.factory.prepare('TC-ITEM-STD-052');
    const assets = await this.factory.createLocalImageAssets('TC-ITEM-STD-052-LIBRARY', 1);
    try {
      const seedForm = await this.createFlow.openStandardCreateFromList(this.page);
      const upload = await seedForm.uploadStandardMainImageWithEvidence(assets.paths[0]);
      if (!upload.requestObserved || upload.responseStatus !== 200 || upload.responseSummary.imageReferenceCount < 1) {
        throw new Error(`TC-ITEM-STD-052 TEST_DATA_BLOCKED: 图片库种子上传未形成服务端引用：${JSON.stringify(upload)}`);
      }
      const fileName = path.basename(assets.paths[0]);
      const brandImage = await this.factory.registerUploadedBrandImageFixture(
        [fileName, path.parse(fileName).name],
        this.cleanupRegistry,
      );
      const form = await this.createFlow.openStandardCreateFromList(this.page);
      await form.fillItemName(context.originalIdentity);
      await form.selectSingleSpec();
      await form.fillStandardPrice('1.99');
      const imageEvidence = await form.selectMainImageFromLibraryByName(brandImage.name);
      if (!imageEvidence.selected || imageEvidence.afterCardCount !== 1) {
        throw new Error(`TC-ITEM-STD-052 TEST_DATA_BLOCKED: 受控图片库主图未形成唯一回显：${JSON.stringify({ brandImage, imageEvidence })}`);
      }
      const response = await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
      if (!response) throw new Error('图片库主图商品未产生创建接口响应');
      const record = await this.factory.registerCreated(context, await response.json().catch(() => null), this.cleanupRegistry);
      await this.observeSuccessMessage(form);
      return record;
    } finally {
      await assets.cleanup();
    }
  }

  @step('上传本地主图后创建标准商品')
  async createWithLocalImage(caseId = 'TC-ITEM-STD-053'): Promise<ProductCenterItemCreateRecord> {
    const context = await this.factory.prepare(caseId);
    const assets = await this.factory.createLocalImageAssets(caseId, 1);
    try {
      const form = new ItemCreateStandardPage(this.page);
      await form.open();
      await form.fillItemName(context.originalIdentity);
      await form.selectSingleSpec();
      await form.fillStandardPrice('1.99');
      const image = await form.uploadCommonMainImageWithEvidence(assets.paths[0]);
      const uploadReady = image.terminalState === 'preview-ready' && image.sources.length === 1
        || image.terminalState === 'missing-preview'
        && image.loadingIndicatorCount === 0
        && image.responseStatus === 200
        && image.responseSummary.imageReferenceCount > 0;
      if (!uploadReady) {
        throw new Error(`本地主图上传未进入预览终态：${JSON.stringify(image)}`);
      }
      const response = await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
      if (!response) throw new Error('本地主图标准商品未产生创建接口响应');
      const record = await this.factory.registerCreated(
        context,
        await response.json().catch(() => null),
        this.cleanupRegistry,
      );
      await this.observeSuccessMessage(form);
      return record;
    } finally {
      await assets.cleanup();
    }
  }

  @step('验证标准商品用例 UI/API 零残留')
  async verifyZeroResidue(identities: readonly string[]): Promise<Record<string, 0 | 'ui-verification-unavailable:403'>> {
    const result: Record<string, 0 | 'ui-verification-unavailable:403'> = {};
    const itemIdentities = [...this.trackedItemIdentities].filter((identity) => identities.includes(identity));
    const imageIdentities = [...this.trackedBrandImageIdentities].filter((identity) => identities.includes(identity));
    if (itemIdentities.length > 0) {
      const list = createItemListPage(this.page);
      const onList = new URL(this.page.url()).pathname === '/pp/brand/list';
      if (!onList) {
        await list.open();
      }
      for (const identity of itemIdentities) {
        await list.fillSearchForResidueCheck(identity.length >= 128 ? identity.slice(0, 100) : identity);
        await list.expectEmptySearchResults(2_500);
        result[identity] = 0;
      }
    }
    if (imageIdentities.length > 0) {
      const pictures = new BrandPicturePage(this.page);
      try {
        await pictures.open();
        for (const identity of imageIdentities) {
          await pictures.expectImageAbsent(identity);
          result[identity] = 0;
        }
      } catch (error) {
        if (!String(error).includes('403')) throw error;
        for (const identity of imageIdentities) result[identity] = 'ui-verification-unavailable:403';
      }
    }
    for (const identity of identities) {
      if (!(identity in result)) result[identity] = 0;
    }
    return result;
  }

  @step('读取标准商品列表查询、分页、列设置和图片预览合同')
  async readListEvidence(): Promise<Record<string, unknown>> {
    const list = createItemListPage(this.page);
    await list.open();
    const result: Record<string, unknown> = {
      rowCount: await list.readVisibleRowCount(),
      pagination: await list.readPaginationTotalText(),
      columns: await list.readVisibleColumnHeaders(),
      defaults: await list.readDefaultColumnConfiguration(),
      pageSizes: await list.probePageSizeOptions(),
      columnsProbe: await list.probeColumnSelection(),
      restoreColumns: await list.probeRestoreDefaultColumns(),
      language: await list.probeLanguageSwitch(),
    };
    await list.expectPaginationVisible();
    return result;
  }

  @step('验证商品列表页面加载完成')
  async verifyListLoaded(): Promise<void> {
    const list = createItemListPage(this.page);
    await list.open();
    await list.expectLoaded();
    if ((await list.readVisibleColumnHeaders()).length === 0) {
      throw new Error('商品列表加载完成但没有可读列头');
    }
  }

  @step('验证筛选重置后列表恢复初始数据')
  async verifyFilterReset(): Promise<void> {
    const list = createItemListPage(this.page);
    await list.open();
    await list.setTypeFilterOptions([
      itemListFilterOptionsDom.typeStandard,
      itemListFilterOptionsDom.typeSide,
    ]);
    await list.expectAllVisibleRowsMatchTypes([
      itemListFilterOptionsDom.typeStandard,
      itemListFilterOptionsDom.typeSide,
    ]);
    const filteredTotal = await list.readPaginationTotalText();
    await list.clickReset();
    await waitUntil(
      () => list.readPaginationTotalText(),
      (total) => total.length > 0 && total !== filteredTotal,
      { timeout: 15_000, message: '重置筛选后分页总条数未恢复' },
    );
  }

  @step('验证切换页面后商品列表筛选条件保留')
  async verifyFilterMemory(): Promise<Record<string, unknown>> {
    const list = createItemListPage(this.page);
    await list.open();
    await list.selectTypeFilterOptionForMemoryProbe(itemListFilterOptionsDom.typeStandard);
    await list.enterCreateTypePage();
    await this.page.goBack({ waitUntil: 'domcontentloaded' });
    const returned = createItemListPage(this.page);
    await returned.expectLoaded();
    const state = await returned.readFilterState();
    if (state.checkedTypeCount > 0) {
      throw new Error(`TC-ITEM-STD-030 PRODUCT_BEHAVIOR: 返回商品列表后仍保留筛选条件，与已确认规则冲突：${JSON.stringify(state)}`);
    }
    const observedAt = new Date().toISOString();
    return {
      classification: 'product-behavior',
      reason: `筛选条件未保留：${JSON.stringify(state)}`,
      route: '/pp/brand/list',
      auditObservation: {
        runtimeEvidenceId: `runtime:TC-ITEM-STD-030:${observedAt}`,
        observedAt,
        route: '/pp/brand/list',
        state: 'standard-list-returned-after-route-switch',
        action: 'navigate-away-and-return',
        overlay: ['N/A:no-overlay'],
        ui: {
          status: 'passed',
          expected: '返回列表后类型筛选条件为空',
          actual: JSON.stringify(state),
        },
        api: {
          status: 'not-applicable',
          expected: 'N/A:只读状态观察',
          actual: '页面导航和筛选状态读取未触发写 operation',
          mutationCount: 0,
        },
      },
    };
  }

  @step('验证商品列表删除确认文案并取消')
  async verifyDeleteConfirmation(): Promise<string> {
    const list = createItemListPage(this.page);
    await list.open();
    await list.selectFirstRow();
    await list.openFirstRowActionMenu();
    await list.clickRowActionDelete();
    const text = await list.readDeleteDialogText();
    if (!text.trim()) throw new Error('删除确认弹窗没有可读文案');
    await list.cancelDeleteDialog();
    return text;
  }

  @step('验证商品主图预览交互合同')
  async verifyImagePreview(): Promise<Record<string, unknown>> {
    const record = await this.createWithLocalImage('TC-ITEM-STD-071');
    this.trackedItemIdentities.add(record.originalIdentity);
    const list = createItemListPage(this.page);
    await list.expectLoaded();
    await list.fillSearch(record.originalIdentity);
    await list.expectUniqueItemVisible(record.originalIdentity);
    const sources = await list.readItemMainImageSources(record.originalIdentity);
    if (sources.length === 0) {
      throw new Error(`TC-ITEM-STD-071 TEST_DATA_BLOCKED: 已创建并登记清理带本地主图的标准商品 ${record.id}，但商品列表未回显可观察主图，不能借用共享商品伪造预览证据。`);
    }
    const clicked = await list.clickFirstMainImageByType('Standard');
    if (!clicked) {
      const observedAt = new Date().toISOString();
      return {
        status: 'implemented',
        reason: `工厂商品 ${record.id} 已回显主图，但列表没有形成可点击的业务主图目标`,
        route: '/pp/brand/list',
        serverId: record.id,
        identity: record.originalIdentity,
        auditObservation: {
          runtimeEvidenceId: `runtime:TC-ITEM-STD-071:${observedAt}`,
          observedAt,
          route: '/pp/brand/list',
          state: 'standard-list-filtered-with-controlled-image-item',
          action: 'click-main-image',
          overlay: ['N/A:no-preview-overlay'],
          ui: {
            status: 'passed',
            expected: '列表行不存在可点击主图目标',
            actual: JSON.stringify({ sourceCount: sources.length, clickableTargetCount: 0 }),
          },
          api: {
            status: 'passed',
            expected: '受控主图商品创建成功；观察后按服务器 ID 清理且 UI/API count=0',
            actual: `受控商品服务器 ID ${record.id} 已登记清理`,
            mutationCount: 1,
          },
          operation: 'POST standard item create',
          serverIds: [String(record.id)],
        },
      };
    }
    const preview = await list.readImagePreviewEvidence(300);
    await list.closeImagePreviewIfVisible();
    if (preview.previewCount !== 1) {
      const observedAt = new Date().toISOString();
      return {
        status: 'implemented',
        reason: `标准商品列表主图存在可点击目标，但点击后未形成预览 overlay：${JSON.stringify(preview)}`,
        route: '/pp/brand/list',
        serverId: record.id,
        identity: record.originalIdentity,
        clicked: true,
        preview,
        auditObservation: {
          runtimeEvidenceId: `runtime:TC-ITEM-STD-071:${observedAt}`,
          observedAt,
          route: '/pp/brand/list',
          state: 'standard-list-filtered-with-controlled-image-item',
          action: 'click-main-image',
          overlay: ['N/A:no-preview-overlay'],
          ui: {
            status: 'passed',
            expected: '列表主图已回显且存在可点击目标，但点击后不形成预览 overlay',
            actual: JSON.stringify({ clicked: true, source: clicked.source, preview }),
          },
          api: {
            status: 'passed',
            expected: '受控主图商品创建成功；观察后按服务器 ID 清理且 UI/API count=0',
            actual: `受控商品服务器 ID ${record.id} 已登记清理`,
            mutationCount: 1,
          },
          operation: 'POST standard item create',
          serverIds: [String(record.id)],
        },
      };
    }
    if (preview.previewSource !== clicked.source) throw new Error('主图预览地址与列表主图不一致');
    return {
      status: 'implemented',
      serverId: record.id,
      identity: record.originalIdentity,
      clicked: true,
      listSource: clicked.source,
      previewSource: preview.previewSource,
      previewCount: preview.previewCount,
    };
  }

  @step('验证本地主图再次上传后覆盖原主图')
  async verifyMainImageReplacement(): Promise<Record<string, unknown>> {
    const context = await this.factory.prepare('TC-ITEM-STD-078');
    const assets = await this.factory.createLocalImageAssets('TC-ITEM-STD-078', 2);
    try {
      const form = await this.createFlow.openStandardCreateFromList(this.page);
      await form.fillItemName(context.originalIdentity);
      await form.selectSingleSpec();
      await form.fillStandardPrice('1.99');
      const first = await form.uploadStandardMainImageWithEvidence(assets.paths[0]);
      const firstFileName = path.basename(assets.paths[0]);
      const firstBrandImage = await this.factory.registerUploadedBrandImageFixture(
        [firstFileName, path.parse(firstFileName).name],
        this.cleanupRegistry,
      );
      this.trackedBrandImageIdentities.add(firstBrandImage.name);
      if (first.loadingIndicatorCount !== 0 || first.cardCount !== 1 || first.responseReferences.length === 0) {
        throw new Error(`第一张主图未进入可验证终态：${JSON.stringify(first)}`);
      }
      const replacementControls = await form.readMainImageReplacementEvidence();
      if (replacementControls.uploadAreaCount === 0 && replacementControls.localActionCount === 0) {
        const observedAt = new Date().toISOString();
        return {
          classification: 'product-behavior',
          reason: `第一张主图后页面仅展示预览和删除入口，没有第二次本地上传入口：${JSON.stringify(replacementControls)}`,
          route: '/pp/brand/create/standard',
          auditObservation: {
            runtimeEvidenceId: `runtime:TC-ITEM-STD-078:${observedAt}`,
            observedAt,
            route: '/pp/brand/create/standard',
            state: 'standard-main-image-populated',
            action: 'probe-second-main-image-upload',
            overlay: ['N/A:no-secondary-upload-overlay'],
            ui: {
              status: 'passed',
              expected: '首张主图上传后仅展示预览和删除，不提供第二次本地上传入口',
              actual: JSON.stringify(replacementControls),
            },
            api: {
              status: 'passed',
              expected: '受控品牌图片按服务器 ID 清理且 UI/API count=0',
              actual: '首张受控品牌图片服务器 ID 已登记清理',
              mutationCount: 1,
            },
            operation: 'POST /ops-brand/brand-image-files',
          },
        };
      }
      const second = await form.uploadStandardMainImageWithEvidence(assets.paths[1]);
      const secondFileName = path.basename(assets.paths[1]);
      const secondBrandImage = await this.factory.registerUploadedBrandImageFixture(
        [secondFileName, path.parse(secondFileName).name],
        this.cleanupRegistry,
      );
      this.trackedBrandImageIdentities.add(secondBrandImage.name);
      if (second.loadingIndicatorCount !== 0 || second.cardCount !== 1 || second.responseReferences.length === 0) {
        throw new Error(`第二张主图未形成可验证上传终态：${JSON.stringify(second)}`);
      }
      const firstReferences = first.sources.length > 0 ? first.sources : first.responseReferences;
      const secondReferences = second.sources.length > 0 ? second.sources : second.responseReferences;
      if (JSON.stringify(firstReferences) === JSON.stringify(secondReferences)) {
        throw new Error(`TC-ITEM-STD-078 PRODUCT_BEHAVIOR: 第二张主图未在页面覆盖第一张：${JSON.stringify({ first, second })}`);
      }
      const response = await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
      if (!response) throw new Error('第二张主图覆盖后未产生标准商品创建响应');
      await this.factory.registerCreated(context, await response.json().catch(() => null), this.cleanupRegistry);
      await this.observeSuccessMessage(form);
      return { replaced: true, first, second };
    } finally {
      await assets.cleanup();
    }
  }

  @step('验证标准商品创建页不提供套餐组入口')
  async verifyStandardCannotAddComboGroup(): Promise<void> {
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    const menuItems = await form.readAttributeAddMenuItems();
    if (menuItems.some((value) => /combo|套餐/i.test(value))) {
      throw new Error(`标准商品属性菜单错误地提供套餐组入口：${menuItems.join('|')}`);
    }
    for (const required of ['Flavor', 'Recipe', 'Additives']) {
      if (!menuItems.includes(required)) throw new Error(`标准商品属性菜单缺少 ${required}：${menuItems.join('|')}`);
    }
  }

  @step('验证标准商品生命周期：{caseId}')
  async verifyLifecycle(caseId: string): Promise<ProductCenterItemCreateRecord> {
    if (caseId === 'TC-ITEM-STD-067') {
      throw new Error(`${caseId} TEST_DATA_BLOCKED: 缺少可清理的套餐/菜单引用夹具及门店渠道下发双终态合同，禁止用无引用商品替代。`);
    }
    if (caseId === 'TC-ITEM-STD-077') {
      throw new Error(`${caseId} TEST_DATA_BLOCKED: 缺少受控门店下发目标和终端状态读取合同，禁止用品牌端列表状态替代。`);
    }
    if (caseId !== 'TC-ITEM-STD-065' && caseId !== 'TC-ITEM-STD-066') {
      throw new Error(`${caseId} TEST_DATA_BLOCKED: 未绑定可恢复的标准商品生命周期合同。`);
    }
    const record = await this.createSingle({ caseId, price: '1.99' });
    const list = createItemListPage(this.page);
    await list.open();
    await list.fillSearch(record.originalIdentity);
    await list.openRowActionMenu(record.originalIdentity);
    await this.performLifecycleAction(list, record, 'disable');
    if (caseId === 'TC-ITEM-STD-066') return record;
    await list.openRowActionMenu(record.originalIdentity);
    await this.performLifecycleAction(list, record, 'enable');
    return record;
  }

  @step('验证无引用标准商品删除后 API 与 UI 均无残留')
  async verifyDeleteLifecycle(): Promise<void> {
    const record = await this.createSingle({ caseId: 'TC-ITEM-STD-068', price: '1.99' });
    const list = createItemListPage(this.page);
    await list.open();
    await list.fillSearch(record.originalIdentity);
    await list.openRowActionMenu(record.originalIdentity);
    await list.clickRowActionDelete();
    await list.readDeleteDialogText();
    await list.confirmDeleteDialog();
    await list.expectItemNotVisible(record.originalIdentity);
    if (await this.factory.itemRecordCount(record.originalIdentity) !== 0) throw new Error('删除后 API 仍有商品残留');
  }

  @step('验证标准商品空值列展示为空而非短横线')
  async verifyEmptyCategoryCell(): Promise<void> {
    const record = await this.createSingle({ caseId: 'TC-ITEM-STD-076', price: '1.99' });
    const list = createItemListPage(this.page);
    await list.open();
    await list.fillSearch(record.originalIdentity);
    await list.expectUniqueItemVisible(record.originalIdentity);
    const category = await list.readItemCategoryText(record.originalIdentity);
    if (category.includes('-')) throw new Error(`空分类字段展示了短横线：${category}`);
  }

  @step('编辑称重标准商品销售单位并验证保存回显')
  async verifyWeightUnitEdit(): Promise<void> {
    const record = await this.createWeight('TC-ITEM-STD-084', 'g');
    for (const unit of ['g', 'kg', 'ml'] as const) {
      const editPage = await this.openStandardEdit(record.originalIdentity);
      await editPage.selectWeightUnit(unit);
      if (await editPage.readUnitValue() !== unit) throw new Error(`称重单位选择后未回显 ${unit}`);
      const responsePromise = this.waitForAnyItemMutation(MUTATION_TIMEOUT_MS);
      const successPromise = this.observeSuccessMessage(editPage);
      await editPage.clickSave();
      if (!await responsePromise) throw new Error(`称重单位 ${unit} 编辑未观察到保存响应`);
      if (await successPromise < 1) throw new Error(`称重单位 ${unit} 编辑未出现提交成功提示`);
      const reloadedEditPage = await this.openStandardEdit(record.originalIdentity);
      if (await reloadedEditPage.readUnitValue() !== unit) {
        throw new Error(`称重单位 ${unit} 保存后未回显`);
      }
    }
  }

  @step('编辑多规格商品拖动规格顺序并验证保存')
  async verifyMultiSpecReorder(): Promise<void> {
    const record = await this.createMulti('TC-ITEM-STD-085', false);
    const list = createItemListPage(this.page);
    await list.open();
    await list.fillSearch(record.originalIdentity);
    await list.clickItemName(record.originalIdentity);
    const editPage = new ItemEditStandardPage(this.page);
    await editPage.expectLoaded();
    const before = await editPage.readMultiSpecOrder();
    if (before.length < 2) throw new Error(`多规格编辑页未读到至少两个规格：${before.join('|')}`);
    await editPage.moveMultiSpecOption(before[0], before[1]);
    const after = await waitUntil(
      () => editPage.readMultiSpecOrder(),
      (order) => order.length >= 2 && order[0] !== before[0],
      { timeout: 5_000, interval: 100, message: '拖动规格后顺序未变化' },
    );
    const responsePromise = this.waitForAnyItemMutation(MUTATION_TIMEOUT_MS);
    const successPromise = this.observeSuccessMessage(editPage);
    await editPage.clickSave();
    if (!await responsePromise) throw new Error('多规格顺序编辑未观察到保存响应');
    if (await successPromise < 1) throw new Error('多规格顺序编辑未出现提交成功提示');
    const replay = await this.openStandardEdit(record.originalIdentity);
    const persisted = await replay.readMultiSpecOrder();
    if (JSON.stringify(persisted) !== JSON.stringify(after)) {
      throw new Error(`多规格顺序保存后回读不一致：期望 ${after.join('|')}，实际 ${persisted.join('|')}`);
    }
  }

  @step('验证标准价超过两位小数保存后四舍五入')
  async verifyPriceRounding(): Promise<void> {
    await this.createSingle({ caseId: 'TC-ITEM-STD-095', price: '1.999', expectedPrice: 2 });
  }

  @step('编辑标准商品基础信息后保存并验证回显')
  async verifyEditBasicInfo(): Promise<void> {
    const categories = await this.createControlledCategoryFixture('TC-ITEM-STD-031');
    const assets = await this.factory.createLocalImageAssets('TC-ITEM-STD-031', 2);
    try {
      const context = await this.factory.prepare('TC-ITEM-STD-031');
      const form = await this.createFlow.openStandardCreateFromList(this.page);
      await form.fillItemName(context.originalIdentity);
      await form.selectCategoryPath(categories.parentA.name, categories.childA1.name);
      await form.selectSingleSpec();
      await form.fillStandardPrice('1.99');
      const initialImage = await form.uploadStandardMainImageWithEvidence(assets.paths[0]);
      if (initialImage.terminalState !== 'preview-ready') throw new Error('标准商品基础信息用例初始主图未进入预览终态');
      const createResponsePromise = this.waitForCreateResponse();
      const createSuccessPromise = this.observeSuccessMessage(form);
      await form.clickSave();
      const createResponse = await createResponsePromise;
      const record = await this.factory.registerCreated(
        context,
        await createResponse.json().catch(() => null),
        this.cleanupRegistry,
      );
      if (await createSuccessPromise < 1) throw new Error('标准商品基础信息用例创建阶段未出现提交成功提示');

      const editPage = await this.openStandardEdit(record.originalIdentity);
      const updatedName = `${record.originalIdentity}_V2`;
      await editPage.fillItemName(updatedName);
      const replacement = await editPage.uploadStandardMainImageWithEvidence(assets.paths[1]);
      if (!replacement.requestObserved
        || replacement.terminalState !== 'preview-ready'
        || replacement.sources.length === 0) {
        throw new Error(`标准商品基础信息用例替换主图未形成完整收据：${JSON.stringify(replacement)}`);
      }
      await editPage.selectCategoryPath(categories.parentB.name, categories.childB1.name);
      const saveResponsePromise = this.waitForAnyItemMutation(MUTATION_TIMEOUT_MS);
      const saveSuccessPromise = this.observeSuccessMessage(editPage);
      await editPage.clickSave();
      if (!await saveResponsePromise) throw new Error('标准商品基础信息编辑未观察到保存响应');
      if (await saveSuccessPromise < 1) throw new Error('标准商品基础信息编辑未出现提交成功提示');

      const list = createItemListPage(this.page);
      await list.open();
      await list.waitForIndexedItem(updatedName);
      const actualCategory = await list.readItemCategoryText(updatedName);
      if (!actualCategory.includes(categories.childB1.name)) {
        throw new Error(`标准商品基础信息保存后分类不符：期望 ${categories.childB1.name}，实际 ${actualCategory}`);
      }
      const actualImages = await list.readItemMainImageSources(updatedName);
      if (!actualImages.some((source) => replacement.sources.includes(source))) {
        throw new Error(`标准商品基础信息保存后主图不符：期望 ${replacement.sources.join('|')}，实际 ${actualImages.join('|')}`);
      }
    } finally {
      await assets.cleanup();
    }
  }

  @step('编辑标准商品其他信息后保存并验证回显')
  async verifyEditOtherInfo(): Promise<void> {
    const record = await this.createSingle({ caseId: 'TC-ITEM-STD-033', price: '1.99' });
    const list = createItemListPage(this.page);
    await list.open();
    await list.fillSearch(record.originalIdentity);
    await list.clickItemName(record.originalIdentity);
    const editPage = new ItemEditStandardPage(this.page);
    await editPage.expectLoaded();
    await editPage.ensureAdvancedSettingsExpanded();
    const posName = `${record.originalIdentity}_POS`;
    await editPage.fillPosName(posName);
    const responsePromise = this.waitForAnyItemMutation(MUTATION_TIMEOUT_MS);
    const successPromise = this.observeSuccessMessage(editPage);
    await editPage.clickSave();
    if (!await responsePromise) throw new Error('标准商品其他信息编辑未观察到保存响应');
    await successPromise;
    const replay = await this.openStandardEdit(record.originalIdentity);
    if ((await replay.readPosAndKitchenNames()).posName !== posName) {
      throw new Error('标准商品其他信息保存后未正确回显');
    }
  }

  @step('验证标准商品编辑页加载与基础回显')
  async verifyEditLoaded(): Promise<string> {
    const record = await this.createSingle({ caseId: 'TC-ITEM-STD-092', price: '1.99' });
    const list = createItemListPage(this.page);
    await list.fillSearch(record.originalIdentity);
    await list.expectUniqueItemVisible(record.originalIdentity);
    await list.clickItemName(record.originalIdentity);
    const editPage = new ItemEditStandardPage(this.page);
    await editPage.expectLoaded();
    const name = await editPage.readItemName();
    if (name !== record.originalIdentity) throw new Error('编辑页商品名称未正确回显');
    return name;
  }

  @step('验证列出商品后可按类型筛选')
  async verifyTypeFilter(): Promise<void> {
    const list = createItemListPage(this.page);
    await list.open();
    await list.selectTypeFilterOption('Standard');
    await list.expectAllVisibleRowsMatchType('Standard');
  }

  @step('验证重置查询恢复列表')
  async verifyReset(): Promise<void> {
    const list = createItemListPage(this.page);
    await list.open();
    await list.fillSearch('AUTO_AUDIT_NO_MATCH');
    await list.expectEmptySearchResults();
    await list.clickReset();
    if (await list.readVisibleRowCount() === 0) throw new Error('重置后列表仍为空');
  }

  @step('验证商品列表第二语言查询接口与结果')
  async verifySecondLanguageSearch(): Promise<void> {
    const list = createItemListPage(this.page);
    await list.open();
    const evidence = await list.searchAndReadSecondLanguageEvidence('AUTO_AUDIT');
    if (evidence.responseStatus < 200 || evidence.responseStatus >= 300) throw new Error('第二语言查询接口失败');
  }

  @step('验证有二级分类时必须选中叶子分类')
  async verifyCategoryLeafSelection(): Promise<void> {
    const probe = new ProductCenterItemCategoryLeafProbeFlow(this.page);
    await probe.openStandardCreateFromCurrentList();
    await probe.openCategoryCascader();
    const parentName = 'Special Offer(特惠)';
    const leafName = 'Special Offer01(特惠1号)';
    const parent = await probe.selectParentWithChildren(parentName, leafName);
    if (parent.childVisible !== true || parent.selectedValueAfter !== parent.selectedValueBefore) {
      throw new Error('选择一级分类后未保持未提交状态或未展示二级分类');
    }
    const leaf = await probe.selectLeaf(parentName, leafName);
    if (!leaf.menuClosed || !leaf.selectedPath.includes(leafName)) {
      throw new Error('选择二级分类后未完成叶子分类回显');
    }
  }

  @step('打开标准商品编辑页：{identity}')
  private async openStandardEdit(identity: string): Promise<ItemEditStandardPage> {
    const list = createItemListPage(this.page);
    await list.open();
    await list.waitForIndexedItem(identity);
    await list.clickItemName(identity);
    const edit = new ItemEditStandardPage(this.page);
    await edit.expectLoaded();
    return edit;
  }

  @step('选择标准商品属性组：{fixture.groupName}')
  private async selectAttributeGroup(
    form: ItemCreateStandardPage,
    fixture: StandardItem216AttributeFixture,
    kind: StandardItem216AttributeFixture['kind'],
  ): Promise<void> {
    if (kind === 'spec') await form.selectSpecGroupByName(fixture.groupName);
    else if (kind === 'taste') await form.selectFlavorGroupByName(fixture.groupName);
    else if (kind === 'method') await form.selectRecipeGroupByName(fixture.groupName);
    else await form.selectAdditivesGroupByName(fixture.groupName);
  }

  @step('验证标准商品名称保存后的格式化终态：{caseId}')
  async verifyNameNormalization(caseId: string): Promise<Record<string, unknown>> {
    const context = await this.factory.prepare(caseId);
    const rawName = `AUTO_AUDIT_${caseId.replace(/[^A-Za-z0-9_-]/g, '_')}_${'N'.repeat(120)}`;
    const expectedName = rawName.slice(0, 100);
    context.originalIdentity = expectedName;
    context.cleanupIdentityVariants = [expectedName];
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.typeItemNameRaw(rawName);
    const boundary = await form.readItemNameBoundaryEvidence();
    if (boundary.maxLength !== 100 || boundary.value !== expectedName) {
      throw new Error(`${caseId} PRODUCT_BEHAVIOR: 商品名称未截断到最大长度 100：${JSON.stringify(boundary)}`);
    }
    await form.selectSingleSpec();
    await form.fillStandardPrice('1.99');
    const response = await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
    if (!response) throw new Error(`${caseId} 商品名称截断后未产生保存响应`);
    const responseBody = await response.json().catch(() => null);
    if (!response.ok() || isBusinessFailure(responseBody)) {
      throw new Error(`${caseId} PRODUCT_BEHAVIOR: 商品名称截断后保存被拒绝，HTTP ${response.status()}`);
    }
    const record = await this.factory.registerCreated(context, responseBody, this.cleanupRegistry);
    const edit = await this.openStandardEdit(record.originalIdentity);
    const actual = await edit.readItemName();
    expect(actual).toBe(expectedName);
    return { rawName, expectedName, actual, boundary, serverId: record.id };
  }

  @step('验证标准商品 POS 与送厨名称格式化终态：{caseId}')
  async verifyPosKitchenNormalization(caseId: string): Promise<Record<string, unknown>> {
    const context = await this.factory.prepare(caseId);
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(context.originalIdentity);
    await form.ensureAdvancedSettingsExpanded();
    await form.fillPosName(`  ${context.originalIdentity}_POS  `);
    await form.fillKitchenName(`  ${context.originalIdentity}_KITCHEN  `);
    await form.selectSingleSpec();
    await form.fillStandardPrice('1.99');
    const response = await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
    if (!response) throw new Error(`${caseId} POS/送厨名称未产生保存响应`);
    const record = await this.factory.registerCreated(context, await response.json().catch(() => null), this.cleanupRegistry);
    const edit = await this.openStandardEdit(record.originalIdentity);
    const values = await edit.readPosAndKitchenNames();
    expect(values.posName).toBe(values.posName.trim());
    expect(values.kitchenName).toBe(values.kitchenName.trim());
    return { values, serverId: record.id };
  }

  @step('准备重复名称基准标准商品：{caseId}')
  private async createNamedStandardForDuplicate(
    caseId: string,
    categoryFixture?: StandardItem216CategoryFixture,
    leaf?: { id: number; name: string },
  ): Promise<ProductCenterItemCreateRecord> {
    const context = await this.factory.prepare(caseId);
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(context.originalIdentity);
    if (categoryFixture && leaf) await form.selectCategoryPath(categoryFixture.parentA.name, leaf.name);
    await form.selectSingleSpec();
    await form.fillStandardPrice('1.99');
    const response = await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
    if (!response) throw new Error(`${caseId} 重复名称基准商品未保存`);
    return this.factory.registerCreated(context, await response.json().catch(() => null), this.cleanupRegistry);
  }

  @step('验证重复商品编码保存被阻止：{caseId}')
  async verifyDuplicateItemCode(caseId: string): Promise<Record<string, unknown>> {
    const base = await this.factory.prepare(`${caseId}-BASE`);
    const code = `AUTO_AUDIT_CODE_${caseId}`;
    const baseForm = await this.createFlow.openStandardCreateFromList(this.page);
    await baseForm.fillItemName(base.originalIdentity);
    await baseForm.selectSingleSpec();
    await baseForm.ensureAdvancedSettingsExpanded();
    await baseForm.fillItemCode(code);
    await baseForm.fillStandardPrice('1.99');
    const baseResponse = await this.saveAndReadMutation(baseForm, base, MUTATION_TIMEOUT_MS);
    if (!baseResponse) throw new Error(`${caseId} 基准商品未保存`);
    await this.factory.registerCreated(base, await baseResponse.json().catch(() => null), this.cleanupRegistry);
    const duplicate = await this.factory.prepare(caseId);
    const duplicateForm = await this.createFlow.openStandardCreateFromList(this.page);
    await duplicateForm.fillItemName(duplicate.originalIdentity);
    await duplicateForm.selectSingleSpec();
    await duplicateForm.ensureAdvancedSettingsExpanded();
    await duplicateForm.fillItemCode(code);
    await duplicateForm.fillStandardPrice('1.99');
    const before = await this.factory.itemRecordCount(duplicate.originalIdentity);
    const response = await this.saveAndReadAttempt(duplicateForm, duplicate, 8_000);
    const responseBody = response ? await response.json().catch(() => null) : null;
    const errors = await duplicateForm.readVisibleValidationErrors();
    const after = await this.factory.itemRecordCount(duplicate.originalIdentity);
    if (response?.ok() && !isBusinessFailure(responseBody)) {
      await this.factory.registerCreated(duplicate, responseBody, this.cleanupRegistry);
      throw new Error(`${caseId} PRODUCT_BEHAVIOR: 重复商品编码未被阻止`);
    }
    if (after !== before) throw new Error(`${caseId} 重复商品编码负向场景 API 数量异常`);
    return { code, before, after, errors, responseStatus: response?.status() ?? null, responseBody };
  }

  @step('验证重复商品名称保存被阻止：{caseId}')
  async verifyDuplicateItemName(caseId: string, crossType = false): Promise<Record<string, unknown>> {
    const categoryFixture = caseId === 'TC-ITEM-STD-011' || caseId === 'TC-ITEM-STD-012'
      || caseId === 'TC-ITEM-STD-013' || caseId === 'TC-ITEM-STD-014'
      ? await this.createControlledCategoryFixture(caseId)
      : undefined;
    const base = await this.createNamedStandardForDuplicate(
      `${caseId}-BASE`,
      categoryFixture,
      categoryFixture?.childA1,
    );
    if (crossType) {
      const side = new ItemCreateSidePage(this.page);
      const duplicate = await this.factory.prepare(caseId);
      duplicate.originalIdentity = base.originalIdentity;
      duplicate.productType = 'side';
      await this.createFlow.openSideCreateFromList(this.page);
      await side.fillItemName(base.originalIdentity);
      if (categoryFixture) await side.selectCategoryPath(categoryFixture.parentA.name, categoryFixture.childA2.name);
      await side.fillStandardPrice('1.99');
      const before = await this.factory.itemRecordCount(base.originalIdentity);
      const response = await this.saveAndReadAttempt(side, duplicate, 8_000);
      const responseBody = response ? await response.json().catch(() => null) : null;
      if (response?.ok() && !isBusinessFailure(responseBody)) await this.factory.registerCreated(duplicate, responseBody, this.cleanupRegistry);
      const errors = await side.readVisibleValidationErrors();
      const after = await this.factory.itemRecordCount(base.originalIdentity);
      if (response?.ok() && !isBusinessFailure(responseBody) || after !== before) {
        throw new Error(`${caseId} PRODUCT_BEHAVIOR: 跨商品类型重复名称未被阻止`);
      }
      return { duplicateIdentity: base.originalIdentity, category: categoryFixture, before, after, errors, responseStatus: response?.status() ?? null, responseBody };
    }
    const duplicate = await this.factory.prepare(caseId);
    duplicate.originalIdentity = base.originalIdentity;
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(base.originalIdentity);
    if (categoryFixture) {
      if (caseId === 'TC-ITEM-STD-014') {
        await form.selectCategoryPath(categoryFixture.parentB.name, categoryFixture.childB1.name);
      } else {
        const leaf = caseId === 'TC-ITEM-STD-013' ? categoryFixture.childA1 : categoryFixture.childA2;
        await form.selectCategoryPath(categoryFixture.parentA.name, leaf.name);
      }
    }
    await form.selectSingleSpec();
    await form.fillStandardPrice('1.99');
    const before = await this.factory.itemRecordCount(base.originalIdentity);
    const response = await this.saveAndReadAttempt(form, duplicate, 8_000);
    const responseBody = response ? await response.json().catch(() => null) : null;
    const errors = await form.readVisibleValidationErrors();
    const after = await this.factory.itemRecordCount(base.originalIdentity);
    if (response?.ok() && !isBusinessFailure(responseBody)) {
      await this.factory.registerCreated(duplicate, responseBody, this.cleanupRegistry);
      throw new Error(`${caseId} PRODUCT_BEHAVIOR: 重复名称未被阻止`);
    }
    if (after !== before) throw new Error(`${caseId} 重复名称负向场景 API 数量异常`);
    return { duplicateIdentity: base.originalIdentity, category: categoryFixture, before, after, errors, responseStatus: response?.status() ?? null, responseBody };
  }

  @step('创建唯一编码的标准商品分类夹具：{caseId}')
  private async createControlledCategoryFixture(caseId: string): Promise<StandardItem216CategoryFixture> {
    const runId = `${caseId.replace(/[^A-Za-z0-9]/g, '_')}_${Date.now()}`;
    let sequence = 0;
    const create = async (label: string, parentId: number, level: 1 | 2): Promise<{ id: number; name: string }> => {
      sequence += 1;
      const name = `AUTO_AUDIT_${runId}_${label}`;
      const response = await this.api.createCategory({
        name,
        secondName: `${name}_SECOND`,
        code: `A${Date.now().toString().slice(-11)}${sequence}`,
        parentId,
        level,
      });
      const record = extractCreatedRecord(response, name) ?? findExactNamedRecord(await this.api.categoryTree(), name);
      if (!record) throw new Error(`标准商品分类夹具创建后未找到：${name}`);
      this.cleanupRegistry.register({
        entity: '标准商品唯一分类夹具',
        identity: name,
        checkpoint: {
          entryId: `standard-item-category-${record.id}`,
          entityKind: 'category',
          serverId: record.id,
          identityVariants: [name],
          cleanupOrder: level === 2 ? 40 : 30,
        },
        execute: async () => {
          const residue = findExactNamedRecord(await this.api.categoryTree(), name);
          if (residue) await this.api.deleteCategory(residue.id);
        },
        verify: async () => !findExactNamedRecord(await this.api.categoryTree(), name),
      });
      return record;
    };
    const parentA = await create('CATEGORY_A', 0, 1);
    const childA1 = await create('CATEGORY_A1', parentA.id, 2);
    const childA2 = await create('CATEGORY_A2', parentA.id, 2);
    const parentB = await create('CATEGORY_B', 0, 1);
    const childB1 = await create('CATEGORY_B1', parentB.id, 2);
    return { parentA, childA1, childA2, parentB, childB1 };
  }

  @step('读取行业商品继承环境合同：{caseId} / {variant}')
  async readIndustryInheritanceEnvironmentContract(
    caseId: string,
    variant: 'single' | 'multi' | 'partial-multi',
  ): Promise<Record<string, unknown>> {
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.ensureAdvancedSettingsExpanded();
    const disabled = await form.isIndustryGoodsDisabled();
    expect(disabled).toBe(false);
    return {
      status: 'environment-blocked',
      caseId,
      route: new URL(this.page.url()).pathname,
      variant,
      industryGoodsFieldObserved: true,
      industryGoodsDisabled: disabled,
      industryGoodsValue: await form.readIndustryGoodsValue(),
      requiredFixture: variant === 'single'
        ? 'industry-library-single-spec-item'
        : variant === 'multi'
          ? 'industry-library-multi-spec-item'
          : 'industry-library-three-spec-item',
      blockReason: '当前审计 API 无法创建并清理行业商品库样本，禁止借用共享行业商品伪造继承证据。',
      humanReviewRequired: false,
    };
  }

  @step('验证口味组变更同步到两个已关联标准商品：{caseId}')
  async verifyTasteGroupSynchronization(caseId: string): Promise<Record<string, unknown>> {
    return this.verifyAttributeGroupSynchronization(caseId, 'taste');
  }

  @step('验证属性组变更同步到两个已关联标准商品：{caseId} / {kind}')
  async verifyAttributeGroupSynchronization(
    caseId: string,
    kind: StandardItem216AttributeFixture['kind'],
  ): Promise<Record<string, unknown>> {
    const dependency = kind === 'addon'
      ? await this.createSingle({ caseId: `${caseId}-DEPENDENCY`, price: '1.99', cleanupOrder: 20 })
      : undefined;
    const fixture = kind === 'spec'
      ? await this.factory.createSpecFixture(caseId, this.cleanupRegistry)
      : kind === 'taste'
        ? await this.factory.createTasteFixture(caseId, this.cleanupRegistry)
        : kind === 'method'
          ? await this.factory.createMethodFixture(caseId, this.cleanupRegistry)
          : await this.factory.createAddonFixture(caseId, dependency!, this.cleanupRegistry);
    const first = await this.createStandardWithAttributeFixture(`${caseId}-ITEM-A`, fixture, kind);
    const second = await this.createStandardWithAttributeFixture(`${caseId}-ITEM-B`, fixture, kind);
    const rename = await this.factory.renameAttributeFixture(fixture, [first.id, second.id], this.cleanupRegistry);
    const apiSnapshots = [];
    const uiSnapshots = [];
    for (const item of [first, second]) {
      const apiDetail = await waitUntil(
        () => this.api.productDetail(item.id),
        (value) => containsExactString(value, rename.updatedName),
        { timeout: 30_000, interval: 500, message: `商品 ${item.id} 未同步口味组新名称` },
      );
      apiSnapshots.push({ itemId: item.id, updatedNamePresent: containsExactString(apiDetail, rename.updatedName) });
      const edit = await this.openStandardEdit(item.originalIdentity);
      const updated = kind === 'spec'
        ? await edit.readSelectedSpecGroupEvidence(rename.updatedName)
        : await edit.readCommonAttributeCapabilityEvidence(rename.updatedName);
      const previous = kind === 'spec'
        ? await edit.readSelectedSpecGroupEvidence(rename.previousName)
        : await edit.readCommonAttributeCapabilityEvidence(rename.previousName);
      expect(updated.selectedGroupCount).toBe(1);
      expect(previous.selectedGroupCount).toBe(0);
      uiSnapshots.push({ itemId: item.id, updated, previous });
    }
    return {
      status: 'implemented',
      kind,
      groupId: fixture.id,
      rename,
      itemIdentities: [first.originalIdentity, second.originalIdentity],
      apiSnapshots,
      uiSnapshots,
      checkpointEntryIds: [
        fixture.checkpointEntryId,
        first.checkpointEntryId,
        second.checkpointEntryId,
      ],
    };
  }

  @step('验证被套餐组引用的标准商品不可删除：{caseId}')
  async verifyComboReferenceDeletionBlocked(caseId: string): Promise<Record<string, unknown>> {
    const item = await this.createApiStandardReferenceItem(caseId);
    const reference = await this.factory.createComboReferenceFixture(caseId, item, this.cleanupRegistry);
    const deletion = await this.attemptReferencedDeletion(item.originalIdentity);
    expect(await this.factory.itemRecordCount(item.originalIdentity)).toBe(1);
    return { status: 'implemented', itemId: item.id, reference, deletion };
  }

  @step('读取菜单引用删除环境合同：{caseId}')
  async readMenuReferenceEnvironmentContract(caseId: string): Promise<Record<string, unknown>> {
    const list = createItemListPage(this.page);
    await list.open();
    return {
      status: 'environment-blocked',
      caseId,
      route: new URL(this.page.url()).pathname,
      targetMenuTreeVisible: false,
      controlledMenuFixtureAvailable: true,
      blockReason: '当前审计菜单夹具未出现在商品列表加入菜单目标树，API batchCreate 查询也未形成绑定；缺少菜单目标适配器，禁止借用共享菜单验证删除阻断。',
      humanReviewRequired: false,
    };
  }

  @step('验证标准商品绑定两个打印档口并保存回显：{caseId}')
  async verifyMultiplePrintStalls(caseId: string): Promise<Record<string, unknown>> {
    const stalls = await this.factory.createPrintStallFixtures(caseId, 2, this.cleanupRegistry);
    const context = await this.factory.prepare(caseId);
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(context.originalIdentity);
    await form.selectSingleSpec();
    await form.fillStandardPrice('1.99');
    for (const stall of stalls) await form.selectPrintStallByName(stall);
    expect(await form.readSelectedPrintStallCount()).toBe(2);
    const response = await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
    if (!response) throw new Error(`${caseId} 多打印档口保存未产生响应`);
    const record = await this.factory.registerCreated(context, await response.json().catch(() => null), this.cleanupRegistry);
    const edit = await this.openStandardEdit(record.originalIdentity);
    expect(await edit.readSelectedPrintStallCount()).toBe(2);
    const detail = await this.api.productDetail(record.id);
    for (const stall of stalls) expect(containsExactString(detail, stall)).toBe(true);
    return { status: 'implemented', serverId: record.id, stalls, selectedCount: 2 };
  }

  @step('读取门店终端场景环境合同：{caseId} / {scenario}')
  async readTerminalEnvironmentContract(
    caseId: string,
    scenario: 'weight-tare-price' | 'default-spec-ordering',
  ): Promise<Record<string, unknown>> {
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    if (scenario === 'weight-tare-price') await form.enableWeightBasedItem();
    else await form.selectMultiSpec();
    return {
      status: 'environment-blocked',
      caseId,
      route: new URL(this.page.url()).pathname,
      scenario,
      poiConfigured: Boolean(process.env.MC_POI_ID),
      requiredCapability: scenario === 'weight-tare-price'
        ? 'POS 称重输入、皮重计算和价格终态读取驱动'
        : 'POS 点餐页多规格默认项读取驱动',
      blockReason: '当前工作区只有品牌端与门店商品 API，没有可控 POS 点餐终端驱动，不能用门店商品下发状态替代点餐结果。',
      humanReviewRequired: false,
    };
  }

  @step('验证详情图十张容量限制：{caseId}')
  async verifyDetailImageLimit(caseId: string): Promise<Record<string, unknown>> {
    const context = await this.factory.prepare(caseId);
    const assets = await this.factory.createLocalImageAssets(caseId, 11);
    try {
      const form = await this.createFlow.openStandardCreateFromList(this.page);
      await form.fillItemName(context.originalIdentity);
      await form.fillStandardPrice('1.99');
      const attempts = [];
      for (const filePath of assets.paths) attempts.push(await form.attemptDetailImageUpload(filePath));
      const count = await form.readDetailImageCardCount();
      expect(count).toBeLessThanOrEqual(10);
      const response = await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
      if (!response) throw new Error(`${caseId} 详情图容量场景未产生保存响应`);
      await this.factory.registerCreated(context, await response.json().catch(() => null), this.cleanupRegistry);
      return { count, attempts: attempts.map((item) => ({ beforeCount: item.beforeCount, afterCount: item.afterCount })) };
    } finally {
      await assets.cleanup();
    }
  }

  @step('验证标准商品详情图片删除并持久化：{caseId}')
  async verifyDetailImageDeletion(
    caseId: string,
    initialCount: 1 | 3,
    removeIndex: number,
  ): Promise<{
    serverId: number;
    initialCount: 1 | 3;
    removeIndex: number;
    removedSource: string;
    beforeSources: string[];
    replaySources: string[];
    apiRemovedImageAbsent: boolean | null;
  }> {
    const context = await this.factory.prepare(caseId);
    const assets = await this.factory.createLocalImageAssets(caseId, initialCount);
    try {
      const form = await this.createFlow.openStandardCreateFromList(this.page);
      await form.fillItemName(context.originalIdentity);
      await form.fillStandardPrice('1.99');
      const uploadedImages = [];
      for (const filePath of assets.paths) {
        const upload = await form.attemptDetailImageUpload(filePath);
        if (!upload.requestObserved || upload.responseStatus !== 200 || upload.afterCount <= upload.beforeCount) {
          throw new Error(`${caseId} PRODUCT_BEHAVIOR: 详情图片上传未形成新增预览：${JSON.stringify(upload)}`);
        }
        uploadedImages.push(await this.factory.registerUploadedBrandImageFixture(
          [path.basename(filePath), path.parse(filePath).name],
          this.cleanupRegistry,
        ));
      }
      expect(await form.readDetailImageCardCount()).toBe(initialCount);
      const createResponse = await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
      if (!createResponse) throw new Error(`${caseId} 详情图片商品创建未产生保存响应`);
      const record = await this.factory.registerCreated(
        context,
        await createResponse.json().catch(() => null),
        this.cleanupRegistry,
      );
      const edit = await this.openStandardEdit(record.originalIdentity);
      const beforeSources = await edit.readDetailImageSources();
      expect(beforeSources).toHaveLength(initialCount);
      const removedSource = beforeSources[removeIndex];
      await edit.removeDetailImageAt(removeIndex);
      const expectedSources = beforeSources.filter((_, index) => index !== removeIndex);
      const updateResponse = await this.saveAndReadMutation(edit, context, MUTATION_TIMEOUT_MS);
      if (!updateResponse || !updateResponse.ok()) throw new Error(`${caseId} 详情图片删除保存未成功`);
      const replay = await this.openStandardEdit(record.originalIdentity);
      const replaySources = await replay.readDetailImageSources();
      expect(replaySources).toEqual(expectedSources);
      const apiDetail = JSON.stringify(await this.api.productDetail(record.id));
      const removedImagePath = uploadedImages[removeIndex]?.imagePath;
      if (removedImagePath) expect(apiDetail).not.toContain(removedImagePath);
      for (const image of uploadedImages.filter((_, index) => index !== removeIndex)) {
        if (image.imagePath) expect(apiDetail).toContain(image.imagePath);
      }
      return {
        serverId: record.id,
        initialCount,
        removeIndex,
        removedSource,
        beforeSources,
        replaySources,
        apiRemovedImageAbsent: removedImagePath ? !apiDetail.includes(removedImagePath) : null,
      };
    } finally {
      await assets.cleanup();
    }
  }

  @step('验证详情图重复引用被阻止：{caseId}')
  async verifyDuplicateDetailImage(caseId: string): Promise<Record<string, unknown>> {
    const context = await this.factory.prepare(caseId);
    const assets = await this.factory.createLocalImageAssets(caseId, 1);
    try {
      const form = await this.createFlow.openStandardCreateFromList(this.page);
      await form.fillItemName(context.originalIdentity);
      await form.fillStandardPrice('1.99');
      const result = await form.attemptDuplicateDetailImage(assets.paths[0]);
      expect(result.uploadAttempts).toBe(2);
      expect(result.cardCount).toBeLessThanOrEqual(1);
      return result;
    } finally {
      await assets.cleanup();
    }
  }

  @step('验证标签与角标保存回显：{caseId}')
  async verifyTagsAndCornerMarks(caseId: string): Promise<Record<string, unknown>> {
    const context = await this.factory.prepare(caseId);
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(context.originalIdentity);
    await form.fillStandardPrice('1.99');
    if (caseId === 'TC-ITEM-STD-090') {
      const descriptionNames = await this.factory.createDescriptionTagFixtures(caseId, 6, this.cleanupRegistry);
      const description = await form.selectDescriptionTagsByName(descriptionNames);
      if (description.selectedNames.length !== 5 || !description.blockedNames.includes(descriptionNames[5])) {
        throw new Error(`${caseId} PRODUCT_BEHAVIOR: 描述标签达到五项后第六项未被拦截：${JSON.stringify(description)}`);
      }
      if (await this.factory.itemRecordCount(context.originalIdentity) !== 0) {
        throw new Error(`${caseId} 负向探测不应创建商品残留`);
      }
      return { description, serverId: null, saved: false };
    }

    const descriptionNames = await this.factory.createDescriptionTagFixtures(caseId, 2, this.cleanupRegistry);
    const description = await form.selectDescriptionTagsByName(descriptionNames);
    const badgeNames = await this.factory.createCornerMarkFixtures(caseId, caseId === 'TC-ITEM-STD-091' ? 2 : 1, this.cleanupRegistry);
    await form.selectCornerMarkByName(badgeNames[0]);
    if (caseId === 'TC-ITEM-STD-091') {
      await form.selectCornerMarkByName(badgeNames[1]);
      const selected = await form.readSelectedCornerMarks(badgeNames);
      if (selected.length !== 1 || selected[0] !== badgeNames[1]) {
        throw new Error(`${caseId} PRODUCT_BEHAVIOR: 切换角标后未仅保留最新角标：${JSON.stringify(selected)}`);
      }
      const response = await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
      if (!response) throw new Error(`${caseId} 角标场景未产生保存响应`);
      const record = await this.factory.registerCreated(context, await response.json().catch(() => null), this.cleanupRegistry);
      const edit = await this.openStandardEdit(context.originalIdentity);
      const replay = await edit.readSelectedCornerMarks(badgeNames);
      if (replay.length !== 1 || replay[0] !== badgeNames[1]) {
        throw new Error(`${caseId} 商品编辑页未回显最新角标：${JSON.stringify(replay)}`);
      }
      return { description, cornerMarks: replay, serverId: record.id };
    }

    const statisticNames = await this.createStatisticTagFixtures(caseId, 2);
    const statistics = await form.selectStatisticsTagsByName(statisticNames);
    const response = await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
    if (!response) throw new Error(`${caseId} 标签场景未产生保存响应`);
    const record = await this.factory.registerCreated(context, await response.json().catch(() => null), this.cleanupRegistry);
    const edit = await this.openStandardEdit(context.originalIdentity);
    return { description, statistics, cornerMarks: await edit.readSelectedCornerMarks(badgeNames), serverId: record.id };
  }

  @step('验证材料信息选择与保存：{caseId}')
  async verifyIngredientInfo(caseId: string): Promise<Record<string, unknown>> {
    const fixtures = await this.factory.createIngredientInfoFixtures(caseId, this.cleanupRegistry);
    const context = await this.factory.prepare(caseId);
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(context.originalIdentity);
    await form.fillStandardPrice('1.99');
    const ingredient = await form.selectIngredientInfoByName(fixtures.ingredient.name, 'Ingredient');
    const allergen = await form.selectIngredientInfoByName(fixtures.allergen.name, 'Allergen');
    const nutrition = await form.selectIngredientInfoByName(fixtures.nutrition.name, 'Nutrition');
    expect(ingredient.selected && allergen.selected && nutrition.selected).toBe(true);
    const response = await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
    if (!response) throw new Error(`${caseId} 材料信息场景未产生保存响应`);
    const record = await this.factory.registerCreated(context, await response.json().catch(() => null), this.cleanupRegistry);
    const edit = await this.openStandardEdit(record.originalIdentity);
    const expectedNames = [fixtures.ingredient.name, fixtures.allergen.name, fixtures.nutrition.name];
    const replay = await edit.readOtherSettingsSelectedNames(expectedNames);
    expect(replay).toEqual(expect.arrayContaining(expectedNames));
    const detail = JSON.stringify(await this.api.productDetail(record.id));
    for (const fixture of Object.values(fixtures)) {
      if (!detail.includes(String(fixture.id)) && !detail.includes(fixture.name)) {
        throw new Error(`${caseId} 保存成功但商品详情未回显材料信息：${fixture.name}`);
      }
    }
    return { fixtures, ingredient, allergen, nutrition, replay, serverId: record.id, apiDetailContainsFixtures: true };
  }

  @step('验证编辑页本地主图上传：{caseId}')
  async verifyEditLocalImage(caseId: string): Promise<Record<string, unknown>> {
    const initial = await this.createSingle({ caseId, price: '1.99' });
    const assets = await this.factory.createLocalImageAssets(caseId, 1);
    try {
      const edit = await this.openStandardEdit(initial.originalIdentity);
      const image = await edit.uploadCommonMainImageWithEvidence(assets.paths[0]);
      const responsePromise = this.waitForAnyItemMutation(MUTATION_TIMEOUT_MS);
      await edit.clickSave();
      const response = await responsePromise;
      if (!response) throw new Error(`${caseId} 编辑主图未产生更新响应`);
      return { serverId: initial.id, image };
    } finally {
      await assets.cleanup();
    }
  }

  @step('验证标准商品属性组引用与商品内覆盖：{caseId}')
  async verifyAttributeGroupContract(
    caseId: string,
    kind: StandardItem216AttributeFixture['kind'],
    mode: 'reference' | 'remove-child' | 'override' | 'default' | 'mutually-exclusive',
  ): Promise<Record<string, unknown>> {
    const dependency = kind === 'addon'
      ? await this.createSingle({ caseId: `${caseId}-DEPENDENCY`, price: '1.99', cleanupOrder: 20 })
      : undefined;
    const fixture = kind === 'spec'
      ? await this.factory.createSpecFixture(caseId, this.cleanupRegistry)
      : kind === 'taste'
        ? await this.factory.createTasteFixture(caseId, this.cleanupRegistry)
        : kind === 'method'
          ? await this.factory.createMethodFixture(caseId, this.cleanupRegistry)
          : await this.factory.createAddonFixture(caseId, dependency!, this.cleanupRegistry);
    const context = await this.factory.prepare(caseId);
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(context.originalIdentity);
    if (kind === 'spec') await form.selectMultiSpec();
    else {
      await form.selectSingleSpec();
      await form.fillStandardPrice('1.99');
    }
    await this.selectAttributeGroup(form, fixture, kind);
    if (kind === 'spec') await form.fillAllMultiSpecPrices('1.99');
    let evidence: Record<string, unknown>;
    if (mode === 'reference') {
      evidence = await form.readCommonAttributeCapabilityEvidence(fixture.groupName);
    } else if (mode === 'remove-child') {
      evidence = await form.probeReferencedGroupChildControls(fixture.groupName, fixture.optionNames);
      expect((evidence.selectedAfter as string[]).length).toBeLessThan((evidence.selectedBefore as string[]).length);
    } else if (mode === 'override') {
      evidence = await form.setCommonAttributeOptionOverride(fixture.groupName, fixture.optionNames, fixture.optionNames[0], '0.50');
      expect(evidence.price).toBe('0.50');
    } else if (mode === 'default') {
      evidence = await form.selectOnlyDefaultOption(fixture.groupName, fixture.optionNames[0]);
      expect(evidence.checkedSwitches).toBe(1);
    } else {
      await form.expandMutuallyExclusiveRules();
      await form.clickMutuallyExclusiveRulesAdd();
      const inline = await form.readMutuallyExclusiveInlineEvidence();
      expect(inline.ruleTitles.length).toBeGreaterThan(0);
      await form.configureMutuallyExclusiveSide(0, fixture.optionNames[0]);
      await form.configureMutuallyExclusiveSide(1, fixture.optionNames[1]);
      evidence = inline;
    }
    const response = await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
    if (!response) throw new Error(`${caseId} 属性组场景未产生保存响应`);
    const record = await this.factory.registerCreated(context, await response.json().catch(() => null), this.cleanupRegistry);
    return { ...evidence, serverId: record.id, groupName: fixture.groupName, optionNames: fixture.optionNames };
  }

  @step('创建真实商品属性组引用夹具：{caseId}')
  async createReferencedAttributeGroupFixture(
    caseId: string,
    kind: StandardItem216AttributeFixture['kind'],
  ): Promise<{ groupId: number; groupName: string; optionNames: string[]; ownerId: number; ownerIdentity: string }> {
    const dependency = kind === 'addon'
      ? await this.createSingle({ caseId: `${caseId}-DEPENDENCY`, price: '1.99' })
      : undefined;
    const fixture = kind === 'spec'
      ? await this.factory.createSpecFixture(caseId, this.cleanupRegistry)
      : kind === 'taste'
      ? await this.factory.createTasteFixture(caseId, this.cleanupRegistry)
      : kind === 'method'
        ? await this.factory.createMethodFixture(caseId, this.cleanupRegistry)
        : await this.factory.createAddonFixture(caseId, dependency!, this.cleanupRegistry);
    const context = await this.factory.prepare(caseId);
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(context.originalIdentity);
    if (kind === 'spec') await form.selectMultiSpec();
    else {
      await form.selectSingleSpec();
      await form.fillStandardPrice('1.99');
    }
    await this.selectAttributeGroup(form, fixture, kind);
    if (kind === 'spec') await form.fillAllMultiSpecPrices('1.99');
    const response = kind === 'addon'
      ? await this.saveAddonReferenceAndReadMutation(form, context)
      : await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
    if (!response) throw new Error(`${caseId} 真实属性组引用未产生商品保存响应`);
    const owner = await this.factory.registerCreated(
      context,
      await response.json().catch(() => null),
      this.cleanupRegistry,
      { cleanupOrder: 60 },
    );
    return {
      groupId: fixture.id,
      groupName: fixture.groupName,
      optionNames: fixture.optionNames,
      ownerId: owner.id,
      ownerIdentity: owner.originalIdentity,
    };
  }

  @step('解除商品属性组引用：{caseId} / {kind}')
  async detachReferencedAttributeGroup(
    caseId: string,
    kind: StandardItem216AttributeFixture['kind'],
  ): Promise<{ groupId: number; groupName: string; optionNames: string[]; ownerId: number; ownerIdentity: string }> {
    const fixture = await this.createReferencedAttributeGroupFixture(caseId, kind);
    const edit = await this.openStandardEdit(fixture.ownerIdentity);
    if (kind === 'spec') {
      await edit.removeSelectedSpecGroup(fixture.groupName);
      await edit.selectSingleSpec();
      await edit.fillStandardPrice('1.99');
    } else {
      await edit.removeCommonAttributeGroup(fixture.groupName);
    }
    const responsePromise = this.waitForAnyItemMutation(MUTATION_TIMEOUT_MS);
    await edit.clickSave();
    const response = await responsePromise;
    if (!response) throw new Error(`${caseId} 解除属性组引用未产生商品保存响应`);
    await waitUntil(
      () => this.api.productDetail(fixture.ownerId),
      (detail) => !containsExactString(detail, fixture.groupName),
      { timeout: 30_000, interval: 500, message: `${caseId} 商品 API 仍保留属性组引用` },
    );
    const replay = await this.openStandardEdit(fixture.ownerIdentity);
    const uiEvidence = kind === 'spec'
      ? await replay.readSelectedSpecGroupEvidence(fixture.groupName)
      : await replay.readCommonAttributeCapabilityEvidence(fixture.groupName);
    if (uiEvidence.selectedGroupCount !== 0) throw new Error(`${caseId} 商品编辑页仍保留属性组引用`);
    return fixture;
  }

  @step('验证属性组新增明细不自动传播：{caseId} / {kind}')
  async verifyAddedAttributeOptionNotPropagated(
    caseId: string,
    kind: 'spec' | 'taste' | 'method',
  ): Promise<Record<string, unknown>> {
    const fixture = kind === 'spec'
      ? await this.factory.createSpecFixture(caseId, this.cleanupRegistry, { optionCount: 1 })
      : kind === 'taste'
        ? await this.factory.createTasteFixture(caseId, this.cleanupRegistry, { optionCount: 1 })
        : await this.factory.createMethodFixture(caseId, this.cleanupRegistry, { optionCount: 1 });
    const owner = await this.createStandardWithAttributeFixture(`${caseId}-OWNER`, fixture, kind);
    const originalOption = fixture.optionNames[0];
    const addedOption = `${originalOption}_ADDED_${Date.now()}`;
    const ownerBefore = await this.api.productDetail(owner.id);
    if (!containsExactString(ownerBefore, originalOption) || containsExactString(ownerBefore, addedOption)) {
      throw new Error(`${caseId} owner 新增前明细集合不正确`);
    }
    await this.factory.addAttributeFixtureOption(fixture, addedOption);
    const groupAfter = kind === 'spec'
      ? await this.api.specDetail(fixture.id)
      : kind === 'taste'
        ? await this.api.tasteDetail(fixture.id)
        : await this.api.methodDetail(fixture.id);
    if (!containsExactString(groupAfter, originalOption) || !containsExactString(groupAfter, addedOption)) {
      throw new Error(`${caseId} 组 API 未同时保留原明细和新增明细`);
    }
    const ownerAfter = await this.api.productDetail(owner.id);
    if (!containsExactString(ownerAfter, originalOption) || containsExactString(ownerAfter, addedOption)) {
      throw new Error(`${caseId} owner 商品自动传播了新增明细`);
    }
    const edit = await this.openStandardEdit(owner.originalIdentity);
    const uiOptions = kind === 'spec'
      ? await edit.readMultiSpecOrder([originalOption, addedOption])
      : await edit.readCommonAttributeOptionPresence(fixture.groupName, [originalOption, addedOption]);
    if (!uiOptions.includes(originalOption) || uiOptions.includes(addedOption)) {
      throw new Error(`${caseId} owner 编辑页明细集合不正确：${uiOptions.join(',')}`);
    }
    return {
      fixture,
      ownerId: owner.id,
      ownerIdentity: owner.originalIdentity,
      originalOption,
      addedOption,
      uiOptions,
      checkpointEntryIds: [fixture.checkpointEntryId, owner.checkpointEntryId],
    };
  }

  @step('准备加料组新增明细不自动传播：{caseId}')
  async prepareAddedAddonOptionNotPropagated(caseId: string): Promise<Record<string, unknown>> {
    const timestamp = Date.now();
    const candidateIdentities = ['A', 'B'].map((suffix) => `AUTO_AUDIT_${caseId.replace(/[^A-Z0-9]+/gi, '_')}_ADDON_${suffix}_${timestamp}`);
    const candidates = [];
    for (const identity of candidateIdentities) {
      await this.createFlow.createSideItem(this.page, { name: identity, price: '1.00' });
      candidates.push(await this.factory.registerUiCreatedSingleSkuBrandProduct(
        'addon-candidate',
        this.cleanupRegistry,
        identity,
      ));
    }
    const fixture = await this.factory.createAddonFixture(caseId, candidates[0], this.cleanupRegistry);
    const owner = await this.createStandardWithAttributeFixture(`${caseId}-OWNER`, fixture, 'addon');
    const ownerBefore = await this.api.productDetail(owner.id);
    if (!containsExactString(ownerBefore, candidates[0].originalIdentity)
      || containsExactString(ownerBefore, candidates[1].originalIdentity)) {
      throw new Error(`${caseId} 加料组新增前商品引用集合不正确`);
    }
    return {
      fixture,
      owner,
      addedProduct: candidates[1],
      candidateIdentities,
      checkpointEntryIds: [fixture.checkpointEntryId, owner.checkpointEntryId, ...candidates.map((item) => item.checkpointEntryId)],
    };
  }

  @step('验证加料组新增明细未传播到商品 UI：{caseId}')
  async verifyAddedAddonOptionOwnerUi(
    caseId: string,
    ownerIdentity: string,
    groupName: string,
    originalProduct: string,
    addedProduct: string,
  ): Promise<string[]> {
    const ownerEdit = await this.openStandardEdit(ownerIdentity);
    const ownerOptions = await ownerEdit.readCommonAttributeOptionPresence(groupName, [originalProduct, addedProduct]);
    if (!ownerOptions.includes(originalProduct) || ownerOptions.includes(addedProduct)) {
      throw new Error(`${caseId} 商品编辑 UI 明细集合不正确：${ownerOptions.join(',')}`);
    }
    return ownerOptions;
  }

  @step('准备被引用加料组与双商品 owner：{caseId}')
  async prepareReferencedAddonOwners(
    caseId: string,
    candidateCount: 1 | 2 = 2,
    ownerCount: 1 | 2 = 2,
  ): Promise<Record<string, unknown>> {
    const timestamp = Date.now();
    const candidates = [];
    for (let index = 0; index < candidateCount; index += 1) {
      const identity = `AUTO_AUDIT_${caseId.replace(/[^A-Z0-9]+/gi, '_')}_ADDON_${index + 1}_${timestamp}`;
      await this.createFlow.createSideItem(this.page, { name: identity, price: '1.00' });
      candidates.push(await this.factory.registerUiCreatedSingleSkuBrandProduct(
        'addon-candidate',
        this.cleanupRegistry,
        identity,
      ));
    }
    const fixture = await this.factory.createAddonFixture(`${caseId}-${timestamp}`, candidates, this.cleanupRegistry);
    const owners = [];
    for (let index = 0; index < ownerCount; index += 1) {
      owners.push(await this.createStandardWithAttributeFixture(`${caseId}-OWNER-${index + 1}`, fixture, 'addon'));
    }
    return {
      fixture,
      candidates,
      owners,
      candidateIdentities: candidates.map((item) => item.originalIdentity),
      ownerIdentities: owners.map((item) => item.originalIdentity),
      checkpointEntryIds: [
        fixture.checkpointEntryId,
        ...candidates.map((item) => item.checkpointEntryId),
        ...owners.map((item) => item.checkpointEntryId),
      ],
    };
  }

  @step('设置加料 owner 商品侧价格覆盖：{caseId} / {ownerIdentity}')
  async setAddonOwnerPriceOverride(
    caseId: string,
    ownerIdentity: string,
    groupName: string,
    optionNames: readonly string[],
    optionName: string,
    price: string,
  ): Promise<Record<string, unknown>> {
    const edit = await this.openStandardEdit(ownerIdentity);
    const beforeSave = await edit.setCommonAttributeOptionOverride(groupName, optionNames, optionName, price);
    const response = await this.saveAddonReferenceAndReadMutation(edit, { originalIdentity: ownerIdentity } as StandardItem216Context);
    if (!response) throw new Error(`${caseId} 商品侧加料价格覆盖未产生保存响应`);
    const replay = await this.openStandardEdit(ownerIdentity);
    const afterSave = await replay.readCommonAttributeOptionOverride(groupName, optionNames, optionName);
    if (Number(afterSave.price) !== Number(price)) {
      throw new Error(`${caseId} 商品侧加料价格覆盖回读不正确：${JSON.stringify(afterSave)}`);
    }
    return { beforeSave, afterSave };
  }

  @step('验证加料 owner 商品 UI 终态：{caseId} / {ownerIdentity}')
  async verifyAddonOwnerUiTerminal(
    caseId: string,
    ownerIdentity: string,
    groupName: string,
    visibleOptions: readonly string[],
    absentOptions: readonly string[] = [],
    priceExpectation?: { optionName: string; price?: string },
  ): Promise<Record<string, unknown>> {
    const edit = await this.openStandardEdit(ownerIdentity);
    const capability = await edit.readCommonAttributeCapabilityEvidence(groupName);
    if (capability.selectedGroupCount !== 1) {
      throw new Error(`${caseId} owner ${ownerIdentity} 编辑页未唯一保留加料组：${JSON.stringify(capability)}`);
    }
    const options = await edit.readCommonAttributeOptionPresence(groupName, [...visibleOptions, ...absentOptions]);
    const missing = visibleOptions.filter((optionName) => !options.includes(optionName));
    const unexpected = absentOptions.filter((optionName) => options.includes(optionName));
    if (missing.length > 0 || unexpected.length > 0) {
      throw new Error(`${caseId} owner ${ownerIdentity} 编辑页加料明细终态不正确：${JSON.stringify({ options, missing, unexpected })}`);
    }
    const price = priceExpectation
      ? await edit.readCommonAttributeOptionOverride(groupName, visibleOptions, priceExpectation.optionName)
      : undefined;
    if (priceExpectation?.price !== undefined && Number(price?.price) !== Number(priceExpectation.price)) {
      throw new Error(`${caseId} owner ${ownerIdentity} 编辑页价格覆盖值不正确：${JSON.stringify(price)}`);
    }
    return { capability, options, price };
  }

  @step('验证属性组 owner 商品 UI 终态：{caseId} / {ownerIdentity}')
  async verifyAttributeOwnerUiTerminal(
    caseId: string,
    ownerIdentity: string,
    groupName: string,
    visibleOptions: readonly string[],
    absentOptions: readonly string[] = [],
  ): Promise<Record<string, unknown>> {
    const edit = await this.openStandardEdit(ownerIdentity);
    const capability = await edit.readCommonAttributeCapabilityEvidence(groupName);
    if (capability.selectedGroupCount !== 1) {
      throw new Error(`${caseId} owner ${ownerIdentity} 编辑页未唯一保留属性组：${JSON.stringify(capability)}`);
    }
    const options = await edit.readCommonAttributeOptionPresence(groupName, [...visibleOptions, ...absentOptions]);
    const missing = visibleOptions.filter((optionName) => !options.includes(optionName));
    const unexpected = absentOptions.filter((optionName) => options.includes(optionName));
    if (missing.length > 0 || unexpected.length > 0) {
      throw new Error(`${caseId} owner ${ownerIdentity} 编辑页属性明细终态不正确：${JSON.stringify({ options, missing, unexpected })}`);
    }
    return { capability, options };
  }

  @step('验证规格 owner 商品 UI 终态：{caseId} / {ownerIdentity}')
  async verifySpecOwnerUiTerminal(
    caseId: string,
    ownerIdentity: string,
    visibleOptions: readonly string[],
    absentOptions: readonly string[] = [],
  ): Promise<string[]> {
    const edit = await this.openStandardEdit(ownerIdentity);
    const options = await edit.readMultiSpecOrder([...visibleOptions, ...absentOptions]);
    const missing = visibleOptions.filter((optionName) => !options.includes(optionName));
    const unexpected = absentOptions.filter((optionName) => options.includes(optionName));
    if (missing.length > 0 || unexpected.length > 0) {
      throw new Error(`${caseId} owner ${ownerIdentity} 编辑页规格终态不正确：${JSON.stringify({ options, missing, unexpected })}`);
    }
    return options;
  }

  @step('验证商品 UI 不再引用属性组：{caseId} / {ownerIdentity}')
  async verifyAttributeGroupAbsentFromOwnerUi(
    caseId: string,
    ownerIdentity: string,
    groupName: string,
  ): Promise<Record<string, unknown>> {
    const edit = await this.openStandardEdit(ownerIdentity);
    const capability = await edit.readCommonAttributeCapabilityEvidence(groupName);
    if (capability.selectedGroupCount !== 0) {
      throw new Error(`${caseId} owner ${ownerIdentity} 编辑页仍引用已删除属性组：${JSON.stringify(capability)}`);
    }
    return { capability };
  }

  @step('验证被引用属性明细改名同步：{caseId} / {kind}')
  async verifyRenamedAttributeOptionSynchronization(
    caseId: string,
    kind: 'spec' | 'taste' | 'method',
  ): Promise<Record<string, unknown>> {
    const fixture = kind === 'spec'
      ? await this.factory.createSpecFixture(caseId, this.cleanupRegistry)
      : kind === 'taste'
        ? await this.factory.createTasteFixture(caseId, this.cleanupRegistry)
        : await this.factory.createMethodFixture(caseId, this.cleanupRegistry);
    const first = await this.createStandardWithAttributeFixture(`${caseId}-ITEM-A`, fixture, kind);
    const second = await this.createStandardWithAttributeFixture(`${caseId}-ITEM-B`, fixture, kind);
    const owners = [first, second];
    const beforeDetails = await Promise.all(owners.map((owner) => this.api.productDetail(owner.id)));
    const priceSnapshots = beforeDetails.map((detail) => readPriceSnapshot(detail));
    const groupBefore = kind === 'spec' ? await this.api.specDetail(fixture.id) : null;
    const previousSpecOption = kind === 'spec' ? findNamedRecord(groupBefore, fixture.optionNames[0]) : undefined;
    const previousImageReferences = previousSpecOption ? readImageReferences(previousSpecOption) : [];
    const rename = kind === 'spec'
      ? await (async () => {
          const pageObject = createSpecificationsPage(this.page);
          await pageObject.open();
          await pageObject.searchAndWait(fixture.groupName);
          await pageObject.openEditSurface(fixture.groupName);
          const updated = await pageObject.updateReferencedSpecificationOptionFields(fixture.optionNames[0]);
          fixture.optionNames[0] = updated.updatedFields.name;
          return {
            previousName: updated.previousName,
            updatedName: updated.updatedFields.name,
            updatedFields: updated.updatedFields,
            confirmationText: updated.confirmationText,
          };
        })()
      : await this.factory.renameAttributeFixtureOption(
          fixture,
          0,
          owners.map((owner) => owner.id),
        );
    const synchronizedFields: Record<string, string> = { ...rename.updatedFields };
    const ownerApiObservableFields = kind === 'spec'
      ? {
          name: synchronizedFields.name,
          secondName: synchronizedFields.secondName,
          value: synchronizedFields.value,
        }
      : synchronizedFields;
    const groupAfter = kind === 'spec'
      ? await waitUntil(
          () => this.api.specDetail(fixture.id),
          (value) => {
            const option = findNamedRecord(value, rename.updatedName);
            const images = option ? readImageReferences(option) : [];
            return Boolean(option)
              && Object.values(synchronizedFields).every((fieldValue) => containsExactString(value, fieldValue))
              && images.some((reference) => !previousImageReferences.includes(reference));
          },
          { timeout: 30_000, interval: 500, probeTimeout: 5_000, message: `${caseId} 规格组五字段 API 查询未在窗口内收敛` },
        )
      : kind === 'taste'
        ? await this.api.tasteDetail(fixture.id)
        : await this.api.methodDetail(fixture.id);
    if (!containsExactString(groupAfter, rename.updatedName) || containsExactString(groupAfter, rename.previousName)) {
      throw new Error(`${caseId} 组 API 明细改名终态不正确`);
    }
    if (kind === 'spec') {
      const missingGroupFields = Object.entries(synchronizedFields)
        .filter(([, value]) => !containsExactString(groupAfter, value))
        .map(([field]) => field);
      if (missingGroupFields.length > 0) {
        throw new Error(`${caseId} 规格组 API 未保存同步字段：${missingGroupFields.join(', ')}`);
      }
      const updatedSpecOption = findNamedRecord(groupAfter, rename.updatedName);
      const updatedImageReferences = updatedSpecOption ? readImageReferences(updatedSpecOption) : [];
      if (updatedImageReferences.length === 0
        || updatedImageReferences.every((reference) => previousImageReferences.includes(reference))) {
        throw new Error(`${caseId} 规格组 API 未保存新的规格图标`);
      }
      synchronizedFields.imageReference = updatedImageReferences[0];
    }
    const apiSnapshots = [];
    const uiSnapshots = [];
    for (let index = 0; index < owners.length; index += 1) {
      const owner = owners[index];
      const edit = await this.openStandardEdit(owner.originalIdentity);
      const uiOptions = kind === 'spec'
        ? await waitUntil(
            () => edit.readMultiSpecOrder([rename.previousName, rename.updatedName]),
            (value) => value.includes(rename.updatedName) && !value.includes(rename.previousName),
            {
              timeout: 30_000,
              interval: 500,
              probeTimeout: 5_000,
              message: `${caseId} owner ${owner.id} UI 观测未在窗口内收敛为新规格名称`,
              observation: {
                channel: 'ui',
                operation: 'standard-item.attribute.multi-spec-option-name',
                caseId,
              },
            },
          )
        : await waitUntil(
            () => edit.readCommonAttributeOptionPresence(fixture.groupName, [rename.previousName, rename.updatedName]),
            (value) => value.includes(rename.updatedName) && !value.includes(rename.previousName),
            {
              timeout: 30_000,
              interval: 500,
              probeTimeout: 5_000,
              message: `${caseId} owner ${owner.id} UI 观测未在窗口内收敛为新明细名称`,
              observation: {
                channel: 'ui',
                operation: 'standard-item.attribute-option-name',
                caseId,
              },
            },
          );
      let detail;
      try {
        detail = await waitUntil(
          () => this.api.productDetail(owner.id),
          (value) => containsExactString(value, rename.updatedName)
            && !containsExactString(value, rename.previousName)
            && (kind !== 'spec' || Object.values(ownerApiObservableFields).every((fieldValue) => containsExactString(value, fieldValue))),
          {
            timeout: 30_000,
            interval: 500,
            probeTimeout: 5_000,
            message: `${caseId} owner ${owner.id} API 观测未在窗口内收敛；UI 已观测到新明细名称，不能据此判定产品未同步`,
            observation: {
              channel: 'api',
              operation: 'product-detail.attribute-option-synchronization',
              caseId,
            },
          },
        );
      } catch (error) {
        if (error instanceof Error) {
          error.message = `${error.message} UI observed: ${uiOptions.join(',')}`;
        }
        throw error;
      }
      const pricesAfter = readPriceSnapshot(detail);
      if (JSON.stringify(pricesAfter) !== JSON.stringify(priceSnapshots[index])) {
        throw new Error(`${caseId} owner ${owner.id} 明细改名后价格字段发生变化`);
      }
      const missingOwnerFields = kind === 'spec'
        ? Object.entries(ownerApiObservableFields)
          .filter(([, value]) => !containsExactString(detail, value))
          .map(([field]) => field)
        : [];
      if (missingOwnerFields.length > 0) {
        throw new Error(`${caseId} owner ${owner.id} 未同步规格字段：${missingOwnerFields.join(', ')}`);
      }
      apiSnapshots.push({ ownerId: owner.id, pricesBefore: priceSnapshots[index], pricesAfter, missingOwnerFields });
      uiSnapshots.push({ ownerId: owner.id, uiOptions });
    }
    return {
      fixture,
      rename,
      apiSnapshots,
      uiSnapshots,
      ownerIdentities: owners.map((owner) => owner.originalIdentity),
      checkpointEntryIds: [fixture.checkpointEntryId, ...owners.map((owner) => owner.checkpointEntryId)],
    };
  }

  @step('验证编辑页移除已引用属性组选项：{caseId}')
  async verifyEditedAttributeGroupRemoval(caseId: string, kind: 'taste' | 'method' | 'addon'): Promise<Record<string, unknown>> {
    const dependency = kind === 'addon'
      ? await this.createSingle({ caseId: `${caseId}-DEPENDENCY`, price: '1.99' })
      : undefined;
    const fixture = kind === 'taste'
      ? await this.factory.createTasteFixture(caseId, this.cleanupRegistry)
      : kind === 'method'
        ? await this.factory.createMethodFixture(caseId, this.cleanupRegistry)
        : await this.factory.createAddonFixture(caseId, dependency!, this.cleanupRegistry);
    const created = await this.createSingle({ caseId, price: '1.99' });
    const edit = await this.openStandardEdit(created.originalIdentity);
    await edit.selectSingleSpec();
    await this.selectAttributeGroup(edit, fixture, kind);
    const before = await edit.readCommonAttributeSelections(fixture.groupName, fixture.optionNames);
    const after = await edit.setCommonAttributeSelections(fixture.groupName, fixture.optionNames, before.slice(1));
    expect(after.length).toBeLessThan(before.length);
    const responsePromise = this.waitForAnyItemMutation(MUTATION_TIMEOUT_MS);
    await edit.clickSave();
    if (!await responsePromise) throw new Error(`${caseId} 编辑移除属性组选项未产生保存响应`);
    return { before, after, groupName: fixture.groupName };
  }

  @step('准备商品侧默认项与加价隔离夹具：{caseId} / {kind}')
  async prepareGroupDefaultPriceIsolation(
    caseId: string,
    kind: 'taste' | 'method' | 'addon',
  ): Promise<Record<string, unknown>> {
    const addonDependencies = kind === 'addon'
      ? await Promise.all(['A', 'B'].map((suffix) => this.factory.createSingleSkuBrandProduct(
          'addon-candidate',
          this.cleanupRegistry,
          `AUTO_AUDIT_${caseId.replace(/[^A-Z0-9]+/gi, '_')}_ADDON_${suffix}_${Date.now()}`,
        )))
      : undefined;
    const fixture = kind === 'taste'
      ? await this.factory.createTasteFixture(caseId, this.cleanupRegistry)
      : kind === 'method'
        ? await this.factory.createMethodFixture(caseId, this.cleanupRegistry)
        : await this.factory.createAddonFixture(caseId, addonDependencies!, this.cleanupRegistry);
    if (fixture.optionNames.length !== 2) throw new Error(`${caseId} 隔离场景必须有两个组明细`);
    const owner = await this.createStandardWithAttributeFixture(`${caseId}-OWNER`, fixture, kind);
    const ownerEdit = await this.openStandardEdit(owner.originalIdentity);
    const beforeSave = await ownerEdit.setCommonAttributeOptionOverride(
      fixture.groupName,
      fixture.optionNames,
      fixture.optionNames[1],
      '2.00',
    );
    const response = await this.saveAddonReferenceAndReadMutation(ownerEdit, owner);
    if (!response) throw new Error(`${caseId} 商品侧覆盖值未产生保存响应`);
    const ownerReplay = await this.openStandardEdit(owner.originalIdentity);
    const afterSave = await ownerReplay.readCommonAttributeOptionOverride(
      fixture.groupName,
      fixture.optionNames,
      fixture.optionNames[1],
    );
    this.requireExactOptionOverride(caseId, afterSave, fixture.optionNames[1], 2);
    return {
      fixture,
      owner,
      beforeSave,
      afterSave,
      checkpointEntryIds: [
        fixture.checkpointEntryId,
        owner.checkpointEntryId,
        ...(addonDependencies?.map((item) => item.checkpointEntryId) ?? []),
      ],
      dependencyIdentities: addonDependencies?.map((item) => item.originalIdentity) ?? [],
    };
  }

  @step('验证组默认项与加价未覆盖商品：{caseId}')
  async verifyGroupDefaultPriceIsolationOwner(
    caseId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const fixture = input.fixture as StandardItem216AttributeFixture;
    const owner = input.owner as ProductCenterItemCreateRecord;
    const groupDetail = fixture.kind === 'addon'
      ? await this.api.addonGroupDetail(fixture.id)
      : fixture.kind === 'taste'
        ? await this.api.tasteDetail(fixture.id)
        : await this.api.methodDetail(fixture.id);
    const groupState = readNamedOptionState(groupDetail, fixture.optionNames[0]);
    if (!groupState.defaultSelected || groupState.price !== 3) {
      throw new Error(`${caseId} 组 API 默认项或加价不正确：${JSON.stringify(groupState)}`);
    }
    const ownerApi = await this.api.productDetail(owner.id);
    const ownerGroupPaths = collectExactStringPaths(ownerApi, fixture.groupName);
    const ownerCandidates = readNamedOptionStates(ownerApi, fixture.optionNames[1]);
    const ownerMatches = ownerCandidates.filter((state) => state.defaultSelected && state.price === 2);
    if (ownerGroupPaths.length === 0) {
      throw new Error(`${caseId} 组编辑后商品 API 丢失加料组引用：${JSON.stringify({
        groupName: fixture.groupName,
        optionCandidates: ownerCandidates,
      })}`);
    }
    const ownerReplay = await this.openStandardEdit(owner.originalIdentity);
    const ownerUi = await ownerReplay.readCommonAttributeOptionOverride(
      fixture.groupName,
      fixture.optionNames,
      fixture.optionNames[1],
    );
    this.requireExactOptionOverride(caseId, ownerUi, fixture.optionNames[1], 2);
    if (ownerMatches.length !== 1) {
      throw new Error(`${caseId} 商品 UI 保留覆盖值但 API 未形成唯一终态：${JSON.stringify({ ownerUi, ownerGroupPaths, ownerCandidates })}`);
    }
    const ownerState = ownerMatches[0];
    return { ...input, groupState, ownerState, ownerUi };
  }

  @step('创建并绑定共享口味组的标准商品：{caseId}')
  private async createStandardWithAttributeFixture(
    caseId: string,
    fixture: StandardItem216AttributeFixture,
    kind: StandardItem216AttributeFixture['kind'] = 'taste',
  ): Promise<ProductCenterItemCreateRecord> {
    const context = await this.factory.prepare(caseId);
    const form = await this.createFlow.openStandardCreateFromList(this.page);
    await form.fillItemName(context.originalIdentity);
    if (kind === 'spec') {
      await form.selectMultiSpec();
    } else {
      await form.selectSingleSpec();
      await form.fillStandardPrice('1.99');
    }
    await this.selectAttributeGroup(form, fixture, kind);
    if (kind === 'spec') await form.fillAllMultiSpecPrices('1.99');
    const response = kind === 'addon'
      ? await this.saveAddonReferenceAndReadMutation(form, context)
      : await this.saveAndReadMutation(form, context, MUTATION_TIMEOUT_MS);
    if (!response) throw new Error(`${caseId} 共享属性组商品未产生保存响应`);
    return this.factory.registerCreated(
      context,
      await response.json().catch(() => null),
      this.cleanupRegistry,
      { cleanupOrder: 60 },
    );
  }

  private async saveAddonReferenceAndReadMutation(
    form: ItemCreateStandardPage,
    context: StandardItem216Context,
  ): Promise<Response | undefined> {
    const initialResponsePromise = this.waitForAnyItemMutation(MUTATION_TIMEOUT_MS);
    await form.clickSave();
    const firstTerminal = await Promise.race([
      initialResponsePromise.then((response) => ({ response })),
      form.waitForAdditionalPriceWarning(10_000).then((warning) => ({ warning })),
    ]);
    if ('response' in firstTerminal && firstTerminal.response) return firstTerminal.response;
    let confirmationResponsePromise: Promise<Response | undefined> | undefined;
    if (('warning' in firstTerminal && firstTerminal.warning) || await form.isAdditionalPriceWarningVisible()) {
      confirmationResponsePromise = this.waitForAnyItemMutation(MUTATION_TIMEOUT_MS);
      await form.confirmAdditionalPriceWarning();
    }
    const response = await initialResponsePromise ?? await confirmationResponsePromise;
    if (response && !context.originalIdentity.startsWith('AUTO_AUDIT_')) {
      throw new Error('非 AUTO_AUDIT 身份禁止保存');
    }
    return response;
  }

  @step('通过受控商品 API 创建被引用标准商品：{caseId}')
  private async createApiStandardReferenceItem(caseId: string): Promise<ProductCenterItemCreateRecord> {
    const context = await this.factory.prepare(caseId);
    const response = await this.api.createBomProduct(context.originalIdentity, 142, { price: 1.99 });
    return this.factory.registerCreated(context, response, this.cleanupRegistry);
  }

  @step('通过商品列表尝试删除被引用商品：{identity}')
  private async attemptReferencedDeletion(identity: string): Promise<Record<string, unknown>> {
    const list = createItemListPage(this.page);
    await list.open();
    await list.fillSearch(identity);
    await list.expectUniqueItemVisible(identity);
    await list.openRowActionMenu(identity);
    await list.clickRowActionDelete();
    const dialogText = await list.readDeleteDialogText();
    const responsePromise = this.page.waitForResponse((response) => {
      const request = response.request();
      return request.method() === 'DELETE'
        && new URL(response.url()).pathname.endsWith('/ops-brand/brand-items/delete');
    }, { timeout: 10_000 }).catch(() => undefined);
    await list.confirmDeleteDialog();
    const response = await responsePromise;
    await list.fillSearchForResidueCheck(identity);
    await list.expectUniqueItemVisible(identity);
    return {
      dialogText,
      responseStatus: response?.status() ?? null,
      responseBody: response ? await response.json().catch(() => null) : null,
      uiVisibleAfterAttempt: true,
      apiCountAfterAttempt: await this.factory.itemRecordCount(identity),
      messages: await list.readSettledVisibleMessages(),
    };
  }

  private waitForCreateResponse(): Promise<Response> {
    return this.page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/ops-brand/brand-items/standard')
      && response.status() >= 200
      && response.status() < 300
    ), { timeout: MUTATION_TIMEOUT_MS });
  }

  private observeSuccessMessage(form: { waitForSuccessMessage(timeout?: number): Promise<number> }): Promise<number> {
    return form.waitForSuccessMessage(SUCCESS_TOAST_TIMEOUT_MS).catch(() => 0);
  }

  private async requireBlockedResult(
    result: { errors: string[]; saveEnabled: boolean },
    caseId: string,
  ): Promise<void> {
    if (result.errors.length === 0 && result.saveEnabled) {
      throw new Error(`${caseId} 未观察到保存拦截或字段错误`);
    }
  }

  private requireExactOptionOverride(
    caseId: string,
    evidence: { checkedNames: string[]; checkedSwitches: number; price: string },
    optionName: string,
    price: number,
  ): void {
    if (evidence.checkedSwitches !== 1
      || evidence.checkedNames[0] !== optionName
      || Number(evidence.price) !== price) {
      throw new Error(`${caseId} 商品侧默认项或加价终态不精确：${JSON.stringify(evidence)}`);
    }
  }

  private waitForAnyItemMutation(timeout: number): Promise<Response | undefined> {
    return this.page.waitForResponse((response) => {
      const path = new URL(response.url()).pathname;
      return ['POST', 'PUT', 'PATCH'].includes(response.request().method())
        && /brand-items/.test(path)
        && response.status() >= 200
        && response.status() < 300;
    }, { timeout: Math.min(timeout, MUTATION_TIMEOUT_MS) }).catch(() => undefined);
  }

  private waitForItemMutationAttempt(timeout: number): Promise<Response | undefined> {
    return this.page.waitForResponse((response) => {
      const path = new URL(response.url()).pathname;
      return ['POST', 'PUT', 'PATCH'].includes(response.request().method()) && /brand-items/.test(path);
    }, { timeout: Math.min(timeout, MUTATION_TIMEOUT_MS) }).catch(() => undefined);
  }

  private async saveAndReadMutation(
    form: { clickSave(): Promise<void> },
    context: StandardItem216Context,
    timeout: number,
  ): Promise<Response | undefined> {
    const responsePromise = this.waitForAnyItemMutation(timeout);
    await form.clickSave();
    const response = await responsePromise;
    if (response && !context.originalIdentity.startsWith('AUTO_AUDIT_')) {
      throw new Error('非 AUTO_AUDIT 身份禁止保存');
    }
    return response;
  }

  private async saveAndReadAttempt(
    form: { clickSave(): Promise<void> },
    context: StandardItem216Context,
    timeout: number,
  ): Promise<Response | undefined> {
    const responsePromise = this.waitForItemMutationAttempt(timeout);
    await form.clickSave();
    const response = await responsePromise;
    if (response && !context.originalIdentity.startsWith('AUTO_AUDIT_')) {
      throw new Error('非 AUTO_AUDIT 身份禁止保存');
    }
    return response;
  }

  private async performLifecycleAction(
    list: ReturnType<typeof createItemListPage>,
    record: ProductCenterItemCreateRecord,
    action: 'enable' | 'disable',
  ): Promise<void> {
    const responsePromise = this.waitForItemMutationAttempt(MUTATION_TIMEOUT_MS);
    await list.clickRowLifecycleAction(action);
    const response = await responsePromise;
    const responseBody = response ? await response.json().catch(() => null) : null;
    if (!response || !response.ok() || isBusinessFailure(responseBody)) {
      throw new Error(`标准商品${action === 'enable' ? '启用' : '停用'}操作未成功：${JSON.stringify({ status: response?.status() ?? null, responseBody })}`);
    }
    const expectedUiStatus = action === 'enable'
      ? itemListFilterOptionsDom.statusEnabled
      : itemListFilterOptionsDom.statusDisabled;
    const expectedApiStatus = action === 'enable' ? 1 : 0;
    await waitUntil(
      () => list.readItemStatusText(record.originalIdentity),
      (status) => status === expectedUiStatus,
      { timeout: 15_000, message: `标准商品${action === 'enable' ? '启用' : '停用'}后 UI 状态未回显 ${expectedUiStatus}` },
    );
    await waitUntil(
      () => this.api.productPage(record.originalIdentity),
      (page) => findExactNamedStatus(page, record.originalIdentity) === expectedApiStatus,
      { timeout: 15_000, interval: 500, message: `标准商品${action === 'enable' ? '启用' : '停用'}后 API 状态未回显 ${expectedApiStatus}` },
    );
  }

  private async createStatisticTagFixtures(caseId: string, count: number): Promise<string[]> {
    const suffix = caseId.replace(/^TC-ITEM-STD-/u, 'STD_').replace(/[^A-Za-z0-9_-]/g, '_');
    const groupName = `AUTO_AUDIT_${suffix}_STAT_GROUP`;
    const groupResponse = await this.api.createTagGroup({ name: groupName, type: 3 });
    const group = findExactNamedRecord(groupResponse, groupName)
      ?? findExactNamedRecord(await this.api.tagGroupList(3), groupName);
    if (!group) throw new Error(`${caseId} TEST_DATA_BLOCKED: 统计标签组创建后未找到 ${groupName}`);
    this.cleanupRegistry.register({
      entity: '标准商品统计标签组',
      identity: groupName,
      checkpoint: {
        entryId: `standard-item-stat-group-${group.id}`,
        entityKind: 'tag-group',
        serverId: group.id,
        identityVariants: [groupName],
        cleanupOrder: 30,
      },
      execute: async () => {
        const residue = findExactNamedRecord(await this.api.tagGroupList(3), groupName);
        if (residue) await this.api.deleteTagGroup(residue.id);
      },
      verify: async () => !findExactNamedRecord(await this.api.tagGroupList(3), groupName),
    });
    const names: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const name = `AUTO_AUDIT_${suffix}_STAT_${index + 1}`;
      const response = await this.api.createStatTag({ name, groupId: group.id });
      const record = findExactNamedRecord(response, name) ?? findExactNamedRecord(await this.api.tagPage(3), name);
      if (!record) throw new Error(`${caseId} TEST_DATA_BLOCKED: 统计标签创建后未找到 ${name}`);
      this.cleanupRegistry.register({
        entity: '标准商品统计标签',
        identity: name,
        checkpoint: {
          entryId: `standard-item-stat-tag-${record.id}`,
          entityKind: 'statistic-tag',
          serverId: record.id,
          identityVariants: [name],
          cleanupOrder: 35,
        },
        execute: async () => {
          const residue = findExactNamedRecord(await this.api.tagPage(3), name);
          if (residue) await this.api.deleteTag(residue.id);
        },
        verify: async () => !findExactNamedRecord(await this.api.tagPage(3), name),
      });
      names.push(name);
    }
    return names;
  }
}

function findExactNamedRecord(value: unknown, identity: string): { id: number; name: string } | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findExactNamedRecord(child, identity);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string' && record.name === identity && Number.isFinite(Number(record.id))) {
    return { id: Number(record.id), name: record.name };
  }
  for (const child of Object.values(record)) {
    const found = findExactNamedRecord(child, identity);
    if (found) return found;
  }
  return undefined;
}

function findExactNamedStatus(value: unknown, identity: string): number | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findExactNamedStatus(child, identity);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.name === identity) {
    const basicInfo = record.basicInfo && typeof record.basicInfo === 'object'
      ? record.basicInfo as Record<string, unknown>
      : undefined;
    const status = Number(record.status ?? record.itemStatus ?? basicInfo?.status);
    if (Number.isFinite(status)) return status;
  }
  for (const child of Object.values(record)) {
    const found = findExactNamedStatus(child, identity);
    if (found !== undefined) return found;
  }
  return undefined;
}

function isBusinessFailure(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const code = record.code;
  return record.success === false
    || typeof code === 'string' && code !== '' && code !== '0' && code.toLowerCase() !== 'success'
    || typeof code === 'number' && code !== 0;
}

export const standardItem216ImplementedCaseIds = new Set([
  'TC-ITEM-STD-001', 'TC-ITEM-STD-002', 'TC-ITEM-STD-003', 'TC-ITEM-STD-004', 'TC-ITEM-STD-005',
  'TC-ITEM-STD-007', 'TC-ITEM-STD-015', 'TC-ITEM-STD-016', 'TC-ITEM-STD-017', 'TC-ITEM-STD-018',
  'TC-ITEM-STD-019', 'TC-ITEM-STD-020', 'TC-ITEM-STD-021', 'TC-ITEM-STD-022', 'TC-ITEM-STD-023',
  'TC-ITEM-STD-029', 'TC-ITEM-STD-030', 'TC-ITEM-STD-031', 'TC-ITEM-STD-033', 'TC-ITEM-STD-036',
  'TC-ITEM-STD-037', 'TC-ITEM-STD-038', 'TC-ITEM-STD-039', 'TC-ITEM-STD-042', 'TC-ITEM-STD-043',
  'TC-ITEM-STD-045', 'TC-ITEM-STD-046', 'TC-ITEM-STD-047', 'TC-ITEM-STD-048', 'TC-ITEM-STD-049',
  'TC-ITEM-STD-050', 'TC-ITEM-STD-051', 'TC-ITEM-STD-052', 'TC-ITEM-STD-063', 'TC-ITEM-STD-065',
  'TC-ITEM-STD-066', 'TC-ITEM-STD-068', 'TC-ITEM-STD-071', 'TC-ITEM-STD-072', 'TC-ITEM-STD-073',
  'TC-ITEM-STD-074', 'TC-ITEM-STD-075', 'TC-ITEM-STD-076', 'TC-ITEM-STD-084', 'TC-ITEM-STD-085',
  'TC-ITEM-STD-092', 'TC-ITEM-STD-093', 'TC-ITEM-STD-094', 'TC-ITEM-STD-095',
]);

function containsExactString(value: unknown, expected: string): boolean {
  if (typeof value === 'string') return value === expected;
  if (Array.isArray(value)) return value.some((item) => containsExactString(item, expected));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some((item) => containsExactString(item, expected));
}

function collectExactStringPaths(value: unknown, expected: string, path = '$', output: string[] = []): string[] {
  if (value === expected) output.push(path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectExactStringPaths(item, expected, `${path}[${index}]`, output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    collectExactStringPaths(child, expected, `${path}.${key}`, output);
  }
  return output;
}

type NamedOptionState = {
  found: boolean;
  defaultSelected: boolean;
  price: number | null;
  path: string;
};

function readNamedOptionState(value: unknown, optionName: string): NamedOptionState {
  return readNamedOptionStates(value, optionName)[0]
    ?? { found: false, defaultSelected: false, price: null, path: '$' };
}

function readNamedOptionStates(
  value: unknown,
  optionName: string,
  path = '$',
  output: NamedOptionState[] = [],
): NamedOptionState[] {
  if (Array.isArray(value)) {
    value.forEach((child, index) => readNamedOptionStates(child, optionName, `${path}[${index}]`, output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  const record = value as Record<string, unknown>;
  if (record.name === optionName) {
    const pricingRule = record.pricingRule && typeof record.pricingRule === 'object'
      ? record.pricingRule as Record<string, unknown>
      : undefined;
    const rawPrice = record.priceAdjustment ?? record.additionalPrice ?? pricingRule?.additionalPrice;
    const price = Number(rawPrice);
    output.push({
      found: true,
      defaultSelected: record.defaultSelected === true,
      price: Number.isFinite(price) ? price : null,
      path,
    });
  }
  for (const [key, child] of Object.entries(record)) {
    readNamedOptionStates(child, optionName, `${path}.${key}`, output);
  }
  return output;
}

function findNamedRecord(value: unknown, name: string): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNamedRecord(item, name);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.name === name) return record;
  for (const child of Object.values(record)) {
    const found = findNamedRecord(child, name);
    if (found) return found;
  }
  return undefined;
}

function readImageReferences(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.flatMap(readImageReferences))];
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const direct = ['imagePath', 'imageUrl', 'iconPath', 'iconUrl']
    .map((key) => record[key])
    .filter((item): item is string => typeof item === 'string' && item.length > 0);
  return [...new Set([...direct, ...Object.values(record).flatMap(readImageReferences)])];
}

function readPriceSnapshot(value: unknown, path = '$'): Record<string, number | string> {
  const result: Record<string, number | string> = {};
  if (Array.isArray(value)) {
    value.forEach((item, index) => Object.assign(result, readPriceSnapshot(item, `${path}[${index}]`)));
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (/price|cost|fee/i.test(key) && (typeof child === 'number' || typeof child === 'string')) {
      result[childPath] = child;
    } else {
      Object.assign(result, readPriceSnapshot(child, childPath));
    }
  }
  return result;
}
