import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Response } from '@playwright/test';
import { extractCreatedRecord } from '../../api/product-center/created-record';
import { MutationIntentJournal } from '../../api/product-center/mutation-intent-journal';
import { test, expect } from '../../fixtures/product-center.fixture';
import { ItemCreateComboPage } from '../../pages/product-management/item/item-create-combo.page';
import type { ItemCreateFormPage } from '../../pages/product-management/item/item-create-form.page';
import { ItemCreateSidePage } from '../../pages/product-management/item/item-create-side.page';
import { ItemCreateStandardPage } from '../../pages/product-management/item/item-create-standard.page';
import { createItemListPage } from '../../pages/product-management/item/item-list.page';
import {
  ProductCenterItemCreateDataFactory,
  type ProductCenterItemCreateContext,
  type ProductCenterItemCreateRecord,
} from '../../test-data/product-center/product-center-item-create-data.factory';
import {
  ProductCenterHighDependencyDataFactory,
  type HighDependencySeedRecord,
} from '../../test-data/product-center/sop/product-center-high-dependency-data.factory';
import { waitUntil } from '../../utils/wait';

const caseIds = [
  'TC-ITEM-ADD-026',
  'TC-ITEM-ADD-027',
  'TC-ITEM-ADD-028',
  'TC-ITEM-ADD-034',
  'TC-ITEM-ADD-036',
  'TC-ITEM-PKG-037',
  'TC-ITEM-PKG-038',
] as const;

type CaseDisposition = 'accepted' | 'canonical-conflict';
type CaseEvidence = { disposition: CaseDisposition; evidence: unknown };
type DeleteOutcome = 'deleted' | 'reference-blocked' | 'indeterminate';

