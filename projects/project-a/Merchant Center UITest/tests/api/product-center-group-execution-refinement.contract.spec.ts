import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildProductCenterGroupExecutionRefinementLedger,
  type ProductCenterGroupExecutionRefinementBinding,
  type ProductCenterGroupExecutionRefinementRuntimeCase,
} from '../../utils/product-center-group-execution-refinement';

const projectRoot = path.resolve(__dirname, '../..');

test.describe('商品中心组执行配方反向精化合同', () => {
  test('严格通过证据只能生成 provisional 执行配方候选', () => {
    const ledger = buildProductCenterGroupExecutionRefinementLedger({
      generatedAt: '2026-08-16T00:00:00.000Z',
      bindings: [binding()],
      runtimeCases: [runtimeCase()],
      currentExecutionCases: [{ caseId: 'TC-GRP-SPEC-001', fingerprint: 'execution-current' }],
    });

    expect(ledger.summary).toEqual({
      currentBindings: 1,
      executableBindings: 1,
      candidates: 1,
      rerunRequired: 0,
      blocked: 0,
      obsoleteRuntime: 0,
    });
    expect(ledger.candidates[0]).toMatchObject({
      status: 'provisional',
      disposition: 'ready-for-human-review',
      governance: {
        formalCaseMutationAllowed: false,
        forbiddenTargets: expect.arrayContaining(['businessExpectation', 'businessRule', 'testIntent']),
      },
      proposedExecutionRecipe: {
        route: '/pp/brand/spec',
        dataProfile: { factoryId: 'factory:group:spec', executionProfile: 'crud-sop' },
        cleanupProfile: {
          cleanupId: 'cleanup:group:spec',
          observedStatus: 'verified-current-run-api-zero-and-ui-zero',
        },
      },
    });
    expect(JSON.stringify(ledger.candidates[0])).not.toContain('AUTO_AUDIT_SECRET');
    expect(JSON.stringify(ledger.candidates[0])).not.toContain('fixture-token');
  });

  test('绑定或执行指纹变化时必须要求重跑', () => {
    const ledger = buildProductCenterGroupExecutionRefinementLedger({
      bindings: [binding({ bindingFingerprint: 'binding-current' })],
      runtimeCases: [runtimeCase({ bindingFingerprint: 'binding-old', caseExecutionFingerprint: 'execution-old' })],
      currentExecutionCases: [{ caseId: 'TC-GRP-SPEC-001', fingerprint: 'execution-current' }],
    });

    expect(ledger.candidates).toHaveLength(0);
    expect(ledger.rerunRequired[0]).toMatchObject({
      caseId: 'TC-GRP-SPEC-001',
      reasons: ['绑定指纹已变化。', '执行实现指纹已变化。'],
    });
  });

  test('写用例缺少 API UI 零残留时不得生成候选', () => {
    const ledger = buildProductCenterGroupExecutionRefinementLedger({
      bindings: [binding()],
      runtimeCases: [runtimeCase({ cleanupStatus: 'missing-current-run-cleanup-evidence' })],
      currentExecutionCases: [{ caseId: 'TC-GRP-SPEC-001', fingerprint: 'execution-current' }],
    });

    expect(ledger.candidates).toHaveLength(0);
    expect(ledger.rerunRequired[0]).toMatchObject({ reasons: ['缺少 API/UI 零残留证据。'] });
  });

  test('最终报告不得把运行结果直接覆盖正式用例和绑定合同', () => {
    const source = fs.readFileSync(
      path.join(projectRoot, 'scripts/build-product-center-group-final-report.ts'),
      'utf8',
    );

    expect(source).toContain('execution-recipe-refinement-candidates.json');
    expect(source).toContain('observedSteps: flattenObservedSteps');
    expect(source).not.toContain('writeJson(bindingsPath');
    expect(source).not.toContain('writeJson(testCasesPath');
    expect(source).not.toContain('writeJson(brandGroupPath');
  });
});

function binding(
  override: Partial<ProductCenterGroupExecutionRefinementBinding> = {},
): ProductCenterGroupExecutionRefinementBinding {
  return {
    caseId: 'TC-GRP-SPEC-001',
    title: '新增规格组保存成功',
    route: '/pp/brand/spec',
    bindingFingerprint: 'binding-current',
    recipeId: 'recipe:group:TC-GRP-SPEC-001',
    capabilityIds: ['group.open', 'group.create'],
    assertionIds: ['claim:1'],
    factoryId: 'factory:group:spec',
    cleanupId: 'cleanup:group:spec',
    generationAllowed: true,
    executionProfile: 'crud-sop',
    ...override,
  };
}

function runtimeCase(
  override: Partial<ProductCenterGroupExecutionRefinementRuntimeCase> = {},
): ProductCenterGroupExecutionRefinementRuntimeCase {
  return {
    caseId: 'TC-GRP-SPEC-001',
    status: 'passed',
    classification: 'passed',
    bindingFingerprint: 'binding-current',
    finalRunId: 'run-current',
    observedEvidence: ['navigation', 'ui-assertion', 'api-mutation', 'cleanup'],
    observedAssertionIds: ['claim:1'],
    missingEvidence: [],
    missingAssertions: [],
    applicationVersionFingerprint: 'a'.repeat(64),
    cleanupStatus: 'verified-current-run-api-zero-and-ui-zero',
    claimCoverageComplete: true,
    caseExecutionFingerprint: 'execution-current',
    observedSteps: [
      { title: '填写 AUTO_AUDIT_SECRET token=fixture-token', durationMs: 12, depth: 0 },
      { title: '点击确定', durationMs: 8, depth: 0 },
    ],
    evidencePaths: ['Merchant Center UITest/output/run-current.json'],
    ...override,
  };
}
