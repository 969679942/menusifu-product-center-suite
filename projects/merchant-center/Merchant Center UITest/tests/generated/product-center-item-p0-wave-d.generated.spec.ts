import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from '@playwright/test';
import { MutationIntentJournal } from '../../api/product-center/mutation-intent-journal';
import { test, expect } from '../../fixtures/product-center.fixture';
import { ItemEditFlow } from '../../flows/item-edit.flow';
import { ProductCenterItemCategoryLeafProbeFlow } from '../../flows/product-center/product-center-item-category-leaf-probe.flow';
import { BrandPicturePage } from '../../pages/brand-picture.page';
import { ItemCreateStandardPage } from '../../pages/product-management/item/item-create-standard.page';
import { createItemListPage } from '../../pages/product-management/item/item-list.page';
import {
  ProductCenterItemCreateDataFactory,
  type ProductCenterItemCreateContext,
  type ProductCenterItemCreateRecord,
} from '../../test-data/product-center/product-center-item-create-data.factory';
import {
  ProductCenterCategoryNegativeDataFactory,
  type ProductCategoryTreeSeedRecord,
} from '../../test-data/product-center/sop/product-center-category-negative-data.factory';
import { waitUntil } from '../../utils/wait';

const caseIds = [
  'TC-ITEM-STD-031',
  'TC-ITEM-STD-092',
  'TC-ITEM-STD-096',
  'TC-ITEM-STD-011',
  'TC-ITEM-STD-012',
  'TC-ITEM-STD-013',
  'TC-ITEM-STD-014',
  'TC-ITEM-STD-007',
] as const;

