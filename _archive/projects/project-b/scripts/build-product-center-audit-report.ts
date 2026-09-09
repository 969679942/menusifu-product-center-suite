import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FileAuditEventStore, type AuditEventInput } from '../../../Test Automation Platform/src/audit/event-log';
import {
  adaptProductCenterClosureAudit,
  adaptProductCenterExecutionReceipts,
  adaptProductCenterOperationReceipts,
  adaptProductCenterAuditCompleteness,
  adaptProductCenterProgress,
  adaptProductCenterRuntimeAudit,
  type ProductCenterClosureAudit,
  type ProductCenterExecutionIndexRecord,
  type ProductCenterOperationReceipt,
  type ProductCenterAuditCompletenessCase,
  type ProductCenterProgressRecord,
  type ProductCenterRuntimeAuditDocument,
} from '../adapters/product-center/product-center-audit-event-adapter';
import {
  buildProductCenterAuditReport,
  buildProductCenterAuditFreshness,
  filterProductCenterAuditEvents,
  renderProductCenterAuditHtml,
  renderProductCenterAuditSummaryHtml,
  type ProductCenterAuditFreshnessInput,
} from '../adapters/product-center/product-center-audit-report';

const projectRoot = path.resolve(__dirname, '..');

export type ProductCenterAuditReportBuildOptions = {
  eventLogPath?: string;
  outputDirectory?: string;
  progressPaths?: string[];
  executionIndexPath?: string;
  closureAuditPath?: string;
  runtimeAuditPaths?: string[];
  auditObservationPaths?: string[];
  freshness?: ProductCenterAuditFreshnessInput;
  caseId?: string;
  from?: string;
  to?: string;
  generatedAt?: string;
};

export function buildProductCenterAuditReportFiles(options: ProductCenterAuditReportBuildOptions = {}) {
  const eventLogPath = resolveProjectPath(options.eventLogPath ?? 'output/audit/product-center-events.jsonl');
  const outputDirectory = resolveProjectPath(options.outputDirectory ?? 'deliverables/product-center-audit');
  const executionIndexPath = resolveProjectPath(
    options.executionIndexPath ?? 'deliverables/system-test-platform/execution-index.json',
  );
  const store = new FileAuditEventStore({ filePath: eventLogPath });
  const inputs = collectProductCenterAuditEventInputs(options);
  const existingEvents = store.readAll();
  const existingEventIds = new Set(existingEvents.map((event) => event.eventId));
  // 历史事件是不可变事实。若上游输入因补充字段而与同一 eventId 不同，
  // 不覆盖历史，也不让报告生成被阻断；后续应由上游产生新的事件编号。
  const appendableInputs = inputs.filter((input) => !existingEventIds.has(input.eventId));
  const conflictingInputs = inputs.filter((input) => {
    const previous = existingEvents.find((event) => event.eventId === input.eventId);
    return previous !== undefined && JSON.stringify(previous) !== JSON.stringify(input);
  });
  store.appendMany(appendableInputs);
  const appendedCount = appendableInputs.length;
  const integrity = store.verifyIntegrity();
  if (!integrity.valid) throw new Error(`商品中心审计事件链校验失败：${integrity.diagnostics.join(', ')}`);
  const events = filterProductCenterAuditEvents(store.query({
    applicationId: 'merchant-center',
    caseId: options.caseId,
    from: options.from,
    to: options.to,
  }));
  const freshnessInput = options.freshness ?? collectProductCenterAuditFreshness(options);
  const freshness = buildProductCenterAuditFreshness({
    ...freshnessInput,
    evaluatedAt: options.generatedAt ?? freshnessInput?.evaluatedAt ?? new Date().toISOString(),
  });
  const generatedAt = options.generatedAt ?? latestTimestamp([
    events.at(-1)?.occurredAt,
    freshness.observedAt,
    freshness.evaluatedAt,
  ]) ?? new Date(0).toISOString();
  const report = {
    ...buildProductCenterAuditReport(events, { generatedAt, freshness, caseCatalog: collectCaseCatalog(executionIndexPath) }),
    eventStoreIntegrity: integrity,
  };
  const jsonPath = path.join(outputDirectory, 'product-center-audit-report.json');
  const htmlPath = path.join(outputDirectory, 'product-center-audit-report.html');
  const detailsHtmlPath = path.join(outputDirectory, 'product-center-audit-details.html');
  writeTextAtomic(jsonPath, `${JSON.stringify({ ...report, eventStoreIntegrity: integrity }, null, 2)}\n`);
  writeTextAtomic(htmlPath, renderProductCenterAuditSummaryHtml(report));
  writeTextAtomic(detailsHtmlPath, renderProductCenterAuditHtml(report));
  return {
    eventLogPath,
    jsonPath,
    htmlPath,
    detailsHtmlPath,
    collected: inputs.length,
    appended: appendedCount,
    duplicates: inputs.length - appendedCount,
    conflicts: conflictingInputs.length,
    report,
  };
}

