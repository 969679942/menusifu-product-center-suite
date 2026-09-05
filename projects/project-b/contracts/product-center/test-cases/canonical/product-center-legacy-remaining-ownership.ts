import bindingDocument from './product-center-legacy-remaining-automation-bindings.json';

export const LEGACY_REMAINING_SPEC_PATH = 'tests/generated/product-center-legacy-remaining.generated.spec.ts';

const ownedCaseIds = bindingDocument.bindings.map((binding) => binding.caseId);
const duplicateCaseIds = ownedCaseIds.filter((caseId, index) => ownedCaseIds.indexOf(caseId) !== index);
const foreignCaseIds = ownedCaseIds.filter((caseId) => !/^TC-(?:IMG|TAG)-/.test(caseId));
const mismatchedOwnerCaseIds = bindingDocument.bindings
  .filter((binding) => binding.scriptPath !== LEGACY_REMAINING_SPEC_PATH)
  .map((binding) => binding.caseId);

if (duplicateCaseIds.length > 0) {
  throw new Error(`历史剩余用例绑定存在重复 caseId：${[...new Set(duplicateCaseIds)].join('、')}`);
}
if (foreignCaseIds.length > 0) {
  throw new Error(`历史剩余用例仅允许图片和标签用例：${foreignCaseIds.join('、')}`);
}
if (mismatchedOwnerCaseIds.length > 0) {
  throw new Error(`历史剩余用例 owning spec 不一致：${mismatchedOwnerCaseIds.join('、')}`);
}

export const LEGACY_REMAINING_OWNED_CASE_IDS = Object.freeze([...ownedCaseIds]);

export function resolveLegacyRemainingSelection(rawSelection: string | undefined): ReadonlySet<string> {
  const requestedCaseIds = rawSelection === undefined
    ? [...LEGACY_REMAINING_OWNED_CASE_IDS]
    : rawSelection.split(',').map((value) => value.trim()).filter(Boolean);
  const duplicateSelections = requestedCaseIds
    .filter((caseId, index) => requestedCaseIds.indexOf(caseId) !== index);
  if (duplicateSelections.length > 0) {
    throw new Error(`PC_REMAINING_CASE_IDS 存在重复 caseId：${[...new Set(duplicateSelections)].join('、')}`);
  }
  const ownedCaseIdSet = new Set<string>(LEGACY_REMAINING_OWNED_CASE_IDS);
  const foreignSelections = requestedCaseIds.filter((caseId) => !ownedCaseIdSet.has(caseId));
  if (foreignSelections.length > 0) {
    throw new Error(`PC_REMAINING_CASE_IDS 包含非本入口归属用例：${foreignSelections.join('、')}`);
  }
  return new Set(requestedCaseIds);
}
