import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  fingerprintSystemTestValue,
  type SystemTestCompiledCase,
  type SystemTestRunContract,
} from '../automation/system-test/system-test-contract';
import { TestExecutionIndex, type TestExecutionIndexRecord } from './test-execution-index';
import {
  fingerprintExecutionContext,
  normalizeReleaseObservation,
  resolveReuseStatus,
} from './test-execution-state';

type LedgerAssertionReceipt = { claimId?: string; status?: string };
type LedgerOperationReceipt = { operationKey?: string; method?: string; observed?: boolean };
type LedgerRuntimeEvidence = {
  executionContext?: {
    applicationVersionFingerprint?: string;
    environmentId?: string;
    tenantScope?: string;
    locale?: string;
    roleId?: string;
    route?: string;
    featureFlagFingerprint?: string;
  };
  assertionReceipts?: LedgerAssertionReceipt[];
  operationReceipts?: LedgerOperationReceipt[];
  executionTimings?: Array<{ durationMs?: number }>;
};
type LedgerCase = {
  receiptVersion?: string;
  caseId?: string;
  caseFingerprint?: string;
  semanticCaseFingerprint?: string;
  implementationFingerprint?: string;
  playwrightStatus?: string;
  runtimeEvidence?: LedgerRuntimeEvidence;
  evidence?: {
    status?: string;
    missingClaimIds?: string[];
    duplicateClaimIds?: string[];
    missingContextGuards?: string[];
    duplicateContextGuards?: string[];
    missingActionReadiness?: string[];
    duplicateActionReadiness?: string[];
    mismatchedClaimIds?: string[];
    missingOperationKeys?: string[];
    operationEvidenceComplete?: boolean;
    apiZeroResidue?: boolean;
    uiZeroResidue?: boolean;
  };
};
type EvidenceLedger = {
  schemaVersion?: string;
  collectionId?: string;
  generatedAt?: string;
  systemId?: string;
  contractFingerprint?: string;
  summary?: { selected?: number; executed?: number };
  cases?: LedgerCase[];
};

export type SystemTestEvidenceLedgerImportResult = {
  records: TestExecutionIndexRecord[];
  diagnostics: string[];
  indexChanged: boolean;
};

export function importSystemTestEvidenceLedgerReceipts(input: {
  ledgerPath: string;
  contractPath: string;
  executionIndexPath: string;
  workspaceRoot: string;
  runId: string;
  expectedSystemId: string;
  expectedCaseIds: readonly string[];
  expectedExecutionContextFingerprint?: string;
  allowPartial?: boolean;
  replaceEquivalentRecords?: boolean;
}): SystemTestEvidenceLedgerImportResult {
  const parsed = readSystemTestEvidenceLedgerReceipts(input);
  const indexChanged = parsed.records.length > 0
    ? new TestExecutionIndex(input.executionIndexPath).upsert(parsed.records, {
      replaceEquivalentRecords: input.replaceEquivalentRecords,
    })
    : false;
  return { ...parsed, indexChanged };
}

