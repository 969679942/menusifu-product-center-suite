import fs from 'node:fs';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import type { SystemTestRunContract } from '../automation/system-test/system-test-contract';
import { fingerprintSystemTestValue } from '../automation/system-test/system-test-contract';
import { evaluateSystemTestRuntimeEvidence, type SystemTestRuntimeEvidence } from '../automation/system-test/system-test-evidence';
import { appendSystemTestProgress, type SystemTestFailureCategory } from '../automation/system-test/system-test-progress';
import { classifySystemTestFailure } from '../automation/system-test/system-test-failure';
import { parseStepBoundAttachmentName } from './allure-report-integrity';
import {
  evaluateSystemTestCaseAuditCompleteness,
  summarizeSystemTestAuditCompleteness,
  type SystemTestCaseAuditCompleteness,
} from '../automation/system-test/system-test-audit-contract';

export default class SystemTestEvidenceReporter implements Reporter {
  private readonly contract: SystemTestRunContract;
  private readonly cases: Array<Record<string, unknown>> = [];
  private readonly progressPaths: { latestPath: string; historyPath: string };
  private readonly caseImplementationFingerprints: Record<string, string>;
  private readonly auditCompleteness: SystemTestCaseAuditCompleteness[] = [];
  private readonly outputPath: string;
  private readonly runId: string;
  private readonly implementationFingerprint: string;
  private readonly executionCandidateFingerprint: string;

  constructor() {
    this.contract = readJson<SystemTestRunContract>(requiredEnv('SYSTEM_TEST_CONTRACT'));
    this.outputPath = requiredEnv('SYSTEM_TEST_EVIDENCE_OUTPUT');
    this.runId = requiredTextEnv('SYSTEM_TEST_RUN_ID');
    this.implementationFingerprint = requiredTextEnv('SYSTEM_TEST_IMPLEMENTATION_FINGERPRINT');
    this.executionCandidateFingerprint = requiredTextEnv('SYSTEM_TEST_EXECUTION_CANDIDATE_FINGERPRINT');
    this.progressPaths = {
      latestPath: requiredEnv('SYSTEM_TEST_PROGRESS_LATEST'),
      historyPath: requiredEnv('SYSTEM_TEST_PROGRESS_HISTORY'),
    };
    this.caseImplementationFingerprints = readOptionalJson<Record<string, string>>(
      process.env.SYSTEM_TEST_CASE_IMPLEMENTATION_FINGERPRINTS,
    ) ?? {};
  }

  onTestBegin(test: TestCase): void {
    const caseId = readCaseId(test);
    if (caseId) appendSystemTestProgress(this.progressPaths, { runId: this.runId, caseId, phase: 'started' });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const caseId = readCaseId(test);
    if (!caseId) return;
    const item = this.contract.cases.find((candidate) => candidate.caseId === caseId);
    if (!item) return;
    const runtimeEvidence = parseEvidence(result);
    const evaluation = evaluateSystemTestRuntimeEvidence(item, runtimeEvidence);
    const auditCompleteness = evaluateSystemTestCaseAuditCompleteness({
      item,
      evidence: runtimeEvidence,
      runId: this.runId,
    });
    this.auditCompleteness.push(auditCompleteness);
    const passed = result.status === 'passed' && evaluation.status === 'complete';
    const failureCategory = passed ? undefined : classify(test, result, evaluation.status === 'incomplete');
    this.cases.push({
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
    });
    this.persist('running');
    appendSystemTestProgress(this.progressPaths, {
      runId: this.runId, caseId, phase: passed ? 'completed' : 'failed', status: result.status,
      ...(failureCategory ? { failureCategory } : {}),
    });
  }

  onEnd(result: FullResult): void {
    this.persist(result.status);
  }

  private persist(playwrightStatus: string): void {
    const incomplete = this.cases.filter((item) => (item.evidence as { status: string }).status !== 'complete');
    const auditSummary = summarizeSystemTestAuditCompleteness(this.auditCompleteness);
    writeJson(this.outputPath, {
      schemaVersion: '1.0.0', collectionId: 'system-test-evidence-ledger', generatedAt: new Date().toISOString(),
      systemId: this.contract.system.systemId,
      contractFingerprint: this.contract.fingerprint,
      implementationFingerprint: this.implementationFingerprint,
      executionCandidateFingerprint: this.executionCandidateFingerprint,
      playwrightStatus,
      summary: { selected: this.contract.cases.length, executed: this.cases.length, evidenceComplete: this.cases.length - incomplete.length, evidenceIncomplete: incomplete.length },
      auditCompleteness: { schemaVersion: '1.1.0', summary: auditSummary, cases: this.auditCompleteness },
      cases: this.cases,
    });
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
function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
