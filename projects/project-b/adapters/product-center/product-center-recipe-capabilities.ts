import type { Page } from '@playwright/test';
import type { ProductCenterApi } from '../../api/product-center/product-center-api';
import { CapabilityRegistry } from '../../automation/recipe/capability-registry';
import type {
  AutomationRecipe,
  RecipeCapabilityContract,
} from '../../automation/recipe/automation-recipe';
import { ProductCenterCreateSopFlow } from '../../flows/product-center/product-center-create-sop.flow';
import { ProductCenterHighDependencySopFlow } from '../../flows/product-center/product-center-high-dependency-sop.flow';
import { ProductCenterLowDependencySopFlow } from '../../flows/product-center/product-center-low-dependency-sop.flow';
import { ProductCenterStoreProductSearchFlow } from '../../flows/product-center/product-center-store-product-search.flow';
import {
  ProductCenterItemStandardCreateFlow,
  type ProductCenterItemStandardCreateResult,
} from '../../flows/product-center/product-center-item-standard-create.flow';
import {
  ProductCenterItemComboCreateFlow,
  type ProductCenterItemComboCreateResult,
} from '../../flows/product-center/product-center-item-combo-create.flow';
import { ProductCenterItemIntakePage } from '../../pages/product-center/product-center-item-intake.page';
import { ProductCenterItemRequiredValidationPage } from '../../pages/product-center/product-center-item-required-validation.page';
import { ProductCenterCreateSopPage } from '../../pages/product-center/product-center-create-sop.page';
import { ProductCenterNegativePage } from '../../pages/product-center/product-center-negative.page';
import { ProductCenterSopPage } from '../../pages/product-center/product-center-sop.page';
import { ProductCenterSidebarNavigationPage } from '../../pages/product-center/product-center-sidebar-navigation.page';
import type { ProductCenterCreateSopDefinition } from '../../sop/product-center/product-center-create-sop.catalog';
import type { HighDependencySopDefinition } from '../../sop/product-center/product-center-high-dependency-sop.catalog';
import type { LowDependencySopDefinition } from '../../sop/product-center/product-center-low-dependency-sop.catalog';
import type { ProductCenterNegativeCase } from '../../sop/product-center/product-center-negative-sop.catalog';
import type { ProductCenterSopCase } from '../../sop/product-center/product-center-sop.types';
import type { ProductCenterCreateContext } from '../../test-data/product-center/sop/product-center-create-data.factory';
import type { CategoryWithProductSeedRecord } from '../../test-data/product-center/sop/product-center-category-negative-data.factory';
import type { HighDependencySeedRecord } from '../../test-data/product-center/sop/product-center-high-dependency-data.factory';
import type { LowDependencySeedRecord } from '../../test-data/product-center/sop/product-center-low-dependency-data.factory';
import type { ProductCenterSopSeedRecord } from '../../test-data/product-center/sop/product-center-sop-data.factory';
import type {
  ProductCenterItemCreateContext,
  ProductCenterItemCreateRecord,
} from '../../test-data/product-center/product-center-item-create-data.factory';
import { ProductCenterItemCategoryLeafProbeFlow } from '../../flows/product-center/product-center-item-category-leaf-probe.flow';
import { ProductCenterItemComboAuditFlow } from '../../flows/product-center/product-center-item-combo-audit.flow';
import { ProductCenterItemGreenReadonlyFlow } from '../../flows/product-center/product-center-item-green-readonly.flow';

type LowDependencySopCase = LowDependencySopDefinition & { action: 'edit' | 'delete' };
type HighDependencySopCase = HighDependencySopDefinition & { action: 'edit' | 'delete' };

export type ProductCenterRecipeRuntimeRecord =
  | ProductCenterCreateContext
  | CategoryWithProductSeedRecord
  | ProductCenterSopSeedRecord
  | LowDependencySeedRecord
  | HighDependencySeedRecord
  | ProductCenterItemCreateContext
  | ProductCenterItemCreateRecord;

export type ProductCenterRecipeRuntime = {
  page: Page;
  api: ProductCenterApi;
  recipe: AutomationRecipe;
  sopCase?: ProductCenterSopCase;
  createDefinition?: ProductCenterCreateSopDefinition;
  lowDependencyCase?: LowDependencySopCase;
  highDependencyCase?: HighDependencySopCase;
  negativeCase?: ProductCenterNegativeCase;
  record?: ProductCenterRecipeRuntimeRecord;
  results: Record<string, unknown>;
};

