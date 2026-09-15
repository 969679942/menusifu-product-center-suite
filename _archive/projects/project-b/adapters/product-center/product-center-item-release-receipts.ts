import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isCurrentReleaseCaseContract, qualifyCurrentReleaseReceipt, type CurrentReleaseCaseContract } from '../../../Test Automation Platform/src/governance/current-release-receipt';
import { readPlaywrightRuntimeReceiptCandidates } from '../../utils/playwright-execution-receipt';
import { readJsonEvidence } from '../../utils/json-evidence';
import { parseProductCenterItemCaseSemanticFingerprints } from '../../utils/product-center-item-case-semantic-fingerprint';
import { fingerprintProductCenterItemImplementation, productCenterItemImplementationCheckpoint } from './product-center-item-implementation';
import { verifyImplementationFormatEquivalence } from '../../../Test Automation Platform/src/governance/implementation-format-equivalence';
import { parseProductCenterItemAssertionSurfaces } from '../../utils/product-center-item-assertion-surfaces';

export const ITEM_CURRENT_RECEIPT_CONTRACT_PATH = 'contracts/product-center/test-cases/canonical/product-center-item-current-receipt-contract.json';
type Manifest = { schemaVersion: '1.0.0'; canonicalSourceSha256: string; cases: CurrentReleaseCaseContract[]; reportPaths: string[]; implementationFormatBaselines?: Record<string, unknown> };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export function isProductCenterItemReleaseReceiptManifest(value: unknown): value is Manifest {
  return object(value) && value.schemaVersion === '1.0.0'
    && typeof value.canonicalSourceSha256 === 'string' && /^[a-f0-9]{64}$/i.test(value.canonicalSourceSha256)
    && Array.isArray(value.cases) && value.cases.every(isCurrentReleaseCaseContract)
    && new Set(value.cases.map((item) => item.caseId)).size === value.cases.length
    && Array.isArray(value.reportPaths) && value.reportPaths.every((item) => typeof item === 'string')
    && new Set(value.reportPaths).size === value.reportPaths.length
    && (value.implementationFormatBaselines === undefined || object(value.implementationFormatBaselines));
}

