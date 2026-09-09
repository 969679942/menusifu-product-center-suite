import { expect, test } from '@playwright/test';
import { reconcileProductCenterGroupLegacyCases } from '../../scripts/reconcile-product-center-group-legacy-cases';

test.describe('商品中心组历史用例迁移对账', () => {
  test('不得静默丢弃历史运行用例', async () => {
    const { report } = reconcileProductCenterGroupLegacyCases({ write: false });
    expect(report.summary).toMatchObject({
      historicalTotal: 139,
      currentTotal: 144,
      historicalRetained: 103,
      restoredFromHistoricalBaseline: 30,
      restoreRequired: 0,
      confirmedDeprecated: 1,
      pendingConfirmation: 5,
      currentOnly: 11,
    });
    expect(report.historicalCases.filter((item) => item.disposition === 'confirmed-deprecated').map((item) => item.caseId))
      .toEqual(['TC-GRP-PKG-017']);
    expect(report.historicalCases.filter((item) => item.disposition === 'restored')).toHaveLength(30);
    expect(report.historicalCases.filter((item) => item.disposition === 'pending-confirmation').map((item) => item.caseId))
      .toEqual([
        'TC-GRP-ADD-022',
        'TC-GRP-ADD-028',
        'TC-GRP-ADD-032',
        'TC-GRP-MTH-022',
        'TC-GRP-TASTE-023',
      ]);
    expect(report.manualReview).toMatchObject({
      caseCount: 5,
      path: 'Merchant Center Info/00-待转换测试方案/待处理/2.商品中心-商品管理-组-历史5条产品偏差人工确认.md',
    });
    expect(report.manualReview.caseIds).toHaveLength(5);
    expect(report.currentOnlyCases.map((item) => item.caseId)).toEqual([
      'TC-GRP-PKG-036',
      'TC-GRP-PKG-037',
      'TC-GRP-PKG-038',
      'TC-GRP-PKG-039',
      'TC-GRP-PKG-040',
      'TC-GRP-PKG-041',
      'TC-GRP-PKG-042',
      'TC-GRP-PKG-043',
      'TC-GRP-PKG-044',
      'TC-GRP-PKG-045',
      'TC-GRP-PKG-046',
    ]);
    expect(report.rawLegacyArtifact.blockCount).toBe(141);
    expect(report.rawLegacyArtifact.notInHistoricalRuntimeCaseIds).toEqual([
      'TC-GRP-MTH-016',
      'TC-GRP-PKG-020',
      'TC-GRP-SPEC-005-A',
      'TC-GRP-SPEC-005-B',
      'TC-GRP-TASTE-004-A',
      'TC-GRP-TASTE-004-B',
      'TC-GRP-TASTE-017',
    ]);
  });
});
