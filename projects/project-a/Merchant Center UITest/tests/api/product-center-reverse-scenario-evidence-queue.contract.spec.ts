import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { generateReverseScenarioEvidenceQueue, hasCurrentReverseScenarioEvidenceQueue, isReverseScenarioReadiness } from '../../scripts/build-product-center-reverse-scenario-evidence-queue';
import { generateProductCenterReverseScenarioReadiness } from '../../scripts/build-product-center-reverse-scenario-readiness';

const reportPath = path.resolve(__dirname, '../../../deliverables/test-plan-governance/product-center-reverse-scenario-evidence-queue-v1.json');

test('反向场景证据队列必须逐场景保留缺口并禁止静态登记授权执行', () => {
  expect(fs.existsSync(reportPath)).toBe(true);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    summary: { scenarioCount: number; executionEligible: number; awaitingEvidenceAndRuntime: number; awaitingRuntimeReceipt: number };
    guardrails: { businessExecutionStarted: boolean; liveBusinessWritesEnabled: boolean; candidateCasesExecutionEligible: boolean; aggregateEvidenceAuthorizesCovered: boolean };
    items: Array<{ scenarioId: string; disposition: string; executionEligible: boolean; businessExecutionStarted: boolean; blockingConditions: string[]; consumedEvidenceCount: number; declaredEvidenceCount: number }>;
  };
  expect(report.items).toHaveLength(report.summary.scenarioCount);
  expect(new Set(report.items.map((item) => item.scenarioId)).size).toBe(report.items.length);
  expect(report.summary.executionEligible).toBe(0);
  expect(report.summary.awaitingEvidenceAndRuntime + report.summary.awaitingRuntimeReceipt).toBe(report.summary.scenarioCount);
  expect(report.guardrails).toMatchObject({
    businessExecutionStarted: false,
    liveBusinessWritesEnabled: false,
    candidateCasesExecutionEligible: false,
    aggregateEvidenceAuthorizesCovered: false,
  });
  for (const item of report.items) {
    expect(item.executionEligible).toBe(false);
    expect(item.businessExecutionStarted).toBe(false);
    expect(item.blockingConditions).toEqual(expect.arrayContaining(['standard-operation-receipt', 'assertion-receipt', 'cleanup-evidence', 'execution-grant']));
    expect(item.consumedEvidenceCount).toBeLessThanOrEqual(item.declaredEvidenceCount);
  }
});

const inputRelative = 'deliverables/test-plan-governance/product-center-reverse-scenario-readiness-v1.json';
const queueRelative = 'deliverables/test-plan-governance/product-center-reverse-scenario-evidence-queue-v1.json';
const sample = (inputFingerprints: unknown = []) => ({ schemaVersion: '1.0.0', reportId: 'product-center-reverse-scenario-readiness-v1', inputFingerprints,
  executionScope: 'static-and-contract-only', summary: { scenarioCount: 1, partial: 0, missing: 1, covered: 0 },
  scenarios: [{ scenarioId: 'RS-TEST-001', requirementIds: ['FR-TEST'], status: 'missing', linkedCaseIds: [],
    evidenceRefs: [], evidenceItems: [], consumedEvidenceCount: 0, declaredEvidenceCount: 0,
    declaredAggregateRefs: [], blockingConditions: ['标准运行收据'] }] });

