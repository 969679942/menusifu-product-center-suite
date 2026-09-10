import {partitionProductCenterItemSpecs as existingSpecs} from './product-center-item-spec-dispatch';
import {assertSelectionMatchesPlan} from '../../../Test Automation Platform/src/automation/system-test/system-test-revalidation-policy';
export const weightUnitsSpecPath='tests/generated/product-center-item-weight-units.spec.ts';
export const weightUnitsCaseIds=['TC-ITEM-STD-019'];
export function partitionProductCenterItemSpecs(caseIds:readonly string[]) {
  if(new Set(caseIds).size!==caseIds.length)throw Error('ITEM_SPEC_DUPLICATE_SELECTION');
  const weight=caseIds.filter(id=>weightUnitsCaseIds.includes(id));
  const routes=[...existingSpecs(caseIds.filter(id=>!weightUnitsCaseIds.includes(id))),...(weight.length?[{unitId:'handled-item-weight-units',specPath:weightUnitsSpecPath,caseIds:weight}]:[])];
  assertSelectionMatchesPlan({plannedCaseIds:caseIds,runnerCaseIds:routes.flatMap(r=>r.caseIds),phase:'item-weight-routing-before-auth'});
  return routes;
}
