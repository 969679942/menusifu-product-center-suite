import type { AuditAggregate, AuditEvent } from '../../../../Test Automation Platform/src/audit/event-log';
import { aggregateAuditEvents } from '../../../../Test Automation Platform/src/audit/event-log';
import { assessRuntimeAuditFreshness } from '../../../../Test Automation Platform/src/utils/runtime-audit-freshness';

export type ProductCenterAuditExecutionContext = {
  environmentId: string | null;
  environmentFingerprint: string | null;
  roleId: string | null;
  tenantScope: string | null;
  locale: string | null;
  sourceScope: string | null;
};

export type ProductCenterAuditSource = {
  id: string;
  path: string;
  observedAt: string | null;
  fingerprint: string | null;
  available: boolean;
};

export type ProductCenterAuditFreshness = {
  status: 'fresh' | 'stale' | 'invalid';
  observedAt: string | null;
  freshUntil: string | null;
  evaluatedAt: string;
  maxAgeDays: number;
  reasons: string[];
  sources: ProductCenterAuditSource[];
  executionContext: ProductCenterAuditExecutionContext;
  fingerprints: {
    applicationVersionFingerprint: string | null;
    pageContractFingerprint: string | null;
    apiObservationFingerprint: string | null;
    sourceFingerprint: string | null;
    implementationFingerprint: string | null;
    executionContextFingerprint: string | null;
  };
};

export type ProductCenterAuditFreshnessInput = {
  observedAt?: string | null;
  freshUntil?: string | null;
  evaluatedAt?: string;
  maxAgeDays?: number;
  sources?: ProductCenterAuditSource[];
  executionContext?: Partial<ProductCenterAuditExecutionContext>;
  expectedContext?: Partial<ProductCenterAuditExecutionContext>;
  fingerprints?: Partial<ProductCenterAuditFreshness['fingerprints']>;
  expectedApplicationVersionFingerprint?: string | null;
  expectedExecutionContextFingerprint?: string | null;
};

export type ProductCenterAuditReport = {
  schemaVersion: '1.0.0';
  reportType: 'product-center-audit-mvp';
  applicationId: 'merchant-center';
  businessDomainId: 'product-center';
  generatedAt: string;
  observedAt: string | null;
  freshUntil: string | null;
  executionContext: ProductCenterAuditExecutionContext;
  fingerprints: ProductCenterAuditFreshness['fingerprints'];
  freshness: ProductCenterAuditFreshness;
  overview: AuditAggregate & {
    uniqueRuns: number;
    uniqueCases: number;
    approvedCorrections: number;
    changeEvidence: { status: 'provided' | 'not-provided'; events: number; message: string };
    cleanupEvidence: { receipts: number; apiZero: number; uiZero: number; bothZero: number; residue: number; message: string };
    completeness: {
      status: 'formal' | 'provisional';
      message: string;
      operationCases: number;
      evidenceCases: number;
      auditEligibleCases: number;
      operationCoverageRate: number | null;
      structuredDiffCoverageRate: number | null;
      cleanupCoverageRate: number | null;
      provisionalOperationCoverageRate: number;
      orphanEvents: number;
    };
  };
  correctionFunnel: {
    candidate: number;
    approved: number;
    started: number;
    completed: number;
    blocked: number;
    affectedCases: number;
  };
  callAudit: Array<{ eventType: string; count: number; firstAt: string | null; lastAt: string | null }>;
  operationAudit: Array<{ operationKey: string; count: number; firstAt: string | null; lastAt: string | null }>;
  /** 面向业务读者的运行复盘视图；技术事件仍完整保留在 timeline 中。 */
  runSummaries: ProductCenterAuditRunSummary[];
  changeLedger: ProductCenterAuditChange[];
  trend: Array<{ date: string; runs: number; passed: number; failed: number; blocked: number; notRun: number; dataChanges: number }>;
  timeline: Array<{
    sequence: number;
    occurredAt: string;
    eventType: string;
    outcome: string;
    actorType: string;
    runId: string | null;
    caseId: string | null;
    correctionId: string | null;
    durationMs: number | null;
    dataChanged: boolean;
    details: unknown;
  }>;
  caseTracking: Array<{
    caseId: string;
    eventCount: number;
    firstAt: string;
    lastAt: string;
    runIds: string[];
    correctionIds: string[];
    eventTypes: Record<string, number>;
    evidenceRefs: string[];
    receiptHistory: Array<{ occurredAt: string; runId: string | null; status: string; caseFingerprint: string | null; implementationFingerprint: string | null; reason?: string | null }>;
    latestReceipt: { occurredAt: string; runId: string | null; status: string; caseFingerprint: string | null; implementationFingerprint: string | null; reason?: string | null } | null;
    historicalReceiptCount: number;
    arbitrationStatus: 'not-provided';
    changes: Array<{
      occurredAt: string;
      eventType: string;
      beforeFingerprint: string | null;
      afterFingerprint: string | null;
      details: unknown;
    }>;
    title?: string;
    scriptPaths?: string[];
    ruleIds?: string[];
  }>;
};

export type ProductCenterAuditRunSummary = {
  runId: string;
  logicalRunId: string;
  displayName: string;
  runType: '业务执行' | '来源治理执行' | '规则复验' | '静态审计' | '证据采集' | '内部评估' | '其他';
  triggerType: string;
  scopeLabel: string;
  technicalRunIds: string[];
  comparableRunId: string | null;
  firstAt: string;
  lastAt: string;
  status: 'passed' | 'failed' | 'blocked' | 'not-run' | 'unknown';
  eventCount: number;
  caseCount: number;
  caseIds: string[];
  counts: { passed: number; failed: number; blocked: number; notRun: number; skipped: number };
  operationCount: number;
  dataChangeCount: number;
  ruleChangeCount: number;
  phases: Array<{ key: string; label: string; count: number }>;
  sourceRefs: string[];
  blockedReasons: string[];
};

export type ProductCenterAuditChange = {
  occurredAt: string;
  runId: string | null;
  objectType: '测试方案' | '业务规则' | '正式用例' | '自动化脚本' | '绑定关系' | '数据与清理' | '其他';
  objectId: string;
  title: string;
  decision: string | null;
  outcome: string;
  beforeFingerprint: string | null;
  afterFingerprint: string | null;
  changedFields: string[];
  linkedCaseIds: string[];
  sourceRefs: string[];
  bindingIds: string[];
  executionProof: string | null;
  nextAction: string;
  /** 脱敏后的前后内容与逐行差异；历史缺失时明确为空。 */
  beforeContent?: unknown;
  afterContent?: unknown;
  unifiedDiff?: string;
  snapshotRef?: string;
  changedBy?: string;
  changeSource?: string;
  changeReason?: string;
  contentAvailable?: { before: boolean; after: boolean };
};

/** Includes the product-center domain and its adapter-owned subdomains such as seasoning. */
export function filterProductCenterAuditEvents(events: readonly AuditEvent[]): AuditEvent[] {
  return events.filter((event) => event.applicationId === 'merchant-center'
    && (event.businessDomainId === 'product-center' || event.businessDomainId?.startsWith('product-center-')));
}

