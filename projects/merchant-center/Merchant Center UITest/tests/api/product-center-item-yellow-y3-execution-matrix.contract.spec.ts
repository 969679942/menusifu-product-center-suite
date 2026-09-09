import { expect, test } from '@playwright/test';
import path from 'node:path';
import { buildProductCenterItemYellowY3ExecutionMatrix } from '../../scripts/build-product-center-item-yellow-y3-execution-matrix';

test('Y3 execution matrix 应完整覆盖37条19组且不要求逐条人工审核', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const { artifact } = buildProductCenterItemYellowY3ExecutionMatrix({
    projectRoot,
    generatedAt: '2026-08-02T15:00:00.000Z',
  });
  expect(artifact).toMatchObject({
    status: 'ready-for-batched-execution',
    summary: {
      groups: 19,
      cases: 37,
      firstBatchGroups: 6,
      firstBatchCases: 9,
      secondBatchGroups: 6,
      secondBatchCases: 11,
      readyExistingCapability: 9,
      adapterRequired: 11,
      controlledFixtureRequired: 15,
      ruleEvidenceRequired: 2,
      humanReviewRequired: 0,
    },
    policy: {
      executionMode: 'wave-shared-chain',
      caseLevelRunsAllowed: false,
      caseLevelEvidenceRequired: true,
      evidenceInheritanceAllowed: false,
      cleanupInFinally: true,
      zeroResidueRequired: true,
    },
  });
  expect(artifact.groups).toHaveLength(19);
  expect(artifact.cases).toHaveLength(37);
  expect(new Set(artifact.cases.map((item) => item.caseId)).size).toBe(37);
  expect(artifact.groups.reduce((total, group) => total + group.caseLevelEvidenceRequired, 0)).toBe(37);
  expect(artifact.cases.every((item) => item.evidencePolicy.evidenceInheritanceAllowed === false)).toBe(true);
});

test('Y3 B2 应冻结六组十一条适配器场景', () => {
  const { artifact } = buildProductCenterItemYellowY3ExecutionMatrix({
    projectRoot: path.resolve(__dirname, '../..'),
    generatedAt: '2026-08-02T15:00:00.000Z',
  });
  expect(artifact.secondBatch).toEqual({
    batchId: 'Y3-B2',
    caseIds: [
      'TC-ITEM-STD-019', 'TC-ITEM-STD-084', 'TC-ITEM-STD-085', 'TC-ITEM-STD-086',
      'TC-ITEM-ADD-025', 'TC-ITEM-ADD-007', 'TC-ITEM-ADD-009', 'TC-ITEM-ADD-022',
      'TC-ITEM-ADD-011', 'TC-ITEM-ADD-049', 'TC-ITEM-ADD-038',
    ],
    groupIds: ['AT13', 'AT16', 'AT22', 'AT25', 'AT27', 'AT30'],
    executionOrder: ['weighted-unit', 'multi-spec-order', 'attribute-removal', 'side-create', 'side-price', 'side-image', 'side-other-settings'],
  });
});

test('Y3 B1 应一次执行六组九条低风险场景', () => {
  const { artifact } = buildProductCenterItemYellowY3ExecutionMatrix({
    projectRoot: path.resolve(__dirname, '../..'),
    generatedAt: '2026-08-02T15:00:00.000Z',
  });
  expect(artifact.firstBatch).toEqual({
    batchId: 'Y3-B1',
    caseIds: [
      'TC-ITEM-STD-030',
      'TC-ITEM-ADD-041',
      'TC-ITEM-ADD-002',
      'TC-ITEM-PKG-048',
      'TC-ITEM-UI-007',
      'TC-ITEM-UI-008',
      'TC-ITEM-UI-004',
      'TC-ITEM-UI-005',
      'TC-ITEM-UI-006',
    ],
    groupIds: ['AT04', 'AT24', 'AT32', 'AT38', 'AT52', 'AT54'],
    executionOrder: ['list-filter-memory', 'create-page-actions', 'other-settings-capability', 'batch-menu'],
  });
});
