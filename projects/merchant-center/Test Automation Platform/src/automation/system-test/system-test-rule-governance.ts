import { createHash } from 'node:crypto';
import type { SystemTestRuleLedger } from './system-test-contract';

export type SystemTestRuleEvidence = {
  evidenceId: string;
  ruleId: string;
  versionFingerprint: string;
  environmentId: string;
  dataVariantId: string;
  dimension: 'positive' | 'negative' | 'boundary' | 'scope';
  result: 'supports' | 'contradicts' | 'inconclusive';
  uiEvidenceIds: string[];
  apiEvidenceIds: string[];
  cleanupVerified: boolean;
};

export type SystemTestFormalReviewPolicy = {
  minimumIndependentDataVariants: number;
  minimumDistinctVersionFingerprints: number;
  requiredDimensions: SystemTestRuleEvidence['dimension'][];
  requireUiEvidence: boolean;
  requireApiEvidence: boolean;
  requireCleanupVerified: boolean;
  maximumContradictions: 0;
};

export const defaultSystemTestFormalReviewPolicy: SystemTestFormalReviewPolicy = {
  minimumIndependentDataVariants: 3,
  minimumDistinctVersionFingerprints: 2,
  requiredDimensions: ['positive', 'negative', 'boundary', 'scope'],
  requireUiEvidence: true,
  requireApiEvidence: true,
  requireCleanupVerified: true,
  maximumContradictions: 0,
};

export type SystemTestFormalReviewQueueItem = {
  ruleId: string;
  candidateFingerprint: string;
  status: 'not-ready' | 'ready-for-human-review' | 'blocked-by-conflict';
  blockers: string[];
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
};

export function buildSystemTestFormalReviewQueue(
  rules: SystemTestRuleLedger,
  evidence: readonly SystemTestRuleEvidence[],
  policy: SystemTestFormalReviewPolicy = defaultSystemTestFormalReviewPolicy,
): SystemTestFormalReviewQueueItem[] {
  return rules.rules.filter((rule) => rule.status !== 'formal').map((rule) => {
    const candidateFingerprint = createHash('sha256').update(JSON.stringify(rule)).digest('hex');
    const applicable = evidence.filter((item) => item.ruleId === rule.ruleId);
    const contradicting = applicable.filter((item) => item.result === 'contradicts');
    const supporting = applicable.filter((item) => item.result === 'supports' && meetsPolicy(item, policy));
    const variants = new Set(supporting.map((item) => item.dataVariantId));
    const versions = new Set(supporting.map((item) => item.versionFingerprint));
    const dimensions = new Set(supporting.map((item) => item.dimension));
    const blockers: string[] = [];
    if (contradicting.length > policy.maximumContradictions) blockers.push('CONTRADICTION_PRESENT');
    if (variants.size < policy.minimumIndependentDataVariants) blockers.push('DATA_VARIANTS_INSUFFICIENT');
    if (versions.size < policy.minimumDistinctVersionFingerprints) blockers.push('VERSION_FINGERPRINTS_INSUFFICIENT');
    for (const dimension of policy.requiredDimensions) {
      if (!dimensions.has(dimension)) blockers.push(`DIMENSION_MISSING:${dimension}`);
    }
    return {
      ruleId: rule.ruleId,
      candidateFingerprint,
      status: contradicting.length > policy.maximumContradictions
        ? 'blocked-by-conflict'
        : blockers.length === 0 ? 'ready-for-human-review' : 'not-ready',
      blockers,
      supportingEvidenceIds: supporting.map((item) => item.evidenceId).sort(),
      contradictingEvidenceIds: contradicting.map((item) => item.evidenceId).sort(),
    };
  });
}

export function approveSystemTestFormalRule(input: {
  rule: SystemTestRuleLedger['rules'][number];
  review: SystemTestFormalReviewQueueItem;
  decision: {
    decision: 'approve' | 'reject' | 'hold';
    confirmedBy: string;
    decidedAt: string;
    rationale: string;
    candidateFingerprint: string;
  };
}) {
  if (input.review.status !== 'ready-for-human-review') throw new Error(`规则未达到人工审核条件：${input.rule.ruleId}`);
  if (input.decision.candidateFingerprint !== input.review.candidateFingerprint) throw new Error('候选规则指纹不一致');
  if (!input.decision.confirmedBy.trim() || !input.decision.rationale.trim()) throw new Error('人工审核人和理由不能为空');
  if (input.decision.decision !== 'approve') return undefined;
  return {
    ...input.rule,
    status: 'formal' as const,
    formalPromotionAllowed: false,
    authority: {
      sourceRole: 'human-formal-review' as const,
      confirmedBy: input.decision.confirmedBy,
      decidedAt: input.decision.decidedAt,
      rationale: input.decision.rationale,
    },
  };
}

function meetsPolicy(evidence: SystemTestRuleEvidence, policy: SystemTestFormalReviewPolicy): boolean {
  return (!policy.requireUiEvidence || evidence.uiEvidenceIds.length > 0)
    && (!policy.requireApiEvidence || evidence.apiEvidenceIds.length > 0)
    && (!policy.requireCleanupVerified || evidence.cleanupVerified);
}
