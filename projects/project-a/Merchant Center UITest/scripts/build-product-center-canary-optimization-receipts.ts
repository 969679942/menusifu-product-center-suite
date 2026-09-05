import fs from 'node:fs';
import path from 'node:path';
import { buildProductCenterProjectOptimizationCases } from '../adapters/product-center/product-center-project-optimization';
import { readPlaywrightExecutionReceipts } from '../utils/playwright-execution-receipt';
import type { SystemTestOptimizationReceipt } from '../../../Test Automation Platform/src/governance/system-test-optimization-gate';

type Attachment = { name?: string; body?: string; contentType?: string };
type Result = { status?: string; errors?: Array<{ message?: string }>; attachments?: Attachment[] };
type Test = { annotations?: Array<{ type?: string; description?: string }>; results?: Result[] };
type Spec = { title?: string; tags?: string[]; tests?: Test[] };
type Suite = { specs?: Spec[]; suites?: Suite[] };
type Report = { suites?: Suite[] };
type RuntimePayload = {
  caseFingerprint?: string;
  implementationFingerprint?: string;
  executionContext?: Record<string, unknown>;
  claims?: { required?: unknown[]; observed?: unknown[]; verified?: unknown[] };
  operationReceipts?: unknown[];
  cleanup?: { apiZeroResidue?: boolean; uiZeroResidue?: boolean; verifiedZero?: boolean };
};
type EvidenceLedgerCase = {
  caseId: string;
  caseFingerprint: string;
  implementationFingerprint: string;
  playwrightStatus?: string;
  failureCategory?: string;
  runtimeEvidence?: {
    operationReceipts?: unknown[];
    assertionReceipts?: unknown[];
    cleanup?: { apiZeroResidue?: boolean; uiZeroResidue?: boolean };
  };
  evidence?: { status?: string; apiZeroResidue?: boolean; uiZeroResidue?: boolean };
};

const projectRoot = path.resolve(__dirname, '..');
const scopePath = path.join(projectRoot, 'deliverables/system-test-platform/product-center-remediation-scope.json');
const defaultReports = [
  'output/product-center-group-source-governed-project-canary-product-center-non-seasoning-canary-20260830-v1.json',
  'output/product-center-item-source-governed-project-canary-product-center-non-seasoning-canary-20260830-v1.json',
];
const outputPath = path.resolve(projectRoot, argument('output') ?? 'output/system-test-optimization/product-center-non-seasoning-canary-receipts-20260830-v1.json');
const reportPaths = (argument('reports')?.split(',').map((item) => item.trim()).filter(Boolean) ?? defaultReports)
  .map((item) => path.resolve(projectRoot, item));
const scope = readJson<{ cases: Array<{ caseId: string; module: string }> }>(scopePath);
const cases = buildProductCenterProjectOptimizationCases({ projectRoot, scope });
const caseById = new Map(cases.map((item) => [item.caseId, item]));
const receipts: SystemTestOptimizationReceipt[] = [];
const seen = new Set<string>();

const evidenceLedgerPaths = argument('evidence-ledgers')
  ?.split(',').map((item) => item.trim()).filter(Boolean)
  .map((item) => path.resolve(projectRoot, item));
if (evidenceLedgerPaths?.length) {
  buildReceiptsFromEvidenceLedgers(evidenceLedgerPaths);
  writeReceipts();
  process.exit(0);
}

