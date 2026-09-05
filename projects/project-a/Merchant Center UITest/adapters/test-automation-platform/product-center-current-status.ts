import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  arbitrateSystemTestReportFreshness,
  type SystemTestCurrentReceipt,
  type SystemTestReportCandidate,
  type SystemTestReportCaseReceipt,
  type SystemTestReportFreshnessResult,
} from '../../../../Test Automation Platform/src/automation/system-test/system-test-report-freshness-arbiter';

type JsonObject = Record<string, unknown>;

type ProductCenterCurrentStatusOptions = {
  projectRoot: string;
  scope: string;
  reportDirs: readonly string[];
  executionIndexPath?: string;
  systemTestOutputRoot?: string;
  outputPath?: string;
  registryPath?: string;
  resolvedAt?: string;
};

type ProductCenterCurrentStatusArtifact = {
  schemaVersion: '1.0.0';
  resolvedAt: string;
  result: SystemTestReportFreshnessResult;
  assessedReportPaths: string[];
  executionIndexPath: string;
};

type ProductCenterCurrentStatusRegistry = {
  schemaVersion: '1.0.0';
  updatedAt: string;
  artifacts: Array<{
    applicationId: string;
    scope: string;
    artifactId: string;
    authorityPath: string;
    generatedAt: string;
    status: 'current' | 'stale' | 'unknown';
    supersededBy: string | null;
  }>;
};

const APPLICATION_ID = 'merchant-center';
const CURRENT_FIVE_SCOPE = 'merchant-center-current-five-closure';
const LANDED_420_AUDIT_ID = 'merchant-center-product-center-420-coverage-20260831-r2';

function readJson(filePath: string): JsonObject {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonObject;
}

function optionalJson(filePath: string): JsonObject | null {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}

function jsonFiles(directory: string, predicate: (name: string) => boolean): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter(predicate)
    .map((name) => path.join(directory, name));
}

