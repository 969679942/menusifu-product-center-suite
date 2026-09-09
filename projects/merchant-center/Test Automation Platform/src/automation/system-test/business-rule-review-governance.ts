import type { BusinessRuleDocument } from './business-rule-lifecycle';

/**
 * Machine-readable result of reconciling a formal rule's linked cases.
 * A missing correction is not automatically a human task: an unchanged,
 * approved canonical case can be auto-validated.  Human review is reserved
 * for an actual semantic mismatch or an unknown semantic comparison.
 */
export type BusinessRuleCaseAssociation = {
  caseId: string;
  caseFingerprint: string | null;
  implementationFingerprint: string | null;
  automationBindingId: string | null;
  sourceVerified: boolean;
  canonicalApproved: boolean;
  correctionPresent: boolean;
  semanticComparison: 'matched' | 'mismatch' | 'unknown';
};

export type BusinessRuleCaseAssociationResult = {
  caseId: string;
  disposition: 'canonical-correction' | 'auto-validated' | 'human-semantic-review' | 'blocked';
  reasons: string[];
};

export type BusinessRuleAssociationAudit = {
  results: BusinessRuleCaseAssociationResult[];
  missingCaseIds: string[];
  duplicateCaseIds: string[];
  humanSemanticReviewCaseIds: string[];
  blockedCaseIds: string[];
  autoValidatedCaseIds: string[];
  complete: boolean;
};

export function auditBusinessRuleCaseAssociations(
  rule: Pick<BusinessRuleDocument, 'linkedCaseIds'>,
  associations: readonly BusinessRuleCaseAssociation[],
): BusinessRuleAssociationAudit {
  const expected = [...new Set(rule.linkedCaseIds)].sort();
  const byCaseId = new Map<string, BusinessRuleCaseAssociation[]>();
  for (const association of associations) {
    const list = byCaseId.get(association.caseId) ?? [];
    list.push(association);
    byCaseId.set(association.caseId, list);
  }
  const missingCaseIds = expected.filter((caseId) => !byCaseId.has(caseId));
  const duplicateCaseIds = [...byCaseId.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([caseId]) => caseId)
    .sort();
  const results: BusinessRuleCaseAssociationResult[] = [];
  for (const caseId of expected) {
    const association = byCaseId.get(caseId)?.[0];
    if (!association) {
      results.push({ caseId, disposition: 'blocked', reasons: ['CASE_ASSOCIATION_MISSING'] });
      continue;
    }
    const reasons: string[] = [];
    if (!association.caseFingerprint) reasons.push('CASE_FINGERPRINT_REQUIRED');
    if (!association.automationBindingId) reasons.push('AUTOMATION_BINDING_REQUIRED');
    if (!association.sourceVerified) reasons.push('CASE_SOURCE_NOT_VERIFIED');
    if (!association.canonicalApproved) reasons.push('CASE_APPROVAL_REQUIRED');
    if (reasons.length > 0) {
      results.push({ caseId, disposition: 'blocked', reasons });
    } else if (association.correctionPresent) {
      results.push({ caseId, disposition: 'canonical-correction', reasons: [] });
    } else if (association.semanticComparison === 'matched') {
      results.push({ caseId, disposition: 'auto-validated', reasons: ['UNCHANGED_SEMANTICS_AUTO_VALIDATED'] });
    } else {
      results.push({
        caseId,
        disposition: 'human-semantic-review',
        reasons: [association.semanticComparison === 'mismatch'
          ? 'CANONICAL_SEMANTICS_MISMATCH'
          : 'CANONICAL_SEMANTICS_COMPARISON_UNKNOWN'],
      });
    }
  }
  const resultCaseIds = new Set(results.map((item) => item.caseId));
  for (const association of associations) {
    if (!expected.includes(association.caseId) && !resultCaseIds.has(association.caseId)) {
      results.push({ caseId: association.caseId, disposition: 'blocked', reasons: ['CASE_NOT_LINKED_TO_RULE'] });
    }
  }
  const humanSemanticReviewCaseIds = results.filter((item) => item.disposition === 'human-semantic-review').map((item) => item.caseId).sort();
  const blockedCaseIds = results.filter((item) => item.disposition === 'blocked').map((item) => item.caseId).sort();
  const autoValidatedCaseIds = results.filter((item) => item.disposition === 'auto-validated').map((item) => item.caseId).sort();
  return {
    results: results.sort((left, right) => left.caseId.localeCompare(right.caseId)),
    missingCaseIds,
    duplicateCaseIds,
    humanSemanticReviewCaseIds,
    blockedCaseIds,
    autoValidatedCaseIds,
    complete: missingCaseIds.length === 0
      && duplicateCaseIds.length === 0
      && humanSemanticReviewCaseIds.length === 0
      && blockedCaseIds.length === 0
      && associations.every((association) => expected.includes(association.caseId)),
  };
}

