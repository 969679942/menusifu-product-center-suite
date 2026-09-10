import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { registerEvidenceInvocation, claimEvidenceInvocation, readIndexedRunEvidence, readRunEvidenceLedger, type EvidenceInvocationIdentity } from '../../src/governance/run-evidence-index';
import { classifyFlowCompletion, isCompletedFlowRun, readFlowRunTerminalCaseIds } from '../../scripts/run-system-test-flow';
import { buildSystemTestExecutionResult } from '../../scripts/build-system-test-execution-result';
import { discoverCurrentPilotRunCandidates } from '../../scripts/build-platform-readiness';
import { buildSystemTestEvidenceRuntimeFingerprint } from '../../src/automation/system-test/system-test-contract';
import { recoverSystemTestEvidenceLedgerFromAllure } from '../../src/utils/system-test-allure-evidence-recovery';
import { accountExecutionAttempts, type ExecutionAttempt } from '../../src/governance/execution-attempt-accounting';
import { fingerprintExecutionSelection } from '../../src/governance/execution-intent';

const identity = (): EvidenceInvocationIdentity => ({ runId: 'run-1', selectedCaseIds: ['CASE-A'],
  contractFingerprint: '1'.repeat(64), implementationFingerprint: '2'.repeat(64), executionCandidateFingerprint: '3'.repeat(64) });
