import fs from 'node:fs';
import path from 'node:path';
import type { SystemTestRunContract } from '../automation/system-test/system-test-contract';
import { fingerprintSystemTestValue } from '../automation/system-test/system-test-contract';
import {
  evaluateSystemTestRuntimeEvidence,
  type SystemTestRuntimeEvidence,
} from '../automation/system-test/system-test-evidence';
import {
  evaluateSystemTestCaseAuditCompleteness,
  summarizeSystemTestAuditCompleteness,
} from '../automation/system-test/system-test-audit-contract';
import { parseStepBoundAttachmentName } from '../reporters/allure-report-integrity';
import {
  importSystemTestEvidenceLedgerReceipts,
  type SystemTestEvidenceLedgerImportResult,
} from './system-test-evidence-ledger-receipt';

type AllureAttachment = { name?: string; source?: string };
type AllureStep = { name?: string; attachments?: AllureAttachment[]; steps?: AllureStep[] };
type AllureResult = {
  name?: string;
  status?: string;
  start?: number;
  stop?: number;
  labels?: Array<{ name?: string; value?: string }>;
  attachments?: AllureAttachment[];
  steps?: AllureStep[];
};
type ProgressEvent = { caseId?: string; phase?: string };

export type SystemTestAllureEvidenceRecoveryResult = {
  ledgerPath: string;
  recoveredCaseIds: string[];
  skippedCaseIds: string[];
  receiptImport: SystemTestEvidenceLedgerImportResult;
};

export function recoverSystemTestEvidenceLedgerFromAllure(input: {
  runDir: string;
  executionIndexPath: string;
  workspaceRoot: string;
  overwrite?: boolean;
}): SystemTestAllureEvidenceRecoveryResult {
  const runDir = path.resolve(input.runDir);
  const contractPath = path.join(runDir, 'contract.json');
  const allureResultsDir = path.join(runDir, 'allure-results');
  const implementationFingerprintsPath = path.join(runDir, 'case-implementation-fingerprints.json');
  const executionCandidatePath = path.join(runDir, 'execution-candidate.json');
  const progressHistoryPath = path.join(runDir, 'progress.jsonl');
  const ledgerPath = path.join(runDir, 'evidence-ledger.json');
  if (fs.existsSync(ledgerPath) && input.overwrite !== true) {
    throw new Error(`EVIDENCE_LEDGER_ALREADY_EXISTS:${ledgerPath}`);
  }
  for (const requiredPath of [contractPath, allureResultsDir, implementationFingerprintsPath, executionCandidatePath, progressHistoryPath]) {
    if (!fs.existsSync(requiredPath)) throw new Error(`RECOVERY_INPUT_MISSING:${requiredPath}`);
  }

  const contract = readJson<SystemTestRunContract>(contractPath);
  const implementationFingerprints = readJson<Record<string, string>>(implementationFingerprintsPath);
  const executionCandidate = readJson<{ fingerprint?: string }>(executionCandidatePath);
  const terminalCaseIds = readTerminalCaseIds(progressHistoryPath);
  const contractCases = new Map(contract.cases.map((item) => [item.caseId, item]));
  const seenCaseIds = new Set<string>();
  const recovered: Array<Record<string, unknown>> = [];
  const auditCompleteness = [];
  let latestStop = 0;

  const resultPaths = fs.readdirSync(allureResultsDir)
    .filter((name) => name.endsWith('-result.json'))
    .sort()
    .map((name) => path.join(allureResultsDir, name));
  for (const resultPath of resultPaths) {
    const result = readJson<AllureResult>(resultPath);
    const caseId = readCaseId(result);
    if (!caseId || !terminalCaseIds.has(caseId)) continue;
    if (seenCaseIds.has(caseId)) throw new Error(`RECOVERY_CASE_DUPLICATE:${caseId}`);
    const item = contractCases.get(caseId);
    if (!item) throw new Error(`RECOVERY_CASE_NOT_IN_CONTRACT:${caseId}`);
    const implementationFingerprint = implementationFingerprints[caseId];
    if (!isSha256(implementationFingerprint)) throw new Error(`RECOVERY_IMPLEMENTATION_FINGERPRINT_INVALID:${caseId}`);
    const runtimeEvidence = readRuntimeEvidence(allureResultsDir, result);
    if (!runtimeEvidence) throw new Error(`RECOVERY_RUNTIME_EVIDENCE_MISSING:${caseId}`);
    const evaluation = evaluateSystemTestRuntimeEvidence(item, runtimeEvidence);
    const caseAuditCompleteness = evaluateSystemTestCaseAuditCompleteness({
      item,
      evidence: runtimeEvidence,
      runId: path.basename(runDir),
    });
    auditCompleteness.push(caseAuditCompleteness);
    recovered.push({
      receiptVersion: '3.1.0',
      caseId,
      caseFingerprint: fingerprintSystemTestValue(item),
      implementationFingerprint,
      executionCandidateFingerprint: executionCandidate.fingerprint ?? null,
      executionContext: runtimeEvidence.executionContext ?? null,
      playwrightStatus: result.status,
      runtimeEvidence,
      evidence: evaluation,
      auditCompleteness: caseAuditCompleteness,
    });
    seenCaseIds.add(caseId);
    latestStop = Math.max(latestStop, Number(result.stop ?? result.start ?? 0));
  }

  if (recovered.length === 0) throw new Error('RECOVERY_NO_TERMINAL_CASE_RECEIPTS');
  const incomplete = recovered.filter((item) => (item.evidence as { status: string }).status !== 'complete');
  const generatedAt = latestStop > 0
    ? new Date(latestStop).toISOString()
    : fs.statSync(progressHistoryPath).mtime.toISOString();
  writeJsonAtomic(ledgerPath, {
    schemaVersion: '1.0.0',
    collectionId: 'system-test-evidence-ledger',
    generatedAt,
    recoveredAt: new Date().toISOString(),
    recoverySource: 'explicit-allure-results-directory',
    systemId: contract.system.systemId,
    contractFingerprint: contract.fingerprint,
    executionCandidateFingerprint: executionCandidate.fingerprint ?? null,
    playwrightStatus: 'interrupted',
    summary: {
      selected: contract.cases.length,
      executed: recovered.length,
      evidenceComplete: recovered.length - incomplete.length,
      evidenceIncomplete: incomplete.length,
    },
    auditCompleteness: {
      schemaVersion: '1.1.0',
      summary: summarizeSystemTestAuditCompleteness(auditCompleteness),
      cases: auditCompleteness,
    },
    cases: recovered,
  });

  const expectedCaseIds = contract.cases.map((item) => item.caseId);
  const receiptImport = importSystemTestEvidenceLedgerReceipts({
    ledgerPath,
    contractPath,
    executionIndexPath: input.executionIndexPath,
    workspaceRoot: input.workspaceRoot,
    runId: path.basename(runDir),
    expectedSystemId: contract.system.systemId,
    expectedCaseIds,
    allowPartial: true,
  });
  if (receiptImport.diagnostics.length > 0 || receiptImport.records.length !== recovered.length) {
    throw new Error(`RECOVERY_RECEIPT_IMPORT_REJECTED:${receiptImport.diagnostics.join(',')}`);
  }
  return {
    ledgerPath,
    recoveredCaseIds: [...seenCaseIds].sort(),
    skippedCaseIds: expectedCaseIds.filter((caseId) => !seenCaseIds.has(caseId)).sort(),
    receiptImport,
  };
}

