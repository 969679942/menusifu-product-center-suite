import { createHash } from 'node:crypto';
import type { ImpactedCase } from './contract-change-impact';
import { decideProductCenterRepairDisposition } from './product-center-drift-lab';
import type {
  ProductCenterPageContractDiff,
  ProductCenterPageContractFinding,
} from './product-center-page-contract-observation';
import { stableStringify } from './product-center-test-contract';

export type ProductCenterDriftRepairProposal = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-drift-repair-proposal';
  fingerprint: string;
  status: 'no-change' | 'approval-required' | 'blocked';
  summary: {
    findings: number;
    technicalProposals: number;
    baselinePromotions: number;
    blocked: number;
    impactedCases: number;
  };
  entries: Array<{
    findingId: string;
    approvalKey: string;
    code: ProductCenterPageContractFinding['code'];
    caseId: string;
    route: string;
    disposition: ReturnType<typeof decideProductCenterRepairDisposition>;
    impactedCaseIds: string[];
    sourceIds: string[];
    approvalRequired: boolean;
    contractMutationAllowed: false;
    businessRuleMutationAllowed: false;
  }>;
  contractMutationAllowed: false;
  businessRuleMutationAllowed: false;
};

export function buildProductCenterDriftRepairProposal(input: {
  diff: ProductCenterPageContractDiff;
  impactedCases: readonly ImpactedCase[];
}): ProductCenterDriftRepairProposal {
  const entries = [...input.diff.findings]
    .sort((left, right) => (
      left.caseId.localeCompare(right.caseId) || left.code.localeCompare(right.code)
    ))
    .map((finding) => {
      const disposition = decideProductCenterRepairDisposition([finding.code]);
      const changeIds = finding.sourceIds.length > 0
        ? finding.sourceIds
        : [`page-observation:${finding.caseId}:${finding.code}`];
      const impactedCaseIds = input.impactedCases
        .filter((entry) => entry.changeIds.some((changeId) => changeIds.includes(changeId)))
        .map((entry) => entry.caseId)
        .sort();
      const approvalKey = `${finding.code}:${finding.caseId}`;
      return {
        findingId: hashValue({ approvalKey, route: finding.route, sourceIds: finding.sourceIds }),
        approvalKey,
        code: finding.code,
        caseId: finding.caseId,
        route: finding.route,
        disposition,
        impactedCaseIds,
        sourceIds: [...finding.sourceIds].sort(),
        approvalRequired: disposition !== 'block-and-review',
        contractMutationAllowed: false as const,
        businessRuleMutationAllowed: false as const,
      };
    });
  const blocked = entries.filter((entry) => entry.disposition === 'block-and-review').length;
  const technicalProposals = entries.filter((entry) => entry.disposition === 'technical-proposal').length;
  const baselinePromotions = entries.filter(
    (entry) => entry.disposition === 'baseline-promotion-review',
  ).length;
  const status = entries.length === 0
    ? 'no-change' as const
    : blocked > 0
      ? 'blocked' as const
      : 'approval-required' as const;
  const fingerprint = hashValue(entries);
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-drift-repair-proposal',
    fingerprint,
    status,
    summary: {
      findings: entries.length,
      technicalProposals,
      baselinePromotions,
      blocked,
      impactedCases: new Set(entries.flatMap((entry) => entry.impactedCaseIds)).size,
    },
    entries,
    contractMutationAllowed: false,
    businessRuleMutationAllowed: false,
  };
}

export function evaluateProductCenterDriftProposalApproval(
  proposal: ProductCenterDriftRepairProposal,
  approvedFindings: readonly string[],
): { approved: boolean; missing: string[] } {
  if (proposal.status === 'no-change') return { approved: true, missing: [] };
  if (proposal.status === 'blocked') {
    return {
      approved: false,
      missing: proposal.entries
        .filter((entry) => entry.disposition === 'block-and-review')
        .map((entry) => entry.approvalKey),
    };
  }
  const approved = new Set(approvedFindings);
  const missing = proposal.entries
    .filter((entry) => entry.approvalRequired)
    .filter((entry) => !approved.has(entry.approvalKey) && !approved.has(entry.findingId))
    .map((entry) => entry.approvalKey);
  return { approved: missing.length === 0, missing };
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}