function isolated(run: (workspace: string, project: string, fingerprints: unknown) => void) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'reverse-queue-contract-'));
  const project = path.join(workspace, 'project');
  fs.mkdirSync(project);
  fs.mkdirSync(path.dirname(path.join(workspace, inputRelative)), { recursive: true });
  try {
    const write = (relative: string, value: unknown) => { const file = path.join(workspace, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
    write('deliverables/test-plan-governance/process-reverse-scenario-catalog-v1.json', { schemaVersion: '1.0.0', catalogId: 'contract', ownerScope: 'public-process', scenarios: [{
      scenarioId: 'RS-TEST-001', requirementIds: ['FR-TEST'], title: '隔离场景', trigger: { event: 'read', scope: 'case', requiredEvidence: ['receipt'] },
      sourceRefs: ['source'], expectedResolutionActions: ['block-case'], mandatoryContracts: ['contract'], humanEscalationReasons: ['source-conflict'],
    }] });
    write('project/adapters/test-automation-platform/product-center-reverse-scenario-map-v1.json', { schemaVersion: '1.0.0', catalogId: 'contract', mappings: [] });
    write('deliverables/product-center-group/runtime-audit-v2.json', { schemaVersion: '2.0.0', evidenceInventory: [], corrections: [] });
    const readiness = generateProductCenterReverseScenarioReadiness(project);
    const fingerprints = JSON.parse(fs.readFileSync(readiness.outputPath, 'utf8')).inputFingerprints;
    fs.unlinkSync(readiness.outputPath);
    run(workspace, project, fingerprints);
  } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
}

test('空清单、重复场景、汇总漂移和无效输入不得变成静态完成', () => {
  expect(isReverseScenarioReadiness(sample())).toBe(true);
  const empty = sample(); empty.scenarios = []; empty.summary.scenarioCount = 0; empty.summary.missing = 0;
  expect(isReverseScenarioReadiness(empty)).toBe(false);
  const duplicate = sample(); duplicate.scenarios.push(duplicate.scenarios[0]); duplicate.summary.scenarioCount = 2; duplicate.summary.missing = 2;
  expect(isReverseScenarioReadiness(duplicate)).toBe(false);
  const wrong = sample(); wrong.summary.covered = 1;
  expect(isReverseScenarioReadiness(wrong)).toBe(false);
  const counts = sample(); counts.scenarios[0].consumedEvidenceCount = 1;
  expect(isReverseScenarioReadiness(counts)).toBe(false);
  expect(isReverseScenarioReadiness({ ...sample(), status: 'blocked' })).toBe(false);
});

test('输入缺失和损坏替换当前阻断状态，保留先前观察且不持久化源内容', () => isolated((workspace, project, fingerprints) => {
  const source = path.join(workspace, inputRelative);
  const output = path.join(workspace, queueRelative);
  expect(generateReverseScenarioEvidenceQueue(project).status).toBe('blocked');
  expect(JSON.parse(fs.readFileSync(output, 'utf8'))).toMatchObject({ inputStatus: 'missing', summary: null });
  expect(hasCurrentReverseScenarioEvidenceQueue(project)).toBe(false);
  fs.writeFileSync(source, JSON.stringify(sample(fingerprints)));
  expect(generateReverseScenarioEvidenceQueue(project).status).toBe('completed');
  const previous = fs.readFileSync(output);
  expect(hasCurrentReverseScenarioEvidenceQueue(project)).toBe(true);
  fs.writeFileSync(source, '{"password":"contract-sensitive-marker",');
  expect(generateReverseScenarioEvidenceQueue(project).status).toBe('blocked');
  expect(JSON.parse(fs.readFileSync(output, 'utf8'))).toMatchObject({ inputStatus: 'invalid', inputReason: 'json-invalid', summary: null });
  expect(hasCurrentReverseScenarioEvidenceQueue(project)).toBe(false);
  const hash = createHash('sha256').update(previous).digest('hex');
  expect(fs.readFileSync(path.join(workspace, '.artifact-history/objects', `${hash}.bin`)).equals(previous)).toBe(true);
  for (const name of fs.readdirSync(path.join(workspace, '.artifact-history/objects'))) {
    expect(fs.readFileSync(path.join(workspace, '.artifact-history/objects', name), 'utf8')).not.toContain('contract-sensitive-marker');
  }
  fs.writeFileSync(source, JSON.stringify(sample(fingerprints)));
  expect(generateReverseScenarioEvidenceQueue(project).status).toBe('completed');
  expect(hasCurrentReverseScenarioEvidenceQueue(project)).toBe(true);
}));

test('治理消费拒绝过时输入和被修改的队列，文件存在不证明本次完成', () => isolated((workspace, project, fingerprints) => {
  const source = path.join(workspace, inputRelative);
  const output = path.join(workspace, queueRelative);
  fs.writeFileSync(source, JSON.stringify(sample(fingerprints)));
  generateReverseScenarioEvidenceQueue(project);
  const alteredInput = sample(fingerprints); alteredInput.scenarios[0].requirementIds = ['FR-CHANGED'];
  fs.writeFileSync(source, JSON.stringify(alteredInput));
  expect(hasCurrentReverseScenarioEvidenceQueue(project)).toBe(false);
  generateReverseScenarioEvidenceQueue(project);
  expect(hasCurrentReverseScenarioEvidenceQueue(project)).toBe(true);
  const changed = JSON.parse(fs.readFileSync(output, 'utf8'));
  changed.summary.executionEligible = 1;
  fs.writeFileSync(output, JSON.stringify(changed));
  expect(hasCurrentReverseScenarioEvidenceQueue(project)).toBe(false);
  fs.writeFileSync(output, '{broken');
  expect(hasCurrentReverseScenarioEvidenceQueue(project)).toBe(false);
}));
