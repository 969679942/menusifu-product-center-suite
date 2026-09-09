import fs from 'node:fs';
import path from 'node:path';
import type { ProjectRemediationScopeArtifact } from '../../../Test Automation Platform/src/governance/project-remediation-scope';
import type { SystemTestOptimizationReceipt } from '../../../Test Automation Platform/src/governance/system-test-optimization-gate';

type ClosureAudit = {
  cases: Array<{ caseId: string; module: string; responsibilityClass?: string }>;
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const deliverablesRoot = path.join(projectRoot, 'deliverables/system-test-platform');
const scope = readJson<ProjectRemediationScopeArtifact>(path.join(deliverablesRoot, 'product-center-remediation-scope.json'));
const closure = readJson<ClosureAudit>(path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-closure-audit.json'));
const receipts = readJson<SystemTestOptimizationReceipt[]>(path.join(deliverablesRoot, 'b3-targeted-revalidation-standard-receipts-20260905.json'));
const receiptCaseIds = new Set(receipts.filter((item) => item.status === 'passed' && item.evidenceComplete).map((item) => item.caseId));
const landedGroupCaseIds = new Set(scope.cases.filter((item) => item.module === 'group').map((item) => item.caseId));
const groupRevalidationCaseIds = closure.cases
  .filter((item) => item.module === '商品管理-组' && item.responsibilityClass === 'revalidation-required')
  .map((item) => item.caseId)
  .sort();
const evidenceGapCaseIds = groupRevalidationCaseIds
  .filter((caseId) => landedGroupCaseIds.has(caseId) && !receiptCaseIds.has(caseId))
  .sort();
const classifiedExclusionCaseIds = groupRevalidationCaseIds
  .filter((caseId) => !landedGroupCaseIds.has(caseId))
  .filter((caseId) => scope.exclusions.some((item) => item.caseId === caseId && item.status === 'unlanded'))
  .sort();
const unclassified = groupRevalidationCaseIds.filter((caseId) => (
  !receiptCaseIds.has(caseId)
  && !evidenceGapCaseIds.includes(caseId)
  && !classifiedExclusionCaseIds.includes(caseId)
));
if (unclassified.length > 0) throw new Error(`B5_REFERENCE_GAP_UNCLASSIFIED:${unclassified.join(',')}`);
if (evidenceGapCaseIds.includes('TC-GRP-PKG-040')) throw new Error('B5_HUMAN_BUSINESS_CASE_EXECUTION_FORBIDDEN');

const output = {
  schemaVersion: '1.0.0' as const,
  changeId: 'b5-reference-evidence-gap-closure-20260905',
  applicationId: 'merchant-center',
  defaultImpactType: 'evidence-gap' as const,
  impactedCaseIds: [...evidenceGapCaseIds, ...classifiedExclusionCaseIds].sort(),
  caseImpactTypes: Object.fromEntries(evidenceGapCaseIds.map((caseId) => [caseId, 'evidence-gap'])),
  classifiedExclusionCaseIds,
  summary: {
    groupRevalidation: groupRevalidationCaseIds.length,
    currentReceiptReuse: groupRevalidationCaseIds.filter((caseId) => receiptCaseIds.has(caseId)).length,
    targetedEvidenceGapExecution: evidenceGapCaseIds.length,
    classifiedUnlandedExclusions: classifiedExclusionCaseIds.length,
    humanBusinessExecutionSelected: 0,
    fullRegression: false,
  },
};
writeJson(path.join(deliverablesRoot, 'b5-reference-evidence-gap-impact-20260905.json'), output);
process.stdout.write(`${JSON.stringify(output.summary)}\n`);

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
