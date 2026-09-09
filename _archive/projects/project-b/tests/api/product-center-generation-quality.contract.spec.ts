import { expect, test } from '@playwright/test';
import {
  evaluateProductCenterGenerationQuality,
} from '../../utils/product-center-generation-quality';

test.describe('商品中心测试用例生成质量指标', () => {
  test('应计算正确决策、误放行和误拦截', async () => {
    const quality = evaluateProductCenterGenerationQuality({
      expectations: [
        { caseId: 'case-generated', expectedDecision: 'generated' },
        { caseId: 'case-review', expectedDecision: 'review-required' },
        { caseId: 'case-false-promotion', expectedDecision: 'review-required' },
        { caseId: 'case-false-rejection', expectedDecision: 'generated' },
      ],
      actualDecisions: [
        { caseId: 'case-generated', decision: 'generated' },
        { caseId: 'case-review', decision: 'review-required' },
        { caseId: 'case-false-promotion', decision: 'generated' },
        { caseId: 'case-false-rejection', decision: 'review-required' },
      ],
    });

    expect(quality.summary).toEqual({
      total: 4,
      correct: 2,
      mismatched: 2,
      decisionAccuracy: 0.5,
      falsePromotions: 1,
      falsePromotionRate: 0.25,
      falseRejections: 1,
      falseRejectionRate: 0.25,
    });
    expect(quality.mismatches).toEqual([
      {
        caseId: 'case-false-promotion',
        expectedDecision: 'review-required',
        actualDecision: 'generated',
        classification: 'false-promotion',
      },
      {
        caseId: 'case-false-rejection',
        expectedDecision: 'generated',
        actualDecision: 'review-required',
        classification: 'false-rejection',
      },
    ]);
  });

  test('缺少实际决策或存在重复标注时应拒绝计算', async () => {
    expect(() => evaluateProductCenterGenerationQuality({
      expectations: [{ caseId: 'missing', expectedDecision: 'generated' }],
      actualDecisions: [],
    })).toThrow('gold set 用例缺少实际生成决策：missing');

    expect(() => evaluateProductCenterGenerationQuality({
      expectations: [
        { caseId: 'duplicate', expectedDecision: 'generated' },
        { caseId: 'duplicate', expectedDecision: 'review-required' },
      ],
      actualDecisions: [{ caseId: 'duplicate', decision: 'generated' }],
    })).toThrow('gold set 期望决策重复：duplicate');
  });
});
