import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readPlaywrightExecutionReceipts } from '../utils/playwright-execution-receipt';

export type HistoricalEvidenceReconciliationCase = {
  caseId: string;
  module: string;
  state: string;
  historicalEvidenceRefs: string[];
  existingEvidenceRefs: string[];
  unrelatedEvidenceRefs: string[];
  missingEvidenceRefs: string[];
  status: 'not-needed' | 'legacy-evidence-found' | 'backfill-blocked' | 'standard-receipt-backfilled' | 'no-evidence-source' | 'already-reconciled';
  nextAction: 'none' | 'attempt-standard-receipt-backfill' | 'receipt-schema-upgrade-required' | 'rerun-candidate';
  reason: string;
  diagnostics: string[];
};

export type HistoricalEvidenceReconciliationReport = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-historical-evidence-reconciliation';
  generatedAt: string;
  sourceAuditGeneratedAt: string;
  checkpointKey: string;
  summary: {
    total: number;
    reconciliationRequired: number;
    legacyEvidenceFound: number;
    backfillBlocked: number;
    standardReceiptBackfilled: number;
    noEvidenceSource: number;
    alreadyReconciled: number;
    rerunCandidates: number;
    referenceRepairs: number;
    legacyFactsPreserved: number;
  };
  rerunCandidateCaseIds: string[];
  cases: HistoricalEvidenceReconciliationCase[];
  policy: {
    neverPromoteFromLegacyEvidence: true;
    legacyEvidenceMustBeInspectedBeforeRerun: true;
    noAutomaticPageExecution: true;
  };
};

type HistoricalEvidenceInspection = {
  standardReceipt: boolean;
  casePresent?: boolean;
  legacyFactsPreserved?: boolean;
  diagnostics: string[];
};

type ClosureAudit = {
  generatedAt: string;
  cases: Array<{
    caseId: string;
    module: string;
    state: string;
    matchingCompleteReceipts: number;
    historicalEvidenceRefs?: string[];
  }>;
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const governanceRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const outputPath = path.join(governanceRoot, 'product-center-historical-evidence-reconciliation.json');
const markdownPath = path.join(governanceRoot, 'product-center-historical-evidence-reconciliation.md');

export function buildHistoricalEvidenceReconciliation(input: {
  closureAudit: ClosureAudit;
  generatedAt?: string;
  resolveEvidencePath?: (reference: string) => string | null;
  inspectEvidence?: (caseId: string, filePath: string) => HistoricalEvidenceInspection;
}): HistoricalEvidenceReconciliationReport {
  const resolveEvidencePath = input.resolveEvidencePath ?? resolveWorkspaceEvidencePath;
  const inspectEvidence = input.inspectEvidence ?? inspectHistoricalEvidence;
  const cases = input.closureAudit.cases.map((item) => {
    const refs = [...new Set((item.historicalEvidenceRefs ?? []).map((reference) => reference.trim()).filter(Boolean))].sort();
    const resolved = refs.map((reference) => ({ reference, filePath: resolveEvidencePath(reference) }));
    const existing = resolved.filter((item): item is { reference: string; filePath: string } => Boolean(item.filePath));
    const missing = refs.filter((reference) => !resolveEvidencePath(reference));
    const inspections = existing.map(({ reference, filePath }) => ({
      reference,
      filePath,
      inspection: inspectEvidence(item.caseId, filePath),
    }));
    const relevant = inspections.filter(({ inspection }) => inspection.casePresent !== false);
    const unrelated = inspections.filter(({ inspection }) => inspection.casePresent === false);
    const diagnostics = [...new Set(relevant.flatMap(({ inspection }) => inspection.diagnostics))].sort();
    const standardReceipt = relevant.some(({ inspection }) => inspection.standardReceipt);
    const legacyFactsPreserved = relevant.some(({ inspection }) => inspection.legacyFactsPreserved === true);
    let status: HistoricalEvidenceReconciliationCase['status'];
    let nextAction: HistoricalEvidenceReconciliationCase['nextAction'];
    let reason: string;
    if (item.matchingCompleteReceipts > 0 || item.state === 'evidence-passed') {
      status = 'already-reconciled';
      nextAction = 'none';
      reason = '已存在标准完整执行收据，不再进入历史证据协调。';
    } else if (item.state !== 'evidence-reconciliation-required') {
      status = 'not-needed';
      nextAction = 'none';
      reason = `当前状态为 ${item.state}，不属于历史通过证据协调范围。`;
    } else if (standardReceipt) {
      status = 'standard-receipt-backfilled';
      nextAction = 'none';
      reason = '历史报告已解析出标准收据；仍需当前用例/实现/上下文兼容性审计，不能视为恢复成功。';
    } else if (relevant.length > 0) {
      status = 'legacy-evidence-found';
      nextAction = 'rerun-candidate';
      reason = legacyFactsPreserved
        ? '旧报告中的执行事实已迁移保留，但缺少标准收据要求的运行上下文或断言合同；不得补造，需受控重验。'
        : '历史产物只证明存在相关记录，不能证明完整执行；已完成迁移检查，需受控重验。';
    } else {
      status = 'no-evidence-source';
      nextAction = 'rerun-candidate';
      reason = '历史通过状态没有可读取的证据文件，补录无法完成，可进入显式重跑审批。';
    }
    return {
      caseId: item.caseId,
      module: item.module,
      state: item.state,
      historicalEvidenceRefs: refs,
      existingEvidenceRefs: relevant.map(({ filePath }) => relativeWorkspace(filePath)),
      unrelatedEvidenceRefs: unrelated.map(({ filePath }) => relativeWorkspace(filePath)),
      missingEvidenceRefs: missing,
      status,
      nextAction,
      reason,
      diagnostics,
    };
  });
  const reconciliationRequired = cases.filter((item) => item.state === 'evidence-reconciliation-required');
  const rerunCandidateCaseIds = reconciliationRequired
    .filter((item) => item.nextAction === 'rerun-candidate')
    .map((item) => item.caseId)
    .sort();
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-historical-evidence-reconciliation',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceAuditGeneratedAt: input.closureAudit.generatedAt,
    checkpointKey: sha256(JSON.stringify({
      sourceAuditGeneratedAt: input.closureAudit.generatedAt,
      cases: cases.map((item) => [item.caseId, item.historicalEvidenceRefs, item.state]),
    })),
    summary: {
      total: cases.length,
      reconciliationRequired: reconciliationRequired.length,
      legacyEvidenceFound: reconciliationRequired.filter((item) => item.existingEvidenceRefs.length > 0).length,
      backfillBlocked: 0,
      standardReceiptBackfilled: cases.filter((item) => item.status === 'standard-receipt-backfilled').length,
      noEvidenceSource: cases.filter((item) => item.status === 'no-evidence-source').length,
      alreadyReconciled: cases.filter((item) => item.status === 'already-reconciled').length,
      rerunCandidates: rerunCandidateCaseIds.length,
      referenceRepairs: cases.filter((item) => item.unrelatedEvidenceRefs.length > 0).length,
      legacyFactsPreserved: cases.filter((item) => item.status === 'legacy-evidence-found').length,
    },
    rerunCandidateCaseIds,
    cases: cases.sort((left, right) => left.caseId.localeCompare(right.caseId)),
    policy: {
      neverPromoteFromLegacyEvidence: true,
      legacyEvidenceMustBeInspectedBeforeRerun: true,
      noAutomaticPageExecution: true,
    },
  };
}

