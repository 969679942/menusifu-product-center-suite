import { expect, test } from '@playwright/test';
import {
  buildProductCenterGroupRuleGovernance,
  type ProductCenterGroupRuleCase,
} from '../../utils/product-center-group-rule-governance';

const source = {
  ruleId: 'BR-GRP-002',
  statement: '[B端] 组名称：100 字符，品牌内组名称不可重复。',
  sourcePath: 'Merchant Center Info/商品中心业务规则.md',
  sourceLocator: 'line:1905',
};

function ruleCase(
  caseId: string,
  text: string,
  versionFingerprint: string | null,
  classification: string = 'passed',
): ProductCenterGroupRuleCase {
  return {
    caseId,
    title: text,
    module: '商品管理 → 规格组',
    route: '/pp/brand/spec',
    sourceIds: ['BR-GRP-002'],
    preconditions: ['存在受控规格组数据。'],
    steps: [text],
    expectedResults: [classification === 'observed-product-drift' ? '实际行为与规则冲突。' : '结果符合规则。'],
    assertionIds: [`assertion:${caseId}`],
    classification,
    claimCoverageComplete: classification === 'passed',
    uiAssertionObserved: classification === 'passed',
    apiAssertionObserved: classification === 'passed',
    cleanupStatus: classification === 'passed' ? 'not-needed-no-created-data' : 'not-run-blocked',
    finalRunId: classification === 'passed' ? `run:${caseId}` : null,
    applicationVersionFingerprint: versionFingerprint,
  };
}

function completeCases(versionA: string | null, versionB: string | null): ProductCenterGroupRuleCase[] {
  return [
    ruleCase('TC-GRP-SPEC-101', '正常创建组保存成功', versionA),
    ruleCase('TC-GRP-SPEC-102', '名称重复时保存失败', versionA),
    ruleCase('TC-GRP-SPEC-103', '名称超过100字符按边界处理', versionB),
    ruleCase('TC-GRP-SPEC-104', '品牌内名称仅大小写不同视为重复', versionB),
  ];
}

test.describe('商品中心组规则反向候选与人工晋级合同', () => {
  test('旧运行缺少前端构建指纹时只生成候选，不进入人工审核队列', () => {
    const result = buildProductCenterGroupRuleGovernance({
      cases: completeCases(null, null),
      ruleSources: [source],
    });

    expect(result.registry.summary).toMatchObject({ candidates: 1, readyForFormalReview: 0 });
    expect(result.reviewQueue).toEqual([]);
    expect(result.formalRules).toEqual([]);
    expect(result.registry.candidates[0].formalReview.blockers).toContain(
      'DISTINCT_VERSION_FINGERPRINTS_REQUIRED:2',
    );
    expect(result.observations.every((item) => !item.eligibleForFormalReviewEvidence)).toBe(true);
  });

  test('全部维度、独立数据和两个前端版本满足后自动进入人工审核队列', () => {
    const result = buildProductCenterGroupRuleGovernance({
      cases: completeCases('a'.repeat(64), 'b'.repeat(64)),
      ruleSources: [source],
    });

    expect(result.reviewQueue).toHaveLength(1);
    expect(result.reviewQueue[0]).toMatchObject({
      ruleId: 'CBR-RUNTIME-BR-GRP-002',
      statement: source.statement,
      candidateFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      formalReview: {
        status: 'ready-for-human-review',
        triggered: true,
        metrics: {
          independentDataVariants: 4,
          distinctVersionFingerprints: 2,
          missingDimensions: [],
        },
      },
    });
  });

  test('达到门禁后仍须人工批准当前候选指纹才能生成正式规则', () => {
    const initial = buildProductCenterGroupRuleGovernance({
      cases: completeCases('a'.repeat(64), 'b'.repeat(64)),
      ruleSources: [source],
    });
    const candidate = initial.reviewQueue[0];
    const approved = buildProductCenterGroupRuleGovernance({
      cases: completeCases('a'.repeat(64), 'b'.repeat(64)),
      ruleSources: [source],
      decisions: [{
        ruleId: candidate.ruleId,
        candidateFingerprint: candidate.candidateFingerprint,
        decision: 'approve',
        confirmedBy: '金将军',
        decidedAt: '2026-08-14T08:00:00.000Z',
        rationale: '规则表述和适用范围确认无误',
        approvedStatement: candidate.statement,
      }],
    });

    expect(approved.formalRules).toEqual([
      expect.objectContaining({
        ruleId: candidate.ruleId,
        currentStatus: 'formal',
        authority: expect.objectContaining({ confirmedBy: '金将军' }),
      }),
    ]);
  });

  test('任一产品偏差都将候选标记为冲突并阻断审核', () => {
    const cases = completeCases('a'.repeat(64), 'b'.repeat(64));
    cases.push(ruleCase(
      'TC-GRP-SPEC-105',
      '品牌内同名组实际保存成功',
      'b'.repeat(64),
      'observed-product-drift',
    ));
    const result = buildProductCenterGroupRuleGovernance({ cases, ruleSources: [source] });

    expect(result.reviewQueue).toEqual([]);
    expect(result.registry.candidates[0]).toMatchObject({
      currentStatus: 'conflict',
      formalReview: { status: 'blocked-by-conflict', triggered: false },
    });
  });
});
