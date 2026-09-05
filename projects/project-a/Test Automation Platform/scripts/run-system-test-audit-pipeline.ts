import fs from 'node:fs';
import path from 'node:path';
import { FileAuditEventStore } from '../src/audit/event-log';
import type { SystemTestCompiledCase, SystemTestManifest } from '../src/automation/system-test/system-test-contract';
import {
  evaluateSystemTestCaseAuditCompleteness,
  summarizeSystemTestAuditCompleteness,
} from '../src/automation/system-test/system-test-audit-contract';
import type { SystemTestRuntimeEvidence } from '../src/automation/system-test/system-test-evidence';
import {
  finishExecutableOperation,
  startExecutableOperation,
} from '../src/utils/executable-operation-receipt';
import { renderSystemTestAuditHtml, renderSystemTestAuditSplitHtml } from '../src/reporters/system-test-audit-report';
import { runSystemTestFlow } from './run-system-test-flow';
import { verifySystemTestAuditCompleteness } from './verify-system-test-audit-completeness';

type PipelineGate = ReturnType<typeof verifySystemTestAuditCompleteness> & { ledgerPath: string };

export type SystemTestAuditPipelineResult = {
  schemaVersion: '1.0.0';
  mode: 'reference' | 'flow';
  status: 'audit-complete' | 'audit-incomplete' | 'compiled' | 'blocked';
  applicationId: string;
  systemId: string;
  runIds: string[];
  eventLogPath: string;
  evidenceLedgers: string[];
  gates: PipelineGate[];
  flowCheckpointPath?: string;
  summary: {
    planned: number;
    auditEligible: number;
    classifiedExclusions: number;
    auditComplete: number;
    auditIncomplete: number;
    invariantSatisfied: boolean;
    auditEvents: number;
  };
  artifacts: { json: string; html: string; csv?: string; printHtml?: string; pdf?: string; readableLog?: string; overviewHtml?: string; casesHtml?: string; eventsHtml?: string };
  generatedAt: string;
  exitCode: 0 | 2;
  history?: Array<{ runId: string; occurredAt?: string; eventCount: number; dataChanges: number; failures: number; durationMs: number; stepCount?: number; stepCoveragePercent?: number; unclosedSteps?: number; reportPath?: string }>;
  archiveDirectory?: string;
  executionContext?: SystemTestManifest['system']['executionContext'];
  integrity?: { valid: boolean; count: number; diagnostics: string[] };
  timing?: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
    phases: Record<string, {
      startedAt: string;
      completedAt: string;
      durationMs: number;
      status: 'completed' | 'skipped' | 'failed';
    }>;
  };
};

export async function runSystemTestAuditPipeline(input: {
  reference?: boolean;
  planPath?: string;
  manifestPath?: string;
  execute?: boolean;
  flowId?: string;
  auditEventLogPath?: string;
  outputDirectory?: string;
}): Promise<SystemTestAuditPipelineResult> {
  if (input.reference) return runReferenceAuditPipeline(input.outputDirectory);
  if (!input.planPath || !input.manifestPath) {
    throw new Error('用法：--plan=<plan.json> --manifest=<manifest.json> [--execute]，或 --reference');
  }
  const manifest = readJson<SystemTestManifest>(resolveProjectFile(input.manifestPath));
  const applicationId = manifest.system.portabilityScope?.applicationId ?? manifest.system.systemId;
  const flowId = input.flowId ?? `local-audit-${Date.now()}`;
  const eventLogRelative = input.auditEventLogPath ?? `output/audit/${safeSegment(manifest.system.systemId)}-events.jsonl`;
  const outputDirectory = resolveOutputDirectory(
    input.outputDirectory ?? `deliverables/system-test-audit/${safeSegment(manifest.system.systemId)}/${safeSegment(flowId)}`,
  );
  const flow = await runSystemTestFlow({
    planPath: input.planPath,
    manifestPath: input.manifestPath,
    execute: input.execute,
    flowId,
    auditEventLogPath: eventLogRelative,
  });
  const checkpoint = readJson<{ runIds?: string[] }>(flow.checkpointPath);
  const runIds = checkpoint.runIds ?? [];
  const evidenceLedgers = runIds.map((runId) => path.join(
    resolveProjectRoot(), 'output/system-test', manifest.system.systemId, runId, 'evidence-ledger.json',
  )).filter((ledgerPath) => fs.existsSync(ledgerPath));
  const gates = evidenceLedgers.map((ledgerPath) => ({ ledgerPath, ...verifySystemTestAuditCompleteness(ledgerPath) }));
  const summaries = evidenceLedgers.map((ledgerPath) => readAuditSummary(ledgerPath));
  const eventLogPath = resolveProjectFile(eventLogRelative);
  const auditEvents = fs.existsSync(eventLogPath)
    ? new FileAuditEventStore({ filePath: eventLogPath }).query({ runId: flowId }).length
      + runIds.reduce((total, runId) => total + new FileAuditEventStore({ filePath: eventLogPath }).query({ runId }).length, 0)
    : 0;
  const integrity = fs.existsSync(eventLogPath)
    ? new FileAuditEventStore({ filePath: eventLogPath }).verifyIntegrity()
    : { valid: true, count: 0, diagnostics: [] };
  const status = flow.exitCode !== 0 ? 'blocked'
    : input.execute && evidenceLedgers.length === 0 ? 'audit-incomplete'
      : gates.some((gate) => !gate.ok) ? 'audit-incomplete'
        : input.execute ? 'audit-complete' : 'compiled';
  return await writePipelineResult({
    mode: 'flow', status, applicationId, systemId: manifest.system.systemId, runIds,
    eventLogPath, evidenceLedgers, gates, flowCheckpointPath: flow.checkpointPath,
    summary: sumAuditSummaries(summaries, auditEvents), outputDirectory, eventRunIds: [flowId, ...runIds],
    executionContext: manifest.system.executionContext, integrity,
    exitCode: status === 'audit-incomplete' || status === 'blocked' ? 2 : 0,
  });
}