export const productCenterRecipeCapabilityContracts = [
  { id: 'navigation.sidebar.open', actions: ['create', 'edit', 'delete', 'negative', 'boundary', 'read'], requiredInputs: ['targetPath'] },
  { id: 'coreCreate.execute', actions: ['create'], requiredInputs: ['record'] },
  { id: 'category.open', actions: ['edit', 'delete'], requiredInputs: ['record'] },
  { id: 'category.editIdentity', actions: ['edit'], requiredInputs: ['record'] },
  { id: 'category.deleteIdentity', actions: ['delete'], requiredInputs: ['record'] },
  { id: 'method.open', actions: ['edit', 'delete'], requiredInputs: ['record'] },
  { id: 'method.editIdentity', actions: ['edit'], requiredInputs: ['record'] },
  { id: 'method.deleteIdentity', actions: ['delete'], requiredInputs: ['record'] },
  { id: 'material.open', actions: ['edit', 'delete'], requiredInputs: ['record'] },
  { id: 'material.editIdentity', actions: ['edit'], requiredInputs: ['record'] },
  { id: 'material.deleteIdentity', actions: ['delete'], requiredInputs: ['record'] },
  { id: 'seasoning.open', actions: ['edit', 'delete'], requiredInputs: ['record'] },
  { id: 'seasoning.editIdentity', actions: ['edit'], requiredInputs: ['record'] },
  { id: 'seasoning.deleteIdentity', actions: ['delete'], requiredInputs: ['record'] },
  { id: 'bom.open', actions: ['edit', 'delete'], requiredInputs: ['record'] },
  { id: 'bom.editIdentity', actions: ['edit'], requiredInputs: ['record'] },
  { id: 'bom.deleteIdentity', actions: ['delete'], requiredInputs: ['record'] },
  { id: 'lowDependency.execute', actions: ['edit', 'delete'], requiredInputs: ['record'] },
  { id: 'highDependency.execute', actions: ['edit', 'delete'], requiredInputs: ['record'] },
  { id: 'negative.execute', actions: ['negative', 'boundary'], requiredInputs: ['definitionId'] },
  { id: 'category.attemptAddChildBlockedByProduct', actions: ['negative'], requiredInputs: ['record'] },
  { id: 'methodDetail.enforceNameMaxLength', actions: ['boundary'], requiredInputs: ['record', 'maxLength', 'rejectedLength'] },
  { id: 'statisticTag.openCreateDialog', actions: ['boundary'], requiredInputs: [] },
  { id: 'statisticTag.readSecondLanguageBoundary', actions: ['boundary'], requiredInputs: ['locatorKey', 'acceptedLength', 'rejectedLength'] },
  { id: 'statisticTag.closeCreateDialog', actions: ['boundary'], requiredInputs: [] },
  { id: 'item.openList', actions: ['read'], requiredInputs: [] },
  { id: 'item.validateRequiredName', actions: ['negative'], requiredInputs: [] },
  { id: 'item.openStandardCreate', actions: ['read'], requiredInputs: [] },
  { id: 'item.category.openCascader', actions: ['read'], requiredInputs: [] },
  { id: 'item.category.selectParentWithChildren', actions: ['read'], requiredInputs: ['parentName', 'leafName'] },
  { id: 'item.category.selectLeaf', actions: ['read'], requiredInputs: ['parentName', 'leafName'] },
  { id: 'item.createStandard', actions: ['create'], requiredInputs: ['record', 'specification', 'price', 'minimumOrderQuantity'] },
  { id: 'item.createComboRequiredOnly', actions: ['create'], requiredInputs: ['record', 'price', 'minimumOrderQuantity', 'comboGroupName'] },
  { id: 'item.combo.probeGroupRequired', actions: ['negative'], requiredInputs: ['record'] },
  { id: 'item.combo.probeOptionalEditBoundary', actions: ['create'], requiredInputs: ['record'] },
  { id: 'storeProduct.searchByName', actions: ['read'], requiredInputs: [] },
  { id: 'item.list.searchSecondLanguage', actions: ['read'], requiredInputs: ['keyword'] },
  { id: 'item.combo.readOptionalGroupDialog', actions: ['create'], requiredInputs: [] },
  { id: 'item.list.probeImagePreview', actions: ['read'], requiredInputs: ['typeLabel'] },
  { id: 'item.standard.probeMainImageReplacement', actions: ['create'], requiredInputs: ['firstImagePath', 'secondImagePath'] },
  { id: 'item.standard.probeSpecGroupCreateNavigation', actions: ['read'], requiredInputs: [] },
  { id: 'item.standard.probeFieldValidation', actions: ['negative'], requiredInputs: ['field', 'value'] },
  { id: 'item.standard.createRoundedPricePair', actions: ['create'], requiredInputs: ['values'] },
  { id: 'item.standard.probeMultiSpecWeightDisabled', actions: ['negative'], requiredInputs: [] },
  { id: 'item.standard.probeDescriptionLengthBoundary', actions: ['negative'], requiredInputs: ['acceptedLength', 'rejectedLength'] },
  { id: 'item.standard.probeDetailImageLimit', actions: ['negative'], requiredInputs: ['maximum', 'attempted'] },
  { id: 'item.standard.probeReferencedGroupChildControls', actions: ['negative'], requiredInputs: ['record'] },
  { id: 'item.side.createWithDetailImageLimit', actions: ['create'], requiredInputs: ['maximum'] },
  { id: 'item.standard.mega.editOtherInformation', actions: ['edit'], requiredInputs: [] },
  { id: 'item.standard.mega.createWithParentCategory', actions: ['create'], requiredInputs: [] },
  { id: 'item.standard.mega.createWithLibraryMainImage', actions: ['create'], requiredInputs: [] },
  { id: 'item.standard.mega.createWithLocalMainImage', actions: ['create'], requiredInputs: [] },
  { id: 'item.standard.mega.createFormattedNames', actions: ['create'], requiredInputs: [] },
  { id: 'item.standard.mega.editDescriptionTags', actions: ['edit'], requiredInputs: [] },
  { id: 'item.standard.mega.editMaterialInformation', actions: ['edit'], requiredInputs: [] },
  { id: 'item.standard.mega.editCornerMark', actions: ['edit'], requiredInputs: [] },
  { id: 'item.standard.mega.editStatisticsTags', actions: ['edit'], requiredInputs: [] },
  { id: 'item.list.mega.probeColumnSelection', actions: ['edit'], requiredInputs: [] },
  { id: 'item.list.mega.probeLanguageSwitch', actions: ['edit'], requiredInputs: [] },
  { id: 'item.standard.mega.probeTasteGroupSync', actions: ['edit'], requiredInputs: [] },
  { id: 'item.standard.mega.probeAdvancedFields', actions: ['read'], requiredInputs: [] },
  { id: 'item.list.mega.probePageSizes', actions: ['read'], requiredInputs: [] },
  { id: 'item.list.mega.probeDefaultColumns', actions: ['read'], requiredInputs: [] },
  { id: 'item.list.mega.probeRestoreColumns', actions: ['edit'], requiredInputs: [] },
  { id: 'item.list.mega.enableDisabledItem', actions: ['edit'], requiredInputs: [] },
  { id: 'item.combo.mega.removeAllGroupItems', actions: ['delete'], requiredInputs: [] },
  { id: 'item.combo.mega.probeDeleteConfirmation', actions: ['delete'], requiredInputs: [] },
  { id: 'item.combo.mega.createWithoutCategory', actions: ['create'], requiredInputs: [] },
  { id: 'item.combo.mega.createWithParentCategory', actions: ['create'], requiredInputs: [] },
  { id: 'item.combo.mega.createWithZeroPrice', actions: ['create'], requiredInputs: [] },
  { id: 'item.combo.mega.createWithLibraryMainImage', actions: ['create'], requiredInputs: [] },
  { id: 'item.combo.mega.readOptionalGroupRules', actions: ['create'], requiredInputs: [] },
  { id: 'item.combo.mega.createWithLocalMainImage', actions: ['create'], requiredInputs: [] },
  { id: 'item.combo.mega.probeMainImageReplacement', actions: ['create'], requiredInputs: [] },
  { id: 'item.combo.mega.probeMnemonicMaximum', actions: ['negative'], requiredInputs: [] },
  { id: 'item.combo.mega.probeDescriptionMaximum', actions: ['negative'], requiredInputs: [] },
  { id: 'item.combo.mega.probeDetailImageLimit', actions: ['negative'], requiredInputs: [] },
  { id: 'item.combo.mega.probeReferencedGroupChildControls', actions: ['negative'], requiredInputs: [] },
  { id: 'item.combo.mega.readOtherSettings', actions: ['edit'], requiredInputs: [] },
  { id: 'item.combo.mega.createFormattedName', actions: ['edit'], requiredInputs: [] },
  { id: 'item.combo.mega.createFormattedNames', actions: ['edit'], requiredInputs: [] },
  { id: 'item.combo.mega.editDescriptionTags', actions: ['edit'], requiredInputs: [] },
  { id: 'item.combo.mega.editCornerMark', actions: ['edit'], requiredInputs: [] },
  { id: 'item.combo.mega.editStatisticsTags', actions: ['edit'], requiredInputs: [] },
  { id: 'item.combo.mega.editMaterialInformation', actions: ['edit'], requiredInputs: [] },
  { id: 'item.combo.mega.createWithFixedAndCustomGroups', actions: ['edit'], requiredInputs: [] },
  { id: 'item.combo.mega.editTasteGroup', actions: ['edit'], requiredInputs: [] },
  { id: 'item.combo.mega.probeMutualExclusion', actions: ['edit'], requiredInputs: [] },
  { id: 'item.combo.mega.editMethodGroup', actions: ['edit'], requiredInputs: [] },
  { id: 'item.combo.mega.editAddonGroup', actions: ['edit'], requiredInputs: [] },
  { id: 'item.combo.mega.searchByCombinedFilters', actions: ['edit'], requiredInputs: [] },
  { id: 'item.combo.mega.enableDisabledItem', actions: ['edit'], requiredInputs: [] },
  { id: 'item.combo.mega.disableEnabledItem', actions: ['edit'], requiredInputs: [] },
] as const satisfies readonly RecipeCapabilityContract[];

