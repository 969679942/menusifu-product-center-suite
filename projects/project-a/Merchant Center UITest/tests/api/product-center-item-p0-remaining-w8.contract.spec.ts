import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '../..');
const executorPath = path.join(
  projectRoot,
  'tests/generated/product-center-item-p0-remaining-w8.generated.spec.ts',
);

const caseIds = [
  'TC-ITEM-STD-067',
  'TC-ITEM-ADD-044',
  'TC-ITEM-PKG-039',
] as const;

test.describe('商品中心剩余 P0 W8 跨渠道合同', () => {
  test('W8 必须通过单一共享链覆盖三类商品停用、下发、恢复与门店终态', async () => {
    expect(fs.existsSync(executorPath)).toBe(true);
    const source = fs.readFileSync(executorPath, 'utf8');

    for (const caseId of caseIds) expect(source).toContain(`'${caseId}'`);
    expect(source).toContain("executionMode: 'wave-shared-chain'");
    expect(source).toContain('caseLevelRunsClaimed: 0');
    expect(source).toContain('seedCrossChannelScenario');
    expect(source).toContain('bindItemsToSharedMenu');
    expect(source).toContain('disableAllProducts');
    expect(source).toContain('publishSharedMenu');
    expect(source).toContain('waitForMenuSyncTerminal');
    expect(source).toContain('channelAbsentAfterDisable');
    expect(source).toContain('restoreAllProducts');
    expect(source).toContain('channelPresentAfterRestore');
    expect(source).toContain('readRequestLifecycleId');
    expect(source).toContain('apiStatusAfterLifecycle');
    expect(source).toContain('apiPageStatusAfterLifecycle');
    expect(source).toContain('lifecycleBoundaryDiagnostic');
    expect(source).toContain("'blocked-by-menu-reference'");
    expect(source).toContain("'BITEM-2013'");
    expect(source).toContain('publishSkippedDueToLifecycleConflict');
    expect(source).toContain('async function refreshLifecycleSearch(');
    expect(source).toContain('await refreshLifecycleSearch(list, item.originalIdentity)');
    expect(source).toContain('expectEmptySearchResults');
    expect(source).toContain('cleanupStoreProducts');
    expect(source).toContain('merchantCenterAndChannelResidueFree');
    expect(source).toContain('incompleteLedgerEntries === 0');
  });

  test('W8 API 能力必须使用 OpenAPI 已确认的菜单作业、门店与渠道查询字段', async () => {
    const apiSource = fs.readFileSync(
      path.join(projectRoot, 'api/product-center/product-center-api.ts'),
      'utf8',
    );

    expect(apiSource).toContain('async brandMerchantPage(');
    expect(apiSource).toContain('async createMenuSyncJob(');
    expect(apiSource).toContain('syncType: number');
    expect(apiSource).toContain('targetPois: readonly');
    expect(apiSource).toContain('async executeMenuSyncJob(');
    expect(apiSource).toContain('executeType: number');
    expect(apiSource).toContain('async menuSyncJobDetail(');
    expect(apiSource).toContain('async storePoiProductPage(');
    expect(apiSource).toContain('status?: 0 | 1');
    expect(apiSource).toContain('includeNoChannelItem?: boolean');
    expect(apiSource).toContain('async deleteStoreProduct(');
  });
});
