import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Page, Response } from '@playwright/test';
import { MutationIntentJournal, type MutationIntentPhase } from '../../api/product-center/mutation-intent-journal';
import { test, expect } from '../../fixtures/product-center.fixture';
import { ItemCreateSidePage } from '../../pages/product-management/item/item-create-side.page';
import { createItemListPage, type ItemListPage } from '../../pages/product-management/item/item-list.page';
import { itemListFilterOptionsDom } from '../../test-data/item-list';
import {
  ProductCenterItemCreateDataFactory,
  type ProductCenterItemCreateContext,
  type ProductCenterItemCreateRecord,
} from '../../test-data/product-center/product-center-item-create-data.factory';
import { ProductCenterHighDependencyDataFactory } from '../../test-data/product-center/sop/product-center-high-dependency-data.factory';
import { waitUntil } from '../../utils/wait';

const caseIds = [
  'TC-ITEM-PKG-047',
  'TC-ITEM-STD-069',
  'TC-ITEM-STD-028',
  'TC-ITEM-STD-029',
  'TC-ITEM-ADD-023',
  'TC-ITEM-ADD-040',
  'TC-ITEM-STD-066',
  'TC-ITEM-ADD-042',
  'TC-ITEM-ADD-043',
  'TC-ITEM-STD-068',
  'TC-ITEM-STD-070',
  'TC-ITEM-STD-075',
] as const;

