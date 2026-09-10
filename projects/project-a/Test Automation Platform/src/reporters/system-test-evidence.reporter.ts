import fs from 'node:fs';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import type { SystemTestRunContract } from '../automation/system-test/system-test-contract';
import { fingerprintSystemTestValue } from '../automation/system-test/system-test-contract';
import { evaluateSystemTestRuntimeEvidence, type SystemTestRuntimeEvidence } from '../automation/system-test/system-test-evidence';
import { appendSystemTestProgress, type SystemTestFailureCategory } from '../automation/system-test/system-test-progress';
import { classifySystemTestFailure } from '../automation/system-test/system-test-failure';
import { parseStepBoundAttachmentName } from './allure-report-integrity';
import { accountExecutionAttempts, type ExecutionAttempt } from '../governance/execution-attempt-accounting';
import { fingerprintExecutionSelection } from '../governance/execution-intent';
import { claimEvidenceInvocation } from '../governance/run-evidence-index';
import {
  evaluateSystemTestCaseAuditCompleteness,
  summarizeSystemTestAuditCompleteness,
  type SystemTestCaseAuditCompleteness,
} from '../automation/system-test/system-test-audit-contract';

export default class SystemTestEvidenceReporter implements Reporter {
  private readonly contract: SystemTestRunContract;
  private readonly attempts: ExecutionAttempt[] = [];
  private readonly running = new Map<string, ExecutionAttempt>();
  private readonly progressPaths: { latestPath: string; historyPath: string };
  private readonly caseImplementationFingerprints: Record<string, string>;
  private readonly outputPath: string;
  private readonly runId: string;
  private readonly implementationFingerprint: string;
  private readonly executionCandidateFingerprint: string;
  private readonly invocationId: string;
  private readonly publication: ReturnType<typeof claimEvidenceInvocation>;

