import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AutomationRecipe } from '../../automation/recipe/automation-recipe';
import {
  buildExactProductCenterGoldRunSelection,
  buildProductCenterGoldRunSelection,
  buildProductCenterRecipeResourcePlan,
  buildProductCenterFailureFingerprint,
  decideProductCenterTransientRecovery,
  isDeterministicUiDiagnostic,
  matchesProductCenterApiOperation,
} from '../../automation/recipe/product-center-gold-run-optimization';
import {
  appendProductCenterAcceptanceRun,
  writeProductCenterImmutableRunArtifact,
} from '../../utils/product-center-run-artifacts';
import {
  evaluateProductCenterPerformanceBudget,
  summarizeProductCenterPerformancePhases,
} from '../../utils/product-center-performance-budget';
import {
  findProductCenterRuntimeLocks,
  withProductCenterRecipeResourceLocks,
} from '../../utils/product-center-resource-lock';
import { parseProductCenterGoldRunArguments } from '../../scripts/run-product-center-test-plan-gold-set';
import {
  assertProductCenterGoldSingleAccepted,
  completeProductCenterGoldOnboardingStage,
  loadProductCenterGoldOnboardingCheckpoint,
  recordProductCenterGoldOnboardingUiStage,
} from '../../utils/product-center-gold-onboarding-checkpoint';