export function createProductCenterRecipeCapabilityRegistry(options: {
  registerItemCreated?: (
    context: ProductCenterItemCreateContext,
    responseBody: unknown,
  ) => Promise<ProductCenterItemCreateRecord>;
  registerComboGroupCreated?: (
    name: string,
    responseBody: unknown,
  ) => Promise<{ id: number; name: string; checkpointEntryId: string }>;
  readItemRecordCount?: (identity: string) => Promise<number>;
  readComboGroupRecordCount?: (identity: string) => Promise<number>;
} = {}): CapabilityRegistry<ProductCenterRecipeRuntime> {
  const registry = new CapabilityRegistry<ProductCenterRecipeRuntime>();

  for (const contract of productCenterRecipeCapabilityContracts) {
    registry.register({
      ...contract,
      execute: async (context, input) => executeProductCenterCapability(contract.id, context, input, options),
    });
  }
  return registry;
}

async function executeProductCenterCapability(
  id: typeof productCenterRecipeCapabilityContracts[number]['id'],
  context: ProductCenterRecipeRuntime,
  input: Readonly<Record<string, unknown>>,
  options: {
    registerItemCreated?: (
      context: ProductCenterItemCreateContext,
      responseBody: unknown,
    ) => Promise<ProductCenterItemCreateRecord>;
    registerComboGroupCreated?: (
      name: string,
      responseBody: unknown,
    ) => Promise<{ id: number; name: string; checkpointEntryId: string }>;
    readItemRecordCount?: (identity: string) => Promise<number>;
    readComboGroupRecordCount?: (identity: string) => Promise<number>;
  },
): Promise<unknown> {
  const sopPage = new ProductCenterSopPage(context.page);
  const negativePage = new ProductCenterNegativePage(context.page);
  const itemIntakePage = new ProductCenterItemIntakePage(context.page);
  const itemRequiredValidationPage = new ProductCenterItemRequiredValidationPage(context.page);
  const sidebarNavigationPage = new ProductCenterSidebarNavigationPage(context.page);

  switch (id) {
    case 'navigation.sidebar.open':
      return sidebarNavigationPage.openFromSidebar(requireRoute(input.targetPath));
    case 'coreCreate.execute':
      return new ProductCenterCreateSopFlow(context.page).create(
        requireCreateDefinition(context),
        requireCreateContext(input),
      );
    case 'lowDependency.execute': {
      const flow = new ProductCenterLowDependencySopFlow(context.page);
      const sopCase = requireLowDependencyCase(context);
      const record = requireLowDependencyRecord(input);
      return context.recipe.action === 'edit' ? flow.edit(sopCase, record) : flow.delete(sopCase, record);
    }
    case 'highDependency.execute': {
      const flow = new ProductCenterHighDependencySopFlow(context.page);
      const sopCase = requireHighDependencyCase(context);
      const record = requireHighDependencyRecord(input);
      return context.recipe.action === 'edit' ? flow.edit(sopCase, record) : flow.delete(sopCase, record);
    }
    case 'negative.execute':
      return negativePage.execute(requireNegativeCase(context), optionalCoreRecord(input.record));
    case 'category.attemptAddChildBlockedByProduct': {
      const record = requireCategoryWithProductRecord(input);
      await negativePage.openCategoryTree();
      await negativePage.attemptAddChildCategory(record.parentCategoryName, record.childCategoryName);
      return { saveAttempted: true };
    }
    case 'methodDetail.enforceNameMaxLength': {
      const maxLength = requireNumber(input.maxLength, 'maxLength');
      const rejectedLength = requireNumber(input.rejectedLength, 'rejectedLength');
      if (rejectedLength <= maxLength) throw new Error('做法明细拒绝值必须超过最大长度');
      const requestedDetailName = 'M'.repeat(rejectedLength);
      const observation = await new ProductCenterCreateSopPage(context.page).createMethodDetailBoundary(
        requireCreateDefinition(context),
        requireCreateContext(input),
        requestedDetailName,
      );
      return {
        requestedDetailName,
        requestedLength: observation.requestedLength,
        inputLengthBeforeSubmit: observation.inputLengthBeforeSubmit,
        maxLengthAttribute: observation.maxLengthAttribute,
        responseStatus: observation.response.status(),
        responseMethod: observation.response.request().method(),
        responsePath: new URL(observation.response.url()).pathname,
      };
    }
    case 'category.open':
    case 'method.open':
    case 'material.open':
    case 'seasoning.open':
    case 'bom.open':
      return sopPage.open(requireSopCase(context), requireCoreRecord(input));
    case 'category.editIdentity':
    case 'method.editIdentity':
    case 'material.editIdentity':
    case 'seasoning.editIdentity':
    case 'bom.editIdentity':
      return sopPage.editIdentity(requireSopCase(context), requireCoreRecord(input));
    case 'category.deleteIdentity':
    case 'method.deleteIdentity':
    case 'material.deleteIdentity':
    case 'seasoning.deleteIdentity':
    case 'bom.deleteIdentity':
      return sopPage.deleteIdentity(requireSopCase(context), requireCoreRecord(input));
    case 'statisticTag.openCreateDialog':
      return negativePage.openTagCreateDialog(requireTagRoute(context.recipe.route));
    case 'statisticTag.readSecondLanguageBoundary':
      return negativePage.readBoundaryResult(
        requireBoundaryLocatorKey(input.locatorKey),
        requireNumber(input.acceptedLength, 'acceptedLength'),
        requireNumber(input.rejectedLength, 'rejectedLength'),
      );
    case 'statisticTag.closeCreateDialog':
      return negativePage.closeTagCreateDialog();
    case 'item.openList':
      return itemIntakePage.openItemList();
    case 'item.validateRequiredName': {
      const beforeTotalCount = await context.api.productCount();
      const uiResult = await itemRequiredValidationPage.attemptCreateWithoutRequiredName();
      const afterTotalCount = await context.api.productCount();
      return { ...uiResult, beforeTotalCount, afterTotalCount };
    }
    case 'item.openStandardCreate':
      return new ProductCenterItemCategoryLeafProbeFlow(context.page)
        .openStandardCreateFromCurrentList();
    case 'item.category.openCascader':
      return new ProductCenterItemCategoryLeafProbeFlow(context.page).openCategoryCascader();
    case 'item.category.selectParentWithChildren':
      return new ProductCenterItemCategoryLeafProbeFlow(context.page).selectParentWithChildren(
        requireNonEmptyString(input.parentName, 'parentName'),
        requireNonEmptyString(input.leafName, 'leafName'),
      );
    case 'item.category.selectLeaf':
      return new ProductCenterItemCategoryLeafProbeFlow(context.page).selectLeaf(
        requireNonEmptyString(input.parentName, 'parentName'),
        requireNonEmptyString(input.leafName, 'leafName'),
      );
    case 'item.createStandard': {
      const record = requireItemCreateContext(input.record);
      const specification = requireStandardItemSpecification(input.specification);
      const price = requireNonEmptyString(input.price, 'price');
      const minimumOrderQuantity = requireNonEmptyString(input.minimumOrderQuantity, 'minimumOrderQuantity');
      const packagingFee = optionalString(input.packagingFee, 'packagingFee');
      const cost = optionalString(input.cost, 'cost');
      if (!options.registerItemCreated) throw new Error('标准商品创建能力缺少即时清理登记器');
      const createContext = { ...record, price, minimumOrderQuantity };
      return new ProductCenterItemStandardCreateFlow(context.page).create({
        context: createContext,
        specification,
        price,
        minimumOrderQuantity,
        packagingFee,
        cost,
      }, async (responseBody) => {
        const created = await options.registerItemCreated!(createContext, responseBody);
        context.record = created;
        return created;
      });
    }
    case 'item.createComboRequiredOnly': {
      const record = requireItemCreateContext(input.record);
      const price = requireNonEmptyString(input.price, 'price');
      const minimumOrderQuantity = requireNonEmptyString(input.minimumOrderQuantity, 'minimumOrderQuantity');
      const comboGroupName = requireNonEmptyString(input.comboGroupName, 'comboGroupName');
      if (!options.registerItemCreated) throw new Error('套餐商品创建能力缺少即时清理登记器');
      const createContext = { ...record, price, minimumOrderQuantity, comboGroupName };
      return new ProductCenterItemComboCreateFlow(context.page).create({
        context: createContext,
        price,
        minimumOrderQuantity,
        comboGroupName,
      }, async (responseBody) => {
        const created = await options.registerItemCreated!(createContext, responseBody);
        context.record = created;
        return created;
      });
    }
    case 'item.combo.probeGroupRequired': {
      const record = requireItemCreateContext(input.record);
      if (!options.registerItemCreated) throw new Error('套餐分组必填探测缺少意外创建即时登记器');
      return new ProductCenterItemComboAuditFlow(context.page, context.api).probeGroupRequired(
        record,
        async (responseBody) => {
          const created = await options.registerItemCreated!(record, responseBody);
          context.record = created;
          return created;
        },
      );
    }
    case 'item.combo.probeOptionalEditBoundary': {
      const record = requireItemCreateContext(input.record);
      if (!options.registerItemCreated) throw new Error('可选搭配边界探测缺少商品即时登记器');
      if (!options.registerComboGroupCreated) throw new Error('可选搭配边界探测缺少套餐组即时登记器');
      if (!options.readItemRecordCount || !options.readComboGroupRecordCount) {
        throw new Error('可选搭配边界探测缺少零残留计数器');
      }
      return new ProductCenterItemComboAuditFlow(context.page, context.api).probeOptionalEditBoundary({
        context: record,
        registerItemCreated: async (responseBody) => {
          const created = await options.registerItemCreated!(record, responseBody);
          context.record = created;
          return created;
        },
        registerComboGroupCreated: options.registerComboGroupCreated,
        readItemRecordCount: options.readItemRecordCount,
        readComboGroupRecordCount: options.readComboGroupRecordCount,
      });
    }
    case 'storeProduct.searchByName':
      return new ProductCenterStoreProductSearchFlow(context.page).execute(context.api);
    case 'item.list.searchSecondLanguage':
      return new ProductCenterItemGreenReadonlyFlow(context.page).searchSecondLanguage(
        requireNonEmptyString(input.keyword, 'keyword'),
      );
    case 'item.combo.readOptionalGroupDialog':
      return new ProductCenterItemGreenReadonlyFlow(context.page).readOptionalComboDialog();
    case 'item.list.probeImagePreview':
      return new ProductCenterItemGreenReadonlyFlow(context.page).probeImagePreview(
        requireNonEmptyString(input.typeLabel, 'typeLabel'),
      );
    case 'item.standard.probeMainImageReplacement':
      return new ProductCenterItemGreenReadonlyFlow(context.page).probeMainImageReplacement(
        requireNonEmptyString(input.firstImagePath, 'firstImagePath'),
        requireNonEmptyString(input.secondImagePath, 'secondImagePath'),
      );
    case 'item.standard.probeSpecGroupCreateNavigation':
      return new ProductCenterItemGreenReadonlyFlow(context.page).probeSpecGroupCreateNavigation();
    case 'item.standard.probeFieldValidation':
    case 'item.standard.createRoundedPricePair':
    case 'item.standard.probeMultiSpecWeightDisabled':
    case 'item.standard.probeDescriptionLengthBoundary':
    case 'item.standard.probeDetailImageLimit':
    case 'item.standard.probeReferencedGroupChildControls':
    case 'item.side.createWithDetailImageLimit':
    case 'item.standard.mega.editOtherInformation':
    case 'item.standard.mega.createWithParentCategory':
    case 'item.standard.mega.createWithLibraryMainImage':
    case 'item.standard.mega.createWithLocalMainImage':
    case 'item.standard.mega.createFormattedNames':
    case 'item.standard.mega.editDescriptionTags':
    case 'item.standard.mega.editMaterialInformation':
    case 'item.standard.mega.editCornerMark':
    case 'item.standard.mega.editStatisticsTags':
    case 'item.list.mega.probeColumnSelection':
    case 'item.list.mega.probeLanguageSwitch':
    case 'item.standard.mega.probeTasteGroupSync':
    case 'item.standard.mega.probeAdvancedFields':
    case 'item.list.mega.probePageSizes':
    case 'item.list.mega.probeDefaultColumns':
    case 'item.list.mega.probeRestoreColumns':
    case 'item.list.mega.enableDisabledItem':
    case 'item.combo.mega.removeAllGroupItems':
    case 'item.combo.mega.probeDeleteConfirmation':
    case 'item.combo.mega.createWithoutCategory':
    case 'item.combo.mega.createWithParentCategory':
    case 'item.combo.mega.createWithZeroPrice':
    case 'item.combo.mega.createWithLibraryMainImage':
    case 'item.combo.mega.readOptionalGroupRules':
    case 'item.combo.mega.createWithLocalMainImage':
    case 'item.combo.mega.probeMainImageReplacement':
    case 'item.combo.mega.probeMnemonicMaximum':
    case 'item.combo.mega.probeDescriptionMaximum':
    case 'item.combo.mega.probeDetailImageLimit':
    case 'item.combo.mega.probeReferencedGroupChildControls':
    case 'item.combo.mega.readOtherSettings':
    case 'item.combo.mega.createFormattedName':
    case 'item.combo.mega.createFormattedNames':
    case 'item.combo.mega.editDescriptionTags':
    case 'item.combo.mega.editCornerMark':
    case 'item.combo.mega.editStatisticsTags':
    case 'item.combo.mega.editMaterialInformation':
    case 'item.combo.mega.createWithFixedAndCustomGroups':
    case 'item.combo.mega.editTasteGroup':
    case 'item.combo.mega.probeMutualExclusion':
    case 'item.combo.mega.editMethodGroup':
    case 'item.combo.mega.editAddonGroup':
    case 'item.combo.mega.searchByCombinedFilters':
    case 'item.combo.mega.enableDisabledItem':
    case 'item.combo.mega.disableEnabledItem':
      throw new Error(`能力 ${id} 仅允许通过对应绿色共享执行器运行`);
  }
}