export function readSystemTestEvidenceLedgerReceipts(input: {
  ledgerPath: string;
  contractPath: string;
  workspaceRoot: string;
  runId: string;
  expectedSystemId: string;
  expectedCaseIds: readonly string[];
  expectedExecutionContextFingerprint?: string;
  allowPartial?: boolean;
}): Omit<SystemTestEvidenceLedgerImportResult, 'indexChanged'> {
  const ledger = readJson<EvidenceLedger>(input.ledgerPath);
  const contract = readJson<SystemTestRunContract>(input.contractPath);
  const diagnostics: string[] = [];
  const expectedCaseIds = [...new Set(input.expectedCaseIds)].sort();
  const executionCandidateContextFingerprint = readSiblingExecutionCandidateContext(input.contractPath);
  const expectedExecutionContextFingerprint = input.expectedExecutionContextFingerprint === undefined
    ? executionCandidateContextFingerprint
    : normalizeSha256(input.expectedExecutionContextFingerprint);
  const ledgerCases = ledger.cases ?? [];
  const ledgerCaseIds = ledgerCases.flatMap((item) => item.caseId ? [item.caseId] : []).sort();
  const contractCaseIds = contract.cases.map((item) => item.caseId).sort();
  if (ledger.collectionId !== 'system-test-evidence-ledger') diagnostics.push('LEDGER_COLLECTION_INVALID');
  if (ledger.systemId !== input.expectedSystemId || contract.system.systemId !== input.expectedSystemId) {
    diagnostics.push('LEDGER_SYSTEM_ID_MISMATCH');
  }
  if (ledger.contractFingerprint !== contract.fingerprint) diagnostics.push('LEDGER_CONTRACT_FINGERPRINT_MISMATCH');
  if (input.expectedExecutionContextFingerprint !== undefined && !expectedExecutionContextFingerprint) {
    diagnostics.push('EXECUTION_CONTEXT_FINGERPRINT_INVALID');
  }
  if (input.expectedExecutionContextFingerprint === undefined
    && fs.existsSync(path.join(path.dirname(input.contractPath), 'execution-candidate.json'))
    && !executionCandidateContextFingerprint) diagnostics.push('EXECUTION_CONTEXT_FINGERPRINT_INVALID');
  if (JSON.stringify(contractCaseIds) !== JSON.stringify(expectedCaseIds)) diagnostics.push('CONTRACT_SELECTION_MISMATCH');
  const unexpectedLedgerCaseIds = ledgerCaseIds.filter((caseId) => !expectedCaseIds.includes(caseId));
  const ledgerSelectionValid = input.allowPartial === true
    ? unexpectedLedgerCaseIds.length === 0
    : JSON.stringify(ledgerCaseIds) === JSON.stringify(expectedCaseIds);
  if (!ledgerSelectionValid) diagnostics.push('LEDGER_SELECTION_MISMATCH');
  const executionCountValid = ledger.summary?.selected === expectedCaseIds.length
    && ledger.summary?.executed === ledgerCaseIds.length
    && (input.allowPartial === true || ledgerCaseIds.length === expectedCaseIds.length);
  if (!executionCountValid) {
    diagnostics.push('LEDGER_EXECUTION_INCOMPLETE');
  }
  if (new Set(ledgerCaseIds).size !== ledgerCaseIds.length) diagnostics.push('LEDGER_CASE_ID_DUPLICATE');
  if (diagnostics.length > 0) return { records: [], diagnostics: [...new Set(diagnostics)].sort() };

  const contractCases = new Map(contract.cases.map((item) => [item.caseId, item]));
  const evidenceFileFingerprint = sha256File(input.ledgerPath);
  const generatedAt = validDate(ledger.generatedAt)
    ? ledger.generatedAt!
    : fs.statSync(input.ledgerPath).mtime.toISOString();
  const records = ledgerCases.flatMap((item): TestExecutionIndexRecord[] => {
    const caseId = item.caseId!;
    const contractCase = contractCases.get(caseId)!;
    const caseDiagnostics = validateCaseReceipt(caseId, item, contractCase);
    diagnostics.push(...caseDiagnostics);
    if (caseDiagnostics.some((item) => item.endsWith(':IDENTITY_INVALID'))) return [];
    const context = item.runtimeEvidence!.executionContext!;
    const releaseObservation = normalizeReleaseObservation({
      applicationVersionFingerprint: context.applicationVersionFingerprint,
      observedAt: generatedAt,
      releaseObservation: {
        status: normalizeSha256(context.applicationVersionFingerprint) ? 'derived' : 'unavailable',
        fingerprint: normalizeSha256(context.applicationVersionFingerprint),
        source: 'system-test-runtime',
        stable: false,
      },
    });
    const assertionStatuses = contractCase.expectationClaims.map((claim) => (
      item.runtimeEvidence?.assertionReceipts?.some((receipt) => (
        receipt.claimId === claim.claimId && receipt.status === 'verified'
      )) ? 'verified' as const : 'observed-mismatch' as const
    ));
    const evidenceComplete = item.playwrightStatus === 'passed'
      && item.evidence?.status === 'complete'
      && caseDiagnostics.length === 0;
    const status = evidenceComplete ? 'passed' as const : 'failed' as const;
    const evidenceStatus = evidenceComplete ? 'complete' as const : 'incomplete' as const;
    return [{
      caseId,
      applicationVersionFingerprint: releaseObservation.fingerprint,
      releaseObservation,
      executionEpochId: input.runId,
      executionContextFingerprint: expectedExecutionContextFingerprint ?? fingerprintExecutionContext(context),
      caseFingerprint: item.caseFingerprint!,
      semanticCaseFingerprint: normalizeSha256(item.semanticCaseFingerprint),
      implementationFingerprint: normalizeSha256(item.implementationFingerprint),
      status,
      evidenceStatus,
      assertionStatuses,
      cleanupEvidence: {
        apiZeroResidue: item.evidence?.apiZeroResidue === true,
        uiZeroResidue: item.evidence?.uiZeroResidue === true,
      },
      receiptEvidenceFingerprint: sha256(stableJson(item)),
      evidenceFileFingerprint,
      reuseStatus: resolveReuseStatus({ executionStatus: status, evidenceStatus, releaseObservation }),
      runId: input.runId,
      evidencePath: relativeWithin(input.workspaceRoot, input.ledgerPath),
      durationMs: Math.round((item.runtimeEvidence?.executionTimings ?? [])
        .reduce((total, timing) => total + (Number.isFinite(timing.durationMs) ? Number(timing.durationMs) : 0), 0)),
      recordedAt: generatedAt,
    }];
  });
  return { records, diagnostics: [...new Set(diagnostics)].sort() };
}

