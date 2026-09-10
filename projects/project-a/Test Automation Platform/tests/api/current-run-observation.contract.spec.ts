import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { indexedInvocationFixture, syntheticAttempt } from '../helpers/indexed-run-fixture';
import { readCurrentIndexedRunObservation, readIndexedRunEvidence, readRunEvidenceLedger, registerEvidenceInvocation } from '../../src/governance/run-evidence-index';
import { readSystemTestEvidenceLedgerReceipts } from '../../src/utils/system-test-evidence-ledger-receipt';
import { classifyFlowCompletion, isCompletedFlowRun, readFlowRunTerminalCaseIds, resolveFlowCompletionExitCode } from '../../scripts/run-system-test-flow';
import { buildSystemTestFailureDiagnosticDocument, buildSystemTestDiagnosticWorkQueue } from '../../src/automation/system-test/system-test-diagnostics';

test('历史快照损坏不抹去本次终态，也不能取得严格通过资格或让flow退出零', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'current-run-observation-'));
  const input = { rootDir: root, systemId: 'fixture', runId: 'run-1' };
  const runRoot = path.join(root, 'output/system-test/fixture/run-1');
  try {
    indexedInvocationFixture(runRoot, ['A'], [syntheticAttempt('A', 0, 10, 'failed')]);
    const original = readIndexedRunEvidence(runRoot, 'run-1');
    if (original.status !== 'available') throw new Error('FIXTURE_INVALID');
    const latest = indexedInvocationFixture(runRoot, ['A'], [syntheticAttempt('A', 100, 10)]);
    const current = readCurrentIndexedRunObservation(runRoot, 'run-1');
    if (current.status !== 'available') throw new Error('FIXTURE_INVALID');
    fs.writeFileSync(path.join(runRoot, 'run-report.json'), JSON.stringify({ runId: 'run-1', exitCode: 0, evidenceInvocation: {
      invocationId: latest.entry.invocationId, snapshotHash: current.ledgerHash, indexStatus: 'available',
    } }));
    fs.writeFileSync(path.join(runRoot, `.artifact-history/objects/${original.ledgerHash}.bin`), '{}');
    expect(readIndexedRunEvidence(runRoot, 'run-1').status).toBe('incomplete');
    const observed = readCurrentIndexedRunObservation(runRoot, 'run-1');
    expect(observed).toMatchObject({ status: 'available', historicalEvidenceFinding: 'INDEXED_LEDGER_HASH_MISMATCH', businessPassAuthorized: false });
    const completion = classifyFlowCompletion({ ...input, exitCode: 0 });
    expect(completion.status).toBe('completed-with-findings');
    expect(resolveFlowCompletionExitCode(0, completion.status)).toBe(2);
    expect(isCompletedFlowRun(input)).toBe(true);
    expect(readFlowRunTerminalCaseIds(input)).toEqual(['A']);
    expect(() => readRunEvidenceLedger(path.join(runRoot, 'evidence-ledger.json'), 'run-1')).toThrow('INDEXED_LEDGER_HASH_MISMATCH');
    const imported = readSystemTestEvidenceLedgerReceipts({ ledgerPath: path.join(runRoot, 'evidence-ledger.json'),
      contractPath: path.join(runRoot, 'unused-contract.json'), workspaceRoot: root, runId: 'run-1', expectedCaseIds: ['A'], expectedSystemId: 'fixture' });
    expect(imported.records).toEqual([]);
    expect(imported.diagnostics).toContain('INDEXED_LEDGER_HASH_MISMATCH');
    const diagnostic = buildSystemTestFailureDiagnosticDocument({ outputDir: runRoot, systemId: 'fixture', runId: 'run-1',
      evidence: latest.ledger, historicalEvidenceFinding: 'INDEXED_LEDGER_HASH_MISMATCH' });
    expect(diagnostic.diagnostics).toEqual([]);
    expect(diagnostic.runDiagnostics?.[0]).toMatchObject({ phase: 'reporting', failureCategory: 'automation-gap',
      actual: 'INDEXED_LEDGER_HASH_MISMATCH', businessRerunAuthorized: false });
    expect(buildSystemTestDiagnosticWorkQueue(diagnostic)).toMatchObject({ status: 'ready', items: [],
      runItems: [{ runId: 'run-1', action: 'reconcile-run-evidence', businessRerunAuthorized: false }] });
    // A fresh report explicitly records current observation separately from strict index qualification.
    fs.writeFileSync(path.join(runRoot, 'run-report.json'), JSON.stringify({ runId: 'run-1', exitCode: 3, evidenceInvocation: {
      invocationId: latest.entry.invocationId, snapshotHash: current.ledgerHash, indexStatus: 'incomplete', observationStatus: 'available',
    } }));
    expect(classifyFlowCompletion({ ...input, exitCode: 3 }).status).toBe('completed-with-findings');
    // New current invocation and current corruption still block; the observation path never falls back.
    const view = path.join(runRoot, 'evidence-ledger.json'); const bytes = fs.readFileSync(view);
    fs.writeFileSync(view, '{}');
    expect(readFlowRunTerminalCaseIds(input)).toEqual([]);
    expect(classifyFlowCompletion({ ...input, exitCode: 0 }).status).toBe('blocked');
    fs.writeFileSync(view, bytes);
    registerEvidenceInvocation(runRoot, latest.identity);
    expect(readCurrentIndexedRunObservation(runRoot, 'run-1').status).toBe('incomplete');
    expect(isCompletedFlowRun(input)).toBe(false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('索引前历史损坏可以登记独立本次观察，声明链损坏仍阻断身份来源', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'current-history-source-'));
  try {
    fs.writeFileSync(path.join(root, 'evidence-ledger.json'), '{"legacy":true}');
    const current = indexedInvocationFixture(root, ['A'], [syntheticAttempt('A', 100, 10)]);
    const file = path.join(root, 'evidence-invocations/index.json');
    const index = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(path.join(root, index.preIndexHistory.ledgerSnapshot), '{}');
    expect(readCurrentIndexedRunObservation(root, 'run-1')).toMatchObject({ status: 'available', historicalEvidenceFinding: 'UNINDEXED_EVIDENCE_HASH_MISMATCH' });
    fs.writeFileSync(path.join(root, `evidence-invocations/${current.entry.invocationId}/declaration.json`), '{}');
    expect(readCurrentIndexedRunObservation(root, 'run-1').status).toBe('incomplete');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('读取期间最新调用切换必须阻断，不能将新调用缺报告误作历史finding', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'current-observation-switch-'));
  const original = fs.readFileSync;
  try {
    const first = indexedInvocationFixture(root, ['A'], [syntheticAttempt('A', 0, 10)]);
    const view = path.join(root, 'evidence-ledger.json');
    let switched = false;
    const read = original as (...args: any[]) => any;
    fs.readFileSync = ((...args: any[]) => {
      const result = read(...args);
      if (!switched && String(args[0]) === view) {
        switched = true;
        registerEvidenceInvocation(root, first.identity);
      }
      return result;
    }) as typeof fs.readFileSync;
    expect(readCurrentIndexedRunObservation(root, 'run-1')).toMatchObject({ status: 'incomplete',
      reason: 'EVIDENCE_CURRENT_INVOCATION_MISMATCH', businessPassAuthorized: false });
  } finally { fs.readFileSync = original; fs.rmSync(root, { recursive: true, force: true }); }
});
