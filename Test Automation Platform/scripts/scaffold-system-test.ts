import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { AutomationRecipe } from '../src/automation/recipe/automation-recipe';
import { recipeCollectionFingerprint } from '../src/automation/recipe/recipe-validator';
import {
  fingerprintSystemTestValue,
  type SystemTestAdapterCatalog,
  type SystemTestManifest,
  type SystemTestRuleLedger,
} from '../src/automation/system-test/system-test-contract';
import { buildSystemTestContextGuards } from '../src/automation/system-test/system-test-governance';
import type { SystemTestPlan } from '../src/automation/system-test/system-test-plan-compiler';

export function scaffoldSystemTest(input: {
  rootDir?: string;
  platformRoot?: string;
  systemId: string;
  displayName?: string;
  baseURL: string;
  force?: boolean;
  relativeRoot?: string;
  portabilityScope?: NonNullable<SystemTestManifest['system']['portabilityScope']>;
}): { systemRoot: string; manifestPath: string } {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(input.systemId)) throw new Error(`系统 ID 无效：${input.systemId}`);
  const baseURL = new URL(input.baseURL);
  if (!['http:', 'https:'].includes(baseURL.protocol)) throw new Error(`基础地址协议无效：${baseURL.protocol}`);
  const rootDir = path.resolve(input.rootDir ?? process.env.SYSTEM_TEST_PROJECT_ROOT ?? process.cwd());
  const platformRoot = path.resolve(input.platformRoot ?? process.env.SYSTEM_TEST_PLATFORM_ROOT ?? path.resolve(__dirname, '..'));
  const relativeRoot = input.relativeRoot ?? `systems/${input.systemId}`;
  const systemRoot = path.join(rootDir, relativeRoot);
  if (fs.existsSync(systemRoot) && !input.force) throw new Error(`系统目录已存在：${systemRoot}`);
  fs.mkdirSync(path.join(systemRoot, 'tests'), { recursive: true });
  const claimId = 'CASE-SMOKE-001:expectation-1';
  const sourceId = 'scaffold:root-smoke';
  const routeContractId = 'route:root';
  const executionContext = {
    environmentId: 'scaffold-local',
    locale: 'en-US',
    roleId: 'public-session',
    tenantScope: 'public',
    featureFlagFingerprint: createHash('sha256').update('no-feature-flags').digest('hex'),
  };
  const recipe: AutomationRecipe = {
    schemaVersion: '1.0.0',
    id: `${input.systemId}:root:read`,
    caseId: 'CASE-SMOKE-001',
    title: '系统根页面应可访问',
    tags: ['@system-test', '@smoke'],
    route: '/',
    action: 'read',
    traceabilityId: `trace:sop:${input.systemId}:root`,
    sourceIds: [sourceId],
    provenanceFingerprint: createHash('sha256').update(`${sourceId}:${routeContractId}`).digest('hex'),
    claimIds: [claimId],
    coverageIds: ['coverage:route:root'],
    generationAllowed: true,
    contextGuards: buildSystemTestContextGuards({
      adapterId: 'system.context.root',
      phases: ['before-action', 'before-assertion'],
      route: '/',
      executionContext,
      businessIdentityStrategy: 'none',
    }),
    capabilities: [{ id: 'navigation.open-root' }],
    assertions: [{ adapterId: 'system.assert.root-visible', claimIds: [claimId] }],
    assertionContracts: [{
      claimId,
      adapterId: 'system.assert.root-visible',
      observationChannel: 'ui',
      authority: 'user-visible',
      terminalCondition: '页面主体在导航完成后保持可见',
      fieldId: 'page.body',
      assertionSurfaceId: 'ui.root-page',
      sourceIds: [sourceId],
      contractIds: [routeContractId],
    }],
  };
  const recipeCollection = {
    schemaVersion: '1.0.0',
    fingerprint: recipeCollectionFingerprint([recipe]),
    recipes: [recipe],
  };
  const ruleValues: SystemTestRuleLedger['rules'] = [{
    ruleId: 'RULE-SMOKE-001',
    caseId: 'CASE-SMOKE-001',
    status: 'provisional',
    outcomeClaims: [claimId],
    outcomes: ['系统根页面响应成功且页面主体可见'],
    formalPromotionAllowed: false,
  }];
  const rules: SystemTestRuleLedger = {
    schemaVersion: '1.0.0',
    fingerprint: fingerprintSystemTestValue(ruleValues),
    rules: ruleValues,
  };
  const testPlan: SystemTestPlan = {
    schemaVersion: '1.0.0',
    systemId: input.systemId,
    executionContext,
    sourceRegistry: {
      schemaVersion: '1.0.0',
      sources: [{
        sourceId,
        kind: 'formal-case',
        path: `${relativeRoot}/test-plan.json#CASE-SMOKE-001`,
        fingerprint: createHash('sha256').update('系统根页面应可访问').digest('hex'),
        verified: true,
        routes: ['/'],
        contractIds: [routeContractId],
        observationChannels: ['ui'],
      }],
    },
    governance: {
      schemaVersion: '1.0.0',
      semanticDuplicatePolicy: { enabled: true, requireVariantEvidence: true },
      assertionSurfaces: [{
        surfaceId: 'ui.root-page', observationChannel: 'ui', authority: 'user-visible',
        routes: ['/'], fieldIds: ['page.body'],
      }],
      contextGuardPolicy: {
        adapterId: 'system.context.root', phases: ['before-action', 'before-assertion'],
        requiredChecks: ['route', 'locale', 'role', 'tenant', 'business-identity'],
      },
      feedbackPolicy: {
        exactFeedbackRequiresRuntimeEvidence: true,
        mutationFeedbackRequiresOperationCorrelation: true,
      },
    },
    cases: [{
      caseId: 'CASE-SMOKE-001',
      ruleId: 'RULE-SMOKE-001',
      title: '系统根页面应可访问',
      sourceIds: [sourceId],
      route: '/',
      action: 'read',
      dataProfileId: 'root-read',
      coverageIds: ['coverage:route:root'],
      contractIds: [routeContractId],
      conditions: ['系统基础地址可访问'],
      actions: ['打开系统根页面'],
      expectations: [{
        expected: '系统根页面响应成功且页面主体可见',
        assertionAdapterId: 'system.assert.root-visible',
        observationChannel: 'ui',
        authority: 'user-visible',
        terminalCondition: '页面主体在导航完成后保持可见',
        fieldId: 'page.body',
        assertionSurfaceId: 'ui.root-page',
        sourceIds: [sourceId],
        contractIds: [routeContractId],
      }],
      capabilities: [{ id: 'navigation.open-root' }],
      semantics: {
        businessObjectId: 'system.root', scenarioFamilyId: 'availability', stateTransitionId: 'open-root',
        scopeId: 'public-root', variantId: 'default', variantSourceIds: [sourceId], businessIdentityStrategy: 'none',
      },
    }],
  };
  const configPath = path.join(systemRoot, 'playwright.config.ts');
  const setupPath = path.join(systemRoot, 'tests/setup.spec.ts');
  const preflightPath = path.join(systemRoot, 'tests/preflight.spec.ts');
  const systemSpecPath = path.join(systemRoot, 'tests/system.spec.ts');
  const executorImport = path.relative(
    path.dirname(systemSpecPath),
    path.join(platformRoot, 'src/automation/system-test/system-test-recipe-executor'),
  ).replaceAll(path.sep, '/');
  const normalizedExecutorImport = executorImport.startsWith('.') ? executorImport : `./${executorImport}`;
  writeText(configPath, playwrightConfig());
  writeText(setupPath, setupSpec());
  writeText(preflightPath, preflightSpec());
  writeText(systemSpecPath, systemSpec(claimId, normalizedExecutorImport));
  const implementation = (filePath: string) => ({
    path: path.relative(rootDir, filePath).replaceAll(path.sep, '/'),
    sha256: createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
  });
  const adapters: SystemTestAdapterCatalog = {
    schemaVersion: '1.0.0',
    systemId: input.systemId,
    adapters: [
      { id: 'system.auth.public-session', kind: 'auth', actions: ['read'], implementation: implementation(setupPath) },
      { id: 'system.context.root', kind: 'context-guard', actions: ['read'], implementation: implementation(systemSpecPath) },
      { id: 'system.probe.root', kind: 'probe', actions: ['read'], implementation: implementation(preflightPath) },
      { id: 'navigation.open-root', kind: 'capability', actions: ['read'], implementation: implementation(systemSpecPath) },
      {
        id: 'system.assert.root-visible', kind: 'assertion', actions: ['read'], observationChannels: ['ui'],
        implementation: implementation(systemSpecPath),
      },
    ],
    operationKeys: [],
    externalCapabilities: [],
  };
  const manifest: SystemTestManifest = {
    schemaVersion: '1.0.0',
    system: {
      systemId: input.systemId,
      displayName: input.displayName ?? input.systemId,
      baseURL: baseURL.toString().replace(/\/$/, ''),
      markerPrefix: `AUTO_AUDIT_${input.systemId.toUpperCase().replaceAll('-', '_')}`,
      executionContext: testPlan.executionContext,
      ...(input.portabilityScope ? { portabilityScope: input.portabilityScope } : {}),
    },
    sources: {
      recipeCollectionPath: `${relativeRoot}/recipes.json`,
      recipeCollectionFingerprint: recipeCollection.fingerprint,
      ruleLedgerPath: `${relativeRoot}/rules.json`,
      ruleLedgerFingerprint: rules.fingerprint,
      adapterCatalogPath: `${relativeRoot}/adapters.json`,
      adapterCatalogFingerprint: fingerprintSystemTestValue(adapters),
    },
    execution: {
      playwrightConfigPath: `${relativeRoot}/playwright.config.ts`,
      setupSpecPath: `${relativeRoot}/tests/setup.spec.ts`,
      setupProject: 'setup',
      preflightSpecPath: `${relativeRoot}/tests/preflight.spec.ts`,
      specPath: `${relativeRoot}/tests/system.spec.ts`,
      project: 'system',
      workers: 1,
      retries: 0,
      authAdapterId: 'system.auth.public-session',
    },
    dataProfiles: {
      'root-read': {
        mutationMode: 'none',
        requiredOperationKeys: [],
        probeAdapterIds: ['system.probe.root'],
        externalCapabilities: [],
      },
    },
    cases: [{ caseId: 'CASE-SMOKE-001', ruleId: 'RULE-SMOKE-001', recipeId: recipe.id, dataProfileId: 'root-read' }],
    policies: {
      stallMs: 180_000,
      maxRunMs: 900_000,
      maxConsecutiveFailures: 3,
      maxDuplicateFailureFingerprint: 2,
      minimumCompletedForFailureRate: 4,
      maximumEnvironmentFailureRate: 0.5,
      requireExplicitClaimReceipts: true,
      requireApiZeroResidue: true,
      requireUiZeroResidue: true,
      runtimeMayPromoteRuleToFormal: false,
      humanApprovalRequiredForFormal: true,
    },
  };
  writeJson(path.join(systemRoot, 'recipes.json'), recipeCollection);
  writeJson(path.join(systemRoot, 'rules.json'), rules);
  writeJson(path.join(systemRoot, 'adapters.json'), adapters);
  writeJson(path.join(systemRoot, 'test-plan.json'), testPlan);
  writeJson(path.join(systemRoot, 'manifest.json'), manifest);
  writeText(path.join(systemRoot, 'README.md'), readme(input.systemId));
  return { systemRoot, manifestPath: path.join(systemRoot, 'manifest.json') };
}

