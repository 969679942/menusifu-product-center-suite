import fs from 'node:fs';
import path from 'node:path';
import { readJsonEvidence } from '../utils/json-evidence';
import { publishImmutableArtifact } from '../utils/immutable-artifact';
import { summarizeSystemTestRepairTelemetry } from '../../Test Automation Platform/src/automation/system-test/system-test-repair-telemetry';
import { LIFECYCLE_TELEMETRY_FIELDS, validateLifecycleTelemetry } from '../../Test Automation Platform/src/governance/lifecycle-telemetry-validation';
import { readProductCenterRunTelemetry } from '../adapters/product-center/product-center-run-telemetry';

type Checklist = { stages: string[]; requiredTelemetry: string[] };
export type ArtifactSpec = { stageId: string; role: string; relativePath: string };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const checklistValid = (value: unknown): value is Checklist => record(value)
  && Array.isArray(value.stages) && value.stages.length > 0
  && value.stages.every((stage) => typeof stage === 'string' && /^[a-z][a-z0-9-]*$/.test(stage))
  && new Set(value.stages).size === value.stages.length
  && Array.isArray(value.requiredTelemetry) && value.requiredTelemetry.length === LIFECYCLE_TELEMETRY_FIELDS.length
  && LIFECYCLE_TELEMETRY_FIELDS.every((field) => (value.requiredTelemetry as unknown[]).includes(field));

const defaultArtifactSpecs: ArtifactSpec[] = [
  { stageId: 'source-intake', role: '来源与资产索引', relativePath: 'output/product-center-item-213-conversion.json' },
  { stageId: 'technical-binding', role: '技术绑定缺口', relativePath: '../deliverables/product-center-audit/remaining-scenarios/product-center-remaining-technical-binding-gap.json' },
  { stageId: 'environment-readiness', role: '项目 readiness', relativePath: 'deliverables/system-test-platform/readiness.json' },
  { stageId: 'execution-intent', role: '执行意图/选择集', relativePath: 'output/execution/product-center-execution-intent.json' },
  { stageId: 'queue-and-lock', role: '治理执行队列', relativePath: '../deliverables/test-plan-governance/product-center-governance-execution-task-queue-v1.json' },
  { stageId: 'receipt-evidence', role: '证据闭环预检', relativePath: '../deliverables/test-plan-governance/product-center-evidence-closure-preflight.json' },
  { stageId: 'failure-analysis', role: '失败分析', relativePath: 'output/governance/product-center-failure-analysis.json' },
  { stageId: 'governance-queue', role: '治理队列摘要', relativePath: 'output/governance/product-center-blocker-summary.json' },
  { stageId: 'ci-jenkins-feedback', role: 'Git/Jenkins 审计', relativePath: 'output/governance/product-center-git-jenkins-integration-audit.json' },
  { stageId: 'status-release-audit', role: '最终状态', relativePath: 'output/product-center-item-final-status.json' },
];

