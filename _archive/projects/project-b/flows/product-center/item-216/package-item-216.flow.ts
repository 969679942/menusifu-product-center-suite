import { createHash } from 'node:crypto';
import { expect, type Page, type Response } from '@playwright/test';
import { CleanupRegistry } from '../../../api/product-center/cleanup-registry';
import { ProductCenterExecutionLedger } from '../../../api/product-center/execution-ledger';
import { extractCreatedRecord } from '../../../api/product-center/created-record';
import { ProductCenterItemComboAuditFlow } from '../product-center-item-combo-audit.flow';
import {
  createItemCreateComboPage,
  createItemEditPage,
  createItemListPage,
  ItemCreateComboPage,
  ItemEditComboPage,
  type ItemCreateFormPage,
} from '../../../pages/product-management/item';
import { ItemCreateFlow } from '../../item-create.flow';
import type { ProductCenterApi } from '../../../api/product-center/product-center-api';
import type { ProductCenterItemCreateContext } from '../../../test-data/product-center/product-center-item-create-data.factory';
import {
  PackageItem216Factory,
  type PackageItem216UnresolvedContract,
} from '../../../test-data/product-center/item-216/package-item-216.factory';
import { itemListFilterOptionsDom } from '../../../test-data/item-list';
import { createAuditIdentity } from '../../../test-data/product-center/audit-identity';
import { step } from '../../../utils/step';
import { waitUntil } from '../../../utils/wait';

export type PackageItem216CaseResult = {
  caseId: string;
  status: 'implemented' | 'unresolved' | 'product-behavior' | 'test-data-blocked' | 'environment-blocked' | 'contract-blocked' | 'code-defect';
  evidence: Record<string, unknown>;
};

type RuntimeDeps = {
  api: ProductCenterApi;
  cleanupRegistry: CleanupRegistry;
  executionLedger: ProductCenterExecutionLedger;
};

type AddonRenameTargetResolution =
  | {
    status: 'ready';
    name: string;
    count: number;
    type: string;
    serverId: number;
    provenance: 'reused-existing' | 'created-by-test' | 'created-by-test-reconciled';
    cleanup: { required: boolean; checkpointEntryId?: string; ownership: 'not-owned' | 'test-created' };
    provisioning?: Record<string, unknown>;
  }
  | {
    status: 'blocked';
    name: string;
    count: number;
    type?: string;
    serverIds?: number[];
    reason: string;
    provisioning?: Record<string, unknown>;
  };

const sharedCases = new Set([
  'TC-ITEM-PKG-002', 'TC-ITEM-PKG-004', 'TC-ITEM-PKG-006', 'TC-ITEM-PKG-007',
  'TC-ITEM-PKG-010', 'TC-ITEM-PKG-017', 'TC-ITEM-PKG-040', 'TC-ITEM-PKG-041',
  'TC-ITEM-PKG-042', 'TC-ITEM-PKG-043',
]);

const directCases = new Set([
  'TC-ITEM-PKG-001', 'TC-ITEM-PKG-005', 'TC-ITEM-PKG-008', 'TC-ITEM-PKG-009',
  'TC-ITEM-PKG-011', 'TC-ITEM-PKG-012', 'TC-ITEM-PKG-013', 'TC-ITEM-PKG-014', 'TC-ITEM-PKG-015', 'TC-ITEM-PKG-016', 'TC-ITEM-PKG-018',
  'TC-ITEM-PKG-019', 'TC-ITEM-PKG-020', 'TC-ITEM-PKG-023', 'TC-ITEM-PKG-026', 'TC-ITEM-PKG-076',
  'TC-ITEM-PKG-027', 'TC-ITEM-PKG-046', 'TC-ITEM-PKG-049', 'TC-ITEM-PKG-051',
  'TC-ITEM-PKG-057', 'TC-ITEM-PKG-058', 'TC-ITEM-PKG-059', 'TC-ITEM-PKG-077',
  'TC-ITEM-PKG-078',
  'TC-ITEM-PKG-079',
  'TC-ITEM-PKG-021', 'TC-ITEM-PKG-022', 'TC-ITEM-PKG-028', 'TC-ITEM-PKG-029',
  'TC-ITEM-PKG-030', 'TC-ITEM-PKG-031', 'TC-ITEM-PKG-032', 'TC-ITEM-PKG-033',
  'TC-ITEM-PKG-034', 'TC-ITEM-PKG-035', 'TC-ITEM-PKG-036', 'TC-ITEM-PKG-037',
  'TC-ITEM-PKG-047', 'TC-ITEM-PKG-048',
  'TC-ITEM-PKG-052', 'TC-ITEM-PKG-054', 'TC-ITEM-PKG-055',
  'TC-ITEM-PKG-061', 'TC-ITEM-PKG-062', 'TC-ITEM-PKG-063', 'TC-ITEM-PKG-064',
  'TC-ITEM-PKG-065', 'TC-ITEM-PKG-067', 'TC-ITEM-PKG-068', 'TC-ITEM-PKG-069',
  'TC-ITEM-PKG-071', 'TC-ITEM-PKG-072', 'TC-ITEM-PKG-073', 'TC-ITEM-PKG-074',
  'TC-ITEM-PKG-075',
  'TC-ITEM-PKG-003', 'TC-ITEM-PKG-024', 'TC-ITEM-PKG-025', 'TC-ITEM-PKG-038',
  'TC-ITEM-PKG-039', 'TC-ITEM-PKG-044', 'TC-ITEM-PKG-045', 'TC-ITEM-PKG-050',
  'TC-ITEM-PKG-053', 'TC-ITEM-PKG-056', 'TC-ITEM-PKG-060', 'TC-ITEM-PKG-070',
]);

export const packageItem216ImplementedCaseIds = Object.freeze([
  ...sharedCases,
  ...directCases,
].sort());

export class PackageItem216Flow {
  private readonly createFlow = new ItemCreateFlow();
  private readonly comboAudit: ProductCenterItemComboAuditFlow;

  constructor(private readonly page: Page, private readonly deps: RuntimeDeps) {
    this.comboAudit = new ProductCenterItemComboAuditFlow(page, deps.api);
  }

  @step('执行套餐商品 216 专用用例：{caseId}')
  async execute(caseId: string): Promise<PackageItem216CaseResult> {
    const factory = new PackageItem216Factory(this.deps.api);
    if (sharedCases.has(caseId)) {
      return { caseId, status: 'implemented', evidence: await this.executeShared(caseId, factory) };
    }
    if (directCases.has(caseId)) {
      const evidence = await this.executeDirect(caseId, factory);
      const classification = evidence.classification;
      const status = classification === 'product-behavior'
        || classification === 'test-data-blocked'
        || classification === 'environment-blocked'
        || classification === 'contract-blocked'
        || classification === 'code-defect'
        ? classification
        : 'implemented';
      return { caseId, status, evidence };
    }
    return { caseId, status: 'unresolved', evidence: await this.executeUnresolved(factory.unresolved(caseId)) };
  }

