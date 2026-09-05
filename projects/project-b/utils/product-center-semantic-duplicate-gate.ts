import crypto from 'node:crypto';

export type SemanticDuplicateCandidate = {
  groupId: string;
  caseIds: string[];
  sourceCitation: string;
  sourceCaseFingerprint: string;
  semanticKey: string;
  reason: string;
};

type CandidateRule = {
  caseId: string;
  module?: string;
  productType?: string;
  scenarioFamily?: string;
  ruleKind?: string;
  sourceCitation?: string;
  sourceCaseFingerprint?: string;
  scope?: string[];
  sourceIds?: string[];
  conditionClaims?: string[];
  actionClaims?: string[];
  outcomeClaims?: string[];
};

export function auditSemanticDuplicateCandidates(
  rules: readonly CandidateRule[],
): SemanticDuplicateCandidate[] {
  const byFingerprint = new Map<string, CandidateRule[]>();
  for (const rule of rules) {
    const sourceFingerprint = rule.sourceIds?.find((value) => value.startsWith('test-plan-fingerprint:'))
      ?? rule.sourceCaseFingerprint;
    if (!sourceFingerprint || !rule.sourceCitation) continue;
    const semanticKey = [
      rule.module ?? '',
      rule.productType ?? '',
      rule.scenarioFamily ?? '',
      rule.ruleKind ?? '',
      rule.sourceCitation,
      (rule.scope ?? []).join('|'),
      sourceFingerprint,
      (rule.conditionClaims ?? []).length,
      (rule.actionClaims ?? []).length,
      (rule.outcomeClaims ?? []).length,
    ].join('::');
    byFingerprint.set(semanticKey, [...(byFingerprint.get(semanticKey) ?? []), rule]);
  }
  return [...byFingerprint.entries()]
    .filter(([, group]) => new Set(group.map((item) => item.caseId)).size > 1)
    .map(([semanticKey, group]) => {
      const sourceFingerprint = group[0].sourceIds?.find((value) => value.startsWith('test-plan-fingerprint:'))
        ?? group[0].sourceCaseFingerprint!;
      const groupId = `SEM-${crypto.createHash('sha256').update(semanticKey).digest('hex').slice(0, 16)}`;
      return {
        groupId,
        caseIds: [...new Set(group.map((item) => item.caseId))].sort(),
        sourceCitation: group[0].sourceCitation!,
        sourceCaseFingerprint: sourceFingerprint,
        semanticKey,
        reason: '多个用例共享同一来源指纹、业务对象、场景族、作用域和断言形状；必须声明差异或合并决策，不能仅因 caseId 不同而视为独立覆盖。',
      };
    });
}
