import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Page, Response } from '@playwright/test';
import { MutationIntentJournal } from '../../api/product-center/mutation-intent-journal';
import { test, expect } from '../../fixtures/product-center.fixture';
import { ItemEditFlow } from '../../flows/item-edit.flow';
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
import { ProductCenterLowDependencyDataFactory } from '../../test-data/product-center/sop/product-center-low-dependency-data.factory';
import { waitUntil } from '../../utils/wait';

const caseIds = [
  'TC-ITEM-STD-081',
  'TC-ITEM-STD-090',
  'TC-ITEM-STD-091',
  'TC-ITEM-STD-089',
  'TC-ITEM-ADD-046',
  'TC-ITEM-PKG-073',
  'TC-ITEM-PKG-074',
  'TC-ITEM-PKG-075',
] as const;

test('W5 图片、标签、角标与默认选中边界 8 条 P0 用例整波技术验收', async ({
  page,
  productCenterApi,
  cleanupRegistry,
  executionLedger,
}, testInfo) => {
  test.setTimeout(900_000);
  test.skip(process.env.PC_P0_REMAINING_W5_LIVE !== '1', '未启用 W5 认证实时验收');
  const runId = process.env.PC_P0_REMAINING_W5_RUN_ID ?? `AUTO_AUDIT_P0_REMAINING_W5_${Date.now()}`;
  const timestamp = Date.now();
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const lowDependencyFactory = new ProductCenterLowDependencyDataFactory(productCenterApi);
  const mutationJournal = new MutationIntentJournal({ rootDir: path.resolve('output/mutation-intents'), runId });
  const names = {
    duplicateImage: `AUTO_AUDIT_W5_DUPLICATE_IMAGE_${timestamp}`,
    standard: `AUTO_AUDIT_W5_STANDARD_${timestamp}`,
    combo: `AUTO_AUDIT_W5_COMBO_${timestamp}`,
  };
  const itemIdentities = Object.values(names);
  const caseEvidence: Record<string, { disposition: 'accepted' | 'canonical-conflict'; evidence: unknown }> = {};
  const intents: string[] = [];
  let executionDiagnostic: string | undefined;
  let resources: Awaited<ReturnType<typeof seedResources>> | undefined;

  try {
    resources = await seedResources();
    const optionNames = String(resources.ruleGroup.metadata.optionNames).split('|');

    caseEvidence['TC-ITEM-STD-081'] = await verifyDuplicateDetailImage();
    caseEvidence['TC-ITEM-STD-090'] = accepted(await verifyDescriptionBoundary(
      (isolatedPage) => new ItemCreateStandardPage(isolatedPage),
    ));
    caseEvidence['TC-ITEM-ADD-046'] = accepted(await verifyDescriptionBoundary(
      (isolatedPage) => new ItemCreateSidePage(isolatedPage),
    ));
    caseEvidence['TC-ITEM-PKG-074'] = accepted(await verifyDescriptionBoundary(
      (isolatedPage) => new ItemCreateComboPage(isolatedPage),
    ));

    const standardRecord = await createStandardWithBoundaries(optionNames);
    const standardEvidence = await updateAndVerifyCorner(
      names.standard,
      'standard',
      standardRecord,
      resources.cornerMarks.marks.map((mark) => mark.name),
      resources.ruleGroup.originalIdentity,
      optionNames,
    );
    if (!standardEvidence.defaultBoundary) throw new Error('标准商品默认项证据缺失。');
    caseEvidence['TC-ITEM-STD-089'] = standardEvidence.defaultBoundary;
    caseEvidence['TC-ITEM-STD-091'] = standardEvidence.cornerBoundary;

    const comboContext = await itemFactory.prepareComboRequiredOnly(cleanupRegistry);
    const comboSetup = await createComboWithBoundaries(comboContext, optionNames);
    const comboEvidence = await updateAndVerifyCorner(
      names.combo,
      'combo',
      comboSetup.record,
      resources.cornerMarks.marks.map((mark) => mark.name),
      comboSetup.attributeAttached ? resources.ruleGroup.originalIdentity : undefined,
      comboSetup.attributeAttached ? optionNames : undefined,
    );
    caseEvidence['TC-ITEM-PKG-073'] = comboEvidence.defaultBoundary ?? comboSetup.defaultBoundary;
    caseEvidence['TC-ITEM-PKG-075'] = comboEvidence.cornerBoundary;

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
    const apiResidue = await readApiResidue();
    const uiResidue = await readUiResidue().catch((error) => {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
      return { items: {}, descriptionTags: {}, cornerMarks: {}, ruleGroups: {} };
    });
    const ledger = executionLedger.snapshot();
    const incompleteLedgerEntries = ledger.entries.filter((entry) => entry.phase !== 'residue-verified').length;
    const uiAndApiResidueFree = allZero(apiResidue) && allZero(uiResidue);
    if (uiAndApiResidueFree && incompleteLedgerEntries === 0) {
      for (const intentId of intents) mutationJournal.markPhase(intentId, 'cleanup-complete');
    }
    const acceptedCaseIds = Object.entries(caseEvidence)
      .filter(([, value]) => value.disposition === 'accepted')
      .map(([caseId]) => caseId)
      .sort();
    const canonicalConflictCaseIds = Object.entries(caseEvidence)
      .filter(([, value]) => value.disposition === 'canonical-conflict')
      .map(([caseId]) => caseId)
      .sort();
    const completeCaseEvidence = Object.keys(caseEvidence).length === caseIds.length;
    const report = {
      schemaVersion: '1.0.0',
      runId,
      waveId: 'W5',
      executionMode: 'wave-shared-chain',
      caseLevelRunsClaimed: 0,
      status: completeCaseEvidence
        && uiAndApiResidueFree
        && incompleteLedgerEntries === 0
        && !executionDiagnostic
        && !cleanupDiagnostic
        ? canonicalConflictCaseIds.length > 0 ? 'accepted-with-canonical-conflicts' : 'accepted'
        : 'incomplete',
      caseIds,
      acceptedCaseIds,
      canonicalConflictCaseIds,
      caseEvidence,
      executionDiagnostic,
      cleanupEvidence: {
        apiResidue,
        uiResidue,
        uiAndApiResidueFree,
        ledgerEntries: ledger.entries.length,
        residueVerified: ledger.entries.filter((entry) => entry.phase === 'residue-verified').length,
        incompleteLedgerEntries,
        cleanupDiagnostic,
      },
      mutationIntents: mutationJournal.snapshot().entries.map((entry) => ({
        intentId: entry.intentId,
        phase: entry.phase,
        reconciliation: entry.reconciliation,
        operation: entry.operation,
        serverId: entry.serverId,
        ledgerEntryId: entry.ledgerEntryId,
      })),
    };
    writeJsonAtomic(path.resolve(`output/audit/product-center-item-p0-remaining-w5-${runId}.json`), report);
    await testInfo.attach('product-center-item-p0-remaining-w5-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function seedResources() {
    const descriptionTags = await lowDependencyFactory.seedDescriptionTagBoundaryScenario(cleanupRegistry);
    const cornerMarks = await lowDependencyFactory.seedCornerMarkBoundaryScenario(cleanupRegistry);
    const ruleGroup = await lowDependencyFactory.seedMultiOptionRuleGroupScenario(cleanupRegistry);
    return { descriptionTags, cornerMarks, ruleGroup };
  }

  async function verifyDescriptionBoundary(
    createForm: (isolatedPage: Page) => ItemCreateFormPage,
  ): Promise<unknown> {
    const isolatedPage = await page.context().newPage();
    try {
      const form = createForm(isolatedPage);
      await form.open();
      const boundary = await form.selectDescriptionTagsByName(resources!.descriptionTags.tags.map((tag) => tag.name));
      expect(boundary.maximumText).toMatch(/Maximum\s+5/i);
      expect(boundary.checkedNames).toHaveLength(5);
      expect(boundary.blockedNames).toEqual([resources!.descriptionTags.tags[5].name]);
      expect(boundary.selectedNames).toHaveLength(5);
      return boundary;
    } finally {
      await isolatedPage.close();
    }
  }

  async function verifyDuplicateDetailImage(): Promise<{ disposition: 'accepted' | 'canonical-conflict'; evidence: unknown }> {
    expect(await itemFactory.itemRecordCount(names.duplicateImage)).toBe(0);
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.fillItemName(names.duplicateImage);
    await form.selectSingleSpec();
    await form.fillStandardPrice('10.00');
    const imagePath = testInfo.outputPath('AUTO_AUDIT_W5_DUPLICATE_DETAIL.png');
    await page.screenshot({ path: imagePath, clip: { x: 0, y: 0, width: 256, height: 256 } });
    const duplicateUpload = await form.attemptDuplicateDetailImage(imagePath);
    const intentId = recordIntent('duplicate-detail-image', names.duplicateImage, 'L2-controlled-negative', 'POST', '/ops-brand/brand-items/standard');
    const responses: Response[] = [];
    const listener = (response: Response) => {
      if (response.request().method() === 'POST'
        && new URL(response.url()).pathname.endsWith('/ops-brand/brand-items/standard')) responses.push(response);
    };
    page.on('response', listener);
    try {
      await form.clickSave();
      let stableBlockedObservations = 0;
      const terminalState = await waitUntil(
        async () => {
          const messages = await createItemListPage(page).readVisibleMessages();
          const apiRecordCount = await itemFactory.itemRecordCount(names.duplicateImage);
          const route = new URL(page.url()).pathname;
          const blockedOnCreatePage = responses.length === 0
            && apiRecordCount === 0
            && route.includes('/pp/brand/create/standard')
            && /BITEM-3006|Image data duplicate|图片数据重复/.test(JSON.stringify(messages));
          stableBlockedObservations = blockedOnCreatePage ? stableBlockedObservations + 1 : 0;
          return { responses: responses.length, messages, apiRecordCount, route, stableBlockedObservations };
        },
        (state) => state.responses > 0 || state.apiRecordCount > 0 || state.stableBlockedObservations >= 8,
        { timeout: 30_000, interval: 250, message: '详情图重复提交未到达稳定终态。' },
      );
      if (responses.length > 0) mutationJournal.markPhase(intentId, 'response-observed');
      const bodies = await Promise.all(responses.map((response) => response.json().catch(() => null)));
      let lateCreatedRecord: ProductCenterItemCreateRecord | undefined;
      if (terminalState.apiRecordCount > 0 || responses.some((response) => response.ok())) {
        lateCreatedRecord = await itemFactory.registerCreated(
          itemContext(names.duplicateImage, 'standard'),
          bodies.find(Boolean),
          cleanupRegistry,
        );
        mutationJournal.attachServerIdentity(intentId, {
          serverId: lateCreatedRecord.id,
          ledgerEntryId: lateCreatedRecord.checkpointEntryId,
        });
      }
      const afterCount = lateCreatedRecord ? 1 : await itemFactory.itemRecordCount(names.duplicateImage);
      mutationJournal.recordReconciliation(intentId, afterCount === 0 ? 'absent' : 'present');
      mutationJournal.markPhase(intentId, 'verification-complete');
      const signal = JSON.stringify({ bodies, messages: terminalState.messages });
      const canonicalMatched = /BITEM-3006|图片数据重复/.test(signal);
      return {
        disposition: canonicalMatched && afterCount === 0 ? 'accepted' : 'canonical-conflict',
        evidence: {
          duplicateUpload,
          responses: responses.map(responseEvidence),
          bodies,
          messages: terminalState.messages,
          apiRecordCount: afterCount,
          route: terminalState.route,
          stableBlockedObservations: terminalState.stableBlockedObservations,
          lateCreatedRecord: lateCreatedRecord ? {
            id: lateCreatedRecord.id,
            checkpointEntryId: lateCreatedRecord.checkpointEntryId,
          } : undefined,
          canonicalExpected: 'BITEM-3006：图片数据重复',
          canonicalMatched,
        },
      };
    } finally {
      page.off('response', listener);
    }
  }

  async function createStandardWithBoundaries(optionNames: string[]): Promise<ProductCenterItemCreateRecord> {
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.fillItemName(names.standard);
    await form.selectSingleSpec();
    await form.fillStandardPrice('10.00');
    await form.selectFlavorGroupByName(resources!.ruleGroup.originalIdentity);
    const defaultBoundary = await form.selectOnlyDefaultOption(resources!.ruleGroup.originalIdentity, optionNames[1]);
    expect(defaultBoundary.checkedSwitches).toBe(1);
    expect((await form.selectCornerMarkByName(resources!.cornerMarks.marks[0].name)).selected).toBe(true);
    return submitCreate(form, itemContext(names.standard, 'standard'), '/ops-brand/brand-items/standard');
  }

  async function createComboWithBoundaries(
    comboContext: ProductCenterItemCreateContext,
    optionNames: string[],
  ): Promise<{
    record: ProductCenterItemCreateRecord;
    attributeAttached: boolean;
    defaultBoundary: { disposition: 'canonical-conflict'; evidence: unknown };
  }> {
    const context = { ...comboContext, originalIdentity: names.combo };
    const form = new ItemCreateComboPage(page);
    await form.open();
    await form.fillItemName(names.combo);
    await form.clickAdvancedSettings();
    await form.fillMinimumOrderQuantity('1');
    await form.fillStandardPrice('10.00');
    await form.addFixedComboGroupByName(comboContext.comboGroupName!);
    const capability = await form.readCommonAttributeCapabilityEvidence(resources!.ruleGroup.originalIdentity);
    let attributeAttached = false;
    if (capability.addButtonCount === 1) {
      await form.selectFlavorGroupByName(resources!.ruleGroup.originalIdentity);
      const selected = await form.selectOnlyDefaultOption(resources!.ruleGroup.originalIdentity, optionNames[1]);
      expect(selected.checkedSwitches).toBe(1);
      attributeAttached = true;
    }
    expect((await form.selectCornerMarkByName(resources!.cornerMarks.marks[0].name)).selected).toBe(true);
    const record = await submitCreate(form, context, '/ops-brand/brand-items/combo');
    return {
      record,
      attributeAttached,
      defaultBoundary: {
        disposition: 'canonical-conflict',
        evidence: {
          itemId: record.id,
          capability,
          canonicalExpected: '套餐商品可关联至少两个子项的属性组，并且同组仅保留一个默认项。',
          observed: '当前套餐商品页没有共享 Attribute 添加入口。',
        },
      },
    };
  }

  async function submitCreate(
    form: ItemCreateFormPage,
    context: ProductCenterItemCreateContext,
    operationPath: string,
  ): Promise<ProductCenterItemCreateRecord> {
    const intentId = recordIntent(`create-${context.productType}`, context.originalIdentity, 'L3-crud', 'POST', operationPath);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(operationPath)
    ), { timeout: 60_000 });
    await form.clickSave();
    const response = await responsePromise;
    mutationJournal.markPhase(intentId, 'response-observed');
    const body = await response.json().catch(() => null);
    const record = await itemFactory.registerCreated(context, body, cleanupRegistry);
    mutationJournal.recordReconciliation(intentId, 'present');
    mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
    mutationJournal.markPhase(intentId, 'verification-complete');
    return record;
  }

  async function updateAndVerifyCorner(
    identity: string,
    type: 'standard' | 'combo',
    record: ProductCenterItemCreateRecord,
    cornerNames: string[],
    groupName?: string,
    optionNames?: string[],
  ): Promise<{
    defaultBoundary?: { disposition: 'accepted' | 'canonical-conflict'; evidence: unknown };
    cornerBoundary: { disposition: 'accepted' | 'canonical-conflict'; evidence: unknown };
  }> {
    const edit = await new ItemEditFlow().openEditByItemName(page, identity, type);
    await edit.ensureOtherSettingsExpanded();
    const beforeCorners = await edit.readSelectedCornerMarks(cornerNames);
    const beforeDefault = groupName && optionNames
      ? await edit.readOnlyDefaultOptionState(groupName, optionNames)
      : undefined;
    expect((await edit.selectCornerMarkByName(cornerNames[1])).selected).toBe(true);
    const intentId = recordIntent(`update-${type}-corner`, identity, 'L3-crud', 'PUT', `/ops-brand/brand-items/${type}/${record.id}`);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'PUT'
      && new URL(response.url()).pathname.endsWith(`/ops-brand/brand-items/${type}/${record.id}`)
    ), { timeout: 60_000 });
    await edit.clickSave();
    const response = await responsePromise;
    mutationJournal.markPhase(intentId, 'response-observed');
    mutationJournal.recordReconciliation(intentId, 'present');
    mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });

    const reopened = await new ItemEditFlow().openEditByItemName(page, identity, type);
    await reopened.ensureOtherSettingsExpanded();
    const finalCorners = await reopened.readSelectedCornerMarks(cornerNames);
    const finalDefault = groupName && optionNames
      ? await reopened.readOnlyDefaultOptionState(groupName, optionNames)
      : undefined;
    const defaultMatched = Boolean(beforeDefault && finalDefault && optionNames
      && beforeDefault.checkedSwitches === 1
      && beforeDefault.checkedNames[0] === optionNames[1]
      && finalDefault.checkedSwitches === 1
      && finalDefault.checkedNames[0] === optionNames[1]);
    const cornerMatched = beforeCorners.length === 1
      && beforeCorners[0] === cornerNames[0]
      && finalCorners.length === 1
      && finalCorners[0] === cornerNames[1];
    mutationJournal.markPhase(intentId, 'verification-complete');
    return {
      defaultBoundary: beforeDefault && finalDefault ? {
        disposition: defaultMatched ? 'accepted' : 'canonical-conflict',
        evidence: { itemId: record.id, before: beforeDefault, after: finalDefault, defaultMatched },
      } : undefined,
      cornerBoundary: {
        disposition: cornerMatched ? 'accepted' : 'canonical-conflict',
        evidence: {
          itemId: record.id,
          before: beforeCorners,
          after: finalCorners,
          cornerMatched,
          response: responseEvidence(response),
        },
      },
    };
  }

  async function readApiResidue(): Promise<Record<string, Record<string, number>>> {
    const descriptionTags = Object.fromEntries(await Promise.all((resources?.descriptionTags.tags ?? []).map(async (tag) => (
      [tag.name, await lowDependencyFactory.find('description-tag', tag.name) ? 1 : 0] as const
    ))));
    const cornerMarks = Object.fromEntries(await Promise.all((resources?.cornerMarks.marks ?? []).map(async (mark) => (
      [mark.name, containsNamed(await productCenterApi.cornerMarkPage(mark.name), mark.name) ? 1 : 0] as const
    ))));
    return {
      items: Object.fromEntries(await Promise.all(itemIdentities.map(async (identity) => (
        [identity, await itemFactory.itemRecordCount(identity)] as const
      )))),
      descriptionTags,
      cornerMarks,
      ruleGroups: resources ? {
        [resources.ruleGroup.originalIdentity]: await lowDependencyFactory.find('taste', resources.ruleGroup.originalIdentity) ? 1 : 0,
      } : {},
    };
  }

  async function readUiResidue(): Promise<Record<string, Record<string, number>>> {
    const items: Record<string, number> = {};
    const list = createItemListPage(page);
    await list.open();
    for (const identity of itemIdentities) {
      await list.fillSearchForResidueCheck(identity);
      await list.expectEmptySearchResults();
      items[identity] = 0;
    }
    const descriptionTags: Record<string, number> = {};
    const cornerMarks: Record<string, number> = {};
    const ruleGroups: Record<string, number> = {};
    if (resources) {
      const form = new ItemCreateStandardPage(page);
      await form.open();
      await form.ensureOtherSettingsExpanded();
      await form.clickDescriptionLabelsAdd();
      const descriptionDialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Description Labels', level: 2 }) });
      for (const tag of resources.descriptionTags.tags) {
        expect(await descriptionDialog.getByText(tag.name, { exact: true }).count()).toBe(0);
        descriptionTags[tag.name] = 0;
      }
      await descriptionDialog.getByRole('button', { name: 'close', exact: true }).click();
      await form.clickBadgesAdd();
      const badgesDialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Badges', level: 2 }) });
      for (const mark of resources.cornerMarks.marks) {
        expect(await badgesDialog.getByText(mark.name, { exact: true }).count()).toBe(0);
        cornerMarks[mark.name] = 0;
      }
      await badgesDialog.getByRole('button', { name: 'close', exact: true }).click();
      await form.expectRuleGroupAbsent('flavor', resources.ruleGroup.originalIdentity);
      ruleGroups[resources.ruleGroup.originalIdentity] = 0;
    }
    return { items, descriptionTags, cornerMarks, ruleGroups };
  }

  function recordIntent(
    action: string,
    identity: string,
    safetyLevel: 'L2-controlled-negative' | 'L3-crud',
    method: string,
    operationPath: string,
  ): string {
    const fingerprint = createHash('sha256').update(`${runId}:${action}:${identity}:${method}:${operationPath}`).digest('hex');
    const intentId = `intent:w5-${action}:${fingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: `audit-unit:w5-${action}`,
      safetyLevel,
      entity: 'item',
      identity,
      identityVariants: [identity],
      operation: { method, path: operationPath },
      requestFingerprint: fingerprint,
    });
    intents.push(intentId);
    mutationJournal.markPhase(intentId, 'trigger-started');
    return intentId;
  }
});

function itemContext(identity: string, productType: 'standard' | 'combo'): ProductCenterItemCreateContext {
  return {
    entityKey: 'item',
    productType,
    originalIdentity: identity,
    price: '10.00',
    minimumOrderQuantity: '1',
  };
}

function accepted(evidence: unknown): { disposition: 'accepted'; evidence: unknown } {
  return { disposition: 'accepted', evidence };
}

function responseEvidence(response: Response): { method: string; path: string; status: number } {
  return { method: response.request().method(), path: new URL(response.url()).pathname, status: response.status() };
}

function containsNamed(value: unknown, identity: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsNamed(item, identity));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.name === identity || Object.values(record).some((child) => containsNamed(child, identity));
}

function allZero(value: unknown): boolean {
  if (typeof value === 'number') return value === 0;
  if (!value || typeof value !== 'object') return true;
  return Object.values(value as Record<string, unknown>).every(allZero);
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
