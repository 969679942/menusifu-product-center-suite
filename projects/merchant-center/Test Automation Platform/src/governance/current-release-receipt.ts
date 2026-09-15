import { fingerprintReceiptEvidence } from '../utils/playwright-execution-receipt';
import { fingerprintExecutionContext } from '../utils/test-execution-state';
import { evaluateSystemTestRuntimeContract, type RuntimeAssertionReceipt, type RuntimeOperationReceipt } from '../automation/system-test/system-test-runtime-contract';
import { isOperationOccurrenceMapping, mappingMatchesRequiredOperations, mapOperationReceiptOccurrences, type OperationOccurrenceMapping } from './operation-occurrence-mapping';

export type CurrentReleaseCaseContract = {
  caseId: string;
  caseFingerprint: string;
  semanticCaseFingerprint: string;
  implementationFingerprint: string;
  executionContextFingerprint: string;
  requiredOperationKeys: string[];
  requiredAssertionIds: string[];
  cleanupRequired: boolean;
  operationMapping?: OperationOccurrenceMapping;
};
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const uniqueKeys = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0
  && value.every((item) => typeof item === 'string' && item.trim()) && new Set(value).size === value.length;

export function isCurrentReleaseCaseContract(value: unknown): value is CurrentReleaseCaseContract {
  return object(value) && typeof value.caseId === 'string' && Boolean(value.caseId.trim())
    && hash(value.caseFingerprint) && hash(value.semanticCaseFingerprint) && hash(value.implementationFingerprint)
    && hash(value.executionContextFingerprint) && uniqueKeys(value.requiredOperationKeys)
    && uniqueKeys(value.requiredAssertionIds) && typeof value.cleanupRequired === 'boolean'
    && (value.operationMapping === undefined || isOperationOccurrenceMapping(value.operationMapping)
      && mappingMatchesRequiredOperations(value.operationMapping, value.requiredOperationKeys));
}

/** The adapter supplies independently current identities and declared surfaces, never derived from a receipt. */
export function qualifyCurrentReleaseReceipt(contract: CurrentReleaseCaseContract, candidate: unknown): {
  accepted: boolean; reasons: string[];
} {
  const reasons = new Set<string>();
  const reject = (code: string) => { reasons.add(code); };
  if (!isCurrentReleaseCaseContract(contract)) return { accepted: false, reasons: ['CURRENT_CASE_CONTRACT_INVALID'] };
  if (!object(candidate)) return { accepted: false, reasons: ['CURRENT_RECEIPT_MISSING'] };
  if (candidate.receiptVersion !== '4.0.0') reject('CURRENT_RECEIPT_VERSION_REQUIRED');
  for (const key of ['caseId', 'caseFingerprint', 'semanticCaseFingerprint', 'implementationFingerprint'] as const) {
    if (candidate[key] !== contract[key]) reject(`${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_MISMATCH`);
  }
  const context = candidate.executionContext;
  if (!object(context) || !['environmentId', 'tenantScope', 'locale', 'roleId', 'route'].every((key) => typeof context[key] === 'string' && String(context[key]).trim())
    || !hash(context.applicationVersionFingerprint)) reject('EXECUTION_CONTEXT_INCOMPLETE');
  else if (fingerprintExecutionContext(context) !== contract.executionContextFingerprint) reject('EXECUTION_CONTEXT_MISMATCH');

  let operations = candidate.operationReceipts;
  const assertions = candidate.assertionReceipts;
  if (contract.operationMapping) {
    const projection = mapOperationReceiptOccurrences(contract.operationMapping, operations as RuntimeOperationReceipt[]);
    for (const reason of projection.reasons) reject(reason);
    operations = projection.businessReceipts;
  }
  if (!Array.isArray(operations) || !operations.every((item) => object(item) && typeof item.operationKey === 'string' && typeof item.method === 'string')) reject('OPERATION_RECEIPTS_INVALID');
  else {
    if (contract.requiredOperationKeys.some((key) => operations.filter((item) => item.operationKey === key).length !== 1)) reject('OPERATION_RECEIPT_CARDINALITY_INVALID');
    if (operations.some((item) => item.status !== 'passed' || item.observed !== true
      || typeof item.startedAt !== 'string' || typeof item.finishedAt !== 'string'
      || !Number.isFinite(Date.parse(item.startedAt)) || !Number.isFinite(Date.parse(item.finishedAt))
      || Date.parse(item.finishedAt) < Date.parse(item.startedAt))) reject('OPERATION_EXECUTION_EVIDENCE_INCOMPLETE');
  }
  if (!Array.isArray(assertions) || !assertions.every((item) => object(item) && typeof item.claimId === 'string')) reject('ASSERTION_RECEIPTS_INVALID');
  if (!reasons.has('OPERATION_RECEIPTS_INVALID') && !reasons.has('ASSERTION_RECEIPTS_INVALID')) {
    const result = evaluateSystemTestRuntimeContract({ caseId: contract.caseId,
      requiredOperationKeys: contract.requiredOperationKeys, requiredAssertionIds: contract.requiredAssertionIds,
      operationReceipts: operations as RuntimeOperationReceipt[], assertionReceipts: assertions as RuntimeAssertionReceipt[] });
    for (const finding of result.findings) reject(finding.code);
    if ((assertions as RuntimeAssertionReceipt[]).some((item) => item.status !== 'verified' || item.comparison !== 'matched')) reject('ASSERTION_NOT_VERIFIED');
  }
  const claims = candidate.claims;
  if (!object(claims) || !['required', 'observed', 'verified'].every((key) => uniqueKeys(claims[key])
    && JSON.stringify([...claims[key]].sort()) === JSON.stringify([...contract.requiredAssertionIds].sort()))) reject('DECLARED_ASSERTION_SET_MISMATCH');
  const cleanup = candidate.cleanup;
  if (!object(cleanup) || cleanup.apiZeroResidue !== true || cleanup.uiZeroResidue !== true) reject('CLEANUP_INCOMPLETE');
  if (contract.cleanupRequired && (!object(cleanup) || !['apiIdentityCounts', 'uiIdentityCounts'].every((key) => object(cleanup[key])
    && Object.keys(cleanup[key]).length > 0 && Object.values(cleanup[key]).every((count) => count === 0)))) reject('CLEANUP_OBSERVATION_MISSING');
  if (contract.cleanupRequired && object(cleanup) && object(cleanup.apiIdentityCounts) && object(cleanup.uiIdentityCounts)
    && JSON.stringify(Object.keys(cleanup.apiIdentityCounts).sort()) !== JSON.stringify(Object.keys(cleanup.uiIdentityCounts).sort())) reject('CLEANUP_IDENTITY_SET_MISMATCH');
  try {
    if (!hash(candidate.evidenceFingerprint) || candidate.evidenceFingerprint !== fingerprintReceiptEvidence(candidate)) reject('RECEIPT_FINGERPRINT_MISMATCH');
  } catch { reject('RECEIPT_FINGERPRINT_INVALID'); }
  return { accepted: reasons.size === 0, reasons: [...reasons].sort() };
}
