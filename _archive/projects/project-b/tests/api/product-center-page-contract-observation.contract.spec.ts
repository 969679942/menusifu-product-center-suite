import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  assertProductCenterPageContractBaselineEligible,
  assertProductCenterPageContractBaselinePromotionEligible,
  buildProductCenterPageContractImpact,
  buildProductCenterPageContractObservation,
  diffProductCenterPageContractObservations,
  type ProductCenterPageContractAcceptanceInput,
  type ProductCenterPageContractDiff,
  type ProductCenterPageContractEvidenceInput,
  type ProductCenterPageContractImpact,
  type ProductCenterPageContractObservation,
  type ProductCenterPageContractRecipeInput,
} from '../../utils/product-center-page-contract-observation';

test.describe('商品中心页面合同观测', () => {
  test('应从已验收 Gold 证据生成稳定且可追溯的页面观测', async () => {
    const recipe = recipeInput();
    const evidence = evidenceInput();
    const acceptance = acceptanceInput();

    const first = buildProductCenterPageContractObservation({
      recipes: [recipe],
      evidenceEntries: [evidence],
      acceptance,
      recipeFingerprint: 'recipe-fingerprint',
      evidenceFingerprint: 'evidence-fingerprint',
    });
    const second = buildProductCenterPageContractObservation({
      recipes: [recipe],
      evidenceEntries: [{ ...evidence, generatedAt: '2099-01-01T00:00:00.000Z' }],
      acceptance: { ...acceptance, generatedAt: '2099-01-01T00:00:00.000Z' },
      recipeFingerprint: 'recipe-fingerprint',
      evidenceFingerprint: 'evidence-fingerprint',
    });

    expect(first.status).toBe('clean');
    expect(first.findings).toEqual([]);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.observations).toEqual([expect.objectContaining({
      caseId: 'read:store-product-search',
      route: '/poi/location/prod-list',
      sourceIds: ['control:store-product-search'],
      sidebarEntryVerified: true,
      claimCoverageComplete: true,
      runtimeAccepted: true,
      locatorCounts: { nameInputCount: 1 },
      capabilityIds: ['navigation.sidebar.open', 'storeProduct.searchByName'],
      assertionAdapterIds: ['productCenter.verifyStoreProductSearchUi'],
    })]);
  });

  test('仅 evidence 观测时间变化不得制造页面合同漂移', async () => {
    const release = buildReleaseEvidence('route-a', '2026-07-28T08:00:00.000Z');
    const first = buildProductCenterPageContractObservation({
      recipes: [recipeInput()],
      evidenceEntries: [{ ...evidenceInput(), release }],
      acceptance: acceptanceInput(),
      recipeFingerprint: 'recipe-fingerprint',
      evidenceFingerprint: 'evidence-fingerprint',
    });
    const second = buildProductCenterPageContractObservation({
      recipes: [recipeInput()],
      evidenceEntries: [{
        ...evidenceInput(),
        release: { ...release, observedAt: '2026-07-28T09:00:00.000Z' },
      }],
      acceptance: acceptanceInput(),
      recipeFingerprint: 'recipe-fingerprint',
      evidenceFingerprint: 'evidence-fingerprint',
    });

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(diffProductCenterPageContractObservations(first, second)).toMatchObject({
      changed: false,
      status: 'clean',
      summary: { findings: 0 },
    });
  });

  test('路由资源或 API 技术签名变化必须形成技术 finding', async () => {
    const baseline = buildProductCenterPageContractObservation({
      recipes: [recipeInput()],
      evidenceEntries: [{
        ...evidenceInput(),
        release: buildReleaseEvidence('route-a'),
        browserSignals: pageSignals(['role-a']),
        network: { method: 'GET', operation: '/item/v1/items/123', requestCount: 1 },
        api: { responseShape: ['data.list'] },
      }],
      acceptance: acceptanceInput(),
      recipeFingerprint: 'recipe-fingerprint',
      evidenceFingerprint: 'evidence-fingerprint',
    });
    const current = buildProductCenterPageContractObservation({
      recipes: [recipeInput()],
      evidenceEntries: [{
        ...evidenceInput(),
        release: buildReleaseEvidence('route-b'),
        browserSignals: pageSignals(['role-a']),
        network: { method: 'POST', operation: '/item/v2/items/456', requestCount: 1 },
        api: { responseShape: ['data.items'] },
      }],
      acceptance: acceptanceInput(),
      recipeFingerprint: 'recipe-fingerprint',
      evidenceFingerprint: 'evidence-fingerprint',
    });
    const diff = diffProductCenterPageContractObservations(baseline, current);

    expect(diff.findings.map((finding) => finding.code)).toEqual([
      'API_TECHNICAL_SIGNATURE_DRIFT',
      'ROUTE_FINGERPRINT_MISMATCH',
    ]);
    expect(current.observations[0].technicalSignals).toMatchObject({
      apiSignatureStatus: 'observed',
      apiSignatureFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  test('公共资源交集变化但逐路由资源指纹一致时不得制造版本漂移', async () => {
    const baselineRelease = buildReleaseEvidence('route-a');
    const baseline = buildProductCenterPageContractObservation({
      recipes: [recipeInput()],
      evidenceEntries: [{
        ...evidenceInput(),
        release: baselineRelease,
        browserSignals: pageSignals(['role-a']),
      }],
      acceptance: acceptanceInput(),
      recipeFingerprint: 'recipe-fingerprint',
      evidenceFingerprint: 'evidence-fingerprint',
    });
    const current = buildProductCenterPageContractObservation({
      recipes: [recipeInput()],
      evidenceEntries: [{
        ...evidenceInput(),
        release: {
          ...baselineRelease,
          applicationFingerprint: '9'.repeat(64),
        },
        browserSignals: pageSignals(['role-a']),
      }],
      acceptance: acceptanceInput(),
      recipeFingerprint: 'recipe-fingerprint',
      evidenceFingerprint: 'evidence-fingerprint',
    });

    expect(diffProductCenterPageContractObservations(baseline, current)).toMatchObject({
      changed: true,
      status: 'clean',
      summary: { findings: 0 },
    });
  });

  test('列表数据行、动态操作角色和输入集合变化不得单独判定页面漂移', async () => {
    const baseline = buildProductCenterPageContractObservation({
      recipes: [recipeInput()],
      evidenceEntries: [{
        ...evidenceInput(),
        release: buildReleaseEvidence('route-a'),
        browserSignals: pageSignals(['role-a']),
      }],
      acceptance: acceptanceInput(),
      recipeFingerprint: 'recipe-fingerprint',
      evidenceFingerprint: 'evidence-fingerprint',
    });
    const current = buildProductCenterPageContractObservation({
      recipes: [recipeInput()],
      evidenceEntries: [{
        ...evidenceInput(),
        release: buildReleaseEvidence('route-a'),
        browserSignals: {
          ...pageSignals(['role-a', 'row-action-new']),
          visibleRowCount: 50,
          inputTypes: ['search', 'text'],
          maxLengths: [0, 100],
        },
      }],
      acceptance: acceptanceInput(),
      recipeFingerprint: 'recipe-fingerprint',
      evidenceFingerprint: 'evidence-fingerprint',
    });

    expect(diffProductCenterPageContractObservations(baseline, current)).toMatchObject({
      status: 'clean',
      summary: { findings: 0 },
    });
  });

  test('首次增加路由与 API 信号时应逐 case 进入受控 baseline 迁移', async () => {
    const baseline = buildProductCenterPageContractObservation({
      recipes: [recipeInput()],
      evidenceEntries: [evidenceInput()],
      acceptance: acceptanceInput(),
      recipeFingerprint: 'recipe-fingerprint',
      evidenceFingerprint: 'evidence-fingerprint',
    });
    const current = buildProductCenterPageContractObservation({
      recipes: [recipeInput()],
      evidenceEntries: [{
        ...evidenceInput(),
        release: buildReleaseEvidence('route-a'),
        browserSignals: pageSignals(['role-a']),
        network: { method: 'GET', operation: '/item/v1/items', requestCount: 1 },
        api: { responseShape: ['data.list'] },
      }],
      acceptance: acceptanceInput(),
      recipeFingerprint: 'recipe-fingerprint',
      evidenceFingerprint: 'evidence-fingerprint',
    });
    const diff = diffProductCenterPageContractObservations(baseline, current);

    expect(diff.findings).toEqual([expect.objectContaining({
      code: 'OBSERVATION_SIGNAL_BASELINE_MISSING',
      caseId: 'read:store-product-search',
    })]);
  });

  test('应将技术证据异常转成阻断 finding 而不是修改合同', async () => {
    const result = buildProductCenterPageContractObservation({
      recipes: [{
        ...recipeInput(),
        route: '/poi/location/prod-list-v2',
        capabilities: [{ id: 'storeProduct.searchByName' }],
        assertions: [{ adapterId: 'productCenter.verifyChangedUi' }],
      }],
      evidenceEntries: [{
        ...evidenceInput(),
        navigation: {
          mode: 'direct',
          targetPath: '/poi/location/prod-list',
          arrivedPath: '/poi/location/prod-list-v3',
          verifiedPaths: ['/poi/location/prod-list'],
        },
        locatorUniqueness: { nameInputCount: 2 },
        execution: {
          capabilityIds: ['navigation.sidebar.open', 'storeProduct.searchByName'],
          assertionAdapterIds: ['productCenter.verifyStoreProductSearchUi'],
        },
        claimCoverageComplete: false,
        sidebarEntryVerified: false,
      }],
      acceptance: { ...acceptanceInput(), acceptedCaseIds: [] },
      recipeFingerprint: 'recipe-fingerprint',
      evidenceFingerprint: 'evidence-fingerprint',
    });

    expect(result.status).toBe('review-required');
    expect(result.findings.map((finding) => finding.code)).toEqual([
      'ASSERTION_DRIFT',
      'CAPABILITY_DRIFT',
      'CLAIM_EVIDENCE_INCOMPLETE',
      'LOCATOR_NOT_UNIQUE',
      'ROUTE_PATH_MISMATCH',
      'RUNTIME_ACCEPTANCE_MISSING',
      'SIDEBAR_ENTRY_MISMATCH',
    ]);
    expect(result.findings.every((finding) => (
      finding.caseId === 'read:store-product-search'
      && finding.route === '/poi/location/prod-list-v2'
      && finding.sourceIds.includes('control:store-product-search')
    ))).toBe(true);
  });

  test('隐藏 DOM 和语义错配不得作为可见页面证据', async () => {
    const result = buildProductCenterPageContractObservation({
      recipes: [recipeInput()],
      evidenceEntries: [{
        ...evidenceInput(),
        visibleUi: {
          route: '/poi/location/prod-list',
          observableVisibility: 'hidden',
          semanticKey: 'store-product-name',
          observableSemanticKey: 'store-product-code',
        },
      }],
      acceptance: acceptanceInput(),
      recipeFingerprint: 'recipe-fingerprint',
      evidenceFingerprint: 'evidence-fingerprint',
    });

    expect(result.findings.map((finding) => finding.code)).toEqual([
      'EVIDENCE_SEMANTIC_MISMATCH',
      'HIDDEN_UI_EVIDENCE',
    ]);
  });

  test('baseline 仅允许从十条完整已验收且安全门禁为零的 Gold 生成', async () => {
    const recipes = Array.from({ length: 10 }, (_, index) => recipeInput(`case-${index + 1}`));
    const evidenceEntries = recipes.map((recipe) => evidenceInput(recipe.caseId));
    const acceptance = acceptanceInput(recipes.map((recipe) => recipe.caseId));
    const observation = buildProductCenterPageContractObservation({
      recipes,
      evidenceEntries,
      acceptance,
      recipeFingerprint: 'recipe-fingerprint',
      evidenceFingerprint: 'evidence-fingerprint',
    });

    expect(() => assertProductCenterPageContractBaselineEligible(observation, acceptance, 10))
      .not.toThrow();
    expect(() => assertProductCenterPageContractBaselineEligible(
      observation,
      { ...acceptance, safety: { ...acceptance.safety, sensitiveFindings: 1 } },
      10,
    )).toThrow(/安全门禁/);
  });

  test('已有 baseline 只能受控晋级获批且唯一新增的 Gold 页面观测', async () => {
    const baselineRecipes = Array.from({ length: 9 }, (_, index) => recipeInput(`case-${index + 1}`));
    const currentRecipes = [
      ...baselineRecipes,
      recipeInput('create:item-standard-single-zero-price'),
    ];
    const baseline = buildProductCenterPageContractObservation({
      recipes: baselineRecipes,
      evidenceEntries: baselineRecipes.map((recipe) => evidenceInput(recipe.caseId)),
      acceptance: acceptanceInput(baselineRecipes.map((recipe) => recipe.caseId)),
      recipeFingerprint: 'baseline-recipe-fingerprint',
      evidenceFingerprint: 'baseline-evidence-fingerprint',
    });
    const acceptance = acceptanceInput(currentRecipes.map((recipe) => recipe.caseId));
    const current = buildProductCenterPageContractObservation({
      recipes: currentRecipes,
      evidenceEntries: currentRecipes.map((recipe) => evidenceInput(recipe.caseId)),
      acceptance,
      recipeFingerprint: 'current-recipe-fingerprint',
      evidenceFingerprint: 'current-evidence-fingerprint',
    });
    const diff = diffProductCenterPageContractObservations(baseline, current);

    expect(() => assertProductCenterPageContractBaselinePromotionEligible({
      baseline,
      current,
      diff,
      acceptance,
      approvedAddedCaseIds: ['create:item-standard-single-zero-price'],
      expectedCaseCount: 10,
    })).not.toThrow();
    expect(() => assertProductCenterPageContractBaselinePromotionEligible({
      baseline,
      current,
      diff,
      acceptance,
      approvedAddedCaseIds: ['create:unapproved-case'],
      expectedCaseCount: 10,
    })).toThrow(/未获批|不一致/);
    expect(() => assertProductCenterPageContractBaselinePromotionEligible({
      baseline,
      current,
      diff: {
        ...diff,
        findings: [
          ...diff.findings,
          {
            code: 'CAPABILITY_DRIFT',
            caseId: 'case-1',
            route: '/poi/location/prod-list',
            sourceIds: ['control:store-product-search'],
            detail: 'capability 漂移',
            blocking: true,
          },
        ],
        summary: { ...diff.summary, findings: diff.summary.findings + 1 },
      },
      acceptance,
      approvedAddedCaseIds: ['create:item-standard-single-zero-price'],
      expectedCaseCount: 10,
    })).toThrow(/未获批|非技术变更|批准不一致/);
  });

  test('Diff 应保持 baseline 只读并通过 sourceId 生成精确影响集', async () => {
    const baseline = buildProductCenterPageContractObservation({
      recipes: [recipeInput()],
      evidenceEntries: [evidenceInput()],
      acceptance: acceptanceInput(),
      recipeFingerprint: 'recipe-fingerprint',
      evidenceFingerprint: 'evidence-fingerprint',
    });
    const current = buildProductCenterPageContractObservation({
      recipes: [{
        ...recipeInput(),
        capabilities: [
          { id: 'navigation.sidebar.open' },
          { id: 'storeProduct.searchByCode' },
        ],
      }],
      evidenceEntries: [{
        ...evidenceInput(),
        execution: {
          capabilityIds: ['navigation.sidebar.open', 'storeProduct.searchByCode'],
          assertionAdapterIds: ['productCenter.verifyStoreProductSearchUi'],
        },
      }],
      acceptance: acceptanceInput(),
      recipeFingerprint: 'recipe-fingerprint-v2',
      evidenceFingerprint: 'evidence-fingerprint-v2',
    });
    const diff = diffProductCenterPageContractObservations(baseline, current);
    const impact = buildProductCenterPageContractImpact(diff, [
      recipeInput(),
      recipeInput('read:shared-store-product'),
      { ...recipeInput('read:same-route-only'), sourceIds: [] },
    ]);

    expect(diff.changed).toBe(true);
    expect(diff.findings).toEqual([expect.objectContaining({
      code: 'CAPABILITY_DRIFT',
      caseId: 'read:store-product-search',
    })]);
    expect(impact.impactedCases).toEqual([
      expect.objectContaining({ caseId: 'read:shared-store-product', match: 'source-id' }),
      expect.objectContaining({ caseId: 'read:store-product-search', match: 'source-id' }),
    ]);
    expect(impact.impactedCases.map((item) => item.caseId)).not.toContain('read:same-route-only');
    expect(baseline.observations[0].capabilityIds).toEqual([
      'navigation.sidebar.open',
      'storeProduct.searchByName',
    ]);
  });

  test('baseline 晋级应只允许显式批准用例的纯 capability 参数化变更', async () => {
    const baselineRecipe = recipeInput('create:item-standard-single-zero-price');
    const currentRecipe = {
      ...baselineRecipe,
      capabilities: [
        { id: 'navigation.sidebar.open' },
        { id: 'item.createStandard' },
      ],
    };
    const baseline = buildProductCenterPageContractObservation({
      recipes: [baselineRecipe],
      evidenceEntries: [evidenceInput('create:item-standard-single-zero-price')],
      acceptance: acceptanceInput(['create:item-standard-single-zero-price']),
      recipeFingerprint: 'baseline-recipe-fingerprint',
      evidenceFingerprint: 'baseline-evidence-fingerprint',
    });
    const current = buildProductCenterPageContractObservation({
      recipes: [currentRecipe],
      evidenceEntries: [{
        ...evidenceInput('create:item-standard-single-zero-price'),
        execution: {
          capabilityIds: ['navigation.sidebar.open', 'item.createStandard'],
          assertionAdapterIds: ['productCenter.verifyStoreProductSearchUi'],
        },
      }],
      acceptance: acceptanceInput(['create:item-standard-single-zero-price']),
      recipeFingerprint: 'current-recipe-fingerprint',
      evidenceFingerprint: 'current-evidence-fingerprint',
    });
    const diff = diffProductCenterPageContractObservations(baseline, current);
    const acceptance = acceptanceInput(['create:item-standard-single-zero-price']);

    expect(diff.findings.map((finding) => finding.code)).toEqual(['CAPABILITY_DRIFT']);
    expect(() => assertProductCenterPageContractBaselinePromotionEligible({
      baseline,
      current,
      diff,
      acceptance,
      approvedAddedCaseIds: [],
      approvedCapabilityChangedCaseIds: ['create:item-standard-single-zero-price'],
      expectedCaseCount: 1,
    })).not.toThrow();
    expect(() => assertProductCenterPageContractBaselinePromotionEligible({
      baseline,
      current,
      diff,
      acceptance,
      approvedAddedCaseIds: [],
      approvedCapabilityChangedCaseIds: ['create:other'],
      expectedCaseCount: 1,
    })).toThrow(/未获批|不一致/);
  });

  test('baseline 晋级应逐用例逐 finding 审批多类型技术变化并拒绝来源阻断', async () => {
    const caseId = 'read:store-product-search';
    const baseline = buildProductCenterPageContractObservation({
      recipes: [recipeInput(caseId)],
      evidenceEntries: [evidenceInput(caseId)],
      acceptance: acceptanceInput([caseId]),
      recipeFingerprint: 'baseline-recipe',
      evidenceFingerprint: 'baseline-evidence',
    });
    const currentRecipe = {
      ...recipeInput(caseId),
      capabilities: [
        { id: 'navigation.sidebar.open' },
        { id: 'storeProduct.searchByCode' },
      ],
      assertions: [{ adapterId: 'productCenter.verifyStoreProductSearchByCode' }],
    };
    const current = buildProductCenterPageContractObservation({
      recipes: [currentRecipe],
      evidenceEntries: [{
        ...evidenceInput(caseId),
        execution: {
          capabilityIds: ['navigation.sidebar.open', 'storeProduct.searchByCode'],
          assertionAdapterIds: ['productCenter.verifyStoreProductSearchByCode'],
        },
      }],
      acceptance: acceptanceInput([caseId]),
      recipeFingerprint: 'current-recipe',
      evidenceFingerprint: 'current-evidence',
    });
    const diff = diffProductCenterPageContractObservations(baseline, current);

    expect(() => assertProductCenterPageContractBaselinePromotionEligible({
      baseline,
      current,
      diff,
      acceptance: acceptanceInput([caseId]),
      approvedAddedCaseIds: [],
      approvedFindings: [
        { caseId, code: 'CAPABILITY_DRIFT' },
        { caseId, code: 'ASSERTION_DRIFT' },
      ],
      expectedCaseCount: 1,
    })).not.toThrow();
    expect(() => assertProductCenterPageContractBaselinePromotionEligible({
      baseline,
      current,
      diff: {
        ...diff,
        findings: [{
          code: 'SOURCE_MAPPING_DRIFT',
          caseId,
          route: currentRecipe.route,
          sourceIds: [...currentRecipe.sourceIds],
          detail: '来源变化',
          blocking: true,
        }],
      },
      acceptance: acceptanceInput([caseId]),
      approvedAddedCaseIds: [],
      approvedFindings: [{ caseId, code: 'SOURCE_MAPPING_DRIFT' }],
      expectedCaseCount: 1,
    })).toThrow(/不可批准|不可晋级/);
  });

  test('构建入口应接入 npm、合同集合和统一 pipeline', async () => {
    const projectRoot = process.cwd();
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const pipelineSource = fs.readFileSync(path.join(
      projectRoot,
      'scripts/run-product-center-quality-pipeline.ts',
    ), 'utf8');
    const builderSource = fs.readFileSync(path.join(
      projectRoot,
      'scripts/build-product-center-page-contract-observation.ts',
    ), 'utf8');

    expect(packageJson.scripts['build:product-center:page-contract-observation'])
      .toContain('build-product-center-page-contract-observation.ts');
    expect(packageJson.scripts['test:product-center:contract'])
      .toContain('run-product-center-contract-tests.ts');
    expect(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-manifests/product-center-contract-tests.json',
    ), 'utf8')).toContain('product-center-page-contract-observation.contract.spec.ts');
    expect(builderSource).toContain('readProductCenterGoldContractSummary(projectRoot).caseCount');
    expect(builderSource).not.toMatch(/expectedGoldCaseCount\s*=\s*(?:10|11)\b/);
    expect(pipelineSource).toContain("'page-contract-observation'");
    expect(pipelineSource.indexOf("'page-contract-observation'"))
      .toBeLessThan(pipelineSource.indexOf("'gold-ui'"));
    expect(pipelineSource.indexOf("'page-contract-observation'"))
      .toBeLessThan(pipelineSource.indexOf("'quality-build'"));
  });

  test('最新页面合同产物无论 clean 或 review-required 都应保持指纹与影响集闭环', async () => {
    const projectRoot = process.cwd();
    const baseline = readJson<ProductCenterPageContractObservation>(path.join(
      projectRoot,
      'contracts/product-center/snapshots/product-center-page-contract-baseline.json',
    ));
    const observation = readJson<ProductCenterPageContractObservation>(path.join(
      projectRoot,
      'output/page-contract/product-center-page-contract-observation.json',
    ));
    const diff = readJson<ProductCenterPageContractDiff>(path.join(
      projectRoot,
      'output/page-contract/product-center-page-contract-diff.json',
    ));
    const impact = readJson<ProductCenterPageContractImpact>(path.join(
      projectRoot,
      'output/page-contract/product-center-page-contract-impact.json',
    ));

    expect(observation).toMatchObject({
      summary: { totalCases: 11, blockingFindings: 0 },
      contractMutationAllowed: false,
      businessRuleMutationAllowed: false,
    });
    expect(diff).toMatchObject({
      baselineFingerprint: baseline.fingerprint,
      currentFingerprint: observation.fingerprint,
      contractMutationAllowed: false,
      businessRuleMutationAllowed: false,
    });
    if (diff.summary.findings > 0) {
      expect(diff.status).toBe('review-required');
      expect(impact.status).toBe('review-required');
      expect(impact.impactedCases.length).toBeGreaterThan(0);
    } else {
      expect(diff).toMatchObject({ status: 'clean', summary: { findings: 0 } });
      expect(impact).toMatchObject({ status: 'no-impact', impactedCases: [] });
    }
    expect(impact).toMatchObject({
      contractMutationAllowed: false,
      businessRuleMutationAllowed: false,
    });
    expect(JSON.stringify({ baseline, observation, diff, impact })).not.toMatch(
      /authorization|password|cookie|set-cookie|access[_-]?token|refresh[_-]?token/i,
    );
  });
});

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function recipeInput(caseId = 'read:store-product-search'): ProductCenterPageContractRecipeInput {
  return {
    id: `product-center:test-plan-gold-set:${caseId}`,
    caseId,
    route: '/poi/location/prod-list',
    sourceIds: ['control:store-product-search'],
    capabilities: [
      { id: 'navigation.sidebar.open' },
      { id: 'storeProduct.searchByName' },
    ],
    assertions: [{ adapterId: 'productCenter.verifyStoreProductSearchUi' }],
  };
}

function evidenceInput(
  caseId = 'read:store-product-search',
): ProductCenterPageContractEvidenceInput & { generatedAt?: string } {
  return {
    recipeId: `product-center:test-plan-gold-set:${caseId}`,
    caseId,
    navigation: {
      mode: 'sidebar',
      targetPath: '/poi/location/prod-list',
      arrivedPath: '/poi/location/prod-list',
      verifiedPaths: ['/poi/location/prod-list'],
    },
    visibleUi: { route: '/poi/location/prod-list' },
    locatorUniqueness: { nameInputCount: 1 },
    execution: {
      capabilityIds: ['navigation.sidebar.open', 'storeProduct.searchByName'],
      assertionAdapterIds: ['productCenter.verifyStoreProductSearchUi'],
    },
    claimCoverageComplete: true,
    sidebarEntryVerified: true,
  };
}

function acceptanceInput(
  caseIds: string[] = ['read:store-product-search'],
): ProductCenterPageContractAcceptanceInput & { generatedAt?: string } {
  return {
    accepted: true,
    acceptedCaseIds: caseIds,
    issues: [],
    safety: {
      incompleteCheckpoints: 0,
      sensitiveFindings: 0,
      authStateArtifacts: 0,
      forbiddenPatterns: 0,
    },
  };
}

function buildReleaseEvidence(routeSignal: string, observedAt = '2026-07-28T08:00:00.000Z') {
  return {
    schemaVersion: '1.0.0' as const,
    source: 'browser-runtime' as const,
    runId: 'LIVE_RUN',
    observedAt,
    applicationFingerprint: 'a'.repeat(64),
    environmentFingerprint: 'b'.repeat(64),
    routeFingerprint: (routeSignal === 'route-a' ? 'e' : 'f').repeat(64),
    signals: {
      titleFingerprint: 'c'.repeat(64),
      language: 'en',
      metaFingerprints: [],
      resourcePathFingerprints: ['d'.repeat(64)],
    },
  };
}

function pageSignals(roleNames: string[]) {
  return {
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