export function auditProductCenterLifecycleEfficiency(options: {
  projectRoot?: string; workspaceRoot?: string; artifactSpecs?: ArtifactSpec[];
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.join(__dirname, '..'));
  const workspaceRoot = path.resolve(options.workspaceRoot ?? path.join(projectRoot, '..'));
  const checklistPath = path.join(workspaceRoot, 'deliverables/system-test-platform/product-center-complete-lifecycle-efficiency-checklist.json');
  const outputPath = path.join(workspaceRoot, 'deliverables/system-test-platform/product-center-lifecycle-efficiency-audit.json');
  const markdownPath = outputPath.replace(/\.json$/, '.md');
  const artifactSpecs = options.artifactSpecs ?? defaultArtifactSpecs;
  const repairTelemetryPath = 'output/system-test-repair/product-center/repair-execution-ledger.jsonl';
  const repairTelemetry = summarizeSystemTestRepairTelemetry(path.join(projectRoot, repairTelemetryPath));
  const checklist = readJsonEvidence(checklistPath, checklistValid);
  const inputFindings: Array<{ stageId: string; status: string; reason: string }> = [];
  const sensitiveFindings: Array<{ stageId: string; key: string }> = [];
  if (checklist.status !== 'available') inputFindings.push({ stageId: 'checklist', status: checklist.status, reason: checklist.reason });
  const stages = (checklist.status === 'available' ? checklist.value.stages : []).map((stageId) => {
    const spec = artifactSpecs.find((item) => item.stageId === stageId);
    const base = {
      stageId, role: spec?.role ?? '未映射阶段', artifactPath: spec?.relativePath.replaceAll('\\', '/') ?? null,
      artifactExists: false, telemetryPresent: [] as string[], missingTelemetry: [...LIFECYCLE_TELEMETRY_FIELDS] as string[], invalidTelemetry: [] as string[],
    };
    if (!spec) return { ...base, status: 'unmapped' };
    const evidence = readJsonEvidence(path.resolve(projectRoot, spec.relativePath), record);
    if (evidence.status !== 'available') {
      inputFindings.push({ stageId, status: evidence.status, reason: evidence.reason });
      return { ...base, artifactExists: evidence.status !== 'missing', status: evidence.status === 'missing' ? 'artifact-missing' : 'evidence-invalid' };
    }
    if (hasSensitiveField(evidence.value)) sensitiveFindings.push({ stageId, key: 'sensitive-field' });
    const validation = validateLifecycleTelemetry(evidence.value);
    return { ...base, ...validation, artifactExists: true, status: validation.status === 'complete' ? 'complete' : 'telemetry-incomplete' };
  });
  const report = {
    schemaVersion: '1.1.0', reportId: 'product-center-lifecycle-efficiency-audit', generatedAt: new Date().toISOString(), scope: 'report-only-static-efficiency-audit',
    source: { checklist: path.relative(workspaceRoot, checklistPath).replaceAll('\\', '/'), artifactSpecs },
    summary: {
      stageCount: stages.length, mappedStageCount: stages.filter((stage) => stage.status !== 'unmapped').length,
      artifactPresentCount: stages.filter((stage) => stage.artifactExists).length,
      telemetryCompleteStageCount: stages.filter((stage) => stage.status === 'complete').length,
      artifactMissingStageCount: stages.filter((stage) => stage.status === 'artifact-missing').length,
      artifactInvalidStageCount: stages.filter((stage) => stage.status === 'evidence-invalid').length,
      telemetryGapCount: stages.reduce((total, stage) => total + stage.missingTelemetry.length + stage.invalidTelemetry.length, 0),
      inputFindingCount: inputFindings.length,
    },
    status: stages.length > 0 && stages.every((stage) => stage.status === 'complete') && inputFindings.length === 0 && sensitiveFindings.length === 0 ? 'complete' as const : 'incomplete' as const,
    stages, inputFindings, sensitiveFindings,
    repairTelemetry: { artifactPath: repairTelemetryPath, ...repairTelemetry },
    runAttemptTelemetry: readProductCenterRunTelemetry(projectRoot),
    guardrails: { businessExecutionStarted: false, liveBusinessWritesEnabled: false, existingPassedCasesInvalidated: false, secretsPersisted: false, missingTelemetryCannotAuthorizePass: true, structuralTelemetryCannotAuthorizeBusinessPass: true },
    nextActions: ['按阶段补齐或修复当前输入证据，未映射阶段仍保持未完成。', '真实运行中采集耗时和指纹；本报告不以文件时间戳替代运行遥测，不授权业务通过。'],
  };
  for (const [file, content] of [[outputPath, `${JSON.stringify(report, null, 2)}\n`], [markdownPath, renderMarkdown(report)]]) {
    publishImmutableArtifact({ outputRoot: workspaceRoot, relativePath: path.relative(workspaceRoot, file),
      content, reason: 'refresh-lifecycle-efficiency-observation' });
  }
  return { outputPath, markdownPath, report };
}

function hasSensitiveField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSensitiveField);
  if (!record(value)) return false;
  return Object.entries(value).some(([key, child]) => /^(password|accesstoken|refreshtoken|authorization|cookie|cookies|secret|storagestate)$/i.test(key.replace(/[-_]/g, '')) || hasSensitiveField(child));
}

function renderMarkdown(value: ReturnType<typeof auditProductCenterLifecycleEfficiency>['report']): string {
  return ['# 商品中心全生命周期效率审计', '', `状态：${value.status}`, `阶段：${value.summary.stageCount}；已找到产物：${value.summary.artifactPresentCount}；完整遥测阶段：${value.summary.telemetryCompleteStageCount}；遥测缺口：${value.summary.telemetryGapCount}；输入问题：${value.summary.inputFindingCount}`, '',
    '| 阶段 | 产物 | 状态 | 缺失遥测 | 无效遥测 |', '| --- | --- | --- | --- | --- |',
    ...value.stages.map((stage) => `| ${stage.stageId} | ${stage.artifactPath ?? '缺失'} | ${stage.status} | ${stage.missingTelemetry.join(', ') || '无'} | ${stage.invalidTelemetry.join(', ') || '无'} |`), '',
    ...value.inputFindings.map((finding) => `输入问题：${finding.stageId} / ${finding.status} / ${finding.reason}`),
    ...value.sensitiveFindings.map((finding) => `敏感字段：${finding.stageId} / ${finding.key}`), '',
    `运行尝试索引观察：${value.runAttemptTelemetry.status}；该状态不证明业务通过或发布适用性。`,
    ...value.runAttemptTelemetry.runs.map((run) => `运行 ${run.systemId}/${run.runId}：${run.telemetry.coverageStatus}；总尝试 ${run.telemetry.totals.actualAttemptCount ?? '未知'}；已观察尝试 ${run.telemetry.observed.actualAttemptCount ?? '未知'}。`),
    '本报告为 report-only 静态审计，不启动业务执行，不用文件时间戳替代真实运行遥测。', ''].join('\n');
}

if (require.main === module) {
  const { outputPath, markdownPath, report } = auditProductCenterLifecycleEfficiency();
  process.stdout.write(`${JSON.stringify({ outputPath, markdownPath, status: report.status, summary: report.summary })}\n`);
}
