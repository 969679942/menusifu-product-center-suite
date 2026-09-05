import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { test } from '../../fixtures/product-center.fixture';
import { ItemCreateComboPage } from '../../pages/product-management/item/item-create-combo.page';
import { ItemCreateStandardPage } from '../../pages/product-management/item/item-create-standard.page';
import { ItemListPage } from '../../pages/product-management/item/item-list.page';
import {
  itemActionMenuDom,
  itemCreateComboFormDom,
  itemCreateStandardFormDom,
} from '../../test-data/item-list';
import { waitUntil } from '../../utils/wait';

type CaseStatus = 'accepted' | 'canonical-conflict' | 'environment-blocked' | 'executor-error';

type CaseDecision = {
  status: Exclude<CaseStatus, 'executor-error'>;
  evidence: Record<string, unknown>;
  reason?: string;
};

type CaseEvidence = {
  caseId: string;
  groupId: string;
  status: CaseStatus;
  evidence: Record<string, unknown>;
  reason?: string;
  recordedAt: string;
};

const policy = {
  mode: 'wave-shared-chain',
  representativeGroups: 8,
  caseEvidenceRequired: 14,
  evidenceInheritanceAllowed: false,
  readOnly: true,
} as const;

test('Y1 8组只读共享链应为14条黄色用例逐条留证', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const runId = process.env.PC_RECIPE_RUN_ID?.startsWith('AUTO_AUDIT_')
    ? process.env.PC_RECIPE_RUN_ID
    : `AUTO_AUDIT_YELLOW_Y1_${Date.now()}`;
  const outputPath = path.resolve(`output/audit/product-center-item-yellow-y1-runtime-${runId}.json`);
  const retryAfterHarnessFix = new Set([
    'TC-ITEM-STD-071',
    'TC-ITEM-ADD-035',
    'TC-ITEM-UI-001',
    'TC-ITEM-UI-002',
  ]);
  const previousReport = readExistingReport(outputPath);
  const cases: CaseEvidence[] = (previousReport?.cases ?? []).filter((item) => (
    item.status !== 'executor-error' && !retryAfterHarnessFix.has(item.caseId)
  ));
  const mutationRequests: Array<{ method: string; path: string }> = [];
  const report: Record<string, unknown> = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-yellow-y1-runtime',
    runId,
    generatedAt: new Date().toISOString(),
    status: 'running',
    policy,
    resumedCaseIds: cases.map((item) => item.caseId),
    cases,
    summary: {
      representativeGroups: 8,
      caseEvidenceRequired: 14,
      mutationCount: 0,
    },
  };
  const standardPage = new ItemCreateStandardPage(page);
  const listPage = new ItemListPage(page);
  const comboPage = new ItemCreateComboPage(page);
  const captureMutation = (request: { method(): string; url(): string }) => {
    const method = request.method();
    const requestPath = new URL(request.url()).pathname;
    if (isMutationRequest(method, requestPath)) mutationRequests.push({ method, path: requestPath });
  };
  page.on('request', captureMutation);
  checkpoint();

  try {
    await standardPage.open();
    await recordCase('AT07', 'TC-ITEM-STD-041', async () => {
      const advancedMarkers = [
        'POS Name', 'Kitchen Name', 'Mnemonic Code', 'Industry Goods',
        'Item Code', 'Unit', 'Device Code', 'Minimum Order Quantity',
      ];
      const baseText = await page.locator('#section-base').innerText();
      const visibleMarkers = advancedMarkers.filter((marker) => baseText.includes(marker));
      const advancedButton = page.getByRole('button', { name: itemCreateStandardFormDom.advancedSettingsButton });
      return decision(visibleMarkers.length === 0, {
        route: new URL(page.url()).pathname,
        visibleMarkers,
        advancedButtonCount: await advancedButton.count(),
        advancedButtonExpanded: await advancedButton.getAttribute('aria-expanded'),
      }, '高级设置默认状态与 canonical 不一致');
    });
    await recordCase('AT14', 'TC-ITEM-STD-079', async () => {
      const labels = [
        itemCreateComboFormDom.addComboGroupLabel,
        itemCreateComboFormDom.addFixedComboMenuItem,
        itemCreateComboFormDom.selectFixedComboMenuItem,
        itemCreateComboFormDom.addCustomComboMenuItem,
        itemCreateComboFormDom.selectCustomComboMenuItem,
      ];
      const counts = Object.fromEntries(await Promise.all(labels.map(async (label) => [
        label,
        await page.getByText(label, { exact: true }).count(),
      ])));
      return decision(Object.values(counts).every((count) => count === 0), {
        route: new URL(page.url()).pathname,
        counts,
      }, '标准商品创建页出现套餐组能力');
    });

    await listPage.open();
    await recordCase('AT18', 'TC-ITEM-STD-071', () => probeImagePreview('Standard'));
    await recordCase('AT31', 'TC-ITEM-ADD-035', () => probeImagePreview('Add-On'));
    await recordCase('AT18', 'TC-ITEM-STD-074', async () => {
      const totalText = await listPage.readPaginationTotalText();
      const totalAmountCount = await page.getByText('Total Amount', { exact: false }).count();
      return decision(/Total\s+\d+\s+items/i.test(totalText) && totalAmountCount === 0, {
        totalText,
        totalAmountCount,
      }, '商品数量或总金额展示与 canonical 不一致');
    });
    await recordCase('AT18', 'TC-ITEM-STD-076', async () => {
      const cells = await page.locator('tbody tr.ant-table-row:visible td').allInnerTexts();
      const normalized = cells.map((text) => text.trim());
      const emptyCellCount = normalized.filter((text) => text === '').length;
      const dashCellCount = normalized.filter((text) => text === '-').length;
      return decision(emptyCellCount > 0 && dashCellCount === 0, {
        sampledCellCount: normalized.length,
        emptyCellCount,
        dashCellCount,
      }, '当前列表样本使用短横线展示空值或没有可验证空值');
    });
    await recordCase('AT53', 'TC-ITEM-UI-001', async () => {
      const button = page.getByRole('button', { name: /(Upload Records|导入记录)/ });
      return decision(await button.count() === 1 && await button.isVisible() && await button.isEnabled(), {
        count: await button.count(),
        visible: await button.isVisible().catch(() => false),
        enabled: await button.isEnabled().catch(() => false),
      }, '导入记录入口不可见或不可用');
    });
    await recordCase('AT53', 'TC-ITEM-UI-002', async () => {
      const actionButton = page.getByRole('button', { name: /Action$/ });
      const actionButtonCount = await actionButton.count();
      if (actionButtonCount !== 1) {
        return decision(false, { actionButtonCount }, '列表操作按钮不唯一或不存在');
      }
      const actionOpened = await actionButton.click({ timeout: 5_000 }).then(() => true).catch(() => false);
      if (!actionOpened) {
        await page.keyboard.press('Escape');
        return decision(false, { actionButtonCount, actionOpened }, '列表操作按钮不可点击');
      }
      const imageImport = page.getByRole('menuitem', { name: itemActionMenuDom.imageImport, exact: true });
      const productImport = page.getByRole('menuitem', { name: itemActionMenuDom.itemImport, exact: true });
      const evidence = {
        imageImportCount: await imageImport.count(),
        productImportCount: await productImport.count(),
        imageImportVisible: await imageImport.isVisible().catch(() => false),
        productImportVisible: await productImport.isVisible().catch(() => false),
      };
      await page.keyboard.press('Escape');
      return decision(
        evidence.imageImportCount === 1
          && evidence.productImportCount === 1
          && evidence.imageImportVisible
          && evidence.productImportVisible,
        evidence,
        '操作菜单未同时展示图片导入与商品导入',
      );
    });

    const fixedSearch = await probeComboGroupSearch('fixed');
    await recordCase('AT37', 'TC-ITEM-PKG-003', async () => decision(
      fixedSearch.partialMatched && fixedSearch.restored,
      fixedSearch,
      '固定搭配套餐组模糊搜索或清空恢复失败',
    ));
    const customSearch = await probeComboGroupSearch('custom');
    await recordCase('AT36', 'TC-ITEM-PKG-044', async () => decision(
      customSearch.partialMatched && customSearch.nonMatchingCount === 0,
      customSearch,
      '组合搭配套餐组模糊搜索结果不正确',
    ));
    await recordCase('AT36', 'TC-ITEM-PKG-056', async () => decision(
      customSearch.exactMatched && customSearch.exactResultCount === 1,
      customSearch,
      '组合搭配套餐组精确搜索结果不唯一',
    ));
    await recordCase('AT37', 'TC-ITEM-PKG-045', async () => decision(
      customSearch.restored,
      customSearch,
      '清空组合搭配搜索条件后未恢复默认列表',
    ));

    await comboPage.open();
    await comboPage.clickAdvancedSettings();
    await recordCase('AT40', 'TC-ITEM-PKG-014', async () => {
      const value = await comboPage.readMinimumOrderQuantityValue();
      return decision(value === '1', { value }, '套餐商品起售数量默认值不是 1');
    });
    await recordCase('AT40', 'TC-ITEM-PKG-051', async () => {
      const singleSpecCount = await page.getByRole('radio', { name: itemCreateStandardFormDom.singleSpecRadio }).count();
      const multiSpecCount = await page.getByRole('radio', { name: itemCreateStandardFormDom.multiSpecRadio }).count();
      const weightCount = await page.getByText(itemCreateStandardFormDom.weightBasedItemMarker, { exact: true }).count();
      return decision(singleSpecCount === 0 && multiSpecCount === 0 && weightCount === 0, {
        singleSpecCount,
        multiSpecCount,
        weightCount,
      }, '套餐商品创建页出现多规格或称重入口');
    });
  } finally {
    page.off('request', captureMutation);
    const counts = countStatuses(cases);
    report.status = counts['executor-error'] > 0
      ? 'executor-error'
      : counts['canonical-conflict'] > 0
        ? 'accepted-with-canonical-conflicts'
        : counts['environment-blocked'] > 0
          ? 'completed-with-environment-blocks'
          : 'accepted';
    report.completedAt = new Date().toISOString();
    report.summary = {
      representativeGroups: 8,
      caseEvidenceRequired: 14,
      recordedCases: cases.length,
      ...counts,
      mutationCount: mutationRequests.length,
    };
    report.mutationRequests = mutationRequests;
    checkpoint();
    await testInfo.attach('product-center-item-yellow-y1-runtime', {
      body: Buffer.from(JSON.stringify(report, null, 2), 'utf8'),
      contentType: 'application/json',
    });
  }

  expect(cases).toHaveLength(policy.caseEvidenceRequired);
  expect(cases.filter((item) => item.status === 'executor-error')).toEqual([]);
  expect(mutationRequests).toEqual([]);

  async function recordCase(groupId: string, caseId: string, probe: () => Promise<CaseDecision>): Promise<void> {
    if (cases.some((item) => item.caseId === caseId)) return;
    try {
      cases.push({ groupId, caseId, ...(await probe()), recordedAt: new Date().toISOString() });
    } catch (error) {
      cases.push({
        groupId,
        caseId,
        status: 'executor-error',
        reason: error instanceof Error ? error.message : String(error),
        evidence: { route: new URL(page.url()).pathname },
        recordedAt: new Date().toISOString(),
      });
    }
    checkpoint();
  }

  async function probeImagePreview(typeLabel: 'Standard' | 'Add-On'): Promise<CaseDecision> {
    const rows = page.locator('tbody tr.ant-table-row:visible').filter({ hasText: typeLabel });
    const rowCount = await rows.count();
    for (let index = 0; index < rowCount; index += 1) {
      const images = rows.nth(index).locator('img.ant-image-img:visible');
      if (await images.count() === 0) continue;
      const image = images.first();
      const source = await image.getAttribute('src');
      if (!source) continue;
      await image.click();
      const preview = page.locator('.ant-image-preview-img:visible');
      const previewVisible = await preview.waitFor({ state: 'visible', timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
      if (!previewVisible) {
        await page.keyboard.press('Escape');
        return decision(false, {
          typeLabel,
          rowIndex: index,
          source: sanitizeUrl(source),
          previewCount: await preview.count(),
        }, '点击列表主图后未打开大图预览');
      }
      const previewSource = await preview.getAttribute('src');
      const close = page.locator('.ant-image-preview-close:visible');
      await close.click();
      await preview.waitFor({ state: 'hidden', timeout: 10_000 });
      return decision(Boolean(previewSource) && comparableImageSource(source) === comparableImageSource(previewSource ?? ''), {
        typeLabel,
        rowIndex: index,
        source: sanitizeUrl(source),
        previewSource: sanitizeUrl(previewSource ?? ''),
      }, '大图预览与列表主图不一致');
    }
    return {
      status: 'environment-blocked',
      reason: `当前页没有带主图的 ${typeLabel} 商品`,
      evidence: { typeLabel, rowCount },
    };
  }

  async function probeComboGroupSearch(kind: 'fixed' | 'custom'): Promise<Record<string, unknown> & {
    partialMatched: boolean;
    exactMatched: boolean;
    exactResultCount: number;
    nonMatchingCount: number;
    restored: boolean;
  }> {
    await comboPage.open();
    const addButton = page.locator('#section-attributes').getByRole('button', { name: /Add$/ });
    await addButton.click();
    const menuName = kind === 'fixed'
      ? itemCreateComboFormDom.selectFixedComboMenuItem
      : itemCreateComboFormDom.selectCustomComboMenuItem;
    await page.getByRole('menuitem', { name: menuName, exact: true }).click();
    const dialogTitle = kind === 'fixed'
      ? itemCreateComboFormDom.fixedComboDialogTitle
      : itemCreateComboFormDom.customComboDialogTitle;
    const dialog = page.getByRole('dialog').filter({
      has: page.getByRole('heading', { name: dialogTitle, level: 2, exact: true }),
    });
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const rows = dialog.locator('tbody tr.ant-table-row:visible');
    await waitUntil(
      () => rows.count(),
      (count) => count > 0,
      { timeout: 15_000, message: `${dialogTitle} 没有可搜索套餐组` },
    );
    const beforeTexts = normalizeRowTexts(await rows.allInnerTexts());
    const targetName = firstBusinessName(beforeTexts);
    const searchInputs = dialog.getByRole('textbox');
    const inputCount = await searchInputs.count();
    if (inputCount !== 1) throw new Error(`${dialogTitle} 搜索框数量=${inputCount}`);
    const searchInput = searchInputs.first();
    const partial = targetName.length > 3 ? targetName.slice(0, Math.max(2, Math.ceil(targetName.length / 2))) : targetName;
    await searchInput.fill(partial);
    const partialTexts = await waitUntil(
      () => rows.allInnerTexts().then(normalizeRowTexts),
      (texts) => texts.length > 0 && texts.every((text) => text.toLowerCase().includes(partial.toLowerCase())),
      { timeout: 15_000, message: `${dialogTitle} 模糊搜索未收敛` },
    );
    await searchInput.fill(targetName);
    const exactTexts = await waitUntil(
      () => rows.allInnerTexts().then(normalizeRowTexts),
      (texts) => texts.length > 0 && texts.every((text) => text.toLowerCase().includes(targetName.toLowerCase())),
      { timeout: 15_000, message: `${dialogTitle} 精确搜索未收敛` },
    );
    await searchInput.fill('');
    const restoredTexts = await waitUntil(
      () => rows.allInnerTexts().then(normalizeRowTexts),
      (texts) => texts.length >= beforeTexts.length && beforeTexts.every((text) => texts.includes(text)),
      { timeout: 15_000, message: `${dialogTitle} 清空搜索后未恢复` },
    );
    const close = dialog.getByRole('button', { name: 'close', exact: true });
    await close.click();
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    return {
      kind,
      targetName,
      partial,
      beforeCount: beforeTexts.length,
      partialCount: partialTexts.length,
      exactResultCount: exactTexts.length,
      restoredCount: restoredTexts.length,
      partialMatched: partialTexts.every((text) => text.toLowerCase().includes(partial.toLowerCase())),
      exactMatched: exactTexts.some((text) => text.toLowerCase().includes(targetName.toLowerCase())),
      nonMatchingCount: partialTexts.filter((text) => !text.toLowerCase().includes(partial.toLowerCase())).length,
      restored: beforeTexts.every((text) => restoredTexts.includes(text)),
    };
  }

  function checkpoint(): void {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, outputPath);
  }
});

