import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertSystemTestOptimizationPlanMetadata,
  buildSystemTestOptimizationPlan,
} from '../../../Test Automation Platform/src/governance/system-test-optimization-gate';
import {
  buildProductCenterSeasoningOptimizationCases,
} from '../adapters/product-center/product-center-project-optimization';

const projectRoot = path.resolve(__dirname, '..');
const deliverablesRoot = path.join(projectRoot, 'deliverables/system-test-platform');
const allCases = buildProductCenterSeasoningOptimizationCases(projectRoot);
const caseId = 'TC-FLV-SEA-042';
const target = allCases.find((item) => item.caseId === caseId);
if (!target || target.module !== 'seasoning') throw new Error(`SEA042_REPAIR_CASE_MISSING:${caseId}`);

const generatedAt = new Date().toISOString();
const changeId = 'seasoning-sea042-cleanup-stall-repair-20260905';
const contractFingerprint = sha256({
  applicationId: 'merchant-center',
  systemId: 'merchant-center-product-center-seasoning',
  caseId,
  caseFingerprint: target.caseFingerprint,
  implementationFingerprint: target.implementationFingerprint,
  correction: 'remove-unused-template-fixture-and-single-store-template-ui-cleanup',
});
const plan = buildSystemTestOptimizationPlan({
  planId: `merchant-center:${changeId}`,
  contractFingerprint,
  cases: allCases.map((item) => item.caseId === caseId ? { ...item, requiredCanary: true } : item),
  maxBatchSize: 1,
  canaryCaseIds: [caseId],
  executionCaseIds: [caseId],
  impactedCaseIds: [caseId],
  impactTypes: { [caseId]: 'adapter-only' },
  maxCanaryCases: 1,
  maxCanaryRatio: 1,
  changeId,
  generatedAt,
});
assertSystemTestOptimizationPlanMetadata(plan);
if (plan.status !== 'canary-required' || plan.canaryCaseIds.length !== 1 || plan.canaryCaseIds[0] !== caseId) {
  throw new Error(`SEA042_REPAIR_PLAN_INVALID:${plan.status}`);
}

writeJson(path.join(deliverablesRoot, 'seasoning-sea042-cleanup-stall-impact-20260905.json'), {
  schemaVersion: '1.0.0',
  changeId,
  generatedAt,
  recommendation: '必须',
  purpose: '修复 SEA-042 业务已成功后因冗余模板 UI 清理在单门店权限终态卡死的问题。',
  expectedResult: '只执行 SEA-042；形成完整标准收据，确认品牌下发、门店 UI/API 终态及品牌/门店零残留。',
  downstreamImpact: '既有通过用例不重跑、不失效；仅 SEA-042 因实现语义变化需要重验。跨应用 pilot 继续 deferred。',
  selectedCaseIds: [caseId],
  excludedCaseCount: Math.max(0, allCases.length - 1),
  fullRegression: false,
});
writeJson(path.join(deliverablesRoot, 'seasoning-sea042-cleanup-stall-optimization-plan-20260905.json'), plan);
process.stdout.write(`${JSON.stringify({ changeId, caseId, status: plan.status, caseFingerprint: target.caseFingerprint,
  implementationFingerprint: target.implementationFingerprint })}\n`);

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
