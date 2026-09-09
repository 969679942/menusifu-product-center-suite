import fs from 'node:fs';
import path from 'node:path';

export type ProductCenterItemManualDecision = {
  caseId: string;
  title: string;
  directive: string;
  disposition: 'accepted-observed' | 'product-defect' | 'automation-remediation' | 'skip-deferred';
  priority: 'P0' | 'P1' | 'P2';
  updatedTitle?: string;
  acceptedDiagnosticPatterns?: string[];
  auditContract?: {
    evidenceId: string;
    canonicalId: string;
    ruleId: string;
    irId: string;
    recipeId: string;
    route: string;
    state: string;
    action: string;
    overlay: string[];
    uiAssertion: string;
    apiAssertion: string;
    safetyLevel: 'L0' | 'L1' | 'L2' | 'L3';
    evidenceRefs: string[];
    freshObservationRequired: true;
  };
};

export type ProductCenterItemRuntimeAuditObservation = {
  runtimeEvidenceId: string;
  observedAt: string;
  route: string;
  state: string;
  action: string;
  overlay: string[];
  ui: {
    status: 'passed';
    expected: string;
    actual: string;
  };
  api: {
    status: 'passed' | 'not-applicable';
    expected: string;
    actual: string;
    mutationCount: number;
  };
  operation?: string;
  serverIds?: string[];
  cleanup?: {
    uiCount: number;
    apiCount: number;
    verifiedAt: string;
  };
};

type DecisionFile = { decisions: ProductCenterItemManualDecision[] };

const decisionPath = path.resolve(__dirname, '../contracts/product-center/reviews/product-center-item-failure-manual-decisions.json');
const decisionFile = JSON.parse(fs.readFileSync(decisionPath, 'utf8')) as DecisionFile;
const decisions = new Map(decisionFile.decisions.map((item) => [item.caseId, item]));

export function readProductCenterItemManualDecision(caseId: string): ProductCenterItemManualDecision | undefined {
  return decisions.get(caseId);
}

export function acceptProductCenterItemManualOutcome(caseId: string, evidence: unknown): {
  caseId: string;
  status: 'implemented';
  disposition: 'accepted-observed';
  directive: string;
  matchedPattern: string;
  observedDiagnostic: string;
  observedAt: string;
  evidenceSource: 'structured-runtime';
  evidenceIds: string[];
  auditContract: NonNullable<ProductCenterItemManualDecision['auditContract']>;
} | undefined {
  const decision = decisions.get(caseId);
  if (decision?.disposition !== 'accepted-observed') return undefined;
  const auditContract = decision.auditContract;
  if (!isCompleteAuditContract(auditContract)) return undefined;
  if (!isStructuredRuntimeEnvelope(evidence) || !matchesStructuredCaseId(caseId, evidence)) return undefined;
  const observation = findAuditObservation(evidence);
  if (!observation || !matchesAuditObservation(auditContract, observation)) return undefined;
  const diagnostic = JSON.stringify(evidence);
  const matchedPattern = decision.acceptedDiagnosticPatterns?.find((pattern) => diagnostic.includes(pattern));
  if (!matchedPattern) return undefined;
  return {
    caseId,
    status: 'implemented',
    disposition: 'accepted-observed',
    directive: decision.directive,
    matchedPattern,
    observedDiagnostic: diagnostic.slice(0, 2_000),
    observedAt: observation.observedAt,
    evidenceSource: 'structured-runtime',
    evidenceIds: [auditContract.evidenceId, observation.runtimeEvidenceId],
    auditContract,
  };
}

function isStructuredRuntimeEnvelope(evidence: unknown): boolean {
  return Boolean(evidence && typeof evidence === 'object'
    && (evidence as Record<string, unknown>).runtimeEvidenceKind === 'structured');
}

function matchesStructuredCaseId(caseId: string, evidence: unknown): boolean {
  if (!evidence || typeof evidence !== 'object') return false;
  const record = evidence as Record<string, unknown>;
  return record.caseId === caseId;
}

function findAuditObservation(value: unknown, depth = 0): ProductCenterItemRuntimeAuditObservation | undefined {
  if (!value || typeof value !== 'object' || depth > 5) return undefined;
  const record = value as Record<string, unknown>;
  if (isAuditObservation(record.auditObservation)) return record.auditObservation;
  for (const key of ['evidence', 'result', 'runtimeEvidence']) {
    const nested = findAuditObservation(record[key], depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

function isAuditObservation(value: unknown): value is ProductCenterItemRuntimeAuditObservation {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const ui = record.ui as Record<string, unknown> | undefined;
  const api = record.api as Record<string, unknown> | undefined;
  return typeof record.runtimeEvidenceId === 'string'
    && typeof record.observedAt === 'string'
    && typeof record.route === 'string'
    && typeof record.state === 'string'
    && typeof record.action === 'string'
    && Array.isArray(record.overlay)
    && record.overlay.every((item) => typeof item === 'string')
    && ui?.status === 'passed'
    && typeof ui.expected === 'string'
    && typeof ui.actual === 'string'
    && (api?.status === 'passed' || api?.status === 'not-applicable')
    && typeof api.expected === 'string'
    && typeof api.actual === 'string'
    && typeof api.mutationCount === 'number';
}

function matchesAuditObservation(
  contract: NonNullable<ProductCenterItemManualDecision['auditContract']>,
  observation: ProductCenterItemRuntimeAuditObservation,
): boolean {
  const observedAt = Date.parse(observation.observedAt);
  const ageMs = Date.now() - observedAt;
  if (!Number.isFinite(observedAt) || ageMs < -60_000 || ageMs > 10 * 60_000) return false;
  if (!observation.runtimeEvidenceId.includes(contract.canonicalId)) return false;
  if (observation.runtimeEvidenceId === contract.evidenceId) return false;
  if (observation.route !== contract.route
    || observation.state !== contract.state
    || observation.action !== contract.action
    || !sameStrings(observation.overlay, contract.overlay)) return false;
  if (observation.ui.expected !== contract.uiAssertion || observation.ui.actual.trim() === '') return false;
  if (observation.api.expected !== contract.apiAssertion || observation.api.actual.trim() === '') return false;
  if (contract.apiAssertion.startsWith('N/A:')) {
    if (observation.api.status !== 'not-applicable') return false;
  } else if (observation.api.status !== 'passed') return false;
  if ((contract.safetyLevel === 'L0' || contract.safetyLevel === 'L1')
    && observation.api.mutationCount !== 0) return false;
  if (contract.safetyLevel === 'L2' || contract.safetyLevel === 'L3') {
    if (!observation.operation || observation.operation === 'N/A') return false;
    if (!observation.serverIds?.length) return false;
    const cleanupAt = Date.parse(observation.cleanup?.verifiedAt ?? '');
    if (!observation.cleanup
      || observation.cleanup.uiCount !== 0
      || observation.cleanup.apiCount !== 0
      || !Number.isFinite(cleanupAt)
      || cleanupAt < observedAt) return false;
  }
  return true;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isCompleteAuditContract(
  value: ProductCenterItemManualDecision['auditContract'],
): value is NonNullable<ProductCenterItemManualDecision['auditContract']> {
  return Boolean(
    value?.evidenceId
    && value.canonicalId
    && value.ruleId
    && value.irId
    && value.recipeId
    && value.route
    && value.state
    && value.action
    && value.overlay.length > 0
    && value.uiAssertion
    && value.apiAssertion
    && value.evidenceRefs.length > 0
    && value.freshObservationRequired,
  );
}
