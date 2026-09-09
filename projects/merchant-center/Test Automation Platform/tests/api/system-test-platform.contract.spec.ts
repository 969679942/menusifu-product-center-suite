import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { AutomationRecipe, RecipeAdapterCall } from '../../src/automation/recipe/automation-recipe';
import { recipeCollectionFingerprint } from '../../src/automation/recipe/recipe-validator';
import {
  buildSystemTestEvidenceRuntimeFingerprint,
  compileSystemTestRunContract,
  fingerprintSystemTestValue,
  type SystemTestAdapterCatalog,
  type SystemTestManifest,
  type SystemTestRuleLedger,
} from '../../src/automation/system-test/system-test-contract';
import { validateSystemTestUniversalInvariants, universalInvariantNames } from '../../src/automation/system-test/system-test-universal-invariants';
import { executeSystemTestRecipe, type SystemTestRecipeContext } from '../../src/automation/system-test/system-test-recipe-executor';
import {
  evaluateSystemTestRuntimeEvidence,
  resolveSystemTestMutationObserved,
} from '../../src/automation/system-test/system-test-evidence';
import {
  arbitrateCaseState,
  isAcceptedSystemTestAssertionOutcome,
} from '../../src/automation/system-test/system-test-case-state-arbiter';
import { evaluateSystemTestCircuit } from '../../src/automation/system-test/system-test-circuit';
import { appendSystemTestProgress, readSystemTestProgress } from '../../src/automation/system-test/system-test-progress';
import {
  beginSystemTestRepairAttempt,
  completeSystemTestRepairAttempt,
  fingerprintSystemTestRepairDiagnosis,
  inspectSystemTestRepairAttemptState,
  reconcileOrphanedSystemTestRepairAttempts,
  readSystemTestRepairLedger,
} from '../../src/automation/system-test/system-test-repair-attempt-guard';
import {
  assertSystemTestExecutionGrant,
  issueSystemTestExecutionGrant,
  revokeSystemTestExecutionGrant,
} from '../../src/automation/system-test/system-test-execution-grant';
import {
  assertSystemTestExecutionCandidateUnchanged,
  buildSystemTestExecutionCandidate,
} from '../../src/automation/system-test/system-test-execution-candidate';
import {
  buildSystemTestDiagnosticWorkQueue,
  buildSystemTestFailureDiagnosticDocument,
  classifyDiagnosticNextAction,
} from '../../src/automation/system-test/system-test-diagnostics';
import { buildSystemTestArtifacts, selectSystemTestManifestCases } from '../../scripts/build-system-test-contract';
import { resolveSystemTestPortabilityScope, scaffoldSystemTest } from '../../scripts/scaffold-system-test';
import { compileSystemTestPlanFiles } from '../../scripts/compile-system-test-plan';
import {
  buildSystemTestCaseGrep,
  buildSystemTestImplementationFingerprint,
  resolveSystemTestBusinessReporterArgument,
  resolveSystemTestCaseIds,
} from '../../scripts/run-system-test';
import {
  compileSystemTestPlan,
  type SystemTestPlanCase,
} from '../../src/automation/system-test/system-test-plan-compiler';
import { matchesSystemTestRoute } from '../../src/automation/system-test/system-test-semantic-governance';
import { fingerprintSystemTestSemanticSource } from '../../src/automation/system-test/system-test-governance';
import {
  fingerprintRuntimeAuditableCase,
  fingerprintRuntimeAuditablePlan,
  type RuntimeAuditCorrectionDocument,
} from '../../src/utils/test-plan-runtime-audit-correction';
import {
  approveSystemTestFormalRule,
  buildSystemTestFormalReviewQueue,
  type SystemTestRuleEvidence,
} from '../../src/automation/system-test/system-test-rule-governance';
import { scanSystemTestArtifacts } from '../../src/automation/system-test/system-test-safety';
import {
  classifySystemTestFailure,
  classifySystemTestCircuit,
  classifySystemTestContractBlockers,
} from '../../src/automation/system-test/system-test-failure';
import {
  reconcileSystemTestRunState,
  writeSystemTestRunState,
  type SystemTestRunState,
} from '../../src/automation/system-test/system-test-run-state';
import { evaluateSystemTestPlatformReadiness } from '../../src/automation/system-test/system-test-platform-readiness';
import {
  discoverSystemTestPilotEvidence,
  hasCompleteReversibleCrudLifecycle,
} from '../../scripts/build-platform-readiness';
import { buildSystemTestReferenceBaseline } from '../../src/automation/system-test/system-test-reference-baseline';
import { fingerprintGovernance, reconcilePlatformReleaseFile } from '../../scripts/build-platform-review-queue';
import {
  assessSystemTestPlatformRelease,
  applySystemTestPlatformReviewDecision,
  buildSystemTestPlatformReviewQueue,
} from '../../src/automation/system-test/system-test-platform-review';
import {
  assertSystemTestFinalGoal,
  evaluateSystemTestFinalGoal,
} from '../../src/automation/system-test/system-test-final-goal-gate';

