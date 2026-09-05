import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildProductCenterReleaseEvidence,
  aggregateProductCenterReleaseEvidence,
  collectProductCenterSettledBrowserContractSignals,
  collectProductCenterSettledBrowserReleaseEvidence,
  deriveProductCenterRuntimeEvidenceForCurrentRoutes,
  deriveProductCenterRuntimeEvidenceForRelease,
  evaluateProductCenterEvidenceFreshness,
  validateProductCenterReleaseEvidence,
} from '../../utils/product-center-release-evidence';
import {
  buildProductCenterInteractionProbeEvidence,
  compileProductCenterInteractionProbeSelection,
  validateProductCenterDriftContracts,
} from '../../utils/product-center-interaction-probe';
import type { AutomationRecipe } from '../../automation/recipe/automation-recipe';
import { decideProductCenterRuntimeReuse } from '../../utils/product-center-runtime-reuse';
import { readProductCenterContractManifest } from '../../scripts/run-product-center-contract-tests';
import {
  buildProductCenterLiveProbeRecoveryState,
  evaluateProductCenterLiveProbeCoverage,
  parseProductCenterLiveProbeRouteSelection,
  validateProductCenterLiveProbeAttemptArtifact,
} from '../../utils/product-center-live-probe';

test.describe('商品中心当前版本真实 Probe', () => {
  test('transient 失败应只重跑失败路由并保留已通过路由证据', async () => {
    const passedEntry = { route: '/route/a', marker: 'first-success', durationMs: 1_000 };
    const first = buildProductCenterLiveProbeRecoveryState({
      expectedRoutes: ['/route/a', '/route/b'],
      attempts: [{
        attempt: 0,
        durationMs: 1_500,
        entries: [passedEntry],
        failures: [probeFailure('/route/b', 'a', true, 'transient-platform')],
      }],
    });

    expect(first).toMatchObject({
      decision: 'retry-transient',
      retryRoutes: ['/route/b'],
      nextDelayMs: 5_000,
    });
    expect(first.entries[0]).toBe(passedEntry);

    const recovered = buildProductCenterLiveProbeRecoveryState({
      expectedRoutes: ['/route/a', '/route/b'],
      attempts: [
        {
          attempt: 0,
          durationMs: 1_500,
          entries: [passedEntry],
          failures: [probeFailure('/route/b', 'a', true, 'transient-platform')],
        },
        {
          attempt: 1,
          durationMs: 700,
          entries: [{ route: '/route/b', marker: 'recovered', durationMs: 600 }],
          failures: [],
        },
      ],
    });

    expect(recovered).toMatchObject({
      decision: 'complete',
      retryRoutes: [],
      recoveredRoutes: ['/route/b'],
      unresolvedRoutes: [],
    });
    expect(recovered.entries).toHaveLength(2);
    expect(recovered.entries.find((entry) => entry.route === '/route/a')).toBe(passedEntry);
  });

  test('确定性错误和相同 transient 指纹连续出现时必须立即熔断', async () => {
    const deterministic = buildProductCenterLiveProbeRecoveryState({
      expectedRoutes: ['/route/a'],
      attempts: [{
        attempt: 0,
        durationMs: 100,
        entries: [],
        failures: [probeFailure('/route/a', 'b', false, 'locator-drift')],
      }],
    });
    expect(deterministic).toMatchObject({
      decision: 'stop-deterministic',
      retryRoutes: [],
      deterministicFailures: ['/route/a'],
    });

    const repeated = buildProductCenterLiveProbeRecoveryState({
      expectedRoutes: ['/route/a'],
      attempts: [
        {
          attempt: 0,
          durationMs: 100,
          entries: [],
          failures: [probeFailure('/route/a', 'c', true, 'transient-platform')],
        },
        {
          attempt: 1,
          durationMs: 100,
          entries: [],
          failures: [probeFailure('/route/a', 'c', true, 'transient-platform')],
        },
      ],
    });
    expect(repeated).toMatchObject({
      decision: 'stop-repeated-fingerprint',
      retryRoutes: [],
      repeatedFailureRoutes: ['/route/a'],
    });
  });

  test('transient 路由应使用统一退避并在四次恢复后保留覆盖缺口', async () => {
    const attempts = Array.from({ length: 5 }, (_, attempt) => ({
      attempt,
      durationMs: 100,
      entries: [],
      failures: [probeFailure('/route/a', String(attempt), true, 'transient-platform')],
    }));

    expect(buildProductCenterLiveProbeRecoveryState({
      expectedRoutes: ['/route/a'],
      attempts: attempts.slice(0, 2),
    }).nextDelayMs).toBe(15_000);
    expect(buildProductCenterLiveProbeRecoveryState({
      expectedRoutes: ['/route/a'],
      attempts: attempts.slice(0, 4),
    }).nextDelayMs).toBe(60_000);
    expect(buildProductCenterLiveProbeRecoveryState({
      expectedRoutes: ['/route/a'],
      attempts,
    })).toMatchObject({
      decision: 'stop-retry-exhausted',
      retryRoutes: [],
      unresolvedRoutes: ['/route/a'],
    });
  });

  test('路由选择必须是权威路由的非空精确子集', async () => {
    const expectedRoutes = ['/route/a', '/route/b'];
    expect(parseProductCenterLiveProbeRouteSelection(undefined, expectedRoutes))
      .toEqual(expectedRoutes);
    expect(parseProductCenterLiveProbeRouteSelection('["/route/b"]', expectedRoutes))
      .toEqual(['/route/b']);
    expect(() => parseProductCenterLiveProbeRouteSelection('[]', expectedRoutes))
      .toThrow(/不能为空/);
    expect(() => parseProductCenterLiveProbeRouteSelection('["/route/c"]', expectedRoutes))
      .toThrow(/不属于权威集合/);
  });

  test('每次恢复必须让选中路由恰好形成一条成功或失败记录', async () => {
    const valid = validateProductCenterLiveProbeAttemptArtifact({
      runId: 'RUN_001',
      attempt: 1,
      selectedRoutes: ['/route/a', '/route/b'],
      artifact: {
        runId: 'RUN_001',
        entries: [{
          route: '/route/a',
          attempt: 1,
          capabilityIds: ['navigation.sidebar.open'],
        }],
        failures: [{
          ...probeFailure('/route/b', 'd', true, 'transient-platform'),
          attempt: 1,
        }],
      },
    });
    expect(valid).toEqual([]);

    const invalid = validateProductCenterLiveProbeAttemptArtifact({
      runId: 'RUN_001',
      attempt: 1,
      selectedRoutes: ['/route/a', '/route/b'],
      artifact: {
        runId: 'OTHER_RUN',
        entries: [{ route: '/route/a', attempt: 0, capabilityIds: [] }],
        failures: [],
      },
    });
    expect(invalid).toEqual(expect.arrayContaining([
      'RUN_ID_MISMATCH',
      'MISSING_ROUTE:/route/b',
      'ENTRY_ATTEMPT_MISMATCH:/route/a',
      'SIDEBAR_CAPABILITY_MISSING:/route/a',
    ]));
  });

  test('Probe 应输出单路由耗时与最慢路由告警但不得改变成功结论', async () => {
    const state = buildProductCenterLiveProbeRecoveryState({
      expectedRoutes: ['/route/a', '/route/b'],
      routeBudgetMs: 25_000,
      attempts: [{
        attempt: 0,
        durationMs: 32_000,
        entries: [
          { route: '/route/a', durationMs: 30_000 },
          { route: '/route/b', durationMs: 2_000 },
        ],
        failures: [],
      }],
    });

    expect(state.decision).toBe('complete');
    expect(state.performance).toMatchObject({
      totalAttemptDurationMs: 32_000,
      routeBudgetMs: 25_000,
      budgetExceededRoutes: ['/route/a'],
      affectsProductStatus: false,
    });
    expect(state.performance.slowestRoutes[0]).toEqual({ route: '/route/a', durationMs: 30_000 });
  });

  test('并发 Probe 应保证每条权威路由恰好一份证据并精确标记失败路由', async () => {
    const probes = readJson<any>(
      'contracts/product-center/drift/product-center-interaction-probes.json',
    );
    const mainRecipes = readJson<{ recipes: AutomationRecipe[] }>(
      'contracts/product-center/recipes/product-center-pilot-recipes.json',
    ).recipes;
    const expectedRoutes = [...new Set<string>([
      ...probes.probes.map((probe: any) => String(probe.route)),
      ...mainRecipes.map((recipe) => recipe.route),
    ])].sort();
    const accepted = evaluateProductCenterLiveProbeCoverage({
      expectedRoutes,
      entries: expectedRoutes.map((route) => ({ route })),
      failures: [],
    });
    expect(expectedRoutes).toHaveLength(19);
    expect(accepted).toMatchObject({ complete: true, observed: 19, total: 19 });
    expect(accepted.issues).toEqual([]);

    const failedRoute = expectedRoutes[0];
    const failed = evaluateProductCenterLiveProbeCoverage({
      expectedRoutes,
      entries: expectedRoutes.slice(1).map((route) => ({ route })),
      failures: [{ route: failedRoute, status: 'failed', diagnosticFingerprint: 'a'.repeat(64) }],
    });
    expect(failed.complete).toBe(false);
    expect(failed.failedRoutes).toEqual([failedRoute]);
    expect(failed.missingRoutes).toEqual([failedRoute]);
  });

  test('版本指纹应稳定且只保留脱敏页面与资源信号', async () => {
    const first = buildProductCenterReleaseEvidence({
      environmentId: 'balamxqa',
      baseURL: 'https://cc-fe.balamxqa.com',
      runId: 'RUN_001',
      observedAt: '2026-07-28T08:00:00.000Z',
      pageSignals: {
        title: 'Merchant Center',
        language: 'en',
        meta: { build: 'release-2026.07.28', generator: 'vite' },
        resourcePaths: ['/assets/vendor-b.js?token=secret', '/assets/app-a.js'],
      },
    });
    const second = buildProductCenterReleaseEvidence({
      environmentId: 'balamxqa',
      baseURL: 'https://cc-fe.balamxqa.com',
      runId: 'RUN_002',
      observedAt: '2026-07-28T08:01:00.000Z',
      pageSignals: {
        title: 'Merchant Center',
        language: 'en',
        meta: { generator: 'vite', build: 'release-2026.07.28' },
        resourcePaths: ['/assets/app-a.js', '/assets/vendor-b.js?another=value'],
      },
    });

    expect(first.applicationFingerprint).toBe(second.applicationFingerprint);
    expect(first.environmentFingerprint).toBe(second.environmentFingerprint);
    expect(first.runId).not.toBe(second.runId);
    expect(first.signals.resourcePathFingerprints).toHaveLength(2);
    expect(JSON.stringify(first)).not.toContain('secret');
    expect(JSON.stringify(first)).not.toMatch(/token=|authorization|cookie|password/i);
    expect(validateProductCenterReleaseEvidence(first)).toEqual([]);
  });

  test('缺少、错版本、错环境或过期证据必须被阻断', async () => {
    const current = buildProductCenterReleaseEvidence({
      environmentId: 'balamxqa',
      baseURL: 'https://cc-fe.balamxqa.com',
      runId: 'CURRENT_RUN',
      observedAt: '2026-07-28T08:00:00.000Z',
      pageSignals: { title: 'Merchant Center', resourcePaths: ['/assets/app-current.js'] },
    });
    const accepted = evaluateProductCenterEvidenceFreshness({
      evidence: current,
      current,
      now: '2026-07-28T08:10:00.000Z',
      maxAgeMs: 30 * 60_000,
    });
    expect(accepted).toMatchObject({ accepted: true, issues: [] });

    expect(evaluateProductCenterEvidenceFreshness({
      evidence: undefined,
      current,
      now: '2026-07-28T08:10:00.000Z',
      maxAgeMs: 30 * 60_000,
    }).issues).toContain('RELEASE_EVIDENCE_MISSING');
    expect(evaluateProductCenterEvidenceFreshness({
      evidence: { ...current, applicationFingerprint: 'different-release' },
      current,
      now: '2026-07-28T08:10:00.000Z',
      maxAgeMs: 30 * 60_000,
    }).issues).toContain('RELEASE_FINGERPRINT_MISMATCH');
    expect(evaluateProductCenterEvidenceFreshness({
      evidence: { ...current, environmentFingerprint: 'different-environment' },
      current,
      now: '2026-07-28T08:10:00.000Z',
      maxAgeMs: 30 * 60_000,
    }).issues).toContain('ENVIRONMENT_FINGERPRINT_MISMATCH');
    expect(evaluateProductCenterEvidenceFreshness({
      evidence: { ...current, observedAt: '2026-07-27T08:00:00.000Z' },
      current,
      now: '2026-07-28T08:10:00.000Z',
      maxAgeMs: 30 * 60_000,
    }).issues).toContain('RELEASE_EVIDENCE_STALE');
  });

  test('同一核心资源集合仅增加公共运行资源时应视为兼容 release lineage', async () => {
    const evidence = aggregateProductCenterReleaseEvidence([
      buildProductCenterReleaseEvidence({
        environmentId: 'balamxqa',
        baseURL: 'https://cc-fe.balamxqa.com',
        runId: 'GOLD_RUN',
        observedAt: '2026-07-28T08:00:00.000Z',
        pageSignals: {
          language: 'en',
          resourcePaths: ['/assets/app.js', '/assets/vendor.js', '/assets/runtime.js'],
        },
      }),
    ]);
    const current = aggregateProductCenterReleaseEvidence([
      buildProductCenterReleaseEvidence({
        environmentId: 'balamxqa',
        baseURL: 'https://cc-fe.balamxqa.com',
        runId: 'LIVE_RUN',
        observedAt: '2026-07-28T08:05:00.000Z',
        pageSignals: {
          language: 'en',
          resourcePaths: [
            '/assets/app.js',
            '/assets/vendor.js',
            '/assets/runtime.js',
            '/assets/sidebar.js',
          ],
        },
      }),
    ]);

    expect(evidence.applicationFingerprint).not.toBe(current.applicationFingerprint);
    expect(evaluateProductCenterEvidenceFreshness({
      evidence,
      current,
      now: '2026-07-28T08:10:00.000Z',
      maxAgeMs: 30 * 60_000,
    })).toMatchObject({ accepted: true, issues: [] });
  });

  test('多页面版本指纹应使用公共入口资源交集而不是页面专属 chunk', async () => {
    const first = releaseEvidence();
    const second = {
      ...first,
      applicationFingerprint: 'a'.repeat(64),
      signals: {
        ...first.signals,
        resourcePathFingerprints: [
          ...first.signals.resourcePathFingerprints,
          'b'.repeat(64),
        ],
      },
    };
    const aggregate = aggregateProductCenterReleaseEvidence([first, second]);

    expect(aggregate.signals.resourcePathFingerprints)
      .toEqual(first.signals.resourcePathFingerprints);
    expect(aggregate.applicationFingerprint).not.toBe(first.applicationFingerprint);
    expect(validateProductCenterReleaseEvidence(aggregate)).toEqual([]);
  });

  test('聚合运行版本时不得改写原始不可变 evidence', async () => {
    const first = releaseEvidence();
    const second = buildProductCenterReleaseEvidence({
      environmentId: 'balamxqa',
      baseURL: 'https://cc-fe.balamxqa.com',
      runId: 'PROBE_RUN',
      observedAt: '2026-07-28T08:01:00.000Z',
      pageSignals: {
        title: 'Merchant Center',
        resourcePaths: ['/assets/app-current.js', '/assets/route-store-product.js'],
      },
    });
    const source = {
      runId: 'PROBE_RUN',
      entries: [
        { caseId: 'case-a', release: first },
        { caseId: 'case-b', release: second },
      ],
    };
    const before = JSON.stringify(source);
    const derived = deriveProductCenterRuntimeEvidenceForRelease(source);

    expect(JSON.stringify(source)).toBe(before);
    expect(derived).not.toBe(source);
    expect(derived.entries[0]).not.toBe(source.entries[0]);
    expect(derived.entries.every((entry) => (
      entry.release?.applicationFingerprint === derived.release.applicationFingerprint
    ))).toBe(true);
    expect(derived.entries.every((entry) => (
      JSON.stringify(entry.release?.signals) === JSON.stringify(derived.release.signals)
    ))).toBe(true);
    expect(derived.entries[0].release?.routeFingerprint)
      .toBe(first.applicationFingerprint);
    expect(source.entries[0].release.applicationFingerprint)
      .toBe(first.applicationFingerprint);
  });

  test('当前路由 Probe 不得改写原始 evidence 的版本和浏览器信号', async () => {
    const goldRelease = releaseEvidence();
    const routeRelease = buildProductCenterReleaseEvidence({
      environmentId: 'balamxqa',
      baseURL: 'https://cc-fe.balamxqa.com',
      runId: 'LIVE_ROUTE_RUN',
      observedAt: '2026-07-28T08:05:00.000Z',
      pageSignals: {
        title: 'Store Products',
        resourcePaths: ['/assets/app-current.js', '/assets/store-product-v2.js'],
      },
    });
    const currentRelease = aggregateProductCenterReleaseEvidence([routeRelease]);
    const source = {
      runId: 'GOLD_RUN',
      entries: [{
        caseId: 'read:store-product-search',
        visibleUi: { route: '/poi/location/prod-list' },
        network: { method: 'GET', operation: '/item/v1/items', requestCount: 1 },
        api: { responseShape: ['data.list'] },
        release: goldRelease,
        browserSignals: browserSignals(['old-role']),
      }],
    };
    const before = JSON.stringify(source);
    const derived = deriveProductCenterRuntimeEvidenceForCurrentRoutes({
      artifact: source,
      currentRelease,
      routes: [{
        route: '/poi/location/prod-list',
        release: routeRelease,
        browserSignals: browserSignals(['new-role']),
      }],
    });

    expect(JSON.stringify(source)).toBe(before);
    expect(derived.entries[0]).toMatchObject({
      network: source.entries[0].network,
      api: source.entries[0].api,
      browserSignals: browserSignals(['old-role']),
      release: {
        applicationFingerprint: routeRelease.applicationFingerprint,
        environmentFingerprint: routeRelease.environmentFingerprint,
        observedAt: routeRelease.observedAt,
      },
    });
  });

  test('同一路由多个 case 的一致 Probe 应去重且冲突信号必须阻断', async () => {
    const routeRelease = buildProductCenterReleaseEvidence({
      environmentId: 'balamxqa',
      baseURL: 'https://cc-fe.balamxqa.com',
      runId: 'LIVE_ROUTE_RUN',
      observedAt: '2026-07-28T08:05:00.000Z',
      pageSignals: {
        title: 'Items',
        resourcePaths: ['/assets/app-current.js', '/assets/items.js'],
      },
    });
    const currentRelease = aggregateProductCenterReleaseEvidence([routeRelease]);
    const artifact = {
      entries: [
        { caseId: 'case-a', visibleUi: { route: '/pp/brand/list' } },
        { caseId: 'case-b', visibleUi: { route: '/pp/brand/list' } },
      ],
    };
    const duplicateRoutes = [
      { route: '/pp/brand/list', release: routeRelease, browserSignals: browserSignals(['items']) },
      { route: '/pp/brand/list', release: { ...routeRelease }, browserSignals: browserSignals(['items']) },
    ];

    const derived = deriveProductCenterRuntimeEvidenceForCurrentRoutes({
      artifact,
      currentRelease,
      routes: duplicateRoutes,
    });
    expect((derived.entries[0] as { browserSignals?: unknown }).browserSignals).toEqual(undefined);

    expect(() => deriveProductCenterRuntimeEvidenceForCurrentRoutes({
      artifact,
      currentRelease,
      routes: [
        duplicateRoutes[0],
        { ...duplicateRoutes[1], browserSignals: browserSignals(['conflict']) },
      ],
    })).toThrow(/当前版本路由 Probe 冲突/);
  });

  test('浏览器信号应等待加载结束并连续稳定后再采集', async () => {
    const startedAt = Date.now();
    const page = { evaluate: async () => rawBrowserSignals({
      loading: 0,
      roleNames: Date.now() - startedAt >= 15
        ? ['global', 'route-control']
        : ['global'],
    }) } as any;

    const settled = await collectProductCenterSettledBrowserContractSignals(page, {
      timeout: 500,
      interval: 2,
      requiredStableSamples: 2,
      minimumSettlingMs: 25,
    });

    expect(settled.visibleLoadingCount).toBe(0);
    expect(settled.visibleRoleNameFingerprints).toHaveLength(2);
  });

  test('浏览器 release 资源信号应连续稳定后再形成版本指纹', async () => {
    const samples = [
      { title: 'Items', language: 'en', meta: {}, resourcePaths: ['/assets/app.js'] },
      { title: 'Items', language: 'en', meta: {}, resourcePaths: ['/assets/app.js', '/assets/items.js'] },
      { title: 'Items', language: 'en', meta: {}, resourcePaths: ['/assets/items.js', '/assets/app.js'] },
    ];
    const last = samples[samples.length - 1];
    const page = { evaluate: async () => samples.shift() ?? last } as any;

    const settled = await collectProductCenterSettledBrowserReleaseEvidence(page, {
      environmentId: 'balamxqa',
      baseURL: 'https://cc-fe.balamxqa.com',
      runId: 'LIVE_ROUTE_RUN',
      observedAt: '2026-07-28T08:05:00.000Z',
    }, {
      timeout: 500,
      interval: 1,
      requiredStableSamples: 2,
    });

    expect(settled.signals.resourcePathFingerprints).toHaveLength(2);
    expect(validateProductCenterReleaseEvidence(settled)).toEqual([]);
  });

  test('二十个 Probe 应编译为去重业务执行目标且每项第一 capability 为侧边栏', async () => {
    const probes = readJson<any>(
      'contracts/product-center/drift/product-center-interaction-probes.json',
    );
    const recipes = readInteractionProbeRecipes();
    const selection = compileProductCenterInteractionProbeSelection(probes, recipes);

    expect(selection.probeCount).toBe(20);
    expect(selection.probeCount).toBe(probes.probes.length);
    expect(selection.selectedCaseIds.length).toBeLessThan(selection.probeCount);
    expect(selection.bindings).toHaveLength(probes.probes.length);
    expect(selection.bindings.every((entry) => (
      entry.capabilityIds[0] === 'navigation.sidebar.open'
    ))).toBe(true);
  });

  test('Probe 没有独立且新鲜的 evidence 时只能是 planned', async () => {
    const probes = readJson<any>(
      'contracts/product-center/drift/product-center-interaction-probes.json',
    );
    const recipes = readInteractionProbeRecipes();
    const current = releaseEvidence();
    const report = buildProductCenterInteractionProbeEvidence({
      probes,
      recipes,
      runtimeEvidence: { runId: 'PROBE_RUN', entries: [] },
      acceptedCaseIds: [],
      currentRelease: current,
      now: '2026-07-28T08:10:00.000Z',
      maxAgeMs: 30 * 60_000,
    });

    expect(report.status).toBe('review-required');
    expect(report.entries.every((entry) => entry.status === 'planned')).toBe(true);
    expect(report.entries.every((entry) => entry.probeId.startsWith('probe:'))).toBe(true);
  });

  test('Probe 应从一次去重运行生成逐 probeId 的独立 evidence', async () => {
    const probes = readJson<any>(
      'contracts/product-center/drift/product-center-interaction-probes.json',
    );
    const recipes = readInteractionProbeRecipes();
    const current = releaseEvidence();
    const selectedCaseIds = [...new Set<string>(
      probes.probes.map((entry: any) => String(entry.caseId)),
    )];
    const runtimeEntries = selectedCaseIds.map((caseId) => ({
      recipeId: recipes.find((recipe) => recipe.caseId === caseId)?.id,
      caseId,
      release: current,
      navigation: { mode: 'sidebar' },
      visibleUi: { route: recipes.find((recipe) => recipe.caseId === caseId)?.route },
      locatorUniqueness: { targetCount: 1 },
      network: { method: 'GET', operation: '/redacted-path', requestCount: 1 },
      api: { responseShape: ['data'] },
      cleanup: { completed: true, residueCount: 0 },
      claimCoverageComplete: true,
      sidebarEntryVerified: true,
    }));
    const report = buildProductCenterInteractionProbeEvidence({
      probes,
      recipes,
      runtimeEvidence: { runId: 'PROBE_RUN', entries: runtimeEntries },
      acceptedCaseIds: selectedCaseIds,
      currentRelease: current,
      now: '2026-07-28T08:10:00.000Z',
      maxAgeMs: 30 * 60_000,
    });

    expect(report.status).toBe('accepted');
    expect(report.entries).toHaveLength(probes.probes.length);
    expect(new Set(report.entries.map((entry) => entry.probeId)).size).toBe(probes.probes.length);
    expect(new Set(report.entries.map((entry) => entry.sourceRunId))).toEqual(new Set(['PROBE_RUN']));
    expect(report.entries.every((entry) => entry.status === 'observed')).toBe(true);
  });

  test('三份漂移 JSON 必须通过运行时 Schema 校验', async () => {
    const result = validateProductCenterDriftContracts({
      benchmark: readJson('contracts/product-center/drift/product-center-drift-benchmark.json'),
      historicalReplay: readJson(
        'contracts/product-center/drift/product-center-historical-failure-replay.json',
      ),
      interactionProbes: readJson(
        'contracts/product-center/drift/product-center-interaction-probes.json',
      ),
    });
    expect(result).toEqual([]);
  });

  test('真实 Probe 应接入 npm、完整流水线且先于页面合同 Diff', async () => {
    const packageJson = readJson<{ scripts: Record<string, string> }>('package.json');
    const pipeline = fs.readFileSync(
      path.join(process.cwd(), 'scripts/run-product-center-quality-pipeline.ts'),
      'utf8',
    );
    expect(packageJson.scripts['observe:product-center:page-contract'])
      .toContain('run-product-center-page-contract-probes.ts');
    expect(packageJson.scripts['test:product-center:contract'])
      .toContain('run-product-center-contract-tests.ts');
    expect(fs.readFileSync(path.join(
      process.cwd(),
      'contracts/product-center/test-manifests/product-center-contract-tests.json',
    ), 'utf8')).toContain('product-center-live-probe.contract.spec.ts');
    expect(pipeline).toContain("'page-contract-probe'");
    expect(pipeline.indexOf("'page-contract-probe'"))
      .toBeLessThan(pipeline.indexOf("'page-contract-observation'"));
    expect(fs.existsSync(path.join(
      process.cwd(),
      'tests/generated/product-center-current-release-probe.generated.spec.ts',
    ))).toBe(true);
    expect(fs.existsSync(path.join(
      process.cwd(),
      'reporters/product-center-live-release-probe.reporter.ts',
    ))).toBe(true);
    const generatedProbe = fs.readFileSync(path.join(
      process.cwd(),
      'tests/generated/product-center-current-release-probe.generated.spec.ts',
    ), 'utf8');
    expect(generatedProbe).toContain('collectProductCenterSettledBrowserReleaseEvidence');
    expect(generatedProbe).toContain('product-center-pilot-recipes.json');
    expect(generatedProbe).toContain('mainRecipesDocument.recipes.map');
    expect(generatedProbe).toContain("mode: 'parallel'");
    expect(generatedProbe.match(/test\(/g)).toHaveLength(1);
    expect(generatedProbe).toContain('parseProductCenterLiveProbeRouteSelection');
    expect(generatedProbe).toContain('PC_LIVE_RELEASE_PROBE_ROUTES');
    expect(generatedProbe).toContain('for (const route of selectedRoutes)');
    const probeRunner = fs.readFileSync(path.join(
      process.cwd(),
      'scripts/run-product-center-page-contract-probes.ts',
    ), 'utf8');
    expect(probeRunner).not.toContain('persistNormalizedEvidence');
    expect(probeRunner).not.toContain('normalizeRuntimeReleaseEvidence');
    expect(probeRunner).toContain('deduplicateProductCenterRouteProbeEntries');
    expect(probeRunner).toContain("'--workers=2'");
    expect(probeRunner).toContain("PW_WORKERS: '2'");
    expect(probeRunner).toContain('evaluateProductCenterLiveProbeCoverage');
    expect(probeRunner).toContain('buildProductCenterLiveProbeRecoveryState');
    expect(probeRunner).toContain('validateProductCenterLiveProbeAttemptArtifact');
    expect(probeRunner).toContain('PC_LIVE_RELEASE_PROBE_ROUTES');
    expect(probeRunner).toContain("cliArguments.push('--no-deps')");
    expect(probeRunner).toMatch(/options\.useCurrentFullRun\s*\? await runLiveReleaseProbe\(projectRoot\)/);
    expect(probeRunner.indexOf('compileProductCenterInteractionProbeSelection'))
      .toBeLessThan(probeRunner.indexOf('runProductCenterRecipeCollectionSelection'));
    const recipeGenerator = fs.readFileSync(path.join(
      process.cwd(),
      'scripts/generate-product-center-recipe-spec.ts',
    ), 'utf8');
    expect(recipeGenerator).toContain('collectProductCenterSettledBrowserReleaseEvidence');
    expect(recipeGenerator).toContain('collectProductCenterSettledBrowserContractSignals');
    const reporter = fs.readFileSync(path.join(
      process.cwd(),
      'reporters/product-center-live-release-probe.reporter.ts',
    ), 'utf8');
    expect(reporter).toContain('diagnosticFingerprint');
    expect(reporter).toContain('failures');
    expect(reporter).toContain('classifyProductCenterFailure');
    expect(reporter).toContain('durationMs');
    expect(reporter).toContain('retryable');
  });

  test('合同 manifest、漂移 checkpoint workflow 和 Gold 证据复用应受控生效', async () => {
    const manifest = readProductCenterContractManifest();
    expect(manifest.tests).toContain('tests/api/product-center-live-probe.contract.spec.ts');
    expect(new Set(manifest.tests).size).toBe(manifest.tests.length);

    const recipes = readJson<{ recipes: AutomationRecipe[] }>(
      'contracts/product-center/recipes/product-center-test-plan-gold-set-recipes.json',
    ).recipes;
    const reusable = decideProductCenterRuntimeReuse({
      sourceRecipes: recipes,
      targetRecipes: [...recipes].reverse(),
      sourceRun: {
        runId: 'FULL_RUN',
        scope: 'full',
        selectedCaseIds: recipes.map((recipe) => recipe.caseId),
      },
    });
    expect(reusable).toMatchObject({ reusable: true, reason: 'recipe-semantics-and-full-run-match' });
    expect(decideProductCenterRuntimeReuse({
      sourceRecipes: recipes,
      targetRecipes: [{ ...recipes[0], title: `${recipes[0].title}-changed` }, ...recipes.slice(1)],
      sourceRun: {
        runId: 'FULL_RUN',
        scope: 'full',
        selectedCaseIds: recipes.map((recipe) => recipe.caseId),
      },
    }).reusable).toBe(false);

    const workflow = fs.readFileSync(
      path.join(process.cwd(), 'scripts/run-product-center-drift-workflow.ts'),
      'utf8',
    );
    for (const stage of [
      'static-contract',
      'page-contract-probe',
      'page-contract-diff',
      'technical-proposal',
      'approval-gate',
      'apply-technical-repair',
      'impacted-ui',
      'final-full',
      'baseline-promotion',
    ]) expect(workflow).toContain(`'${stage}'`);
  });
});

function releaseEvidence() {
  return buildProductCenterReleaseEvidence({
    environmentId: 'balamxqa',
    baseURL: 'https://cc-fe.balamxqa.com',
    runId: 'PROBE_RUN',
    observedAt: '2026-07-28T08:00:00.000Z',
    pageSignals: { title: 'Merchant Center', resourcePaths: ['/assets/app-current.js'] },
  });
}

function browserSignals(roleNames: string[]) {
  return {
    schemaVersion: '1.0.0' as const,
    documentTitleFingerprint: 'a'.repeat(64),
    visibleHeadingFingerprints: ['b'.repeat(64)],
    visibleTestIdFingerprints: [],
    visibleRoleNameFingerprints: roleNames,
    visibleDialogCount: 0,
    visibleLoadingCount: 0,
    visibleRowCount: 1,
    requiredFieldCount: 0,
    inputTypes: ['text'],
    maxLengths: [100],
  };
}

function rawBrowserSignals(input: { loading: number; roleNames: string[] }) {
  return {
    documentTitle: 'Store Products',
    headings: ['Store Products'],
    testIds: [],
    roleNames: input.roleNames,
    visibleDialogCount: 0,
    visibleLoadingCount: input.loading,
    visibleRowCount: input.loading === 0 ? 1 : 0,
    requiredFieldCount: 0,
    inputTypes: ['text'],
    maxLengths: [100],
  };
}

function readJson<T = unknown>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')) as T;
}

function readInteractionProbeRecipes(): AutomationRecipe[] {
  return [
    ...readJson<{ recipes: AutomationRecipe[] }>(
      'contracts/product-center/recipes/product-center-test-plan-gold-set-recipes.json',
    ).recipes,
    ...readJson<{ recipes: AutomationRecipe[] }>(
      'contracts/product-center/recipes/product-center-item-combo-audit-probe-recipes.json',
    ).recipes,
  ];
}

function probeFailure(
  route: string,
  fingerprintSeed: string,
  retryable: boolean,
  category: 'transient-platform' | 'locator-drift',
) {
  return {
    route,
    status: 'failed',
    diagnosticFingerprint: fingerprintSeed.repeat(64).slice(0, 64),
    retryable,
    category,
    durationMs: 100,
  };
}
