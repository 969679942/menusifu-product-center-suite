import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CleanupRegistry } from '../../api/product-center/cleanup-registry';
import { ProductCenterExecutionLedger } from '../../api/product-center/execution-ledger';
import { MutationIntentJournal } from '../../api/product-center/mutation-intent-journal';
import { ProductCenterApiRecoveryAdapter, ProductCenterRecoveryService } from '../../api/product-center/recovery-service';
import { test, expect } from '../../fixtures/product-center.fixture';
import { ItemEditFlow } from '../../flows/item-edit.flow';
import { ItemCreateStandardPage } from '../../pages/product-management/item/item-create-standard.page';
import { ItemListPage } from '../../pages/product-management/item/item-list.page';
import {
  ProductCenterItemCreateDataFactory,
  type ProductCenterItemCreateContext,
  type ProductCenterItemCreateRecord,
} from '../../test-data/product-center/product-center-item-create-data.factory';

const caseIds = ['TC-ITEM-STD-078'] as const;

type Verdict = 'accepted' | 'canonical-conflict';
type CaseEvidence = { verdict: Verdict; evidence: unknown };

test('绿色 AT15 主图替换共享波次技术验收', async ({ page, productCenterApi }, testInfo) => {
  test.setTimeout(600_000);
  test.skip(process.env.PC_GREEN_AT15_LIVE !== '1', '未启用绿色 AT15 认证实时验收');
  const runId = process.env.PC_RECIPE_RUN_ID?.startsWith('AUTO_AUDIT_')
    ? process.env.PC_RECIPE_RUN_ID
    : `AUTO_AUDIT_GREEN_AT15_${Date.now()}`;
  const reportPath = path.resolve(`output/audit/product-center-item-green-at15-runtime-${runId}.json`);
  const executionLedger = new ProductCenterExecutionLedger({ rootDir: path.resolve('output/checkpoints'), runId });
  const cleanupRegistry = new CleanupRegistry(executionLedger);
  const recoveryService = new ProductCenterRecoveryService(
    executionLedger,
    new ProductCenterApiRecoveryAdapter(productCenterApi),
  );
  const mutationJournal = new MutationIntentJournal({ rootDir: path.resolve('output/mutation-intents'), runId });
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const recordsByIdentity = new Map<string, ProductCenterItemCreateRecord>();
  const attemptedIdentities = new Set<string>();
  const resumedEvidence = loadResumableEvidence(reportPath, runId);
  const caseEvidence: Record<string, CaseEvidence> = { ...resumedEvidence };
  const timestamp = Date.now();
  const identity = `AUTO_AUDIT_GREEN_AT15_MAIN_IMAGE_${timestamp}`;
  const firstImagePath = testInfo.outputPath(`AUTO_AUDIT_GREEN_AT15_FIRST_${timestamp}.png`);
  const secondImagePath = testInfo.outputPath(`AUTO_AUDIT_GREEN_AT15_SECOND_${timestamp}.png`);
  const interactionScreenshotPath = testInfo.outputPath(`AUTO_AUDIT_GREEN_AT15_AFTER_FIRST_${timestamp}.png`);
  let executionDiagnostic: string | undefined;

  try {
    await recoverInterruptedRun();
    checkpoint('running');
    if (!caseEvidence['TC-ITEM-STD-078']) await runMainImageReplacementGroup();
    expect(Object.keys(caseEvidence)).toEqual(['TC-ITEM-STD-078']);
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
      if (recovery.failedEntryIds.length > 0) throw new Error(`AT15 恢复清理失败：${recovery.failedEntryIds.join(',')}`);
    } catch (error) {
      cleanupDiagnostic = safeDiagnostic(error);
    }
    const identities = [...new Set([
      ...attemptedIdentities,
      ...mutationJournal.snapshot().entries.map((entry) => entry.identity),
    ])];
    const apiItemResidue = Object.fromEntries(await Promise.all(identities.map(async (candidate) => (
      [candidate, await itemFactory.itemRecordCount(candidate)] as const
    ))));
    const uiItemResidue: Record<string, number> = {};
    try {
      const list = new ItemListPage(page);
      await list.open();
      for (const candidate of identities) {
        await list.fillSearchForResidueCheck(candidate);
        await list.expectItemNotVisible(candidate);
        uiItemResidue[candidate] = 0;
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
      ? canonicalConflictCaseIds.length > 0 ? 'accepted-with-canonical-conflict' : 'accepted'
      : 'incomplete';
    const report = {
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-green-at15-runtime',
      runId,
      batchId: 'GREEN-AT15',
      executionMode: 'wave-shared-chain',
      evidenceInheritanceAllowed: false,
      caseLevelRunsClaimed: 0,
      status,
      caseIds,
      acceptedCaseIds,
      canonicalConflictCaseIds,
      caseEvidence,
      summary: {
        total: 1,
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
    await testInfo.attach('product-center-item-green-at15-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function runMainImageReplacementGroup(): Promise<void> {
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await createAuditImages();
    await form.fillItemName(identity);
    await form.selectSingleSpec();
    await form.ensureAdvancedSettingsExpanded();
    await form.fillMinimumOrderQuantity('1');
    const firstUpload = await form.uploadCommonMainImageWithEvidence(firstImagePath);
    const interactionEvidenceAfterFirstUpload = await form.readCommonMainImageInteractionEvidence();
    await page.screenshot({ path: interactionScreenshotPath, fullPage: true });
    if (firstUpload.terminalState !== 'preview-ready') {
      const replacement = {
        attempted: false,
        outcome: 'first-upload-not-ready',
        requestObserved: false,
        responseStatus: null,
      };
      const persistedEvidence = {
        created: false,
        reason: 'first-upload-not-ready',
      };
      caseEvidence['TC-ITEM-STD-078'] = disposition(false, {
        firstUpload,
        interactionEvidenceAfterFirstUpload,
        interactionScreenshot: path.basename(interactionScreenshotPath),
        replacement,
        persistedEvidence,
        expectedSatisfied: false,
      });
      checkpoint('TC-ITEM-STD-078-complete');
      return;
    }
    const replacement = await form.replaceCommonMainImage(secondImagePath);
    const stateBeforeSave = await form.readCommonMainImageState();
    await form.fillStandardPrice('10.00');
    const submission = await submitCreate(form);
    const detail = await productCenterApi.productDetail(submission.record.id);
    const list = new ItemListPage(page);
    await list.open();
    await list.fillSearch(identity);
    const listImageSources = await list.readItemMainImageSources(identity);
    const reopened = await new ItemEditFlow().openEditByItemName(page, identity, 'standard');
    const reopenedState = await reopened.readCommonMainImageState();
    const persistedEvidence = {
      itemId: submission.record.id,
      apiImageCount: readImageData(detail).length,
      listImageSources,
      reopenedState,
    };
    const accepted = firstUpload.cardCount === 1
      && replacement.responseStatus !== null
      && replacement.responseStatus >= 200
      && replacement.responseStatus < 300
      && replacement.afterCount === 1
      && replacement.afterSources.length === 1
      && JSON.stringify(replacement.beforeSources) !== JSON.stringify(replacement.afterSources)
      && stateBeforeSave.count === 1
      && submission.responseStatus >= 200
      && submission.responseStatus < 300
      && submission.successMessageCount > 0
      && persistedEvidence.apiImageCount > 0
      && listImageSources.some(isBusinessImageSource)
      && reopenedState.count === 1
      && reopenedState.sources.some((source) => comparableImageSource(source)
        === comparableImageSource(replacement.afterSources[0] ?? ''));
    caseEvidence['TC-ITEM-STD-078'] = disposition(accepted, {
      firstUpload,
      interactionEvidenceAfterFirstUpload,
      interactionScreenshot: path.basename(interactionScreenshotPath),
      replacement,
      stateBeforeSave,
      submission: {
        responseStatus: submission.responseStatus,
        successMessageCount: submission.successMessageCount,
      },
      persistedEvidence,
      expectedSatisfied: accepted,
    });
    checkpoint('TC-ITEM-STD-078-complete');
  }

  async function submitCreate(form: ItemCreateStandardPage): Promise<{
    record: ProductCenterItemCreateRecord;
    responseStatus: number;
    successMessageCount: number;
  }> {
    attemptedIdentities.add(identity);
    expect(await itemFactory.itemRecordCount(identity)).toBe(0);
    const operationPath = '/ops-brand/brand-items/standard';
    const intentId = recordIntent(`create-${identity}`, identity, operationPath);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(operationPath)
    ), { timeout: 60_000 });
    await form.clickSave();
    const response = await responsePromise;
    mutationJournal.markPhase(intentId, 'response-observed');
    const body = await response.json().catch(() => null);
    expect(response.ok()).toBe(true);
    const record = await itemFactory.registerCreated(itemContext(identity), body, cleanupRegistry);
    recordsByIdentity.set(identity, record);
    mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
    mutationJournal.recordReconciliation(intentId, 'present');
    mutationJournal.markPhase(intentId, 'verification-complete');
    return {
      record,
      responseStatus: response.status(),
      successMessageCount: await form.readSuccessMessageCount().catch(() => 0),
    };
  }

  async function createAuditImages(): Promise<void> {
    if (fs.existsSync(firstImagePath) && fs.existsSync(secondImagePath)) return;
    await page.screenshot({ path: firstImagePath, clip: { x: 0, y: 0, width: 256, height: 256 } });
    await page.screenshot({ path: secondImagePath, clip: { x: 256, y: 0, width: 256, height: 256 } });
  }

  async function recoverInterruptedRun(): Promise<void> {
    const recovery = await recoveryService.recoverIncomplete();
    if (recovery.failedEntryIds.length > 0) throw new Error(`AT15 启动恢复失败：${recovery.failedEntryIds.join(',')}`);
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
        throw new Error(`AT15 非幂等对账不唯一：${entry.identity} count=${count}`);
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

  function recordIntent(action: string, candidate: string, operationPath: string): string {
    const fingerprint = createHash('sha256').update(`${runId}:${action}:${candidate}:POST:${operationPath}`).digest('hex');
    const intentId = `intent:green-at15:${fingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: `audit-unit:green-at15:${action}`,
      safetyLevel: 'L3-crud',
      entity: 'item',
      identity: candidate,
      identityVariants: [candidate],
      operation: { method: 'POST', path: operationPath },
      requestFingerprint: fingerprint,
    });
    mutationJournal.markPhase(intentId, 'trigger-started');
    return intentId;
  }

  function checkpoint(phase: string): void {
    writeJsonAtomic(reportPath, {
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-green-at15-runtime-checkpoint',
      runId,
      batchId: 'GREEN-AT15',
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
    productType: 'standard',
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

function isBusinessImageSource(source: string): boolean {
  return source.length > 0 && !source.startsWith('nullimage') && !source.startsWith('data:image/svg+xml');
}

function comparableImageSource(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split('?')[0];
  }
}

function readImageData(value: unknown): unknown[] {
  const matches: unknown[] = [];
  collectImageData(value, matches);
  return matches;
}

function collectImageData(value: unknown, matches: unknown[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectImageData(item, matches);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => /image|url/i.test(key))
    && Object.values(record).some((item) => typeof item === 'string' && /https?:|image|cdn/i.test(item))) {
    matches.push(record);
  }
  for (const child of Object.values(record)) collectImageData(child, matches);
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
