import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ConsoleMessage, Page, Request, Response } from '@playwright/test';
import { MutationIntentJournal } from '../../api/product-center/mutation-intent-journal';
import { test, expect } from '../../fixtures/product-center.fixture';
import { ItemCreateSidePage } from '../../pages/product-management/item/item-create-side.page';
import { ItemCreateStandardPage } from '../../pages/product-management/item/item-create-standard.page';
import { ItemCreateTypePage } from '../../pages/product-management/item/item-create-type.page';
import { createItemListPage } from '../../pages/product-management/item/item-list.page';
import {
  ProductCenterItemCreateDataFactory,
  type ProductCenterItemCreateContext,
  type ProductCenterItemCreateRecord,
} from '../../test-data/product-center/product-center-item-create-data.factory';
import { ProductCenterLowDependencyDataFactory, type LowDependencySeedRecord } from '../../test-data/product-center/sop/product-center-low-dependency-data.factory';
import { ProductCenterSopDataFactory, type ProductCenterSopSeedRecord } from '../../test-data/product-center/sop/product-center-sop-data.factory';
import { waitUntil } from '../../utils/wait';

const caseIds = [
  'TC-ITEM-ADD-005',
  'TC-ITEM-PKG-008',
  'TC-ITEM-STD-001',
  'TC-ITEM-STD-057',
  'TC-ITEM-STD-058',
  'TC-ITEM-STD-082',
  'TC-ITEM-STD-038',
  'TC-ITEM-STD-047',
] as const;