function requireItemCreateContext(value: unknown): ProductCenterItemCreateContext {
  if (!value || typeof value !== 'object') throw new Error('标准商品创建能力缺少创建上下文');
  const record = value as Partial<ProductCenterItemCreateContext>;
  if (
    record.entityKey !== 'item'
    || typeof record.originalIdentity !== 'string'
  ) {
    throw new Error('标准商品创建上下文无效');
  }
  return record as ProductCenterItemCreateContext;
}

function requireStandardItemSpecification(value: unknown): 'single' {
  if (value !== 'single') throw new Error(`标准商品创建暂不支持规格：${String(value)}`);
  return value;
}

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`能力输入 ${name} 必须为非空字符串`);
  return value;
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  return requireNonEmptyString(value, name);
}

export function requireItemStandardCreateResult(value: unknown): ProductCenterItemStandardCreateResult {
  if (!value || typeof value !== 'object') throw new Error('单规格标准商品断言缺少执行结果');
  const result = value as Partial<ProductCenterItemStandardCreateResult>;
  if (
    typeof result.name !== 'string'
    || result.specification !== 'single'
    || result.minimumOrderQuantity !== '1'
    || typeof result.price !== 'string'
    || typeof result.priceBeforeSave !== 'string'
    || typeof result.responseMethod !== 'string'
    || typeof result.responsePath !== 'string'
    || typeof result.responseStatus !== 'number'
    || typeof result.successMessageCount !== 'number'
  ) {
    throw new Error('单规格标准商品执行结果结构无效');
  }
  return result as ProductCenterItemStandardCreateResult;
}

