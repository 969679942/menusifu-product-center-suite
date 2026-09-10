import {partitionProductCenterItemSpecs as partitionExistingSpecs} from './product-center-item-spec-routes';
import {assertSelectionMatchesPlan} from '../../../Test Automation Platform/src/automation/system-test/system-test-revalidation-policy';

export const queryReturnSpecPath='tests/generated/product-center-item-query-return.spec.ts';
export const queryReturnCaseIds=['TC-ITEM-STD-030'];
export function partitionProductCenterItemSpecs(caseIds:readonly string[]) {
  if(new Set(caseIds).size!==caseIds.length)throw Error('ITEM_SPEC_DUPLICATE_SELECTION');
  const queryIds=caseIds.filter(id=>queryReturnCaseIds.includes(id));
  const routes=[...partitionExistingSpecs(caseIds.filter(id=>!queryReturnCaseIds.includes(id))),...(queryIds.length?[{unitId:'handled-item-query-return',specPath:queryReturnSpecPath,caseIds:queryIds}]:[])];
  assertSelectionMatchesPlan({plannedCaseIds:caseIds,runnerCaseIds:routes.flatMap(route=>route.caseIds),phase:'item-spec-dispatch-before-auth'});
  return routes;
}