for (const reportPath of reportPaths) {
  if (!fs.existsSync(reportPath)) throw new Error(`CANARY_REPORT_MISSING:${reportPath}`);
  const report = readJson<Report>(reportPath);
  const standard = new Map(readPlaywrightExecutionReceipts({
    reportPath,
    workspaceRoot: path.resolve(projectRoot, '..'),
    runId: argument('run-id') ?? path.basename(reportPath, path.extname(reportPath)),
  }).records.map((record) => [record.caseId, record]));
  for (const spec of flattenSpecs(report.suites ?? [])) {
    const test = spec.tests?.[0];
    const caseId = resolveCaseId(spec, test);
    if (!caseId || !caseById.has(caseId) || seen.has(caseId)) continue;
    const result = [...(test?.results ?? [])].at(-1);
    const current = caseById.get(caseId)!;
    const imported = standard.get(caseId);
    const findingReceipt = readOptimizationFindingReceipt(result?.attachments ?? []);
    if (result?.status === 'passed' && imported) {
      const payload = readPayload(result.attachments ?? []);
      receipts.push({
        caseId,
        caseFingerprint: payload?.caseFingerprint ?? '',
        implementationFingerprint: payload?.implementationFingerprint ?? '',
        status: 'passed',
        evidenceComplete: imported.evidenceStatus === 'complete',
        operationReceiptCount: payload?.operationReceipts?.length ?? 0,
        assertionReceiptCount: payload?.claims?.verified?.length ?? 0,
        cleanupComplete: imported.cleanupEvidence?.apiZeroResidue === true
          && imported.cleanupEvidence?.uiZeroResidue === true,
        contextReceiptComplete: hasCompleteExecutionContext(payload),
      });
    } else if (findingReceipt) {
      receipts.push(findingReceipt);
    } else {
      receipts.push({
        caseId,
        caseFingerprint: current.caseFingerprint,
        implementationFingerprint: current.implementationFingerprint,
        status: result?.status === 'passed' ? 'not-run' : 'failed',
        ...(result?.status === 'passed' ? {} : { failureCategory: classifyFailure(result?.errors?.[0]?.message ?? '') }),
        evidenceComplete: false,
        operationReceiptCount: 0,
        assertionReceiptCount: 0,
        cleanupComplete: hasVerifiedCleanup(result?.attachments ?? []),
      });
    }
    seen.add(caseId);
  }
}

if (receipts.length === 0) throw new Error('CANARY_RECEIPTS_EMPTY');
writeReceipts();

function buildReceiptsFromEvidenceLedgers(paths: readonly string[]): void {
  for (const ledgerPath of paths) {
    if (!fs.existsSync(ledgerPath)) throw new Error(`CANARY_EVIDENCE_LEDGER_MISSING:${ledgerPath}`);
    const ledger = readJson<{ cases?: EvidenceLedgerCase[] }>(ledgerPath);
    for (const item of ledger.cases ?? []) {
      const current = caseById.get(item.caseId);
      if (!current || seen.has(item.caseId)) continue;
      const diagnostic = readDiagnostic(ledgerPath, item.caseId);
      const operationReceipts = item.runtimeEvidence?.operationReceipts ?? [];
      const assertionReceipts = item.runtimeEvidence?.assertionReceipts ?? [];
      const cleanupComplete = item.evidence?.apiZeroResidue === true
        && item.evidence?.uiZeroResidue === true
        || item.runtimeEvidence?.cleanup?.apiZeroResidue === true
        && item.runtimeEvidence?.cleanup?.uiZeroResidue === true;
      const passed = item.playwrightStatus === 'passed';
      receipts.push({
        caseId: item.caseId,
        caseFingerprint: item.caseFingerprint,
        implementationFingerprint: item.implementationFingerprint,
        status: passed ? 'passed' : 'failed',
        ...(passed ? {} : { failureCategory: item.failureCategory ?? diagnostic?.failureCategory ?? 'needs-diagnostic' }),
        evidenceComplete: item.evidence?.status === 'complete' || diagnostic?.evidenceComplete === true,
        operationReceiptCount: operationReceipts.length,
        assertionReceiptCount: assertionReceipts.length,
        cleanupComplete,
        contextReceiptComplete: false,
      });
      seen.add(item.caseId);
    }
  }
}