test('W7 加料与套餐删除、引用阻断和确认弹窗 7 条 P0 用例整波技术验收', async ({
  page,
  productCenterApi,
  cleanupRegistry,
  executionLedger,
}, testInfo) => {
  test.setTimeout(900_000);
  test.skip(process.env.PC_P0_REMAINING_W7_LIVE !== '1', '未启用 W7 认证实时验收');
  const runId = process.env.PC_P0_REMAINING_W7_RUN_ID ?? `AUTO_AUDIT_P0_REMAINING_W7_${Date.now()}`;
  if (!runId.startsWith('AUTO_AUDIT_')) throw new Error('W7 运行身份必须以 AUTO_AUDIT_ 开头');
  const timestamp = Date.now();
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const highDependencyFactory = new ProductCenterHighDependencyDataFactory(productCenterApi);
  const mutationJournal = new MutationIntentJournal({ rootDir: path.resolve('output/mutation-intents'), runId });
  const names = {
    sideFree: `AUTO_AUDIT_W7_SIDE_FREE_${timestamp}`,
    sideAddonRef: `AUTO_AUDIT_W7_SIDE_ADDON_REF_${timestamp}`,
    sideMenuRef: `AUTO_AUDIT_W7_SIDE_MENU_REF_${timestamp}`,
    standardAddonRef: `AUTO_AUDIT_W7_STANDARD_ADDON_REF_${timestamp}`,
    addonGroup: `AUTO_AUDIT_W7_ADDON_GROUP_${timestamp}`,
    comboFree: `AUTO_AUDIT_W7_COMBO_FREE_${timestamp}`,
    comboMenuRef: `AUTO_AUDIT_W7_COMBO_MENU_REF_${timestamp}`,
  };
  const itemIdentities = [
    names.sideFree,
    names.sideAddonRef,
    names.sideMenuRef,
    names.standardAddonRef,
    names.comboFree,
    names.comboMenuRef,
  ];
  const intents: string[] = [];
  const caseEvidence: Record<string, CaseEvidence> = {};
  let scenario: Awaited<ReturnType<typeof seedDeletionReferenceScenario>> | undefined;
  let executionDiagnostic: string | undefined;

  try {
    scenario = await seedDeletionReferenceScenario();

    const dialogProbe = await readAndCancelDeleteDialog(scenario.sideFree);
    caseEvidence['TC-ITEM-ADD-036'] = disposition(
      dialogProbe.apiCount === 1
        && dialogProbe.firstDialogText.includes(names.sideFree)
        && dialogProbe.secondDialogText.includes(names.sideFree)
        && /delete|删除/i.test(dialogProbe.firstDialogText)
        && dialogProbe.firstDialogText === dialogProbe.secondDialogText,
      dialogProbe,
    );

    const sideFreeDelete = await attemptDelete(scenario.sideFree, 'deleted');
    caseEvidence['TC-ITEM-ADD-026'] = disposition(isSuccessfulDeleteResponse(sideFreeDelete), sideFreeDelete);

    const addonBlockedDelete = await attemptDelete(scenario.sideAddonRef, 'reference-blocked');
    const addonReferenceEvidence = {
      ...addonBlockedDelete,
      addonGroupId: scenario.addonGroup.id,
      standardProductId: scenario.standardAddonRef.id,
      addonGroupRelationPresent: scenario.addonGroupRelationPresent,
      standardProductRelationPresent: scenario.standardProductRelationPresent,
    };
    const addonReferenceAccepted = isReferenceBlockedResponse(addonBlockedDelete, {
      code: 'BITEM-2014',
      referenceId: scenario.addonGroup.id,
      referenceName: scenario.addonGroup.name,
    })
      && scenario.addonGroupRelationPresent
      && scenario.standardProductRelationPresent;
    caseEvidence['TC-ITEM-ADD-027'] = disposition(addonReferenceAccepted, addonReferenceEvidence);
    caseEvidence['TC-ITEM-ADD-034'] = disposition(addonReferenceAccepted, addonReferenceEvidence);

    const sideMenuBlockedDelete = await attemptDelete(scenario.sideMenuRef, 'reference-blocked');
    caseEvidence['TC-ITEM-ADD-028'] = disposition(
      isReferenceBlockedResponse(sideMenuBlockedDelete, {
        code: 'BITEM-2013',
        referenceId: scenario.menu.id,
        referenceName: scenario.menu.originalIdentity,
      }) && scenario.sideMenuRelationPresent,
      { ...sideMenuBlockedDelete, menuRelationPresent: scenario.sideMenuRelationPresent },
    );

    const comboFreeDelete = await attemptDelete(scenario.comboFree, 'deleted');
    caseEvidence['TC-ITEM-PKG-037'] = disposition(isSuccessfulDeleteResponse(comboFreeDelete), comboFreeDelete);

    const comboMenuBlockedDelete = await attemptDelete(scenario.comboMenuRef, 'reference-blocked');
    caseEvidence['TC-ITEM-PKG-038'] = disposition(
      isReferenceBlockedResponse(comboMenuBlockedDelete, {
        code: 'BITEM-2013',
        referenceId: scenario.menu.id,
        referenceName: scenario.menu.originalIdentity,
      }) && scenario.comboMenuRelationPresent,
      { ...comboMenuBlockedDelete, menuRelationPresent: scenario.comboMenuRelationPresent },
    );
    expect(Object.keys(caseEvidence).sort()).toEqual([...caseIds].sort());
  } catch (error) {
    executionDiagnostic = safeDiagnostic(error);
    throw error;
  } finally {
    let cleanupDiagnostic: string | undefined;
    try {
      await cleanupRegistry.cleanupAll();
    } catch (error) {
      cleanupDiagnostic = safeDiagnostic(error);
    }
    const apiResidue = await readApiResidue().catch((error) => {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
      return { items: {}, resources: {} };
    });
    const uiResidue = await readUiResidue().catch((error) => {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
      return {};
    });
    const ledger = executionLedger.snapshot();
    const incompleteLedgerEntries = ledger.entries.filter((entry) => entry.phase !== 'residue-verified').length;
    const uiAndApiResidueFree = allZero(apiResidue) && allZero(uiResidue);
    if (uiAndApiResidueFree && incompleteLedgerEntries === 0) {
      for (const intentId of intents) mutationJournal.markPhase(intentId, 'cleanup-complete');
    }
    const acceptedCaseIds = Object.entries(caseEvidence)
      .filter(([, value]) => value.disposition === 'accepted')
      .map(([caseId]) => caseId)
      .sort();
    const canonicalConflictCaseIds = Object.entries(caseEvidence)
      .filter(([, value]) => value.disposition === 'canonical-conflict')
      .map(([caseId]) => caseId)
      .sort();
    const completeCaseEvidence = Object.keys(caseEvidence).length === caseIds.length;
    const report = {
      schemaVersion: '1.0.0',
      runId,
      waveId: 'W7',
      executionMode: 'wave-shared-chain',
      caseLevelRunsClaimed: 0,
      status: completeCaseEvidence
        && acceptedCaseIds.length > 0
        && uiAndApiResidueFree
        && incompleteLedgerEntries === 0
        && !executionDiagnostic
        && !cleanupDiagnostic
        ? canonicalConflictCaseIds.length > 0 ? 'accepted-with-canonical-conflicts' : 'accepted'
        : 'incomplete',
      caseIds,
      acceptedCaseIds,
      canonicalConflictCaseIds,
      caseEvidence,
      executionDiagnostic,
      cleanupEvidence: {
        apiResidue,
        uiResidue,
        uiAndApiResidueFree,
        ledgerEntries: ledger.entries.length,
        residueVerified: ledger.entries.filter((entry) => entry.phase === 'residue-verified').length,
        incompleteLedgerEntries,
        cleanupDiagnostic,
      },
      mutationIntents: mutationJournal.snapshot().entries,
    };
    writeJsonAtomic(path.resolve(`output/audit/product-center-item-p0-remaining-w7-${runId}.json`), report);
    await testInfo.attach('product-center-item-p0-remaining-w7-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function seedDeletionReferenceScenario() {
    const sideFree = await createSide(names.sideFree);
    const sideAddonRef = await createSide(names.sideAddonRef);
    const sideMenuRef = await createSide(names.sideMenuRef);
    const addonGroup = await createAddonGroup(sideAddonRef);
    const standardAddonRef = await createStandardWithAddon(addonGroup.name);
    const comboFree = await createCombo(names.comboFree, timestamp + 101);
    const comboMenuRef = await createCombo(names.comboMenuRef, timestamp + 102);
    const menu = await highDependencyFactory.seed('menu', cleanupRegistry);
    const sideMenuRelationPresent = await bindItemToMenu(sideMenuRef, menu);
    const comboMenuRelationPresent = await bindItemToMenu(comboMenuRef, menu);
    const addonGroupDetail = await productCenterApi.addonGroupDetail(addonGroup.id);
    const standardProductDetail = await productCenterApi.productDetail(standardAddonRef.id);
    const addonGroupRelationPresent = containsItemId(addonGroupDetail, sideAddonRef.id);
    const standardProductRelationPresent = containsIdentityOrId(
      standardProductDetail,
      addonGroup.name,
      addonGroup.id,
    );
    expect(addonGroupRelationPresent).toBe(true);
    expect(standardProductRelationPresent).toBe(true);
    expect(sideMenuRelationPresent).toBe(true);
    expect(comboMenuRelationPresent).toBe(true);
    return {
      sideFree,
      sideAddonRef,
      sideMenuRef,
      standardAddonRef,
      addonGroup,
      comboFree,
      comboMenuRef,
      menu,
      addonGroupRelationPresent,
      standardProductRelationPresent,
      sideMenuRelationPresent,
      comboMenuRelationPresent,
    };
  }

  async function createSide(identity: string): Promise<ProductCenterItemCreateRecord> {
    const form = new ItemCreateSidePage(page);
    await form.open();
    await form.fillItemName(identity);
    await form.fillStandardPrice('1.00');
    return submitCreate(form, itemContext(identity, 'side'), '/ops-brand/brand-items/standard');
  }

  async function createStandardWithAddon(addonGroupName: string): Promise<ProductCenterItemCreateRecord> {
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.fillItemName(names.standardAddonRef);
    await form.selectSingleSpec();
    await form.fillStandardPrice('10.00');
    await form.selectAdditivesGroupByName(addonGroupName);
    return submitCreate(
      form,
      itemContext(names.standardAddonRef, 'standard'),
      '/ops-brand/brand-items/standard',
    );
  }

  async function createCombo(identity: string, seedTimestamp: number): Promise<ProductCenterItemCreateRecord> {
    const prepared = await itemFactory.prepareComboRequiredOnly(cleanupRegistry, seedTimestamp);
    itemIdentities.push(prepared.dependencyProductIdentity!);
    const context: ProductCenterItemCreateContext = { ...prepared, originalIdentity: identity };
    const form = new ItemCreateComboPage(page);
    await form.open();
    await form.fillItemName(identity);
    await form.clickAdvancedSettings();
    await form.fillMinimumOrderQuantity('1');
    await form.fillStandardPrice('10.00');
    await form.addFixedComboGroupByName(prepared.comboGroupName!);
    return submitCreate(form, context, '/ops-brand/brand-items/combo');
  }

  async function submitCreate(
    form: ItemCreateFormPage,
    context: ProductCenterItemCreateContext,
    operationPath: string,
  ): Promise<ProductCenterItemCreateRecord> {
    expect(await itemFactory.itemRecordCount(context.originalIdentity)).toBe(0);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(operationPath)
    ), { timeout: 60_000 });
    await form.clickSave();
    await handleAdditionalPriceWarning(form, responsePromise);
    const response = await responsePromise;
    const body = await response.json().catch(() => null);
    expect(response.ok()).toBe(true);
    return itemFactory.registerCreated(context, body, cleanupRegistry);
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
      ).then(() => 'warning' as const).catch(() => 'no-warning' as const),
    ]);
    if (terminal === 'warning') await form.confirmAdditionalPriceWarning();
  }

  async function createAddonGroup(sideRecord: ProductCenterItemCreateRecord) {
    const response = await productCenterApi.createAddonGroup({
      name: names.addonGroup,
      secondName: 'W7 删除引用审计',
      itemIds: [sideRecord.id],
    });
    const record = extractCreatedRecord(response, names.addonGroup)
      ?? findNamed(await productCenterApi.addonGroupList(names.addonGroup), names.addonGroup);
    if (!record) throw new Error(`未找到 W7 加料组：${names.addonGroup}`);
    const checkpointEntryId = `addon-${record.id}`;
    cleanupRegistry.register({
      entity: 'W7 加料引用组',
      identity: names.addonGroup,
      checkpoint: {
        entryId: checkpointEntryId,
        entityKind: 'addon',
        serverId: record.id,
        identityVariants: [names.addonGroup],
        cleanupOrder: 40,
      },
      execute: async () => {
        const residue = findNamed(
          await productCenterApi.addonGroupList(names.addonGroup),
          names.addonGroup,
        );
        if (residue) await productCenterApi.deleteAddonGroup(residue.id);
      },
      verify: async () => !findNamed(
        await productCenterApi.addonGroupList(names.addonGroup),
        names.addonGroup,
      ),
    });
    return { id: record.id, name: names.addonGroup, checkpointEntryId };
  }

  async function bindItemToMenu(
    item: ProductCenterItemCreateRecord,
    menu: HighDependencySeedRecord,
  ): Promise<boolean> {
    const list = createItemListPage(page);
    await list.open();
    await list.fillSearch(item.originalIdentity);
    await list.expectUniqueItemVisible(item.originalIdentity);
    await list.selectFirstRow();
    await list.openBatchActionMenu();
    const addToMenuPage = await list.enterAddToMenuPage();
    await addToMenuPage.selectTargetMenu(menu.originalIdentity, String(menu.metadata.blockIdentity));
    const operationPath = '/ops-brand/brand-block-item/batchCreate';
    const intentId = recordIntent('menu-bind', item, 'L3-crud', 'POST', operationPath);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(operationPath)
    ), { timeout: 60_000 });
    await addToMenuPage.save();
    const response = await responsePromise;
    mutationJournal.markPhase(intentId, 'response-observed');
    const menuBlockDetail = await productCenterApi.menuBlockDetail(Number(menu.metadata.blockId));
    const menuRelationPresent = containsItemIdInBlockItems(menuBlockDetail, item.id);
    mutationJournal.recordReconciliation(intentId, menuRelationPresent ? 'present' : 'absent');
    mutationJournal.markPhase(intentId, 'verification-complete');
    expect(response.ok()).toBe(true);
    return menuRelationPresent;
  }

  async function readAndCancelDeleteDialog(item: ProductCenterItemCreateRecord) {
    const list = createItemListPage(page);
    await list.open();
    await list.fillSearch(item.originalIdentity);
    await list.expectUniqueItemVisible(item.originalIdentity);
    await list.openRowActionMenu(item.originalIdentity);
    await list.clickRowActionDelete();
    const firstDialogText = await list.readDeleteDialogText();
    await list.cancelDeleteDialog();
    await list.openRowActionMenu(item.originalIdentity);
    await list.clickRowActionDelete();
    const secondDialogText = await list.readDeleteDialogText();
    await list.cancelDeleteDialog();
    const apiCount = await itemFactory.itemRecordCount(item.originalIdentity);
    return {
      itemId: item.id,
      identity: item.originalIdentity,
      firstDialogText,
      secondDialogText,
      cancelledTwice: true,
      apiCount,
    };
  }

  async function attemptDelete(
    item: ProductCenterItemCreateRecord,
    expectedOutcome: Exclude<DeleteOutcome, 'indeterminate'>,
  ) {
    const list = createItemListPage(page);
    await list.open();
    await list.fillSearch(item.originalIdentity);
    await list.expectUniqueItemVisible(item.originalIdentity);
    const beforeApiCount = await itemFactory.itemRecordCount(item.originalIdentity);
    await list.openRowActionMenu(item.originalIdentity);
    await list.clickRowActionDelete();
    const deleteDialogText = await list.readDeleteDialogText();
    const operationPath = '/ops-brand/brand-items/delete';
    const intentId = recordIntent(`delete-${expectedOutcome}`, item, expectedOutcome === 'deleted' ? 'L3-crud' : 'L2-controlled-negative', 'DELETE', operationPath);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'DELETE'
      && new URL(response.url()).pathname.endsWith(operationPath)
      && String(readRequestDeleteId(response.request().postDataJSON())) === String(item.id)
    ), { timeout: 60_000 });
    await list.confirmDeleteDialog();
    const response = await responsePromise;
    mutationJournal.markPhase(intentId, 'response-observed');
    const body = await response.json().catch(() => null);
    const messages = await list.readSettledVisibleMessages();
    const afterApiCount = await itemFactory.itemRecordCount(item.originalIdentity);
    const afterUiCount = await readUiItemCount(item.originalIdentity, afterApiCount);
    const requestDeleteId = readRequestDeleteId(response.request().postDataJSON());
    const outcome: DeleteOutcome = afterApiCount === 0 && afterUiCount === 0
      ? 'deleted'
      : afterApiCount === 1 && afterUiCount === 1 ? 'reference-blocked' : 'indeterminate';
    mutationJournal.recordReconciliation(intentId, outcome === 'deleted' ? 'absent' : outcome === 'reference-blocked' ? 'present' : 'ambiguous');
    mutationJournal.markPhase(intentId, 'verification-complete');
    return {
      itemId: item.id,
      identity: item.originalIdentity,
      expectedOutcome,
      outcome,
      deleteDialogText,
      response: responseEvidence(response),
      requestDeleteId,
      body,
      messages,
      beforeApiCount,
      afterApiCount,
      afterUiCount,
    };
  }

  function isSuccessfulDeleteResponse(
    evidence: Awaited<ReturnType<typeof attemptDelete>>,
  ): boolean {
    const body = asRecord(evidence.body);
    return evidence.outcome === 'deleted'
      && String(evidence.requestDeleteId) === String(evidence.itemId)
      && evidence.response.status === 200
      && body?.success === true
      && String(body.code) === '0'
      && evidence.beforeApiCount === 1
      && evidence.afterApiCount === 0
      && evidence.afterUiCount === 0
      && evidence.messages.some((message) => /successfully deleted|删除成功/i.test(message));
  }

  function isReferenceBlockedResponse(
    evidence: Awaited<ReturnType<typeof attemptDelete>>,
    expected: { code: string; referenceId: number | string; referenceName: string },
  ): boolean {
    const body = asRecord(evidence.body);
    return evidence.outcome === 'reference-blocked'
      && String(evidence.requestDeleteId) === String(evidence.itemId)
      && evidence.response.status === 400
      && body?.success === false
      && body.code === expected.code
      && containsReference(body.errorData, expected.referenceId, expected.referenceName)
      && evidence.messages.some((message) => message.includes(expected.code));
  }

  function recordIntent(
    action: string,
    item: ProductCenterItemCreateRecord,
    safetyLevel: 'L2-controlled-negative' | 'L3-crud',
    method: string,
    operationPath: string,
  ): string {
    const requestFingerprint = createHash('sha256')
      .update(`${runId}:${action}:${item.originalIdentity}:${method}:${operationPath}`)
      .digest('hex');
    const intentId = `intent:w7-${action}:${requestFingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: `audit-unit:w7-${action}`,
      safetyLevel,
      entity: 'item',
      identity: item.originalIdentity,
      identityVariants: [item.originalIdentity],
      operation: { method, path: operationPath },
      requestFingerprint,
    });
    mutationJournal.attachServerIdentity(intentId, {
      serverId: item.id,
      ledgerEntryId: item.checkpointEntryId,
    });
    mutationJournal.markPhase(intentId, 'trigger-started');
    intents.push(intentId);
    return intentId;
  }

  async function readUiItemCount(identity: string, expectedApiCount = 0): Promise<number> {
    const list = createItemListPage(page);
    await list.open();
    await list.fillSearch(identity);
    if (expectedApiCount === 0) await list.expectEmptySearchResults();
    if (expectedApiCount === 1) await list.expectUniqueItemVisible(identity);
    return list.readVisibleRowCount();
  }

  async function readApiResidue() {
    const items = Object.fromEntries(await Promise.all(itemIdentities.map(async (identity) => (
      [identity, await itemFactory.itemRecordCount(identity)] as const
    ))));
    const resources: Record<string, number> = {
      [names.addonGroup]: containsIdentity(
        await productCenterApi.addonGroupList(names.addonGroup),
        names.addonGroup,
      ) ? 1 : 0,
    };
    if (scenario) {
      resources[scenario.menu.originalIdentity] = containsIdentity(
        await productCenterApi.menuPage(scenario.menu.originalIdentity),
        scenario.menu.originalIdentity,
      ) ? 1 : 0;
      resources[String(scenario.menu.metadata.blockIdentity)] = containsIdentity(
        await productCenterApi.menuBlockSearch(String(scenario.menu.metadata.blockIdentity)),
        String(scenario.menu.metadata.blockIdentity),
      ) ? 1 : 0;
    }
    return { items, resources };
  }

  async function readUiResidue(): Promise<Record<string, number>> {
    const residue: Record<string, number> = {};
    for (const identity of itemIdentities) residue[identity] = await readUiItemCount(identity, 0);
    return residue;
  }
});

function itemContext(
  identity: string,
  productType: 'standard' | 'side',
): ProductCenterItemCreateContext {
  return {
    entityKey: 'item',
    productType,
    originalIdentity: identity,
    price: productType === 'standard' ? '10.00' : '1.00',
    minimumOrderQuantity: '1',
  };
}

function disposition(accepted: boolean, evidence: unknown): CaseEvidence {
  return { disposition: accepted ? 'accepted' : 'canonical-conflict', evidence };
}

function responseEvidence(response: Response): { method: string; path: string; status: number; ok: boolean } {
  return {
    method: response.request().method(),
    path: new URL(response.url()).pathname,
    status: response.status(),
    ok: response.ok(),
  };
}

function containsItemIdInBlockItems(value: unknown, itemId: number | string): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.items)) {
    return record.items.some((item) => (
      Boolean(item)
      && typeof item === 'object'
      && String((item as Record<string, unknown>).itemId) === String(itemId)
    ));
  }
  return Object.values(record).some((item) => containsItemIdInBlockItems(item, itemId));
}

function containsItemId(value: unknown, itemId: number | string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsItemId(item, itemId));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (String(record.itemId ?? '') === String(itemId)) return true;
  return Object.values(record).some((item) => containsItemId(item, itemId));
}

function containsIdentityOrId(value: unknown, identity: string, id: number | string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsIdentityOrId(item, identity, id));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (Object.values(record).some((item) => item === identity)) return true;
  if (
    ['addGroupId', 'addonGroupId', 'groupId'].some((key) => String(record[key] ?? '') === String(id))
  ) return true;
  return Object.values(record).some((item) => containsIdentityOrId(item, identity, id));
}

function findNamed(value: unknown, identity: string): { id: number; name: string } | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findNamed(item, identity);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id === 'number'
    && typeof record.name === 'string'
    && normalizeIdentity(record.name) === normalizeIdentity(identity)
  ) return record as { id: number; name: string };
  for (const child of Object.values(record)) {
    const match = findNamed(child, identity);
    if (match) return match;
  }
  return undefined;
}

function containsIdentity(value: unknown, identity: string): boolean {
  return Boolean(findNamed(value, identity));
}

function containsReference(value: unknown, referenceId: number | string, referenceName: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsReference(item, referenceId, referenceName));
  }
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (String(record.id ?? '') === String(referenceId) && record.name === referenceName) return true;
  return Object.values(record).some((item) => containsReference(item, referenceId, referenceName));
}

function readRequestDeleteId(value: unknown): number | string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const deleteId = (value as Record<string, unknown>).deleteId;
  return typeof deleteId === 'number' || typeof deleteId === 'string' ? deleteId : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function normalizeIdentity(value: string): string {
  return value.replace(/\\_/g, '_');
}

function allZero(value: unknown): boolean {
  if (typeof value === 'number') return value === 0;
  if (Array.isArray(value)) return value.every(allZero);
  if (value && typeof value === 'object') return Object.values(value).every(allZero);
  return true;
}

function safeDiagnostic(error: unknown): string {
  return String(error)
    .replace(/eyJ[a-z0-9_-]{10,}\.[a-z0-9._-]+/gi, '<redacted-diagnostic>')
    .replace(/bearer\s+[^\s,;]+/gi, '<redacted-diagnostic>')
    .replace(/(authorization|password|set-cookie|cookie|token)\s*[:=]\s*[^,;\s]+/gi, '<redacted-diagnostic>');
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
