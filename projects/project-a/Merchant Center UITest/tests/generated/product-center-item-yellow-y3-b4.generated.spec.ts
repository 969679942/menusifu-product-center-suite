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
import { ItemListPage } from '../../pages/product-management/item/item-list.page';
import {
  ProductCenterItemCreateDataFactory,
  type ProductCenterItemCreateContext,
  type ProductCenterItemCreateRecord,
} from '../../test-data/product-center/product-center-item-create-data.factory';

const caseIds = ['TC-ITEM-ADD-012', 'TC-ITEM-ADD-013'] as const;

type Verdict = 'accepted' | 'canonical-conflict';
type CaseEvidence = { verdict: Verdict; evidence: unknown };
type ResponseEvidence = { observed: boolean; status?: number; ok?: boolean; businessCode?: string | number; message?: string };
type SubmissionEvidence = {
  inputBeforeSubmit: Record<string, string>;
  validationErrors: string[];
  responseEvidence: ResponseEvidence;
  successMessageCount: number;
  record?: ProductCenterItemCreateRecord;
};

test('Y3-B4 两条格式规则用例整波技术验收', async ({ page, productCenterApi }, testInfo) => {
  test.setTimeout(600_000);
  test.skip(process.env.PC_YELLOW_Y3_B4_LIVE !== '1', '未启用 Y3-B4 认证实时验收');
  const runId = process.env.PC_RECIPE_RUN_ID?.startsWith('AUTO_AUDIT_')
    ? process.env.PC_RECIPE_RUN_ID
    : `AUTO_AUDIT_YELLOW_Y3_B4_${Date.now()}`;
  const reportPath = path.resolve(`output/audit/product-center-item-yellow-y3-b4-runtime-${runId}.json`);
  const executionLedger = new ProductCenterExecutionLedger({ rootDir: path.resolve('output/checkpoints'), runId });
  const cleanupRegistry = new CleanupRegistry(executionLedger);
  const recoveryService = new ProductCenterRecoveryService(
    executionLedger,
    new ProductCenterApiRecoveryAdapter(productCenterApi),
  );
  const mutationJournal = new MutationIntentJournal({ rootDir: path.resolve('output/mutation-intents'), runId });
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const caseEvidence: Record<string, CaseEvidence> = loadResumableEvidence(reportPath, runId);
  const recordsByIdentity = new Map<string, ProductCenterItemCreateRecord>();
  const attemptedIdentities = new Set<string>();
  const timestamp = Date.now();
  const rawLongItemName = `AUTO_AUDIT_Y3_B4_NAME_${timestamp}_商品名称  连  空格 Test01@#😀_${'超长字段'.repeat(24)}`;
  const advancedItemName = `AUTO_AUDIT_Y3_B4_ADVANCED_${timestamp}`;
  const rawPosName = 'POS名称  连  空格 Test01@#😀ABCDEFGHIJKLMN';
  const rawKitchenName = '送厨名称  连  空格 Test02@#😀ABCDEFGHIJKLMN';
  let executionDiagnostic: string | undefined;

  try {
    await recoverInterruptedRun();
    checkpoint('running');
    if (!caseEvidence['TC-ITEM-ADD-012']) await probeItemNameFormatting();
    if (!caseEvidence['TC-ITEM-ADD-013']) await probeAdvancedNameFormatting();
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
      if (recovery.failedEntryIds.length > 0) throw new Error(`Y3-B4 恢复清理失败：${recovery.failedEntryIds.join(',')}`);
    } catch (error) {
      cleanupDiagnostic = safeDiagnostic(error);
    }
    const identities = [...new Set([
      ...attemptedIdentities,
      ...mutationJournal.snapshot().entries.map((entry) => entry.identity),
    ])];
    const apiItemResidue = Object.fromEntries(await Promise.all(identities.map(async (identity) => (
      [identity, await itemFactory.itemRecordCount(identity)] as const
    ))));
    const uiItemResidue: Record<string, number> = {};
    try {
      const list = new ItemListPage(page);
      await list.open();
      for (const identity of identities) {
        await list.fillSearchForResidueCheck(identity);
        await list.expectItemNotVisible(identity);
        uiItemResidue[identity] = 0;
      }
    } catch (error) {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
    }
    const ledger = executionLedger.snapshot();
    const residueFree = Object.values(apiItemResidue).every((value) => value === 0)
      && Object.values(uiItemResidue).every((value) => value === 0)
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
      collectionId: 'product-center-item-yellow-y3-b4-runtime',
      runId,
      batchId: 'Y3-B4',
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
        residueFree,
        ledgerEntries: ledger.entries.length,
        residueVerified: ledger.entries.filter((entry) => entry.phase === 'residue-verified').length,
        cleanupDiagnostic,
      },
      executionDiagnostic,
      mutationIntents: mutationJournal.snapshot().entries.map((entry) => ({
        intentId: entry.intentId,
        identity: entry.identity,
        phase: entry.phase,
        reconciliation: entry.reconciliation,
        serverId: entry.serverId,
        ledgerEntryId: entry.ledgerEntryId,
      })),
      security: { credentialsPersisted: false, authorizationArtifactsPersisted: false, storageStatePersisted: false },
    };
    writeJsonAtomic(reportPath, report);
    await testInfo.attach('product-center-item-yellow-y3-b4-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function probeItemNameFormatting(): Promise<void> {
    const form = new ItemCreateSidePage(page);
    await form.open();
    await form.fillItemName(rawLongItemName);
    await form.fillStandardPrice('10.00');
    const submittedName = await form.readItemName();
    const submission = await submitProbe(form, submittedName, { itemName: submittedName });
    const persistedEvidence = await readPersistedEvidence(submission.record, submittedName, false);
    const savedName = persistedEvidence.itemName;
    const expectedSatisfied = submission.responseEvidence.ok === true
      && submission.successMessageCount > 0
      && Boolean(submission.record)
      && typeof savedName === 'string'
      && Array.from(savedName).length <= 100
      && !/\s{2,}/u.test(savedName)
      && !/[\p{Extended_Pictographic}#]/u.test(savedName)
      && persistedEvidence.listMatchCount === 1;
    caseEvidence['TC-ITEM-ADD-012'] = disposition(expectedSatisfied, {
      sourceRules: ['BR-FMT-001', 'BR-FMT-004', 'BR-ITEM-010'],
      rawInput: { itemName: rawLongItemName, codePointLength: Array.from(rawLongItemName).length },
      inputBeforeSubmit: submission.inputBeforeSubmit,
      validationErrors: submission.validationErrors,
      responseEvidence: submission.responseEvidence,
      successMessageCount: submission.successMessageCount,
      persistedEvidence,
      expectedSatisfied,
    });
    checkpoint('TC-ITEM-ADD-012-complete');
  }

  async function probeAdvancedNameFormatting(): Promise<void> {
    const form = new ItemCreateSidePage(page);
    await form.open();
    await form.fillItemName(advancedItemName);
    await form.ensureAdvancedSettingsExpanded();
    await form.fillPosName(rawPosName);
    await form.fillKitchenName(rawKitchenName);
    await form.fillStandardPrice('10.00');
    const inputBeforeSubmit = {
      itemName: await form.readItemName(),
      posName: await form.readPosName(),
      kitchenName: await form.readKitchenName(),
    };
    const submission = await submitProbe(form, inputBeforeSubmit.itemName, inputBeforeSubmit);
    const persistedEvidence = await readPersistedEvidence(submission.record, inputBeforeSubmit.itemName, true);
    const formattedValues = [persistedEvidence.posName, persistedEvidence.kitchenName];
    const expectedSatisfied = submission.responseEvidence.ok === true
      && submission.successMessageCount > 0
      && Boolean(submission.record)
      && formattedValues.every((value) => (
        typeof value === 'string'
        && value === value.trim()
        && Array.from(value).length <= 100
        && !/\s{2,}/u.test(value)
        && !/\p{Extended_Pictographic}/u.test(value)
      ))
      && persistedEvidence.advancedFieldsReadable === true
      && persistedEvidence.listMatchCount === 1;
    caseEvidence['TC-ITEM-ADD-013'] = disposition(expectedSatisfied, {
      sourceRules: ['BR-FMT-001', 'BR-FMT-004', 'BR-ITEM-010'],
      rawInput: { posName: rawPosName, kitchenName: rawKitchenName },
      inputBeforeSubmit: submission.inputBeforeSubmit,
      validationErrors: submission.validationErrors,
      responseEvidence: submission.responseEvidence,
      successMessageCount: submission.successMessageCount,
      persistedEvidence,
      expectedSatisfied,
    });
    checkpoint('TC-ITEM-ADD-013-complete');
  }

  async function submitProbe(
    form: ItemCreateFormPage,
    identity: string,
    inputBeforeSubmit: Record<string, string>,
  ): Promise<SubmissionEvidence> {
    expect(identity.startsWith('AUTO_AUDIT_')).toBe(true);
    attemptedIdentities.add(identity);
    expect(await itemFactory.itemRecordCount(identity)).toBe(0);
    const operationPath = '/ops-brand/brand-items/standard';
    const intentId = recordIntent(`create-${identity}`, identity, operationPath);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(operationPath)
    ), { timeout: 15_000 }).catch(() => undefined);
    await form.clickSave();
    const response = await responsePromise;
    const responseEvidence = await summarizeResponse(response);
    if (response) mutationJournal.markPhase(intentId, 'response-observed');
    const validationErrors = await form.readVisibleValidationErrors().catch(() => []);
    const successMessageCount = await form.readSuccessMessageCount().catch(() => 0);
    const count = await itemFactory.itemRecordCount(identity);
    let record: ProductCenterItemCreateRecord | undefined;
    if (count === 1) {
      const body = response ? await response.json().catch(() => null) : null;
      record = await itemFactory.registerCreated(itemContext(identity), body, cleanupRegistry);
      recordsByIdentity.set(identity, record);
      mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
      mutationJournal.recordReconciliation(intentId, 'present');
    } else if (count === 0) {
      mutationJournal.recordReconciliation(intentId, 'absent');
    } else {
      mutationJournal.recordReconciliation(intentId, 'ambiguous');
      throw new Error(`Y3-B4 创建结果不唯一：${identity} count=${count}`);
    }
    mutationJournal.markPhase(intentId, 'verification-complete');
    return { inputBeforeSubmit, validationErrors, responseEvidence, successMessageCount, record };
  }

  async function readPersistedEvidence(
    record: ProductCenterItemCreateRecord | undefined,
    identity: string,
    includeAdvancedFields: boolean,
  ): Promise<Record<string, unknown> & { itemName?: string; posName?: string; kitchenName?: string; listMatchCount: number }> {
    if (!record) return { created: false, listMatchCount: 0 };
    const edit = await new ItemEditFlow().openEditByItemName(page, identity, 'side');
    const itemName = await edit.readItemName();
    let posName: string | undefined;
    let kitchenName: string | undefined;
    let advancedFieldsReadable: boolean | undefined;
    let advancedFieldsDiagnostic: string | undefined;
    if (includeAdvancedFields) {
      try {
        await edit.ensureAdvancedSettingsExpanded();
        posName = await edit.readPosName();
        kitchenName = await edit.readKitchenName();
        advancedFieldsReadable = true;
      } catch (error) {
        advancedFieldsReadable = false;
        advancedFieldsDiagnostic = safeDiagnostic(error);
        const detail = await productCenterApi.productDetail(record.id);
        posName = readItemBasicString(detail, 'posName');
        kitchenName = readItemBasicString(detail, 'kitchenName');
      }
    }
    const list = new ItemListPage(page);
    await list.open();
    await list.fillSearch(identity);
    const listMatchCount = (await list.readItemServerIds(identity)).length;
    return {
      created: true,
      serverId: record.id,
      itemName,
      posName,
      kitchenName,
      advancedFieldsReadable,
      advancedFieldsDiagnostic,
      listMatchCount,
    };
  }

  async function summarizeResponse(response: Response | undefined): Promise<ResponseEvidence> {
    if (!response) return { observed: false };
    const body = await response.json().catch(() => undefined) as Record<string, unknown> | undefined;
    return {
      observed: true,
      status: response.status(),
      ok: response.ok(),
      businessCode: typeof body?.code === 'string' || typeof body?.code === 'number' ? body.code : undefined,
      message: typeof body?.message === 'string' ? body.message.slice(0, 300) : undefined,
    };
  }

  async function recoverInterruptedRun(): Promise<void> {
    const recovery = await recoveryService.recoverIncomplete();
    if (recovery.failedEntryIds.length > 0) throw new Error(`Y3-B4 启动恢复失败：${recovery.failedEntryIds.join(',')}`);
    await reconcileIncompleteIntents();
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
        throw new Error(`Y3-B4 非幂等对账不唯一：${entry.identity} count=${count}`);
      }
      const record = recordsByIdentity.get(entry.identity)
        ?? await itemFactory.registerCreated(itemContext(entry.identity), null, cleanupRegistry);
      recordsByIdentity.set(entry.identity, record);
      attemptedIdentities.add(entry.identity);
      mutationJournal.attachServerIdentity(entry.intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
      mutationJournal.recordReconciliation(entry.intentId, 'present');
      mutationJournal.markPhase(entry.intentId, 'verification-complete');
    }
  }

  function recordIntent(action: string, identity: string, operationPath: string): string {
    const fingerprint = createHash('sha256').update(`${runId}:${action}:${identity}:POST:${operationPath}`).digest('hex');
    const intentId = `intent:yellow-y3-b4:${fingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: `audit-unit:yellow-y3-b4:${action}`,
      safetyLevel: 'L3-crud',
      entity: 'item',
      identity,
      identityVariants: [identity],
      operation: { method: 'POST', path: operationPath },
      requestFingerprint: fingerprint,
    });
    mutationJournal.markPhase(intentId, 'trigger-started');
    return intentId;
  }

  function checkpoint(phase: string): void {
    writeJsonAtomic(reportPath, {
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-yellow-y3-b4-runtime-checkpoint',
      runId,
      batchId: 'Y3-B4',
      phase,
      caseIds,
      completedCaseIds: Object.keys(caseEvidence),
      caseEvidence,
      executionDiagnostic,
      updatedAt: new Date().toISOString(),
    });
  }
});

function itemContext(identity: string): ProductCenterItemCreateContext {
  return {
    entityKey: 'item',
    productType: 'side',
    originalIdentity: identity,
    price: '10.00',
    minimumOrderQuantity: '1',
  };
}

function disposition(accepted: boolean, evidence: unknown): CaseEvidence {
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

function readItemBasicString(value: unknown, key: 'posName' | 'kitchenName'): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readItemBasicString(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const itemBasic = record.itemBasic;
  if (itemBasic && typeof itemBasic === 'object') {
    const candidate = (itemBasic as Record<string, unknown>)[key];
    if (typeof candidate === 'string') return candidate;
  }
  for (const child of Object.values(record)) {
    const found = readItemBasicString(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
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
