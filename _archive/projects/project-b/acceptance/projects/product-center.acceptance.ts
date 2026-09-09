import { productCenterContractModules } from '../../contracts/product-center/modules';
import { appConfig } from '../../test-data/env';
import type { AcceptanceRoute } from '../../utils/acceptance/acceptance-manifest';
import type { AcceptanceProject } from './acceptance-project';
import { merchantCenterAuthAdapter } from './merchant-center-auth.adapter';

export const productCenterAcceptanceProject: AcceptanceProject = {
  manifest: {
    schemaVersion: '1.0.0',
    projectId: 'product-center',
    displayName: '商品中心',
    baseURL: appConfig.baseURL,
    markerPrefix: 'AUTO_AUDIT_',
    routes: routesForModules(productCenterContractModules),
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

