export type ProductCenterCoreEntityKey =
  | 'category'
  | 'method'
  | 'material'
  | 'seasoning'
  | 'bom';

export type ProductCenterSopAction = 'edit' | 'delete';

export type ProductCenterSopDefinition = {
  entityKey: ProductCenterCoreEntityKey;
  entityName: string;
  route: string;
  listResponse: RegExp;
  testIdentityPrefix: `AUTO_AUDIT_${string}`;
};

export type ProductCenterSopCase = ProductCenterSopDefinition & {
  action: ProductCenterSopAction;
  seedMode: 'api';
  cleanupMode: 'api-finally';
  uiCreatesData: false;
  verifyServerState: true;
  verifyZeroResidue: true;
  forwardSteps: readonly string[];
  reverseSteps: readonly string[];
};
