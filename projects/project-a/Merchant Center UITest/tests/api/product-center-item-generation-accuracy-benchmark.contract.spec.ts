import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');
const benchmarkPath = path.join(
  projectRoot,
  'contracts/product-center/reviews/product-center-item-generation-accuracy-benchmark.json',
);

test.describe('商品测试用例当前准确性基准', () => {
  test('应逐条核对当前冻结审核标签且不得冒充独立泛化准确率', async () => {
    const exists = fs.existsSync(benchmarkPath);
    expect(exists).toBe(true);
    if (!exists) return;

    const benchmark = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8')) as any;
    expect(benchmark).toMatchObject({
      collectionId: 'product-center-item-generation-accuracy-benchmark',
      status: 'accepted-with-limitations',
      releaseConformance: {
        total: 225,
        conformant: 225,
        mismatched: 0,
        conformanceRate: 1,
        sourcePlanFingerprintMatched: true,
        allDimensionsPassed: true,
        byPriority: { P0: 86, P1: 132, P2: 7 },
        byOrigin: { 'formal-plan': 217, 'page-supplement': 8 },
      },
      independentHoldout: {
        total: 36,
        correct: 36,
        mismatched: 0,
        decisionAccuracy: 1,
        falsePromotions: 0,
        falseRejections: 0,
      },
      claimBoundary: {
        releaseCasesAreIndependentHoldout: false,
        generalizationAccuracyClaimed: false,
        independentHoldoutCases: 36,
      },
    });
    expect(benchmark.cases).toHaveLength(225);
    expect(new Set(benchmark.cases.map((item: any) => item.caseId)).size).toBe(225);
    expect(benchmark.cases.every((item: any) => (
      item.labelDecision === 'approved'
      && item.conformant === true
      && Object.values(item.dimensions).every((value) => value === 'pass')
    ))).toBe(true);
    expect(benchmark.mismatches).toEqual([]);
  });
});
