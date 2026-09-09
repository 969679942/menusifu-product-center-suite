import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Response } from '@playwright/test';
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
import { ProductCenterCategoryNegativeDataFactory } from '../../test-data/product-center/sop/product-center-category-negative-data.factory';
import { waitUntil } from '../../utils/wait';

type ProductType = 'standard' | 'side' | 'combo';

const caseIds = [
  'TC-ITEM-STD-010',
  'TC-ITEM-STD-044',
  'TC-ITEM-ADD-014',
  'TC-ITEM-ADD-015',
  'TC-ITEM-PKG-024',
  'TC-ITEM-PKG-025',
] as const;

test('W3 编码、同名与跨类型重复约束 6 条 P0 用例整波审计', async ({
  page,
  productCenterApi,
  cleanupRegistry,
  executionLedger,
}, testInfo) => {
  test.setTimeout(900_000);
  test.skip(process.env.PC_P0_REMAINING_W3_LIVE !== '1', '未启用剩余 P0 W3 认证实时审计');
  const runId = process.env.PC_P0_REMAINING_W3_RUN_ID ?? `AUTO_AUDIT_P0_REMAINING_W3_${Date.now()}`;
  const timestamp = Date.now();
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const categoryFactory = new ProductCenterCategoryNegativeDataFactory(productCenterApi);
  const mutationJournal = new MutationIntentJournal({ rootDir: path.resolve('output/mutation-intents'), runId });
  const comboContext = await itemFactory.prepareComboRequiredOnly(cleanupRegistry, timestamp);
  const categories = await categoryFactory.seedTwoLevelCategoryTree(cleanupRegistry, timestamp + 1);
  const itemCode = `W3${String(timestamp).slice(-8)}`;
  const names = {
    codeSeed: `AUTO_AUDIT_W3_CODE_SEED_${timestamp}`,
    codeAttempt: `AUTO_AUDIT_W3_CODE_ATTEMPT_${timestamp}`,
    standardDuplicate: `AUTO_AUDIT_W3_STANDARD_DUPLICATE_${timestamp}`,
    sideCategoryDuplicate: `AUTO_AUDIT_W3_SIDE_CATEGORY_DUPLICATE_${timestamp}`,
    sideCrossType: `AUTO_AUDIT_W3_SIDE_CROSS_TYPE_${timestamp}`,
    comboCategoryDuplicate: `AUTO_AUDIT_W3_COMBO_CATEGORY_DUPLICATE_${timestamp}`,
    comboCrossType: `AUTO_AUDIT_W3_COMBO_CROSS_TYPE_${timestamp}`,
  };
  const caseEvidence: Record<string, unknown> = {};
  const harnessErrors: Array<{ caseId: string; diagnostic: string }> = [];
  const intents: string[] = [];
  let executionDiagnostic: string | undefined;

  try {
    await createSeed('code-seed', 'standard', names.codeSeed, { itemCode });
    await createSeed('standard-duplicate-seed', 'standard', names.standardDuplicate);
    await createSeed('side-category-seed', 'side', names.sideCategoryDuplicate, { category: true });
    await createSeed('side-cross-type-seed', 'standard', names.sideCrossType, { category: true });
    await createSeed('combo-category-seed', 'combo', names.comboCategoryDuplicate, { category: true });
    await createSeed('combo-cross-type-seed', 'standard', names.comboCrossType, { category: true });

    const scenarios: Array<{
      caseId: typeof caseIds[number];
      productType: ProductType;
      identity: string;
      itemCode?: string;
      category?: boolean;
    }> = [
      { caseId: 'TC-ITEM-STD-010', productType: 'standard', identity: names.codeAttempt, itemCode },
      { caseId: 'TC-ITEM-STD-044', productType: 'standard', identity: names.standardDuplicate },
      { caseId: 'TC-ITEM-ADD-014', productType: 'side', identity: names.sideCategoryDuplicate, category: true },
      { caseId: 'TC-ITEM-ADD-015', productType: 'side', identity: names.sideCrossType, category: true },
      { caseId: 'TC-ITEM-PKG-024', productType: 'combo', identity: names.comboCategoryDuplicate, category: true },
      { caseId: 'TC-ITEM-PKG-025', productType: 'combo', identity: names.comboCrossType, category: true },
    ];
    for (const scenario of scenarios) {
      try {
        caseEvidence[scenario.caseId] = await attemptDuplicate(scenario);
      } catch (error) {
        harnessErrors.push({ caseId: scenario.caseId, diagnostic: safeDiagnostic(error) });
        caseEvidence[scenario.caseId] = { caseId: scenario.caseId, verdict: 'harness-error', diagnostic: safeDiagnostic(error) };
      }
    }
    expect(harnessErrors).toEqual([]);
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
    const itemIdentities = [...new Set(Object.values(names))];
    const apiResidue: Record<string, number> = {};
    for (const identity of itemIdentities) apiResidue[identity] = await itemFactory.itemRecordCount(identity);
    const uiResidue: Record<string, number> = {};
    try {
      const listPage = createItemListPage(page);
      await listPage.open();
      for (const identity of itemIdentities) {
        await listPage.fillSearch(identity);
        await listPage.expectEmptySearchResults();
        uiResidue[identity] = 0;
      }
    } catch (error) {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
    }
    const ledger = executionLedger.snapshot();
    const residueFree = [...Object.values(apiResidue), ...Object.values(uiResidue)].every((count) => count === 0)
      && ledger.entries.every((entry) => entry.phase === 'residue-verified');
    if (residueFree && !cleanupDiagnostic) {
      for (const intentId of intents) mutationJournal.markPhase(intentId, 'cleanup-complete');
    }
    const acceptedCaseIds = Object.entries(caseEvidence)
      .filter(([, value]) => (value as { verdict?: string }).verdict === 'accepted')
      .map(([caseId]) => caseId)
      .sort();
    const conflictCaseIds = Object.entries(caseEvidence)
      .filter(([, value]) => (value as { verdict?: string }).verdict === 'canonical-conflict')
      .map(([caseId]) => caseId)
      .sort();
    const completeCaseEvidence = Object.keys(caseEvidence).length === caseIds.length;
    const report = {
      schemaVersion: '1.0.0',
      runId,
      waveId: 'W3',
      executionMode: 'wave-shared-chain',
      caseLevelRunsClaimed: 0,
      status: !executionDiagnostic && completeCaseEvidence
        && harnessErrors.length === 0 && residueFree && !cleanupDiagnostic
        ? conflictCaseIds.length === 0 ? 'accepted' : 'completed-with-canonical-conflicts'
        : 'incomplete',
      caseIds,
      acceptedCaseIds,
      conflictCaseIds,
      caseEvidence,
      summary: { total: caseIds.length, accepted: acceptedCaseIds.length, canonicalConflict: conflictCaseIds.length, harnessError: harnessErrors.length },
      sharedSeeds: { categoryIdentityCount: categories.identities.length, comboGroupName: comboContext.comboGroupName },
      cleanupEvidence: {
        apiResidue,
        uiResidue,
        ledgerEntries: ledger.entries.length,
        residueVerified: ledger.entries.filter((entry) => entry.phase === 'residue-verified').length,
        cleanupDiagnostic,
      },
      executionDiagnostic,
      mutationIntents: mutationJournal.snapshot().entries.map((entry) => ({
        intentId: entry.intentId,
        unitId: entry.unitId,
        phase: entry.phase,
        reconciliation: entry.reconciliation,
        operation: entry.operation,
        serverId: entry.serverId,
        ledgerEntryId: entry.ledgerEntryId,
      })),
      security: { credentialsPersisted: false, authorizationArtifactsPersisted: false, storageStatePersisted: false },
    };
    const reportPath = path.resolve(`output/audit/product-center-item-p0-remaining-w3-${runId}.json`);
    writeJsonAtomic(reportPath, report);
    await testInfo.attach('product-center-item-p0-remaining-w3-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function createSeed(
    action: string,
    productType: ProductType,
    identity: string,
    options: { itemCode?: string; category?: boolean } = {},
  ): Promise<ProductCenterItemCreateRecord> {
    const beforeCount = await itemFactory.itemRecordCount(identity);
    expect(beforeCount).toBe(0);
    const form = createForm(productType);
    await configureForm(form, identity, options);
    const operationPath = productType === 'combo' ? '/ops-brand/brand-items/combo' : '/ops-brand/brand-items/standard';
    const intentId = recordIntent(`seed-${action}`, identity, operationPath, 'L3-crud');
    const responses = await submitAndObserve(form, operationPath);
    const response = responses[0];
    if (!response) throw new Error(`W3 seed ${identity} 未观察到创建响应`);
    mutationJournal.markPhase(intentId, 'response-observed');
    const responseBody = await response.json().catch(() => null);
    expect(response.ok()).toBe(true);
    const record = await itemFactory.registerCreated(itemContext(identity, productType), responseBody, cleanupRegistry);
    mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
    mutationJournal.recordReconciliation(intentId, 'present');
    mutationJournal.markPhase(intentId, 'verification-complete');
    return record;
  }

  async function attemptDuplicate(input: {
    caseId: typeof caseIds[number];
    productType: ProductType;
    identity: string;
    itemCode?: string;
    category?: boolean;
  }): Promise<unknown> {
    const beforeCount = await itemFactory.itemRecordCount(input.identity);
    const form = createForm(input.productType);
    await configureForm(form, input.identity, input);
    const enteredValues = {
      itemName: await form.readItemName(),
      standardPrice: await form.readStandardPriceValue(),
      itemCode: input.itemCode,
    };
    const operationPath = input.productType === 'combo' ? '/ops-brand/brand-items/combo' : '/ops-brand/brand-items/standard';
    const intentId = recordIntent(input.caseId, input.identity, operationPath, 'L2-controlled-negative');
    const responses = await submitAndObserve(form, operationPath);
    const responseBodies = await Promise.all(responses.map((response) => response.json().catch(() => null)));
    if (responses.length > 0) mutationJournal.markPhase(intentId, 'response-observed');
    const afterCount = await itemFactory.itemRecordCount(input.identity);
    let accidentalRecordId: number | undefined;
    if (afterCount > beforeCount) {
      const responseBody = responseBodies.find(Boolean) ?? await productCenterApi.productPage(input.identity);
      const record = await itemFactory.registerCreated(itemContext(input.identity, input.productType), responseBody, cleanupRegistry);
      accidentalRecordId = record.id;
      mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
      mutationJournal.recordReconciliation(intentId, 'present');
    } else {
      mutationJournal.recordReconciliation(intentId, 'absent');
    }
    mutationJournal.markPhase(intentId, 'verification-complete');
    const verdict = afterCount === beforeCount ? 'accepted' as const : 'canonical-conflict' as const;
    return {
      caseId: input.caseId,
      verdict,
      productType: input.productType,
      identity: input.identity,
      enteredValues,
      route: new URL(page.url()).pathname,
      beforeCount,
      afterCount,
      accidentalRecordId,
      messages: await createItemListPage(page).readVisibleMessages(),
      responses: responses.map((response) => ({
        method: response.request().method(),
        path: new URL(response.url()).pathname,
        status: response.status(),
      })),
      responseErrors: responseBodies.map(readBusinessError),
    };
  }

  async function configureForm(
    form: ItemCreateFormPage,
    identity: string,
    options: { itemCode?: string; category?: boolean },
  ): Promise<void> {
    await form.open();
    await form.fillItemName(identity);
    await form.fillStandardPrice('10.00');
    if (form instanceof ItemCreateStandardPage) {
      await form.selectSingleSpec();
      await form.clickAdvancedSettings();
      if (options.itemCode) await form.fillItemCode(options.itemCode);
      await form.fillMinimumOrderQuantity('1');
      if (options.category) await form.selectCategoryPath(categories.parentA.name, categories.childA.name);
    } else if (form instanceof ItemCreateSidePage) {
      if (options.category) await form.selectCategoryPath(categories.parentA.name, categories.childA.name);
    } else if (form instanceof ItemCreateComboPage) {
      await form.clickAdvancedSettings();
      await form.fillMinimumOrderQuantity('1');
      await form.addFixedComboGroupByName(comboContext.comboGroupName!);
      if (options.category) await form.selectCategoryPath(categories.parentA.name, categories.childA.name);
    }
  }

  async function submitAndObserve(form: ItemCreateFormPage, operationPath: string): Promise<Response[]> {
    const responses: Response[] = [];
    const listener = (response: Response) => {
      if (response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(operationPath)) responses.push(response);
    };
    page.on('response', listener);
    try {
      await form.clickSave();
      if (form instanceof ItemCreateStandardPage) {
        const warning = await waitUntil(
          async () => ({ responses: responses.length, visible: await form.isAdditionalPriceWarningVisible(), elapsed: Date.now() }),
          (value) => value.responses > 0 || value.visible,
          { timeout: 2_000, interval: 50, message: 'W3 标准商品提交确认窗口结束。' },
        ).catch(() => ({ responses: responses.length, visible: false, elapsed: Date.now() }));
        if (warning.visible) await form.confirmAdditionalPriceWarning();
      }
      const startedAt = Date.now();
      await waitUntil(
        async () => ({
          elapsed: Date.now() - startedAt,
          responseCount: responses.length,
          messages: await createItemListPage(page).readVisibleMessages(),
          errors: /^\/pp\/brand\/create\//.test(new URL(page.url()).pathname) ? await form.readVisibleValidationErrors() : [],
        }),
        (value) => value.responseCount > 0 || value.messages.length > 0 || value.errors.length > 0 || value.elapsed >= 3_000,
        { timeout: 5_000, interval: 100, message: 'W3 提交终态未稳定。' },
      );
      return responses;
    } finally {
      page.off('response', listener);
    }
  }

  function createForm(productType: ProductType): ItemCreateFormPage {
    if (productType === 'standard') return new ItemCreateStandardPage(page);
    if (productType === 'side') return new ItemCreateSidePage(page);
    return new ItemCreateComboPage(page);
  }

  function recordIntent(
    action: string,
    identity: string,
    operationPath: string,
    safetyLevel: 'L2-controlled-negative' | 'L3-crud',
  ): string {
    const requestFingerprint = createHash('sha256').update(`${runId}:${action}:${identity}:${operationPath}`).digest('hex');
    const intentId = `intent:remaining-w3:${requestFingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: `audit-unit:remaining-w3:${action}`,
      safetyLevel,
      entity: 'item',
      identity,
      identityVariants: [identity],
      operation: { method: 'POST', path: operationPath },
      requestFingerprint,
    });
    intents.push(intentId);
    mutationJournal.markPhase(intentId, 'trigger-started');
    return intentId;
  }

  function itemContext(identity: string, productType: ProductType): ProductCenterItemCreateContext {
    return {
      entityKey: 'item',
      productType,
      originalIdentity: identity,
      price: '10.00',
      minimumOrderQuantity: '1',
      comboGroupName: productType === 'combo' ? comboContext.comboGroupName : undefined,
    };
  }
});

function readBusinessError(value: unknown): { code: string; message: string } {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readBusinessError(item);
      if (found.code || found.message) return found;
    }
    return { code: '', message: '' };
  }
  if (!value || typeof value !== 'object') return { code: '', message: '' };
  const record = value as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : '';
  const message = typeof record.message === 'string' ? record.message : '';
  if (code || message) return { code, message };
  for (const child of Object.values(record)) {
    const found = readBusinessError(child);
    if (found.code || found.message) return found;
  }
  return { code: '', message: '' };
}

function safeDiagnostic(error: unknown): string {
  return String(error)
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/bearer\s+[^\s]+/gi, 'Bearer <redacted>')
    .replace(/(authorization|password|cookie|token)\s*[:=]\s*[^,;\s]+/gi, '$1=<redacted>')
    .slice(0, 2_000);
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
