import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildProductCenterDriftLabReport,
  type ProductCenterDriftBenchmarkContract,
  type ProductCenterHistoricalFailureReplayContract,
  type ProductCenterInteractionProbeContract,
} from '../../utils/product-center-drift-lab';
import type {
  ProductCenterPageContractObservation,
  ProductCenterPageContractRecipeInput,
} from '../../utils/product-center-page-contract-observation';

type RecipeArtifact = {
  recipes: ProductCenterPageContractRecipeInput[];
};

test.describe('商品中心可控页面漂移实验室', () => {
  test('应按权威策略覆盖九模块并准确检测、定位影响和约束修复', async () => {
    const report = buildReport();

    expect(report.status).toBe('accepted');
    expect(report.summary).toMatchObject({
      mutationScenarios: 30,
      historicalReplays: 10,
      modules: 9,
      interactionProbes: 20,
      executionTiers: 4,
    });
    expect(report.metrics).toMatchObject({
      detectionRecall: 1,
      findingPrecision: 1,
      impactRecall: 1,
      impactPrecision: 1,
      repairDecisionAccuracy: 1,
      historicalReplayAccuracy: 1,
      falseProductPromotions: 0,
      falseBusinessRuleMutations: 0,
    });
    expect(report.coverage.modules).toHaveLength(9);
    expect(report.coverage.modules.every((entry) => (
      entry.mutationScenarios >= 3 && entry.interactionProbes >= 2
    ))).toBe(true);
    expect(report.coverage.findingCodes).toEqual([
      'API_TECHNICAL_SIGNATURE_DRIFT',
      'ASSERTION_DRIFT',
      'CAPABILITY_DRIFT',
      'CLAIM_EVIDENCE_INCOMPLETE',
      'EVIDENCE_SEMANTIC_MISMATCH',
      'HIDDEN_UI_EVIDENCE',
      'LOCATOR_NOT_UNIQUE',
      'PAGE_OBSERVATION_ADDED',
      'PAGE_OBSERVATION_MISSING',
      'ROUTE_FINGERPRINT_MISMATCH',
      'ROUTE_PATH_MISMATCH',
      'RUNTIME_ACCEPTANCE_MISSING',
      'SIDEBAR_ENTRY_MISMATCH',
      'SOURCE_MAPPING_DRIFT',
    ]);
    expect(report.scenarios.every((entry) => entry.businessRuleMutationAllowed === false)).toBe(true);
  });

  test('交互 Probe 必须通过侧边栏进入并使用分层执行策略', async () => {
    const report = buildReport();

    expect(report.probes.every((probe) => probe.capabilityIds[0] === 'navigation.sidebar.open'))
      .toBe(true);
    expect(report.executionPlan.map((tier) => tier.id)).toEqual([
      'static-contract',
      'page-contract-probe',
      'impacted-ui',
      'final-full',
    ]);
    expect(report.executionPlan.find((tier) => tier.id === 'final-full')).toMatchObject({
      maximumRuns: 1,
      trigger: 'approved-repair-or-release-baseline',
    });
  });

  test('baseline 自比较必须 clean，混合 finding 必须优先 block-and-review', async () => {
    const report = buildReport();

    expect(report.cleanControl).toMatchObject({ status: 'clean', findings: 0 });
    expect(report.scenarios.find((entry) => entry.id === 'drift:mixed:block-priority'))
      .toMatchObject({
        actualFindingCodes: ['CAPABILITY_DRIFT', 'CLAIM_EVIDENCE_INCOMPLETE'],
        repairDisposition: 'block-and-review',
        accepted: true,
      });
  });

  test('历史失败回放只保存脱敏指纹且不得误晋级产品失败', async () => {
    const report = buildReport();

    expect(new Set(report.historicalReplay.results.map((entry) => entry.actualCategory))).toEqual(
      new Set([
        'execution-platform-transient',
        'environment',
        'test-data',
        'locator-drift',
        'product-behavior',
        'cleanup-residue',
        'automation-defect',
        'unknown',
      ]),
    );
    expect(report.historicalReplay.results.every((entry) => (
      /^[a-f0-9]{64}$/.test(entry.diagnosticFingerprint)
    ))).toBe(true);
    expect(report.metrics.falseProductPromotions).toBe(0);
    expect(JSON.stringify(report)).not.toMatch(
      /authorization|password|cookie|set-cookie|access[_-]?token|refresh[_-]?token/i,
    );
  });

  test('空策略分母必须 fail-closed，不能把零除零视为满分', async () => {
    const projectRoot = process.cwd();
    const report = buildProductCenterDriftLabReport({
      baseline: readJson<ProductCenterPageContractObservation>(path.join(
        projectRoot,
        'contracts/product-center/snapshots/product-center-page-contract-baseline.json',
      )),
      recipes: [],
      benchmark: {
        schemaVersion: '1.0.0',
        collectionId: 'product-center-drift-benchmark',
        policy: { minimumModules: 1, minimumScenariosPerModule: 1, requiredFindingCodes: [] },
        scenarios: [],
      },
      historicalReplay: {
        schemaVersion: '1.0.0',
        collectionId: 'product-center-historical-failure-replay',
        policy: { requiredCategories: [] },
        replays: [],
      },
      interactionProbes: {
        schemaVersion: '1.0.0',
        collectionId: 'product-center-interaction-probes',
        policy: { minimumPerModule: 1 },
        probes: [],
      },
      generatedAt: '2026-07-28T00:00:00.000Z',
    });

    expect(report.status).toBe('review-required');
    expect(report.metrics.detectionRecall).toBeNull();
    expect(report.metrics.historicalReplayAccuracy).toBeNull();
  });

  test('构建入口应接入合同套件、统一质量流水线和负责人摘要', async () => {
    const projectRoot = process.cwd();
    const packageJson = readJson<Record<string, any>>(path.join(projectRoot, 'package.json'));
    const pipeline = fs.readFileSync(
      path.join(projectRoot, 'scripts/run-product-center-quality-pipeline.ts'),
      'utf8',
    );
    const ownerBuilder = fs.readFileSync(
      path.join(projectRoot, 'scripts/build-product-center-owner-summary.ts'),
      'utf8',
    );

    expect(packageJson.scripts['build:product-center:drift-lab'])
      .toContain('build-product-center-drift-lab.ts');
    expect(packageJson.scripts['test:product-center:contract'])
      .toContain('run-product-center-contract-tests.ts');
    expect(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-manifests/product-center-contract-tests.json',
    ), 'utf8')).toContain('product-center-drift-lab.contract.spec.ts');
    expect(pipeline).toContain("'drift-lab'");
    expect(ownerBuilder).toContain('product-center-drift-lab.json');
  });
});

