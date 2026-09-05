import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ItemCreateStandardPage } from '../../pages/product-management/item/item-create-standard.page';
import { ItemCreateSidePage } from '../../pages/product-management/item/item-create-side.page';
import { ItemCreateComboPage } from '../../pages/product-management/item/item-create-combo.page';
import { ProductCenterApi } from '../../api/product-center/product-center-api';
import { CleanupRegistry } from '../../api/product-center/cleanup-registry';
import { ProductCenterExecutionLedger } from '../../api/product-center/execution-ledger';
import { ProductCenterLowDependencyDataFactory } from '../../test-data/product-center/sop/product-center-low-dependency-data.factory';

test('W5 三类商品其他设置只读 DOM 探针', async ({ page }) => {
  test.skip(process.env.PC_P0_REMAINING_W5_PROBE !== '1', '未启用 W5 只读 DOM 探针');
  const evidence: Record<string, unknown> = {};
  const outputPath = path.resolve('output/audit/product-center-item-p0-remaining-w5-dom-probe.json');
  const standardPage = new ItemCreateStandardPage(page);
  const addonPage = new ItemCreateSidePage(page);
  const comboPage = new ItemCreateComboPage(page);

  await probe('standard', () => standardPage.open());
  await probe('addon', () => addonPage.open());
  await probe('combo', () => comboPage.open());

  checkpoint();

  async function probe(productType: string, open: () => Promise<void>): Promise<void> {
    await open();
    const networkPaths: string[] = [];
    const listener = (response: { url(): string }) => {
      const url = new URL(response.url());
      if (/brand-tags|brand-images|brand-modifiers|addon-group/.test(url.pathname)) networkPaths.push(url.pathname);
    };
    page.on('response', listener);
    try {
      const otherSection = page.locator('#section-others');
      const expand = otherSection.getByRole('button', { name: /Expand$/ });
      if (await expand.isVisible().catch(() => false)) await expand.click();
      const sectionText = await otherSection.innerText();
      const dialogs: Record<string, unknown> = {};
      for (const label of ['Description Labels', 'Badges']) {
        const block = otherSection.getByText(label, { exact: true }).locator('../..');
        const add = block.getByRole('button', { name: 'Add', exact: true });
        if (await add.count() !== 1) {
          dialogs[label] = { addCount: await add.count() };
          continue;
        }
        await add.click();
        const dialog = page.getByRole('dialog').last();
        await dialog.waitFor({ state: 'visible', timeout: 10_000 });
        dialogs[label] = {
          text: await dialog.innerText(),
          html: sanitize(await dialog.evaluate((element) => element.outerHTML)),
        };
        await dialog.getByRole('button', { name: 'close', exact: true }).click();
        await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
      }
      const detailImageUpload = otherSection.getByText('Upload Image', { exact: true });
      if (productType === 'standard' && await detailImageUpload.count() === 1) {
        await otherSection.locator('div[class^="uploadButton___"]').hover({ force: true, timeout: 10_000 });
        await otherSection.getByRole('button', { name: 'Library', exact: true }).click({ timeout: 10_000 });
        const dialog = page.getByRole('dialog').last();
        await dialog.waitFor({ state: 'visible', timeout: 10_000 });
        dialogs['Detail Images'] = {
          text: await dialog.innerText(),
          html: sanitize(await dialog.evaluate((element) => element.outerHTML)),
        };
        await dialog.getByRole('button', { name: 'close', exact: true }).click();
        await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
      }
      evidence[productType] = {
        route: new URL(page.url()).pathname,
        sectionText,
        sectionHtml: sanitize(await otherSection.evaluate((element) => element.outerHTML)),
        dialogs,
        networkPaths: [...new Set(networkPaths)],
      };
      checkpoint();
    } finally {
      page.off('response', listener);
    }
  }

  function checkpoint(): void {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, outputPath);
  }
});

test('W5 受控资源选择 DOM 探针', async ({ page, request }, testInfo) => {
  test.setTimeout(180_000);
  test.skip(process.env.PC_P0_REMAINING_W5_PROBE !== '1', '未启用 W5 受控资源探针');
  const runId = `AUTO_AUDIT_W5_RESOURCE_PROBE_${Date.now()}`;
  const ledger = new ProductCenterExecutionLedger({
    rootDir: path.resolve('output/checkpoints'),
    runId,
  });
  const cleanupRegistry = new CleanupRegistry(ledger);
  const factory = new ProductCenterLowDependencyDataFactory(new ProductCenterApi(request));
  const outputPath = path.resolve('output/audit/product-center-item-p0-remaining-w5-resource-probe.json');
  const evidence: Record<string, unknown> = { runId };
  try {
    const descriptionTags = await factory.seedDescriptionTagBoundaryScenario(cleanupRegistry);
    const cornerMarks = await factory.seedCornerMarkBoundaryScenario(cleanupRegistry);
    const ruleGroup = await factory.seedMultiOptionRuleGroupScenario(cleanupRegistry);
    evidence.resources = { descriptionTags, cornerMarks, ruleGroup };
    checkpoint();

    const form = new ItemCreateStandardPage(page);
    await form.open();
    await form.selectFlavorGroupByName(ruleGroup.originalIdentity);
    evidence.attributeHtml = sanitize(await page.locator('#section-attributes').evaluate((element) => element.outerHTML));
    evidence.defaultBoundary = await form.selectOnlyDefaultOption(
      ruleGroup.originalIdentity,
      String(ruleGroup.metadata.optionNames).split('|')[1],
    );
    evidence.descriptionBoundary = await form.selectDescriptionTagsByName(
      descriptionTags.tags.map((tag) => tag.name),
    );
    evidence.cornerA = await form.selectCornerMarkByName(cornerMarks.marks[0].name);
    evidence.cornerB = await form.selectCornerMarkByName(cornerMarks.marks[1].name);
    evidence.selectedCorners = await form.readSelectedCornerMarks(cornerMarks.marks.map((mark) => mark.name));

    const imagePath = testInfo.outputPath('AUTO_AUDIT_W5_DUPLICATE_DETAIL.png');
    await page.screenshot({ path: imagePath, clip: { x: 0, y: 0, width: 256, height: 256 } });
    evidence.duplicateImage = await form.attemptDuplicateDetailImage(imagePath);
    evidence.otherSettingsHtml = sanitize(await page.locator('#section-others').evaluate((element) => element.outerHTML));
    checkpoint();
  } finally {
    let cleanupDiagnostic: string | undefined;
    try {
      await cleanupRegistry.cleanupAll();
    } catch (error) {
      cleanupDiagnostic = String(error);
    }
    const snapshot = ledger.snapshot();
    evidence.cleanup = {
      cleanupDiagnostic,
      entries: snapshot.entries.length,
      residueVerified: snapshot.entries.filter((entry) => entry.phase === 'residue-verified').length,
    };
    checkpoint();
    expect(cleanupDiagnostic).toBeUndefined();
    expect(snapshot.entries.every((entry) => entry.phase === 'residue-verified')).toBe(true);
  }

  function checkpoint(): void {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, outputPath);
  }
});

function sanitize(value: string): string {
  return value
    .replace(/(authorization|password|cookie|token)\s*[:=]\s*[^,;\s]+/gi, '$1=<redacted>')
    .slice(0, 80_000);
}
