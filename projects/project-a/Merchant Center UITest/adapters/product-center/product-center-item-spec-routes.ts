import { assertSelectionMatchesPlan } from '../../../Test Automation Platform/src/automation/system-test/system-test-revalidation-policy';

export const standardListCaseIds = ['002', '003', '004', '063', '072', '073', '074'].map(id => `TC-ITEM-STD-${id}`);
export const standardListSpecPath = 'tests/generated/product-center-item-list-acceptance.spec.ts';
const legacySpecPath = 'tests/generated/product-center-item-216.generated.spec.ts';

/** Adapter mapping only. Public intent, grants and completion remain in their existing owners. */
export function partitionProductCenterItemSpecs(caseIds: readonly string[]) {
  const routes = [
    { unitId: 'handled-item-revalidation', specPath: legacySpecPath, caseIds: caseIds.filter(id => !standardListCaseIds.includes(id)) },
    { unitId: 'handled-item-list-acceptance', specPath: standardListSpecPath, caseIds: caseIds.filter(id => standardListCaseIds.includes(id)) },
  ].filter(route => route.caseIds.length > 0);
  if (new Set(caseIds).size !== caseIds.length) throw new Error('ITEM_SPEC_DUPLICATE_SELECTION');
  assertSelectionMatchesPlan({ plannedCaseIds: caseIds, runnerCaseIds: routes.flatMap(route => route.caseIds), phase: 'item-spec-routing-before-auth' });
  return routes;
}
