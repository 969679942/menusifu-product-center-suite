import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Response } from '@playwright/test';
import { MutationIntentJournal } from '../../api/product-center/mutation-intent-journal';
import { test, expect } from '../../fixtures/product-center.fixture';
import { createItemListPage } from '../../pages/product-management/item/item-list.page';
import { createCombosPage } from '../../pages/product-management/group-list.factory';
import { ItemCreateComboPage } from '../../pages/product-management/item/item-create-combo.page';
import { ItemEditComboPage } from '../../pages/product-management/item/item-edit.page';
import {
  ProductCenterItemCreateDataFactory,
  type ProductCenterItemCreateContext,
} from '../../test-data/product-center/product-center-item-create-data.factory';
import { buildProductCenterItemComboAuditModel } from '../../utils/product-center-item-combo-audit-model';

const caseIds = [
  'TC-ITEM-PKG-002',
  'TC-ITEM-PKG-004',
  'TC-ITEM-PKG-006',
  'TC-ITEM-PKG-007',
  'TC-ITEM-PKG-010',
  'TC-ITEM-PKG-017',
  'TC-ITEM-PKG-040',
  'TC-ITEM-PKG-041',
] as const;

test('Wave A 套餐 8 条 P0 用例整波技术验收', async ({
  page,
  productCenterApi,
  cleanupRegistry,
}, testInfo) => {
  test.setTimeout(600_000);
  test.skip(process.env.PC_P0_WAVE_A_LIVE !== '1', '未启用 Wave A 认证实时验收');
  const runId = process.env.PC_P0_WAVE_A_RUN_ID ?? `AUTO_AUDIT_P0_WAVE_A_${Date.now()}`;
  const factory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const mutationJournal = new MutationIntentJournal({
    rootDir: path.resolve('output/mutation-intents'),
    runId,
  });
  const firstSeed = await factory.prepareComboRequiredOnly(cleanupRegistry);
  const secondSeed = await factory.prepareComboRequiredOnly(cleanupRegistry);
  if (!firstSeed.comboGroupName || !firstSeed.customComboGroupName || !firstSeed.dependencyProductIdentity
    || !secondSeed.dependencyProductIdentity) {
    throw new Error('Wave A 审计数据缺少固定组、自定义组或依赖商品');
  }

  const fixedGroupName = `${firstSeed.comboGroupName}_ADDED`;
  const customGroupName = firstSeed.customComboGroupName;
  const fixedItem = itemContext(firstSeed, `${firstSeed.originalIdentity}_FIXED`, fixedGroupName);
  const customItem = itemContext(firstSeed, `${firstSeed.originalIdentity}_CUSTOM`, customGroupName);
  const missingPriceItem = itemContext(firstSeed, `${firstSeed.originalIdentity}_NO_PRICE`, firstSeed.comboGroupName);
  const itemContexts = [fixedItem, customItem, missingPriceItem];
  const registeredItems = new Set<string>();
  const groupIntents = [
    createGroupIntent(mutationJournal, runId, 'combo:add-fixed', fixedGroupName),
    createGroupIntent(mutationJournal, runId, 'combo:add-custom', customGroupName),
  ];
  const registeredGroups = new Set<string>();
  const caseEvidence: Record<string, unknown> = {};
  let cleanupEvidence: unknown;

  try {
    for (const context of itemContexts) {
      expect(await factory.itemRecordCount(context.originalIdentity)).toBe(0);
    }
    expect(await factory.comboGroupRecordCount(fixedGroupName)).toBe(0);
    expect(await factory.comboGroupRecordCount(customGroupName)).toBe(0);

    const selectionPage = new ItemCreateComboPage(page);
    await selectionPage.open();
    const fixedSelection = await selectionPage.probeExistingComboGroupSelection({
      comboType: 'fixed',
      groupName: firstSeed.comboGroupName,
    });
    expect(fixedSelection).toMatchObject({
      route: '/pp/brand/create/combo',
      confirmDisabledBeforeSelection: true,
      confirmEnabledAfterSelection: true,
      confirmDisabledAfterRemoval: true,
      returnedCardCount: 1,
    });
    expect(fixedSelection.selectedNameCount).toBeGreaterThanOrEqual(2);
    caseEvidence['TC-ITEM-PKG-002'] = fixedSelection;
    caseEvidence['TC-ITEM-PKG-040'] = {
      confirmDisabledBeforeSelection: fixedSelection.confirmDisabledBeforeSelection,
    };
    caseEvidence['TC-ITEM-PKG-041'] = {
      confirmEnabledAfterSelection: fixedSelection.confirmEnabledAfterSelection,
      returnedCardCount: fixedSelection.returnedCardCount,
      route: fixedSelection.route,
    };

    const fixedCreatePage = new ItemCreateComboPage(page);
    await fixedCreatePage.open();
    await fixedCreatePage.fillItemName(fixedItem.originalIdentity);
    await fixedCreatePage.clickAdvancedSettings();
    await fixedCreatePage.fillMinimumOrderQuantity('1');
    await fixedCreatePage.fillStandardPrice('29.99');
    const fixedIntent = groupIntents.find((item) => item.name === fixedGroupName)!;
    const fixedAdded = await fixedCreatePage.addFixedComboGroup({
      groupName: fixedGroupName,
      productName: firstSeed.dependencyProductIdentity,
      beforeCreateTrigger: () => mutationJournal.markPhase(fixedIntent.intentId, 'trigger-started'),
    });
    const fixedGroupRecord = await registerGroup(
      factory,
      cleanupRegistry,
      mutationJournal,
      fixedIntent,
      fixedAdded.response,
    );
    registeredGroups.add(fixedGroupName);
    const fixedSave = await saveCurrentComboItem(fixedCreatePage, fixedItem, factory, cleanupRegistry);
    registeredItems.add(fixedItem.originalIdentity);
    const fixedVerification = await verifyCreatedComboItem(page, fixedItem.originalIdentity, fixedGroupName, 29.99);
    mutationJournal.markPhase(fixedIntent.intentId, 'verification-complete');
    caseEvidence['TC-ITEM-PKG-006'] = {
      group: {
        id: fixedGroupRecord.id,
        responseMethod: fixedAdded.response.request().method(),
        responsePath: new URL(fixedAdded.response.url()).pathname,
        responseStatus: fixedAdded.response.status(),
        returnedCardCount: fixedAdded.returnedCardCount,
      },
      item: fixedSave,
      verification: fixedVerification,
    };

    const customCreatePage = new ItemCreateComboPage(page);
    await customCreatePage.open();
    await customCreatePage.fillItemName(customItem.originalIdentity);
    await customCreatePage.clickAdvancedSettings();
    await customCreatePage.fillMinimumOrderQuantity('1');
    await customCreatePage.fillStandardPrice('39.99');
    const customIntent = groupIntents.find((item) => item.name === customGroupName)!;
    const customAdded = await customCreatePage.addCustomComboGroup({
      groupName: customGroupName,
      productName: firstSeed.dependencyProductIdentity,
      additionalProductNames: [secondSeed.dependencyProductIdentity],
      selectionQuantity: '1',
      allowDuplicateSelection: false,
      beforeCreateTrigger: () => mutationJournal.markPhase(customIntent.intentId, 'trigger-started'),
    });
    const customGroupRecord = await registerGroup(
      factory,
      cleanupRegistry,
      mutationJournal,
      customIntent,
      customAdded.response,
    );
    registeredGroups.add(customGroupName);
    const customSave = await saveCurrentComboItem(customCreatePage, customItem, factory, cleanupRegistry);
    registeredItems.add(customItem.originalIdentity);
    const customVerification = await verifyCreatedComboItem(page, customItem.originalIdentity, customGroupName, 39.99);
    mutationJournal.markPhase(customIntent.intentId, 'verification-complete');
    expect(customAdded.boundary.cardText).toContain(firstSeed.dependencyProductIdentity);
    expect(customAdded.boundary.cardText).toContain(secondSeed.dependencyProductIdentity);
    caseEvidence['TC-ITEM-PKG-007'] = {
      group: {
        id: customGroupRecord.id,
        responseMethod: customAdded.response.request().method(),
        responsePath: new URL(customAdded.response.url()).pathname,
        responseStatus: customAdded.response.status(),
        dialog: customAdded.dialog,
        boundary: customAdded.boundary,
      },
      item: customSave,
      verification: customVerification,
    };

    const customSelectionPage = new ItemCreateComboPage(page);
    await customSelectionPage.open();
    const customSelection = await customSelectionPage.probeExistingComboGroupSelection({
      comboType: 'custom',
      groupName: customGroupName,
    });
    expect(customSelection).toMatchObject({
      route: '/pp/brand/create/combo',
      confirmDisabledBeforeSelection: true,
      confirmEnabledAfterSelection: true,
      confirmDisabledAfterRemoval: true,
      returnedCardCount: 1,
    });
    caseEvidence['TC-ITEM-PKG-004'] = customSelection;

    const missingNamePage = new ItemCreateComboPage(page);
    await missingNamePage.open();
    const missingName = await missingNamePage.attemptSaveWithMissingRequiredField({
      missingField: 'item-name',
      minimumOrderQuantity: '1',
      price: '10.00',
      comboGroupName: firstSeed.comboGroupName,
    });
    expect(missingName).toMatchObject({
      route: '/pp/brand/create/combo',
      errorCount: 1,
      successMessageCount: 0,
      mutationCount: 0,
    });
    caseEvidence['TC-ITEM-PKG-010'] = missingName;

    const missingPricePage = new ItemCreateComboPage(page);
    await missingPricePage.open();
    const missingPrice = await missingPricePage.attemptSaveWithMissingRequiredField({
      missingField: 'standard-price',
      itemName: missingPriceItem.originalIdentity,
      minimumOrderQuantity: '1',
      comboGroupName: firstSeed.comboGroupName,
    });
    expect(missingPrice).toMatchObject({
      route: '/pp/brand/create/combo',
      errorCount: 1,
      successMessageCount: 0,
      mutationCount: 0,
    });
    expect(await factory.itemRecordCount(missingPriceItem.originalIdentity)).toBe(0);
    caseEvidence['TC-ITEM-PKG-017'] = {
      ...missingPrice,
      apiRecordCount: 0,
    };

    expect(Object.keys(caseEvidence).sort()).toEqual([...caseIds].sort());
  } finally {
    for (const intent of groupIntents) {
      if (registeredGroups.has(intent.name)) continue;
      const count = await factory.comboGroupRecordCount(intent.name);
      if (count === 0) {
        mutationJournal.recordReconciliation(intent.intentId, 'absent');
        continue;
      }
      if (count !== 1) {
        mutationJournal.recordReconciliation(intent.intentId, 'ambiguous');
        throw new Error(`Wave A 套餐组对账不唯一：${intent.name} count=${count}`);
      }
      const record = await factory.registerComboGroupCreated(
        intent.name,
        null,
        cleanupRegistry,
        intent.intentId,
      );
      mutationJournal.attachServerIdentity(intent.intentId, {
        serverId: record.id,
        ledgerEntryId: record.checkpointEntryId,
      });
      mutationJournal.recordReconciliation(intent.intentId, 'present');
      registeredGroups.add(intent.name);
    }
    for (const context of itemContexts) {
      if (registeredItems.has(context.originalIdentity)) continue;
      if (await factory.itemRecordCount(context.originalIdentity) === 1) {
        await factory.registerCreated(context, null, cleanupRegistry);
        registeredItems.add(context.originalIdentity);
      }
    }

    await cleanupRegistry.cleanupAll();
    const groupIdentities = [...new Set([
      firstSeed.comboGroupName,
      secondSeed.comboGroupName,
      ...groupIntents.map((intent) => intent.name),
    ].filter((identity): identity is string => Boolean(identity)))];
    const itemIdentities = [...new Set([
      firstSeed.dependencyProductIdentity,
      secondSeed.dependencyProductIdentity,
      ...itemContexts.map((context) => context.originalIdentity),
    ].filter((identity): identity is string => Boolean(identity)))];
    const groupResidue = Object.fromEntries(await Promise.all(groupIdentities.map(async (identity) => (
      [identity, await factory.comboGroupRecordCount(identity)] as const
    ))));
    const itemResidue = Object.fromEntries(await Promise.all(itemIdentities.map(async (identity) => (
      [identity, await factory.itemRecordCount(identity)] as const
    ))));
    for (const intent of groupIntents) {
      if (groupResidue[intent.name] !== 0) throw new Error(`Wave A 套餐组清理残留：${intent.name}`);
      mutationJournal.markPhase(intent.intentId, 'cleanup-complete');
    }
    for (const count of Object.values(groupResidue)) expect(count).toBe(0);
    for (const count of Object.values(itemResidue)) expect(count).toBe(0);
    const uiResidue = await verifyUiResidue(page, itemIdentities, groupIdentities);
    cleanupEvidence = { groupResidue, itemResidue, uiResidue };

    const report = {
      schemaVersion: '1.0.0',
      runId,
      waveId: 'wave-a-combo',
      status: Object.keys(caseEvidence).length === caseIds.length ? 'accepted' : 'incomplete',
      caseIds,
      acceptedCaseIds: Object.keys(caseEvidence).sort(),
      caseEvidence,
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
    writeJsonAtomic(path.resolve(`output/audit/product-center-item-p0-wave-a-${runId}.json`), report);
    await testInfo.attach('product-center-item-p0-wave-a-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
  }
});

function itemContext(
  seed: ProductCenterItemCreateContext,
  originalIdentity: string,
  comboGroupName: string,
): ProductCenterItemCreateContext {
  return { ...seed, originalIdentity, comboGroupName };
}

function createGroupIntent(
  journal: MutationIntentJournal,
  runId: string,
  actionRoot: 'combo:add-fixed' | 'combo:add-custom',
  name: string,
): { intentId: string; name: string } {
  const unit = buildProductCenterItemComboAuditModel().denominator.units.find((candidate) => (
    candidate.route === '/pp/brand/create/combo'
    && candidate.actionId.startsWith(actionRoot)
    && candidate.stateId.includes('terminal-card')
  ));
  if (!unit) throw new Error(`Wave A 缺少 L3 单元：${actionRoot}`);
  const requestFingerprint = createHash('sha256')
    .update(`${runId}:POST:/ops-brand/brand-sections:${name}`)
    .digest('hex');
  const intentId = `intent:${actionRoot.replace(/[^a-z]+/g, '-')}:${requestFingerprint.slice(0, 24)}`;
  journal.recordIntent({
    intentId,
    unitId: unit.id,
    safetyLevel: 'L3-crud',
    entity: 'combo',
    identity: name,
    identityVariants: [name],
    operation: { method: 'POST', path: '/ops-brand/brand-sections' },
    requestFingerprint,
  });
  return { intentId, name };
}

async function registerGroup(
  factory: ProductCenterItemCreateDataFactory,
  cleanupRegistry: Parameters<ProductCenterItemCreateDataFactory['prepareComboRequiredOnly']>[0],
  journal: MutationIntentJournal,
  intent: { intentId: string; name: string },
  response: Response,
): Promise<{ id: number; name: string; checkpointEntryId: string }> {
  journal.markPhase(intent.intentId, 'response-observed');
  const responseBody = await response.json().catch(() => null);
  const record = await factory.registerComboGroupCreated(
    intent.name,
    responseBody,
    cleanupRegistry,
    intent.intentId,
  );
  journal.attachServerIdentity(intent.intentId, {
    serverId: record.id,
    ledgerEntryId: record.checkpointEntryId,
  });
  return record;
}

async function saveCurrentComboItem(
  comboPage: ItemCreateComboPage,
  context: ProductCenterItemCreateContext,
  factory: ProductCenterItemCreateDataFactory,
  cleanupRegistry: Parameters<ProductCenterItemCreateDataFactory['prepareComboRequiredOnly']>[0],
): Promise<{ responseMethod: string; responsePath: string; responseStatus: number; successMessageCount: number }> {
  const page = (comboPage as unknown as { page: import('@playwright/test').Page }).page;
  const responsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && new URL(response.url()).pathname.endsWith('/ops-brand/brand-items/combo')
  ), { timeout: 60_000 });
  const successPromise = comboPage.waitForSuccessMessage();
  await comboPage.clickSave();
  const response = await responsePromise;
  const responseBody = await response.json().catch(() => null);
  await factory.registerCreated(context, responseBody, cleanupRegistry);
  return {
    responseMethod: response.request().method(),
    responsePath: new URL(response.url()).pathname,
    responseStatus: response.status(),
    successMessageCount: await successPromise,
  };
}

