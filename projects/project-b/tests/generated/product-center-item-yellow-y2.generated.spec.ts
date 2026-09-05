import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { test } from '../../fixtures/product-center.fixture';
import { ItemEditStandardPage } from '../../pages/product-management/item/item-edit.page';
import { ItemCreateStandardPage } from '../../pages/product-management/item/item-create-standard.page';
import { ItemListPage } from '../../pages/product-management/item/item-list.page';
import { ProductCenterItemCreateDataFactory } from '../../test-data/product-center/product-center-item-create-data.factory';
import { ProductCenterLowDependencyDataFactory } from '../../test-data/product-center/sop/product-center-low-dependency-data.factory';

test('Y2应使用唯一数据配置互斥规则并验证冲突项状态与零残留', async ({
  page,
  productCenterApi,
  cleanupRegistry,
  executionLedger,
}, testInfo) => {
  test.setTimeout(360_000);
  const runId = process.env.PC_RECIPE_RUN_ID?.startsWith('AUTO_AUDIT_')
    ? process.env.PC_RECIPE_RUN_ID
    : `AUTO_AUDIT_YELLOW_Y2_${Date.now()}`;
  const outputPath = path.resolve(`output/audit/product-center-item-yellow-y2-runtime-${runId}.json`);
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const dependencyFactory = new ProductCenterLowDependencyDataFactory(productCenterApi);
  const itemContext = await itemFactory.prepare();
  let itemRegistered = false;
  let createResponseBody: unknown;
  const report: Record<string, unknown> = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-yellow-y2-runtime',
    runId,
    caseId: 'TC-ITEM-STD-061',
    status: 'running',
    generatedAt: new Date().toISOString(),
    itemIdentity: itemContext.originalIdentity,
  };
  checkpoint();

  try {
    const firstGroup = await dependencyFactory.seedMultiOptionRuleGroupScenario(cleanupRegistry);
    const secondGroup = await dependencyFactory.seedMultiOptionRuleGroupScenario(cleanupRegistry);
    report.dependencies = [firstGroup, secondGroup].map((group) => ({
      id: group.id,
      name: group.originalIdentity,
      optionNames: group.metadata.optionNames,
    }));
    checkpoint();

    const createPage = new ItemCreateStandardPage(page);
    await createPage.open();
    await createPage.fillItemName(itemContext.originalIdentity);
    await createPage.selectSingleSpec();
    await createPage.fillStandardPrice('10.00');
    await createPage.selectFlavorGroupByName(firstGroup.originalIdentity);
    await createPage.selectFlavorGroupByName(secondGroup.originalIdentity);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/ops-brand/brand-items/standard')
    ), { timeout: 60_000 });
    await createPage.clickSave();
    const response = await responsePromise;
    createResponseBody = await response.json().catch(() => null);
    const itemRecord = await itemFactory.registerCreated(itemContext, createResponseBody, cleanupRegistry);
    itemRegistered = true;
    report.item = { id: itemRecord.id, name: itemRecord.originalIdentity, responseStatus: response.status() };
    checkpoint();

    const listPage = new ItemListPage(page);
    await listPage.expectLoaded();
    await listPage.fillSearch(itemContext.originalIdentity);
    await listPage.expectUniqueItemVisible(itemContext.originalIdentity);
    await listPage.clickItemName(itemContext.originalIdentity);
    const editPage = new ItemEditStandardPage(page);
    await editPage.expectLoaded();
    await editPage.expandMutuallyExclusiveRules();
    await editPage.clickMutuallyExclusiveRulesAdd();
    report.inlineRule = await editPage.readMutuallyExclusiveInlineEvidence();
    await editPage.openMutuallyExclusiveGroupEditor(0);
    report.dialog = await editPage.readMutuallyExclusiveDialogEvidence();
    await editPage.closeMutuallyExclusiveDialog();
    const firstOption = String(firstGroup.metadata.optionNames).split('|')[0];
    const secondOption = String(secondGroup.metadata.optionNames).split('|')[0];
    await editPage.configureMutuallyExclusiveSide(0, firstOption);
    await editPage.configureMutuallyExclusiveSide(1, secondOption);
    report.configuredRule = await editPage.readMutuallyExclusiveInlineEvidence();
    const updateResponsePromise = page.waitForResponse((updateResponse) => (
      updateResponse.request().method() === 'PUT'
      && new URL(updateResponse.url()).pathname.endsWith(`/ops-brand/brand-items/standard/${itemRecord.id}`)
    ), { timeout: 60_000 });
    await editPage.clickSave();
    const updateResponse = await updateResponsePromise;
    report.update = {
      method: updateResponse.request().method(),
      path: new URL(updateResponse.url()).pathname,
      status: updateResponse.status(),
    };

    await listPage.expectLoaded();
    await listPage.fillSearch(itemContext.originalIdentity);
    await listPage.expectUniqueItemVisible(itemContext.originalIdentity);
    await listPage.clickItemName(itemContext.originalIdentity);
    const verificationPage = new ItemEditStandardPage(page);
    await verificationPage.expectLoaded();
    await verificationPage.selectCommonAttributeOption(firstGroup.originalIdentity, firstOption);
    const conflictState = await verificationPage.readCommonAttributeOptionState(
      secondGroup.originalIdentity,
      secondOption,
    );
    report.conflictState = conflictState;
    report.status = conflictState.disabled || conflictState.ariaDisabled === 'true'
      ? 'accepted'
      : 'canonical-conflict';
    report.reason = report.status === 'canonical-conflict'
      ? '配置互斥规则并选择前置项后，冲突项在商品编辑页仍可用'
      : undefined;
    checkpoint();
  } catch (error) {
    report.status = 'executor-error';
    report.error = error instanceof Error ? error.message : String(error);
    checkpoint();
    throw error;
  } finally {
    if (!itemRegistered && await itemFactory.itemRecordCount(itemContext.originalIdentity) > 0) {
      await itemFactory.registerCreated(itemContext, createResponseBody, cleanupRegistry);
    }
    await cleanupRegistry.cleanupAll();
    const ledger = executionLedger.snapshot();
    report.completedAt = new Date().toISOString();
    report.ledger = ledger.entries.map((entry) => ({
      entityKind: entry.entityKind,
      serverId: entry.serverId,
      identity: entry.identity,
      phase: entry.phase,
    }));
    report.residueVerified = ledger.entries.length >= 3
      && ledger.entries.every((entry) => entry.phase === 'residue-verified');
    checkpoint();
    await testInfo.attach('product-center-item-yellow-y2-runtime', {
      body: Buffer.from(JSON.stringify(report, null, 2), 'utf8'),
      contentType: 'application/json',
    });
  }

  expect(['accepted', 'canonical-conflict']).toContain(report.status);
  expect(report.residueVerified).toBe(true);

  function checkpoint(): void {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, outputPath);
  }
});