function playwrightConfig(): string {
  return `import { defineConfig } from '@playwright/test';\n\nexport default defineConfig({\n  testDir: './tests',\n  retries: 0,\n  workers: 1,\n  use: { baseURL: process.env.SYSTEM_TEST_BASE_URL },\n  projects: [\n    { name: 'setup', testMatch: /setup\\.spec\\.ts/ },\n    { name: 'system', testIgnore: /setup\\.spec\\.ts/ },\n  ],\n});\n`;
}

function setupSpec(): string {
  return `import { expect, test } from '@playwright/test';\n\ntest('建立系统会话', async ({ page }) => {\n  const response = await page.goto('/');\n  expect(response?.ok()).toBe(true);\n});\n`;
}

function preflightSpec(): string {
  return `import { expect, test } from '@playwright/test';\n\ntest('系统只读在线预检', async ({ page }) => {\n  const response = await page.goto('/');\n  expect(response?.ok()).toBe(true);\n  await expect(page.locator('body')).toBeVisible();\n});\n`;
}

function systemSpec(claimId: string, executorImport: string): string {
  const recipeImport = executorImport.replace('system-test-recipe-executor', '../recipe/automation-recipe');
  return [
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    "import { expect, test, type Page } from '@playwright/test';",
    `import type { AutomationRecipe } from '${recipeImport}';`,
    `import { executeSystemTestRecipe, type SystemTestRecipeContext } from '${executorImport}';`,
    '',
    "type RuntimeContext = SystemTestRecipeContext & { page: Page; responseStatus?: number; operationReceipts?: Array<{ operationKey: string; observed: boolean; method: string; status: 'passed'; responseStatus?: number }> };",
    "const collection = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../recipes.json'), 'utf8')) as { recipes: AutomationRecipe[] };",
    "const recipe = collection.recipes.find((item) => item.caseId === 'CASE-SMOKE-001');",
    "if (!recipe) throw new Error('CASE-SMOKE-001 recipe missing');",
    '',
    "test('系统根页面应可访问', {",
    "  tag: ['@case-CASE-SMOKE-001'],",
    "  annotation: [{ type: 'system-test-case-id', description: 'CASE-SMOKE-001' }],",
    '}, async ({ page }, testInfo) => {',
    '  const context = await executeSystemTestRecipe<RuntimeContext>(recipe, {',
    '    initialize: async () => ({ recipe, page, results: {}, assertionReceipts: [] }),',
    '    seed: async (_call, current) => current,',
    '    verifyContext: async (call, current, input) => {',
    "      if (call.adapterId !== 'system.context.root') throw new Error('Unknown context guard: ' + call.adapterId);",
    "      if (input.phase === 'before-assertion') expect(new URL(current.page.url()).pathname).toBe(input.expectedRoute);",
    "      expect(input.expectedLocale).toBe('en-US');",
    "      expect(input.expectedRoleId).toBe('public-session');",
    "      expect(input.expectedTenantScope).toBe('public');",
    '    },',
    '    executeCapability: async (capability, current) => {',
    "      if (capability.id !== 'navigation.open-root') throw new Error('Unknown capability: ' + capability.id);",
    "      const response = await current.page.goto('/');",
    '      current.responseStatus = response?.status();',
    "      current.operationReceipts = [{ operationKey: capability.id, observed: true, method: 'GET', status: 'passed', responseStatus: current.responseStatus }];",
    '      return { responseStatus: current.responseStatus };',
    '    },',
    '    assert: async (assertion, current) => {',
    "      if (assertion.adapterId !== 'system.assert.root-visible') throw new Error('Unknown assertion: ' + assertion.adapterId);",
    `      await expect(current.page.locator('body'), '${claimId}').toBeVisible();`,
    '    },',
    '    cleanup: async () => undefined,',
    '  });',
    "  await testInfo.attach('system-test-runtime-evidence', {",
    '    body: Buffer.from(JSON.stringify({',
    '      caseId: recipe.caseId,',
    '      assertionReceipts: context.assertionReceipts,',
    '      contextGuardReceipts: context.contextGuardReceipts,',
    '      operationReceipts: context.operationReceipts,',
    '      responseStatus: context.responseStatus,',
    '    })),',
    "    contentType: 'application/json',",
    '  });',
    '});',
    '',
  ].join('\n');
}

