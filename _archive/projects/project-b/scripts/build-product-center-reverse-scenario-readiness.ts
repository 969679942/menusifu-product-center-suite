import fs from 'node:fs';
import path from 'node:path';
import type { ReverseScenarioCatalog } from '../../../Test Automation Platform/src/utils/reverse-scenario-catalog';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const catalogPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/process-reverse-scenario-catalog-v1.json');
const mapPath = path.join(projectRoot, 'adapters/test-automation-platform/product-center-reverse-scenario-map-v1.json');
const auditPath = path.join(workspaceRoot, 'deliverables/product-center-group/runtime-audit-v2.json');
const outputPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-reverse-scenario-readiness-v1.json');

const catalog = readJson<ReverseScenarioCatalog>(catalogPath);
const map = readJson<{ mappings: Array<{ scenarioId: string; caseIds: string[]; status: string; evidenceRefs: string[]; reason: string }> }>(mapPath);
const audit = readJson<{ evidenceInventory?: Array<{ evidenceId: string; disposition: string }>; corrections?: Array<{ caseId: string }> }>(auditPath);
const knownCaseIds = new Set((audit.corrections ?? []).map((item) => item.caseId));
const mappings = new Map((map.mappings ?? []).map((item) => [item.scenarioId, item]));
const evidenceIds = new Set((audit.evidenceInventory ?? []).filter((item) => item.disposition === 'consumed').map((item) => item.evidenceId));

const scenarios = catalog.scenarios.map((scenario) => {
  const mapping = mappings.get(scenario.scenarioId);
  const unknownCaseIds = (mapping?.caseIds ?? []).filter((caseId) => !knownCaseIds.has(caseId));
  const evidenceAvailable = (mapping?.evidenceRefs ?? []).length > 0;
  const status = mapping && unknownCaseIds.length === 0 && evidenceAvailable ? 'partial' : 'missing';
  return {
    scenarioId: scenario.scenarioId,
    requirementIds: scenario.requirementIds,
    status,
    linkedCaseIds: mapping?.caseIds ?? [],
    evidenceRefs: mapping?.evidenceRefs ?? [],
    consumedEvidenceCount: evidenceAvailable ? evidenceIds.size : 0,
    reason: status === 'partial'
      ? mapping?.reason ?? '已有关联证据，但未满足完整流程收据门禁'
      : '商品中心尚未提供该流程场景的项目适配器映射或证据',
    blockingConditions: status === 'partial'
      ? ['execution grant', '完整事件流收据', '标准操作/断言收据', 'API/UI 清理证据']
      : ['项目适配器映射', '来源与证据引用', '标准运行收据'],
  };
});
const summary = {
  scenarioCount: scenarios.length,
  mappedScenarioCount: scenarios.filter((item) => item.status !== 'missing').length,
  partial: scenarios.filter((item) => item.status === 'partial').length,
  missing: scenarios.filter((item) => item.status === 'missing').length,
  covered: 0,
  linkedCaseCount: new Set(scenarios.flatMap((item) => item.linkedCaseIds)).size,
};
const report = {
  schemaVersion: '1.0.0',
  reportId: 'product-center-reverse-scenario-readiness-v1',
  generatedAt: new Date().toISOString(),
  projectId: 'merchant-center-product-center',
  executionScope: 'static-and-contract-only',
  summary,
  scenarios,
  resolvedInThisRun: [
    '商品中心映射 caseId 存在性和证据引用校验',
    '流程场景到商品中心证据的 partial/missing 分层',
    '候选用例、完整收据和业务执行的状态隔离',
  ],
  deferredOrBlocked: [
    '真实页面/API 写入、清理和 execution grant',
    '跨 applicationId 试点',
    '迁移基线接受（需明确批准人）',
    '业务规则冲突和未知上下文的人工裁决',
  ],
  guardrails: {
    businessExecutionStarted: false,
    existingPassedCasesInvalidated: false,
    crossSystemPilot: 'deferred',
    candidateCasesExecutionEligible: false,
  },
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, summary }, null, 2));

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