function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function atomicWrite(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function reportScope(mergeManifest: JsonObject | null, coverageAudit: JsonObject | null): string | null {
  if (mergeManifest?.scope === CURRENT_FIVE_SCOPE) return 'current-five';
  if (coverageAudit?.auditId === LANDED_420_AUDIT_ID) return 'landed-420';
  return null;
}

function allAttachments(steps: unknown): string[] {
  if (!Array.isArray(steps)) return [];
  const sources: string[] = [];
  for (const rawStep of steps) {
    const step = object(rawStep);
    if (!step) continue;
    if (Array.isArray(step.attachments)) {
      for (const rawAttachment of step.attachments) {
        const attachment = object(rawAttachment);
        if (typeof attachment?.source === 'string') sources.push(attachment.source);
      }
    }
    sources.push(...allAttachments(step.steps));
  }
  return sources;
}

function standardReceiptFromResult(resultsDir: string, result: JsonObject): SystemTestReportCaseReceipt | null {
  for (const source of allAttachments(result.steps)) {
    const attachmentPath = path.join(resultsDir, source);
    if (!fs.existsSync(attachmentPath) || path.extname(attachmentPath) !== '.json') continue;
    const attachment = readJson(attachmentPath);
    if (attachment.receiptVersion !== '3.1.0' || typeof attachment.caseId !== 'string') continue;
    return {
      caseId: attachment.caseId,
      caseFingerprint: typeof attachment.caseFingerprint === 'string' ? attachment.caseFingerprint : null,
      implementationFingerprint: typeof attachment.implementationFingerprint === 'string'
        ? attachment.implementationFingerprint : null,
      receiptFingerprint: typeof attachment.evidenceFingerprint === 'string' ? attachment.evidenceFingerprint : null,
    };
  }
  return null;
}

function ledgerReceipt(ledgerPath: string, caseId: string): SystemTestReportCaseReceipt | null {
  if (!fs.existsSync(ledgerPath)) return null;
  const ledger = readJson(ledgerPath);
  const row = (Array.isArray(ledger.cases) ? ledger.cases : [])
    .map(object)
    .find((item) => item?.caseId === caseId);
  if (!row) return null;
  return {
    caseId,
    caseFingerprint: typeof row.caseFingerprint === 'string' ? row.caseFingerprint : null,
    implementationFingerprint: typeof row.implementationFingerprint === 'string'
      ? row.implementationFingerprint : null,
    receiptFingerprint: `ledger:${sha256(row)}`,
  };
}

function caseIdFromResult(result: JsonObject): string | null {
  if (!Array.isArray(result.labels)) return null;
  for (const rawLabel of result.labels) {
    const label = object(rawLabel);
    if (label?.name === 'caseId' && typeof label.value === 'string') return label.value;
    if (label?.name === 'tag' && typeof label.value === 'string' && label.value.startsWith('case-')) {
      return label.value.slice('case-'.length);
    }
  }
  return null;
}

function reportSourceLedgers(mergeManifest: JsonObject | null): Map<string, string> {
  const ledgers = new Map<string, string>();
  if (!Array.isArray(mergeManifest?.cases)) return ledgers;
  for (const rawCase of mergeManifest.cases) {
    const entry = object(rawCase);
    if (typeof entry?.caseId !== 'string' || typeof entry.sourceDir !== 'string') continue;
    const sourceDir = path.resolve(entry.sourceDir);
    const runDir = path.basename(sourceDir) === 'allure-results' ? path.dirname(sourceDir) : sourceDir;
    const ledgerPath = path.join(runDir, 'evidence-ledger.json');
    if (fs.existsSync(ledgerPath)) ledgers.set(entry.caseId, ledgerPath);
  }
  return ledgers;
}

function numericSummary(audits: readonly (JsonObject | null)[]): Record<string, number> {
  for (const audit of audits) {
    const summary = object(audit?.summary);
    if (!summary) continue;
    const values = Object.entries(summary).filter((entry): entry is [string, number] => typeof entry[1] === 'number');
    if (values.length > 0) return Object.fromEntries(values);
  }
  return {};
}

function latestGeneratedAt(documents: readonly (JsonObject | null)[]): string | null {
  const values = documents
    .map((item) => typeof item?.generatedAt === 'string' ? item.generatedAt : null)
    .filter((item): item is string => item !== null && Number.isFinite(Date.parse(item)))
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  return values.at(-1) ?? null;
}

function buildReportCandidate(reportDir: string): { candidate: SystemTestReportCandidate; expectedCaseIds: string[] } {
  const absoluteReportDir = path.resolve(reportDir);
  const resultsDir = fs.existsSync(path.join(absoluteReportDir, 'results'))
    ? path.join(absoluteReportDir, 'results') : absoluteReportDir;
  const mergeManifest = optionalJson(path.join(absoluteReportDir, 'merge-manifest.json'));
  const coveragePath = jsonFiles(absoluteReportDir, (name) => name.endsWith('coverage-audit.json'))[0];
  const integrityPath = jsonFiles(absoluteReportDir, (name) => name.endsWith('integrity-audit.json'))[0];
  const closurePath = jsonFiles(absoluteReportDir, (name) => name.endsWith('receipt-closure-audit.json'))[0];
  const coverageAudit = coveragePath ? readJson(coveragePath) : null;
  const integrityAudit = integrityPath ? readJson(integrityPath) : null;
  const closureAudit = closurePath ? readJson(closurePath) : null;
  const scope = reportScope(mergeManifest, coverageAudit);
  if (!scope) throw new Error(`PRODUCT_CENTER_REPORT_SCOPE_UNDECLARED:${absoluteReportDir}`);
  const generatedAt = latestGeneratedAt([mergeManifest, coverageAudit, integrityAudit, closureAudit]);
  if (!generatedAt) throw new Error(`PRODUCT_CENTER_REPORT_GENERATED_AT_MISSING:${absoluteReportDir}`);
  const resultFiles = jsonFiles(resultsDir, (name) => name.endsWith('-result.json'));
  const sourceLedgers = reportSourceLedgers(mergeManifest);
  const receiptByCaseId = new Map<string, SystemTestReportCaseReceipt>();
  for (const resultFile of resultFiles) {
    const result = readJson(resultFile);
    const caseId = caseIdFromResult(result);
    if (!caseId) continue;
    const standard = standardReceiptFromResult(resultsDir, result);
    const fromLedger = sourceLedgers.has(caseId) ? ledgerReceipt(sourceLedgers.get(caseId)!, caseId) : null;
    receiptByCaseId.set(caseId, standard ?? fromLedger ?? {
      caseId, caseFingerprint: null, implementationFingerprint: null, receiptFingerprint: null,
    });
  }
  const coverageCases = Array.isArray(coverageAudit?.cases) ? coverageAudit.cases.map(object).filter(Boolean) as JsonObject[] : [];
  const expectedCaseIds = coverageCases
    .map((item) => typeof item.caseId === 'string' ? item.caseId : null)
    .filter((item): item is string => item !== null);
  const cases = (expectedCaseIds.length > 0 ? expectedCaseIds : [...receiptByCaseId.keys()])
    .map((caseId) => receiptByCaseId.get(caseId) ?? {
      caseId, caseFingerprint: null, implementationFingerprint: null, receiptFingerprint: null,
    });
  const reportId = [integrityAudit, closureAudit, coverageAudit]
    .map((item) => item?.reportId ?? item?.auditId)
    .find((value): value is string => typeof value === 'string') ?? `report-${sha256({ scope, generatedAt, cases })}`;
  return {
    candidate: {
      applicationId: APPLICATION_ID,
      scope,
      artifactId: `${reportId}@${generatedAt}`,
      generatedAt,
      authorityPath: absoluteReportDir,
      cases,
      summary: numericSummary([integrityAudit, closureAudit, coverageAudit]),
    },
    expectedCaseIds,
  };
}

function findFiles(root: string, fileName: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...findFiles(entryPath, fileName));
    else if (entry.name === fileName) files.push(entryPath);
  }
  return files;
}

