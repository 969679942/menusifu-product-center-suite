import { expect } from '@playwright/test';
import { step } from '../../../utils/step';
import { StandardItem216Flow } from './standard-item-216.flow';
import type { RuntimeAssertionReceipt } from '../../../automation/system-test/system-test-runtime-contract';

export type StandardItem216Action =
  | 'create-page'
  | 'list-page'
  | 'list-evidence'
  | 'required'
  | 'category-leaf'
  | 'create-zero'
  | 'create-multi-default'
  | 'create-multi-no-default'
  | 'create-weight'
  | 'weight-units'
  | 'create-price'
  | 'price-negative'
  | 'minimum-zero'
  | 'minimum-invalid'
  | 'create-required'
  | 'create-no-category'
  | 'price-missing'
  | 'minimum-missing'
  | 'advanced-fields'
  | 'description-capacity'
  | 'multi-weight-disabled'
  | 'packaging-cost'
  | 'price-over-max'
  | 'field-overflow'
  | 'duplicate-alt-name'
  | 'name-whitespace'
  | 'pos-whitespace'
  | 'existing-spec-group'
  | 'spec-group-navigation'
  | 'library-image'
  | 'filter-reset'
  | 'filter-memory'
  | 'lifecycle'
  | 'delete-lifecycle'
  | 'empty-category-cell'
  | 'weight-unit-edit'
  | 'multi-reorder'
  | 'price-rounding'
  | 'edit-basic'
  | 'edit-other'
  | 'image-preview'
  | 'delete-confirmation'
  | 'edit-loaded'
  | 'leaf-category-create'
  | 'advanced-collapsed'
  | 'local-image'
  | 'replace-main-image'
  | 'no-combo-group'
  | 'second-language-search'
  | 'minimum-replay'
  | 'category-with-product'
  | 'type-filter'
  | 'contract-resolution';

export class StandardItem216CaseRunner {
  constructor(private readonly flow: StandardItem216Flow) {}

