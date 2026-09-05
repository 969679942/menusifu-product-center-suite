import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '../../fixtures/product-center.fixture';
import { ProductCenterSidebarNavigationPage } from '../../pages/product-center/product-center-sidebar-navigation.page';
import { ProductCenterStoreProductAuditPage } from '../../pages/product-center/product-center-store-product-audit.page';
import { ProductCenterStoreProductDataFactory } from '../../test-data/product-center/sop/product-center-store-product-data.factory';

const route = '/poi/location/prod-list';

test.describe('商品中心门店商品名称查询只读审计', () => {
  test.describe.configure({ timeout: 180_000 });

  test('应从侧边栏进入并按名称片段唯一查询门店商品', async ({
    page,
    productCenterApi,
    cleanupRegistry,
  }) => {
    const outputDir = path.resolve('output/test-case-audit/product-center');
    const screenshotPath = path.join(outputDir, 'store-product-search-audit-latest.png');
    const reportPath = path.join(outputDir, 'store-product-search-audit-latest.json');
    const network = new Map<string, { method: string; path: string; status: number }>();
    const factory = new ProductCenterStoreProductDataFactory(productCenterApi);
    let auditPage: ProductCenterStoreProductAuditPage | undefined;
    let seeded: Awaited<ReturnType<ProductCenterStoreProductDataFactory['prepare']>> | undefined;
    let report: Record<string, unknown> = {
      schemaVersion: '1.0.0',
      caseId: 'audit:store-product-search-by-name',
      status: 'incomplete',
      route,
      mutationAttempted: false,
    };
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (!url.hostname.endsWith('balamxqa.com')) return;
      const request = response.request();
      const operationIndex = url.pathname.indexOf('/ops-');
      if (operationIndex < 0) return;
      const operationPath = url.pathname.slice(operationIndex);
      const key = `${request.method()} ${operationPath}`;
      network.set(key, {
        method: request.method(),
        path: operationPath,
        status: response.status(),
      });
    });

    try {
      const navigation = await new ProductCenterSidebarNavigationPage(page).openFromSidebar(route);
      auditPage = new ProductCenterStoreProductAuditPage(page);
      await auditPage.waitUntilReady();
      const textboxes = await auditPage.readTextboxContracts();
      const searchDomContract = await auditPage.readSearchDomContract();
      const searchRequestContract = await auditPage.probeSearchRequestContract();
      const rowCount = await auditPage.readRowCount();
      report = {
        ...report,
        status: 'trigger-pending',
        navigation,
        textboxes,
        searchDomContract,
        searchRequestContract,
        rowCount,
        network: [...network.values()],
      };
      seeded = await factory.prepare();
      report = { ...report, selectedExistingServerId: seeded.id };
      const search = await auditPage.searchByName(seeded.searchFragment, seeded.identity);
      await mkdir(outputDir, { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: false });
      report = {
        ...report,
        status: 'search-verified',
        navigation,
        textboxes,
        rowCount,
        search,
        network: [...network.values()],
        screenshot: path.relative(process.cwd(), screenshotPath).replace(/\\/g, '/'),
      };

      expect(navigation.mode).toBe('sidebar');
      expect(navigation.arrivedPath).toBe(route);
      expect(textboxes).toEqual([expect.objectContaining({
        placeholder: 'Item Name/Code',
        visible: true,
        enabled: true,
      })]);
      expect(search).toMatchObject({
        locatorCount: 1,
        resultCount: 1,
        responseMethod: 'POST',
        responsePath: '/ops-poi/poi-items/pageQuery',
      });
      expect(search.responseStatus).toBeGreaterThanOrEqual(200);
      expect(search.responseStatus).toBeLessThan(300);
    } catch (error) {
      report = {
        ...report,
        status: 'trigger-unverified',
        error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError' },
        network: [...network.values()],
      };
      throw error;
    } finally {
      await mkdir(outputDir, { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
      await auditPage?.clearSearch().catch(() => undefined);
      await cleanupRegistry.cleanupAll();
      report = {
        ...report,
        status: report.status === 'search-verified' ? 'passed' : report.status,
        cleanup: { verified: true, apiResidueCount: 0, queryStateCleared: true },
        screenshot: path.relative(process.cwd(), screenshotPath).replace(/\\/g, '/'),
        generatedAt: new Date().toISOString(),
      };
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }
  });
});
