import {partitionProductCenterItemSpecs as existingSpecs} from './product-center-item-required-name-specs';
import {assertSelectionMatchesPlan} from '../../../Test Automation Platform/src/automation/system-test/system-test-revalidation-policy';
export const advancedSettingsSpecPath='tests/generated/product-center-item-advanced-settings.spec.ts';
export const advancedSettingsCaseIds=['TC-ITEM-STD-041','TC-ITEM-STD-042'];
export function partitionProductCenterItemSpecs(caseIds:readonly string[]){
  if(new Set(caseIds).size!==caseIds.length)throw Error('ITEM_SPEC_DUPLICATE_SELECTION');
  const advanced=caseIds.filter(id=>advancedSettingsCaseIds.includes(id));
  const routes=[...existingSpecs(caseIds.filter(id=>!advancedSettingsCaseIds.includes(id))),...(advanced.length?[{unitId:'handled-item-advanced-settings',specPath:advancedSettingsSpecPath,caseIds:advanced}]:[])];
  assertSelectionMatchesPlan({plannedCaseIds:caseIds,runnerCaseIds:routes.flatMap(r=>r.caseIds),phase:'item-advanced-routing-before-auth'});
  return routes;
}
