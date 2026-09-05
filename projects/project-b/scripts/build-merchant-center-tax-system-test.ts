import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { compileSystemTestPlan, type SystemTestPlan } from '../automation/system-test/system-test-plan-compiler';
import {
  fingerprintSystemTestValue,
  type SystemTestAdapterCatalog,
  type SystemTestAdapterDefinition,
  type SystemTestDataProfile,
  type SystemTestManifest,
} from '../automation/system-test/system-test-contract';
import { appConfig } from '../test-data/env';

const rootDir = path.resolve(__dirname, '..');
const relativeRoot = 'systems/merchant-center-store-operations-tax';
const systemRoot = path.resolve(rootDir, relativeRoot);
const systemId = 'merchant-center-store-operations-tax';

const dataProfiles: Record<string, SystemTestDataProfile> = {
  'tax-reversible-edit': {
    mutationMode: 'reversible',
    seedAdapterId: 'store-operations.tax.seed',
    cleanupAdapterId: 'store-operations.tax.cleanup',
    apiResidueAdapterId: 'store-operations.tax.api-zero-residue',
    uiResidueAdapterId: 'store-operations.tax.ui-zero-residue',
    requiredOperationKeys: ['store-operations.tax-type.update'],
    probeAdapterIds: ['store-operations.tax.preflight'],
    externalCapabilities: [],
  },
};

const dependencyPaths = [
  'api/operation-client.ts',
  'api/product-center/cleanup-registry.ts',
  'api/product-center/execution-ledger.ts',
  'api/product-center/product-center-api.ts',
  'api/product-center/recovery-service.ts',
  'automation/system-test/system-test-recipe-executor.ts',
  'automation/system-test/system-test-semantic-governance.ts',
  'flows/auth.flow.ts',
  'flows/product-center/product-center-low-dependency-sop.flow.ts',
  'pages/product-center/product-center-low-dependency-sop.page.ts',
  'scripts/product-center-resume-cleanup.ts',
  'sop/product-center/product-center-low-dependency-sop.catalog.ts',
  'test-data/product-center/sop/product-center-low-dependency-data.factory.ts',
  'utils/wait.ts',
];