function readme(systemId: string): string {
  return `# ${systemId}\n\n- 方案编译：npm run compile:system-test-plan -- --plan=systems/${systemId}/test-plan.json --manifest=systems/${systemId}/manifest.json\n- 合同编译：npm run build:system-test -- --manifest=systems/${systemId}/manifest.json\n- 运行：npm run test:system -- --manifest=systems/${systemId}/manifest.json\n- 登录系统需替换 setup.spec.ts 和 auth adapter 声明。\n- CRUD 用例必须补充 seed、cleanup、API residue、UI residue adapter。\n`;
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

export function resolveSystemTestPortabilityScope(input: {
  applicationId?: string;
  businessDomainId?: string;
  authenticationFamilyId?: string;
  validationAuthority?: string;
}): NonNullable<SystemTestManifest['system']['portabilityScope']> | undefined {
  const values = [input.applicationId, input.businessDomainId, input.authenticationFamilyId, input.validationAuthority];
  const supplied = values.filter((item) => item !== undefined).length;
  if (supplied === 0) return undefined;
  if (supplied !== values.length || values.some((item) => !item?.trim())) {
    throw new Error('试点身份参数必须同时提供 application-id、business-domain-id、authentication-family-id 和 validation-authority');
  }
  if (input.validationAuthority !== 'target-system' && input.validationAuthority !== 'self-controlled-reference') {
    throw new Error('validation-authority 仅支持 target-system 或 self-controlled-reference');
  }
  return {
    applicationId: input.applicationId!.trim(),
    businessDomainId: input.businessDomainId!.trim(),
    authenticationFamilyId: input.authenticationFamilyId!.trim(),
    validationAuthority: input.validationAuthority,
  };
}

if (require.main === module) {
  const systemId = argument('system-id');
  const baseURL = argument('base-url');
  if (!systemId || !baseURL) throw new Error('用法：--system-id=<id> --base-url=<url>');
  const portabilityScope = resolveSystemTestPortabilityScope({
    applicationId: argument('application-id'),
    businessDomainId: argument('business-domain-id'),
    authenticationFamilyId: argument('authentication-family-id'),
    validationAuthority: argument('validation-authority'),
  });
  const result = scaffoldSystemTest({ systemId, baseURL, displayName: argument('display-name'), portabilityScope });
  process.stdout.write(`跨系统测试脚手架：${result.systemRoot}\n`);
}
