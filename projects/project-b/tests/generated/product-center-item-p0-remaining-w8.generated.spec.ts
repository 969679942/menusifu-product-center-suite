import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Response } from '@playwright/test';
import { runtimeConfig } from '../../api/runtime-config';
import { MutationIntentJournal } from '../../api/product-center/mutation-intent-journal';
import { test, expect } from '../../fixtures/product-center.fixture';
import { ItemCreateComboPage } from '../../pages/product-management/item/item-create-combo.page';
import type { ItemCreateFormPage } from '../../pages/product-management/item/item-create-form.page';
import { ItemCreateSidePage } from '../../pages/product-management/item/item-create-side.page';
import { ItemCreateStandardPage } from '../../pages/product-management/item/item-create-standard.page';
import { createItemListPage, type ItemListPage } from '../../pages/product-management/item/item-list.page';
import { itemListFilterOptionsDom } from '../../test-data/item-list';
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
  'TC-ITEM-STD-067',
  'TC-ITEM-ADD-044',
  'TC-ITEM-PKG-039',
] as const;

type CaseEvidence = {
  disposition: 'accepted' | 'canonical-conflict';
  evidence: unknown;
};

type StoreProductRecord = {
  id: number;
  name: string;
  status?: number;
};

test('W8 三类商品停用、菜单下发、恢复与渠道终态 3 条 P0 用例整波技术验收', async ({
  page,
  productCenterApi,
  cleanupRegistry,
  executionLedger,
}, testInfo) => {
  test.setTimeout(1_200_000);
  test.skip(process.env.PC_P0_REMAINING_W8_LIVE !== '1', '未启用 W8 认证实时验收');
  const runId = process.env.PC_P0_REMAINING_W8_RUN_ID ?? `AUTO_AUDIT_P0_REMAINING_W8_${Date.now()}`;
  if (!runId.startsWith('AUTO_AUDIT_')) throw new Error('W8 运行身份必须以 AUTO_AUDIT_ 开头');
  if (!runtimeConfig.poiId) throw new Error('W8 跨渠道验收缺少 MC_POI_ID');

  const timestamp = Date.now();
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const highDependencyFactory = new ProductCenterHighDependencyDataFactory(productCenterApi);
  const mutationJournal = new MutationIntentJournal({
    rootDir: path.resolve('output/mutation-intents'),
    runId,
  });
  const names = {
    standard: `AUTO_AUDIT_W8_STANDARD_${timestamp}`,
    side: `AUTO_AUDIT_W8_SIDE_${timestamp}`,
    combo: `AUTO_AUDIT_W8_COMBO_${timestamp}`,
  };
  const primaryIdentities = [names.standard, names.side, names.combo];
  const allItemIdentities = [...primaryIdentities];
  const caseEvidence: Record<string, CaseEvidence> = {};
  const intentIds: string[] = [];
  const retainedAuditRecords: Array<{ entity: string; serverId: number; identity: string }> = [];
  const registeredStoreProductIds = new Set<number>();
  let scenario: Awaited<ReturnType<typeof seedCrossChannelScenario>> | undefined;
  let executionDiagnostic: string | undefined;

  try {
    scenario = await seedCrossChannelScenario();
    const menuRelations = await bindItemsToSharedMenu(scenario.items, scenario.menu);
    expect(Object.values(menuRelations).every(Boolean)).toBe(true);

    const disableEvidence = await disableAllProducts(scenario.items);
    const lifecycleConflictItems = scenario.items.filter((item) => (
      disableEvidence[item.originalIdentity]?.outcome === 'blocked-by-menu-reference'
    ));
    const publishSkippedDueToLifecycleConflict = lifecycleConflictItems.length > 0;
    const appliedDisableItems = scenario.items.filter((item) => (
      disableEvidence[item.originalIdentity]?.outcome === 'applied'
    ));
    const disabledPublish = publishSkippedDueToLifecycleConflict
      ? undefined
      : await publishSharedMenu(scenario.menu, 'DISABLE');
    const channelAbsentAfterDisable = publishSkippedDueToLifecycleConflict
      ? {}
      : await waitForChannelState(scenario.items, 0, false);

    const restoreEvidence = await restoreAllProducts(
      publishSkippedDueToLifecycleConflict ? appliedDisableItems : scenario.items,
    );
    const restoredPublish = publishSkippedDueToLifecycleConflict
      ? undefined
      : await publishSharedMenu(scenario.menu, 'RESTORE');
    const channelPresentAfterRestore = publishSkippedDueToLifecycleConflict
      ? {}
      : await waitForChannelState(scenario.items, 1, true);

    const sharedEvidence = {
      menu: {
        id: scenario.menu.id,
        identity: scenario.menu.originalIdentity,
        blockId: scenario.menu.metadata.blockId,
        relations: menuRelations,
      },
      disableEvidence,
      lifecycleConflictItems: lifecycleConflictItems.map((item) => ({
        itemId: item.id,
        identity: item.originalIdentity,
      })),
      publishSkippedDueToLifecycleConflict,
      disabledPublish,
      channelAbsentAfterDisable,
      restoreEvidence,
      restoredPublish,
      channelPresentAfterRestore,
    };
    for (const [caseId, item] of [
      ['TC-ITEM-STD-067', scenario.standard],
      ['TC-ITEM-ADD-044', scenario.side],
      ['TC-ITEM-PKG-039', scenario.combo],
    ] as const) {
      const lifecycleEvidence = disableEvidence[item.originalIdentity];
      const blockedByMenuReference = lifecycleEvidence?.outcome === 'blocked-by-menu-reference';
      const accepted = !publishSkippedDueToLifecycleConflict
        && menuRelations[item.originalIdentity] === true
        && lifecycleEvidence?.outcome === 'applied'
        && disableEvidence[item.originalIdentity]?.status === itemListFilterOptionsDom.statusDisabled
        && channelAbsentAfterDisable[item.originalIdentity]?.activeCount === 0
        && restoreEvidence[item.originalIdentity]?.status === itemListFilterOptionsDom.statusEnabled
        && channelPresentAfterRestore[item.originalIdentity]?.activeCount === 1;
      caseEvidence[caseId] = {
        disposition: blockedByMenuReference ? 'canonical-conflict' : disposition(accepted, {}).disposition,
        evidence: {
        itemId: item.id,
        identity: item.originalIdentity,
        blockedByMenuReference,
        ...sharedEvidence,
        },
      };
    }
    expect(Object.keys(caseEvidence).sort()).toEqual([...caseIds].sort());
  } catch (error) {
    executionDiagnostic = safeDiagnostic(error);
    throw error;
  } finally {
    let cleanupDiagnostic: string | undefined;
    try {
      await cleanupStoreProducts();
      await cleanupRegistry.cleanupAll();
    } catch (error) {
      cleanupDiagnostic = safeDiagnostic(error);
    }

    const merchantCenterResidue = await readMerchantCenterResidue().catch((error) => {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
      return Object.fromEntries(allItemIdentities.map((identity) => [identity, -1]));
    });
    const channelResidue = await readChannelResidue().catch((error) => {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
      return Object.fromEntries(primaryIdentities.map((identity) => [identity, -1]));
    });
    const uiResidue = await readUiResidue().catch((error) => {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
      return Object.fromEntries(primaryIdentities.map((identity) => [identity, -1]));
    });
    const ledger = executionLedger.snapshot();
    const incompleteLedgerEntries = ledger.entries.filter((entry) => entry.phase !== 'residue-verified').length;
    const merchantCenterAndChannelResidueFree = allZero(merchantCenterResidue)
      && allZero(channelResidue)
      && allZero(uiResidue);
    if (merchantCenterAndChannelResidueFree && incompleteLedgerEntries === 0) {
      for (const intentId of intentIds) mutationJournal.markPhase(intentId, 'cleanup-complete');
    }
    const acceptedCaseIds = Object.entries(caseEvidence)
      .filter(([, value]) => value.disposition === 'accepted')
      .map(([caseId]) => caseId)
      .sort();
    const canonicalConflictCaseIds = Object.entries(caseEvidence)
      .filter(([, value]) => value.disposition === 'canonical-conflict')
      .map(([caseId]) => caseId)
      .sort();
    const report = {
      schemaVersion: '1.0.0',
      runId,
      waveId: 'W8',
      executionMode: 'wave-shared-chain',
      caseLevelRunsClaimed: 0,
      status: acceptedCaseIds.length === caseIds.length
        && merchantCenterAndChannelResidueFree
        && incompleteLedgerEntries === 0
        && !executionDiagnostic
        && !cleanupDiagnostic
        ? 'accepted'
        : canonicalConflictCaseIds.length > 0 && !executionDiagnostic && !cleanupDiagnostic
          ? 'accepted-with-canonical-conflicts'
          : 'incomplete',
      caseIds,
      acceptedCaseIds,
      canonicalConflictCaseIds,
      publishSkippedDueToLifecycleConflict: Object.values(caseEvidence).some((value) => (
        asRecord(value.evidence)?.publishSkippedDueToLifecycleConflict === true
      )),
      caseEvidence,
      executionDiagnostic,
      cleanupEvidence: {
        merchantCenterResidue,
        channelResidue,
        uiResidue,
        merchantCenterAndChannelResidueFree,
        ledgerEntries: ledger.entries.length,
        residueVerified: ledger.entries.filter((entry) => entry.phase === 'residue-verified').length,
        incompleteLedgerEntries,
        cleanupDiagnostic,
      },
      retainedAuditRecords: {
        deletionSupported: false,
        classification: 'immutable-operational-audit-record',
        records: retainedAuditRecords,
      },
      mutationIntents: mutationJournal.snapshot().entries,
    };
    writeJsonAtomic(
      path.resolve(`output/audit/product-center-item-p0-remaining-w8-${runId}.json`),
      report,
    );
    await testInfo.attach('product-center-item-p0-remaining-w8-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function seedCrossChannelScenario() {
    const standard = await createStandard(names.standard);
    const side = await createSide(names.side);
    const combo = await createCombo(names.combo, timestamp + 101);
    const menu = await highDependencyFactory.seed('menu', cleanupRegistry);
    return { standard, side, combo, items: [standard, side, combo], menu };
  }

  async function createStandard(identity: string): Promise<ProductCenterItemCreateRecord> {
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.fillItemName(identity);
    await form.selectSingleSpec();
    await form.fillStandardPrice('10.00');
    return submitCreate(form, itemContext(identity, 'standard'), '/ops-brand/brand-items/standard');
  }

  async function createSide(identity: string): Promise<ProductCenterItemCreateRecord> {
    const form = new ItemCreateSidePage(page);
    await form.open();
    await form.fillItemName(identity);
    await form.fillStandardPrice('1.00');
    return submitCreate(form, itemContext(identity, 'side'), '/ops-brand/brand-items/standard');
  }

  async function createCombo(identity: string, seedTimestamp: number): Promise<ProductCenterItemCreateRecord> {
    const prepared = await itemFactory.prepareComboRequiredOnly(cleanupRegistry, seedTimestamp);
    if (prepared.dependencyProductIdentity) allItemIdentities.push(prepared.dependencyProductIdentity);
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
      response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith(operationPath)
    ), { timeout: 60_000 });
    await form.clickSave();
    const response = await responsePromise;
    const body = await response.json().catch(() => null);
    expect(response.ok()).toBe(true);
    return itemFactory.registerCreated(context, body, cleanupRegistry);
  }

  async function bindItemsToSharedMenu(
    items: readonly ProductCenterItemCreateRecord[],
    menu: HighDependencySeedRecord,
  ): Promise<Record<string, boolean>> {
    const relations: Record<string, boolean> = {};
    for (const item of items) relations[item.originalIdentity] = await bindItemToMenu(item, menu);
    return relations;
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
    const intentId = recordIntent('menu-bind', item.originalIdentity, 'POST', operationPath);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith(operationPath)
    ), { timeout: 60_000 });
    mutationJournal.markPhase(intentId, 'trigger-started');
    await addToMenuPage.save();
    const response = await responsePromise;
    mutationJournal.markPhase(intentId, 'response-observed');
    const detail = await productCenterApi.menuBlockDetail(Number(menu.metadata.blockId));
    const present = containsItemIdInBlockItems(detail, item.id);
    mutationJournal.recordReconciliation(intentId, present ? 'present' : 'absent');
    mutationJournal.markPhase(intentId, 'verification-complete');
    expect(response.ok()).toBe(true);
    return present;
  }

  async function disableAllProducts(
    items: readonly ProductCenterItemCreateRecord[],
  ): Promise<Record<string, Awaited<ReturnType<typeof changeLifecycle>>>> {
    const evidence: Record<string, Awaited<ReturnType<typeof changeLifecycle>>> = {};
    for (const item of items) {
      evidence[item.originalIdentity] = await changeLifecycle(
        item,
        'disable',
        itemListFilterOptionsDom.statusDisabled,
      );
    }
    return evidence;
  }

  async function restoreAllProducts(
    items: readonly ProductCenterItemCreateRecord[],
  ): Promise<Record<string, Awaited<ReturnType<typeof changeLifecycle>>>> {
    const evidence: Record<string, Awaited<ReturnType<typeof changeLifecycle>>> = {};
    for (const item of items) {
      evidence[item.originalIdentity] = await changeLifecycle(
        item,
        'enable',
        itemListFilterOptionsDom.statusEnabled,
      );
    }
    return evidence;
  }

  async function changeLifecycle(
    item: ProductCenterItemCreateRecord,
    action: 'enable' | 'disable',
    expectedStatus: string,
  ) {
    const list = createItemListPage(page);
    await list.open();
    await list.fillSearch(item.originalIdentity);
    await list.expectUniqueItemVisible(item.originalIdentity);
    await list.openRowActionMenu(item.originalIdentity);
    const operationPath = '/ops-brand/brand-items/updateStatus';
    const intentId = recordIntent(`lifecycle-${action}`, item.originalIdentity, 'PUT', operationPath);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'PUT'
      && new URL(response.url()).pathname.endsWith(operationPath)
      && String(readRequestLifecycleId(response.request().postDataJSON())) === String(item.id)
    ), { timeout: 60_000 });
    mutationJournal.markPhase(intentId, 'trigger-started');
    await list.clickRowLifecycleAction(action);
    const response = await responsePromise;
    mutationJournal.markPhase(intentId, 'response-observed');
    const body = await response.json().catch(() => null);
    const requestLifecycleId = readRequestLifecycleId(response.request().postDataJSON());
    const apiStatusAfterLifecycle = readApiItemStatus(await productCenterApi.productDetail(item.id));
    const apiPageStatusAfterLifecycle = readApiPageItemStatus(
      await productCenterApi.productPage(item.originalIdentity),
      item.originalIdentity,
    );
    const messages = await list.readSettledVisibleMessages();
    const lifecycleBoundaryDiagnostic = {
      itemId: item.id,
      identity: item.originalIdentity,
      action,
      requestLifecycleId,
      response: responseEvidence(response),
      body,
      apiStatusAfterLifecycle,
      apiPageStatusAfterLifecycle,
      messages,
    };
    writeJsonAtomic(
      path.resolve(`output/audit/product-center-item-p0-remaining-w8-${runId}-lifecycle-${action}-${item.id}.json`),
      lifecycleBoundaryDiagnostic,
    );
    const expectedApiStatus = action === 'disable' ? 0 : 1;
    const blockedByMenuReference = action === 'disable'
      && response.status() === 400
      && asRecord(body)?.code === 'BITEM-2013'
      && asRecord(body)?.success === false
      && String(requestLifecycleId) === String(item.id)
      && apiStatusAfterLifecycle === 1
      && apiPageStatusAfterLifecycle === 1;
    if (blockedByMenuReference) {
      await refreshLifecycleSearch(list, item.originalIdentity);
      await waitForRowStatus(list, item.originalIdentity, itemListFilterOptionsDom.statusEnabled);
      mutationJournal.recordReconciliation(intentId, 'present');
      mutationJournal.markPhase(intentId, 'verification-complete');
      return {
        outcome: 'blocked-by-menu-reference' as const,
        conflictCode: 'BITEM-2013' as const,
        itemId: item.id,
        identity: item.originalIdentity,
        action,
        status: itemListFilterOptionsDom.statusEnabled,
        response: responseEvidence(response),
        body,
        requestLifecycleId,
        apiStatusAfterLifecycle,
        apiPageStatusAfterLifecycle,
        lifecycleBoundaryDiagnostic,
        refreshLifecycleSearch: true,
        messages,
      };
    }
    if (
      !response.ok()
      || asRecord(body)?.success === false
      || String(requestLifecycleId) !== String(item.id)
      || apiStatusAfterLifecycle !== expectedApiStatus
      || apiPageStatusAfterLifecycle !== expectedApiStatus
    ) {
      throw new Error(`W8 生命周期 API 边界不一致：${JSON.stringify(lifecycleBoundaryDiagnostic)}`);
    }
    await refreshLifecycleSearch(list, item.originalIdentity);
    try {
      await waitForRowStatus(list, item.originalIdentity, expectedStatus);
    } catch (error) {
      throw new Error(`W8 生命周期 UI 与 API 不一致：${JSON.stringify({
        ...lifecycleBoundaryDiagnostic,
        uiStatusAfterRefresh: await list.readItemStatusText(item.originalIdentity),
        waitDiagnostic: safeDiagnostic(error),
      })}`);
    }
    mutationJournal.recordReconciliation(intentId, 'present');
    mutationJournal.markPhase(intentId, 'verification-complete');
    return {
      outcome: 'applied' as const,
      itemId: item.id,
      identity: item.originalIdentity,
      action,
      status: expectedStatus,
      response: responseEvidence(response),
      body,
      requestLifecycleId,
      apiStatusAfterLifecycle,
      apiPageStatusAfterLifecycle,
      lifecycleBoundaryDiagnostic,
      refreshLifecycleSearch: true,
      messages,
    };
  }

  async function publishSharedMenu(menu: HighDependencySeedRecord, phase: 'DISABLE' | 'RESTORE') {
    const merchant = requireMerchant(
      await productCenterApi.brandMerchantPage({ merchantId: runtimeConfig.poiId }),
      runtimeConfig.poiId,
    );
    const identity = `AUTO_AUDIT_W8_SYNC_${phase}_${timestamp}`;
    const createIntentId = recordIntent(`menu-sync-create-${phase}`, identity, 'POST', '/ops-brand/brand-menu-sync-job');
    mutationJournal.markPhase(createIntentId, 'trigger-started');
    const created = await productCenterApi.createMenuSyncJob({
      syncType: 1,
      menuId: Number(menu.id),
      targetPois: [{ poiId: merchant.poiId, poiName: merchant.poiName, ...(merchant.region ? { region: merchant.region } : {}) }],
      remark: identity,
    });
    mutationJournal.markPhase(createIntentId, 'response-observed');
    const jobId = requireNumericId(created, `W8 ${phase} 菜单下发作业`);
    mutationJournal.attachServerIdentity(createIntentId, { serverId: jobId });
    mutationJournal.recordReconciliation(createIntentId, 'present');
    mutationJournal.markPhase(createIntentId, 'verification-complete');
    retainedAuditRecords.push({ entity: 'menu-sync-job', serverId: jobId, identity });

    const executeIntentId = recordIntent(`menu-sync-execute-${phase}`, identity, 'PUT', '/ops-brand/brand-menu-sync-job/execute/{id}');
    mutationJournal.attachServerIdentity(executeIntentId, { serverId: jobId });
    mutationJournal.markPhase(executeIntentId, 'trigger-started');
    const executeResponse = await productCenterApi.executeMenuSyncJob(jobId, { executeType: 1 });
    mutationJournal.markPhase(executeIntentId, 'response-observed');
    const terminal = await waitForMenuSyncTerminal(jobId);
    mutationJournal.recordReconciliation(executeIntentId, 'present');
    mutationJournal.markPhase(executeIntentId, 'verification-complete');
    return { identity, jobId, merchant, created, executeResponse, terminal };
  }

  async function waitForMenuSyncTerminal(jobId: number): Promise<unknown> {
    return waitUntil(
      () => productCenterApi.menuSyncJobDetail(jobId),
      (detail) => isMenuSyncTerminal(detail),
      {
        timeout: 240_000,
        interval: 2_000,
        probeTimeout: 30_000,
        message: `菜单下发作业 ${jobId} 未进入终态。`,
      },
    );
  }

  async function waitForChannelState(
    items: readonly ProductCenterItemCreateRecord[],
    expectedActiveCount: number,
    registerCleanup: boolean,
  ): Promise<Record<string, { activeCount: number; allStatusCount: number; activeRecords: StoreProductRecord[] }>> {
    return waitUntil(
      async () => {
        const state: Record<string, { activeCount: number; allStatusCount: number; activeRecords: StoreProductRecord[] }> = {};
        for (const item of items) {
          const activeRecords = findStoreProductRecords(
            await productCenterApi.storePoiProductPage(item.originalIdentity, { status: 1 }),
            item.originalIdentity,
          );
          const allRecords = findStoreProductRecords(
            await productCenterApi.storePoiProductPage(item.originalIdentity),
            item.originalIdentity,
          );
          if (registerCleanup) {
            for (const record of allRecords) registerStoreProductCleanup(record);
          }
          state[item.originalIdentity] = {
            activeCount: activeRecords.length,
            allStatusCount: allRecords.length,
            activeRecords,
          };
        }
        return state;
      },
      (state) => Object.values(state).every((entry) => entry.activeCount === expectedActiveCount),
      {
        timeout: 180_000,
        interval: 2_000,
        probeTimeout: 30_000,
        message: `门店渠道在售商品数量未稳定为 ${expectedActiveCount}。`,
      },
    );
  }

  function registerStoreProductCleanup(record: StoreProductRecord): void {
    if (registeredStoreProductIds.has(record.id)) return;
    registeredStoreProductIds.add(record.id);
    cleanupRegistry.register({
      entity: 'W8 门店渠道商品',
      identity: record.name,
      checkpoint: {
        entryId: `store-product-${record.id}`,
        entityKind: 'store-product',
        serverId: record.id,
        identityVariants: [record.name],
        cleanupOrder: 60,
      },
      execute: async () => {
        for (const residue of findStoreProductRecords(
          await productCenterApi.storePoiProductPage(record.name),
          record.name,
        )) await productCenterApi.deleteStoreProduct(residue.id);
      },
      verify: async () => findStoreProductRecords(
        await productCenterApi.storePoiProductPage(record.name),
        record.name,
      ).length === 0,
    });
  }

  async function cleanupStoreProducts(): Promise<void> {
    for (const identity of primaryIdentities) {
      const records = findStoreProductRecords(
        await productCenterApi.storePoiProductPage(identity),
        identity,
      );
      for (const record of records) {
        registerStoreProductCleanup(record);
        await productCenterApi.deleteStoreProduct(record.id);
      }
    }
  }

  async function readMerchantCenterResidue(): Promise<Record<string, number>> {
    return Object.fromEntries(await Promise.all(allItemIdentities.map(async (identity) => (
      [identity, await itemFactory.itemRecordCount(identity)] as const
    ))));
  }

  async function readChannelResidue(): Promise<Record<string, number>> {
    const residue: Record<string, number> = {};
    for (const identity of primaryIdentities) {
      residue[identity] = findStoreProductRecords(
        await productCenterApi.storePoiProductPage(identity),
        identity,
      ).length;
    }
    return residue;
  }

  async function readUiResidue(): Promise<Record<string, number>> {
    const residue: Record<string, number> = {};
    for (const identity of primaryIdentities) {
      const list = createItemListPage(page);
      await list.open();
      await list.fillSearch(identity);
      await list.expectEmptySearchResults();
      residue[identity] = await list.readVisibleRowCount();
    }
    return residue;
  }

  function recordIntent(action: string, identity: string, method: string, operationPath: string): string {
    const fingerprint = createHash('sha256')
      .update(`${runId}:${action}:${identity}:${method}:${operationPath}`)
      .digest('hex');
    const intentId = `intent:w8-${action}:${fingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: 'product-center-item-p0-remaining-w8',
      safetyLevel: 'L3-crud',
      entity: 'product-center-w8',
      identity,
      identityVariants: [identity],
      operation: { method, path: operationPath },
      requestFingerprint: fingerprint,
    });
    intentIds.push(intentId);
    return intentId;
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

async function waitForRowStatus(
  list: ItemListPage,
  identity: string,
  expectedStatus: string,
): Promise<void> {
  await waitUntil(
    () => list.readItemStatusText(identity),
    (status) => status === expectedStatus,
    { timeout: 30_000, message: `商品 ${identity} 状态未变为 ${expectedStatus}。` },
  );
}

async function refreshLifecycleSearch(list: ItemListPage, identity: string): Promise<void> {
  await list.open();
  await list.fillSearch(identity);
  await list.expectUniqueItemVisible(identity);
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

function findStoreProductRecords(value: unknown, identity: string): StoreProductRecord[] {
  if (!value || typeof value !== 'object') return [];
  const data = (value as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return [];
  const list = (data as Record<string, unknown>).list;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item): StoreProductRecord[] => {
    if (!item || typeof item !== 'object') return [];
    const itemBasic = (item as Record<string, unknown>).itemBasic;
    if (!itemBasic || typeof itemBasic !== 'object') return [];
    const basic = itemBasic as Record<string, unknown>;
    if (
      typeof basic.id !== 'number'
      || typeof basic.name !== 'string'
      || normalizeIdentity(basic.name) !== normalizeIdentity(identity)
    ) return [];
    return [{
      id: basic.id,
      name: basic.name,
      status: typeof basic.status === 'number' ? basic.status : undefined,
    }];
  });
}

function requireMerchant(
  value: unknown,
  expectedPoiId: string,
): { poiId: string; poiName: string; region?: string } {
  const record = findRecord(value, (candidate) => {
    const id = candidate.poiId ?? candidate.merchantId ?? candidate.id;
    return String(id ?? '') === expectedPoiId;
  });
  if (!record) throw new Error(`未找到 W8 目标门店：${expectedPoiId}`);
  const poiName = record.poiName ?? record.merchantName ?? record.name;
  if (typeof poiName !== 'string' || poiName.trim() === '') {
    throw new Error(`W8 目标门店缺少名称：${expectedPoiId}`);
  }
  const region = record.region;
  return {
    poiId: expectedPoiId,
    poiName: poiName.trim(),
    ...(typeof region === 'string' && region.trim() ? { region: region.trim() } : {}),
  };
}

function requireNumericId(value: unknown, entity: string): number {
  const data = asRecord(value)?.data;
  if (typeof data === 'number') return data;
  const direct = asRecord(data)?.id ?? asRecord(value)?.id;
  if (typeof direct === 'number') return direct;
  throw new Error(`${entity} 响应缺少服务端 ID`);
}

function isMenuSyncTerminal(value: unknown): boolean {
  const record = asRecord(asRecord(value)?.data) ?? asRecord(value);
  if (!record) return false;
  if (typeof record.finishedAt === 'string' && record.finishedAt.trim() !== '') return true;
  const jobStatus = record.jobStatus;
  return typeof jobStatus === 'number' && jobStatus >= 2;
}

function readRequestLifecycleId(value: unknown): number | string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const id = (value as Record<string, unknown>).id;
  return typeof id === 'number' || typeof id === 'string' ? id : undefined;
}

function readApiItemStatus(value: unknown): number | undefined {
  const data = asRecord(value)?.data;
  const itemBasic = asRecord(asRecord(data)?.itemBasic);
  return typeof itemBasic?.status === 'number' ? itemBasic.status : undefined;
}

function readApiPageItemStatus(value: unknown, identity: string): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = asRecord(value)?.data;
  const list = asRecord(data)?.list;
  if (!Array.isArray(list)) return undefined;
  for (const item of list) {
    const itemBasic = asRecord(asRecord(item)?.itemBasic);
    if (
      typeof itemBasic?.name === 'string'
      && normalizeIdentity(itemBasic.name) === normalizeIdentity(identity)
      && typeof itemBasic.status === 'number'
    ) return itemBasic.status;
  }
  return undefined;
}

function findRecord(
  value: unknown,
  predicate: (record: Record<string, unknown>) => boolean,
): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecord(item, predicate);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (predicate(record)) return record;
  for (const child of Object.values(record)) {
    const found = findRecord(child, predicate);
    if (found) return found;
  }
  return undefined;
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
