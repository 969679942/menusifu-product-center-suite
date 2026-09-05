export type ProductCenterGenerationDecision = 'generated' | 'review-required';

export type ProductCenterGenerationExpectation = {
  caseId: string;
  expectedDecision: ProductCenterGenerationDecision;
};

export type ProductCenterActualGenerationDecision = {
  caseId: string;
  decision: ProductCenterGenerationDecision;
};

export type ProductCenterGenerationQuality = {
  summary: {
    total: number;
    correct: number;
    mismatched: number;
    decisionAccuracy: number;
    falsePromotions: number;
    falsePromotionRate: number;
    falseRejections: number;
    falseRejectionRate: number;
  };
  expectedCounts: Record<ProductCenterGenerationDecision, number>;
  actualCounts: Record<ProductCenterGenerationDecision, number>;
  mismatches: Array<{
    caseId: string;
    expectedDecision: ProductCenterGenerationDecision;
    actualDecision: ProductCenterGenerationDecision;
    classification: 'false-promotion' | 'false-rejection';
  }>;
};

export function evaluateProductCenterGenerationQuality(input: {
  expectations: readonly ProductCenterGenerationExpectation[];
  actualDecisions: readonly ProductCenterActualGenerationDecision[];
}): ProductCenterGenerationQuality {
  const expectations = uniqueMap(input.expectations, (item) => item.caseId, 'gold set 期望决策重复');
  const actual = uniqueMap(input.actualDecisions, (item) => item.caseId, 'gold set 实际决策重复');
  for (const caseId of expectations.keys()) {
    if (!actual.has(caseId)) throw new Error(`gold set 用例缺少实际生成决策：${caseId}`);
  }
  for (const caseId of actual.keys()) {
    if (!expectations.has(caseId)) throw new Error(`gold set 实际决策缺少期望标注：${caseId}`);
  }

  const mismatches: ProductCenterGenerationQuality['mismatches'] = [];
  for (const [caseId, expectation] of expectations) {
    const actualDecision = actual.get(caseId)!.decision;
    if (actualDecision === expectation.expectedDecision) continue;
    mismatches.push({
      caseId,
      expectedDecision: expectation.expectedDecision,
      actualDecision,
      classification: actualDecision === 'generated' ? 'false-promotion' : 'false-rejection',
    });
  }
  mismatches.sort((left, right) => left.caseId.localeCompare(right.caseId));

  const total = expectations.size;
  const falsePromotions = mismatches.filter((item) => item.classification === 'false-promotion').length;
  const falseRejections = mismatches.filter((item) => item.classification === 'false-rejection').length;
  return {
    summary: {
      total,
      correct: total - mismatches.length,
      mismatched: mismatches.length,
      decisionAccuracy: rate(total - mismatches.length, total),
      falsePromotions,
      falsePromotionRate: rate(falsePromotions, total),
      falseRejections,
      falseRejectionRate: rate(falseRejections, total),
    },
    expectedCounts: decisionCounts([...expectations.values()].map((item) => item.expectedDecision)),
    actualCounts: decisionCounts([...actual.values()].map((item) => item.decision)),
    mismatches,
  };
}

function decisionCounts(values: readonly ProductCenterGenerationDecision[]): Record<ProductCenterGenerationDecision, number> {
  return {
    generated: values.filter((value) => value === 'generated').length,
    'review-required': values.filter((value) => value === 'review-required').length,
  };
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

function uniqueMap<T>(
  items: readonly T[],
  keyFor: (item: T) => string,
  duplicateLabel: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const key = keyFor(item);
    if (!key.trim()) throw new Error(`${duplicateLabel.replace('重复', '缺少用例 ID')}`);
    if (result.has(key)) throw new Error(`${duplicateLabel}：${key}`);
    result.set(key, item);
  }
  return result;
}