export function buildProductCenterAuditReport(
  events: readonly AuditEvent[],
  options: { generatedAt?: string; freshness?: ProductCenterAuditFreshness; caseCatalog?: Record<string, { title?: string; scriptPaths?: string[]; ruleIds?: string[] }> } = {},
): ProductCenterAuditReport {
  const ordered = [...events].sort((left, right) => (
    left.occurredAt.localeCompare(right.occurredAt) || left.eventSequence - right.eventSequence
  ));
  const aggregate = aggregateAuditEvents(ordered);
  const correctionCandidates = ordered.filter((event) => event.eventType === 'correction.candidate');
  const approvedCorrections = ordered.filter((event) => event.eventType === 'correction.approved').length;
  const eventTypeGroups = groupBy(ordered, (event) => event.eventType);
  const operationGroups = groupBy(ordered.filter((event) => event.eventType === 'operation.called'), (event) => {
    const operationKey = (event.details && typeof event.details === 'object' && 'operationKey' in event.details)
      ? String((event.details as Record<string, unknown>).operationKey ?? '') : '';
    return operationKey || 'unknown-operation';
  });
  const caseGroups = groupBy(ordered.filter((event) => Boolean(event.caseId) && !isNonBusinessCaseId(event.caseId!)), (event) => event.caseId!);
  const changeEvents = ordered.filter((event) => event.dataChanged === true || event.beforeFingerprint != null || event.afterFingerprint != null);
  const cleanupStats = ordered.filter((event) => event.eventType === 'evidence.recorded').reduce((result, event) => {
    const details = event.details && typeof event.details === 'object' ? event.details as Record<string, unknown> : {};
    const cleanup = details.cleanupEvidence && typeof details.cleanupEvidence === 'object'
      ? details.cleanupEvidence as { apiZeroResidue?: boolean; uiZeroResidue?: boolean } : undefined;
    if (!cleanup) return result;
    result.receipts += 1;
    if (cleanup.apiZeroResidue === true) result.apiZero += 1;
    if (cleanup.uiZeroResidue === true) result.uiZero += 1;
    if (cleanup.apiZeroResidue === true && cleanup.uiZeroResidue === true) result.bothZero += 1;
    if (cleanup.apiZeroResidue === false || cleanup.uiZeroResidue === false) result.residue += 1;
    return result;
  }, { receipts: 0, apiZero: 0, uiZero: 0, bothZero: 0, residue: 0 });
  const cleanupCompleteCases = new Set(ordered.filter((event) => {
    if (event.eventType !== 'evidence.recorded' || !event.caseId || !event.details || typeof event.details !== 'object') return false;
    const cleanup = (event.details as Record<string, unknown>).cleanupEvidence;
    return Boolean(cleanup && typeof cleanup === 'object'
      && (cleanup as { apiZeroResidue?: boolean }).apiZeroResidue === true
      && (cleanup as { uiZeroResidue?: boolean }).uiZeroResidue === true);
  }).map((event) => event.caseId!));
  const evidenceCases = new Set(ordered.filter((event) => event.eventType === 'evidence.recorded' && event.caseId).map((event) => event.caseId!));
  const operationCases = new Set(ordered.filter((event) => event.eventType === 'operation.called' && event.caseId).map((event) => event.caseId!));
  const diffCases = new Set(changeEvents.filter((event) => event.caseId).map((event) => event.caseId!));
  const orphanEvents = ordered.filter((event) => ['case.started', 'case.completed', 'evidence.recorded', 'operation.called'].includes(event.eventType) && (!event.caseId || !event.runId)).length;
  const requirementEvents = ordered.filter((event) => ['evidence.recorded', 'audit.case-classified'].includes(event.eventType) && readAuditRequirements(event) !== null);
  const operationEligibleCases = new Set(requirementEvents.filter((event) => readAuditRequirements(event)?.operationExpected).map((event) => event.caseId).filter(Boolean));
  const diffEligibleCases = new Set(requirementEvents.filter((event) => readAuditRequirements(event)?.structuredDiffExpected).map((event) => event.caseId).filter(Boolean));
  const cleanupEligibleCases = new Set(requirementEvents.filter((event) => readAuditRequirements(event)?.cleanupExpected).map((event) => event.caseId).filter(Boolean));
  const requirementsProvided = requirementEvents.length > 0;
  const freshness = options.freshness ?? buildProductCenterAuditFreshness({
    evaluatedAt: options.generatedAt,
  });
  const runSummaries = buildRunSummaries(ordered);
  const changeLedger = buildChangeLedger(ordered);
  const trend = buildTrend(ordered);
  const ruleIdsByCase = new Map<string, string[]>();
  for (const change of changeLedger) {
    if (change.objectType !== '业务规则' || !change.objectId || change.objectId === '未提供规则编号') continue;
    for (const caseId of change.linkedCaseIds) {
      ruleIdsByCase.set(caseId, unique([...(ruleIdsByCase.get(caseId) ?? []), change.objectId]));
    }
  }
  return {
    schemaVersion: '1.0.0',
    reportType: 'product-center-audit-mvp',
    applicationId: 'merchant-center',
    businessDomainId: 'product-center',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    observedAt: freshness.observedAt,
    freshUntil: freshness.freshUntil,
    executionContext: freshness.executionContext,
    fingerprints: freshness.fingerprints,
    freshness,
    overview: {
      ...aggregate,
      uniqueRuns: runSummaries.length,
      uniqueCases: caseGroups.size,
      approvedCorrections,
      changeEvidence: {
        status: changeEvents.length > 0 ? 'provided' : 'not-provided',
        events: changeEvents.length,
        message: changeEvents.length > 0
          ? '已提供结构化变更证据（before/after 指纹或 changedFields）。'
          : '未提供结构化变更证据；当前报告不能推断具体字段变更。',
      },
      cleanupEvidence: {
        ...cleanupStats,
        message: cleanupStats.receipts > 0
          ? `已从 ${cleanupStats.receipts} 条执行收据汇总 API/UI 清理证据。`
          : '未提供结构化 API/UI 清理证据。',
      },
      completeness: {
        status: requirementsProvided ? 'formal' : 'provisional',
        message: requirementsProvided
          ? '覆盖率分母来自审计合同 v1.1 的 auditEligible 声明。'
          : '历史收据未提供审计合同 v1.1；覆盖率仅为临时观察值，不作为正式质量结论。',
        operationCases: operationCases.size,
        evidenceCases: evidenceCases.size,
        auditEligibleCases: new Set([...operationEligibleCases, ...diffEligibleCases, ...cleanupEligibleCases]).size,
        operationCoverageRate: requirementsProvided && operationEligibleCases.size
          ? Number(([...operationEligibleCases].filter((caseId) => operationCases.has(caseId!)).length / operationEligibleCases.size).toFixed(4)) : null,
        structuredDiffCoverageRate: requirementsProvided && diffEligibleCases.size
          ? Number(([...diffEligibleCases].filter((caseId) => diffCases.has(caseId!)).length / diffEligibleCases.size).toFixed(4)) : null,
        cleanupCoverageRate: requirementsProvided && cleanupEligibleCases.size
          ? Number(([...cleanupEligibleCases].filter((caseId) => cleanupCompleteCases.has(caseId!)).length / cleanupEligibleCases.size).toFixed(4)) : null,
        provisionalOperationCoverageRate: evidenceCases.size ? Number((operationCases.size / evidenceCases.size).toFixed(4)) : 0,
        orphanEvents,
      },
    },
    correctionFunnel: {
      candidate: aggregate.correction.triggered,
      approved: approvedCorrections,
      started: aggregate.correction.started,
      completed: aggregate.correction.completed,
      blocked: aggregate.correction.blocked + correctionCandidates.filter((event) => event.outcome === 'blocked').length,
      affectedCases: aggregate.correction.affectedCases,
    },
    callAudit: [...eventTypeGroups.entries()].map(([eventType, group]) => ({
      eventType,
      count: group.length,
      firstAt: group[0]?.occurredAt ?? null,
      lastAt: group.at(-1)?.occurredAt ?? null,
    })).sort((left, right) => right.count - left.count || left.eventType.localeCompare(right.eventType)),
    operationAudit: [...operationGroups.entries()].map(([operationKey, group]) => ({
      operationKey,
      count: group.length,
      firstAt: group[0]?.occurredAt ?? null,
      lastAt: group.at(-1)?.occurredAt ?? null,
    })).sort((left, right) => right.count - left.count || left.operationKey.localeCompare(right.operationKey)),
    runSummaries,
    changeLedger,
    trend,
    timeline: ordered.map((event) => ({
      sequence: event.eventSequence,
      occurredAt: event.occurredAt,
      eventType: event.eventType,
      outcome: event.outcome ?? 'unknown',
      actorType: event.actorType,
      runId: event.runId ?? null,
      caseId: event.caseId ?? null,
      correctionId: event.correctionId ?? null,
      durationMs: event.durationMs ?? null,
      dataChanged: event.dataChanged === true,
      details: event.details ?? null,
    })),
    caseTracking: [...caseGroups.entries()].map(([caseId, group]) => {
      const receiptHistory = group.filter((event) => event.eventType === 'evidence.recorded').map((event) => ({
        occurredAt: event.occurredAt,
        runId: event.runId ?? null,
        status: readDetailText(event, 'receiptStatus') ?? event.outcome ?? 'unknown',
        caseFingerprint: readDetailText(event, 'caseFingerprint'),
        implementationFingerprint: readDetailText(event, 'implementationFingerprint'),
        reason: readDetailText(event, 'reason') ?? readDetailText(event, 'failureCategory') ?? readDetailText(event, 'blockedReason'),
      })).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
      return ({
      caseId,
      eventCount: group.length,
      firstAt: group[0].occurredAt,
      lastAt: group.at(-1)!.occurredAt,
      runIds: unique(group.flatMap((event) => event.runId ? [event.runId] : [])),
      correctionIds: unique(group.flatMap((event) => event.correctionId ? [event.correctionId] : [])),
      eventTypes: Object.fromEntries(
        [...groupBy(group, (event) => event.eventType).entries()].map(([type, values]) => [type, values.length]),
      ),
      evidenceRefs: unique(group.flatMap((event) => event.evidenceRefs ?? [])),
      receiptHistory,
      latestReceipt: receiptHistory.at(-1) ?? null,
      historicalReceiptCount: Math.max(0, receiptHistory.length - 1),
      // The report displays receipt facts only; current verdict remains owned by the common arbiter.
      arbitrationStatus: 'not-provided' as const,
      changes: group.filter((event) => event.dataChanged || event.beforeFingerprint || event.afterFingerprint).map((event) => ({
        occurredAt: event.occurredAt,
        eventType: event.eventType,
        beforeFingerprint: event.beforeFingerprint ?? null,
        afterFingerprint: event.afterFingerprint ?? null,
        details: event.details ?? null,
      })),
      title: options.caseCatalog?.[caseId]?.title,
      scriptPaths: options.caseCatalog?.[caseId]?.scriptPaths ?? [],
        ruleIds: unique([...(options.caseCatalog?.[caseId]?.ruleIds ?? []), ...(ruleIdsByCase.get(caseId) ?? [])]),
    }); }).sort((left, right) => left.caseId.localeCompare(right.caseId)),
  };
}