  @step('执行标准商品 216 用例动作：{caseId}')
  async execute(caseId: string, action: StandardItem216Action): Promise<Record<string, unknown>> {
    switch (action) {
      case 'create-page': {
        const result = await this.flow.readCreatePageEvidence();
        expect(result.path).toBe('/pp/brand/create/standard');
        const createEntriesMatched = Object.values(result.createEntries).every((count) => count === 1);
        const coreModulesMatched = [
          result.structure.basicInfo,
          result.structure.price,
          result.structure.printSettings,
          result.structure.attributes,
          result.structure.moreSettings,
        ].every((count) => count === 1);
        const specificationModesMatched = result.structure.singleSpec === 1 && result.structure.multiSpec === 1;
        expect(createEntriesMatched).toBe(true);
        expect(coreModulesMatched).toBe(true);
        expect(specificationModesMatched).toBe(true);
        const assertionReceipts: RuntimeAssertionReceipt[] = [
          assertionReceipt(
            `${caseId}:expectation-1`,
            '商品类型选择页分别展示标准商品、套餐商品和加料/配菜商品入口',
            result.createEntries,
            createEntriesMatched,
          ),
          assertionReceipt(
            `${caseId}:expectation-2`,
            '标准商品创建页展示基础信息、价格、打印设置、商品属性和更多设置模块',
            result.structure,
            coreModulesMatched,
          ),
          assertionReceipt(
            `${caseId}:expectation-3`,
            '标准商品创建页同时展示单规格和多规格配置入口',
            { singleSpec: result.structure.singleSpec, multiSpec: result.structure.multiSpec },
            specificationModesMatched,
          ),
        ];
        return { ...result, assertionReceipts };
      }
      case 'list-page':
        await this.flow.verifyListLoaded();
        return { loaded: true };
      case 'list-evidence': {
        const evidence = await this.flow.readListEvidence();
        expect(Number(evidence.rowCount)).toBeGreaterThanOrEqual(0);
        expect(evidence.columns).toEqual(expect.arrayContaining([expect.any(String)]));
        return evidence;
      }
      case 'required':
        await this.flow.verifyRequiredFieldsBlocked();
        return { blocked: true };
      case 'category-leaf':
      case 'category-with-product':
        await this.flow.verifyCategoryLeafSelection();
        return { leafSelected: true };
      case 'create-zero':
        return await this.flow.createSingle({ caseId, price: '0' });
      case 'create-multi-default':
        return await this.flow.createMulti(caseId, true);
      case 'create-multi-no-default':
        return await this.flow.createMulti(caseId, false);
      case 'create-weight':
        return await this.flow.createWeight(caseId);
      case 'weight-units':
        return { units: await this.flow.readWeightUnitEvidence() };
      case 'create-price':
        return await this.flow.createSingle({ caseId, price: '1.99' });
      case 'price-negative':
      case 'price-over-max': {
        const value = action === 'price-negative' ? '-1' : '1000000';
        const result = await this.flow.verifyPriceValidation(value);
        expect(result.errors.length > 0 || result.saveEnabled === false).toBe(true);
        return result;
      }
      case 'minimum-zero':
      case 'minimum-invalid':
      case 'minimum-missing': {
        const value = action === 'minimum-zero' ? '0' : action === 'minimum-invalid' ? 'abc' : '';
        const result = await this.flow.verifyMinimumOrderValidation(caseId, value);
        expect(result.errors.length > 0 || result.saveEnabled === false).toBe(true);
        return result;
      }
      case 'create-required':
      case 'create-no-category':
        return await this.flow.createSingle({ caseId, price: '0', minimumOrderQuantity: '1' });
      case 'price-missing': {
        const result = await this.flow.verifyPriceValidation('');
        expect(result.errors.length > 0 || result.saveEnabled === false).toBe(true);
        return result;
      }
      case 'advanced-fields': {
        const result = await this.flow.readAdvancedAndDescriptionEvidence();
        expect(result.advanced.expanded).toBe(true);
        expect(Object.keys(result.advanced.fields).length).toBe(8);
        return result;
      }
      case 'description-capacity':
        await this.flow.verifyDescriptionCapacity();
        return { capacityVerified: true };
      case 'multi-weight-disabled':
        await this.flow.verifyMultiSpecDisablesWeight();
        return { disabled: true };
      case 'packaging-cost':
        await this.flow.verifyPackagingAndCost();
        return { saved: true };
      case 'field-overflow':
        await this.flow.verifyFieldOverflow('mnemonicCode');
        return { blocked: true };
      case 'duplicate-alt-name':
        await this.flow.verifyDuplicateAltNameBlocked();
        return { blocked: true };
      case 'name-whitespace':
        await this.flow.verifyNameWhitespaceBlocked();
        return { blocked: true };
      case 'pos-whitespace':
        await this.flow.verifyPosNameWhitespaceBlocked();
        return { blocked: true };
      case 'existing-spec-group':
        await this.flow.verifyExistingSpecGroupCreation();
        return { created: true };
      case 'spec-group-navigation':
        await this.flow.verifySpecGroupCreateNavigation();
        return { navigated: true };
      case 'library-image':
        await this.flow.createWithLibraryImage();
        return { created: true };
      case 'filter-reset':
        await this.flow.verifyFilterReset();
        return { reset: true };
      case 'filter-memory':
        return await this.flow.verifyFilterMemory();
      case 'lifecycle':
        return await this.flow.verifyLifecycle(caseId);
      case 'delete-lifecycle':
        await this.flow.verifyDeleteLifecycle();
        return { deleted: true };
      case 'empty-category-cell':
        await this.flow.verifyEmptyCategoryCell();
        return { emptyCellVerified: true };
      case 'weight-unit-edit':
        await this.flow.verifyWeightUnitEdit();
        return { saved: true };
      case 'multi-reorder':
        await this.flow.verifyMultiSpecReorder();
        return { saved: true };
      case 'price-rounding':
        await this.flow.verifyPriceRounding();
        return { rounded: true };
      case 'edit-basic':
        await this.flow.verifyEditBasicInfo();
        return { saved: true };
      case 'edit-other':
        await this.flow.verifyEditOtherInfo();
        return { saved: true };
      case 'image-preview':
        return await this.flow.verifyImagePreview();
      case 'delete-confirmation':
        await this.flow.verifyDeleteConfirmation();
        return { confirmed: true };
      case 'edit-loaded':
        return { name: await this.flow.verifyEditLoaded() };
      case 'leaf-category-create':
        await this.flow.verifyLeafCategoryCreate();
        return { created: true };
      case 'advanced-collapsed':
        await this.flow.verifyAdvancedSettingsCollapsed();
        return { collapsed: true };
      case 'local-image':
        await this.flow.createWithLocalImage();
        return { created: true };
      case 'replace-main-image':
        return await this.flow.verifyMainImageReplacement();
      case 'no-combo-group':
        await this.flow.verifyStandardCannotAddComboGroup();
        return { unsupported: true };
      case 'second-language-search':
        await this.flow.verifySecondLanguageSearch();
        return { searched: true };
      case 'minimum-replay':
        return await this.flow.createSingle({ caseId, price: '10.00', minimumOrderQuantity: '2' });
      case 'type-filter':
        await this.flow.verifyTypeFilter();
        return { filtered: true };
      case 'contract-resolution':
        return await this.executeContractResolution(caseId);
    }
  }

