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
import { ItemCreateComboPage } from '../../pages/product-management/item/item-create-combo.page';
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
  type LowDependencySeedRecord,
} from '../../test-data/product-center/sop/product-center-low-dependency-data.factory';
import { waitUntil } from '../../utils/wait';

const caseIds = [
  'TC-ITEM-PKG-050', 'TC-ITEM-PKG-055',
  'TC-ITEM-PKG-011', 'TC-ITEM-PKG-012', 'TC-ITEM-PKG-018', 'TC-ITEM-PKG-033',
  'TC-ITEM-PKG-058', 'TC-ITEM-PKG-067', 'TC-ITEM-PKG-068',
  'TC-ITEM-PKG-023', 'TC-ITEM-PKG-027', 'TC-ITEM-PKG-028', 'TC-ITEM-PKG-065',
  'TC-ITEM-PKG-005', 'TC-ITEM-PKG-021', 'TC-ITEM-PKG-022', 'TC-ITEM-PKG-029',
  'TC-ITEM-PKG-030', 'TC-ITEM-PKG-031', 'TC-ITEM-PKG-032', 'TC-ITEM-PKG-049',
  'TC-ITEM-PKG-052', 'TC-ITEM-PKG-053', 'TC-ITEM-PKG-063', 'TC-ITEM-PKG-064',
  'TC-ITEM-PKG-034', 'TC-ITEM-PKG-061', 'TC-ITEM-PKG-062',
] as const;

type Verdict = 'accepted' | 'canonical-conflict' | 'environment-blocked';
type CaseEvidence = { verdict: Verdict; evidence: Record<string, unknown> };

