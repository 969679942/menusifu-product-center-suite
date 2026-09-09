export type RecipeAction = 'create' | 'edit' | 'delete' | 'negative' | 'boundary' | 'read';

export type RecipeValueBinding = {
  $ref: `$${string}`;
};

export type RecipeValue =
  | string
  | number
  | boolean
  | null
  | RecipeValueBinding
  | readonly RecipeValue[]
  | { readonly [key: string]: RecipeValue };

export type RecipeAdapterCall = {
  adapterId: string;
  input?: Record<string, RecipeValue>;
  claimIds?: string[];
};

export type RecipeCapabilityStep = {
  id: string;
  input?: Record<string, RecipeValue>;
  saveAs?: string;
};

export type RecipeCapabilityContract = {
  id: string;
  actions: readonly RecipeAction[];
  requiredInputs: readonly string[];
};

export type RecipeActionReadinessContract = {
  adapterId: string;
  input?: Record<string, RecipeValue>;
  status: 'observed' | 'confirmed';
  generationAllowed: true;
  sourceIds: string[];
  contractIds: string[];
  controlIds: string[];
  sequence: string[];
  terminalConditionIds: string[];
  operationKeys: string[];
  requiredIdentityKeys: string[];
  cleanupIdentityKeys: string[];
};

export type RecipeSemanticBindings = {
  testCaseIrId: string;
  obligationIds: string[];
  assertionContractIds: string[];
  factoryContractIds: string[];
  cleanupContractIds: string[];
};

export type RecipeExecutionPolicy = {
  mode: 'wave-shared-chain';
  caseLevelExecutionAllowed: false;
  waveId: string;
  orchestratorSpecPath: string;
  runtimeAcceptanceId: string;
};

export type AutomationRecipe = {
  schemaVersion: '1.0.0';
  id: string;
  caseId: string;
  title: string;
  tags: string[];
  route: `/${string}`;
  action: RecipeAction;
  traceabilityId: `trace:sop:${string}`;
  sourceIds: string[];
  provenanceFingerprint?: string;
  provenanceScope?: 'case-scoped-v1';
  claimIds?: string[];
  ruleIds?: string[];
  coverageIds: string[];
  generationAllowed: boolean;
  executionPolicy?: RecipeExecutionPolicy;
  seed?: RecipeAdapterCall;
  actionReadiness?: RecipeActionReadinessContract;
  contextGuards?: RecipeAdapterCall[];
  capabilities: RecipeCapabilityStep[];
  mutation?: {
    method: 'POST' | 'PUT' | 'DELETE';
    operationKey: string;
  };
  assertions: RecipeAdapterCall[];
  assertionContracts?: Array<{
    claimId: string;
    adapterId: string;
    observationChannel: 'ui' | 'api' | 'downstream' | 'cleanup';
    authority: 'user-visible' | 'persistence' | 'integration-terminal' | 'residue';
    terminalCondition: string;
    fieldId?: string;
    assertionSurfaceId?: string;
    feedback?: {
      mode: 'exact-message' | 'disabled-control' | 'confirmation-dialog';
      trigger: 'pre-submit' | 'submitted-operation';
      exactText?: string;
      operationKey?: string;
    };
    sourceIds: string[];
    contractIds: string[];
  }>;
  cleanup?: RecipeAdapterCall;
  semanticBindings?: RecipeSemanticBindings;
};
