import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fingerprintSystemTestValue } from '../../Test Automation Platform/src/automation/system-test/system-test-contract';
import { parseProductCenterItemCaseSemanticFingerprints } from '../utils/product-center-item-case-semantic-fingerprint';
import { parseProductCenterItemAssertionSurfaces } from '../utils/product-center-item-assertion-surfaces';
import { publishImmutableArtifact } from '../utils/immutable-artifact';
import { readJsonEvidence } from '../utils/json-evidence';

const canonicalSource = '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md';
const paths = {
  plan: 'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json',
  review: 'contracts/product-center/test-cases/canonical/product-center-item-full-review.json',
  conversion: 'output/product-center-item-213-conversion.json',
  confirmations: 'contracts/product-center/reviews/product-center-item-rule-confirmations.json',
};
type DerivedCase = { id: string; title: string; source: string; preconditions: string[]; actions: string[]; expectedResults: string[]; changeType?: string; diagnostics?: string[] };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const normalize = (value: string | readonly string[]) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value.map((item) => item.replace(/\s+/g, ' ').trim());

export function auditProductCenterItemSourceDerivation(projectRoot = path.resolve(__dirname, '..')) {
  const read = <T>(file: string, validate: (value: unknown) => value is T) => readJsonEvidence(path.resolve(projectRoot, file), validate);
  const plan = read(paths.plan, (v): v is { fingerprint: string; cases: DerivedCase[] } & Record<string, unknown> => object(v)
    && typeof v.fingerprint === 'string' && Array.isArray(v.cases) && v.cases.every((row) => object(row)
      && typeof row.id === 'string' && typeof row.title === 'string' && typeof row.source === 'string'
      && strings(row.preconditions) && strings(row.actions) && strings(row.expectedResults)));
  const review = read(paths.review, (v): v is { fingerprint: string; sourcePlanFingerprint: string; entries: Array<{ caseId: string; decision: string }> } & Record<string, unknown> => object(v)
    && typeof v.fingerprint === 'string' && typeof v.sourcePlanFingerprint === 'string' && Array.isArray(v.entries)
    && v.entries.every((row) => object(row) && typeof row.caseId === 'string' && typeof row.decision === 'string'));
  const conversion = read(paths.conversion, (v): v is { cases: Array<{ caseId: string; assertionIds: string[] }> } => object(v) && Array.isArray(v.cases)
    && v.cases.every((row) => object(row) && typeof row.caseId === 'string' && strings(row.assertionIds)));
  const confirmations = read(paths.confirmations, (v): v is { sourceRole: string; confirmations: Array<{ ruleId: string; canonicalCorrections?: Array<{ canonicalId: string }> }> } => object(v)
    && v.sourceRole === 'product-confirmed-rule' && Array.isArray(v.confirmations) && v.confirmations.every((row) => object(row) && typeof row.ruleId === 'string'
      && (row.canonicalCorrections === undefined || Array.isArray(row.canonicalCorrections) && row.canonicalCorrections.every((c) => object(c) && typeof c.canonicalId === 'string'))));
  const diagnostics: Array<{ input: string; reason: string }> = [];
  for (const [input, result] of Object.entries({ plan, review, conversion, confirmations })) {
    if (result.status !== 'available') diagnostics.push({ input, reason: `${result.status}:${result.reason}` });
  }
  const formal = parseProductCenterItemCaseSemanticFingerprints(path.resolve(projectRoot, canonicalSource));
  const surfaces = new Map(parseProductCenterItemAssertionSurfaces(path.resolve(projectRoot, canonicalSource)).map((item) => [item.caseId, item]));
  const derivedById = new Map(plan.status === 'available' ? plan.value.cases.map((row) => [row.id, row]) : []);
  const reviewsById = new Map(review.status === 'available' ? review.value.entries.map((row) => [row.caseId, row]) : []);
  const generatedById = new Map(conversion.status === 'available' ? conversion.value.cases.map((row) => [row.caseId, row]) : []);
  let planFingerprintValid = false;
  let reviewFingerprintValid = false;
  if (plan.status === 'available') {
    const { fingerprint, ...value } = plan.value;
    planFingerprintValid = fingerprint === fingerprintSystemTestValue(value);
    if (!planFingerprintValid) diagnostics.push({ input: 'plan', reason: 'CONTENT_FINGERPRINT_MISMATCH' });
    if (derivedById.size !== plan.value.cases.length) diagnostics.push({ input: 'plan', reason: 'DUPLICATE_CASE_ID' });
  }
  if (review.status === 'available') {
    const { fingerprint, ...value } = review.value;
    reviewFingerprintValid = fingerprint === hash(JSON.stringify(value));
    if (!reviewFingerprintValid) diagnostics.push({ input: 'review', reason: 'CONTENT_FINGERPRINT_MISMATCH' });
    if (reviewsById.size !== review.value.entries.length) diagnostics.push({ input: 'review', reason: 'DUPLICATE_CASE_ID' });
    if (plan.status === 'available' && review.value.sourcePlanFingerprint !== plan.value.fingerprint) diagnostics.push({ input: 'review', reason: 'SOURCE_PLAN_FINGERPRINT_MISMATCH' });
  }
  if (conversion.status === 'available' && generatedById.size !== conversion.value.cases.length) diagnostics.push({ input: 'conversion', reason: 'DUPLICATE_CASE_ID' });
  const reviewBoundToDerivedPlan = plan.status === 'available' && review.status === 'available'
    && planFingerprintValid && reviewFingerprintValid && review.value.sourcePlanFingerprint === plan.value.fingerprint;
  const rows = formal.map((current) => {
    const derived = derivedById.get(current.caseId);
    const surface = surfaces.get(current.caseId)!;
    const fields = { title: current.title, source: current.sources.join('\n'), preconditions: current.preconditions,
      actions: current.steps, expectedResults: surface.assertions.map((assertion) => assertion.text) };
    const differences = derived ? (Object.keys(fields) as Array<keyof typeof fields>).flatMap((field) => {
      const canonical = fields[field];
      const candidate = derived[field];
      return JSON.stringify(normalize(canonical)) === JSON.stringify(normalize(candidate)) ? [] : [{ field, canonical, candidate }];
    }) : [];
    const confirmationRefs = confirmations.status === 'available' ? confirmations.value.confirmations.filter((item) => item.canonicalCorrections?.some((c) => c.canonicalId === current.caseId)).map((item) => item.ruleId) : [];
    return { caseId: current.caseId, status: !derived ? 'derived-case-missing' : surface.reasons.length ? 'canonical-structure-incomplete'
      : differences.length ? 'derived-content-differs' : 'aligned', differences,
      canonicalAssertionIds: surface.assertionIds, canonicalStructureFindings: surface.reasons,
      derivedAssertionCount: derived?.expectedResults.length ?? null,
      generatedAssertionIds: generatedById.get(current.caseId)?.assertionIds ?? null,
      reviewDecision: reviewsById.get(current.caseId)?.decision ?? null,
      reviewBoundToDerivedPlan, reviewAuthorizesCanonicalRewrite: false,
      declaredChangeType: derived?.changeType ?? null, confirmationRefs,
      confirmationNote: '仅登记明确修订的来源引用，不能据caseId或审批状态推断当前派生内容已被正式采纳。',
      owner: 'execution-agent', businessExecutionAuthorized: false };
  });
  const canonicalIds = new Set(formal.map((item) => item.caseId));
  const derivedOnlyCaseIds = [...derivedById.keys()].filter((id) => !canonicalIds.has(id));
  const inputFiles = [canonicalSource, ...Object.values(paths), 'utils/product-center-item-review-corrections.ts'];
  const report = { schemaVersion: '1.0.0', generatedAt: new Date().toISOString(), scope: 'static-source-derivation-audit',
    status: diagnostics.length || rows.some((row) => row.status !== 'aligned') ? 'incomplete' : 'aligned',
    sourceArtifacts: inputFiles.map((file) => { try { return { path: file, sha256: hash(fs.readFileSync(path.resolve(projectRoot, file))) }; } catch { return { path: file, sha256: null }; } }),
    diagnostics, reviewBoundToDerivedPlan, planFingerprintValid, reviewFingerprintValid,
    summary: { formalCases: rows.length, aligned: rows.filter((row) => row.status === 'aligned').length,
      differing: rows.filter((row) => row.differences.length > 0).length, structuralIncomplete: rows.filter((row) => row.status === 'canonical-structure-incomplete').length,
      derivedMissing: rows.filter((row) => row.status === 'derived-case-missing').length, derivedOnly: derivedOnlyCaseIds.length },
    cases: rows, derivedOnlyCaseIds,
    guardrails: { businessExecutionStarted: false, canonicalRewritten: false, historicalPassedCasesInvalidated: false,
      staticApprovalIsRuntimeEvidence: false, secretsPersisted: false },
  };
  const relativePath = 'deliverables/system-test-platform/product-center-item-source-derivation-audit.json';
  publishImmutableArtifact({ outputRoot: projectRoot, relativePath, content: JSON.stringify(report, null, 2) + '\n', reason: 'compare-current-formal-derived-and-generated-source-identities' });
  return { output: path.join(projectRoot, relativePath), report };
}

if (require.main === module) {
  const { output, report } = auditProductCenterItemSourceDerivation();
  process.stdout.write(JSON.stringify({ output, status: report.status, summary: report.summary, diagnostics: report.diagnostics }) + '\n');
}