test.describe('跨系统测试平台合同', () => {
  test('标准执行实现指纹必须绑定适配器、证据运行时、执行配置和运行器', () => {
    const runnerPath = path.join(os.tmpdir(), `system-test-runner-${Date.now()}.ts`);
    fs.writeFileSync(runnerPath, 'runner-v1');
    try {
      const first = buildSystemTestImplementationFingerprint({
        adapters: 'a'.repeat(64), evidenceRuntime: 'b'.repeat(64), execution: { project: 'system' }, runnerPath,
      });
      const same = buildSystemTestImplementationFingerprint({
        adapters: 'a'.repeat(64), evidenceRuntime: 'b'.repeat(64), execution: { project: 'system' }, runnerPath,
      });
      fs.writeFileSync(runnerPath, 'runner-v2');
      const changed = buildSystemTestImplementationFingerprint({
        adapters: 'a'.repeat(64), evidenceRuntime: 'b'.repeat(64), execution: { project: 'system' }, runnerPath,
      });
      expect(first).toMatch(/^[a-f0-9]{64}$/);
      expect(same).toBe(first);
      expect(changed).not.toBe(first);
    } finally {
      fs.rmSync(runnerPath, { force: true });
    }
  });

  test('最终目标门禁必须拒绝只有跨方案而没有跨应用试点的局部完成', () => {
    const readiness = evaluateSystemTestPlatformReadiness({
      referenceBaseline: {
        applicationId: 'reference-app', businessDomainId: 'catalog', planned: 1,
        executionEligible: 1, classifiedExclusions: 0, classifiedBlockers: 0,
        executed: 1, passed: 1, failed: 0, automationGap: 0,
        evidenceVerified: 1, evidenceMissing: 0, evidenceCoverageFingerprint: 'evidence',
        responsibilityBreakdown: { passed: 1 }, responsibilityClassified: true, apiUiZeroResidue: true,
      },
      pilots: [{
        pilotId: 'same-app-other-plan', applicationId: 'reference-app', businessDomainId: 'orders',
        authenticationFamilyId: 'session', validationAuthority: 'target-system', authenticated: true,
        reversibleCrud: true, runtimePassed: true, evidenceComplete: true, apiUiZeroResidue: true,
        securityFindings: 0,
      }],
    });
    expect(evaluateSystemTestFinalGoal(readiness)).toMatchObject({
      scope: 'platform-universal-completion', status: 'incomplete', moduleDeliveryBlocked: false,
      commonPlatformReady: true, crossPlanReady: true, crossSystemReady: false,
      blockers: ['CROSS_APPLICATION_PILOT_REQUIRED'],
    });
    expect(() => assertSystemTestFinalGoal(readiness)).toThrow('FINAL_GOAL_NOT_MET:CROSS_APPLICATION_PILOT_REQUIRED');
  });

  test('最终目标门禁只有在跨方案和跨应用试点均合格时才完成', () => {
    const baseline = {
      applicationId: 'reference-app', businessDomainId: 'catalog', planned: 1,
      executionEligible: 1, classifiedExclusions: 0, classifiedBlockers: 0,
      executed: 1, passed: 1, failed: 0, automationGap: 0,
      evidenceVerified: 1, evidenceMissing: 0, evidenceCoverageFingerprint: 'evidence',
      responsibilityBreakdown: { passed: 1 }, responsibilityClassified: true, apiUiZeroResidue: true,
    };
    const qualifiedPilot = {
      authenticationFamilyId: 'session', validationAuthority: 'target-system' as const, authenticated: true,
      reversibleCrud: true, runtimePassed: true, evidenceComplete: true, apiUiZeroResidue: true,
      securityFindings: 0,
    };
    const readiness = evaluateSystemTestPlatformReadiness({
      referenceBaseline: baseline,
      pilots: [
        { ...qualifiedPilot, pilotId: 'cross-plan', applicationId: 'reference-app', businessDomainId: 'orders' },
        { ...qualifiedPilot, pilotId: 'cross-system', applicationId: 'another-app', businessDomainId: 'billing' },
      ],
    });
    expect(evaluateSystemTestFinalGoal(readiness)).toMatchObject({
      scope: 'platform-universal-completion', status: 'complete', moduleDeliveryBlocked: false,
      commonPlatformReady: true, crossPlanReady: true, crossSystemReady: true, blockers: [],
    });
    expect(() => assertSystemTestFinalGoal(readiness)).not.toThrow();
  });

  test('缺少公共实现或领域适配器时跨应用试点也不得宣称完成', () => {
    const baseline = {
      applicationId: 'reference-app', businessDomainId: 'catalog', planned: 1,
      executionEligible: 1, classifiedExclusions: 0, classifiedBlockers: 0, executed: 1,
      passed: 1, failed: 0, automationGap: 0, evidenceVerified: 1, evidenceMissing: 0,
      evidenceCoverageFingerprint: 'coverage', responsibilityBreakdown: { passed: 1 },
      responsibilityClassified: true, apiUiZeroResidue: true,
    };
    const pilot = {
      authenticationFamilyId: 'session', validationAuthority: 'target-system' as const,
      authenticated: true, reversibleCrud: true, runtimePassed: true, evidenceComplete: true,
      apiUiZeroResidue: true, securityFindings: 0,
    };
    const readiness = evaluateSystemTestPlatformReadiness({
      referenceBaseline: baseline,
      commonImplementationReady: false,
      adapterImplementationReady: false,
      pilots: [
        { ...pilot, pilotId: 'cross-plan', applicationId: 'reference-app', businessDomainId: 'orders' },
        { ...pilot, pilotId: 'cross-system', applicationId: 'another-app', businessDomainId: 'billing' },
      ],
    });
    expect(evaluateSystemTestFinalGoal(readiness)).toMatchObject({
      status: 'incomplete', moduleDeliveryBlocked: false,
      commonImplementationReady: false, adapterImplementationReady: false,
      blockers: ['COMMON_IMPLEMENTATION_REQUIRED', 'DOMAIN_ADAPTER_REQUIRED'],
    });
  });

  test('状态裁决必须使旧缺陷在自动化实现变化后失效', () => {
    const result = arbitrateCaseState({
      disposition: 'product-defect',
      currentCaseFingerprint: 'case-v1',
      currentImplementationFingerprint: 'implementation-v2',
      implementationFingerprintRequired: true,
      receipts: [],
      productDefect: {
        caseFingerprint: 'case-v1',
        implementationFingerprint: 'implementation-v1',
        evidenceStatus: 'complete',
        evidencePath: 'evidence/failed.json',
        recordedAt: '2026-08-20T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ status: 'ready', staleProductDefect: true });
  });

  test('历史通过摘要不得替代当前实现标准收据', () => {
    const result = arbitrateCaseState({
      disposition: 'ready',
      currentCaseFingerprint: 'case-v1',
      currentImplementationFingerprint: 'implementation-v2',
      implementationFingerprintRequired: true,
      receipts: [],
      historicalRuntimeStatus: 'runtime-passed',
    });
    expect(result.status).toBe('ready');
    expect(result.reason).toContain('历史 runtime-passed');
  });

  test('逐条整改已处理结果不得被旧失败记录重新推回执行队列', () => {
    const result = arbitrateCaseState({
      disposition: 'ready',
      currentCaseFingerprint: 'case-v1',
      currentImplementationFingerprint: 'implementation-v2',
      implementationFingerprintRequired: true,
      receipts: [{
        caseFingerprint: 'case-v1', implementationFingerprint: null,
        status: 'failed', evidenceStatus: 'incomplete', recordedAt: '2026-08-20T00:00:00.000Z',
      }],
      handledOutcome: {
        status: 'handled',
        source: 'remediation-batch',
        evidenceStatus: 'complete',
        evidencePath: 'output/remediation.json',
        verificationStatus: 'legacy-verified',
      },
    });
    expect(result).toMatchObject({
      status: 'handled',
      handlingStatus: 'handled',
      verificationStatus: 'legacy-verified',
      actionRequired: false,
    });
  });

  test('当前实现完整通过收据必须覆盖更早旧缺陷', () => {
    const result = arbitrateCaseState({
      disposition: 'product-defect',
      currentCaseFingerprint: 'case-v1',
      currentImplementationFingerprint: 'implementation-v2',
      implementationFingerprintRequired: true,
      receipts: [{
        caseFingerprint: 'case-v1', implementationFingerprint: 'implementation-v2',
        status: 'passed', evidenceStatus: 'complete', recordedAt: '2026-08-21T00:00:00.000Z',
        assertionStatuses: ['verified'],
      }],
      productDefect: {
        caseFingerprint: 'case-v1', implementationFingerprint: 'implementation-v1',
        evidenceStatus: 'complete', evidencePath: 'evidence/old-failure.json',
        recordedAt: '2026-08-20T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ status: 'passed', staleProductDefect: true });
  });

  test('断言已观察到不匹配时完整收据也不得仲裁为通过', () => {
    expect(isAcceptedSystemTestAssertionOutcome(['verified', 'observed-mismatch'])).toBe(false);
    const result = arbitrateCaseState({
      disposition: 'ready',
      currentCaseFingerprint: 'case-v1',
      currentImplementationFingerprint: 'implementation-v1',
      implementationFingerprintRequired: true,
      receipts: [{
        caseFingerprint: 'case-v1', implementationFingerprint: 'implementation-v1',
        status: 'passed', evidenceStatus: 'complete', recordedAt: '2026-08-24T00:00:00.000Z',
        assertionStatuses: ['observed-mismatch'],
      }],
    });
    expect(result.status).toBe('ready');
  });

  test('当前实现中晚于通过收据的完整缺陷证据必须重新阻断', () => {
    const result = arbitrateCaseState({
      disposition: 'product-defect',
      currentCaseFingerprint: 'case-v1',
      currentImplementationFingerprint: 'implementation-v2',
      implementationFingerprintRequired: true,
      receipts: [{
        caseFingerprint: 'case-v1', implementationFingerprint: 'implementation-v2',
        status: 'passed', evidenceStatus: 'complete', recordedAt: '2026-08-20T00:00:00.000Z',
      }],
      productDefect: {
        caseFingerprint: 'case-v1', implementationFingerprint: 'implementation-v2',
        evidenceStatus: 'complete', evidencePath: 'evidence/current-failure.json',
        recordedAt: '2026-08-21T00:00:00.000Z',
      },
    });
    expect(result.status).toBe('product-defect');
  });

  test('脚手架应生成可编译的只读系统且不依赖项目合同', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-platform-'));
    try {
      const scaffold = scaffoldSystemTest({ rootDir, systemId: 'reference-system', baseURL: 'http://127.0.0.1:18080' });
      const compiledPlan = compileSystemTestPlanFiles({
        rootDir,
        planPath: path.relative(rootDir, path.join(scaffold.systemRoot, 'test-plan.json')),
        manifestPath: path.relative(rootDir, scaffold.manifestPath),
      });
      const artifacts = buildSystemTestArtifacts({
        rootDir,
        manifestPath: path.relative(rootDir, scaffold.manifestPath),
        outputDir: path.join(rootDir, 'output'),
      });
      expect(artifacts.errors).toEqual([]);
      expect(compiledPlan.cases).toBe(1);
      expect(artifacts.onboarding).toMatchObject({ status: 'read-only-ready', contractReady: true, readOnlyReady: true });
      expect(JSON.stringify(artifacts.contract)).not.toContain('domain-specific-policy');
      expect(fs.readFileSync(path.join(scaffold.systemRoot, 'tests/system.spec.ts'), 'utf8'))
        .toContain("tag: ['@case-CASE-SMOKE-001']");
      expect(fs.readFileSync(path.join(scaffold.systemRoot, 'tests/system.spec.ts'), 'utf8'))
        .toContain('executeSystemTestRecipe');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('脚手架必须把计划执行上下文完整写入两个上下文守卫', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-context-guards-'));
    try {
      const scaffold = scaffoldSystemTest({ rootDir, systemId: 'context-reference-system', baseURL: 'http://127.0.0.1:18084' });
      const plan = JSON.parse(fs.readFileSync(path.join(scaffold.systemRoot, 'test-plan.json'), 'utf8')) as any;
      const recipes = JSON.parse(fs.readFileSync(path.join(scaffold.systemRoot, 'recipes.json'), 'utf8')) as { recipes: any[] };
      const guards = recipes.recipes[0].contextGuards;
      expect(guards).toHaveLength(2);
      expect(guards).toEqual(expect.arrayContaining([
        expect.objectContaining({
          input: expect.objectContaining({
            phase: 'before-action', expectedRoute: '/', expectedLocale: plan.executionContext.locale,
            expectedRoleId: plan.executionContext.roleId, expectedTenantScope: plan.executionContext.tenantScope,
            businessIdentityStrategy: 'none',
          }),
        }),
        expect.objectContaining({
          input: expect.objectContaining({
            phase: 'before-assertion', expectedRoute: '/', expectedLocale: plan.executionContext.locale,
            expectedRoleId: plan.executionContext.roleId, expectedTenantScope: plan.executionContext.tenantScope,
            businessIdentityStrategy: 'none',
          }),
        }),
      ]));
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('执行选择应只派生新建或变化的可执行绑定并拒绝与旧首批白名单并存', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-execution-selection-'));
    try {
      const scaffold = scaffoldSystemTest({
        rootDir,
        systemId: 'selection-reference-system',
        baseURL: 'http://127.0.0.1:18082',
      });
      const planPath = path.join(scaffold.systemRoot, 'test-plan.json');
      const plan = JSON.parse(fs.readFileSync(planPath, 'utf8')) as any;
      const manifest = JSON.parse(fs.readFileSync(scaffold.manifestPath, 'utf8')) as any;
      fs.rmSync(path.resolve(rootDir, manifest.sources.recipeCollectionPath), { force: true });
      delete plan.initialExecutionCaseIds;
      plan.executionSelection = { strategy: 'new-or-changed-executable-bindings' };
      fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

      const compiled = compileSystemTestPlanFiles({
        rootDir,
        planPath: path.relative(rootDir, planPath),
        manifestPath: path.relative(rootDir, scaffold.manifestPath),
      });
      const selection = JSON.parse(fs.readFileSync(compiled.executionSelectionPath, 'utf8')) as any;
      expect(selection).toMatchObject({
        reason: 'evidence-driven-new-or-changed-bindings',
        strategy: 'new-or-changed-executable-bindings',
        selectedCaseIds: ['CASE-SMOKE-001'],
      });

      plan.initialExecutionCaseIds = ['CASE-SMOKE-001'];
      fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
      expect(() => compileSystemTestPlanFiles({
        rootDir,
        planPath: path.relative(rootDir, planPath),
        manifestPath: path.relative(rootDir, scaffold.manifestPath),
      })).toThrow('EXECUTION_SELECTION_LEGACY_FIELD_FORBIDDEN');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('用例级来源证明指纹单独漂移不得扩大增量执行范围', async () => {
    const { recipeRequiresExecution } = await import('../../scripts/compile-system-test-plan.js');
    const previous = {
      caseId: 'CASE-001',
      title: '保存后列表展示规范化名称',
      action: 'boundary',
      provenanceScope: 'case-scoped-v1',
      provenanceFingerprint: 'old-source-fingerprint',
    };
    const current = {
      ...previous,
      provenanceFingerprint: 'new-source-fingerprint',
    };
    expect(recipeRequiresExecution(previous, current)).toBe(false);
    expect(recipeRequiresExecution(previous, { ...current, action: 'read' })).toBe(true);
  });

  test('适配器实现漂移只选择实际引用该适配器的用例', async () => {
    const { recipeUsesAnyAdapter, resolveChangedAdapterIds } = await import('../../scripts/compile-system-test-plan.js');
    const previous = { schemaVersion: '1.0.0' as const, adapters: {
      'page.list': fingerprintSystemTestValue({ path: 'list.ts', sha256: 'old' }),
      'page.detail': fingerprintSystemTestValue({ path: 'detail.ts', sha256: 'same' }),
    } };
    const current = {
      schemaVersion: '1.0.0' as const,
      systemId: 'example',
      adapters: [
        { id: 'page.list', kind: 'capability' as const, actions: ['read' as const], implementation: { path: 'list.ts', sha256: 'new' } },
        { id: 'page.detail', kind: 'capability' as const, actions: ['read' as const], implementation: { path: 'detail.ts', sha256: 'same' } },
      ],
      operationKeys: [], externalCapabilities: [],
    };
    const changed = resolveChangedAdapterIds(previous, current);
    expect([...changed]).toEqual(['page.list']);
    expect(recipeUsesAnyAdapter({ capabilities: [{ id: 'page.list' }] }, changed)).toBe(true);
    expect(recipeUsesAnyAdapter({ capabilities: [{ id: 'page.detail' }] }, changed)).toBe(false);
  });

  test('四项通用不变量必须跨方案生效：选择、认证上下文、证据权限、清理账本', () => {
    expect(universalInvariantNames()).toEqual([
      'execution-selection',
      'auth-context',
      'evidence-authority',
      'cleanup-ledger',
    ]);
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-universal-invariants-'));
    try {
      const scaffold = scaffoldSystemTest({
        rootDir,
        systemId: 'universal-invariant-reference',
        baseURL: 'http://127.0.0.1:18083',
      });
      const manifest = JSON.parse(fs.readFileSync(scaffold.manifestPath, 'utf8')) as SystemTestManifest;
      const recipes = JSON.parse(fs.readFileSync(path.resolve(rootDir, manifest.sources.recipeCollectionPath), 'utf8')) as { recipes: AutomationRecipe[] };
      const rules = JSON.parse(fs.readFileSync(path.resolve(rootDir, manifest.sources.ruleLedgerPath), 'utf8')) as SystemTestRuleLedger;
      const adapters = JSON.parse(fs.readFileSync(path.resolve(rootDir, manifest.sources.adapterCatalogPath), 'utf8')) as SystemTestAdapterCatalog;
      expect(validateSystemTestUniversalInvariants({ manifest, recipes: recipes.recipes, rules, adapters })).toEqual([]);

      const badEvidence = structuredClone(recipes.recipes);
      badEvidence[0].assertionContracts![0].authority = 'persistence';
      expect(validateSystemTestUniversalInvariants({ manifest, recipes: badEvidence, rules, adapters }))
        .toContain('CASE-SMOKE-001:UNIVERSAL_UI_AUTHORITY_INVALID:CASE-SMOKE-001:expectation-1');

      const badContext = structuredClone(recipes.recipes);
      badContext[0].contextGuards = badContext[0].contextGuards?.filter((guard) => guard.input?.phase !== 'before-assertion');
      expect(validateSystemTestUniversalInvariants({ manifest, recipes: badContext, rules, adapters }))
        .toContain('CASE-SMOKE-001:UNIVERSAL_CONTEXT_GUARD_REQUIRED:before-assertion');

      const missingContextInput = structuredClone(recipes.recipes);
      delete missingContextInput[0].contextGuards![0]!.input!.expectedLocale;
      expect(validateSystemTestUniversalInvariants({ manifest, recipes: missingContextInput, rules, adapters }))
        .toContain('CASE-SMOKE-001:UNIVERSAL_CONTEXT_GUARD_INPUT_INVALID:before-action:expectedLocale');

      const badCleanup = structuredClone(manifest);
      const profile = badCleanup.dataProfiles[badCleanup.cases[0].dataProfileId];
      profile.mutationMode = 'reversible';
      profile.seedAdapterId = 'system.seed';
      profile.cleanupAdapterId = 'system.cleanup';
      profile.apiResidueAdapterId = 'system.api-residue';
      profile.uiResidueAdapterId = undefined;
      profile.requiredOperationKeys = ['system:PUT /resource/{id}'];
      const reversibleRecipe = structuredClone(recipes.recipes);
      reversibleRecipe[0].mutation = { method: 'PUT', operationKey: 'system:PUT /resource/{id}' };
      expect(validateSystemTestUniversalInvariants({ manifest: badCleanup, recipes: reversibleRecipe, rules, adapters }))
        .toContain('CASE-SMOKE-001:UNIVERSAL_UI_RESIDUE_ADAPTER_REQUIRED');

      const badRetry = structuredClone(manifest);
      (badRetry.execution as { retries: number }).retries = 1;
      expect(validateSystemTestUniversalInvariants({ manifest: badRetry, recipes: recipes.recipes, rules, adapters }))
        .toContain('UNIVERSAL_NON_IDEMPOTENT_RETRY_FORBIDDEN');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('审计证据语义未变化时，时间戳和文件哈希不得触发全量重验', () => {
    const first = {
      generatedAt: '2026-08-24T01:00:00.000Z',
      evidence: [{ observedAt: '2026-08-24T01:00:00.000Z', sha256: 'first', route: '/resource' }],
      contract: { fields: ['name'], fingerprint: 'generated-first' },
    };
    const second = {
      generatedAt: '2026-08-24T02:00:00.000Z',
      evidence: [{ observedAt: '2026-08-24T02:00:00.000Z', sha256: 'second', route: '/resource' }],
      contract: { fields: ['name'], fingerprint: 'generated-second' },
    };
    expect(fingerprintSystemTestSemanticSource(second)).toBe(fingerprintSystemTestSemanticSource(first));
    expect(fingerprintSystemTestSemanticSource({ ...second, contract: { fields: ['name', 'price'] } }))
      .not.toBe(fingerprintSystemTestSemanticSource(first));
  });

  test('新增无关来源或断言面不得改变既有用例 Recipe 指纹', () => {
    const plan = governedReadPlan();
    const dataProfiles = { read: { mutationMode: 'none' as const, requiredOperationKeys: [], probeAdapterIds: [], externalCapabilities: [] } };
    const first = compileSystemTestPlan({ plan, dataProfiles });
    expect(first.errors).toEqual([]);
    plan.sourceRegistry.sources.push({
      sourceId: 'audit:unrelated', kind: 'ui-audit', path: 'unrelated.json', fingerprint: 'b'.repeat(64),
      verified: true, routes: ['/unrelated'], contractIds: ['unrelated:contract'], observationChannels: ['ui'],
    });
    plan.governance!.assertionSurfaces.push({
      surfaceId: 'ui.unrelated', observationChannel: 'ui', authority: 'user-visible',
      routes: ['/unrelated'], fieldIds: ['unrelated.field'],
    });
    const second = compileSystemTestPlan({ plan, dataProfiles });
    expect(second.errors).toEqual([]);
    expect(second.recipeCollection.recipes[0].provenanceFingerprint)
      .toBe(first.recipeCollection.recipes[0].provenanceFingerprint);
  });

  test('路径型运行时审计只加载一个来源，不应被编译器判定为双来源', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-runtime-audit-path-'));
    try {
      const scaffold = scaffoldSystemTest({ rootDir, systemId: 'runtime-audit-path-system', baseURL: 'http://127.0.0.1:18081' });
      const planPath = path.join(scaffold.systemRoot, 'test-plan.json');
      const manifestPath = scaffold.manifestPath;
      const plan = JSON.parse(fs.readFileSync(planPath, 'utf8')) as any;
      const auditableCases = plan.cases.map((item: any) => ({
        caseId: item.caseId,
        title: item.title,
        preconditions: item.conditions,
        actions: item.actions,
        expectedResults: item.expectations.map((expectation: any) => expectation.expected),
        route: item.route,
        sourceIds: item.sourceIds,
        coverageIds: item.coverageIds,
        capabilityIds: item.capabilities.map((capability: any) => capability.id),
        assertionAdapterIds: item.expectations.map((expectation: any) => expectation.assertionAdapterId),
      }));
      const audit = {
        schemaVersion: '2.0.0',
        collectionId: 'runtime-audit-path-system',
        planId: plan.systemId,
        generatedAt: new Date().toISOString(),
        planFingerprint: fingerprintRuntimeAuditablePlan(auditableCases),
        context: { applicationVersionFingerprint: 'unavailable', environmentId: 'test', roleId: 'operator', locale: 'zh-CN', maxEvidenceAgeDays: 7 },
        evidenceDiscovery: { rootPaths: [], extensions: ['.json'], strict: true },
        evidenceInventory: [],
        coverageInventory: [],
        corrections: [],
      } satisfies RuntimeAuditCorrectionDocument;
      const auditPath = path.join(scaffold.systemRoot, 'runtime-audit.json');
      fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
      plan.runtimeAuditPath = path.relative(rootDir, auditPath).replace(/\\/g, '/');
      delete plan.runtimeAudit;
      fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

      const compiled = compileSystemTestPlanFiles({
        rootDir,
        planPath: path.relative(rootDir, planPath),
        manifestPath: path.relative(rootDir, manifestPath),
      });
      expect(compiled.cases).toBe(1);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('新系统脚手架必须原子接收完整试点身份且拒绝半套参数', () => {
    expect(() => resolveSystemTestPortabilityScope({ applicationId: 'another-app' }))
      .toThrow('试点身份参数必须同时提供');
    expect(() => resolveSystemTestPortabilityScope({
      applicationId: 'another-app', businessDomainId: 'orders',
      authenticationFamilyId: 'another-session', validationAuthority: 'untrusted',
    })).toThrow('validation-authority 仅支持');
    const scope = resolveSystemTestPortabilityScope({
      applicationId: 'another-app', businessDomainId: 'orders',
      authenticationFamilyId: 'another-session', validationAuthority: 'target-system',
    });
    expect(scope).toEqual({
      applicationId: 'another-app', businessDomainId: 'orders',
      authenticationFamilyId: 'another-session', validationAuthority: 'target-system',
    });
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-scaffold-scope-'));
    try {
      const scaffold = scaffoldSystemTest({
        rootDir, systemId: 'another-app', baseURL: 'https://example.test', portabilityScope: scope,
      });
      const manifest = JSON.parse(fs.readFileSync(scaffold.manifestPath, 'utf8')) as SystemTestManifest;
      expect(manifest.system.portabilityScope).toEqual(scope);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('预期 Claim 未唯一绑定 assertion adapter 时必须在浏览器前阻断', () => {
    const fixture = createFixture();
    fixture.recipe.assertions[0].claimIds = [];
    fixture.recipeFingerprint = recipeCollectionFingerprint([fixture.recipe]);
    fixture.manifest.sources.recipeCollectionFingerprint = fixture.recipeFingerprint;
    const result = compileSystemTestRunContract({
      rootDir: fixture.rootDir,
      manifest: fixture.manifest,
      recipes: [fixture.recipe],
      recipeCollectionFingerprint: fixture.recipeFingerprint,
      rules: fixture.rules,
      adapters: fixture.adapters,
    });
    expect(result.errors).toContain('CASE-001:CLAIM_ASSERTION_MISSING:CASE-001:expectation-1');
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  test('通用 Recipe 只在 assertion adapter 成功后生成 Claim 收据并始终清理', async () => {
    const fixture = createFixture();
    const recipe: AutomationRecipe = {
      ...fixture.recipe,
      action: 'edit',
      seed: { adapterId: 'system.seed' },
      mutation: { method: 'PUT', operationKey: 'entity.update' },
      cleanup: { adapterId: 'system.cleanup' },
    };
    const context: SystemTestRecipeContext = { recipe, results: {}, assertionReceipts: [] };
    let cleaned = false;
    const grant = issueSystemTestExecutionGrant({
      rootDir: path.resolve(__dirname, '../..'),
      applicationId: 'contract-test',
      runId: 'recipe-contract-test',
      caseIds: [recipe.caseId],
      ttlMs: 60_000,
      candidateFingerprint: 'a'.repeat(64),
    });
    const previousGrantEnv = captureGrantEnv();
    Object.assign(process.env, grant.env);
    try {
    const result = await executeSystemTestRecipe(recipe, {
      initialize: async () => context,
      seed: async (_call, current) => current,
      verifyContext: async () => undefined,
      executeCapability: async () => ({ visible: true }),
      assert: async () => undefined,
      reportStep: async (_step, action, evidence) => {
        try {
          const value = await action();
          await evidence?.('passed');
          return value;
        } catch (error) {
          await evidence?.('failed');
          throw error;
        }
      },
      buildReportEvidence: async () => [],
      cleanup: async () => {
        cleaned = true;
        return { apiIdentityCounts: { AUTO_AUDIT_ONE: 0 }, uiIdentityCounts: { AUTO_AUDIT_ONE: 0 } };
      },
    });
    expect(result.assertionReceipts).toEqual([{
      claimId: 'CASE-001:expectation-1', assertionAdapterId: 'system.assert.visible', status: 'verified',
    }]);
    expect(result.contextGuardReceipts).toEqual([
      { contextGuardAdapterId: 'system.context', phase: 'before-action', status: 'verified' },
      { contextGuardAdapterId: 'system.context', phase: 'before-assertion', status: 'verified' },
    ]);
    expect(cleaned).toBe(true);

    cleaned = false;
    await expect(executeSystemTestRecipe(recipe, {
      initialize: async () => context,
      seed: async (_call, current) => current,
      verifyContext: async () => undefined,
      executeCapability: async () => ({ visible: true }),
      assert: async () => { throw new Error('assertion failed'); },
      reportStep: async (_step, action, evidence) => {
        try {
          const value = await action();
          await evidence?.('passed');
          return value;
        } catch (error) {
          await evidence?.('failed');
          throw error;
        }
      },
      buildReportEvidence: async () => [],
      cleanup: async () => { cleaned = true; return {}; },
    })).rejects.toThrow('assertion failed');
    expect(cleaned).toBe(true);
    } finally {
      restoreGrantEnv(previousGrantEnv);
      revokeSystemTestExecutionGrant(grant);
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  test('动作链就绪策略开启时缺少权威合同必须在浏览器前阻断', () => {
    const fixture = createFixture();
    fixture.manifest.dataProfiles.read.requireActionReadiness = true;
    fixture.manifest.dataProfiles.read.requiredOperationKeys = ['reference:GET /resource/{id}'];
    fixture.adapters.operationKeys.push('reference:GET /resource/{id}');
    fixture.manifest.sources.adapterCatalogFingerprint = fingerprintSystemTestValue(fixture.adapters);
    const missing = compileSystemTestRunContract({
      rootDir: fixture.rootDir,
      manifest: fixture.manifest,
      recipes: [fixture.recipe],
      recipeCollectionFingerprint: fixture.recipeFingerprint,
      rules: fixture.rules,
      adapters: fixture.adapters,
    });
    expect(missing.errors).toContain('CASE-001:ACTION_READINESS_REQUIRED');

    fixture.adapters.adapters.push({
      id: 'system.action-readiness', kind: 'action-readiness', actions: ['read'],
      implementation: implementation(fixture.rootDir, 'system.spec.ts'),
    });
    fixture.recipe.actionReadiness = {
      adapterId: 'system.action-readiness',
      input: { resourceId: { $ref: '$record.id' } },
      status: 'observed',
      generationAllowed: true,
      sourceIds: ['audit:resource-page'],
      contractIds: ['ui:resource-action-chain'],
      controlIds: ['resource.action'],
      sequence: ['locate', 'open-overlay', 'observe-request', 'verify-terminal'],
      terminalConditionIds: ['resource.visible'],
      operationKeys: ['reference:GET /resource/{id}'],
      requiredIdentityKeys: ['resourceId'],
      cleanupIdentityKeys: ['resourceId'],
    };
    fixture.manifest.sources.adapterCatalogFingerprint = fingerprintSystemTestValue(fixture.adapters);
    const fingerprint = recipeCollectionFingerprint([fixture.recipe]);
    fixture.manifest.sources.recipeCollectionFingerprint = fingerprint;
    const ready = compileSystemTestRunContract({
      rootDir: fixture.rootDir,
      manifest: fixture.manifest,
      recipes: [fixture.recipe],
      recipeCollectionFingerprint: fingerprint,
      rules: fixture.rules,
      adapters: fixture.adapters,
    });
    expect(ready.errors).toEqual([]);
    expect(ready.contract.cases[0].requiredActionReadiness).toMatchObject({
      adapterId: 'system.action-readiness', requiredIdentityKeys: ['resourceId'],
    });
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  test('种子身份和只读动作链未验证时能力不得执行且成功后产生逐阶段耗时收据', async () => {
    const fixture = createFixture();
    const recipe: AutomationRecipe = {
      ...fixture.recipe,
      actionReadiness: {
        adapterId: 'system.action-readiness',
        input: { resourceId: { $ref: '$record.id' } },
        status: 'observed', generationAllowed: true,
        sourceIds: ['audit:resource-page'], contractIds: ['ui:resource-action-chain'],
        controlIds: ['resource.action'], sequence: ['locate', 'verify'],
        terminalConditionIds: ['resource.visible'], operationKeys: ['reference:GET /resource/{id}'],
        requiredIdentityKeys: ['resourceId'], cleanupIdentityKeys: ['resourceId'],
      },
    };
    const grant = issueSystemTestExecutionGrant({
      rootDir: path.resolve(__dirname, '../..'), applicationId: 'contract-test', runId: 'readiness-contract-test',
      caseIds: [recipe.caseId], ttlMs: 60_000, candidateFingerprint: 'c'.repeat(64),
    });
    const previousGrantEnv = captureGrantEnv();
    Object.assign(process.env, grant.env);
    let capabilityRuns = 0;
    const basePort = {
      initialize: async () => ({ recipe, record: { id: 101 }, results: {}, assertionReceipts: [] }),
      seed: async (_call: RecipeAdapterCall, current: SystemTestRecipeContext) => current,
      verifyContext: async () => undefined,
      executeCapability: async () => { capabilityRuns += 1; return {}; },
      assert: async () => undefined,
      cleanup: async () => ({}),
    };
    try {
      await expect(executeSystemTestRecipe(recipe, basePort)).rejects.toThrow('ACTION_READINESS_PORT_REQUIRED:CASE-001');
      expect(capabilityRuns).toBe(0);
      const result = await executeSystemTestRecipe(recipe, {
        ...basePort,
        verifyActionReadiness: async (_contract, _context, input) => {
          expect(input.resourceId).toBe(101);
          return { verifiedIdentityKeys: ['resourceId'] };
        },
      });
      expect(capabilityRuns).toBe(1);
      expect(result.actionReadinessReceipts).toHaveLength(1);
      expect(result.executionTimings?.map((item) => item.phase)).toContain('initialize');
      expect(result.executionTimings?.map((item) => item.phase)).toContain('action-readiness');
      expect(result.executionTimings?.map((item) => item.phase)).toContain('capability');
    } finally {
      restoreGrantEnv(previousGrantEnv);
      revokeSystemTestExecutionGrant(grant);
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  test('定位漂移自动转动作链审计且执行候选漂移必须在写入前拒绝', () => {
    expect(classifyDiagnosticNextAction('locator-drift', 'button locator timeout')).toBe('audit-action-chain');
    expect(classifyDiagnosticNextAction('automation-gap', 'seed identity not found')).toBe('repair-seed-identity');
    const diagnostics = buildSystemTestFailureDiagnosticDocument({
      outputDir: fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-diagnostics-')),
      systemId: 'another-system', runId: 'run-001',
      evidence: { cases: [{ caseId: 'CASE-001', playwrightStatus: 'failed', failureCategory: 'locator-drift' }] },
    });
    expect(diagnostics.rerunGate).toBe('action-chain-audit-required');
    expect(buildSystemTestDiagnosticWorkQueue(diagnostics).items[0]).toMatchObject({
      caseId: 'CASE-001', action: 'audit-action-chain',
    });
    const base = {
      applicationId: 'another-application', runId: 'run-001', selectedCaseIds: ['CASE-001'],
      caseFingerprints: { 'CASE-001': 'case-a' },
      implementationFingerprints: { 'CASE-001': 'implementation-a' }, contextFingerprint: 'context-a',
    };
    const frozen = buildSystemTestExecutionCandidate(base);
    expect(() => assertSystemTestExecutionCandidateUnchanged(frozen, buildSystemTestExecutionCandidate({
      ...base, implementationFingerprints: { 'CASE-001': 'implementation-b' },
    }))).toThrow(/EXECUTION_CANDIDATE_DRIFT/);
  });

  test('正式业务执行必须持有短期授权且只能运行授权用例', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-grant-'));
    const grant = issueSystemTestExecutionGrant({
      rootDir,
      applicationId: 'application-a',
      runId: 'run-001',
      caseIds: ['CASE-002', 'CASE-001', 'CASE-001'],
      ttlMs: 60_000,
      candidateFingerprint: 'b'.repeat(64),
      now: new Date('2026-08-21T00:00:00.000Z'),
    });
    try {
      const document = fs.readFileSync(grant.grantPath, 'utf8');
      expect(document).not.toContain(grant.env.SYSTEM_TEST_EXECUTION_GRANT_TOKEN);
      expect(() => assertSystemTestExecutionGrant({
        rootDir,
        applicationId: 'application-a',
        caseId: 'CASE-001',
        env: grant.env,
        now: new Date('2026-08-21T00:00:30.000Z'),
      })).not.toThrow();
      expect(() => assertSystemTestExecutionGrant({
        rootDir,
        applicationId: 'application-a',
        caseId: 'CASE-003',
        env: grant.env,
        now: new Date('2026-08-21T00:00:30.000Z'),
      })).toThrow('EXECUTION_GRANT_CASE_NOT_SELECTED:CASE-003');
      expect(() => assertSystemTestExecutionGrant({
        rootDir,
        applicationId: 'application-a',
        caseId: 'CASE-001',
        env: grant.env,
        now: new Date('2026-08-21T00:01:01.000Z'),
      })).toThrow('EXECUTION_GRANT_EXPIRED:CASE-001');
    } finally {
      revokeSystemTestExecutionGrant(grant);
      expect(fs.existsSync(grant.grantPath)).toBe(false);
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('通用编译器和运行器必须同时接入执行授权', () => {
    const platformRoot = path.resolve(__dirname, '../..');
    const runnerSource = fs.readFileSync(path.join(platformRoot, 'scripts/run-system-test.ts'), 'utf8');
    const contractSource = fs.readFileSync(path.join(platformRoot, 'src/automation/system-test/system-test-contract.ts'), 'utf8');
    expect(runnerSource).toContain('issueSystemTestExecutionGrant');
    expect(runnerSource).toContain('revokeSystemTestExecutionGrant');
    expect(runnerSource).toContain('...executionGrant.env');
    expect(contractSource).toContain('GOVERNED_EXECUTION_GUARD_MISSING');
    expect(contractSource).toContain('system-test-recipe-executor');
  });

  test('通用 Recipe 在缺少统一运行授权时必须先于初始化拒绝执行', async () => {
    const fixture = createFixture();
    let initialized = false;
    const previousGrantEnv = captureGrantEnv();
    for (const key of grantEnvKeys) delete process.env[key];
    try {
      await expect(executeSystemTestRecipe(fixture.recipe, {
        initialize: async () => {
          initialized = true;
          return { recipe: fixture.recipe, results: {}, assertionReceipts: [] };
        },
        seed: async (_call, current) => current,
        verifyContext: async () => undefined,
        executeCapability: async () => undefined,
        assert: async () => undefined,
        cleanup: async () => undefined,
      })).rejects.toThrow('GOVERNED_EXECUTION_REQUIRED:CASE-001');
      expect(initialized).toBe(false);
    } finally {
      restoreGrantEnv(previousGrantEnv);
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  test('写入证据必须同时满足唯一 Claim 收据和 API/UI 零残留', () => {
    const fixture = createFixture();
    const compiled = compileFixture(fixture);
    const item = { ...compiled.contract.cases[0], mutationMode: 'reversible' as const };
    const incomplete = evaluateSystemTestRuntimeEvidence(item, {
      caseId: item.caseId,
      assertionReceipts: [
        { claimId: item.expectationClaims[0].claimId, assertionAdapterId: 'system.assert.visible', status: 'verified' },
      ],
      contextGuardReceipts: [
        { contextGuardAdapterId: 'system.context', phase: 'before-action', status: 'verified' },
        { contextGuardAdapterId: 'system.context', phase: 'before-assertion', status: 'verified' },
      ],
      cleanup: { apiIdentityCounts: { AUTO_AUDIT_ONE: 0 }, uiIdentityCounts: { AUTO_AUDIT_ONE: 'unavailable' } },
    });
    expect(incomplete).toMatchObject({
      status: 'incomplete', operationEvidenceComplete: false,
      missingOperationKeys: [], apiZeroResidue: true, uiZeroResidue: false,
    });
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  test('写入用例只有操作收据与双端零残留同时存在才可完整', () => {
    const fixture = createFixture();
    const compiled = compileFixture(fixture);
    const item = { ...compiled.contract.cases[0], mutationMode: 'reversible' as const, requiredOperationKeys: ['entity.update'] };
    const complete = evaluateSystemTestRuntimeEvidence(item, {
      caseId: item.caseId,
      assertionReceipts: [{
        claimId: item.expectationClaims[0].claimId,
        assertionAdapterId: 'system.assert.visible',
        status: 'verified',
      }],
      contextGuardReceipts: [
        { contextGuardAdapterId: 'system.context', phase: 'before-action', status: 'verified' },
        { contextGuardAdapterId: 'system.context', phase: 'before-assertion', status: 'verified' },
      ],
      operationReceipts: [{ operationKey: 'entity.update', method: 'PUT', observed: true }],
      cleanup: { apiIdentityCounts: { AUTO_AUDIT_ONE: 0 }, uiIdentityCounts: { AUTO_AUDIT_ONE: 0 } },
    });
    expect(complete).toMatchObject({ status: 'complete', operationEvidenceComplete: true, apiZeroResidue: true, uiZeroResidue: true });
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  test('只读预期若实际发生写入，必须补齐操作与双端清理证据', () => {
    const fixture = createFixture();
    const item = { ...compileFixture(fixture).contract.cases[0], mutationMode: 'none' as const, requiredOperationKeys: [] };
    const evidence = {
      caseId: item.caseId,
      assertionReceipts: [{
        claimId: item.expectationClaims[0].claimId,
        assertionAdapterId: 'system.assert.visible',
        status: 'observed-mismatch' as const,
      }],
      contextGuardReceipts: [
        { contextGuardAdapterId: 'system.context', phase: 'before-action' as const, status: 'verified' as const },
        { contextGuardAdapterId: 'system.context', phase: 'before-assertion' as const, status: 'verified' as const },
      ],
      mutationObserved: true,
    };
    expect(evaluateSystemTestRuntimeEvidence(item, evidence)).toMatchObject({
      status: 'incomplete', operationEvidenceComplete: false, apiZeroResidue: false, uiZeroResidue: false,
    });
    expect(evaluateSystemTestRuntimeEvidence(item, {
      ...evidence,
      operationReceipts: [{ operationKey: 'entity.create', method: 'POST', observed: true }],
      cleanup: { apiIdentityCounts: { AUTO_AUDIT_ONE: 0 }, uiIdentityCounts: { AUTO_AUDIT_ONE: 0 } },
    })).toMatchObject({
      status: 'complete', operationEvidenceComplete: true, apiZeroResidue: true, uiZeroResidue: true,
    });
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  test('POST 查询操作收据不得被通用流程误判为数据写入', () => {
    expect(resolveSystemTestMutationObserved({ declaredMutation: undefined })).toBe(false);
    expect(resolveSystemTestMutationObserved({
      declaredMutation: undefined,
      unexpectedMutationObserved: false,
    })).toBe(false);
    expect(resolveSystemTestMutationObserved({
      declaredMutation: { method: 'POST', operationKey: 'entity.create' },
    })).toBe(true);
    expect(resolveSystemTestMutationObserved({
      declaredMutation: undefined,
      unexpectedMutationObserved: true,
    })).toBe(true);
  });

  test('证据语义指纹必须覆盖执行器、评估器与 reporter', () => {
    const before = buildSystemTestEvidenceRuntimeFingerprint();
    expect(before).toMatch(/^[a-f0-9]{64}$/);
    const fixture = createFixture();
    const result = compileFixture(fixture);
    expect(result.contract.sourceFingerprints.evidenceRuntime).toBe(before);
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  test('适配器实现漂移应在执行前阻断', () => {
    const fixture = createFixture();
    fs.writeFileSync(path.join(fixture.rootDir, 'system.spec.ts'), 'export const changed = true;\n');
    const result = compileFixture(fixture);
    expect(result.errors).toContain('ADAPTER_IMPLEMENTATION_DRIFT:navigation.open');
    expect(result.errors).toContain('ADAPTER_IMPLEMENTATION_DRIFT:system.assert.visible');
    expect(result.errors).toContain('GOVERNED_EXECUTION_GUARD_MISSING');
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  test('执行 spec 缺少公共 Recipe 授权边界时不得注册运行', () => {
    const fixture = createFixture();
    fs.writeFileSync(path.join(fixture.rootDir, 'system.spec.ts'), 'export {};\n');
    const result = compileFixture(fixture);
    expect(result.errors).toContain('GOVERNED_EXECUTION_GUARD_MISSING');
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  test('适配器导入依赖漂移也应在执行前阻断', () => {
    const fixture = createFixture();
    const dependencyPath = path.join(fixture.rootDir, 'adapter-dependency.ts');
    fs.writeFileSync(dependencyPath, 'export const version = 1;\n');
    fixture.adapters.adapters[0].implementation.dependencies = [{
      path: 'adapter-dependency.ts',
      sha256: fingerprintFile(fs.readFileSync(dependencyPath)),
    }];
    fixture.manifest.sources.adapterCatalogFingerprint = fingerprintSystemTestValue(fixture.adapters);
    fs.writeFileSync(dependencyPath, 'export const version = 2;\n');
    const result = compileFixture(fixture);
    expect(result.errors).toContain('ADAPTER_DEPENDENCY_DRIFT:system.auth:adapter-dependency.ts');
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  test('恢复执行文件、项目和适配器必须成组配置', () => {
    const fixture = createFixture();
    fixture.manifest.execution.recoverySpecPath = 'recovery.spec.ts';
    const result = compileFixture(fixture);
    expect(result.errors).toContain('RECOVERY_CONFIGURATION_INCOMPLETE');
    expect(result.errors).toContain('RECOVERY_SPEC_MISSING');
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  test('通用安全扫描和失败分类不得依赖商品域', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-safety-'));
    fs.writeFileSync(path.join(directory, 'safe.json'), '{"authorization":"<redacted>"}\n');
    fs.writeFileSync(path.join(directory, 'unsafe.json'), '{"access_token":"secret-value"}\n');
    expect(scanSystemTestArtifacts(directory)).toHaveLength(1);
    expect(classifySystemTestContractBlockers(['EXTERNAL_CAPABILITY_MISSING:terminal-sync'])).toEqual(['external-dependency']);
    expect(classifySystemTestContractBlockers(['ADAPTER_IMPLEMENTATION_DRIFT:system.auth'])).toEqual(['automation-gap']);
    expect(classifySystemTestCircuit('ENVIRONMENT_FAILURE_RATE')).toBe('environment-failure');
    expect(classifySystemTestCircuit('STALL')).toBe('automation-gap');
    expect(classifySystemTestFailure({
      status: 'failed', evidenceComplete: true, productMismatchConfirmed: true, executionPathEquivalent: false,
    })).toBe('unknown');
    expect(classifySystemTestFailure({
      status: 'failed', evidenceComplete: true, productMismatchConfirmed: true, executionPathEquivalent: true,
    })).toBe('product-failure');
    expect(classifySystemTestFailure({
      status: 'failed', evidenceComplete: true,
      message: 'PRODUCT_BEHAVIOR CASE-001: observed stable UI and API mismatch',
    })).toBe('product-failure');
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('通用进度和熔断不包含商品域字段', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-progress-'));
    const paths = { latestPath: path.join(directory, 'latest.json'), historyPath: path.join(directory, 'history.jsonl') };
    const first = appendSystemTestProgress(paths, { runId: 'run', caseId: 'CASE-1', phase: 'failed', diagnosticFingerprint: 'same' });
    appendSystemTestProgress(paths, { runId: 'run', caseId: 'CASE-2', phase: 'failed', diagnosticFingerprint: 'same' });
    const events = readSystemTestProgress(paths.historyPath);
    const decision = evaluateSystemTestCircuit({
      events,
      startedAtMs: Date.parse(first.updatedAt) - 10,
      nowMs: Date.parse(events[1].updatedAt) + 10,
      policy: {
        stallMs: 180_000, maxRunMs: 900_000, maxConsecutiveFailures: 3,
        maxDuplicateFailureFingerprint: 2, minimumCompletedForFailureRate: 4,
        maximumEnvironmentFailureRate: 0.5,
      },
    });
    expect(decision.trip).toBe(false);
    expect(JSON.stringify(events)).not.toContain('domainSpecificToken');
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('定向修复必须跨进程限制原样重跑、尝试次数和重复通过', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-repair-guard-'));
    const ledgerPath = path.join(directory, 'repair-attempt-ledger.json');
    const base = {
      ledgerPath, applicationId: 'application-a', caseId: 'CASE-001', caseFingerprint: 'case-v1', runId: 'run-1',
      now: '2026-08-21T00:00:00.000Z',
    };
    const first = beginSystemTestRepairAttempt({ ...base, implementationFingerprint: 'implementation-v1' });
    expect(first.allowed).toBe(true);
    completeSystemTestRepairAttempt({
      ledgerPath, attemptId: first.attempt!.attemptId, status: 'failed', failureCategory: 'automation-gap',
      now: '2026-08-21T00:01:00.000Z',
    });
    expect(beginSystemTestRepairAttempt({
      ...base, runId: 'run-2', implementationFingerprint: 'implementation-v1', now: '2026-08-21T00:02:00.000Z',
    })).toMatchObject({ allowed: false, code: 'IMPLEMENTATION_UNCHANGED_AFTER_DETERMINISTIC_FAILURE' });
    const second = beginSystemTestRepairAttempt({
      ...base, runId: 'run-3', implementationFingerprint: 'implementation-v2', now: '2026-08-21T00:03:00.000Z',
    });
    expect(second.allowed).toBe(true);
    completeSystemTestRepairAttempt({
      ledgerPath, attemptId: second.attempt!.attemptId, status: 'failed', failureCategory: 'locator-drift',
      now: '2026-08-21T00:04:00.000Z',
    });
    expect(beginSystemTestRepairAttempt({
      ...base, runId: 'run-4', implementationFingerprint: 'implementation-v3', now: '2026-08-21T00:05:00.000Z',
    })).toMatchObject({ allowed: false, code: 'DIAGNOSIS_REQUIRED' });

    const diagnosisPath = path.join(directory, 'diagnosis.json');
    fs.writeFileSync(diagnosisPath, JSON.stringify({
      schemaVersion: '1.0.0', applicationId: 'application-a', caseIds: ['CASE-001'],
      rootCause: '页面合同理解错误', correctiveAction: '修正控件路径并增加静态合同测试', evidenceRefs: ['evidence/report.json'],
    }));
    const diagnosisFingerprint = fingerprintSystemTestRepairDiagnosis(diagnosisPath, {
      applicationId: 'application-a', caseIds: ['CASE-001'],
    });
    const third = beginSystemTestRepairAttempt({
      ...base, runId: 'run-5', implementationFingerprint: 'implementation-v3', diagnosisFingerprint,
      now: '2026-08-21T00:06:00.000Z',
    });
    expect(third.allowed).toBe(true);
    completeSystemTestRepairAttempt({
      ledgerPath, attemptId: third.attempt!.attemptId, status: 'passed', now: '2026-08-21T00:07:00.000Z',
    });
    expect(beginSystemTestRepairAttempt({
      ...base, runId: 'run-6', implementationFingerprint: 'implementation-v3', diagnosisFingerprint,
      now: '2026-08-21T00:08:00.000Z',
    })).toMatchObject({ allowed: false, code: 'CURRENT_IMPLEMENTATION_ALREADY_PASSED' });
    expect(JSON.stringify(readSystemTestRepairLedger(ledgerPath))).not.toContain('domainSpecificToken');
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('存在确定性失败的定向修复轮次超过十五分钟必须先形成诊断记录', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-repair-time-'));
    const ledgerPath = path.join(directory, 'repair-attempt-ledger.json');
    const first = beginSystemTestRepairAttempt({
      ledgerPath, applicationId: 'application-b', caseId: 'CASE-002', caseFingerprint: 'case-v1',
      implementationFingerprint: 'implementation-v1', runId: 'run-1', now: '2026-08-21T00:00:00.000Z',
    });
    completeSystemTestRepairAttempt({
      ledgerPath, attemptId: first.attempt!.attemptId, status: 'failed', failureCategory: 'automation-gap',
      now: '2026-08-21T00:01:00.000Z',
    });
    expect(beginSystemTestRepairAttempt({
      ledgerPath, applicationId: 'application-b', caseId: 'CASE-002', caseFingerprint: 'case-v1',
      implementationFingerprint: 'implementation-v2', runId: 'run-2', now: '2026-08-21T00:16:00.000Z',
    })).toMatchObject({ allowed: false, code: 'DIAGNOSIS_REQUIRED', detail: 'cycle-time-budget-exhausted' });
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('执行前只读查询区分当前实现已通过与确定性失败', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-repair-state-'));
    const ledgerPath = path.join(directory, 'repair-attempt-ledger.json');
    const passed = beginSystemTestRepairAttempt({
      ledgerPath, applicationId: 'application-c', caseId: 'CASE-003', caseFingerprint: 'case-v1',
      implementationFingerprint: 'implementation-v1', runId: 'run-1', now: '2026-08-21T00:00:00.000Z',
    });
    completeSystemTestRepairAttempt({ ledgerPath, attemptId: passed.attempt!.attemptId, status: 'passed', now: '2026-08-21T00:01:00.000Z' });
    expect(inspectSystemTestRepairAttemptState({
      ledgerPath, applicationId: 'application-c', caseId: 'CASE-003', caseFingerprint: 'case-v1', implementationFingerprint: 'implementation-v1',
    })).toMatchObject({ currentImplementationPassed: true, currentImplementationDeterministicFailure: false });
    const failed = beginSystemTestRepairAttempt({
      ledgerPath, applicationId: 'application-c', caseId: 'CASE-004', caseFingerprint: 'case-v1',
      implementationFingerprint: 'implementation-v1', runId: 'run-2', now: '2026-08-21T00:00:00.000Z',
    });
    completeSystemTestRepairAttempt({ ledgerPath, attemptId: failed.attempt!.attemptId, status: 'failed', failureCategory: 'automation-gap', now: '2026-08-21T00:01:00.000Z' });
    expect(inspectSystemTestRepairAttemptState({
      ledgerPath, applicationId: 'application-c', caseId: 'CASE-004', caseFingerprint: 'case-v1', implementationFingerprint: 'implementation-v1',
    })).toMatchObject({ currentImplementationPassed: false, currentImplementationDeterministicFailure: true });
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('终止运行遗留的 running attempt 必须自动收口且不得修改仍活跃运行', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-repair-reconcile-'));
    const ledgerPath = path.join(directory, 'repair-attempt-ledger.json');
    const stale = beginSystemTestRepairAttempt({
      ledgerPath, applicationId: 'application-a', caseId: 'CASE-STALE', caseFingerprint: 'case-v1',
      implementationFingerprint: 'implementation-v1', runId: 'run-stale', now: '2026-08-21T00:00:00.000Z',
    });
    const active = beginSystemTestRepairAttempt({
      ledgerPath, applicationId: 'application-a', caseId: 'CASE-ACTIVE', caseFingerprint: 'case-v1',
      implementationFingerprint: 'implementation-v1', runId: 'run-active', now: '2026-08-21T00:00:00.000Z',
    });
    expect(reconcileOrphanedSystemTestRepairAttempts({
      ledgerPath, activeRunId: 'run-active', now: '2026-08-21T00:01:00.000Z',
    })).toEqual({ reconciledAttemptIds: [stale.attempt!.attemptId] });
    const attempts = readSystemTestRepairLedger(ledgerPath).entries.flatMap((entry) => entry.cycles)
      .flatMap((cycle) => cycle.attempts);
    expect(attempts.find((attempt) => attempt.attemptId === stale.attempt!.attemptId)).toMatchObject({
      status: 'interrupted', failureCategory: 'transient-platform', durationMs: 60_000,
    });
    expect(attempts.find((attempt) => attempt.attemptId === active.attempt!.attemptId)).toMatchObject({ status: 'running' });
    expect(beginSystemTestRepairAttempt({
      ledgerPath, applicationId: 'application-a', caseId: 'CASE-STALE', caseFingerprint: 'case-v1',
      implementationFingerprint: 'implementation-v2', runId: 'run-next', now: '2026-08-21T00:16:00.000Z',
    })).toMatchObject({ allowed: true });
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('标准化测试方案应一次生成 Recipe、provisional 规则和唯一绑定', () => {
    const result = compileSystemTestPlan({
      plan: {
        schemaVersion: '1.0.0', systemId: 'another-system', ...planGovernance(['/items'], ['prd:1']), cases: [{
          caseId: 'CASE-READ-001', ruleId: 'RULE-READ-001', title: '列表可见', sourceIds: ['prd:1'],
          route: '/items', action: 'read', dataProfileId: 'read', coverageIds: ['route:items'],
          contractIds: ['ui:items-list'],
          conditions: ['已进入系统'], actions: ['打开列表'],
          expectations: [{
            expected: '列表可见', assertionAdapterId: 'system.assert.items-visible', observationChannel: 'ui',
            authority: 'user-visible', terminalCondition: '列表稳定显示', fieldId: 'items.list',
            assertionSurfaceId: 'ui.items-list', sourceIds: ['prd:1'], contractIds: ['ui:items-list'],
          }],
          capabilities: [{ id: 'navigation.open-items' }],
          semantics: semanticContract('read-list', ['prd:1']),
        }],
      },
      dataProfiles: { read: { mutationMode: 'none', requiredOperationKeys: [], probeAdapterIds: [], externalCapabilities: [] } },
    });
    expect(result.errors).toEqual([]);
    expect(result.recipeCollection.recipes[0].assertions[0]).toEqual({
      adapterId: 'system.assert.items-visible', claimIds: ['CASE-READ-001:expectation-1'],
    });
    expect(result.ruleLedger.rules[0]).toMatchObject({ status: 'provisional', formalPromotionAllowed: false });
    expect(result.bindings).toEqual([{
      caseId: 'CASE-READ-001', ruleId: 'RULE-READ-001', recipeId: 'another-system:CASE-READ-001', dataProfileId: 'read',
    }]);
  });

  test('统一编译器应守恒可执行用例与证据化分类排除且不为空壳生成 Recipe', () => {
    const plan = governedReadPlan();
    plan.classifiedExclusions = [{
      caseId: 'CASE-DOWNSTREAM-001',
      title: '下游终端展示',
      disposition: 'blocked-source',
      sourceIds: ['prd:1'],
      route: '/items',
      semantics: {
        ...semanticContract('downstream-terminal', ['prd:1']),
        scenarioFamilyId: 'downstream-display',
        stateTransitionId: 'published-to-visible',
      },
      assertionSurfaceAssessment: {
        requiredChannels: ['ui', 'downstream'],
        availableChannels: ['ui'],
        missingEvidence: [{ channel: 'downstream', reason: '缺少目标终端当前显示合同。' }],
      },
      contextAssessment: { status: 'blocked-source', reason: '目标终端上下文尚未审计。' },
      apiMappings: [{
        operationKey: null,
        status: 'missing',
        sourceIds: ['prd:1'],
        reason: '没有证据支持下游拉取 operation。',
      }],
      missingCapabilities: [],
      reason: '下游断言面缺少当前来源证据。',
      recoveryCondition: '取得目标终端路由、身份和显示证据后重新编译。',
    }];
    const result = compileSystemTestPlan({
      plan,
      dataProfiles: { read: { mutationMode: 'none', requiredOperationKeys: [], probeAdapterIds: [], externalCapabilities: [] } },
    });
    expect(result.errors).toEqual([]);
    expect(result.recipeCollection.recipes).toHaveLength(1);
    expect(result.classificationLedger.summary).toMatchObject({
      planned: 2,
      executable: 1,
      classifiedExclusions: 1,
      dispositions: { 'blocked-source': 1 },
    });
  });

  test('来源阻断没有逐通道证据缺口时必须在浏览器前失败', () => {
    const plan = governedReadPlan();
    plan.classifiedExclusions = [{
      caseId: 'CASE-BLOCKED-001',
      title: '来源阻断错误样本',
      disposition: 'blocked-source',
      sourceIds: ['prd:1'],
      route: '/items',
      semantics: { ...semanticContract('blocked', ['prd:1']), scenarioFamilyId: 'blocked' },
      assertionSurfaceAssessment: {
        requiredChannels: ['ui'],
        availableChannels: ['ui'],
        missingEvidence: [],
      },
      contextAssessment: { status: 'blocked-source', reason: '待审计。' },
      apiMappings: [],
      missingCapabilities: [],
      reason: '错误地声明来源阻断。',
      recoveryCondition: '补全证据缺口。',
    }];
    const result = compileSystemTestPlan({
      plan,
      dataProfiles: { read: { mutationMode: 'none', requiredOperationKeys: [], probeAdapterIds: [], externalCapabilities: [] } },
    });
    expect(result.errors).toContain('CASE-BLOCKED-001:BLOCKED_SOURCE_EVIDENCE_GAP_REQUIRED');
  });

  test('缺少平台治理合同必须在浏览器前阻断', () => {
    const plan = governedReadPlan();
    delete plan.governance;
    const result = compileSystemTestPlan({
      plan,
      dataProfiles: { read: { mutationMode: 'none', requiredOperationKeys: [], probeAdapterIds: [], externalCapabilities: [] } },
    });
    expect(result.errors).toContain('PLATFORM_GOVERNANCE_REQUIRED');
  });

  test('上下文路由只允许精确路径或有边界的子路由', () => {
    expect(matchesSystemTestRoute('/items', '/items', 'exact')).toBe(true);
    expect(matchesSystemTestRoute('/items/edit', '/items', 'exact')).toBe(false);
    expect(matchesSystemTestRoute('/items/edit', '/items', 'exact-or-descendant')).toBe(true);
    expect(matchesSystemTestRoute('/items-other', '/items', 'exact-or-descendant')).toBe(false);
    expect(matchesSystemTestRoute('/anything', '/', 'exact-or-descendant')).toBe(false);
  });

  test('仅 caseId 不同的同义场景必须阻断且有独立来源的变体才可共存', () => {
    const unresolved = governedReadPlan(['prd:1']);
    unresolved.cases.push({
      ...structuredClone(unresolved.cases[0]), caseId: 'CASE-READ-002', ruleId: 'RULE-READ-002',
    });
    const blocked = compileSystemTestPlan({
      plan: unresolved,
      dataProfiles: { read: { mutationMode: 'none', requiredOperationKeys: [], probeAdapterIds: [], externalCapabilities: [] } },
    });
    expect(blocked.errors).toContain('CASE-READ-001:SEMANTIC_DUPLICATE_UNRESOLVED:CASE-READ-001,CASE-READ-002');

    const distinct = governedReadPlan(['prd:1', 'prd:2']);
    distinct.cases[0].sourceIds = ['prd:1'];
    distinct.cases[0].semantics!.variantSourceIds = ['prd:1'];
    distinct.cases.push({
      ...structuredClone(distinct.cases[0]), caseId: 'CASE-READ-002', ruleId: 'RULE-READ-002', sourceIds: ['prd:2'],
      semantics: { ...structuredClone(distinct.cases[0].semantics!), variantId: 'filtered', variantSourceIds: ['prd:2'] },
      expectations: distinct.cases[0].expectations.map((item) => ({ ...item, sourceIds: ['prd:2'] })),
    });
    const allowed = compileSystemTestPlan({
      plan: distinct,
      dataProfiles: { read: { mutationMode: 'none', requiredOperationKeys: [], probeAdapterIds: [], externalCapabilities: [] } },
    });
    expect(allowed.errors.filter((item) => item.includes('SEMANTIC_DUPLICATE'))).toEqual([]);
  });

  test('字段使用非权威验证面时必须阻断', () => {
    const plan = governedReadPlan();
    plan.cases[0].expectations[0].assertionSurfaceId = 'ui.unknown-list';
    const result = compileSystemTestPlan({
      plan,
      dataProfiles: { read: { mutationMode: 'none', requiredOperationKeys: [], probeAdapterIds: [], externalCapabilities: [] } },
    });
    expect(result.errors).toContain('CASE-READ-001:expectation-1:ASSERTION_SURFACE_UNRESOLVED:ui.unknown-list');
  });

  test('精确页面提示没有运行审计来源时必须阻断', () => {
    const plan = governedReadPlan();
    plan.cases[0].expectations[0] = {
      ...plan.cases[0].expectations[0],
      expected: '页面显示精确提示',
      feedback: { mode: 'exact-message', trigger: 'pre-submit', exactText: '精确提示' },
    };
    const result = compileSystemTestPlan({
      plan,
      dataProfiles: { read: { mutationMode: 'none', requiredOperationKeys: [], probeAdapterIds: [], externalCapabilities: [] } },
    });
    expect(result.errors).toContain('CASE-READ-001:expectation-1:EXACT_FEEDBACK_RUNTIME_SOURCE_REQUIRED');
  });

  test('缺少上下文守卫收据时运行证据不得完整', () => {
    const fixture = createFixture();
    const item = { ...compileFixture(fixture).contract.cases[0], mutationMode: 'none' as const };
    const evaluation = evaluateSystemTestRuntimeEvidence(item, {
      caseId: item.caseId,
      assertionReceipts: [{
        claimId: item.expectationClaims[0].claimId,
        assertionAdapterId: 'system.assert.visible',
        status: 'verified',
      }],
    });
    expect(evaluation.status).toBe('incomplete');
    expect(evaluation.missingContextGuards).toEqual([
      'system.context:before-action',
      'system.context:before-assertion',
    ]);
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  test('V2 运行时审计应把技术绑定和证据来源写入可执行 Recipe', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-runtime-audit-'));
    try {
      const source = createRuntimeAuditedPlanCase();
      const runtimeAudit = createSystemTestRuntimeAudit(rootDir, source, {
        method: 'POST',
        operationKey: 'entity.update.v2',
      }, 'automatic');
      const result = compileSystemTestPlan({
        plan: {
          schemaVersion: '1.0.0', systemId: 'another-system',
          ...planGovernance(['/items', '/items-v2'], ['prd:1', 'audit:system-v2']), runtimeAudit, cases: [source],
        },
        dataProfiles: { reversible: reversibleDataProfile() },
        rootDir,
      });

      expect(result.errors).toEqual([]);
      expect(result.recipeCollection.recipes[0]).toMatchObject({
        route: '/items-v2',
        sourceIds: ['prd:1', 'audit:system-v2'],
        coverageIds: ['coverage:items-v2'],
        capabilities: [{ id: 'navigation.open-items-v2' }],
        assertions: [{
          adapterId: 'system.assert.items-v2-visible',
          claimIds: ['CASE-EDIT-001:expectation-1'],
        }],
        mutation: { method: 'POST', operationKey: 'entity.update.v2' },
      });
      expect(result.ruleLedger.rules[0].outcomes).toEqual(['新版列表可见']);
      expect(result.rerunCaseIds).toEqual([source.caseId]);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('V2 运行时审计不得把非法方法或缺失 operationKey 的接口写入 Recipe', () => {
    for (const operation of [
      { method: 'PATCH', operationKey: 'entity.patch', error: 'RUNTIME_AUDIT_MUTATION_METHOD_INVALID' },
      { method: 'POST', operationKey: undefined, error: 'RUNTIME_AUDIT_OPERATION_KEY_REQUIRED' },
    ]) {
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-runtime-audit-invalid-'));
      try {
        const source = createRuntimeAuditedPlanCase();
        const runtimeAudit = createSystemTestRuntimeAudit(rootDir, source, operation);
        const result = compileSystemTestPlan({
          plan: {
            schemaVersion: '1.0.0', systemId: 'another-system',
            ...planGovernance(['/items', '/items-v2'], ['prd:1', 'audit:system-v2']), runtimeAudit, cases: [source],
          },
          dataProfiles: { reversible: reversibleDataProfile() },
          rootDir,
        });

        expect(result.errors).toContain(`CASE-EDIT-001:${operation.error}`);
        expect(result.errors).toContain('CASE-EDIT-001:MUTATION_REQUIRED');
        expect(result.recipeCollection.recipes[0].mutation).toBeUndefined();
      } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
      }
    }
  });

  test('公共编译器应支持需要造数清理但禁止业务写入的负向用例', () => {
    const source: SystemTestPlanCase = {
      ...createRuntimeAuditedPlanCase(),
      caseId: 'CASE-CANCEL-001',
      ruleId: 'RULE-CANCEL-001',
      title: '取消编辑后服务端数据保持不变',
      action: 'negative',
      dataProfileId: 'fixture',
      actions: ['打开已有记录并修改草稿', '点击取消并核对未提交写请求'],
      mutation: undefined,
    };
    const result = compileSystemTestPlan({
      plan: {
        schemaVersion: '1.0.0',
        systemId: 'fixture-lifecycle-system',
        ...planGovernance(['/items'], ['prd:1']),
        cases: [source],
      },
      dataProfiles: {
        fixture: {
          mutationMode: 'fixture-reversible',
          seedAdapterId: 'system.seed',
          cleanupAdapterId: 'system.cleanup',
          apiResidueAdapterId: 'system.api-residue',
          uiResidueAdapterId: 'system.ui-residue',
          requiredOperationKeys: ['entity.seed'],
          probeAdapterIds: [],
          externalCapabilities: [],
        },
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.recipeCollection.recipes[0]).toEqual(expect.objectContaining({
      seed: { adapterId: 'system.seed' },
      cleanup: { adapterId: 'system.cleanup' },
    }));
    expect(result.recipeCollection.recipes[0]?.mutation).toBeUndefined();
  });

  test('运行通过只能触发人工评审队列，不能自动生成 formal 规则', () => {
    const fixture = createFixture();
    const rule = fixture.rules.rules[0];
    const dimensions = ['positive', 'negative', 'boundary', 'scope'] as const;
    const evidence: SystemTestRuleEvidence[] = dimensions.flatMap((dimension, index) => [0, 1, 2].map((variant) => ({
      evidenceId: `e-${index}-${variant}`,
      ruleId: rule.ruleId,
      versionFingerprint: variant === 0 ? 'version-a' : 'version-b',
      environmentId: 'env',
      dataVariantId: `${dimension}-${variant}`,
      dimension,
      result: 'supports' as const,
      uiEvidenceIds: [`ui-${index}-${variant}`],
      apiEvidenceIds: [`api-${index}-${variant}`],
      cleanupVerified: true,
    })));
    const review = buildSystemTestFormalReviewQueue(fixture.rules, evidence)[0];
    expect(review.status).toBe('ready-for-human-review');
    expect(rule.status).toBe('provisional');
    expect(() => approveSystemTestFormalRule({
      rule,
      review,
      decision: { decision: 'approve', confirmedBy: '', decidedAt: new Date().toISOString(), rationale: '', candidateFingerprint: review.candidateFingerprint },
    })).toThrow('人工审核人和理由不能为空');
    const formal = approveSystemTestFormalRule({
      rule,
      review,
      decision: {
        decision: 'approve', confirmedBy: 'reviewer', decidedAt: new Date().toISOString(),
        rationale: 'approved source reviewed', candidateFingerprint: review.candidateFingerprint,
      },
    });
    expect(formal).toMatchObject({ status: 'formal', authority: { sourceRole: 'human-formal-review', confirmedBy: 'reviewer' } });
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  test('定向运行必须在预检前收窄合同并拒绝未知或冲突筛选', () => {
    const fixture = createFixture();
    expect(resolveSystemTestCaseIds({}, ['--case-ids=CASE-001'])).toEqual(['CASE-001']);
    expect(resolveSystemTestCaseIds({ SYSTEM_TEST_CASE_IDS: 'CASE-001' }, [])).toEqual(['CASE-001']);
    expect(() => resolveSystemTestCaseIds(
      { SYSTEM_TEST_CASE_IDS: 'CASE-001' },
      ['--case-ids=CASE-002'],
    )).toThrow('系统用例筛选冲突');
    expect(() => resolveSystemTestCaseIds({}, ['--cases=CASE-001'])).toThrow('请使用 --case-ids=');
    const selected = selectSystemTestManifestCases(fixture.manifest, ['CASE-001']);
    expect(selected.errors).toEqual([]);
    expect(selected.manifest.cases.map((item) => item.caseId)).toEqual(['CASE-001']);
    expect(selectSystemTestManifestCases(fixture.manifest, ['CASE-UNKNOWN']).errors)
      .toEqual(['CASE_SELECTION_UNKNOWN:CASE-UNKNOWN']);
    expect(buildSystemTestCaseGrep(['CASE-001', 'case.special']))
      .toBe('@case-(?:CASE-001|case\\.special)(?=$|\\s)');
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  });

  test('系统测试业务运行可在标准证据报告器之外追加 Allure 报告器', () => {
    expect(resolveSystemTestBusinessReporterArgument({}, 'evidence.ts'))
      .toBe('line,evidence.ts');
    expect(resolveSystemTestBusinessReporterArgument({
      SYSTEM_TEST_ADDITIONAL_REPORTERS: 'allure-playwright,line,allure-playwright',
    }, 'evidence.ts')).toBe('line,evidence.ts,allure-playwright');
  });

  test('通用运行状态必须记录进程身份并回收死亡 runner 的运行中状态', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-run-state-'));
    const stalePath = path.join(directory, 'stale.json');
    const livePath = path.join(directory, 'live.json');
    const base: SystemTestRunState = {
      schemaVersion: '1.0.0', runId: 'run', systemId: 'system', status: 'running', phase: 'business',
      startedAt: '2026-08-14T08:00:00.000Z', updatedAt: '2026-08-14T08:00:00.000Z',
      runnerPid: 2_147_483_647, childPid: 2_147_483_646, exitCode: null, interruptionReason: null,
    };
    try {
      writeSystemTestRunState(stalePath, base);
      writeSystemTestRunState(livePath, { ...base, runnerPid: process.pid });
      expect(reconcileSystemTestRunState(stalePath, Date.parse('2026-08-14T08:10:00.000Z')))
        .toMatchObject({ status: 'interrupted', phase: 'completed', exitCode: 130, childPid: null });
      expect(reconcileSystemTestRunState(livePath)).toMatchObject({ status: 'running', runnerPid: process.pid });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('同应用跨域试点不能替代跨应用真实试点', () => {
    const referenceBaseline = {
      applicationId: 'reference-application', businessDomainId: 'reference-domain', planned: 144,
      executionEligible: 129, classifiedExclusions: 15, classifiedBlockers: 0,
      executed: 129, passed: 129, failed: 0, automationGap: 0,
      evidenceVerified: 129, evidenceMissing: 0, evidenceCoverageFingerprint: 'a'.repeat(64),
      responsibilityBreakdown: { passed: 129, deferred: 10, 'not-applicable': 5 },
      responsibilityClassified: true, apiUiZeroResidue: true,
    };
    const taxPilot = {
      pilotId: 'reference-domain-pilot', applicationId: 'reference-application',
      businessDomainId: 'secondary-domain', authenticationFamilyId: 'reference-oauth',
      validationAuthority: 'target-system' as const,
      authenticated: true, reversibleCrud: true, runtimePassed: true, evidenceComplete: true,
      apiUiZeroResidue: true, securityFindings: 0,
    };
    const candidate = evaluateSystemTestPlatformReadiness({ referenceBaseline, pilots: [taxPilot] });
    expect(candidate).toMatchObject({
      status: 'candidate',
      referenceBaselineReady: true,
      productBaselineReady: true,
      qualifiedCrossDomainPilotIds: [taxPilot.pilotId],
      qualifiedCrossApplicationPilotIds: [],
      blockers: ['CROSS_APPLICATION_PILOT_REQUIRED'],
      automaticFormalPromotionAllowed: false,
    });
    const eligible = evaluateSystemTestPlatformReadiness({
      referenceBaseline,
      pilots: [{ ...taxPilot, pilotId: 'another-app-pilot', applicationId: 'another-app' }],
    });
    expect(eligible.status).toBe('eligible-for-human-platform-review');
  });

  test('成熟度构建必须自动发现试点且自建参考系统不得触发定版门禁', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-pilot-discovery-'));
    const systemsRoot = path.join(rootDir, 'systems');
    const outputRoot = path.join(rootDir, 'output/system-test');
    try {
      writePilotArtifacts({
        systemsRoot,
        outputRoot,
        systemId: 'external-application',
        scope: {
          applicationId: 'external-application', businessDomainId: 'orders',
          authenticationFamilyId: 'external-session', validationAuthority: 'target-system',
        },
      });
      const externalOutput = path.join(outputRoot, 'external-application');
      const externalStatePath = path.join(externalOutput, 'latest-run-state.json');
      const externalState = JSON.parse(fs.readFileSync(externalStatePath, 'utf8')) as { runId: string };
      const readOnlyRunId = 'read-only-later-run';
      fs.cpSync(path.join(externalOutput, externalState.runId), path.join(externalOutput, readOnlyRunId), { recursive: true });
      const readOnlyEvidencePath = path.join(externalOutput, readOnlyRunId, 'evidence-ledger.json');
      const readOnlyEvidence = JSON.parse(fs.readFileSync(readOnlyEvidencePath, 'utf8')) as {
        cases: Array<{ runtimeEvidence?: { operationReceipts?: unknown[] } }>;
      };
      readOnlyEvidence.cases[0].runtimeEvidence = { operationReceipts: [] };
      fs.writeFileSync(readOnlyEvidencePath, JSON.stringify(readOnlyEvidence));
      fs.writeFileSync(externalStatePath, JSON.stringify({
        ...externalState,
        runId: readOnlyRunId,
        status: 'passed',
        phase: 'completed',
        exitCode: 0,
      }));
      writePilotArtifacts({
        systemsRoot,
        outputRoot,
        systemId: 'reference-application',
        scope: {
          applicationId: 'reference-application', businessDomainId: 'reference',
          authenticationFamilyId: 'reference-session', validationAuthority: 'self-controlled-reference',
        },
      });
      const discovered = discoverSystemTestPilotEvidence({ rootDir, systemsRoot, systemOutputRoot: outputRoot });
      expect(discovered.pilots.map((item) => item.pilotId)).toEqual(['external-application', 'reference-application']);
      expect(discovered.pilots.find((item) => item.pilotId === 'external-application')?.reversibleCrud).toBe(true);
      expect(discovered.sources.find((item) => item.pilotId === 'external-application')?.runReport).toContain(externalState.runId);
      expect(discovered.diagnostics).toEqual([]);
      const referenceBaseline = {
        applicationId: 'reference-application', businessDomainId: 'reference-domain', planned: 144,
        executionEligible: 129, classifiedExclusions: 15, classifiedBlockers: 0,
        executed: 129, passed: 129, failed: 0, automationGap: 0,
        evidenceVerified: 129, evidenceMissing: 0, evidenceCoverageFingerprint: 'a'.repeat(64),
        responsibilityBreakdown: { passed: 129, deferred: 10, 'not-applicable': 5 },
        responsibilityClassified: true, apiUiZeroResidue: true,
      };
      expect(evaluateSystemTestPlatformReadiness({ referenceBaseline, pilots: [discovered.pilots[1]] }).status)
        .toBe('candidate');
      expect(evaluateSystemTestPlatformReadiness({ referenceBaseline, pilots: discovered.pilots }).status)
        .toBe('eligible-for-human-platform-review');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('范围外配方集合变化可逐案复用，但目标用例指纹变化必须阻断旧试点', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-pilot-case-fingerprint-'));
    const systemsRoot = path.join(rootDir, 'systems');
    const outputRoot = path.join(rootDir, 'output/system-test');
    try {
      writePilotArtifacts({
        systemsRoot,
        outputRoot,
        systemId: 'case-scoped-pilot',
        scope: {
          applicationId: 'case-scoped-app', businessDomainId: 'catalog',
          authenticationFamilyId: 'session', validationAuthority: 'target-system',
        },
      });
      const systemRoot = path.join(systemsRoot, 'case-scoped-pilot');
      const recipesPath = path.join(systemRoot, 'recipes.json');
      const manifestPath = path.join(systemRoot, 'manifest.json');
      const recipes = JSON.parse(fs.readFileSync(recipesPath, 'utf8')) as {
        fingerprint: string; recipes: AutomationRecipe[];
      };
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SystemTestManifest;

      recipes.fingerprint = 'b'.repeat(64);
      manifest.sources.recipeCollectionFingerprint = recipes.fingerprint;
      fs.writeFileSync(recipesPath, JSON.stringify(recipes));
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      expect(discoverSystemTestPilotEvidence({ rootDir, systemsRoot, systemOutputRoot: outputRoot })
        .pilots[0]?.reversibleCrud).toBe(true);

      recipes.recipes[0].assertionContracts![0].terminalCondition = '目标用例已改变的终态';
      recipes.fingerprint = recipeCollectionFingerprint(recipes.recipes);
      manifest.sources.recipeCollectionFingerprint = recipes.fingerprint;
      fs.writeFileSync(recipesPath, JSON.stringify(recipes));
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      const changed = discoverSystemTestPilotEvidence({ rootDir, systemsRoot, systemOutputRoot: outputRoot });
      expect(changed.pilots).toEqual([]);
      expect(changed.diagnostics).toContain('PILOT_RUNTIME_MISSING:case-scoped-pilot:current-complete-run');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('可逆 CRUD 资格必须由同一用例的完整有序生命周期收据证明', () => {
    const operation = (sequence: number, lifecyclePhase: string) => ({
      operationKey: `pilot:${lifecyclePhase}`,
      method: lifecyclePhase.endsWith('-ui') ? 'UI' : 'API',
      observed: true,
      status: 'passed',
      sequence,
      details: { lifecyclePhase },
    });
    const phases = [
      'create', 'read-created-api', 'read-created-ui', 'update', 'read-updated-api',
      'read-updated-ui', 'delete', 'read-absent-api', 'read-absent-ui',
    ];
    const complete = {
      summary: { selected: 1, executed: 1, evidenceIncomplete: 0 },
      cases: [{
        caseId: 'PILOT-001',
        runtimeEvidence: { operationReceipts: phases.map((phase, index) => operation(index + 1, phase)) },
        evidence: { apiZeroResidue: true, uiZeroResidue: true },
      }],
    };
    expect(hasCompleteReversibleCrudLifecycle(complete)).toBe(true);
    expect(hasCompleteReversibleCrudLifecycle({
      ...complete,
      cases: [{
        ...complete.cases[0],
        runtimeEvidence: { operationReceipts: complete.cases[0].runtimeEvidence.operationReceipts.filter((item) => item.details.lifecyclePhase !== 'read-absent-ui') },
      }],
    })).toBe(false);
    expect(hasCompleteReversibleCrudLifecycle({
      ...complete,
      cases: [{ ...complete.cases[0], evidence: { apiZeroResidue: true, uiZeroResidue: false } }],
    })).toBe(false);
  });

  test('平台评审队列必须绑定当前证据指纹且禁止自动批准', () => {
    const referenceBaseline = {
      applicationId: 'reference-application', businessDomainId: 'reference-domain', planned: 144,
      executionEligible: 129, classifiedExclusions: 15, classifiedBlockers: 0,
      executed: 129, passed: 129, failed: 0, automationGap: 0,
      evidenceVerified: 129, evidenceMissing: 0, evidenceCoverageFingerprint: 'a'.repeat(64),
      responsibilityBreakdown: { passed: 129, deferred: 10, 'not-applicable': 5 },
      responsibilityClassified: true, apiUiZeroResidue: true,
    };
    const pilot = {
      pilotId: 'tax-pilot', applicationId: 'another-application', businessDomainId: 'store-operations',
      authenticationFamilyId: 'another-application-auth', validationAuthority: 'target-system' as const,
      authenticated: true, reversibleCrud: true, runtimePassed: true, evidenceComplete: true,
      apiUiZeroResidue: true, securityFindings: 0,
    };
    const readiness = evaluateSystemTestPlatformReadiness({ referenceBaseline, pilots: [pilot] });
    const queue = buildSystemTestPlatformReviewQueue({
      readiness, referenceBaseline, pilots: [pilot], governanceFingerprint: 'governance-v1',
    });
    expect(queue).toMatchObject({
      status: 'ready-for-human-review', humanApprovalRequired: true, approved: false,
      blockers: [], evidence: { pilotIds: ['tax-pilot'] },
    });
    expect(queue.candidateFingerprint).toMatch(/^[a-f0-9]{64}$/);
    const changed = buildSystemTestPlatformReviewQueue({
      readiness, referenceBaseline, pilots: [{ ...pilot, runtimePassed: false }],
      governanceFingerprint: 'governance-v1',
    });
    expect(changed.candidateFingerprint).not.toBe(queue.candidateFingerprint);
    expect(applySystemTestPlatformReviewDecision({
      queue,
      decision: {
        schemaVersion: '1.0.0', decisionId: 'hold-001', decision: 'hold', confirmedBy: 'reviewer',
        decidedAt: '2026-08-15T00:00:00.000Z', rationale: '继续观察', candidateFingerprint: queue.candidateFingerprint,
      },
    })).toMatchObject({ status: 'not-approved' });
    expect(applySystemTestPlatformReviewDecision({
      queue,
      decision: {
        schemaVersion: '1.0.0', decisionId: 'approve-001', decision: 'approve', confirmedBy: 'reviewer',
        decidedAt: '2026-08-15T00:00:00.000Z', rationale: '已审阅运行证据', candidateFingerprint: queue.candidateFingerprint,
      },
    })).toMatchObject({ status: 'formal', authority: { sourceRole: 'human-platform-review' } });
    expect(() => applySystemTestPlatformReviewDecision({
      queue,
      decision: {
        schemaVersion: '1.0.0', decisionId: 'approve-002', decision: 'approve', confirmedBy: 'reviewer',
        decidedAt: '2026-08-15T00:00:00.000Z', rationale: '过期指纹', candidateFingerprint: 'stale',
      },
    })).toThrow('平台候选指纹不一致');
    const release = applySystemTestPlatformReviewDecision({
      queue,
      decision: {
        schemaVersion: '1.0.0', decisionId: 'approve-003', decision: 'approve', confirmedBy: 'reviewer',
        decidedAt: '2026-08-15T00:00:00.000Z', rationale: '已审阅运行证据', candidateFingerprint: queue.candidateFingerprint,
      },
    });
    expect(assessSystemTestPlatformRelease({ release, currentQueue: changed })).toMatchObject({ status: 'not-approved' });
  });

  test('治理指纹必须使用逻辑文件身份，不得随物理目录或盘符变化', () => {
    const firstRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-root-a-'));
    const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-root-b-'));
    try {
      const firstFile = path.join(firstRoot, 'rules.md');
      const secondFile = path.join(secondRoot, 'rules.md');
      fs.writeFileSync(firstFile, '# rules\n', 'utf8');
      fs.writeFileSync(secondFile, '# rules\n', 'utf8');
      expect(fingerprintGovernance([{ path: firstFile, identity: 'project/rules.md' }], firstRoot))
        .toBe(fingerprintGovernance([{ path: secondFile, identity: 'project/rules.md' }], secondRoot));
    } finally {
      fs.rmSync(firstRoot, { recursive: true, force: true });
      fs.rmSync(secondRoot, { recursive: true, force: true });
    }
  });

  test('参考基线数量不守恒时不得进入平台评审', () => {
    const referenceBaseline = {
      applicationId: 'any-app', businessDomainId: 'orders', planned: 10,
      executionEligible: 8, classifiedExclusions: 1, classifiedBlockers: 0,
      executed: 8, passed: 8, failed: 0, automationGap: 0,
      evidenceVerified: 8, evidenceMissing: 0, evidenceCoverageFingerprint: 'a'.repeat(64),
      responsibilityBreakdown: { passed: 8, deferred: 1 },
      responsibilityClassified: true, apiUiZeroResidue: true,
    };
    const result = evaluateSystemTestPlatformReadiness({ referenceBaseline, pilots: [] });
    expect(result).toMatchObject({
      status: 'candidate', referenceBaselineReady: false,
      blockers: ['REFERENCE_BASELINE_NOT_READY', 'CROSS_DOMAIN_PILOT_REQUIRED', 'CROSS_APPLICATION_PILOT_REQUIRED'],
    });
  });

  test('分类闭环可作为任意系统参考基线且过期正式发布会自动撤销', () => {
    const cases = [
      ...Array.from({ length: 3 }, (_, index) => ({
        caseId: `PASS-${index}`, state: 'evidence-passed', responsibilityClass: 'passed' as const,
        caseFingerprint: `case-${index}`,
      })),
      { caseId: 'DEFERRED-1', state: 'deferred', responsibilityClass: 'deferred' as const },
      { caseId: 'NA-1', state: 'not-applicable', responsibilityClass: 'not-applicable' as const },
    ];
    const referenceBaseline = buildSystemTestReferenceBaseline({
      applicationId: 'any-app', businessDomainId: 'orders',
      cases,
      receipts: cases.filter((item) => item.responsibilityClass === 'passed').map((item, index) => ({
        caseId: item.caseId, caseFingerprint: item.caseFingerprint!, status: 'passed', evidenceStatus: 'complete',
        cleanupEvidence: { apiZeroResidue: true, uiZeroResidue: true },
        receiptEvidenceFingerprint: `${index + 1}`.repeat(64), evidenceFileFingerprint: 'f'.repeat(64),
        recordedAt: `2026-08-2${index}T00:00:00.000Z`,
      })),
    }).baseline;
    expect(referenceBaseline).toMatchObject({
      planned: 5, executionEligible: 3, classifiedExclusions: 2, classifiedBlockers: 0,
      executed: 3, passed: 3, failed: 0, automationGap: 0,
      evidenceVerified: 3, evidenceMissing: 0, responsibilityClassified: true,
    });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'system-platform-release-'));
    const releasePath = path.join(directory, 'platform-release.json');
    const currentQueue = {
      schemaVersion: '1.0.0' as const,
      status: 'ready-for-human-review' as const,
      candidateFingerprint: 'current-candidate', governanceFingerprint: 'current-governance',
      blockers: [], humanApprovalRequired: true as const, approved: false as const,
      evidence: {
        referenceBaselineReady: true, productBaselineReady: true,
        qualifiedCrossDomainPilotIds: ['pilot'], qualifiedCrossApplicationPilotIds: [], pilotIds: ['pilot'],
      },
    };
    try {
      fs.writeFileSync(releasePath, JSON.stringify({
        schemaVersion: '1.0.0', status: 'formal', candidateFingerprint: 'stale-candidate',
        governanceFingerprint: 'stale-governance',
      }));
      expect(reconcilePlatformReleaseFile(releasePath, currentQueue)).toMatchObject({
        status: 'not-approved', candidateFingerprint: 'current-candidate', governanceFingerprint: 'current-governance',
      });
      expect(JSON.parse(fs.readFileSync(releasePath, 'utf8'))).not.toHaveProperty('authority');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('参考基线必须优先采用当前用例指纹且证据完整的收据', () => {
    const caseFingerprint = 'sha256:current';
    const result = buildSystemTestReferenceBaseline({
      applicationId: 'any-app',
      businessDomainId: 'orders',
      cases: [{
        caseId: 'CASE-1', state: 'evidence-passed', responsibilityClass: 'passed', caseFingerprint,
      }],
      receipts: [
        {
          caseId: 'CASE-1', caseFingerprint, status: 'passed', evidenceStatus: 'complete',
          cleanupEvidence: null, receiptEvidenceFingerprint: null, evidenceFileFingerprint: null,
          recordedAt: '2026-08-21T00:00:00.000Z',
        },
        {
          caseId: 'CASE-1', caseFingerprint, status: 'passed', evidenceStatus: 'complete',
          cleanupEvidence: { apiZeroResidue: true, uiZeroResidue: true },
          receiptEvidenceFingerprint: 'a'.repeat(64), evidenceFileFingerprint: 'b'.repeat(64),
          recordedAt: '2026-08-21T00:00:00.000Z',
        },
        {
          caseId: 'CASE-1', caseFingerprint: 'sha256:obsolete', status: 'passed', evidenceStatus: 'complete',
          cleanupEvidence: { apiZeroResidue: true, uiZeroResidue: true },
          receiptEvidenceFingerprint: 'c'.repeat(64), evidenceFileFingerprint: 'd'.repeat(64),
          recordedAt: '2026-08-22T00:00:00.000Z',
        },
      ],
    });

    expect(result.baseline).toMatchObject({
      passed: 1, evidenceVerified: 1, evidenceMissing: 0, apiUiZeroResidue: true,
    });
    expect(result.verifiedCaseIds).toEqual(['CASE-1']);
  });

  test('平台治理发布指纹必须覆盖语义门禁和上下文证据执行器', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/build-platform-review-queue.ts'), 'utf8');
    expect(source).toContain('governanceFiles');
    expect(source).toContain('fingerprintGovernance');
    expect(source).toContain('assessSystemTestPlatformRelease');
    expect(source).not.toContain('project-specific');
  });

  test('跨对话推荐必须固化目的、预期结果和后续影响三问', () => {
    const documents = [fs.readFileSync(path.resolve(__dirname, '../../README.md'), 'utf8')];
    for (const document of documents) {
      expect(document).toContain('目的');
      expect(document).toContain('预期结果');
      expect(document).toContain('后续影响');
      expect(document).toContain('必须');
      expect(document).toContain('可选');
      expect(document).toContain('暂不建议');
    }
    expect(documents[0]).toContain('跨测试方案');
  });
});

const grantEnvKeys = [
  'SYSTEM_TEST_EXECUTION_GRANT_PATH',
  'SYSTEM_TEST_EXECUTION_GRANT_TOKEN',
  'SYSTEM_TEST_EXECUTION_APPLICATION_ID',
  'SYSTEM_TEST_EXECUTION_RUN_ID',
  'SYSTEM_TEST_EXECUTION_CANDIDATE_FINGERPRINT',
] as const;

function captureGrantEnv(): Record<(typeof grantEnvKeys)[number], string | undefined> {
  return Object.fromEntries(grantEnvKeys.map((key) => [key, process.env[key]])) as Record<
    (typeof grantEnvKeys)[number], string | undefined
  >;
}

function restoreGrantEnv(previous: Record<(typeof grantEnvKeys)[number], string | undefined>): void {
  for (const key of grantEnvKeys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
}

function writePilotArtifacts(input: {
  systemsRoot: string;
  outputRoot: string;
  systemId: string;
  scope: NonNullable<SystemTestManifest['system']['portabilityScope']>;
}): void {
  const systemRoot = path.join(input.systemsRoot, input.systemId);
  const runId = `${input.systemId}-run`;
  const runRoot = path.join(input.outputRoot, input.systemId, runId);
  fs.mkdirSync(systemRoot, { recursive: true });
  fs.mkdirSync(runRoot, { recursive: true });
  for (const file of ['playwright.config.ts', 'setup.spec.ts', 'preflight.spec.ts', 'system.spec.ts']) {
    fs.writeFileSync(path.join(systemRoot, file), file === 'system.spec.ts'
      ? "import { executeSystemTestRecipe } from './automation/system-test/system-test-recipe-executor';\nexecuteSystemTestRecipe();\n"
      : 'export {};\n');
  }
  const relativeRoot = `systems/${input.systemId}`;
  const claimId = 'CASE-001:expectation-1';
  const operationKey = `${input.systemId}.entity.update`;
  const recipe: AutomationRecipe = {
    schemaVersion: '1.0.0', id: `${input.systemId}:case-001`, caseId: 'CASE-001', title: 'pilot', tags: [],
    route: '/', action: 'edit', traceabilityId: `trace:sop:${input.systemId}`, sourceIds: ['source:pilot'],
    claimIds: [claimId], coverageIds: ['coverage:pilot'], generationAllowed: true,
    capabilities: [{ id: 'pilot.open' }],
    contextGuards: [
      {
        adapterId: 'pilot.context',
        input: {
          phase: 'before-action', expectedRoute: '/', expectedLocale: 'zh-CN', expectedRoleId: 'test-role',
          expectedTenantScope: 'test-tenant', businessIdentityStrategy: 'none',
        },
      },
      {
        adapterId: 'pilot.context',
        input: {
          phase: 'before-assertion', expectedRoute: '/', expectedLocale: 'zh-CN', expectedRoleId: 'test-role',
          expectedTenantScope: 'test-tenant', businessIdentityStrategy: 'none',
        },
      },
    ],
    seed: { adapterId: 'pilot.seed' }, mutation: { method: 'PUT', operationKey }, cleanup: { adapterId: 'pilot.cleanup' },
    assertions: [{ adapterId: 'pilot.assert.visible', claimIds: [claimId] }],
    assertionContracts: [{
      claimId, adapterId: 'pilot.assert.visible', observationChannel: 'ui', authority: 'user-visible',
      terminalCondition: '目标稳定可见', sourceIds: ['source:pilot'], contractIds: ['ui:pilot'],
    }],
  };
  const recipeFingerprint = recipeCollectionFingerprint([recipe]);
  const ruleValues: SystemTestRuleLedger['rules'] = [{
    ruleId: 'RULE-001', caseId: 'CASE-001', status: 'provisional', outcomeClaims: [claimId],
    outcomes: ['visible'], formalPromotionAllowed: false,
  }];
  const rules: SystemTestRuleLedger = {
    schemaVersion: '1.0.0', fingerprint: fingerprintSystemTestValue(ruleValues), rules: ruleValues,
  };
  const codePath = `${relativeRoot}/system.spec.ts`;
  const adapters: SystemTestAdapterCatalog = {
    schemaVersion: '1.0.0', systemId: input.systemId, operationKeys: [operationKey], externalCapabilities: [],
    adapters: [
      { id: 'pilot.auth', kind: 'auth', actions: ['read'], implementation: implementation(path.dirname(input.systemsRoot), `${relativeRoot}/setup.spec.ts`) },
      { id: 'pilot.context', kind: 'context-guard', actions: ['edit'], implementation: implementation(path.dirname(input.systemsRoot), codePath) },
      { id: 'pilot.probe', kind: 'probe', actions: ['edit'], implementation: implementation(path.dirname(input.systemsRoot), `${relativeRoot}/preflight.spec.ts`) },
      { id: 'pilot.open', kind: 'capability', actions: ['edit'], implementation: implementation(path.dirname(input.systemsRoot), codePath) },
      { id: 'pilot.assert.visible', kind: 'assertion', actions: ['edit'], observationChannels: ['ui'], implementation: implementation(path.dirname(input.systemsRoot), codePath) },
      { id: 'pilot.seed', kind: 'seed', actions: ['edit'], implementation: implementation(path.dirname(input.systemsRoot), codePath) },
      { id: 'pilot.cleanup', kind: 'cleanup', actions: ['edit'], implementation: implementation(path.dirname(input.systemsRoot), codePath) },
      { id: 'pilot.api-residue', kind: 'api-residue', actions: ['edit'], implementation: implementation(path.dirname(input.systemsRoot), codePath) },
      { id: 'pilot.ui-residue', kind: 'ui-residue', actions: ['edit'], implementation: implementation(path.dirname(input.systemsRoot), codePath) },
    ],
  };
  const manifest: SystemTestManifest = {
    schemaVersion: '1.0.0',
    system: {
      systemId: input.systemId, displayName: input.systemId, baseURL: 'https://example.test',
      markerPrefix: `AUTO_AUDIT_${input.systemId}`, executionContext: planExecutionContext(), portabilityScope: input.scope,
    },
    sources: {
      recipeCollectionPath: `${relativeRoot}/recipes.json`, recipeCollectionFingerprint: recipeFingerprint,
      ruleLedgerPath: `${relativeRoot}/rules.json`, ruleLedgerFingerprint: rules.fingerprint,
      adapterCatalogPath: `${relativeRoot}/adapters.json`, adapterCatalogFingerprint: fingerprintSystemTestValue(adapters),
    },
    execution: {
      playwrightConfigPath: `${relativeRoot}/playwright.config.ts`, setupSpecPath: `${relativeRoot}/setup.spec.ts`,
      setupProject: 'setup', preflightSpecPath: `${relativeRoot}/preflight.spec.ts`,
      specPath: `${relativeRoot}/system.spec.ts`, project: 'system', workers: 1, retries: 0, authAdapterId: 'pilot.auth',
    },
    dataProfiles: { reversible: {
      mutationMode: 'reversible', seedAdapterId: 'pilot.seed', cleanupAdapterId: 'pilot.cleanup',
      apiResidueAdapterId: 'pilot.api-residue', uiResidueAdapterId: 'pilot.ui-residue',
      requiredOperationKeys: [operationKey], probeAdapterIds: ['pilot.probe'], externalCapabilities: [],
    } },
    cases: [{ caseId: 'CASE-001', ruleId: 'RULE-001', recipeId: recipe.id, dataProfileId: 'reversible' }],
    policies: {
      stallMs: 180_000, maxRunMs: 900_000, maxConsecutiveFailures: 3, maxDuplicateFailureFingerprint: 2,
      minimumCompletedForFailureRate: 1, maximumEnvironmentFailureRate: 0.5,
      requireExplicitClaimReceipts: true, requireApiZeroResidue: true, requireUiZeroResidue: true,
      runtimeMayPromoteRuleToFormal: false, humanApprovalRequiredForFormal: true,
    },
  };
  const compiled = compileSystemTestRunContract({
    rootDir: path.dirname(input.systemsRoot),
    manifest,
    recipes: [recipe],
    recipeCollectionFingerprint: recipeFingerprint,
    rules,
    adapters,
  });
  if (compiled.errors.length > 0) throw new Error(`PILOT_FIXTURE_INVALID:${compiled.errors.join(',')}`);
  const caseFingerprint = fingerprintSystemTestValue(compiled.contract.cases[0]);
  fs.writeFileSync(path.join(systemRoot, 'recipes.json'), JSON.stringify({ fingerprint: recipeFingerprint, recipes: [recipe] }));
  fs.writeFileSync(path.join(systemRoot, 'rules.json'), JSON.stringify(rules));
  fs.writeFileSync(path.join(systemRoot, 'adapters.json'), JSON.stringify(adapters));
  fs.writeFileSync(path.join(systemRoot, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(input.outputRoot, input.systemId, 'latest-run-state.json'), JSON.stringify({
    runId, status: 'passed', phase: 'completed', exitCode: 0,
  }));
  fs.writeFileSync(path.join(runRoot, 'run-report.json'), JSON.stringify({ status: 'passed', exitCode: 0, securityFindings: 0 }));
  fs.writeFileSync(path.join(runRoot, 'evidence-ledger.json'), JSON.stringify({
    summary: { selected: 1, executed: 1, evidenceIncomplete: 0 },
    cases: [{
      caseId: 'CASE-001',
      caseFingerprint,
      runtimeEvidence: {
        operationReceipts: [
          ['create', 'POST'],
          ['read-created-api', 'GET'],
          ['read-created-ui', 'UI'],
          ['update', 'PUT'],
          ['read-updated-api', 'GET'],
          ['read-updated-ui', 'UI'],
          ['delete', 'DELETE'],
          ['read-absent-api', 'GET'],
          ['read-absent-ui', 'UI'],
        ].map(([lifecyclePhase, method], index) => ({
          operationKey: `pilot:${lifecyclePhase}`,
          method,
          observed: true,
          status: 'passed',
          sequence: index + 1,
          details: { lifecyclePhase },
        })),
      },
      evidence: { apiZeroResidue: true, uiZeroResidue: true },
    }],
  }));
  fs.writeFileSync(path.join(runRoot, 'contract.json'), JSON.stringify({
    system: manifest.system,
    cases: compiled.contract.cases,
    summary: { mutation: 1 },
    sourceFingerprints: {
      recipes: manifest.sources.recipeCollectionFingerprint,
      rules: manifest.sources.ruleLedgerFingerprint,
      adapters: manifest.sources.adapterCatalogFingerprint,
      evidenceRuntime: buildSystemTestEvidenceRuntimeFingerprint(),
    },
  }));
}

function planExecutionContext() {
  return {
    environmentId: 'contract-test',
    locale: 'zh-CN',
    roleId: 'test-role',
    tenantScope: 'test-tenant',
    featureFlagFingerprint: createHash('sha256').update('no-feature-flags').digest('hex'),
  };
}

function planGovernance(routes: `/${string}`[], sourceIds: string[]) {
  const sourceRecords = sourceIds.map((sourceId) => ({
    sourceId,
    kind: sourceId.startsWith('audit:') ? 'runtime-evidence' as const : 'formal-case' as const,
    path: `contracts/${sourceId.replaceAll(':', '-')}.json`,
    fingerprint: createHash('sha256').update(sourceId).digest('hex'),
    verified: true as const,
    routes,
    contractIds: ['ui:items-list'],
    observationChannels: ['ui'] as ['ui'],
  }));
  return {
    executionContext: planExecutionContext(),
    sourceRegistry: { schemaVersion: '1.0.0' as const, sources: sourceRecords },
    governance: {
      schemaVersion: '1.0.0' as const,
      semanticDuplicatePolicy: { enabled: true as const, requireVariantEvidence: true as const },
      assertionSurfaces: [{
        surfaceId: 'ui.items-list', observationChannel: 'ui' as const, authority: 'user-visible' as const,
        routes, fieldIds: ['items.list'],
      }],
      contextGuardPolicy: {
        adapterId: 'system.context', phases: ['before-action', 'before-assertion'] as ['before-action', 'before-assertion'],
        requiredChecks: ['route', 'locale', 'role', 'tenant', 'business-identity'] as Array<
          'route' | 'locale' | 'role' | 'tenant' | 'business-identity'
        >,
      },
      feedbackPolicy: {
        exactFeedbackRequiresRuntimeEvidence: true as const,
        mutationFeedbackRequiresOperationCorrelation: true as const,
      },
    },
  };
}

function semanticContract(variantId: string, variantSourceIds: string[]) {
  return {
    businessObjectId: 'items', scenarioFamilyId: 'list', stateTransitionId: 'open-list', scopeId: 'items-list',
    variantId, variantSourceIds, businessIdentityStrategy: 'none' as const,
  };
}

function governedReadPlan(sourceIds: string[] = ['prd:1']): import('../../src/automation/system-test/system-test-plan-compiler').SystemTestPlan {
  return {
    schemaVersion: '1.0.0',
    systemId: 'governed-system',
    ...planGovernance(['/items'], sourceIds),
    cases: [{
      caseId: 'CASE-READ-001', ruleId: 'RULE-READ-001', title: '列表可见', sourceIds: [...sourceIds],
      route: '/items', action: 'read', dataProfileId: 'read', coverageIds: ['route:items'],
      contractIds: ['ui:items-list'], conditions: ['已进入系统'], actions: ['打开列表'],
      expectations: [{
        expected: '列表可见', assertionAdapterId: 'system.assert.items-visible', observationChannel: 'ui',
        authority: 'user-visible', terminalCondition: '列表稳定显示', fieldId: 'items.list',
        assertionSurfaceId: 'ui.items-list', sourceIds: [...sourceIds], contractIds: ['ui:items-list'],
      }],
      capabilities: [{ id: 'navigation.open-items' }],
      semantics: semanticContract('default', [...sourceIds]),
    }],
  };
}

function createFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-contract-'));
  for (const file of ['playwright.config.ts', 'setup.spec.ts', 'preflight.spec.ts', 'system.spec.ts']) {
    fs.writeFileSync(path.join(rootDir, file), file === 'system.spec.ts'
      ? "import { executeSystemTestRecipe } from './automation/system-test/system-test-recipe-executor';\nexecuteSystemTestRecipe();\n"
      : 'export {};\n');
  }
  const claimId = 'CASE-001:expectation-1';
  const recipe: AutomationRecipe = {
    schemaVersion: '1.0.0', id: 'system:case-001', caseId: 'CASE-001', title: 'case', tags: [], route: '/',
    action: 'read', traceabilityId: 'trace:sop:system:case-001', sourceIds: ['source:1'], claimIds: [claimId],
    coverageIds: ['coverage:1'], generationAllowed: true,
    capabilities: [{ id: 'navigation.open' }],
    contextGuards: [
      {
        adapterId: 'system.context',
        input: {
          phase: 'before-action', expectedRoute: '/', routeMatch: 'exact', expectedLocale: 'zh-CN',
          expectedRoleId: 'test-role', expectedTenantScope: 'test-tenant', businessIdentityStrategy: 'none',
        },
      },
      {
        adapterId: 'system.context',
        input: {
          phase: 'before-assertion', expectedRoute: '/', routeMatch: 'exact', expectedLocale: 'zh-CN',
          expectedRoleId: 'test-role', expectedTenantScope: 'test-tenant', businessIdentityStrategy: 'none',
        },
      },
    ],
    assertions: [{ adapterId: 'system.assert.visible', claimIds: [claimId] }],
    assertionContracts: [{
      claimId, adapterId: 'system.assert.visible', observationChannel: 'ui', authority: 'user-visible',
      terminalCondition: '目标元素稳定可见', sourceIds: ['source:1'], contractIds: ['ui:root-visible'],
    }],
  };
  const recipeFingerprint = recipeCollectionFingerprint([recipe]);
  const ruleValues: SystemTestRuleLedger['rules'] = [{
    ruleId: 'RULE-001', caseId: 'CASE-001', status: 'provisional', outcomeClaims: [claimId],
    outcomes: ['visible'], formalPromotionAllowed: false,
  }];
  const rules: SystemTestRuleLedger = { schemaVersion: '1.0.0', fingerprint: fingerprintSystemTestValue(ruleValues), rules: ruleValues };
  const adapters: SystemTestAdapterCatalog = {
    schemaVersion: '1.0.0', systemId: 'reference-system', operationKeys: [], externalCapabilities: [],
    adapters: [
      { id: 'system.auth', kind: 'auth', actions: ['read'], implementation: implementation(rootDir, 'setup.spec.ts') },
      { id: 'system.context', kind: 'context-guard', actions: ['read'], implementation: implementation(rootDir, 'system.spec.ts') },
      { id: 'system.probe', kind: 'probe', actions: ['read'], implementation: implementation(rootDir, 'preflight.spec.ts') },
      { id: 'navigation.open', kind: 'capability', actions: ['read'], implementation: implementation(rootDir, 'system.spec.ts') },
      {
        id: 'system.assert.visible', kind: 'assertion', actions: ['read'], observationChannels: ['ui'],
        implementation: implementation(rootDir, 'system.spec.ts'),
      },
    ],
  };
  const manifest: SystemTestManifest = {
    schemaVersion: '1.0.0',
    system: {
      systemId: 'reference-system', displayName: 'Reference', baseURL: 'http://127.0.0.1:18080',
      markerPrefix: 'AUTO_AUDIT_REFERENCE', executionContext: planExecutionContext(),
    },
    sources: {
      recipeCollectionPath: 'recipes.json', recipeCollectionFingerprint: recipeFingerprint,
      ruleLedgerPath: 'rules.json', ruleLedgerFingerprint: rules.fingerprint,
      adapterCatalogPath: 'adapters.json', adapterCatalogFingerprint: fingerprintSystemTestValue(adapters),
    },
    execution: {
      playwrightConfigPath: 'playwright.config.ts', setupSpecPath: 'setup.spec.ts', setupProject: 'setup',
      preflightSpecPath: 'preflight.spec.ts', specPath: 'system.spec.ts', project: 'system', workers: 1, retries: 0,
      authAdapterId: 'system.auth',
    },
    dataProfiles: { read: { mutationMode: 'none', requiredOperationKeys: [], probeAdapterIds: ['system.probe'], externalCapabilities: [] } },
    cases: [{ caseId: 'CASE-001', ruleId: 'RULE-001', recipeId: recipe.id, dataProfileId: 'read' }],
    policies: {
      stallMs: 180_000, maxRunMs: 900_000, maxConsecutiveFailures: 3, maxDuplicateFailureFingerprint: 2,
      minimumCompletedForFailureRate: 4, maximumEnvironmentFailureRate: 0.5,
      requireExplicitClaimReceipts: true, requireApiZeroResidue: true, requireUiZeroResidue: true,
      runtimeMayPromoteRuleToFormal: false, humanApprovalRequiredForFormal: true,
    },
  };
  return { rootDir, recipe, recipeFingerprint, rules, adapters, manifest };
}

function createRuntimeAuditedPlanCase(): SystemTestPlanCase {
  return {
    caseId: 'CASE-EDIT-001',
    ruleId: 'RULE-EDIT-001',
    title: '旧版列表可见',
    sourceIds: ['prd:1'],
    route: '/items',
    action: 'edit',
    dataProfileId: 'reversible',
    coverageIds: ['coverage:items'],
    contractIds: ['ui:items-list'],
    conditions: ['已进入系统'],
    actions: ['编辑商品'],
    expectations: [{
      expected: '旧版列表可见', assertionAdapterId: 'system.assert.items-visible', observationChannel: 'ui',
      authority: 'user-visible', terminalCondition: '列表稳定显示', fieldId: 'items.list',
      assertionSurfaceId: 'ui.items-list', sourceIds: ['prd:1'], contractIds: ['ui:items-list'],
    }],
    capabilities: [{ id: 'navigation.open-items' }],
    semantics: { ...semanticContract('runtime-audited-edit', ['prd:1']), businessIdentityStrategy: 'server-id' },
    mutation: { method: 'PUT', operationKey: 'entity.update' },
  };
}

function reversibleDataProfile() {
  return {
    mutationMode: 'reversible' as const,
    seedAdapterId: 'system.seed',
    cleanupAdapterId: 'system.cleanup',
    requiredOperationKeys: [],
    probeAdapterIds: [],
    externalCapabilities: [],
  };
}

function createSystemTestRuntimeAudit(
  rootDir: string,
  source: SystemTestPlanCase,
  operation: { method: string; operationKey?: string },
  decisionMode: 'automatic' | 'human' = 'human',
): RuntimeAuditCorrectionDocument {
  const evidenceDirectory = path.join(rootDir, 'audit');
  const evidencePath = path.join(evidenceDirectory, 'system-v2.json');
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  fs.writeFileSync(evidencePath, JSON.stringify({ route: '/items-v2', operation }));
  const candidate = {
    caseId: source.caseId,
    title: source.title,
    preconditions: source.conditions,
    actions: source.actions,
    expectedResults: source.expectations.map((item) => item.expected),
    route: source.route,
    capabilityIds: source.capabilities.map((item) => item.id),
    assertionAdapterIds: source.expectations.map((item) => item.assertionAdapterId),
    coverageIds: source.coverageIds,
    sourceIds: source.sourceIds,
  };
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: '2.0.0',
    collectionId: 'system-test-runtime-audit-v2',
    planId: 'another-system',
    generatedAt: timestamp,
    planFingerprint: fingerprintRuntimeAuditablePlan([candidate]),
    context: {
      applicationVersionFingerprint: 'app-v2',
      environmentId: 'qa',
      roleId: 'tester',
      locale: 'zh-CN',
      maxEvidenceAgeDays: 30,
    },
    evidenceDiscovery: { rootPaths: ['audit'], extensions: ['.json'], strict: true },
    autoApprovalPolicy: {
      policyId: 'runtime-evidence-safe-v1',
      enabled: true,
      minimumConsumedEvidence: 1,
      allowedActions: ['no-change', 'correct-case'],
      allowBusinessRuleChanges: false,
      allowTechnicalBindingChanges: true,
      allowCoverageChanges: true,
      requireMutationSafety: true,
    },
    evidenceInventory: [{
      evidenceId: 'audit:system-v2',
      path: 'audit/system-v2.json',
      sha256: fingerprintFile(fs.readFileSync(evidencePath)),
      observedAt: timestamp,
      disposition: 'consumed',
      applicationVersionFingerprint: 'app-v2',
      environmentId: 'qa',
      roleId: 'tester',
      locale: 'zh-CN',
    }],
    coverageInventory: [{
      coverageId: 'coverage:items-v2',
      kind: 'route',
      route: '/items-v2',
      sourceIds: ['audit:system-v2'],
      disposition: 'required',
      linkedCaseIds: [source.caseId],
    }],
    corrections: [{
      caseId: source.caseId,
      reviewedCaseFingerprint: fingerprintRuntimeAuditableCase(candidate),
      evidenceIds: ['audit:system-v2'],
      status: decisionMode === 'automatic' ? 'auto-confirmed-runtime' : 'human-confirmed-runtime',
      ...(decisionMode === 'automatic' ? {
        automatedDecision: {
          policyId: 'runtime-evidence-safe-v1',
          decisionEngine: 'codex:test-expert',
          decidedAt: timestamp,
          rationale: '技术绑定运行证据满足自动裁决策略',
        },
      } : {
        reviewedBy: '人工审核',
        reviewedAt: timestamp,
      }),
      observation: {
        locale: 'zh-CN',
        route: '/items-v2',
        pageMode: 'edit',
        applicationVersionFingerprint: 'app-v2',
        environmentId: 'qa',
        roleId: 'tester',
        businessWriteRequest: 'sent',
        persisted: 'yes',
        cleanup: { required: true, apiZeroResidue: true, uiZeroResidue: true },
        network: [{
          method: operation.method,
          path: '/ops/items/v2',
          operationKey: operation.operationKey,
          outcome: 'sent',
        }],
      },
      impacts: { businessRule: 'none', technicalBinding: 'update', coverage: 'update' },
      resolution: {
        action: 'correct-case',
        reason: '运行时审计确认新版页面和接口绑定',
        patches: { expectedResults: ['新版列表可见'] },
        technicalBindingChanges: [{
          caseId: source.caseId,
          route: '/items-v2',
          capabilityIds: ['navigation.open-items-v2'],
          assertionAdapterIds: ['system.assert.items-v2-visible'],
          apiOperations: [{ method: operation.method, path: '/ops/items/v2', operationKey: operation.operationKey }],
        }],
        coverageChanges: [{
          coverageId: 'coverage:items-v2',
          kind: 'route',
          route: '/items-v2',
          sourceIds: ['audit:system-v2'],
          disposition: 'required',
          linkedCaseIds: [source.caseId],
        }, {
          coverageId: 'coverage:items',
          kind: 'route',
          route: '/items',
          sourceIds: ['audit:system-v2'],
          disposition: 'not-applicable',
          linkedCaseIds: [source.caseId],
          reason: '新版页面替代旧路由覆盖',
        }],
        assertions: [{ fact: 'route', expectedValue: '/items-v2', text: '新版列表可见' }],
      },
    }],
  };
}

function implementation(rootDir: string, relativePath: string) {
  const content = fs.readFileSync(path.join(rootDir, relativePath));
  return { path: relativePath, sha256: fingerprintFile(content) };
}

function fingerprintFile(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function compileFixture(fixture: ReturnType<typeof createFixture>) {
  return compileSystemTestRunContract({
    rootDir: fixture.rootDir, manifest: fixture.manifest, recipes: [fixture.recipe],
    recipeCollectionFingerprint: fixture.recipeFingerprint, rules: fixture.rules, adapters: fixture.adapters,
  });
}