export function requireItemComboCreateResult(value: unknown): ProductCenterItemComboCreateResult {
  if (!value || typeof value !== 'object') throw new Error('仅必填套餐商品断言缺少执行结果');
  const result = value as Partial<ProductCenterItemComboCreateResult>;
  if (
    typeof result.name !== 'string'
    || result.price !== '10.00'
    || result.minimumOrderQuantity !== '1'
    || typeof result.comboGroupName !== 'string'
    || typeof result.responseMethod !== 'string'
    || typeof result.responsePath !== 'string'
    || typeof result.responseStatus !== 'number'
    || typeof result.successMessageCount !== 'number'
  ) {
    throw new Error('仅必填套餐商品执行结果结构无效');
  }
  return result as ProductCenterItemComboCreateResult;
}

function requireRoute(value: unknown): `/${string}` {
  if (typeof value !== 'string' || !value.startsWith('/')) throw new Error('侧边栏导航缺少有效目标路径');
  return value as `/${string}`;
}

function requireSopCase(context: ProductCenterRecipeRuntime): ProductCenterSopCase {
  if (!context.sopCase) throw new Error(`Recipe ${context.recipe.id} 缺少核心 SOP 上下文`);
  return context.sopCase;
}

function requireCreateDefinition(context: ProductCenterRecipeRuntime): ProductCenterCreateSopDefinition {
  if (!context.createDefinition) throw new Error(`Recipe ${context.recipe.id} 缺少创建 SOP 上下文`);
  return context.createDefinition;
}

