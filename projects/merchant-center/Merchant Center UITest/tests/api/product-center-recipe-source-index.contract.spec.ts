import { expect, test } from '@playwright/test';
import contractDocument from '../../contracts/product-center/product-center-test-contract.json';
import {
  buildProductCenterRecipeSourceIndex,
} from '../../automation/recipe/product-center-recipe-source-index';
import type { ProductCenterTestContract } from '../../utils/product-center-test-contract';

const contract = contractDocument as unknown as ProductCenterTestContract;

test.describe('商品中心 Recipe 真实来源索引', () => {
  test('四十六条 SOP 应建立唯一且完整的合同来源链', async () => {
    const index = buildProductCenterRecipeSourceIndex(contract);

    expect(index.entries).toHaveLength(46);
    expect(index.unresolved).toEqual([]);
    expect(new Set(index.entries.map((entry) => entry.caseId)).size).toBe(46);
    for (const entry of index.entries) {
      expect(entry.traceabilityId).toBe(`trace:sop:${entry.caseId}`);
      expect(entry.sourceIds.length).toBeGreaterThan(0);
      expect(entry.sourceIds.some((id) => id.startsWith('sop-catalog:'))).toBe(false);
      expect(entry.stageGaps).toEqual([]);
    }
  });

  test('核心与边界场景应绑定真实 route field rule control 或 API mapping ID', async () => {
    const index = buildProductCenterRecipeSourceIndex(contract);
    const category = index.entries.find((entry) => entry.caseId === 'edit:category')!;
    const boundary = index.entries.find(
      (entry) => entry.caseId === 'negative:statistic-tag-second-language-max',
    )!;

    expect(category.sourceIds).toContain('route:b0de43a7ecd9');
    expect(category.sourceIds.some((id) => id.startsWith('/pp/brand/category#control-'))).toBe(true);
    expect(category.sourceIds.some((id) => id.startsWith('mapping:'))).toBe(true);
    expect(boundary.sourceIds).toContain('/pp/brand/tag/statistic#action-1#primary-1#field-35');
    expect(boundary.sourceIds.some((id) => id.startsWith('business-rule-section:'))).toBe(true);
  });

  test('来源记录缺失时应阻断对应 case', async () => {
    const broken = structuredClone(contract);
    broken.routes = broken.routes?.filter((record) => record.id !== 'route:b0de43a7ecd9');

    const index = buildProductCenterRecipeSourceIndex(broken);

    expect(index.entries.some((entry) => entry.caseId === 'edit:category')).toBe(false);
    expect(index.unresolved.find((item) => item.caseId === 'edit:category')).toMatchObject({
      reasonCode: 'MISSING_SOURCE_RECORD',
      sourceIds: ['route:b0de43a7ecd9'],
    });
  });

  test('重复 traceability 和 stage gap 应进入未决', async () => {
    const broken = structuredClone(contract);
    const trace = broken.traceability?.find((record) => record.id === 'trace:sop:edit:method')!;
    broken.traceability = [...(broken.traceability ?? []), structuredClone(trace)];
    const boundary = broken.traceability.find(
      (record) => record.id === 'trace:sop:negative:statistic-tag-second-language-max',
    )!;
    boundary.evidence.stageGaps = ['ui-api-operation-mapping'];

    const index = buildProductCenterRecipeSourceIndex(broken);

    expect(index.unresolved.find((item) => item.caseId === 'edit:method')).toMatchObject({
      reasonCode: 'AMBIGUOUS_TRACEABILITY',
    });
    expect(index.unresolved.find(
      (item) => item.caseId === 'negative:statistic-tag-second-language-max',
    )).toMatchObject({ reasonCode: 'STAGE_GAP' });
  });

  test('相同合同输入应生成稳定指纹', async () => {
    expect(buildProductCenterRecipeSourceIndex(structuredClone(contract)).fingerprint)
      .toBe(buildProductCenterRecipeSourceIndex(contract).fingerprint);
  });
});
