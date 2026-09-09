import fs from 'node:fs';
import path from 'node:path';
import { importSystemTestEvidenceLedgerReceipts } from '../../../Test Automation Platform/src/utils/system-test-evidence-ledger-receipt';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const systemId = 'merchant-center-product-center-seasoning';
const systemOutputRoot = path.join(projectRoot, 'output/system-test', systemId);
const executionIndexPath = path.join(projectRoot, 'deliverables/system-test-platform/execution-index.json');
const reportPath = path.join(
  projectRoot,
  'deliverables/system-test-platform/product-center-system-test-context-reconciliation.json',
);

type ExecutionCandidate = {
  contextFingerprint: string;
  selectedCaseIds: string[];
};

const runIds = argument('run-ids').split(',').map((item) => item.trim()).filter(Boolean);
if (runIds.length === 0) throw new Error('SYSTEM_TEST_CONTEXT_RECONCILIATION_RUN_IDS_REQUIRED');

const runs = runIds.map((runId) => {
  const runDir = path.join(systemOutputRoot, runId);
  const ledgerPath = requiredFile(runDir, 'evidence-ledger.json');
  const contractPath = requiredFile(runDir, 'contract.json');
  const candidatePath = requiredFile(runDir, 'execution-candidate.json');
  const candidate = readJson<ExecutionCandidate>(candidatePath);
  const result = importSystemTestEvidenceLedgerReceipts({
    ledgerPath,
    contractPath,
    executionIndexPath,
    workspaceRoot,
    runId,
    expectedSystemId: systemId,
    expectedCaseIds: candidate.selectedCaseIds,
    expectedExecutionContextFingerprint: candidate.contextFingerprint,
    allowPartial: true,
    replaceEquivalentRecords: true,
  });
  return {
    runId,
    contextFingerprint: candidate.contextFingerprint,
    selectedCaseIds: candidate.selectedCaseIds,
    importedCaseIds: result.records.map((item) => item.caseId),
    diagnostics: result.diagnostics,
    indexChanged: result.indexChanged,
  };
});

const report = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  scope: 'project-adapter',
  purpose: '将已验证标准收据的执行上下文身份统一迁移为公共运行器签发的执行候选上下文指纹。',
  policy: {
    pageExecutionTriggered: false,
    historicalEvidenceRevalidated: true,
    existingPassedResults: 'unchanged',
    failedResultsPromoted: false,
  },
  summary: {
    runs: runs.length,
    selectedCases: new Set(runs.flatMap((item) => item.selectedCaseIds)).size,
    importedRecords: runs.reduce((total, item) => total + item.importedCaseIds.length, 0),
    diagnostics: runs.reduce((total, item) => total + item.diagnostics.length, 0),
    changedRuns: runs.filter((item) => item.indexChanged).length,
  },
  runs,
};

writeJson(reportPath, report);
process.stdout.write(`${JSON.stringify({ reportPath, summary: report.summary }, null, 2)}\n`);

function argument(name: string): string {
  return process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '';
}

function requiredFile(root: string, name: string): string {
  const filePath = path.join(root, name);
  if (!fs.existsSync(filePath)) throw new Error(`SYSTEM_TEST_CONTEXT_RECONCILIATION_FILE_MISSING:${filePath}`);
  return filePath;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