function currentReceipts(executionIndexPath: string, systemTestOutputRoot: string): SystemTestCurrentReceipt[] {
  const receipts: SystemTestCurrentReceipt[] = [];
  const executionIndex = optionalJson(executionIndexPath);
  for (const rawRecord of Array.isArray(executionIndex?.records) ? executionIndex.records : []) {
    const record = object(rawRecord);
    if (!record || record.evidenceStatus !== 'complete') continue;
    if (typeof record.caseId !== 'string' || typeof record.recordedAt !== 'string') continue;
    receipts.push({
      caseId: record.caseId,
      recordedAt: record.recordedAt,
      caseFingerprint: typeof record.caseFingerprint === 'string' ? record.caseFingerprint : null,
      implementationFingerprint: typeof record.implementationFingerprint === 'string'
        ? record.implementationFingerprint : null,
      receiptFingerprint: typeof record.receiptEvidenceFingerprint === 'string'
        ? record.receiptEvidenceFingerprint : null,
    });
  }
  for (const ledgerPath of findFiles(systemTestOutputRoot, 'evidence-ledger.json')) {
    const ledger = readJson(ledgerPath);
    if (typeof ledger.generatedAt !== 'string' || !Array.isArray(ledger.cases)) continue;
    for (const rawCase of ledger.cases) {
      const row = object(rawCase);
      if (!row || typeof row.caseId !== 'string') continue;
      receipts.push({
        caseId: row.caseId,
        recordedAt: ledger.generatedAt,
        caseFingerprint: typeof row.caseFingerprint === 'string' ? row.caseFingerprint : null,
        implementationFingerprint: typeof row.implementationFingerprint === 'string'
          ? row.implementationFingerprint : null,
        receiptFingerprint: `ledger:${sha256(row)}`,
      });
    }
  }
  return receipts;
}