function latestTimestamp(values: readonly (string | null | undefined)[]): string | null {
  return values
    .filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value ?? '')))
    .sort((left, right) => Date.parse(left) - Date.parse(right))
    .at(-1) ?? null;
}

export function collectProductCenterAuditFreshness(
  options: ProductCenterAuditReportBuildOptions,
): Parameters<typeof buildProductCenterAuditFreshness>[0] {
  const defaults = [
    'output/page-contract/product-center-current-release-probe.json',
    'output/page-contract/product-center-page-contract-observation.json',
    'output/page-contract/product-center-api-observation-proposal.json',
    'output/page-contract/product-center-api-exchanges.json',
    'output/audit/product-center-item-control-drift-audit.json',
    'contracts/product-center/test-cases/canonical/product-center-item-authoritative-release.json',
    'deliverables/system-test-platform/platform-release.json',
  ];
  const paths = options.auditObservationPaths ?? defaults;
  const sources = paths.map((value) => {
    const filePath = resolveProjectPath(value);
    if (!fs.existsSync(filePath)) return {
      id: value,
      path: value,
      observedAt: null,
      fingerprint: null,
      available: false,
    };
    const document = readJson<Record<string, unknown>>(filePath);
    return {
      id: value,
      path: value,
      observedAt: readObservationTime(document),
      fingerprint: readDocumentFingerprint(document, filePath),
      available: true,
    };
  });
  const releaseProbe = readOptionalJson<{
    sourceScope?: string;
    release?: { observedAt?: string; applicationFingerprint?: string; environmentFingerprint?: string };
  }>(paths.find((value) => value.endsWith('product-center-current-release-probe.json')) ?? '');
  const controlDrift = readOptionalJson<{ locale?: string }>(
    paths.find((value) => value.endsWith('product-center-item-control-drift-audit.json')) ?? '',
  );
  const plan = readOptionalJson<{ executionContext?: {
    environmentId?: string;
    environmentFingerprint?: string;
    roleId?: string;
    tenantScope?: string;
    locale?: string;
    sourceScope?: string;
  } }>('systems/merchant-center-product-center-seasoning/test-plan.json');
  const authoritativeRelease = readOptionalJson<{ fingerprint?: string }>(
    paths.find((value) => value.endsWith('product-center-item-authoritative-release.json')) ?? '',
  );
  const platformRelease = readOptionalJson<{ candidateFingerprint?: string }>(
    paths.find((value) => value.endsWith('platform-release.json')) ?? '',
  );
  const pageObservation = readOptionalJson<{ fingerprint?: string }>(
    paths.find((value) => value.endsWith('product-center-page-contract-observation.json')) ?? '',
  );
  const apiProposal = readOptionalJson<{ fingerprint?: string }>(
    paths.find((value) => value.endsWith('product-center-api-observation-proposal.json')) ?? '',
  );
  const observedAt = latestObservationTime(sources.map((source) => source.observedAt));
  const sourceExpiryTimes = sources
    .map((source) => source.observedAt)
    .filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value!)))
    .map((value) => Date.parse(value) + 86_400_000);
  const freshUntil = sourceExpiryTimes.length > 0
    ? new Date(Math.min(...sourceExpiryTimes)).toISOString()
    : null;
  const executionContext = {
    // 运行上下文优先取正式方案声明；不再把已声明的环境/角色/租户丢弃为 null。
    environmentId: plan?.executionContext?.environmentId ?? null,
    environmentFingerprint: releaseProbe?.release?.environmentFingerprint ?? null,
    roleId: plan?.executionContext?.roleId ?? null,
    tenantScope: plan?.executionContext?.tenantScope ?? null,
    // 正式执行方案的上下文是权威值；页面漂移观测仅作为来源，不应把报告语言误判为不一致。
    locale: plan?.executionContext?.locale ?? controlDrift?.locale ?? null,
    sourceScope: releaseProbe?.sourceScope ?? plan?.executionContext?.sourceScope ?? null,
  };
  const fingerprints = {
    applicationVersionFingerprint: releaseProbe?.release?.applicationFingerprint ?? null,
    pageContractFingerprint: pageObservation?.fingerprint ?? null,
    apiObservationFingerprint: apiProposal?.fingerprint ?? null,
    sourceFingerprint: authoritativeRelease?.fingerprint ?? null,
    implementationFingerprint: platformRelease?.candidateFingerprint ?? null,
    executionContextFingerprint: sha256(JSON.stringify(executionContext)),
  };
  return {
    observedAt,
    freshUntil,
    sources,
    executionContext,
    fingerprints,
    expectedContext: plan?.executionContext,
  };
}

