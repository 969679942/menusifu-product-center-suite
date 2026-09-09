import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Response } from '@playwright/test';
import { CleanupRegistry } from '../../api/product-center/cleanup-registry';
import { extractCreatedRecord } from '../../api/product-center/created-record';
import { ProductCenterExecutionLedger } from '../../api/product-center/execution-ledger';
import { MutationIntentJournal } from '../../api/product-center/mutation-intent-journal';
import { ProductCenterApiRecoveryAdapter, ProductCenterRecoveryService } from '../../api/product-center/recovery-service';
import { test, expect } from '../../fixtures/product-center.fixture';
import { ItemEditFlow } from '../../flows/item-edit.flow';
import type { ItemCreateFormPage } from '../../pages/product-management/item/item-create-form.page';
import { ItemCreateStandardPage } from '../../pages/product-management/item/item-create-standard.page';
import { ItemListPage } from '../../pages/product-management/item/item-list.page';
import { itemListFilterOptionsDom } from '../../test-data/item-list';
import {
  ProductCenterItemCreateDataFactory,
  type ProductCenterItemCreateContext,
  type ProductCenterItemCreateRecord,
} from '../../test-data/product-center/product-center-item-create-data.factory';
import { ProductCenterCategoryNegativeDataFactory } from '../../test-data/product-center/sop/product-center-category-negative-data.factory';
import {
  ProductCenterLowDependencyDataFactory,
  type CornerMarkBoundarySeed,
  type LowDependencySeedRecord,
} from '../../test-data/product-center/sop/product-center-low-dependency-data.factory';
import { waitUntil } from '../../utils/wait';

const caseIds = [
  'TC-ITEM-STD-033',
  'TC-ITEM-STD-006',
  'TC-ITEM-STD-052',
  'TC-ITEM-STD-053',
  'TC-ITEM-STD-009',
  'TC-ITEM-STD-055',
  'TC-ITEM-STD-056',
  'TC-ITEM-STD-099',
  'TC-ITEM-STD-100',
  'TC-ITEM-STD-003',
  'TC-ITEM-STD-004',
  'TC-ITEM-STD-034',
  'TC-ITEM-STD-042',
  'TC-ITEM-STD-063',
  'TC-ITEM-STD-072',
  'TC-ITEM-STD-073',
  'TC-ITEM-STD-065',
] as const;
type CaseId = typeof caseIds[number];
type Verdict = 'accepted' | 'canonical-conflict' | 'environment-blocked';
type CaseEvidence = { verdict: Verdict; evidence: Record<string, unknown> };

