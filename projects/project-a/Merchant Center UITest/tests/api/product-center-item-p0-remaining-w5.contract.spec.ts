import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '../..');
const executorPath = path.join(
  projectRoot,
  'tests/generated/product-center-item-p0-remaining-w5.generated.spec.ts',
);

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

test.describe('商品中心剩余 P0 W5 共享整波合同', () => {
  test('W5 必须通过单一共享链覆盖图片、标签、角标和默认项边界', async () => {
    expect(fs.existsSync(executorPath)).toBe(true);
    const source = fs.readFileSync(executorPath, 'utf8');

    for (const caseId of caseIds) expect(source).toContain(`'${caseId}'`);
    expect(source).toContain("executionMode: 'wave-shared-chain'");
    expect(source).toContain('caseLevelRunsClaimed: 0');
    expect(source).toContain('seedDescriptionTagBoundaryScenario');
    expect(source).toContain('seedCornerMarkBoundaryScenario');
    expect(source).toContain('seedMultiOptionRuleGroupScenario');
    expect(source).toContain('page.context().newPage()');
    expect(source).toContain('selectDescriptionTagsByName');
    expect(source).toContain('selectCornerMarkByName');
    expect(source).toContain('selectOnlyDefaultOption');
    expect(source).toContain('attemptDuplicateDetailImage');
    expect(source).toContain('BITEM-3006');
    expect(source).toContain('stableBlockedObservations');
    expect(source).toContain('lateCreatedRecord');
    expect(source).toContain('cornerMatched');
    expect(source).toContain('const completeCaseEvidence =');
    expect(source).toContain('&& !executionDiagnostic');
    expect(source).toContain('incompleteLedgerEntries === 0');
    expect(source).toContain('uiAndApiResidueFree');
  });

  test('W5 资源能力必须支持六标签、两角标和双选项组的按 ID 清理', async () => {
    const apiSource = fs.readFileSync(
      path.join(projectRoot, 'api/product-center/product-center-api.ts'),
      'utf8',
    );
    const factorySource = fs.readFileSync(
      path.join(projectRoot, 'test-data/product-center/sop/product-center-low-dependency-data.factory.ts'),
      'utf8',
    );
    const pageSource = fs.readFileSync(
      path.join(projectRoot, 'pages/product-management/item/item-create-form.page.ts'),
      'utf8',
    );
    const locatorSource = fs.readFileSync(
      path.join(projectRoot, 'pages/product-management/item/item-create-form-locators.ts'),
      'utf8',
    );

    expect(apiSource).toContain('async createCornerMark(');
    expect(apiSource).toContain('async cornerMarkPage(');
    expect(apiSource).toContain('async deleteCornerMark(');
    expect(factorySource).toContain('async seedDescriptionTagBoundaryScenario(');
    expect(factorySource).toContain('async seedCornerMarkBoundaryScenario(');
    expect(factorySource).toContain('async seedMultiOptionRuleGroupScenario(');
    expect(pageSource).toContain('async selectDescriptionTagsByName(');
    expect(pageSource).toContain('checkbox.setChecked(true)');
    expect(pageSource).toContain('async selectCornerMarkByName(');
    expect(pageSource).toContain('async selectOnlyDefaultOption(');
    expect(pageSource).toContain('async readCommonAttributeCapabilityEvidence(');
    expect(pageSource).toContain('async attemptDuplicateDetailImage(');
    expect(pageSource).toContain("commonFlavorMenuItem.click({ timeout: 10_000 })");
    expect(locatorSource).toContain("locator('span', { hasText: /^Attribute$/ })");
  });
});