function readDiagnostic(ledgerPath: string, caseId: string): { failureCategory?: string; evidenceComplete?: boolean } | null {
  const diagnosticsPath = path.join(path.dirname(ledgerPath), 'diagnostics.json');
  if (!fs.existsSync(diagnosticsPath)) return null;
  const diagnostics = readJson<{ diagnostics?: Array<{ caseId?: string; failureCategory?: string; evidenceComplete?: boolean }> }>(diagnosticsPath);
  return diagnostics.diagnostics?.find((item) => item.caseId === caseId) ?? null;
}

function writeReceipts(): void {
  if (receipts.length === 0) throw new Error('CANARY_RECEIPTS_EMPTY');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(receipts.sort((left, right) => left.caseId.localeCompare(right.caseId)), null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ output: outputPath, receipts: receipts.length, passed: receipts.filter((item) => item.status === 'passed').length, failed: receipts.filter((item) => item.status === 'failed').length })}\n`);
}

function flattenSpecs(suites: readonly Suite[]): Spec[] {
  return suites.flatMap((suite) => [...(suite.specs ?? []), ...flattenSpecs(suite.suites ?? [])]);
}

function resolveCaseId(spec: Spec, test?: Test): string | null {
  const annotation = test?.annotations?.find((item) => ['canonical-case-id', 'group-case-id', 'case-id'].includes(item.type ?? ''))?.description;
  if (annotation?.trim()) return annotation.trim();
  const tag = spec.tags?.find((item) => item.startsWith('@case-') || item.startsWith('case-'));
  return tag?.replace(/^@?case-/, '') ?? null;
}

function readPayload(attachments: readonly Attachment[]): RuntimePayload | null {
  const attachment = attachments.find((item) => item.contentType === 'application/json'
    && ['test-execution-receipt', 'system-test-runtime-evidence', 'product-center-group-runtime-evidence'].includes(item.name ?? ''));
  if (!attachment?.body) return null;
  try {
    return JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8')) as RuntimePayload;
  } catch {
    return null;
  }
}

function hasVerifiedCleanup(attachments: readonly Attachment[]): boolean {
  return attachments.some((attachment) => {
    if (attachment.contentType !== 'application/json' || !attachment.body) return false;
    try {
      const payload = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8')) as RuntimePayload;
      return payload.cleanup?.verifiedZero === true
        || (payload.cleanup?.apiZeroResidue === true && payload.cleanup?.uiZeroResidue === true);
    } catch {
      return false;
    }
  });
}

function hasCompleteExecutionContext(payload: RuntimePayload | null): boolean {
  const context = payload?.executionContext;
  return Boolean(context && ['environmentId', 'tenantScope', 'locale', 'roleId', 'route']
    .every((key) => typeof context[key] === 'string' && context[key].trim().length > 0));
}

function readOptimizationFindingReceipt(
  attachments: readonly Attachment[],
): SystemTestOptimizationReceipt | null {
  const attachment = attachments.find((item) => (
    item.name === 'product-center-group-finding-optimization-receipt'
      && item.contentType === 'application/json'
      && item.body
  ));
  if (!attachment?.body) return null;
  try {
    const receipt = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8')) as SystemTestOptimizationReceipt;
    if (!receipt.caseId || !receipt.caseFingerprint || !receipt.implementationFingerprint) return null;
    if (receipt.status !== 'failed' || receipt.failureCategory !== 'product-failure') return null;
    if (!receipt.evidenceComplete || receipt.operationReceiptCount < 1
      || receipt.assertionReceiptCount < 1 || !receipt.cleanupComplete) return null;
    return receipt;
  } catch {
    return null;
  }
}

function classifyFailure(message: string): string {
  if (/403|forbidden|无权限|permission/i.test(message)) return 'environment-failure';
  if (/语言菜单项|中文界面|locale|语言|permissions-loading/i.test(message)) return 'environment-failure';
  if (/locator|not found|missing|未找到|不可见|upload|上传|选择索引|selection index|index/i.test(message)) return 'automation-gap';
  if (/timeout|timed out|超时/i.test(message)) return 'environment-failure';
  return 'needs-diagnostic';
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
