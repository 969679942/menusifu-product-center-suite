import { expect, test } from '@playwright/test';
import { buildIncrementalTestPlan } from '../../utils/incremental-test-plan';
import { buildProductCenterIncrementalTestPlan } from '../../utils/product-center-incremental-test-plan';
import type { ProductCenterContractDiff } from '../../utils/product-center-contract-diff';
import type { ProductCenterTestContract } from '../../utils/product-center-test-contract';

test.describe('商品中心合同增量执行计划', () => {
  test('应从精确影响明细生成唯一文件和可复现用例选择', async () => {
    const input = {
      contractVersion: '1.0.0',
      diffFingerprint: 'a'.repeat(64),
      changedRecords: [
        { collection: 'fields', id: 'field:a', route: '/route/a' },
        { collection: 'fields', id: 'field:b', route: '/route/a' },
      ],
      impactedCases: [
        { caseId: 'negative:a', match: 'source-id' as const, changeIds: ['field:a'] },
        { caseId: 'negative:b', match: 'source-id' as const, changeIds: ['field:b'] },
      ],
      traceability: [
        {
          caseId: 'negative:a', sourceIds: ['field:a'],
          specFile: 'tests/e2e/negative.spec.ts', testTitle: '字段 A 应限制长度', rerunGrep: '字段 A 应限制长度',
        },
        {
          caseId: 'negative:b', sourceIds: ['field:b'],
          specFile: 'tests/e2e/negative.spec.ts', testTitle: '字段 B 应限制长度', rerunGrep: '字段 B 应限制长度',
        },
      ],
    };

    const first = buildIncrementalTestPlan(input);
    const second = buildIncrementalTestPlan(input);

    expect(first).toEqual(second);
    expect(first.specFiles).toEqual(['tests/e2e/negative.spec.ts']);
    expect(first.cases.map((item) => item.caseId)).toEqual(['negative:a', 'negative:b']);
    expect(first.grep).toBe('(?:字段 A 应限制长度|字段 B 应限制长度)');
    expect(first.planFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  test('缺少追溯记录时必须阻断而不是静默漏跑', async () => {
    expect(() => buildIncrementalTestPlan({
      contractVersion: '1.0.0', diffFingerprint: 'b'.repeat(64), changedRecords: [],
      impactedCases: [{ caseId: 'negative:missing', match: 'source-id', changeIds: ['field:missing'] }],
      traceability: [],
    })).toThrow('增量用例缺少追溯记录：negative:missing');
  });

  test('已有 Recipe 的受影响用例必须改用侧边栏合规 generated spec', async () => {
    const plan = buildProductCenterIncrementalTestPlan({
      changes: [{ collection: 'fields', id: 'field:a', kind: 'changed', route: '/route/a' }],
      impactedCaseDetails: [{ caseId: 'negative:a', match: 'source-id', changeIds: ['field:a'] }],
    } as unknown as ProductCenterContractDiff, {
      metadata: { contractVersion: '1.0.0' },
      traceability: [{
        evidence: {
          caseId: 'negative:a',
          sourceIds: ['field:a'],
          automation: {
            specFile: 'tests/e2e/product-center-negative-sop.spec.ts',
            testTitle: '字段 A 应限制长度',
            rerunGrep: '字段 A 应限制长度',
          },
        },
      }],
    } as unknown as ProductCenterTestContract, {
      recipeCaseIds: new Set(['negative:a']),
    });

    expect(plan.specFiles).toEqual(['tests/generated/product-center-recipe-pilot.generated.spec.ts']);
  });
});
