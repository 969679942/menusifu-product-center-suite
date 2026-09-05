import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MutationIntentJournal } from '../../api/product-center/mutation-intent-journal';
import { test, expect } from '../../fixtures/product-center.fixture';
import { ItemListPage } from '../../pages/product-management/item/item-list.page';
import { ProductCenterSidebarNavigationPage } from '../../pages/product-center/product-center-sidebar-navigation.page';
import { ProductCenterItemCreateDataFactory } from '../../test-data/product-center/product-center-item-create-data.factory';

const caseIds = [
  'TC-ITEM-STD-030',
  'TC-ITEM-ADD-041',
  'TC-ITEM-ADD-002',
  'TC-ITEM-PKG-048',
  'TC-ITEM-UI-004',
  'TC-ITEM-UI-005',
  'TC-ITEM-UI-006',
  'TC-ITEM-UI-007',
  'TC-ITEM-UI-008',
] as const;

type Verdict = 'accepted' | 'canonical-conflict';
type CaseEvidence = { verdict: Verdict; evidence: unknown };

test('Y3-B1 六组九条低风险黄色用例整波技术验收', async ({
  page,
  productCenterApi,
  cleanupRegistry,
  executionLedger,
}, testInfo) => {
  test.setTimeout(600_000);
  test.skip(process.env.PC_YELLOW_Y3_LIVE !== '1', '未启用 Y3 认证实时验收');
  const runId = process.env.PC_RECIPE_RUN_ID?.startsWith('AUTO_AUDIT_')
    ? process.env.PC_RECIPE_RUN_ID
    : `AUTO_AUDIT_YELLOW_Y3_${Date.now()}`;
  const reportPath = path.resolve(`output/audit/product-center-item-yellow-y3-runtime-${runId}.json`);
  const navigation = new ProductCenterSidebarNavigationPage(page);
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const mutationJournal = new MutationIntentJournal({ rootDir: path.resolve('output/mutation-intents'), runId });
  const resumedEvidence = loadResumableEvidence(reportPath, runId);
  const caseEvidence: Record<string, CaseEvidence> = { ...resumedEvidence };
  invalidateReprobeGroup(caseEvidence, process.env.PC_YELLOW_Y3_REPROBE_CASE_IDS);
  const itemIdentities: string[] = [];
  const intentIds: string[] = [];
  let executionDiagnostic: string | undefined;

  checkpoint('running');
  try {
    if (!caseEvidence['TC-ITEM-STD-030']) {
      caseEvidence['TC-ITEM-STD-030'] = await probeFilterMemory('Standard', `AUTO_AUDIT_Y3_STD_MEMORY_${Date.now()}`);
    }
    if (!caseEvidence['TC-ITEM-ADD-041']) {
      caseEvidence['TC-ITEM-ADD-041'] = await probeFilterMemory('Add-On', `AUTO_AUDIT_Y3_ADD_MEMORY_${Date.now()}`);
    }
    if (!caseEvidence['TC-ITEM-PKG-048']) {
      caseEvidence['TC-ITEM-PKG-048'] = await probeFilterMemory('Combo', `AUTO_AUDIT_Y3_PKG_MEMORY_${Date.now()}`);
    }

    if (!caseEvidence['TC-ITEM-UI-007'] || !caseEvidence['TC-ITEM-UI-008']) {
      await navigation.openFromSidebar('/pp/brand/list');
      const listPage = new ItemListPage(page);
      const createTypePage = await listPage.enterCreateTypePage();
      const standardCreate = await createTypePage.enterStandardCreate();
      const standardActions = await standardCreate.readSaveActionEvidence();
      caseEvidence['TC-ITEM-UI-007'] = disposition(
        standardActions.saveAndNew.visible && standardActions.saveAndNew.enabled,
        standardActions,
      );

      await navigation.openFromSidebar('/pp/brand/list');
      const comboCreate = await (await new ItemListPage(page).enterCreateTypePage()).enterComboCreate();
      const comboActions = await comboCreate.readSaveActionEvidence();
      caseEvidence['TC-ITEM-UI-008'] = disposition(
        comboActions.saveAndNew.visible && comboActions.saveAndNew.enabled,
        comboActions,
      );
    }

    if (!caseEvidence['TC-ITEM-ADD-002']) {
      await navigation.openFromSidebar('/pp/brand/list');
      const sideCreate = await (await new ItemListPage(page).enterCreateTypePage()).enterSideCreate();
      const sideOtherSettings = await sideCreate.readOtherSettingsCapabilityEvidence();
      caseEvidence['TC-ITEM-ADD-002'] = disposition(
        Object.values(sideOtherSettings).every((count) => count === 1),
        sideOtherSettings,
      );
    }

    if (!caseEvidence['TC-ITEM-UI-004'] || !caseEvidence['TC-ITEM-UI-005'] || !caseEvidence['TC-ITEM-UI-006']) {
      const temporaryItem = await createTemporaryStandardItem();
      itemIdentities.push(temporaryItem.identity);
      await navigation.openFromSidebar('/pp/brand/list');
      const batchList = new ItemListPage(page);
      await batchList.fillSearch(temporaryItem.identity);
      await batchList.expectUniqueItemVisible(temporaryItem.identity);
      await batchList.selectFirstRow();
      await batchList.expectBatchActionEnabled(1);
      const batchMenu = await batchList.readBatchActionMenuEvidence();
      caseEvidence['TC-ITEM-UI-004'] = disposition(
        includesEvery(batchMenu.productInfoItems, [
          'Edit Image', 'Edit Name', 'Edit Second Language', 'Edit Category', 'Edit POS Name',
          'Edit Kitchen Name', 'Edit Quick Code', 'Edit Code', 'Edit Unit', 'Edit Device Code', 'Edit Description',
        ]),
        { identity: temporaryItem.identity, menuOpened: batchMenu.menuOpened, productInfoItems: batchMenu.productInfoItems },
      );
      caseEvidence['TC-ITEM-UI-005'] = disposition(
        includesEvery(batchMenu.topLevelItems, ['Modify Sales Info', 'Modify Price', 'Modify Attributes']),
        { identity: temporaryItem.identity, menuOpened: batchMenu.menuOpened, topLevelItems: batchMenu.topLevelItems },
      );
      caseEvidence['TC-ITEM-UI-006'] = disposition(
        includesEvery(batchMenu.topLevelItems, ['Add to Menu', 'Delete']),
        { identity: temporaryItem.identity, menuOpened: batchMenu.menuOpened, topLevelItems: batchMenu.topLevelItems },
      );
    }

    expect(Object.keys(caseEvidence).sort()).toEqual([...caseIds].sort());
    checkpoint('evidence-complete');
  } catch (error) {
    executionDiagnostic = safeDiagnostic(error);
    checkpoint('executor-error');
    throw error;
  } finally {
    let cleanupDiagnostic: string | undefined;
    try {
      await cleanupRegistry.cleanupAll();
    } catch (error) {
      cleanupDiagnostic = safeDiagnostic(error);
    }
    const auditedIdentities = [...new Set([
      ...itemIdentities,
      ...mutationJournal.snapshot().entries.map((entry) => entry.identity),
    ])];
    const apiResidue = Object.fromEntries(await Promise.all(auditedIdentities.map(async (identity) => (
      [identity, await itemFactory.itemRecordCount(identity)] as const
    ))));
    const uiResidue: Record<string, number> = {};
    try {
      const listPage = new ItemListPage(page);
      await listPage.open();
      for (const identity of auditedIdentities) {
        await listPage.fillSearchForResidueCheck(identity);
        await listPage.expectEmptySearchResults();
        uiResidue[identity] = 0;
      }
    } catch (error) {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
    }
    const ledger = executionLedger.snapshot();
    const residueFree = Object.values(apiResidue).every((count) => count === 0)
      && Object.values(uiResidue).every((count) => count === 0)
      && ledger.entries.every((entry) => entry.phase === 'residue-verified');
    if (residueFree && !cleanupDiagnostic) {
      for (const intentId of intentIds) mutationJournal.markPhase(intentId, 'cleanup-complete');
    }
    const acceptedCaseIds = Object.entries(caseEvidence)
      .filter(([, value]) => value.verdict === 'accepted')
      .map(([caseId]) => caseId)
      .sort();
    const canonicalConflictCaseIds = Object.entries(caseEvidence)
      .filter(([, value]) => value.verdict === 'canonical-conflict')
      .map(([caseId]) => caseId)
      .sort();
    const complete = Object.keys(caseEvidence).length === caseIds.length;
    const status = complete && residueFree && !executionDiagnostic && !cleanupDiagnostic
      ? canonicalConflictCaseIds.length > 0 ? 'accepted-with-canonical-conflicts' : 'accepted'
      : 'incomplete';
    const report = {
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-yellow-y3-runtime',
      runId,
      batchId: 'Y3-B1',
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
        apiResidue,
        uiResidue,
        residueFree,
        ledgerEntries: ledger.entries.length,
        residueVerified: ledger.entries.filter((entry) => entry.phase === 'residue-verified').length,
        cleanupDiagnostic,
      },
      executionDiagnostic,
      resumedCaseIds: Object.keys(resumedEvidence).sort(),
      mutationIntents: mutationJournal.snapshot().entries.map((entry) => ({
        intentId: entry.intentId,
        identity: entry.identity,
        phase: entry.phase,
        reconciliation: entry.reconciliation,
        operation: entry.operation,
        serverId: entry.serverId,
        ledgerEntryId: entry.ledgerEntryId,
      })),
      security: { credentialsPersisted: false, authorizationArtifactsPersisted: false, storageStatePersisted: false },
    };
    writeJsonAtomic(reportPath, report);
    await testInfo.attach('product-center-item-yellow-y3-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function probeFilterMemory(typeLabel: 'Standard' | 'Add-On' | 'Combo', keyword: string): Promise<CaseEvidence> {
    await navigation.openFromSidebar('/pp/brand/list');
    const listPage = new ItemListPage(page);
    await listPage.clickReset();
    await listPage.fillSearch(keyword);
    await listPage.selectTypeFilterOptionForMemoryProbe(typeLabel);
    const before = await listPage.readFilterState();
    await navigation.openFromSidebar('/pp/brand/tag/description');
    await navigation.openFromSidebar('/pp/brand/list');
    const after = await new ItemListPage(page).readFilterState();
    return disposition(
      before.search === keyword
        && before.checkedTypeCount === 1
        && after.search === keyword
        && after.checkedTypeCount === 1,
      { keyword, typeLabel, before, after },
    );
  }

  async function createTemporaryStandardItem(): Promise<{ identity: string; id: number }> {
    const context = await itemFactory.prepare();
    expect(context.originalIdentity.startsWith('AUTO_AUDIT_')).toBe(true);
    await navigation.openFromSidebar('/pp/brand/list');
    const form = await (await new ItemListPage(page).enterCreateTypePage()).enterStandardCreate();
    await form.fillItemName(context.originalIdentity);
    await form.selectSingleSpec();
    await form.fillStandardPrice('10.00');
    const operationPath = '/ops-brand/brand-items/standard';
    const intentId = recordIntent(context.originalIdentity, operationPath);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith(operationPath)
    ), { timeout: 60_000 });
    await form.clickSave();
    const response = await responsePromise;
    mutationJournal.markPhase(intentId, 'response-observed');
    const body = await response.json().catch(() => null);
    expect(response.ok()).toBe(true);
    const record = await itemFactory.registerCreated(context, body, cleanupRegistry);
    mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
    mutationJournal.recordReconciliation(intentId, 'present');
    mutationJournal.markPhase(intentId, 'verification-complete');
    checkpoint('temporary-item-created');
    return { identity: record.originalIdentity, id: record.id };
  }

  function recordIntent(identity: string, operationPath: string): string {
    const requestFingerprint = createHash('sha256').update(`${runId}:${identity}:${operationPath}`).digest('hex');
    const intentId = `intent:yellow-y3:${requestFingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: 'audit-unit:yellow-y3-b1-batch-menu',
      safetyLevel: 'L3-crud',
      entity: 'item',
      identity,
      identityVariants: [identity],
      operation: { method: 'POST', path: operationPath },
      requestFingerprint,
    });
    intentIds.push(intentId);
    mutationJournal.markPhase(intentId, 'trigger-started');
    return intentId;
  }

  function checkpoint(phase: string): void {
    writeJsonAtomic(reportPath, {
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-yellow-y3-runtime-checkpoint',
      runId,
      batchId: 'Y3-B1',
      phase,
      caseIds,
      completedCaseIds: Object.keys(caseEvidence),
      caseEvidence,
      executionDiagnostic,
      updatedAt: new Date().toISOString(),
    });
  }
});

function disposition(accepted: boolean, evidence: unknown): CaseEvidence {
  return { verdict: accepted ? 'accepted' : 'canonical-conflict', evidence };
}

function loadResumableEvidence(reportPath: string, runId: string): Record<string, CaseEvidence> {
  if (!fs.existsSync(reportPath)) return {};
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    runId?: string;
    caseEvidence?: Record<string, CaseEvidence>;
    cleanupEvidence?: { residueFree?: boolean };
    mutationIntents?: Array<{ phase?: string }>;
  };
  if (report.runId !== runId
    || report.cleanupEvidence?.residueFree !== true
    || report.mutationIntents?.some((entry) => entry.phase !== 'cleanup-complete')) return {};
  return report.caseEvidence ?? {};
}

function invalidateReprobeGroup(evidence: Record<string, CaseEvidence>, rawCaseIds: string | undefined): void {
  const requested = new Set((rawCaseIds ?? '').split(',').map((value) => value.trim()).filter(Boolean));
  const groups = [
    ['TC-ITEM-UI-004', 'TC-ITEM-UI-005', 'TC-ITEM-UI-006'],
    ['TC-ITEM-UI-007', 'TC-ITEM-UI-008'],
  ];
  for (const group of groups) {
    if (group.some((caseId) => requested.has(caseId))) {
      for (const caseId of group) delete evidence[caseId];
      for (const caseId of group) requested.delete(caseId);
    }
  }
  for (const caseId of requested) delete evidence[caseId];
}

function includesEvery(actual: string[], expected: string[]): boolean {
  const normalized = actual.map(normalizeText);
  return expected.every((value) => normalized.some((item) => item.includes(normalizeText(value))));
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, '');
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
