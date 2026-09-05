import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '../..');
const executorPath = path.join(
  projectRoot,
  'tests/generated/product-center-item-p0-remaining-w6.generated.spec.ts',
);

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

test.describe('商品中心剩余 P0 W6 共享更新隔离合同', () => {
  test('W6 必须通过单一共享链覆盖三类商品更新与主数据隔离', async () => {
    expect(fs.existsSync(executorPath)).toBe(true);
    const source = fs.readFileSync(executorPath, 'utf8');

    for (const caseId of caseIds) expect(source).toContain(`'${caseId}'`);
    expect(source).toContain("executionMode: 'wave-shared-chain'");
    expect(source).toContain('caseLevelRunsClaimed: 0');
    expect(source).toContain('seedUpdateIsolationScenario');
    expect(source).toContain('createStandardForUpdate');
    expect(source).toContain('createSideForUpdate');
    expect(source).toContain('createComboForUpdate');
    expect(source).toContain('setCommonAttributeOptionOverride');
    expect(source).toContain('readCommonAttributeOptionOverride');
    expect(source).toContain('confirmAdditionalPriceWarning');
    expect(source).toContain('width: 256, height: 256');
    expect(source).toContain('imageUploadDiagnostic');
    expect(source).toContain('comboCurrentIdentity');
    expect(source).toContain('masterDataBefore');
    expect(source).toContain('masterDataAfter');
    expect(source).toContain('masterDataUnchanged');
    expect(source).toContain('readCommonAttributeCapabilityEvidence');
    expect(source).toContain('canonical-conflict');
    expect(source).toContain('const completeCaseEvidence =');
    expect(source).toContain('&& !executionDiagnostic');
    expect(source).toContain('incompleteLedgerEntries === 0');
    expect(source).toContain('uiAndApiResidueFree');
  });

  test('W6 资源与页面能力必须支持双选项三类属性和商品内覆盖回读', async () => {
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

    expect(apiSource).toContain('optionNames?: readonly string[]');
    expect(apiSource).toContain('itemIds?: readonly number[]');
    expect(apiSource).toContain('async productDetail(');
    expect(factorySource).toContain('async seedUpdateIsolationScenario(');
    expect(factorySource).toContain("kind: 'flavor' | 'recipe' | 'additives'");
    expect(pageSource).toContain('async setCommonAttributeOptionOverride(');
    expect(pageSource).toContain('async readCommonAttributeOptionOverride(');
    expect(pageSource).toContain('async uploadCommonMainImage(');
    expect(pageSource).toContain("inputValue({ timeout: 10_000 })");
  });
});