export async function runReferenceAuditPipeline(outputValue?: string): Promise<SystemTestAuditPipelineResult> {
  const outputDirectory = resolveOutputDirectory(outputValue ?? 'deliverables/system-test-audit-reference');
  const runId = `audit-reference-${Date.now()}`;
  const applicationId = 'system-test-audit-reference';
  const systemId = 'system-test-audit-reference';
  const caseId = 'REF-AUDIT-MUTATION-001';
  const eventLogPath = path.join(outputDirectory, 'audit-events.jsonl');
  const ledgerPath = path.join(outputDirectory, 'evidence-ledger.json');
  const store = new FileAuditEventStore({ filePath: eventLogPath });
  store.append({
    eventId: `${runId}:run.started`, eventType: 'run.started', actorType: 'runner',
    applicationId, businessDomainId: 'reference-domain', planId: systemId, runId, traceId: runId,
    outcome: 'success', details: { sourceKind: 'system-neutral-audit-reference' },
  });
  const beforeCaseFingerprint = '1'.repeat(64); const afterCaseFingerprint = '2'.repeat(64);
  const beforeRuleFingerprint = '3'.repeat(64); const afterRuleFingerprint = '4'.repeat(64);
  store.append({ eventId: `${runId}:audit.started`, eventType: 'audit.started', actorType: 'runner', applicationId, businessDomainId: 'reference-domain', planId: systemId, runId, traceId: runId, outcome: 'success', details: { title: '启动系统无关参考审计', triggerSource: 'reference-contract' } });
  store.append({ eventId: `${runId}:case.updated`, eventType: 'case.updated', actorType: 'system', applicationId, businessDomainId: 'reference-domain', planId: systemId, runId, caseId, traceId: runId, outcome: 'success', beforeFingerprint: beforeCaseFingerprint, afterFingerprint: afterCaseFingerprint, dataChanged: true, details: { title: '更新参考用例预期结果', changedFields: ['expectations[0].expected'], revalidationRequired: true, nextAction: '业务规则确认后重新验证' } });
  store.append({ eventId: `${runId}:business-rule.started`, eventType: 'business-rule.evaluation.started', actorType: 'system', applicationId, businessDomainId: 'reference-domain', runId, traceId: runId, outcome: 'success', details: { eventRole: 'started', evaluatedRuleIds: ['REF-RULE-001'], sourceArtifacts: ['system-neutral-reference'] } });
  store.append({ eventId: `${runId}:business-rule.decision`, eventType: 'business-rule.decision', actorType: 'system', applicationId, businessDomainId: 'reference-domain', runId, traceId: runId, outcome: 'blocked', beforeFingerprint: beforeRuleFingerprint, afterFingerprint: afterRuleFingerprint, details: { ruleId: 'REF-RULE-001', decision: 'revalidation-required', decisionReason: '参考规则语义发生变化，需要重新验证关联用例', beforeRuleFingerprint, afterRuleFingerprint, linkedCaseIds: [caseId], linkedBindingIds: ['reference-binding-001'], executionProof: 'missing', timeSource: 'reference-fixture', timePrecision: 'instant' } });
  store.append({ eventId: `${runId}:business-rule.completed`, eventType: 'business-rule.evaluation.completed', actorType: 'system', applicationId, businessDomainId: 'reference-domain', runId, traceId: runId, outcome: 'blocked', details: { eventRole: 'completed', evaluatedRuleIds: ['REF-RULE-001'], decisionCounts: { 'revalidation-required': 1 } } });
  // 参考夹具模拟完整 Recipe 阶段，验证步骤级开始/结束配对与阶段映射；不访问任何真实系统。
  const referenceSteps: Array<{ id: string; phase: string; kind: string; title: string }> = [
    { id: 'initialize', phase: 'initialize', kind: 'environment', title: '初始化运行环境' },
    { id: 'seed', phase: 'seed', kind: 'data-preparation', title: '准备参考对象数据' },
    { id: 'context-before-action', phase: 'context-guard', kind: 'context-guard', title: '操作前检查运行上下文' },
    { id: 'capability', phase: 'capability', kind: 'business-operation', title: '更新系统无关参考对象' },
    { id: 'assertion', phase: 'assertion', kind: 'assertion', title: '验证参考对象更新结果' },
    { id: 'cleanup', phase: 'cleanup', kind: 'cleanup', title: '清理参考对象并确认零残留' },
    { id: 'close', phase: 'close', kind: 'technical', title: '收口并生成审计报告' },
  ];
  let receipt: ReturnType<typeof finishExecutableOperation> | undefined;
  for (const step of referenceSteps) {
    appendReferenceStep(store, { runId, applicationId, systemId, caseId, ...step }, step.id === 'capability' ? () => {
      const operation = startExecutableOperation({
        executionId: runId,
        operationKey: 'reference-object:update',
        title: '更新系统无关参考对象',
        method: 'PATCH',
        auditContext: { eventLogPath, applicationId, businessDomainId: 'reference-domain', planId: systemId, runId, caseId },
      });
      receipt = finishExecutableOperation(operation, 'passed', {
        responseStatus: 200,
        attempt: 1,
        before: { id: 'reference-1', status: 'draft', nested: { enabled: false } },
        after: { id: 'reference-1', status: 'active', nested: { enabled: true } },
        details: { fixture: true, externalSystemAccessed: false },
      });
    } : undefined);
  }
  if (!receipt) throw new Error('REFERENCE_OPERATION_RECEIPT_MISSING');
  const mutationCase = compiledCase(caseId, 'reversible', ['reference-object:update']);
  const readOnlyCase = compiledCase('REF-AUDIT-READ-001', 'none', []);
  const evidence: SystemTestRuntimeEvidence = {
    caseId,
    assertionReceipts: [],
    operationReceipts: [receipt],
    mutationObserved: true,
    cleanup: {
      apiIdentityCounts: { 'reference-object:reference-1': 0 },
      uiIdentityCounts: { 'reference-object:reference-1': 0 },
      objects: [{
        entityType: 'reference-object', serverId: 'reference-1', businessIdentity: 'REF-AUDIT-OBJECT-001',
        cleanupOperationKey: 'reference-object:delete', cleanupAttempt: 1,
        apiResidueCount: 0, uiResidueCount: 0, outcome: 'verified-zero',
        evidenceRefs: ['self-controlled-reference-memory-store'],
      }],
    },
  };
  const cases = [
    evaluateSystemTestCaseAuditCompleteness({ item: mutationCase, evidence, runId }),
    evaluateSystemTestCaseAuditCompleteness({
      item: readOnlyCase, evidence: { caseId: readOnlyCase.caseId, assertionReceipts: [] }, runId,
    }),
  ];
  const auditSummary = summarizeSystemTestAuditCompleteness(cases);
  writeJsonAtomic(ledgerPath, {
    schemaVersion: '1.0.0', collectionId: 'system-test-evidence-ledger', systemId, runId,
    generatedAt: new Date().toISOString(),
    auditCompleteness: { schemaVersion: '1.1.0', summary: auditSummary, cases },
    cases: [{ caseId, runtimeEvidence: evidence, auditCompleteness: cases[0] }],
  });
  const gate = { ledgerPath, ...verifySystemTestAuditCompleteness(ledgerPath) };
  store.append({
    eventId: `${runId}:run.completed`, eventType: 'run.completed', actorType: 'runner',
    applicationId, businessDomainId: 'reference-domain', planId: systemId, runId, traceId: runId,
    outcome: gate.ok ? 'success' : 'failed', effectiveSuccess: gate.ok,
    details: { auditGate: gate.status, auditSummary },
  });
  const integrity = store.verifyIntegrity();
  if (!integrity.valid) throw new Error(`REFERENCE_AUDIT_EVENT_CHAIN_INVALID:${integrity.diagnostics.join(',')}`);
  return await writePipelineResult({
    mode: 'reference', status: gate.ok ? 'audit-complete' : 'audit-incomplete',
    applicationId, systemId, runIds: [runId], eventLogPath, evidenceLedgers: [ledgerPath], gates: [gate],
    summary: { ...auditSummary, auditEvents: store.query({ runId }).length }, outputDirectory, eventRunIds: [runId],
    executionContext: { environmentId: 'isolated-reference', locale: 'zh-CN', roleId: 'reference-runner', tenantScope: 'self-controlled-reference', featureFlagFingerprint: 'reference-baseline' }, integrity,
    exitCode: gate.exitCode,
  });
}

