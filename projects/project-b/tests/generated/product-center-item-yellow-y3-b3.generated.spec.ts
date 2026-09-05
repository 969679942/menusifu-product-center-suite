import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Response } from '@playwright/test';
import { CleanupRegistry } from '../../api/product-center/cleanup-registry';
import { ProductCenterExecutionLedger } from '../../api/product-center/execution-ledger';
import { MutationIntentJournal } from '../../api/product-center/mutation-intent-journal';
import { ProductCenterApiRecoveryAdapter, ProductCenterRecoveryService } from '../../api/product-center/recovery-service';
import { test, expect } from '../../fixtures/product-center.fixture';
import { ItemEditFlow } from '../../flows/item-edit.flow';
import type { ItemCreateFormPage } from '../../pages/product-management/item/item-create-form.page';
import { ItemCreateComboPage } from '../../pages/product-management/item/item-create-combo.page';
import { ItemCreateSidePage } from '../../pages/product-management/item/item-create-side.page';
import { ItemCreateStandardPage } from '../../pages/product-management/item/item-create-standard.page';
import { ItemListPage } from '../../pages/product-management/item/item-list.page';
import {
  ProductCenterItemCreateDataFactory,
  type ProductCenterItemCreateContext,
  type ProductCenterItemCreateRecord,
} from '../../test-data/product-center/product-center-item-create-data.factory';
import {
  ProductCenterLowDependencyDataFactory,
  type CornerMarkBoundarySeed,
  type LowDependencySeedRecord,
} from '../../test-data/product-center/sop/product-center-low-dependency-data.factory';

const caseIds = [
  'TC-ITEM-STD-025',
  'TC-ITEM-STD-026',
  'TC-ITEM-STD-027',
  'TC-ITEM-ADD-033',
  'TC-ITEM-ADD-039',
  'TC-ITEM-ADD-018',
  'TC-ITEM-ADD-019',
  'TC-ITEM-ADD-020',
  'TC-ITEM-ADD-021',
  'TC-ITEM-ADD-045',
  'TC-ITEM-PKG-036',
  'TC-ITEM-PKG-020',
  'TC-ITEM-PKG-042',
  'TC-ITEM-PKG-043',
  'TC-ITEM-UI-003',
] as const;

type Verdict = 'accepted' | 'canonical-conflict' | 'environment-blocked';
type CaseEvidence = { verdict: Verdict; evidence: unknown };

