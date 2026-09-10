import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { auditProductCenterLifecycleEfficiency } from '../../scripts/audit-product-center-lifecycle-efficiency';
import { LIFECYCLE_TELEMETRY_FIELDS } from '../../../Test Automation Platform/src/governance/lifecycle-telemetry-validation';
import { indexedInvocationFixture, syntheticAttempt } from '../../../Test Automation Platform/tests/helpers/indexed-run-fixture';
import { registerEvidenceInvocation } from '../../../Test Automation Platform/src/governance/run-evidence-index';

function fixture(stages = ['stage-a', 'stage-b']) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-efficiency-'));
  const projectRoot = path.join(workspaceRoot, 'project');
  fs.mkdirSync(projectRoot);
  const directory = path.join(workspaceRoot, 'deliverables/system-test-platform');
  fs.mkdirSync(directory, { recursive: true });
  const checklistPath = path.join(directory, 'product-center-complete-lifecycle-efficiency-checklist.json');
  fs.writeFileSync(checklistPath, JSON.stringify({ stages, requiredTelemetry: LIFECYCLE_TELEMETRY_FIELDS }));
  const artifactSpecs = stages.map((stageId) => ({ stageId, role: '模拟阶段', relativePath: `${stageId}.json` }));
  const write = (stage: string, value: unknown) => fs.writeFileSync(path.join(projectRoot, `${stage}.json`), typeof value === 'string' ? value : JSON.stringify(value));
  const audit = () => auditProductCenterLifecycleEfficiency({ projectRoot, workspaceRoot, artifactSpecs });
  const cleanup = () => fs.rmSync(workspaceRoot, { recursive: true, force: true });
  return { projectRoot, checklistPath, write, audit, cleanup };
}
const valid = () => ({ startedAt: '2026-09-08T00:00:00Z', completedAt: '2026-09-08T00:00:01Z', durationMs: 1000, inputFingerprint: 'in', outputFingerprint: 'out', waitMs: 0, retryCount: 0, blockedReason: null, businessExecutionStarted: false, artifactPath: 'stage-b.json' });

test('损坏输入不能中断其他独立阶段审计，也不得保留秘密原文', () => {
  const f = fixture();
  try {
    f.write('stage-a', '{"password":"synthetic-do-not-persist"');
    f.write('stage-b', valid());
    const { report, outputPath, markdownPath } = f.audit();
    expect(report.status).toBe('incomplete');
    expect(report.stages.map((stage) => stage.status)).toEqual(['evidence-invalid', 'complete']);
    expect(report.summary.artifactInvalidStageCount).toBe(1);
    expect(report.inputFindings).toEqual([{ stageId: 'stage-a', status: 'invalid', reason: 'json-invalid' }]);
    expect(fs.readFileSync(outputPath, 'utf8') + fs.readFileSync(markdownPath, 'utf8')).not.toContain('synthetic-do-not-persist');
    expect(report.guardrails).toMatchObject({ businessExecutionStarted: false, liveBusinessWritesEnabled: false, existingPassedCasesInvalidated: false });
  } finally { f.cleanup(); }
});

test('字段存在但空值或类型错误必须形成遥测缺口', () => {
  const f = fixture(['stage-a']);
  try {
    f.write('stage-a', Object.fromEntries(LIFECYCLE_TELEMETRY_FIELDS.map((key) => [key, null])));
    const report = f.audit().report;
    expect(report.status).toBe('incomplete');
    expect(report.summary.telemetryGapCount).toBe(9);
    expect(report.stages[0].invalidTelemetry).toHaveLength(9);
    f.write('stage-a', valid());
    expect(f.audit().report.status).toBe('complete');
  } finally { f.cleanup(); }
});

test('缺失、损坏和空清单必须保持未完成，禁止空集合通过', () => {
  const f = fixture();
  try {
    for (const value of [{ stages: [], requiredTelemetry: LIFECYCLE_TELEMETRY_FIELDS }, { stages: ['stage-a'], requiredTelemetry: [] }, '{broken']) {
      fs.writeFileSync(f.checklistPath, typeof value === 'string' ? value : JSON.stringify(value));
      expect(f.audit().report.status).toBe('incomplete');
      expect(f.audit().report.inputFindings[0].stageId).toBe('checklist');
    }
    fs.unlinkSync(f.checklistPath);
    expect(f.audit().report.inputFindings[0].status).toBe('missing');
  } finally { f.cleanup(); }
});

