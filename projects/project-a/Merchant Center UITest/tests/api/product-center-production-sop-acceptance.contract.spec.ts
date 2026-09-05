import { expect, test } from '@playwright/test';
import acceptance from '../../contracts/product-center/product-center-production-sop-acceptance.json';
import { productCenterNegativeReviewRequired } from '../../sop/product-center/product-center-negative-sop.catalog';
import { highDependencySopCatalog } from '../../sop/product-center/product-center-high-dependency-sop.catalog';
import { lowDependencySopCatalog } from '../../sop/product-center/product-center-low-dependency-sop.catalog';

test.describe('商品中心生产 SOP 验收合同', () => {
  test('应锁定执行、阻塞、评审与零残留门槛', async () => {
    expect(acceptance.scope.executableDescriptors).toEqual({
      total: 46, create: 5, edit: 13, delete: 16, negative: 12,
    });
    expect(acceptance.gates.incrementalContractImpact).toMatchObject({
      targetPassed: 4, actualPassed: 4, selectedBy: 'exact-source-id', status: 'passed',
    });
    expect(acceptance.gates.apiContracts).toMatchObject({ targetPassed: 135, actualPassed: 135, status: 'passed' });
    expect(acceptance.gates.testCasePreflight).toMatchObject({
      existingCases: 46,
      semanticPassed: 46,
      executable: 46,
      coverageDenominator: 328,
      coverageCovered: 152,
      coverageMissing: 176,
      scope: 'case-only',
      fullCoverageRequired: true,
      status: 'passed',
    });
    expect(acceptance.gates.recipePilot).toMatchObject({
      targetPassed: 46, actualPassed: 46, unresolved: 0, workers: 4, status: 'passed',
    });
    expect(acceptance.gates.categoryModulePilot).toMatchObject({
      totalCases: 7,
      executable: 7,
      manual: 0,
      coverageRequired: 7,
      coverageCovered: 7,
      coverageMissing: 0,
      uiPassed: 7,
      workers: 4,
      incompleteCheckpoints: 0,
      status: 'passed',
    });
    expect(acceptance.gates.recipeGovernance).toMatchObject({
      compiled: 46, sourceBindingRate: 1, incrementalSelected: 4,
      incrementalUnsupported: 0, promoted: 46, locatorDrift: 0, status: 'passed',
    });
    expect(acceptance.scope.notApplicable.total).toBe(
      [...lowDependencySopCatalog, ...highDependencySopCatalog]
        .reduce((count, item) => count + item.notApplicable.length, 0),
    );
    expect(acceptance.scope.reviewRequired.total).toBe(productCenterNegativeReviewRequired.length);
    expect(acceptance.gates.coreStability.targetPassed).toBe(46);
    expect(acceptance.gates.coreStabilitySoak.targetPassed).toBe(46);
    expect(acceptance.gates.routeResidueScan).toMatchObject({ targetRoutes: 34, allowedHits: 0, allowedErrors: 0 });
    expect(acceptance.gates.sensitiveScan.allowedFindings).toBe(0);
    expect(acceptance.gates.savedAuthState.allowedFiles).toBe(0);
    expect(acceptance.gates.incompleteCheckpoints.allowedEntries).toBe(0);
  });
});
