import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CleanupRegistry } from '../../api/product-center/cleanup-registry';
import { ProductCenterExecutionLedger } from '../../api/product-center/execution-ledger';
import { MutationIntentJournal } from '../../api/product-center/mutation-intent-journal';
import { ProductCenterApiRecoveryAdapter, ProductCenterRecoveryService } from '../../api/product-center/recovery-service';
import { test, expect } from '../../fixtures/product-center.fixture';
import { ItemEditFlow } from '../../flows/item-edit.flow';
import { ProductCenterItemGreenReadonlyFlow } from '../../flows/product-center/product-center-item-green-readonly.flow';
import {
  ProductCenterItemStandardCreateFlow,
  type ProductCenterItemStandardCreateInput,
  type ProductCenterItemStandardCreateResult,
} from '../../flows/product-center/product-center-item-standard-create.flow';
import { ItemListPage } from '../../pages/product-management/item/item-list.page';
import {
  ProductCenterItemCreateDataFactory,
  type ProductCenterItemCreateContext,
  type ProductCenterItemCreateRecord,
} from '../../test-data/product-center/product-center-item-create-data.factory';

const caseIds = ['TC-ITEM-STD-020', 'TC-ITEM-STD-048', 'TC-ITEM-STD-050', 'TC-ITEM-STD-098'] as const;
type CaseId = typeof caseIds[number];
type Verdict = 'accepted' | 'canonical-conflict';
type CaseEvidence = { verdict: Verdict; evidence: unknown };

