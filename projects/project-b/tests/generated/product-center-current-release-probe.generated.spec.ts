import interactionProbes from '../../contracts/product-center/drift/product-center-interaction-probes.json';
import mainRecipesDocument from '../../contracts/product-center/recipes/product-center-pilot-recipes.json';
import { test } from '../../fixtures/product-center.fixture';
import { ProductCenterSidebarNavigationPage } from '../../pages/product-center/product-center-sidebar-navigation.page';
import { appConfig } from '../../test-data/env';
import {
  collectProductCenterSettledBrowserContractSignals,
  collectProductCenterSettledBrowserReleaseEvidence,
} from '../../utils/product-center-release-evidence';
import { parseProductCenterLiveProbeRouteSelection } from '../../utils/product-center-live-probe';

const routes = [...new Set([
  ...interactionProbes.probes.map((probe) => probe.route),
  ...mainRecipesDocument.recipes.map((recipe) => recipe.route),
])].sort();
const selectedRoutes = parseProductCenterLiveProbeRouteSelection(
  process.env.PC_LIVE_RELEASE_PROBE_ROUTES,
  routes,
);

test.describe('商品中心当前版本轻量探针', () => {
  test.describe.configure({ mode: 'parallel', timeout: 240_000 });

  for (const route of selectedRoutes) {
    test(`应通过侧边栏采集当前页面版本与可见语义信号：${route}`, async ({ page }, testInfo) => {
      const navigationPage = new ProductCenterSidebarNavigationPage(page);
      const runId = process.env.PC_LIVE_RELEASE_PROBE_RUN_ID ?? 'LOCAL_RELEASE_PROBE';
      const navigation = await navigationPage.openFromSidebar(route as `/${string}`);
      const browserSignals = await collectProductCenterSettledBrowserContractSignals(page);
      const release = await collectProductCenterSettledBrowserReleaseEvidence(page, {
        environmentId: appConfig.environmentId,
        baseURL: appConfig.baseURL,
        runId,
      });
      const entry = {
        route,
        capabilityIds: ['navigation.sidebar.open'],
        navigation,
        release,
        browserSignals,
      };
      await testInfo.attach('product-center-live-release-probe', {
        body: Buffer.from(JSON.stringify({
          schemaVersion: '1.0.0',
          collectionId: 'product-center-live-release-probe',
          runId,
          observedAt: new Date().toISOString(),
          entries: [entry],
        })),
        contentType: 'application/json',
      });
    });
  }
});
