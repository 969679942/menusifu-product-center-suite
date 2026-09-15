import {partitionProductCenterItemSpecs as existingSpecs} from './product-center-item-execution-specs';
import {assertSelectionMatchesPlan} from '../../../Test Automation Platform/src/automation/system-test/system-test-revalidation-policy';
export const requiredNameSpecPath='tests/generated/product-center-item-required-name.spec.ts';
export const requiredNameCaseIds=['TC-ITEM-STD-005'];
export function partitionProductCenterItemSpecs(caseIds:readonly string[]) {
  if(new Set(caseIds).size!==caseIds.length)throw Error('ITEM_SPEC_DUPLICATE_SELECTION');
  const required=caseIds.filter(id=>requiredNameCaseIds.includes(id));
  const routes=[...existingSpecs(caseIds.filter(id=>!requiredNameCaseIds.includes(id))),...(required.length?[{unitId:'handled-item-required-name',specPath:requiredNameSpecPath,caseIds:required}]:[])];
  assertSelectionMatchesPlan({plannedCaseIds:caseIds,runnerCaseIds:routes.flatMap(r=>r.caseIds),phase:'item-required-name-routing-before-auth'});
  return routes;
}
