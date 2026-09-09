import { productCenterContractModules } from '../../contracts/product-center/modules';
import { appConfig } from '../../test-data/env';
import type { AcceptanceRoute } from '../../utils/acceptance/acceptance-manifest';
import type { AcceptanceProject } from './acceptance-project';
import { merchantCenterAuthAdapter } from './merchant-center-auth.adapter';

const storeModules = productCenterContractModules.filter((module) => module.levelOne === '门店商品管理');

export const storeProductAcceptanceProject: AcceptanceProject = {
  manifest: {
    schemaVersion: '1.0.0',
    projectId: 'store-product',
    displayName: '门店商品管理',
    baseURL: appConfig.baseURL,
    markerPrefix: 'AUTO_AUDIT_',
    routes: routesForModules(storeModules),
  },
  apiHosts: ['api.balamxqa.com'],
  auth: merchantCenterAuthAdapter,
};

function routesForModules(
  modules: readonly { name: string; routes: readonly string[] }[],
): AcceptanceRoute[] {
  return [...new Map(
    modules.flatMap((module) => module.routes.map((route) => [
      route,
      { path: route, name: `${module.name} ${route}` },
    ] as const)),
  ).values()].sort((left, right) => left.path.localeCompare(right.path));
}

