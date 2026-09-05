import fs from 'node:fs';
import path from 'node:path';
import { test } from '../../fixtures/product-center.fixture';
import { createProductCenterSidebarNavigationPage } from '../../pages/product-center/product-center-sidebar-navigation.page';
import { appConfig } from '../../test-data/env';
import { collectProductCenterPageObservationEvidence } from '../../utils/product-center-remaining-scenario-execution';

const projectRoot = path.resolve(__dirname, '../..');
const outputPath = path.join(
  projectRoot,
  'deliverables/product-center-audit/remaining-scenarios/product-center-page-observation-evidence.json',
);

test.describe('商品中心剩余场景只读页面观测', () => {
  test('采集商品列表认证、路由、稳定态、控件和列表覆盖证据', async ({ page }, testInfo) => {
    const navigationPaths: string[] = [];
    const onNavigated = (frame: { url(): string }): void => {
      if (frame !== page.mainFrame()) return;
      try {
        navigationPaths.push(new URL(frame.url()).pathname);
      } catch {
        navigationPaths.push('/invalid');
      }
    };
    page.on('framenavigated', onNavigated);
    try {
      const navigation = await createProductCenterSidebarNavigationPage(page).openFromSidebar('/pp/brand/list');
      const evidence = await collectProductCenterPageObservationEvidence(page, {
        targetPath: '/pp/brand/list',
        sourceRefs: [
          'Merchant Center UITest/tests/generated/product-center-remaining-readonly-observation.generated.spec.ts',
          'Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
        ],
        redirectChain: [...new Set(navigationPaths)].slice(-20),
        routeGuardVerified: navigation.verifiedPaths.includes(navigation.arrivedPath),
        context: {
          authState: 'authenticated',
          environmentId: appConfig.environmentId,
          roleId: process.env.MC_ROLE_ID || null,
          tenantScope: process.env.MC_TENANT_SCOPE || null,
          locale: process.env.MC_LOCALE || null,
        },
        sampleCount: 3,
      });
      writeJsonAtomic(outputPath, evidence);
      await testInfo.attach('product-center-page-observation-evidence', {
        body: Buffer.from(JSON.stringify(evidence, null, 2)),
        contentType: 'application/json',
      });
    } finally {
      page.off('framenavigated', onNavigated);
    }
  });
});

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
