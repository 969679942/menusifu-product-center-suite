import {partitionProductCenterItemSpecs as existingSpecs} from './product-center-item-addon-other-settings-specs';
import {assertSelectionMatchesPlan} from '../../../Test Automation Platform/src/automation/system-test/system-test-revalidation-policy';
export const addonPriceSpecPath='tests/generated/product-center-item-addon-price.spec.ts';
export const addonPriceCaseIds=['TC-ITEM-ADD-008','TC-ITEM-ADD-009','TC-ITEM-ADD-010','TC-ITEM-ADD-011'];
export function partitionProductCenterItemSpecs(caseIds:readonly string[]){
  if(new Set(caseIds).size!==caseIds.length)throw Error('ITEM_SPEC_DUPLICATE_SELECTION');
  const advanced=caseIds.filter(id=>addonPriceCaseIds.includes(id));
  const routes=[...existingSpecs(caseIds.filter(id=>!addonPriceCaseIds.includes(id))),...(advanced.length?[{unitId:'handled-item-addon-price',specPath:addonPriceSpecPath,caseIds:advanced}]:[])];
  assertSelectionMatchesPlan({plannedCaseIds:caseIds,runnerCaseIds:routes.flatMap(r=>r.caseIds),phase:'item-advanced-routing-before-auth'});
  return routes;
}