test('Wave D 编辑与分类规则 8 条 P0 用例整波技术验收', async ({
  page,
  productCenterApi,
  cleanupRegistry,
  executionLedger,
}, testInfo) => {
  test.setTimeout(900_000);
  test.skip(process.env.PC_P0_WAVE_D_LIVE !== '1', '未启用 Wave D 认证实时验收');
  const runId = process.env.PC_P0_WAVE_D_RUN_ID ?? `AUTO_AUDIT_P0_WAVE_D_${Date.now()}`;
  const timestamp = Date.now();
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const categoryFactory = new ProductCenterCategoryNegativeDataFactory(productCenterApi);
  const mutationJournal = new MutationIntentJournal({ rootDir: path.resolve('output/mutation-intents'), runId });
  const names = {
    editOriginal: `AUTO_AUDIT_WAVE_D_EDIT_ORIGINAL_${timestamp}`,
    editUpdated: `AUTO_AUDIT_WAVE_D_EDIT_UPDATED_${timestamp}`,
    duplicate: `AUTO_AUDIT_WAVE_D_DUPLICATE_${timestamp}`,
  };
  const imageIdentity = `AUTO_AUDIT_WAVE_D_MAIN_IMAGE_${timestamp}.png`;
  const itemIdentities = Object.values(names);
  const caseEvidence: Record<string, unknown> = {};
  const runtimeDiagnostics: Record<string, unknown> = {};
  const intents: string[] = [];
  let categories: ProductCategoryTreeSeedRecord | undefined;
  let editRecord: ProductCenterItemCreateRecord | undefined;
  let duplicateRecord: ProductCenterItemCreateRecord | undefined;
  let executionDiagnostic: string | undefined;

  try {
    categories = await categoryFactory.seedTwoLevelCategoryTree(cleanupRegistry, timestamp);
    editRecord = await seedItem(
      itemContext(names.editOriginal, '9.99', [names.editUpdated]),
      categories.childC.id,
      { price: 9.99 },
    );
    duplicateRecord = await seedItem(
      itemContext(names.duplicate, '10.00'),
      categories.childA.id,
      { price: 10, weightItem: true },
    );

    const editPage = await new ItemEditFlow().openEditByItemName(page, names.editOriginal, 'standard');
    const loadEvidence = {
      route: new URL(page.url()).pathname,
      structure: await editPage.readCoreStructureEvidence(),
      itemName: await editPage.readItemName(),
      prices: await editPage.readVisiblePriceValues(),
      singleSpecSelected: await editPage.isSingleSpecSelected(),
    };
    expect(loadEvidence.itemName).toBe(names.editOriginal);
    expect(loadEvidence.prices).toContain('9.99');
    expect(loadEvidence.singleSpecSelected).toBe(true);
    expect(Object.values(loadEvidence.structure).every((count) => count === 1)).toBe(true);
    caseEvidence['TC-ITEM-STD-092'] = loadEvidence;

    expect(await itemFactory.brandImageRecordCount(imageIdentity)).toBe(0);
    const imagePath = testInfo.outputPath(imageIdentity);
    await page.screenshot({ path: imagePath, clip: { x: 0, y: 0, width: 256, height: 256 } });
    const uploadIntent = recordIntent(
      'main-image-upload',
      imageIdentity,
      'L3-crud',
      'POST',
      '/ops-brand/brand-image-files',
      [],
      'brand-image',
    );
    const brandImageCreateIntent = recordIntent(
      'brand-image-create',
      imageIdentity,
      'L3-crud',
      'POST',
      '/ops-brand/brand-images',
      [],
      'brand-image',
    );
    const uploadMutations: Array<{ method: string; path: string; status?: number }> = [];
    const uploadRequestListener = (request: Request) => {
      if (request.method() !== 'GET') uploadMutations.push({ method: request.method(), path: new URL(request.url()).pathname });
    };
    const uploadResponseListener = (response: Response) => {
      if (response.request().method() === 'GET') return;
      const pathName = new URL(response.url()).pathname;
      const target = [...uploadMutations].reverse().find((entry) => (
        entry.method === response.request().method() && entry.path === pathName && entry.status === undefined
      ));
      if (target) target.status = response.status();
    };
    page.on('request', uploadRequestListener);
    page.on('response', uploadResponseListener);
    const fileUploadResponsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/item/v1/ops-brand/brand-image-files')
    ), { timeout: 60_000 });
    const brandImageCreatedPromise = page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/item/v1/ops-brand/brand-images')
    ), { timeout: 60_000 }).then(async (response) => {
      const body = await response.json().catch(() => null);
      const record = await itemFactory.registerBrandImageCreated(
        imageIdentity,
        body,
        cleanupRegistry,
        brandImageCreateIntent,
      );
      mutationJournal.markPhase(brandImageCreateIntent, 'response-observed');
      mutationJournal.recordReconciliation(brandImageCreateIntent, 'present');
      mutationJournal.attachServerIdentity(brandImageCreateIntent, {
        serverId: record.id,
        ledgerEntryId: record.checkpointEntryId,
      });
      return { response, body, record };
    });
    let uploadedCardCount: number;
    let fileUploadResponse: Response;
    let fileUploadBody: unknown;
    let brandImageCreated: Awaited<typeof brandImageCreatedPromise>;
    try {
      [uploadedCardCount, fileUploadResponse, brandImageCreated] = await Promise.all([
        editPage.uploadMainImage(imagePath),
        fileUploadResponsePromise,
        brandImageCreatedPromise,
      ]);
      fileUploadBody = await fileUploadResponse.json().catch(() => null);
      mutationJournal.markPhase(uploadIntent, 'response-observed');
      const uploadedImagePath = readNestedString(fileUploadBody, ['data', 'imagePath']);
      expect(uploadedImagePath).toBeTruthy();
      mutationJournal.recordReconciliation(uploadIntent, 'present');
      mutationJournal.attachServerIdentity(uploadIntent, { serverId: uploadedImagePath! });
    } finally {
      page.off('request', uploadRequestListener);
      page.off('response', uploadResponseListener);
    }
    expect(uploadedCardCount).toBeGreaterThan(0);

    await editPage.fillItemName(names.editUpdated);
    const selectedCategoryPath = await editPage.readSelectedCategoryPath();
    expect(selectedCategoryPath).toContain(categories.parentB.name);
    expect(selectedCategoryPath).toContain(categories.childC.name);
    const updatePath = `/ops-brand/brand-items/standard/${editRecord.id}`;
    const updateIntent = recordIntent('edit-standard', names.editUpdated, 'L3-crud', 'PUT', updatePath, [names.editOriginal]);
    const updateResponsePromise = page.waitForResponse((response) => (
      response.request().method() === 'PUT'
      && new URL(response.url()).pathname.endsWith(updatePath)
    ), { timeout: 60_000 });
    await editPage.clickSave();
    const updateResponse = await updateResponsePromise;
    mutationJournal.markPhase(updateIntent, 'response-observed');
    const updateBody = await updateResponse.json().catch(() => null);
    const updateMessages = await createItemListPage(page).readVisibleMessages();
    const reconciledEdit = await waitUntil(
      async () => ({
        originalCount: await itemFactory.itemRecordCount(names.editOriginal),
        updatedCount: await itemFactory.itemRecordCount(names.editUpdated),
      }),
      (state) => state.originalCount === 0 && state.updatedCount === 1,
      { timeout: 30_000, interval: 250, message: '编辑保存后商品身份未完成唯一对账。' },
    );
    mutationJournal.recordReconciliation(updateIntent, 'present');
    mutationJournal.attachServerIdentity(updateIntent, { serverId: editRecord.id, ledgerEntryId: editRecord.checkpointEntryId });

    const updatedDetail = await productCenterApi.productDetail(editRecord.id);
    expect(containsExactString(updatedDetail, names.editUpdated)).toBe(true);
    expect(containsNumber(updatedDetail, categories.childC.id)).toBe(true);
    expect(countImageReferences(updatedDetail)).toBeGreaterThan(0);
    mutationJournal.markPhase(uploadIntent, 'verification-complete');
    mutationJournal.markPhase(brandImageCreateIntent, 'verification-complete');
    mutationJournal.markPhase(updateIntent, 'verification-complete');

    const listPage = createItemListPage(page);
    await listPage.open();
    await listPage.fillSearch(names.editUpdated);
    await listPage.expectUniqueItemVisible(names.editUpdated);
    const listCategory = await listPage.readItemCategoryText(names.editUpdated);
    const listImageSources = await listPage.readItemMainImageSources(names.editUpdated);
    expect(listCategory).toContain(categories.childC.name);
    expect(listImageSources.length).toBeGreaterThan(0);

    const reopenedEdit = await new ItemEditFlow().openEditByItemName(page, names.editUpdated, 'standard');
    const reopenedEvidence = {
      itemName: await reopenedEdit.readItemName(),
      prices: await reopenedEdit.readVisiblePriceValues(),
      categoryPath: await reopenedEdit.readSelectedCategoryPath(),
      imageCardCount: await reopenedEdit.readMainImageCardCount(),
    };
    expect(reopenedEvidence.itemName).toBe(names.editUpdated);
    expect(reopenedEvidence.prices).toContain('9.99');
    expect(reopenedEvidence.categoryPath).toContain(categories.childC.name);
    expect(reopenedEvidence.imageCardCount).toBeGreaterThan(0);
    caseEvidence['TC-ITEM-STD-031'] = {
      itemId: editRecord.id,
      originalName: names.editOriginal,
      updatedName: names.editUpdated,
      selectedCategoryPath,
      listCategory,
      response: responseEvidence(updateResponse),
      responseBody: updateBody,
      messages: updateMessages,
      reconciliation: reconciledEdit,
    };
    caseEvidence['TC-ITEM-STD-096'] = {
      itemId: editRecord.id,
      brandImageId: brandImageCreated.record.id,
      imageIdentity,
      localFile: { extension: '.png', bytes: fs.statSync(imagePath).size },
      uploadedCardCount,
      uploadMutations,
      fileUploadResponse: responseEvidence(fileUploadResponse),
      brandImageCreateResponse: responseEvidence(brandImageCreated.response),
      brandImageCreateBody: brandImageCreated.body,
      listPreviewCount: listImageSources.length,
      reopenedCardCount: reopenedEvidence.imageCardCount,
      namePreservedAfterUpload: reopenedEvidence.itemName === names.editUpdated,
      pricePreserved: reopenedEvidence.prices.includes('9.99'),
    };

    caseEvidence['TC-ITEM-STD-011'] = await verifyDuplicate(categories.parentA.name, categories.childB.name, 'same-parent-different-leaf');
    caseEvidence['TC-ITEM-STD-012'] = await verifyDuplicate(categories.parentA.name, categories.childB.name, 'different-weight-type');
    caseEvidence['TC-ITEM-STD-013'] = await verifyDuplicate(categories.parentA.name, categories.childA.name, 'same-leaf');
    caseEvidence['TC-ITEM-STD-014'] = await verifyDuplicate(categories.parentB.name, categories.childC.name, 'different-parent');
    caseEvidence['TC-ITEM-STD-007'] = await verifyCategoryLeafSelection();

    expect(duplicateRecord.id).toBeGreaterThan(0);
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
    const categoryIdentities = categories?.identities ?? [];
    const apiCategoryResidue = Object.fromEntries(await Promise.all(categoryIdentities.map(async (identity) => (
      [identity, await categoryFactory.findCategory(identity) ? 1 : 0] as const
    ))));
    const apiBrandImageResidue = {
      [imageIdentity]: await itemFactory.brandImageRecordCount(imageIdentity),
    };
    const uiItemResidue: Record<string, 0> = {};
    const uiCategoryResidue: Record<string, 0> = {};
    const uiBrandImageResidue: Record<string, 0> = {};
    try {
      for (const identity of itemIdentities) {
        const residueList = createItemListPage(page);
        await residueList.open();
        await residueList.fillSearchForResidueCheck(identity);
        await residueList.expectEmptySearchResults();
        uiItemResidue[identity] = 0;
      }
      if (categoryIdentities.length > 0) {
        const categoryForm = new ItemCreateStandardPage(page);
        await categoryForm.open();
        await categoryForm.expectCategoriesAbsent(categoryIdentities);
        for (const identity of categoryIdentities) uiCategoryResidue[identity] = 0;
      }
      const picturePage = new BrandPicturePage(page);
      await picturePage.open();
      await picturePage.expectImageAbsent(imageIdentity);
      uiBrandImageResidue[imageIdentity] = 0;
    } catch (error) {
      cleanupDiagnostic = [cleanupDiagnostic, safeDiagnostic(error)].filter(Boolean).join('\n');
    }
    const ledger = executionLedger.snapshot();
    const incompleteLedgerEntries = ledger.entries.filter((entry) => entry.phase !== 'residue-verified').length;
    const residueFree = [
      ...Object.values(apiItemResidue),
      ...Object.values(apiCategoryResidue),
      ...Object.values(apiBrandImageResidue),
      ...Object.values(uiItemResidue),
      ...Object.values(uiCategoryResidue),
      ...Object.values(uiBrandImageResidue),
    ].every((count) => count === 0);
    if (residueFree && incompleteLedgerEntries === 0) {
      for (const intentId of intents) mutationJournal.markPhase(intentId, 'cleanup-complete');
    }
    const report = {
      schemaVersion: '1.0.0',
      runId,
      waveId: 'wave-d-edit-and-rules',
      status: Object.keys(caseEvidence).length === caseIds.length
        && residueFree
        && Object.keys(uiItemResidue).length === itemIdentities.length
        && Object.keys(uiCategoryResidue).length === categoryIdentities.length
        && Object.keys(uiBrandImageResidue).length === 1
        && incompleteLedgerEntries === 0
        && !executionDiagnostic
        && !cleanupDiagnostic
        ? 'accepted'
        : 'incomplete',
      caseIds,
      acceptedCaseIds: Object.keys(caseEvidence).sort(),
      caseEvidence,
      runtimeDiagnostics,
      executionDiagnostic,
      cleanupEvidence: {
        apiItemResidue,
        apiCategoryResidue,
        apiBrandImageResidue,
        uiItemResidue,
        uiCategoryResidue,
        uiBrandImageResidue,
        ledgerEntries: ledger.entries.length,
        residueVerified: ledger.entries.filter((entry) => entry.phase === 'residue-verified').length,
        incompleteLedgerEntries,
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
    };
    writeJsonAtomic(path.resolve(`output/audit/product-center-item-p0-wave-d-${runId}.json`), report);
    await testInfo.attach('product-center-item-p0-wave-d-runtime-evidence', {
      body: Buffer.from(JSON.stringify(report), 'utf8'),
      contentType: 'application/json',
    });
    if (cleanupDiagnostic && !executionDiagnostic) throw new Error(cleanupDiagnostic);
  }

  async function seedItem(
    context: ProductCenterItemCreateContext,
    categoryId: number,
    options: { price: number; weightItem?: boolean },
  ): Promise<ProductCenterItemCreateRecord> {
    expect(await itemFactory.itemRecordCount(context.originalIdentity)).toBe(0);
    const response = await productCenterApi.createBomProduct(context.originalIdentity, categoryId, options);
    return itemFactory.registerCreated(context, response, cleanupRegistry);
  }

  async function verifyDuplicate(parentName: string, leafName: string, scenario: string): Promise<unknown> {
    const beforeCount = await itemFactory.itemRecordCount(names.duplicate);
    expect(beforeCount).toBe(1);
    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.fillItemName(names.duplicate);
    await form.selectSingleSpec();
    await form.fillStandardPrice('10.00');
    const selectedCategoryPath = await form.selectCategoryPath(parentName, leafName);
    const intentId = recordIntent(`duplicate-${scenario}`, names.duplicate, 'L2-controlled-negative', 'POST', '/ops-brand/brand-items/standard');
    const responses: Response[] = [];
    const listener = (response: Response) => {
      if (response.request().method() === 'POST'
        && new URL(response.url()).pathname.endsWith('/ops-brand/brand-items/standard')) responses.push(response);
    };
    page.on('response', listener);
    try {
      await form.clickSave();
      const state = await waitUntil(
        async () => ({
          elapsed: Date.now(),
          messages: await createItemListPage(page).readVisibleMessages(),
          responseCount: responses.length,
        }),
        (value) => value.responseCount > 0 || value.messages.length > 0,
        { timeout: 10_000, interval: 100, message: `同名商品 ${scenario} 未出现响应或可见提示。` },
      );
      if (responses.length > 0) mutationJournal.markPhase(intentId, 'response-observed');
      const bodies = await Promise.all(responses.map((response) => response.json().catch(() => null)));
      const afterCount = await itemFactory.itemRecordCount(names.duplicate);
      await form.expectStillOnCreatePage();
      expect(afterCount).toBe(beforeCount);
      const duplicateSignal = JSON.stringify({ messages: state.messages, bodies });
      expect(duplicateSignal).toMatch(/duplicate|exist|same name|同名|已存在|BITEM/i);
      mutationJournal.recordReconciliation(intentId, 'absent');
      mutationJournal.markPhase(intentId, 'verification-complete');
      return {
        scenario,
        parentName,
        leafName,
        selectedCategoryPath,
        beforeCount,
        afterCount,
        responses: responses.map(responseEvidence),
        responseBodies: bodies,
        messages: state.messages,
        route: new URL(page.url()).pathname,
      };
    } finally {
      page.off('response', listener);
    }
  }

  async function verifyCategoryLeafSelection(): Promise<unknown> {
    const listPage = createItemListPage(page);
    await listPage.open();
    const flow = new ProductCenterItemCategoryLeafProbeFlow(page);
    const createPageEvidence = await flow.openStandardCreateFromCurrentList();
    const menuEvidence = await flow.openCategoryCascader();
    const parentEvidence = await flow.selectParentWithChildren(categories!.parentA.name, categories!.childA.name);
    expect(parentEvidence.visibleMenuCount).toBe(2);
    expect(parentEvidence.childVisible).toBe(true);
    expect(parentEvidence.selectedValueAfter).toBe(parentEvidence.selectedValueBefore);
    const leafEvidence = await flow.selectLeaf(categories!.parentA.name, categories!.childA.name);
    expect(leafEvidence.selectedPath).toContain(categories!.parentA.name);
    expect(leafEvidence.selectedPath).toContain(categories!.childA.name);
    expect(leafEvidence.mutationAttempted).toBe(false);
    return {
      createPageEvidence,
      menuEvidence,
      parentEvidence,
      leafEvidence,
      route: new URL(page.url()).pathname,
    };
  }

  function recordIntent(
    action: string,
    identity: string,
    safetyLevel: 'L2-controlled-negative' | 'L3-crud',
    method: string,
    operationPath: string,
    identityVariants: string[] = [],
    entity = 'item',
  ): string {
    const requestFingerprint = createHash('sha256').update(`${runId}:${action}:${identity}:${method}:${operationPath}`).digest('hex');
    const intentId = `intent:wave-d-${action}:${requestFingerprint.slice(0, 24)}`;
    mutationJournal.recordIntent({
      intentId,
      unitId: `audit-unit:wave-d-${action}`,
      safetyLevel,
      entity,
      identity,
      identityVariants: [identity, ...identityVariants],
      operation: { method, path: operationPath },
      requestFingerprint,
    });
    intents.push(intentId);
    mutationJournal.markPhase(intentId, 'trigger-started');
    return intentId;
  }
});