function readCaseId(result: AllureResult): string | undefined {
  const tags = (result.labels ?? [])
    .filter((label) => label.name === 'tag' && label.value?.startsWith('case-'))
    .map((label) => label.value!.slice('case-'.length));
  return [...new Set(tags)].length === 1 ? tags[0] : undefined;
}

function readRuntimeEvidence(allureResultsDir: string, result: AllureResult): SystemTestRuntimeEvidence | undefined {
  const attachments = collectAttachments(result.steps ?? [], result.attachments ?? []);
  const matches = attachments.filter((attachment) => (
    parseStepBoundAttachmentName(attachment.name ?? '')?.attachmentName ?? attachment.name
  ) === 'system-test-runtime-evidence');
  if (matches.length !== 1 || !matches[0].source) return undefined;
  const attachmentPath = path.resolve(allureResultsDir, matches[0].source);
  if (path.dirname(attachmentPath) !== path.resolve(allureResultsDir) || !fs.existsSync(attachmentPath)) return undefined;
  return readJson<SystemTestRuntimeEvidence>(attachmentPath);
}

function collectAttachments(steps: readonly AllureStep[], root: readonly AllureAttachment[]): AllureAttachment[] {
  return [
    ...root,
    ...steps.flatMap((step) => [
      ...(step.attachments ?? []),
      ...collectAttachments(step.steps ?? [], []),
    ]),
  ];
}

function readTerminalCaseIds(filePath: string): Set<string> {
  const terminal = new Set<string>();
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const event = JSON.parse(line) as ProgressEvent;
    if (event.caseId && (event.phase === 'completed' || event.phase === 'failed')) terminal.add(event.caseId);
  }
  return terminal;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