  constructor() {
    this.contract = readJson<SystemTestRunContract>(requiredEnv('SYSTEM_TEST_CONTRACT'));
    this.outputPath = requiredEnv('SYSTEM_TEST_EVIDENCE_OUTPUT');
    this.runId = requiredTextEnv('SYSTEM_TEST_RUN_ID');
    this.implementationFingerprint = requiredTextEnv('SYSTEM_TEST_IMPLEMENTATION_FINGERPRINT');
    this.executionCandidateFingerprint = requiredTextEnv('SYSTEM_TEST_EXECUTION_CANDIDATE_FINGERPRINT');
    this.invocationId = requiredTextEnv('SYSTEM_TEST_EVIDENCE_INVOCATION_ID');
    this.publication = claimEvidenceInvocation(path.dirname(this.outputPath), this.invocationId, {
      runId: this.runId, selectedCaseIds: this.contract.cases.map((item) => item.caseId),
      contractFingerprint: this.contract.fingerprint, implementationFingerprint: this.implementationFingerprint,
      executionCandidateFingerprint: this.executionCandidateFingerprint,
    });
    this.progressPaths = {
      latestPath: requiredEnv('SYSTEM_TEST_PROGRESS_LATEST'),
      historyPath: requiredEnv('SYSTEM_TEST_PROGRESS_HISTORY'),
    };
    this.caseImplementationFingerprints = readOptionalJson<Record<string, string>>(
      process.env.SYSTEM_TEST_CASE_IMPLEMENTATION_FINGERPRINTS,
    ) ?? {};
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    const caseId = readCaseId(test);
    if (caseId) {
      this.running.set(JSON.stringify([test.id, result.retry]), this.attempt(test, result, 'running'));
      this.persist('running');
      appendSystemTestProgress(this.progressPaths, { runId: this.runId, caseId, phase: 'started' });
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const caseId = readCaseId(test);
    if (!caseId) return;
    const item = this.contract.cases.find((candidate) => candidate.caseId === caseId);
    this.running.delete(JSON.stringify([test.id, result.retry]));
    if (!item) { this.attempts.push(this.attempt(test, result, result.status)); this.persist('running'); return; }
    const runtimeEvidence = parseEvidence(result);
    const evaluation = evaluateSystemTestRuntimeEvidence(item, runtimeEvidence);
    const auditCompleteness = evaluateSystemTestCaseAuditCompleteness({
      item,
      evidence: runtimeEvidence,
      runId: this.runId,
    });
    const passed = result.status === 'passed' && evaluation.status === 'complete';
    const failureCategory = passed || result.status === 'skipped' ? undefined : classify(test, result, evaluation.status === 'incomplete');
    this.attempts.push({ ...this.attempt(test, result, result.status), receipt: {
      receiptVersion: '3.1.0',
      caseId,
      caseFingerprint: fingerprintSystemTestValue(item),
      implementationFingerprint: this.caseImplementationFingerprints[caseId]
        ?? this.implementationFingerprint,
      executionCandidateFingerprint: this.executionCandidateFingerprint,
      executionContext: runtimeEvidence?.executionContext ?? null,
      playwrightStatus: result.status,
      runtimeEvidence,
      evidence: evaluation,
      auditCompleteness,
      ...(failureCategory ? { failureCategory } : {}),
    } });
    this.persist('running');
    appendSystemTestProgress(this.progressPaths, {
      runId: this.runId, caseId, phase: result.status === 'skipped' ? 'skipped' : passed ? 'completed' : 'failed', status: result.status,
      ...(failureCategory ? { failureCategory } : {}),
    });
  }

  onEnd(result: FullResult): void {
    this.persist(result.status, true);
  }

  private persist(playwrightStatus: string, final = false): void {
    const selectedCaseIds = this.contract.cases.map((item) => item.caseId);
    const attempts = [...this.attempts, ...this.running.values()];
    const accounting = accountExecutionAttempts({ runId: this.runId, selectedCaseIds, attempts });
    const cases = accounting.terminalAttempts.flatMap((item) => item.receipt ? [item.receipt] : []);
    const complete = cases.filter((item) => item.playwrightStatus === 'passed' && (item.evidence as { status: string }).status === 'complete').length;
    const auditCompleteness = this.contract.cases.map((item) => cases.find((row) => row.caseId === item.caseId)?.auditCompleteness as SystemTestCaseAuditCompleteness | undefined
      ?? evaluateSystemTestCaseAuditCompleteness({ item, evidence: undefined, runId: this.runId }));
    const auditSummary = summarizeSystemTestAuditCompleteness(auditCompleteness);
    const { latestAttempts: _latest, terminalAttempts: _terminal, ...executionAccounting } = accounting;
    this.publication.publish({
      schemaVersion: '1.2.0', invocationId: this.invocationId, collectionId: 'system-test-evidence-ledger', generatedAt: new Date().toISOString(),
      runId: this.runId, selectedCaseIds, selectedFingerprint: fingerprintExecutionSelection(selectedCaseIds),
      systemId: this.contract.system.systemId,
      contractFingerprint: this.contract.fingerprint,
      implementationFingerprint: this.implementationFingerprint,
      executionCandidateFingerprint: this.executionCandidateFingerprint,
      playwrightStatus,
      summary: { selected: selectedCaseIds.length, executed: accounting.status === 'valid' ? accounting.executedCaseIds.length : null,
        evidenceComplete: complete, evidenceIncomplete: accounting.status === 'valid' ? accounting.executedCaseIds.length - complete : null },
      executionAccounting, attempts,
      auditCompleteness: { schemaVersion: '1.1.0', summary: auditSummary, cases: auditCompleteness },
      cases,
    }, final);
  }

  private attempt(test: TestCase, result: TestResult, status: ExecutionAttempt['status']): ExecutionAttempt {
    return { runId: this.runId, caseId: readCaseId(test)!, testId: test.id, retry: result.retry, status,
      startedAt: result.startTime instanceof Date ? result.startTime.toISOString() : '',
      durationMs: status === 'running' ? null : result.duration };
  }
}

function readCaseId(test: TestCase): string | undefined {
  return test.annotations.find((annotation) => annotation.type === 'system-test-case-id')?.description;
}

function parseEvidence(result: TestResult): SystemTestRuntimeEvidence | undefined {
  return parseSystemTestRuntimeEvidenceAttachment(result.attachments);
}

export function parseSystemTestRuntimeEvidenceAttachment(
  attachments: ReadonlyArray<{ name: string; body?: Buffer; path?: string }>,
): SystemTestRuntimeEvidence | undefined {
  const attachment = attachments.find((item) => (
    parseStepBoundAttachmentName(item.name)?.attachmentName ?? item.name
  ) === 'system-test-runtime-evidence');
  try {
    const body = attachment?.body?.toString('utf8') ?? (attachment?.path ? fs.readFileSync(attachment.path, 'utf8') : undefined);
    return body ? JSON.parse(body) as SystemTestRuntimeEvidence : undefined;
  } catch {
    return undefined;
  }
}

function classify(test: TestCase, result: TestResult, evidenceIncomplete: boolean): SystemTestFailureCategory {
  const message = result.error?.message ?? '';
  if (/external[_ -]dependency/i.test(message)) return 'external-dependency';
  return classifySystemTestFailure({
    status: result.status,
    message,
    evidenceComplete: !evidenceIncomplete,
    productMismatchConfirmed: test.annotations.some((item) => item.type === 'product-mismatch-confirmed'),
    executionPathEquivalent: test.annotations.some((item) => item.type === 'execution-path-equivalent'),
  });
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少 ${name}`);
  return path.resolve(value);
}

function requiredTextEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少 ${name}`);
  return value;
}

function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function readOptionalJson<T>(filePath: string | undefined): T | undefined {
  if (!filePath || !fs.existsSync(filePath)) return undefined;
  return readJson<T>(filePath);
}