test('不可读产物与敏感字段只记录安全诊断，缺失产物计数保持独立', () => {
  const f = fixture(['stage-a', 'stage-b', 'stage-c']);
  try {
    fs.mkdirSync(path.join(f.projectRoot, 'stage-a.json'));
    f.write('stage-b', { ...valid(), nested: { accessToken: 'synthetic-do-not-persist' } });
    const { report, outputPath } = f.audit();
    expect(report.summary.artifactMissingStageCount).toBe(1);
    expect(report.summary.artifactInvalidStageCount).toBe(1);
    expect(report.sensitiveFindings).toEqual([{ stageId: 'stage-b', key: 'sensitive-field' }]);
    expect(report.status).toBe('incomplete');
    expect(fs.readFileSync(outputPath, 'utf8')).not.toContain('synthetic-do-not-persist');
  } finally { f.cleanup(); }
});

test('项目报告不得把缺失或损坏的整改遥测转成零运行成本', () => {
  const f = fixture(['stage-a']);
  try {
    f.write('stage-a', valid());
    expect(f.audit().report.repairTelemetry).toMatchObject({ evidenceStatus: 'missing',
      browserStarts: null, avoidableDurationMs: null, currentRunCountsAvailable: false });
    const ledger = path.join(f.projectRoot, 'output/system-test-repair/product-center/repair-execution-ledger.jsonl');
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    fs.writeFileSync(ledger, '{"password":"synthetic-must-not-persist",invalid');
    const { report, outputPath } = f.audit();
    expect(report.repairTelemetry.evidenceStatus).toBe('invalid');
    expect(report.repairTelemetry.eventCount).toBeNull();
    expect(fs.readFileSync(outputPath, 'utf8')).not.toContain('synthetic-must-not-persist');
  } finally { f.cleanup(); }
});

test('项目效率审计从登记系统索引读取跨调用统计，主视图或最新调用缺失均保留未知', () => {
  const f = fixture(['stage-a']);
  try {
    f.write('stage-a', valid());
    const manifestPath = path.join(f.projectRoot, 'systems/fixture-system/manifest.json');
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ system: { systemId: 'fixture-system' } }));
    const runRoot = path.join(f.projectRoot, 'output/system-test/fixture-system/run-1');
    indexedInvocationFixture(runRoot, ['A'], [syntheticAttempt('A', 0, 100)]);
    const second = indexedInvocationFixture(runRoot, ['A'], [syntheticAttempt('A', 200, 50, 'failed')]);
    fs.writeFileSync(path.join(runRoot, '../latest-run-state.json'), JSON.stringify({ systemId: 'fixture-system', runId: 'run-1', status: 'failed' }));
    const observed = f.audit().report.runAttemptTelemetry;
    expect(observed.status).toBe('available');
    expect(observed.businessCurrentnessAsserted).toBe(false);
    expect(observed.runs[0].telemetry.totals).toMatchObject({ actualAttemptCount: 2, uniqueExecutedCaseCount: 1, testAttemptWorkMs: 150 });
    expect(observed.runs[0].telemetry.businessPassAuthorized).toBe(false);
    const file = path.join(runRoot, 'evidence-ledger.json'); const bytes = fs.readFileSync(file);
    fs.writeFileSync(file, '{}');
    expect(f.audit().report.runAttemptTelemetry.runs[0].telemetry.totals.actualAttemptCount).toBeNull();
    fs.writeFileSync(file, bytes);
    registerEvidenceInvocation(runRoot, second.identity);
    const missing = f.audit().report.runAttemptTelemetry;
    expect(missing.status).toBe('incomplete');
    expect(missing.runs[0].telemetry.reasons).toEqual(['CURRENT_INVOCATION_REPORT_MISSING']);
    expect(missing.runs[0].telemetry.totals.actualAttemptCount).toBeNull();
    expect(missing.runs[0].telemetry.runnerWallMs).toBeNull();
  } finally { f.cleanup(); }
});

test('损坏或越界的运行登记不得泄漏输入，也不枚举历史目录补数', () => {
  const f = fixture(['stage-a']);
  try {
    f.write('stage-a', valid());
    const manifest = path.join(f.projectRoot, 'systems/fixture-system/manifest.json');
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify({ system: { systemId: '../escape' }, password: 'synthetic-private' }));
    const { report, outputPath } = f.audit();
    expect(report.runAttemptTelemetry.status).toBe('incomplete');
    expect(report.runAttemptTelemetry.runs).toEqual([]);
    expect(report.runAttemptTelemetry.findings[0].reason).toBe('SYSTEM_MANIFEST_UNAVAILABLE');
    expect(fs.readFileSync(outputPath, 'utf8')).not.toContain('synthetic-private');
  } finally { f.cleanup(); }
});
