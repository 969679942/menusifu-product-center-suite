import fs from 'node:fs';
import path from 'node:path';
import {
  buildSystemTestOptimizationPlan,
  type SystemTestOptimizationPlan,
  type SystemTestOptimizationReceipt,
} from '../../../Test Automation Platform/src/governance/system-test-optimization-gate';
import {
  assertExecutionIntentCompletion,
  assertExecutionIntentContract,
  fingerprintExecutionIntent,
  fingerprintExecutionSelection,
  type ExecutionIntent,
} from '../../../Test Automation Platform/src/governance/execution-intent';
import {
  discoverSystemTestPilotEvidence,
  hasCompleteReversibleCrudLifecycle,
} from '../../../Test Automation Platform/scripts/build-platform-readiness';
import type { ProjectRemediationScopeArtifact } from '../../../Test Automation Platform/src/governance/project-remediation-scope';
import { buildProductCenterProjectOptimizationCases } from '../adapters/product-center/product-center-project-optimization';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const deliverablesRoot = path.join(projectRoot, 'deliverables/system-test-platform');
const pilotCaseId = 'TC-FLV-SEA-032';
const changeId = 'b4-seasoning-reversible-pilot-20260905';
const initialPlanPath = path.join(deliverablesRoot, 'b4-seasoning-reversible-pilot-optimization-plan-20260905.json');
const initialPlan = readJson<SystemTestOptimizationPlan>(initialPlanPath);
const scope = readJson<ProjectRemediationScopeArtifact>(path.join(deliverablesRoot, 'product-center-remediation-scope.json'));
const allCases = buildProductCenterProjectOptimizationCases({ projectRoot, scope });
const pilotCase = allCases.find((item) => item.caseId === pilotCaseId);
if (!pilotCase) throw new Error(`SEASONING_REVERSIBLE_PILOT_CASE_MISSING:${pilotCaseId}`);

const discovery = discoverSystemTestPilotEvidence({
  rootDir: projectRoot,
  workspaceRoot,
  systemsRoot: path.join(projectRoot, 'systems'),
  systemOutputRoot: path.join(projectRoot, 'output/system-test'),
});
const pilot = discovery.pilots.find((item) => item.pilotId === 'merchant-center-product-center-seasoning');
const source = discovery.sources.find((item) => item.pilotId === 'merchant-center-product-center-seasoning');
if (!pilot || !source || !pilot.reversibleCrud || !pilot.runtimePassed || !pilot.evidenceComplete
  || !pilot.apiUiZeroResidue || pilot.securityFindings !== 0) {
  throw new Error(`SEASONING_REVERSIBLE_PILOT_NOT_QUALIFIED:${JSON.stringify(pilot ?? null)}`);
}
const evidencePath = path.resolve(workspaceRoot, source.evidenceLedger);
const evidenceLedger = readJson<any>(evidencePath);
if (!hasCompleteReversibleCrudLifecycle(evidenceLedger)) throw new Error('SEASONING_REVERSIBLE_LIFECYCLE_INCOMPLETE');
if (evidenceLedger.summary?.selected !== 1 || evidenceLedger.summary?.executed !== 1
  || evidenceLedger.cases?.length !== 1 || evidenceLedger.cases[0]?.caseId !== pilotCaseId) {
  throw new Error('SEASONING_REVERSIBLE_PILOT_SELECTION_DRIFT');
}
const evidenceCase = evidenceLedger.cases[0];
const runtime = evidenceCase.runtimeEvidence;
const lifecycle = runtime.operationReceipts
  .map((item: any) => ({
    sequence: item.sequence,
    operationKey: item.operationKey,
    method: item.method,
    phase: resolveLifecyclePhase(item),
  }))
  .filter((item: any) => item.phase !== null);
