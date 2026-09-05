export type ProductCenterRuleChangeLevel = 'L1' | 'L2' | 'L3' | 'L4';

export type ProductCenterRuleChangeProfileId =
  | 'targeted'
  | 'associated'
  | 'shared-static'
  | 'authorization-required';

export type ProductCenterRuleConfirmation = {
  confirmationId: string;
  ruleId: string;
  ruleGroupId: string;
  statement: string;
  linkedCanonicalIds: string[];
};

export type ProductCenterRuleChangeUiIntent =
  | 'probe'
  | 'locator-change'
  | 'create'
  | 'update'
  | 'delete';

export type ProductCenterRuleChangeImpact = {
  ruleId: string;
  level: ProductCenterRuleChangeLevel;
  profileId: ProductCenterRuleChangeProfileId;
  executionAllowed: boolean;
  associatedRuleIds: string[];
  associatedCaseIds: string[];
  changedFiles: string[];
  reasons: string[];
};

export function buildProductCenterRuleChangeImpact(input: {
  ruleId: string;
  confirmations: readonly ProductCenterRuleConfirmation[];
  changedFiles: readonly string[];
  uiIntent?: ProductCenterRuleChangeUiIntent;
  sourceConflict?: boolean;
}): ProductCenterRuleChangeImpact {
  validateConfirmations(input.confirmations);
  const target = input.confirmations.find((item) => item.ruleId === input.ruleId);
  if (!target) throw new Error(`未找到结构化产品确认规则：${input.ruleId}`);

  const changedFiles = sortedUnique(input.changedFiles.map(normalizeChangedFile));
  const associated = input.confirmations
    .filter((item) => item.ruleGroupId === target.ruleGroupId)
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  const associatedRuleIds = associated.map((item) => item.ruleId);
  const associatedCaseIds = sortedUnique(associated.flatMap((item) => item.linkedCanonicalIds));
  const reasons = ['RULE_CONFIRMED'];

  let level: ProductCenterRuleChangeLevel = 'L1';
  if (associatedRuleIds.length > 1 || associatedCaseIds.length > 1 || input.sourceConflict) {
    level = 'L2';
    if (associatedRuleIds.length > 1) reasons.push('RULE_GROUP_HAS_MULTIPLE_RULES');
    if (associatedCaseIds.length > 1) reasons.push('MULTIPLE_CANONICAL_CASES_IMPACTED');
    if (input.sourceConflict) reasons.push('SOURCE_CONFLICT_REQUIRES_ASSOCIATED_REVIEW');
  }
  if (changedFiles.some(isSharedImplementationPath)) {
    level = 'L3';
    reasons.push('SHARED_IMPLEMENTATION_CHANGED');
  }
  if (input.uiIntent || changedFiles.some(isUiImplementationPath)) {
    level = 'L4';
    reasons.push('UI_AUTHORIZATION_REQUIRED');
  }

  return {
    ruleId: target.ruleId,
    level,
    profileId: profileForLevel(level),
    executionAllowed: level !== 'L4',
    associatedRuleIds,
    associatedCaseIds,
    changedFiles,
    reasons: sortedUnique(reasons),
  };
}

function validateConfirmations(confirmations: readonly ProductCenterRuleConfirmation[]): void {
  if (confirmations.length === 0) throw new Error('产品确认规则分母为零');
  const ruleIds = new Set<string>();
  const confirmationIds = new Set<string>();
  for (const item of confirmations) {
    if (!item.confirmationId.trim()
      || !item.ruleId.trim()
      || !item.ruleGroupId.trim()
      || !item.statement.trim()
      || item.linkedCanonicalIds.length === 0) {
      throw new Error(`产品确认规则结构无效：${item.ruleId || item.confirmationId}`);
    }
    if (ruleIds.has(item.ruleId)) throw new Error(`产品确认规则 ID 重复：${item.ruleId}`);
    if (confirmationIds.has(item.confirmationId)) {
      throw new Error(`产品确认记录 ID 重复：${item.confirmationId}`);
    }
    if (new Set(item.linkedCanonicalIds).size !== item.linkedCanonicalIds.length
      || item.linkedCanonicalIds.some((caseId) => !/^TC-ITEM-(?:STD|PKG|ADD)-\d{3}$/.test(caseId))) {
      throw new Error(`产品确认规则 canonical 关联无效：${item.ruleId}`);
    }
    ruleIds.add(item.ruleId);
    confirmationIds.add(item.confirmationId);
  }
}

function normalizeChangedFile(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized
    || normalized.startsWith('/')
    || /^[a-z]:\//i.test(normalized)
    || normalized.split('/').includes('..')) {
    throw new Error(`规则校正变更路径无效：${value}`);
  }
  return normalized;
}

function isSharedImplementationPath(filePath: string): boolean {
  return /^(?:utils|scripts|automation|reporters|fixtures)\//.test(filePath)
    || filePath === 'package.json'
    || filePath.startsWith('contracts/product-center/test-manifests/');
}

function isUiImplementationPath(filePath: string): boolean {
  return /^(?:pages|flows|tests\/e2e|tests\/generated)\//.test(filePath);
}

function profileForLevel(level: ProductCenterRuleChangeLevel): ProductCenterRuleChangeProfileId {
  if (level === 'L1') return 'targeted';
  if (level === 'L2') return 'associated';
  if (level === 'L3') return 'shared-static';
  return 'authorization-required';
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
