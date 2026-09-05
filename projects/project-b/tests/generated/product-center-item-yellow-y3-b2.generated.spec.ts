import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Response } from '@playwright/test';
import { MutationIntentJournal } from '../../api/product-center/mutation-intent-journal';
import { test, expect } from '../../fixtures/product-center.fixture';
import { ItemEditFlow } from '../../flows/item-edit.flow';
import type { ItemCreateFormPage } from '../../pages/product-management/item/item-create-form.page';
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
  type LowDependencySeedRecord,
} from '../../test-data/product-center/sop/product-center-low-dependency-data.factory';
import { waitUntil } from '../../utils/wait';

const caseIds = [
  'TC-ITEM-STD-019',
  'TC-ITEM-STD-084',
  'TC-ITEM-STD-085',
  'TC-ITEM-STD-086',
  'TC-ITEM-ADD-025',
  'TC-ITEM-ADD-007',
  'TC-ITEM-ADD-009',
  'TC-ITEM-ADD-022',
  'TC-ITEM-ADD-011',
  'TC-ITEM-ADD-049',
  'TC-ITEM-ADD-038',
] as const;

type Verdict = 'accepted' | 'canonical-conflict';
type CaseEvidence = { verdict: Verdict; evidence: unknown };

test('Y3-B2 六组十一条适配器黄色用例整波技术验收', async ({
  page,
  productCenterApi,
  cleanupRegistry,
  executionLedger,
}, testInfo) => {
  test.setTimeout(1_500_000);
  test.skip(process.env.PC_YELLOW_Y3_B2_LIVE !== '1', '未启用 Y3-B2 认证实时验收');
  const runId = process.env.PC_RECIPE_RUN_ID?.startsWith('AUTO_AUDIT_')
    ? process.env.PC_RECIPE_RUN_ID
    : `AUTO_AUDIT_YELLOW_Y3_B2_${Date.now()}`;
  const reportPath = path.resolve(`output/audit/product-center-item-yellow-y3-b2-runtime-${runId}.json`);
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const dependencyFactory = new ProductCenterLowDependencyDataFactory(productCenterApi);
  const mutationJournal = new MutationIntentJournal({ rootDir: path.resolve('output/mutation-intents'), runId });
  const resumedEvidence = loadResumableEvidence(reportPath, runId);
  const caseEvidence: Record<string, CaseEvidence> = {};
  const dependencyRecords: LowDependencySeedRecord[] = [];
  const recordsByIdentity = new Map<string, ProductCenterItemCreateRecord>();
  const intentIds: string[] = [];
  let executionDiagnostic: string | undefined;
  const timestamp = Date.now();
  const names = {
    weightG: `AUTO_AUDIT_Y3_B2_WEIGHT_G_${timestamp}`,
    weightKg: `AUTO_AUDIT_Y3_B2_WEIGHT_KG_${timestamp}`,
    weightMl: `AUTO_AUDIT_Y3_B2_WEIGHT_ML_${timestamp}`,
    multiSpec: `AUTO_AUDIT_Y3_B2_MULTI_SPEC_${timestamp}`,
    flavorRemoval: `AUTO_AUDIT_Y3_B2_FLAVOR_REMOVE_${timestamp}`,
    sideOther: `AUTO_AUDIT_Y3_B2_SIDE_OTHER_${timestamp}`,
    sideNoCategory: `AUTO_AUDIT_Y3_B2_SIDE_NO_CATEGORY_${timestamp}`,
    sideZero: `AUTO_AUDIT_Y3_B2_SIDE_ZERO_${timestamp}`,
    sideUpload: `AUTO_AUDIT_Y3_B2_SIDE_UPLOAD_${timestamp}`,
    sidePackage: `AUTO_AUDIT_Y3_B2_SIDE_PACKAGE_${timestamp}`,
    sideCost: `AUTO_AUDIT_Y3_B2_SIDE_COST_${timestamp}`,
    sideReplace: `AUTO_AUDIT_Y3_B2_SIDE_REPLACE_${timestamp}`,
  };
  const sideUploadImagePath = testInfo.outputPath('AUTO_AUDIT_Y3_B2_SIDE_UPLOAD.png');
  const replaceFirstImagePath = testInfo.outputPath('AUTO_AUDIT_Y3_B2_REPLACE_A.png');
  const replaceSecondImagePath = testInfo.outputPath('AUTO_AUDIT_Y3_B2_REPLACE_B.png');
  const detailImagePath = testInfo.outputPath('AUTO_AUDIT_Y3_B2_DETAIL.png');

  try {
    await recoverInterruptedRun();
    Object.assign(caseEvidence, resumedEvidence);
    invalidateReprobeGroup(caseEvidence, process.env.PC_YELLOW_Y3_B2_REPROBE_CASE_IDS);
    checkpoint('running');
    if (needsAny(['TC-ITEM-STD-019', 'TC-ITEM-STD-084'])) await runWeightedUnitGroup();
    if (needsAny(['TC-ITEM-STD-085'])) await runMultiSpecOrderGroup();
    if (needsAny(['TC-ITEM-STD-086'])) await runFlavorRemovalGroup();
    if (needsAny(['TC-ITEM-ADD-007', 'TC-ITEM-ADD-009', 'TC-ITEM-ADD-022'])) await runSideCreateGroup();
    if (needsAny(['TC-ITEM-ADD-011', 'TC-ITEM-ADD-049'])) await runSidePriceGroup();
    if (needsAny(['TC-ITEM-ADD-038'])) await runSideMainImageGroup();
    if (needsAny(['TC-ITEM-ADD-025'])) await runSideOtherSettingsGroup();
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
    } catch (error) {
      cleanupDiagnostic = safeDiagnostic(error);
    }
    const journal = mutationJournal.snapshot();
    const auditedIdentities = [...new Set(journal.entries.map((entry) => entry.identity))];
    const apiItemResidue = Object.fromEntries(await Promise.all(auditedIdentities.map(async (identity) => (
      [identity, await itemFactory.itemRecordCount(identity)] as const
    ))));
    const uiItemResidue: Record<string, number> = {};
    try {
      const listPage = new ItemListPage(page);
      await listPage.open();
      for (const identity of auditedIdentities) {
        await listPage.fillSearchForResidueCheck(identity);
        await listPage.expectEmptySearchResults();
        uiItemResidue[identity] = 0;
      }
    } catch (error) {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
    }
    const dependencyResidue = Object.fromEntries(await Promise.all(dependencyRecords.map(async (record) => (
      [record.originalIdentity, await dependencyFactory.find(record.entityKey, record.originalIdentity) ? 1 : 0] as const
    ))));
    const ledger = executionLedger.snapshot();
    const residueFree = allZero(apiItemResidue)
      && allZero(uiItemResidue)
      && allZero(dependencyResidue)
      && ledger.entries.every((entry) => entry.phase === 'residue-verified');
    if (residueFree && !cleanupDiagnostic) {
      for (const entry of mutationJournal.snapshot().entries) mutationJournal.markPhase(entry.intentId, 'cleanup-complete');
    }
    const acceptedCaseIds = Object.entries(caseEvidence)
      .filter(([, value]) => value.verdict === 'accepted')
      .map(([caseId]) => caseId)
      .sort();
    const canonicalConflictCaseIds = Object.entries(caseEvidence)
      .filter(([, value]) => value.verdict === 'canonical-conflict')
      .map(([caseId]) => caseId)
      .sort();
    const complete = Object.keys(caseEvidence).length === caseIds.length;
    const status = complete && residueFree && !executionDiagnostic && !cleanupDiagnostic
      ? canonicalConflictCaseIds.length > 0 ? 'accepted-with-canonical-conflicts' : 'accepted'
      : 'incomplete';
    const report = {
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-yellow-y3-b2-runtime',
      runId,
      batchId: 'Y3-B2',
      executionMode: 'wave-shared-chain',
      evidenceInheritanceAllowed: false,
      caseLevelRunsClaimed: 0,
      status,
      caseIds,
      acceptedCaseIds,
      canonicalConflictCaseIds,
      caseEvidence,
      summary: {
        total: caseIds.length,
        accepted: acceptedCaseIds.length,
        canonicalConflicts: canonicalConflictCaseIds.length,
        executorErrors: executionDiagnostic ? 1 : 0,
      },
      cleanupEvidence: {
        apiItemResidue,
        uiItemResidue,
        dependencyResidue,
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
    await testInfo.attach('product-center-item-yellow-y3-b2-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function runWeightedUnitGroup(): Promise<void> {
    const probe = new ItemCreateStandardPage(page);
    await probe.open();
    await probe.selectSingleSpec();
    await probe.enableWeightBasedItem();
    const options = await probe.readWeightUnitOptions();
    caseEvidence['TC-ITEM-STD-019'] = disposition(
      options.length === 3 && ['g', 'kg', 'ml'].every((unit) => options.includes(unit)),
      { options },
    );

    const unitResults: Array<{ unit: 'g' | 'kg' | 'ml'; itemId: number; reopenedUnit: string }> = [];
    for (const [unit, identity] of [
      ['g', names.weightG],
      ['kg', names.weightKg],
      ['ml', names.weightMl],
    ] as const) {
      const form = new ItemCreateStandardPage(page);
      await form.open();
      await form.fillItemName(identity);
      await form.selectSingleSpec();
      await form.enableWeightBasedItem();
      await form.selectWeightUnit(unit);
      await form.fillStandardPrice('10.00');
      const record = await submitCreate(form, itemContext(identity, 'standard'), '/ops-brand/brand-items/standard');
      const reopened = await new ItemEditFlow().openEditByItemName(page, identity, 'standard');
      unitResults.push({ unit, itemId: record.id, reopenedUnit: await reopened.readUnitValue() });
    }
    caseEvidence['TC-ITEM-STD-084'] = disposition(
      unitResults.every((result) => result.unit === result.reopenedUnit),
      { unitResults },
    );
    checkpoint('weighted-unit-complete');
  }

  async function runMultiSpecOrderGroup(): Promise<void> {
    const optionNames = [`AUTO_AUDIT_SPEC_A_${timestamp}`, `AUTO_AUDIT_SPEC_B_${timestamp}`, `AUTO_AUDIT_SPEC_C_${timestamp}`];
    const spec = await dependencyFactory.seedSpecWithOptions(cleanupRegistry, optionNames);
    dependencyRecords.push(spec);
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.fillItemName(names.multiSpec);
    await form.selectMultiSpec();
    await form.selectSpecGroupByName(spec.originalIdentity);
    await form.fillAllMultiSpecPrices('10.00');
    const beforeOrder = await form.readMultiSpecOrder(optionNames);
    await form.moveMultiSpecOption(optionNames[2], optionNames[0]);
    const afterOrder = await form.readMultiSpecOrder(optionNames);
    const record = await submitCreate(form, itemContext(names.multiSpec, 'standard'), '/ops-brand/brand-items/standard');
    const reopened = await new ItemEditFlow().openEditByItemName(page, names.multiSpec, 'standard');
    const persistedOrder = await reopened.readMultiSpecOrder(optionNames);
    caseEvidence['TC-ITEM-STD-085'] = disposition(
      beforeOrder.length === 3
        && afterOrder.length === 3
        && afterOrder[0] === optionNames[2]
        && JSON.stringify(persistedOrder) === JSON.stringify(afterOrder),
      { itemId: record.id, optionNames, beforeOrder, afterOrder, persistedOrder },
    );
    checkpoint('multi-spec-order-complete');
  }

  async function runFlavorRemovalGroup(): Promise<void> {
    const optionNames = [`AUTO_AUDIT_FLAVOR_A_${timestamp}`, `AUTO_AUDIT_FLAVOR_B_${timestamp}`, `AUTO_AUDIT_FLAVOR_C_${timestamp}`];
    const flavor = await dependencyFactory.seedTasteWithOptions(cleanupRegistry, optionNames);
    dependencyRecords.push(flavor);
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.fillItemName(names.flavorRemoval);
    await form.selectSingleSpec();
    await form.fillStandardPrice('10.00');
    await form.selectFlavorGroupByName(flavor.originalIdentity);
    const initialSelection = await form.setCommonAttributeSelections(
      flavor.originalIdentity,
      optionNames,
      optionNames,
    );
    const record = await submitCreate(form, itemContext(names.flavorRemoval, 'standard'), '/ops-brand/brand-items/standard');
    const edit = await new ItemEditFlow().openEditByItemName(page, names.flavorRemoval, 'standard');
    const beforeSelection = await edit.readCommonAttributeSelections(flavor.originalIdentity, optionNames);
    const selectedBeforeSave = await edit.setCommonAttributeSelections(
      flavor.originalIdentity,
      optionNames,
      [optionNames[0], optionNames[2]],
    );
    await submitUpdate(edit, record, names.flavorRemoval, 'standard');
    const reopened = await new ItemEditFlow().openEditByItemName(page, names.flavorRemoval, 'standard');
    const persistedSelection = await reopened.readCommonAttributeSelections(flavor.originalIdentity, optionNames);
    caseEvidence['TC-ITEM-STD-086'] = disposition(
      initialSelection.length === 3
        && beforeSelection.length === 3
        && selectedBeforeSave.length === 2
        && !selectedBeforeSave.includes(optionNames[1])
        && JSON.stringify(persistedSelection) === JSON.stringify(selectedBeforeSave),
      { itemId: record.id, initialSelection, beforeSelection, selectedBeforeSave, persistedSelection },
    );
    checkpoint('flavor-removal-complete');
  }

  async function runSideCreateGroup(): Promise<void> {
    await createAuditImages();
    const noCategory = await createSide(names.sideNoCategory, '10.00');
    const listPage = new ItemListPage(page);
    await listPage.open();
    await listPage.fillSearch(names.sideNoCategory);
    const categoryText = await listPage.readItemCategoryText(names.sideNoCategory);
    caseEvidence['TC-ITEM-ADD-007'] = disposition(
      categoryText.trim() === '' || categoryText.trim() === '--' || categoryText.trim() === '-',
      { itemId: noCategory.id, categoryText },
    );

    const zeroPrice = await createSide(names.sideZero, '0.00');
    await listPage.open();
    await listPage.fillSearch(names.sideZero);
    const zeroPriceText = await listPage.readItemPriceText(names.sideZero);
    caseEvidence['TC-ITEM-ADD-009'] = disposition(
      normalizePrice(zeroPriceText) === 0,
      { itemId: zeroPrice.id, priceText: zeroPriceText },
    );

    const uploadForm = new ItemCreateSidePage(page);
    await uploadForm.open();
    await uploadForm.fillItemName(names.sideUpload);
    const upload = await uploadForm.uploadCommonMainImageWithEvidence(sideUploadImagePath);
    await uploadForm.fillStandardPrice('10.00');
    const uploaded = await submitCreate(uploadForm, itemContext(names.sideUpload, 'side'), '/ops-brand/brand-items/standard');
    await listPage.open();
    await listPage.fillSearch(names.sideUpload);
    const imageSources = await listPage.readItemMainImageSources(names.sideUpload);
    const detail = await productCenterApi.productDetail(uploaded.id);
    caseEvidence['TC-ITEM-ADD-022'] = disposition(
      upload.cardCount === 1 && imageSources.some(isBusinessImageSource) && readImageData(detail).length > 0,
      { itemId: uploaded.id, upload, imageSources, apiImageCount: readImageData(detail).length },
    );
    checkpoint('side-create-complete');
  }

  async function runSidePriceGroup(): Promise<void> {
    const packageForm = new ItemCreateSidePage(page);
    await packageForm.open();
    await packageForm.fillItemName(names.sidePackage);
    await packageForm.fillStandardPrice('10.00');
    await packageForm.fillPackagingFee('1.00');
    const packagingFeeBeforeSave = await packageForm.readPackagingFee();
    const packageRecord = await submitCreate(packageForm, itemContext(names.sidePackage, 'side'), '/ops-brand/brand-items/standard');
    const packageEdit = await new ItemEditFlow().openEditByItemName(page, names.sidePackage, 'side');
    const packagingFee = await packageEdit.readPackagingFee();
    caseEvidence['TC-ITEM-ADD-011'] = disposition(
      Number(packagingFeeBeforeSave) === 1 && Number(packagingFee) === 1,
      { itemId: packageRecord.id, packagingFeeBeforeSave, packagingFee },
    );

    const costForm = new ItemCreateSidePage(page);
    await costForm.open();
    await costForm.fillItemName(names.sideCost);
    await costForm.fillStandardPrice('10.00');
    await costForm.fillCost('3.50');
    const costBeforeSave = await costForm.readCost();
    const costRecord = await submitCreate(costForm, itemContext(names.sideCost, 'side'), '/ops-brand/brand-items/standard');
    const costEdit = await new ItemEditFlow().openEditByItemName(page, names.sideCost, 'side');
    const cost = await costEdit.readCost();
    caseEvidence['TC-ITEM-ADD-049'] = disposition(
      Number(costBeforeSave) === 3.5 && Number(cost) === 3.5,
      { itemId: costRecord.id, costBeforeSave, cost },
    );
    checkpoint('side-price-complete');
  }

  async function runSideMainImageGroup(): Promise<void> {
    await createAuditImages();
    const form = new ItemCreateSidePage(page);
    await form.open();
    await form.fillItemName(names.sideReplace);
    const firstUpload = await form.uploadCommonMainImageWithEvidence(replaceFirstImagePath);
    const replacement = await form.replaceCommonMainImage(replaceSecondImagePath);
    await form.fillStandardPrice('10.00');
    const record = await submitCreate(form, itemContext(names.sideReplace, 'side'), '/ops-brand/brand-items/standard');
    const detail = await productCenterApi.productDetail(record.id);
    const listPage = new ItemListPage(page);
    await listPage.open();
    await listPage.fillSearch(names.sideReplace);
    const listImageSources = await listPage.readItemMainImageSources(names.sideReplace);
    const reopened = await new ItemEditFlow().openEditByItemName(page, names.sideReplace, 'side');
    const reopenedState = await reopened.readCommonMainImageState();
    caseEvidence['TC-ITEM-ADD-038'] = disposition(
      firstUpload.cardCount === 1
        && replacement.afterCount === 1
        && replacement.responseStatus === 200
        && JSON.stringify(replacement.beforeSources) !== JSON.stringify(replacement.afterSources)
        && readImageData(detail).length > 0
        && listImageSources.some(isBusinessImageSource)
        && reopenedState.count === 1
        && JSON.stringify(replacement.beforeSources) !== JSON.stringify(reopenedState.sources),
      { itemId: record.id, firstUpload, replacement, apiImageCount: readImageData(detail).length, listImageSources, reopenedState },
    );
    checkpoint('side-main-image-complete');
  }

  async function runSideOtherSettingsGroup(): Promise<void> {
    await createAuditImages();
    const descriptionTag = await dependencyFactory.seed('description-tag', cleanupRegistry);
    const statisticTag = await dependencyFactory.seed('statistic-tag', cleanupRegistry);
    dependencyRecords.push(descriptionTag, statisticTag);
    const record = await createSide(names.sideOther, '10.00');
    const edit = await new ItemEditFlow().openEditByItemName(page, names.sideOther, 'side');
    const detailImage = await edit.uploadDetailImage(detailImagePath);
    const description = await edit.selectDescriptionTagsByName([descriptionTag.originalIdentity]);
    const statistics = await edit.selectStatisticsTagsByName([statisticTag.originalIdentity]);
    await submitUpdate(edit, record, names.sideOther, 'side');
    const reopened = await new ItemEditFlow().openEditByItemName(page, names.sideOther, 'side');
    const selectedNames = await reopened.readOtherSettingsSelectedNames([
      descriptionTag.originalIdentity,
      statisticTag.originalIdentity,
    ]);
    const detailImageCount = await reopened.readDetailImageCardCount();
    const detail = await productCenterApi.productDetail(record.id);
    const apiDetailImageCount = readImageData(detail).length;
    caseEvidence['TC-ITEM-ADD-025'] = disposition(
      detailImage.responseStatus === 200
        && detailImage.cardCount === 1
        && description.selectedNames.includes(descriptionTag.originalIdentity)
        && statistics.includes(statisticTag.originalIdentity)
        && selectedNames.length === 2
        && apiDetailImageCount > 0,
      { itemId: record.id, detailImage, description, statistics, selectedNames, detailImageCount, apiDetailImageCount },
    );
    checkpoint('side-other-settings-complete');
  }

  async function createSide(identity: string, price: string): Promise<ProductCenterItemCreateRecord> {
    const form = new ItemCreateSidePage(page);
    await form.open();
    await form.fillItemName(identity);
    await form.fillStandardPrice(price);
    return submitCreate(form, itemContext(identity, 'side'), '/ops-brand/brand-items/standard');
  }

  async function submitCreate(
    form: ItemCreateFormPage,
    context: ProductCenterItemCreateContext,
    operationPath: string,
  ): Promise<ProductCenterItemCreateRecord> {
    expect(context.originalIdentity.startsWith('AUTO_AUDIT_')).toBe(true);
    expect(await itemFactory.itemRecordCount(context.originalIdentity)).toBe(0);
    const intentId = recordIntent(`create-${context.originalIdentity}`, context.originalIdentity, 'POST', operationPath);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(operationPath)
    ), { timeout: 60_000 });
    await form.clickSave();
    await handleAdditionalPriceWarning(form, responsePromise);
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
    identity: string,
    type: 'standard' | 'side',
  ): Promise<Response> {
    const operationPath = `/ops-brand/brand-items/standard/${record.id}`;
    const intentId = recordIntent(`update-${type}-${record.id}`, identity, 'PUT', operationPath);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith(operationPath)
    ), { timeout: 60_000 });
    await form.clickSave();
    await handleAdditionalPriceWarning(form, responsePromise);
    const response = await responsePromise;
    mutationJournal.markPhase(intentId, 'response-observed');
    mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
    mutationJournal.recordReconciliation(intentId, 'present');
    mutationJournal.markPhase(intentId, 'verification-complete');
    return response;
  }

  async function handleAdditionalPriceWarning(
    form: ItemCreateFormPage,
    responsePromise: Promise<Response>,
  ): Promise<void> {
    if (!(form instanceof ItemCreateStandardPage)) return;
    const result = await Promise.race([
      responsePromise.then(() => 'response' as const),
      waitUntil(
        () => form.isAdditionalPriceWarningVisible(),
        (visible) => visible,
        { timeout: 5_000, interval: 100, message: '未出现附加价确认弹窗。' },
      ).then(() => 'warning' as const).catch(() => 'none' as const),
    ]);
    if (result === 'warning') await form.confirmAdditionalPriceWarning();
  }

  async function createAuditImages(): Promise<void> {
    const imagePaths = [sideUploadImagePath, replaceFirstImagePath, replaceSecondImagePath, detailImagePath];
    if (imagePaths.every((imagePath) => fs.existsSync(imagePath))) return;
    const form = new ItemCreateSidePage(page);
    await form.open();
    await page.screenshot({ path: sideUploadImagePath, clip: { x: 0, y: 0, width: 256, height: 256 } });
    await page.screenshot({ path: replaceFirstImagePath, clip: { x: 256, y: 0, width: 256, height: 256 } });
    await page.screenshot({ path: replaceSecondImagePath, clip: { x: 0, y: 256, width: 256, height: 256 } });
    await page.screenshot({ path: detailImagePath, clip: { x: 256, y: 256, width: 256, height: 256 } });
  }

  async function recoverInterruptedRun(): Promise<void> {
    await reconcileIncompleteIntents();
    await cleanupRegistry.cleanupAll();
    const residues = Object.fromEntries(await Promise.all(
      mutationJournal.snapshot().entries.map(async (entry) => (
        [entry.identity, await itemFactory.itemRecordCount(entry.identity)] as const
      )),
    ));
    if (!allZero(residues)) throw new Error(`Y3-B2 中断恢复后仍有商品残留：${JSON.stringify(residues)}`);
    for (const entry of mutationJournal.snapshot().entries) {
      if (entry.phase !== 'cleanup-complete') mutationJournal.markPhase(entry.intentId, 'cleanup-complete');
    }
  }

  function itemContext(identity: string, productType: 'standard' | 'side'): ProductCenterItemCreateContext {
    return { entityKey: 'item', productType, originalIdentity: identity, price: '10.00', minimumOrderQuantity: '1' };
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
        throw new Error(`Y3-B2 非幂等对账不唯一：${entry.identity} count=${count}`);
      }
      let record = recordsByIdentity.get(entry.identity);
      if (!record) {
        const productType = entry.identity.includes('_SIDE_') ? 'side' : 'standard';
        record = await itemFactory.registerCreated(itemContext(entry.identity, productType), null, cleanupRegistry);
        recordsByIdentity.set(entry.identity, record);
      }
      mutationJournal.attachServerIdentity(entry.intentId, {
        serverId: record.id,
        ledgerEntryId: record.checkpointEntryId,
      });
      mutationJournal.recordReconciliation(entry.intentId, 'present');
      mutationJournal.markPhase(entry.intentId, 'verification-complete');
    }
  }

  function recordIntent(action: string, identity: string, method: 'POST' | 'PUT', operationPath: string): string {
    const requestFingerprint = createHash('sha256').update(`${runId}:${action}:${identity}:${method}:${operationPath}`).digest('hex');
    const intentId = `intent:yellow-y3-b2:${requestFingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: `audit-unit:yellow-y3-b2:${action}`,
      safetyLevel: 'L3-crud',
      entity: 'item',
      identity,
      identityVariants: [identity],
      operation: { method, path: operationPath },
      requestFingerprint,
    });
    intentIds.push(intentId);
    mutationJournal.markPhase(intentId, 'trigger-started');
    return intentId;
  }

  function needsAny(ids: readonly string[]): boolean {
    return ids.some((caseId) => !caseEvidence[caseId]);
  }

  function checkpoint(phase: string): void {
    writeJsonAtomic(reportPath, {
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-yellow-y3-b2-runtime-checkpoint',
      runId,
      batchId: 'Y3-B2',
      phase,
      caseIds,
      completedCaseIds: Object.keys(caseEvidence),
      caseEvidence,
      executionDiagnostic,
      updatedAt: new Date().toISOString(),
    });
  }
});

function disposition(accepted: boolean, evidence: unknown): CaseEvidence {
  return { verdict: accepted ? 'accepted' : 'canonical-conflict', evidence };
}

function loadResumableEvidence(reportPath: string, runId: string): Record<string, CaseEvidence> {
  if (!fs.existsSync(reportPath)) return {};
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    runId?: string;
    caseEvidence?: Record<string, CaseEvidence>;
    cleanupEvidence?: { residueFree?: boolean };
    mutationIntents?: Array<{ phase?: string }>;
  };
  if (report.runId !== runId) return {};
  return report.caseEvidence ?? {};
}

function invalidateReprobeGroup(evidence: Record<string, CaseEvidence>, rawCaseIds: string | undefined): void {
  const requested = new Set((rawCaseIds ?? '').split(',').map((value) => value.trim()).filter(Boolean));
  const groups = [
    ['TC-ITEM-STD-019', 'TC-ITEM-STD-084'],
    ['TC-ITEM-STD-085'],
    ['TC-ITEM-STD-086'],
    ['TC-ITEM-ADD-007', 'TC-ITEM-ADD-009', 'TC-ITEM-ADD-022'],
    ['TC-ITEM-ADD-011', 'TC-ITEM-ADD-049'],
    ['TC-ITEM-ADD-038'],
    ['TC-ITEM-ADD-025'],
  ];
  for (const group of groups) {
    if (group.some((caseId) => requested.has(caseId))) {
      for (const caseId of group) delete evidence[caseId];
      for (const caseId of group) requested.delete(caseId);
    }
  }
  for (const caseId of requested) delete evidence[caseId];
}

function normalizePrice(value: string): number {
  const normalized = value.replace(/[^0-9.-]/g, '');
  return normalized === '' ? Number.NaN : Number(normalized);
}

function isBusinessImageSource(source: string): boolean {
  return source.length > 0 && !source.startsWith('nullimage') && !source.startsWith('data:image/svg+xml');
}

function readImageData(value: unknown): unknown[] {
  const matches: unknown[] = [];
  collectImageData(value, matches);
  return matches;
}

function collectImageData(value: unknown, matches: unknown[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectImageData(item, matches);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => /image|url/i.test(key))
    && Object.values(record).some((item) => typeof item === 'string' && /https?:|image|cdn/i.test(item))) {
    matches.push(record);
  }
  for (const child of Object.values(record)) collectImageData(child, matches);
}

function allZero(values: Record<string, number>): boolean {
  return Object.values(values).every((count) => count === 0);
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
