import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { TestExecutionIndexRecord } from './test-execution-index';
import {
  fingerprintExecutionContext,
  normalizeReleaseObservation,
  resolveReuseStatus,
  type ReleaseObservation,
} from './test-execution-state';

type PlaywrightAttachment = { name?: string; body?: string; contentType?: string };
type PlaywrightResult = {
  status?: string;
  duration?: number;
  startTime?: string;
  attachments?: PlaywrightAttachment[];
};
type PlaywrightTest = {
  annotations?: Array<{ type?: string; description?: string }>;
  results?: PlaywrightResult[];
};
type PlaywrightSpec = { title?: string; tags?: string[]; tests?: PlaywrightTest[] };
type PlaywrightSuite = { specs?: PlaywrightSpec[]; suites?: PlaywrightSuite[] };
type PlaywrightReport = { suites?: PlaywrightSuite[] };

type RuntimeReceiptPayload = {
  receiptVersion?: string;
  caseId?: string;
  caseFingerprint?: string;
  bindingFingerprint?: string;
  semanticCaseFingerprint?: string;
  implementationFingerprint?: string;
  executionContext?: {
    applicationVersionFingerprint?: string;
    environmentId?: string;
    tenantScope?: string;
    locale?: string;
    roleId?: string;
    route?: string;
    featureFlagFingerprint?: string;
  };
  releaseObservation?: Partial<ReleaseObservation>;
  executionEpochId?: string;
  claims?: { required?: string[]; observed?: string[]; verified?: string[] };
  operationReceipts?: Array<{ operationKey?: string; observed?: boolean; method?: string }>;
  cleanup?: {
    apiZeroResidue?: boolean;
    uiZeroResidue?: boolean;
    entries?: Array<{ phase?: string }>;
  } | null;
  handlerId?: string;
  complete?: boolean;
  requiredEvidence?: string[];
  observedEvidence?: string[];
  requiredAssertionIds?: string[];
  observedAssertionIds?: string[];
  evidenceFingerprint?: string;
};