export function buildMerchantCenterTaxSystemTest(): { manifestPath: string; cases: number } {
  const plan = readJson<SystemTestPlan>(path.join(systemRoot, 'test-plan.json'));
  const compiled = compileSystemTestPlan({ plan, dataProfiles });
  if (compiled.errors.length > 0) throw new Error(compiled.errors.join('\n'));

  const setupPath = `${relativeRoot}/tests/setup.spec.ts`;
  const recoveryPath = `${relativeRoot}/tests/recovery.spec.ts`;
  const preflightPath = `${relativeRoot}/tests/preflight.spec.ts`;
  const systemSpecPath = `${relativeRoot}/tests/system.spec.ts`;
  const adapters: SystemTestAdapterCatalog = {
    schemaVersion: '1.0.0',
    systemId,
    adapters: [
      adapter('store-operations.auth.merchant-session', 'auth', ['read'], setupPath, [
        'flows/auth.flow.ts',
        'scripts/product-center-resume-cleanup.ts',
        'test-data/auth.ts',
        'test-data/env.ts',
        ...recoveryDependencies(),
      ]),
      adapter('store-operations.context.tax', 'context-guard', ['edit'], systemSpecPath, runtimeDependencies()),
      adapter('store-operations.recovery.tax-checkpoints', 'recovery', ['read'], recoveryPath, recoveryDependencies()),
      adapter('store-operations.tax.preflight', 'probe', ['edit'], preflightPath, ['api/product-center/product-center-api.ts', 'api/operation-client.ts']),
      adapter('store-operations.tax.seed', 'seed', ['edit'], systemSpecPath, runtimeDependencies()),
      adapter('store-operations.tax.ui-edit', 'capability', ['edit'], systemSpecPath, runtimeDependencies()),
      adapter('store-operations.tax.assert-api-edited', 'assertion', ['edit'], systemSpecPath, runtimeDependencies(), ['api']),
      adapter('store-operations.tax.assert-ui-edited', 'assertion', ['edit'], systemSpecPath, runtimeDependencies(), ['ui']),
      adapter('store-operations.tax.cleanup', 'cleanup', ['edit'], systemSpecPath, runtimeDependencies()),
      adapter('store-operations.tax.api-zero-residue', 'api-residue', ['edit'], systemSpecPath, runtimeDependencies()),
      adapter('store-operations.tax.ui-zero-residue', 'ui-residue', ['edit'], systemSpecPath, runtimeDependencies()),
    ],
    operationKeys: ['store-operations.tax-type.update'],
    externalCapabilities: [],
  };
  const manifest: SystemTestManifest = {
    schemaVersion: '1.0.0',
    system: {
      systemId,
      displayName: 'Merchant Center Store Operations - Tax Type',
      baseURL: appConfig.baseURL,
      markerPrefix: 'AUTO_AUDIT_TAX_SYSTEM',
      executionContext: plan.executionContext,
      portabilityScope: {
        applicationId: 'merchant-center',
        businessDomainId: 'store-operations',
        authenticationFamilyId: 'merchant-center-oauth-merchant-context',
        validationAuthority: 'target-system',
      },
    },
    sources: {
      recipeCollectionPath: `${relativeRoot}/recipes.json`,
      recipeCollectionFingerprint: compiled.recipeCollection.fingerprint,
      ruleLedgerPath: `${relativeRoot}/rules.json`,
      ruleLedgerFingerprint: compiled.ruleLedger.fingerprint,
      adapterCatalogPath: `${relativeRoot}/adapters.json`,
      adapterCatalogFingerprint: fingerprintSystemTestValue(adapters),
    },
    execution: {
      playwrightConfigPath: `${relativeRoot}/playwright.config.ts`,
      setupSpecPath: setupPath,
      setupProject: 'setup',
      recoverySpecPath: recoveryPath,
      recoveryProject: 'recovery',
      recoveryAdapterId: 'store-operations.recovery.tax-checkpoints',
      preflightSpecPath: preflightPath,
      specPath: systemSpecPath,
      project: 'system',
      workers: 1,
      retries: 0,
      authAdapterId: 'store-operations.auth.merchant-session',
    },
    dataProfiles,
    cases: compiled.bindings,
    policies: {
      stallMs: 180_000,
      maxRunMs: 900_000,
      maxConsecutiveFailures: 2,
      maxDuplicateFailureFingerprint: 2,
      minimumCompletedForFailureRate: 1,
      maximumEnvironmentFailureRate: 0.5,
      requireExplicitClaimReceipts: true,
      requireApiZeroResidue: true,
      requireUiZeroResidue: true,
      runtimeMayPromoteRuleToFormal: false,
      humanApprovalRequiredForFormal: true,
    },
  };

  writeJson(path.join(systemRoot, 'recipes.json'), compiled.recipeCollection);
  writeJson(path.join(systemRoot, 'rules.json'), compiled.ruleLedger);
  writeJson(path.join(systemRoot, 'adapters.json'), adapters);
  const manifestPath = path.join(systemRoot, 'manifest.json');
  writeJson(manifestPath, manifest);
  return { manifestPath, cases: compiled.bindings.length };
}

function adapter(
  id: string,
  kind: SystemTestAdapterDefinition['kind'],
  actions: SystemTestAdapterDefinition['actions'],
  implementationPath: string,
  dependencies: readonly string[],
  observationChannels?: SystemTestAdapterDefinition['observationChannels'],
): SystemTestAdapterDefinition {
  return {
    id,
    kind,
    actions,
    ...(observationChannels ? { observationChannels } : {}),
    implementation: {
      ...fingerprintFile(implementationPath),
      dependencies: [...new Set(dependencies)].sort().map(fingerprintFile),
    },
  };
}

function runtimeDependencies(): string[] {
  return dependencyPaths.filter((item) => item !== 'scripts/product-center-resume-cleanup.ts');
}

function recoveryDependencies(): string[] {
  return dependencyPaths.filter((item) => [
    'api/operation-client.ts',
    'api/product-center/execution-ledger.ts',
    'api/product-center/product-center-api.ts',
    'api/product-center/recovery-service.ts',
    'scripts/product-center-resume-cleanup.ts',
  ].includes(item));
}

function fingerprintFile(relativePath: string): { path: string; sha256: string } {
  const content = fs.readFileSync(path.resolve(rootDir, relativePath));
  return { path: relativePath.replaceAll(path.sep, '/'), sha256: createHash('sha256').update(content).digest('hex') };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  const result = buildMerchantCenterTaxSystemTest();
  process.stdout.write(`税率系统试点合同已生成：${result.cases} 条，${result.manifestPath}\n`);
}