function detailsOf(event: AuditEvent): Record<string, unknown> {
  return event.details && typeof event.details === 'object' && !Array.isArray(event.details)
    ? event.details as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function phaseFor(event: AuditEvent): { key: string; label: string } {
  const details = detailsOf(event);
  const phase = String(details.phase ?? '');
  const map: Record<string, string> = {
    initialize: '初始化运行环境', seed: '准备测试数据', 'action-readiness': '操作前检查',
    'context-guard': '环境与权限检查', capability: '业务操作', assertion: '结果验证',
    'business-operation': '业务操作', read: '读取与同步',
    cleanup: '数据清理', close: '运行收口', started: '用例开始', completed: '用例完成',
  };
  if (map[phase]) return { key: phase, label: map[phase] };
  if (event.eventType === 'case.started') return { key: 'started', label: '用例开始' };
  if (event.eventType === 'case.completed') return { key: 'completed', label: '用例完成' };
  if (event.eventType === 'flow.started') return { key: 'flow', label: '流程编排' };
  if (event.eventType === 'flow.completed') return { key: 'flow', label: '流程编排' };
  if (event.eventType.startsWith('business-rule.evaluation')) return { key: 'business-rule', label: '业务规则评估' };
  if (event.eventType === 'business-rule.decision') return { key: 'business-rule', label: '业务规则决策' };
  if (event.eventType.startsWith('correction.')) return { key: 'correction', label: '用例纠正' };
  if (event.eventType === 'operation.started' || event.eventType === 'operation.called') return { key: 'operation', label: '业务操作调用' };
  if (event.eventType === 'evidence.recorded') return { key: 'evidence', label: '证据记录' };
  if (event.eventType.startsWith('plan.')) return { key: 'plan', label: '执行计划' };
  if (event.eventType.startsWith('batch.')) return { key: 'batch', label: '批次执行' };
  if (event.eventType.startsWith('flow.')) return { key: 'flow', label: '流程编排' };
  if (event.eventType.startsWith('run.')) return { key: 'run', label: '运行控制' };
  return { key: event.eventType, label: event.eventType };
}

function statusOf(value: unknown): ProductCenterAuditRunSummary['status'] {
  const status = String(value ?? '').toLowerCase();
  if (status === 'not-run' || status === 'not_run') return 'not-run';
  if (status === 'blocked' || status.includes('blocked')) return 'blocked';
  if (status === 'failed' || status === 'error') return 'failed';
  if (status === 'passed' || status === 'success' || status === 'completed') return 'passed';
  return 'unknown';
}

function buildRunSummaries(events: readonly AuditEvent[]): ProductCenterAuditRunSummary[] {
  const rawGroups = groupBy(events.filter((event) => Boolean(event.runId)), (event) => String(event.runId));
  const logicalGroups = new Map<string, { technicalRunIds: string[]; events: AuditEvent[] }>();
  for (const [technicalRunId, group] of rawGroups.entries()) {
    const declaredLogicalRunId = group.map((event) => detailsOf(event).logicalRunId)
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    const logicalRunId = declaredLogicalRunId?.trim() || logicalRunKey(technicalRunId);
    const existing = logicalGroups.get(logicalRunId) ?? { technicalRunIds: [], events: [] };
    existing.technicalRunIds.push(technicalRunId);
    existing.events.push(...group);
    logicalGroups.set(logicalRunId, existing);
  }
  const summaries = [...logicalGroups.entries()].map(([logicalRunId, logicalGroup]) => {
    const group = logicalGroup.events.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.eventSequence - right.eventSequence);
    const runId = logicalRunId;
    const caseIds = unique(group.flatMap((event) => event.caseId && !isNonBusinessCaseId(event.caseId) ? [event.caseId] : []));
    const counts = { passed: 0, failed: 0, blocked: 0, notRun: 0, skipped: 0 };
    // 一个运行可能先写入“临时/不完整收据”，随后再写入完整收据。
    // 运行汇总必须按用例去重，并只采用每个用例最后一条有状态的收据，
    // 否则同一个用例会被重复计数，导致“通过 10 条、实际只有 7 条”的错误结论。
    const latestByCase = new Map<string, { state: ProductCenterAuditRunSummary['status']; event: AuditEvent; priority: number }>();
    for (const event of group) {
      if (!event.caseId || isNonBusinessCaseId(event.caseId)) continue;
      const details = detailsOf(event);
      const isCaseResult = event.eventType === 'evidence.recorded' || event.eventType === 'case.completed'
        || details.receiptStatus != null || details.caseStatus != null;
      if (!isCaseResult) continue;
      const rawStatus = details.receiptStatus ?? details.status ?? event.outcome;
      const state = statusOf(rawStatus);
      const isSkipped = event.outcome === 'skipped' || details.status === 'skipped';
      if (state === 'unknown' && !isSkipped) continue;
      const candidate = { state: isSkipped ? 'unknown' as const : state, event, priority: caseResultPriority(event) };
      const previous = latestByCase.get(event.caseId);
      if (!previous || candidate.priority > previous.priority || (candidate.priority === previous.priority && (event.occurredAt.localeCompare(previous.event.occurredAt) > 0
        || (event.occurredAt === previous.event.occurredAt && event.eventSequence > previous.event.eventSequence)))) {
        latestByCase.set(event.caseId, candidate);
      }
    }
    for (const { state } of latestByCase.values()) {
      if (state === 'passed') counts.passed++;
      else if (state === 'failed') counts.failed++;
      else if (state === 'blocked') counts.blocked++;
      else if (state === 'not-run') counts.notRun++;
      else counts.skipped++;
    }
    // blocked/not-run 表示运行未完整收口；即使已有部分通过，也不能只显示“未执行”。
    const status: ProductCenterAuditRunSummary['status'] = counts.blocked > 0 || counts.notRun > 0 ? 'blocked'
      : counts.failed > 0 ? 'failed'
        : counts.passed > 0 && counts.passed === latestByCase.size ? 'passed' : 'unknown';
    const phaseGroups = groupBy(group, (event) => phaseFor(event).key);
    const phases = [...phaseGroups.entries()].map(([key, values]) => ({ key, label: phaseFor(values[0]).label, count: values.length }))
      .sort((left, right) => right.count - left.count);
    const runType = inferRunType(runId, group);
    const triggerType = inferTriggerType(runId, group, runType);
    const scopeLabel = inferScopeLabel(caseIds, group);
    const blockedReasons = unique(group.flatMap((event) => {
      const details = detailsOf(event);
      return stringArray(details.blockedReasons).concat(
        typeof details.failureCategory === 'string' ? [details.failureCategory] : [],
        typeof details.reason === 'string' && (statusOf(details.receiptStatus ?? details.status ?? event.outcome) === 'not-run' || event.outcome === 'blocked') ? [details.reason] : [],
      );
    }));
    const displayName = buildRunDisplayName({ runId, runType, triggerType, scopeLabel, firstAt: group[0].occurredAt, caseCount: caseIds.length, counts });
    return {
      runId, logicalRunId, displayName, runType, triggerType, scopeLabel,
      technicalRunIds: unique(logicalGroup.technicalRunIds), comparableRunId: null,
      firstAt: group[0].occurredAt, lastAt: group.at(-1)!.occurredAt, status,
      eventCount: group.length, caseCount: caseIds.length, caseIds, counts,
      operationCount: group.filter((event) => event.eventType === 'operation.called').length,
      dataChangeCount: group.filter((event) => event.dataChanged === true || event.beforeFingerprint != null || event.afterFingerprint != null).length,
      ruleChangeCount: group.filter((event) => event.eventType === 'business-rule.decision' && String(detailsOf(event).decision ?? '') !== 'no-change').length,
      phases, sourceRefs: unique(group.flatMap((event) => [...(event.evidenceRefs ?? []), ...stringArray(detailsOf(event).sourceArtifacts), ...stringArray(detailsOf(event).sourceRefs)])),
      blockedReasons,
    };
  // 只有绑定到业务用例的运行才进入业务运行列表；孤立的运行生命周期事件仍保留在原始时间线。
  }).filter((summary) => summary.caseCount > 0)
    .sort((left, right) => right.lastAt.localeCompare(left.lastAt));
  return summaries.map((summary, index) => {
    const comparable = summaries.slice(index + 1).find((candidate) => candidate.runType === summary.runType
      && candidate.scopeLabel === summary.scopeLabel) ?? summaries.slice(index + 1).find((candidate) => candidate.runType === summary.runType);
    return { ...summary, comparableRunId: comparable?.runId ?? null };
  });
}

function logicalRunKey(runId: string): string {
  const sourceGoverned = runId.match(/^source-governed-(\d{8}T\d{6}Z)$/);
  return sourceGoverned ? sourceGoverned[1] : runId;
}

function isNonBusinessCaseId(caseId: string): boolean {
  return caseId === '__setup__' || caseId === 'setup' || caseId.startsWith('__');
}

function inferRunType(runId: string, events: readonly AuditEvent[]): ProductCenterAuditRunSummary['runType'] {
  const runTypes = events.flatMap((event) => {
    const value = detailsOf(event).runType;
    return typeof value === 'string' ? [value.toLowerCase()] : [];
  });
  if (runId.includes('rule-promotion') || runId.includes('rule-revalidation') || runTypes.some((value) => value.includes('rule'))) return '规则复验';
  if (runId.includes('audit') || events.some((event) => event.eventType.startsWith('audit.'))) return '静态审计';
  if (runId.includes('source-governed') || events.some((event) => detailsOf(event).sourceKind === 'system-test-progress')) return '来源治理执行';
  if (events.some((event) => event.eventType === 'evidence.recorded') && !events.some((event) => event.eventType === 'case.started' || event.eventType === 'operation.called')) return '证据采集';
  if (events.some((event) => event.eventType === 'case.started' || event.eventType === 'operation.called')) return '业务执行';
  return '其他';
}

function inferTriggerType(runId: string, events: readonly AuditEvent[], runType: ProductCenterAuditRunSummary['runType']): string {
  if (runType === '规则复验') return '业务规则变更触发';
  if (runId.includes('canary')) return '试运行触发';
  if (runId.includes('batch')) return '批次触发';
  if (runId.includes('source-governed') || events.some((event) => detailsOf(event).sourceKind === 'system-test-progress')) return '来源治理触发';
  const triggerType = events.map((event) => detailsOf(event).triggerType).find((value): value is string => typeof value === 'string' && value.length > 0);
  if (triggerType) return triggerType;
  const triggerSource = events.map((event) => detailsOf(event).triggerSource).find((value): value is string => typeof value === 'string' && value.length > 0);
  if (triggerSource) return triggerSource;
  return '历史记录导入';
}

function inferScopeLabel(caseIds: readonly string[], events: readonly AuditEvent[]): string {
  const modules = unique(caseIds.map((caseId) => caseId.split('-')[1] ?? '').filter(Boolean));
  const moduleNames: Record<string, string> = { ITEM: '商品', PKG: '套餐商品', STD: '标准商品', ADD: '加料商品', GRP: '商品组', TAG: '标签' };
  const domain = modules.length === 1 ? (moduleNames[modules[0]] ?? modules[0]) : modules.length > 1 ? '多个模块' : (events.some((event) => event.eventType.startsWith('business-rule.')) ? '业务规则' : '未标明范围');
  return `${domain} / ${caseIds.length} 个用例`;
}