test('绿色 AT09 标准商品价格规格共享波次技术验收', async ({ page, productCenterApi }, testInfo) => {
  test.setTimeout(900_000);
  test.skip(process.env.PC_GREEN_AT09_LIVE !== '1', '未启用绿色 AT09 认证实时验收');
  const runId = process.env.PC_RECIPE_RUN_ID?.startsWith('AUTO_AUDIT_')
    ? process.env.PC_RECIPE_RUN_ID
    : `AUTO_AUDIT_GREEN_AT09_${Date.now()}`;
  const reportPath = path.resolve(`output/audit/product-center-item-green-at09-runtime-${runId}.json`);
  const executionLedger = new ProductCenterExecutionLedger({ rootDir: path.resolve('output/checkpoints'), runId });
  const cleanupRegistry = new CleanupRegistry(executionLedger);
  const recoveryService = new ProductCenterRecoveryService(
    executionLedger,
    new ProductCenterApiRecoveryAdapter(productCenterApi),
  );
  const mutationJournal = new MutationIntentJournal({ rootDir: path.resolve('output/mutation-intents'), runId });
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const recordsByIdentity = new Map<string, ProductCenterItemCreateRecord>();
  const contextsByIdentity = new Map<string, ProductCenterItemCreateContext>();
  const attemptedIdentities = new Set<string>();
  const caseEvidence: Record<string, CaseEvidence> = normalizeResumableEvidence(
    loadResumableEvidence(reportPath, runId),
  );
  let executionDiagnostic: string | undefined;

  try {
    await recoverInterruptedRun();
    checkpoint('running');
    if (!caseEvidence['TC-ITEM-STD-020']) await runStandardCreateCase('TC-ITEM-STD-020', {
      price: '1.99',
      minimumOrderQuantity: '1',
    });
    if (!caseEvidence['TC-ITEM-STD-048']) await runSpecGroupNavigationCase();
    if (!caseEvidence['TC-ITEM-STD-050']) await runStandardCreateCase('TC-ITEM-STD-050', {
      price: '10.00',
      minimumOrderQuantity: '1',
      packagingFee: '1.00',
    });
    if (!caseEvidence['TC-ITEM-STD-098']) await runStandardCreateCase('TC-ITEM-STD-098', {
      price: '10.00',
      minimumOrderQuantity: '1',
      cost: '5.00',
    });
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
      if (recovery.failedEntryIds.length > 0) throw new Error(`AT09 恢复清理失败：${recovery.failedEntryIds.join(',')}`);
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
    const apiItemResidue = Object.fromEntries(await Promise.all(itemIdentities.map(async (identity) => (
      [identity, await itemFactory.itemRecordCount(identity)] as const
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
    const residueFree = [apiItemResidue, uiItemResidue]
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
      collectionId: 'product-center-item-green-at09-runtime',
      runId,
      batchId: 'GREEN-AT09',
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
    await testInfo.attach('product-center-item-green-at09-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function runStandardCreateCase(
    caseId: Extract<CaseId, 'TC-ITEM-STD-020' | 'TC-ITEM-STD-050' | 'TC-ITEM-STD-098'>,
    scenario: Pick<ProductCenterItemStandardCreateInput, 'price' | 'minimumOrderQuantity' | 'packagingFee' | 'cost'>,
  ): Promise<void> {
    const context = await itemFactory.prepare();
    contextsByIdentity.set(context.originalIdentity, context);
    let intentId: string | undefined;
    const flow = new ProductCenterItemStandardCreateFlow(page);
    const result = await flow.create({
      context: { ...context, price: scenario.price, minimumOrderQuantity: scenario.minimumOrderQuantity },
      specification: 'single',
      ...scenario,
      beforeSubmit: async () => {
        attemptedIdentities.add(context.originalIdentity);
        expect(await itemFactory.itemRecordCount(context.originalIdentity)).toBe(0);
        intentId = recordIntent(caseId, context.originalIdentity);
      },
    }, async (responseBody) => {
      if (!intentId) throw new Error(`${caseId} 创建响应出现前缺少 mutation intent`);
      mutationJournal.markPhase(intentId, 'response-observed');
      const record = await itemFactory.registerCreated(
        { ...context, price: scenario.price, minimumOrderQuantity: scenario.minimumOrderQuantity },
        responseBody,
        cleanupRegistry,
      );
      recordsByIdentity.set(record.originalIdentity, record);
      mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
      mutationJournal.recordReconciliation(intentId, 'present');
      mutationJournal.markPhase(intentId, 'verification-complete');
      return record;
    });
    let verificationDiagnostic: string | undefined;
    let reopenedPackagingFee: string | undefined;
    let reopenedCost: string | undefined;
    try {
      await flow.verifyUi(result);
      if (scenario.packagingFee !== undefined || scenario.cost !== undefined) {
        const reopened = await new ItemEditFlow().openEditByItemName(page, context.originalIdentity, 'standard');
        if (scenario.packagingFee !== undefined) reopenedPackagingFee = await reopened.readPackagingFeeValue();
        if (scenario.cost !== undefined) reopenedCost = await reopened.readCostValue();
      }
    } catch (error) {
      verificationDiagnostic = safeDiagnostic(error);
    }
    const accepted = standardCaseAccepted(caseId, scenario, result, reopenedPackagingFee, reopenedCost)
      && !verificationDiagnostic;
    caseEvidence[caseId] = disposition(accepted, {
      identity: context.originalIdentity,
      price: scenario.price,
      minimumOrderQuantity: scenario.minimumOrderQuantity,
      priceBeforeSave: result.priceBeforeSave,
      packagingFee: scenario.packagingFee,
      packagingFeeBeforeSave: result.packagingFeeBeforeSave,
      reopenedPackagingFee,
      cost: scenario.cost,
      costBeforeSave: result.costBeforeSave,
      reopenedCost,
      response: {
        method: result.responseMethod,
        path: result.responsePath,
        status: result.responseStatus,
      },
      successMessageCount: result.successMessageCount,
      locatorCount: result.locatorCount,
      listPrice: result.listPrice,
      verificationDiagnostic,
      expectedSatisfied: accepted,
    });
    checkpoint(`${caseId}-complete`);
  }

  async function runSpecGroupNavigationCase(): Promise<void> {
    const evidence = await new ProductCenterItemGreenReadonlyFlow(page).probeSpecGroupCreateNavigation();
    const accepted = evidence.createEntryCount === 1
      && evidence.navigationObserved
      && (evidence.afterPath === '/pp/brand/spec/create' || evidence.newPagePath === '/pp/brand/spec/create')
      && (evidence.newPagePath === '' || evidence.newPageClosed);
    caseEvidence['TC-ITEM-STD-048'] = disposition(accepted, {
      ...evidence,
      expectedSatisfied: accepted,
    });
    checkpoint('TC-ITEM-STD-048-complete');
  }

  async function recoverInterruptedRun(): Promise<void> {
    const recovery = await recoveryService.recoverIncomplete();
    if (recovery.failedEntryIds.length > 0) throw new Error(`AT09 启动恢复失败：${recovery.failedEntryIds.join(',')}`);
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
        throw new Error(`AT09 非幂等对账不唯一：${entry.identity} count=${count}`);
      }
      const context = contextsByIdentity.get(entry.identity) ?? itemContext(entry.identity);
      const record = recordsByIdentity.get(entry.identity)
        ?? await itemFactory.registerCreated(context, null, cleanupRegistry);
      recordsByIdentity.set(entry.identity, record);
      attemptedIdentities.add(entry.identity);
      mutationJournal.attachServerIdentity(entry.intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
      mutationJournal.recordReconciliation(entry.intentId, 'present');
      mutationJournal.markPhase(entry.intentId, 'verification-complete');
    }
  }

  function recordIntent(caseId: CaseId, identity: string): string {
    const operationPath = '/ops-brand/brand-items/standard';
    const fingerprint = createHash('sha256').update(`${runId}:${caseId}:${identity}:POST:${operationPath}`).digest('hex');
    const intentId = `intent:green-at09:${fingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: `audit-unit:green-at09:${caseId.toLowerCase()}`,
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
      collectionId: 'product-center-item-green-at09-runtime-checkpoint',
      runId,
      batchId: 'GREEN-AT09',
      phase,
      caseIds,
      completedCaseIds: Object.keys(caseEvidence),
      caseEvidence,
      executionDiagnostic,
      updatedAt: new Date().toISOString(),
    });
  }
});

function standardCaseAccepted(
  caseId: Extract<CaseId, 'TC-ITEM-STD-020' | 'TC-ITEM-STD-050' | 'TC-ITEM-STD-098'>,
  scenario: Pick<ProductCenterItemStandardCreateInput, 'price' | 'minimumOrderQuantity' | 'packagingFee' | 'cost'>,
  result: ProductCenterItemStandardCreateResult,
  reopenedPackagingFee?: string,
  reopenedCost?: string,
): boolean {
  const common = result.priceBeforeSave === scenario.price
    && result.responseMethod === 'POST'
    && result.responsePath.endsWith('/ops-brand/brand-items/standard')
    && result.responseStatus >= 200
    && result.responseStatus < 300
    && result.successMessageCount === 1
    && result.locatorCount === 1
    && result.listPrice === Number(scenario.price);
  if (caseId === 'TC-ITEM-STD-050') {
    return common && result.packagingFeeBeforeSave === '1.00' && reopenedPackagingFee === '1.00';
  }
  if (caseId === 'TC-ITEM-STD-098') {
    return common && result.costBeforeSave === '5.00' && reopenedCost === '5.00';
  }
  return common;
}

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

function normalizeResumableEvidence(evidence: Record<string, CaseEvidence>): Record<string, CaseEvidence> {
  const existing = evidence['TC-ITEM-STD-048'];
  if (!existing || !existing.evidence || typeof existing.evidence !== 'object') return evidence;
  const value = existing.evidence as Record<string, unknown>;
  const accepted = value.createEntryCount === 1
    && value.navigationObserved === true
    && (value.afterPath === '/pp/brand/spec/create' || value.newPagePath === '/pp/brand/spec/create')
    && (value.newPagePath === '' || value.newPageClosed === true);
  if (!accepted) return evidence;
  return {
    ...evidence,
    'TC-ITEM-STD-048': {
      verdict: 'accepted',
      evidence: { ...value, expectedSatisfied: true, classificationReconciled: true },
    },
  };
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