function readOptionalJson<T>(value: string): T | null {
  if (!value) return null;
  const filePath = resolveProjectPath(value);
  return fs.existsSync(filePath) ? readJson<T>(filePath) : null;
}

function readObservationTime(document: Record<string, unknown>): string | null {
  const direct = [document.observedAt, document.generatedAt].find((value): value is string => (
    typeof value === 'string' && Number.isFinite(Date.parse(value))
  ));
  if (direct) return direct;
  const observations = Array.isArray(document.observations) ? document.observations : [];
  const nested = observations.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const release = record.release && typeof record.release === 'object'
      ? record.release as Record<string, unknown> : {};
    return typeof release.observedAt === 'string' ? [release.observedAt] : [];
  });
  return latestObservationTime(nested);
}

function latestObservationTime(values: readonly (string | null | undefined)[]): string | null {
  return values.filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value!)))
    .sort((left, right) => Date.parse(left) - Date.parse(right)).at(-1) ?? null;
}

function readDocumentFingerprint(document: Record<string, unknown>, filePath: string): string | null {
  const fingerprint = [document.fingerprint, document.evidenceFingerprint].find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return fingerprint ?? sha256(fs.readFileSync(filePath).toString('utf8'));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function collectProductCenterAuditEventInputs(
  options: ProductCenterAuditReportBuildOptions = {},
): AuditEventInput[] {
  const inputs: AuditEventInput[] = [];
  const progressPaths = options.progressPaths ?? [
    'output/product-center-item-progress.jsonl',
  ];
  for (const progressPath of progressPaths) {
    const absolutePath = resolveProjectPath(progressPath);
    if (!fs.existsSync(absolutePath)) continue;
    inputs.push(...adaptProductCenterProgress(readJsonLines<ProductCenterProgressRecord>(absolutePath)));
  }

  const executionIndexPath = resolveProjectPath(
    options.executionIndexPath ?? 'deliverables/system-test-platform/execution-index.json',
  );
  if (fs.existsSync(executionIndexPath)) {
    const document = readJson<{ records?: ProductCenterExecutionIndexRecord[] }>(executionIndexPath);
    const records = document.records ?? [];
    inputs.push(...adaptProductCenterExecutionReceipts(records));
    // Operation-level receipts live inside the standard evidence ledger. Read
    // only the explicitly indexed evidencePath values (never recursive-scan
    // output/allure/test-results) and preserve the observed call boundary.
    for (const record of records) {
      if (!record.evidencePath || !fs.existsSync(resolveEvidencePath(record.evidencePath))) continue;
      const evidencePath = resolveEvidencePath(record.evidencePath);
      const ledger = readJson<{
        generatedAt?: string;
        cases?: Array<{ caseId?: string; runtimeEvidence?: { operationReceipts?: ProductCenterOperationReceipt[] } }>;
        auditCompleteness?: { cases?: ProductCenterAuditCompletenessCase[] };
      }>(evidencePath);
      const operationReceipts = (ledger.cases ?? [])
        .filter((item) => !item.caseId || item.caseId === record.caseId)
        .flatMap((item) => item.runtimeEvidence?.operationReceipts ?? []);
      inputs.push(...adaptProductCenterOperationReceipts(operationReceipts, {
        runId: record.runId ?? record.executionEpochId,
        caseId: record.caseId,
        occurredAt: ledger.generatedAt ?? record.recordedAt,
        sourcePath: record.evidencePath,
      }));
      inputs.push(...adaptProductCenterAuditCompleteness(
        (ledger.auditCompleteness?.cases ?? []).filter((item) => item.caseId === record.caseId), {
        runId: record.runId ?? record.executionEpochId ?? 'unknown-run',
        occurredAt: ledger.generatedAt ?? record.recordedAt,
        sourcePath: record.evidencePath,
      }));
    }
  }

  const closureAuditPath = resolveProjectPath(
    options.closureAuditPath ?? '../deliverables/test-plan-governance/product-center-closure-audit.json',
  );
  if (fs.existsSync(closureAuditPath)) {
    inputs.push(...adaptProductCenterClosureAudit(readJson<ProductCenterClosureAudit>(closureAuditPath)));
  }

  const runtimeAuditPaths = options.runtimeAuditPaths ?? [
    'systems/merchant-center-product-center-seasoning/runtime-audit.json',
    'contracts/product-center/reviews/product-center-runtime-audit-corrections.json',
  ];
  for (const runtimeAuditPath of runtimeAuditPaths) {
    const absolutePath = resolveProjectPath(runtimeAuditPath);
    if (!fs.existsSync(absolutePath)) continue;
    inputs.push(...adaptProductCenterRuntimeAudit(readJson<ProductCenterRuntimeAuditDocument>(absolutePath)));
  }
  return uniqueInputs(inputs);
}

function uniqueInputs(inputs: readonly AuditEventInput[]): AuditEventInput[] {
  const events = new Map<string, AuditEventInput>();
  for (const input of inputs) {
    const previous = events.get(input.eventId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(input)) {
      throw new Error(`商品中心适配器产生冲突事件 ID：${input.eventId}`);
    }
    events.set(input.eventId, input);
  }
  return [...events.values()].sort((left, right) => (
    String(left.occurredAt).localeCompare(String(right.occurredAt)) || left.eventId.localeCompare(right.eventId)
  ));
}

function resolveEvidencePath(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  // Execution indexes may be emitted from the workspace root and prefix the
  // project folder. Resolve that prefix explicitly before applying the normal
  // project-root resolver; reject traversal outside the workspace.
  const projectPrefix = 'Merchant Center UITest/';
  if (normalized.startsWith(projectPrefix)) return path.resolve(projectRoot, normalized.slice(projectPrefix.length));
  return resolveProjectPath(value);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function readJsonLines<T>(filePath: string): T[] {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) as T; }
    catch { throw new Error(`审计输入 JSONL 无效：${filePath}:${index + 1}`); }
  });
}