function buildReport() {
  const projectRoot = process.cwd();
  const interactionProbes = readJson<ProductCenterInteractionProbeContract>(path.join(
    projectRoot,
    'contracts/product-center/drift/product-center-interaction-probes.json',
  ));
  const goldRecipes = readJson<RecipeArtifact>(path.join(
    projectRoot,
    'contracts/product-center/recipes/product-center-test-plan-gold-set-recipes.json',
  )).recipes;
  const comboAuditRecipes = readJson<RecipeArtifact>(path.join(
    projectRoot,
    'contracts/product-center/recipes/product-center-item-combo-audit-probe-recipes.json',
  )).recipes;
  return buildProductCenterDriftLabReport({
    baseline: readJson<ProductCenterPageContractObservation>(path.join(
      projectRoot,
      'contracts/product-center/snapshots/product-center-page-contract-baseline.json',
    )),
    recipes: goldRecipes,
    impactRecipes: [...goldRecipes, ...comboAuditRecipes],
    benchmark: readJson<ProductCenterDriftBenchmarkContract>(path.join(
      projectRoot,
      'contracts/product-center/drift/product-center-drift-benchmark.json',
    )),
    historicalReplay: readJson<ProductCenterHistoricalFailureReplayContract>(path.join(
      projectRoot,
      'contracts/product-center/drift/product-center-historical-failure-replay.json',
    )),
    interactionProbes,
    interactionProbeEvidence: {
      entries: interactionProbes.probes.map((probe) => ({
        probeId: probe.id,
        status: 'observed' as const,
      })),
    },
    generatedAt: '2026-07-28T00:00:00.000Z',
  });
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
