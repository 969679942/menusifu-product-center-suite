import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  fingerprintRuntimeAuditableCase,
  fingerprintRuntimeAuditablePlan,
  type RuntimeAuditAutoApprovalPolicy,
  type RuntimeAuditCorrection,
  type RuntimeAuditCorrectionDocument,
  type RuntimeAuditObservation,
  type RuntimeAuditResolutionAction,
  type RuntimeAuditableTestCase,
} from './test-plan-runtime-audit-correction';

export type RuntimeAuditReceipt = {
  caseId: string;
  evidencePath: string;
  observedAt: string;
  observation: RuntimeAuditObservation;
  resolution: {
    action: RuntimeAuditResolutionAction;
    reason: string;
    assertions: RuntimeAuditCorrection['resolution']['assertions'];
    patches?: RuntimeAuditCorrection['resolution']['patches'];
    impacts?: RuntimeAuditCorrection['impacts'];
    businessRuleChanges?: RuntimeAuditCorrection['resolution']['businessRuleChanges'];
    technicalBindingChanges?: RuntimeAuditCorrection['resolution']['technicalBindingChanges'];
    coverageChanges?: RuntimeAuditCorrection['resolution']['coverageChanges'];
    sourceCaseIds?: string[];
    replacementCases?: RuntimeAuditCorrection['resolution']['replacementCases'];
  };
  aiDecision?: {
    approved: boolean;
    engine: string;
    decidedAt: string;
    rationale: string;
  };
};

export type RuntimeAuditReceiptDocumentInput = {
  planId: string;
  collectionId: string;
  cases: readonly RuntimeAuditableTestCase[];
  receipts: readonly RuntimeAuditReceipt[];
  rootDir?: string;
  generatedAt?: string;
  context: NonNullable<RuntimeAuditCorrectionDocument['context']>;
  evidenceDiscovery?: RuntimeAuditCorrectionDocument['evidenceDiscovery'];
  autoApprovalPolicy?: RuntimeAuditAutoApprovalPolicy;
};

const defaultPolicy: RuntimeAuditAutoApprovalPolicy = {
  policyId: 'runtime-evidence-safe-v1',
  enabled: true,
  minimumConsumedEvidence: 1,
  allowedActions: ['correct-case', 'no-change', 'add-case'],
  allowBusinessRuleChanges: true,
  allowTechnicalBindingChanges: true,
  allowCoverageChanges: true,
  requireMutationSafety: true,
};

export function buildRuntimeAuditCorrectionDocumentFromReceipts(
  input: RuntimeAuditReceiptDocumentInput,
): RuntimeAuditCorrectionDocument {
  const rootDir = input.rootDir ?? process.cwd();
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const freshUntil = input.context.maxEvidenceAgeDays
    ? new Date(Date.parse(generatedAt) + input.context.maxEvidenceAgeDays * 86_400_000).toISOString()
    : undefined;
  const caseById = new Map(input.cases.map((item) => [runtimeCaseId(item), item]));
  const evidenceInventory: NonNullable<RuntimeAuditCorrectionDocument['evidenceInventory']> = [];
  const corrections = input.receipts.map((receipt) => {
    const current = caseById.get(receipt.caseId);
    if (!current && receipt.resolution.action !== 'add-case') {
      throw new Error(`运行收据目标用例不存在：${receipt.caseId}`);
    }
    const absolutePath = resolveEvidencePath(receipt.evidencePath, rootDir);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      throw new Error(`运行收据证据不存在：${receipt.evidencePath}`);
    }
    const evidenceHash = sha256File(absolutePath);
    const evidenceId = `runtime:${receipt.caseId}:${evidenceHash.slice(0, 16)}`;
    evidenceInventory.push({
      evidenceId,
      path: receipt.evidencePath,
      sha256: evidenceHash,
      observedAt: receipt.observedAt,
      ...(freshUntil ? { freshUntil } : {}),
      disposition: 'consumed',
      applicationVersionFingerprint: input.context.applicationVersionFingerprint,
      environmentId: input.context.environmentId,
      roleId: input.context.roleId,
      locale: input.context.locale,
    });
    const approved = receipt.aiDecision?.approved === true;
    const status: RuntimeAuditCorrection['status'] = approved
      ? 'auto-confirmed-runtime'
      : 'review-required';
    const decision = receipt.aiDecision ?? {
      approved: false,
      engine: 'codex:runtime-receipt-normalizer',
      decidedAt: input.generatedAt ?? new Date().toISOString(),
      rationale: '未提供 AI 自动裁决，转人工异常队列',
    };
    return {
      caseId: receipt.caseId,
      ...(current ? { reviewedCaseFingerprint: fingerprintRuntimeAuditableCase(current) } : {}),
      automatedDecision: {
        policyId: (input.autoApprovalPolicy ?? defaultPolicy).policyId,
        decisionEngine: decision.engine,
        decidedAt: decision.decidedAt,
        rationale: decision.rationale,
      },
      evidenceIds: [evidenceId],
      status,
      observation: {
        applicationVersionFingerprint: input.context.applicationVersionFingerprint,
        environmentId: input.context.environmentId,
        roleId: input.context.roleId,
        locale: input.context.locale,
        ...receipt.observation,
      },
      impacts: receipt.resolution.impacts ?? {
        businessRule: 'none',
        technicalBinding: 'none',
        coverage: 'none',
      },
      resolution: {
        action: receipt.resolution.action,
        reason: receipt.resolution.reason,
        assertions: receipt.resolution.assertions,
        ...(receipt.resolution.patches ? { patches: receipt.resolution.patches } : {}),
        ...(receipt.resolution.sourceCaseIds ? { sourceCaseIds: receipt.resolution.sourceCaseIds } : {}),
        ...(receipt.resolution.replacementCases ? { replacementCases: receipt.resolution.replacementCases } : {}),
        ...(receipt.resolution.businessRuleChanges ? { businessRuleChanges: receipt.resolution.businessRuleChanges } : {}),
        ...(receipt.resolution.technicalBindingChanges ? { technicalBindingChanges: receipt.resolution.technicalBindingChanges } : {}),
        ...(receipt.resolution.coverageChanges ? { coverageChanges: receipt.resolution.coverageChanges } : {}),
      },
    } satisfies RuntimeAuditCorrection;
  });
  const policy = input.autoApprovalPolicy ?? defaultPolicy;
  return {
    schemaVersion: '2.0.0',
    collectionId: input.collectionId,
    planId: input.planId,
    generatedAt,
    ...(freshUntil ? { freshUntil } : {}),
    planFingerprint: fingerprintRuntimeAuditablePlan(input.cases),
    context: input.context,
    evidenceDiscovery: input.evidenceDiscovery ?? {
      rootPaths: [],
      extensions: ['.json', '.jsonl'],
      strict: true,
    },
    evidenceInventory,
    coverageInventory: [],
    autoApprovalPolicy: policy,
    corrections,
  };
}

function runtimeCaseId(item: RuntimeAuditableTestCase): string {
  return item.id ?? item.caseId ?? item.canonicalId ?? '';
}

function resolveEvidencePath(value: string, rootDir: string): string | undefined {
  const candidate = path.isAbsolute(value) ? value : path.resolve(rootDir, value);
  const relative = path.relative(rootDir, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return undefined;
  return candidate;
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