  @step('执行标准商品合同阻塞修复动作：{caseId}')
  private async executeContractResolution(caseId: string): Promise<Record<string, unknown>> {
    switch (caseId) {
      case 'TC-ITEM-STD-008':
      case 'TC-ITEM-STD-009':
        return caseId.endsWith('008')
          ? this.flow.verifyNameNormalization(caseId)
          : this.flow.verifyPosKitchenNormalization(caseId);
      case 'TC-ITEM-STD-010':
        return this.flow.verifyDuplicateItemCode(caseId);
      case 'TC-ITEM-STD-011':
      case 'TC-ITEM-STD-013':
      case 'TC-ITEM-STD-014':
      case 'TC-ITEM-STD-044':
        return this.flow.verifyDuplicateItemName(caseId);
      case 'TC-ITEM-STD-012':
        return this.flow.verifyDuplicateItemName(caseId);
      case 'TC-ITEM-STD-025':
        return this.flow.readIndustryInheritanceEnvironmentContract(caseId, 'single');
      case 'TC-ITEM-STD-026':
        return this.flow.readIndustryInheritanceEnvironmentContract(caseId, 'multi');
      case 'TC-ITEM-STD-027':
        return this.flow.readIndustryInheritanceEnvironmentContract(caseId, 'partial-multi');
      case 'TC-ITEM-STD-034':
        return this.flow.verifyTasteGroupSynchronization(caseId);
      case 'TC-ITEM-STD-069':
        return this.flow.verifyComboReferenceDeletionBlocked(caseId);
      case 'TC-ITEM-STD-070':
        return this.flow.readMenuReferenceEnvironmentContract(caseId);
      case 'TC-ITEM-STD-080':
        return this.flow.readTerminalEnvironmentContract(caseId, 'weight-tare-price');
      case 'TC-ITEM-STD-082':
        return this.flow.verifyMultiplePrintStalls(caseId);
      case 'TC-ITEM-STD-083':
        return this.flow.readTerminalEnvironmentContract(caseId, 'default-spec-ordering');
      case 'TC-ITEM-STD-054':
        return this.flow.verifyDetailImageLimit(caseId);
      case 'TC-ITEM-STD-055':
      case 'TC-ITEM-STD-090':
      case 'TC-ITEM-STD-091':
        return this.flow.verifyTagsAndCornerMarks(caseId);
      case 'TC-ITEM-STD-056':
        return this.flow.verifyIngredientInfo(caseId);
      case 'TC-ITEM-STD-081':
        return this.flow.verifyDuplicateDetailImage(caseId);
      case 'TC-ITEM-STD-096':
        return this.flow.verifyEditLocalImage(caseId);
      case 'TC-ITEM-STD-032':
      case 'TC-ITEM-STD-087':
        return this.flow.verifyAttributeGroupContract(caseId, 'taste', 'override');
      case 'TC-ITEM-STD-088':
        return this.flow.verifyAttributeGroupContract(caseId, 'addon', 'override');
      case 'TC-ITEM-STD-089':
        return this.flow.verifyAttributeGroupContract(caseId, 'taste', 'default');
      case 'TC-ITEM-STD-061':
        return this.flow.verifyAttributeGroupContract(caseId, 'taste', 'mutually-exclusive');
      case 'TC-ITEM-STD-057':
        return this.flow.verifyAttributeGroupContract(caseId, 'taste', 'reference');
      case 'TC-ITEM-STD-058':
        return this.flow.verifyAttributeGroupContract(caseId, 'method', 'reference');
      case 'TC-ITEM-STD-059':
        return this.flow.verifyEditedAttributeGroupRemoval(caseId, 'taste');
      case 'TC-ITEM-STD-086':
        return this.flow.verifyEditedAttributeGroupRemoval(caseId, 'taste');
      default:
        throw new Error(`标准商品合同修复动作尚未绑定：${caseId}`);
    }
  }
}

function assertionReceipt(
  claimId: string,
  expectedValue: unknown,
  actualValue: unknown,
  matched: boolean,
): RuntimeAssertionReceipt {
  return {
    claimId,
    status: matched ? 'verified' : 'observed-mismatch',
    expectedValue,
    actualValue,
    actualStatus: 'observed',
    observationChannel: 'ui',
    authority: 'user-visible',
    comparison: matched ? 'matched' : 'mismatched',
  };
}