function appendReferenceStep(
  store: FileAuditEventStore,
  input: { runId: string; applicationId: string; systemId: string; caseId: string; id: string; phase: string; kind: string; title: string },
  between?: () => void,
): void {
  const base = `${input.runId}:step:${input.id}`;
  const details = { sourceKind: 'system-neutral-audit-reference-step', stepId: input.id, phase: input.phase, stepKind: input.kind, title: input.title, realtime: true };
  const startedAt = new Date().toISOString();
  store.append({ eventId: `${base}:started`, eventType: 'step.started', actorType: 'runner', applicationId: input.applicationId, planId: input.systemId, runId: input.runId, caseId: input.caseId, traceId: input.runId, occurredAt: startedAt, startedAt, outcome: 'success', details });
  between?.();
  const finishedAt = new Date().toISOString();
  store.append({ eventId: `${base}:completed`, parentEventId: `${base}:started`, eventType: 'step.completed', actorType: 'runner', applicationId: input.applicationId, planId: input.systemId, runId: input.runId, caseId: input.caseId, traceId: input.runId, occurredAt: finishedAt, startedAt, finishedAt, durationMs: 0, outcome: 'success', effectiveSuccess: true, details: { ...details, terminalStatus: 'passed' } });
}

function compiledCase(
  caseId: string,
  mutationMode: SystemTestCompiledCase['mutationMode'],
  requiredOperationKeys: string[],
): SystemTestCompiledCase {
  return {
    caseId, ruleId: `rule-${caseId}`, ruleStatus: 'supported', recipeId: `recipe-${caseId}`,
    action: mutationMode === 'none' ? 'read' : 'edit', dataProfileId: 'reference-profile', mutationMode,
    expectationClaims: [], requiredContextGuards: [], requiredOperationKeys, probeAdapterIds: [], externalCapabilities: [],
  };
}