function itemContext(
  identity: string,
  price: string,
  cleanupIdentityVariants: string[] = [],
): ProductCenterItemCreateContext {
  return {
    entityKey: 'item',
    productType: 'standard',
    originalIdentity: identity,
    price,
    minimumOrderQuantity: '1',
    cleanupIdentityVariants,
  };
}

function responseEvidence(response: Response): { method: string; path: string; status: number } {
  return {
    method: response.request().method(),
    path: new URL(response.url()).pathname,
    status: response.status(),
  };
}

function readNestedString(value: unknown, pathSegments: string[]): string | undefined {
  let current = value;
  for (const segment of pathSegments) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' && current.length > 0 ? current : undefined;
}

function containsExactString(value: unknown, expected: string): boolean {
  if (value === expected) return true;
  if (Array.isArray(value)) return value.some((item) => containsExactString(item, expected));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some((item) => containsExactString(item, expected));
}

function containsNumber(value: unknown, expected: number): boolean {
  if (value === expected) return true;
  if (Array.isArray(value)) return value.some((item) => containsNumber(item, expected));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some((item) => containsNumber(item, expected));
}

function countImageReferences(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((total, item) => total + countImageReferences(item), 0);
  if (!value || typeof value !== 'object') return 0;
  const record = value as Record<string, unknown>;
  const direct = ['imagePath', 'imageUrl', 'url', 'path'].some((key) => typeof record[key] === 'string' && String(record[key]).length > 0) ? 1 : 0;
  return direct + Object.values(record).reduce<number>((total, item) => total + countImageReferences(item), 0);
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