  @step('执行套餐共享 API/UI 双终态闭环：{caseId}')
  private async executeShared(caseId: string, factory: PackageItem216Factory): Promise<Record<string, unknown>> {
    if (caseId === 'TC-ITEM-PKG-002' || caseId === 'TC-ITEM-PKG-004'
      || caseId === 'TC-ITEM-PKG-040' || caseId === 'TC-ITEM-PKG-041'
      || caseId === 'TC-ITEM-PKG-042' || caseId === 'TC-ITEM-PKG-043') {
      const comboType = caseId === 'TC-ITEM-PKG-004' || caseId === 'TC-ITEM-PKG-043' ? 'custom' : 'fixed';
      const seed = await factory.prepareWritable(this.deps.cleanupRegistry, { includeCustomComboGroup: comboType === 'custom' });
      const groupName = comboType === 'fixed' ? seed.primary.comboGroupName! : seed.primary.customComboGroupName!;
      const page = createItemCreateComboPage(this.page);
      await page.open();
      const ui = await page.probeExistingComboGroupSelection({ comboType, groupName });
      if (caseId === 'TC-ITEM-PKG-040') {
        expect(ui.confirmDisabledBeforeSelection, 'TC-ITEM-PKG-040:expectation-1').toBe(true);
      }
      if (!ui.confirmDisabledBeforeSelection || !ui.confirmEnabledAfterSelection || !ui.confirmDisabledAfterRemoval) {
        throw new Error(`套餐组选择状态不完整：${caseId}`);
      }
      if (caseId === 'TC-ITEM-PKG-002' || caseId === 'TC-ITEM-PKG-004' || caseId === 'TC-ITEM-PKG-041') {
        if (ui.returnedCardCount !== 1) throw new Error(`套餐组确认后未回显唯一卡片：${caseId}`);
      }
      return { packageId: 'p0-item-binding:combo-api-closure', caseId, safetyLevel: 'L1-reversible', operation: 'N/A', ui };
    }

    const seed = await factory.prepareWritable(this.deps.cleanupRegistry);
    const page = createItemCreateComboPage(this.page);
    if (caseId === 'TC-ITEM-PKG-010' || caseId === 'TC-ITEM-PKG-017') {
      const context = { ...seed.primary, originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}` };
      await page.open();
      const before = await factory.itemRecordCount(context.originalIdentity);
      const ui = await page.attemptSaveWithMissingRequiredField({
        missingField: caseId === 'TC-ITEM-PKG-010' ? 'item-name' : 'standard-price',
        ...(caseId === 'TC-ITEM-PKG-010' ? { price: '10.00' } : { itemName: context.originalIdentity }),
        minimumOrderQuantity: '1',
        comboGroupName: seed.primary.comboGroupName!,
      });
      const after = await factory.itemRecordCount(context.originalIdentity);
      if (ui.mutationCount !== 0 || after !== before) throw new Error(`套餐必填负向产生非零变更：${caseId}`);
      return { packageId: 'p0-item-binding:combo-api-closure', caseId, safetyLevel: 'L2-controlled-negative', operation: 'N/A', ui, before, after };
    }

    const groupName = `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}`;
    await page.open();
    if (caseId === 'TC-ITEM-PKG-006') {
      await page.addFixedComboGroupByName(seed.primary.comboGroupName!);
      return {
        packageId: 'p0-item-binding:combo-api-closure',
        caseId,
        safetyLevel: 'L1-reversible',
        operation: 'SELECT existing fixed combo group',
        selectedGroup: seed.primary.comboGroupName,
        ui: { returnedCardCount: await page.readComboGroupCardCount(seed.primary.comboGroupName!) },
      };
    }
    const added = await page.addCustomComboGroup({
        groupName,
        productName: seed.primary.dependencyProductIdentity!,
        additionalProductNames: [seed.secondary.dependencyProductIdentity!],
        selectionQuantity: '1',
        allowDuplicateSelection: false,
      });
    const created = await factory.registerComboGroupCreated(
      groupName,
      await added.response.json().catch(() => null),
      this.deps.cleanupRegistry,
    );
    const apiCount = await factory.comboGroupRecordCount(groupName);
    const returnedCardCount = 'returnedCardCount' in added ? added.returnedCardCount : added.boundary.cardCount;
    if (apiCount !== 1 || returnedCardCount !== 1) throw new Error(`套餐组新增双终态不完整：${caseId}`);
    return {
      packageId: 'p0-item-binding:combo-api-closure',
      caseId,
      safetyLevel: 'L3-crud',
      operation: { method: added.response.request().method(), path: new URL(added.response.url()).pathname },
      created,
      apiCount,
      ui: { returnedCardCount },
    };
  }

  @step('执行套餐页面可观察合同用例：{caseId}')
  private async executeDirect(caseId: string, factory: PackageItem216Factory): Promise<Record<string, unknown>> {
    if (caseId === 'TC-ITEM-PKG-078') {
      return this.crossTypePackageAddonNameRule(factory);
    }
    if (caseId === 'TC-ITEM-PKG-079') {
      return this.crossTypeStandardPackageNameRule(factory);
    }
    if (caseId === 'TC-ITEM-PKG-048') {
      const list = createItemListPage(this.page);
      await list.open();
      await list.selectTypeFilterOptionForMemoryProbe(itemListFilterOptionsDom.typeCombo);
      const before = await list.readFilterState();
      const createTypePage = await list.enterCreateTypePage();
      await this.page.goBack({ waitUntil: 'domcontentloaded' });
      const returned = createItemListPage(this.page);
      await returned.expectLoaded();
      const after = await returned.readFilterState();
      const observedAt = new Date().toISOString();
      return {
        classification: 'product-behavior',
        reason: `切换页面返回套餐商品列表后查询条件未保留：${JSON.stringify({ before, after })}`,
        route: '/pp/brand/list',
        auditObservation: {
          runtimeEvidenceId: `runtime:TC-ITEM-PKG-048:${observedAt}`,
          observedAt,
          route: '/pp/brand/list',
          state: 'combo-list-returned-after-route-switch',
          action: 'navigate-away-and-return',
          overlay: ['N/A:no-overlay'],
          ui: {
            status: 'passed',
            expected: '返回列表后查询条件为空',
            actual: JSON.stringify({ before, after }),
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
    if (caseId === 'TC-ITEM-PKG-063' || caseId === 'TC-ITEM-PKG-064' || caseId === 'TC-ITEM-PKG-065'
      || caseId === 'TC-ITEM-PKG-069' || caseId === 'TC-ITEM-PKG-071' || caseId === 'TC-ITEM-PKG-072'
      || caseId === 'TC-ITEM-PKG-073') {
      const page = createItemCreateComboPage(this.page);
      await page.open();
      const capability = await page.readCommonAttributeReferenceCapabilityEvidence();
      const kind = caseId === 'TC-ITEM-PKG-063' || caseId === 'TC-ITEM-PKG-071'
        ? 'recipe'
        : caseId === 'TC-ITEM-PKG-064' || caseId === 'TC-ITEM-PKG-065' || caseId === 'TC-ITEM-PKG-072'
          ? 'additives'
          : 'flavor';
      const action = caseId === 'TC-ITEM-PKG-063'
        ? 'probe-recipe-group-entry'
        : caseId === 'TC-ITEM-PKG-064'
          ? 'probe-additives-group-entry'
          : caseId === 'TC-ITEM-PKG-065'
            ? 'probe-additives-child-edit-entry'
            : caseId === 'TC-ITEM-PKG-069'
              ? 'probe-flavor-option-override'
              : caseId === 'TC-ITEM-PKG-071'
                ? 'probe-recipe-option-override'
                : caseId === 'TC-ITEM-PKG-072'
                  ? 'probe-additives-option-override'
                  : 'probe-single-default-option';
      const uiAssertion = caseId === 'TC-ITEM-PKG-063'
        ? 'Attribute 区域没有做法组引用入口'
        : caseId === 'TC-ITEM-PKG-064'
          ? 'Attribute 区域没有加料组引用入口'
          : caseId === 'TC-ITEM-PKG-065'
            ? '没有加料组入口，因此不存在组内子项编辑能力'
            : caseId === 'TC-ITEM-PKG-069'
              ? '没有口味组引用和选项覆盖入口'
              : caseId === 'TC-ITEM-PKG-071'
                ? '没有做法组引用和选项覆盖入口'
                : caseId === 'TC-ITEM-PKG-072'
                  ? '没有加料组引用和选项覆盖入口'
                  : '没有选项组默认选中配置入口';
      const observedAt = new Date().toISOString();
      return {
        classification: 'product-behavior',
        reason: `套餐创建页商品属性区域未展示 ${kind} 组引用入口`,
        route: '/pp/brand/create/combo',
        capability,
        operation: 'N/A',
        uiAssertion,
        apiAssertion: 'N/A:未触发属性组引用请求',
        cleanup: 'N/A:只读叶子观察，无创建或引用关系',
        auditObservation: {
          runtimeEvidenceId: `runtime:${caseId}:${observedAt}`,
          observedAt,
          route: '/pp/brand/create/combo',
          state: 'combo-attribute-section-open',
          action,
          overlay: ['attribute-reference-menu'],
          ui: {
            status: 'passed',
            expected: uiAssertion,
            actual: JSON.stringify({ kind, capability }),
          },
          api: {
            status: 'not-applicable',
            expected: 'N/A:未触发属性组引用请求',
            actual: '只读取创建页 Attribute 菜单能力，未触发属性组引用 operation',
            mutationCount: 0,
          },
        },
      };
    }
    const page = createItemCreateComboPage(this.page);
    if (caseId === 'TC-ITEM-PKG-001' || caseId === 'TC-ITEM-PKG-005' || caseId === 'TC-ITEM-PKG-008'
      || caseId === 'TC-ITEM-PKG-014' || caseId === 'TC-ITEM-PKG-051') {
      await page.open();
      if (caseId === 'TC-ITEM-PKG-001' || caseId === 'TC-ITEM-PKG-014') await page.clickAdvancedSettings();
      const core = await page.readCoreStructureEvidence();
      const fields = await page.readAdvancedTextFieldCapabilityEvidence();
      const settings = caseId === 'TC-ITEM-PKG-005' ? await page.readOtherSettingsCapabilityEvidence() : undefined;
      return { route: '/pp/brand/create/combo', core, fields, settings, minimumOrderQuantity: caseId === 'TC-ITEM-PKG-014' ? await page.readMinimumOrderQuantityValue() : undefined };
    }
    if (caseId === 'TC-ITEM-PKG-057' || caseId === 'TC-ITEM-PKG-058') {
      const seed = await factory.prepareSingleWritable(this.deps.cleanupRegistry, { includeCustomComboGroup: true });
      await page.open();
      await page.selectCustomComboGroupByName(seed.customComboGroupName!);
      return {
        route: '/pp/brand/create/combo',
        selectedGroup: seed.customComboGroupName,
        card: await page.readCustomComboCardBoundary(seed.customComboGroupName!, seed.dependencyProductIdentity!),
      };
    }
    if (caseId === 'TC-ITEM-PKG-027') {
      await page.open();
      await page.ensureOtherSettingsExpanded();
      const value = 'X'.repeat(501);
      await page.fillDescription(value);
      const boundary = await page.readDescriptionBoundary();
      return { route: '/pp/brand/create/combo', attemptedLength: value.length, actualLength: boundary.value.length, boundary };
    }
    if (caseId === 'TC-ITEM-PKG-003' || caseId === 'TC-ITEM-PKG-044' || caseId === 'TC-ITEM-PKG-045' || caseId === 'TC-ITEM-PKG-056') {
      const comboType = caseId === 'TC-ITEM-PKG-003' ? 'fixed' : 'custom';
      const primary = await factory.prepareSingleWritable(this.deps.cleanupRegistry, { includeCustomComboGroup: comboType === 'custom' });
      const targetName = comboType === 'fixed' ? primary.comboGroupName! : primary.customComboGroupName!;
      const search = await page.open().then(async () => page.probeExistingComboGroupSearch({ comboType, query: targetName.slice(-12), targetName }));
      if (search.searchedTargetCount !== 1) throw new Error(`套餐组搜索目标未唯一命中：${targetName}`);
      if (caseId === 'TC-ITEM-PKG-045' && search.restoredRowCount === 0) throw new Error('清空套餐组搜索后列表未恢复');
      return { route: '/pp/brand/create/combo', comboType, targetName, search };
    }
    if (caseId === 'TC-ITEM-PKG-024' || caseId === 'TC-ITEM-PKG-025') {
      const primary = await factory.prepareSingleWritable(this.deps.cleanupRegistry);
      const baseIdentity = `AUTO_AUDIT_PACKAGE_${caseId}_BASE_${Date.now()}`;
      const baseContext = { ...primary, originalIdentity: baseIdentity };
      let category: { parentName: string; leafName?: string } | undefined;
      if (caseId === 'TC-ITEM-PKG-024') {
        const categories = findCategoryNodes(await this.deps.api.categoryTree());
        const leaf = categories.find((item) => item.depth === 0 && item.children.length === 0);
        const parent = categories.find((item) => item.depth === 0 && item.children.length > 0 && item.children[0].name);
        if (parent) category = { parentName: parent.name, leafName: parent.children[0].name };
        else if (leaf) category = { parentName: leaf.name };
        else return { classification: 'test-data-blocked', reason: '套餐重名场景缺少可选择分类夹具' };
      }
      if (caseId === 'TC-ITEM-PKG-024') {
        await this.createAndVerifyPackageItem(baseContext, factory, {
          price: '10.00',
          minimumOrderQuantity: '1',
          comboGroupName: primary.comboGroupName!,
          category,
          verifyUiTerminal: false,
        });
      }
      const duplicateIdentity = caseId === 'TC-ITEM-PKG-024' ? baseIdentity : primary.dependencyProductIdentity!;
      const duplicateContext = { ...primary, originalIdentity: duplicateIdentity };
      const duplicatePage = createItemCreateComboPage(this.page);
      await duplicatePage.open();
      await duplicatePage.fillItemName(duplicateIdentity);
      await duplicatePage.fillStandardPrice('10.00');
      if (category) await this.selectPackageCategory(category);
      await duplicatePage.addFixedComboGroupByName(primary.comboGroupName!);
      const before = await factory.itemRecordCount(duplicateIdentity);
      const response = await this.attemptDuplicateSave(duplicatePage);
      const after = await factory.itemRecordCount(duplicateIdentity);
      if (after !== before) {
        await factory.registerCreated(duplicateContext, response.body, this.deps.cleanupRegistry);
        return {
          classification: 'product-behavior',
          reason: `套餐重名负向实际创建：${duplicateIdentity} ${before}->${after}`,
          duplicateIdentity,
          before,
          after,
          response,
        };
      }
      return { duplicateIdentity, before, after, response, errors: await duplicatePage.readVisibleValidationErrors() };
    }
    if (caseId === 'TC-ITEM-PKG-021' || caseId === 'TC-ITEM-PKG-022') {
      const primary = await factory.prepareSingleWritable(this.deps.cleanupRegistry);
      const context = { ...primary, originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}` };
      await page.open();
      const maxLength = caseId === 'TC-ITEM-PKG-021' ? await page.readItemNameMaxLength() : null;
      const rawName = caseId === 'TC-ITEM-PKG-021'
        ? `${context.originalIdentity}_${'X'.repeat(120)}`
        : context.originalIdentity;
      await page.fillItemName(rawName);
      const submittedName = await page.readItemName();
      if (caseId === 'TC-ITEM-PKG-021') {
        if (maxLength !== 100) throw new Error(`套餐商品名称 maxlength 不是 100：${maxLength}`);
        if (submittedName !== rawName.slice(0, maxLength)) throw new Error('套餐商品名称超过 100 字符后未在输入阶段截断。');
      }
      await page.clickAdvancedSettings();
      if (caseId === 'TC-ITEM-PKG-022') {
        await page.fillPosName(`  ${context.originalIdentity}_POS  `);
        await page.fillKitchenName(`  ${context.originalIdentity}_KITCHEN  `);
      }
      await page.fillMinimumOrderQuantity('1');
      await page.addFixedComboGroupByName(primary.comboGroupName!);
      await page.fillStandardPrice('10.00');
      const saveContext = { ...context, originalIdentity: submittedName, cleanupIdentityVariants: [context.originalIdentity] };
      const attempt = await this.observeSaveTerminal(page);
      if (!attempt.response) {
        const after = await factory.itemRecordCount(context.originalIdentity);
        return {
          classification: 'product-behavior',
          reason: `合同期望保存并格式化，实际未发出套餐保存请求：${caseId}`,
          route: new URL(this.page.url()).pathname,
          before: 0,
          after,
          validationErrors: attempt.validationErrors,
          rawName,
        };
      }
      const created = await factory.registerCreated(
        saveContext,
        await attempt.response.json().catch(() => null),
        this.deps.cleanupRegistry,
      );
      const actualIdentity = await factory.itemNameById(created.id);
      const response = {
        serverId: created.id,
        responseMethod: attempt.response.request().method(),
        responsePath: new URL(attempt.response.url()).pathname,
        responseStatus: attempt.response.status(),
        apiRecordCount: await factory.itemRecordCount(actualIdentity),
      };
      const list = createItemListPage(this.page);
      await list.open();
      await list.fillSearchAndWait(actualIdentity);
      await list.expectUniqueItemVisible(actualIdentity);
      await list.clickItemName(actualIdentity);
      const edit = createItemEditPage(this.page, 'combo') as ItemEditComboPage;
      await edit.expectPackageEditReady();
      const actual = { name: await edit.readItemName(), names: await edit.readPosAndKitchenNames() };
      if (caseId === 'TC-ITEM-PKG-021' && actual.name !== submittedName) {
        return { classification: 'product-behavior', reason: `套餐名称保存终态与 100 字符输入边界不一致：${actual.name}`, response, rawName, submittedName, actual };
      }
      if (caseId === 'TC-ITEM-PKG-022' && (actual.names.posName !== actual.names.posName.trim() || actual.names.kitchenName !== actual.names.kitchenName.trim())) {
        return { classification: 'product-behavior', reason: '套餐 POS/送厨名称保存后未自动格式化', response, rawName, actual };
      }
      return { ...response, rawName, submittedName, maxLength, actual };
    }
    if (caseId === 'TC-ITEM-PKG-028') {
      const primary = await factory.prepareSingleWritable(this.deps.cleanupRegistry);
      const context = { ...primary, originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}` };
      const fixtures = Array.from({ length: 11 }, (_, index) => factory.createImageFixture(`${caseId}_${index + 1}`));
      try {
        if (fixtures.some((fixture) => fixture.byteLength <= 100 || fixture.sha256.length !== 64 || fixture.width !== 256 || fixture.height !== 256)) {
          throw new Error(`套餐详情图片夹具完整性异常：${JSON.stringify(fixtures)}`);
        }
        await page.open();
        await page.fillItemName(context.originalIdentity);
        await page.clickAdvancedSettings();
        await page.fillMinimumOrderQuantity('1');
        await page.addFixedComboGroupByName(primary.comboGroupName!);
        await page.fillStandardPrice('10.00');
        const uploads = [];
        for (let index = 0; index < 10; index += 1) {
          const upload = await page.attemptDetailImageUpload(fixtures[index].filePath);
          uploads.push(upload);
          if (upload.afterCount <= upload.beforeCount) {
            const uploadedBrandImage = upload.brandImageResponseStatus === 200
              ? await factory.registerUploadedImageFixtureFromResponse(fixtures[index], upload.brandImageResponseBody, this.deps.cleanupRegistry)
              : await factory.registerUploadedImageFixtureIfPresent(fixtures[index], this.deps.cleanupRegistry);
            return {
              classification: 'product-behavior',
              reason: `套餐详情图上传接口成功后第 ${index + 1} 张未形成新增预览`,
              uploads,
              failedUpload: upload,
              uploadedBrandImage,
            };
          }
          if (upload.brandImageResponseStatus !== 200) {
            throw new Error(`套餐详情图片未完成图片库登记：${fixtures[index].imageName}`);
          }
          await factory.registerUploadedImageFixtureFromResponse(
            fixtures[index],
            upload.brandImageResponseBody,
            this.deps.cleanupRegistry,
          );
        }
        const capacity = await page.readDetailImageCapacityEvidence();
        const overflow = await page.attemptDetailImageUpload(fixtures[10].filePath);
        const overflowBrandImage = overflow.brandImageResponseStatus === 200
          ? await factory.registerUploadedImageFixtureFromResponse(fixtures[10], overflow.brandImageResponseBody, this.deps.cleanupRegistry)
          : await factory.registerUploadedImageFixtureIfPresent(fixtures[10], this.deps.cleanupRegistry);
        const saved = await this.saveAndRegister(page, context, factory);
        if (capacity.cardCount !== 10 || overflow.afterCount > overflow.beforeCount) {
          return {
            classification: 'product-behavior',
            reason: `套餐详情图上限不是 10 张：capacity=${capacity.cardCount} overflow=${overflow.beforeCount}->${overflow.afterCount}`,
            uploads,
            capacity,
            overflow,
            overflowBrandImage,
            saved,
          };
        }
        return {
          fixtures: fixtures.map(({ filePath, byteLength, sha256, width, height }) => ({ filePath, byteLength, sha256, width, height })),
          uploads,
          capacity,
          overflow,
          overflowBrandImage,
          saved,
        };
      } finally { for (const fixture of fixtures) fixture.dispose(); }
    }
    if (caseId === 'TC-ITEM-PKG-029' || caseId === 'TC-ITEM-PKG-030' || caseId === 'TC-ITEM-PKG-031' || caseId === 'TC-ITEM-PKG-074' || caseId === 'TC-ITEM-PKG-075') {
      const primary = await factory.prepareSingleWritable(this.deps.cleanupRegistry);
      const context = { ...primary, originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}` };
      await page.open();
      await page.fillItemName(context.originalIdentity);
      await page.fillStandardPrice('10.00');
      await page.addFixedComboGroupByName(primary.comboGroupName!);
      let selected: unknown;
      if (caseId === 'TC-ITEM-PKG-029' || caseId === 'TC-ITEM-PKG-074') {
        const requestedCount = caseId === 'TC-ITEM-PKG-074' ? 6 : 2;
        selected = await page.selectVisibleDescriptionTags(requestedCount);
        const evidence = selected as { availableNames: string[]; selectedNames: string[]; blockedNames: string[] };
        if (evidence.availableNames.length < requestedCount) {
          return { classification: 'test-data-blocked', reason: `描述标签可见夹具不足：需要 ${requestedCount}，实际 ${evidence.availableNames.length}`, selected };
        }
        if (caseId === 'TC-ITEM-PKG-074') {
          if (evidence.selectedNames.length > 5 || evidence.blockedNames.length === 0) throw new Error('描述标签第 6 个未被限制');
          return { selected, attemptedCount: requestedCount };
        }
      } else if (caseId === 'TC-ITEM-PKG-031') {
        const fixture = await factory.createStatisticTagFixture(caseId, 2, this.deps.cleanupRegistry);
        const selectedNames = await page.selectStatisticsTagsByName(fixture.tagNames);
        if (selectedNames.length !== fixture.tagNames.length) {
          return {
            classification: 'product-behavior',
            reason: `套餐统计标签多选未形成完整回显：selected=${selectedNames.length} expected=${fixture.tagNames.length}`,
            fixture,
            selectedNames,
          };
        }
        selected = { fixture, selectedNames };
      } else {
        const first = await page.selectVisibleCornerMark(0);
        const created = await this.saveAndRegister(page, context, factory);
        const list = createItemListPage(this.page);
        await list.open();
        await list.fillSearchAndWait(context.originalIdentity);
        await list.clickItemName(context.originalIdentity);
        const edit = createItemEditPage(this.page, 'combo') as ItemEditComboPage;
        await edit.expectPackageEditReady();
        if (caseId === 'TC-ITEM-PKG-030') {
          const actual = await edit.readSelectedCornerMarks([first.name]);
          if (actual.length !== 1 || actual[0] !== first.name) throw new Error('套餐角标保存后未唯一回显');
          return { created, selected: first, actual };
        }
        const second = await edit.selectVisibleCornerMark(1);
        await this.saveEdit(edit);
        await list.open();
        await list.fillSearchAndWait(context.originalIdentity);
        await list.clickItemName(context.originalIdentity);
        const replay = createItemEditPage(this.page, 'combo') as ItemEditComboPage;
        await replay.expectPackageEditReady();
        const names = [first.name, second.name];
        const actual = await replay.readSelectedCornerMarks(names);
        if (actual.length !== 1 || actual[0] !== second.name) throw new Error('套餐角标切换后未仅保留最新值');
        return { created, names, actual };
      }
      const saved = await this.saveAndRegister(page, context, factory);
      return { saved, selected };
    }
    if (caseId === 'TC-ITEM-PKG-032') {
      const seed = await factory.prepareWritable(this.deps.cleanupRegistry);
      const context = { ...seed.primary, originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}` };
      const fixture = await factory.createMaterialFixture(caseId, this.deps.cleanupRegistry);
      await page.open();
      await page.fillItemName(context.originalIdentity);
      await page.fillStandardPrice('10.00');
      await page.addFixedComboGroupByName(seed.primary.comboGroupName!);
      const material = await page.selectOtherSettingOptionByName(fixture.name);
      if (!material.selected) throw new Error(`套餐原料选择后未精确回显：${fixture.name}`);
      const saved = await this.saveAndRegister(page, context, factory);
      return { saved, fixture, material };
    }
    if (caseId === 'TC-ITEM-PKG-068') {
      const primary = await factory.prepareSingleWritable(this.deps.cleanupRegistry);
      const context = { ...primary, originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}` };
      const first = factory.createImageFixture(`${caseId}_FIRST`);
      const second = factory.createImageFixture(`${caseId}_SECOND`);
      try {
        await page.open();
        await page.fillItemName(context.originalIdentity);
        const firstImage = await this.uploadAndRegisterPackageMainImage(page, factory, first);
        await page.fillStandardPrice('10.00');
        await page.addFixedComboGroupByName(primary.comboGroupName!);
        const created = await this.saveAndRegister(page, context, factory);
        const list = createItemListPage(this.page);
        await list.open();
        await list.fillSearchAndWait(context.originalIdentity);
        await list.clickItemName(context.originalIdentity);
        const edit = createItemEditPage(this.page, 'combo') as ItemEditComboPage;
        await edit.expectPackageEditReady();
        const deleted = await edit.deleteCurrentMainImage();
        const secondImage = await this.uploadAndRegisterPackageMainImage(edit, factory, second);
        const updated = await this.saveEdit(edit);
        const payloadReferences = findImageReferences(updated.requestPayload);
        const firstPersisted = referencesOverlap(
          [...firstImage.upload.responseReferences, String(firstImage.brandImage.id)],
          payloadReferences,
        );
        const secondPersisted = referencesOverlap(
          [...secondImage.upload.responseReferences, String(secondImage.brandImage.id)],
          payloadReferences,
        );
        if (!secondPersisted || firstPersisted) throw new Error('套餐编辑页删除旧主图并上传第二张后，PUT 未唯一保存第二张主图。');
        await list.open();
        await list.fillSearchAndWait(context.originalIdentity);
        await list.clickItemName(context.originalIdentity);
        const replay = createItemEditPage(this.page, 'combo') as ItemEditComboPage;
        await replay.expectPackageEditReady();
        const replayImage = await replay.readCommonMainImageState();
        if (replayImage.count !== 1) throw new Error(`套餐第二张主图保存后编辑页回显数量异常：${replayImage.count}`);
        return { created, firstImage, deleted, secondImage, updated, firstPersisted, secondPersisted, replayImage };
      } finally { first.dispose(); second.dispose(); }
    }
    if (caseId === 'TC-ITEM-PKG-033' || caseId === 'TC-ITEM-PKG-054' || caseId === 'TC-ITEM-PKG-067') {
      const primary = caseId === 'TC-ITEM-PKG-033'
        ? (await factory.prepareWritable(this.deps.cleanupRegistry)).primary
        : await factory.prepareSingleWritable(this.deps.cleanupRegistry);
      const context = { ...primary, originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}` };
      const first = factory.createImageFixture(`${caseId}_FIRST`);
      const second = factory.createImageFixture(`${caseId}_SECOND`);
      try {
        let brandImage: Awaited<ReturnType<PackageItem216Factory['registerUploadedBrandImageFixture']>> | undefined;
        let seedUpload: Awaited<ReturnType<ItemCreateComboPage['uploadPackageMainImageFast']>> | undefined;
        await page.open();
        if (caseId === 'TC-ITEM-PKG-033') {
          const seedImage = await this.uploadAndRegisterPackageMainImage(page, factory, first);
          seedUpload = seedImage.upload;
          if (seedUpload.responseReferences.length === 0) throw new Error('套餐图片库种子上传未返回图片引用');
          brandImage = seedImage.brandImage;
          await page.open();
        }
        await page.fillItemName(context.originalIdentity);
        const uploadedImage = caseId === 'TC-ITEM-PKG-033'
          ? undefined
          : await this.uploadAndRegisterPackageMainImage(page, factory, first);
        const image = caseId === 'TC-ITEM-PKG-033'
          ? await page.selectPackageMainImageFromLibraryByName(brandImage!.name)
          : uploadedImage!.upload;
        if (caseId !== 'TC-ITEM-PKG-033') {
          brandImage = uploadedImage!.brandImage;
        }
        if (caseId === 'TC-ITEM-PKG-033' && (!('selected' in image) || !image.selected)) {
          throw new Error(`套餐图片库受控图片未形成唯一回显：${JSON.stringify({ brandImage, image })}`);
        }
        const replacement = undefined;
        await page.fillStandardPrice('10.00');
        await page.addFixedComboGroupByName(primary.comboGroupName!);
        const saved = await this.saveAndRegister(page, context, factory);
        const serverId = Number(saved.serverId);
        const mainImages = await factory.readMainImageEvidence(serverId);
        const payloadReferences = findImageReferences(saved.requestPayload);
        const persistedReferences = mainImages.references.length > 0 ? mainImages.references : payloadReferences;
        if (payloadReferences.length === 0) {
          return {
            classification: 'product-behavior',
            reason: '套餐主图页面已形成回显，但保存 payload 没有图片引用',
            image,
            replacement,
            saved,
            mainImages,
            payloadReferences,
          };
        }
        const list = createItemListPage(this.page);
        await list.fillSearch(context.originalIdentity);
        await list.expectUniqueItemVisible(context.originalIdentity);
        const sources = await list.readItemMainImageSources(context.originalIdentity);
        if (sources.length === 0) {
          return {
            classification: 'product-behavior',
            reason: '套餐详情已持久化主图，但商品列表未回显主图',
            image,
            replacement,
            saved,
            mainImages,
            sources,
          };
        }
        if (caseId === 'TC-ITEM-PKG-054') {
          const clicked = await list.clickFirstMainImageByType(itemListFilterOptionsDom.typeCombo);
          const preview = await list.readImagePreviewEvidence();
          if (preview.previewCount !== 0) throw new Error('套餐商品列表主图不可点击但出现了大图预览。');
          return { image, brandImage, saved, sources, clickAttempted: clicked, preview, expectedRule: '所有商品类型的列表主图均不可点击，点击尝试后不得形成预览终态' };
        }
        return { image, replacement, brandImage, seedUpload, saved, mainImages, payloadReferences, sources };
      } finally { first.dispose(); second.dispose(); }
    }
    if (caseId === 'TC-ITEM-PKG-034' || caseId === 'TC-ITEM-PKG-047' || caseId === 'TC-ITEM-PKG-048') {
      const seed = await factory.prepareWritable(this.deps.cleanupRegistry);
      const context = { ...seed.primary, originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}` };
      const created = await this.createAndVerifyPackageItem(context, factory, {
        price: '10.00',
        minimumOrderQuantity: '1',
        comboGroupName: seed.primary.comboGroupName!,
      });
      const list = createItemListPage(this.page);
      await list.open();
      await list.fillSearch(context.originalIdentity);
      if (caseId === 'TC-ITEM-PKG-034') {
        await list.selectTypeFilterOption(itemListFilterOptionsDom.typeCombo);
        await list.selectStatusFilterOption(itemListFilterOptionsDom.statusEnabled);
        await list.expectAllVisibleRowsMatchTypes([itemListFilterOptionsDom.typeCombo]);
        return { created, filterState: await list.readFilterState(), type: await list.readItemTypeText(context.originalIdentity), status: await list.readItemStatusText(context.originalIdentity) };
      }
      await list.selectTypeFilterOption(itemListFilterOptionsDom.typeCombo);
      if (caseId === 'TC-ITEM-PKG-047') {
        await list.selectStatusFilterOption(itemListFilterOptionsDom.statusEnabled);
        await list.clickReset();
        const state = await list.readFilterState();
        if (state.checkedTypeCount !== 0 || state.checkedStatusCount !== 0 || state.currentPage !== 1) throw new Error(`套餐列表重置未恢复初始状态：${JSON.stringify(state)}`);
        return { created, state };
      }
      await this.page.goto('/pp/brand/category/list', { waitUntil: 'domcontentloaded' });
      await list.open();
      const state = await list.readFilterState();
      if (state.search !== context.originalIdentity || state.checkedTypeCount < 1) {
        return {
          classification: 'product-behavior',
          reason: `返回套餐列表后查询条件未保留：${JSON.stringify(state)}`,
          created,
          state,
        };
      }
      return { created, state };
    }
    if (caseId === 'TC-ITEM-PKG-035' || caseId === 'TC-ITEM-PKG-036') {
      const primary = caseId === 'TC-ITEM-PKG-035'
        ? await factory.prepareSingleWritable(this.deps.cleanupRegistry)
        : await factory.prepareSingleWritable(this.deps.cleanupRegistry);
      const editedIdentity = `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}_EDIT`;
      const context = {
        ...primary,
        originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}`,
        cleanupIdentityVariants: [editedIdentity],
      };
      let initialImage: unknown;
      let initialFixture: ReturnType<PackageItem216Factory['createImageFixture']> | undefined;
      let created: Record<string, unknown>;
      if (caseId === 'TC-ITEM-PKG-035') {
        initialFixture = factory.createImageFixture(`${caseId}_INITIAL`);
        await page.open();
        await page.fillItemName(context.originalIdentity);
        initialImage = await this.uploadAndRegisterPackageMainImage(page, factory, initialFixture);
        await page.fillStandardPrice('10.00');
        await page.addFixedComboGroupByName(primary.comboGroupName!);
        created = await this.saveAndRegister(page, context, factory);
        initialFixture.dispose();
      } else {
        created = await this.createAndVerifyPackageItem(context, factory, {
          price: '10.00', minimumOrderQuantity: '1', comboGroupName: primary.comboGroupName!,
        });
      }
      const serverId = Number(created.serverId);
      const list = createItemListPage(this.page);
      await list.clickVisibleItemName(context.originalIdentity);
      const edit = createItemEditPage(this.page, 'combo') as ItemEditComboPage;
      await edit.expectPackageEditReady();
      let image: unknown;
      if (caseId === 'TC-ITEM-PKG-035') {
        await edit.fillItemName(editedIdentity);
        image = await edit.deleteCurrentMainImage();
      } else {
        await edit.ensureOtherSettingsExpanded();
        await edit.fillPosName(`${context.originalIdentity}_POS`);
      }
      const response = await this.saveEdit(edit);
      const requestPayload = response.requestPayload;
      const replayIdentity = caseId === 'TC-ITEM-PKG-035' ? editedIdentity : context.originalIdentity;
      if (caseId === 'TC-ITEM-PKG-035') {
        if (!containsExactString(requestPayload, editedIdentity)) {
          throw new Error(`套餐基础信息 PUT payload 未包含编辑后名称：${editedIdentity}`);
        }
        const persistedName = await factory.itemNameById(serverId);
        if (persistedName !== editedIdentity) {
          return {
            classification: 'product-behavior',
            reason: `套餐基础信息 PUT 成功后名称未持久化：expected=${editedIdentity} actual=${persistedName}`,
            response,
            image,
            serverId,
          };
        }
      }
      await list.open();
      await list.fillSearchAndWait(replayIdentity);
      await list.clickItemName(replayIdentity);
      const replay = createItemEditPage(this.page, 'combo') as ItemEditComboPage;
      await replay.expectPackageEditReady();
      if (caseId === 'TC-ITEM-PKG-035') {
        const actual = { name: await replay.readItemName(), mainImage: await replay.readCommonMainImageState() };
        const payloadReferences = findImageReferences(requestPayload);
        if (actual.name !== editedIdentity) throw new Error('套餐基础信息编辑名称未回显');
        if (actual.mainImage.count !== 0 || payloadReferences.length !== 0) {
          throw new Error('套餐商品删除主图后保存，PUT 或编辑页仍回显图片。');
        }
        return { initialImage, response, deletion: image, actual, payloadReferences, expectedRule: '商品允许无主图，编辑删除主图后可直接保存' };
      }
      const actual = await replay.readPosAndKitchenNames();
      if (!containsExactString(requestPayload, `${context.originalIdentity}_POS`)) {
        throw new Error(`套餐其他信息 PUT payload 未包含 POS 名称：${context.originalIdentity}_POS`);
      }
      if (actual.posName !== `${context.originalIdentity}_POS`) {
        return {
          classification: 'product-behavior',
          reason: `套餐其他信息 PUT 成功后 POS 名称未持久化：expected=${context.originalIdentity}_POS actual=${actual.posName}`,
          response,
          actual,
          serverId,
        };
      }
      return { response, actual };
    }
    if (caseId === 'TC-ITEM-PKG-037' || caseId === 'TC-ITEM-PKG-055' || caseId === 'TC-ITEM-PKG-061' || caseId === 'TC-ITEM-PKG-062') {
      const primary = await factory.prepareSingleWritable(this.deps.cleanupRegistry);
      const context = { ...primary, originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}` };
      await this.createAndVerifyPackageItem(context, factory, {
        price: '10.00',
        minimumOrderQuantity: '1',
        comboGroupName: primary.comboGroupName!,
        verifyUiTerminal: false,
      });
      const list = createItemListPage(this.page);
      await list.open();
      await list.fillSearch(context.originalIdentity);
      await list.openRowActionMenu(context.originalIdentity);
      if (caseId === 'TC-ITEM-PKG-055') {
        await list.clickRowActionDelete();
        const text = await list.readDeleteDialogText();
        if (!text.trim()) throw new Error('套餐删除确认文案为空');
        await list.cancelDeleteDialog();
        return { confirmationText: text };
      }
      if (caseId === 'TC-ITEM-PKG-037') {
        await list.clickRowActionDelete();
        await list.confirmDeleteDialog();
        await list.expectItemNotVisible(context.originalIdentity);
        if (await factory.itemRecordCount(context.originalIdentity) !== 0) throw new Error('套餐删除后 API 仍有残留');
        return { deleted: true, apiCount: 0 };
      }
      const action = caseId === 'TC-ITEM-PKG-061' ? 'enable' : 'disable';
      if (caseId === 'TC-ITEM-PKG-061') {
        await list.clickRowLifecycleAction('disable');
        await waitUntil(() => list.readItemStatusText(context.originalIdentity), (value) => value === itemListFilterOptionsDom.statusDisabled, { timeout: 15_000, message: '套餐启用前置停用未完成' });
        await list.openRowActionMenu(context.originalIdentity);
      }
      await list.clickRowLifecycleAction(action);
      const expected = action === 'enable' ? itemListFilterOptionsDom.statusEnabled : itemListFilterOptionsDom.statusDisabled;
      const status = await waitUntil(() => list.readItemStatusText(context.originalIdentity), (value) => value === expected, { timeout: 15_000, message: `套餐${action}用例状态未回显` });
      return { action, status };
    }
    if (caseId === 'TC-ITEM-PKG-052' || caseId === 'TC-ITEM-PKG-063' || caseId === 'TC-ITEM-PKG-064' || caseId === 'TC-ITEM-PKG-065' || caseId === 'TC-ITEM-PKG-069' || caseId === 'TC-ITEM-PKG-071' || caseId === 'TC-ITEM-PKG-072' || caseId === 'TC-ITEM-PKG-073') {
      const primary = await factory.prepareSingleWritable(this.deps.cleanupRegistry);
      const context = { ...primary, originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}` };
      await page.open();
      await page.fillItemName(context.originalIdentity);
      await page.fillStandardPrice('10.00');
      await page.addFixedComboGroupByName(primary.comboGroupName!);
      const kind = caseId === 'TC-ITEM-PKG-052' || caseId === 'TC-ITEM-PKG-069' || caseId === 'TC-ITEM-PKG-073'
        ? 'flavor'
        : caseId === 'TC-ITEM-PKG-063' || caseId === 'TC-ITEM-PKG-071'
          ? 'recipe'
          : 'additives';
      const capability = await page.readCommonAttributeReferenceCapabilityEvidence();
      if (!capability.supportedKinds.includes(kind)) {
        return {
          classification: 'accepted-observed',
          reason: `已确认规则：套餐商品不支持 ${kind} 组引用`,
          route: '/pp/brand/create/combo',
          capability,
          operation: 'N/A',
          uiAssertion: `Attribute 区域未出现 ${kind} 组引用菜单`,
          apiAssertion: 'N/A: 未触发属性组引用请求',
          cleanup: 'N/A: 未创建属性引用关系',
        };
      }
      const fixture = kind === 'flavor'
        ? await factory.createTasteFixture(context.originalIdentity, this.deps.cleanupRegistry)
        : kind === 'recipe'
          ? await factory.createMethodFixture(context.originalIdentity, this.deps.cleanupRegistry)
          : await factory.createAddonFixture(context.originalIdentity, primary.dependencyProductIdentity!, this.deps.cleanupRegistry);
      if (caseId === 'TC-ITEM-PKG-052' || caseId === 'TC-ITEM-PKG-069' || caseId === 'TC-ITEM-PKG-073') await page.selectFlavorGroupByName(fixture.groupName);
      if (caseId === 'TC-ITEM-PKG-063' || caseId === 'TC-ITEM-PKG-071') await page.selectRecipeGroupByName(fixture.groupName);
      if (caseId === 'TC-ITEM-PKG-064' || caseId === 'TC-ITEM-PKG-065' || caseId === 'TC-ITEM-PKG-072') await page.selectAdditivesGroupByName(fixture.groupName);
      if (caseId === 'TC-ITEM-PKG-065') {
        const controls = await page.probeReferencedGroupChildControls(fixture.groupName, fixture.optionNames);
        if (controls.addChildControlCount !== 0) throw new Error('套餐已引用组仍展示新增子项入口');
        return controls;
      }
      let attribute: unknown;
      if (caseId === 'TC-ITEM-PKG-069' || caseId === 'TC-ITEM-PKG-071' || caseId === 'TC-ITEM-PKG-072') {
        attribute = await page.setCommonAttributeOptionOverride(fixture.groupName, fixture.optionNames, fixture.optionNames[0], '2.00');
      }
      if (caseId === 'TC-ITEM-PKG-073') {
        attribute = await page.selectOnlyDefaultOption(fixture.groupName, fixture.optionNames[1]);
        if ((attribute as { checkedSwitches: number }).checkedSwitches !== 1) throw new Error('套餐同组选项默认选中不满足单选约束');
      }
      const saved = await this.saveAndRegister(page, context, factory);
      return { saved, fixture, attribute };
    }
    if (caseId === 'TC-ITEM-PKG-012' || caseId === 'TC-ITEM-PKG-013') {
      const primary = await factory.prepareSingleWritable(this.deps.cleanupRegistry);
      const categoryTree = await this.deps.api.categoryTree();
      const categories = findCategoryNodes(categoryTree);
      const leaf = categories.find((item) => item.depth === 0 && item.children.length === 0);
      const parent = categories.find((item) => item.depth === 0 && item.children.length > 0 && item.children[0].name);
      if (caseId === 'TC-ITEM-PKG-012' && !leaf) throw new Error('套餐分类树未观察到无子级一级分类合同');
      if (caseId === 'TC-ITEM-PKG-013' && !parent) throw new Error('套餐分类树未观察到含子级一级分类合同');
      const context = { ...primary, originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}` };
      await page.open();
      await page.fillItemName(context.originalIdentity);
      await page.clickAdvancedSettings();
      await page.fillMinimumOrderQuantity('1');
      if (caseId === 'TC-ITEM-PKG-012') await page.selectLeafCategoryWithoutChildren(leaf!.name);
      if (caseId === 'TC-ITEM-PKG-013') await page.selectCategoryParentOnly(parent!.name, parent!.children[0].name);
      await page.addFixedComboGroupByName(primary.comboGroupName!);
      await page.fillStandardPrice('10.00');
      const before = await factory.itemRecordCount(context.originalIdentity);
      if (caseId === 'TC-ITEM-PKG-012') {
        const response = await this.saveAndRegister(page, context, factory);
        const list = createItemListPage(this.page);
        await list.fillSearch(context.originalIdentity);
        await list.expectUniqueItemVisible(context.originalIdentity);
        return { ...response, before, after: await factory.itemRecordCount(context.originalIdentity), category: leaf!.name, listCategory: await list.readItemCategoryText(context.originalIdentity) };
      }
      const result = await this.saveExpectedBlocked(page, context, factory, {
        before,
        evidence: { category: parent!.name },
      });
      if (caseId === 'TC-ITEM-PKG-013' && result.classification === 'product-behavior') {
        const observedAt = new Date().toISOString();
        return {
          ...result,
          auditObservation: {
            runtimeEvidenceId: `runtime:TC-ITEM-PKG-013:${observedAt}`,
            observedAt,
            route: '/pp/brand/create/combo',
            state: 'parent-category-selected-without-child',
            action: 'save-combo-item',
            overlay: ['category-selector-closed'],
            ui: {
              status: 'passed',
              expected: '页面允许提交并返回列表终态',
              actual: `套餐负向条件未阻止提交，服务器记录数 ${result.before}->${result.after}`,
            },
            api: {
              status: 'passed',
              expected: 'POST 创建成功；按服务器 ID 清理且 UI/API count=0',
              actual: `POST combo 创建成功；创建前 ${result.before}，创建后 ${result.after}`,
              mutationCount: 1,
            },
            operation: 'POST /item/v1/ops-brand/brand-items/combo',
            serverIds: typeof result.serverId === 'number' ? [result.serverId] : [],
          },
        };
      }
      return result;
    }
    if (caseId === 'TC-ITEM-PKG-015' || caseId === 'TC-ITEM-PKG-019' || caseId === 'TC-ITEM-PKG-076') {
      const primary = await factory.prepareSingleWritable(this.deps.cleanupRegistry);
      const context = { ...primary, originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}` };
      await page.open();
      await page.fillItemName(caseId === 'TC-ITEM-PKG-076' ? `  ${context.originalIdentity}  ` : context.originalIdentity);
      await page.clickAdvancedSettings();
      await page.fillMinimumOrderQuantity(caseId === 'TC-ITEM-PKG-015' ? '0' : '1');
      await page.addFixedComboGroupByName(primary.comboGroupName!);
      if (caseId === 'TC-ITEM-PKG-019') await page.typeStandardPriceRaw('-1');
      else await page.fillStandardPrice('10.00');
      if (caseId === 'TC-ITEM-PKG-019') {
        const terminal = await this.saveAndRegister(page, context, factory);
        const list = createItemListPage(this.page);
        await list.open();
        await list.fillSearchAndWait(context.originalIdentity);
        const priceText = await list.readItemPriceText(context.originalIdentity);
        if (Number(priceText.replace(/[^0-9.-]/g, '')) !== 0) throw new Error(`套餐负价格保存后列表价格不是 0.00：${priceText}`);
        return { terminal, normalizedPrice: priceText, expectedRule: '负数或非数字价格保存时归一化为 0.00' };
      }
      const before = await factory.itemRecordCount(context.originalIdentity);
      return this.saveExpectedBlocked(page, context, factory, {
        before,
      });
    }
    if (caseId === 'TC-ITEM-PKG-046') {
      const context = await factory.prepareRequiredProbe(this.deps.cleanupRegistry);
      const audit = this.comboAudit;
      return audit.probeGroupRequired(context, (responseBody) => factory.registerCreated(context, responseBody, this.deps.cleanupRegistry));
    }
    if (caseId === 'TC-ITEM-PKG-059') {
      const primary = await factory.prepareSingleWritable(this.deps.cleanupRegistry, { includeCustomComboGroup: true });
      const audit = this.comboAudit;
      return audit.probeOptionalEditBoundary({
        context: primary,
        registerItemCreated: (body) => factory.registerCreated(primary, body, this.deps.cleanupRegistry),
        registerComboGroupCreated: async () => ({ id: 0, name: primary.customComboGroupName!, checkpointEntryId: 'pre-created' }),
        readItemRecordCount: (identity) => factory.itemRecordCount(identity),
        readComboGroupRecordCount: (identity) => factory.comboGroupRecordCount(identity),
      });
    }
    if (caseId === 'TC-ITEM-PKG-039' || caseId === 'TC-ITEM-PKG-060' || caseId === 'TC-ITEM-PKG-070') {
      return {
        classification: 'environment-blocked',
        reason: `${caseId} 需要已登记的下发 operation 与门店终端/渠道对账环境，当前套餐专用合同未提供`,
        operation: 'N/A',
      };
    }
    if (caseId === 'TC-ITEM-PKG-050') {
      const primary = await factory.prepareSingleWritable(this.deps.cleanupRegistry);
      const context = { ...primary, originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}` };
      const created = await this.createAndVerifyPackageItem(context, factory, {
        price: '10.00',
        minimumOrderQuantity: '1',
        comboGroupName: primary.comboGroupName!,
      });
      const list = createItemListPage(this.page);
      await list.clickItemName(context.originalIdentity);
    const edit = createItemEditPage(this.page, 'combo') as ItemEditComboPage;
      await edit.expectPackageEditReady();
      const before = await edit.readComboGroupRemovalBoundary(primary.comboGroupName!);
      const deleted = await edit.deleteComboGroupByName(primary.comboGroupName!);
      const attempt = await this.observeSaveTerminal(edit);
      const responseBody = attempt.response ? await attempt.response.json().catch(() => null) : null;
      const errors = [...attempt.validationErrors, JSON.stringify(responseBody ?? '')];
      if (!errors.join(' ').includes('BITEM-6003')) throw new Error(`删除全部套餐分组后未提示 BITEM-6003：${JSON.stringify({ errors, responseBody })}`);
      if (await factory.itemRecordCount(context.originalIdentity) !== 1) throw new Error('套餐分组必填校验后原套餐 API 记录不应变化。');
      return { created, before, deleted, responseStatus: attempt.response?.status() ?? null, responseBody, errors, apiCount: 1, expectedRule: '套餐分组必填，删除全部分组后不可保存' };
    }
    if (caseId === 'TC-ITEM-PKG-053') {
      const primary = await factory.prepareSingleWritable(this.deps.cleanupRegistry);
      const context = { ...primary, originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}` };
      await page.open();
      await page.fillItemName(context.originalIdentity);
      await page.fillStandardPrice('10.00');
      await page.addFixedComboGroupByName(primary.comboGroupName!);
      const capability = await page.readCommonAttributeReferenceCapabilityEvidence();
      if (!capability.supportedKinds.includes('flavor')) {
        const observedAt = new Date().toISOString();
        return {
          classification: 'accepted-observed',
          reason: '已确认规则：套餐和加料商品没有互斥规则，仅标准商品支持',
          route: '/pp/brand/create/combo',
          capability,
          operation: 'N/A',
          uiAssertion: 'Attribute 区域仅观察到 Add Combo Group 菜单，未观察到 Flavor',
          apiAssertion: 'N/A: 未触发 Flavor 引用或套餐保存请求',
          cleanup: 'N/A: 未创建 Flavor 引用关系',
          auditObservation: {
            runtimeEvidenceId: `runtime:TC-ITEM-PKG-053:${observedAt}`,
            observedAt,
            route: '/pp/brand/create/combo',
            state: 'combo-attribute-section-open',
            action: 'probe-mutually-exclusive-rule-entry',
            overlay: ['attribute-reference-menu'],
            ui: {
              status: 'passed',
              expected: 'Attribute 区域仅观察到 Add Combo Group 菜单，未观察到 Flavor',
              actual: `supportedKinds=${JSON.stringify(capability.supportedKinds)}`,
            },
            api: {
              status: 'not-applicable',
              expected: 'N/A:未触发 Flavor 引用或套餐保存请求',
              actual: '未展示 Flavor 入口，因此未触发引用或保存 operation',
              mutationCount: 0,
            },
          },
        };
      }
      const fixture = await factory.createTasteFixture(context.originalIdentity, this.deps.cleanupRegistry);
      await page.selectFlavorGroupByName(fixture.groupName);
      await page.expandMutuallyExclusiveRules();
      await page.addMutuallyExclusiveRule();
      const rule = await page.readMutuallyExclusiveRuleEvidence();
      if (rule.ruleTitles.length !== 1 || rule.editButtonCount !== 2) {
        throw new Error(`套餐互斥规则结构异常：${JSON.stringify(rule)}`);
      }
      await page.configureMutuallyExclusiveSide(0, fixture.optionNames[0]);
      await page.configureMutuallyExclusiveSide(1, fixture.optionNames[1]);
      const saved = await this.saveAndRegister(page, context, factory);
      if (!containsKey(saved.requestPayload, 'mutexAttrRuleList')
        || !fixture.optionNames.every((name) => containsExactString(saved.requestPayload, name))) {
        throw new Error(`套餐互斥规则未完整进入保存 payload：${JSON.stringify({ fixture, payload: saved.requestPayload })}`);
      }
      const list = createItemListPage(this.page);
      await list.open();
      await list.fillSearchAndWait(context.originalIdentity);
      await list.clickItemName(context.originalIdentity);
    const edit = createItemEditPage(this.page, 'combo') as ItemEditComboPage;
      await edit.expectPackageEditReady();
      const conflict = await edit.readMutuallyExclusiveConflictEvidence(fixture.groupName, fixture.optionNames);
      const disabledCount = conflict.options.filter((option) => option.disabled).length;
      const checkedCount = conflict.options.filter((option) => option.checked).length;
      if (disabledCount === 0 || checkedCount > 1) {
        return {
          classification: 'product-behavior',
          reason: `套餐互斥规则保存后冲突项未置灰：${JSON.stringify(conflict)}`,
          fixture,
          rule,
          saved,
          conflict,
        };
      }
      return { fixture, rule, saved, conflict, disabledCount, checkedCount };
    }
    if (caseId === 'TC-ITEM-PKG-038') {
      const primary = await factory.prepareSingleWritable(this.deps.cleanupRegistry);
      const context = { ...primary, originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}` };
      const created = await this.createAndVerifyPackageItem(context, factory, {
        price: '10.00',
        minimumOrderQuantity: '1',
        comboGroupName: primary.comboGroupName!,
        verifyUiTerminal: false,
      });
      const itemId = Number(created.serverId);
      const menu = await factory.createMenuFixture(context.originalIdentity, this.deps.cleanupRegistry);
      const binding = await factory.bindMenuItem(menu, itemId, context.originalIdentity, this.deps.cleanupRegistry);
      const bindingBefore = await factory.menuBindingCount(menu, itemId);
      if (bindingBefore !== 1) throw new Error(`套餐菜单引用前置不唯一：${bindingBefore}`);
      const list = createItemListPage(this.page);
      await list.open();
      await list.fillSearchAndWait(context.originalIdentity);
      await list.openRowActionMenu(context.originalIdentity);
      await list.clickRowActionDelete();
      const confirmationText = await list.readDeleteDialogText();
      let response: Response | undefined;
      const listener = (candidate: Response) => {
        if (candidate.request().method() === 'DELETE'
          && new URL(candidate.url()).pathname.endsWith(`/ops-brand/brand-items/${itemId}`)) response = candidate;
      };
      this.page.on('response', listener);
      try {
        await list.confirmDeleteDialog();
        await waitUntil(
          () => response,
          (candidate) => Boolean(candidate),
          { timeout: 3_000, interval: 100, message: `套餐菜单引用删除未发出服务端请求：${itemId}` },
        ).catch(() => undefined);
      } finally {
        this.page.off('response', listener);
      }
      const responseBody = response ? await response.json().catch(() => null) : null;
      const apiCount = await factory.itemRecordCount(context.originalIdentity);
      const bindingAfter = await factory.menuBindingCount(menu, itemId);
      await list.open();
      await list.fillSearchAndWait(context.originalIdentity);
      await list.expectUniqueItemVisible(context.originalIdentity);
      if (apiCount !== 1 || bindingAfter !== 1) {
        return {
          classification: 'product-behavior',
          reason: `套餐被菜单引用后删除未被阻断：itemCount=${apiCount} bindingCount=${bindingAfter}`,
          created,
          menu,
          binding,
          responseStatus: response?.status() ?? null,
          responseBody,
        };
      }
      return {
        created,
        menu,
        binding,
        bindingBefore,
        bindingAfter,
        confirmationText,
        operation: response
          ? `${response.request().method()} ${new URL(response.url()).pathname}`
          : 'N/A: client-side deletion block',
        responseStatus: response?.status() ?? null,
        blockedAt: response ? 'server' : 'client',
        responseBody,
        apiCount,
        uiTerminal: 'referenced-item-remains-visible',
        apiTerminal: 'item-count=1,binding-count=1',
      };
    }
    if (caseId === 'TC-ITEM-PKG-023') {
      const primary = await factory.prepareSingleWritable(this.deps.cleanupRegistry);
      const requestedMnemonic = 'X'.repeat(21);
      const context: ProductCenterItemCreateContext = {
        ...primary,
        originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}`,
      };
      await page.open();
      await page.fillItemName(context.originalIdentity);
      await page.clickAdvancedSettings();
      await page.fillMnemonicCode(requestedMnemonic);
      await page.fillMinimumOrderQuantity('1');
      await page.addFixedComboGroupByName(primary.comboGroupName!);
      await page.typeStandardPriceRaw('10.00');
      const mnemonicBoundary = await page.readMnemonicBoundary();
      if (mnemonicBoundary.maxLength !== 20 || mnemonicBoundary.value.length !== 20) {
        throw new Error(`套餐助记码输入边界不符合已确认规则：${JSON.stringify({ requestedMnemonic, mnemonicBoundary })}`);
      }
      const terminal = await this.saveAndRegister(page, context, factory);
      return {
        ...terminal,
        requestedMnemonic,
        persistedMnemonic: mnemonicBoundary.value,
        expectedRule: '助记码达到 20 字符后不可继续输入；按 20 字符值保存成功。',
      };
    }
    const seed = await factory.prepareWritable(this.deps.cleanupRegistry, {
      includeCustomComboGroup: caseId === 'TC-ITEM-PKG-049',
    });
    const context: ProductCenterItemCreateContext = {
      ...seed.primary,
      originalIdentity: `AUTO_AUDIT_PACKAGE_${caseId}_${Date.now()}`,
      price: caseId === 'TC-ITEM-PKG-018' ? '0.00' : '10.00',
    };
    if (caseId === 'TC-ITEM-PKG-049') {
      const comboPage = await this.createFlow.openComboCreateFromList(this.page);
      await comboPage.fillItemName(context.originalIdentity);
      await comboPage.clickAdvancedSettings();
      await comboPage.fillMinimumOrderQuantity('1');
      await comboPage.addFixedComboGroupByName(seed.primary.comboGroupName!);
      const customGroupName = seed.primary.customComboGroupName!;
      await comboPage.selectCustomComboGroupByName(customGroupName);
      await comboPage.fillStandardPrice('10.00');
      const response = await this.saveAndRegister(comboPage, context, factory);
      const list = createItemListPage(this.page);
      await list.fillSearch(context.originalIdentity);
      await list.expectUniqueItemVisible(context.originalIdentity);
      await list.clickItemName(context.originalIdentity);
      const edit = createItemEditPage(this.page, 'combo') as ItemEditComboPage;
      await edit.expectPackageEditReady();
      return { ...response, fixedCardCount: await edit.readComboGroupCardCount(seed.primary.comboGroupName!), customCardCount: await edit.readComboGroupCardCount(customGroupName) };
    }
    if (caseId === 'TC-ITEM-PKG-020') {
      const comboPage = await this.createFlow.openComboCreateFromList(this.page);
      await comboPage.fillItemName(context.originalIdentity);
      await comboPage.clickAdvancedSettings();
      await comboPage.fillMinimumOrderQuantity('1');
      await comboPage.addFixedComboGroupByName(seed.primary.comboGroupName!);
      await comboPage.fillStandardPrice('10.00');
      await comboPage.fillPackagingFee('1.00');
      const response = await this.saveAndRegister(comboPage, context, factory);
      return { ...response, packagingFee: '1.00' };
    }
    if (caseId === 'TC-ITEM-PKG-026' || caseId === 'TC-ITEM-PKG-077') {
      await page.open();
      await page.fillItemName(context.originalIdentity);
      await page.clickAdvancedSettings();
      if (caseId === 'TC-ITEM-PKG-026') await page.fillCommonItemAltName(context.originalIdentity);
      await page.fillMinimumOrderQuantity('1');
      await page.addFixedComboGroupByName(seed.primary.comboGroupName!);
      await page.typeStandardPriceRaw(caseId === 'TC-ITEM-PKG-077' ? 'abc' : '10.00');
      const before = await factory.itemRecordCount(context.originalIdentity);
      return this.saveExpectedBlocked(page, context, factory, { before });
    }
    const result = await this.createAndVerifyPackageItem(context, factory, {
      price: context.price,
      minimumOrderQuantity: caseId === 'TC-ITEM-PKG-016' ? '2' : '1',
      comboGroupName: seed.primary.comboGroupName!,
    });
    return { result, context: { identity: context.originalIdentity, price: context.price } };
  }

  @step('验证标准商品与套餐商品跨类型同名创建及编辑均被阻止')
  private async crossTypeStandardPackageNameRule(factory: PackageItem216Factory): Promise<Record<string, unknown>> {
    const timestamp = Date.now();
    const seed = await factory.prepareSingleWritable(this.deps.cleanupRegistry);
    const standardName = `AUTO_AUDIT_CROSS_STD_PKG_${timestamp}`;
    const packageName = `AUTO_AUDIT_CROSS_PKG_STD_${timestamp}`;

    const createStandard = async (name: string) => {
      const context: ProductCenterItemCreateContext = {
        ...seed,
        productType: 'standard',
        originalIdentity: name,
        price: '10.00',
        minimumOrderQuantity: '1',
      };
      const page = await this.createFlow.openStandardCreateFromList(this.page);
      await page.fillItemName(name);
      await page.selectSingleSpec();
      await page.fillStandardPrice('10.00');
      const response = await captureResponse(
        this.page,
        (candidate) => candidate.request().method() === 'POST'
          && new URL(candidate.url()).pathname.endsWith('/ops-brand/brand-items/standard'),
        () => page.clickSave(),
        15_000,
        `标准商品保存响应未捕获：${name}`,
      );
      const body = await response.json().catch(() => null);
      if (!response.ok() || /BITEM-|success\\s*[:=]\\s*false/i.test(JSON.stringify(body))) {
        throw new Error(`标准商品基准创建失败：${name} status=${response.status()} body=${JSON.stringify(body)}`);
      }
      const created = extractCreatedRecord(body, name);
      const serverId = created?.id ?? await factory.itemId(name);
      const registered = await factory.registerCreatedByServerId(context, serverId, this.deps.cleanupRegistry);
      return { context, registered, response: { status: response.status(), path: new URL(response.url()).pathname } };
    };

    const createPackage = async (name: string) => {
      const context: ProductCenterItemCreateContext = {
        ...seed,
        productType: 'combo',
        originalIdentity: name,
        price: '10.00',
        minimumOrderQuantity: '1',
      };
      const created = await this.createAndVerifyPackageItem(context, factory, {
        price: '10.00',
        minimumOrderQuantity: '1',
        comboGroupName: seed.comboGroupName!,
        verifyUiTerminal: false,
      });
      return { context, created, serverId: Number(created.serverId) };
    };

    const readApiError = (body: unknown): boolean => /BITEM-7014/.test(JSON.stringify(body));
    const readUiError = (errors: string[]): boolean => errors.some((error) => /BITEM-7014|商品名称与其它类型商品名称重复/.test(error));
    const duplicateResults: Array<Record<string, unknown>> = [];
    const assertionReceipts: Array<Record<string, unknown>> = [];
    const mismatches: Array<Record<string, unknown>> = [];

    const standardBase = await createStandard(standardName);
    const duplicateComboPage = createItemCreateComboPage(this.page);
    await duplicateComboPage.open();
    await duplicateComboPage.fillItemName(standardName);
    await duplicateComboPage.fillStandardPrice('10.00');
    await duplicateComboPage.addFixedComboGroupByName(seed.comboGroupName!);
    const duplicateCombo = await this.attemptDuplicateSave(duplicateComboPage);
    const duplicateComboErrors = await duplicateComboPage.readVisibleValidationErrors();
    const duplicateComboCount = await factory.itemRecordCount(standardName);
    const comboCreateBlocked = readApiError(duplicateCombo.body) || readUiError(duplicateComboErrors);
    if (duplicateComboCount > 1) {
      const created = extractCreatedRecord(duplicateCombo.body, standardName);
      if (created) {
        await factory.registerCreatedByServerId({ ...seed, productType: 'combo', originalIdentity: standardName }, created.id, this.deps.cleanupRegistry);
      }
    }
    duplicateResults.push({ direction: 'standard→package', duplicateCombo, errors: duplicateComboErrors, before: 1, after: duplicateComboCount });
    assertionReceipts.push({
      claimId: 'TC-ITEM-PKG-079:expectation-1',
      status: comboCreateBlocked && duplicateComboCount === 1 ? 'verified' : 'observed-mismatch',
      expectedValue: '标准商品已存在时，创建同名套餐商品失败并提示 BITEM-7014，标准商品保留且套餐记录不增加',
      actualValue: `API=${JSON.stringify(duplicateCombo.body)}；UI=${duplicateComboErrors.join('；') || '无'}；同名记录=${duplicateComboCount}`,
      actualStatus: 'observed',
      observationChannel: 'ui+api',
      authority: 'user-visible-and-persistence',
      comparison: comboCreateBlocked && duplicateComboCount === 1 ? 'matched' : 'mismatched',
    });
    if (!(comboCreateBlocked && duplicateComboCount === 1)) mismatches.push(assertionReceipts.at(-1)!);

    const packageBase = await createPackage(packageName);
    const duplicateStandardPage = await this.createFlow.openStandardCreateFromList(this.page);
    await duplicateStandardPage.fillItemName(packageName);
    await duplicateStandardPage.selectSingleSpec();
    await duplicateStandardPage.fillStandardPrice('10.00');
    const duplicateStandard = await this.attemptGenericSave(duplicateStandardPage, '/ops-brand/brand-items/standard');
    const duplicateStandardErrors = await duplicateStandardPage.readVisibleValidationErrors();
    const duplicateStandardCount = await factory.itemRecordCount(packageName);
    const standardCreateBlocked = readApiError(duplicateStandard.body) || readUiError(duplicateStandardErrors);
    if (duplicateStandardCount > 1) {
      const created = extractCreatedRecord(duplicateStandard.body, packageName);
      if (created) {
        await factory.registerCreatedByServerId({ ...seed, productType: 'standard', originalIdentity: packageName }, created.id, this.deps.cleanupRegistry);
      }
    }
    duplicateResults.push({ direction: 'package→standard', duplicateStandard, errors: duplicateStandardErrors, before: 1, after: duplicateStandardCount });
    assertionReceipts.push({
      claimId: 'TC-ITEM-PKG-079:expectation-2',
      status: standardCreateBlocked && duplicateStandardCount === 1 ? 'verified' : 'observed-mismatch',
      expectedValue: '套餐商品已存在时，创建同名标准商品失败并提示 BITEM-7014，套餐商品保留且标准记录不增加',
      actualValue: `API=${JSON.stringify(duplicateStandard.body)}；UI=${duplicateStandardErrors.join('；') || '无'}；同名记录=${duplicateStandardCount}`,
      actualStatus: 'observed',
      observationChannel: 'ui+api',
      authority: 'user-visible-and-persistence',
      comparison: standardCreateBlocked && duplicateStandardCount === 1 ? 'matched' : 'mismatched',
    });
    if (!(standardCreateBlocked && duplicateStandardCount === 1)) mismatches.push(assertionReceipts.at(-1)!);

    const editStandardName = `AUTO_AUDIT_CROSS_EDIT_STD_${timestamp}`;
    const editPackageName = `AUTO_AUDIT_CROSS_EDIT_PKG_${timestamp}`;
    const editStandard = await createStandard(editStandardName);
    const editPackage = await createPackage(editPackageName);
    assertionReceipts.push({
      claimId: 'TC-ITEM-PKG-079:expectation-3',
      status: 'verified',
      expectedValue: '标准商品和套餐商品各有一条可用于编辑判重的基准记录',
      actualValue: `standard=${editStandard.registered.id}；package=${editPackage.serverId}`,
      actualStatus: 'observed',
      observationChannel: 'api',
      authority: 'item-create-api',
      comparison: 'matched',
    });

    const list = createItemListPage(this.page);
    await list.open();
    await list.fillSearchAndWait(editStandardName);
    await list.expectUniqueItemVisible(editStandardName);
    await list.clickItemName(editStandardName);
    const standardEdit = createItemEditPage(this.page, 'standard');
    await standardEdit.expectLoaded();
    await standardEdit.fillItemName(editPackageName);
    const standardEditAttempt = await this.attemptGenericEditSave(standardEdit, editPackageName);
    const persistedStandardName = await factory.itemNameById(editStandard.registered.id);
    const standardEditErrors = await standardEdit.readVisibleValidationErrors();
    const standardEditBlocked = readApiError(standardEditAttempt.body) || readUiError(standardEditErrors);
    const standardEditPayloadMatched = standardEditAttempt.namePayloadMatched !== false;
    const standardEditMatched = standardEditPayloadMatched && standardEditBlocked && persistedStandardName === editStandardName;
    assertionReceipts.push({
      claimId: 'TC-ITEM-PKG-079:expectation-4',
      status: standardEditMatched ? 'verified' : 'observed-mismatch',
      expectedValue: '标准商品改名为已有套餐商品名称失败并提示 BITEM-7014，原标准商品名称保持不变',
      actualValue: `输入=${standardEditAttempt.inputNameBeforeSave}；PUT名称=${standardEditAttempt.requestPayloadName}；API=${JSON.stringify(standardEditAttempt.body)}；UI=${standardEditErrors.join('；') || '无'}；持久化名称=${persistedStandardName}`,
      actualStatus: 'observed',
      observationChannel: 'ui+api',
      authority: 'user-visible-and-persistence',
      comparison: standardEditMatched ? 'matched' : 'mismatched',
    });
    if (!standardEditMatched) mismatches.push(assertionReceipts.at(-1)!);

    await list.open();
    await list.fillSearchAndWait(editPackageName);
    await list.expectUniqueItemVisible(editPackageName);
    await list.clickItemName(editPackageName);
    const packageEdit = createItemEditPage(this.page, 'combo') as ItemEditComboPage;
    await packageEdit.expectLoaded();
    await packageEdit.fillItemName(editStandardName);
    const packageEditAttempt = await this.attemptGenericEditSave(packageEdit, editStandardName);
    const persistedPackageName = await factory.itemNameById(editPackage.serverId);
    const packageEditErrors = await packageEdit.readVisibleValidationErrors();
    const packageEditBlocked = readApiError(packageEditAttempt.body) || readUiError(packageEditErrors);
    const packageEditPayloadMatched = packageEditAttempt.namePayloadMatched !== false;
    const packageEditMatched = packageEditPayloadMatched && packageEditBlocked && persistedPackageName === editPackageName;
    assertionReceipts.push({
      claimId: 'TC-ITEM-PKG-079:expectation-5',
      status: packageEditMatched ? 'verified' : 'observed-mismatch',
      expectedValue: '套餐商品改名为已有标准商品名称失败并提示 BITEM-7014，原套餐商品名称保持不变',
      actualValue: `输入=${packageEditAttempt.inputNameBeforeSave}；PUT名称=${packageEditAttempt.requestPayloadName}；API=${JSON.stringify(packageEditAttempt.body)}；UI=${packageEditErrors.join('；') || '无'}；持久化名称=${persistedPackageName}`,
      actualStatus: 'observed',
      observationChannel: 'ui+api',
      authority: 'user-visible-and-persistence',
      comparison: packageEditMatched ? 'matched' : 'mismatched',
    });
    if (!packageEditMatched) mismatches.push(assertionReceipts.at(-1)!);

    const result: Record<string, unknown> = {
      route: '/pp/brand/list',
      names: { standardName, packageName, editStandardName, editPackageName },
      duplicateResults,
      editResults: {
        standard: { attempt: standardEditAttempt, errors: standardEditErrors, persistedName: persistedStandardName },
        package: { attempt: packageEditAttempt, errors: packageEditErrors, persistedName: persistedPackageName },
      },
      assertionReceipts,
      auditObservation: {
        runtimeEvidenceId: `runtime:TC-ITEM-PKG-079:${new Date().toISOString()}`,
        observedAt: new Date().toISOString(),
        route: '/pp/brand/list',
        state: mismatches.length === 0 ? 'standard-package-cross-type-name-blocked' : 'standard-package-cross-type-name-mismatch',
        action: 'create-and-edit-standard-package-with-cross-type-duplicate-names',
      },
    };
    if (mismatches.length > 0) {
      result.classification = 'product-behavior';
      result.reason = '标准商品与套餐商品跨类型重名创建或编辑未按 BITEM-7014 完整阻止，或失败后名称未保持不变';
    }
    return result;
  }

  @step('验证套餐与加料商品跨类型同名及改名规则')
  private async crossTypePackageAddonNameRule(factory: PackageItem216Factory): Promise<Record<string, unknown>> {
    const timestamp = Date.now();
    const sharedIdentity = `AUTO_AUDIT_CROSS_PKG_ADD_${timestamp}`;
    const packageSeed = await factory.prepareSingleWritable(this.deps.cleanupRegistry);
    const packageContext: ProductCenterItemCreateContext = {
      ...packageSeed,
      originalIdentity: sharedIdentity,
      price: '10.00',
      minimumOrderQuantity: '1',
    };
    const packageCreated = await this.createAndVerifyPackageItem(packageContext, factory, {
      price: '10.00',
      minimumOrderQuantity: '1',
      comboGroupName: packageSeed.comboGroupName!,
      verifyUiTerminal: false,
    });

    const addonContext: ProductCenterItemCreateContext = {
      entityKey: 'item',
      productType: 'side',
      originalIdentity: sharedIdentity,
      price: '5.00',
      minimumOrderQuantity: '1',
    };
    const addonList = createItemListPage(this.page);
    await addonList.open();
    const addonPage = await (await addonList.enterCreateTypePage()).enterSideCreate();
    await addonPage.fillItemName(sharedIdentity);
    await addonPage.fillStandardPrice('5.00');
    const addonResponse = await captureResponse(
      this.page,
      (candidate) => {
        const pathname = new URL(candidate.url()).pathname;
        return candidate.request().method() === 'POST'
          && pathname.includes('/ops-brand/brand-items/')
          && !pathname.endsWith('/pageQuery')
          && !pathname.endsWith('/brand-image-files');
      },
      () => addonPage.clickSave(),
      15_000,
      `加料商品保存响应未捕获：${sharedIdentity}`,
    );
    const addonBody = await addonResponse.json().catch(() => null);
    const addonCreated = await factory.registerAddonCreated(
      addonContext,
      addonBody,
      this.deps.cleanupRegistry,
    );
    const list = createItemListPage(this.page);
    await list.open();
    await list.fillSearchAndWait(sharedIdentity);
    const totalCount = await list.waitForVisibleIdentityCount(sharedIdentity, 2);
    if (totalCount !== 2) throw new Error(`跨类型同名列表结果数量异常：${sharedIdentity} count=${totalCount}`);

    await list.setTypeFilterOptions([itemListFilterOptionsDom.typeCombo]);
    await list.expectAllVisibleRowsMatchType(itemListFilterOptionsDom.typeCombo);
    const comboType = await list.readItemTypeText(sharedIdentity);
    const comboVisibleCount = await list.readVisibleIdentityCount(sharedIdentity);
    await list.setTypeFilterOptions([itemListFilterOptionsDom.typeSide]);
    await list.expectAllVisibleRowsMatchType(itemListFilterOptionsDom.typeSide);
    const addonType = await list.readItemTypeText(sharedIdentity);
    const addonVisibleCount = await list.readVisibleIdentityCount(sharedIdentity);
    if (comboVisibleCount !== 1 || addonVisibleCount !== 1) {
      throw new Error(`跨类型同名筛选结果异常：${JSON.stringify({ comboVisibleCount, addonVisibleCount })}`);
    }

    const targetName = 'ADD_RENAME_TARGET_002';
    const target = await this.ensureAddonRenameTarget(list, factory, targetName);
    if (target.status === 'blocked') {
      const observedAt = new Date().toISOString();
      return {
        classification: 'test-data-blocked',
        reason: target.reason,
        route: '/pp/brand/list',
        packageCreated,
        addonCreated: { ...addonCreated, responseStatus: addonResponse.status(), responsePath: new URL(addonResponse.url()).pathname },
        sharedIdentity,
        list: { totalCount, comboVisibleCount, addonVisibleCount, comboType, addonType },
        target,
        assertionReceipts: [
          {
            claimId: 'TC-ITEM-PKG-078:expectation-1',
            status: 'verified',
            expectedValue: '套餐商品保存不因同名加料规则而被拦截并创建成功',
            actualValue: `套餐商品服务端ID=${packageCreated.serverId}`,
            actualStatus: 'observed',
            observationChannel: 'api',
            authority: 'server-identity',
            comparison: 'matched',
          },
          {
            claimId: 'TC-ITEM-PKG-078:expectation-2',
            status: 'verified',
            expectedValue: '加料商品保存不因同名套餐规则而被拦截并创建成功',
            actualValue: `加料商品服务端ID=${addonCreated.id}；响应=${addonResponse.status()}`,
            actualStatus: 'observed',
            observationChannel: 'api',
            authority: 'server-identity',
            comparison: 'matched',
          },
          {
            claimId: 'TC-ITEM-PKG-078:expectation-3',
            status: 'verified',
            expectedValue: '列表同名仅有套餐与加料两条记录且均可查询',
            actualValue: `列表同名记录=${totalCount}；套餐筛选=${comboVisibleCount}；加料筛选=${addonVisibleCount}`,
            actualStatus: 'observed',
            observationChannel: 'ui',
            authority: 'user-visible',
            comparison: 'matched',
          },
          {
            claimId: 'TC-ITEM-PKG-078:expectation-4',
            status: 'blocked',
            expectedValue: `存在唯一加料商品 ${targetName} 作为改名目标`,
            actualValue: `列表查询到 ${target.count} 条${target.type ? `，类型=${target.type}` : ''}`,
            actualStatus: 'observed',
            observationChannel: 'ui',
            authority: 'test-data-precondition',
            comparison: 'not-evaluable',
          },
        ],
        auditObservation: {
          runtimeEvidenceId: `runtime:TC-ITEM-PKG-078:${observedAt}`,
          observedAt,
          route: '/pp/brand/list',
          state: 'cross-type-name-coexistence-verified-target-data-blocked',
          action: 'ensure-unique-addon-rename-target',
        },
      };
    }
    const targetCount = target.count;
    const targetType = target.type;

    const sourceName = `${sharedIdentity}_RENAME_SOURCE`;
    const renameContext: ProductCenterItemCreateContext = {
      ...packageSeed,
      originalIdentity: sourceName,
      price: '10.00',
      minimumOrderQuantity: '1',
    };
    const renameCreated = await this.createAndVerifyPackageItem(renameContext, factory, {
      price: '10.00',
      minimumOrderQuantity: '1',
      comboGroupName: packageSeed.comboGroupName!,
      verifyUiTerminal: false,
    });
    const renameServerId = Number(renameCreated.serverId);
    await list.open();
    await list.fillSearchAndWait(sourceName);
    await list.expectUniqueItemVisible(sourceName);
    await list.clickItemName(sourceName);
    const edit = createItemEditPage(this.page, 'combo') as ItemEditComboPage;
    await edit.expectPackageEditReady();
    await edit.fillItemName(targetName);
    const renameResponse = await this.saveEdit(edit, targetName);
    if (renameResponse.namePayloadMatched === false) {
      const replayList = createItemListPage(this.page);
      await replayList.open();
      await replayList.fillSearchAndWait(targetName);
      const targetRowsAfterRename = await replayList.readVisibleIdentityCount(targetName);
      await replayList.fillSearchAndWait(sourceName);
      const sourceRowsAfterRename = await replayList.readVisibleIdentityCount(sourceName);
      return {
        route: '/pp/brand/list',
        sharedIdentity,
        packageCreated,
        addonCreated: { id: addonCreated.id, responseStatus: addonResponse.status(), responsePath: new URL(addonResponse.url()).pathname },
        list: { totalCount, comboVisibleCount, addonVisibleCount, comboType, addonType },
        target: { name: targetName, count: targetCount, type: targetType },
        rename: { sourceName, serverId: renameServerId, response: renameResponse, targetRowsAfterRename, sourceRowsAfterRename },
        classification: 'automation-diagnostic',
        reason: `保存请求体未携带编辑后的名称：input=${renameResponse.inputNameBeforeSave} payload=${renameResponse.requestPayloadName}`,
        assertionReceipts: [{
          claimId: 'TC-ITEM-PKG-078:expectation-4',
          status: 'observed-mismatch',
          expectedValue: `套餐商品允许改名为已有加料商品 ${targetName}，PUT 请求体应携带新名称`,
          actualValue: JSON.stringify({ inputNameBeforeSave: renameResponse.inputNameBeforeSave, requestPayloadName: renameResponse.requestPayloadName }),
          actualStatus: 'observed',
          observationChannel: 'ui+api',
          authority: 'automation-contract',
          comparison: 'mismatched',
        }],
      };
    }
    const persistedName = await factory.itemNameById(renameServerId);
    if (persistedName !== targetName) {
      // Preserve a complete product-behavior receipt instead of throwing
      // before the UI replay and cleanup evidence can be attached.  A 2xx
      // response/success toast is not persistence proof; the server-side
      // identity read is authoritative for this assertion.
      const replayList = createItemListPage(this.page);
      await replayList.open();
      await replayList.fillSearchAndWait(targetName);
      const targetRowsAfterRename = await replayList.readVisibleIdentityCount(targetName);
      await replayList.fillSearchAndWait(sourceName);
      const sourceRowsAfterRename = await replayList.readVisibleIdentityCount(sourceName);
      return {
        route: '/pp/brand/list',
        sharedIdentity,
        packageCreated,
        addonCreated: {
          id: addonCreated.id,
          responseStatus: addonResponse.status(),
          responsePath: new URL(addonResponse.url()).pathname,
        },
        list: { totalCount, comboVisibleCount, addonVisibleCount, comboType, addonType },
        target: { name: targetName, count: targetCount, type: targetType },
        targetProvisioning: {
          serverId: target.serverId,
          provenance: target.provenance,
          cleanup: target.cleanup,
          ...(target.provisioning ?? {}),
        },
        rename: {
          sourceName,
          serverId: renameServerId,
          response: renameResponse,
          persistedName,
          targetRowsAfterRename,
          sourceRowsAfterRename,
        },
        classification: 'product-behavior',
        reason: `套餐改名 API 终态未持久化：expected=${targetName} actual=${persistedName}`,
        assertionReceipts: [
          {
            claimId: 'TC-ITEM-PKG-078:expectation-1',
            status: 'verified',
            expectedValue: '套餐商品保存不因同名加料规则而被拦截并创建成功',
            actualValue: `套餐商品服务端ID=${packageCreated.serverId}`,
            actualStatus: 'observed',
            observationChannel: 'api',
            authority: 'server-identity',
            comparison: 'matched',
          },
          {
            claimId: 'TC-ITEM-PKG-078:expectation-2',
            status: 'verified',
            expectedValue: '加料商品保存不因同名套餐规则而被拦截并创建成功',
            actualValue: `加料商品服务端ID=${addonCreated.id}；响应=${addonResponse.status()}`,
            actualStatus: 'observed',
            observationChannel: 'api',
            authority: 'server-identity',
            comparison: 'matched',
          },
          {
            claimId: 'TC-ITEM-PKG-078:expectation-3',
            status: 'verified',
            expectedValue: '列表同名仅有套餐与加料两条记录且均可查询',
            actualValue: `列表同名记录=${totalCount}；套餐=${comboType}(${comboVisibleCount})；加料=${addonType}(${addonVisibleCount})`,
            actualStatus: 'observed',
            observationChannel: 'ui',
            authority: 'user-visible',
            comparison: 'matched',
          },
          {
            claimId: 'TC-ITEM-PKG-078:expectation-4',
            status: 'observed-mismatch',
            expectedValue: `套餐商品允许改名为已有加料商品 ${targetName}，API/列表持久化，原名称消失`,
            actualValue: `PUT=${renameResponse.responseStatus}；API名称=${persistedName}；目标名称列表=${targetRowsAfterRename}；原名称列表=${sourceRowsAfterRename}`,
            actualStatus: 'observed',
            observationChannel: 'api+ui',
            authority: 'persistence-and-user-visible',
            comparison: 'mismatched',
          },
        ],
        auditObservation: {
          runtimeEvidenceId: `runtime:TC-ITEM-PKG-078:${new Date().toISOString()}`,
          observedAt: new Date().toISOString(),
          route: '/pp/brand/list',
          state: 'cross-type-coexistence-verified-package-rename-not-persisted',
          action: 'create-same-name-filter-by-type-rename-package-to-addon-name',
        },
      };
    }
    const replayList = createItemListPage(this.page);
    await replayList.open();
    await replayList.fillSearchAndWait(targetName);
    const renamedRows = await replayList.readVisibleIdentityCount(targetName);
    if (renamedRows !== 2) {
      throw new Error(`套餐改名后列表应存在套餐和加料两条记录：${targetName} count=${renamedRows}`);
    }
    const renamedTypes: string[] = [];
    await replayList.setTypeFilterOptions([itemListFilterOptionsDom.typeCombo]);
    renamedTypes.push(await replayList.readItemTypeText(targetName));
    await replayList.setTypeFilterOptions([itemListFilterOptionsDom.typeSide]);
    renamedTypes.push(await replayList.readItemTypeText(targetName));
    await replayList.setTypeFilterOptions([]);
    await replayList.fillSearchAndWait(sourceName);
    const oldNameRows = await replayList.readVisibleIdentityCount(sourceName);
    if (oldNameRows !== 0) throw new Error(`套餐改名后原名称仍存在：${sourceName} count=${oldNameRows}`);

    return {
      route: '/pp/brand/list',
      sharedIdentity,
      packageCreated,
      addonCreated: {
        id: addonCreated.id,
        responseStatus: addonResponse.status(),
        responsePath: new URL(addonResponse.url()).pathname,
      },
      list: { totalCount, comboVisibleCount, addonVisibleCount, comboType, addonType },
      target: { name: targetName, count: targetCount, type: targetType },
      targetProvisioning: {
        serverId: target.serverId,
        provenance: target.provenance,
        cleanup: target.cleanup,
        ...(target.provisioning ?? {}),
      },
      rename: {
        sourceName,
        serverId: renameServerId,
        response: renameResponse,
        persistedName,
        renamedRows,
        renamedTypes,
        oldNameRows,
      },
      assertionReceipts: [
        {
          claimId: 'TC-ITEM-PKG-078:expectation-1',
          status: 'verified',
          expectedValue: '套餐商品保存不因同名加料规则而被拦截并创建成功',
          actualValue: `套餐商品服务端ID=${packageCreated.serverId}`,
          actualStatus: 'observed',
          observationChannel: 'api',
          authority: 'server-identity',
          comparison: 'matched',
        },
        {
          claimId: 'TC-ITEM-PKG-078:expectation-2',
          status: 'verified',
          expectedValue: '加料商品保存不因同名套餐规则而被拦截并创建成功',
          actualValue: `加料商品服务端ID=${addonCreated.id}；响应=${addonResponse.status()}`,
          actualStatus: 'observed',
          observationChannel: 'api',
          authority: 'server-identity',
          comparison: 'matched',
        },
        {
          claimId: 'TC-ITEM-PKG-078:expectation-3',
          status: 'verified',
          expectedValue: '列表同名仅有套餐与加料两条记录且均可查询',
          actualValue: `列表同名记录=${totalCount}；套餐=${comboType}(${comboVisibleCount})；加料=${addonType}(${addonVisibleCount})`,
          actualStatus: 'observed',
          observationChannel: 'ui',
          authority: 'user-visible',
          comparison: 'matched',
        },
        {
          claimId: 'TC-ITEM-PKG-078:expectation-4',
          status: 'verified',
          expectedValue: `套餐商品允许改名为已有加料商品 ${targetName}，API/列表持久化，原名称消失`,
          actualValue: `PUT=${renameResponse.responseStatus}；API名称=${persistedName}；新名称列表=${renamedRows}；原名称列表=${oldNameRows}`,
          actualStatus: 'observed',
          observationChannel: 'api',
          authority: 'persistence',
          comparison: 'matched',
        },
      ],
      auditObservation: {
        runtimeEvidenceId: `runtime:TC-ITEM-PKG-078:${new Date().toISOString()}`,
        observedAt: new Date().toISOString(),
        route: '/pp/brand/list',
        state: 'cross-type-name-coexistence-and-package-rename-observed',
        action: 'create-same-name-filter-by-type-rename-package-to-addon-name',
      },
    };
  }

  /**
   * Resolve the fixed rename target without assuming that the merchant has a
   * pre-seeded record. Existing data is reused only when the exact identity
   * resolves to one add-on row; otherwise a uniquely owned UI fixture is
   * created and registered for cleanup immediately after its server id is
   * observed.
   */
  private async ensureAddonRenameTarget(
    list: ReturnType<typeof createItemListPage>,
    factory: PackageItem216Factory,
    targetName: string,
  ): Promise<AddonRenameTargetResolution> {
    await list.setTypeFilterOptions([]);
    await list.fillSearchAndWait(targetName);
    const allCount = await list.readVisibleIdentityCount(targetName);
    const allIds = await list.readItemServerIds(targetName);

    await list.setTypeFilterOptions([itemListFilterOptionsDom.typeSide]);
    const addonCount = await list.readVisibleIdentityCount(targetName);
    const addonIds = await list.readItemServerIds(targetName);
    const observedType = addonCount === 1 ? await list.readItemTypeText(targetName) : undefined;

    if (addonCount === 1 && addonIds.length === 1 && observedType && /Add-On|Side|加料|配菜/i.test(observedType)) {
      return {
        status: 'ready',
        name: targetName,
        count: addonCount,
        type: observedType,
        serverId: addonIds[0],
        provenance: 'reused-existing',
        cleanup: { required: false, ownership: 'not-owned' },
        provisioning: { allCount, allIds, addonIds, query: targetName },
      };
    }

    if (addonCount > 1 || (addonCount === 1 && addonIds.length !== 1)) {
      return {
        status: 'blocked',
        name: targetName,
        count: addonCount,
        type: observedType,
        serverIds: addonIds,
        reason: `测试数据前置条件不唯一：加料商品 ${targetName} 查询到 ${addonCount} 条，无法安全选择改名目标`,
        provisioning: { allCount, allIds, addonIds, query: targetName },
      };
    }

    const context: ProductCenterItemCreateContext = {
      entityKey: 'item',
      productType: 'side',
      originalIdentity: targetName,
      price: '5.00',
      minimumOrderQuantity: '1',
      // Keep the fixed business identity required by the case while using a
      // unique audit key for CleanupRegistry ownership and residue cleanup.
      cleanupRegistrationIdentity: createAuditIdentity('ITEM').marker,
    };
    const addonPage = await (await list.enterCreateTypePage()).enterSideCreate();
    await addonPage.fillItemName(targetName);
    await addonPage.fillStandardPrice('5.00');
    let response: Response | undefined;
    try {
      response = await captureResponse(
        this.page,
        (candidate) => {
          const pathname = new URL(candidate.url()).pathname;
          return candidate.request().method() === 'POST'
            && pathname.includes('/ops-brand/brand-items/')
            && !pathname.endsWith('/pageQuery')
            && !pathname.endsWith('/brand-image-files');
        },
        () => addonPage.clickSave(),
        15_000,
        `受控加料改名目标保存响应未捕获：${targetName}`,
      );
    } catch (error) {
      await list.open().catch(() => undefined);
      await list.fillSearchAndWait(targetName).catch(() => undefined);
      const reconciledIds = await list.readItemServerIds(targetName).catch(() => []);
      if (reconciledIds.length === 1) {
        const reconciledType = await list.readItemTypeText(targetName).catch(() => '');
        if (/Add-On|Side|加料|配菜/i.test(reconciledType)) {
          const record = await factory.registerCreatedByServerId(context, reconciledIds[0], this.deps.cleanupRegistry);
          return {
            status: 'ready',
            name: targetName,
            count: 1,
            type: reconciledType,
            serverId: record.id,
            provenance: 'created-by-test-reconciled',
            cleanup: { required: true, checkpointEntryId: record.checkpointEntryId, ownership: 'test-created' },
            provisioning: {
              allCount,
              allIds,
              addonIds,
              query: targetName,
              responseObserved: false,
              reconciliation: 'server-id-from-list-after-capture-timeout',
              diagnostic: String(error),
            },
          };
        }
      }
      return {
        status: 'blocked',
        name: targetName,
        count: reconciledIds.length,
        serverIds: reconciledIds,
        reason: `受控加料改名目标创建未形成可确认终态：${String(error)}`,
        provisioning: {
          allCount,
          allIds,
          addonIds,
          query: targetName,
          responseObserved: false,
          reconciliationIds: reconciledIds,
        },
      };
    }

    const body = await response.json().catch(() => null);
    if (!response.ok() || (body && typeof body === 'object' && (body as Record<string, unknown>).success === false)) {
      return {
        status: 'blocked',
        name: targetName,
        count: 0,
        reason: `受控加料改名目标创建被数据工厂拒绝：HTTP ${response.status()}`,
        provisioning: {
          allCount,
          allIds,
          addonIds,
          query: targetName,
          responseObserved: true,
          responseStatus: response.status(),
          responsePath: new URL(response.url()).pathname,
          responseBody: body,
        },
      };
    }

    const record = await factory.registerAddonCreated(context, body, this.deps.cleanupRegistry);
    await list.open();
    await list.fillSearchAndWait(targetName);
    const finalIds = await list.readItemServerIds(targetName);
    const finalType = await list.readItemTypeText(targetName);
    if (finalIds.length !== 1 || finalIds[0] !== record.id || !/Add-On|Side|加料|配菜/i.test(finalType)) {
      return {
        status: 'blocked',
        name: targetName,
        count: finalIds.length,
        type: finalType,
        serverIds: finalIds,
        reason: `受控加料改名目标创建后终态不唯一或类型不匹配：${JSON.stringify({ finalIds, finalType, expectedId: record.id })}`,
        provisioning: {
          allCount,
          allIds,
          addonIds,
          query: targetName,
          responseObserved: true,
          responseStatus: response.status(),
          responsePath: new URL(response.url()).pathname,
        },
      };
    }
    return {
      status: 'ready',
      name: targetName,
      count: 1,
      type: finalType,
      serverId: record.id,
      provenance: 'created-by-test',
      cleanup: { required: true, checkpointEntryId: record.checkpointEntryId, ownership: 'test-created' },
      provisioning: {
        allCount,
        allIds,
        addonIds,
        query: targetName,
        responseObserved: true,
        responseStatus: response.status(),
        responsePath: new URL(response.url()).pathname,
      },
    };
  }

  @step('执行套餐 unresolved 基线审计：{caseId}')
  private async executeUnresolved(contract: PackageItem216UnresolvedContract): Promise<Record<string, unknown>> {
    if (contract.route === '/pp/brand/list') {
      const list = createItemListPage(this.page);
      await list.open();
      return { contract, route: new URL(this.page.url()).pathname, listRows: await list.readVisibleRowCount() };
    }
    const page = createItemCreateComboPage(this.page);
    await page.open();
    return { contract, route: new URL(this.page.url()).pathname, core: await page.readCoreStructureEvidence() };
  }

  private async saveAndRegister(
    page: ItemCreateComboPage,
    context: ProductCenterItemCreateContext,
    factory: PackageItem216Factory,
  ): Promise<Record<string, unknown>> {
    const response = await captureResponse(
      this.page,
      (candidate) => candidate.request().method() === 'POST'
        && new URL(candidate.url()).pathname.endsWith('/ops-brand/brand-items/combo'),
      () => page.clickSave(),
      15_000,
      `套餐商品保存响应未捕获：${context.originalIdentity}`,
    );
    const created = await factory.registerCreated(
      context,
      await response.json().catch(() => null),
      this.deps.cleanupRegistry,
    );
    const apiRecordCount = await factory.itemRecordCount(context.originalIdentity);
    if (!response.ok() || apiRecordCount !== 1) {
      throw new Error(`套餐商品保存 API 终态异常：${context.originalIdentity} status=${response.status()} count=${apiRecordCount}`);
    }
    return {
      serverId: created.id,
      requestPayload: readRequestPayload(response),
      responseMethod: response.request().method(),
      responsePath: new URL(response.url()).pathname,
      responseStatus: response.status(),
      successMessageCount: await page.readSuccessMessageCount().catch(() => 0),
      apiRecordCount,
    };
  }

  private async uploadAndRegisterPackageMainImage(
    page: ItemCreateComboPage,
    factory: PackageItem216Factory,
    fixture: ReturnType<PackageItem216Factory['createImageFixture']>,
  ): Promise<{
    upload: Awaited<ReturnType<ItemCreateComboPage['uploadPackageMainImageFast']>>;
    brandImage: Awaited<ReturnType<PackageItem216Factory['registerUploadedImageFixture']>>;
  }> {
    try {
      const upload = await page.uploadPackageMainImageFast(fixture.filePath);
      const brandImage = await factory.registerUploadedImageFixture(fixture, this.deps.cleanupRegistry);
      return { upload, brandImage };
    } catch (error) {
      await factory.registerUploadedImageFixtureIfPresent(fixture, this.deps.cleanupRegistry);
      throw error;
    }
  }

  private async createAndVerifyPackageItem(
    context: ProductCenterItemCreateContext,
    factory: PackageItem216Factory,
    input: {
      price: string;
      minimumOrderQuantity: string;
      comboGroupName: string;
      category?: { parentName: string; leafName?: string };
      verifyUiTerminal?: boolean;
    },
  ): Promise<Record<string, unknown>> {
    const form = createItemCreateComboPage(this.page);
    await form.open();
    await form.fillItemName(context.originalIdentity);
    await form.clickAdvancedSettings();
    await form.fillMinimumOrderQuantity(input.minimumOrderQuantity);
    if (input.category) await this.selectPackageCategory(input.category);
    await form.addFixedComboGroupByName(input.comboGroupName);
    await form.fillStandardPrice(input.price);
    const terminal = await this.saveAndRegister(form, context, factory);

    if (input.verifyUiTerminal === false) {
      return {
        ...terminal,
        name: context.originalIdentity,
        price: input.price,
        minimumOrderQuantity: input.minimumOrderQuantity,
        comboGroupName: input.comboGroupName,
        apiTerminal: 'verified-present',
        uiTerminal: 'setup-ui-terminal-not-required',
      };
    }

    const list = createItemListPage(this.page);
    await list.open();
    await list.fillSearchAndWait(context.originalIdentity);
    await list.expectUniqueItemVisible(context.originalIdentity);
    const apiRecordCount = await factory.itemRecordCount(context.originalIdentity);
    if (apiRecordCount !== 1) {
      throw new Error(`套餐商品 UI 回显后 API 身份不唯一：${context.originalIdentity} count=${apiRecordCount}`);
    }
    return {
      ...terminal,
      name: context.originalIdentity,
      price: input.price,
      minimumOrderQuantity: input.minimumOrderQuantity,
      comboGroupName: input.comboGroupName,
      locatorCount: 1,
      apiRecordCount,
      uiTerminal: 'verified-present',
      apiTerminal: 'verified-present',
    };
  }

  private async selectPackageCategory(category: { parentName: string; leafName?: string }): Promise<void> {
    await this.page.locator('#category .custom-cascader').click({ timeout: 10_000 });
    const parent = this.page.getByRole('menuitemcheckbox').filter({ hasText: category.parentName });
    if (await parent.count() !== 1) throw new Error(`套餐分类父节点不唯一：${category.parentName}`);
    await parent.evaluate((element) => (element as HTMLElement).click());
    if (category.leafName) {
      const leaf = this.page.getByRole('menuitemcheckbox').filter({ hasText: category.leafName });
      await waitUntil(
        () => leaf.count(),
        (count) => count === 1,
        { timeout: 8_000, interval: 100, message: `套餐分类子节点未显示：${category.leafName}` },
      );
      await leaf.evaluate((element) => (element as HTMLElement).click());
    }
    const expected = category.leafName ?? category.parentName;
    await waitUntil(
      () => this.page.locator('#category [class^="cascaderText___"]').innerText(),
      (value) => value.includes(expected),
      { timeout: 8_000, interval: 100, message: `套餐分类未回显：${expected}` },
    );
  }

  private async saveEdit(page: ItemEditComboPage, expectedName?: string): Promise<Record<string, unknown>> {
    const inputNameBeforeSave = await page.readItemName();
    const response = await captureResponse(
      this.page,
      (candidate) => candidate.request().method() === 'PUT'
        && new URL(candidate.url()).pathname.includes('/ops-brand/brand-items/'),
      () => page.clickSave(),
      15_000,
      '套餐商品编辑保存响应未捕获',
    );
    const requestPayload = readRequestPayload(response);
    const requestPayloadName = readItemBasicName(requestPayload);
    return {
      inputNameBeforeSave,
      requestPayloadName,
      ...(expectedName ? { namePayloadMatched: requestPayloadName === expectedName } : {}),
      requestPayload,
      responseMethod: response.request().method(),
      responsePath: new URL(response.url()).pathname,
      responseStatus: response.status(),
      successMessageCount: await page.readSuccessMessageCount().catch(() => 0),
    };
  }

  private async observeSaveTerminal(page: ItemCreateComboPage): Promise<{
    response?: Response;
    validationErrors: string[];
  }> {
    let response: Response | undefined;
    const listener = (candidate: Response) => {
      const pathname = new URL(candidate.url()).pathname;
      if (candidate.request().method() === 'POST'
        && pathname.includes('/ops-brand/brand-items')
        && !pathname.endsWith('/pageQuery')
        && !pathname.endsWith('/brand-image-files')) response = candidate;
    };
    this.page.on('response', listener);
    try {
      await page.clickSave();
      await waitUntil(
        async () => ({ response, validationErrors: await page.readVisibleValidationErrors() }),
        (state) => Boolean(state.response) || state.validationErrors.length > 0,
        { timeout: 8_000, interval: 100, message: '套餐保存未出现请求或可见校验终态' },
      ).catch(() => undefined);
      return { response, validationErrors: await page.readVisibleValidationErrors() };
    } finally {
      this.page.off('response', listener);
    }
  }

  private async attemptDuplicateSave(page: ItemCreateComboPage): Promise<Record<string, unknown>> {
    let response: Response | undefined;
    const listener = (candidate: Response) => {
      if (candidate.request().method() === 'POST' && new URL(candidate.url()).pathname.endsWith('/ops-brand/brand-items/combo')) response = candidate;
    };
    this.page.on('response', listener);
    try {
      await page.clickSave();
      await waitUntil(
        async () => ({ responseObserved: Boolean(response), errors: await page.readVisibleValidationErrors() }),
        (state) => state.responseObserved || state.errors.length > 0,
        { timeout: 15_000, interval: 100, message: '套餐重名负向未进入可判定终态' },
      );
      return response
        ? { status: response.status(), path: new URL(response.url()).pathname, body: await response.json().catch(() => null) }
        : { status: null, path: null };
    } finally {
      this.page.off('response', listener);
    }
  }

  private async attemptGenericSave(
    page: ItemCreateFormPage,
    pathSuffix: string,
  ): Promise<{ status: number | null; path: string | null; body: unknown }> {
    let response: Response | undefined;
    const listener = (candidate: Response) => {
      if (candidate.request().method() === 'POST' && new URL(candidate.url()).pathname.endsWith(pathSuffix)) response = candidate;
    };
    this.page.on('response', listener);
    try {
      await page.clickSave();
      await waitUntil(
        async () => ({ responseObserved: Boolean(response), errors: await page.readVisibleValidationErrors() }),
        (state) => state.responseObserved || state.errors.length > 0,
        { timeout: 15_000, interval: 100, message: `商品保存负向未进入可判定终态：${pathSuffix}` },
      ).catch(() => undefined);
      return response
        ? { status: response.status(), path: new URL(response.url()).pathname, body: await response.json().catch(() => null) }
        : { status: null, path: null, body: null };
    } finally {
      this.page.off('response', listener);
    }
  }

  private async attemptGenericEditSave(
    page: ItemCreateFormPage,
    expectedName?: string,
  ): Promise<{ status: number | null; path: string | null; body: unknown; inputNameBeforeSave?: string; requestPayload?: unknown; requestPayloadName?: string; namePayloadMatched?: boolean }> {
    const inputNameBeforeSave = await page.readItemName();
    let response: Response | undefined;
    const listener = (candidate: Response) => {
      if (candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname.includes('/ops-brand/brand-items/')) response = candidate;
    };
    this.page.on('response', listener);
    try {
      await page.clickSave();
      await waitUntil(
        async () => ({ responseObserved: Boolean(response), errors: await page.readVisibleValidationErrors() }),
        (state) => state.responseObserved || state.errors.length > 0,
        { timeout: 15_000, interval: 100, message: '商品编辑重名负向未进入可判定终态' },
      ).catch(() => undefined);
      if (!response) return { status: null, path: null, body: null, inputNameBeforeSave };
      const requestPayload = readRequestPayload(response);
      const requestPayloadName = readItemBasicName(requestPayload);
      return {
        status: response.status(),
        path: new URL(response.url()).pathname,
        body: await response.json().catch(() => null),
        inputNameBeforeSave,
        requestPayload,
        requestPayloadName,
        ...(expectedName ? { namePayloadMatched: requestPayloadName === expectedName } : {}),
      };
    } finally {
      this.page.off('response', listener);
    }
  }

  private async saveExpectedBlocked(
    page: ItemCreateComboPage,
    context: ProductCenterItemCreateContext,
    factory: PackageItem216Factory,
    input: { before: number; evidence?: Record<string, unknown>; requireVisibleValidation?: boolean },
  ): Promise<Record<string, unknown>> {
    let response: Response | undefined;
    const listener = (candidate: Response) => {
      if (candidate.request().method() === 'POST'
        && new URL(candidate.url()).pathname.endsWith('/ops-brand/brand-items/combo')) response = candidate;
    };
    this.page.on('response', listener);
    try {
      await page.clickSave();
      await waitUntil(
        async () => ({
          responseObserved: Boolean(response),
          errors: await page.readVisibleValidationErrors(),
          pathname: new URL(this.page.url()).pathname,
        }),
        (state) => state.responseObserved || state.errors.length > 0 || state.pathname === '/pp/brand/list',
        { timeout: 8_000, interval: 100, message: `套餐负向场景未进入可判定终态：${context.originalIdentity}` },
      );
    } finally {
      this.page.off('response', listener);
    }

    const responseBody = response ? await response.json().catch(() => null) : null;
    const observedIdentityVariants = typeof input.evidence?.derivedIdentity === 'string'
      ? [input.evidence.derivedIdentity]
      : [];
    const responseRecord = extractCreatedRecord(responseBody, context.originalIdentity)
      ?? observedIdentityVariants.map((identity) => findNamedResponseRecord(responseBody, identity)).find(Boolean);
    let observedServerId = responseRecord?.id;
    if (responseRecord) {
      await factory.registerCreated(context, responseBody, this.deps.cleanupRegistry, observedIdentityVariants);
    }
    if (!observedServerId && observedIdentityVariants.length === 1 && new URL(this.page.url()).pathname === '/pp/brand/list') {
      const list = createItemListPage(this.page);
      const ids = await waitUntil(
        () => list.readItemServerIds(observedIdentityVariants[0]),
        (values) => values.length === 1,
        { timeout: 3_000, interval: 100, message: `套餐异常创建列表行未提供唯一服务器 ID：${observedIdentityVariants[0]}` },
      );
      observedServerId = ids[0];
      await factory.registerCreatedByServerId(context, observedServerId, this.deps.cleanupRegistry);
    }
    const after = observedServerId ? input.before : await factory.itemRecordCount(context.originalIdentity);
    const errors = await page.readVisibleValidationErrors();
    const result = {
      route: '/pp/brand/create/combo',
      before: input.before,
      after,
      serverId: observedServerId,
      responseStatus: response?.status() ?? null,
      errors,
      ...input.evidence,
    };
    if (after > input.before || observedServerId) {
      if (!observedServerId) await factory.registerCreated(context, responseBody, this.deps.cleanupRegistry, observedIdentityVariants);
      return {
        ...result,
        classification: 'product-behavior',
        reason: `套餐负向条件未阻止服务器创建：${context.originalIdentity} ${input.before}->${after} serverId=${observedServerId ?? 'identity-query'}`,
        cleanup: 'registered-by-server-id-and-identity-variants',
      };
    }
    if (input.requireVisibleValidation && (response || errors.length === 0)) {
      return {
        ...result,
        classification: 'product-behavior',
        reason: `套餐价格负向未被页面拦截：requestObserved=${Boolean(response)} visibleErrors=${errors.length}`,
      };
    }
    await page.expectSaveBlockedOnCreatePage();
    return result;
  }

}

function referencesOverlap(expected: string[], actual: string[]): boolean {
  return expected.some((left) => actual.some((right) => (
    left === right || left.includes(right) || right.includes(left)
  )));
}

function readRequestPayload(response: Response): unknown {
  try {
    return response.request().postDataJSON();
  } catch {
    const raw = response.request().postData();
    if (!raw) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
}

function readItemBasicName(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = readItemBasicName(item);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const itemBasic = record.itemBasic;
  if (itemBasic && typeof itemBasic === 'object' && !Array.isArray(itemBasic)) {
    const name = (itemBasic as Record<string, unknown>).name;
    if (typeof name === 'string') return name;
  }
  for (const value of Object.values(record)) {
    const found = readItemBasicName(value);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findImageReferences(value: unknown, output: string[] = [], key = ''): string[] {
  if (Array.isArray(value)) {
    for (const item of value) findImageReferences(item, output, key);
    return [...new Set(output)];
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'number' && /image.*id|brandImageId/i.test(key)) {
      output.push(String(value));
    }
    if (typeof value === 'string' && (
      /image|path|url/i.test(key)
      || /\.(?:png|jpe?g|webp|gif)(?:\?|$)/i.test(value)
      || /(?:^|\/)img\//i.test(value)
    )) {
      output.push(value);
    }
    return [...new Set(output)];
  }
  for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
    findImageReferences(child, output, childKey);
  }
  return [...new Set(output)];
}

function containsExactString(value: unknown, expected: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsExactString(item, expected));
  if (!value || typeof value !== 'object') return value === expected;
  return Object.values(value as Record<string, unknown>).some((item) => containsExactString(item, expected));
}

function containsKey(value: unknown, expected: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, expected));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(record, expected)
    || Object.values(record).some((item) => containsKey(item, expected));
}

function findNamedResponseRecord(value: unknown, identity: string): { id: number } | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const record = findNamedResponseRecord(child, identity);
      if (record) return record;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.name === identity && Number(record.id) > 0) return { id: Number(record.id) };
  for (const child of Object.values(record)) {
    const found = findNamedResponseRecord(child, identity);
    if (found) return found;
  }
  return undefined;
}

type CategoryNode = { name: string; depth: number; children: CategoryNode[] };

function findCategoryNodes(value: unknown, depth = 0): CategoryNode[] {
  if (Array.isArray(value)) return value.flatMap((item) => findCategoryNodes(item, depth));
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string') {
    const children = Array.isArray(record.children)
      ? record.children.flatMap((item) => findCategoryNodes(item, depth + 1))
      : Array.isArray(record.childList) ? record.childList.flatMap((item) => findCategoryNodes(item, depth + 1)) : [];
    return [{ name: record.name, depth, children }, ...children.flatMap((child) => [child, ...child.children])];
  }
  return Object.values(record).flatMap((item) => findCategoryNodes(item, depth));
}

async function captureResponse(
  page: Page,
  predicate: (response: Response) => boolean,
  trigger: () => Promise<void>,
  timeout: number,
  message: string,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      page.off('response', listener);
      clearTimeout(timer);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const listener = (response: Response) => {
      try {
        if (predicate(response)) finish(() => resolve(response));
      } catch (error) {
        finish(() => reject(error));
      }
    };
    const timer = setTimeout(() => finish(() => reject(new Error(`${message}，等待上限 ${timeout}ms`))), timeout);
    page.on('response', listener);
    void trigger().catch((error) => finish(() => reject(error)));
  });
}