function readAuditSummary(filePath: string): ReturnType<typeof summarizeSystemTestAuditCompleteness> {
  return readJson<{ auditCompleteness: { summary: ReturnType<typeof summarizeSystemTestAuditCompleteness> } }>(filePath)
    .auditCompleteness.summary;
}

function sumAuditSummaries(
  summaries: ReturnType<typeof summarizeSystemTestAuditCompleteness>[],
  auditEvents: number,
): SystemTestAuditPipelineResult['summary'] {
  const total = summaries.reduce((acc, item) => ({
    planned: acc.planned + item.planned,
    auditEligible: acc.auditEligible + item.auditEligible,
    classifiedExclusions: acc.classifiedExclusions + item.classifiedExclusions,
    auditComplete: acc.auditComplete + item.auditComplete,
    auditIncomplete: acc.auditIncomplete + item.auditIncomplete,
  }), { planned: 0, auditEligible: 0, classifiedExclusions: 0, auditComplete: 0, auditIncomplete: 0 });
  return {
    ...total,
    invariantSatisfied: total.planned === total.auditEligible + total.classifiedExclusions
      && total.auditEligible === total.auditComplete + total.auditIncomplete,
    auditEvents,
  };
}

async function writePipelineResult(input: Omit<SystemTestAuditPipelineResult, 'schemaVersion' | 'generatedAt' | 'artifacts'> & {
  outputDirectory: string;
  eventRunIds?: string[];
}): Promise<SystemTestAuditPipelineResult> {
  const pipelineStartedAtMs = Date.now();
  const pipelineStartedAt = new Date(pipelineStartedAtMs).toISOString();
  const phases: NonNullable<SystemTestAuditPipelineResult['timing']>['phases'] = {};
  const buildTiming = (): NonNullable<SystemTestAuditPipelineResult['timing']> => ({
    startedAt: pipelineStartedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - pipelineStartedAtMs,
    phases,
  });
  const measure = async <T>(id: string, action: () => Promise<T> | T): Promise<T> => {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    try {
      const value = await action();
      phases[id] = {
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtMs,
        status: 'completed',
      };
      return value;
    } catch (error) {
      phases[id] = {
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtMs,
        status: 'failed',
      };
      throw error;
    }
  };
  const jsonPath = path.join(input.outputDirectory, 'audit-pipeline-result.json');
  const htmlPath = path.join(input.outputDirectory, 'audit-pipeline-report.html');
  const { outputDirectory: _outputDirectory, eventRunIds, ...value } = input;
  const result: SystemTestAuditPipelineResult = {
    schemaVersion: '1.0.0', ...value, generatedAt: new Date().toISOString(),
    artifacts: { json: jsonPath, html: htmlPath },
  };
  const { ledgers, allEvents } = await measure('load-inputs', () => ({
    ledgers: result.evidenceLedgers.filter((filePath) => fs.existsSync(filePath)).map((filePath) => readJson<JsonRecord>(filePath)),
    allEvents: fs.existsSync(result.eventLogPath)
      ? fs.readFileSync(result.eventLogPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as JsonRecord)
      : [],
  }));
  const events = allEvents.filter((event) => !eventRunIds || eventRunIds.includes(String(event.runId ?? '')));
  const csvPath = path.join(input.outputDirectory, 'audit-pipeline-report.csv');
  const printHtmlPath = path.join(input.outputDirectory, 'audit-pipeline-report-print.html');
  const pdfPath = path.join(input.outputDirectory, 'audit-pipeline-report.pdf');
  const readableLogPath = path.join(input.outputDirectory, 'audit-events-readable.jsonl');
  const overviewHtmlPath = path.join(input.outputDirectory, 'audit-overview.html');
  const casesHtmlPath = path.join(input.outputDirectory, 'audit-cases.html');
  const eventsHtmlPath = path.join(input.outputDirectory, 'audit-events.html');
  const archiveId = safeSegment(result.runIds[0] ?? eventRunIds?.[0] ?? `report-${Date.now()}`);
  const archiveDirectory = path.join(input.outputDirectory, 'runs', archiveId);
  const archiveHtmlPath = path.join(archiveDirectory, 'audit-pipeline-report.html');
  result.archiveDirectory = archiveDirectory;
  result.history = buildRunHistory(allEvents, input.outputDirectory, new Set(eventRunIds ?? result.runIds), archiveHtmlPath);
  result.artifacts = { json: jsonPath, html: htmlPath, csv: csvPath, printHtml: printHtmlPath, readableLog: readableLogPath, overviewHtml: overviewHtmlPath, casesHtml: casesHtmlPath, eventsHtml: eventsHtmlPath };
  await measure('render-and-write-reports', () => {
    writeTextAtomic(csvPath, buildAuditCsv(ledgers));
    writeTextAtomic(readableLogPath, buildReadableEventLog(events));
    // The print version must exist before PDF generation. Render it once here;
    // the final HTML/print pair is rendered once after the optional PDF step.
    writeTextAtomic(printHtmlPath, renderSystemTestAuditHtml({ result, ledgers, events, historicalEvents: allEvents }));
    writeTextAtomic(overviewHtmlPath, renderSystemTestAuditSplitHtml({ result, ledgers, events, view: 'overview' }));
    writeTextAtomic(casesHtmlPath, renderSystemTestAuditSplitHtml({ result, ledgers, events, view: 'cases' }));
    writeTextAtomic(eventsHtmlPath, renderSystemTestAuditSplitHtml({ result, ledgers, events, view: 'events' }));
  });
  const pdfWritten = await measure('pdf', () => tryWritePdf(printHtmlPath, pdfPath));
  if (pdfWritten) result.artifacts.pdf = pdfPath;
  else phases.pdf.status = 'skipped';
  await measure('finalize-reports', () => {
    // One final render reflects the optional PDF artifact. This replaces the
    // previous duplicate HTML + print renders and keeps the report self-consistent.
    const html = renderSystemTestAuditHtml({ result, ledgers, events, historicalEvents: allEvents });
    writeTextAtomic(htmlPath, html);
    writeTextAtomic(printHtmlPath, html);
    result.timing = buildTiming();
    writeJsonAtomic(jsonPath, result);
  });
  await measure('archive', () => writeRunArchive({ result, archiveDirectory, events, historicalEvents: allEvents, ledgers, csvPath, pdfPath }));
  result.timing = buildTiming();
  // Keep the persisted result aligned with the returned value after archive generation.
  writeJsonAtomic(jsonPath, result);
  const archiveResultPath = path.join(archiveDirectory, 'audit-pipeline-result.json');
  if (fs.existsSync(archiveResultPath)) {
    const archived = readJson<SystemTestAuditPipelineResult>(archiveResultPath);
    writeJsonAtomic(archiveResultPath, { ...archived, timing: result.timing });
  }
  return result;
}

