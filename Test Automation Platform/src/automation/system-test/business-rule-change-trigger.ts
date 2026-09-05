import { createHash } from 'node:crypto';
import {
  arbitrateCaseState,
  type ArbiterDisposition,
  type ArbiterReceipt,
} from './system-test-case-state-arbiter';
import {
  buildBusinessRuleChangeImpact,
  type BusinessRuleDocument,
} from './business-rule-lifecycle';

export type BusinessRuleSemanticBaselineRule = {
  ruleId: string;
  ruleFingerprint: string;
};

export type BusinessRuleSemanticBaseline = {
  schemaVersion: '1.0.0';
  baselineId: string;
  applicationId: string;
  businessDomainId: string;
  rules: BusinessRuleSemanticBaselineRule[];
};

export type BusinessRuleTriggerCase = {
  caseId: string;
  currentCaseFingerprint: string | null;
  currentSemanticCaseFingerprint?: string | null;
  fingerprintMatchMode?: 'effective' | 'semantic';
  currentImplementationFingerprint?: string | null;
  implementationFingerprintRequired?: boolean;
  disposition: ArbiterDisposition;
  receipts: ArbiterReceipt[];
};

export type BusinessRuleChangeTriggerResult = {
  schemaVersion: '1.0.0';
  status: 'unchanged' | 'changed' | 'baseline-incomplete';
  baselineId: string;
  changedRuleIds: string[];
  affectedRuleIds: string[];
  affectedCaseIds: string[];
  rerunCaseIds: string[];
  revalidatedCaseIds: string[];
  verifiedRuleIds: string[];
  preservedPassedCaseIds: string[];
  diagnostics: string[];
  fingerprint: string;
};

export type BusinessRuleBaselinePromotion = {
  status: 'promoted' | 'unchanged';
  baseline: BusinessRuleSemanticBaseline;
  promotedRuleIds: string[];
  revalidatedCaseIds: string[];
  beforeFingerprint: string;
  afterFingerprint: string;
  formalRuleSemanticsModified: false;
};

/**
 * Compares formal rule semantics to the last accepted baseline and turns only
 * currently passed, receipt-backed dependent cases into revalidation candidates.
 */
