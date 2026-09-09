import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { MutationIntentJournal } from '../../api/product-center/mutation-intent-journal';

const projectRoot = path.resolve(__dirname, '../..');
const executorPath = path.join(
  projectRoot,
  'tests/generated/product-center-item-p0-remaining-w2.generated.spec.ts',
);
const wave3ExecutorPath = path.join(
  projectRoot,
  'tests/generated/product-center-item-p0-remaining-w3.generated.spec.ts',
);
const wave4ExecutorPath = path.join(
  projectRoot,
  'tests/generated/product-center-item-p0-remaining-w4.generated.spec.ts',
);

test.describe('商品中心剩余 P0 W2 执行安全合同', () => {
  test('应在提交前读取输入证据并在离开创建路由后停止读取表单', async () => {
    const source = fs.readFileSync(executorPath, 'utf8');
    const snapshotIndex = source.indexOf('const enteredValues = await readEnteredValues(');
    const submitIndex = source.indexOf('await form.clickSave()');

    expect(snapshotIndex).toBeGreaterThan(-1);
    expect(submitIndex).toBeGreaterThan(snapshotIndex);
    expect(source).toContain('isProductCenterItemCreateRoute(page.url())');
    expect(source).not.toContain('itemName: await form.readItemName().catch');
  });

  test('应允许首尾空格审计身份并继续拒绝非审计身份', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-w2-mutation-intent-'));
    try {
      const journal = new MutationIntentJournal({ rootDir, runId: 'AUTO_AUDIT_W2_TEST' });
      const requestFingerprint = createHash('sha256').update('padded-audit-identity').digest('hex');

      expect(() => journal.recordIntent({
        intentId: 'intent:w2:padded',
        unitId: 'audit-unit:w2:padded',
        safetyLevel: 'L2-controlled-negative',
        entity: 'item',
        identity: 'AUTO_AUDIT_W2_PADDED',
        identityVariants: ['AUTO_AUDIT_W2_PADDED', '  AUTO_AUDIT_W2_PADDED  '],
        operation: { method: 'POST', path: '/ops-brand/brand-items/standard' },
        requestFingerprint,
      })).not.toThrow();

      expect(() => journal.recordIntent({
        intentId: 'intent:w2:unsafe',
        unitId: 'audit-unit:w2:unsafe',
        safetyLevel: 'L2-controlled-negative',
        entity: 'item',
        identity: 'EXISTING_PRODUCT',
        identityVariants: ['EXISTING_PRODUCT'],
        operation: { method: 'POST', path: '/ops-brand/brand-items/standard' },
        requestFingerprint: createHash('sha256').update('unsafe-identity').digest('hex'),
      })).toThrow('禁止记录非审计数据');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('W3 应通过单一共享整波入口覆盖六条重复约束用例', async () => {
    expect(fs.existsSync(wave3ExecutorPath)).toBe(true);
    const source = fs.readFileSync(wave3ExecutorPath, 'utf8');
    const expectedCaseIds = [
      'TC-ITEM-STD-010',
      'TC-ITEM-STD-044',
      'TC-ITEM-ADD-014',
      'TC-ITEM-ADD-015',
      'TC-ITEM-PKG-024',
      'TC-ITEM-PKG-025',
    ];

    for (const caseId of expectedCaseIds) expect(source).toContain(`'${caseId}'`);
    expect(source).toContain('executionMode: \'wave-shared-chain\'');
    expect(source).toContain('caseLevelRunsClaimed: 0');
    expect(source).toContain("await form.clickAdvancedSettings();\n      if (options.itemCode) await form.fillItemCode(options.itemCode);");
    expect(source).toContain('!executionDiagnostic && completeCaseEvidence');
    const sideLocators = fs.readFileSync(path.join(
      projectRoot,
      'pages/product-management/item/item-create-side-locators.ts',
    ), 'utf8');
    expect(sideLocators).toContain("getByRole('menuitemcheckbox').filter({ hasText: name })");
  });

  test('W4 应通过单一共享整波入口覆盖六条标准商品正向用例', async () => {
    expect(fs.existsSync(wave4ExecutorPath)).toBe(true);
    const source = fs.readFileSync(wave4ExecutorPath, 'utf8');
    const expectedCaseIds = [
      'TC-ITEM-STD-036',
      'TC-ITEM-STD-037',
      'TC-ITEM-STD-008',
      'TC-ITEM-STD-016',
      'TC-ITEM-STD-017',
      'TC-ITEM-STD-018',
    ];
    for (const caseId of expectedCaseIds) expect(source).toContain(`'${caseId}'`);
    expect(source).toContain('executionMode: \'wave-shared-chain\'');
    expect(source).toContain('caseLevelRunsClaimed: 0');
    expect(source).toContain('seedSpecWithOptions');
    expect(source).toContain('selectDefaultSpecByOption');
    expect(source).toContain('fillMultiSpecPriceByOption');
    expect(source).toContain('!executionDiagnostic && completeCaseEvidence');
    expect(source).toContain("await form.clickAdvancedSettings();\n      await form.fillMinimumOrderQuantity('1');");
    expect(source).toContain('expect(formattedSubmittedName.length).toBeGreaterThan(100)');
    expect(source).toContain('formattedFinalName.length <= 100');
    expect(source).toContain('attemptFormattedCreate(formattedSubmittedName)');
    expect(source).toContain('validationErrors: await form.readVisibleValidationErrors()');
    expect(source).toContain("await form.selectSingleSpec();\n      await form.enableWeightBasedItem();\n      await form.fillStandardPrice('10.00');");
    expect(source).toContain('await weightedEdit.ensureAdvancedSettingsExpanded()');
    expect(source).toContain("expect(weightedReadback.prices).toContain('10.00')");

    const apiSource = fs.readFileSync(path.join(
      projectRoot,
      'api/product-center/product-center-api.ts',
    ), 'utf8');
    expect(apiSource).toContain('optionNames?: readonly string[]');

    const pageSource = fs.readFileSync(path.join(
      projectRoot,
      'pages/product-management/item/item-create-standard.page.ts',
    ), 'utf8');
    expect(pageSource).toContain('async fillMultiSpecPriceByOption(');
    expect(pageSource).toContain('async selectDefaultSpecByOption(');
    expect(pageSource).toContain('minimumOrderQuantityInput.fill(quantity, { timeout: 10_000 })');
    expect(pageSource).toContain("row.getByRole('switch').click({ timeout: 10_000 })");
    expect(pageSource).toContain('.fill(price, { timeout: 10_000 })');
    expect(pageSource).toContain('unitInput.fill(unit, { timeout: 10_000 })');
    expect(pageSource).toContain('async ensureAdvancedSettingsExpanded()');
  });
});