export function readPlaywrightExecutionReceipts(input: {
  reportPath: string;
  workspaceRoot: string;
  runId?: string;
  attachmentNames?: readonly string[];
}): { records: TestExecutionIndexRecord[]; diagnostics: string[] } {
  const report = JSON.parse(fs.readFileSync(input.reportPath, 'utf8')) as PlaywrightReport;
  const evidenceFileFingerprint = createHash('sha256').update(fs.readFileSync(input.reportPath)).digest('hex');
  const records: TestExecutionIndexRecord[] = [];
  const diagnostics: string[] = [];
  for (const spec of flattenSpecs(report.suites ?? [])) {
    for (const testItem of spec.tests ?? []) {
      const result = [...(testItem.results ?? [])]
        .sort((left, right) => String(left.startTime ?? '').localeCompare(String(right.startTime ?? '')))
        .at(-1);
      if (!result || result.status !== 'passed') continue;
      const caseId = resolveCaseId(spec, testItem);
      if (!caseId) continue;
      const rawPayload = readReceiptPayload(result.attachments ?? [], caseId, input.attachmentNames ?? []);
      if (!rawPayload) {
        diagnostics.push(`${caseId}:RUNTIME_RECEIPT_ATTACHMENT_MISSING`);
        continue;
      }
      const payload = normalizeGroupReceiptCleanup(rawPayload);
      const caseFingerprint = payload.caseFingerprint ?? payload.bindingFingerprint;
      if (payload.caseId !== caseId) diagnostics.push(`${caseId}:RUNTIME_RECEIPT_CASE_MISMATCH`);
      if (!caseFingerprint) diagnostics.push(`${caseId}:RUNTIME_RECEIPT_CASE_FINGERPRINT_MISSING`);
      const context = payload.executionContext ?? {};
      // 4.0.0 is the current governed receipt format.  It preserves the
      // 3.2 assertion/operation/semantic fields and must be parsed as a
      // first-class receipt; otherwise the importer falls back to the legacy
      // compatibility record and loses the receipt's real context fingerprint.
      const receiptVersionSupported = ['2.0.0', '3.0.0', '3.1.0', '3.2.0', '4.0.0'].includes(payload.receiptVersion ?? '');
      if (!receiptVersionSupported) diagnostics.push(`${caseId}:RUNTIME_RECEIPT_VERSION_UNSUPPORTED`);
      if ((payload.receiptVersion === '3.0.0' || payload.receiptVersion === '3.1.0' || payload.receiptVersion === '3.2.0' || payload.receiptVersion === '4.0.0')
        && !normalizeSha256(payload.implementationFingerprint)) {
        diagnostics.push(`${caseId}:RUNTIME_RECEIPT_IMPLEMENTATION_FINGERPRINT_MISSING`);
      }
      if ((payload.receiptVersion === '3.1.0' || payload.receiptVersion === '3.2.0' || payload.receiptVersion === '4.0.0')
        && !hasCompleteOperationReceipts(payload.operationReceipts)) {
        diagnostics.push(`${caseId}:RUNTIME_RECEIPT_EXECUTABLE_OPERATIONS_INCOMPLETE`);
      }
      if ((payload.receiptVersion === '3.2.0' || payload.receiptVersion === '4.0.0') && !normalizeSha256(payload.semanticCaseFingerprint)) {
        diagnostics.push(`${caseId}:RUNTIME_RECEIPT_SEMANTIC_CASE_FINGERPRINT_MISSING`);
      }
      const releaseObservation = normalizeReleaseObservation({
        releaseObservation: payload.releaseObservation,
        applicationVersionFingerprint: context.applicationVersionFingerprint,
        observedAt: result.startTime,
      });
      if (releaseObservation.status === 'unavailable') {
        diagnostics.push(`${caseId}:RUNTIME_RECEIPT_RELEASE_IDENTITY_UNAVAILABLE`);
      }
      for (const [key, value] of Object.entries(context ?? {})) {
        if (!String(value).trim()) diagnostics.push(`${caseId}:RUNTIME_RECEIPT_CONTEXT_MISSING:${key}`);
      }
      if (!context?.environmentId || !context.locale || !context.roleId || !context.route) {
        diagnostics.push(`${caseId}:RUNTIME_RECEIPT_CONTEXT_INCOMPLETE`);
      }
      if (!hasCompleteClaims(payload.claims)) diagnostics.push(`${caseId}:RUNTIME_RECEIPT_CLAIMS_INCOMPLETE`);
      if (!hasCompleteCleanup(payload.cleanup)) diagnostics.push(`${caseId}:RUNTIME_RECEIPT_CLEANUP_INCOMPLETE`);
      const expectedEvidenceFingerprint = fingerprintReceiptEvidence(payload);
      if (payload.evidenceFingerprint !== expectedEvidenceFingerprint) {
        diagnostics.push(`${caseId}:RUNTIME_RECEIPT_EVIDENCE_FINGERPRINT_MISMATCH`);
      }
      if (payload.caseId !== caseId || !caseFingerprint
        || !receiptVersionSupported
        || ((payload.receiptVersion === '3.0.0' || payload.receiptVersion === '3.1.0' || payload.receiptVersion === '3.2.0' || payload.receiptVersion === '4.0.0')
          && !normalizeSha256(payload.implementationFingerprint))
        || ((payload.receiptVersion === '3.1.0' || payload.receiptVersion === '3.2.0' || payload.receiptVersion === '4.0.0')
          && !hasCompleteOperationReceipts(payload.operationReceipts))
        || ((payload.receiptVersion === '3.2.0' || payload.receiptVersion === '4.0.0') && !normalizeSha256(payload.semanticCaseFingerprint))
        || !context.environmentId || !context.locale || !context.roleId || !context.route
        || !hasCompleteClaims(payload.claims)
        || !hasCompleteCleanup(payload.cleanup)
        || payload.evidenceFingerprint !== expectedEvidenceFingerprint) continue;
      const evidenceStatus = 'complete' as const;
      records.push({
        caseId,
        applicationVersionFingerprint: releaseObservation.fingerprint,
        releaseObservation,
        executionEpochId: payload.executionEpochId?.trim()
          || input.runId
          || path.basename(input.reportPath, path.extname(input.reportPath)),
        executionContextFingerprint: fingerprintExecutionContext(context),
        caseFingerprint,
        semanticCaseFingerprint: normalizeSha256(payload.semanticCaseFingerprint),
        implementationFingerprint: normalizeSha256(payload.implementationFingerprint),
        status: 'passed',
        evidenceStatus,
        assertionStatuses: (payload.claims?.required ?? []).map((claimId) => (
          payload.claims?.verified?.includes(claimId) ? 'verified' : 'observed-mismatch'
        )),
        cleanupEvidence: {
          apiZeroResidue: payload.cleanup?.apiZeroResidue === true,
          uiZeroResidue: payload.cleanup?.uiZeroResidue === true,
        },
        receiptEvidenceFingerprint: expectedEvidenceFingerprint,
        evidenceFileFingerprint,
        reuseStatus: resolveReuseStatus({
          executionStatus: 'passed',
          evidenceStatus,
          releaseObservation,
        }),
        runId: input.runId ?? path.basename(input.reportPath, path.extname(input.reportPath)),
        evidencePath: path.relative(input.workspaceRoot, input.reportPath).replaceAll(path.sep, '/'),
        durationMs: result.duration ?? 0,
        recordedAt: result.startTime ?? new Date(fs.statSync(input.reportPath).mtimeMs).toISOString(),
      });
    }
  }
  return { records, diagnostics: [...new Set(diagnostics)].sort() };
}

