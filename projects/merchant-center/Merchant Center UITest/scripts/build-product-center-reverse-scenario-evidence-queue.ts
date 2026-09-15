import path from 'node:path';
import { createHash } from 'node:crypto';
import { readJsonEvidence } from '../utils/json-evidence';
import { publishImmutableArtifact } from '../utils/immutable-artifact';
import { verifyProductCenterReverseScenarioSources } from './build-product-center-reverse-scenario-readiness';

type ReadinessScenario = {
  scenarioId: string;
  requirementIds: string[];
  status: 'missing' | 'partial' | string;
  linkedCaseIds: string[];
  evidenceRefs: string[];
  evidenceItems: Array<{ evidenceId: string; path: string; sha256: string; disposition: string }>;
  consumedEvidenceCount: number;
  declaredEvidenceCount: number;
  declaredAggregateRefs: string[];
  blockingConditions: string[];
};

const readinessRelativePath = 'deliverables/test-plan-governance/product-center-reverse-scenario-readiness-v1.json';
const outputRelativePath = 'deliverables/test-plan-governance/product-center-reverse-scenario-evidence-queue-v1.json';
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

type ReadinessReport = {
  schemaVersion: '1.0.0';
  reportId: 'product-center-reverse-scenario-readiness-v1';
  executionScope: 'static-and-contract-only';
  summary: { scenarioCount: number; partial: number; missing: number; covered: number };
  scenarios: ReadinessScenario[];
};

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const key = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const keys = (value: unknown): value is string[] => Array.isArray(value) && value.every(key) && new Set(value).size === value.length;
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;

/** Validate upstream facts before projecting them; an empty or inconsistent inventory is not completion. */
export function isReverseScenarioReadiness(value: unknown): value is ReadinessReport {
  if (!object(value) || value.schemaVersion !== '1.0.0' || value.reportId !== 'product-center-reverse-scenario-readiness-v1'
    || value.executionScope !== 'static-and-contract-only' || value.status === 'blocked'
    || !object(value.summary) || !Array.isArray(value.scenarios) || value.scenarios.length === 0) return false;
  if (!value.scenarios.every((row) => object(row) && key(row.scenarioId)
    && ['missing', 'partial', 'covered'].includes(String(row.status))
    && keys(row.requirementIds) && row.requirementIds.length > 0 && keys(row.linkedCaseIds)
    && keys(row.evidenceRefs) && keys(row.declaredAggregateRefs) && keys(row.blockingConditions)
    && Array.isArray(row.evidenceItems) && row.evidenceItems.every((item) => object(item)
      && key(item.evidenceId) && typeof item.path === 'string' && typeof item.sha256 === 'string' && key(item.disposition))
    && new Set(row.evidenceItems.map((item) => item.evidenceId)).size === row.evidenceItems.length
    && count(row.consumedEvidenceCount) && count(row.declaredEvidenceCount)
    && row.declaredEvidenceCount === row.evidenceItems.length + row.declaredAggregateRefs.length
    && row.consumedEvidenceCount === row.evidenceItems.filter((item) => item.disposition === 'consumed' && item.path.length > 0).length)) return false;
  const rows = value.scenarios as ReadinessScenario[];
  const summary = value.summary;
  return new Set(rows.map((row) => row.scenarioId)).size === rows.length
    && summary.scenarioCount === rows.length
    && ['missing', 'partial', 'covered'].every((status) => summary[status] === rows.filter((row) => row.status === status).length);
}

function buildQueue(report: ReadinessReport) {
  if (!isReverseScenarioReadiness(report)) throw new Error('REVERSE_SCENARIO_READINESS_INVALID');
  const items = report.scenarios.map((scenario, index) => {
    const missingEvidence = scenario.evidenceItems.filter((item) => (
      item.disposition !== 'consumed' || item.path.length === 0 || !/^[a-f0-9]{64}$/u.test(item.sha256)
    ));
    const evidenceGap = scenario.status === 'missing' || missingEvidence.length > 0 || scenario.declaredAggregateRefs.length > 0;
    return {
      queueId: `RS-EVIDENCE-${String(index + 1).padStart(3, '0')}`,
      scenarioId: scenario.scenarioId,
      requirementIds: scenario.requirementIds,
      linkedCaseIds: scenario.linkedCaseIds,
      readinessStatus: scenario.status,
      disposition: evidenceGap ? 'awaiting-evidence-and-runtime' : 'awaiting-runtime-receipt',
      missingEvidenceIds: missingEvidence.map((item) => item.evidenceId),
      unconsumedAggregateRefs: scenario.declaredAggregateRefs,
      consumedEvidenceCount: scenario.consumedEvidenceCount,
      declaredEvidenceCount: scenario.declaredEvidenceCount,
      executionEligible: false,
      businessExecutionStarted: false,
      blockingConditions: [
        ...new Set([
          ...scenario.blockingConditions,
          'standard-operation-receipt',
          'assertion-receipt',
          'cleanup-evidence',
          'execution-grant',
        ]),
      ],
      nextAction: evidenceGap
        ? '补齐逐项来源、证据哈希和操作/断言/清理收据；共享汇总文件不能直接消费'
        : '取得 execution grant 后按关联 caseId 生成标准运行收据并验证清理终态',
    };
  });
  return {
    schemaVersion: '1.0.0',
    reportId: 'product-center-reverse-scenario-evidence-queue-v1',
    staticGenerationStatus: 'completed',
    generatedAt: new Date().toISOString(),
    scope: 'report-only-static-evidence-remediation',
    summary: {
      scenarioCount: items.length,
      awaitingEvidenceAndRuntime: items.filter((item) => item.disposition === 'awaiting-evidence-and-runtime').length,
      awaitingRuntimeReceipt: items.filter((item) => item.disposition === 'awaiting-runtime-receipt').length,
      executionEligible: items.filter((item) => item.executionEligible).length,
      consumedEvidence: items.reduce((total, item) => total + item.consumedEvidenceCount, 0),
    },
    source: {
      readinessReport: 'deliverables/test-plan-governance/product-center-reverse-scenario-readiness-v1.json',
      readinessFingerprint: fingerprint(report),
      sourceSummary: { scenarioCount: report.summary.scenarioCount, partial: report.summary.partial,
        missing: report.summary.missing, covered: report.summary.covered },
    },
    guardrails: {
      businessExecutionStarted: false,
      liveBusinessWritesEnabled: false,
      candidateCasesExecutionEligible: false,
      aggregateEvidenceAuthorizesCovered: false,
      existingPassedCasesInvalidated: false,
    },
    items,
  };
}