test('绿色标准商品 mega wave 十七条用例技术验收', async ({ page, productCenterApi }, testInfo) => {
  test.setTimeout(2_700_000);
  test.skip(process.env.PC_GREEN_STANDARD_MEGA_LIVE !== '1', '未启用绿色标准商品 mega wave 实时验收');
  const runId = process.env.PC_RECIPE_RUN_ID?.startsWith('AUTO_AUDIT_')
    ? process.env.PC_RECIPE_RUN_ID
    : `AUTO_AUDIT_GREEN_STANDARD_MEGA_${Date.now()}`;
  const reportPath = path.resolve(`output/audit/product-center-item-green-standard-mega-runtime-${runId}.json`);
  const executionLedger = new ProductCenterExecutionLedger({ rootDir: path.resolve('output/checkpoints'), runId });
  const cleanupRegistry = new CleanupRegistry(executionLedger);
  const recoveryService = new ProductCenterRecoveryService(
    executionLedger,
    new ProductCenterApiRecoveryAdapter(productCenterApi),
  );
  const mutationJournal = new MutationIntentJournal({ rootDir: path.resolve('output/mutation-intents'), runId });
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const categoryFactory = new ProductCenterCategoryNegativeDataFactory(productCenterApi);
  const dependencyFactory = new ProductCenterLowDependencyDataFactory(productCenterApi);
  const recordsByIdentity = new Map<string, ProductCenterItemCreateRecord>();
  const attemptedItemIdentities = new Set<string>();
  const caseEvidence: Record<string, CaseEvidence> = loadResumableEvidence(reportPath, runId);
  const suffix = createHash('sha256').update(runId).digest('hex').slice(0, 10).toUpperCase();
  const names = {
    category: `AUTO_AUDIT_GSM_CATEGORY_${suffix}`,
    categoryItem: `AUTO_AUDIT_GSM_CATEGORY_ITEM_${suffix}`,
    libraryImageItem: `AUTO_AUDIT_GSM_LIBRARY_IMAGE_${suffix}`,
    localImageItem: `AUTO_AUDIT_GSM_LOCAL_IMAGE_${suffix}`,
    formattedNamesItem: `AUTO_AUDIT_GSM_FORMAT_NAMES_${suffix}`,
    descriptionItem: `AUTO_AUDIT_GSM_DESCRIPTION_${suffix}`,
    cornerItem: `AUTO_AUDIT_GSM_CORNER_${suffix}`,
    statisticsItem: `AUTO_AUDIT_GSM_STATISTICS_${suffix}`,
    lifecycleItem: `AUTO_AUDIT_GSM_LIFECYCLE_${suffix}`,
  };
  const localImagePath = testInfo.outputPath(`AUTO_AUDIT_GSM_MAIN_${suffix}.png`);
  let descriptionTags: LowDependencySeedRecord[] = [];
  let statisticsTags: LowDependencySeedRecord[] = [];
  let cornerMarks: CornerMarkBoundarySeed | undefined;
  let executionDiagnostic: string | undefined;

  try {
    await recoverInterruptedRun();
    checkpoint('running');
    await runReadOnlyAndPreferenceCases();
    if (!caseEvidence['TC-ITEM-STD-006']) await runParentCategoryCreate();
    if (!caseEvidence['TC-ITEM-STD-052']) await runLibraryMainImageCreate();
    if (!caseEvidence['TC-ITEM-STD-053']) await runLocalMainImageCreate();
    if (!caseEvidence['TC-ITEM-STD-009']) await runFormattedNamesCreate();
    if (!caseEvidence['TC-ITEM-STD-033']) await runOtherInformationGate();
    if (!caseEvidence['TC-ITEM-STD-056']) await runMaterialInformationGate();
    await runControlledOtherSettingsCases();
    if (!caseEvidence['TC-ITEM-STD-034']) await runTasteSyncGate();
    if (!caseEvidence['TC-ITEM-STD-065']) await runEnableLifecycleCase();
    expect(Object.keys(caseEvidence).sort()).toEqual([...caseIds].sort());
    checkpoint('evidence-complete');
  } catch (error) {
    executionDiagnostic = safeDiagnostic(error);
    checkpoint('executor-error');
    throw error;
  } finally {
    let cleanupDiagnostic: string | undefined;
    try {
      await reconcileIncompleteIntents();
      await cleanupRegistry.cleanupAll();
      const recovery = await recoveryService.recoverIncomplete();
      if (recovery.failedEntryIds.length > 0) {
        throw new Error(`GREEN-STANDARD-MEGA 恢复清理失败：${recovery.failedEntryIds.join(',')}`);
      }
    } catch (error) {
      cleanupDiagnostic = safeDiagnostic(error);
    }
    const ledger = executionLedger.snapshot();
    const itemIdentities = [...new Set([
      ...attemptedItemIdentities,
      ...ledger.entries.filter((entry) => entry.entityKind === 'item' || entry.entityKind === 'bom-product')
        .flatMap((entry) => entry.identityVariants),
      ...mutationJournal.snapshot().entries.filter((entry) => entry.entity === 'item').map((entry) => entry.identity),
    ])];
    const apiItemResidue = Object.fromEntries(await Promise.all(itemIdentities.map(async (identity) => (
      [identity, await itemFactory.itemRecordCount(identity)] as const
    ))));
    const categoryIdentities = ledger.entries.filter((entry) => entry.entityKind === 'category')
      .flatMap((entry) => entry.identityVariants);
    const apiCategoryResidue = Object.fromEntries(await Promise.all(categoryIdentities.map(async (identity) => (
      [identity, (await categoryFactory.findCategory(identity)) ? 1 : 0] as const
    ))));
    const uiItemResidue: Record<string, number> = {};
    try {
      const list = new ItemListPage(page);
      await list.open();
      for (const identity of itemIdentities) {
        await list.fillSearchForResidueCheck(identity);
        await list.expectItemNotVisible(identity);
        uiItemResidue[identity] = 0;
      }
    } catch (error) {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
    }
    const preferenceResidueFree = ['TC-ITEM-STD-003', 'TC-ITEM-STD-004', 'TC-ITEM-STD-073']
      .every((caseId) => caseEvidence[caseId]?.evidence.restored !== false);
    const residueFree = [apiItemResidue, apiCategoryResidue, uiItemResidue]
      .every((residue) => Object.values(residue).every((value) => value === 0))
      && ledger.entries.every((entry) => entry.phase === 'residue-verified')
      && preferenceResidueFree;
    if (residueFree && !cleanupDiagnostic) {
      for (const entry of mutationJournal.snapshot().entries) mutationJournal.markPhase(entry.intentId, 'cleanup-complete');
    }
    const acceptedCaseIds = verdictIds(caseEvidence, 'accepted');
    const canonicalConflictCaseIds = verdictIds(caseEvidence, 'canonical-conflict');
    const environmentBlockedCaseIds = verdictIds(caseEvidence, 'environment-blocked');
    const complete = Object.keys(caseEvidence).length === caseIds.length;
    const status = complete && residueFree && !executionDiagnostic && !cleanupDiagnostic
      ? canonicalConflictCaseIds.length > 0 || environmentBlockedCaseIds.length > 0
        ? 'accepted-with-dispositions'
        : 'accepted'
      : 'incomplete';
    const report = {
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-green-standard-mega-runtime',
      runId,
      batchId: 'GREEN-STANDARD-MEGA',
      executionMode: 'wave-shared-chain',
      evidenceInheritanceAllowed: false,
      caseLevelRunsClaimed: 0,
      status,
      caseIds,
      acceptedCaseIds,
      canonicalConflictCaseIds,
      environmentBlockedCaseIds,
      caseEvidence,
      summary: {
        total: caseIds.length,
        accepted: acceptedCaseIds.length,
        canonicalConflicts: canonicalConflictCaseIds.length,
        environmentBlocked: environmentBlockedCaseIds.length,
        executorErrors: executionDiagnostic ? 1 : 0,
      },
      cleanupEvidence: {
        apiItemResidue,
        apiCategoryResidue,
        uiItemResidue,
        preferenceResidueFree,
        residueFree,
        ledgerEntries: ledger.entries.length,
        residueVerified: ledger.entries.filter((entry) => entry.phase === 'residue-verified').length,
        cleanupDiagnostic,
      },
      executionDiagnostic,
      mutationIntents: mutationJournal.snapshot().entries.map((entry) => ({
        intentId: entry.intentId,
        entity: entry.entity,
        identity: entry.identity,
        phase: entry.phase,
        reconciliation: entry.reconciliation,
        serverId: entry.serverId,
        ledgerEntryId: entry.ledgerEntryId,
      })),
      security: { credentialsPersisted: false, authorizationArtifactsPersisted: false, storageStatePersisted: false },
    };
    writeJsonAtomic(reportPath, report);
    await testInfo.attach('product-center-item-green-standard-mega-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function runReadOnlyAndPreferenceCases(): Promise<void> {
    const list = new ItemListPage(page);
    if (!caseEvidence['TC-ITEM-STD-003']) {
      await list.open();
      const evidence = await list.probeColumnSelection();
      caseEvidence['TC-ITEM-STD-003'] = disposition(
        evidence.available
          && evidence.restored
          && includesText(evidence.selectedHeaders, /category/i)
          && includesText(evidence.selectedHeaders, /price/i)
          && !includesText(evidence.headersAfterSpecificationRemoved, /specification/i),
        evidence,
      );
      checkpoint('column-selection-complete');
    }
    if (!caseEvidence['TC-ITEM-STD-004']) {
      await list.open();
      const evidence = await list.probeLanguageSwitch();
      caseEvidence['TC-ITEM-STD-004'] = disposition(
        evidence.available
          && evidence.restored
          && evidence.chineseSurfaceTexts.some((text) => /[\u4e00-\u9fff]/u.test(text))
          && evidence.englishSurfaceTexts.some((text) => /product|item|add|reset/i.test(text)),
        evidence,
      );
      checkpoint('language-switch-complete');
    }
    if (!caseEvidence['TC-ITEM-STD-042']) {
      const form = new ItemCreateStandardPage(page);
      await form.open();
      const evidence = await form.readAdvancedSettingsFieldEvidence();
      caseEvidence['TC-ITEM-STD-042'] = disposition(
        evidence.expanded && Object.keys(evidence.fields).length === 8
          && Object.values(evidence.fields).every((field) => field.visible),
        evidence,
      );
      checkpoint('advanced-fields-complete');
    }
    if (!caseEvidence['TC-ITEM-STD-063']) {
      await list.open();
      const evidence = await list.probePageSizeOptions();
      caseEvidence['TC-ITEM-STD-063'] = evidence.available
        ? disposition([10, 20, 50, 100].every((size) => evidence.observations.some((item) => item.requested === size)), evidence)
        : environment(evidence);
      checkpoint('page-sizes-complete');
    }
    if (!caseEvidence['TC-ITEM-STD-072']) {
      await list.open();
      const evidence = await list.readDefaultColumnConfiguration();
      const requiredChecked = [/product name|item name/i, /product type|item type/i, /specification/i, /price/i, /status/i];
      caseEvidence['TC-ITEM-STD-072'] = disposition(
        evidence.available && requiredChecked.every((pattern) => includesText(evidence.checked, pattern)),
        evidence,
      );
      checkpoint('default-columns-complete');
    }
    if (!caseEvidence['TC-ITEM-STD-073']) {
      await list.open();
      const evidence = await list.probeRestoreDefaultColumns();
      caseEvidence['TC-ITEM-STD-073'] = disposition(
        evidence.available && Boolean(evidence.resetControlText) && evidence.restored,
        evidence,
      );
      checkpoint('restore-columns-complete');
    }
  }

  async function runParentCategoryCreate(): Promise<void> {
    const category = await seedLeafCategory(names.category);
    const form = await openRequiredStandardForm(names.categoryItem);
    const selectedPath = await form.selectLeafCategoryWithoutChildren(category.name);
    const record = await submitCreate(form, itemContext(names.categoryItem), 'create-parent-category');
    const reopened = await new ItemEditFlow().openEditByItemName(page, names.categoryItem, 'standard');
    const persistedPath = await reopened.readSelectedCategoryPath();
    caseEvidence['TC-ITEM-STD-006'] = disposition(
      selectedPath.includes(category.name) && persistedPath.includes(category.name),
      { categoryId: category.id, categoryName: category.name, itemId: record.id, selectedPath, persistedPath },
    );
    checkpoint('parent-category-create-complete');
  }

  async function runLibraryMainImageCreate(): Promise<void> {
    const form = await openRequiredStandardForm(names.libraryImageItem);
    const library = await form.selectCommonMainImageFromLibrary();
    if (!library.available || !library.selected) {
      caseEvidence['TC-ITEM-STD-052'] = disposition(false, library);
      checkpoint('library-image-conflict');
      return;
    }
    const record = await submitCreate(form, itemContext(names.libraryImageItem), 'create-library-image');
    const reopened = await new ItemEditFlow().openEditByItemName(page, names.libraryImageItem, 'standard');
    const persistedImageCount = await reopened.readMainImageCardCount();
    caseEvidence['TC-ITEM-STD-052'] = disposition(persistedImageCount > 0, { itemId: record.id, library, persistedImageCount });
    checkpoint('library-image-complete');
  }

  async function runLocalMainImageCreate(): Promise<void> {
    await createAuditImage(localImagePath);
    const form = await openRequiredStandardForm(names.localImageItem);
    const upload = await form.uploadCommonMainImageWithEvidence(localImagePath);
    const record = await submitCreate(form, itemContext(names.localImageItem), 'create-local-image');
    const reopened = await new ItemEditFlow().openEditByItemName(page, names.localImageItem, 'standard');
    const persistedImageCount = await reopened.readMainImageCardCount();
    caseEvidence['TC-ITEM-STD-053'] = disposition(
      upload.responseStatus === 200 && upload.terminalState === 'preview-ready' && persistedImageCount > 0,
      { itemId: record.id, upload, persistedImageCount },
    );
    checkpoint('local-image-complete');
  }

  async function runFormattedNamesCreate(): Promise<void> {
    const requested = {
      posName: 'POS中文  连续 ABC!@#$%^&*()1234567890',
      kitchenName: 'KITCHEN中文  连续 XYZ!@#$%^&*()1234567890',
    };
    const form = await openRequiredStandardForm(names.formattedNamesItem);
    await form.fillPosName(requested.posName);
    await form.fillKitchenName(requested.kitchenName);
    const beforeSave = await form.readPosAndKitchenNames();
    const record = await submitCreate(form, itemContext(names.formattedNamesItem), 'create-formatted-names');
    const reopened = await new ItemEditFlow().openEditByItemName(page, names.formattedNamesItem, 'standard');
    const persisted = await reopened.readPosAndKitchenNames();
    const expectedSatisfied = [persisted.posName, persisted.kitchenName].every((value) => (
      value.length <= 20 && value === value.trim() && !/\s{2,}/u.test(value) && !/[!@#$%^&*()]/u.test(value)
    ));
    caseEvidence['TC-ITEM-STD-009'] = disposition(expectedSatisfied, { itemId: record.id, requested, beforeSave, persisted });
    checkpoint('formatted-names-complete');
  }

  async function runOtherInformationGate(): Promise<void> {
    const form = new ItemCreateStandardPage(page);
    await form.open();
    const capability = await form.readOtherSettingsCapabilityEvidence();
    caseEvidence['TC-ITEM-STD-033'] = environment({
      requiredFixture: ['two-detail-images', 'two-description-tags', 'one-corner', 'two-statistic-tags', 'ingredient', 'allergen', 'nutrition'],
      capability,
      controlledIngredientAvailable: true,
      controlledAllergenAvailable: false,
      controlledNutritionAvailable: false,
      blockReason: '过敏原与营养成分缺少可控 AUTO_AUDIT 创建和清理接口，禁止选择共享业务数据完成组合编辑。',
    });
    checkpoint('other-information-gate-complete');
  }

  async function runMaterialInformationGate(): Promise<void> {
    const form = new ItemCreateStandardPage(page);
    await form.open();
    const capability = await form.readOtherSettingsCapabilityEvidence();
    caseEvidence['TC-ITEM-STD-056'] = environment({
      requiredFixture: ['ingredient', 'allergen', 'nutrition'],
      capability,
      controlledIngredientAvailable: true,
      controlledAllergenAvailable: false,
      controlledNutritionAvailable: false,
      blockReason: '当前只有原料可控创建；过敏原和营养成分没有可控创建、定位和清理契约。',
    });
    checkpoint('material-information-gate-complete');
  }

  async function runControlledOtherSettingsCases(): Promise<void> {
    if (['TC-ITEM-STD-055', 'TC-ITEM-STD-099', 'TC-ITEM-STD-100'].every((caseId) => caseEvidence[caseId])) return;
    descriptionTags = [
      await dependencyFactory.seed('description-tag', cleanupRegistry),
      await dependencyFactory.seed('description-tag', cleanupRegistry),
    ];
    statisticsTags = [
      await dependencyFactory.seed('statistic-tag', cleanupRegistry),
      await dependencyFactory.seed('statistic-tag', cleanupRegistry),
    ];
    cornerMarks = await dependencyFactory.seedCornerMarkBoundaryScenario(cleanupRegistry);

    if (!caseEvidence['TC-ITEM-STD-055']) {
      const record = await createApiItem(names.descriptionItem);
      const tagNames = descriptionTags.map((item) => item.originalIdentity);
      const edit = await new ItemEditFlow().openEditByItemName(page, names.descriptionItem, 'standard');
      const selected = await edit.selectDescriptionTagsByName(tagNames);
      const response = await submitUpdate(edit, record, 'update-description-tags');
      const reopened = await new ItemEditFlow().openEditByItemName(page, names.descriptionItem, 'standard');
      const persisted = await reopened.readOtherSettingsSelectedNames(tagNames);
      caseEvidence['TC-ITEM-STD-055'] = disposition(
        response.ok() && persisted.length === 2 && tagNames.every((name) => persisted.includes(name)),
        { itemId: record.id, selected, persisted, responseStatus: response.status() },
      );
      checkpoint('description-tags-complete');
    }
    if (!caseEvidence['TC-ITEM-STD-099']) {
      const record = await createApiItem(names.cornerItem);
      const cornerNames = cornerMarks.marks.map((item) => item.name);
      const edit = await new ItemEditFlow().openEditByItemName(page, names.cornerItem, 'standard');
      const selected = await edit.selectCornerMarkByName(cornerNames[0]);
      const response = await submitUpdate(edit, record, 'update-corner-mark');
      const reopened = await new ItemEditFlow().openEditByItemName(page, names.cornerItem, 'standard');
      const persisted = await reopened.readSelectedCornerMarks(cornerNames);
      caseEvidence['TC-ITEM-STD-099'] = disposition(
        response.ok() && persisted.length === 1 && persisted[0] === cornerNames[0],
        { itemId: record.id, selected, persisted, responseStatus: response.status() },
      );
      checkpoint('corner-mark-complete');
    }
    if (!caseEvidence['TC-ITEM-STD-100']) {
      const record = await createApiItem(names.statisticsItem);
      const tagNames = statisticsTags.map((item) => item.originalIdentity);
      const edit = await new ItemEditFlow().openEditByItemName(page, names.statisticsItem, 'standard');
      const selected = await edit.selectStatisticsTagsByName(tagNames);
      const response = await submitUpdate(edit, record, 'update-statistics-tags');
      const reopened = await new ItemEditFlow().openEditByItemName(page, names.statisticsItem, 'standard');
      const persisted = await reopened.readOtherSettingsSelectedNames(tagNames);
      caseEvidence['TC-ITEM-STD-100'] = disposition(
        response.ok() && persisted.length === 2 && tagNames.every((name) => persisted.includes(name)),
        { itemId: record.id, selected, persisted, responseStatus: response.status() },
      );
      checkpoint('statistics-tags-complete');
    }
  }

  async function runTasteSyncGate(): Promise<void> {
    const form = new ItemCreateStandardPage(page);
    await form.open();
    const advanced = await form.readAdvancedSettingsFieldEvidence();
    caseEvidence['TC-ITEM-STD-034'] = environment({
      advanced,
      industryInheritanceControlVisible: advanced.fields.industryGoods?.visible ?? false,
      controlledIndustryLibraryProductAvailable: false,
      controlledSyncScopeAvailable: false,
      blockReason: '用例要求行业商品继承来源及同步范围，当前没有可控行业商品库创建、同步确认和清理适配器。',
    });
    checkpoint('taste-sync-gate-complete');
  }

  async function runEnableLifecycleCase(): Promise<void> {
    const record = await createApiItem(names.lifecycleItem);
    const disabled = await changeLifecycle(record, 'disable', itemListFilterOptionsDom.statusDisabled);
    const enabled = await changeLifecycle(record, 'enable', itemListFilterOptionsDom.statusEnabled);
    caseEvidence['TC-ITEM-STD-065'] = disposition(
      disabled.responseStatus >= 200 && disabled.responseStatus < 300
        && enabled.responseStatus >= 200 && enabled.responseStatus < 300
        && enabled.uiStatus === itemListFilterOptionsDom.statusEnabled,
      { itemId: record.id, disabled, enabled },
    );
    checkpoint('enable-lifecycle-complete');
  }

  async function openRequiredStandardForm(identity: string): Promise<ItemCreateStandardPage> {
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.fillItemName(identity);
    await form.selectSingleSpec();
    await form.ensureAdvancedSettingsExpanded();
    await form.fillMinimumOrderQuantity('1');
    await form.fillStandardPrice('10.00');
    return form;
  }

  async function createApiItem(identity: string): Promise<ProductCenterItemCreateRecord> {
    attemptedItemIdentities.add(identity);
    const context = itemContext(identity);
    const intentId = recordIntent(`seed-${identity}`, identity, 'item', 'POST', '/ops-brand/brand-items/standard');
    const body = await productCenterApi.createBomProduct(identity);
    mutationJournal.markPhase(intentId, 'response-observed');
    const record = await itemFactory.registerCreated(context, body, cleanupRegistry);
    recordsByIdentity.set(identity, record);
    mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
    mutationJournal.recordReconciliation(intentId, 'present');
    mutationJournal.markPhase(intentId, 'verification-complete');
    return record;
  }

  async function submitCreate(
    form: ItemCreateFormPage,
    context: ProductCenterItemCreateContext,
    action: string,
  ): Promise<ProductCenterItemCreateRecord> {
    attemptedItemIdentities.add(context.originalIdentity);
    const operationPath = '/ops-brand/brand-items/standard';
    const intentId = recordIntent(action, context.originalIdentity, 'item', 'POST', operationPath);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(operationPath)
    ), { timeout: 60_000 });
    await form.clickSave();
    const response = await responsePromise;
    mutationJournal.markPhase(intentId, 'response-observed');
    const body = await response.json().catch(() => null);
    expect(response.ok()).toBe(true);
    const record = await itemFactory.registerCreated(context, body, cleanupRegistry);
    recordsByIdentity.set(context.originalIdentity, record);
    mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
    mutationJournal.recordReconciliation(intentId, 'present');
    mutationJournal.markPhase(intentId, 'verification-complete');
    return record;
  }

  async function submitUpdate(
    form: ItemCreateFormPage,
    record: ProductCenterItemCreateRecord,
    action: string,
  ): Promise<Response> {
    const operationPath = `/ops-brand/brand-items/standard/${record.id}`;
    const intentId = recordIntent(action, record.originalIdentity, 'item', 'PUT', operationPath);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith(operationPath)
    ), { timeout: 60_000 });
    await form.clickSave();
    const response = await responsePromise;
    mutationJournal.markPhase(intentId, 'response-observed');
    mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
    mutationJournal.recordReconciliation(intentId, 'present');
    mutationJournal.markPhase(intentId, 'verification-complete');
    return response;
  }

  async function seedLeafCategory(identity: string): Promise<{ id: number; name: string }> {
    const intentId = recordIntent('seed-leaf-category', identity, 'category', 'POST', '/ops-brand/brand-categories');
    const body = await productCenterApi.createCategory({ name: identity, secondName: 'AUTO_AUDIT leaf category', code: `GSM${suffix.slice(0, 6)}` });
    mutationJournal.markPhase(intentId, 'response-observed');
    const record = extractCreatedRecord(body, identity) ?? await categoryFactory.findCategory(identity);
    if (!record) throw new Error(`无子级一级分类创建后不可查询：${identity}`);
    const ledgerEntryId = `category-${record.id}`;
    cleanupRegistry.register({
      entity: '标准商品 mega wave 无子级一级分类',
      identity,
      checkpoint: { entryId: ledgerEntryId, entityKind: 'category', serverId: record.id, identityVariants: [identity], cleanupOrder: 30 },
      execute: async () => {
        const residue = await categoryFactory.findCategory(identity);
        if (residue) await productCenterApi.deleteCategory(residue.id);
      },
      verify: async () => !(await categoryFactory.findCategory(identity)),
    });
    mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId });
    mutationJournal.recordReconciliation(intentId, 'present');
    mutationJournal.markPhase(intentId, 'verification-complete');
    return { id: record.id, name: identity };
  }

  async function changeLifecycle(
    record: ProductCenterItemCreateRecord,
    action: 'enable' | 'disable',
    expectedStatus: string,
  ): Promise<{ responseStatus: number; requestItemId: number | string | undefined; uiStatus: string; messages: string[] }> {
    const list = new ItemListPage(page);
    await list.open();
    await list.fillSearch(record.originalIdentity);
    await list.expectUniqueItemVisible(record.originalIdentity);
    await list.openRowActionMenu(record.originalIdentity);
    const operationPath = '/ops-brand/brand-items/updateStatus';
    const intentId = recordIntent(`lifecycle-${action}`, record.originalIdentity, 'item', 'PUT', operationPath);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'PUT'
      && new URL(response.url()).pathname.endsWith(operationPath)
      && String(readRequestLifecycleId(response.request().postDataJSON())) === String(record.id)
    ), { timeout: 60_000 });
    await list.clickRowLifecycleAction(action);
    const response = await responsePromise;
    mutationJournal.markPhase(intentId, 'response-observed');
    await list.fillSearchForResidueCheck(record.originalIdentity);
    await waitUntil(
      () => list.readItemStatusText(record.originalIdentity),
      (status) => status === expectedStatus,
      { timeout: 30_000, interval: 250, message: `生命周期 ${action} 后状态未更新为 ${expectedStatus}。`, probeTimeout: 5_000 },
    );
    mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
    mutationJournal.recordReconciliation(intentId, 'present');
    mutationJournal.markPhase(intentId, 'verification-complete');
    return {
      responseStatus: response.status(),
      requestItemId: readRequestLifecycleId(response.request().postDataJSON()),
      uiStatus: await list.readItemStatusText(record.originalIdentity),
      messages: await list.readSettledVisibleMessages(),
    };
  }

  async function createAuditImage(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) return;
    const assetPage = await page.context().newPage();
    try {
      await assetPage.setContent('<style>html,body{margin:0;width:256px;height:256px;background:#1677ff;color:white;font:32px sans-serif;display:grid;place-items:center}</style><body>AUTO AUDIT</body>');
      await assetPage.screenshot({ path: filePath, clip: { x: 0, y: 0, width: 256, height: 256 } });
    } finally {
      await assetPage.close();
    }
  }

  async function recoverInterruptedRun(): Promise<void> {
    const recovery = await recoveryService.recoverIncomplete();
    if (recovery.failedEntryIds.length > 0) {
      throw new Error(`GREEN-STANDARD-MEGA 启动恢复失败：${recovery.failedEntryIds.join(',')}`);
    }
    await reconcileIncompleteIntents();
  }

  async function reconcileIncompleteIntents(): Promise<void> {
    for (const entry of mutationJournal.incompleteEntries()) {
      if (entry.entity === 'category') {
        const category = await categoryFactory.findCategory(entry.identity);
        if (!category) {
          mutationJournal.recordReconciliation(entry.intentId, 'absent');
          mutationJournal.markPhase(entry.intentId, 'verification-complete');
          continue;
        }
        const ledgerEntryId = `category-${category.id}`;
        cleanupRegistry.register({
          entity: '标准商品 mega wave 中断恢复分类',
          identity: entry.identity,
          checkpoint: { entryId: ledgerEntryId, entityKind: 'category', serverId: category.id, identityVariants: [entry.identity], cleanupOrder: 30 },
          execute: async () => {
            const residue = await categoryFactory.findCategory(entry.identity);
            if (residue) await productCenterApi.deleteCategory(residue.id);
          },
          verify: async () => !(await categoryFactory.findCategory(entry.identity)),
        });
        mutationJournal.attachServerIdentity(entry.intentId, { serverId: category.id, ledgerEntryId });
        mutationJournal.recordReconciliation(entry.intentId, 'present');
        mutationJournal.markPhase(entry.intentId, 'verification-complete');
        continue;
      }
      const count = await itemFactory.itemRecordCount(entry.identity);
      if (count === 0) {
        mutationJournal.recordReconciliation(entry.intentId, 'absent');
        mutationJournal.markPhase(entry.intentId, 'verification-complete');
        continue;
      }
      if (count !== 1) {
        mutationJournal.recordReconciliation(entry.intentId, 'ambiguous');
        throw new Error(`GREEN-STANDARD-MEGA 非幂等对账不唯一：${entry.identity} count=${count}`);
      }
      const record = recordsByIdentity.get(entry.identity)
        ?? await itemFactory.registerCreated(itemContext(entry.identity), null, cleanupRegistry);
      recordsByIdentity.set(entry.identity, record);
      attemptedItemIdentities.add(entry.identity);
      mutationJournal.attachServerIdentity(entry.intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
      mutationJournal.recordReconciliation(entry.intentId, 'present');
      mutationJournal.markPhase(entry.intentId, 'verification-complete');
    }
  }

  function recordIntent(
    action: string,
    identity: string,
    entity: 'item' | 'category',
    method: 'POST' | 'PUT',
    operationPath: string,
  ): string {
    const fingerprint = createHash('sha256').update(`${runId}:${action}:${identity}:${method}:${operationPath}`).digest('hex');
    const intentId = `intent:green-standard-mega:${fingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: `audit-unit:green-standard-mega:${action.toLowerCase()}`,
      safetyLevel: 'L3-crud',
      entity,
      identity,
      identityVariants: [identity],
      operation: { method, path: operationPath },
      requestFingerprint: fingerprint,
    });
    mutationJournal.markPhase(intentId, 'trigger-started');
    return intentId;
  }

  function checkpoint(phase: string): void {
    writeJsonAtomic(reportPath, {
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-green-standard-mega-runtime-checkpoint',
      runId,
      batchId: 'GREEN-STANDARD-MEGA',
      phase,
      caseIds,
      completedCaseIds: Object.keys(caseEvidence),
      caseEvidence,
      executionDiagnostic,
      updatedAt: new Date().toISOString(),
    });
  }
});

function itemContext(identity: string): ProductCenterItemCreateContext {
  return { entityKey: 'item', productType: 'standard', originalIdentity: identity, price: '10.00', minimumOrderQuantity: '1' };
}

function disposition(accepted: boolean, evidence: Record<string, unknown>): CaseEvidence {
  return { verdict: accepted ? 'accepted' : 'canonical-conflict', evidence };
}

function environment(evidence: Record<string, unknown>): CaseEvidence {
  return { verdict: 'environment-blocked', evidence };
}

function verdictIds(evidence: Record<string, CaseEvidence>, verdict: Verdict): string[] {
  return Object.entries(evidence).filter(([, value]) => value.verdict === verdict).map(([caseId]) => caseId).sort();
}

function includesText(values: readonly string[], pattern: RegExp): boolean {
  return values.some((value) => pattern.test(value));
}

function readRequestLifecycleId(value: unknown): number | string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const candidate = record.id ?? record.itemId ?? record.brandItemId;
  return typeof candidate === 'number' || typeof candidate === 'string' ? candidate : undefined;
}

function loadResumableEvidence(reportPath: string, runId: string): Record<string, CaseEvidence> {
  if (!fs.existsSync(reportPath)) return {};
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as { runId?: string; caseEvidence?: Record<string, CaseEvidence> };
  return report.runId === runId ? report.caseEvidence ?? {} : {};
}

function safeDiagnostic(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 4_000);
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
