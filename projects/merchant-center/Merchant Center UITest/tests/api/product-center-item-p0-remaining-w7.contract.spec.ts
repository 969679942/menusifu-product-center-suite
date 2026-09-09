import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '../..');
const executorPath = path.join(
  projectRoot,
  'tests/generated/product-center-item-p0-remaining-w7.generated.spec.ts',
);

const caseIds = [
  'TC-ITEM-ADD-026',
  'TC-ITEM-ADD-027',
  'TC-ITEM-ADD-028',
  'TC-ITEM-ADD-034',
  'TC-ITEM-ADD-036',
  'TC-ITEM-PKG-037',
  'TC-ITEM-PKG-038',
] as const;

test.describe('商品中心剩余 P0 W7 共享删除合同', () => {
  test('W7 必须通过单一共享链覆盖删除成功、确认文案与引用阻断', async () => {
    expect(fs.existsSync(executorPath)).toBe(true);
    const source = fs.readFileSync(executorPath, 'utf8');

    for (const caseId of caseIds) expect(source).toContain(`'${caseId}'`);
    expect(source).toContain("executionMode: 'wave-shared-chain'");
    expect(source).toContain('caseLevelRunsClaimed: 0');
    expect(source).toContain('seedDeletionReferenceScenario');
    expect(source).toContain('attemptDelete');
    expect(source).toContain('readDeleteDialogText');
    expect(source).toContain('cancelDeleteDialog');
    expect(source).toContain('confirmDeleteDialog');
    expect(source).toContain("'/ops-brand/brand-items/delete'");
    expect(source).toContain("type DeleteOutcome = 'deleted'");
    expect(source).toContain("'reference-blocked'");
    expect(source).toContain('menuRelationPresent');
    expect(source).toContain('addonGroupRelationPresent');
    expect(source).toContain('standardProductRelationPresent');
    expect(source).toContain('beforeApiCount');
    expect(source).toContain('afterApiCount');
    expect(source).toContain('afterUiCount');
    expect(source).toContain('requestDeleteId');
    expect(source).toContain('isSuccessfulDeleteResponse');
    expect(source).toContain('isReferenceBlockedResponse');
    expect(source).toContain('firstDialogText');
    expect(source).toContain('secondDialogText');
    expect(source).toContain('acceptedCaseIds.length > 0');
    expect(source).toContain('const completeCaseEvidence =');
    expect(source).toContain('&& !executionDiagnostic');
    expect(source).toContain('incompleteLedgerEntries === 0');
    expect(source).toContain('uiAndApiResidueFree');
  });

  test('W7 页面与造数能力必须支持删除观察、菜单绑定和引用资源逆序清理', async () => {
    const listPageSource = fs.readFileSync(
      path.join(projectRoot, 'pages/product-management/item/item-list.page.ts'),
      'utf8',
    );
    const addToMenuPageSource = fs.readFileSync(
      path.join(projectRoot, 'pages/product-management/item/item-add-to-menu.page.ts'),
      'utf8',
    );
    const itemFactorySource = fs.readFileSync(
      path.join(projectRoot, 'test-data/product-center/product-center-item-create-data.factory.ts'),
      'utf8',
    );
    const highDependencyFactorySource = fs.readFileSync(
      path.join(projectRoot, 'test-data/product-center/sop/product-center-high-dependency-data.factory.ts'),
      'utf8',
    );

    expect(listPageSource).toContain('async clickRowActionDelete(');
    expect(listPageSource).toContain('async readDeleteDialogText(');
    expect(listPageSource).toContain('async cancelDeleteDialog(');
    expect(listPageSource).toContain('async confirmDeleteDialog(');
    expect(listPageSource).toContain('async readSettledVisibleMessages(');
    expect(addToMenuPageSource).toContain('async selectTargetMenu(');
    expect(addToMenuPageSource).toContain('async save(');
    expect(itemFactorySource).toContain('async prepareComboRequiredOnly(');
    expect(itemFactorySource).toContain('async registerCreated(');
    expect(itemFactorySource).toContain("cleanupOrder: 10");
    expect(highDependencyFactorySource).toContain("entityKey === 'menu'");
    expect(highDependencyFactorySource).toContain("blockIdentity, block.id, 50");
  });
});