function buildRunDisplayName(input: { runId: string; runType: ProductCenterAuditRunSummary['runType']; triggerType: string; scopeLabel: string; firstAt: string; caseCount: number; counts: ProductCenterAuditRunSummary['counts'] }): string {
  const date = input.firstAt.replace('T', ' ').replace('Z', ' UTC').slice(0, 19);
  const result = `${input.counts.passed} 通过 / ${input.counts.failed} 失败 / ${input.counts.notRun} 未执行`;
  return `${date} · ${input.runType} · ${input.triggerType} · ${input.scopeLabel} · ${result}`;
}

function buildChangeLedger(events: readonly AuditEvent[]): ProductCenterAuditChange[] {
  return events.filter((event) => {
    const details = detailsOf(event);
    const decision = String(details.decision ?? '');
    // evaluation.started/completed 只是评估生命周期，不是“改了什么”；
    // 它们仍完整保留在技术时间线，但不应污染业务变更总览。
    if (event.eventType === 'business-rule.evaluation.started' || event.eventType === 'business-rule.evaluation.completed') return false;
    if (event.eventType === 'business-rule.decision' && decision === 'no-change') return false;
    return event.dataChanged === true || event.beforeFingerprint != null || event.afterFingerprint != null
      || ['case.updated', 'case.fingerprint_changed', 'implementation.fingerprint_changed', 'binding.updated', 'plan.compiled', 'business-rule.decision', 'correction.candidate', 'correction.approved'].includes(event.eventType)
      || (decision && decision !== 'no-change');
  }).map((event) => {
    const details = detailsOf(event);
    const decision = typeof details.decision === 'string' ? details.decision : null;
    const linkedCaseIds = unique([...(event.caseId ? [event.caseId] : []), ...stringArray(details.linkedCaseIds), ...stringArray(details.affectedCaseIds)]);
    const objectType: ProductCenterAuditChange['objectType'] = event.eventType.startsWith('business-rule.') ? '业务规则'
      : event.eventType.startsWith('case.') ? '正式用例'
        : event.eventType.startsWith('implementation.') ? '自动化脚本'
          : event.eventType.startsWith('binding.') ? '绑定关系'
            : event.eventType.startsWith('plan.') ? '测试方案' : event.eventType.startsWith('correction.') ? '正式用例' : '其他';
    const objectTypeWithData: ProductCenterAuditChange['objectType'] = objectType === '其他'
      && (event.eventType === 'operation.called' || event.eventType === 'evidence.recorded') ? '数据与清理' : objectType;
    const objectId = objectTypeWithData === '业务规则' ? String(details.ruleId ?? '未提供规则编号')
      : objectType === '自动化脚本' ? String(details.implementationFingerprint ?? event.eventId)
        : event.caseId ?? String(details.ruleId ?? event.eventId);
    const rawChangedFields = unique([...stringArray(details.changedFields), ...stringArray(details.fields), ...stringArray(details.patchFields)]);
    const changedFields = rawChangedFields.length > 0 ? rawChangedFields
      : event.eventType === 'business-rule.decision' && (event.beforeFingerprint != null || event.afterFingerprint != null)
        ? ['ruleFingerprint', 'sourceFingerprint'] : [];
    const sourceRefs = unique([...(event.evidenceRefs ?? []), ...stringArray(details.sourceArtifacts), ...stringArray(details.sourceRefs), ...stringArray(details.executionReceiptRefs)]);
    const bindingIds = stringArray(details.linkedBindingIds);
    const nextAction = decision === 'revalidation-required' || event.outcome === 'blocked' ? '需要重新验证或解除阻断'
      : decision === 'formal-rule-updated' ? '规则已更新，检查关联用例是否全部完成验证'
        : event.eventType.startsWith('correction.') ? '按纠正状态继续跟踪' : '无需额外动作';
    const snapshot = details.changeSnapshot && typeof details.changeSnapshot === 'object' ? details.changeSnapshot as Record<string, unknown> : details;
    return {
      occurredAt: event.occurredAt, runId: event.runId ?? null, objectType: objectTypeWithData, objectId,
      title: String(details.title ?? details.decisionReason ?? (event.eventType === 'business-rule.decision'
        ? `${objectId}：${decisionLabel(decision)}` : eventLabel(event.eventType))), decision,
      outcome: event.outcome ?? 'unknown', beforeFingerprint: event.beforeFingerprint ?? (typeof details.beforeRuleFingerprint === 'string' ? details.beforeRuleFingerprint : null),
      afterFingerprint: event.afterFingerprint ?? (typeof details.afterRuleFingerprint === 'string' ? details.afterRuleFingerprint : null),
      changedFields, linkedCaseIds, sourceRefs, bindingIds,
      executionProof: typeof details.executionProof === 'string' ? details.executionProof : null, nextAction,
      ...(snapshot.beforeContent !== undefined ? { beforeContent: snapshot.beforeContent } : {}),
      ...(snapshot.afterContent !== undefined ? { afterContent: snapshot.afterContent } : {}),
      ...(typeof snapshot.unifiedDiff === 'string' ? { unifiedDiff: snapshot.unifiedDiff } : {}),
      ...(typeof snapshot.snapshotRef === 'string' ? { snapshotRef: snapshot.snapshotRef } : {}),
      ...(typeof snapshot.changedBy === 'string' ? { changedBy: snapshot.changedBy } : {}),
      ...(typeof snapshot.changeSource === 'string' ? { changeSource: snapshot.changeSource } : {}),
      ...(typeof snapshot.changeReason === 'string' ? { changeReason: snapshot.changeReason } : {}),
      ...(snapshot.contentAvailable && typeof snapshot.contentAvailable === 'object' ? { contentAvailable: snapshot.contentAvailable as { before: boolean; after: boolean } } : {}),
    };
  }).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

function buildTrend(events: readonly AuditEvent[]): ProductCenterAuditReport['trend'] {
  const byDate = new Map<string, AuditEvent[]>();
  for (const event of events) {
    const date = event.occurredAt.slice(0, 10);
    byDate.set(date, [...(byDate.get(date) ?? []), event]);
  }
  return [...byDate.entries()].map(([date, group]) => {
    // 趋势按“日期＋用例”去重，避免同一用例在同一天被多次运行时虚高。
    // 同日多次执行时取最后一条最高优先级的完整结果；运行次数另行统计。
    const latestByCase = new Map<string, { state: ProductCenterAuditRunSummary['status']; event: AuditEvent; priority: number }>();
    for (const event of group) {
      if (!event.runId || !event.caseId || isNonBusinessCaseId(event.caseId)) continue;
      const details = detailsOf(event);
      const isCaseResult = event.eventType === 'evidence.recorded' || event.eventType === 'case.completed'
        || details.receiptStatus != null || details.caseStatus != null;
      if (!isCaseResult) continue;
      const state = statusOf(details.receiptStatus ?? details.status ?? event.outcome);
      if (state === 'unknown' && event.outcome !== 'skipped' && details.status !== 'skipped') continue;
      const candidate = { state: event.outcome === 'skipped' || details.status === 'skipped' ? 'unknown' as const : state, event, priority: caseResultPriority(event) };
      const previous = latestByCase.get(event.caseId);
      if (!previous || candidate.priority > previous.priority || (candidate.priority === previous.priority && (event.occurredAt.localeCompare(previous.event.occurredAt) > 0
        || (event.occurredAt === previous.event.occurredAt && event.eventSequence > previous.event.eventSequence)))) {
        latestByCase.set(event.caseId, candidate);
      }
    }
    const states = [...latestByCase.values()].map((item) => item.state);
    return {
      date, runs: new Set(group.flatMap((event) => event.runId ? [logicalRunKey(String(event.runId))] : [])).size,
      passed: states.filter((state) => state === 'passed').length,
      failed: states.filter((state) => state === 'failed').length,
      blocked: states.filter((state) => state === 'blocked').length,
      notRun: states.filter((state) => state === 'not-run').length,
      dataChanges: group.filter((event) => event.dataChanged === true
        && !event.eventType.startsWith('business-rule.evaluation.')).length,
    };
  }).sort((left, right) => left.date.localeCompare(right.date));
}

function caseResultPriority(event: AuditEvent): number {
  if (event.eventType === 'evidence.recorded' || detailsOf(event).receiptStatus != null) return 3;
  if (event.eventType === 'case.completed' || detailsOf(event).caseStatus != null) return 2;
  return 1;
}

export function buildProductCenterAuditFreshness(
  input: ProductCenterAuditFreshnessInput = {},
): ProductCenterAuditFreshness {
  const maxAgeDays = input.maxAgeDays ?? 1;
  const observedAt = input.observedAt ?? null;
  const evaluatedAt = input.evaluatedAt ?? observedAt ?? new Date(0).toISOString();
  const executionContext: ProductCenterAuditExecutionContext = {
    environmentId: input.executionContext?.environmentId ?? null,
    environmentFingerprint: input.executionContext?.environmentFingerprint ?? null,
    roleId: input.executionContext?.roleId ?? null,
    tenantScope: input.executionContext?.tenantScope ?? null,
    locale: input.executionContext?.locale ?? null,
    sourceScope: input.executionContext?.sourceScope ?? null,
  };
  const fingerprints = {
    applicationVersionFingerprint: input.fingerprints?.applicationVersionFingerprint ?? null,
    pageContractFingerprint: input.fingerprints?.pageContractFingerprint ?? null,
    apiObservationFingerprint: input.fingerprints?.apiObservationFingerprint ?? null,
    sourceFingerprint: input.fingerprints?.sourceFingerprint ?? null,
    implementationFingerprint: input.fingerprints?.implementationFingerprint ?? null,
    executionContextFingerprint: input.fingerprints?.executionContextFingerprint ?? null,
  };
  const reasons: string[] = [];
  for (const source of input.sources ?? []) {
    if (!source.available) reasons.push(`AUDIT_SOURCE_${source.id}_MISSING`);
    if (source.observedAt && Number.isFinite(Date.parse(source.observedAt))) {
      const sourceExpiry = Date.parse(source.observedAt) + maxAgeDays * 86_400_000;
      if (new Date(evaluatedAt).getTime() >= sourceExpiry) reasons.push(`AUDIT_SOURCE_${source.id}_STALE`);
    }
  }
  if (!observedAt) reasons.push('AUDIT_OBSERVED_AT_MISSING');
  if (!input.freshUntil) reasons.push('AUDIT_FRESH_UNTIL_MISSING');
  for (const [key, value] of Object.entries(executionContext)) {
    if (!value) reasons.push(`AUDIT_CONTEXT_${key.replace(/[A-Z]/g, (character) => `_${character}`).toUpperCase()}_MISSING`);
    const expected = input.expectedContext?.[key as keyof ProductCenterAuditExecutionContext];
    if (expected && value && value !== expected) {
      reasons.push(`AUDIT_CONTEXT_${key.replace(/[A-Z]/g, (character) => `_${character}`).toUpperCase()}_MISMATCH`);
    }
  }
  for (const [key, value] of Object.entries(fingerprints)) {
    if (!value) reasons.push(`AUDIT_${key.replace(/[A-Z]/g, (character) => `_${character}`).toUpperCase()}_MISSING`);
  }
  if (input.expectedApplicationVersionFingerprint
    && fingerprints.applicationVersionFingerprint !== input.expectedApplicationVersionFingerprint) {
    reasons.push('AUDIT_APPLICATION_VERSION_MISMATCH');
  }
  if (input.expectedExecutionContextFingerprint
    && fingerprints.executionContextFingerprint !== input.expectedExecutionContextFingerprint) {
    reasons.push('AUDIT_EXECUTION_CONTEXT_MISMATCH');
  }
  const assessment = assessRuntimeAuditFreshness({
    observedAt: observedAt ?? undefined,
    freshUntil: input.freshUntil ?? undefined,
    now: new Date(evaluatedAt),
  });
  reasons.push(...assessment.reasons);
  const status = reasons.length > 0
    ? reasons.some((reason) => reason.includes('MISSING') || reason.includes('INVALID')) ? 'invalid' : 'stale'
    : 'fresh';
  return {
    status,
    observedAt,
    freshUntil: assessment.expiresAt,
    evaluatedAt,
    maxAgeDays,
    reasons: [...new Set(reasons)],
    sources: [...(input.sources ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    executionContext,
    fingerprints,
  };
}

export function renderProductCenterAuditHtml(report: ProductCenterAuditReport & { eventStoreIntegrity?: { valid: boolean } }): string {
  const latest = report.runSummaries[0];
  const previous = latest?.comparableRunId ? report.runSummaries.find((run) => run.runId === latest.comparableRunId) : report.runSummaries[1];
  const latestCases = latest ? report.caseTracking.filter((item) => latest.technicalRunIds.some((runId) => item.runIds.includes(runId))) : [];
  const cards = [
    ['历史事件', report.overview.total], ['历史运行', report.overview.uniqueRuns], ['关联用例', report.overview.uniqueCases],
    ['规则/资料变更', report.changeLedger.length], ['清理零残留收据', report.overview.cleanupEvidence.bothZero], ['哈希链', report.eventStoreIntegrity?.valid ? '通过' : '异常'],
  ].map(([label, value]) => `<article class="card"><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value))}</strong></article>`).join('');
  const runRows = report.runSummaries.slice(0, 20).map((run) => `<tr><td><strong>${escapeHtml(run.displayName)}</strong><br><span class="muted">${escapeHtml(run.scopeLabel)}；触发：${escapeHtml(run.triggerType)}</span><details><summary>技术编号</summary><pre>${escapeHtml(run.technicalRunIds.join('\n'))}</pre></details></td><td>${formatTime(run.firstAt)}<br>至 ${formatTime(run.lastAt)}</td><td><span class="pill ${run.status}">${runStatusLabel(run.status)}</span></td><td>${run.caseCount}</td><td>${run.counts.passed}</td><td>${run.counts.failed}</td><td>${run.counts.blocked}</td><td>${run.counts.notRun}</td><td>${run.operationCount}</td><td>${run.dataChangeCount}</td><td><details><summary>查看阶段</summary><pre>${escapeHtml(run.phases.map((phase) => `${phase.label}：${phase.count} 条`).join('\n') || '暂无阶段记录')}</pre></details></td></tr>`).join('');
  const latestCaseRows = latestCases.map((item) => {
    const current = item.receiptHistory.filter((receipt) => latest?.technicalRunIds.includes(receipt.runId ?? '')).at(-1) ?? item.latestReceipt;
    const prior = previous ? item.receiptHistory.filter((receipt) => previous.technicalRunIds.includes(receipt.runId ?? '')).at(-1) : undefined;
    const reason = current?.reason ? `；说明：${current.reason}` : '';
    return `<tr><td><strong>${escapeHtml(item.caseId)}</strong><br><span class="muted">${escapeHtml(item.title ?? '未采集用例名称')}</span></td><td>${statusLabel(statusOf(current?.status))}${escapeHtml(reason)}</td><td>${statusLabel(statusOf(prior?.status))}</td><td>${item.runIds.length}</td><td>${escapeHtml((item.scriptPaths ?? []).join('\n') || '未登记脚本')}</td><td>${escapeHtml((item.ruleIds ?? []).join(', ') || '未关联规则')}</td><td>${formatTime(item.lastAt)}</td></tr>`;
  }).join('');
  const changeRows = report.changeLedger.slice(0, 300).map((item) => `<tr><td>${formatTime(item.occurredAt)}</td><td><span class="pill change-${item.objectType}">${escapeHtml(item.objectType)}</span><br><code>${escapeHtml(item.objectId)}</code></td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(decisionLabel(item.decision))}</td><td>${escapeHtml(statusLabel(statusOf(item.outcome)))}</td><td>${escapeHtml(item.changedFields.map(fieldLabel).join('、') || '指纹变化（详见版本摘要）')}</td><td>${escapeHtml(item.linkedCaseIds.join(', ') || '未关联用例')}</td><td>${renderChangeContent(item)}<details><summary>证据与后续</summary><pre>${escapeHtml(`来源：${item.sourceRefs.join('\n') || '无'}\n绑定：${item.bindingIds.join('\n') || '无'}\n执行证明：${item.executionProof || '未提供'}\n后续：${item.nextAction}`)}</pre></details></td></tr>`).join('');
  const trendRows = report.trend.slice(-30).map((item) => `<tr><td>${escapeHtml(item.date)}</td><td>${item.runs}</td><td>${item.passed}</td><td>${item.failed}</td><td>${item.blocked}</td><td>${item.notRun}</td><td>${item.dataChanges}</td></tr>`).join('');
  const trendChartMax = Math.max(1, ...report.trend.map((item) => item.passed + item.failed + item.blocked + item.notRun));
  const trendChart = report.trend.slice(-14).map((item) => {
    const total = item.passed + item.failed + item.blocked + item.notRun;
    const height = Math.max(4, Math.round(total / trendChartMax * 100));
    const passedHeight = total ? Math.round(item.passed / total * 100) : 0;
    const failedHeight = total ? Math.round(item.failed / total * 100) : 0;
    const blockedHeight = total ? Math.round(item.blocked / total * 100) : 0;
    const notRunHeight = Math.max(0, 100 - passedHeight - failedHeight - blockedHeight);
    return `<div style="height:100%;flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px;font-size:11px;color:#64748b" title="${escapeHtml(`${item.date}：通过 ${item.passed}，失败 ${item.failed}，阻断 ${item.blocked}，未执行 ${item.notRun}`)}"><div style="width:100%;max-width:44px;min-height:4px;height:${height}%;display:flex;flex-direction:column;justify-content:flex-end;border-radius:6px 6px 2px 2px;overflow:hidden"><i style="display:block;width:100%;height:${passedHeight}%;background:#22c55e"></i><i style="display:block;width:100%;height:${failedHeight}%;background:#ef4444"></i><i style="display:block;width:100%;height:${blockedHeight}%;background:#f97316"></i><i style="display:block;width:100%;height:${notRunHeight}%;background:#facc15"></i></div><span>${escapeHtml(item.date.slice(5))}</span></div>`;
  }).join('');
  const calls = report.callAudit.map((item) => `<tr><td>${escapeHtml(eventLabel(item.eventType))}</td><td>${item.count}</td><td>${formatTime(item.firstAt)}</td><td>${formatTime(item.lastAt)}</td></tr>`).join('');
  const operations = report.operationAudit.map((item) => `<tr><td>${escapeHtml(operationLabel(item.operationKey))}</td><td><code>${escapeHtml(item.operationKey)}</code></td><td>${item.count}</td><td>${formatTime(item.firstAt)}</td><td>${formatTime(item.lastAt)}</td></tr>`).join('');
  const allTimeline = report.timeline.slice().reverse();
  // 技术明细保留完整事件在 JSON；HTML 首次打开只展示最近 300 条，避免数 MB 的重复 DOM 阻塞阅读。
  const timeline = allTimeline.slice(0, 300).map((item) => `<tr><td>${item.sequence}</td><td>${formatTime(item.occurredAt)}</td><td>${escapeHtml(phaseFor({ eventType: item.eventType, details: item.details } as AuditEvent).label)}</td><td>${escapeHtml(eventLabel(item.eventType))}</td><td><span class="pill ${escapeHtml(item.outcome)}">${escapeHtml(statusLabel(statusOf(item.outcome)))}</span></td><td>${escapeHtml(item.caseId ?? '-')}</td><td><code>${escapeHtml(item.runId ?? '-')}</code></td><td>${item.durationMs ?? '-'}</td><td><details><summary>查看原始详情</summary><pre>${escapeHtml(pretty(item.details))}</pre></details></td></tr>`).join('');
  const allCases = report.caseTracking.map((item) => `<tr><td><strong>${escapeHtml(item.caseId)}</strong><br><span class="muted">${escapeHtml(item.title ?? '未采集用例名称')}</span></td><td>${item.eventCount}</td><td>${item.runIds.length}</td><td>${statusLabel(statusOf(item.latestReceipt?.status))}</td><td>${statusLabel(statusOf(item.receiptHistory.at(-2)?.status))}</td><td>${item.changes.length}</td><td>${escapeHtml((item.scriptPaths ?? []).join('\n') || '未登记')}</td><td>${escapeHtml(item.evidenceRefs.length ? item.evidenceRefs.slice(0, 3).join('\n') : '无')}</td></tr>`).join('');
  const funnelMax = Math.max(1, ...Object.values(report.correctionFunnel));
  const funnel = Object.entries(report.correctionFunnel).map(([key, value]) => `<div class="bar-row"><span>${escapeHtml(funnelLabel(key))}</span><div class="bar"><i style="width:${Math.round(value / funnelMax * 100)}%"></i></div><b>${value}</b></div>`).join('');
  const latestSummary = latest ? `<section class="hero"><h2>本次运行复盘</h2><div class="summary-grid"><div><span>本次运行</span><strong>${escapeHtml(latest.displayName)}</strong><small>技术编号：${escapeHtml(latest.technicalRunIds.join('、'))}</small></div><div><span>运行状态</span><strong class="status-${latest.status}">${runStatusLabel(latest.status)}</strong></div><div><span>运行类型</span><strong>${escapeHtml(latest.runType)}</strong></div><div><span>触发方式</span><strong>${escapeHtml(latest.triggerType)}</strong></div><div><span>执行范围</span><strong>${escapeHtml(latest.scopeLabel)}</strong></div><div><span>时间范围</span><strong>${formatTime(latest.firstAt)} 至 ${formatTime(latest.lastAt)}</strong></div><div><span>本次用例</span><strong>${latest.caseCount} 条</strong></div><div><span>通过</span><strong>${latest.counts.passed}</strong></div><div><span>失败</span><strong>${latest.counts.failed}</strong></div><div><span>阻断用例</span><strong>${latest.counts.blocked}</strong></div><div><span>未执行</span><strong>${latest.counts.notRun}</strong></div></div><p class="plain">本次触发阶段：${escapeHtml(latest.phases.map((phase) => `${phase.label}（${phase.count}）`).join('、') || '暂无阶段记录')}。${latest.operationCount === 0 ? '当前运行未采集到业务操作级日志，不能据此确认每个页面/API步骤是否真正触发。' : ''}${latest.counts.notRun > 0 ? `未执行的 ${latest.counts.notRun} 条不是失败，而是未形成完整执行收据，需解除阻断后再验证。` : ''}${latest.blockedReasons.length ? `当前阻断/未执行说明：${escapeHtml(latest.blockedReasons.join('、'))}。` : ''}${previous ? `与上次同类运行（${escapeHtml(previous.displayName)}）相比：通过 ${latest.counts.passed - previous.counts.passed >= 0 ? '增加' : '减少'} ${Math.abs(latest.counts.passed - previous.counts.passed)} 条，变更记录 ${latest.dataChangeCount} 条。` : '暂无可比较的同类运行。'}</p></section>` : '<section><h2>本次运行复盘</h2><p>暂无运行记录。</p></section>';
  const freshnessBanner = report.freshness.status === 'fresh'
    ? '<div class="freshness-banner fresh">当前审计数据有效，可用于当前上下文复盘。</div>'
    : `<div class="freshness-banner stale">当前审计数据${report.freshness.status === 'invalid' ? '不完整' : '已过期'}，本报告仅用于历史复盘，不能作为当前版本质量结论。原因：${escapeHtml(report.freshness.reasons.map(freshnessReasonLabel).join('、') || '未提供')}</div>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>商品中心流程审计报告</title><style>
:root{font-family:"Microsoft YaHei",Inter,sans-serif;color:#172033;background:#f3f6fb}body{margin:0}.wrap{max-width:1680px;margin:auto;padding:28px}h1{margin:0 0 6px;font-size:30px}h2{margin:0 0 14px;font-size:21px}h3{margin:20px 0 10px}.muted{color:#718096;font-size:12px}.plain{line-height:1.8}.freshness-banner{padding:12px 16px;border-radius:10px;margin:12px 0;border:1px solid}.freshness-banner.fresh{background:#ecfdf5;border-color:#86efac;color:#166534}.freshness-banner.stale{background:#fff7ed;border-color:#fdba74;color:#9a3412}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:22px 0}.card,section{background:#fff;border:1px solid #dbe3ef;border-radius:14px;box-shadow:0 6px 24px #23395d12}.card{padding:16px}.card span,.summary-grid span{display:block;color:#718096;font-size:12px}.card strong{display:block;font-size:27px;color:#0f766e;margin-top:6px}section{padding:22px;margin:16px 0;overflow:auto}.hero{border:2px solid #14b8a6}.summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;background:#f0fdfa;border-radius:12px;padding:16px}.summary-grid strong{display:block;margin-top:5px;font-size:16px;word-break:break-word}.status-passed{color:#15803d}.status-failed,.status-blocked{color:#b91c1c}.status-not-run{color:#b45309}table{width:100%;border-collapse:collapse;font-size:13px;min-width:950px}th,td{text-align:left;padding:10px;border-bottom:1px solid #e5eaf1;vertical-align:top;white-space:pre-line}th{background:#f8fafc;position:sticky;top:0;z-index:1}.bar-row{display:grid;grid-template-columns:110px 1fr 50px;gap:10px;align-items:center;margin:9px 0}.bar{height:12px;background:#e2e8f0;border-radius:8px;overflow:hidden}.bar i{display:block;height:100%;background:#14b8a6}.pill{display:inline-block;padding:3px 9px;border-radius:999px;background:#e2e8f0;font-size:12px}.pill.passed,.pill.success{background:#dcfce7;color:#166534}.pill.failed{background:#fee2e2;color:#991b1b}.pill.blocked{background:#ffedd5;color:#9a3412}.pill.not-run{background:#fef3c7;color:#92400e}.pill.skipped{background:#e0e7ff;color:#3730a3}.pill.change-业务规则{background:#fef3c7;color:#92400e}.pill.change-正式用例{background:#dbeafe;color:#1d4ed8}.pill.change-自动化脚本{background:#ede9fe;color:#6d28d9}.pill.change-测试方案{background:#ccfbf1;color:#115e59}pre{white-space:pre-wrap;max-width:720px;max-height:300px;overflow:auto;margin:0}code{font-size:11px;color:#475569}summary{cursor:pointer;color:#0f766e}.scroll-note{font-size:12px;color:#64748b;margin:-4px 0 12px}</style></head><body><main class="wrap"><h1>商品中心流程审计报告</h1><p class="muted">这是完整历史复盘报告，不会覆盖历史事件。报告快照：${formatTime(report.generatedAt)}；事件链：${report.eventStoreIntegrity?.valid ? '校验通过' : '校验异常'}。</p>${freshnessBanner}<div class="cards">${cards}</div>${latestSummary}
<section><h2>最近运行列表</h2><p class="scroll-note">按最近结束时间倒序；主列显示业务运行名称，技术编号仅用于定位原始日志。</p><table><thead><tr><th>运行名称 / 范围</th><th>时间范围</th><th>状态</th><th>用例数</th><th>通过</th><th>失败</th><th>阻断</th><th>未执行</th><th>操作调用</th><th>数据变化</th><th>触发阶段</th></tr></thead><tbody>${runRows || emptyRow(11)}</tbody></table></section>
<section><h2>本次用例结果（用例追踪）</h2><p class="scroll-note">当前运行：${escapeHtml(latest?.runId ?? '暂无')}；同时显示上次结果，便于复盘变化。</p><table><thead><tr><th>用例及名称</th><th>本次结果</th><th>上次结果</th><th>历史运行次数</th><th>自动化脚本</th><th>关联规则</th><th>最近记录</th></tr></thead><tbody>${latestCaseRows || emptyRow(7, '本次运行没有可关联的用例记录')}</tbody></table></section>
<section><h2>变更总览（变更内容）</h2><p class="plain">这里集中回答“原来是什么、现在是什么、具体改了什么、影响谁、是否需要重新验证”。有快照的记录直接显示脱敏内容和差异；历史没有快照时会明确标记为“仅指纹证据”，不会把缺失内容误认为空值。</p><table><thead><tr><th>时间</th><th>变更对象</th><th>变更说明</th><th>决策</th><th>结果</th><th>变化字段</th><th>影响用例</th><th>原内容 → 新内容 / 差异</th></tr></thead><tbody>${changeRows || emptyRow(8, '没有记录到结构化变更')}</tbody></table></section>
<section><h2>运行趋势</h2><p class="scroll-note">按“运行＋用例”去重统计，避免同一用例的临时收据重复计数。柱状图展示最近 14 个日期点，颜色从上到下依次为通过、失败、阻断、未执行。</p><div style="height:180px;display:flex;align-items:flex-end;gap:12px;padding:12px 10px 26px;background:#f8fafc;border-radius:12px;min-width:620px">${trendChart || '<span class="muted">暂无趋势数据</span>'}</div><table><thead><tr><th>日期</th><th>运行数</th><th>通过用例</th><th>失败用例</th><th>阻断用例</th><th>未执行用例</th><th>数据变化记录</th></tr></thead><tbody>${trendRows || emptyRow(7)}</tbody></table></section>
<section><h2>审计新鲜度与完整性</h2><p class="plain">当前审计新鲜度：<strong>${escapeHtml(report.freshness.status === 'fresh' ? '有效' : report.freshness.status === 'stale' ? '已过期' : '不可作为正式结论')}</strong>。${escapeHtml(report.overview.completeness.message)}</p><p>新鲜度原因：${escapeHtml(report.freshness.reasons.map(freshnessReasonLabel).join('、') || '无')}；观测时间 ${formatTime(report.observedAt)}；有效期至 ${formatTime(report.freshUntil)}。</p><p>有证据用例 ${report.overview.completeness.evidenceCases}；有调用记录用例 ${report.overview.completeness.operationCases}；正式调用覆盖率 ${percent(report.overview.completeness.operationCoverageRate)}；清理零残留 ${report.overview.cleanupEvidence.bothZero} 条；孤立事件 ${report.overview.completeness.orphanEvents}。</p></section>
<section><h2>用例全量矩阵</h2><p class="scroll-note">默认收起，避免首次阅读被数百条历史用例打断；完整数据仍保留在报告 JSON 中。</p><details><summary>展开全部 ${report.caseTracking.length} 条用例记录</summary><table><thead><tr><th>用例及名称</th><th>历史事件</th><th>运行次数</th><th>最新结果</th><th>上次结果</th><th>变更数</th><th>自动化脚本</th><th>证据</th></tr></thead><tbody>${allCases || emptyRow(8)}</tbody></table></details></section>
<section><h2>调用审计</h2><table><thead><tr><th>业务事件</th><th>次数</th><th>首次发生</th><th>最后发生</th></tr></thead><tbody>${calls || emptyRow(4)}</tbody></table><h3>具体操作</h3><table><thead><tr><th>业务名称</th><th>技术标识</th><th>次数</th><th>首次发生</th><th>最后发生</th></tr></thead><tbody>${operations || emptyRow(5)}</tbody></table></section>
<section><h2>纠正漏斗</h2>${funnel}</section>
<details><summary><h2 style="display:inline">技术原始明细（默认展示最近 300 条）</h2></summary><section><h2>流程时间线</h2><p class="scroll-note">已按最近事件优先展示 ${Math.min(300, allTimeline.length)} 条；完整 ${allTimeline.length} 条事件请打开 <a href="product-center-audit-report.json">报告 JSON</a> 查询。</p><table><thead><tr><th>#</th><th>时间</th><th>流程阶段</th><th>事件说明</th><th>结果</th><th>用例</th><th>运行</th><th>耗时(ms)</th><th>详情</th></tr></thead><tbody>${timeline || emptyRow(9)}</tbody></table></section></details>
</main></body></html>`;
}

/**
 * 面向日常阅读的短版报告。完整历史、逐案证据和技术事件仍由
 * renderProductCenterAuditHtml 生成到独立明细文件，避免摘要页承载全部 DOM。
 */
export function renderProductCenterAuditSummaryHtml(report: ProductCenterAuditReport & { eventStoreIntegrity?: { valid: boolean } }): string {
  const latest = report.runSummaries[0];
  const previous = latest?.comparableRunId
    ? report.runSummaries.find((run) => run.runId === latest.comparableRunId)
    : report.runSummaries[1];
  const changed = latest?.dataChangeCount ?? 0;
  const actionableCases = (latest?.caseIds ?? []).map((caseId) => report.caseTracking.find((item) => item.caseId === caseId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => ['failed', 'blocked', 'not-run'].includes(statusOf(item.latestReceipt?.status)) || item.changes.length > 0);
  const pendingChanges = report.changeLedger.filter((item) => item.decision === 'revalidation-required' || item.outcome === 'blocked' || item.outcome === 'failed');
  const freshnessText = report.freshness.status === 'fresh' ? '有效' : report.freshness.status === 'stale' ? '已过期' : '不完整';
  const delta = latest && previous ? latest.counts.passed - previous.counts.passed : null;
  const metric = (label: string, value: string | number, tone = '') => `<div class="metric ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
  const issueRows = actionableCases.slice(0, 12).map((item) => {
    const receipt = item.latestReceipt;
    const state = statusLabel(statusOf(receipt?.status));
    const reason = receipt?.reason ? `：${receipt.reason}` : '';
    return `<tr><td><strong>${escapeHtml(item.caseId)}</strong><br><span class="muted">${escapeHtml(item.title ?? '未采集用例名称')}</span></td><td>${escapeHtml(state)}${escapeHtml(reason)}</td><td>${escapeHtml((item.ruleIds ?? []).join('、') || '未关联')}</td><td>${escapeHtml((item.scriptPaths ?? []).join('、') || '未登记')}</td></tr>`;
  }).join('');
  const changeRows = pendingChanges.slice(0, 12).map((item) => `<tr><td>${escapeHtml(item.objectType)}</td><td><strong>${escapeHtml(item.objectId)}</strong><br><span class="muted">${escapeHtml(item.title)}</span></td><td>${escapeHtml(item.changedFields.map(fieldLabel).join('、') || '内容发生变化')}</td><td>${escapeHtml(item.linkedCaseIds.join('、') || '未关联')}</td><td>${escapeHtml(item.nextAction || '请确认后续动作')}</td></tr>`).join('');
  const trend = report.trend.slice(-14).map((item) => `<tr><td>${escapeHtml(item.date)}</td><td>${item.passed}</td><td>${item.failed}</td><td>${item.blocked}</td><td>${item.notRun}</td></tr>`).join('');
  const freshnessBanner = report.freshness.status === 'fresh'
    ? '<div class="banner fresh">审计数据有效，可用于当前上下文复盘。</div>'
    : `<div class="banner warn">审计数据${freshnessText}，仅用于历史复盘。原因：${escapeHtml(report.freshness.reasons.map(freshnessReasonLabel).join('、') || '未提供')}</div>`;
  const latestBlock = latest ? `<section class="hero"><h2>当前运行</h2><div class="run-head"><div><span class="muted">运行名称</span><h3>${escapeHtml(latest.displayName)}</h3><p class="muted">${escapeHtml(latest.scopeLabel)} · ${formatTime(latest.firstAt)} 至 ${formatTime(latest.lastAt)}</p></div><strong class="status-${latest.status}">${escapeHtml(runStatusLabel(latest.status))}</strong></div><div class="metrics">${metric('用例总数', latest.caseCount)}${metric('通过', latest.counts.passed, 'ok')}${metric('失败', latest.counts.failed, latest.counts.failed ? 'bad' : '')}${metric('阻断', latest.counts.blocked, latest.counts.blocked ? 'warn' : '')}${metric('未执行', latest.counts.notRun, latest.counts.notRun ? 'warn' : '')}${metric('本次变更', changed)}</div><p>${previous ? `与上次同类运行相比，通过用例${delta === null ? '无可比数据' : `${delta >= 0 ? '增加' : '减少'} ${Math.abs(delta)} 条`}。` : '暂无可比较的上次同类运行。'} 触发阶段：${escapeHtml(latest.phases.map((phase) => `${phase.label}（${phase.count}）`).join('、') || '暂无记录')}。</p></section>` : '<section class="hero"><h2>当前运行</h2><p>暂无运行记录。</p></section>';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>商品中心审计摘要</title><style>:root{font-family:"Microsoft YaHei",system-ui,sans-serif;color:#172033;background:#f3f6fb}body{margin:0}.wrap{max-width:1180px;margin:auto;padding:24px}h1{margin:0 0 4px;font-size:28px}h2{margin:0 0 12px;font-size:19px}h3{margin:5px 0;font-size:19px}.muted{color:#667085;font-size:12px}.banner{padding:12px 14px;border-radius:9px;margin:14px 0}.fresh{background:#ecfdf5;color:#166534;border:1px solid #86efac}.warn{background:#fff7ed;color:#9a3412;border:1px solid #fdba74}.hero,section{background:#fff;border:1px solid #d8dee9;border-radius:12px;padding:18px;margin:14px 0}.hero{border:2px solid #14b8a6}.run-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.run-head>strong{font-size:18px}.status-passed{color:#15803d}.status-failed,.status-blocked{color:#b91c1c}.status-not-run{color:#b45309}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:9px;margin:14px 0}.metric{border:1px solid #e2e8f0;border-radius:9px;padding:10px;background:#f8fafc}.metric span{display:block;color:#667085;font-size:12px}.metric strong{display:block;font-size:23px;margin-top:3px}.metric.ok strong{color:#15803d}.metric.bad strong{color:#b91c1c}.metric.warn strong{color:#b45309}.links{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}.links a{color:#0f766e;text-decoration:none;border:1px solid #99f6e4;border-radius:7px;padding:7px 10px;background:#f0fdfa}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:9px;border-bottom:1px solid #e5eaf1;vertical-align:top}th{background:#f8fafc}.empty{color:#667085;padding:12px 0}</style></head><body><main class="wrap"><h1>商品中心流程审计摘要</h1><p class="muted">报告生成：${formatTime(report.generatedAt)} · 历史记录不会被覆盖</p>${freshnessBanner}${latestBlock}<section><h2>需要关注的事项</h2>${issueRows ? `<table><thead><tr><th>用例</th><th>当前状态</th><th>关联规则</th><th>自动化脚本</th></tr></thead><tbody>${issueRows}</tbody></table>` : '<p class="empty">当前没有失败、阻断、未执行或发生变化的用例。</p>'}</section><section><h2>待处理变更</h2>${changeRows ? `<table><thead><tr><th>对象类型</th><th>对象</th><th>变化</th><th>影响用例</th><th>下一步</th></tr></thead><tbody>${changeRows}</tbody></table>` : '<p class="empty">当前没有待重新验证的变更。</p>'}</section><section><h2>最近趋势</h2><table><thead><tr><th>日期</th><th>通过</th><th>失败</th><th>阻断</th><th>未执行</th></tr></thead><tbody>${trend || emptyRow(5, '暂无趋势数据')}</tbody></table></section><div class="links"><a href="product-center-audit-details.html">打开完整复盘明细</a><a href="product-center-audit-report.json">打开完整 JSON 档案</a></div></main></body></html>`;
}

function groupBy<T>(values: readonly T[], key: (value: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const value of values) result.set(key(value), [...(result.get(key(value)) ?? []), value]);
  return result;
}

function unique(values: readonly string[]): string[] { return [...new Set(values)].sort(); }
function readAuditRequirements(event: AuditEvent): { operationExpected?: boolean; structuredDiffExpected?: boolean; cleanupExpected?: boolean } | null {
  if (!event.details || typeof event.details !== 'object') return null;
  const value = (event.details as Record<string, unknown>).auditRequirements;
  return value && typeof value === 'object' ? value as { operationExpected?: boolean; structuredDiffExpected?: boolean; cleanupExpected?: boolean } : null;
}
function readDetailText(event: AuditEvent, key: string): string | null {
  if (!event.details || typeof event.details !== 'object') return null;
  const value = (event.details as Record<string, unknown>)[key];
  return typeof value === 'string' && value ? value : null;
}
function percent(value: number | null): string { return value === null ? 'N/A' : `${(value * 100).toFixed(2)}%`; }
function pretty(value: unknown): string { return value === null ? '-' : JSON.stringify(value, null, 2); }
function shortFingerprint(value: string | null): string { return value ? value.replace(/^sha256:/, '').slice(0, 16) : '-'; }
function formatTime(value: string | null): string { return value ? escapeHtml(value.replace('T', ' ').replace('Z', ' UTC')) : '-'; }

function renderChangeContent(item: ProductCenterAuditChange): string {
  const hasBefore = item.beforeContent !== undefined;
  const hasAfter = item.afterContent !== undefined;
  const content = hasBefore || hasAfter
    ? `<details><summary>查看原内容与新内容</summary><div><strong>修改前</strong><pre>${escapeHtml(pretty(item.beforeContent ?? '未提供'))}</pre><strong>修改后</strong><pre>${escapeHtml(pretty(item.afterContent ?? '未提供'))}</pre></div></details>`
    : `<span class="muted">仅指纹证据，未采集原始内容</span>`;
  const diff = item.unifiedDiff
    ? `<details><summary>查看具体差异</summary><pre>${escapeHtml(item.unifiedDiff)}</pre></details>`
    : '<span class="muted">未提供逐行差异</span>';
  const metadata = [item.changedBy ? `修改人：${item.changedBy}` : '', item.changeSource ? `来源：${item.changeSource}` : '', item.changeReason ? `原因：${item.changeReason}` : '', `前指纹：${shortFingerprint(item.beforeFingerprint)}；后指纹：${shortFingerprint(item.afterFingerprint)}`].filter(Boolean).join('\n');
  return `${content}${diff}<details><summary>技术详情</summary><pre>${escapeHtml(metadata)}</pre></details>`;
}
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!)); }
function emptyRow(span: number, text = '暂无事件'): string { return `<tr><td colspan="${span}" class="muted">${escapeHtml(text)}</td></tr>`; }
function funnelLabel(key: string): string { return ({ candidate: '候选', approved: '已批准', started: '已启动', completed: '已完成', blocked: '已阻断', affectedCases: '影响用例' } as Record<string, string>)[key] ?? key; }
function eventLabel(value: string): string {
  return ({
    'flow.started': '流程开始', 'flow.completed': '流程完成', 'flow.failed': '流程失败',
    'plan.compiled': '执行计划生成', 'batch.started': '批次开始', 'batch.completed': '批次完成',
    'audit.started': '审计开始', 'audit.completed': '审计完成', 'run.authorized': '运行授权',
    'run.started': '运行开始', 'run.completed': '运行完成', 'case.started': '用例开始',
    'case.completed': '用例完成', 'evidence.recorded': '执行证据记录', 'operation.started': '业务操作开始',
    'operation.called': '业务操作完成', 'business-rule.evaluation.started': '业务规则评估开始',
    'business-rule.evaluation.completed': '业务规则评估完成', 'business-rule.decision': '业务规则决策',
    'case.updated': '正式用例更新', 'case.fingerprint_changed': '用例指纹变化',
    'implementation.fingerprint_changed': '自动化脚本指纹变化', 'binding.updated': '自动化绑定更新',
    'correction.candidate': '产生纠正候选', 'correction.approved': '纠正已批准',
    'correction.started': '纠正开始', 'correction.completed': '纠正完成', 'correction.blocked': '纠正阻断',
  } as Record<string, string>)[value] ?? value;
}
function operationLabel(value: string): string {
  if (value.startsWith('ui:context-guard')) return '页面环境与权限检查';
  if (value.startsWith('ui:initialize')) return '打开业务页面';
  if (value.startsWith('ui:assertion')) return '页面结果验证';
  if (value.startsWith('ui:cleanup')) return '页面清理验证';
  if (value.includes(':GET ')) return `查询：${value.split(':GET ')[1]}`;
  if (value.includes(':POST ')) return `新增/提交：${value.split(':POST ')[1]}`;
  if (value.includes(':PUT ')) return `修改：${value.split(':PUT ')[1]}`;
  if (value.includes(':DELETE ')) return `删除：${value.split(':DELETE ')[1]}`;
  const pageLabel = value.includes('SeasoningBoundaryPage.') ? '调味流程' : value.includes('ProductCenterSopPage.') ? '商品流程' : value.includes('SidebarPage.') ? '侧边栏' : '页面操作';
  const method = value.includes('.') ? value.split('.').at(-1) ?? '' : value;
  const action = ({ open: '打开页面', openList: '打开列表', ensureListOpen: '确保列表已打开', openCreate: '打开新建', submitCreate: '提交新建', enterEdit: '进入编辑', fill: '填写内容', save: '保存', deleteIdentity: '删除数据', verifyDeletedUi: '验证删除结果', readFeedbackTexts: '读取提示信息', chooseMenuAction: '选择菜单操作', openActionMenu: '打开操作菜单', expectGroupVisible: '确认分组可见', recordCandidate: '记录候选', recordOwner: '记录负责人' } as Record<string, string>)[method];
  return action ? `${pageLabel}：${action}` : `${pageLabel}：执行页面操作`;
}
function statusLabel(value: string | ProductCenterAuditRunSummary['status'] | undefined): string {
  return ({ passed: '通过', success: '成功', failed: '失败', blocked: '阻断', 'not-run': '未执行', skipped: '跳过', unknown: '未判定' } as Record<string, string>)[String(value ?? 'unknown')] ?? String(value ?? '未判定');
}
function runStatusLabel(value: ProductCenterAuditRunSummary['status']): string {
  return ({ passed: '全部通过', failed: '存在失败', blocked: '存在阻断（部分完成）', 'not-run': '未执行', unknown: '未判定' } as Record<string, string>)[value] ?? '未判定';
}
function fieldLabel(value: string): string {
  return ({ actions: '测试步骤', expectedResults: '预期结果', preconditions: '前置条件', changedFields: '变更字段', ruleFingerprint: '规则版本', sourceFingerprint: '规则来源版本', implementationFingerprint: '自动化实现版本', price: '价格', name: '名称', description: '描述', category: '分类', options: '选项', cleanup: '清理规则' } as Record<string, string>)[value] ?? value;
}
function freshnessReasonLabel(value: string): string {
  const direct: Record<string, string> = {
    AUDIT_EXPIRED: '审计已过期', AUDIT_TIMESTAMP_MISSING_OR_INVALID: '观测时间缺失或无效',
    AUDIT_OBSERVED_AT_MISSING: '缺少观测时间', AUDIT_FRESH_UNTIL_MISSING: '缺少有效期',
    AUDIT_APPLICATION_VERSION_MISMATCH: '应用版本与预期不一致', AUDIT_EXECUTION_CONTEXT_MISMATCH: '执行上下文与预期不一致',
  };
  if (direct[value]) return direct[value];
  const source = value.match(/^AUDIT_SOURCE_(.+)_(MISSING|STALE)$/);
  if (source) return `来源${source[2] === 'MISSING' ? '缺失' : '已过期'}：${source[1]}`;
  const context = value.match(/^AUDIT_CONTEXT_(.+)_(MISSING|MISMATCH)$/);
  if (context) return `执行上下文${context[2] === 'MISSING' ? '缺失' : '不一致'}：${contextKeyLabel(context[1])}`;
  const fingerprint = value.match(/^AUDIT_(.+)_FINGERPRINT_MISSING$/);
  if (fingerprint) return `指纹缺失：${fingerprintKeyLabel(fingerprint[1])}`;
  return value;
}
function contextKeyLabel(value: string): string {
  return ({ ENVIRONMENT_ID: '执行环境', ENVIRONMENT_FINGERPRINT: '环境指纹', ROLE_ID: '角色', TENANT_SCOPE: '租户范围', LOCALE: '语言', SOURCE_SCOPE: '数据来源' } as Record<string, string>)[value] ?? value.replaceAll('_', '、');
}
function fingerprintKeyLabel(value: string): string {
  return ({ APPLICATION_VERSION: '应用版本', PAGE_CONTRACT: '页面契约', API_OBSERVATION: '接口观测', SOURCE: '来源', IMPLEMENTATION: '实现', EXECUTION_CONTEXT: '执行上下文' } as Record<string, string>)[value] ?? value.replaceAll('_', '、');
}
function decisionLabel(value: string | null): string {
  return ({ 'no-change': '无变化', 'candidate-created': '产生候选', 'conflict-detected': '发现冲突', 'revalidation-required': '需要重新验证', 'formal-rule-updated': '正式规则已更新', 'historical-import': '历史导入' } as Record<string, string>)[String(value ?? '')] ?? (value || '未提供');
}