function requireLowDependencyCase(context: ProductCenterRecipeRuntime): LowDependencySopCase {
  if (!context.lowDependencyCase) throw new Error(`Recipe ${context.recipe.id} 缺少低依赖 SOP 上下文`);
  return context.lowDependencyCase;
}

function requireHighDependencyCase(context: ProductCenterRecipeRuntime): HighDependencySopCase {
  if (!context.highDependencyCase) throw new Error(`Recipe ${context.recipe.id} 缺少高依赖 SOP 上下文`);
  return context.highDependencyCase;
}

function requireNegativeCase(context: ProductCenterRecipeRuntime): ProductCenterNegativeCase {
  if (!context.negativeCase) throw new Error(`Recipe ${context.recipe.id} 缺少负向 SOP 上下文`);
  return context.negativeCase;
}

function requireCreateContext(input: Readonly<Record<string, unknown>>): ProductCenterCreateContext {
  return requireObjectInput(input.record, 'record') as ProductCenterCreateContext;
}

function requireCoreRecord(input: Readonly<Record<string, unknown>>): ProductCenterSopSeedRecord {
  return requireObjectInput(input.record, 'record') as ProductCenterSopSeedRecord;
}

function optionalCoreRecord(value: unknown): ProductCenterSopSeedRecord | undefined {
  return value && typeof value === 'object' ? value as ProductCenterSopSeedRecord : undefined;
}