test('Y3-B3 受控数据十五条黄色用例整波技术验收', async ({ page, productCenterApi }, testInfo) => {
  test.setTimeout(1_500_000);
  test.skip(process.env.PC_YELLOW_Y3_B3_LIVE !== '1', '未启用 Y3-B3 认证实时验收');
  const runId = process.env.PC_RECIPE_RUN_ID?.startsWith('AUTO_AUDIT_')
    ? process.env.PC_RECIPE_RUN_ID
    : `AUTO_AUDIT_YELLOW_Y3_B3_${Date.now()}`;
  const reportPath = path.resolve(`output/audit/product-center-item-yellow-y3-b3-runtime-${runId}.json`);
  const executionLedger = new ProductCenterExecutionLedger({
    rootDir: path.resolve('output/checkpoints'),
    runId,
  });
  const cleanupRegistry = new CleanupRegistry(executionLedger);
  const recoveryService = new ProductCenterRecoveryService(
    executionLedger,
    new ProductCenterApiRecoveryAdapter(productCenterApi),
  );
  const mutationJournal = new MutationIntentJournal({ rootDir: path.resolve('output/mutation-intents'), runId });
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const dependencyFactory = new ProductCenterLowDependencyDataFactory(productCenterApi);
  const resumedEvidence = loadResumableEvidence(reportPath, runId);
  const caseEvidence: Record<string, CaseEvidence> = { ...resumedEvidence };
  const recordsByIdentity = new Map<string, ProductCenterItemCreateRecord>();
  const itemIdentities = new Set<string>();
  const timestamp = Date.now();
  const names = {
    sideSettings: `AUTO_AUDIT_Y3_B3_SIDE_SETTINGS_${timestamp}`,
    comboSettings: `AUTO_AUDIT_Y3_B3_COMBO_SETTINGS_${timestamp}`,
    customComboGroup: `AUTO_AUDIT_Y3_B3_CUSTOM_COMBO_${timestamp}`,
    copySource: `AUTO_AUDIT_Y3_B3_COPY_SOURCE_${timestamp}`,
    copyTarget: `AUTO_AUDIT_Y3_B3_COPY_TARGET_${timestamp}`,
  };
  let descriptionTags: LowDependencySeedRecord[] = [];
  let statisticTags: LowDependencySeedRecord[] = [];
  let cornerMarks: CornerMarkBoundarySeed | undefined;
  let comboContext: ProductCenterItemCreateContext | undefined;
  let executionDiagnostic: string | undefined;

  try {
    await recoverInterruptedRun();
    checkpoint('running');
    if (needsAny(['TC-ITEM-STD-025', 'TC-ITEM-STD-026', 'TC-ITEM-STD-027'])) await runIndustryLibraryGate();
    if (needsAny(['TC-ITEM-ADD-033', 'TC-ITEM-ADD-039', 'TC-ITEM-ADD-021'])) await runControlledAdapterGates();
    if (needsAny(['TC-ITEM-ADD-018', 'TC-ITEM-ADD-019', 'TC-ITEM-ADD-020', 'TC-ITEM-ADD-045'])) {
      await runSideOtherSettingsGroup();
    }
    if (needsAny(['TC-ITEM-PKG-042', 'TC-ITEM-PKG-043', 'TC-ITEM-PKG-020', 'TC-ITEM-PKG-036'])) {
      await runComboGroups();
    }
    if (needsAny(['TC-ITEM-UI-003'])) await runCopyPrintStallGroup();
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
        throw new Error(`B3 恢复清理失败：${recovery.failedEntryIds.join(',')}`);
      }
    } catch (error) {
      cleanupDiagnostic = safeDiagnostic(error);
    }
    const auditedIdentities = [...new Set([
      ...itemIdentities,
      ...mutationJournal.snapshot().entries.map((entry) => entry.identity),
    ])];
    const apiItemResidue = Object.fromEntries(await Promise.all(auditedIdentities.map(async (identity) => (
      [identity, await itemFactory.itemRecordCount(identity)] as const
    ))));
    const uiItemResidue: Record<string, number> = {};
    const lateUiResidueDeleted: Record<string, number[]> = {};
    try {
      const list = new ItemListPage(page);
      await list.open();
      for (const identity of auditedIdentities) {
        await list.fillSearchForResidueCheck(identity);
        const visibleServerIds = await list.readItemServerIds(identity);
        if (visibleServerIds.length > 0) {
          if (!identity.startsWith('AUTO_AUDIT_')) throw new Error(`禁止补清理非审计商品：${identity}`);
          lateUiResidueDeleted[identity] = visibleServerIds;
          for (const serverId of visibleServerIds) {
            const intentId = recordIntent(`cleanup-late-ui-${serverId}`, identity, 'DELETE', '/ops-brand/brand-items/delete');
            await productCenterApi.deleteBomProduct(serverId);
            mutationJournal.markPhase(intentId, 'response-observed');
            mutationJournal.attachServerIdentity(intentId, { serverId });
            mutationJournal.recordReconciliation(intentId, 'absent');
            mutationJournal.markPhase(intentId, 'verification-complete');
          }
          await list.open();
          await list.fillSearchForResidueCheck(identity);
        }
        await list.expectItemNotVisible(identity);
        uiItemResidue[identity] = 0;
      }
    } catch (error) {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
    }
    const ledger = executionLedger.snapshot();
    const residueFree = Object.values(apiItemResidue).every((value) => value === 0)
      && Object.values(uiItemResidue).every((value) => value === 0)
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
        ? 'accepted-with-blocks'
        : 'accepted'
      : 'incomplete';
    const report = {
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-yellow-y3-b3-runtime',
      runId,
      batchId: 'Y3-B3',
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
        uiItemResidue,
        lateUiResidueDeleted,
        residueFree,
        ledgerEntries: ledger.entries.length,
        residueVerified: ledger.entries.filter((entry) => entry.phase === 'residue-verified').length,
        cleanupDiagnostic,
      },
      executionDiagnostic,
      resumedCaseIds: Object.keys(resumedEvidence).sort(),
      mutationIntents: mutationJournal.snapshot().entries.map((entry) => ({
        intentId: entry.intentId,
        identity: entry.identity,
        phase: entry.phase,
        reconciliation: entry.reconciliation,
        operation: entry.operation,
        serverId: entry.serverId,
        ledgerEntryId: entry.ledgerEntryId,
      })),
      security: { credentialsPersisted: false, authorizationArtifactsPersisted: false, storageStatePersisted: false },
    };
    writeJsonAtomic(reportPath, report);
    await testInfo.attach('product-center-item-yellow-y3-b3-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function runIndustryLibraryGate(): Promise<void> {
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.clickAdvancedSettings();
    const evidence = {
      route: new URL(page.url()).pathname,
      industryGoodsFieldObserved: true,
      industryGoodsDisabled: await form.isIndustryGoodsDisabled(),
      controlledFixtureAdapter: false,
      blockReason: '当前可控接口只能创建品牌商品，不能创建行业商品库单规格、多规格及三规格样本。',
    };
    caseEvidence['TC-ITEM-STD-025'] = blocked({ ...evidence, requiredFixture: 'industry-library-single-spec-item' });
    caseEvidence['TC-ITEM-STD-026'] = blocked({ ...evidence, requiredFixture: 'industry-library-multi-spec-item' });
    caseEvidence['TC-ITEM-STD-027'] = blocked({ ...evidence, requiredFixture: 'industry-library-three-spec-item' });
    checkpoint('industry-library-gate-complete');
  }

  async function runControlledAdapterGates(): Promise<void> {
    const form = new ItemCreateSidePage(page);
    await form.open();
    const capability = await form.readOtherSettingsCapabilityEvidence();
    caseEvidence['TC-ITEM-ADD-033'] = blocked({
      requiredFixture: 'temporary-side-item + add-on-group create-page search',
      controlledFixtureApiAvailable: true,
      stableCreatePageSelectionContractAvailable: false,
      blockReason: '加料组新增页尚无唯一选择器合同，禁止使用候选选择器猜测商品行。',
    });
    caseEvidence['TC-ITEM-ADD-039'] = blocked({
      requiredFixture: 'brand-image-library-image',
      controlledBrandImageLifecycleAvailable: true,
      stableItemLibrarySelectionContractAvailable: false,
      blockReason: '品牌图库可控创建已存在，但商品表单图库弹窗尚未形成按图片身份唯一选择的合同。',
    });
    caseEvidence['TC-ITEM-ADD-021'] = blocked({
      requiredFixture: ['ingredient', 'allergen', 'nutrition'],
      capability,
      controlledIngredientAvailable: true,
      controlledAllergenAvailable: false,
      controlledNutritionAvailable: false,
      blockReason: '原料可创建，但过敏原与营养成分没有可控 AUTO_AUDIT 创建/清理接口，不能选择非审计共享数据。',
    });
    checkpoint('controlled-adapter-gates-complete');
  }

  async function runSideOtherSettingsGroup(): Promise<void> {
    descriptionTags = [
      await dependencyFactory.seed('description-tag', cleanupRegistry),
      await dependencyFactory.seed('description-tag', cleanupRegistry),
    ];
    statisticTags = [
      await dependencyFactory.seed('statistic-tag', cleanupRegistry),
      await dependencyFactory.seed('statistic-tag', cleanupRegistry),
    ];
    cornerMarks = await dependencyFactory.seedCornerMarkBoundaryScenario(cleanupRegistry);
    const descriptionNames = descriptionTags.map((record) => record.originalIdentity);
    const statisticNames = statisticTags.map((record) => record.originalIdentity);
    const cornerNames = cornerMarks.marks.map((mark) => mark.name);
    const form = new ItemCreateSidePage(page);
    await form.open();
    await form.fillItemName(names.sideSettings);
    await form.fillStandardPrice('10.00');
    const selectedDescriptions = await form.selectDescriptionTagsByName(descriptionNames);
    const selectedStatistics = await form.selectStatisticsTagsByName(statisticNames);
    await form.selectCornerMarkByName(cornerNames[0]);
    const record = await submitCreate(form, itemContext(names.sideSettings, 'side'), '/ops-brand/brand-items/standard');
    const reopened = await new ItemEditFlow().openEditByItemName(page, names.sideSettings, 'side');
    await reopened.ensureOtherSettingsExpanded();
    const persistedDescriptions = await reopened.readOtherSettingsSelectedNames(descriptionNames);
    const persistedStatistics = await reopened.readOtherSettingsSelectedNames(statisticNames);
    const persistedCornerA = await reopened.readSelectedCornerMarks(cornerNames);
    caseEvidence['TC-ITEM-ADD-018'] = disposition(
      persistedDescriptions.length === 2 && descriptionNames.every((name) => persistedDescriptions.includes(name)),
      { itemId: record.id, selectedDescriptions, persistedDescriptions },
    );
    caseEvidence['TC-ITEM-ADD-019'] = disposition(
      persistedCornerA.length === 1 && persistedCornerA[0] === cornerNames[0],
      { itemId: record.id, persistedCornerA },
    );
    caseEvidence['TC-ITEM-ADD-020'] = disposition(
      persistedStatistics.length === 2 && statisticNames.every((name) => persistedStatistics.includes(name)),
      { itemId: record.id, selectedStatistics, persistedStatistics },
    );

    await reopened.selectCornerMarkByName(cornerNames[1]);
    await submitUpdate(reopened, record, names.sideSettings, 'side');
    const finalEdit = await new ItemEditFlow().openEditByItemName(page, names.sideSettings, 'side');
    await finalEdit.ensureOtherSettingsExpanded();
    const finalCorners = await finalEdit.readSelectedCornerMarks(cornerNames);
    caseEvidence['TC-ITEM-ADD-045'] = disposition(
      finalCorners.length === 1 && finalCorners[0] === cornerNames[1],
      { itemId: record.id, firstSelection: persistedCornerA, finalSelection: finalCorners },
    );
    checkpoint('side-other-settings-complete');
  }

  async function runComboGroups(): Promise<void> {
    comboContext = await itemFactory.prepareComboRequiredOnly(cleanupRegistry, timestamp + 100);
    const dependencyEntry = executionLedger.snapshot().entries.find((entry) => (
      entry.entityKind === 'bom-product' && entry.identity === comboContext!.dependencyProductIdentity
    ));
    if (!dependencyEntry || typeof dependencyEntry.serverId !== 'number') {
      throw new Error('Y3-B3 套餐依赖商品未在创建后立即登记服务端 ID');
    }
    const dependencyProductId = dependencyEntry.serverId;
    const dependencyDetail = await productCenterApi.productDetail(dependencyProductId);
    const skuId = readFirstSkuId(dependencyDetail);
    if (skuId === undefined) throw new Error('Y3-B3 可选套餐组依赖商品缺少 SKU ID');
    const customResponse = await productCenterApi.createComboGroup({
      name: names.customComboGroup,
      itemId: dependencyProductId,
      skuId,
      sectionType: 2,
    });
    await itemFactory.registerComboGroupCreated(names.customComboGroup, customResponse, cleanupRegistry);

    const fixedProbe = new ItemCreateComboPage(page);
    await fixedProbe.open();
    const fixedEvidence = await fixedProbe.probeExistingComboGroupSelection({
      comboType: 'fixed',
      groupName: comboContext.comboGroupName!,
    });
    caseEvidence['TC-ITEM-PKG-042'] = disposition(
      fixedEvidence.confirmEnabledAfterSelection && fixedEvidence.confirmDisabledAfterRemoval,
      fixedEvidence,
    );

    const customProbe = new ItemCreateComboPage(page);
    await customProbe.open();
    const customEvidence = await customProbe.probeExistingComboGroupSelection({
      comboType: 'custom',
      groupName: names.customComboGroup,
    });
    caseEvidence['TC-ITEM-PKG-043'] = disposition(
      customEvidence.confirmEnabledAfterSelection && customEvidence.confirmDisabledAfterRemoval,
      customEvidence,
    );

    if (descriptionTags.length === 0) {
      descriptionTags = [
        await dependencyFactory.seed('description-tag', cleanupRegistry),
        await dependencyFactory.seed('description-tag', cleanupRegistry),
      ];
    }
    if (statisticTags.length === 0) {
      statisticTags = [
        await dependencyFactory.seed('statistic-tag', cleanupRegistry),
        await dependencyFactory.seed('statistic-tag', cleanupRegistry),
      ];
    }
    if (!cornerMarks) cornerMarks = await dependencyFactory.seedCornerMarkBoundaryScenario(cleanupRegistry);
    const detailImageA = testInfo.outputPath('AUTO_AUDIT_Y3_B3_COMBO_DETAIL_A.png');
    const detailImageB = testInfo.outputPath('AUTO_AUDIT_Y3_B3_COMBO_DETAIL_B.png');
    await page.screenshot({ path: detailImageA, clip: { x: 0, y: 0, width: 256, height: 256 } });
    await page.screenshot({ path: detailImageB, clip: { x: 260, y: 0, width: 256, height: 256 } });
    const descriptionNames = descriptionTags.map((record) => record.originalIdentity);
    const statisticNames = statisticTags.map((record) => record.originalIdentity);
    const cornerName = cornerMarks.marks[0].name;
    const form = new ItemCreateComboPage(page);
    await form.open();
    await form.fillItemName(names.comboSettings);
    await form.clickAdvancedSettings();
    await form.fillMinimumOrderQuantity('1');
    await form.addFixedComboGroupByName(comboContext.comboGroupName!);
    await form.fillStandardPrice('10.00');
    await form.fillPackagingFee('1.00');
    const packagingFeeBeforeSave = await form.readPackagingFee();
    const detailUploadA = await form.uploadDetailImage(detailImageA);
    const detailUploadB = await form.uploadDetailImage(detailImageB);
    await form.selectDescriptionTagsByName(descriptionNames);
    await form.selectStatisticsTagsByName(statisticNames);
    await form.selectCornerMarkByName(cornerName);
    const record = await submitCreate(
      form,
      { ...itemContext(names.comboSettings, 'combo'), comboGroupName: comboContext.comboGroupName },
      '/ops-brand/brand-items/combo',
    );
    const reopened = await new ItemEditFlow().openEditByItemName(page, names.comboSettings, 'combo');
    await reopened.ensureOtherSettingsExpanded();
    const packagingFee = reopened instanceof ItemCreateComboPage ? await reopened.readPackagingFee() : '';
    const detailImageCount = await reopened.readDetailImageCardCount();
    const persistedDescriptions = await reopened.readOtherSettingsSelectedNames(descriptionNames);
    const persistedStatistics = await reopened.readOtherSettingsSelectedNames(statisticNames);
    const persistedCorners = await reopened.readSelectedCornerMarks([cornerName]);
    caseEvidence['TC-ITEM-PKG-020'] = disposition(
      Number(packagingFeeBeforeSave) === 1 && Number(packagingFee) === 1,
      { itemId: record.id, packagingFeeBeforeSave, packagingFee },
    );
    caseEvidence['TC-ITEM-PKG-036'] = disposition(
      detailImageCount >= 2
        && persistedDescriptions.length === 2
        && persistedStatistics.length === 2
        && persistedCorners.length === 1,
      {
        itemId: record.id,
        detailUploadA,
        detailUploadB,
        detailImageCount,
        persistedDescriptions,
        persistedStatistics,
        persistedCorners,
      },
    );
    checkpoint('combo-groups-complete');
  }

  async function runCopyPrintStallGroup(): Promise<void> {
    const printStall = await dependencyFactory.seed('print-stall', cleanupRegistry);
    const sourceForm = new ItemCreateStandardPage(page);
    await sourceForm.open();
    await sourceForm.fillItemName(names.copySource);
    await sourceForm.selectSingleSpec();
    await sourceForm.fillStandardPrice('10.00');
    await sourceForm.selectPrintStallByName(printStall.originalIdentity);
    const source = await submitCreate(sourceForm, itemContext(names.copySource, 'standard'), '/ops-brand/brand-items/standard');
    const list = new ItemListPage(page);
    await list.open();
    await list.fillSearch(names.copySource);
    await list.expectUniqueItemVisible(names.copySource);
    await list.openRowActionMenu(names.copySource);
    await list.clickRowActionCopy();
    const enteredCopyCreate = await page.waitForURL((url) => url.pathname === '/pp/brand/create/standard', {
      timeout: 10_000,
    }).then(() => true).catch(() => false);
    if (!enteredCopyCreate) {
      caseEvidence['TC-ITEM-UI-003'] = disposition(false, {
        sourceItemId: source.id,
        routeAfterCopy: new URL(page.url()).pathname,
        visibleMessages: await list.readVisibleMessages(),
        targetRecordCount: await itemFactory.itemRecordCount(names.copyTarget),
        canonicalExpected: '点击复制后进入新增商品编辑状态，并继承打印档口。',
        observed: '点击真实复制菜单后仍停留商品列表，未进入标准商品创建页。',
      });
      checkpoint('copy-print-stall-conflict-complete');
      return;
    }
    const copiedForm = new ItemCreateStandardPage(page);
    await copiedForm.expectLoaded();
    const sourceNameInCopy = await copiedForm.readItemName();
    const copiedPrintStallCount = await copiedForm.readSelectedPrintStallCount();
    await copiedForm.fillItemName(names.copyTarget);
    const copied = await submitCreate(
      copiedForm,
      { ...itemContext(names.copyTarget, 'standard'), cleanupIdentityVariants: [names.copySource] },
      '/ops-brand/brand-items/standard',
    );
    const detail = await productCenterApi.productDetail(copied.id);
    const relationPersisted = containsIdentityOrId(detail, printStall.originalIdentity, printStall.id);
    caseEvidence['TC-ITEM-UI-003'] = disposition(
      sourceNameInCopy.length > 0 && copiedPrintStallCount === 1 && relationPersisted,
      {
        sourceItemId: source.id,
        copiedItemId: copied.id,
        sourceNameInCopy,
        copiedPrintStallCount,
        printStallId: printStall.id,
        relationPersisted,
      },
    );
    checkpoint('copy-print-stall-complete');
  }

  async function submitCreate(
    form: ItemCreateFormPage,
    context: ProductCenterItemCreateContext,
    operationPath: string,
  ): Promise<ProductCenterItemCreateRecord> {
    itemIdentities.add(context.originalIdentity);
    const intentId = recordIntent(`create-${context.originalIdentity}`, context.originalIdentity, 'POST', operationPath);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(operationPath)
    ), { timeout: 60_000 });
    await form.clickSave();
    const response = await responsePromise;
    mutationJournal.markPhase(intentId, 'response-observed');
    const body = await response.json().catch(() => null);
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
    identity: string,
    productType: 'standard' | 'side' | 'combo',
  ): Promise<Response> {
    const apiType = productType === 'side' ? 'standard' : productType;
    const operationPath = `/ops-brand/brand-items/${apiType}/${record.id}`;
    const intentId = recordIntent(`update-${identity}`, identity, 'PUT', operationPath);
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

  async function recoverInterruptedRun(): Promise<void> {
    const recovery = await recoveryService.recoverIncomplete();
    if (recovery.failedEntryIds.length > 0) {
      throw new Error(`Y3-B3 启动恢复失败：${recovery.failedEntryIds.join(',')}`);
    }
    await reconcileIncompleteIntents();
  }

  async function reconcileIncompleteIntents(): Promise<void> {
    for (const entry of mutationJournal.incompleteEntries()) {
      const count = await itemFactory.itemRecordCount(entry.identity);
      if (count === 0) {
        mutationJournal.recordReconciliation(entry.intentId, 'absent');
        mutationJournal.markPhase(entry.intentId, 'verification-complete');
        continue;
      }
      if (count !== 1) {
        mutationJournal.recordReconciliation(entry.intentId, 'ambiguous');
        throw new Error(`Y3-B3 非幂等对账不唯一：${entry.identity} count=${count}`);
      }
      const productType = entry.identity.includes('_SIDE_') ? 'side'
        : entry.identity.includes('_COMBO_') ? 'combo' : 'standard';
      const record = recordsByIdentity.get(entry.identity)
        ?? await itemFactory.registerCreated(itemContext(entry.identity, productType), null, cleanupRegistry);
      recordsByIdentity.set(entry.identity, record);
      itemIdentities.add(entry.identity);
      mutationJournal.attachServerIdentity(entry.intentId, {
        serverId: record.id,
        ledgerEntryId: record.checkpointEntryId,
      });
      mutationJournal.recordReconciliation(entry.intentId, 'present');
      mutationJournal.markPhase(entry.intentId, 'verification-complete');
    }
  }

  function recordIntent(action: string, identity: string, method: 'POST' | 'PUT' | 'DELETE', operationPath: string): string {
    const fingerprint = createHash('sha256').update(`${runId}:${action}:${identity}:${method}:${operationPath}`).digest('hex');
    const intentId = `intent:yellow-y3-b3:${fingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: `audit-unit:yellow-y3-b3:${action}`,
      safetyLevel: 'L3-crud',
      entity: 'item',
      identity,
      identityVariants: [identity],
      operation: { method, path: operationPath },
      requestFingerprint: fingerprint,
    });
    mutationJournal.markPhase(intentId, 'trigger-started');
    return intentId;
  }

  function needsAny(ids: readonly string[]): boolean {
    return ids.some((caseId) => !caseEvidence[caseId]);
  }

  function checkpoint(phase: string): void {
    writeJsonAtomic(reportPath, {
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-yellow-y3-b3-runtime-checkpoint',
      runId,
      batchId: 'Y3-B3',
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
  productType: 'standard' | 'side' | 'combo',
): ProductCenterItemCreateContext {
  return {
    entityKey: 'item',
    productType,
    originalIdentity: identity,
    price: '10.00',
    minimumOrderQuantity: '1',
  };
}

function disposition(accepted: boolean, evidence: unknown): CaseEvidence {
  return { verdict: accepted ? 'accepted' : 'canonical-conflict', evidence };
}

function blocked(evidence: unknown): CaseEvidence {
  return { verdict: 'environment-blocked', evidence };
}

function verdictIds(evidence: Record<string, CaseEvidence>, verdict: Verdict): string[] {
  return Object.entries(evidence)
    .filter(([, value]) => value.verdict === verdict)
    .map(([caseId]) => caseId)
    .sort();
}

function loadResumableEvidence(reportPath: string, runId: string): Record<string, CaseEvidence> {
  if (!fs.existsSync(reportPath)) return {};
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    runId?: string;
    caseEvidence?: Record<string, CaseEvidence>;
  };
  return report.runId === runId ? report.caseEvidence ?? {} : {};
}

function readFirstSkuId(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = readFirstSkuId(item);
      if (match !== undefined) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.skuList)) {
    const sku = record.skuList.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined;
    if (typeof sku?.id === 'number') return sku.id;
  }
  for (const child of Object.values(record)) {
    const match = readFirstSkuId(child);
    if (match !== undefined) return match;
  }
  return undefined;
}

function containsIdentityOrId(value: unknown, identity: string, id: number): boolean {
  if (typeof value === 'string') return value === identity;
  if (Array.isArray(value)) return value.some((item) => containsIdentityOrId(item, identity, id));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (Object.values(record).some((item) => item === identity)) return true;
  if (String(record.printStallId ?? '') === String(id)) return true;
  return Object.values(record).some((item) => containsIdentityOrId(item, identity, id));
}

function safeDiagnostic(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/(authorization|cookie|token|password)\s*[:=]\s*[^\s,;]+/giu, '$1=[REDACTED]')
    .slice(0, 2_000);
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