function writeRunArchive(input: {
  result: SystemTestAuditPipelineResult;
  archiveDirectory: string;
  events: JsonRecord[];
  historicalEvents: JsonRecord[];
  ledgers: JsonRecord[];
  csvPath: string;
  pdfPath: string;
}): void {
  const archiveJsonPath = path.join(input.archiveDirectory, 'audit-pipeline-result.json');
  const archiveHtmlPath = path.join(input.archiveDirectory, 'audit-pipeline-report.html');
  const archivePrintHtmlPath = path.join(input.archiveDirectory, 'audit-pipeline-report-print.html');
  const archiveCsvPath = path.join(input.archiveDirectory, 'audit-pipeline-report.csv');
  const archiveReadableLogPath = path.join(input.archiveDirectory, 'audit-events-readable.jsonl');
  const archiveEventLogPath = path.join(input.archiveDirectory, 'audit-events.jsonl');
  const archiveLedgerPaths = input.ledgers.map((ledger, index) => {
    const target = path.join(input.archiveDirectory, input.ledgers.length === 1 ? 'evidence-ledger.json' : `evidence-ledger-${index + 1}.json`);
    writeJsonAtomic(target, ledger);
    return target;
  });
  const archiveResult: SystemTestAuditPipelineResult = {
    ...input.result,
    eventLogPath: archiveEventLogPath,
    evidenceLedgers: archiveLedgerPaths,
    artifacts: {
      json: archiveJsonPath,
      html: archiveHtmlPath,
      csv: archiveCsvPath,
      printHtml: archivePrintHtmlPath,
      readableLog: archiveReadableLogPath,
      ...(input.result.artifacts.pdf ? { pdf: path.join(input.archiveDirectory, 'audit-pipeline-report.pdf') } : {}),
      overviewHtml: path.join(input.archiveDirectory, 'audit-overview.html'), casesHtml: path.join(input.archiveDirectory, 'audit-cases.html'), eventsHtml: path.join(input.archiveDirectory, 'audit-events.html'),
    },
  };
  writeTextAtomic(archiveEventLogPath, input.events.map((event) => JSON.stringify(event)).join('\n') + (input.events.length ? '\n' : ''));
  writeTextAtomic(archiveReadableLogPath, buildReadableEventLog(input.events));
  fs.copyFileSync(input.csvPath, archiveCsvPath);
  if (input.result.artifacts.pdf && fs.existsSync(input.pdfPath)) fs.copyFileSync(input.pdfPath, archiveResult.artifacts.pdf!);
  writeJsonAtomic(archiveJsonPath, archiveResult);
  const archiveHtml = renderSystemTestAuditHtml({ result: archiveResult, ledgers: input.ledgers, events: input.events, historicalEvents: input.historicalEvents });
  writeTextAtomic(archiveHtmlPath, archiveHtml);
  writeTextAtomic(archivePrintHtmlPath, archiveHtml);
  writeTextAtomic(path.join(input.archiveDirectory, 'audit-overview.html'), renderSystemTestAuditSplitHtml({ result: archiveResult, ledgers: input.ledgers, events: input.events, view: 'overview' }));
  writeTextAtomic(path.join(input.archiveDirectory, 'audit-cases.html'), renderSystemTestAuditSplitHtml({ result: archiveResult, ledgers: input.ledgers, events: input.events, view: 'cases' }));
  writeTextAtomic(path.join(input.archiveDirectory, 'audit-events.html'), renderSystemTestAuditSplitHtml({ result: archiveResult, ledgers: input.ledgers, events: input.events, view: 'events' }));
}