test('Wave B 商品列表 12 条 P0 用例整波技术验收', async ({
  page,
  productCenterApi,
  cleanupRegistry,
  executionLedger,
}, testInfo) => {
  test.setTimeout(600_000);
  test.skip(process.env.PC_P0_WAVE_B_LIVE !== '1', '未启用 Wave B 认证实时验收');
  const runId = process.env.PC_P0_WAVE_B_RUN_ID ?? `AUTO_AUDIT_P0_WAVE_B_${Date.now()}`;
  const timestamp = Date.now();
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const highDependencyFactory = new ProductCenterHighDependencyDataFactory(productCenterApi);
  const mutationJournal = new MutationIntentJournal({ rootDir: path.resolve('output/mutation-intents'), runId });
  const names = {
    standardSearch: `AUTO_AUDIT_WAVE_B_STANDARD_SEARCH_${timestamp}`,
    standardLifecycle: `AUTO_AUDIT_WAVE_B_STANDARD_LIFECYCLE_${timestamp}`,
    standardDelete: `AUTO_AUDIT_WAVE_B_STANDARD_DELETE_${timestamp}`,
    standardDeleteText: `AUTO_AUDIT_WAVE_B_STANDARD_DELETE_TEXT_${timestamp}`,
    standardMenuRef: `AUTO_AUDIT_WAVE_B_STANDARD_MENU_REF_${timestamp}`,
    sideLifecycle: `AUTO_AUDIT_WAVE_B_SIDE_LIFECYCLE_${timestamp}`,
  };
  const itemIdentities = Object.values(names);
  const caseEvidence: Record<string, unknown> = {};
  const runtimeDiagnostics: Record<string, unknown> = {};
  const intents: Array<{ intentId: string; identity: string }> = [];
  let comboReferencedIdentity = '';
  let cleanupEvidence: unknown;
  let executionDiagnostic: string | undefined;

  try {
    const standardSearch = await createStandard(names.standardSearch);
    const standardLifecycle = await createStandard(names.standardLifecycle);
    const standardDelete = await createStandard(names.standardDelete);
    await createStandard(names.standardDeleteText);
    const standardMenuRef = await createStandard(names.standardMenuRef);
    await createSide(names.sideLifecycle);
    const comboReference = await itemFactory.prepareComboRequiredOnly(cleanupRegistry, timestamp + 10);
    comboReferencedIdentity = comboReference.dependencyProductIdentity ?? '';
    if (!comboReferencedIdentity) throw new Error('Wave B 套餐引用数据缺少标准商品身份');
    itemIdentities.push(comboReferencedIdentity);
    const menu = await highDependencyFactory.seed('menu', cleanupRegistry);

    caseEvidence['TC-ITEM-STD-028'] = await verifyCombinedQuery(
      names.standardSearch,
      itemListFilterOptionsDom.typeStandard,
    );
    caseEvidence['TC-ITEM-ADD-023'] = await verifyCombinedQuery(
      names.sideLifecycle,
      itemListFilterOptionsDom.typeSide,
    );
    caseEvidence['TC-ITEM-PKG-047'] = await verifyReset([itemListFilterOptionsDom.typeCombo]);
    caseEvidence['TC-ITEM-STD-029'] = await verifyReset([
      itemListFilterOptionsDom.typeStandard,
      itemListFilterOptionsDom.typeSide,
    ]);
    caseEvidence['TC-ITEM-ADD-040'] = await verifyReset([itemListFilterOptionsDom.typeSide]);

    caseEvidence['TC-ITEM-STD-066'] = await changeLifecycle(
      names.standardLifecycle,
      'disable',
      itemListFilterOptionsDom.statusDisabled,
    );
    caseEvidence['TC-ITEM-ADD-043'] = await changeLifecycle(
      names.sideLifecycle,
      'disable',
      itemListFilterOptionsDom.statusDisabled,
    );
    caseEvidence['TC-ITEM-ADD-042'] = await changeLifecycle(
      names.sideLifecycle,
      'enable',
      itemListFilterOptionsDom.statusEnabled,
    );

    const deleteTextList = createItemListPage(page);
    await deleteTextList.open();
    await deleteTextList.fillSearch(names.standardDeleteText);
    await deleteTextList.expectUniqueItemVisible(names.standardDeleteText);
    await deleteTextList.openRowActionMenu(names.standardDeleteText);
    await deleteTextList.clickRowActionDelete();
    const deleteDialogText = await deleteTextList.readDeleteDialogText();
    expect(deleteDialogText).toContain(names.standardDeleteText);
    await deleteTextList.cancelDeleteDialog();
    expect(await itemFactory.itemRecordCount(names.standardDeleteText)).toBe(1);
    caseEvidence['TC-ITEM-STD-075'] = { deleteDialogText, cancelled: true, apiRecordCount: 1 };

    const freeDelete = await attemptDelete(names.standardDelete, 'success');
    expect(await itemFactory.itemRecordCount(names.standardDelete)).toBe(0);
    expect(freeDelete.afterCount).toBe(0);
    caseEvidence['TC-ITEM-STD-068'] = { ...freeDelete, apiRecordCount: 0 };

    const comboBlocked = await attemptDelete(comboReferencedIdentity, 'blocked');
    expect(await itemFactory.itemRecordCount(comboReferencedIdentity)).toBe(1);
    expect(comboBlocked.afterCount).toBe(1);
    expect(JSON.stringify(comboBlocked)).toMatch(/combo|section|套餐/i);
    caseEvidence['TC-ITEM-STD-069'] = { ...comboBlocked, apiRecordCount: 1 };

    const menuBindList = createItemListPage(page);
    await menuBindList.open();
    await menuBindList.fillSearch(names.standardMenuRef);
    await menuBindList.expectUniqueItemVisible(names.standardMenuRef);
    await menuBindList.selectFirstRow();
    await menuBindList.openBatchActionMenu();
    const addToMenuPage = await menuBindList.enterAddToMenuPage();
    await addToMenuPage.selectTargetMenu(menu.originalIdentity, String(menu.metadata.blockIdentity));
    const bindPath = '/ops-brand/brand-block-item/batchCreate';
    const bindIntent = recordIntent('menu-bind', names.standardMenuRef, 'L3-crud', 'POST', bindPath);
    const bindResponse = await captureMutation('POST', bindPath, () => addToMenuPage.save());
    mutationJournal.markPhase(bindIntent.intentId, 'response-observed');
    await bindResponse.finished();
    const bindResponseBody = await bindResponse.json().catch(() => null);
    const menuBlockDetail = await productCenterApi.menuBlockDetail(Number(menu.metadata.blockId));
    const menuRelationPresent = containsItemIdInBlockItems(menuBlockDetail, standardMenuRef.id);
    runtimeDiagnostics['TC-ITEM-STD-070'] = {
      bind: responseEvidence(bindResponse),
      bindResponseBody,
      menuId: menu.id,
      menuBlockId: menu.metadata.blockId,
      itemId: standardMenuRef.id,
      menuRelationPresent,
    };
    expect(menuRelationPresent).toBe(true);
    mutationJournal.markPhase(bindIntent.intentId, 'verification-complete');
    const menuBlocked = await attemptDelete(names.standardMenuRef, 'blocked');
    expect(await itemFactory.itemRecordCount(names.standardMenuRef)).toBe(1);
    expect(menuBlocked.afterCount).toBe(1);
    expect(JSON.stringify(menuBlocked)).toMatch(/menu|菜单/i);
    caseEvidence['TC-ITEM-STD-070'] = {
      bind: responseEvidence(bindResponse),
      delete: menuBlocked,
      apiRecordCount: 1,
      menuId: menu.id,
      itemId: standardMenuRef.id,
    };

    expect(standardSearch.id).toBeGreaterThan(0);
    expect(standardLifecycle.id).toBeGreaterThan(0);
    expect(standardDelete.id).toBeGreaterThan(0);
    expect(Object.keys(caseEvidence).sort()).toEqual([...caseIds].sort());
  } catch (error) {
    executionDiagnostic = String(error);
    throw error;
  } finally {
    let cleanupDiagnostic: string | undefined;
    try {
      await cleanupRegistry.cleanupAll();
    } catch (error) {
      cleanupDiagnostic = String(error);
    }
    const apiItemResidue = Object.fromEntries(await Promise.all(itemIdentities.map(async (identity) => (
      [identity, await itemFactory.itemRecordCount(identity)] as const
    ))));
    const uiItemResidue: Record<string, 0> = {};
    try {
      for (const identity of itemIdentities) {
        const listPage = createItemListPage(page);
        await listPage.open();
        await listPage.fillSearchForResidueCheck(identity);
        await listPage.expectEmptySearchResults();
        uiItemResidue[identity] = 0;
      }
    } catch (error) {
      cleanupDiagnostic = [cleanupDiagnostic, String(error)].filter(Boolean).join('\n');
    }
    const ledger = executionLedger.snapshot();
    const incompleteLedgerEntries = ledger.entries.filter((entry) => entry.phase !== 'residue-verified').length;
    if (Object.values(apiItemResidue).every((count) => count === 0) && incompleteLedgerEntries === 0) {
      for (const intent of intents) mutationJournal.markPhase(intent.intentId, 'cleanup-complete');
    }
    cleanupEvidence = {
      apiItemResidue,
      uiItemResidue,
      ledgerEntries: ledger.entries.length,
      residueVerified: ledger.entries.filter((entry) => entry.phase === 'residue-verified').length,
      incompleteLedgerEntries,
      cleanupDiagnostic,
    };
    const report = {
      schemaVersion: '1.0.0',
      runId,
      waveId: 'wave-b-list',
      status: Object.keys(caseEvidence).length === caseIds.length
        && Object.values(apiItemResidue).every((count) => count === 0)
        && Object.keys(uiItemResidue).length === itemIdentities.length
        && incompleteLedgerEntries === 0
        && !executionDiagnostic
        && !cleanupDiagnostic
        ? 'accepted'
        : 'incomplete',
      caseIds,
      acceptedCaseIds: Object.keys(caseEvidence).sort(),
      caseEvidence,
      runtimeDiagnostics,
      executionDiagnostic,
      cleanupEvidence,
      mutationIntents: mutationJournal.snapshot().entries.map((entry) => ({
        intentId: entry.intentId,
        unitId: entry.unitId,
        phase: entry.phase,
        reconciliation: entry.reconciliation,
        serverId: entry.serverId,
        ledgerEntryId: entry.ledgerEntryId,
      })),
    };
    writeJsonAtomic(path.resolve(`output/audit/product-center-item-p0-wave-b-${runId}.json`), report);
    await testInfo.attach('product-center-item-p0-wave-b-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function createStandard(identity: string): Promise<ProductCenterItemCreateRecord> {
    expect(await itemFactory.itemRecordCount(identity)).toBe(0);
    const context = itemContext(identity, 'standard');
    const response = await productCenterApi.createBomProduct(identity);
    return itemFactory.registerCreated(context, response, cleanupRegistry);
  }

  async function createSide(identity: string): Promise<ProductCenterItemCreateRecord> {
    expect(await itemFactory.itemRecordCount(identity)).toBe(0);
    const context = itemContext(identity, 'side');
    const sidePage = new ItemCreateSidePage(page);
    await sidePage.open();
    await sidePage.fillItemName(identity);
    await sidePage.fillStandardPrice('1.00');
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/ops-brand/brand-items/standard')
    ), { timeout: 60_000 });
    await sidePage.clickSave();
    const response = await responsePromise;
    const responseBody = await response.json().catch(() => null);
    await createItemListPage(page).expectLoaded();
    return itemFactory.registerCreated(context, responseBody, cleanupRegistry);
  }

  async function verifyCombinedQuery(identity: string, typeLabel: string): Promise<unknown> {
    const listPage = createItemListPage(page);
    await listPage.open();
    await listPage.fillSearch(identity);
    await listPage.selectTypeFilterOption(typeLabel);
    const responsePromise = waitForPageQuery();
    await listPage.selectStatusFilterOption(itemListFilterOptionsDom.statusEnabled);
    const response = await responsePromise;
    await listPage.expectUniqueItemVisible(identity);
    expect(await listPage.readItemTypeText(identity)).toBe(typeLabel);
    expect(await listPage.readItemStatusText(identity)).toBe(itemListFilterOptionsDom.statusEnabled);
    const rowCount = await listPage.readVisibleRowCount();
    const totalText = await listPage.readPaginationTotalText();
    expect(rowCount).toBe(1);
    expect(totalText).toMatch(/Total 1 item/);
    return { identity, typeLabel, status: itemListFilterOptionsDom.statusEnabled, rowCount, totalText, response: responseEvidence(response) };
  }

  async function verifyReset(typeLabels: string[]): Promise<unknown> {
    const listPage = createItemListPage(page);
    await listPage.open();
    await listPage.setTypeFilterOptions(typeLabels);
    await listPage.selectStatusFilterOption(itemListFilterOptionsDom.statusEnabled);
    await listPage.expectAllVisibleRowsMatchTypes(typeLabels);
    await listPage.expectAllVisibleRowsMatchStatus(itemListFilterOptionsDom.statusEnabled);
    const resetResponsePromise = waitForPageQuery();
    await listPage.clickReset();
    const response = await resetResponsePromise;
    const state = await listPage.readFilterState();
    expect(state).toEqual({ search: '', checkedTypeCount: 0, checkedStatusCount: 0, currentPage: 1 });
    return { typeLabels, state, visibleRows: await listPage.readVisibleRowCount(), response: responseEvidence(response) };
  }

  async function changeLifecycle(
    identity: string,
    action: 'enable' | 'disable',
    expectedStatus: string,
  ): Promise<unknown> {
    const listPage = createItemListPage(page);
    await listPage.open();
    await listPage.fillSearch(identity);
    await listPage.expectUniqueItemVisible(identity);
    await listPage.openRowActionMenu(identity);
    const lifecyclePath = '/ops-brand/brand-items/updateStatus';
    const intent = recordIntent(`lifecycle-${action}`, identity, 'L3-crud', 'PUT', lifecyclePath);
    const response = await captureMutation('PUT', lifecyclePath, () => listPage.clickRowLifecycleAction(action));
    mutationJournal.markPhase(intent.intentId, 'response-observed');
    await waitForRowStatus(listPage, identity, expectedStatus);
    mutationJournal.markPhase(intent.intentId, 'verification-complete');
    return { identity, action, expectedStatus, response: responseEvidence(response), messages: await listPage.readVisibleMessages() };
  }

  async function attemptDelete(
    identity: string,
    outcome: 'success' | 'blocked',
  ): Promise<{
    identity: string;
    outcome: 'success' | 'blocked';
    deleteDialogText: string;
    response: ReturnType<typeof responseEvidence>;
    body: unknown;
    beforeCount: number;
    afterCount: number;
    messages: string[];
  }> {
    const listPage = createItemListPage(page);
    await listPage.open();
    await listPage.fillSearch(identity);
    await listPage.expectUniqueItemVisible(identity);
    const beforeCount = await itemFactory.itemRecordCount(identity);
    await listPage.openRowActionMenu(identity);
    await listPage.clickRowActionDelete();
    const deleteDialogText = await listPage.readDeleteDialogText();
    const intent = recordIntent(`delete-${outcome}`, identity, outcome === 'blocked' ? 'L2-controlled-negative' : 'L3-crud', 'DELETE', '/ops-brand/brand-items/delete');
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'DELETE'
      && new URL(response.url()).pathname.endsWith('/ops-brand/brand-items/delete')
    ), { timeout: 60_000 });
    mutationJournal.markPhase(intent.intentId, 'trigger-started');
    await listPage.confirmDeleteDialog();
    const response = await responsePromise;
    mutationJournal.markPhase(intent.intentId, 'response-observed');
    const body = await response.json().catch(() => null);
    const afterCount = await itemFactory.itemRecordCount(identity);
    expect(beforeCount).toBe(1);
    mutationJournal.markPhase(intent.intentId, 'verification-complete');
    return { identity, outcome, deleteDialogText, response: responseEvidence(response), body, beforeCount, afterCount, messages: await listPage.readVisibleMessages() };
  }

  function recordIntent(
    action: string,
    identity: string,
    safetyLevel: 'L2-controlled-negative' | 'L3-crud',
    method: string,
    operationPath: string,
  ): { intentId: string; identity: string } {
    const requestFingerprint = createHash('sha256').update(`${runId}:${action}:${identity}:${method}:${operationPath}`).digest('hex');
    const intentId = `intent:wave-b-${action}:${requestFingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: `audit-unit:wave-b-${action}`,
      safetyLevel,
      entity: 'item',
      identity,
      identityVariants: [identity],
      operation: { method, path: operationPath },
      requestFingerprint,
    });
    intents.push({ intentId, identity });
    mutationJournal.markPhase(intentId, 'trigger-started');
    return { intentId, identity };
  }

  async function captureMutation(
    method: 'POST' | 'PUT',
    operationPath: string,
    trigger: () => Promise<void>,
  ): Promise<Response> {
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === method
      && new URL(response.url()).pathname.endsWith(operationPath)
    ), { timeout: 60_000 });
    await trigger();
    return responsePromise;
  }

  function waitForPageQuery(): Promise<Response> {
    return page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/ops-brand/brand-items/pageQuery')
    ), { timeout: 60_000 });
  }
});

function itemContext(identity: string, productType: 'standard' | 'side'): ProductCenterItemCreateContext {
  return {
    entityKey: 'item',
    productType,
    originalIdentity: identity,
    price: '1.00',
    minimumOrderQuantity: '1',
  };
}

async function waitForRowStatus(listPage: ItemListPage, identity: string, expectedStatus: string): Promise<void> {
  await waitUntil(
    () => listPage.readItemStatusText(identity),
    (status) => status === expectedStatus,
    { timeout: 30_000, message: `商品 ${identity} 状态未变为 ${expectedStatus}。` },
  );
}

function responseEvidence(response: Response): { method: string; path: string; status: number } {
  return {
    method: response.request().method(),
    path: new URL(response.url()).pathname,
    status: response.status(),
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

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