function requireLowDependencyRecord(input: Readonly<Record<string, unknown>>): LowDependencySeedRecord {
  return requireObjectInput(input.record, 'record') as LowDependencySeedRecord;
}

function requireHighDependencyRecord(input: Readonly<Record<string, unknown>>): HighDependencySeedRecord {
  return requireObjectInput(input.record, 'record') as HighDependencySeedRecord;
}

function requireCategoryWithProductRecord(
  input: Readonly<Record<string, unknown>>,
): CategoryWithProductSeedRecord {
  const record = requireObjectInput(input.record, 'record');
  if (
    typeof record.parentCategoryId !== 'number'
    || typeof record.parentCategoryName !== 'string'
    || typeof record.productId !== 'number'
    || typeof record.productName !== 'string'
    || typeof record.childCategoryName !== 'string'
  ) {
    throw new Error('分类关系阻断能力输入 record 无效');
  }
  return record as CategoryWithProductSeedRecord;
}

function requireObjectInput(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error(`能力输入 ${name} 无效`);
  return value as Record<string, unknown>;
}

function requireTagRoute(route: string): '/pp/brand/tag/statistic' | '/pp/brand/tag/description' {
  if (route === '/pp/brand/tag/statistic' || route === '/pp/brand/tag/description') return route;
  throw new Error(`不支持的标签路由：${route}`);
}

function requireBoundaryLocatorKey(value: unknown): 'tag-second-language' | 'tag-group-second-language' {
  if (value === 'tag-second-language' || value === 'tag-group-second-language') return value;
  throw new Error(`不支持的边界字段：${String(value)}`);
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== 'number') throw new Error(`能力输入 ${name} 必须为数字`);
  return value;
}
