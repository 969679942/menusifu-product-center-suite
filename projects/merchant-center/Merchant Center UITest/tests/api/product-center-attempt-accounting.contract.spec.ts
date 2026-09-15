import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { accountExecutionAttempts, type ExecutionAttempt } from '../../../Test Automation Platform/src/governance/execution-attempt-accounting';
import { fingerprintExecutionSelection } from '../../../Test Automation Platform/src/governance/execution-intent';
import { registerEvidenceInvocation, claimEvidenceInvocation } from '../../../Test Automation Platform/src/governance/run-evidence-index';
import { readIndexedRunEvidence } from '../../../Test Automation Platform/src/governance/run-evidence-index';
import { indexedInvocationFixture, syntheticAttempt } from '../../../Test Automation Platform/tests/helpers/indexed-run-fixture';
import { resolveProductCenterSeasoningTerminalCaseIds } from '../../adapters/product-center/product-center-seasoning-terminal-receipts';

test('商品适配器重新验证当前逐尝试投影，旧成功不能覆盖新跳过', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-attempt-accounting-'));
  try {
    const selectedCaseIds = ['CASE-A', 'CASE-B'];
    const currentCases = selectedCaseIds.map((caseId) => ({ caseId, caseFingerprint: `case-${caseId}`, implementationFingerprint: `impl-${caseId}` }));
    const attempt = (caseId: string, retry: number, status: ExecutionAttempt['status']): ExecutionAttempt => ({ runId: 'run-1', caseId, testId: caseId,
      retry, status, startedAt: new Date(retry * 100).toISOString(), durationMs: 50,
      receipt: { ...currentCases.find((item) => item.caseId === caseId), playwrightStatus: status, evidence: { status: 'incomplete' } } });
    const attempts = [attempt('CASE-A', 0, 'passed'), attempt('CASE-A', 1, 'skipped'), attempt('CASE-B', 0, 'failed')];
    const accounting = accountExecutionAttempts({ runId: 'run-1', selectedCaseIds, attempts });
    const { latestAttempts: _latest, terminalAttempts, ...executionAccounting } = accounting;
    const ledger = { schemaVersion: '1.1.0', runId: 'run-1', selectedCaseIds, selectedFingerprint: fingerprintExecutionSelection(selectedCaseIds),
      attempts, executionAccounting, cases: terminalAttempts.map((item) => item.receipt),
      summary: { selected: 2, executed: 2, evidenceComplete: 0, evidenceIncomplete: 2 } };
    const checkpoint = path.join(root, 'output/system-test-flow/merchant-center-product-center-seasoning/checkpoint.json');
    const file = path.join(root, 'output/system-test/merchant-center-product-center-seasoning/run-1/evidence-ledger.json');
    fs.mkdirSync(path.dirname(checkpoint), { recursive: true }); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(checkpoint, JSON.stringify({ flowId: 'flow-1', selectedCaseIds, runIds: ['run-1'] }));
    const resolve = () => resolveProductCenterSeasoningTerminalCaseIds({ projectRoot: root, flowId: 'flow-1', selectedCaseIds, currentCases });
    fs.writeFileSync(file, JSON.stringify(ledger));
    expect(resolve()).toEqual(['CASE-B']);
    fs.writeFileSync(file, JSON.stringify({ ...ledger, cases: [attempts[0].receipt, ...ledger.cases] }));
    expect(resolve()).toEqual([]);
    fs.writeFileSync(file, JSON.stringify({ ...ledger, runId: 'old-run' }));
    expect(resolve()).toEqual([]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('商品适配器消费索引快照，新调用缺报告或当前视图漂移均拒绝旧终态', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-indexed-attempt-'));
  try {
    const selectedCaseIds = ['CASE-A'];
    const currentCases = [{ caseId: 'CASE-A', caseFingerprint: 'case-a', implementationFingerprint: 'impl-a' }];
    const identity = { runId: 'run-1', selectedCaseIds, contractFingerprint: '1'.repeat(64),
      implementationFingerprint: '2'.repeat(64), executionCandidateFingerprint: '3'.repeat(64) };
    const runRoot = path.join(root, 'output/system-test/merchant-center-product-center-seasoning/run-1');
    const invocation = registerEvidenceInvocation(runRoot, identity);
    const attempts: ExecutionAttempt[] = [{ runId: 'run-1', caseId: 'CASE-A', testId: 'test-a', retry: 0, status: 'failed',
      startedAt: '2026-09-08T00:00:00Z', durationMs: 10,
      receipt: { ...currentCases[0], playwrightStatus: 'failed', evidence: { status: 'incomplete' } } }];
    const { latestAttempts: _latest, terminalAttempts, ...executionAccounting } = accountExecutionAttempts({ runId: 'run-1', selectedCaseIds, attempts });
    claimEvidenceInvocation(runRoot, invocation.invocationId, identity).publish({ schemaVersion: '1.2.0', ...identity,
      invocationId: invocation.invocationId, selectedFingerprint: fingerprintExecutionSelection(selectedCaseIds), attempts, executionAccounting,
      cases: terminalAttempts.map((item) => item.receipt), summary: { selected: 1, executed: 1, evidenceComplete: 0, evidenceIncomplete: 1 },
    }, true);
    const checkpoint = path.join(root, 'output/system-test-flow/merchant-center-product-center-seasoning/checkpoint.json');
    fs.mkdirSync(path.dirname(checkpoint), { recursive: true });
    fs.writeFileSync(checkpoint, JSON.stringify({ flowId: 'flow-1', selectedCaseIds, runIds: ['run-1'] }));
    const resolve = () => resolveProductCenterSeasoningTerminalCaseIds({ projectRoot: root, flowId: 'flow-1', selectedCaseIds, currentCases });
    expect(resolve()).toEqual(['CASE-A']);
    const file = path.join(runRoot, 'evidence-ledger.json'); const bytes = fs.readFileSync(file);
    fs.writeFileSync(file, '{}'); expect(resolve()).toEqual([]);
    fs.writeFileSync(file, bytes); expect(resolve()).toEqual(['CASE-A']);
    registerEvidenceInvocation(runRoot, identity); expect(resolve()).toEqual([]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('项目终态保留独立有效的本次执行事实，历史统计异常不得触发重复执行', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-current-observation-'));
  try {
    const selectedCaseIds = ['A'];
    const currentCases = [{ caseId: 'A', caseFingerprint: 'case-a', implementationFingerprint: 'impl-a' }];
    const runRoot = path.join(root, 'output/system-test/merchant-center-product-center-seasoning/run-1');
    indexedInvocationFixture(runRoot, selectedCaseIds, [syntheticAttempt('A', 0, 10, 'failed')]);
    const prior = readIndexedRunEvidence(runRoot, 'run-1');
    if (prior.status !== 'available') throw new Error('FIXTURE_INVALID');
    const attempt = syntheticAttempt('A', 100, 10);
    attempt.receipt = { ...attempt.receipt, ...currentCases[0] };
    indexedInvocationFixture(runRoot, selectedCaseIds, [attempt]);
    const checkpoint = path.join(root, 'output/system-test-flow/merchant-center-product-center-seasoning/checkpoint.json');
    fs.mkdirSync(path.dirname(checkpoint), { recursive: true });
    fs.writeFileSync(checkpoint, JSON.stringify({ flowId: 'flow-1', selectedCaseIds, runIds: ['run-1'] }));
    fs.writeFileSync(path.join(runRoot, `.artifact-history/objects/${prior.ledgerHash}.bin`), '{}');
    const resolve = () => resolveProductCenterSeasoningTerminalCaseIds({ projectRoot: root, flowId: 'flow-1', selectedCaseIds, currentCases });
    expect(resolve()).toEqual(['A']);
    expect(readIndexedRunEvidence(runRoot, 'run-1').status).toBe('incomplete');
    expect(resolveProductCenterSeasoningTerminalCaseIds({ projectRoot: root, flowId: 'flow-1', selectedCaseIds,
      currentCases: [{ ...currentCases[0], implementationFingerprint: 'new-impl' }] })).toEqual([]);
    fs.writeFileSync(path.join(runRoot, 'evidence-ledger.json'), '{}');
    expect(resolve()).toEqual([]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
