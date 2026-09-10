import {partitionProductCenterItemSpecs as existingSpecs} from './product-center-item-create-controls-specs';
import {assertSelectionMatchesPlan} from '../../../Test Automation Platform/src/automation/system-test/system-test-revalidation-policy';
export const addonOtherSettingsSpecPath='tests/generated/product-center-item-addon-other-settings.spec.ts';
export const addonOtherSettingsCaseIds=['TC-ITEM-ADD-002'];
export function partitionProductCenterItemSpecs(caseIds:readonly string[]){
  if(new Set(caseIds).size!==caseIds.length)throw Error('ITEM_SPEC_DUPLICATE_SELECTION');
  const advanced=caseIds.filter(id=>addonOtherSettingsCaseIds.includes(id));
  const routes=[...existingSpecs(caseIds.filter(id=>!addonOtherSettingsCaseIds.includes(id))),...(advanced.length?[{unitId:'handled-item-addon-other-settings',specPath:addonOtherSettingsSpecPath,caseIds:advanced}]:[])];
  assertSelectionMatchesPlan({plannedCaseIds:caseIds,runnerCaseIds:routes.flatMap(r=>r.caseIds),phase:'item-advanced-routing-before-auth'});
  return routes;
}