export function qualifyProductCenterItemReleaseReceipts(input: {
  projectRoot: string;
  cases: Array<{ caseId: string; bindingFingerprint?: string; assertionIds?: string[] }>;
}): { accepted: Map<string, string[]>; findings: Array<{ caseId: string; reasons: string[] }>; sourceArtifacts: Record<string, { path: string; sha256: string }> } {
  const accepted = new Map<string, string[]>();
  const sourceArtifacts: Record<string, { path: string; sha256: string }> = {};
  const findings: Array<{ caseId: string; reasons: string[] }> = [];
  const result = readJsonEvidence(path.join(input.projectRoot, ITEM_CURRENT_RECEIPT_CONTRACT_PATH), isProductCenterItemReleaseReceiptManifest);
  if (result.status !== 'available') return { accepted, sourceArtifacts, findings: input.cases.map((item) => ({ caseId: item.caseId, reasons: [`CURRENT_CONTRACT_${result.status.toUpperCase()}`] })) };
  const manifest = result.value;
  const canonicalPath = path.resolve(input.projectRoot, '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md');
  if (createHash('sha256').update(fs.readFileSync(canonicalPath)).digest('hex') !== manifest.canonicalSourceSha256) {
    return { accepted, sourceArtifacts, findings: input.cases.map((item) => ({ caseId: item.caseId, reasons: ['CURRENT_CANONICAL_SOURCE_MISMATCH'] })) };
  }
  const semantics = new Map(parseProductCenterItemCaseSemanticFingerprints(canonicalPath).map((item) => [item.caseId, item]));
  const assertionSurfaces = new Map(parseProductCenterItemAssertionSurfaces(canonicalPath).map((item) => [item.caseId, item]));
  const contracts = new Map(manifest.cases.map((item) => [item.caseId, item]));
  const reportReasons: string[] = [];
  const allCandidates: Array<{ caseId: string; report: string; status: string; startedAt: string; receipt: unknown; reportFingerprint: string }> = [];
    for (const report of manifest.reportPaths) {
      const file = path.resolve(input.projectRoot, report);
      const relative = path.relative(input.projectRoot, file);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) { reportReasons.push('RECEIPT_PATH_OUTSIDE_PROJECT'); continue; }
      try {
        const realRelative = path.relative(fs.realpathSync(input.projectRoot), fs.realpathSync(file));
        if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) { reportReasons.push('RECEIPT_PATH_OUTSIDE_PROJECT'); continue; }
        allCandidates.push(...readPlaywrightRuntimeReceiptCandidates(file).map((candidate) => ({ report, ...candidate })));
      } catch { reportReasons.push('RECEIPT_REPORT_UNAVAILABLE'); }
    }

  for (const item of input.cases) {
    const contract = contracts.get(item.caseId);
    const semantic = semantics.get(item.caseId);
    const reasons: string[] = [...reportReasons];
    if (!contract || !semantic) { findings.push({ caseId: item.caseId, reasons: ['CURRENT_CASE_CONTRACT_MISSING'] }); continue; }
    if (contract.caseFingerprint !== item.bindingFingerprint || contract.semanticCaseFingerprint !== semantic.fingerprint) reasons.push('CURRENT_CASE_IDENTITY_MISMATCH');
    if (contract.implementationFingerprint !== fingerprintProductCenterItemImplementation(input.projectRoot, item.caseId)) {
      const equivalence = verifyImplementationFormatEquivalence({ projectRoot: input.projectRoot,
        checkpoint: productCenterItemImplementationCheckpoint(item.caseId), expectedFingerprint: contract.implementationFingerprint,
        baseline: manifest.implementationFormatBaselines?.[item.caseId] });
      if (!equivalence.accepted) reasons.push('CURRENT_IMPLEMENTATION_MISMATCH', ...equivalence.reasons);
      else sourceArtifacts[`format-equivalence:${item.caseId}`] = { path: ITEM_CURRENT_RECEIPT_CONTRACT_PATH,
        sha256: createHash('sha256').update(fs.readFileSync(path.join(input.projectRoot, ITEM_CURRENT_RECEIPT_CONTRACT_PATH))).digest('hex') };
    }
    const sourceStepIds = semantic.steps.map((_, index) => `${item.caseId}:action-${index + 1}`);
    const declaredSourceSteps = contract.operationMapping?.sourceStepIds ?? contract.requiredOperationKeys;
    if (JSON.stringify([...declaredSourceSteps].sort()) !== JSON.stringify(sourceStepIds.sort())) reasons.push('CURRENT_SOURCE_OPERATION_SET_MISMATCH');
    const surface = assertionSurfaces.get(item.caseId);
    const requiredAssertions = surface?.assertionIds ?? [];
    reasons.push(...(surface?.reasons ?? ['CURRENT_ASSERTION_CONTRACT_MISSING']));
    if (JSON.stringify([...contract.requiredAssertionIds].sort()) !== JSON.stringify(requiredAssertions.sort())) reasons.push('CURRENT_ASSERTION_CONTRACT_MISMATCH');
    const candidates = allCandidates.filter((candidate) => candidate.caseId === item.caseId);
    if (candidates.some((candidate) => !Number.isFinite(Date.parse(candidate.startedAt)))) reasons.push('RECEIPT_ATTEMPT_TIME_INVALID');
    candidates.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
    const latest = candidates.at(-1);
    if (!latest) reasons.push('CURRENT_RECEIPT_MISSING');
    else if (latest.status !== 'passed') reasons.push('LATEST_EXECUTION_NOT_PASSED');
    else {
      if (candidates.filter((candidate) => candidate.startedAt === latest.startedAt).length > 1) reasons.push('LATEST_EXECUTION_AMBIGUOUS');
      reasons.push(...qualifyCurrentReleaseReceipt(contract, latest.receipt).reasons);
    }
    if (reasons.length) findings.push({ caseId: item.caseId, reasons: [...new Set(reasons)].sort() });
    else {
      accepted.set(item.caseId, [ITEM_CURRENT_RECEIPT_CONTRACT_PATH, latest!.report]);
      sourceArtifacts[`receipt:${latest!.report}`] = { path: latest!.report, sha256: latest!.reportFingerprint };
    }
  }
  return { accepted, findings, sourceArtifacts };
}