function validateCaseReceipt(caseId: string, item: LedgerCase, contractCase: SystemTestCompiledCase): string[] {
  const diagnostics: string[] = [];
  const identityValid = item.receiptVersion === '3.1.0'
    && normalizeSha256(item.caseFingerprint) !== null
    && item.caseFingerprint === fingerprintSystemTestValue(contractCase)
    && normalizeSha256(item.implementationFingerprint) !== null
    && hasCompleteContext(item.runtimeEvidence?.executionContext);
  if (!identityValid) diagnostics.push(`${caseId}:IDENTITY_INVALID`);
  if (item.playwrightStatus !== 'passed') diagnostics.push(`${caseId}:PLAYWRIGHT_NOT_PASSED`);
  if (item.evidence?.status !== 'complete') diagnostics.push(`${caseId}:EVIDENCE_INCOMPLETE`);
  const assertions = item.runtimeEvidence?.assertionReceipts ?? [];
  if (!contractCase.expectationClaims.every((claim) => assertions.some((receipt) => (
    receipt.claimId === claim.claimId && receipt.status === 'verified'
  )))) diagnostics.push(`${caseId}:ASSERTIONS_INCOMPLETE`);
  const operations = item.runtimeEvidence?.operationReceipts ?? [];
  if (!contractCase.requiredOperationKeys.every((operationKey) => operations.some((receipt) => (
    receipt.operationKey === operationKey && receipt.observed === true && Boolean(receipt.method?.trim())
  )))) diagnostics.push(`${caseId}:OPERATIONS_INCOMPLETE`);
  const incompleteArrays = [
    item.evidence?.missingClaimIds,
    item.evidence?.duplicateClaimIds,
    item.evidence?.missingContextGuards,
    item.evidence?.duplicateContextGuards,
    item.evidence?.missingActionReadiness,
    item.evidence?.duplicateActionReadiness,
    item.evidence?.mismatchedClaimIds,
    item.evidence?.missingOperationKeys,
  ];
  if (incompleteArrays.some((values) => (values?.length ?? 0) > 0)
    || item.evidence?.operationEvidenceComplete !== true) diagnostics.push(`${caseId}:GOVERNED_EVIDENCE_INCOMPLETE`);
  if (item.evidence?.apiZeroResidue !== true || item.evidence?.uiZeroResidue !== true) {
    diagnostics.push(`${caseId}:CLEANUP_INCOMPLETE`);
  }
  return diagnostics;
}

function hasCompleteContext(value: LedgerRuntimeEvidence['executionContext']): boolean {
  return Boolean(value?.environmentId?.trim()
    && value.tenantScope?.trim()
    && value.locale?.trim()
    && value.roleId?.trim()
    && value.route?.trim());
}

function relativeWithin(rootPath: string, filePath: string): string {
  const relative = path.relative(path.resolve(rootPath), path.resolve(filePath));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`EVIDENCE_PATH_OUTSIDE_WORKSPACE:${filePath}`);
  }
  return relative.replaceAll(path.sep, '/');
}

function normalizeSha256(value: unknown): string | null {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function readSiblingExecutionCandidateContext(contractPath: string): string | null {
  const candidatePath = path.join(path.dirname(contractPath), 'execution-candidate.json');
  if (!fs.existsSync(candidatePath)) return null;
  return normalizeSha256(readJson<{ contextFingerprint?: string }>(candidatePath).contextFingerprint);
}