async function tryWritePdf(htmlPath: string, pdfPath: string): Promise<boolean> {
  try {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    await page.goto(`file:///${htmlPath.replaceAll('\\', '/')}`);
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    await browser.close();
    return fs.existsSync(pdfPath);
  } catch {
    return false;
  }
}

function buildRunHistory(
  events: JsonRecord[],
  outputDirectory: string,
  currentRunIds: Set<string>,
  currentReportPath: string,
): Array<{ runId: string; occurredAt?: string; eventCount: number; dataChanges: number; failures: number; durationMs: number; stepCount?: number; stepCoveragePercent?: number; unclosedSteps?: number; reportPath?: string }> {
  const groups = new Map<string, JsonRecord[]>();
  for (const event of events) { const runId = String(event.runId ?? ''); if (!runId) continue; groups.set(runId, [...(groups.get(runId) ?? []), event]); }
  return [...groups.entries()].map(([runId, items]) => {
    const starts = items.filter((item) => item.eventType === 'step.started');
    const terminals = new Set(items.filter((item) => ['step.completed', 'step.failed', 'step.interrupted'].includes(String(item.eventType))).map((item) => {
      const details = item.details && typeof item.details === 'object' ? item.details as JsonRecord : {};
      return `${item.caseId}:${details.stepId ?? item.parentEventId ?? item.eventId}`;
    }));
    const closed = starts.filter((item) => {
      const details = item.details && typeof item.details === 'object' ? item.details as JsonRecord : {};
      return terminals.has(`${item.caseId}:${details.stepId ?? item.parentEventId ?? item.eventId}`);
    }).length;
    return {
    runId, occurredAt: String(items[0]?.occurredAt ?? ''), eventCount: items.length,
    dataChanges: items.filter((item) => item.dataChanged === true).length,
    failures: items.filter((item) => item.outcome === 'failed' || item.outcome === 'blocked').length,
    durationMs: items.reduce((sum, item) => sum + Number(item.durationMs ?? 0), 0),
    ...(starts.length > 0 ? {
      stepCount: starts.length,
      stepCoveragePercent: Math.round(closed / starts.length * 100),
      unclosedSteps: starts.length - closed,
    } : {}),
    reportPath: currentRunIds.has(runId)
      ? currentReportPath
      : existingArchiveReport(outputDirectory, runId),
    };
  }).sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));
}