function resolveWorkspaceEvidencePath(reference: string): string | null {
  const candidates = path.isAbsolute(reference)
    ? [reference]
    : [path.resolve(projectRoot, reference), path.resolve(workspaceRoot, reference)];
  return candidates.find((candidate) => isWithinWorkspace(candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function isWithinWorkspace(filePath: string): boolean {
  const relative = path.relative(workspaceRoot, filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function relativeWorkspace(filePath: string): string {
  return path.relative(workspaceRoot, filePath).replaceAll(path.sep, '/');
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function renderMarkdown(report: HistoricalEvidenceReconciliationReport): string {
  return [
    '# 商品中心历史证据协调',
    '',
    `- 来源闭环审计：${report.sourceAuditGeneratedAt}`,
    `- 协调检查点：${report.checkpointKey}`,
    '- 本阶段只补录历史证据，不启动页面执行。',
    '- 历史证据不能直接签发 passed；补录失败后才进入重跑候选。',
    '',
    '| 状态 | 数量 |',
    '| --- | ---: |',
    `| 需协调 | ${report.summary.reconciliationRequired} |`,
    `| 已找到历史证据 | ${report.summary.legacyEvidenceFound} |`,
    `| 仍被迁移合同阻断 | ${report.summary.backfillBlocked} |`,
    `| 已找到可解析标准收据（待当前兼容性审计） | ${report.summary.standardReceiptBackfilled} |`,
    `| 无历史证据来源 | ${report.summary.noEvidenceSource} |`,
    `| 已有标准收据 | ${report.summary.alreadyReconciled} |`,
    `| 重跑候选 | ${report.summary.rerunCandidates} |`,
    `| 已过滤错误证据引用 | ${report.summary.referenceRepairs} |`,
    `| 已保留旧执行事实 | ${report.summary.legacyFactsPreserved} |`,
    '',
    '| 用例 | 状态 | 后续动作 | 历史证据 | 原因 |',
    '| --- | --- | --- | ---: | --- |',
    ...report.cases
      .filter((item) => item.state === 'evidence-reconciliation-required')
      .map((item) => `| ${item.caseId} | ${item.status} | ${item.nextAction} | ${item.existingEvidenceRefs.length}/${item.historicalEvidenceRefs.length} | ${item.reason} |`),
    '',
  ].join('\n');
}

function inspectHistoricalEvidence(caseId: string, filePath: string): HistoricalEvidenceInspection {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { suites?: PlaywrightSuite[] };
    if (Array.isArray(parsed.suites)) {
      const imported = readPlaywrightExecutionReceipts({ reportPath: filePath, workspaceRoot });
      const standardReceipt = imported.records.some((record) => record.caseId === caseId);
      const diagnostics = imported.diagnostics.filter((item) => item.startsWith(`${caseId}:`));
      const legacyInspection = inspectLegacyPlaywrightCase(parsed.suites, caseId);
      return {
        standardReceipt,
        casePresent: standardReceipt || legacyInspection.casePresent,
        legacyFactsPreserved: legacyInspection.executionFactsComplete,
        diagnostics: standardReceipt ? [] : [...new Set([...diagnostics, `${caseId}:HISTORICAL_RECEIPT_SCHEMA_INCOMPLETE`])],
      };
    }
    const content = JSON.stringify(parsed);
    return content.includes(caseId)
      ? {
        standardReceipt: false,
        casePresent: true,
        legacyFactsPreserved: true,
        diagnostics: [`${caseId}:HISTORICAL_ARTIFACT_LEGACY_FORMAT`],
      }
      : {
        standardReceipt: false,
        casePresent: false,
        diagnostics: [`${caseId}:HISTORICAL_ARTIFACT_CASE_NOT_FOUND`],
      };
  } catch {
    return { standardReceipt: false, casePresent: false, diagnostics: [`${caseId}:HISTORICAL_ARTIFACT_UNREADABLE`] };
  }
}

type PlaywrightAttachment = { name?: string; body?: string; contentType?: string };
type PlaywrightResult = { status?: string; attachments?: PlaywrightAttachment[] };
type PlaywrightTest = {
  annotations?: Array<{ type?: string; description?: string }>;
  results?: PlaywrightResult[];
};
type PlaywrightSpec = { tags?: string[]; tests?: PlaywrightTest[] };
type PlaywrightSuite = { specs?: PlaywrightSpec[]; suites?: PlaywrightSuite[] };

function inspectLegacyPlaywrightCase(
  suites: readonly PlaywrightSuite[],
  caseId: string,
): { casePresent: boolean; executionFactsComplete: boolean } {
  const matchingTests = flattenSpecs(suites).flatMap((spec) => (spec.tests ?? [])
    .filter((testItem) => resolvePlaywrightCaseId(spec, testItem) === caseId));
  if (matchingTests.length === 0) return { casePresent: false, executionFactsComplete: false };
  const executionFactsComplete = matchingTests.some((testItem) => {
    const passedResult = [...(testItem.results ?? [])].reverse().find((result) => result.status === 'passed');
    if (!passedResult) return false;
    const payload = readLegacyPayload(passedResult.attachments ?? [], caseId);
    if (!payload || payload.caseId !== caseId) return false;
    const requiredEvidence = new Set(payload.requiredEvidence ?? []);
    const observedEvidence = new Set(payload.observedEvidence ?? []);
    const requiredAssertions = new Set(payload.requiredAssertionIds ?? []);
    const observedAssertions = new Set(payload.observedAssertionIds ?? []);
    if (payload.complete !== true || requiredEvidence.size === 0 || requiredAssertions.size === 0) return false;
    if ([...requiredEvidence].some((value) => !observedEvidence.has(value))) return false;
    if ([...requiredAssertions].some((value) => !observedAssertions.has(value))) return false;
    if (!requiredEvidence.has('cleanup')) return true;
    return Array.isArray(payload.cleanup?.entries)
      && payload.cleanup.entries.length > 0
      && payload.cleanup.entries.every((entry) => entry.phase === 'residue-verified');
  });
  return { casePresent: true, executionFactsComplete };
}

function flattenSpecs(suites: readonly PlaywrightSuite[]): PlaywrightSpec[] {
  return suites.flatMap((suite) => [...(suite.specs ?? []), ...flattenSpecs(suite.suites ?? [])]);
}

function resolvePlaywrightCaseId(spec: PlaywrightSpec, testItem: PlaywrightTest): string | null {
  const annotation = testItem.annotations?.find((item) => (
    ['case-id', 'canonical-case-id', 'group-case-id'].includes(item.type ?? '')
  ))?.description;
  if (annotation) return annotation;
  return spec.tags?.find((item) => item.startsWith('@case-') || item.startsWith('case-'))
    ?.replace(/^@?case-/, '') ?? null;
}

function readLegacyPayload(
  attachments: readonly PlaywrightAttachment[],
  caseId: string,
): {
  caseId?: string;
  complete?: boolean;
  requiredEvidence?: string[];
  observedEvidence?: string[];
  requiredAssertionIds?: string[];
  observedAssertionIds?: string[];
  cleanup?: { entries?: Array<{ phase?: string }> } | null;
} | null {
  const attachment = attachments.find((item) => item.contentType === 'application/json'
    && (item.name === 'product-center-group-runtime-evidence' || item.name === `${caseId}-runtime-evidence`));
  if (!attachment?.body) return null;
  try {
    return JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8')) as ReturnType<typeof readLegacyPayload>;
  } catch {
    return null;
  }
}

export function runHistoricalEvidenceReconciliation(): HistoricalEvidenceReconciliationReport {
  const closurePath = process.env.PC_CLOSURE_AUDIT_PATH?.trim()
    ? path.resolve(projectRoot, process.env.PC_CLOSURE_AUDIT_PATH.trim())
    : path.join(governanceRoot, 'product-center-closure-audit.json');
  if (!fs.existsSync(closurePath)) throw new Error('历史证据协调前必须先生成闭环审计。');
  const report = buildHistoricalEvidenceReconciliation({ closureAudit: readJson<ClosureAudit>(closurePath) });
  writeText(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  writeText(markdownPath, renderMarkdown(report));
  writeText(path.join(governanceRoot, 'product-center-rerun-candidate-selection.json'), `${JSON.stringify({
    schemaVersion: '1.0.0',
    source: 'product-center-historical-evidence-reconciliation',
    sourceGeneratedAt: report.generatedAt,
    status: 'pending-explicit-approval',
    caseIds: report.rerunCandidateCaseIds,
    automaticExecution: false,
  }, null, 2)}\n`);
  const blockedCases = report.cases.filter((item) => item.status === 'backfill-blocked');
  writeText(path.join(governanceRoot, 'product-center-historical-receipt-migration-backlog.json'), `${JSON.stringify({
    schemaVersion: '1.0.0',
    sourceGeneratedAt: report.generatedAt,
    status: blockedCases.length > 0 ? 'required' : 'not-required',
    summary: {
      cases: blockedCases.length,
      evidenceFiles: [...new Set(blockedCases.flatMap((item) => item.existingEvidenceRefs))].length,
      playwrightReceiptAdapterCases: blockedCases.filter((item) => item.diagnostics.some((value) => value.includes('RUNTIME_RECEIPT_'))).length,
      legacyArtifactAdapterCases: blockedCases.filter((item) => item.diagnostics.some((value) => value.endsWith('HISTORICAL_ARTIFACT_LEGACY_FORMAT'))).length,
      evidenceReferenceRepairCases: blockedCases.filter((item) => item.diagnostics.some((value) => value.endsWith('HISTORICAL_ARTIFACT_CASE_NOT_FOUND'))).length,
    },
    tasks: [
      {
        id: 'playwright-receipt-v1-adapter',
        caseIds: blockedCases.filter((item) => item.diagnostics.some((value) => value.includes('RUNTIME_RECEIPT_'))).map((item) => item.caseId),
        action: '只从旧 Playwright 报告中可证明的字段生成迁移记录；缺失断言、上下文或清理证据时不得补造。',
      },
      {
        id: 'legacy-artifact-adapter',
        caseIds: blockedCases.filter((item) => item.diagnostics.some((value) => value.endsWith('HISTORICAL_ARTIFACT_LEGACY_FORMAT'))).map((item) => item.caseId),
        action: '为非 Playwright 历史产物建立显式字段映射；不能证明完整执行时仅保留历史事实。',
      },
      {
        id: 'evidence-reference-repair',
        caseIds: blockedCases.filter((item) => item.diagnostics.some((value) => value.endsWith('HISTORICAL_ARTIFACT_CASE_NOT_FOUND'))).map((item) => item.caseId),
        action: '修复过宽或错误的证据引用，使每条用例只绑定确实包含该 caseId 的报告。',
      },
    ],
    policy: {
      requiresPageRerun: false,
      automaticPassPromotion: false,
      rerunOnlyAfterMigrationCannotProveExecution: true,
    },
  }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report.summary)}\n`);
  return report;
}

if (require.main === module) runHistoricalEvidenceReconciliation();