export function buildBusinessRuleChangeTrigger(input: {
  currentRules: readonly BusinessRuleDocument[];
  baseline: BusinessRuleSemanticBaseline;
  cases: readonly BusinessRuleTriggerCase[];
}): BusinessRuleChangeTriggerResult {
  const baselineByRuleId = new Map(input.baseline.rules.map((rule) => [rule.ruleId, rule]));
  const diagnostics: string[] = [];
  const currentApplicationIds = [...new Set(input.currentRules.map((rule) => rule.scope.applicationId))];
  const currentBusinessDomainIds = [...new Set(input.currentRules.map((rule) => rule.scope.businessDomainId))];
  if (currentApplicationIds.some((id) => id !== input.baseline.applicationId)) {
    diagnostics.push('BASELINE_APPLICATION_MISMATCH');
  }
  if (currentBusinessDomainIds.some((id) => id !== input.baseline.businessDomainId)) {
    diagnostics.push('BASELINE_BUSINESS_DOMAIN_MISMATCH');
  }
  const changedRuleIds = input.currentRules
    .filter((rule) => {
      const baseline = baselineByRuleId.get(rule.ruleId);
      if (!baseline) {
        diagnostics.push(`BASELINE_RULE_MISSING:${rule.ruleId}`);
        return false;
      }
      return baseline.ruleFingerprint !== rule.ruleFingerprint;
    })
    .map((rule) => rule.ruleId)
    .sort();
  const impact = buildBusinessRuleChangeImpact(input.currentRules, changedRuleIds);
  const affectedCaseIds = [...impact.affectedCaseIds].sort();
  const affectedCaseIdSet = new Set(affectedCaseIds);
  const governedCaseIdSet = new Set(input.currentRules.flatMap((rule) => rule.linkedCaseIds));
  const rerunCaseIds: string[] = [];
  const revalidatedCaseIds: string[] = [];
  const preservedPassedCaseIds: string[] = [];
  const changedAt = input.currentRules
    .filter((rule) => changedRuleIds.includes(rule.ruleId))
    .map((rule) => rule.approval?.approvedAt)
    .filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value!)))
    .sort()
    .at(-1) ?? null;

  for (const candidate of [...input.cases].sort((left, right) => left.caseId.localeCompare(right.caseId))) {
    if (!governedCaseIdSet.has(candidate.caseId)) continue;
    const arbitration = arbitrateCaseState({
      caseId: candidate.caseId,
      disposition: candidate.disposition,
      currentCaseFingerprint: candidate.currentCaseFingerprint,
      currentSemanticCaseFingerprint: candidate.currentSemanticCaseFingerprint,
      fingerprintMatchMode: candidate.fingerprintMatchMode,
      currentImplementationFingerprint: candidate.currentImplementationFingerprint,
      // A changed rule must be proved by the implementation currently bound
      // to the case. A receipt from an older implementation remains history,
      // even when the landing projection did not previously require this gate.
      implementationFingerprintRequired: candidate.implementationFingerprintRequired
        || affectedCaseIdSet.has(candidate.caseId),
      receipts: candidate.receipts,
    });
    if (arbitration.status === 'passed' && !affectedCaseIdSet.has(candidate.caseId)) {
      preservedPassedCaseIds.push(candidate.caseId);
    }
    if (arbitration.status === 'passed' && affectedCaseIdSet.has(candidate.caseId)) {
      if (changedAt && arbitration.receipt && arbitration.receipt.recordedAt >= changedAt) {
        revalidatedCaseIds.push(candidate.caseId);
        preservedPassedCaseIds.push(candidate.caseId);
      } else {
        rerunCaseIds.push(candidate.caseId);
      }
    } else if (arbitration.status === 'ready' && affectedCaseIdSet.has(candidate.caseId)) {
      // A stale or missing implementation-matched receipt is a revalidation
      // requirement, not an absence of impact.
      rerunCaseIds.push(candidate.caseId);
    }
  }

  const revalidatedCaseIdSet = new Set(revalidatedCaseIds);
  const verifiedRuleIds = changedRuleIds.filter((ruleId) => {
    const ruleImpact = buildBusinessRuleChangeImpact(input.currentRules, [ruleId]);
    return ruleImpact.affectedCaseIds.length > 0
      && ruleImpact.affectedCaseIds.every((caseId) => revalidatedCaseIdSet.has(caseId));
  });

  const status: BusinessRuleChangeTriggerResult['status'] = diagnostics.some((item) => item.startsWith('BASELINE_'))
    ? 'baseline-incomplete'
    : changedRuleIds.length > 0 ? 'changed' : 'unchanged';
  const resultWithoutFingerprint = {
    schemaVersion: '1.0.0' as const,
    status,
    baselineId: input.baseline.baselineId,
    changedRuleIds,
    affectedRuleIds: [...impact.affectedRuleIds].sort(),
    affectedCaseIds,
    rerunCaseIds: [...new Set(rerunCaseIds)].sort(),
    revalidatedCaseIds: [...new Set(revalidatedCaseIds)].sort(),
    verifiedRuleIds: [...new Set(verifiedRuleIds)].sort(),
    preservedPassedCaseIds: [...new Set(preservedPassedCaseIds)].sort(),
    diagnostics: [...new Set(diagnostics)].sort(),
  };
  return {
    ...resultWithoutFingerprint,
    fingerprint: fingerprint(resultWithoutFingerprint),
  };
}

export function promoteBusinessRuleSemanticBaseline(input: {
  baseline: BusinessRuleSemanticBaseline;
  currentRules: readonly BusinessRuleDocument[];
  trigger: Pick<BusinessRuleChangeTriggerResult, 'verifiedRuleIds' | 'revalidatedCaseIds'>;
}): BusinessRuleBaselinePromotion {
  const currentByRuleId = new Map(input.currentRules.map((rule) => [rule.ruleId, rule]));
  const promotedRuleIds = input.trigger.verifiedRuleIds.filter((ruleId) => currentByRuleId.has(ruleId)).sort();
  const beforeFingerprint = fingerprint(input.baseline);
  const baseline = {
    ...input.baseline,
    rules: input.baseline.rules.map((baselineRule) => promotedRuleIds.includes(baselineRule.ruleId)
      ? { ruleId: baselineRule.ruleId, ruleFingerprint: currentByRuleId.get(baselineRule.ruleId)!.ruleFingerprint }
      : { ...baselineRule }),
  };
  const afterFingerprint = fingerprint(baseline);
  return {
    status: promotedRuleIds.length > 0 && beforeFingerprint !== afterFingerprint ? 'promoted' : 'unchanged',
    baseline,
    promotedRuleIds,
    revalidatedCaseIds: [...input.trigger.revalidatedCaseIds].sort(),
    beforeFingerprint,
    afterFingerprint,
    formalRuleSemanticsModified: false,
  };
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