const receipt: SystemTestOptimizationReceipt = {
  caseId: pilotCaseId,
  caseFingerprint: pilotCase.caseFingerprint,
  implementationFingerprint: pilotCase.implementationFingerprint,
  businessImplementationFingerprint: pilotCase.businessImplementationFingerprint,
  status: evidenceCase.playwrightStatus === 'passed' ? 'passed' : 'failed',
  evidenceComplete: evidenceCase.evidence?.status === 'complete' && evidenceCase.auditCompleteness?.status === 'complete',
  operationReceiptCount: runtime?.operationReceipts?.length ?? 0,
  assertionReceiptCount: runtime?.assertionReceipts?.length ?? 0,
  cleanupComplete: evidenceCase.evidence?.apiZeroResidue === true && evidenceCase.evidence?.uiZeroResidue === true,
  contextReceiptComplete: (runtime?.contextGuardReceipts?.length ?? 0) >= 2,
};
if (receipt.status !== 'passed' || !receipt.evidenceComplete || !receipt.cleanupComplete
  || !receipt.contextReceiptComplete || receipt.operationReceiptCount < 9 || receipt.assertionReceiptCount < 2) {
  throw new Error(`SEASONING_REVERSIBLE_STANDARD_RECEIPT_INCOMPLETE:${JSON.stringify(receipt)}`);
}
const finalPlan = buildSystemTestOptimizationPlan({
  planId: initialPlan.planId,
  contractFingerprint: initialPlan.contractFingerprint,
  cases: allCases.map((item) => item.caseId === pilotCaseId ? { ...item, requiredCanary: true } : item),
  maxBatchSize: 1,
  canaryCaseIds: [pilotCaseId],
  executionCaseIds: [pilotCaseId],
  impactedCaseIds: [pilotCaseId],
  impactTypes: { [pilotCaseId]: 'adapter-only' },
  maxCanaryCases: 1,
  maxCanaryRatio: 1,
  standardReceipts: [receipt],
  changeId,
});
if (finalPlan.status !== 'revalidation-complete' || finalPlan.reusableCaseIds[0] !== pilotCaseId
  || finalPlan.executionEligibleCaseIds.length !== 0) {
  throw new Error(`SEASONING_REVERSIBLE_FINAL_DECISION_INVALID:${finalPlan.status}`);
}

const intentDocument = readJson<ExecutionIntent & { intentFingerprint: string; selectedFingerprint: string }>(
  path.join(deliverablesRoot, 'b4-seasoning-reversible-pilot-execution-intent-20260905.json'),
);
const intent: ExecutionIntent = {
  intentId: intentDocument.intentId,
  mode: intentDocument.mode,
  stage: intentDocument.stage,
  scopeId: intentDocument.scopeId,
  scopeFingerprint: intentDocument.scopeFingerprint,
  plannedCaseIds: intentDocument.plannedCaseIds,
  classifiedExclusionCaseIds: intentDocument.classifiedExclusionCaseIds,
  partitionCaseIds: intentDocument.partitionCaseIds,
  canaryPartitionKeys: intentDocument.canaryPartitionKeys,
  selectedCaseIds: intentDocument.selectedCaseIds,
  routes: intentDocument.routes,
};
assertExecutionIntentContract({ intent });
assertExecutionIntentCompletion({ intent, status: 'completed', terminalCaseIds: [pilotCaseId] });
const generatedAt = new Date().toISOString();
writeJson(path.join(deliverablesRoot, 'b4-seasoning-reversible-pilot-standard-receipts-20260905.json'), {
  schemaVersion: '1.0.0',
  changeId,
  generatedAt,
  source: { runReport: source.runReport, evidenceLedger: source.evidenceLedger },
  summary: { receipts: 1, passed: 1, evidenceComplete: 1, cleanupComplete: 1, lifecycleComplete: 1 },
  receipts: [receipt],
  lifecycle,
  cleanup: runtime.cleanup,
});
writeJson(path.join(deliverablesRoot, 'b4-seasoning-reversible-pilot-final-decision-plan-20260905.json'), finalPlan);
writeJson(path.join(deliverablesRoot, 'b4-seasoning-reversible-pilot-checkpoint-20260905.json'), {
  schemaVersion: '1.0.0',
  runId: changeId,
  status: 'completed',
  intentFingerprint: fingerprintExecutionIntent(intent),
  selectedFingerprint: fingerprintExecutionSelection(intent.selectedCaseIds),
  selectedCaseIds: [pilotCaseId],
  terminalCaseIds: [pilotCaseId],
  incompleteCaseIds: [],
  sourceRunReport: source.runReport,
  sourceEvidenceLedger: source.evidenceLedger,
  updatedAt: generatedAt,
});
process.stdout.write(`${JSON.stringify({ changeId, caseId: pilotCaseId, status: 'completed', pilot, source })}\n`);

function resolveLifecyclePhase(item: any): string | null {
  if (typeof item?.details?.lifecyclePhase === 'string') return item.details.lifecyclePhase;
  const method = String(item?.method ?? '').toUpperCase();
  const operationKey = String(item?.operationKey ?? '');
  if ((method === 'POST' || /(^|:)POST\s/.test(operationKey)) && /create|batch|modifier/i.test(operationKey)) return 'create';
  if ((method === 'PUT' || method === 'PATCH' || /(^|:)(PUT|PATCH)\s/.test(operationKey)) && /modifier/i.test(operationKey)) return 'update';
  return null;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
