import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  assertSystemTestOptimizationPlanMetadata,
  buildSystemTestOptimizationPlan,
} from '../../../Test Automation Platform/src/governance/system-test-optimization-gate';
import {
  assertExecutionIntentCheckpointState,
  assertExecutionIntentContract,
  fingerprintExecutionIntent,
  fingerprintExecutionSelection,
  type ExecutionIntent,
} from '../../../Test Automation Platform/src/governance/execution-intent';
import type { ProjectRemediationScopeArtifact } from '../../../Test Automation Platform/src/governance/project-remediation-scope';
import { buildProductCenterProjectOptimizationCases } from '../adapters/product-center/product-center-project-optimization';

const projectRoot = path.resolve(__dirname, '..');
const deliverablesRoot = path.join(projectRoot, 'deliverables/system-test-platform');
const scope = readJson<ProjectRemediationScopeArtifact>(path.join(deliverablesRoot, 'product-center-remediation-scope.json'));
const allCases = buildProductCenterProjectOptimizationCases({ projectRoot, scope });
const pilotCaseId = 'TC-FLV-SEA-032';
const pilotCase = allCases.find((item) => item.caseId === pilotCaseId);
if (!pilotCase || pilotCase.module !== 'seasoning') throw new Error(`SEASONING_REVERSIBLE_PILOT_CASE_MISSING:${pilotCaseId}`);

const generatedAt = new Date().toISOString();
const changeId = 'b4-seasoning-reversible-pilot-20260905';
const contractFingerprint = sha256({
  projectScopeFingerprint: scope.fingerprint,
  caseId: pilotCase.caseId,
  caseFingerprint: pilotCase.caseFingerprint,
  implementationFingerprint: pilotCase.implementationFingerprint,
  lifecycle: ['create', 'read-created-api', 'read-created-ui', 'update', 'read-updated-api', 'read-updated-ui', 'delete', 'read-absent-api', 'read-absent-ui'],
});
const plan = buildSystemTestOptimizationPlan({
  planId: `merchant-center:${changeId}`,
  contractFingerprint,
  cases: allCases.map((item) => item.caseId === pilotCaseId ? { ...item, requiredCanary: true } : item),
  maxBatchSize: 1,
  canaryCaseIds: [pilotCaseId],
  executionCaseIds: [pilotCaseId],
  impactedCaseIds: [pilotCaseId],
  impactTypes: { [pilotCaseId]: 'adapter-only' },
  maxCanaryCases: 1,
  maxCanaryRatio: 1,
  changeId,
  generatedAt,
});
assertSystemTestOptimizationPlanMetadata(plan);
if (plan.status !== 'canary-required' || plan.canaryCaseIds.length !== 1
  || plan.canaryCaseIds[0] !== pilotCaseId || plan.executionEligibleCaseIds[0] !== pilotCaseId) {
  throw new Error(`SEASONING_REVERSIBLE_PILOT_PLAN_INVALID:${plan.status}`);
}

const intent: ExecutionIntent = {
  intentId: changeId,
  mode: 'incremental',
  stage: 'canary',
  scopeId: `product-center-all-landed:${changeId}`,
  scopeFingerprint: contractFingerprint,
  plannedCaseIds: [pilotCaseId],
  classifiedExclusionCaseIds: [],
  partitionCaseIds: { seasoning: [pilotCaseId] },
  canaryPartitionKeys: ['seasoning'],
  selectedCaseIds: [pilotCaseId],
  routes: { systemTestSeasoning: [pilotCaseId] },
};
assertExecutionIntentContract({ intent });
assertExecutionIntentCheckpointState({ intent, terminalCaseIds: [], incompleteCaseIds: [pilotCaseId] });

const impact = {
  schemaVersion: '1.0.0',
  changeId,
  generatedAt,
  recommendation: '必须',
  purpose: '用一条当前 Seasoning 用例证明同一 applicationId 下跨业务域的最小可逆 CRUD 生命周期。',
  expectedResult: 'TC-FLV-SEA-032 依次完成创建、API/UI 回读、编辑、API/UI 回读、删除、API/UI 不存在校验。',
  downstreamImpact: '仅运行 TC-FLV-SEA-032；其他 419 条项目用例不执行、既有通过收据不失效。',
  selectedCaseIds: [pilotCaseId],
  excludedCaseCount: scope.cases.length - 1,
  fullRegression: false,
  cleanupIdentities: ['original', 'edited'],
};
const intentFingerprint = fingerprintExecutionIntent(intent);
const selectedFingerprint = fingerprintExecutionSelection(intent.selectedCaseIds);
const checkpoint = {
  schemaVersion: '1.0.0',
  runId: changeId,
  status: 'running',
  intentFingerprint,
  selectedFingerprint,
  selectedCaseIds: [pilotCaseId],
  terminalCaseIds: [],
  incompleteCaseIds: [pilotCaseId],
  updatedAt: generatedAt,
};

writeJson(path.join(deliverablesRoot, 'b4-seasoning-reversible-pilot-impact-20260905.json'), impact);
writeJson(path.join(deliverablesRoot, 'b4-seasoning-reversible-pilot-optimization-plan-20260905.json'), plan);
writeJson(path.join(deliverablesRoot, 'b4-seasoning-reversible-pilot-execution-intent-20260905.json'), {
  ...intent,
  intentFingerprint,
  selectedFingerprint,
});
writeJson(path.join(deliverablesRoot, 'b4-seasoning-reversible-pilot-checkpoint-20260905.json'), checkpoint);
process.stdout.write(`${JSON.stringify({ changeId, caseId: pilotCaseId, status: plan.status, intentFingerprint, selectedFingerprint })}\n`);

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
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