function decision(
  accepted: boolean,
  evidence: Record<string, unknown>,
  conflictReason: string,
): CaseDecision {
  return accepted
    ? { status: 'accepted', evidence }
    : { status: 'canonical-conflict', evidence, reason: conflictReason };
}

function normalizeRowTexts(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function firstBusinessName(rowTexts: string[]): string {
  const first = rowTexts[0]?.split(/\r?\n/).map((value) => value.trim()).find(Boolean);
  if (!first) throw new Error('套餐组列表首行缺少业务名称');
  return first;
}

function comparableImageSource(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split('?')[0];
  }
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.replace(/[?#].*$/, '');
  }
}

function isMutationRequest(method: string, requestPath: string): boolean {
  if (method === 'PUT' || method === 'PATCH' || method === 'DELETE') return true;
  if (method !== 'POST') return false;
  return /\/ops-brand\/(brand-items\/(standard|combo|side)|brand-sections)$/.test(requestPath);
}

function countStatuses(cases: CaseEvidence[]): Record<CaseStatus, number> {
  return {
    accepted: cases.filter((item) => item.status === 'accepted').length,
    'canonical-conflict': cases.filter((item) => item.status === 'canonical-conflict').length,
    'environment-blocked': cases.filter((item) => item.status === 'environment-blocked').length,
    'executor-error': cases.filter((item) => item.status === 'executor-error').length,
  };
}

function readExistingReport(filePath: string): { cases?: CaseEvidence[] } | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as { cases?: CaseEvidence[] };
  } catch {
    return undefined;
  }
}
