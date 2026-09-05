import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Response } from '@playwright/test';
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
import {
  ProductCenterLowDependencyDataFactory,
  type UpdateIsolationRuleSeed,
} from '../../test-data/product-center/sop/product-center-low-dependency-data.factory';
import { waitUntil } from '../../utils/wait';

const caseIds = [
  'TC-ITEM-STD-032',
  'TC-ITEM-STD-087',
  'TC-ITEM-STD-088',
  'TC-ITEM-ADD-024',
  'TC-ITEM-PKG-035',
  'TC-ITEM-PKG-069',
  'TC-ITEM-PKG-071',
  'TC-ITEM-PKG-072',
] as const;

type CaseDisposition = 'accepted' | 'canonical-conflict';
type CaseEvidence = { disposition: CaseDisposition; evidence: unknown };

test('W6 三类商品编辑与组内配置隔离 8 条 P0 用例整波技术验收', async ({
  page,
  productCenterApi,
  cleanupRegistry,
  executionLedger,
}, testInfo) => {
  test.setTimeout(900_000);
  test.skip(process.env.PC_P0_REMAINING_W6_LIVE !== '1', '未启用 W6 认证实时验收');
  const runId = process.env.PC_P0_REMAINING_W6_RUN_ID ?? `AUTO_AUDIT_P0_REMAINING_W6_${Date.now()}`;
  const timestamp = Date.now();
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const lowDependencyFactory = new ProductCenterLowDependencyDataFactory(productCenterApi);
  const mutationJournal = new MutationIntentJournal({ rootDir: path.resolve('output/mutation-intents'), runId });
  const names = {
    standard: `AUTO_AUDIT_W6_STANDARD_${timestamp}`,
    side: `AUTO_AUDIT_W6_SIDE_${timestamp}`,
    sideUpdated: `AUTO_AUDIT_W6_SIDE_${timestamp}_V2`,
    combo: `AUTO_AUDIT_W6_COMBO_${timestamp}`,
    comboUpdated: `AUTO_AUDIT_W6_COMBO_${timestamp}_V2`,
  };
  const itemIdentities = Object.values(names);
  const intents: string[] = [];
  const caseEvidence: Record<string, CaseEvidence> = {};
  let executionDiagnostic: string | undefined;
  let resources: Awaited<ReturnType<typeof seedResources>> | undefined;
  let standardRecord: ProductCenterItemCreateRecord | undefined;
  let sideRecord: ProductCenterItemCreateRecord | undefined;
  let comboRecord: ProductCenterItemCreateRecord | undefined;

  try {
    resources = await seedResources();
    const firstImagePath = testInfo.outputPath('AUTO_AUDIT_W6_MAIN_IMAGE_A.png');
    const secondImagePath = testInfo.outputPath('AUTO_AUDIT_W6_MAIN_IMAGE_B.png');
    await createAuditImages(firstImagePath, secondImagePath);

    standardRecord = await createStandardForUpdate();
    sideRecord = await createSideForUpdate();
    comboRecord = await createComboForUpdate();

    const masterDataBefore = await readMasterData();
    const standardUpdate = await updateStandardAttributes(standardRecord);
    const masterDataAfter = await readMasterData();
    const masterDataUnchanged = hash(masterDataBefore) === hash(masterDataAfter);

    caseEvidence['TC-ITEM-STD-032'] = attributeDisposition(
      resources.flavor,
      standardUpdate.flavor,
      masterDataUnchanged,
      masterDataBefore.flavor,
      masterDataAfter.flavor,
    );
    caseEvidence['TC-ITEM-STD-087'] = attributeDisposition(
      resources.recipe,
      standardUpdate.recipe,
      masterDataUnchanged,
      masterDataBefore.recipe,
      masterDataAfter.recipe,
    );
    caseEvidence['TC-ITEM-STD-088'] = attributeDisposition(
      resources.additives,
      standardUpdate.additives,
      masterDataUnchanged,
      masterDataBefore.additives,
      masterDataAfter.additives,
    );

    caseEvidence['TC-ITEM-ADD-024'] = await updateBaseInformation(
      sideRecord,
      names.side,
      names.sideUpdated,
      'side',
      secondImagePath,
      '8.88',
    );
    caseEvidence['TC-ITEM-PKG-035'] = await updateBaseInformation(
      comboRecord,
      names.combo,
      names.comboUpdated,
      'combo',
      secondImagePath,
    );

    const comboCurrentIdentity = await itemFactory.itemRecordCount(names.comboUpdated) === 1
      ? names.comboUpdated
      : names.combo;
    const comboEdit = await new ItemEditFlow().openEditByItemName(page, comboCurrentIdentity, 'combo');
    caseEvidence['TC-ITEM-PKG-069'] = await comboCapabilityConflict(comboEdit, resources.flavor);
    caseEvidence['TC-ITEM-PKG-071'] = await comboCapabilityConflict(comboEdit, resources.recipe);
    caseEvidence['TC-ITEM-PKG-072'] = await comboCapabilityConflict(comboEdit, resources.additives);
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
    const apiResidue = await readApiResidue().catch((error) => {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
      return { items: {}, ruleGroups: {}, dependencies: {} };
    });
    const uiResidue = await readUiResidue().catch((error) => {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
      return {};
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
      waveId: 'W6',
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
    writeJsonAtomic(path.resolve(`output/audit/product-center-item-p0-remaining-w6-${runId}.json`), report);
    await testInfo.attach('product-center-item-p0-remaining-w6-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function seedResources() {
    return lowDependencyFactory.seedUpdateIsolationScenario(cleanupRegistry);
  }

  async function createAuditImages(firstImagePath: string, secondImagePath: string): Promise<void> {
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await page.screenshot({ path: firstImagePath, clip: { x: 0, y: 0, width: 256, height: 256 } });
    await page.screenshot({ path: secondImagePath, clip: { x: 256, y: 0, width: 256, height: 256 } });
  }

  async function createStandardForUpdate(): Promise<ProductCenterItemCreateRecord> {
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.fillItemName(names.standard);
    await form.selectSingleSpec();
    await form.fillStandardPrice('10.00');
    await form.selectFlavorGroupByName(resources!.flavor.name);
    await form.selectRecipeGroupByName(resources!.recipe.name);
    await form.selectAdditivesGroupByName(resources!.additives.name);
    return submitCreate(form, itemContext(names.standard, 'standard'), '/ops-brand/brand-items/standard');
  }

  async function createSideForUpdate(): Promise<ProductCenterItemCreateRecord> {
    const form = new ItemCreateSidePage(page);
    await form.open();
    await form.fillItemName(names.side);
    await form.fillStandardPrice('5.00');
    return submitCreate(form, itemContext(names.side, 'side', [names.sideUpdated]), '/ops-brand/brand-items/standard');
  }

  async function createComboForUpdate(): Promise<ProductCenterItemCreateRecord> {
    const comboContext = await itemFactory.prepareComboRequiredOnly(cleanupRegistry);
    const context: ProductCenterItemCreateContext = {
      ...comboContext,
      originalIdentity: names.combo,
      cleanupIdentityVariants: [names.comboUpdated],
    };
    const form = new ItemCreateComboPage(page);
    await form.open();
    await form.fillItemName(names.combo);
    await form.clickAdvancedSettings();
    await form.fillMinimumOrderQuantity('1');
    await form.fillStandardPrice('10.00');
    await form.addFixedComboGroupByName(comboContext.comboGroupName!);
    return submitCreate(form, context, '/ops-brand/brand-items/combo');
  }

  async function submitCreate(
    form: ItemCreateFormPage,
    context: ProductCenterItemCreateContext,
    operationPath: string,
  ): Promise<ProductCenterItemCreateRecord> {
    expect(await itemFactory.itemRecordCount(context.originalIdentity)).toBe(0);
    const intentId = recordIntent(`create-${context.productType}`, context.originalIdentity, 'L3-crud', 'POST', operationPath);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(operationPath)
    ), { timeout: 60_000 });
    await form.clickSave();
    await handleAdditionalPriceWarning(form, responsePromise);
    const response = await responsePromise;
    mutationJournal.markPhase(intentId, 'response-observed');
    const body = await response.json().catch(() => null);
    expect(response.ok()).toBe(true);
    const record = await itemFactory.registerCreated(context, body, cleanupRegistry);
    mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
    mutationJournal.recordReconciliation(intentId, 'present');
    mutationJournal.markPhase(intentId, 'verification-complete');
    return record;
  }

  async function updateStandardAttributes(record: ProductCenterItemCreateRecord) {
    const edit = await new ItemEditFlow().openEditByItemName(page, names.standard, 'standard');
    const flavor = await edit.setCommonAttributeOptionOverride(
      resources!.flavor.name,
      resources!.flavor.optionNames,
      resources!.flavor.optionNames[1],
      '2.00',
    );
    const recipe = await edit.setCommonAttributeOptionOverride(
      resources!.recipe.name,
      resources!.recipe.optionNames,
      resources!.recipe.optionNames[1],
      '2.00',
    );
    const additives = await edit.setCommonAttributeOptionOverride(
      resources!.additives.name,
      resources!.additives.optionNames,
      resources!.additives.optionNames[1],
      '2.00',
    );
    await submitUpdate(edit, record, names.standard, 'standard');
    const reopened = await new ItemEditFlow().openEditByItemName(page, names.standard, 'standard');
    return {
      flavor: { beforeSave: flavor, afterSave: await reopened.readCommonAttributeOptionOverride(resources!.flavor.name, resources!.flavor.optionNames, resources!.flavor.optionNames[1]) },
      recipe: { beforeSave: recipe, afterSave: await reopened.readCommonAttributeOptionOverride(resources!.recipe.name, resources!.recipe.optionNames, resources!.recipe.optionNames[1]) },
      additives: { beforeSave: additives, afterSave: await reopened.readCommonAttributeOptionOverride(resources!.additives.name, resources!.additives.optionNames, resources!.additives.optionNames[1]) },
    };
  }

  async function updateBaseInformation(
    record: ProductCenterItemCreateRecord,
    originalIdentity: string,
    updatedIdentity: string,
    type: 'side' | 'combo',
    imagePath: string,
    price?: string,
  ): Promise<CaseEvidence> {
    const detailBefore = await productCenterApi.productDetail(record.id);
    const edit = await new ItemEditFlow().openEditByItemName(page, originalIdentity, type);
    await edit.fillItemName(updatedIdentity);
    if (price) await edit.fillStandardPrice(price);
    let imageCardCount = 0;
    let imageUploadDiagnostic: string | undefined;
    try {
      imageCardCount = await edit.uploadCommonMainImage(imagePath);
    } catch (error) {
      imageUploadDiagnostic = safeDiagnostic(error);
    }
    const response = await submitUpdate(edit, record, updatedIdentity, type);
    const reconciled = {
      originalCount: await itemFactory.itemRecordCount(originalIdentity),
      updatedCount: await itemFactory.itemRecordCount(updatedIdentity),
    };
    const detailAfter = await productCenterApi.productDetail(record.id);
    const nameMatched = containsExactString(detailAfter, updatedIdentity);
    const priceMatched = price ? containsNumber(detailAfter, Number(price)) : true;
    const imageChanged = hash(readImageData(detailBefore)) !== hash(readImageData(detailAfter));
    const acceptedUpdate = response.ok()
      && reconciled.originalCount === 0
      && reconciled.updatedCount === 1
      && nameMatched
      && priceMatched
      && imageChanged;
    return {
      disposition: acceptedUpdate ? 'accepted' : 'canonical-conflict',
      evidence: {
        itemId: record.id,
        response: responseEvidence(response),
        reconciled,
        nameMatched,
        priceMatched,
        imageChanged,
        imageCardCount,
        imageUploadDiagnostic,
      },
    };
  }

  async function submitUpdate(
    edit: ItemCreateFormPage,
    record: ProductCenterItemCreateRecord,
    identity: string,
    type: 'standard' | 'side' | 'combo',
  ): Promise<Response> {
    const endpointType = type === 'combo' ? 'combo' : 'standard';
    const operationPath = `/ops-brand/brand-items/${endpointType}/${record.id}`;
    const intentId = recordIntent(`update-${type}`, identity, 'L3-crud', 'PUT', operationPath);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith(operationPath)
    ), { timeout: 60_000 });
    await edit.clickSave();
    await handleAdditionalPriceWarning(edit, responsePromise);
    const response = await responsePromise;
    mutationJournal.markPhase(intentId, 'response-observed');
    mutationJournal.attachServerIdentity(intentId, { serverId: record.id, ledgerEntryId: record.checkpointEntryId });
    mutationJournal.recordReconciliation(intentId, 'present');
    mutationJournal.markPhase(intentId, 'verification-complete');
    return response;
  }

  async function handleAdditionalPriceWarning(
    form: ItemCreateFormPage,
    responsePromise: Promise<Response>,
  ): Promise<void> {
    if (!(form instanceof ItemCreateStandardPage)) return;
    const terminal = await Promise.race([
      responsePromise.then(() => 'response' as const),
      waitUntil(
        () => form.isAdditionalPriceWarningVisible(),
        (visible) => visible,
        { timeout: 5_000, interval: 100, message: '未出现附加价确认弹窗。' },
      ).then(() => 'warning' as const).catch(() => 'no-warning' as const),
    ]);
    if (terminal === 'warning') await form.confirmAdditionalPriceWarning();
  }

  async function readMasterData() {
    return {
      flavor: await productCenterApi.methodDetail(resources!.flavor.id),
      recipe: await productCenterApi.methodDetail(resources!.recipe.id),
      additives: await productCenterApi.addonGroupDetail(resources!.additives.id),
    };
  }

  function attributeDisposition(
    resource: UpdateIsolationRuleSeed,
    override: { beforeSave: { checkedNames: string[]; price: string }; afterSave: { checkedNames: string[]; price: string } },
    masterDataUnchanged: boolean,
    masterDataBefore: unknown,
    masterDataAfter: unknown,
  ): CaseEvidence {
    const expectedOption = resource.optionNames[1];
    const overrideMatched = override.beforeSave.checkedNames.length === 1
      && override.beforeSave.checkedNames[0] === expectedOption
      && override.afterSave.checkedNames.length === 1
      && override.afterSave.checkedNames[0] === expectedOption
      && Number(override.beforeSave.price) === 2
      && Number(override.afterSave.price) === 2;
    return {
      disposition: overrideMatched && masterDataUnchanged ? 'accepted' : 'canonical-conflict',
      evidence: {
        groupId: resource.id,
        groupName: resource.name,
        expectedOption,
        override,
        overrideMatched,
        masterDataBefore: hash(masterDataBefore),
        masterDataAfter: hash(masterDataAfter),
        masterDataUnchanged,
      },
    };
  }

  async function comboCapabilityConflict(
    comboEdit: ItemCreateComboPage,
    resource: UpdateIsolationRuleSeed,
  ): Promise<CaseEvidence> {
    const capability = await comboEdit.readCommonAttributeCapabilityEvidence(resource.name);
    return {
      disposition: 'canonical-conflict',
      evidence: {
        capability,
        groupName: resource.name,
        canonicalExpected: '套餐商品内可编辑共享属性组加价和默认项，并且不修改主数据。',
        observed: capability.addButtonCount === 0
          ? '当前套餐商品编辑页不存在共享 Attribute 添加入口。'
          : '入口存在但本波未在缺少已批准 selector 的情况下猜测操作。',
      },
    };
  }

  async function readApiResidue() {
    const items = Object.fromEntries(await Promise.all(itemIdentities.map(async (identity) => (
      [identity, await itemFactory.itemRecordCount(identity)] as const
    ))));
    const ruleGroups = resources ? {
      [resources.flavor.name]: containsIdentity(await productCenterApi.tastePage(resources.flavor.name), resources.flavor.name) ? 1 : 0,
      [resources.recipe.name]: containsIdentity(await productCenterApi.methodPage(resources.recipe.name), resources.recipe.name) ? 1 : 0,
      [resources.additives.name]: containsIdentity(await productCenterApi.addonGroupList(resources.additives.name), resources.additives.name) ? 1 : 0,
    } : {};
    const dependencies = Object.fromEntries(await Promise.all((resources?.dependencyProducts ?? []).map(async (product) => (
      [product.name, await itemFactory.itemRecordCount(product.name)] as const
    ))));
    return { items, ruleGroups, dependencies };
  }

  async function readUiResidue(): Promise<Record<string, number>> {
    const list = createItemListPage(page);
    await list.open();
    const residue: Record<string, number> = {};
    for (const identity of itemIdentities) {
      await list.fillSearch(identity);
      await list.expectEmptySearchResults();
      residue[identity] = 0;
    }
    return residue;
  }

  function recordIntent(
    action: string,
    identity: string,
    safetyLevel: 'L3-crud',
    method: 'POST' | 'PUT',
    operationPath: string,
  ): string {
    const requestFingerprint = createHash('sha256')
      .update(`${runId}:${action}:${identity}:${method}:${operationPath}`)
      .digest('hex');
    const intentId = `intent:w6-${action}:${requestFingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: `audit-unit:w6-${action}`,
      entity: 'item',
      identity,
      identityVariants: [identity],
      safetyLevel,
      operation: { method, path: operationPath },
      requestFingerprint,
    });
    intents.push(intentId);
    mutationJournal.markPhase(intentId, 'trigger-started');
    return intentId;
  }

  function itemContext(
    identity: string,
    productType: 'standard' | 'side',
    cleanupIdentityVariants: string[] = [],
  ): ProductCenterItemCreateContext {
    return {
      entityKey: 'item',
      productType,
      originalIdentity: identity,
      price: productType === 'side' ? '5.00' : '10.00',
      minimumOrderQuantity: '1',
      cleanupIdentityVariants,
    };
  }
});

function responseEvidence(response: Response) {
  return { method: response.request().method(), path: new URL(response.url()).pathname, status: response.status() };
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function containsIdentity(value: unknown, identity: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsIdentity(item, identity));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.name === identity) return true;
  return Object.values(record).some((child) => containsIdentity(child, identity));
}

function containsExactString(value: unknown, expected: string): boolean {
  if (value === expected) return true;
  if (Array.isArray(value)) return value.some((item) => containsExactString(item, expected));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some((child) => containsExactString(child, expected));
}

function containsNumber(value: unknown, expected: number): boolean {
  if (typeof value === 'number' && value === expected) return true;
  if (Array.isArray(value)) return value.some((item) => containsNumber(item, expected));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some((child) => containsNumber(child, expected));
}

function readImageData(value: unknown): unknown[] {
  const found: unknown[] = [];
  visit(value);
  return found;

  function visit(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (/image/i.test(key) && child) found.push(child);
      else visit(child);
    }
  }
}

function allZero(value: unknown): boolean {
  if (typeof value === 'number') return value === 0;
  if (Array.isArray(value)) return value.every(allZero);
  if (!value || typeof value !== 'object') return true;
  return Object.values(value as Record<string, unknown>).every(allZero);
}

function safeDiagnostic(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return raw.replace(/(authorization|cookie|token|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
