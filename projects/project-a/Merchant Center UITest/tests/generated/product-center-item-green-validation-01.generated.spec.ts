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
import { ItemCreateSidePage } from '../../pages/product-management/item/item-create-side.page';
import { ItemCreateStandardPage } from '../../pages/product-management/item/item-create-standard.page';
import { ItemListPage } from '../../pages/product-management/item/item-list.page';
import { ProductCenterNegativePage } from '../../pages/product-center/product-center-negative.page';
import {
  ProductCenterItemCreateDataFactory,
  type ProductCenterItemCreateContext,
  type ProductCenterItemCreateRecord,
} from '../../test-data/product-center/product-center-item-create-data.factory';
import {
  ProductCenterCategoryNegativeDataFactory,
  type CategoryWithProductSeedRecord,
} from '../../test-data/product-center/sop/product-center-category-negative-data.factory';
import { ProductCenterLowDependencyDataFactory } from '../../test-data/product-center/sop/product-center-low-dependency-data.factory';
import { waitUntil } from '../../utils/wait';

const caseIds = [
  'TC-ITEM-STD-035',
  'TC-ITEM-STD-046',
  'TC-ITEM-STD-094',
  'TC-ITEM-STD-101',
  'TC-ITEM-STD-095',
  'TC-ITEM-STD-049',
  'TC-ITEM-STD-051',
  'TC-ITEM-STD-045',
  'TC-ITEM-STD-054',
  'TC-ITEM-STD-059',
  'TC-ITEM-ADD-017',
] as const;
type CaseId = typeof caseIds[number];
type Verdict = 'accepted' | 'canonical-conflict';
type CaseEvidence = { verdict: Verdict; evidence: Record<string, unknown> };

