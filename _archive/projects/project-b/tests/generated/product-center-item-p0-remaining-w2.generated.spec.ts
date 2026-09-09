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
} from '../../test-data/product-center/product-center-item-create-data.factory';
import {
  ProductCenterCategoryNegativeDataFactory,
  type ProductCategoryTreeSeedRecord,
} from '../../test-data/product-center/sop/product-center-category-negative-data.factory';
import { waitUntil } from '../../utils/wait';

type ProductType = 'standard' | 'side' | 'combo';

type NegativeScenario = {
  caseId: string;
  productType: ProductType;
  nameMode: 'normal' | 'missing' | 'padded';
  price: string;
  rawPrice?: boolean;
  minimumOrderQuantity?: string;
  rawMinimumOrderQuantity?: boolean;
  sameAltName?: boolean;
  parentCategoryOnly?: boolean;
};

const scenarios: NegativeScenario[] = [
  { caseId: 'TC-ITEM-STD-039', productType: 'standard', nameMode: 'normal', price: '10.00', minimumOrderQuantity: '' },
  { caseId: 'TC-ITEM-STD-093', productType: 'standard', nameMode: 'padded', price: '10.00' },
  { caseId: 'TC-ITEM-STD-021', productType: 'standard', nameMode: 'normal', price: '-1' },
  { caseId: 'TC-ITEM-STD-022', productType: 'standard', nameMode: 'normal', price: '10.00', minimumOrderQuantity: '0' },
  { caseId: 'TC-ITEM-STD-023', productType: 'standard', nameMode: 'normal', price: '10.00', minimumOrderQuantity: 'abc', rawMinimumOrderQuantity: true },
  { caseId: 'TC-ITEM-STD-097', productType: 'standard', nameMode: 'normal', price: 'abc', rawPrice: true },
  { caseId: 'TC-ITEM-STD-043', productType: 'standard', nameMode: 'normal', price: '10.00', sameAltName: true },
  { caseId: 'TC-ITEM-ADD-006', productType: 'side', nameMode: 'missing', price: '5.00' },
  { caseId: 'TC-ITEM-ADD-008', productType: 'side', nameMode: 'normal', price: '' },
  { caseId: 'TC-ITEM-ADD-047', productType: 'side', nameMode: 'padded', price: '10.00' },
  { caseId: 'TC-ITEM-ADD-010', productType: 'side', nameMode: 'normal', price: '-1' },
  { caseId: 'TC-ITEM-ADD-048', productType: 'side', nameMode: 'normal', price: 'abc', rawPrice: true },
  { caseId: 'TC-ITEM-ADD-016', productType: 'side', nameMode: 'normal', price: '10.00', sameAltName: true },
  { caseId: 'TC-ITEM-PKG-015', productType: 'combo', nameMode: 'normal', price: '10.00', minimumOrderQuantity: '0' },
  { caseId: 'TC-ITEM-PKG-019', productType: 'combo', nameMode: 'normal', price: '-1' },
  { caseId: 'TC-ITEM-PKG-077', productType: 'combo', nameMode: 'normal', price: 'abc', rawPrice: true },
  { caseId: 'TC-ITEM-PKG-026', productType: 'combo', nameMode: 'normal', price: '10.00', sameAltName: true },
  { caseId: 'TC-ITEM-PKG-076', productType: 'combo', nameMode: 'padded', price: '10.00' },
  { caseId: 'TC-ITEM-PKG-013', productType: 'combo', nameMode: 'normal', price: '10.00', parentCategoryOnly: true },
];

