import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Response } from '@playwright/test';
import { MutationIntentJournal } from '../../api/product-center/mutation-intent-journal';
import { test, expect } from '../../fixtures/product-center.fixture';
import { ItemEditFlow } from '../../flows/item-edit.flow';
import { ItemCreateStandardPage } from '../../pages/product-management/item/item-create-standard.page';
import { createItemListPage } from '../../pages/product-management/item/item-list.page';
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
  'TC-ITEM-STD-036',
  'TC-ITEM-STD-037',
  'TC-ITEM-STD-008',
  'TC-ITEM-STD-016',
  'TC-ITEM-STD-017',
  'TC-ITEM-STD-018',
] as const;

test('W4 标准商品正向创建 6 条 P0 用例整波技术验收', async ({
  page,
  productCenterApi,
  cleanupRegistry,
  executionLedger,
}, testInfo) => {
  test.setTimeout(900_000);
  test.skip(process.env.PC_P0_REMAINING_W4_LIVE !== '1', '未启用 W4 认证实时验收');
  const runId = process.env.PC_P0_REMAINING_W4_RUN_ID ?? `AUTO_AUDIT_P0_REMAINING_W4_${Date.now()}`;
  const timestamp = Date.now();
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const lowDependencyFactory = new ProductCenterLowDependencyDataFactory(productCenterApi);
  const mutationJournal = new MutationIntentJournal({ rootDir: path.resolve('output/mutation-intents'), runId });
  const optionNames = [`AUTO_AUDIT_W4_SPEC_LARGE_${timestamp}`, `AUTO_AUDIT_W4_SPEC_SMALL_${timestamp}`] as const;
  const names = {
    requiredOnly: `AUTO_AUDIT_W4_REQUIRED_${timestamp}`,
    noCategory: `AUTO_AUDIT_W4_NO_CATEGORY_${timestamp}`,
    formatted: `AUTO_AUDIT_W4_FORMAT_${timestamp}_SPECIAL`,
    defaultSpec: `AUTO_AUDIT_W4_DEFAULT_SPEC_${timestamp}`,
    noDefaultSpec: `AUTO_AUDIT_W4_NO_DEFAULT_SPEC_${timestamp}`,
    weighted: `AUTO_AUDIT_W4_WEIGHTED_${timestamp}`,
  };
  const formattedSubmittedName = `${names.formatted}_商品名称  连  空格  Test01@#🙂_${'X'.repeat(100)}`;
  expect(formattedSubmittedName.length).toBeGreaterThan(100);
  const itemIdentities = [
    names.requiredOnly,
    names.noCategory,
    names.defaultSpec,
    names.noDefaultSpec,
    names.weighted,
  ];
  const caseEvidence: Record<string, unknown> = {};
  const intents: string[] = [];
  let spec: LowDependencySeedRecord | undefined;
  let executionDiagnostic: string | undefined;

  try {
    spec = await lowDependencyFactory.seedSpecWithOptions(cleanupRegistry, optionNames);

    const requiredOnly = await createStandard('required-only', names.requiredOnly, async (form) => {
      await form.selectSingleSpec();
      await form.fillStandardPrice('9.99');
    });
    caseEvidence['TC-ITEM-STD-036'] = await positiveEvidence(requiredOnly, [9.99]);

    const noCategory = await createStandard('no-category', names.noCategory, async (form) => {
      await form.selectSingleSpec();
      await form.fillStandardPrice('10.00');
      await form.clickAdvancedSettings();
      await form.fillMinimumOrderQuantity('1');
    });
    caseEvidence['TC-ITEM-STD-037'] = await positiveEvidence(noCategory, [10]);

    caseEvidence['TC-ITEM-STD-008'] = await attemptFormattedCreate(formattedSubmittedName);

    const defaultSpec = await createStandard('default-spec', names.defaultSpec, async (form) => {
      await form.selectMultiSpec();
      await form.selectSpecGroupByName(spec!.originalIdentity);
      await form.fillMultiSpecPriceByOption(optionNames[0], '12.00');
      await form.fillMultiSpecPriceByOption(optionNames[1], '9.99');
      await form.selectDefaultSpecByOption(optionNames[0]);
    });
    caseEvidence['TC-ITEM-STD-016'] = await positiveEvidence(defaultSpec, [12, 9.99], {
      specId: spec.id,
      optionNames,
      selectedDefault: optionNames[0],
    });

    const noDefaultSpec = await createStandard('no-default-spec', names.noDefaultSpec, async (form) => {
      await form.selectMultiSpec();
      await form.selectSpecGroupByName(spec!.originalIdentity);
      await form.fillMultiSpecPriceByOption(optionNames[0], '8.00');
      await form.fillMultiSpecPriceByOption(optionNames[1], '12.00');
    });
    caseEvidence['TC-ITEM-STD-017'] = await positiveEvidence(noDefaultSpec, [8, 12], {
      specId: spec.id,
      optionNames,
      selectedDefault: null,
    });

    const weighted = await createStandard('weighted', names.weighted, async (form) => {
      await form.selectSingleSpec();
      await form.enableWeightBasedItem();
      await form.fillStandardPrice('10.00');
      await form.clickAdvancedSettings();
      await form.fillUnit('g');
    });
    const weightedEdit = await new ItemEditFlow().openEditByItemName(page, names.weighted, 'standard');
    await weightedEdit.ensureAdvancedSettingsExpanded();
    const weightedReadback = {
      unit: await weightedEdit.readUnitValue(),
      weightBasedSelected: await weightedEdit.isWeightBasedItemSelected(),
      prices: await weightedEdit.readVisiblePriceValues(),
    };
    expect(weightedReadback.unit).toBe('g');
    expect(weightedReadback.weightBasedSelected).toBe(true);
    expect(weightedReadback.prices).toContain('10.00');
    caseEvidence['TC-ITEM-STD-018'] = {
      ...(await positiveEvidence(weighted, [10])),
      editReadback: weightedReadback,
    };

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
    const apiItemResidue = Object.fromEntries(await Promise.all(itemIdentities.map(async (identity) => (
      [identity, await itemFactory.itemRecordCount(identity)] as const
    ))));
    const uiItemResidue: Record<string, number> = {};
    let uiSpecResidue = spec ? -1 : 0;
    try {
      const listPage = createItemListPage(page);
      await listPage.open();
      for (const identity of itemIdentities) {
        await listPage.fillSearchForResidueCheck(identity);
        await listPage.expectEmptySearchResults();
        uiItemResidue[identity] = 0;
      }
      if (spec) {
        const form = new ItemCreateStandardPage(page);
        await form.open();
        await form.expectRuleGroupAbsent('spec', spec.originalIdentity);
        uiSpecResidue = 0;
      }
    } catch (error) {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
    }
    const apiSpecResidue = spec && containsExactString(await productCenterApi.specPage(spec.originalIdentity), spec.originalIdentity) ? 1 : 0;
    const ledger = executionLedger.snapshot();
    const residueFree = [...Object.values(apiItemResidue), ...Object.values(uiItemResidue), apiSpecResidue, uiSpecResidue]
      .every((count) => count === 0)
      && ledger.entries.every((entry) => entry.phase === 'residue-verified');
    if (residueFree && !cleanupDiagnostic) {
      for (const intentId of intents) mutationJournal.markPhase(intentId, 'cleanup-complete');
    }
    const completeCaseEvidence = Object.keys(caseEvidence).length === caseIds.length;
    const acceptedCaseIds = Object.entries(caseEvidence)
      .filter(([, value]) => (value as { verdict?: string }).verdict === 'accepted')
      .map(([caseId]) => caseId)
      .sort();
    const conflictCaseIds = Object.entries(caseEvidence)
      .filter(([, value]) => (value as { verdict?: string }).verdict === 'canonical-conflict')
      .map(([caseId]) => caseId)
      .sort();
    const report = {
      schemaVersion: '1.0.0',
      runId,
      waveId: 'W4',
      executionMode: 'wave-shared-chain',
      caseLevelRunsClaimed: 0,
      status: !executionDiagnostic && completeCaseEvidence && residueFree && !cleanupDiagnostic
        ? conflictCaseIds.length === 0 ? 'accepted' : 'completed-with-canonical-conflicts'
        : 'incomplete',
      caseIds,
      acceptedCaseIds,
      conflictCaseIds,
      caseEvidence,
      summary: { total: caseIds.length, accepted: acceptedCaseIds.length, canonicalConflict: conflictCaseIds.length, harnessError: executionDiagnostic ? 1 : 0 },
      cleanupEvidence: {
        apiItemResidue,
        uiItemResidue,
        apiSpecResidue,
        uiSpecResidue,
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
    const reportPath = path.resolve(`output/audit/product-center-item-p0-remaining-w4-${runId}.json`);
    writeJsonAtomic(reportPath, report);
    await testInfo.attach('product-center-item-p0-remaining-w4-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function attemptFormattedCreate(submittedName: string): Promise<Record<string, unknown>> {
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.fillItemName(submittedName);
    await form.selectSingleSpec();
    await form.fillStandardPrice('10.00');
    await form.clickAdvancedSettings();
    await form.fillMinimumOrderQuantity('1');
    const enteredName = await form.readItemName();
    const operationPath = '/ops-brand/brand-items/standard';
    const intentId = recordIntent('formatted-name', names.formatted, operationPath);
    const responses: Response[] = [];
    const listener = (response: Response) => {
      if (response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(operationPath)) responses.push(response);
    };
    page.on('response', listener);
    let signal: { responseCount: number; validationErrors: string[]; messages: string[] };
    try {
      await form.clickSave();
      signal = await waitUntil(
        async () => ({
          responseCount: responses.length,
          validationErrors: await form.readVisibleValidationErrors(),
          messages: await createItemListPage(page).readVisibleMessages(),
        }),
        (state) => state.responseCount > 0 || state.validationErrors.length > 0 || state.messages.length > 0,
        { timeout: 15_000, interval: 100, message: 'W4 格式化场景提交终态未出现。' },
      ).catch(async () => ({
        responseCount: responses.length,
        validationErrors: await form.readVisibleValidationErrors(),
        messages: await createItemListPage(page).readVisibleMessages(),
      }));
    } finally {
      page.off('response', listener);
    }
    const response = responses[0];
    if (!response) {
      mutationJournal.recordReconciliation(intentId, 'absent');
      mutationJournal.markPhase(intentId, 'verification-complete');
      return {
        verdict: 'canonical-conflict',
        submittedName,
        submittedLength: submittedName.length,
        enteredName,
        enteredLength: enteredName.length,
        mutationObserved: false,
        validationErrors: signal.validationErrors,
        messages: signal.messages,
        route: new URL(page.url()).pathname,
      };
    }
    mutationJournal.markPhase(intentId, 'response-observed');
    const body = await response.json().catch(() => null);
    expect(response.ok()).toBe(true);
    const finalIdentity = readItemNameFromDetail(await productCenterApi.productDetail(readCreatedId(body)));
    expect(finalIdentity.startsWith('AUTO_AUDIT_')).toBe(true);
    const record = await itemFactory.registerCreated(itemContext(finalIdentity), body, cleanupRegistry);
    itemIdentities.push(finalIdentity);
    mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
    mutationJournal.recordReconciliation(intentId, 'present');
    mutationJournal.markPhase(intentId, 'verification-complete');
    const formattedEdit = await new ItemEditFlow().openEditByItemName(page, finalIdentity, 'standard');
    const formattedFinalName = await formattedEdit.readItemName();
    const formatMatchesCanonical = formattedFinalName.length <= 100
      && !/\s{2,}/u.test(formattedFinalName)
      && !/[#🙂]/u.test(formattedFinalName);
    return {
      verdict: formatMatchesCanonical ? 'accepted' : 'canonical-conflict',
      itemId: record.id,
      submittedName,
      submittedLength: submittedName.length,
      enteredName,
      finalName: formattedFinalName,
      finalLength: formattedFinalName.length,
      mutationObserved: true,
      response: responseEvidence(response),
      consecutiveSpacesCollapsed: !/\s{2,}/u.test(formattedFinalName),
      unsupportedCharactersRemoved: !/[#🙂]/u.test(formattedFinalName),
    };
  }

  async function createStandard(
    action: string,
    identity: string,
    configure: (form: ItemCreateStandardPage) => Promise<void>,
    submittedIdentity = identity,
  ): Promise<{ record: ProductCenterItemCreateRecord; response: Response; entered: unknown }> {
    expect(await itemFactory.itemRecordCount(identity)).toBe(0);
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.fillItemName(submittedIdentity);
    await configure(form);
    const entered = {
      name: await form.readItemName(),
      prices: await form.readVisiblePriceValues(),
      route: new URL(page.url()).pathname,
    };
    const operationPath = '/ops-brand/brand-items/standard';
    const intentId = recordIntent(action, identity, operationPath);
    const response = await submitAndObserve(form, operationPath);
    mutationJournal.markPhase(intentId, 'response-observed');
    const body = await response.json().catch(() => null);
    expect(response.ok()).toBe(true);
    const persistedIdentity = submittedIdentity === identity
      ? identity
      : readItemNameFromDetail(await productCenterApi.productDetail(readCreatedId(body)));
    expect(persistedIdentity.startsWith('AUTO_AUDIT_')).toBe(true);
    const context = itemContext(persistedIdentity);
    const record = await itemFactory.registerCreated(context, body, cleanupRegistry);
    mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
    mutationJournal.recordReconciliation(intentId, 'present');
    mutationJournal.markPhase(intentId, 'verification-complete');
    const listPage = createItemListPage(page);
    await listPage.open();
    await listPage.fillSearch(persistedIdentity);
    await listPage.expectUniqueItemVisible(persistedIdentity);
    return { record, response, entered };
  }

  async function submitAndObserve(form: ItemCreateStandardPage, operationPath: string): Promise<Response> {
    const responses: Response[] = [];
    const listener = (response: Response) => {
      if (response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(operationPath)) responses.push(response);
    };
    page.on('response', listener);
    try {
      await form.clickSave();
      const confirmation = await waitUntil(
        async () => ({
          responseCount: responses.length,
          warningVisible: await form.isAdditionalPriceWarningVisible(),
          validationErrors: await form.readVisibleValidationErrors(),
          messages: await createItemListPage(page).readVisibleMessages(),
        }),
        (state) => state.responseCount > 0
          || state.warningVisible
          || state.validationErrors.length > 0
          || state.messages.length > 0,
        { timeout: 2_000, interval: 50, message: 'W4 保存确认观察窗口结束。' },
      ).catch(async () => ({
        responseCount: responses.length,
        warningVisible: false,
        validationErrors: await form.readVisibleValidationErrors(),
        messages: await createItemListPage(page).readVisibleMessages(),
      }));
      if (confirmation.warningVisible) await form.confirmAdditionalPriceWarning();
      const terminalState = await waitUntil(
        async () => ({
          responseCount: responses.length,
          validationErrors: await form.readVisibleValidationErrors(),
          messages: await createItemListPage(page).readVisibleMessages(),
        }),
        (state) => state.responseCount > 0 || state.validationErrors.length > 0 || state.messages.length > 0,
        { timeout: 15_000, interval: 100, message: 'W4 商品创建终态未出现。' },
      ).catch(async () => ({
        responseCount: responses.length,
        validationErrors: await form.readVisibleValidationErrors(),
        messages: await createItemListPage(page).readVisibleMessages(),
      }));
      if (responses.length === 0) {
        throw new Error(`W4 未观察到商品创建响应：${JSON.stringify({
          validationErrors: terminalState.validationErrors,
          messages: terminalState.messages,
        })}`);
      }
      return responses[0];
    } finally {
      page.off('response', listener);
    }
  }

  async function positiveEvidence(
    created: { record: ProductCenterItemCreateRecord; response: Response; entered: unknown },
    expectedPrices: number[],
    extra: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const detail = await productCenterApi.productDetail(created.record.id);
    for (const expectedPrice of expectedPrices) expect(containsNumber(detail, expectedPrice)).toBe(true);
    expect(containsExactString(detail, created.record.originalIdentity)).toBe(true);
    return {
      verdict: 'accepted',
      itemId: created.record.id,
      identity: created.record.originalIdentity,
      expectedPrices,
      entered: created.entered,
      response: responseEvidence(created.response),
      apiNamePresent: true,
      apiPricesPresent: true,
      ...extra,
    };
  }

  function recordIntent(action: string, identity: string, operationPath: string): string {
    const requestFingerprint = createHash('sha256').update(`${runId}:${action}:${identity}:${operationPath}`).digest('hex');
    const intentId = `intent:remaining-w4:${requestFingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: `audit-unit:remaining-w4:${action}`,
      safetyLevel: 'L3-crud',
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

  function itemContext(identity: string): ProductCenterItemCreateContext {
    return { entityKey: 'item', productType: 'standard', originalIdentity: identity, price: '10.00', minimumOrderQuantity: '1' };
  }
});

function containsExactString(value: unknown, expected: string): boolean {
  if (typeof value === 'string') return value === expected;
  if (Array.isArray(value)) return value.some((item) => containsExactString(item, expected));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some((item) => containsExactString(item, expected));
}

function readCreatedId(value: unknown): number {
  if (!value || typeof value !== 'object') throw new Error('W4 创建响应缺少对象数据');
  const response = value as Record<string, unknown>;
  const data = response.data;
  const candidate = typeof data === 'number' || typeof data === 'string'
    ? data
    : data && typeof data === 'object'
      ? (data as Record<string, unknown>).id
      : response.id;
  const id = Number(candidate);
  if (!Number.isFinite(id)) throw new Error('W4 创建响应缺少服务端 ID');
  return id;
}

function readItemNameFromDetail(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readItemNameFromDetail(item);
      if (found) return found;
    }
    return '';
  }
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const itemBasic = record.itemBasic;
  if (itemBasic && typeof itemBasic === 'object') {
    const name = (itemBasic as Record<string, unknown>).name;
    if (typeof name === 'string') return name;
  }
  for (const child of Object.values(record)) {
    const found = readItemNameFromDetail(child);
    if (found) return found;
  }
  return '';
}

function containsNumber(value: unknown, expected: number): boolean {
  if (typeof value === 'number') return Math.abs(value - expected) < 0.0001;
  if (typeof value === 'string' && value.trim() !== '') return Math.abs(Number(value) - expected) < 0.0001;
  if (Array.isArray(value)) return value.some((item) => containsNumber(item, expected));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some((item) => containsNumber(item, expected));
}

function responseEvidence(response: Response): { method: string; path: string; status: number } {
  return { method: response.request().method(), path: new URL(response.url()).pathname, status: response.status() };
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