export function fingerprintReceiptEvidence(payload: RuntimeReceiptPayload): string {
  const evidence = {
    caseId: payload.caseId,
    caseFingerprint: payload.caseFingerprint ?? payload.bindingFingerprint,
    semanticCaseFingerprint: payload.semanticCaseFingerprint,
    implementationFingerprint: payload.implementationFingerprint,
    executionContext: payload.executionContext,
    releaseObservation: payload.releaseObservation,
    executionEpochId: payload.executionEpochId,
    claims: payload.claims,
    operationReceipts: payload.operationReceipts ?? [],
    cleanup: payload.cleanup,
  };
  return createHash('sha256').update(stableJson(evidence)).digest('hex');
}

function hasCompleteClaims(claims: RuntimeReceiptPayload['claims']): boolean {
  if (!claims || !Array.isArray(claims.required) || !Array.isArray(claims.observed) || !Array.isArray(claims.verified)) return false;
  const required = [...new Set(claims.required)];
  const observed = new Set(claims.observed);
  const verified = new Set(claims.verified);
  return required.length > 0 && required.every((claimId) => observed.has(claimId) && verified.has(claimId));
}

function hasCompleteCleanup(cleanup: RuntimeReceiptPayload['cleanup']): boolean {
  return cleanup?.apiZeroResidue === true && cleanup.uiZeroResidue === true;
}

function hasCompleteOperationReceipts(receipts: RuntimeReceiptPayload['operationReceipts']): boolean {
  return Array.isArray(receipts) && receipts.length > 0
    && receipts.every((receipt) => receipt.operationKey?.trim() && receipt.observed === true && receipt.method?.trim());
}

function normalizeGroupReceiptCleanup(payload: RuntimeReceiptPayload): RuntimeReceiptPayload {
  if (hasCompleteCleanup(payload.cleanup) || payload.receiptVersion !== '2.0.0'
    || !payload.handlerId || payload.complete !== true) return payload;
  const requiredEvidence = new Set(payload.requiredEvidence ?? []);
  const observedEvidence = new Set(payload.observedEvidence ?? []);
  const requiredAssertions = new Set(payload.requiredAssertionIds ?? []);
  const observedAssertions = new Set(payload.observedAssertionIds ?? []);
  if (requiredEvidence.size === 0 || [...requiredEvidence].some((item) => !observedEvidence.has(item))) return payload;
  if (requiredAssertions.size === 0 || [...requiredAssertions].some((item) => !observedAssertions.has(item))) return payload;
  const cleanupEntries = payload.cleanup?.entries;
  const cleanupVerified = requiredEvidence.has('cleanup')
    ? Array.isArray(cleanupEntries)
      && cleanupEntries.length > 0
      && cleanupEntries.every((entry) => entry.phase === 'residue-verified')
    : payload.cleanup === null
      || (Array.isArray(cleanupEntries) && cleanupEntries.every((entry) => entry.phase === 'residue-verified'));
  if (!cleanupVerified) return payload;
  return {
    ...payload,
    cleanup: { apiZeroResidue: true, uiZeroResidue: true },
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeSha256(value: unknown): string | null {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function readReceiptPayload(
  attachments: readonly PlaywrightAttachment[],
  caseId: string,
  attachmentNames: readonly string[],
): RuntimeReceiptPayload | null {
  const acceptedNames = new Set([
    'test-execution-receipt',
    'system-test-runtime-evidence',
    ...attachmentNames,
    `${caseId}-runtime-evidence`,
  ]);
  const candidates = attachments.filter((attachment) => attachment.contentType === 'application/json'
    && acceptedNames.has(attachment.name ?? ''));
  for (const attachment of candidates) {
    if (!attachment.body) continue;
    try {
      const parsed = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8')) as RuntimeReceiptPayload;
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // Invalid receipt bodies are reported as missing because they cannot authorize a pass.
    }
  }
  return null;
}

function resolveCaseId(spec: PlaywrightSpec, testItem: PlaywrightTest): string | null {
  const annotation = testItem.annotations?.find((item) => (
    ['case-id', 'canonical-case-id', 'group-case-id'].includes(item.type ?? '')
  ))?.description;
  if (annotation) return annotation;
  const tag = spec.tags?.find((item) => item.startsWith('@case-') || item.startsWith('case-'));
  return tag?.replace(/^@?case-/, '') ?? null;
}

function flattenSpecs(suites: readonly PlaywrightSuite[]): PlaywrightSpec[] {
  return suites.flatMap((suite) => [
    ...(suite.specs ?? []),
    ...flattenSpecs(suite.suites ?? []),
  ]);
}