function existingArchiveReport(outputDirectory: string, runId: string): string | undefined {
  const reportPath = path.join(outputDirectory, 'runs', safeSegment(runId), 'audit-pipeline-report.html');
  return fs.existsSync(reportPath) ? reportPath : undefined;
}

function buildAuditCsv(ledgers: JsonRecord[]): string {
  const rows = [['用例编号', '审计状态', '执行结果', '操作次数', '变更字段', '是否有清理残留']];
  for (const ledger of ledgers) {
    const cases = Array.isArray(ledger.cases) ? ledger.cases : [];
    for (const value of cases) {
      const item = value && typeof value === 'object' ? value as JsonRecord : {};
      const runtime = item.runtimeEvidence && typeof item.runtimeEvidence === 'object' ? item.runtimeEvidence as JsonRecord : {};
      const ops = Array.isArray(runtime.operationReceipts) ? runtime.operationReceipts as JsonRecord[] : [];
      const fields = [...new Set(ops.flatMap((op) => Array.isArray(op.changedFields) ? op.changedFields.map(String) : []))];
      const cleanup = runtime.cleanup && typeof runtime.cleanup === 'object' ? runtime.cleanup as JsonRecord : {};
      const objects = Array.isArray(cleanup.objects) ? cleanup.objects as JsonRecord[] : [];
      const residue = objects.some((obj) => Number(obj.apiResidueCount ?? 0) > 0 || Number(obj.uiResidueCount ?? 0) > 0 || obj.outcome !== 'verified-zero');
      rows.push([String(item.caseId ?? ''), auditStatusLabel(String((item.auditCompleteness as JsonRecord | undefined)?.status ?? 'unknown')), executionStatusLabel(String(ops[0]?.status ?? 'not-executed')), String(ops.length), fields.join('|'), residue ? '是' : '否']);
    }
  }
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function buildReadableEventLog(events: JsonRecord[]): string {
  return events.map((event) => JSON.stringify({
    事件编号: event.eventId, 事件类型: eventTypeLabel(String(event.eventType ?? '')), 发生时间: event.occurredAt,
    用例编号: event.caseId ?? null, 运行编号: event.runId ?? null, 结果: outcomeLabel(String(event.outcome ?? 'record')),
    流程阶段: phaseLabel(event), 步骤类别: stepKindLabel(asRecord(event.details).stepKind), 操作说明: asRecord(event.details).title ?? asRecord(event.details).operationKey ?? asRecord(event.details).decisionReason ?? null,
    规则编号: asRecord(event.details).ruleId ?? null, 规则决策: businessRuleDecisionLabel(String(asRecord(event.details).decision ?? '')), 关联用例: asArray(asRecord(event.details).linkedCaseIds).map(String),
    是否发生数据变化: event.dataChanged === true ? '是' : '否',
    变更前指纹: event.beforeFingerprint ?? null, 变更后指纹: event.afterFingerprint ?? null,
  })).join('\n') + (events.length ? '\n' : '');
}

function eventTypeLabel(type: string): string { return ({'run.started':'运行开始','run.completed':'运行完成','case.started':'用例开始','case.completed':'用例完成','step.started':'步骤开始','step.completed':'步骤完成','step.failed':'步骤失败','step.interrupted':'步骤中断','operation.started':'操作开始','operation.called':'操作完成','evidence.recorded':'证据记录','correction.candidate':'发现待纠正项','correction.started':'开始纠正','correction.completed':'纠正完成','correction.blocked':'纠正阻断'} as Record<string,string>)[type] ?? type; }
function stepKindLabel(kind: unknown): string { return ({ 'business-operation': '业务操作', assertion: '结果验证', cleanup: '数据清理', 'context-guard': '环境检查', environment: '准备阶段', 'data-preparation': '准备测试数据', 'precondition-check': '操作前检查', technical: '技术辅助' } as Record<string, string>)[String(kind ?? '')] ?? (kind ?? null); }
function businessRuleDecisionLabel(value: string): string { return ({ 'no-change': '无变化', 'candidate-created': '创建候选规则', 'conflict-detected': '发现规则冲突', 'revalidation-required': '需要重新验证', 'formal-rule-updated': '正式规则已更新', 'historical-import': '历史导入' } as Record<string, string>)[value] ?? value; }
function phaseLabel(event: JsonRecord): string { const details = asRecord(event.details); const phase = String(details.phase ?? ''); const type = String(event.eventType ?? ''); return ({ initialize: '准备阶段', seed: '准备测试数据', 'action-readiness': '操作前检查', 'context-guard': '环境检查', capability: '业务操作', assertion: '结果验证', cleanup: '数据清理', close: '运行收口' } as Record<string, string>)[phase] ?? stepKindLabel(details.stepKind) ?? (type.startsWith('operation.') ? '业务操作' : type.startsWith('correction.') ? '用例纠正' : type === 'run.completed' ? '运行收口' : '流程记录'); }
function outcomeLabel(outcome: string): string { return ({success:'成功',failed:'失败',blocked:'阻断',skipped:'跳过',cancelled:'已取消',record:'记录'} as Record<string,string>)[outcome] ?? outcome; }
function auditStatusLabel(status: string): string { return ({complete:'完整',incomplete:'不完整',excluded:'已排除'} as Record<string,string>)[status] ?? status; }
function executionStatusLabel(status: string): string { return ({passed:'通过',failed:'失败',skipped:'已跳过','not-executed':'未执行',started:'执行中'} as Record<string,string>)[status] ?? status; }
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function asRecord(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }

function csvCell(value: string): string { return `"${value.replace(/"/g, '""')}"`; }

function resolveOutputDirectory(value: string): string {
  const resolved = resolveProjectFile(value);
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function resolveProjectFile(value: string): string {
  if (!value.trim() || path.isAbsolute(value) || value.replaceAll('\\', '/').split('/').includes('..')) {
    throw new Error(`AUDIT_PIPELINE_PATH_INVALID:${value}`);
  }
  const projectRoot = resolveProjectRoot();
  const resolved = path.resolve(projectRoot, value);
  const relative = path.relative(projectRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`AUDIT_PIPELINE_PATH_INVALID:${value}`);
  return resolved;
}

function resolveProjectRoot(): string { return path.resolve(process.env.SYSTEM_TEST_PROJECT_ROOT ?? process.cwd()); }

function safeSegment(value: string): string { return value.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'system'; }
type JsonRecord = Record<string, unknown>;
function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function writeJsonAtomic(filePath: string, value: unknown): void { writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`); }
function writeTextAtomic(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
function argument(name: string): string | undefined { return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3); }

if (require.main === module) {
  runSystemTestAuditPipeline({
    reference: process.argv.includes('--reference'), planPath: argument('plan'), manifestPath: argument('manifest'),
    execute: process.argv.includes('--execute'), flowId: argument('flow-id'),
    auditEventLogPath: argument('audit-event-log'), outputDirectory: argument('output-dir'),
  }).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.exitCode;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
