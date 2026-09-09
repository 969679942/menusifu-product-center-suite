export type ProductCenterContractCurationSource = {
  id: string;
  curations?: {
    overrides?: readonly ProductCenterModuleOverride[];
    additions?: readonly ProductCenterModuleAddition[];
    tombstones?: readonly ProductCenterModuleTombstone[];
  };
};

export type ProductCenterContractModule = ProductCenterContractCurationSource & {
  id: string;
  name: string;
  levelOne: '商品管理' | '菜单管理' | '门店商品管理';
  description: string;
  routes: readonly string[];
  entities: readonly string[];
  ruleModulePrefixes: readonly string[];
  requirementAliases: Readonly<Record<string, readonly string[]>>;
  routeAliases: Readonly<Record<string, readonly string[]>>;
  maintenance: {
    maintainer: 'codex';
    reviewer: 'human';
  };
};

type ProductCenterCollection =
  | 'routes' | 'controls' | 'fields' | 'dialogs' | 'validations' | 'apiOperations'
  | 'uiApiMappings' | 'businessRules' | 'testDataFactories' | 'cleanupAdapters'
  | 'assertions' | 'traceability' | 'unresolved';

export type ProductCenterModuleOverride = {
  collection: ProductCenterCollection;
  id: string;
  reason: string;
  source: { path: string; locator?: string };
  patch: Record<string, unknown>;
};

export type ProductCenterModuleAddition = {
  collection: ProductCenterCollection;
  record: Record<string, unknown> & { id: string };
};

export type ProductCenterModuleTombstone = {
  collection: ProductCenterCollection;
  id: string;
  reason: string;
  reviewedBy: string;
};
