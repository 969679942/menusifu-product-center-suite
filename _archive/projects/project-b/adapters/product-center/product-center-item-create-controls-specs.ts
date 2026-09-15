import {partitionProductCenterItemSpecs as existingSpecs} from './product-center-item-advanced-specs';
import {assertSelectionMatchesPlan} from '../../../Test Automation Platform/src/automation/system-test/system-test-revalidation-policy';
export const createControlsSpecPath='tests/generated/product-center-item-create-controls.spec.ts';
export const createControlsCaseIds=['TC-ITEM-STD-045','TC-ITEM-STD-048','TC-ITEM-STD-049'];
export function partitionProductCenterItemSpecs(caseIds:readonly string[]){
  if(new Set(caseIds).size!==caseIds.length)throw Error('ITEM_SPEC_DUPLICATE_SELECTION');
  const advanced=caseIds.filter(id=>createControlsCaseIds.includes(id));
  const routes=[...existingSpecs(caseIds.filter(id=>!createControlsCaseIds.includes(id))),...(advanced.length?[{unitId:'handled-item-create-controls',specPath:createControlsSpecPath,caseIds:advanced}]:[])];
  assertSelectionMatchesPlan({plannedCaseIds:caseIds,runnerCaseIds:routes.flatMap(r=>r.caseIds),phase:'item-advanced-routing-before-auth'});
  return routes;
}