function updateRegistry(
  registryPath: string,
  resolvedAt: string,
  candidates: readonly SystemTestReportCandidate[],
  result: SystemTestReportFreshnessResult,
): void {
  const existing = optionalJson(registryPath);
  const priorArtifacts = Array.isArray(existing?.artifacts) ? existing.artifacts.map(object).filter(Boolean) as JsonObject[] : [];
  const byIdentity = new Map<string, ProductCenterCurrentStatusRegistry['artifacts'][number]>();
  for (const artifact of priorArtifacts) {
    if (typeof artifact.applicationId !== 'string' || typeof artifact.scope !== 'string'
      || typeof artifact.artifactId !== 'string' || typeof artifact.authorityPath !== 'string'
      || typeof artifact.generatedAt !== 'string') continue;
    byIdentity.set(`${artifact.applicationId}:${artifact.scope}:${artifact.artifactId}`, {
      applicationId: artifact.applicationId,
      scope: artifact.scope,
      artifactId: artifact.artifactId,
      authorityPath: artifact.authorityPath,
      generatedAt: artifact.generatedAt,
      status: artifact.status === 'current' || artifact.status === 'stale' ? artifact.status : 'unknown',
      supersededBy: typeof artifact.supersededBy === 'string' ? artifact.supersededBy : null,
    });
  }
  for (const candidate of candidates) {
    const selected = candidate.artifactId === result.artifactId;
    byIdentity.set(`${candidate.applicationId}:${candidate.scope}:${candidate.artifactId}`, {
      applicationId: candidate.applicationId,
      scope: candidate.scope,
      artifactId: candidate.artifactId,
      authorityPath: candidate.authorityPath,
      generatedAt: candidate.generatedAt,
      status: selected ? result.status : 'stale',
      supersededBy: result.status === 'current' && !selected ? result.artifactId : null,
    });
  }
  atomicWrite(registryPath, {
    schemaVersion: '1.0.0',
    updatedAt: resolvedAt,
    artifacts: [...byIdentity.values()].sort((left, right) => left.generatedAt.localeCompare(right.generatedAt)),
  } satisfies ProductCenterCurrentStatusRegistry);
}

export function resolveProductCenterCurrentStatus(
  options: ProductCenterCurrentStatusOptions,
): ProductCenterCurrentStatusArtifact {
  if (!options.scope.trim()) throw new Error('PRODUCT_CENTER_CURRENT_STATUS_SCOPE_REQUIRED');
  if (options.reportDirs.length === 0) throw new Error('PRODUCT_CENTER_CURRENT_STATUS_REPORT_REQUIRED');
  const projectRoot = path.resolve(options.projectRoot);
  const executionIndexPath = path.resolve(options.executionIndexPath
    ?? path.join(projectRoot, 'deliverables/system-test-platform/execution-index.json'));
  const systemTestOutputRoot = path.resolve(options.systemTestOutputRoot ?? path.join(projectRoot, 'output/system-test'));
  const outputPath = path.resolve(options.outputPath
    ?? path.join(projectRoot, 'deliverables/system-test-platform/current-status.json'));
  const registryPath = path.resolve(options.registryPath
    ?? path.join(projectRoot, 'deliverables/system-test-platform/current-status-registry.json'));
  const reports = options.reportDirs.map(buildReportCandidate);
  const requestedReports = reports.filter((report) => report.candidate.scope === options.scope);
  const expectedCaseIds = requestedReports.at(-1)?.expectedCaseIds ?? [];
  const result = arbitrateSystemTestReportFreshness({
    applicationId: APPLICATION_ID,
    scope: options.scope,
    expectedCaseIds,
    candidates: reports.map((report) => report.candidate),
    currentReceipts: currentReceipts(executionIndexPath, systemTestOutputRoot),
  });
  const resolvedAt = options.resolvedAt ?? new Date().toISOString();
  const artifact: ProductCenterCurrentStatusArtifact = {
    schemaVersion: '1.0.0',
    resolvedAt,
    result,
    assessedReportPaths: reports.map((report) => report.candidate.authorityPath),
    executionIndexPath,
  };
  atomicWrite(outputPath, artifact);
  updateRegistry(registryPath, resolvedAt, reports.map((report) => report.candidate), result);
  return artifact;
}