function ledger(invocationId: string, status: 'passed' | 'failed') {
  const ids = identity();
  const attempts: ExecutionAttempt[] = [{ runId: ids.runId, caseId: 'CASE-A', testId: 'test-a', retry: 0, status,
    startedAt: '2026-09-08T00:00:00Z', durationMs: 20,
    receipt: { caseId: 'CASE-A', playwrightStatus: status, evidence: { status: status === 'passed' ? 'complete' : 'incomplete' } } }];
  const { latestAttempts: _latest, terminalAttempts, ...executionAccounting } = accountExecutionAttempts({ runId: ids.runId, selectedCaseIds: ids.selectedCaseIds, attempts });
  return { schemaVersion: '1.2.0', invocationId, ...ids, selectedFingerprint: fingerprintExecutionSelection(ids.selectedCaseIds), attempts,
    cases: terminalAttempts.map((item) => item.receipt), executionAccounting,
    summary: { selected: 1, executed: 1, evidenceComplete: status === 'passed' ? 1 : 0, evidenceIncomplete: status === 'passed' ? 0 : 1 } };
}
function isolated(run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-evidence-index-'));
  try { run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('同runId多次调用独立保存，新调用缺报告或失败不得回退旧成功', () => isolated((root) => {
  const first = registerEvidenceInvocation(root, identity());
  const owner1 = claimEvidenceInvocation(root, first.invocationId, identity());
  owner1.publish(ledger(first.invocationId, 'passed'), true);
  const original = readIndexedRunEvidence(root, 'run-1');
  expect(original.status).toBe('available');
  const second = registerEvidenceInvocation(root, identity());
  expect(readIndexedRunEvidence(root, 'run-1')).toEqual({ status: 'incomplete', reason: 'CURRENT_INVOCATION_REPORT_MISSING' });
  const owner2 = claimEvidenceInvocation(root, second.invocationId, identity());
  owner2.publish(ledger(second.invocationId, 'failed'), true);
  const current = readIndexedRunEvidence(root, 'run-1');
  expect(current.status).toBe('available');
  if (current.status === 'available' && original.status === 'available') {
    expect(current.history.map((item) => item.invocationId)).toEqual([first.invocationId, second.invocationId]);
    expect(current.history[0].ledgerHash).toBe(original.ledgerHash);
    expect(current.ledger.cases).toEqual(ledger(second.invocationId, 'failed').cases);
  }
  expect(readIndexedRunEvidence(root, 'run-1', first.invocationId).status).toBe('incomplete');
  expect(() => claimEvidenceInvocation(root, second.invocationId, identity())).toThrow();
  expect(() => owner2.publish(ledger(second.invocationId, 'passed'), true)).toThrow('EVIDENCE_INVOCATION_ALREADY_FINAL');
}));

test('旧进程迟到写入保留自己的快照，但不得覆盖新进程当前视图', () => isolated((root) => {
  const first = registerEvidenceInvocation(root, identity());
  const owner1 = claimEvidenceInvocation(root, first.invocationId, identity());
  owner1.publish(ledger(first.invocationId, 'passed'), false);
  const second = registerEvidenceInvocation(root, identity());
  claimEvidenceInvocation(root, second.invocationId, identity()).publish(ledger(second.invocationId, 'failed'), true);
  owner1.publish(ledger(first.invocationId, 'passed'), true);
  const current = readIndexedRunEvidence(root, 'run-1');
  expect(current.status === 'available' && current.invocationId).toBe(second.invocationId);
}));

test('当前视图漂移、历史快照损坏及删除声明均使索引验证失败', () => isolated((root) => {
  const first = registerEvidenceInvocation(root, identity());
  claimEvidenceInvocation(root, first.invocationId, identity()).publish(ledger(first.invocationId, 'passed'), true);
  const second = registerEvidenceInvocation(root, identity());
  claimEvidenceInvocation(root, second.invocationId, identity()).publish(ledger(second.invocationId, 'failed'), true);
  const view = path.join(root, 'evidence-ledger.json'); const bytes = fs.readFileSync(view);
  fs.writeFileSync(view, '{}');
  expect(readIndexedRunEvidence(root, 'run-1')).toEqual({ status: 'incomplete', reason: 'EVIDENCE_LATEST_VIEW_MISMATCH' });
  fs.writeFileSync(view, bytes);
  const head = JSON.parse(fs.readFileSync(path.join(root, `evidence-invocations/${first.invocationId}/head.json`), 'utf8'));
  const snapshot = path.join(root, head.ledgerSnapshot); const before = fs.readFileSync(snapshot);
  fs.writeFileSync(snapshot, '{}');
  expect(readIndexedRunEvidence(root, 'run-1')).toEqual({ status: 'incomplete', reason: 'INDEXED_LEDGER_HASH_MISMATCH' });
  fs.writeFileSync(snapshot, before);
  fs.unlinkSync(path.join(root, `evidence-invocations/${first.invocationId}/declaration.json`));
  expect(readIndexedRunEvidence(root, 'run-1').status).toBe('incomplete');
}));

test('调用身份不能变更选择集，敏感源正文不得写入快照或诊断', () => isolated((root) => {
  const entry = registerEvidenceInvocation(root, identity());
  expect(() => claimEvidenceInvocation(root, entry.invocationId, { ...identity(), selectedCaseIds: ['OTHER'] })).toThrow('EVIDENCE_INVOCATION_IDENTITY_MISMATCH');
  const owner = claimEvidenceInvocation(root, entry.invocationId, identity());
  expect(() => owner.publish({ ...ledger(entry.invocationId, 'passed'), password: 'contract-secret-marker' }, true)).toThrow('EVIDENCE_SENSITIVE_CONTENT_REJECTED');
  expect(fs.existsSync(path.join(root, 'evidence-ledger.json'))).toBe(false);
  for (const file of fs.readdirSync(path.join(root, '.artifact-history/objects'))) {
    expect(fs.readFileSync(path.join(root, '.artifact-history/objects', file), 'utf8')).not.toContain('contract-secret-marker');
  }
  expect(readIndexedRunEvidence(root, 'wrong-run').status).toBe('incomplete');
}));

test('流程完成、恢复和结果导出拒绝缺失的新调用及陈旧报告绑定', () => isolated((root) => {
  const input = { rootDir: root, systemId: 'demo', runId: 'run-1' };
  const runRoot = path.join(root, 'output/system-test/demo/run-1');
  const file = path.join(runRoot, 'evidence-ledger.json');
  const entry = registerEvidenceInvocation(runRoot, identity());
  const owner = claimEvidenceInvocation(runRoot, entry.invocationId, identity());
  owner.publish(ledger(entry.invocationId, 'passed'), false);
  expect(() => readRunEvidenceLedger(file, 'run-1', { requireFinal: true })).toThrow('EVIDENCE_INVOCATION_NOT_FINAL');
  owner.publish(ledger(entry.invocationId, 'passed'), true);
  const indexed = readIndexedRunEvidence(runRoot, 'run-1');
  if (indexed.status !== 'available') throw new Error('FIXTURE_INDEX_UNAVAILABLE');
  const report = { runId: 'run-1', failureCategories: [], evidenceInvocation: {
    invocationId: entry.invocationId, snapshotHash: indexed.ledgerHash, indexStatus: 'available',
  } };
  const reportPath = path.join(runRoot, 'run-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report));
  expect(classifyFlowCompletion({ ...input, exitCode: 0 }).status).toBe('executed');
  expect(isCompletedFlowRun(input)).toBe(true);
  expect(readFlowRunTerminalCaseIds(input)).toEqual(['CASE-A']);
  const manifest = { system: {}, sources: { ruleLedgerFingerprint: 'rules', adapterCatalogFingerprint: 'adapters', recipeCollectionFingerprint: 'recipes' } };
  const contract = { system: {}, summary: { mutation: 0 }, sourceFingerprints: { rules: 'rules', adapters: 'adapters', recipes: 'recipes',
    evidenceRuntime: buildSystemTestEvidenceRuntimeFingerprint() } };
  fs.writeFileSync(path.join(runRoot, 'contract.json'), JSON.stringify(contract));
  const candidates = () => discoverCurrentPilotRunCandidates(path.dirname(runRoot),
    manifest as Parameters<typeof discoverCurrentPilotRunCandidates>[1], contract as Parameters<typeof discoverCurrentPilotRunCandidates>[2]);
  expect(candidates()).toHaveLength(1);
  expect(() => recoverSystemTestEvidenceLedgerFromAllure({ runDir: runRoot, workspaceRoot: root,
    executionIndexPath: path.join(root, 'execution-index.json'), overwrite: true })).toThrow('INDEXED_RUN_LEGACY_RECOVERY_FORBIDDEN');
  fs.writeFileSync(reportPath, JSON.stringify({ ...report, evidenceInvocation: { ...report.evidenceInvocation, snapshotHash: '0'.repeat(64) } }));
  expect(classifyFlowCompletion({ ...input, exitCode: 0 }).status).toBe('blocked');
  fs.writeFileSync(reportPath, JSON.stringify(report));
  registerEvidenceInvocation(runRoot, identity());
  expect(classifyFlowCompletion({ ...input, exitCode: 0 }).status).toBe('blocked');
  expect(isCompletedFlowRun(input)).toBe(false);
  expect(readFlowRunTerminalCaseIds(input)).toEqual([]);
  expect(candidates()).toEqual([]);
  const planPath = path.join(root, 'plan.json'); fs.writeFileSync(planPath, '{}');
  const resultPath = path.join(root, 'result.json');
  expect(() => buildSystemTestExecutionResult({ planPath, runReportPath: reportPath, evidenceLedgerPath: file,
    unlandedPath: path.join(root, 'unused.json'), outputJsonPath: resultPath, outputMarkdownPath: path.join(root, 'result.md'),
    executionIndexPath: path.join(root, 'execution-index.json'),
  })).toThrow('CURRENT_INVOCATION_REPORT_MISSING');
  expect(fs.existsSync(resultPath)).toBe(false);
  expect(fs.existsSync(path.join(root, 'execution-index.json'))).toBe(false);
}));

test('索引锁竞争必须停止发布，不覆盖已有视图或移除其他进程锁', () => isolated((root) => {
  const entry = registerEvidenceInvocation(root, identity());
  const owner = claimEvidenceInvocation(root, entry.invocationId, identity());
  owner.publish(ledger(entry.invocationId, 'passed'), false);
  const file = path.join(root, 'evidence-ledger.json'); const bytes = fs.readFileSync(file);
  const lock = path.join(root, 'evidence-invocations/register.lock'); fs.writeFileSync(lock, 'synthetic-lock');
  expect(() => registerEvidenceInvocation(root, identity())).toThrow();
  expect(() => owner.publish(ledger(entry.invocationId, 'failed'), true)).toThrow();
  expect(fs.readFileSync(file)).toEqual(bytes);
  expect(fs.readFileSync(lock, 'utf8')).toBe('synthetic-lock');
  fs.unlinkSync(lock);
  owner.publish(ledger(entry.invocationId, 'failed'), true);
  expect(readIndexedRunEvidence(root, 'run-1').status).toBe('available');
}));