export function generateReverseScenarioEvidenceQueue(projectRoot = path.resolve(__dirname, '..')) {
  const workspaceRoot = path.resolve(projectRoot, '..');
  const input = readJsonEvidence(path.join(workspaceRoot, readinessRelativePath), isReverseScenarioReadiness);
  const publish = (relativePath: string, content: string) => publishImmutableArtifact({ outputRoot: workspaceRoot,
    relativePath, content, reason: 'refresh-reverse-scenario-evidence-queue' });
  const lineage = input.status === 'available' ? verifyProductCenterReverseScenarioSources(projectRoot, input.value) : null;
  const failure = input.status !== 'available' ? { status: input.status, reason: input.reason }
    : lineage?.status !== 'current' ? { status: 'stale', reason: 'source-inputs-not-current' } : null;
  if (failure) {
  const blocked = {
    schemaVersion: '1.0.0',
    reportId: 'product-center-reverse-scenario-evidence-queue-v1',
    status: 'blocked',
    staticGenerationStatus: 'blocked',
    code: `REVERSE_SCENARIO_READINESS_${failure.status.toUpperCase()}`,
    inputStatus: failure.status,
    inputReason: failure.reason,
    lineageReasons: lineage?.reasons ?? [],
    source: { readinessReport: readinessRelativePath },
    summary: null,
    scope: 'report-only',
    businessExecutionStarted: false,
    existingPassedCasesInvalidated: false,
    generatedAt: new Date().toISOString(),
  };
  const content = `${JSON.stringify(blocked, null, 2)}\n`;
  publish(outputRelativePath.replace(/\.json$/u, '.blocked.json'), content);
  publish(outputRelativePath, content);
  publish(outputRelativePath.replace(/\.json$/u, '.md'), `# 商品中心反向场景证据整改队列\n\n当前输入不可用：${blocked.code}（${failure.reason}）。旧观察已保留，不计本次静态完成。\n`);
  return { status: 'blocked' as const, outputPath: path.join(workspaceRoot, outputRelativePath), summary: null };
}

if (input.status !== 'available') throw new Error('REVERSE_SCENARIO_INPUT_UNAVAILABLE');
const report = buildQueue(input.value);
publish(outputRelativePath, `${JSON.stringify(report, null, 2)}\n`);
publish(outputRelativePath.replace(/\.json$/u, '.md'), [
  '# 商品中心反向场景证据整改队列',
  '',
  `- 场景：${report.summary.scenarioCount}`,
  `- 等待证据与运行：${report.summary.awaitingEvidenceAndRuntime}`,
  `- 等待运行收据：${report.summary.awaitingRuntimeReceipt}`,
  `- 可执行：${report.summary.executionEligible}`,
  '',
  '| Queue | 场景 | 状态 | 缺失证据 | 下一步 |',
  '|---|---|---|---:|---|',
  ...report.items.map((item) => `| ${item.queueId} | ${item.scenarioId} | ${item.disposition} | ${item.missingEvidenceIds.length} | ${item.nextAction} |`),
  '',
  '本队列仅用于静态证据整改；共享汇总、截图或候选登记不能授权 covered 或业务通过。',
  '',
].join('\n'));
return { status: 'completed' as const, outputPath: path.join(workspaceRoot, outputRelativePath), summary: report.summary };
}

/** A current static projection is separate from runtime readiness; file existence is insufficient. */
export function hasCurrentReverseScenarioEvidenceQueue(projectRoot: string): boolean {
  const workspaceRoot = path.resolve(projectRoot, '..');
  const input = readJsonEvidence(path.join(workspaceRoot, readinessRelativePath), isReverseScenarioReadiness);
  if (input.status !== 'available' || verifyProductCenterReverseScenarioSources(projectRoot, input.value).status !== 'current') return false;
  const expected = buildQueue(input.value);
  const queue = readJsonEvidence(path.join(workspaceRoot, outputRelativePath), (value): value is Record<string, unknown> =>
    object(value) && value.reportId === expected.reportId && value.staticGenerationStatus === 'completed'
    && value.status !== 'blocked' && fingerprint(value.source) === fingerprint(expected.source)
    && fingerprint(value.summary) === fingerprint(expected.summary) && fingerprint(value.items) === fingerprint(expected.items)
    && fingerprint(value.guardrails) === fingerprint(expected.guardrails));
  return queue.status === 'available';
}

if (require.main === module) {
  const result = generateReverseScenarioEvidenceQueue();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status === 'blocked') process.exitCode = 1;
}

export { buildQueue };
