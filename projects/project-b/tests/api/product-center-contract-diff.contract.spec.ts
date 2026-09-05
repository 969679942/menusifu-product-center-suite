import { expect, test } from '@playwright/test';
import { diffProductCenterContracts } from '../../utils/product-center-contract-diff';
import type { ProductCenterTestContract } from '../../utils/product-center-test-contract';

function contract(records: Array<{ id: string; evidence: Record<string, unknown> }>): ProductCenterTestContract {
  return {
    metadata: {
      contractVersion: '1.0.0', generatedAt: '2026-07-24T00:00:00.000Z', sourceFingerprint: 'a'.repeat(64),
      sourcePriority: [], sourceArtifacts: [], collections: ['controls'], counts: { controls: records.length },
    },
    controls: records.map((record) => ({
      ...record, status: 'observed', sourceType: 'ui-runtime', confidence: 1, generationAllowed: true,
      source: [{ path: 'fixture://ui.json' }], verifiedAt: '2026-07-24T00:00:00.000Z', version: '1.0.0',
      route: '/pp/brand/category',
    })),
  };
}

test.describe('商品中心合同增量差异', () => {
  test('应稳定识别新增删除变更及受影响用例', async () => {
    const before = contract([
      { id: 'control:create', evidence: { text: '新增' } },
      { id: 'control:delete', evidence: { text: '删除' } },
    ]);
    const after = contract([
      { id: 'control:create', evidence: { text: '新建' } },
      { id: 'control:edit', evidence: { text: '编辑' } },
    ]);
    after.traceability = [{
      id: 'trace:sop:edit-category', status: 'generated', sourceType: 'generated', confidence: 1,
      generationAllowed: false, source: [{ path: 'sop://edit-category' }], verifiedAt: '2026-07-24T00:00:00.000Z',
      version: '1.0.0', route: '/pp/brand/category', evidence: { caseId: 'edit:category' },
    }];
    after.metadata.collections.push('traceability');
    after.metadata.counts.traceability = 1;

    const first = diffProductCenterContracts(before, after);
    const second = diffProductCenterContracts(before, after);

    expect(first).toEqual(second);
    expect(first.metadataChanged).toBe(false);
    expect(first.summary).toEqual({ added: 2, removed: 1, changed: 1, unchanged: 0 });
    expect(first.impactedRoutes).toEqual(['/pp/brand/category']);
    expect(first.impactedCases).toEqual(['edit:category']);
  });

  test('字段变化应优先精确命中来源用例且未决项变化不得按路由扩散', async () => {
    const fieldId = '/pp/brand/tag/statistic#action-1#primary-1#field-35';
    const unresolvedId = 'field-boundary-drift:fixture';
    const before = contract([]);
    before.metadata.collections = ['fields', 'unresolved'];
    before.metadata.counts = { fields: 1, unresolved: 1 };
    before.fields = [{
      id: fieldId, status: 'observed', sourceType: 'ui-runtime', confidence: 1,
      generationAllowed: true, source: [{ path: 'fixture://field' }], verifiedAt: '2026-07-24',
      version: '1.0.0', route: '/pp/brand/tag/statistic', evidence: { semanticMaxLength: { exact: 128 } },
    }];
    before.unresolved = [{
      id: unresolvedId, status: 'unresolved', sourceType: 'ui-runtime', confidence: 1,
      generationAllowed: false, source: [{ path: 'fixture://unresolved' }], verifiedAt: '2026-07-24',
      version: '1.0.0', route: '/pp/brand/tag/statistic', evidence: {},
    }];
    const after = structuredClone(before);
    after.fields![0].evidence = { semanticMaxLength: { exact: 50 } };
    after.unresolved = [];
    after.metadata.collections.push('traceability');
    after.metadata.counts = { fields: 1, unresolved: 0, traceability: 3 };
    after.traceability = [
      {
        id: 'trace:sop:negative-statistic-second-language', status: 'generated', sourceType: 'generated', confidence: 1,
        generationAllowed: false, source: [{ path: 'sop://negative-statistic-second-language' }], verifiedAt: '2026-07-24',
        version: '1.0.0', route: '/pp/brand/tag/statistic', evidence: {
          caseId: 'negative:statistic-tag-second-language-max', sourceIds: [fieldId],
        },
      },
      {
        id: 'trace:sop:delete-statistic-tag', status: 'generated', sourceType: 'generated', confidence: 1,
        generationAllowed: false, source: [{ path: 'sop://delete-statistic-tag' }], verifiedAt: '2026-07-24',
        version: '1.0.0', route: '/pp/brand/tag/statistic', evidence: { caseId: 'delete:statistic-tag', sourceIds: [] },
      },
      {
        id: 'trace:sop:unrelated-route', status: 'generated', sourceType: 'generated', confidence: 1,
        generationAllowed: false, source: [{ path: 'sop://unrelated-route' }], verifiedAt: '2026-07-24',
        version: '1.0.0', route: '/pp/unrelated', evidence: { caseId: 'delete:unrelated', sourceIds: [] },
      },
    ];

    const diff = diffProductCenterContracts(before, after);

    expect(diff.impactedCases).toEqual(['negative:statistic-tag-second-language-max']);
    expect(diff.impactedRoutes).toEqual(['/pp/brand/tag/statistic']);
  });
});