test('Wave C 标准商品创建配置 8 条 P0 用例整波技术验收', async ({
  page,
  productCenterApi,
  cleanupRegistry,
  executionLedger,
}, testInfo) => {
  test.setTimeout(900_000);
  test.skip(process.env.PC_P0_WAVE_C_LIVE !== '1', '未启用 Wave C 认证实时验收');
  const runId = process.env.PC_P0_WAVE_C_RUN_ID ?? `AUTO_AUDIT_P0_WAVE_C_${Date.now()}`;
  const timestamp = Date.now();
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const lowDependencyFactory = new ProductCenterLowDependencyDataFactory(productCenterApi);
  const sopFactory = new ProductCenterSopDataFactory(productCenterApi);
  const mutationJournal = new MutationIntentJournal({ rootDir: path.resolve('output/mutation-intents'), runId });
  const names = {
    side: `AUTO_AUDIT_WAVE_C_SIDE_REQUIRED_${timestamp}`,
    priceMissing: `AUTO_AUDIT_WAVE_C_PRICE_MISSING_${timestamp}`,
    multiSpec: `AUTO_AUDIT_WAVE_C_MULTI_SPEC_${timestamp}`,
    flavor: `AUTO_AUDIT_WAVE_C_FLAVOR_${timestamp}`,
    recipeAddon: `AUTO_AUDIT_WAVE_C_RECIPE_ADDON_${timestamp}`,
    printStalls: `AUTO_AUDIT_WAVE_C_PRINT_STALLS_${timestamp}`,
  };
  const itemIdentities = Object.values(names);
  const caseEvidence: Record<string, unknown> = {};
  const runtimeDiagnostics: Record<string, unknown> = {};
  const intents: Array<{ intentId: string; identity: string }> = [];
  const lowDependencies: LowDependencySeedRecord[] = [];
  let methodDependency: ProductCenterSopSeedRecord | undefined;
  let executionDiagnostic: string | undefined;

  try {
    const typePage = new ItemCreateTypePage(page);
    await typePage.open();
    const typeEntries = await typePage.readCreateEntryEvidence();
    expect(typeEntries).toEqual({ standard: 1, combo: 1, side: 1 });

    const comboPage = await typePage.enterComboCreate();
    const comboStructure = await comboPage.readCoreStructureEvidence();
    const comboGroupMenu = await comboPage.readComboGroupMenuEvidence();
    expect(comboStructure).toEqual({ basicInfo: 1, price: 1, comboGroup: 1, moreSettings: 1 });
    expect(comboGroupMenu).toMatchObject({ addFixedCount: 1, selectFixedCount: 1, addCustomCount: 1, selectCustomCount: 1 });
    await page.keyboard.press('Escape');
    caseEvidence['TC-ITEM-PKG-008'] = { typeEntries, comboStructure, comboGroupMenu };

    await typePage.open();
    const standardStructurePage = await typePage.enterStandardCreate();
    const standardStructure = await standardStructurePage.readCoreStructureEvidence();
    expect(Object.values(standardStructure).every((count) => count === 1)).toBe(true);
    await standardStructurePage.clickAdvancedSettings();
    await standardStructurePage.expectAdvancedSettingsFieldsVisible();
    const industryGoodsDisabled = await standardStructurePage.isIndustryGoodsDisabled();
    await standardStructurePage.openAddAttributeMenu();
    await standardStructurePage.expectAddAttributeMenuItemsVisible();
    await standardStructurePage.closeAddAttributeMenu();
    await standardStructurePage.expandOtherSettings();
    await standardStructurePage.expectOtherSettingsHeadingVisible();
    await standardStructurePage.expectOtherSettingsAddButtonsVisible();
    caseEvidence['TC-ITEM-STD-001'] = {
      typeEntries,
      standardStructure,
      industryGoodsFieldObserved: true,
      industryGoodsDisabled,
      attributeEntriesObserved: ['Flavor', 'Recipe', 'Additives'],
      otherSettingsObserved: true,
    };

    caseEvidence['TC-ITEM-STD-038'] = await verifyMissingStandardPrice();
    caseEvidence['TC-ITEM-ADD-005'] = await createSideRequiredOnly();

    const spec = await lowDependencyFactory.seed('spec', cleanupRegistry);
    const taste = await lowDependencyFactory.seed('taste', cleanupRegistry);
    methodDependency = await sopFactory.seed('method', cleanupRegistry);
    const addon = await lowDependencyFactory.seed('addon', cleanupRegistry);
    const printStallA = await lowDependencyFactory.seed('print-stall', cleanupRegistry);
    const printStallB = await lowDependencyFactory.seed('print-stall', cleanupRegistry);
    lowDependencies.push(spec, taste, addon, printStallA, printStallB);
    const addonProductIdentity = String(addon.metadata.productIdentity ?? '');
    if (!addonProductIdentity.startsWith('AUTO_AUDIT_')) throw new Error('Wave C 加料组缺少商品依赖身份');
    itemIdentities.push(addonProductIdentity);

    const multi = await createStandard(names.multiSpec, 'multi-spec', async (form) => {
      await form.selectMultiSpec();
      await form.selectSpecGroupByName(spec.originalIdentity);
      await form.fillAllMultiSpecPrices('2.00');
    });
    const multiDetail = await productCenterApi.productDetail(multi.record.id);
    const multiRelationPresent = containsIdentity(multiDetail, spec.originalIdentity);
    expect(multiRelationPresent).toBe(true);
    mutationJournal.markPhase(multi.intentId, 'verification-complete');
    caseEvidence['TC-ITEM-STD-047'] = {
      itemId: multi.record.id,
      specId: spec.id,
      specIdentity: spec.originalIdentity,
      relationPresent: multiRelationPresent,
      response: responseEvidence(multi.response),
      messages: multi.messages,
    };

    const flavor = await createStandard(names.flavor, 'flavor-group', async (form) => {
      await form.selectSingleSpec();
      await form.fillStandardPrice('1.00');
      await form.selectFlavorGroupByName(taste.originalIdentity);
    });
    const flavorDetail = await productCenterApi.productDetail(flavor.record.id);
    const flavorRelationPresent = containsIdentity(flavorDetail, taste.originalIdentity);
    expect(flavorRelationPresent).toBe(true);
    mutationJournal.markPhase(flavor.intentId, 'verification-complete');
    caseEvidence['TC-ITEM-STD-057'] = {
      itemId: flavor.record.id,
      tasteId: taste.id,
      tasteIdentity: taste.originalIdentity,
      relationPresent: flavorRelationPresent,
      response: responseEvidence(flavor.response),
      messages: flavor.messages,
    };

    const recipeAddon = await createStandard(names.recipeAddon, 'recipe-addon-groups', async (form) => {
      await form.selectSingleSpec();
      await form.fillStandardPrice('1.00');
      await form.selectRecipeGroupByName(methodDependency!.originalIdentity);
      await form.selectAdditivesGroupByName(addon.originalIdentity);
    });
    const recipeAddonDetail = await productCenterApi.productDetail(recipeAddon.record.id);
    const methodRelationPresent = containsIdentity(recipeAddonDetail, methodDependency.originalIdentity);
    const addonRelationPresent = containsIdentity(recipeAddonDetail, addon.originalIdentity);
    expect(methodRelationPresent).toBe(true);
    expect(addonRelationPresent).toBe(true);
    mutationJournal.markPhase(recipeAddon.intentId, 'verification-complete');
    caseEvidence['TC-ITEM-STD-058'] = {
      itemId: recipeAddon.record.id,
      methodId: methodDependency.id,
      addonId: addon.id,
      methodRelationPresent,
      addonRelationPresent,
      additionalPriceWarningConfirmed: recipeAddon.additionalPriceWarningConfirmed,
      response: responseEvidence(recipeAddon.response),
      messages: recipeAddon.messages,
    };

    const printStalls = await createStandard(names.printStalls, 'print-stalls', async (form) => {
      await form.selectSingleSpec();
      await form.fillStandardPrice('1.00');
      await form.selectPrintStallByName(printStallA.originalIdentity);
      await form.selectPrintStallByName(printStallB.originalIdentity);
      expect(await form.readSelectedPrintStallCount()).toBe(2);
    });
    const printDetail = await productCenterApi.productDetail(printStalls.record.id);
    const printStallARelationPresent = containsIdentityOrId(printDetail, printStallA.originalIdentity, printStallA.id);
    const printStallBRelationPresent = containsIdentityOrId(printDetail, printStallB.originalIdentity, printStallB.id);
    expect(printStallARelationPresent).toBe(true);
    expect(printStallBRelationPresent).toBe(true);
    mutationJournal.markPhase(printStalls.intentId, 'verification-complete');
    caseEvidence['TC-ITEM-STD-082'] = {
      itemId: printStalls.record.id,
      printStallIds: [printStallA.id, printStallB.id],
      selectedCount: 2,
      relationsPresent: [printStallARelationPresent, printStallBRelationPresent],
      response: responseEvidence(printStalls.response),
      messages: printStalls.messages,
    };

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
    const apiDependencyResidue: Record<string, number> = {};
    for (const dependency of lowDependencies) {
      apiDependencyResidue[dependency.originalIdentity] = await lowDependencyFactory.find(
        dependency.entityKey,
        dependency.originalIdentity,
      ) ? 1 : 0;
    }
    if (methodDependency) {
      apiDependencyResidue[methodDependency.originalIdentity] = await sopFactory.find(
        'method',
        methodDependency.originalIdentity,
      ) ? 1 : 0;
    }
    const uiItemResidue: Record<string, number> = {};
    const uiDependencyResidue: Record<string, number> = {};
    try {
      for (const identity of itemIdentities) {
        const listPage = createItemListPage(page);
        await listPage.open();
        await listPage.fillSearchForResidueCheck(identity);
        await listPage.expectEmptySearchResults();
        uiItemResidue[identity] = 0;
      }
      const dependencyForm = new ItemCreateStandardPage(page);
      await dependencyForm.open();
      for (const dependency of lowDependencies.filter((item) => item.entityKey !== 'print-stall')) {
        const kind = dependency.entityKey === 'spec' ? 'spec'
          : dependency.entityKey === 'taste' ? 'flavor'
          : 'additives';
        await dependencyForm.expectRuleGroupAbsent(kind, dependency.originalIdentity);
        uiDependencyResidue[dependency.originalIdentity] = 0;
      }
      if (methodDependency) {
        await dependencyForm.expectRuleGroupAbsent('recipe', methodDependency.originalIdentity);
        uiDependencyResidue[methodDependency.originalIdentity] = 0;
      }
      for (const dependency of lowDependencies.filter((item) => item.entityKey === 'print-stall')) {
        await dependencyForm.expectPrintStallAbsent(dependency.originalIdentity);
        uiDependencyResidue[dependency.originalIdentity] = 0;
      }
    } catch (error) {
      cleanupDiagnostic = [cleanupDiagnostic, String(error)].filter(Boolean).join('\n');
    }
    const ledger = executionLedger.snapshot();
    const incompleteLedgerEntries = ledger.entries.filter((entry) => entry.phase !== 'residue-verified').length;
    const residueFree = [
      ...Object.values(apiItemResidue),
      ...Object.values(apiDependencyResidue),
      ...Object.values(uiItemResidue),
      ...Object.values(uiDependencyResidue),
    ].every((count) => count === 0);
    if (residueFree && incompleteLedgerEntries === 0) {
      for (const intent of intents) mutationJournal.markPhase(intent.intentId, 'cleanup-complete');
    }
    const report = {
      schemaVersion: '1.0.0',
      runId,
      waveId: 'wave-c-standard-create',
      status: Object.keys(caseEvidence).length === caseIds.length
        && residueFree
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
      cleanupEvidence: {
        apiItemResidue,
        apiDependencyResidue,
        uiItemResidue,
        uiDependencyResidue,
        ledgerEntries: ledger.entries.length,
        residueVerified: ledger.entries.filter((entry) => entry.phase === 'residue-verified').length,
        incompleteLedgerEntries,
        cleanupDiagnostic,
      },
      mutationIntents: mutationJournal.snapshot().entries.map((entry) => ({
        intentId: entry.intentId,
        unitId: entry.unitId,
        phase: entry.phase,
        operation: entry.operation,
        serverId: entry.serverId,
        ledgerEntryId: entry.ledgerEntryId,
      })),
    };
    writeJsonAtomic(path.resolve(`output/audit/product-center-item-p0-wave-c-${runId}.json`), report);
    await testInfo.attach('product-center-item-p0-wave-c-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function verifyMissingStandardPrice(): Promise<unknown> {
    expect(await itemFactory.itemRecordCount(names.priceMissing)).toBe(0);
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.fillItemName(names.priceMissing);
    await form.selectSingleSpec();
    await form.clickAdvancedSettings();
    await form.fillMinimumOrderQuantity('1');
    const intent = recordIntent('price-missing', names.priceMissing, 'L2-controlled-negative', 'POST', '/ops-brand/brand-items/standard');
    const responses: Response[] = [];
    const listener = (response: Response) => {
      if (response.request().method() === 'POST'
        && new URL(response.url()).pathname.endsWith('/ops-brand/brand-items/standard')) responses.push(response);
    };
    page.on('response', listener);
    try {
      await form.clickSave();
      const triggeredAt = Date.now();
      await waitUntil(
        () => ({ elapsed: Date.now() - triggeredAt, responseCount: responses.length }),
        (value) => value.elapsed >= 1_500 || value.responseCount > 0,
        { timeout: 3_000, interval: 50, message: '标准价缺失保存后的静默观察窗口未完成。' },
      );
      const validation = await form.readStandardPriceValidation();
      await form.expectStillOnCreatePage();
      const messages = await createItemListPage(page).readVisibleMessages();
      const afterCount = await itemFactory.itemRecordCount(names.priceMissing);
      if (afterCount > 0) {
        await itemFactory.registerCreated(itemContext(names.priceMissing, 'standard', '0'), responses[0]
          ? await responses[0].json().catch(() => productCenterApi.productPage(names.priceMissing))
          : await productCenterApi.productPage(names.priceMissing), cleanupRegistry);
      }
      expect(afterCount).toBe(0);
      expect(responses).toHaveLength(0);
      expect(validation.value).toBe('');
      expect(messages.join(' ')).not.toMatch(/success/i);
      mutationJournal.markPhase(intent.intentId, 'verification-complete');
      return { validation, mutationCount: responses.length, messages, apiRecordCount: afterCount, route: new URL(page.url()).pathname };
    } finally {
      page.off('response', listener);
    }
  }

  async function createSideRequiredOnly(): Promise<unknown> {
    expect(await itemFactory.itemRecordCount(names.side)).toBe(0);
    const form = new ItemCreateSidePage(page);
    await form.open();
    await form.fillItemName(names.side);
    await form.fillStandardPrice('5.00');
    const result = await submitCreate(form, itemContext(names.side, 'side', '5.00'), 'side-required-only');
    const list = createItemListPage(page);
    await list.expectUniqueItemVisible(names.side);
    const itemType = await list.readItemTypeText(names.side);
    const price = await list.readItemPriceText(names.side);
    expect(itemType).toBe('Add-On');
    expect(price).toContain('5');
    mutationJournal.markPhase(result.intentId, 'verification-complete');
    return { itemId: result.record.id, itemType, price, response: responseEvidence(result.response), messages: result.messages };
  }

  async function createStandard(
    identity: string,
    action: string,
    configure: (form: ItemCreateStandardPage) => Promise<void>,
  ): Promise<{
    record: ProductCenterItemCreateRecord;
    response: Response;
    messages: string[];
    intentId: string;
    additionalPriceWarningConfirmed: boolean;
  }> {
    expect(await itemFactory.itemRecordCount(identity)).toBe(0);
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.fillItemName(identity);
    await configure(form);
    return submitCreate(form, itemContext(identity, 'standard', '1.00'), action);
  }

  async function submitCreate(
    form: ItemCreateSidePage | ItemCreateStandardPage,
    context: ProductCenterItemCreateContext,
    action: string,
  ): Promise<{
    record: ProductCenterItemCreateRecord;
    response: Response;
    messages: string[];
    intentId: string;
    additionalPriceWarningConfirmed: boolean;
  }> {
    const operationPath = '/ops-brand/brand-items/standard';
    const intent = recordIntent(action, context.originalIdentity, 'L3-crud', 'POST', operationPath);
    const requests: Request[] = [];
    const responses: Response[] = [];
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const observedMutationRequests: Array<{ method: string; path: string }> = [];
    const observedMutationResponses: Array<{ method: string; path: string; status: number }> = [];
    const recordRequest = (request: Request) => {
      if (request.method() === 'GET') return;
      const pathName = new URL(request.url()).pathname;
      observedMutationRequests.push({ method: request.method(), path: pathName });
      if (request.method() === 'POST' && pathName.endsWith(operationPath)) requests.push(request);
    };
    const recordResponse = (response: Response) => {
      if (response.request().method() === 'GET') return;
      const pathName = new URL(response.url()).pathname;
      observedMutationResponses.push({ method: response.request().method(), path: pathName, status: response.status() });
      if (response.request().method() === 'POST' && pathName.endsWith(operationPath)) responses.push(response);
    };
    const recordPageError = (error: Error) => pageErrors.push(safeDiagnosticMessage(error));
    const recordConsoleError = (message: ConsoleMessage) => {
      if (message.type() === 'error') consoleErrors.push(safeDiagnosticText(message.text()));
    };
    page.on('request', recordRequest);
    page.on('response', recordResponse);
    page.on('pageerror', recordPageError);
    page.on('console', recordConsoleError);
    const preSubmit = {
      route: new URL(page.url()).pathname,
      itemName: await form.readItemName(),
      saveButton: await form.readSaveButtonState(),
      priceValues: form instanceof ItemCreateStandardPage
        ? await form.readVisiblePriceValues()
        : undefined,
    };
    let additionalPriceWarningConfirmed = false;
    try {
      await form.clickSave();
      if (form instanceof ItemCreateStandardPage) {
        const confirmationStartedAt = Date.now();
        const confirmationState = await waitUntil(
          async () => ({
            elapsed: Date.now() - confirmationStartedAt,
            responseCount: responses.length,
            warningVisible: await form.isAdditionalPriceWarningVisible(),
          }),
          (value) => value.responseCount > 0 || value.warningVisible || value.elapsed >= 1_500,
          { timeout: 3_000, interval: 50, message: '标准商品保存后的确认弹窗观察窗口未完成。' },
        );
        if (confirmationState.warningVisible) {
          await form.confirmAdditionalPriceWarning();
          additionalPriceWarningConfirmed = true;
        }
      }
      const triggeredAt = Date.now();
      await waitUntil(
        () => ({ elapsed: Date.now() - triggeredAt, responseCount: responses.length }),
        (value) => value.responseCount > 0 || value.elapsed >= 30_000,
        { timeout: 35_000, interval: 100, message: `商品 ${context.originalIdentity} 提交观察窗口未完成。` },
      );
    } finally {
      page.off('request', recordRequest);
      page.off('response', recordResponse);
      page.off('pageerror', recordPageError);
      page.off('console', recordConsoleError);
    }
    const response = responses[0];
    if (!response) {
      const recordCount = await itemFactory.itemRecordCount(context.originalIdentity);
      const messages = await createItemListPage(page).readVisibleMessages();
      runtimeDiagnostics[action] = {
        ...preSubmit,
        requestCount: requests.length,
        responseCount: responses.length,
        recordCount,
        messages,
        pageErrors,
        consoleErrors,
        observedMutationRequests,
        observedMutationResponses,
        saveButtonAfterClick: await form.readSaveButtonState(),
        validationErrors: await form.readVisibleValidationErrors(),
        attributeConfiguration: form instanceof ItemCreateStandardPage
          ? await form.readAttributeConfigurationEvidence()
          : undefined,
      };
      const diagnosticScreenshotPath = path.resolve(`output/audit/product-center-item-p0-wave-c-${runId}-${action}.png`);
      await page.screenshot({ path: diagnosticScreenshotPath, fullPage: true });
      await testInfo.attach(`wave-c-${action}-submit-diagnostic`, {
        path: diagnosticScreenshotPath,
        contentType: 'image/png',
      });
      if (recordCount > 0) {
        await itemFactory.registerCreated(
          context,
          await productCenterApi.productPage(context.originalIdentity),
          cleanupRegistry,
        );
      }
      throw new Error(`商品 ${context.originalIdentity} 未观察到创建响应：${JSON.stringify(runtimeDiagnostics[action])}`);
    }
    mutationJournal.markPhase(intent.intentId, 'response-observed');
    const body = await response.json().catch(() => null);
    expect(response.ok()).toBe(true);
    const record = await itemFactory.registerCreated(context, body, cleanupRegistry);
    mutationJournal.attachServerIdentity(intent.intentId, {
      serverId: record.id,
      ledgerEntryId: record.checkpointEntryId,
    });
    const list = createItemListPage(page);
    expect(await itemFactory.itemRecordCount(context.originalIdentity)).toBe(1);
    await list.open();
    await list.fillSearch(context.originalIdentity);
    await list.expectUniqueItemVisible(context.originalIdentity);
    const messages = await list.readVisibleMessages();
    return { record, response, messages, intentId: intent.intentId, additionalPriceWarningConfirmed };
  }

  function recordIntent(
    action: string,
    identity: string,
    safetyLevel: 'L2-controlled-negative' | 'L3-crud',
    method: string,
    operationPath: string,
  ): { intentId: string } {
    const requestFingerprint = createHash('sha256').update(`${runId}:${action}:${identity}:${method}:${operationPath}`).digest('hex');
    const intentId = `intent:wave-c-${action}:${requestFingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: `audit-unit:wave-c-${action}`,
      safetyLevel,
      entity: 'item',
      identity,
      identityVariants: [identity],
      operation: { method, path: operationPath },
      requestFingerprint,
    });
    intents.push({ intentId, identity });
    mutationJournal.markPhase(intentId, 'trigger-started');
    return { intentId };
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

function responseEvidence(response: Response): { method: string; path: string; status: number } {
  return {
    method: response.request().method(),
    path: new URL(response.url()).pathname,
    status: response.status(),
  };
}

function containsIdentity(value: unknown, identity: string): boolean {
  if (typeof value === 'string') return value === identity;
  if (Array.isArray(value)) return value.some((item) => containsIdentity(item, identity));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some((item) => containsIdentity(item, identity));
}

function containsIdentityOrId(value: unknown, identity: string, id: number): boolean {
  if (containsIdentity(value, identity)) return true;
  if (Array.isArray(value)) return value.some((item) => containsIdentityOrId(item, identity, id));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (String(record.printStallId ?? record.id) === String(id)) return true;
  return Object.values(record).some((item) => containsIdentityOrId(item, identity, id));
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function safeDiagnosticMessage(error: Error): string {
  return safeDiagnosticText(`${error.name}: ${error.message}`);
}

function safeDiagnosticText(value: string): string {
  return value
    .replace(/bearer\s+[^\s]+/gi, 'Bearer <redacted>')
    .replace(/(authorization|password|cookie|token)\s*[:=]\s*[^,;\s]+/gi, '$1=<redacted>')
    .slice(0, 2_000);
}