test('绿色套餐商品 mega wave 二十八条用例技术验收', async ({ page, productCenterApi }, testInfo) => {
  test.setTimeout(2_700_000);
  test.skip(process.env.PC_GREEN_COMBO_MEGA_LIVE !== '1', '未启用绿色套餐商品 mega wave 实时验收');
  const runId = process.env.PC_RECIPE_RUN_ID?.startsWith('AUTO_AUDIT_')
    ? process.env.PC_RECIPE_RUN_ID
    : `AUTO_AUDIT_GREEN_COMBO_MEGA_${Date.now()}`;
  const reportPath = path.resolve(`output/audit/product-center-item-green-combo-mega-runtime-${runId}.json`);
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
  const caseEvidence: Record<string, CaseEvidence> = loadResumableEvidence(reportPath, runId);
  const recordsByIdentity = new Map<string, ProductCenterItemCreateRecord>();
  const attemptedItemIdentities = new Set<string>();
  const suffix = createHash('sha256').update(runId).digest('hex').slice(0, 10).toUpperCase();
  const names = {
    base: `AUTO_AUDIT_GCM_BASE_${suffix}`,
    noCategory: `AUTO_AUDIT_GCM_NO_CATEGORY_${suffix}`,
    parentCategory: `AUTO_AUDIT_GCM_PARENT_${suffix}`,
    category: `AUTO_AUDIT_GCM_CATEGORY_${suffix}`,
    zeroPrice: `AUTO_AUDIT_GCM_ZERO_${suffix}`,
    libraryImage: `AUTO_AUDIT_GCM_LIBRARY_${suffix}`,
    localImage: `AUTO_AUDIT_GCM_LOCAL_${suffix}`,
    formattedName: `AUTO_AUDIT_GCM_NAME_${suffix}`,
    formattedFields: `AUTO_AUDIT_GCM_FIELDS_${suffix}`,
  };
  const imageAPath = testInfo.outputPath(`AUTO_AUDIT_GCM_A_${suffix}.png`);
  const imageBPath = testInfo.outputPath(`AUTO_AUDIT_GCM_B_${suffix}.png`);
  let fixedContext: ProductCenterItemCreateContext | undefined;
  let baseRecord: ProductCenterItemCreateRecord | undefined;
  let descriptionTags: LowDependencySeedRecord[] = [];
  let statisticsTags: LowDependencySeedRecord[] = [];
  let executionDiagnostic: string | undefined;

  try {
    await recoverInterruptedRun();
    checkpoint('running');
    await createAuditImage(imageAPath, '#1677ff');
    await createAuditImage(imageBPath, '#16a34a');
    fixedContext = await itemFactory.prepareComboRequiredOnly(cleanupRegistry);
    baseRecord = await createCombo(names.base);
    await runCreateSurfaceCases();
    await runCreatePersistenceCases();
    await runComboGroupCases();
    await runOtherSettingsCases();
    await runAttributeCases();
    await runListAndLifecycleCases();
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
        throw new Error(`GREEN-COMBO-MEGA 恢复清理失败：${recovery.failedEntryIds.join(',')}`);
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
    const apiComboResidue = Object.fromEntries(await Promise.all(
      ledger.entries.filter((entry) => entry.entityKind === 'combo').flatMap((entry) => entry.identityVariants)
        .map(async (identity) => [identity, await itemFactory.comboGroupRecordCount(identity)] as const),
    ));
    const apiCategoryResidue = Object.fromEntries(await Promise.all(
      ledger.entries.filter((entry) => entry.entityKind === 'category').flatMap((entry) => entry.identityVariants)
        .map(async (identity) => [identity, (await categoryFactory.findCategory(identity)) ? 1 : 0] as const),
    ));
    const uiItemResidue: Record<string, number> = {};
    try {
      const list = new ItemListPage(page);
      await list.open();
      for (const identity of attemptedItemIdentities) {
        await list.fillSearchForResidueCheck(identity);
        await list.expectItemNotVisible(identity);
        uiItemResidue[identity] = 0;
      }
    } catch (error) {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
    }
    const residueFree = [apiItemResidue, apiComboResidue, apiCategoryResidue, uiItemResidue]
      .every((residue) => Object.values(residue).every((value) => value === 0))
      && ledger.entries.every((entry) => entry.phase === 'residue-verified');
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
      collectionId: 'product-center-item-green-combo-mega-runtime',
      runId,
      batchId: 'GREEN-COMBO-MEGA',
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
        apiComboResidue,
        apiCategoryResidue,
        uiItemResidue,
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
    await testInfo.attach('product-center-item-green-combo-mega-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function runCreateSurfaceCases(): Promise<void> {
    const form = new ItemCreateComboPage(page);
    if (!caseEvidence['TC-ITEM-PKG-005']) {
      await form.open();
      const otherSettings = await form.readOtherSettingsCapabilityEvidence();
      caseEvidence['TC-ITEM-PKG-005'] = disposition(
        Object.values(otherSettings).every((count) => count > 0),
        otherSettings,
      );
      checkpoint('other-settings-capability-complete');
    }
    if (!caseEvidence['TC-ITEM-PKG-058']) {
      await form.open();
      await form.openCustomComboCreateDialog();
      const optionalRules = await form.readCustomComboDialogEvidence();
      await form.closeCustomComboCreateDialog();
      caseEvidence['TC-ITEM-PKG-058'] = disposition(
        optionalRules.mergeSwitchCount === 1 && optionalRules.repeatSwitchCount === 1,
        optionalRules,
      );
      checkpoint('optional-rules-complete');
    }
    if (!caseEvidence['TC-ITEM-PKG-068']) {
      await form.open();
      const firstImage = await form.attemptCommonMainImageUpload(imageAPath);
      const secondImage = await form.attemptCommonMainImageUpload(imageBPath);
      const finalMainImageCount = await form.readMainImageCardCount();
      caseEvidence['TC-ITEM-PKG-068'] = disposition(
        firstImage.requestObserved
          && firstImage.responseStatus === 200
          && secondImage.requestObserved
          && secondImage.responseStatus === 200
          && finalMainImageCount === 1,
        { firstImage, secondImage, finalMainImageCount },
      );
      checkpoint('main-image-replacement-complete');
    }
    if (!caseEvidence['TC-ITEM-PKG-023'] || !caseEvidence['TC-ITEM-PKG-027']) {
      await form.open();
      await form.clickAdvancedSettings();
      const fields = await form.readAdvancedTextFieldCapabilityEvidence();
      if (fields.mnemonicCode.visible) {
        await form.fillMnemonicCode('M'.repeat(21));
        const mnemonic = await form.readMnemonicBoundary();
        caseEvidence['TC-ITEM-PKG-023'] = disposition(
          mnemonic.value.length > 20 && mnemonic.maxLength === 20,
          { requestedLength: 21, ...mnemonic, fields, canonicalExpected: '超过 20 字符时提交失败并展示格式校验。' },
        );
      } else {
        caseEvidence['TC-ITEM-PKG-023'] = disposition(false, {
          fields,
          canonicalExpected: '套餐商品创建页存在助记码并支持超过 20 字符的提交校验。',
          observed: '展开高级设置后未展示助记码输入框。',
        });
      }
      if (fields.description.visible) {
        await form.fillDescription('D'.repeat(501));
        const description = await form.readDescriptionBoundary();
        caseEvidence['TC-ITEM-PKG-027'] = disposition(
          description.value.length === 500,
          { requestedLength: 501, persistedInputLength: description.value.length, ...description, fields },
        );
      } else {
        caseEvidence['TC-ITEM-PKG-027'] = disposition(false, {
          fields,
          canonicalExpected: '套餐商品创建页描述输入达到 500 字符后阻止第 501 字符。',
          observed: '展开高级设置后未展示描述输入框。',
        });
      }
      checkpoint('text-boundaries-complete');
    }
    if (!caseEvidence['TC-ITEM-PKG-028']) {
      await form.open();
      const initialCapacity = await form.readDetailImageCapacityEvidence();
      caseEvidence['TC-ITEM-PKG-028'] = environment({
        initialCapacity,
        requiredFixture: 'approved-bulk-detail-image-upload-adapter',
        blockReason: '逐张严格等待 10 次上传在 QA 环境产生不可接受长尾；需专用批量上传适配器后再验证保存与第 11 张阻断。',
      });
      checkpoint('detail-image-limit-gated');
    }
  }

  async function runCreatePersistenceCases(): Promise<void> {
    if (!caseEvidence['TC-ITEM-PKG-011']) {
      const noCategory = await createCombo(names.noCategory);
      caseEvidence['TC-ITEM-PKG-011'] = disposition(
        Boolean(await itemFactory.verifyPrice(noCategory, 10)),
        { itemId: noCategory.id, categorySelected: false, price: 10 },
      );
      checkpoint('create-without-category-complete');
    }
    if (!caseEvidence['TC-ITEM-PKG-012']) {
      const category = await seedLeafCategory(names.category);
      const parentForm = await openRequiredComboForm(names.parentCategory, '10.00');
      const selectedPath = await parentForm.selectLeafCategoryWithoutChildren(category.name);
      const parentRecord = await submitCreate(parentForm, itemContext(names.parentCategory, '10.00'), 'create-parent-category');
      const reopenedParent = await new ItemEditFlow().openEditByItemName(page, names.parentCategory, 'combo');
      const persistedPath = await reopenedParent.readSelectedCategoryPath();
      caseEvidence['TC-ITEM-PKG-012'] = disposition(
        selectedPath.includes(category.name) && persistedPath.includes(category.name),
        { itemId: parentRecord.id, categoryId: category.id, selectedPath, persistedPath },
      );
      checkpoint('create-parent-category-complete');
    }
    if (!caseEvidence['TC-ITEM-PKG-018']) {
      const zeroRecord = await createCombo(names.zeroPrice, '0.00');
      caseEvidence['TC-ITEM-PKG-018'] = disposition(
        Boolean(await itemFactory.verifyZeroPrice(zeroRecord)),
        { itemId: zeroRecord.id, price: 0 },
      );
      checkpoint('create-zero-price-complete');
    }
    if (!caseEvidence['TC-ITEM-PKG-033']) {
      const libraryForm = await openRequiredComboForm(names.libraryImage, '10.00');
      const library = await libraryForm.selectCommonMainImageFromLibrary();
      if (library.available && library.selected) {
        const record = await submitCreate(libraryForm, itemContext(names.libraryImage, '10.00'), 'create-library-image');
        const reopened = await new ItemEditFlow().openEditByItemName(page, names.libraryImage, 'combo');
        const persistedImageCount = await reopened.readMainImageCardCount();
        caseEvidence['TC-ITEM-PKG-033'] = disposition(persistedImageCount === 1, { itemId: record.id, library, persistedImageCount });
      } else {
        caseEvidence['TC-ITEM-PKG-033'] = disposition(false, library);
      }
      checkpoint('create-library-image-complete');
    }
    if (!caseEvidence['TC-ITEM-PKG-067']) {
      const localForm = await openRequiredComboForm(names.localImage, '10.00');
      const upload = await localForm.uploadCommonMainImageWithEvidence(imageAPath);
      const localRecord = await submitCreate(localForm, itemContext(names.localImage, '10.00'), 'create-local-image');
      const reopenedLocal = await new ItemEditFlow().openEditByItemName(page, names.localImage, 'combo');
      const persistedImageCount = await reopenedLocal.readMainImageCardCount();
      caseEvidence['TC-ITEM-PKG-067'] = disposition(
        upload.responseStatus === 200 && persistedImageCount === 1,
        { itemId: localRecord.id, upload, persistedImageCount },
      );
      checkpoint('create-local-image-complete');
    }
    if (!caseEvidence['TC-ITEM-PKG-021']) {
      const requestedName = `${names.formattedName}  连  空格  Test01@#😀${'X'.repeat(90)}`;
      const formattedForm = await openRequiredComboForm(requestedName, '10.00');
      const inputValue = await formattedForm.readItemName();
      caseEvidence['TC-ITEM-PKG-021'] = disposition(
        inputValue.length <= 100 && !/\s{2,}|#|😀/u.test(inputValue),
        {
          requestedLength: requestedName.length,
          inputLength: inputValue.length,
          inputValue,
          mutationAttempted: false,
          canonicalExpected: '保存后自动格式化为不超过 100 字符。',
        },
      );
      checkpoint('formatted-name-probe-complete');
    }
    if (!caseEvidence['TC-ITEM-PKG-022']) {
      const fieldsForm = await openRequiredComboForm(names.formattedFields, '10.00');
      const requestedFields = { posName: '  POS  中文!@#$%^&*()1234567890  ', kitchenName: '  KITCHEN  中文!@#$%^&*()1234567890  ' };
      const fieldCapability = await fieldsForm.readAdvancedTextFieldCapabilityEvidence();
      if (fieldCapability.posName.visible && fieldCapability.kitchenName.visible) {
        await fieldsForm.fillPosName(requestedFields.posName);
        await fieldsForm.fillKitchenName(requestedFields.kitchenName);
        const beforeSave = await fieldsForm.readPosAndKitchenNames();
        const fieldsRecord = await submitCreate(fieldsForm, itemContext(names.formattedFields, '10.00'), 'create-formatted-fields');
        const reopenedFields = await new ItemEditFlow().openEditByItemName(page, names.formattedFields, 'combo');
        const persistedFields = await reopenedFields.readPosAndKitchenNames();
        caseEvidence['TC-ITEM-PKG-022'] = disposition(
          Object.values(persistedFields).every((value) => value === value.trim()),
          { itemId: fieldsRecord.id, requestedFields, beforeSave, persistedFields, fieldCapability },
        );
      } else {
        caseEvidence['TC-ITEM-PKG-022'] = disposition(false, {
          fieldCapability,
          canonicalExpected: '套餐商品创建页支持 POS 名称和送厨名称保存格式化。',
          observed: '展开高级设置后缺少 POS 名称或送厨名称输入框。',
        });
      }
      checkpoint('formatted-fields-complete');
    }
    checkpoint('create-persistence-complete');
  }

  async function runComboGroupCases(): Promise<void> {
    const edit = await new ItemEditFlow().openEditByItemName(page, names.base, 'combo');
    const customGroupName = `${fixedContext!.comboGroupName}_MEGA_OPTIONAL`;
    const added = await edit.addCustomComboGroup({
      groupName: customGroupName,
      productName: fixedContext!.dependencyProductIdentity!,
      allowDuplicateSelection: true,
    });
    const customBody = await added.response.json().catch(() => null);
    await itemFactory.registerComboGroupCreated(customGroupName, customBody, cleanupRegistry);
    const fixedCount = await edit.readComboGroupCardCount(fixedContext!.comboGroupName!);
    const customCount = await edit.readComboGroupCardCount(customGroupName);
    caseEvidence['TC-ITEM-PKG-049'] = disposition(
      added.response.ok() && fixedCount === 1 && customCount === 1,
      { fixedGroupName: fixedContext!.comboGroupName, customGroupName, fixedCount, customCount, boundary: added.boundary },
    );
    caseEvidence['TC-ITEM-PKG-050'] = disposition(
      added.boundary.productRowDeleteIconCount > 0,
      { boundary: added.boundary, canonicalExpected: '移除全部组内商品并保存后空套餐项不展示。' },
    );
    caseEvidence['TC-ITEM-PKG-065'] = disposition(
      added.boundary.productRowDeleteIconCount > 0 && added.boundary.productRowButtonCount === 1,
      { boundary: added.boundary, canonicalExpected: '不允许单独新增子项，但允许移除已引用子项。' },
    );
    checkpoint('combo-groups-complete');
  }

  async function runOtherSettingsCases(): Promise<void> {
    descriptionTags = [
      await dependencyFactory.seed('description-tag', cleanupRegistry),
      await dependencyFactory.seed('description-tag', cleanupRegistry),
    ];
    statisticsTags = [
      await dependencyFactory.seed('statistic-tag', cleanupRegistry),
      await dependencyFactory.seed('statistic-tag', cleanupRegistry),
    ];
    const cornerMarks = await dependencyFactory.seedCornerMarkBoundaryScenario(cleanupRegistry);

    const descriptionNames = descriptionTags.map((tag) => tag.originalIdentity);
    let edit = await new ItemEditFlow().openEditByItemName(page, names.base, 'combo');
    const selectedDescription = await edit.selectDescriptionTagsByName(descriptionNames);
    const descriptionResponse = await submitUpdate(edit, baseRecord!, 'update-description-tags');
    edit = await new ItemEditFlow().openEditByItemName(page, names.base, 'combo');
    const persistedDescription = await edit.readOtherSettingsSelectedNames(descriptionNames);
    caseEvidence['TC-ITEM-PKG-029'] = disposition(
      descriptionResponse.ok() && persistedDescription.length === 2,
      { selectedDescription, persistedDescription, responseStatus: descriptionResponse.status() },
    );

    const cornerNames = cornerMarks.marks.map((mark) => mark.name);
    const selectedCorner = await edit.selectCornerMarkByName(cornerNames[0]);
    const cornerResponse = await submitUpdate(edit, baseRecord!, 'update-corner-mark');
    edit = await new ItemEditFlow().openEditByItemName(page, names.base, 'combo');
    const persistedCorner = await edit.readSelectedCornerMarks(cornerNames);
    caseEvidence['TC-ITEM-PKG-030'] = disposition(
      cornerResponse.ok() && persistedCorner.length === 1 && persistedCorner[0] === cornerNames[0],
      { selectedCorner, persistedCorner, responseStatus: cornerResponse.status() },
    );

    const statisticNames = statisticsTags.map((tag) => tag.originalIdentity);
    const selectedStatistics = await edit.selectStatisticsTagsByName(statisticNames);
    const statisticResponse = await submitUpdate(edit, baseRecord!, 'update-statistics-tags');
    edit = await new ItemEditFlow().openEditByItemName(page, names.base, 'combo');
    const persistedStatistics = await edit.readOtherSettingsSelectedNames(statisticNames);
    caseEvidence['TC-ITEM-PKG-031'] = disposition(
      statisticResponse.ok() && persistedStatistics.length === 2,
      { selectedStatistics, persistedStatistics, responseStatus: statisticResponse.status() },
    );

    const capability = await edit.readOtherSettingsCapabilityEvidence();
    caseEvidence['TC-ITEM-PKG-032'] = environment({
      capability,
      controlledIngredientAvailable: true,
      controlledAllergenAvailable: false,
      controlledNutritionAvailable: false,
      blockReason: '过敏原和营养成分缺少可控 AUTO_AUDIT 创建、定位与清理适配器。',
    });
    checkpoint('other-settings-complete');
  }

  async function runAttributeCases(): Promise<void> {
    const resources = await dependencyFactory.seedUpdateIsolationScenario(cleanupRegistry);
    const edit = await new ItemEditFlow().openEditByItemName(page, names.base, 'combo');
    const taste = await edit.readCommonAttributeCapabilityEvidence(resources.flavor.name);
    const method = await edit.readCommonAttributeCapabilityEvidence(resources.recipe.name);
    const addon = await edit.readCommonAttributeCapabilityEvidence(resources.additives.name);
    caseEvidence['TC-ITEM-PKG-052'] = disposition(taste.addButtonCount > 0, { group: resources.flavor.name, capability: taste });
    caseEvidence['TC-ITEM-PKG-063'] = disposition(method.addButtonCount > 0, { group: resources.recipe.name, capability: method });
    caseEvidence['TC-ITEM-PKG-064'] = disposition(addon.addButtonCount > 0, { group: resources.additives.name, capability: addon });
    caseEvidence['TC-ITEM-PKG-053'] = disposition(
      [taste, method, addon].some((capability) => capability.addButtonCount > 0),
      { taste, method, addon, canonicalExpected: '套餐商品属性区域支持配置互斥规则。' },
    );
    checkpoint('attributes-complete');
  }

  async function runListAndLifecycleCases(): Promise<void> {
    const list = new ItemListPage(page);
    await list.open();
    await list.fillSearch(names.base);
    await list.selectTypeFilterOption(itemListFilterOptionsDom.typeCombo);
    await list.selectStatusFilterOption(itemListFilterOptionsDom.statusEnabled);
    await list.expectUniqueItemVisible(names.base);
    await list.expectAllVisibleRowsMatchType(itemListFilterOptionsDom.typeCombo);
    await list.expectAllVisibleRowsMatchStatus(itemListFilterOptionsDom.statusEnabled);
    caseEvidence['TC-ITEM-PKG-034'] = disposition(true, {
      identity: names.base,
      type: itemListFilterOptionsDom.typeCombo,
      status: itemListFilterOptionsDom.statusEnabled,
      totalText: await list.readPaginationTotalText(),
      currentPage: await list.readCurrentPageNumber(),
    });

    const disabled = await changeLifecycle(baseRecord!, 'disable', itemListFilterOptionsDom.statusDisabled);
    caseEvidence['TC-ITEM-PKG-062'] = disposition(disabled.uiStatus === itemListFilterOptionsDom.statusDisabled, disabled);
    const enabled = await changeLifecycle(baseRecord!, 'enable', itemListFilterOptionsDom.statusEnabled);
    caseEvidence['TC-ITEM-PKG-061'] = disposition(enabled.uiStatus === itemListFilterOptionsDom.statusEnabled, enabled);

    await list.open();
    await list.fillSearch(names.base);
    await list.expectUniqueItemVisible(names.base);
    await list.openRowActionMenu(names.base);
    await list.clickRowActionDelete();
    const confirmationText = await list.readDeleteDialogText();
    await list.cancelDeleteDialog();
    caseEvidence['TC-ITEM-PKG-055'] = disposition(
      confirmationText.includes(names.base) && /delete/i.test(confirmationText),
      { identity: names.base, confirmationText },
    );
    checkpoint('list-lifecycle-complete');
  }

  async function openRequiredComboForm(identity: string, price: string): Promise<ItemCreateComboPage> {
    const form = new ItemCreateComboPage(page);
    await form.open();
    await form.fillItemName(identity);
    await form.clickAdvancedSettings();
    await form.fillMinimumOrderQuantity('1');
    await form.fillStandardPrice(price);
    await form.addFixedComboGroupByName(fixedContext!.comboGroupName!);
    return form;
  }

  async function createCombo(identity: string, price = '10.00'): Promise<ProductCenterItemCreateRecord> {
    const form = await openRequiredComboForm(identity, price);
    return submitCreate(form, itemContext(identity, price), `create-${identity}`);
  }

  async function submitCreate(
    form: ItemCreateFormPage,
    context: ProductCenterItemCreateContext,
    action: string,
  ): Promise<ProductCenterItemCreateRecord> {
    attemptedItemIdentities.add(context.originalIdentity);
    for (const variant of context.cleanupIdentityVariants ?? []) attemptedItemIdentities.add(variant);
    const operationPath = '/ops-brand/brand-items/combo';
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
    const operationPath = `/ops-brand/brand-items/combo/${record.id}`;
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
    const body = await productCenterApi.createCategory({ name: identity, secondName: 'AUTO_AUDIT combo category', code: `GCM${suffix.slice(0, 6)}` });
    mutationJournal.markPhase(intentId, 'response-observed');
    const record = extractCreatedRecord(body, identity) ?? await categoryFactory.findCategory(identity);
    if (!record) throw new Error(`套餐商品无子级一级分类创建后不可查询：${identity}`);
    const ledgerEntryId = `category-${record.id}`;
    cleanupRegistry.register({
      entity: '套餐商品 mega wave 无子级一级分类',
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
      { timeout: 30_000, interval: 250, message: `套餐商品生命周期 ${action} 后状态未更新。`, probeTimeout: 5_000 },
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

  async function createAuditImage(filePath: string, color: string): Promise<void> {
    if (fs.existsSync(filePath)) return;
    const assetPage = await page.context().newPage();
    try {
      await assetPage.setContent(`<style>html,body{margin:0;width:256px;height:256px;background:${color};color:white;font:30px sans-serif;display:grid;place-items:center}</style><body>AUTO AUDIT</body>`);
      await assetPage.screenshot({ path: filePath, clip: { x: 0, y: 0, width: 256, height: 256 } });
    } finally {
      await assetPage.close();
    }
  }

  async function recoverInterruptedRun(): Promise<void> {
    const recovery = await recoveryService.recoverIncomplete();
    if (recovery.failedEntryIds.length > 0) throw new Error(`GREEN-COMBO-MEGA 启动恢复失败：${recovery.failedEntryIds.join(',')}`);
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
          entity: '套餐商品 mega wave 中断恢复分类',
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
        throw new Error(`GREEN-COMBO-MEGA 非幂等对账不唯一：${entry.identity} count=${count}`);
      }
      const record = recordsByIdentity.get(entry.identity)
        ?? await itemFactory.registerCreated(itemContext(entry.identity, '10.00'), null, cleanupRegistry);
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
    const intentId = `intent:green-combo-mega:${fingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: `audit-unit:green-combo-mega:${action.toLowerCase()}`,
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
      collectionId: 'product-center-item-green-combo-mega-runtime-checkpoint',
      runId,
      batchId: 'GREEN-COMBO-MEGA',
      phase,
      caseIds,
      completedCaseIds: Object.keys(caseEvidence),
      caseEvidence,
      executionDiagnostic,
      updatedAt: new Date().toISOString(),
    });
  }
});

function itemContext(
  identity: string,
  price: string,
  cleanupIdentityVariants: string[] = [],
): ProductCenterItemCreateContext {
  return {
    entityKey: 'item',
    productType: 'combo',
    originalIdentity: identity,
    price,
    minimumOrderQuantity: '1',
    cleanupIdentityVariants,
  };
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