test('W2 必填、格式、数值与分类拒绝矩阵 19 条 P0 用例整波审计', async ({
  page,
  productCenterApi,
  cleanupRegistry,
  executionLedger,
}, testInfo) => {
  test.setTimeout(900_000);
  test.skip(process.env.PC_P0_REMAINING_W2_LIVE !== '1', '未启用剩余 P0 W2 认证实时审计');
  const runId = process.env.PC_P0_REMAINING_W2_RUN_ID ?? `AUTO_AUDIT_P0_REMAINING_W2_${Date.now()}`;
  const timestamp = Date.now();
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const categoryFactory = new ProductCenterCategoryNegativeDataFactory(productCenterApi);
  const mutationJournal = new MutationIntentJournal({ rootDir: path.resolve('output/mutation-intents'), runId });
  const comboSeed = await itemFactory.prepareComboRequiredOnly(cleanupRegistry, timestamp);
  const categories = await categoryFactory.seedTwoLevelCategoryTree(cleanupRegistry, timestamp + 1);
  const caseEvidence: Record<string, unknown> = {};
  const harnessErrors: Array<{ caseId: string; diagnostic: string }> = [];
  const intents: string[] = [];
  const identities = new Map(scenarios.map((scenario, index) => [
    scenario.caseId,
    `AUTO_AUDIT_W2_${scenario.caseId.replace(/[^A-Z0-9]+/g, '_')}_${timestamp + index}`,
  ]));

  try {
    for (const scenario of scenarios) {
      try {
        caseEvidence[scenario.caseId] = await executeScenario(scenario);
      } catch (error) {
        harnessErrors.push({ caseId: scenario.caseId, diagnostic: safeDiagnostic(error) });
        caseEvidence[scenario.caseId] = {
          caseId: scenario.caseId,
          verdict: 'harness-error',
          diagnostic: safeDiagnostic(error),
        };
      }
    }
  } finally {
    let cleanupDiagnostic: string | undefined;
    try {
      await cleanupRegistry.cleanupAll();
    } catch (error) {
      cleanupDiagnostic = safeDiagnostic(error);
    }
    const apiResidue: Record<string, number> = {};
    for (const identity of identities.values()) apiResidue[identity] = await itemFactory.itemRecordCount(identity);
    const uiResidue: Record<string, number> = {};
    try {
      const listPage = createItemListPage(page);
      await listPage.open();
      for (const identity of identities.values()) {
        await listPage.fillSearch(identity);
        await listPage.expectEmptySearchResults();
        uiResidue[identity] = 0;
      }
    } catch (error) {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
    }
    const residueFree = [...Object.values(apiResidue), ...Object.values(uiResidue)].every((count) => count === 0);
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
    const ledger = executionLedger.snapshot();
    const report = {
      schemaVersion: '1.0.0',
      runId,
      waveId: 'W2',
      executionMode: 'wave-shared-chain',
      caseLevelRunsClaimed: 0,
      status: harnessErrors.length === 0 && residueFree && !cleanupDiagnostic
        ? conflictCaseIds.length === 0 ? 'accepted' : 'completed-with-canonical-conflicts'
        : 'incomplete',
      caseIds: scenarios.map((scenario) => scenario.caseId),
      acceptedCaseIds,
      conflictCaseIds,
      caseEvidence,
      summary: {
        total: scenarios.length,
        accepted: acceptedCaseIds.length,
        canonicalConflict: conflictCaseIds.length,
        harnessError: harnessErrors.length,
      },
      sharedSeeds: {
        comboGroupName: comboSeed.comboGroupName,
        categoryIdentityCount: categories.identities.length,
      },
      cleanupEvidence: {
        apiResidue,
        uiResidue,
        ledgerEntries: ledger.entries.length,
        residueVerified: ledger.entries.filter((entry) => entry.phase === 'residue-verified').length,
        cleanupDiagnostic,
      },
      mutationIntents: mutationJournal.snapshot().entries.map((entry) => ({
        intentId: entry.intentId,
        unitId: entry.unitId,
        phase: entry.phase,
        reconciliation: entry.reconciliation,
        operation: entry.operation,
        serverId: entry.serverId,
        ledgerEntryId: entry.ledgerEntryId,
      })),
      security: {
        credentialsPersisted: false,
        authorizationArtifactsPersisted: false,
        storageStatePersisted: false,
      },
    };
    const reportPath = path.resolve(`output/audit/product-center-item-p0-remaining-w2-${runId}.json`);
    writeJsonAtomic(reportPath, report);
    await testInfo.attach('product-center-item-p0-remaining-w2-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic) throw new Error(cleanupDiagnostic);
  }

  expect(harnessErrors).toEqual([]);
  expect(Object.keys(caseEvidence).sort()).toEqual(scenarios.map((scenario) => scenario.caseId).sort());

  async function executeScenario(scenario: NegativeScenario): Promise<unknown> {
    const identity = identities.get(scenario.caseId)!;
    const submittedName = scenario.nameMode === 'padded' ? `  ${identity}  ` : identity;
    const beforeCount = await itemFactory.itemRecordCount(identity);
    expect(beforeCount).toBe(0);
    const form = createForm(scenario.productType);
    await form.open();
    if (scenario.nameMode !== 'missing') await form.fillItemName(submittedName);
    if (scenario.sameAltName) await form.fillCommonItemAltName(submittedName);
    if (scenario.rawPrice) await form.typeStandardPriceRaw(scenario.price);
    else await form.fillStandardPrice(scenario.price);
    let categoryEvidence: unknown;
    if (form instanceof ItemCreateStandardPage && scenario.minimumOrderQuantity !== undefined) {
      await form.clickAdvancedSettings();
      if (scenario.rawMinimumOrderQuantity) {
        await form.typeMinimumOrderQuantityRaw(scenario.minimumOrderQuantity);
      } else {
        await form.fillMinimumOrderQuantity(scenario.minimumOrderQuantity);
      }
    }
    if (form instanceof ItemCreateComboPage) {
      await form.clickAdvancedSettings();
      if (scenario.rawMinimumOrderQuantity) {
        await form.typeMinimumOrderQuantityRaw(scenario.minimumOrderQuantity ?? '1');
      } else {
        await form.fillMinimumOrderQuantity(scenario.minimumOrderQuantity ?? '1');
      }
      await form.addFixedComboGroupByName(comboSeed.comboGroupName!);
      if (scenario.parentCategoryOnly) {
        categoryEvidence = await form.selectCategoryParentOnly(categories.parentA.name, categories.childA.name);
      }
    }
    const enteredValues = await readEnteredValues(form, scenario.minimumOrderQuantity);
    const operationPath = scenario.productType === 'combo'
      ? '/ops-brand/brand-items/combo'
      : '/ops-brand/brand-items/standard';
    const intentId = recordIntent(scenario, identity, submittedName, operationPath);
    const responses: Response[] = [];
    const responseListener = (response: Response) => {
      if (response.request().method() === 'POST'
        && new URL(response.url()).pathname.endsWith(operationPath)) responses.push(response);
    };
    page.on('response', responseListener);
    let signal: {
      errors: string[];
      messages: string[];
      successMessageCount: number;
      responseCount: number;
    };
    try {
      await form.clickSave();
      signal = await waitUntil(
        async () => {
          const onCreateRoute = isProductCenterItemCreateRoute(page.url());
          return {
            errors: onCreateRoute ? await form.readVisibleValidationErrors() : [],
            messages: await createItemListPage(page).readVisibleMessages(),
            successMessageCount: onCreateRoute ? await form.readSuccessMessageCount() : 0,
            responseCount: responses.length,
          };
        },
        (value) => value.errors.length > 0
          || value.messages.length > 0
          || value.successMessageCount > 0
          || value.responseCount > 0,
        { timeout: 15_000, interval: 100, message: `${scenario.caseId} 提交后无可见校验或业务响应。` },
      );
    } finally {
      page.off('response', responseListener);
    }
    const responseEvidence = await Promise.all(responses.map(async (response) => ({
      method: response.request().method(),
      path: new URL(response.url()).pathname,
      status: response.status(),
      error: readBusinessError(await response.json().catch(() => null)),
    })));
    if (responses.length > 0) mutationJournal.markPhase(intentId, 'response-observed');
    const afterCount = await itemFactory.itemRecordCount(identity);
    let accidentalRecordId: number | undefined;
    if (afterCount > 0) {
      const context: ProductCenterItemCreateContext = {
        entityKey: 'item',
        productType: scenario.productType,
        originalIdentity: identity,
        price: scenario.price,
        minimumOrderQuantity: scenario.minimumOrderQuantity ?? '1',
        cleanupIdentityVariants: [submittedName],
      };
      const accidentalRecord = await itemFactory.registerCreated(context, null, cleanupRegistry);
      accidentalRecordId = accidentalRecord.id;
      mutationJournal.attachServerIdentity(intentId, {
        serverId: accidentalRecord.id,
        ledgerEntryId: accidentalRecord.checkpointEntryId,
      });
      mutationJournal.recordReconciliation(intentId, 'present');
    } else {
      mutationJournal.recordReconciliation(intentId, 'absent');
    }
    mutationJournal.markPhase(intentId, 'verification-complete');
    const route = new URL(page.url()).pathname;
    const verdict = afterCount === 0 && signal.successMessageCount === 0
      ? 'accepted' as const
      : 'canonical-conflict' as const;
    return {
      caseId: scenario.caseId,
      verdict,
      productType: scenario.productType,
      identity,
      submittedNameMode: scenario.nameMode,
      route,
      beforeCount,
      afterCount,
      accidentalRecordId,
      enteredValues,
      signal,
      responses: responseEvidence,
      categoryEvidence,
    };
  }

  function createForm(productType: ProductType): ItemCreateFormPage {
    if (productType === 'standard') return new ItemCreateStandardPage(page);
    if (productType === 'side') return new ItemCreateSidePage(page);
    return new ItemCreateComboPage(page);
  }

  async function readEnteredValues(
    form: ItemCreateFormPage,
    minimumOrderQuantity: string | undefined,
  ): Promise<{
    itemName: string;
    itemAltName: string;
    standardPrice: string;
    minimumOrderQuantity?: string;
  }> {
    const values = {
      itemName: await form.readItemName(),
      itemAltName: await form.readCommonItemAltName(),
      standardPrice: await form.readStandardPriceValue(),
    };
    if (minimumOrderQuantity === undefined) return values;
    if (form instanceof ItemCreateStandardPage || form instanceof ItemCreateComboPage) {
      return {
        ...values,
        minimumOrderQuantity: await form.readMinimumOrderQuantityValue(),
      };
    }
    return { ...values, minimumOrderQuantity };
  }

  function recordIntent(
    scenario: NegativeScenario,
    identity: string,
    submittedName: string,
    operationPath: string,
  ): string {
    const requestFingerprint = createHash('sha256')
      .update(`${runId}:${scenario.caseId}:${identity}:${operationPath}`)
      .digest('hex');
    const intentId = `intent:remaining-w2:${requestFingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: `audit-unit:remaining-w2:${scenario.caseId}`,
      safetyLevel: 'L2-controlled-negative',
      entity: 'item',
      identity,
      identityVariants: [...new Set([identity, submittedName])],
      operation: { method: 'POST', path: operationPath },
      requestFingerprint,
    });
    intents.push(intentId);
    mutationJournal.markPhase(intentId, 'trigger-started');
    return intentId;
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

function isProductCenterItemCreateRoute(url: string): boolean {
  try {
    return /^\/pp\/brand\/create\/(standard|side|combo)$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
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