async function verifyCreatedComboItem(
  page: import('@playwright/test').Page,
  itemName: string,
  groupName: string,
  expectedPrice: number,
): Promise<{ listPrice: number; editCardCount: number }> {
  const listPage = createItemListPage(page);
  await listPage.expectLoaded();
  await listPage.fillSearch(itemName);
  await listPage.expectUniqueItemVisible(itemName);
  const priceText = await listPage.readItemPriceText(itemName);
  const listPrice = Number(priceText.replace(/[^0-9.-]/g, ''));
  expect(listPrice).toBe(expectedPrice);
  await listPage.clickItemName(itemName);
  const editPage = new ItemEditComboPage(page);
  await editPage.expectLoaded();
  const editCardCount = await editPage.readComboGroupCardCount(groupName);
  expect(editCardCount).toBe(1);
  return { listPrice, editCardCount };
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

async function verifyUiResidue(
  page: import('@playwright/test').Page,
  itemIdentities: string[],
  groupIdentities: string[],
): Promise<{ items: Record<string, 0>; comboGroups: Record<string, 0> }> {
  const items: Record<string, 0> = {};
  const itemListPage = createItemListPage(page);
  await itemListPage.open();
  for (const identity of itemIdentities) {
    await itemListPage.fillSearch(identity);
    await itemListPage.expectEmptySearchResults();
    items[identity] = 0;
  }

  const comboGroups: Record<string, 0> = {};
  const combosPage = createCombosPage(page);
  await combosPage.open();
  for (const identity of groupIdentities) {
    await combosPage.search(identity);
    await combosPage.expectEmptySearchResults();
    comboGroups[identity] = 0;
  }
  return { items, comboGroups };
}