test.describe('商品中心 Gold 运行整改合同', () => {
  test('partial 运行应写入不可变 run 目录且不得覆盖完整集合 latest', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-gold-run-'));
    try {
      const result = writeProductCenterImmutableRunArtifact({
        rootDir,
        collectionId: 'test-plan-gold-set',
        runId: 'run-001',
        scope: 'single',
        artifactName: 'feedback',
        value: { fingerprint: 'fp', entries: [{ caseId: 'case-a', status: 'passed' }] },
        publishLatest: false,
      });

      expect(result.runArtifactPath).toBe(path.join(
        rootDir,
        'output/recipes/runs/test-plan-gold-set/run-001/feedback.json',
      ));
      expect(fs.existsSync(result.runArtifactPath)).toBe(true);
      expect(fs.existsSync(path.join(rootDir, 'output/recipes/test-plan-gold-set-feedback.json'))).toBe(false);
      expect(JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'))).toMatchObject({
        runId: 'run-001',
        scope: 'single',
        artifacts: ['feedback.json'],
      });
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('验收历史应按 runId 立即幂等追加且拒绝同 ID 不同内容', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-gold-history-'));
    const run = {
      runId: 'gold:run-001',
      scope: 'single',
      generatedAt: '2026-07-27T00:00:00.000Z',
      accepted: true,
      entries: [
        { caseId: 'case-a', module: 'brand-item', status: 'passed' as const },
        { caseId: 'case-b', module: 'brand-tag', status: 'passed' as const },
      ],
    };
    try {
      appendProductCenterAcceptanceRun(rootDir, run);
      appendProductCenterAcceptanceRun(rootDir, run);
      appendProductCenterAcceptanceRun(rootDir, {
        ...run,
        generatedAt: '2026-07-27T00:01:00.000Z',
        entries: [...run.entries].reverse(),
      });
      const historyPath = path.join(rootDir, 'output/recipes/product-center-acceptance-history.json');
      expect(JSON.parse(fs.readFileSync(historyPath, 'utf8')).runs).toHaveLength(1);
      expect(JSON.parse(fs.readFileSync(historyPath, 'utf8')).runs[0].generatedAt)
        .toBe('2026-07-27T00:00:00.000Z');
      expect(() => appendProductCenterAcceptanceRun(rootDir, {
        ...run,
        accepted: false,
      })).toThrow(/同一验收运行标识内容不一致/);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('应支持精确单例和基于 route capability assertion adapter 的影响集', async () => {
    const recipes = [
      recipe('case-a', '/pp/brand/list', 'item.createStandard', 'verify.item'),
      recipe('case-b', '/pp/brand/list', 'item.read', 'verify.other'),
      recipe('case-c', '/pp/other', 'item.createStandard', 'verify.third'),
      recipe('case-d', '/pp/unrelated', 'other.read', 'verify.other'),
    ];

    expect(buildProductCenterGoldRunSelection(recipes, { caseId: 'case-a' })).toMatchObject({
      scope: 'single',
      selectedCaseIds: ['case-a'],
    });
    expect(buildProductCenterGoldRunSelection(recipes, { impactedCaseId: 'case-a' })).toMatchObject({
      scope: 'impacted',
      selectedCaseIds: ['case-a', 'case-b', 'case-c'],
    });
    expect(() => buildProductCenterGoldRunSelection(recipes, { caseId: 'missing' }))
      .toThrow(/分母为零/);
  });

  test('通用 cleanup 适配器不得把无关 Recipe 扩入 impacted 集合', async () => {
    const recipes = [
      {
        ...recipe('case-a', '/pp/brand/list', 'item.createStandard', 'verify.item'),
        cleanup: { adapterId: 'productCenter.cleanupSeed' },
      },
      {
        ...recipe('case-b', '/pp/other', 'other.read', 'verify.other'),
        cleanup: { adapterId: 'productCenter.cleanupSeed' },
      },
    ];

    expect(buildProductCenterGoldRunSelection(recipes, { impactedCaseId: 'case-a' }).selectedCaseIds)
      .toEqual(['case-a']);
  });

  test('页面合同 impact 应支持精确 caseId 集合而不按通用能力扩散', async () => {
    const recipes = [
      recipe('case-a', '/pp/brand/list', 'item.createStandard', 'verify.item'),
      recipe('case-b', '/pp/brand/list', 'item.read', 'verify.other'),
      recipe('case-c', '/pp/other', 'item.createStandard', 'verify.third'),
    ];
    expect(buildExactProductCenterGoldRunSelection(recipes, ['case-c', 'case-a', 'case-a']))
      .toMatchObject({
        scope: 'impacted',
        selectedCaseIds: ['case-a', 'case-c'],
        reasons: [
          { caseId: 'case-a', matches: ['page-contract-impact'] },
          { caseId: 'case-c', matches: ['page-contract-impact'] },
        ],
      });
  });

  test('非幂等 transient 只有确认无动作或已清理后才允许隔离重试', async () => {
    expect(decideProductCenterTransientRecovery({
      action: 'create',
      diagnostic: 'page.waitForResponse: Timeout 60000ms exceeded',
      ledgerEntries: [],
    })).toMatchObject({ decision: 'retry-isolated', reason: 'no-mutation-observed' });
    expect(decideProductCenterTransientRecovery({
      action: 'create',
      diagnostic: 'connection reset',
      ledgerEntries: [{ phase: 'mutation-observed' }],
    })).toMatchObject({ decision: 'state-verification-required' });
    expect(decideProductCenterTransientRecovery({
      action: 'delete',
      diagnostic: 'ETIMEDOUT',
      ledgerEntries: [{ phase: 'residue-verified' }],
    })).toMatchObject({ decision: 'retry-isolated', reason: 'residue-verified' });
    expect(decideProductCenterTransientRecovery({
      action: 'read',
      diagnostic: 'HTTP 429 Too Many Requests',
      ledgerEntries: [],
    })).toMatchObject({ decision: 'retry-isolated', reason: 'read-only' });
  });

  test('确定性定位与唯一性失败不得按 transient 重试', async () => {
    const diagnostics = [
      'locator.waitFor: Timeout 10000ms exceeded while waiting for getByRole checkbox',
      'strict mode violation: locator resolved to 2 elements',
      '固定搭配套餐组定位不唯一，实际数量 0',
      'uniqueness assertion failed: targetCount=2',
    ];
    for (const diagnostic of diagnostics) {
      expect(isDeterministicUiDiagnostic(diagnostic)).toBe(true);
      expect(decideProductCenterTransientRecovery({
        action: 'read',
        diagnostic,
        ledgerEntries: [],
      })).toMatchObject({ decision: 'not-transient', reason: 'deterministic-ui-failure' });
    }
  });

  test('相同 transient 失败指纹连续出现时应立即熔断且指纹不得保留敏感值', async () => {
    const firstDiagnostic = 'page.waitForResponse: Timeout 60000ms exceeded for https://host/api/items?id=123';
    const secondDiagnostic = 'page.waitForResponse: Timeout 60001ms exceeded for https://host/api/items?id=456';
    const fingerprint = buildProductCenterFailureFingerprint(firstDiagnostic);
    expect(buildProductCenterFailureFingerprint(secondDiagnostic)).toBe(fingerprint);
    expect(fingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(fingerprint).not.toContain('host');
    expect(decideProductCenterTransientRecovery({
      action: 'read',
      diagnostic: secondDiagnostic,
      ledgerEntries: [],
      previousFailureFingerprint: fingerprint,
    })).toMatchObject({ decision: 'not-transient', reason: 'repeated-failure-fingerprint' });
  });

  test('资源计划应允许两个 worker 并为冲突 Recipe 生成相同锁键', async () => {
    const first = { ...recipe('case-a', '/pp/brand/list', 'item.createStandard', 'verify.item'), mutation: { method: 'POST' as const, operationKey: 'item:create' } };
    const second = { ...recipe('case-b', '/pp/brand/list', 'item.edit', 'verify.other'), mutation: { method: 'PUT' as const, operationKey: 'item:update' } };
    const third = recipe('case-c', '/pp/other', 'other.read', 'verify.other');
    const plan = buildProductCenterRecipeResourcePlan([first, second, third], 2);

    expect(plan.workers).toBe(2);
    expect(plan.entries.find((entry) => entry.caseId === 'case-a')?.resourceKeys)
      .toContain('route:/pp/brand/list');
    expect(plan.entries.find((entry) => entry.caseId === 'case-b')?.resourceKeys)
      .toContain('route:/pp/brand/list');
    expect(plan.entries.find((entry) => entry.caseId === 'case-c')?.resourceKeys)
      .toEqual(['route:/pp/other']);
    expect(plan.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceKey: 'entity:item', caseIds: ['case-a', 'case-b'] }),
      expect.objectContaining({ resourceKey: 'route:/pp/brand/list', caseIds: ['case-a', 'case-b'] }),
    ]));
    expect(plan.conflicts).toHaveLength(2);
  });

  test('冲突 Recipe 并发等待时不得删除共享锁目录', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-resource-lock-'));
    const lockDir = path.join(rootDir, 'runtime-locks');
    const sharedRecipe = { ...recipe('case-shared', '/pp/brand/list', 'item.createStandard', 'verify.item'), mutation: { method: 'POST' as const, operationKey: 'item:create' } };
    const order: string[] = [];
    try {
      await Promise.all([
        withProductCenterRecipeResourceLocks(sharedRecipe, async () => {
          order.push('first-start');
          await new Promise((resolve) => setTimeout(resolve, 50));
          order.push('first-end');
        }, lockDir),
        withProductCenterRecipeResourceLocks(sharedRecipe, async () => {
          order.push('second-start');
          order.push('second-end');
        }, lockDir),
      ]);

      expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
      expect(findProductCenterRuntimeLocks(lockDir)).toEqual([]);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('Operation matcher 应严格校验 method 并兼容网关前缀和 query', async () => {
    const operation = { method: 'POST', pathSuffix: '/ops-brand/brand-items/standard' } as const;
    expect(matchesProductCenterApiOperation(
      { method: 'POST', url: 'https://host/item/v1/ops-brand/brand-items/standard?trace=1' },
      operation,
    )).toBe(true);
    expect(matchesProductCenterApiOperation(
      { method: 'GET', url: 'https://host/item/v1/ops-brand/brand-items/standard' },
      operation,
    )).toBe(false);
    expect(matchesProductCenterApiOperation(
      { method: 'POST', url: 'https://host/item/v1/ops-brand/brand-items/standard-copy' },
      operation,
    )).toBe(false);
  });

  test('阶段预算应报告超限阶段且不记录输入值或敏感信息', async () => {
    const result = evaluateProductCenterPerformanceBudget({
      scope: 'single',
      totalDurationMs: 61_000,
      phases: {
        auth: 31_000,
        sidebar: 16_000,
        seed: 2_000,
        uiAction: 4_000,
        network: 1_000,
        apiAssertion: 1_000,
        uiAssertion: 2_000,
        cleanup: 3_000,
        artifact: 100,
      },
    });

    expect(result.status).toBe('budget-exceeded');
    expect(result.affectsProductStatus).toBe(false);
    expect(result.classification).toBe('performance-budget');
    expect(result.findings.map((finding) => finding.id)).toEqual([
      'phase:auth',
      'phase:sidebar',
      'scope:single',
    ]);
    expect(JSON.stringify(result)).not.toMatch(/password|authorization|cookie|token/i);
  });

  test('集合阶段摘要应取单例最大值而不是把并行用例耗时累加', async () => {
    const phases = summarizeProductCenterPerformancePhases([
      { auth: 0, sidebar: 6_000, seed: 1_000, uiAction: 9_000, network: 0, apiAssertion: 400, uiAssertion: 3_000, cleanup: 10_000, artifact: 0 },
      { auth: 0, sidebar: 12_000, seed: 500, uiAction: 5_000, network: 0, apiAssertion: 900, uiAssertion: 5_000, cleanup: 4_000, artifact: 0 },
    ]);
    expect(phases).toEqual({
      auth: 0,
      sidebar: 12_000,
      seed: 1_000,
      uiAction: 9_000,
      network: 0,
      apiAssertion: 900,
      uiAssertion: 5_000,
      cleanup: 10_000,
      artifact: 0,
    });
  });

  test('onboarding 参数应固定三次单例观测并允许显式 worker 上限', async () => {
    expect(parseProductCenterGoldRunArguments([
      '--onboard',
      '--case-id=create:item',
      '--workers=2',
    ])).toEqual({
      caseId: 'create:item',
      onboard: true,
      repeatEach: 3,
      workers: 2,
    });
    expect(() => parseProductCenterGoldRunArguments(['--onboard'])).toThrow(/必须指定/);
    expect(parseProductCenterGoldRunArguments([
      '--case-ids=create:bom,read:store-product-search',
      '--workers=1',
    ])).toEqual({
      caseIds: ['create:bom', 'read:store-product-search'],
      onboard: false,
      repeatEach: 1,
      workers: 1,
    });
  });

  test('onboarding checkpoint 应从首个未完成阶段恢复且 Recipe 变化后失效', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-gold-onboarding-'));
    const recipes = [recipe('case-a', '/pp/brand/list', 'item.createStandard', 'verify.item')];
    try {
      let checkpoint = loadProductCenterGoldOnboardingCheckpoint(rootDir, {
        caseId: 'case-a',
        recipes,
        repeatEach: 3,
      });
      expect(checkpoint.nextStage).toBe('single');
      checkpoint = recordProductCenterGoldOnboardingUiStage(rootDir, checkpoint, {
        stage: 'single',
        runId: 'run-single',
        selectedCaseIds: ['case-a'],
      });
      expect(checkpoint).toMatchObject({
        nextStage: 'single',
        pendingAcceptance: { stage: 'single', runId: 'run-single' },
      });
      checkpoint = completeProductCenterGoldOnboardingStage(rootDir, checkpoint, {
        stage: 'single',
        runId: 'run-single',
        selectedCaseIds: ['case-a'],
      });
      expect(loadProductCenterGoldOnboardingCheckpoint(rootDir, {
        caseId: 'case-a', recipes, repeatEach: 3,
      })).toMatchObject({ nextStage: 'impacted', stages: { single: { runId: 'run-single' } } });

      checkpoint = completeProductCenterGoldOnboardingStage(rootDir, checkpoint, {
        stage: 'impacted',
        runId: 'run-impacted',
        selectedCaseIds: ['case-a'],
      });
      expect(checkpoint.nextStage).toBe('full');

      checkpoint = completeProductCenterGoldOnboardingStage(rootDir, checkpoint, {
        stage: 'full',
        runId: 'run-full',
        selectedCaseIds: ['case-a'],
      });
      expect(loadProductCenterGoldOnboardingCheckpoint(rootDir, {
        caseId: 'case-a', recipes, repeatEach: 3,
      })).toMatchObject({ nextStage: 'complete', stages: { full: { runId: 'run-full' } } });

      const changedRecipes = [{ ...recipes[0], title: 'changed' }];
      expect(loadProductCenterGoldOnboardingCheckpoint(rootDir, {
        caseId: 'case-a', recipes: changedRecipes, repeatEach: 3,
      })).toMatchObject({ nextStage: 'single', stages: {} });
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('onboarding 前应要求当前 Recipe 指纹下的目标 single 已验收', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-gold-single-gate-'));
    const runDir = path.join(
      rootDir,
      'output/recipes/runs/product-center-test-plan-gold-set/run-single',
    );
    try {
      expect(() => assertProductCenterGoldSingleAccepted(rootDir, {
        caseId: 'case-a', recipeFingerprint: 'recipe-fp',
      })).toThrow(/先运行并通过目标 single/);
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'acceptance.json'), JSON.stringify({
        scope: 'single',
        accepted: true,
        acceptedCaseIds: ['case-a'],
        fingerprint: 'recipe-fp',
      }));
      expect(assertProductCenterGoldSingleAccepted(rootDir, {
        caseId: 'case-a', recipeFingerprint: 'recipe-fp',
      })).toBe('run-single');
      expect(() => assertProductCenterGoldSingleAccepted(rootDir, {
        caseId: 'case-a', recipeFingerprint: 'changed-fp',
      })).toThrow(/先运行并通过目标 single/);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('transient 恢复应异步退避且只读用例不依赖 mutation ledger', async () => {
    const runnerSource = fs.readFileSync(path.resolve(
      'scripts/product-center-recipe-collection-runner.ts',
    ), 'utf8');
    const goldOrchestratorSource = fs.readFileSync(path.resolve(
      'scripts/run-product-center-test-plan-gold-set.ts',
    ), 'utf8');
    expect(runnerSource).toContain('const waitForRetry = options.delay ?? delay');
    expect(runnerSource).toContain('await waitForRetry(delayMs)');
    expect(runnerSource).not.toContain('Atomics.wait');
    expect(runnerSource).not.toContain('if (matchingSnapshots.length === 0) return []');
    expect(runnerSource).toContain("require.resolve('@playwright/test/cli')");
    expect(runnerSource).toContain("artifactName: 'performance'");
    expect(runnerSource).toContain('PW_TIMING_OUTPUT');
    expect(runnerSource).toContain("typeof snapshot.runId === 'string'");
    expect(runnerSource).toContain('publishProductCenterCompletedRunArtifacts');
    expect(goldOrchestratorSource).toContain('assertProductCenterGoldSingleAccepted');
    expect(goldOrchestratorSource).toContain('if (!pending) hasAuthenticatedSession = true');
  });

  test('开发流程应固化为目标 single、一次 onboarding、一次最终维护', async () => {
    const workflow = fs.readFileSync(path.resolve(
      'docs/product-center-gold-development-workflow.md',
    ), 'utf8');
    expect(workflow).toContain('test:product-center:test-plan-gold-set:single');
    expect(workflow).toContain('onboard:product-center:gold');
    expect(workflow).toContain('maintain:local');
    expect(workflow).toContain('禁止在开发调试阶段运行 impacted、full 或 repeat=3');
  });

  test('Recipe 合同入口应覆盖 Gold 运行整改合同', async () => {
    const packageDocument = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageDocument.scripts['test:product-center:recipes:contracts'])
      .toContain('tests/api/product-center-gold-run-optimization.contract.spec.ts');
  });
});

function recipe(
  caseId: string,
  route: `/${string}`,
  capabilityId: string,
  assertionAdapterId: string,
): AutomationRecipe {
  return {
    schemaVersion: '1.0.0',
    id: `recipe:${caseId}`,
    caseId,
    title: caseId,
    tags: ['@gold'],
    route,
    action: capabilityId.includes('create') ? 'create' : 'read',
    traceabilityId: `trace:sop:${caseId}`,
    sourceIds: [`route:${route}`],
    claimIds: [`claim:${caseId}:action:1`],
    coverageIds: [],
    generationAllowed: true,
    capabilities: [
      { id: 'navigation.sidebar.open', input: { targetPath: route } },
      { id: capabilityId },
    ],
    assertions: [{ adapterId: assertionAdapterId }],
  };
}
