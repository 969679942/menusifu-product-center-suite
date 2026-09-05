import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CleanupRegistry } from '../../api/product-center/cleanup-registry';
import { ProductCenterExecutionLedger } from '../../api/product-center/execution-ledger';
import { MutationIntentJournal } from '../../api/product-center/mutation-intent-journal';
import { ProductCenterApiRecoveryAdapter, ProductCenterRecoveryService } from '../../api/product-center/recovery-service';
import { test, expect } from '../../fixtures/product-center.fixture';
import { ItemEditFlow } from '../../flows/item-edit.flow';
import { ProductCenterItemComboCreateFlow } from '../../flows/product-center/product-center-item-combo-create.flow';
import { ItemListPage } from '../../pages/product-management/item/item-list.page';
import {
  ProductCenterItemCreateDataFactory,
  type ProductCenterItemCreateContext,
  type ProductCenterItemCreateRecord,
} from '../../test-data/product-center/product-center-item-create-data.factory';

const caseIds = ['TC-ITEM-PKG-016'] as const;
type Verdict = 'accepted' | 'canonical-conflict';
type CaseEvidence = { verdict: Verdict; evidence: unknown };

test('绿色 AT39 套餐 MOQ 共享波次技术验收', async ({ page, productCenterApi }, testInfo) => {
  test.setTimeout(600_000);
  test.skip(process.env.PC_GREEN_AT39_LIVE !== '1', '未启用绿色 AT39 认证实时验收');
  const runId = process.env.PC_RECIPE_RUN_ID?.startsWith('AUTO_AUDIT_')
    ? process.env.PC_RECIPE_RUN_ID
    : `AUTO_AUDIT_GREEN_AT39_${Date.now()}`;
  const reportPath = path.resolve(`output/audit/product-center-item-green-at39-runtime-${runId}.json`);
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
  const caseEvidence: Record<string, CaseEvidence> = loadResumableEvidence(reportPath, runId);
  let comboContext: ProductCenterItemCreateContext | undefined;
  let executionDiagnostic: string | undefined;

  try {
    await recoverInterruptedRun();
    checkpoint('running');
    if (!caseEvidence['TC-ITEM-PKG-016']) await runMinimumOrderQuantityGroup();
    expect(Object.keys(caseEvidence)).toEqual(['TC-ITEM-PKG-016']);
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
      if (recovery.failedEntryIds.length > 0) throw new Error(`AT39 恢复清理失败：${recovery.failedEntryIds.join(',')}`);
    } catch (error) {
      cleanupDiagnostic = safeDiagnostic(error);
    }
    const ledger = executionLedger.snapshot();
    const itemIdentities = [...new Set([
      ...attemptedIdentities,
      ...ledger.entries
        .filter((entry) => entry.entityKind === 'item' || entry.entityKind === 'bom-product')
        .flatMap((entry) => entry.identityVariants),
      ...mutationJournal.snapshot().entries.map((entry) => entry.identity),
    ])];
    const comboIdentities = [...new Set(ledger.entries
      .filter((entry) => entry.entityKind === 'combo')
      .flatMap((entry) => entry.identityVariants))];
    const apiItemResidue = Object.fromEntries(await Promise.all(itemIdentities.map(async (identity) => (
      [identity, await itemFactory.itemRecordCount(identity)] as const
    ))));
    const apiComboResidue = Object.fromEntries(await Promise.all(comboIdentities.map(async (identity) => (
      [identity, await itemFactory.comboGroupRecordCount(identity)] as const
    ))));
    const uiItemResidue: Record<string, number> = {};
    try {
      const list = new ItemListPage(page);
      await list.open();
      for (const identity of itemIdentities) {
        await list.fillSearchForResidueCheck(identity);
        await list.expectItemNotVisible(identity);
        uiItemResidue[identity] = 0;
      }
    } catch (error) {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
    }
    const residueFree = [apiItemResidue, apiComboResidue, uiItemResidue]
      .every((residue) => Object.values(residue).every((value) => value === 0))
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
      collectionId: 'product-center-item-green-at39-runtime',
      runId,
      batchId: 'GREEN-AT39',
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
        apiComboResidue,
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
    await testInfo.attach('product-center-item-green-at39-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function runMinimumOrderQuantityGroup(): Promise<void> {
    comboContext = await itemFactory.prepareComboRequiredOnly(cleanupRegistry);
    comboContext = { ...comboContext, minimumOrderQuantity: '2' };
    const flow = new ProductCenterItemComboCreateFlow(page);
    let intentId: string | undefined;
    const result = await flow.create({
      context: comboContext,
      price: '10.00',
      minimumOrderQuantity: '2',
      comboGroupName: comboContext.comboGroupName!,
      beforeSubmit: async () => {
        attemptedIdentities.add(comboContext!.originalIdentity);
        expect(await itemFactory.itemRecordCount(comboContext!.originalIdentity)).toBe(0);
        intentId = recordIntent(comboContext!.originalIdentity);
      },
    }, async (responseBody) => {
      if (!intentId) throw new Error('AT39 创建响应出现前缺少 mutation intent');
      mutationJournal.markPhase(intentId, 'response-observed');
      const record = await itemFactory.registerCreated(comboContext!, responseBody, cleanupRegistry);
      recordsByIdentity.set(record.originalIdentity, record);
      mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
      mutationJournal.recordReconciliation(intentId, 'present');
      mutationJournal.markPhase(intentId, 'verification-complete');
      return record;
    });
    await flow.verifyUi(result);
    const reopened = await new ItemEditFlow().openEditByItemName(page, comboContext.originalIdentity, 'combo');
    const reopenedMinimumOrderQuantity = await reopened.readMinimumOrderQuantityValue();
    const accepted = result.valueBeforeSave === '2'
      && result.minimumOrderQuantity === '2'
      && result.responseStatus >= 200
      && result.responseStatus < 300
      && result.successMessageCount === 1
      && result.locatorCount === 1
      && result.listPrice === 10
      && reopenedMinimumOrderQuantity === '2';
    caseEvidence['TC-ITEM-PKG-016'] = disposition(accepted, {
      identity: comboContext.originalIdentity,
      comboGroupName: comboContext.comboGroupName,
      valueBeforeSave: result.valueBeforeSave,
      response: {
        method: result.responseMethod,
        path: result.responsePath,
        status: result.responseStatus,
      },
      successMessageCount: result.successMessageCount,
      locatorCount: result.locatorCount,
      listPrice: result.listPrice,
      reopenedMinimumOrderQuantity,
      expectedSatisfied: accepted,
    });
    checkpoint('TC-ITEM-PKG-016-complete');
  }

  async function recoverInterruptedRun(): Promise<void> {
    const recovery = await recoveryService.recoverIncomplete();
    if (recovery.failedEntryIds.length > 0) throw new Error(`AT39 启动恢复失败：${recovery.failedEntryIds.join(',')}`);
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
        throw new Error(`AT39 非幂等对账不唯一：${entry.identity} count=${count}`);
      }
      const context = comboContext ?? itemContext(entry.identity);
      const record = recordsByIdentity.get(entry.identity)
        ?? await itemFactory.registerCreated(context, null, cleanupRegistry);
      recordsByIdentity.set(entry.identity, record);
      attemptedIdentities.add(entry.identity);
      mutationJournal.attachServerIdentity(entry.intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
      mutationJournal.recordReconciliation(entry.intentId, 'present');
      mutationJournal.markPhase(entry.intentId, 'verification-complete');
    }
  }

  function recordIntent(identity: string): string {
    const operationPath = '/ops-brand/brand-items/combo';
    const fingerprint = createHash('sha256').update(`${runId}:${identity}:POST:${operationPath}`).digest('hex');
    const intentId = `intent:green-at39:${fingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: 'audit-unit:green-at39:create-combo-moq-2',
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
      collectionId: 'product-center-item-green-at39-runtime-checkpoint',
      runId,
      batchId: 'GREEN-AT39',
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
    productType: 'combo',
    originalIdentity: identity,
    price: '10.00',
    minimumOrderQuantity: '2',
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
