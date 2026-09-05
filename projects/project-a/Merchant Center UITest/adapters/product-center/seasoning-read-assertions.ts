import type { SystemTestRecipeContext } from '../../../../Test Automation Platform/src/automation/system-test/system-test-recipe-executor';

/** Store the observation that the domain assertion actually compared; never infer values from a passed status. */
export function recordSeasoningReadAssertion(
  context: SystemTestRecipeContext,
  call: { adapterId: string; claimIds?: readonly string[] },
  expectedValue: unknown,
  actualValue: unknown,
  matched: boolean,
): void {
  for (const claimId of call.claimIds ?? []) {
    const contract=context.recipe.assertionContracts?.find(item=>item.claimId===claimId && item.adapterId===call.adapterId);
    if(!contract)throw new Error(`断言缺少观察面来源：${claimId}`);
    context.assertionReceipts.push({
      claimId,assertionAdapterId:call.adapterId,status:matched?'verified':'observed-mismatch',
      expectedValue,actualValue,actualStatus:actualValue===undefined?'unobserved':'observed',
      ...(actualValue===undefined?{unobservedReason:'页面操作未产生可核对的观测结果'}:{}),
      observationChannel:contract.observationChannel,authority:contract.authority,
      comparison:matched?'matched':'mismatched',
    });
  }
}