function collectCaseCatalog(executionIndexPath: string): Record<string, { title?: string; scriptPaths?: string[]; ruleIds?: string[] }> {
  if (!fs.existsSync(executionIndexPath)) return {};
  const index = readJson<{ records?: ProductCenterExecutionIndexRecord[] }>(executionIndexPath);
  const catalog: Record<string, { title?: string; scriptPaths?: string[]; ruleIds?: string[] }> = {};
  const visit = (value: unknown, sourcePath: string): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach((item) => visit(item, sourcePath)); return; }
    const record = value as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title : undefined;
    const file = typeof record.file === 'string' ? record.file : undefined;
    const tags = Array.isArray(record.tags) ? record.tags.filter((item): item is string => typeof item === 'string') : [];
    const caseId = tags.find((tag) => tag.startsWith('case-'))?.slice('case-'.length);
    if (caseId) {
      const current = catalog[caseId] ?? {};
      catalog[caseId] = {
        title: current.title ?? title,
        scriptPaths: uniqueStrings([...(current.scriptPaths ?? []), ...(file ? [file] : [])]),
        ruleIds: current.ruleIds ?? [],
      };
    }
    Object.values(record).forEach((child) => visit(child, sourcePath));
  };
  const seen = new Set<string>();
  for (const record of index.records ?? []) {
    if (!record.evidencePath) continue;
    const evidencePath = resolveEvidencePath(record.evidencePath);
    if (seen.has(evidencePath) || !fs.existsSync(evidencePath)) continue;
    seen.add(evidencePath);
    try { visit(readJson<unknown>(evidencePath), record.evidencePath); } catch { /* 单个历史产物损坏不阻断其他记录 */ }
  }
  return catalog;
}

function uniqueStrings(values: readonly string[]): string[] { return [...new Set(values)].sort(); }

function resolveProjectPath(value: string): string {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(projectRoot, value);
}

function writeTextAtomic(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function parseArguments(argv: readonly string[]): ProductCenterAuditReportBuildOptions {
  const read = (name: string) => argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  return {
    eventLogPath: read('event-log'),
    outputDirectory: read('output-dir'),
    executionIndexPath: read('execution-index'),
    closureAuditPath: read('closure-audit'),
    caseId: read('case-id'),
    from: read('from'),
    to: read('to'),
    generatedAt: read('generated-at'),
    progressPaths: argv.filter((item) => item.startsWith('--progress=')).map((item) => item.slice('--progress='.length)),
    runtimeAuditPaths: argv.filter((item) => item.startsWith('--runtime-audit=')).map((item) => item.slice('--runtime-audit='.length)),
    auditObservationPaths: argv.filter((item) => item.startsWith('--audit-observation=')).map((item) => item.slice('--audit-observation='.length)),
  };
}

if (require.main === module) {
  const options = parseArguments(process.argv.slice(2));
  if (options.progressPaths?.length === 0) delete options.progressPaths;
  if (options.runtimeAuditPaths?.length === 0) delete options.runtimeAuditPaths;
  if (options.auditObservationPaths?.length === 0) delete options.auditObservationPaths;
  const result = buildProductCenterAuditReportFiles(options);
  process.stdout.write([
    `商品中心审计事件：${result.eventLogPath}`,
    `JSON 报告：${result.jsonPath}`,
    `HTML 报告：${result.htmlPath}`,
    `本次采集 ${result.collected} 条，新增 ${result.appended} 条，幂等命中 ${result.duplicates} 条。`,
  ].join('\n') + '\n');
}