test('绿色校验共享波 01 十一条用例技术验收', async ({ page, productCenterApi }, testInfo) => {
  test.setTimeout(1_800_000);
  test.skip(process.env.PC_GREEN_VALIDATION_01_LIVE !== '1', '未启用绿色校验共享波 01 实时验收');
  const runId = process.env.PC_RECIPE_RUN_ID?.startsWith('AUTO_AUDIT_')
    ? process.env.PC_RECIPE_RUN_ID
    : `AUTO_AUDIT_GREEN_VALIDATION_01_${Date.now()}`;
  const reportPath = path.resolve(`output/audit/product-center-item-green-validation-01-runtime-${runId}.json`);
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
  const contextsByIdentity = new Map<string, ProductCenterItemCreateContext>();
  const attemptedItemIdentities = new Set<string>();
  const caseEvidence: Record<string, CaseEvidence> = normalizeResumableEvidence(
    loadResumableEvidence(reportPath, runId),
  );
  const suffix = createHash('sha256').update(runId).digest('hex').slice(0, 10).toUpperCase();
  const names = {
    mnemonic: `AUTO_AUDIT_GV01_MNEMONIC_${suffix}`,
    posName: `AUTO_AUDIT_GV01_POS_${suffix}`,
    deviceCode: `AUTO_AUDIT_GV01_DEVICE_${suffix}`,
    priceMaximum: `AUTO_AUDIT_GV01_PRICE_MAX_${suffix}`,
    description: `AUTO_AUDIT_GV01_DESCRIPTION_${suffix}`,
    roundUp: `AUTO_AUDIT_GV01_ROUND_UP_${suffix}`,
    roundDown: `AUTO_AUDIT_GV01_ROUND_DOWN_${suffix}`,
    referencedGroup: `AUTO_AUDIT_GV01_GROUP_ITEM_${suffix}`,
    side: `AUTO_AUDIT_GV01_SIDE_${suffix}`,
  };
  const imagePaths = Array.from({ length: 11 }, (_, index) => (
    testInfo.outputPath(`AUTO_AUDIT_GV01_DETAIL_${suffix}_${String(index + 1).padStart(2, '0')}.png`)
  ));
  let executionDiagnostic: string | undefined;

  try {
    await recoverInterruptedRun();
    checkpoint('running');
    if (!caseEvidence['TC-ITEM-STD-035']) await runCategoryChildBlockedCase();
    if (!caseEvidence['TC-ITEM-STD-046']) await runFieldValidationCase(
      'TC-ITEM-STD-046', names.mnemonic, 'mnemonicCode', 'M'.repeat(21),
    );
    if (!caseEvidence['TC-ITEM-STD-094']) await runFieldValidationCase(
      'TC-ITEM-STD-094', names.posName, 'posName', '  POS名称-autocreate-094  ',
    );
    if (!caseEvidence['TC-ITEM-STD-101']) await runFieldValidationCase(
      'TC-ITEM-STD-101', names.deviceCode, 'deviceCode', 'D'.repeat(21),
    );
    if (!caseEvidence['TC-ITEM-STD-095']) await runPriceRoundingPair();
    if (!caseEvidence['TC-ITEM-STD-049']) await runMultiSpecWeightCase();
    if (!caseEvidence['TC-ITEM-STD-051']) await runFieldValidationCase(
      'TC-ITEM-STD-051', names.priceMaximum, 'standardPrice', '1000000.00',
    );
    if (!caseEvidence['TC-ITEM-STD-045']) await runDescriptionBoundaryCase();
    if (!caseEvidence['TC-ITEM-STD-054']) await runStandardDetailImageLimitCase();
    if (!caseEvidence['TC-ITEM-STD-059']) await runReferencedGroupChildControlsCase();
    if (!caseEvidence['TC-ITEM-ADD-017']) await runSideDetailImageCase();
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
        throw new Error(`GREEN-VALIDATION-01 恢复清理失败：${recovery.failedEntryIds.join(',')}`);
      }
    } catch (error) {
      cleanupDiagnostic = safeDiagnostic(error);
    }
    const ledger = executionLedger.snapshot();
    const itemIdentities = [...new Set([
      ...attemptedItemIdentities,
      ...ledger.entries
        .filter((entry) => entry.entityKind === 'item' || entry.entityKind === 'bom-product')
        .flatMap((entry) => entry.identityVariants),
      ...mutationJournal.snapshot().entries
        .filter((entry) => entry.entity === 'item')
        .map((entry) => entry.identity),
    ])];
    const apiItemResidue = Object.fromEntries(await Promise.all(itemIdentities.map(async (identity) => (
      [identity, await itemFactory.itemRecordCount(identity)] as const
    ))));
    const categoryIdentities = ledger.entries
      .filter((entry) => entry.entityKind === 'category')
      .flatMap((entry) => entry.identityVariants);
    const apiCategoryResidue = Object.fromEntries(await Promise.all(categoryIdentities.map(async (identity) => (
      [identity, (await categoryFactory.findCategory(identity)) ? 1 : 0] as const
    ))));
    const tasteIdentities = ledger.entries
      .filter((entry) => entry.entityKind === 'taste')
      .flatMap((entry) => entry.identityVariants);
    const apiTasteResidue = Object.fromEntries(await Promise.all(tasteIdentities.map(async (identity) => (
      [identity, (await dependencyFactory.find('taste', identity)) ? 1 : 0] as const
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
    const residueFree = [apiItemResidue, apiCategoryResidue, apiTasteResidue, uiItemResidue]
      .every((residue) => Object.values(residue).every((value) => value === 0))
      && ledger.entries.every((entry) => entry.phase === 'residue-verified');
    if (residueFree && !cleanupDiagnostic) {
      for (const entry of mutationJournal.snapshot().entries) mutationJournal.markPhase(entry.intentId, 'cleanup-complete');
    }
    const acceptedCaseIds = verdictIds(caseEvidence, 'accepted');
    const canonicalConflictCaseIds = verdictIds(caseEvidence, 'canonical-conflict');
    const complete = Object.keys(caseEvidence).length === caseIds.length;
    const status = complete && residueFree && !executionDiagnostic && !cleanupDiagnostic
      ? canonicalConflictCaseIds.length > 0 ? 'accepted-with-canonical-conflicts' : 'accepted'
      : 'incomplete';
    const report = {
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-green-validation-01-runtime',
      runId,
      batchId: 'GREEN-VALIDATION-01',
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
        apiCategoryResidue,
        apiTasteResidue,
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
    await testInfo.attach('product-center-item-green-validation-01-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function runCategoryChildBlockedCase(): Promise<void> {
    const seed = await categoryFactory.seedCategoryWithProduct(cleanupRegistry);
    const operationPath = '/ops-brand/brand-categories';
    const intentId = recordIntent(
      'TC-ITEM-STD-035', seed.childCategoryName, 'category', 'L2-controlled-negative', 'POST', operationPath,
    );
    const negativePage = new ProductCenterNegativePage(page);
    await negativePage.openCategoryTree();
    await negativePage.attemptAddChildCategory(seed.parentCategoryName, seed.childCategoryName);
    const child = await settleCategoryChild(seed);
    if (child) {
      categoryFactory.registerCreatedChild(cleanupRegistry, seed, child);
      mutationJournal.attachServerIdentity(intentId, {
        serverId: child.id,
        ledgerEntryId: `category-${child.id}`,
      });
      mutationJournal.recordReconciliation(intentId, 'present');
    } else mutationJournal.recordReconciliation(intentId, 'absent');
    mutationJournal.markPhase(intentId, 'verification-complete');
    const childVisible = await negativePage.isChildCategoryVisible(
      seed.parentCategoryName,
      seed.childCategoryName,
    ).catch(() => false);
    const accepted = !child && !childVisible;
    caseEvidence['TC-ITEM-STD-035'] = disposition(accepted, {
      parentCategoryId: seed.parentCategoryId,
      parentCategoryName: seed.parentCategoryName,
      productId: seed.productId,
      productName: seed.productName,
      childCategoryName: seed.childCategoryName,
      apiChildPresent: Boolean(child),
      childVisible,
      expectedSatisfied: accepted,
    });
    checkpoint('TC-ITEM-STD-035-complete');
  }

  async function runFieldValidationCase(
    caseId: Extract<CaseId, 'TC-ITEM-STD-046' | 'TC-ITEM-STD-094' | 'TC-ITEM-STD-101' | 'TC-ITEM-STD-051'>,
    identity: string,
    field: 'mnemonicCode' | 'posName' | 'deviceCode' | 'standardPrice',
    value: string,
  ): Promise<void> {
    const result = await submitControlledNegative(caseId, identity, async (form) => {
      if (field === 'mnemonicCode') await form.fillMnemonicCode(value);
      else if (field === 'posName') await form.fillPosName(value);
      else if (field === 'deviceCode') await form.fillDeviceCode(value);
      else await form.fillStandardPrice(value);
      return form.readFieldValidationEvidence(field);
    });
    const fieldAfter = (result.route === '/pp/brand/create/standard'
      ? await result.form.readFieldValidationEvidence(field)
      : result.beforeEvidence) as Awaited<ReturnType<ItemCreateStandardPage['readFieldValidationEvidence']>>;
    const accepted = result.apiRecordCount === 0
      && result.successMessageCount === 0
      && result.route === '/pp/brand/create/standard'
      && fieldAfter.errors.length > 0;
    caseEvidence[caseId] = disposition(accepted, {
      identity,
      field,
      requestedValue: value,
      fieldBeforeSave: result.beforeEvidence,
      fieldAfterSave: fieldAfter,
      response: result.responseEvidence,
      validationErrors: result.validationErrors,
      successMessageCount: result.successMessageCount,
      route: result.route,
      apiRecordCount: result.apiRecordCount,
      expectedSatisfied: accepted,
    });
    checkpoint(`${caseId}-complete`);
  }

  async function runPriceRoundingPair(): Promise<void> {
    const first = await createStandard(names.roundUp, '10.235');
    const second = await createStandard(names.roundDown, '10.234');
    const accepted = first.listPrice === 10.24 && second.listPrice === 10.23;
    caseEvidence['TC-ITEM-STD-095'] = disposition(accepted, {
      values: [first, second],
      expectedSatisfied: accepted,
    });
    checkpoint('TC-ITEM-STD-095-complete');
  }

  async function runMultiSpecWeightCase(): Promise<void> {
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.selectMultiSpec();
    const weight = await form.readWeightBasedDisabledEvidence();
    const accepted = weight.disabled || weight.ariaDisabled === 'true';
    caseEvidence['TC-ITEM-STD-049'] = disposition(accepted, {
      route: new URL(page.url()).pathname,
      weight,
      expectedSatisfied: accepted,
    });
    checkpoint('TC-ITEM-STD-049-complete');
  }

  async function runDescriptionBoundaryCase(): Promise<void> {
    const result = await submitControlledNegative('TC-ITEM-STD-045', names.description, async (form) => (
      form.probeDescriptionLengthBoundary(500, 501)
    ));
    const boundary = result.beforeEvidence as Awaited<ReturnType<ItemCreateStandardPage['probeDescriptionLengthBoundary']>>;
    const accepted = boundary.valueLengthAfterAccepted === 500
      && boundary.valueLengthAfterRejected === 500
      && result.apiRecordCount === 0
      && result.successMessageCount === 0
      && result.route === '/pp/brand/create/standard';
    caseEvidence['TC-ITEM-STD-045'] = disposition(accepted, {
      identity: names.description,
      boundary,
      response: result.responseEvidence,
      validationErrors: result.validationErrors,
      successMessageCount: result.successMessageCount,
      route: result.route,
      apiRecordCount: result.apiRecordCount,
      expectedSatisfied: accepted,
    });
    checkpoint('TC-ITEM-STD-045-complete');
  }

  async function runStandardDetailImageLimitCase(): Promise<void> {
    await createAuditImages();
    const form = new ItemCreateStandardPage(page);
    await form.open();
    const uploads = [];
    for (const imagePath of imagePaths.slice(0, 10)) uploads.push(await form.uploadDetailImage(imagePath));
    const countAtMaximum = await form.readDetailImageCardCount();
    const capacityAtMaximum = await form.readDetailImageCapacityEvidence();
    const eleventh = await form.attemptDetailImageUpload(imagePaths[10]);
    const finalCount = await form.readDetailImageCardCount();
    const accepted = uploads.length === 10
      && uploads.every((upload) => upload.responseStatus >= 200 && upload.responseStatus < 300)
      && (countAtMaximum === 10 || capacityAtMaximum.uploadControlCount === 0)
      && eleventh.requestObserved === false
      && eleventh.uploadControlVisible === false;
    caseEvidence['TC-ITEM-STD-054'] = disposition(accepted, {
      successfulUploadStatuses: uploads.map((upload) => upload.responseStatus),
      uploadResponseSummaries: uploads.map((upload) => upload.responseSummary),
      countAtMaximum,
      capacityAtMaximum,
      eleventh,
      finalCount,
      expectedSatisfied: accepted,
    });
    checkpoint('TC-ITEM-STD-054-complete');
  }

  async function runReferencedGroupChildControlsCase(): Promise<void> {
    const group = await dependencyFactory.seedMultiOptionRuleGroupScenario(cleanupRegistry);
    const optionNames = String(group.metadata.optionNames).split('|');
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.fillItemName(names.referencedGroup);
    await form.selectSingleSpec();
    await form.fillStandardPrice('10.00');
    await form.selectFlavorGroupByName(group.originalIdentity);
    const context = itemContext(names.referencedGroup, 'standard', '10.00');
    await submitCreate(form, context, 'TC-ITEM-STD-059');
    const edit = await new ItemEditFlow().openEditByItemName(page, names.referencedGroup, 'standard');
    const controls = await edit.probeReferencedGroupChildControls(group.originalIdentity, optionNames);
    const accepted = controls.addChildControlCount === 0
      && controls.selectedBefore.includes(controls.removedOptionName)
      && !controls.selectedAfter.includes(controls.removedOptionName);
    caseEvidence['TC-ITEM-STD-059'] = disposition(accepted, {
      itemIdentity: names.referencedGroup,
      groupId: group.id,
      groupName: group.originalIdentity,
      optionNames,
      controls,
      expectedSatisfied: accepted,
    });
    checkpoint('TC-ITEM-STD-059-complete');
  }

  async function runSideDetailImageCase(): Promise<void> {
    await createAuditImages();
    const form = new ItemCreateSidePage(page);
    await form.open();
    await form.fillItemName(names.side);
    await form.fillStandardPrice('10.00');
    const uploads = [];
    for (const imagePath of imagePaths.slice(0, 10)) uploads.push(await form.uploadDetailImage(imagePath));
    const countBeforeSave = await form.readDetailImageCardCount();
    const capacityBeforeSave = await form.readDetailImageCapacityEvidence();
    const context = itemContext(names.side, 'side', '10.00');
    const submission = await submitCreate(form, context, 'TC-ITEM-ADD-017');
    const edit = await new ItemEditFlow().openEditByItemName(page, names.side, 'side');
    const reopenedCount = await edit.readDetailImageCardCount();
    const reopenedCapacity = await edit.readDetailImageCapacityEvidence();
    const accepted = (countBeforeSave === 10 || capacityBeforeSave.uploadControlCount === 0)
      && uploads.every((upload) => upload.responseStatus >= 200 && upload.responseStatus < 300)
      && submission.responseStatus >= 200
      && submission.responseStatus < 300
      && (reopenedCount === 10 || reopenedCapacity.uploadControlCount === 0);
    caseEvidence['TC-ITEM-ADD-017'] = disposition(accepted, {
      identity: names.side,
      countBeforeSave,
      capacityBeforeSave,
      uploadStatuses: uploads.map((upload) => upload.responseStatus),
      uploadResponseSummaries: uploads.map((upload) => upload.responseSummary),
      responseStatus: submission.responseStatus,
      itemId: submission.record.id,
      reopenedCount,
      reopenedCapacity,
      expectedSatisfied: accepted,
    });
    checkpoint('TC-ITEM-ADD-017-complete');
  }

  async function submitControlledNegative(
    caseId: Extract<CaseId, 'TC-ITEM-STD-046' | 'TC-ITEM-STD-094' | 'TC-ITEM-STD-101' | 'TC-ITEM-STD-051' | 'TC-ITEM-STD-045'>,
    identity: string,
    configure: (form: ItemCreateStandardPage) => Promise<unknown>,
  ) {
    const context = itemContext(identity, 'standard', '10.00');
    contextsByIdentity.set(identity, context);
    attemptedItemIdentities.add(identity);
    expect(await itemFactory.itemRecordCount(identity)).toBe(0);
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.fillItemName(identity);
    await form.selectSingleSpec();
    await form.ensureAdvancedSettingsExpanded();
    await form.fillMinimumOrderQuantity('1');
    await form.fillStandardPrice('10.00');
    const beforeEvidence = await configure(form);
    const intentId = recordIntent(
      caseId, identity, 'item', 'L2-controlled-negative', 'POST', '/ops-brand/brand-items/standard',
    );
    const responses: Response[] = [];
    const listener = (response: Response) => {
      if (response.request().method() === 'POST'
        && new URL(response.url()).pathname.endsWith('/ops-brand/brand-items/standard')) responses.push(response);
    };
    page.on('response', listener);
    try {
      await form.clickSave();
      const startedAt = Date.now();
      await waitUntil(
        async () => ({
          elapsed: Date.now() - startedAt,
          route: new URL(page.url()).pathname,
          errors: await form.readVisibleValidationErrors(),
          success: await form.readSuccessMessageCount(),
          responses: responses.length,
        }),
        (state) => state.errors.length > 0
          || state.success > 0
          || state.route !== '/pp/brand/create/standard'
          || state.responses > 0
          || state.elapsed >= 3_000,
        { timeout: 10_000, interval: 100, message: `${caseId} 负向提交未进入可判定终态。` },
      );
    } finally {
      page.off('response', listener);
    }
    const response = responses.at(-1);
    if (response) mutationJournal.markPhase(intentId, 'response-observed');
    const apiRecordCount = await itemFactory.itemRecordCount(identity);
    if (apiRecordCount > 1) {
      mutationJournal.recordReconciliation(intentId, 'ambiguous');
      throw new Error(`${caseId} 负向提交产生多条同名记录：${apiRecordCount}`);
    }
    if (apiRecordCount === 1) {
      const body = await response?.json().catch(() => null);
      const record = await itemFactory.registerCreated(context, body ?? null, cleanupRegistry);
      recordsByIdentity.set(identity, record);
      mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
      mutationJournal.recordReconciliation(intentId, 'present');
    } else mutationJournal.recordReconciliation(intentId, 'absent');
    mutationJournal.markPhase(intentId, 'verification-complete');
    return {
      form,
      beforeEvidence,
      responseEvidence: response ? responseSummary(response) : null,
      validationErrors: await form.readVisibleValidationErrors(),
      successMessageCount: await form.readSuccessMessageCount(),
      route: new URL(page.url()).pathname,
      apiRecordCount,
    };
  }

  async function createStandard(identity: string, requestedPrice: string) {
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.fillItemName(identity);
    await form.selectSingleSpec();
    await form.ensureAdvancedSettingsExpanded();
    await form.fillMinimumOrderQuantity('1');
    await form.fillStandardPrice(requestedPrice);
    const priceBeforeSave = await form.readStandardPriceValue();
    const context = itemContext(identity, 'standard', requestedPrice);
    const submission = await submitCreate(form, context, `round-${requestedPrice}`);
    const list = new ItemListPage(page);
    await list.expectLoaded();
    await list.fillSearch(identity);
    await list.expectUniqueItemVisible(identity);
    const listPriceText = await list.readItemPriceText(identity);
    return {
      identity,
      requestedPrice,
      priceBeforeSave,
      responseStatus: submission.responseStatus,
      listPriceText,
      listPrice: Number(listPriceText.replace(/[^0-9.-]/g, '')),
    };
  }

  async function submitCreate(
    form: ItemCreateFormPage,
    context: ProductCenterItemCreateContext,
    action: string,
  ): Promise<{ record: ProductCenterItemCreateRecord; responseStatus: number }> {
    attemptedItemIdentities.add(context.originalIdentity);
    contextsByIdentity.set(context.originalIdentity, context);
    expect(await itemFactory.itemRecordCount(context.originalIdentity)).toBe(0);
    const operationPath = '/ops-brand/brand-items/standard';
    const intentId = recordIntent(action, context.originalIdentity, 'item', 'L3-crud', 'POST', operationPath);
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
    return { record, responseStatus: response.status() };
  }

  async function handleAdditionalPriceWarning(
    form: ItemCreateFormPage,
    responsePromise: Promise<Response>,
  ): Promise<void> {
    if (!(form instanceof ItemCreateStandardPage)) return;
    const terminal = await Promise.race([
      responsePromise.then(() => 'response' as const),
      waitUntil(
        () => form.isAdditionalPriceWarningVisible(),
        (visible) => visible,
        { timeout: 5_000, interval: 100, message: '未出现附加价确认弹窗。' },
      ).then(() => 'warning' as const).catch(() => 'none' as const),
    ]);
    if (terminal === 'warning') await form.confirmAdditionalPriceWarning();
  }

  async function createAuditImages(): Promise<void> {
    if (imagePaths.every((imagePath) => fs.existsSync(imagePath))) return;
    const assetPage = await page.context().newPage();
    try {
      for (let index = 0; index < imagePaths.length; index += 1) {
        const hue = (index * 31) % 360;
        await assetPage.setContent(
          `<style>html,body{margin:0;width:256px;height:256px;background:hsl(${hue} 75% 45%);color:white;font:32px sans-serif;display:grid;place-items:center}</style><body>${index + 1}</body>`,
        );
        await assetPage.screenshot({ path: imagePaths[index], clip: { x: 0, y: 0, width: 256, height: 256 } });
      }
    } finally {
      await assetPage.close();
    }
  }

  async function settleCategoryChild(seed: CategoryWithProductSeedRecord) {
    const startedAt = Date.now();
    return waitUntil(
      async () => ({ elapsed: Date.now() - startedAt, child: await categoryFactory.findChildCategory(
        seed.parentCategoryId,
        seed.childCategoryName,
      ) }),
      (state) => Boolean(state.child) || state.elapsed >= 2_000,
      { timeout: 10_000, interval: 100, message: '分类新增负向探测未进入可判定终态。' },
    ).then((state) => state.child);
  }

  async function recoverInterruptedRun(): Promise<void> {
    const recovery = await recoveryService.recoverIncomplete();
    if (recovery.failedEntryIds.length > 0) {
      throw new Error(`GREEN-VALIDATION-01 启动恢复失败：${recovery.failedEntryIds.join(',')}`);
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
          entity: 'GREEN-VALIDATION-01 中断恢复子分类',
          identity: entry.identity,
          checkpoint: {
            entryId: ledgerEntryId,
            entityKind: 'category',
            serverId: category.id,
            identityVariants: [entry.identity],
            cleanupOrder: 30,
          },
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
        throw new Error(`GREEN-VALIDATION-01 非幂等对账不唯一：${entry.identity} count=${count}`);
      }
      const context = contextsByIdentity.get(entry.identity) ?? contextForIdentity(entry.identity);
      const record = recordsByIdentity.get(entry.identity)
        ?? await itemFactory.registerCreated(context, null, cleanupRegistry);
      recordsByIdentity.set(entry.identity, record);
      attemptedItemIdentities.add(entry.identity);
      mutationJournal.attachServerIdentity(entry.intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
      mutationJournal.recordReconciliation(entry.intentId, 'present');
      mutationJournal.markPhase(entry.intentId, 'verification-complete');
    }
  }

  function recordIntent(
    unit: string,
    identity: string,
    entity: 'item' | 'category',
    safetyLevel: 'L2-controlled-negative' | 'L3-crud',
    method: string,
    operationPath: string,
  ): string {
    const fingerprint = createHash('sha256')
      .update(`${runId}:${unit}:${identity}:${method}:${operationPath}`)
      .digest('hex');
    const intentId = `intent:green-validation-01:${fingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: `audit-unit:green-validation-01:${unit.toLowerCase()}`,
      safetyLevel,
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
      collectionId: 'product-center-item-green-validation-01-runtime-checkpoint',
      runId,
      batchId: 'GREEN-VALIDATION-01',
      phase,
      caseIds,
      completedCaseIds: Object.keys(caseEvidence),
      caseEvidence,
      executionDiagnostic,
      updatedAt: new Date().toISOString(),
    });
  }

  function contextForIdentity(identity: string): ProductCenterItemCreateContext {
    return itemContext(identity, identity === names.side ? 'side' : 'standard', '10.00');
  }
});

function itemContext(
  identity: string,
  productType: 'standard' | 'side',
  price: string,
): ProductCenterItemCreateContext {
  return {
    entityKey: 'item',
    productType,
    originalIdentity: identity,
    price,
    minimumOrderQuantity: '1',
  };
}

function responseSummary(response: Response) {
  return {
    method: response.request().method(),
    path: new URL(response.url()).pathname,
    status: response.status(),
  };
}

function disposition(accepted: boolean, evidence: Record<string, unknown>): CaseEvidence {
  return { verdict: accepted ? 'accepted' : 'canonical-conflict', evidence };
}

function verdictIds(evidence: Record<string, CaseEvidence>, verdict: Verdict): string[] {
  return Object.entries(evidence).filter(([, value]) => value.verdict === verdict).map(([caseId]) => caseId).sort();
}

function loadResumableEvidence(reportPath: string, runId: string): Record<string, CaseEvidence> {
  if (!fs.existsSync(reportPath)) return {};
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    runId?: string;
    caseEvidence?: Record<string, CaseEvidence>;
  };
  return report.runId === runId ? report.caseEvidence ?? {} : {};
}

function normalizeResumableEvidence(evidence: Record<string, CaseEvidence>): Record<string, CaseEvidence> {
  const normalized = { ...evidence };
  const standardImageEvidence = normalized['TC-ITEM-STD-054']?.evidence;
  if (standardImageEvidence?.countAtMaximum === 0) delete normalized['TC-ITEM-STD-054'];
  const sideImageEvidence = normalized['TC-ITEM-ADD-017']?.evidence;
  if (sideImageEvidence?.countBeforeSave === 0
    && Array.isArray(sideImageEvidence.uploadStatuses)) {
    delete normalized['TC-ITEM-ADD-017'];
  }
  return normalized;
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
