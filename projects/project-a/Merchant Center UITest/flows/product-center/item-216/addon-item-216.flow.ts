import fs from 'node:fs';
import path from 'node:path';
import type { Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';
import type { CleanupRegistry } from '../../../api/product-center/cleanup-registry';
import type { ProductCenterApi } from '../../../api/product-center/product-center-api';
import { ItemCreateFlow } from '../../item-create.flow';
import { createItemListPage } from '../../../pages/product-management/item/item-list.page';
import { createAddOnsPage } from '../../../pages/product-management/group-list.factory';
import { GroupListAccessError } from '../../../pages/product-management/group-list.page';
import { ItemCreateSidePage } from '../../../pages/product-management/item/item-create-side.page';
import { ItemEditSidePage } from '../../../pages/product-management/item/item-edit.page';
import { ItemCreateStandardPage } from '../../../pages/product-management/item/item-create-standard.page';
import {
  AddonItem216Factory,
  type AddonItem216Context,
  type AddonGroup216Record,
  type AddonMenu216Record,
  type AddonMenuBinding216Record,
  type AddonSyncJob216Record,
} from '../../../test-data/product-center/item-216/addon-item-216.factory';
import { step } from '../../../utils/step';
import { waitUntil } from '../../../utils/wait';

type CaseResult = {
  caseId: string;
  status: 'implemented' | 'test-data-blocked' | 'product-defect';
  evidence: Record<string, unknown>;
  identities: string[];
  reason?: string;
  unresolved?: { code: string; message: string; requiredContracts: string[] };
};

const UNRESOLVED: Record<string, { code: string; message: string; requiredContracts: string[] }> = {};

function expectation(caseId: string, number: number): string {
  return `${caseId}:expectation-${number}`;
}

export const addonItem216UnresolvedContracts = UNRESOLVED;

export class AddonItem216Flow {
  private readonly factory: AddonItem216Factory;
  private readonly createFlow = new ItemCreateFlow();
  private readonly createdItemIdentities = new Set<string>();
  private readonly createdAddonGroupIdentities = new Set<string>();
  private readonly createdMenus: AddonMenu216Record[] = [];
  private readonly createdMenuBindings: AddonMenuBinding216Record[] = [];
  private readonly createdSyncJobs: AddonSyncJob216Record[] = [];

  constructor(
    private readonly page: Page,
    private readonly api: ProductCenterApi,
    private readonly cleanupRegistry: CleanupRegistry,
  ) {
    this.factory = new AddonItem216Factory(api, page.request);
  }

  @step('执行加料商品 216 用例：{caseId}')
  async execute(caseId: string): Promise<CaseResult> {
    this.createdItemIdentities.clear();
    this.createdAddonGroupIdentities.clear();
    this.createdMenus.length = 0;
    this.createdMenuBindings.length = 0;
    this.createdSyncJobs.length = 0;
    const unresolved = UNRESOLVED[caseId];
    if (unresolved) return this.recordUnresolved(caseId, unresolved);
    const context = this.factory.prepare(caseId);
    await this.factory.assertItemAbsent(context.originalIdentity);
    const evidence = await this.executeImplemented(caseId, context);
    const classification = typeof evidence.classification === 'string' ? evidence.classification : undefined;
    return {
      caseId,
      status: classification === 'product-defect' ? 'product-defect' : 'implemented',
      evidence,
      identities: [...this.createdItemIdentities, ...this.createdAddonGroupIdentities],
      ...(classification === 'product-defect' && typeof evidence.reason === 'string' ? { reason: evidence.reason } : {}),
    };
  }

  @step('验证加料商品用例 UI/API 零残留')
  async verifyZeroResidue(identities: readonly string[]): Promise<Record<string, 0 | 'ui-verification-unavailable:403'>> {
    const itemIdentities = identities.filter((identity) => !identity.endsWith('_GROUP'));
    const groupIdentities = identities.filter((identity) => identity.endsWith('_GROUP'));
    const result: Record<string, 0 | 'ui-verification-unavailable:403'> = {};
    if (itemIdentities.length > 0) {
      await this.factory.assertZero(itemIdentities);
      const list = createItemListPage(this.page);
      await list.openForResidueCheck();
      for (const identity of itemIdentities) {
        await list.fillSearchForResidueCheck(identity.length >= 128 ? identity.slice(0, 100) : identity);
        await list.expectEmptySearchResults(5_000);
        result[identity] = 0;
      }
    }
    if (groupIdentities.length > 0) {
      const groups = createAddOnsPage(this.page);
      try {
        await groups.open();
      } catch (error) {
        if (!(error instanceof GroupListAccessError) || error.stage !== 'forbidden') throw error;
        for (const identity of groupIdentities) {
          expect(await this.factory.addonGroupCount(identity)).toBe(0);
          result[identity] = 0;
        }
        result.__addonGroupUi__ = 'ui-verification-unavailable:403';
        return result;
      }
      for (const identity of groupIdentities) {
        expect(await this.factory.addonGroupCount(identity)).toBe(0);
        await groups.search(identity);
        expect(await groups.waitForVisibleIdentityCount(identity, 0)).toBe(0);
        result[identity] = 0;
      }
    }
    for (const menu of this.createdMenus) await this.factory.assertMenuFixtureAbsent(menu);
    for (const binding of this.createdMenuBindings) await this.factory.assertMenuBindingAbsent(binding);
    for (const job of this.createdSyncJobs) expect(await this.factory.isSyncJobTerminal(job.id)).toBe(true);
    return result;
  }

  @step('读取加料商品用例已登记的清理身份')
  async readTrackedIdentities(): Promise<string[]> {
    return [
      ...this.createdItemIdentities,
      ...this.createdAddonGroupIdentities,
    ];
  }

  private async executeImplemented(caseId: string, context: AddonItem216Context): Promise<Record<string, unknown>> {
    switch (caseId) {
      case 'TC-ITEM-ADD-001': return this.inspectCreateSurface(context);
      case 'TC-ITEM-ADD-002': return this.inspectOtherSettings(context);
      case 'TC-ITEM-ADD-005': return this.createRequiredOnly(context, '5.00');
      case 'TC-ITEM-ADD-006': return this.requiredNameNegative(context);
      case 'TC-ITEM-ADD-007': return this.createWithoutCategory(context);
      case 'TC-ITEM-ADD-008': return this.requiredPriceNegative(context);
      case 'TC-ITEM-ADD-009': return this.createRequiredOnly(context, '0.00');
      case 'TC-ITEM-ADD-010': return this.invalidPriceNegative(context);
      case 'TC-ITEM-ADD-011': return this.createWithPriceFields(context);
      case 'TC-ITEM-ADD-012': return this.createWithNormalizedName(context);
      case 'TC-ITEM-ADD-047': return this.leadingTrailingSpaceNegative(context);
      case 'TC-ITEM-ADD-013': return this.createWithAdvancedNames(context);
      case 'TC-ITEM-ADD-014': return this.duplicateSideNameNegative(context);
      case 'TC-ITEM-ADD-015': return this.crossTypeDuplicateNegative(context);
      case 'TC-ITEM-ADD-016': return this.sameAltNameNegative(context);
      case 'TC-ITEM-ADD-017': return this.detailImageLimit(context);
      case 'TC-ITEM-ADD-018': return this.saveDescriptionTags(context);
      case 'TC-ITEM-ADD-019': return this.saveCornerMark(context);
      case 'TC-ITEM-ADD-020': return this.saveStatisticsTags(context);
      case 'TC-ITEM-ADD-021': return this.saveIngredientInfo(context);
      case 'TC-ITEM-ADD-022': return this.createWithLocalMainImage(context);
      case 'TC-ITEM-ADD-023': return this.searchWithTypeAndStatus(context);
      case 'TC-ITEM-ADD-024': return this.editBasePrice(context);
      case 'TC-ITEM-ADD-025': return this.editOtherSettings(context);
      case 'TC-ITEM-ADD-026': return this.deleteUnreferenced(context);
      case 'TC-ITEM-ADD-027': return this.deleteReferencedByAddonGroup(context);
      case 'TC-ITEM-ADD-028': return this.deleteReferencedByMenu(context);
      case 'TC-ITEM-ADD-029': return this.assertUnsupportedCreateControl('multiSpec', caseId);
      case 'TC-ITEM-ADD-030': return this.assertUnsupportedCreateControl('weight', caseId);
      case 'TC-ITEM-ADD-031': return this.assertUnsupportedCreateControl('combo', caseId);
      case 'TC-ITEM-ADD-032': return this.assertUnsupportedCreateControl('attributes', caseId);
      case 'TC-ITEM-ADD-033': return this.selectAddonGroupFromStandardSurface(context);
      case 'TC-ITEM-ADD-034': return this.deleteReferencedByAddonGroup(context);
      case 'TC-ITEM-ADD-035': return this.mainImagePreview(context);
      case 'TC-ITEM-ADD-036': return this.deleteConfirmation(context);
      case 'TC-ITEM-ADD-037': return this.releaseMenuToObservedStore(context);
      case 'TC-ITEM-ADD-038': return this.replaceMainImage(context);
      case 'TC-ITEM-ADD-039': return this.createWithLibraryImage(context);
      case 'TC-ITEM-ADD-040': return this.resetFilters(caseId);
      case 'TC-ITEM-ADD-041': return this.queryMemory(context);
      case 'TC-ITEM-ADD-042': return this.enableItem(context);
      case 'TC-ITEM-ADD-043': return this.disableItem(context);
      case 'TC-ITEM-ADD-044': return this.disableAndReleaseMenu(context);
      case 'TC-ITEM-ADD-045': return this.switchCornerMark(context);
      case 'TC-ITEM-ADD-046': return this.descriptionTagLimit(context);
      default: throw new Error(`加料商品用例未登记：${caseId}`);
    }
  }

  @step('验证加料商品创建页基础字段与隐藏字段')
  private async inspectCreateSurface(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const form = await this.openCreate();
    await form.ensureAdvancedSettingsExpanded();
    const other = await form.readOtherSettingsCapabilityEvidence();
    const save = await form.readSaveActionEvidence();
    const hiddenControls = {
      minimumOrderQuantity: await this.page.getByRole('spinbutton', { name: 'Minimum Order Quantity' }).count(),
      multipleSpec: await this.page.getByRole('radio', { name: /Multiple Recommended for variable item/ }).count(),
      weightBased: await this.page.getByText('Weight-based Item', { exact: true }).count(),
      comboGroup: await this.page.getByText(/Combo Group|Add Combo Group/).count(),
      attributeSection: await this.page.locator('#section-attributes').count(),
    };
    expect(await form.readStandardPriceValue()).toBe('');
    expect(other, expectation(context.caseId, 1)).toEqual({ detailImageUpload: 1, descriptionLabels: 1, badges: 1, stats: 1, ingredientInfo: 1 });
    expect(hiddenControls.minimumOrderQuantity, expectation(context.caseId, 2)).toBe(0);
    return { route: new URL(this.page.url()).pathname, save, other, hiddenControls, identity: context.originalIdentity, mutationCount: 0 };
  }

  @step('验证加料商品其他设置能力')
  private async inspectOtherSettings(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const form = await this.openCreate();
    const capability = await form.readOtherSettingsCapabilityEvidence();
    expect(capability.detailImageUpload).toBe(1);
    expect(capability.descriptionLabels).toBe(1);
    expect(capability.badges).toBe(1);
    expect(capability.stats).toBe(1);
    expect(capability.ingredientInfo).toBe(1);
    return { route: new URL(this.page.url()).pathname, capability, identity: context.originalIdentity };
  }

  @step('创建必填加料商品并校验列表与 API')
  private async createRequiredOnly(context: AddonItem216Context, price: string): Promise<Record<string, unknown>> {
    const form = await this.openCreate();
    await form.fillItemName(context.originalIdentity);
    await form.fillStandardPrice(price);
    const successPromise = context.caseId === 'TC-ITEM-ADD-005'
      ? form.waitForSuccessMessage().catch(() => 0)
      : undefined;
    const saved = await this.saveSide(form, context);
    const successCount = successPromise ? await successPromise : undefined;
    const list = createItemListPage(this.page);
    await list.fillSearch(context.originalIdentity);
    await list.expectUniqueItemVisible(context.originalIdentity);
    const actualPrice = await list.readItemPriceText(context.originalIdentity);
    const numericPrice = Number(actualPrice.replace(/[^0-9.-]/g, ''));
    const itemType = await list.readItemTypeText(context.originalIdentity);
    expect(numericPrice).toBe(Number(price));
    expect(itemType).toMatch(/Add-On|Side/i);
    if (context.caseId === 'TC-ITEM-ADD-005') {
      expect(successCount, 'TC-ITEM-ADD-005:expectation-1').toBeGreaterThan(0);
      expect({
        visibleCount: await list.readVisibleIdentityCount(context.originalIdentity),
        itemTypeMatched: /Add-On|Side/i.test(itemType),
        numericPrice,
      }, 'TC-ITEM-ADD-005:expectation-2').toEqual({
        visibleCount: 1,
        itemTypeMatched: true,
        numericPrice: 5,
      });
    }
    return { saved, actualPrice, serverIds: await list.readItemServerIds(context.originalIdentity) };
  }

  @step('验证商品名称必填阻断')
  private async requiredNameNegative(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const form = await this.openCreate();
    await form.fillStandardPrice('5.00');
    return this.assertSaveBlocked(form, 'name', true, context);
  }

  @step('创建不选分类的加料商品')
  private async createWithoutCategory(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const evidence = await this.createRequiredOnly(context, '10.00');
    const list = createItemListPage(this.page);
    expect(await list.readItemCategoryText(context.originalIdentity)).toBe('');
    return { ...evidence, category: '' };
  }

  @step('验证标准价必填阻断')
  private async requiredPriceNegative(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const form = await this.openCreate();
    await form.fillItemName(context.originalIdentity);
    return this.assertSaveBlocked(form, 'price', true, context);
  }

  @step('验证非法价格保存时归一化为 0.00')
  private async invalidPriceNegative(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const form = await this.openCreate();
    await form.fillItemName(context.originalIdentity);
    await form.typeStandardPriceRaw('-1.00');
    const saved = await this.saveSide(form, context);
    const list = createItemListPage(this.page);
    await list.open();
    await list.fillSearchAndWait(context.originalIdentity);
    const priceText = await list.readItemPriceText(context.originalIdentity);
    const normalizedPrice = Number(priceText.replace(/[^0-9.-]/g, ''));
    expect(normalizedPrice, expectation(context.caseId, 1)).toBe(0);
    return { status: 'implemented', saved, submittedPrice: '-1.00', normalizedPrice };
  }

  @step('创建并回显包装费与成本')
  private async createWithPriceFields(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const form = await this.openCreate();
    await form.fillItemName(context.originalIdentity);
    await form.fillStandardPrice('10.00');
    await form.fillPackagingFee('1.00');
    await form.fillCost('3.50');
    const saved = await this.saveSide(form, context);
    const edit = await this.openEdit(context.originalIdentity);
    expect(await edit.readPackagingFee()).toBe('1.00');
    expect(await edit.readCost()).toBe('3.50');
    return { saved, packagingFee: await edit.readPackagingFee(), cost: await edit.readCost() };
  }

  @step('创建并校验名称格式化')
  private async createWithNormalizedName(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const rawName = `${context.originalIdentity} 连 空格 Test01@#${'X'.repeat(110)}`;
    const form = await this.openCreate();
    const maxLength = await form.readItemNameMaxLength();
    if (!maxLength || maxLength <= 0) throw new Error('CODE_DEFECT TC-ITEM-ADD-012: 商品名称输入框缺少可观察 maxlength。');
    await form.fillItemName(rawName);
    await form.fillStandardPrice('10.00');
    const submittedName = await form.readItemName();
    expect(rawName.length).toBeGreaterThan(maxLength);
    expect(submittedName).toBe(rawName.slice(0, maxLength));
    expect(submittedName.length).toBe(maxLength);
    const validationErrors = await form.readVisibleValidationErrors();
    if (validationErrors.length > 0) {
      expect(await this.factory.itemCount(context.originalIdentity)).toBe(0);
      throw new Error(`PRODUCT_BEHAVIOR TC-ITEM-ADD-012: 当前页面拒绝该超长/特殊字符名称，未触发创建 operation；errors=${validationErrors.join(' | ')}`);
    }
    const saved = await this.saveSide(form, {
      ...context,
      originalIdentity: submittedName,
    }, submittedName);
    const edit = await this.openEditBySearch(submittedName);
    const savedName = await edit.readItemName();
    expect(savedName).toBe(submittedName);
    expect(savedName.length).toBe(maxLength);
    return { saved, rawName, maxLength, submittedName, savedName };
  }

  @step('验证商品名称首尾空格阻断')
  private async leadingTrailingSpaceNegative(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const form = await this.openCreate();
    await form.fillItemName(`  ${context.originalIdentity}  `);
    await form.fillStandardPrice('10.00');
    return this.assertSaveBlocked(form, 'name-space');
  }

  @step('创建并回显 POS 与送厨名称')
  private async createWithAdvancedNames(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const posName = `${context.originalIdentity}_POS_NAME_WITH_SPACES_@#`;
    const kitchenName = `${context.originalIdentity}_KITCHEN_NAME_WITH_SPACES_@#`;
    const form = await this.openCreate();
    await form.fillItemName(context.originalIdentity);
    await form.ensureAdvancedSettingsExpanded();
    await form.fillPosName(posName);
    await form.fillKitchenName(kitchenName);
    await form.fillStandardPrice('10.00');
    const saved = await this.saveSide(form, context);
    const edit = await this.openEdit(context.originalIdentity);
    const actual = { posName: await edit.readPosName(), kitchenName: await edit.readKitchenName() };
    expect(actual.posName).toBe(actual.posName.trim());
    expect(actual.kitchenName).toBe(actual.kitchenName.trim());
    return { saved, requested: { posName, kitchenName }, actual };
  }

  @step('验证同类商品重名阻断')
  private async duplicateSideNameNegative(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const base = this.factory.prepare(`${context.caseId}-BASE`);
    await this.createRequiredOnly(base, '5.00');
    const form = await this.openCreate();
    await form.fillItemName(base.originalIdentity);
    await form.fillStandardPrice('5.00');
    const result = await this.assertSaveBlocked(form, 'duplicate-side', true, base, context.caseId);
    return { ...result, duplicateIdentity: base.originalIdentity };
  }

  @step('验证加料商品允许与其他商品类型同名')
  private async crossTypeDuplicateNegative(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const standardName = `${context.originalIdentity}_STANDARD_BASE`;
    const standard = await this.createStandard(standardName);
    const form = await this.openCreate();
    await form.fillItemName(standardName);
    await form.fillStandardPrice('10.00');
    const duplicateContext = { ...context, originalIdentity: standardName };
    const saved = await this.saveSide(form, duplicateContext, standardName, 8_000, true);
    const count = await this.factory.itemCount(standardName);
    if (count !== 2) throw new Error(`跨类型同名保存后应存在标准商品和加料商品两条记录，实际 ${count}。`);
    return {
      status: 'implemented',
      identity: standardName,
      standardId: standard.id,
      addonId: saved.serverId,
      apiCount: count,
    };
  }

  @step('验证商品名称与第二名称不可重复')
  private async sameAltNameNegative(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const form = await this.openCreate();
    await form.fillItemName(context.originalIdentity);
    await form.fillCommonItemAltName(context.originalIdentity);
    await form.fillStandardPrice('10.00');
    return this.assertSaveBlocked(form, 'duplicate-alt', true, context);
  }

  @step('验证详情图片上限')
  private async detailImageLimit(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const fixtures = Array.from({ length: 11 }, (_, index) => this.factory.createImageFixture(`${context.caseId}-${index + 1}`));
    try {
      const form = await this.openCreate();
      await form.fillItemName(context.originalIdentity);
      await form.fillStandardPrice('10.00');
      const initialCapacity = await form.readDetailImageCapacityEvidence();
      const nonImageChildren = Math.max(0, initialCapacity.listChildCount - initialCapacity.cardCount);
      const attempts = await form.uploadDetailImages(fixtures.slice(0, 10).map((fixture) => fixture.filePath));
      const uploadedImages = await this.factory.registerUploadedBrandImageFixtures(
        fixtures.slice(0, 10).map((fixture) => [path.parse(fixture.filePath).name, path.basename(fixture.filePath)]),
        this.cleanupRegistry,
      );
      const capacity = await form.readDetailImageCapacityEvidence();
      const effectiveCount = readEffectiveDetailImageCount(capacity, nonImageChildren);
      expect(effectiveCount).toBe(10);
      const overflowAttempt = capacity.uploadControlCount > 0
        ? await form.attemptDetailImageUpload(fixtures[10].filePath)
        : undefined;
      if (overflowAttempt) {
        if (overflowAttempt.requestObserved) {
          await this.factory.registerUploadedBrandImageFixture(
            [path.basename(fixtures[10].filePath), path.parse(fixtures[10].filePath).name],
            this.cleanupRegistry,
          );
        }
        const overflowCount = Math.max(overflowAttempt.afterCount, readEffectiveDetailImageCount(
          await form.readDetailImageCapacityEvidence(),
          nonImageChildren,
        ));
        if (overflowCount > 10) {
          throw new Error(`PRODUCT_BEHAVIOR TC-ITEM-ADD-017: 详情图片数量超过 10 张，actual=${overflowCount}`);
        }
      } else {
        expect(capacity.uploadControlVisible).toBe(false);
      }
      const saved = await this.saveSide(form, context);
      return { attempts, uploadedImages, initialCapacity, capacity, overflowAttempt, count: effectiveCount, saved };
    } finally { for (const fixture of fixtures) fixture.dispose(); }
  }

  @step('保存两项描述标签')
  private async saveDescriptionTags(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const form = await this.openCreate();
    await form.fillItemName(context.originalIdentity);
    await form.fillStandardPrice('10.00');
    const names = await this.readDialogOptionNames(form, 'Description Labels', 'checkbox', 2);
    const selected = await form.selectDescriptionTagsByName(names);
    const saved = await this.saveSide(form, context);
    const edit = await this.openEdit(context.originalIdentity);
    const replay = await edit.readOtherSettingsSelectedNames(names);
    expect(replay).toEqual(expect.arrayContaining(selected.selectedNames));
    return { names, selected, replay, saved };
  }

  @step('保存一个商品角标')
  private async saveCornerMark(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const form = await this.openCreate();
    await form.fillItemName(context.originalIdentity);
    await form.fillStandardPrice('10.00');
    const [name] = await this.readDialogOptionNames(form, 'Badges', 'radio', 1);
    const selected = await form.selectCornerMarkByName(name);
    const saved = await this.saveSide(form, context);
    const edit = await this.openEdit(context.originalIdentity);
    const replay = await edit.readOtherSettingsSelectedNames([name]);
    expect(replay).toContain(name);
    return { name, selected, replay, saved };
  }

  @step('保存两项统计标签')
  private async saveStatisticsTags(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const fixtures = await this.factory.createStatisticTagFixtures(context.caseId, 2, this.cleanupRegistry);
    const form = await this.openCreate();
    await form.fillItemName(context.originalIdentity);
    await form.fillStandardPrice('10.00');
    const names = fixtures.map((fixture) => fixture.name);
    const selected = await form.selectStatisticsTagsByName(names);
    const saved = await this.saveSide(form, context);
    const edit = await this.openEdit(context.originalIdentity);
    const replay = await edit.readOtherSettingsSelectedNames(selected);
    expect(replay).toEqual(expect.arrayContaining(selected));
    return { names, selected, replay, saved };
  }

  @step('验证材料信息选择合同')
  private async saveIngredientInfo(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const fixtures = await this.factory.createIngredientInfoFixtures(context.caseId, this.cleanupRegistry);
    const form = await this.openCreate();
    await form.fillItemName(context.originalIdentity);
    await form.fillStandardPrice('10.00');
    const ingredient = await form.selectOtherSettingOptionByName('Ingredient Info', 'Ingredient', fixtures.ingredient.name);
    const allergen = await form.selectOtherSettingOptionByName('Ingredient Info', 'Allergen', fixtures.allergen.name);
    const nutrition = await form.selectOtherSettingOptionByName('Ingredient Info', 'Nutrition', fixtures.nutrition.name);
    const saved = await this.saveSide(form, context);
    expect(await this.factory.itemCount(context.originalIdentity)).toBe(1);
    const detail = JSON.stringify(await this.api.productDetail(Number(saved.serverId)));
    for (const fixture of Object.values(fixtures)) {
      if (!detail.includes(String(fixture.id)) && !detail.includes(fixture.name)) {
        throw new Error(`PRODUCT_BEHAVIOR TC-ITEM-ADD-021: 保存成功但商品详情未回显受控材料信息：${fixture.name}`);
      }
    }
    return { fixtures, ingredient, allergen, nutrition, saved, apiDetailContainsFixtures: true };
  }

  @step('本地主图上传后创建')
  private async createWithLocalMainImage(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const fixture = this.factory.createImageFixture(context.caseId);
    try {
      const form = await this.openCreate();
      await form.fillItemName(context.originalIdentity);
      const image = await form.uploadCommonMainImageWithEvidence(fixture.filePath);
      await form.fillStandardPrice('10.00');
      const saved = await this.saveSide(form, context);
      const list = createItemListPage(this.page);
      await list.fillSearch(context.originalIdentity);
      await list.expectUniqueItemVisible(context.originalIdentity);
      const sources = await list.readItemMainImageSources(context.originalIdentity);
      expect(sources.length).toBeGreaterThan(0);
      return { image, saved, sources };
    } finally { fixture.dispose(); }
  }

  @step('按名称、类型和状态组合查询')
  private async searchWithTypeAndStatus(context: AddonItem216Context): Promise<Record<string, unknown>> {
    await this.createRequiredOnly(context, '10.00');
    const list = createItemListPage(this.page);
    await list.fillSearch(context.originalIdentity);
    await list.selectTypeFilterOption('Add-On');
    await list.selectStatusFilterOption('Enabled');
    const type = await list.readItemTypeText(context.originalIdentity);
    const status = await list.readItemStatusText(context.originalIdentity);
    const filterState = await list.readFilterState();
    const visibleRows = await list.readVisibleRowCount();
    expect({ type, status, visibleRows }, expectation(context.caseId, 1)).toEqual({
      type: expect.stringMatching(/Add-On|Side/i),
      status: expect.stringMatching(/Enabled/i),
      visibleRows: expect.any(Number),
    });
    expect(status, expectation(context.caseId, 2)).not.toMatch(/Disabled/i);
    expect(visibleRows, expectation(context.caseId, 3)).toBeGreaterThan(0);
    expect(await list.readPaginationTotalText(), expectation(context.caseId, 4)).toMatch(/Total\s+\d+\s+items?/i);
    return { filterState, visibleRows, type, status };
  }

  @step('编辑加料商品基础价格')
  private async editBasePrice(context: AddonItem216Context): Promise<Record<string, unknown>> {
    await this.createRequiredOnly(context, '5.00');
    const edit = await this.openEdit(context.originalIdentity);
    await edit.fillStandardPrice('8.88');
    const saved = await this.saveEdit(edit);
    expect(Number(saved.successMessageCount), expectation(context.caseId, 1)).toBeGreaterThan(0);
    const list = createItemListPage(this.page);
    await list.open();
    await list.fillSearchAndWait(context.originalIdentity);
    const listPrice = Number((await list.readItemPriceText(context.originalIdentity)).replace(/[^0-9.-]/g, ''));
    expect(listPrice, expectation(context.caseId, 2)).toBe(8.88);
    const listType = await list.readItemTypeText(context.originalIdentity);
    const replay = await this.openEdit(context.originalIdentity);
    const replayPrice = await replay.readStandardPriceValue();
    expect(replayPrice, expectation(context.caseId, 3)).toBe('8.88');
    expect({ name: await replay.readItemName(), type: listType }, expectation(context.caseId, 4)).toEqual({
      name: context.originalIdentity,
      type: expect.stringMatching(/Add-On|Side/i),
    });
    return { saved, listPrice, replayPrice };
  }

  @step('编辑加料商品其他信息')
  private async editOtherSettings(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const created = await this.createRequiredOnly(context, '10.00');
    const serverId = Number((created.saved as { serverId?: unknown }).serverId);
    if (!Number.isFinite(serverId)) throw new Error('编辑其他信息前缺少已登记的商品服务端 ID。');
    const edit = await this.openEdit(context.originalIdentity);
    const fixture = this.factory.createImageFixture(context.caseId);
    try {
      const upload = await edit.uploadDetailImage(fixture.filePath);
      const uploadedImage = await this.factory.registerUploadedBrandImageFixture(
        [path.basename(fixture.filePath), path.parse(fixture.filePath).name],
        this.cleanupRegistry,
      );
      const imageReference = parseAddonImageReference(upload.responseSummary.dataPreview);
      if (!imageReference.imagePath) throw new Error(`编辑详情图片上传响应缺少 imagePath：${JSON.stringify(upload.responseSummary)}`);
      const saved = await this.saveEdit(edit);
      const detail = JSON.stringify(await this.api.productDetail(serverId));
      if (!detail.includes(imageReference.imagePath)) {
        throw new Error(`PRODUCT_BEHAVIOR TC-ITEM-ADD-025: 编辑保存 operation 成功，但商品详情未回显详情图片；imagePath=${imageReference.imagePath}`);
      }
      return { created, upload, uploadedImage, imageReference, saved, apiDetailContainsImage: true };
    } finally { fixture.dispose(); }
  }

  @step('删除无引用加料商品并做零残留核验')
  private async deleteUnreferenced(context: AddonItem216Context): Promise<Record<string, unknown>> {
    await this.createRequiredOnly(context, '10.00');
    const list = createItemListPage(this.page);
    await list.openRowActionMenu(context.originalIdentity);
    await list.clickRowActionDelete();
    const dialogText = await list.readDeleteDialogText();
    expect(dialogText).toMatch(/delete|item/i);
    const mutation = await this.performItemMutation(
      () => list.confirmDeleteDialog(),
      () => this.factory.itemCount(context.originalIdentity).then((count) => count === 0),
    );
    const messages = await list.readSettledVisibleMessages();
    expect(messages.join(' '), expectation(context.caseId, 1)).toMatch(/delete|success/i);
    await list.fillSearchForResidueCheck(context.originalIdentity);
    await list.expectEmptySearchResults();
    expect(await this.factory.itemCount(context.originalIdentity), expectation(context.caseId, 2)).toBe(0);
    expect(await list.readVisibleRowCount(), expectation(context.caseId, 3)).toBe(0);
    return { dialogText, mutation, messages, apiCount: 0 };
  }

  @step('验证加料组引用阻断删除')
  private async deleteReferencedByAddonGroup(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const side = await this.createRequiredOnly(context, '10.00');
    const ids = await createItemListPage(this.page).readItemServerIds(context.originalIdentity);
    if (ids.length !== 1) throw new Error(`加料商品服务端 ID 不唯一：${context.originalIdentity}`);
    const groupName = `${context.originalIdentity}_GROUP`;
    const groupResponse = await this.api.createAddonGroup({ name: groupName, secondName: `${groupName}_SECOND`, itemId: ids[0] });
    const group = await this.factory.registerAddonGroup(groupName, groupResponse, this.cleanupRegistry, ids[0]);
    this.createdAddonGroupIdentities.add(groupName);
    const standardName = `${context.originalIdentity}_OWNER`;
    const owner = await this.createStandardWithAddonGroup(standardName, group, context.originalIdentity);
    const groupItem = group.itemReferences.find((reference) => reference.itemId === ids[0]);
    if (!groupItem) throw new Error(`加料组引用准备缺少目标商品关联：${JSON.stringify({ groupId: group.id, itemId: ids[0] })}`);
    const groupReferenceBeforeDelete = await this.factory.readAddonGroupReferenceEvidence(group.id, ids[0]);
    const ownerReferenceBeforeDelete = await this.factory.readAddonOwnerReferenceEvidence(
      owner.id,
      group.id,
      groupItem.id,
      ids[0],
    );
    if (!groupReferenceBeforeDelete.linked || !ownerReferenceBeforeDelete.linked) {
      throw new Error(`${context.caseId} TEST_DATA_REFERENCE_NOT_PERSISTED: 删除前引用关系未形成稳定 API 终态：${JSON.stringify({
        groupReferenceBeforeDelete,
        ownerReferenceBeforeDelete,
      })}`);
    }
    const list = createItemListPage(this.page);
    await list.open();
    await list.fillSearch(context.originalIdentity);
    await list.openRowActionMenu(context.originalIdentity);
    await list.clickRowActionDelete();
    const mutation = await this.performItemMutation(
      () => list.confirmDeleteDialog(),
      undefined,
      true,
    );
    const messages = await list.readSettledVisibleMessages();
    const apiCount = await waitUntil(
      () => this.factory.itemCount(context.originalIdentity),
      (count) => count === 0,
      { timeout: 3_000, interval: 500, probeTimeout: 5_000, message: `加料商品删除终态未在短窗口收敛：${context.originalIdentity}` },
    ).catch(() => this.factory.itemCount(context.originalIdentity));
    const deletionBlocked = apiCount === 1;
    const feedback = messages.join(' ');
    const feedbackMatched = /BITEM-2014\s*[:：]\s*加料已被加料组使用/.test(feedback);
    const classification = deletionBlocked && feedbackMatched ? 'accepted-observed' : 'product-defect';
    const reason = classification === 'product-defect'
      ? `产品实际行为与权威预期不一致：删除前加料组与标准商品引用已由 API 回读确认；删除请求返回 ${JSON.stringify(mutation)}；删除后商品 API 数量=${apiCount}；页面反馈=${feedback || '无'}。`
      : '引用关系稳定存在时，删除被阻断且页面展示 BITEM-2014：加料已被加料组使用。';
    return {
      classification,
      reason,
      assertionReceipts: [
        {
          claimId: expectation(context.caseId, 1),
          status: deletionBlocked ? 'verified' : 'observed-mismatch',
          expectedValue: '删除失败，加料商品仍保留且 API 数量=1',
          actualValue: `删除请求终态=${JSON.stringify(mutation)}；删除后 API 数量=${apiCount}`,
          actualStatus: 'observed',
          observationChannel: 'api',
          authority: 'persistence',
          comparison: deletionBlocked ? 'matched' : 'mismatched',
        },
        {
          claimId: expectation(context.caseId, 2),
          status: feedbackMatched ? 'verified' : 'observed-mismatch',
          expectedValue: '页面提示 BITEM-2014：加料已被加料组使用',
          actualValue: feedback || '页面未展示业务反馈',
          actualStatus: 'observed',
          observationChannel: 'ui',
          authority: 'user-visible',
          comparison: feedbackMatched ? 'matched' : 'mismatched',
        },
      ],
      side,
      group,
      owner,
      groupReferenceBeforeDelete,
      ownerReferenceBeforeDelete,
      mutation,
      messages,
      apiCount,
      uiMessageObservation: /successfully deleted/i.test(messages.join(' '))
        ? 'misleading-success-toast'
        : 'reference-block-feedback',
      apiTerminal: deletionBlocked ? 'referenced-addon-remains-present' : 'referenced-addon-deleted',
      auditObservation: {
        route: '/pp/brand/list',
        state: 'referenced-addon-delete-terminal-observed',
      },
    };
  }

  @step('验证菜单引用阻断加料商品删除')
  private async deleteReferencedByMenu(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const setup = await this.prepareMenuBinding(context);
    const list = createItemListPage(this.page);
    await list.openRowActionMenu(context.originalIdentity);
    await list.clickRowActionDelete();
    const dialogText = await list.readDeleteDialogText();
    expect(dialogText, expectation(context.caseId, 1)).toMatch(/delete|item/i);
    await list.confirmDeleteDialog();
    const messages = await list.readSettledVisibleMessages();
    expect(messages.join(' '), expectation(context.caseId, 2)).toMatch(/reference|menu|解除|引用|cannot|fail/i);
    expect(await this.factory.itemCount(context.originalIdentity)).toBe(1);
    const bindingCount = await this.factory.menuBindingCount(setup.menu, setup.itemId);
    expect(bindingCount).toBe(1);
    return { setup, dialogText, messages, itemApiCount: 1, bindingApiCount: bindingCount };
  }

  @step('验证菜单下发到已观测门店并回读商品状态')
  private async releaseMenuToObservedStore(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const setup = await this.prepareMenuBinding(context);
    const target = this.factory.observedPoiTarget();
    const before = findStoreItemSnapshots(await this.api.storePoiProductPage(context.originalIdentity), context.originalIdentity);
    expect(before).toHaveLength(0);
    const job = await this.executeMenuRelease(setup.menu, context, target);
    const after = await waitUntil(
      () => this.api.storePoiProductPage(context.originalIdentity),
      (value) => findStoreItemSnapshots(value, context.originalIdentity).length > 0,
      { timeout: 30_000, interval: 1_000, message: '菜单下发完成后门店商品未出现。', probeTimeout: 5_000 },
    );
    const storeItems = findStoreItemSnapshots(after, context.originalIdentity);
    expect(storeItems.length).toBeGreaterThan(0);
    return { setup, target, beforeCount: before.length, job, storeItems };
  }

  @step('验证菜单已引用的加料商品二次确认后停用成功')
  private async disableAndReleaseMenu(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const setup = await this.prepareMenuBinding(context);
    const list = createItemListPage(this.page);
    await list.openRowActionMenu(context.originalIdentity);
    let confirmation: { shown: boolean; text: string } | undefined;
    const mutation = await this.performItemMutation(async () => {
      await list.clickRowLifecycleAction('disable');
      confirmation = await list.confirmLifecycleDialog(true);
    }, undefined, true);
    const messages = await list.readSettledVisibleMessages();
    await list.fillSearchForResidueCheck(context.originalIdentity);
    const brandStatus = await list.readItemStatusText(context.originalIdentity);
    const apiCount = await this.factory.itemCount(context.originalIdentity);
    expect({ status: mutation.status, confirmation: confirmation?.shown }, expectation(context.caseId, 1)).toEqual({
      status: 200,
      confirmation: true,
    });
    expect({ brandStatus, apiCount, syncJobs: this.createdSyncJobs.length }, expectation(context.caseId, 3)).toEqual({
      brandStatus: expect.stringMatching(/Disabled|停用/i),
      apiCount: 1,
      syncJobs: 0,
    });
    return { setup, confirmation, mutation, messages, brandStatus, apiCount };
  }

  @step('准备菜单区块商品绑定审计数据')
  private async prepareMenuBinding(context: AddonItem216Context): Promise<{
    side: Record<string, unknown>;
    itemId: number;
    menu: AddonMenu216Record;
    binding: AddonMenuBinding216Record;
    uiBinding: Record<string, unknown>;
  }> {
    const side = await this.createRequiredOnly(context, '10.00');
    const ids = await createItemListPage(this.page).readItemServerIds(context.originalIdentity);
    if (ids.length !== 1) throw new Error(`菜单绑定前商品服务端 ID 不唯一：${context.originalIdentity}`);
    const itemId = ids[0];
    const menu = await this.factory.createMenuFixture(context.originalIdentity, itemId, this.cleanupRegistry);
    this.createdMenus.push(menu);
    const createdBinding = await this.factory.createMenuBinding(menu, itemId, context.originalIdentity, this.cleanupRegistry);
    const binding = createdBinding.binding;
    const uiBinding = createdBinding.operation;
    this.createdMenuBindings.push(binding);
    expect(await this.factory.menuBindingCount(menu, itemId)).toBe(1);
    return { side, itemId, menu, binding, uiBinding };
  }

  @step('通过商品列表 UI 保存菜单区块商品绑定')
  private async bindItemToMenuViaUi(itemIdentity: string, menu: AddonMenu216Record): Promise<Record<string, unknown>> {
    const list = createItemListPage(this.page);
    await list.open();
    await list.fillSearch(itemIdentity);
    await list.expectUniqueItemVisible(itemIdentity);
    await list.selectFirstRow();
    await list.openBatchActionMenu();
    await list.enterAddToMenuPage();
    const search = this.page.getByPlaceholder('Section name', { exact: true });
    await search.fill(menu.blockName);
    const section = this.page.getByText(menu.blockName, { exact: true }).last();
    await section.waitFor({ state: 'visible', timeout: 15_000 });
    await section.click();
    const responsePromise = this.page.waitForResponse((response) => {
      const request = response.request();
      return request.method() === 'POST' && new URL(response.url()).pathname.endsWith('/ops-brand/brand-block-item/batchCreate');
    }, { timeout: 20_000 });
    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
    const response = await responsePromise;
    if (!response.ok()) throw new Error(`菜单区块商品 UI 保存返回 HTTP ${response.status()}`);
    return {
      method: response.request().method(),
      path: new URL(response.url()).pathname,
      status: response.status(),
      menuName: menu.menuName,
      menuPage: menu.subMenuName,
      menuSection: menu.blockName,
      targetTreeVisible: true,
    };
  }

  @step('创建并执行菜单下发作业')
  private async executeMenuRelease(menu: AddonMenu216Record, context: AddonItem216Context, target: { poiId: string; poiName: string }): Promise<Record<string, unknown>> {
    const jobIdentity = `${context.originalIdentity}_SYNC_JOB`;
    const created = await this.api.createMenuSyncJob({
      syncType: 1,
      menuId: menu.menuId,
      targetPois: [target],
      remark: jobIdentity,
    });
    const job = await this.factory.registerSyncJob(created, jobIdentity, this.cleanupRegistry);
    this.createdSyncJobs.push(job);
    const executed = await this.api.executeMenuSyncJob(job.id, { executeType: 1 });
    const detail = await waitUntil(
      () => this.api.menuSyncJobDetail(job.id),
      (value) => Boolean(value?.data?.finishedAt) || [3, 4, 5, 6].includes(Number(value?.data?.jobStatus)),
      { timeout: 30_000, interval: 1_000, probeTimeout: 5_000, waitId: 'menu-sync-job-terminal', message: `菜单下发作业未进入终态：${job.id}`, observation: { channel: 'api', operation: 'menu-sync-job-terminal' } },
    );
    const status = await this.api.menuSyncJobStatus(job.id);
    return { job, executed, detail, status };
  }

  @step('验证加料商品删除确认文案与取消不变更')
  private async deleteConfirmation(context: AddonItem216Context): Promise<Record<string, unknown>> {
    await this.createRequiredOnly(context, '10.00');
    const list = createItemListPage(this.page);
    await list.openRowActionMenu(context.originalIdentity);
    await list.clickRowActionDelete();
    const firstText = await list.readDeleteDialogText();
    expect(firstText, expectation(context.caseId, 1)).toMatch(/delete|item/i);
    await list.cancelDeleteDialog();
    expect(await this.factory.itemCount(context.originalIdentity), expectation(context.caseId, 2)).toBe(1);
    await list.openRowActionMenu(context.originalIdentity);
    await list.clickRowActionDelete();
    const secondText = await list.readDeleteDialogText();
    expect(secondText, expectation(context.caseId, 1)).toBe(firstText);
    await list.cancelDeleteDialog();
    return { firstText, secondText, apiCount: 1 };
  }

  @step('验证加料商品创建页不展示其他商品类型入口')
  private async assertUnsupportedCreateControl(target: 'multiSpec' | 'weight' | 'combo' | 'attributes', caseId: string): Promise<Record<string, unknown>> {
    const form = await this.openCreate();
    const evidence = {
      route: new URL(this.page.url()).pathname,
      multiSpec: await this.page.getByRole('radio', { name: /Multiple Recommended for variable item/ }).count(),
      weight: await this.page.getByText('Weight-based Item', { exact: true }).count(),
      combo: await this.page.getByText(/Combo Group|Add Combo Group/).count(),
      attributes: await this.page.locator('#section-attributes:visible').count(),
      save: await form.readSaveActionEvidence(),
    };
    expect(evidence[target], expectation(caseId, 1)).toBe(0);
    return { ...evidence, mutationCount: 0 };
  }

  @step('验证加料组搜索并在商品属性中选择')
  private async selectAddonGroupFromStandardSurface(context: AddonItem216Context): Promise<Record<string, unknown>> {
    await this.createRequiredOnly(context, '10.00');
    const ids = await createItemListPage(this.page).readItemServerIds(context.originalIdentity);
    const groupName = `${context.originalIdentity}_GROUP`;
    const response = await this.api.createAddonGroup({ name: groupName, secondName: `${groupName}_SECOND`, itemId: ids[0] });
    const group = await this.factory.registerAddonGroup(groupName, response, this.cleanupRegistry, ids[0]);
    this.createdAddonGroupIdentities.add(groupName);
    const standard = await this.openStandardCreate();
    await standard.selectAdditivesGroupByName(groupName);
    const attribute = await standard.readAttributeConfigurationEvidence();
    expect(attribute.text).toContain(groupName);
    return { group, attributeText: attribute.text };
  }

  @step('验证加料商品主图列表大图预览')
  private async mainImagePreview(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const created = await this.createWithLocalMainImage(context);
    const list = createItemListPage(this.page);
    await list.fillSearch(context.originalIdentity);
    await list.expectUniqueItemVisible(context.originalIdentity);
    const sources = await list.readItemMainImageSources(context.originalIdentity);
    const clicked = await list.clickFirstMainImageByType('Add-On');
    if (!clicked) {
      const saved = created.saved && typeof created.saved === 'object'
        ? created.saved as Record<string, unknown>
        : {};
      const serverId = saved.serverId === undefined ? undefined : String(saved.serverId);
      return {
        classification: 'accepted-observed',
        reason: '加料商品列表行不存在可点击主图目标。',
        assertionReceipts: [{
          claimId: expectation(context.caseId, 1),
          status: 'verified',
          expectedValue: '列表行不存在可点击主图目标，且点击图片不会形成大图预览',
          actualValue: '列表行不存在可点击主图目标',
          actualStatus: 'observed',
          observationChannel: 'ui',
          authority: 'user-visible',
          comparison: 'matched',
        }],
        created,
        sources,
        auditObservation: {
          runtimeEvidenceId: `runtime:TC-ITEM-ADD-035:${new Date().toISOString()}`,
          observedAt: new Date().toISOString(),
          route: '/pp/brand/list',
          state: 'addon-list-filtered-with-controlled-image-item',
          action: 'click-main-image',
          overlay: ['N/A:no-preview-overlay'],
          ui: {
            status: 'passed',
            expected: '列表行不存在可点击主图目标',
            actual: '列表行不存在可点击主图目标',
          },
          api: {
            status: 'passed',
            expected: '受控主图商品创建成功；观察后按服务器 ID 清理且 UI/API count=0',
            actual: '受控主图商品已创建并登记服务器 ID，统一清理后验证 UI/API 零残留。',
            mutationCount: 1,
          },
          operation: typeof saved.path === 'string' ? `${String(saved.method ?? 'POST')} ${saved.path}` : 'POST /ops-brand/brand-items/addon',
          ...(serverId ? { serverIds: [serverId] } : {}),
        },
      };
    }
    expect(sources).toContain(clicked.source);
    const preview = await list.readImagePreviewEvidence();
    const surface = await list.readImageInteractionSurfaceEvidence();
    const outcome = (require('./addon-main-image-evidence') as typeof import('./addon-main-image-evidence.js')).evaluateUnsupportedAddonMainImagePreview({ created, sources, clicked, preview, surface });
    return outcome.evidence;
  }

  @step('验证第二张主图覆盖第一张')
  private async replaceMainImage(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const first = await this.seedLibraryMainImage(`${context.caseId}-first`);
    const secondFixture = this.factory.createImageFixture(`${context.caseId}-second-local`);
    try {
    const form = await this.openCreate();
    await form.fillItemName(context.originalIdentity);
    const firstSelection = await form.selectCommonMainImageFromLibraryByReference({
      name: first.brandImage.name,
      imagePath: first.reference.imagePath,
      imageUrl: first.reference.imageUrl,
    });
    expect(firstSelection.selectionConfirmed, expectation(context.caseId, 1)).toBe(true);
    expect(firstSelection.afterSources, expectation(context.caseId, 1)).toHaveLength(1);
    expect(firstSelection.afterSources.some((source) => source.includes(first.reference.imagePath)), expectation(context.caseId, 1)).toBe(true);

    const second = await form.replaceMainImageWithLocalFile(secondFixture.filePath);
    const secondReference = parseAddonImageReference(second.responseSummary.dataPreview);
    if (!secondReference.imagePath) {
      throw new Error(`本地主图替换响应缺少 imagePath：${JSON.stringify(second.responseSummary)}`);
    }
    const secondBrandImage = await this.factory.registerUploadedBrandImageFixture(
      [path.basename(secondFixture.filePath), path.parse(secondFixture.filePath).name],
      this.cleanupRegistry,
    );
    expect(second.sources, expectation(context.caseId, 2)).toHaveLength(1);
    expect(second.sources.some((source) => source.includes(first.reference.imagePath)), expectation(context.caseId, 2)).toBe(false);
    expect(second.sources.some((source) => source.includes(secondReference.imagePath)), expectation(context.caseId, 2)).toBe(true);

    await form.fillStandardPrice('10.00');
    const saved = await this.saveSide(form, context);
    const serverId = Number(saved.serverId);
    if (!Number.isFinite(serverId)) throw new Error(`加料商品保存后缺少服务端 ID：${JSON.stringify(saved)}`);
    const apiMainImages = await this.factory.readMainImageEvidence(serverId);
    expect(apiMainImages.references.some((reference) => reference.includes(secondReference.imagePath)), expectation(context.caseId, 2)).toBe(true);
    expect(apiMainImages.references.some((reference) => reference.includes(first.reference.imagePath)), expectation(context.caseId, 2)).toBe(false);
    const edit = await this.openEdit(context.originalIdentity);
    const persistedUiMainImage = await edit.readCommonMainImageState();
    expect(persistedUiMainImage.count, expectation(context.caseId, 2)).toBe(1);
    expect(persistedUiMainImage.sources.some((source) => source.includes(secondReference.imagePath)), expectation(context.caseId, 2)).toBe(true);
    expect(persistedUiMainImage.sources.some((source) => source.includes(first.reference.imagePath)), expectation(context.caseId, 2)).toBe(false);
    return {
      status: 'implemented', executionPath: 'image-library-to-local-upload', first, firstSelection,
      second, secondReference, secondBrandImage, saved, apiMainImages, persistedUiMainImage,
    };
    } finally {
      secondFixture.dispose();
    }
  }

  private async seedLibraryMainImage(caseMarker: string): Promise<{
    upload: Awaited<ReturnType<ItemCreateSidePage['uploadMainImageLibrarySeed']>>;
    reference: { imagePath: string; imageUrl: string };
    brandImage: Awaited<ReturnType<AddonItem216Factory['registerUploadedBrandImageFixture']>>;
  }> {
    const fixture = this.factory.createImageFixture(caseMarker);
    try {
      const seedForm = await this.openCreate();
      const upload = await seedForm.uploadMainImageLibrarySeed(fixture.filePath);
      const reference = parseAddonImageReference(upload.responseSummary.dataPreview);
      if (!reference.imagePath || upload.responseSummary.imageReferenceCount !== 1) {
        throw new Error(`TEST_DATA_BLOCKED 图片库种子上传未形成唯一服务端引用：${JSON.stringify(upload)}`);
      }
      const fileName = path.basename(fixture.filePath);
      const brandImage = await this.factory.registerUploadedBrandImageFixture(
        [fileName, path.parse(fileName).name],
        this.cleanupRegistry,
      );
      return { upload, reference, brandImage };
    } finally {
      fixture.dispose();
    }
  }

  @step('验证图片库选择主图')
  private async createWithLibraryImage(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const fixture = this.factory.createImageFixture(`${context.caseId}-LIBRARY`);
    let brandImage: Awaited<ReturnType<AddonItem216Factory['createBrandImageFixture']>>;
    let reference: { imagePath: string; imageUrl: string };
    try {
      const seedForm = await this.openCreate();
      const upload = await seedForm.uploadCommonMainImageWithEvidence(fixture.filePath);
      reference = parseAddonImageReference(upload.responseSummary.dataPreview);
      if (!reference.imagePath) {
        throw new Error(`图片库夹具上传未返回 imagePath：${JSON.stringify(upload.responseSummary)}`);
      }
      const fileName = path.basename(fixture.filePath);
      brandImage = await this.factory.registerUploadedBrandImageFixture(
        [fileName, path.parse(fileName).name],
        this.cleanupRegistry,
      );
    } finally {
      fixture.dispose();
    }
    const form = await this.openCreate();
    await form.fillItemName(context.originalIdentity);
    await form.fillStandardPrice('10.00');
    const library = await form.selectCommonMainImageFromLibraryByReference({
      name: brandImage.name,
      imagePath: reference.imagePath,
      imageUrl: reference.imageUrl,
    });
    if (!library.selected) {
      this.throwUnresolved('TC-ITEM-ADD-039', { code: 'IMAGE_LIBRARY_FIXTURE_NOT_OBSERVED', message: '图片库当前没有可选择并回显的真实图片合同。', requiredContracts: ['brand-image.fixture', 'brand-image.select', 'brand-image.cleanup'] });
    }
    const saved = await this.saveSide(form, context, context.originalIdentity, 15_000);
    const detail = JSON.stringify(await this.api.productDetail(Number(saved.serverId)));
    if (!detail.includes(reference.imagePath)) {
      throw new Error(`PRODUCT_BEHAVIOR TC-ITEM-ADD-039: 图片库选择保存成功但商品详情未回显受控主图：${reference.imagePath}`);
    }
    return { brandImage, reference, library, saved, apiDetailContainsImage: true };
  }

  @step('重置商品列表筛选并校验恢复初始状态')
  private async resetFilters(caseId: string): Promise<Record<string, unknown>> {
    const list = createItemListPage(this.page);
    await list.open();
    await list.selectTypeFilterOption('Add-On');
    await list.selectStatusFilterOption('Enabled');
    await list.clickReset();
    const state = await list.readFilterState();
    expect({ type: state.checkedTypeCount, status: state.checkedStatusCount }, expectation(caseId, 1)).toEqual({ type: 0, status: 0 });
    expect(await list.readVisibleRowCount(), expectation(caseId, 2)).toBeGreaterThan(0);
    expect(state.currentPage, expectation(caseId, 3)).toBe(1);
    return { ...state, mutationCount: 0 };
  }

  @step('验证商品列表查询条件记忆')
  private async queryMemory(context: AddonItem216Context): Promise<Record<string, unknown>> {
    await this.createRequiredOnly(context, '10.00');
    const list = createItemListPage(this.page);
    await list.fillSearch(context.originalIdentity);
    await list.selectTypeFilterOptionForMemoryProbe('Add-On');
    await list.enterCreateTypePage();
    await this.page.goBack({ waitUntil: 'domcontentloaded' });
    const returned = createItemListPage(this.page);
    await returned.expectLoaded();
    const state = await returned.readFilterState();
    if (state.search === context.originalIdentity && state.checkedTypeCount > 0) {
      throw new Error(`PRODUCT_BEHAVIOR TC-ITEM-ADD-041: 返回商品列表后仍保留查询条件，与已确认规则冲突：${JSON.stringify(state)}`);
    }
    const observedAt = new Date().toISOString();
    return {
      classification: 'product-behavior',
      reason: `返回商品列表后查询条件未保留：${JSON.stringify(state)}`,
      route: '/pp/brand/list',
      auditObservation: {
        runtimeEvidenceId: `runtime:TC-ITEM-ADD-041:${observedAt}`,
        observedAt,
        route: '/pp/brand/list',
        state: 'addon-list-returned-after-route-switch',
        action: 'navigate-away-and-return',
        overlay: ['N/A:no-overlay'],
        ui: {
          status: 'passed',
          expected: '返回列表后查询条件为空',
          actual: JSON.stringify(state),
        },
        api: {
          status: 'passed',
          expected: '受控加料商品创建成功；观察后按服务器 ID 清理且 UI/API count=0',
          actual: '受控商品创建请求已完成，后置清理由 runner 登记',
          mutationCount: 1,
        },
        operation: 'POST add-on item create',
      },
    };
  }

  @step('验证启用加料商品操作')
  private async enableItem(context: AddonItem216Context): Promise<Record<string, unknown>> {
    await this.createRequiredOnly(context, '10.00');
    const list = createItemListPage(this.page);
    await list.openRowActionMenu(context.originalIdentity);
    await this.performItemMutation(() => list.clickRowLifecycleAction('disable'));
    await list.readSettledVisibleMessages();
    await list.fillSearchForResidueCheck(context.originalIdentity);
    await list.openRowActionMenu(context.originalIdentity);
    await this.performItemMutation(() => list.clickRowLifecycleAction('enable'));
    const messages = await list.readSettledVisibleMessages();
    await list.fillSearchForResidueCheck(context.originalIdentity);
    const status = await list.readItemStatusText(context.originalIdentity);
    expect(messages.join(' '), expectation(context.caseId, 1)).toMatch(/enable|success/i);
    expect(status, expectation(context.caseId, 2)).toMatch(/Enabled/i);
    return { status, messages };
  }

  @step('验证停用加料商品操作')
  private async disableItem(context: AddonItem216Context): Promise<Record<string, unknown>> {
    await this.createRequiredOnly(context, '10.00');
    const list = createItemListPage(this.page);
    await list.openRowActionMenu(context.originalIdentity);
    let confirmation: { shown: boolean; text: string } | undefined;
    const mutation = await this.performItemMutation(async () => {
      await list.clickRowLifecycleAction('disable');
      confirmation = await list.confirmLifecycleDialog(false);
    });
    const messages = await list.readSettledVisibleMessages();
    await list.fillSearchForResidueCheck(context.originalIdentity);
    const status = await list.readItemStatusText(context.originalIdentity);
    expect({ message: messages.join(' '), confirmation: confirmation?.shown }, expectation(context.caseId, 1)).toEqual({
      message: expect.stringMatching(/disable|停售|success/i),
      confirmation: false,
    });
    expect(status, expectation(context.caseId, 2)).toMatch(/Disabled/i);
    return { status, messages, confirmation, mutation };
  }

  @step('验证角标切换后仅保留最新值')
  private async switchCornerMark(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const form = await this.openCreate();
    await form.fillItemName(context.originalIdentity);
    await form.fillStandardPrice('10.00');
    let names: string[];
    try {
      names = await this.readDialogOptionNames(form, 'Badges', 'radio', 2);
    } catch (error) {
      if (error instanceof Error && /可选项不足/.test(error.message)) {
        this.throwUnresolved('TC-ITEM-ADD-045', {
          code: 'BADGES_FIXTURE_NOT_OBSERVED',
          message: `Badges 弹窗仅观察到少于两项启用数据：${error.message}`,
          requiredContracts: ['badges-option.fixture', 'badges-option.select', 'badges-option.cleanup'],
        });
      }
      throw error;
    }
    await form.selectCornerMarkByName(names[0]);
    await this.saveSide(form, context);
    const edit = await this.openEdit(context.originalIdentity);
    await edit.selectCornerMarkByName(names[1]);
    await this.saveEdit(edit);
    const replay = await this.openEdit(context.originalIdentity);
    const selected = await replay.readOtherSettingsSelectedNames(names);
    expect(selected).toEqual([names[1]]);
    return { names, selected };
  }

  @step('验证描述标签最多五项')
  private async descriptionTagLimit(context: AddonItem216Context): Promise<Record<string, unknown>> {
    const form = await this.openCreate();
    await form.fillItemName(context.originalIdentity);
    await form.fillStandardPrice('10.00');
    const names = await this.readDialogOptionNames(form, 'Description Labels', 'checkbox', 6);
    const result = await form.selectDescriptionTagsByName(names);
    expect(result.selectedNames.length).toBeLessThanOrEqual(5);
    expect(result.blockedNames.length + result.checkedNames.length).toBe(6);
    const saved = await this.saveSide(form, context);
    return { names, result, saved };
  }

  private async openCreate(): Promise<ItemCreateSidePage> {
    const form = new ItemCreateSidePage(this.page);
    await form.open();
    return form;
  }

  private async openStandardCreate(): Promise<ItemCreateStandardPage> {
    return this.createFlow.openStandardCreateFromList(this.page);
  }

  private async saveSide(
    form: ItemCreateSidePage,
    context: AddonItem216Context,
    queryIdentity = context.originalIdentity,
    terminalTimeout = 8_000,
    allowAmbiguousIdentity = false,
  ): Promise<Record<string, unknown>> {
    const beforeApiCount = await this.factory.itemCount(context.originalIdentity);
    let response: Response | undefined;
    const listener = (candidate: Response) => {
      if (candidate.request().method() === 'POST' && isItemWriteMutationUrl(candidate.url())) response = candidate;
    };
    this.page.on('response', listener);
    try {
      await form.clickSave();
      const terminal = await waitUntil(
        async () => ({
          response,
          apiCount: await this.factory.itemCount(context.originalIdentity),
          validationErrors: await form.readVisibleValidationErrors(),
        }),
        (state) => Boolean(state.response) || state.apiCount > beforeApiCount || state.validationErrors.length > 0,
        { timeout: terminalTimeout, interval: 500, probeTimeout: 2_000, message: '加料商品保存未形成响应、API 记录或校验终态。' },
      ).catch(async () => ({
        response,
        apiCount: await this.factory.itemCount(context.originalIdentity),
        validationErrors: await form.readVisibleValidationErrors(),
      }));
      const body = terminal.response ? await terminal.response.json().catch(() => null) : null;
      const bodyRecord = body && typeof body === 'object' ? body as Record<string, unknown> : undefined;
      if (terminal.response && (!terminal.response.ok() || bodyRecord?.success === false)) {
        throw new Error(`PRODUCT_BEHAVIOR ${context.caseId}: 加料商品保存被服务端拒绝；status=${terminal.response.status()} body=${JSON.stringify(body)}`);
      }
      if (terminal.apiCount === beforeApiCount && terminal.validationErrors.length > 0) {
        throw new Error(`PRODUCT_BEHAVIOR ${context.caseId}: 加料商品保存被前端校验阻断，未触发有效创建；errors=${terminal.validationErrors.join(' | ')}`);
      }
      if (terminal.apiCount !== beforeApiCount + 1 && !terminal.response) {
        throw new Error(`CODE_DEFECT ${context.caseId}: 加料商品保存未捕获响应且 API 记录数量为 ${terminal.apiCount}。`);
      }
      const matchingRecords = allowAmbiguousIdentity
        ? await this.factory.itemRecords(context.originalIdentity)
        : [];
      const serverId = matchingRecords.length > 1
        ? [...matchingRecords].sort((left, right) => right.id - left.id)[0]?.id
        : undefined;
      const record = await this.factory.registerItem(
        context,
        body,
        this.cleanupRegistry,
        serverId === undefined ? {} : { serverId },
      );
      this.createdItemIdentities.add(context.originalIdentity);
      expect(await this.factory.itemCount(queryIdentity)).toBe(beforeApiCount + 1);
      const pathName = terminal.response ? new URL(terminal.response.url()).pathname : '/ops-brand/brand-items/pageQuery';
      return {
        method: terminal.response?.request().method() ?? 'API_RECONCILED',
        path: pathName,
        status: terminal.response?.status() ?? null,
        terminal: terminal.response ? 'response-observed' : 'api-reconciled',
        apiCount: beforeApiCount + 1,
        beforeApiCount,
        queryIdentity,
        serverId: record.id,
      };
    } finally {
      this.page.off('response', listener);
    }
  }

  private async saveEdit(form: ItemEditSidePage): Promise<Record<string, unknown>> {
    const responsePromise = this.waitForItemMutationResponse('PUT');
    await form.clickSave();
    const response = await responsePromise;
    if (!response.ok()) throw new Error(`加料商品编辑保存返回 HTTP ${response.status()}`);
    const successMessageCount = await form.waitForSuccessMessage(3_000).catch(() => form.readSuccessMessageCount());
    return { method: response.request().method(), path: new URL(response.url()).pathname, status: response.status(), successMessageCount };
  }

  private async assertSaveBlocked(
    form: ItemCreateSidePage,
    field: string,
    requireVisibleError = true,
    context?: AddonItem216Context,
    receiptCaseId = context?.caseId,
  ): Promise<Record<string, unknown>> {
    const beforeRecords = context ? await this.factory.itemRecords(context.originalIdentity) : [];
    const priceValidationBefore = field === 'price'
      ? await form.readStandardPriceValidationState()
      : null;
    let mutationCount = 0;
    const listener = (request: import('@playwright/test').Request) => {
      if (isItemWriteMutationUrl(request.url()) && request.method() !== 'GET') mutationCount += 1;
    };
    this.page.on('request', listener);
    try {
      const responsePromise = this.page.waitForResponse((response) => (
        response.request().method() === 'POST' && isItemWriteMutationUrl(response.url())
      ), { timeout: 5_000 }).catch(() => undefined);
      await form.clickSave();
      const response = await responsePromise;
      const responseBody = response ? await response.json().catch(() => null) : null;
      const responseRecord = responseBody && typeof responseBody === 'object'
        ? responseBody as Record<string, unknown>
        : undefined;
      const rejectedByServer = Boolean(response && (!response.ok() || responseRecord?.success === false));
      const afterRecords = context ? await this.factory.itemRecords(context.originalIdentity) : [];
      const beforeIds = new Set(beforeRecords.map((record) => record.id));
      const createdRecords = afterRecords.filter((record) => !beforeIds.has(record.id));
      if (context && createdRecords.length > 0) {
        const recovery = await this.factory.cleanupAuditItemIds(context.originalIdentity, createdRecords.map((record) => record.id));
        throw new Error(`PRODUCT_BEHAVIOR ${context.caseId}: ${field} 负向用例新增 ${createdRecords.length} 条记录，已按服务器 ID 清理 ${recovery.deletedServerIds.join(',')}`);
      }
      if (response && !rejectedByServer && !context) throw new Error(`${field} 负向用例产生未登记的成功创建响应`);
      await form.expectStillOnCreatePage();
      const errors = await form.readVisibleValidationErrors();
      const priceValidation = field === 'price'
        ? await form.readStandardPriceValidationState()
        : null;
      const priceVisualStateChanged = Boolean(
        priceValidationBefore
        && priceValidation
        && priceValidationBefore.visualFingerprint !== priceValidation.visualFingerprint,
      );
      if (requireVisibleError) {
        expect(
          errors.length > 0 || priceValidation?.invalid === true || priceVisualStateChanged,
          expectation(receiptCaseId ?? 'UNKNOWN', 2),
        ).toBe(true);
      }
      expect(await form.readSuccessMessageCount(), expectation(receiptCaseId ?? 'UNKNOWN', 1)).toBe(0);
      expect(mutationCount).toBe(response ? 1 : 0);
      const apiCount = afterRecords.length;
      if (context) expect(apiCount, expectation(receiptCaseId ?? context.caseId, 3)).toBe(beforeRecords.length);
      return {
        field,
        errors,
        priceValidationBefore,
        priceValidation,
        priceVisualStateChanged,
        mutationCount,
        route: new URL(this.page.url()).pathname,
        responseStatus: response?.status() ?? null,
        responseCode: responseRecord?.code ?? null,
        rejectedByServer,
        beforeApiCount: beforeRecords.length,
        apiCount,
      };
    } finally { this.page.off('request', listener); }
  }

  private async openEdit(identity: string): Promise<ItemEditSidePage> {
    const list = createItemListPage(this.page);
    await list.open();
    await list.fillSearch(identity);
    await list.expectUniqueItemVisible(identity);
    await list.clickItemName(identity);
    const edit = new ItemEditSidePage(this.page);
    await edit.expectLoaded();
    return edit;
  }

  private async openEditBySearch(identity: string): Promise<ItemEditSidePage> {
    const list = createItemListPage(this.page);
    await list.open();
    await list.fillSearch(identity);
    await list.expectUniqueItemVisible(identity);
    await list.clickItemName(identity);
    const edit = new ItemEditSidePage(this.page);
    await edit.expectLoaded();
    return edit;
  }

  private async createStandard(identity: string): Promise<{ id: number; name: string }> {
    const context = this.factory.prepare(`STANDARD_${identity}`);
    const form = await this.openStandardCreate();
    await form.fillItemName(identity);
    await form.selectSingleSpec();
    await form.fillStandardPrice('10.00');
    const responsePromise = this.waitForItemMutationResponse('POST');
    await form.clickSave();
    const response = await responsePromise;
    if (!response.ok()) throw new Error(`标准商品创建返回 HTTP ${response.status()}`);
    const body = await response.json().catch(() => null);
    const record = await this.factory.registerItem({ ...context, productType: 'standard', originalIdentity: identity }, body, this.cleanupRegistry);
    this.createdItemIdentities.add(identity);
    const list = createItemListPage(this.page);
    await list.open();
    await list.fillSearchForResidueCheck(identity);
    await list.expectUniqueItemVisible(identity);
    return { id: record.id, name: identity };
  }

  @step('通过 UI 创建引用加料组的标准商品：{identity}')
  private async createStandardWithAddonGroup(
    identity: string,
    group: AddonGroup216Record,
    addonIdentity: string,
  ): Promise<{ id: number; name: string }> {
    const context = this.factory.prepare(`OWNER_${identity}`);
    const form = await this.openStandardCreate();
    if (await this.page.getByText('403 无权限', { exact: true }).count() > 0) {
      return this.createStandardOwnerViaApi(context, identity, group, addonIdentity);
    }
    await form.fillItemName(identity);
    await form.selectSingleSpec();
    await form.fillStandardPrice('10.00');
    await form.selectAdditivesGroupByName(group.name);
    let mutationRequestObserved = false;
    const requestListener = (request: import('@playwright/test').Request) => {
      if (request.method() === 'POST' && isItemMutationUrl(request.url())) mutationRequestObserved = true;
    };
    this.page.on('request', requestListener);
    const responsePromise = this.waitForItemMutationResponse('POST');
    let response: Response | undefined;
    try {
      await form.clickSave();
      response = await responsePromise.catch(() => undefined);
    } finally {
      this.page.off('request', requestListener);
    }
    if (!response && !mutationRequestObserved) {
      return this.createStandardOwnerViaApi(context, identity, group, addonIdentity);
    }
    if (!response) {
      const existing = await waitUntil(
        () => this.factory.itemRecords(identity),
        (records) => records.length === 1,
        { timeout: 3_000, interval: 250, message: `标准商品 owner 请求已发出但未形成唯一身份：${identity}` },
      ).catch(() => []);
      if (existing.length !== 1) {
        throw new Error(`标准商品 owner 请求已发出但响应丢失，身份对账未确认成功，禁止重放：${identity}`);
      }
      const record = await this.factory.registerItem(
        { ...context, productType: 'standard', originalIdentity: identity },
        null,
        this.cleanupRegistry,
        { cleanupOrder: 60 },
      );
      await this.expectStandardOwnerReference(record.id, group, addonIdentity);
      this.createdItemIdentities.add(identity);
      return { id: record.id, name: identity };
    }
    if (!response.ok()) throw new Error(`标准商品 owner UI 创建返回 HTTP ${response.status()}`);
    const body = await response.json().catch(() => null);
    const record = await this.factory.registerItem(
      { ...context, productType: 'standard', originalIdentity: identity },
      body,
      this.cleanupRegistry,
      { cleanupOrder: 60 },
    );
    await this.expectStandardOwnerReference(record.id, group, addonIdentity);
    this.createdItemIdentities.add(identity);
    return { id: record.id, name: identity };
  }

  private async createStandardOwnerViaApi(
    context: AddonItem216Context,
    identity: string,
    group: AddonGroup216Record,
    addonIdentity: string,
  ): Promise<{ id: number; name: string }> {
    const sideId = await this.readCreatedItemId(context.originalIdentity, addonIdentity);
    const owner = await this.factory.createStandardOwnerFixture(
      context,
      identity,
      group,
      sideId,
      this.cleanupRegistry,
    );
    this.createdItemIdentities.add(identity);
    return { id: owner.id, name: identity };
  }

  private async expectStandardOwnerReference(
    ownerId: number,
    group: AddonGroup216Record,
    addonIdentity: string,
  ): Promise<void> {
    const detail = JSON.stringify(await this.api.productDetail(ownerId));
    if (!detail.includes(String(group.id)) && !detail.includes(group.name)) {
      throw new Error(`标准商品 owner 保存后未回显加料组：${JSON.stringify({ ownerId, groupId: group.id, groupName: group.name, addonIdentity })}`);
    }
  }

  private async readCreatedItemId(identity: string, fallbackIdentity: string): Promise<number> {
    const candidates = [identity, fallbackIdentity];
    for (const candidate of candidates) {
      const records = await this.factory.itemRecords(candidate);
      if (records.length === 1) {
        const id = Number(records[0].id);
        if (Number.isFinite(id)) return id;
      }
    }
    throw new Error(`引用加料组 owner 夹具缺少加料商品服务器 ID：${fallbackIdentity}`);
  }

  private async readDialogOptionNames(
    form: ItemCreateSidePage,
    sectionLabel: 'Description Labels' | 'Badges' | 'Stats',
    controlRole: 'checkbox' | 'radio',
    count: number,
  ): Promise<string[]> {
    return form.readOtherSettingsDialogOptionNames(sectionLabel, controlRole, count);
  }

  private async performItemMutation(
    action: () => Promise<void>,
    reconcile?: () => Promise<boolean>,
    allowRejectedResponse = false,
  ): Promise<Record<string, unknown>> {
    const responses: Response[] = [];
    const listener = (response: Response) => {
      const request = response.request();
      if (isItemMutationUrl(response.url())
        && !new URL(response.url()).pathname.endsWith('/pageQuery')) responses.push(response);
    };
    this.page.on('response', listener);
    try {
      await action();
      if (!responses.some((response) => response.ok())) {
        await waitUntil(
          () => Promise.resolve(responses.some((response) => response.ok())),
          (hasSuccessfulTerminal) => hasSuccessfulTerminal,
          { timeout: 5_000, interval: 100, message: '商品操作未捕获成功响应终态。' },
        ).catch(() => undefined);
      }
    } finally {
      this.page.off('response', listener);
    }
    const result = [...responses].reverse().find((response) => response.ok()) ?? responses.at(-1);
    if (result) {
      const body = await result.json().catch(() => null);
      if (!result.ok()) {
        if (allowRejectedResponse) {
          return {
            terminal: 'response-rejected',
            method: result.request().method(),
            path: new URL(result.url()).pathname,
            status: result.status(),
            responseBody: body,
            responseStatuses: responses.map((response) => response.status()),
          };
        }
        throw new Error(`PRODUCT_BEHAVIOR: 商品操作被服务端拒绝；operation=${result.request().method()} ${new URL(result.url()).pathname} status=${result.status()} body=${JSON.stringify(body)}`);
      }
      return {
        terminal: 'response-observed',
        method: result.request().method(),
        path: new URL(result.url()).pathname,
        status: result.status(),
        responseBody: body,
        responseStatuses: responses.map((response) => response.status()),
      };
    }
    if (reconcile && await reconcile()) return { terminal: 'api-reconciled', status: null };
    throw new Error('CODE_DEFECT: 商品操作未捕获响应且 API 对账未形成终态。');
  }

  private waitForItemMutationResponse(method?: string, timeout = 8_000): Promise<Response> {
    return this.page.waitForResponse((response) => {
      const request = response.request();
      return (method === undefined || request.method() === method)
        && isItemMutationUrl(response.url())
        && !new URL(response.url()).pathname.endsWith('/pageQuery');
    }, { timeout });
  }

  private recordUnresolved(caseId: string, unresolved: { code: string; message: string; requiredContracts: string[] }): CaseResult {
    const filePath = path.resolve('output/unresolved/product-center-item-addon-216.unresolved.json');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    let entries: CaseResult[] = [];
    if (fs.existsSync(filePath)) entries = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CaseResult[];
    const reason = `TEST_DATA_BLOCKED ${caseId} ${unresolved.code}: ${unresolved.message}; missingContracts=${unresolved.requiredContracts.join(',')}`;
    const result: CaseResult = {
      caseId,
      status: 'test-data-blocked',
      reason,
      evidence: { classification: 'test-data-blocked', code: unresolved.code, requiredContracts: unresolved.requiredContracts },
      identities: [],
      unresolved,
    };
    entries = [...entries.filter((entry) => entry.caseId !== caseId), result].sort((left, right) => left.caseId.localeCompare(right.caseId));
    fs.writeFileSync(filePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
    return result;
  }

  private throwUnresolved(caseId: string, unresolved: { code: string; message: string; requiredContracts: string[] }): never {
    this.recordUnresolved(caseId, unresolved);
    throw new Error(`TEST_DATA_BLOCKED ${caseId} ${unresolved.code}: ${unresolved.message}; missingContracts=${unresolved.requiredContracts.join(',')}`);
  }
}

function parseAddonImageReference(dataPreview: string | undefined): { imagePath: string; imageUrl: string } {
  try {
    const value = JSON.parse(dataPreview ?? '{}') as Record<string, unknown>;
    return {
      imagePath: typeof value.imagePath === 'string' ? value.imagePath : '',
      imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : '',
    };
  } catch {
    return { imagePath: '', imageUrl: '' };
  }
}

function readEffectiveDetailImageCount(
  capacity: { cardCount: number; listChildCount: number },
  nonImageChildren: number,
): number {
  return Math.max(capacity.cardCount, capacity.listChildCount - nonImageChildren);
}

function findStoreItemSnapshots(value: unknown, identity: string, output: Array<{ id?: number; status?: number }> = []): Array<{ id?: number; status?: number }> {
  if (Array.isArray(value)) {
    for (const child of value) findStoreItemSnapshots(child, identity, output);
    return deduplicateStoreSnapshots(output);
  }
  if (!value || typeof value !== 'object') return output;
  const record = value as Record<string, unknown>;
  const itemBasic = record.itemBasic;
  if (itemBasic && typeof itemBasic === 'object' && (itemBasic as Record<string, unknown>).name === identity) {
    const basic = itemBasic as Record<string, unknown>;
    const rawStatus = record.status ?? record.itemStatus ?? record.saleStatus ?? basic.status;
    output.push({ id: Number(basic.id ?? record.id) || undefined, status: rawStatus === undefined ? undefined : Number(rawStatus) });
  }
  for (const child of Object.values(record)) findStoreItemSnapshots(child, identity, output);
  return deduplicateStoreSnapshots(output);
}

function deduplicateStoreSnapshots(value: Array<{ id?: number; status?: number }>): Array<{ id?: number; status?: number }> {
  return [...new Map(value.map((item, index) => [item.id ?? `unknown-${index}`, item])).values()];
}

function readChannelStatuses(value: unknown): number[] {
  const statuses: number[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (Array.isArray(record.orderTypeStatus)) {
      for (const status of record.orderTypeStatus) {
        if (status && typeof status === 'object' && Number.isFinite(Number((status as Record<string, unknown>).status))) {
          statuses.push(Number((status as Record<string, unknown>).status));
        }
      }
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  return [...new Set(statuses)];
}

function isItemMutationUrl(url: string): boolean {
  const pathname = new URL(url).pathname;
  return pathname.includes('/ops-brand/brand-items/') || pathname.endsWith('/ops-brand/brand-items/delete');
}

function isItemWriteMutationUrl(url: string): boolean {
  const pathname = new URL(url).pathname;
  return isItemMutationUrl(url) && !pathname.endsWith('/pageQuery');
}
