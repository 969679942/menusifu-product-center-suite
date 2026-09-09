import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  BUSINESS_RULE_CHANGE_EVENT_TYPES,
  validateBusinessRuleDecisionEvent,
  type BusinessRuleDecision,
  type BusinessRuleDecisionDetails,
  type BusinessRuleEvaluationRunDetails,
} from '../../../Test Automation Platform/src/automation/system-test/business-rule-change-event';
import {
  FileAuditEventStore,
  type AuditEvent,
} from '../../../Test Automation Platform/src/audit/event-log';
import type { BusinessRuleSemanticBaseline, BusinessRuleChangeTriggerResult } from '../automation/system-test/business-rule-change-trigger';
import {
  buildProductCenterCurrentRuleEvaluationEvents,
  buildProductCenterHistoricalRuleLandingEvents,
  PRODUCT_CENTER_RULE_EVENT_APPLICATION_ID,
  PRODUCT_CENTER_RULE_EVENT_DOMAIN_ID,
  type ProductCenterHistoricalRuleLanding,
} from '../adapters/product-center/product-center-business-rule-event-adapter';
import type { ProductCenterBusinessRuleLifecycleSnapshot } from '../adapters/product-center/product-center-business-rule-lifecycle-adapter';
import { buildProductCenterBusinessRuleChangeTriggerArtifact } from './build-product-center-business-rule-change-trigger';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from './build-product-center-business-rule-lifecycle-snapshot';

type HistoricalLandingManifest = {
  schemaVersion: '1.0.0';
  collectionId: string;
  applicationId: string;
  businessDomainId: string;
  landings: ProductCenterHistoricalRuleLanding[];
};

export type ProductCenterBusinessRuleEventLedgerReport = {
  schemaVersion: '1.0.0';
  reportId: 'product-center-business-rule-event-ledger';
  generatedAt: string | null;
  status: 'empty' | 'operational' | 'operational-with-historical-gaps';
  applicationId: 'merchant-center';
  businessDomainId: 'product-center-item';
  eventLogPath: string;
  integrity: { valid: boolean; count: number; diagnostics: string[] };
  diagnostics: string[];
  summary: {
    landingRuns: number;
    currentRuns: number;
    historicalRuns: number;
    ruleDecisionEvents: number;
    noChange: number;
    candidatesCreated: number;
    conflictsDetected: number;
    revalidationRequired: number;
    formalRuleUpdates: number;
    unresolvedHistoricalRuleScopeRuns: number;
  };
  runs: Array<{
    runId: string;
    occurredAt: string;
    runType: BusinessRuleEvaluationRunDetails['runType'];
    evaluationStatus: BusinessRuleEvaluationRunDetails['evaluationStatus'];
    sourceArtifacts: string[];
    evaluatedRuleIds: string[];
    decisionCounts: Record<BusinessRuleDecision, number>;
    terminalOutcome: string | null;
  }>;
  guardrails: {
    eventLedgerMayChangeCaseState: false;
    eventLedgerMayAuthorizeExecution: false;
    formalUpdateRequiresApprovedCurrentFingerprints: true;
    formalUpdateRequiresPassedCompleteReceipt: true;
    historicalImportMayInferRuleChanges: false;
    noChangeMayTriggerRerun: false;
  };
  executionImpact: {
    existingPassedCasesInvalidated: false;
    rerunCaseIds: [];
    moduleDeliveryBlocked: false;
  };
};

export type BuildProductCenterBusinessRuleEventLedgerOptions = {
  projectRoot?: string;
  manifestPath?: string;
  eventLogPath?: string;
  outputJsonPath?: string;
  outputMarkdownPath?: string;
  includeHistorical?: boolean;
  currentSourceArtifactPath?: string;
  lifecycle?: ProductCenterBusinessRuleLifecycleSnapshot;
  baseline?: BusinessRuleSemanticBaseline;
  trigger?: BusinessRuleChangeTriggerResult;
};

const defaultProjectRoot = path.resolve(__dirname, '..');

export function buildProductCenterBusinessRuleEventLedger(
  options: BuildProductCenterBusinessRuleEventLedgerOptions = {},
) {
  const projectRoot = path.resolve(options.projectRoot ?? defaultProjectRoot);
  const manifestPath = path.resolve(options.manifestPath ?? path.join(
    projectRoot,
    'contracts/product-center/business-rules/product-center-business-rule-landing-history.json',
  ));
  const eventLogPath = path.resolve(options.eventLogPath ?? path.join(projectRoot, 'output/audit/product-center-events.jsonl'));
  const outputJsonPath = path.resolve(options.outputJsonPath ?? path.join(
    projectRoot,
    'output/governance/product-center-business-rule-event-ledger.json',
  ));
  const outputMarkdownPath = path.resolve(options.outputMarkdownPath ?? path.join(
    projectRoot,
    'output/governance/product-center-business-rule-event-ledger.md',
  ));
  const store = new FileAuditEventStore({ filePath: eventLogPath });
  const beforeIntegrity = store.verifyIntegrity();
  if (!beforeIntegrity.valid) {
    throw new Error(`PRODUCT_CENTER_AUDIT_LOG_INTEGRITY_FAILED:${beforeIntegrity.diagnostics.join(',')}`);
  }
  const pendingEvents = [];
  const evaluationDiagnostics: string[] = [];
  if (options.includeHistorical !== false) {
    const manifest = readJson<HistoricalLandingManifest>(manifestPath);
    validateManifest(manifest);
    for (const landing of [...manifest.landings].sort(compareLandings)) {
      const artifactDiagnostic = validateHistoricalArtifact(projectRoot, landing);
      if (artifactDiagnostic) evaluationDiagnostics.push(artifactDiagnostic);
      pendingEvents.push(...buildProductCenterHistoricalRuleLandingEvents(landing));
    }
  }
  if (options.currentSourceArtifactPath) {
    const artifact = inspectSourceArtifact(projectRoot, options.currentSourceArtifactPath);
    const lifecycle = options.lifecycle ?? loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
    const baseline = options.baseline ?? readJson<BusinessRuleSemanticBaseline>(path.join(
      projectRoot,
      'contracts/product-center/business-rules/product-center-business-rule-verified-baseline.json',
    ));
    const trigger = options.trigger ?? buildProductCenterBusinessRuleChangeTriggerArtifact();
    const runIdentity = sha256([
      artifact.relativePath,
      artifact.fingerprint,
      artifact.metadata.testPlanFingerprint ?? 'null',
      artifact.metadata.implementationFingerprint ?? 'null',
      artifact.metadata.executionContextFingerprint ?? 'null',
      lifecycle.fingerprint,
      trigger.fingerprint,
    ].join(':'));
    try {
      pendingEvents.push(...buildProductCenterCurrentRuleEvaluationEvents({
        runId: `product-center-item:test-plan-to-ui-script:${runIdentity.slice(0, 24)}`,
        occurredAt: artifact.generatedAt,
        sourceArtifactPath: artifact.relativePath,
        sourceArtifactFingerprint: artifact.fingerprint,
        lifecycle,
        baseline,
        trigger,
        testPlanFingerprint: artifact.metadata.testPlanFingerprint,
        implementationFingerprint: artifact.metadata.implementationFingerprint,
        executionContextFingerprint: artifact.metadata.executionContextFingerprint,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('PRODUCT_CENTER_RULE_BASELINE_INCOMPLETE')) throw error;
      evaluationDiagnostics.push(`当前业务规则评估暂缓：${trigger.diagnostics.join(',') || message}`);
    }
  }
  let appended = 0;
  let duplicates = 0;
  for (const event of pendingEvents) {
    const result = store.append(event);
    if (result.duplicate) duplicates += 1;
    else appended += 1;
  }
  const integrity = store.verifyIntegrity();
  if (!integrity.valid) {
    throw new Error(`PRODUCT_CENTER_AUDIT_LOG_INTEGRITY_FAILED:${integrity.diagnostics.join(',')}`);
  }
  const report = projectProductCenterBusinessRuleEventLedger(
    store.readAll(),
    relativeTo(projectRoot, eventLogPath),
    integrity,
    evaluationDiagnostics,
  );
  writeJsonAtomic(outputJsonPath, report);
  writeTextAtomic(outputMarkdownPath, renderMarkdown(report));
  return {
    appended,
    duplicates,
    report,
    eventLogPath,
    outputJsonPath,
    outputMarkdownPath,
  };
}

export function projectProductCenterBusinessRuleEventLedger(
  allEvents: readonly AuditEvent[],
  eventLogPath: string,
  integrity: ProductCenterBusinessRuleEventLedgerReport['integrity'],
  diagnostics: readonly string[] = [],
): ProductCenterBusinessRuleEventLedgerReport {
  const eventTypes = new Set<string>(Object.values(BUSINESS_RULE_CHANGE_EVENT_TYPES));
  const events = allEvents.filter((event) => (
    event.applicationId === PRODUCT_CENTER_RULE_EVENT_APPLICATION_ID
    && event.businessDomainId === PRODUCT_CENTER_RULE_EVENT_DOMAIN_ID
    && eventTypes.has(event.eventType)
  ));
  const decisionEvents = events.filter((event) => event.eventType === BUSINESS_RULE_CHANGE_EVENT_TYPES.decision);
  const decisionValidationErrors = decisionEvents.flatMap((event) => (
    validateBusinessRuleDecisionEvent(event).map((code) => `${event.eventId}:${code}`)
  ));
  if (decisionValidationErrors.length > 0) {
    throw new Error(`PRODUCT_CENTER_RULE_DECISION_EVENT_INVALID:${decisionValidationErrors.join(',')}`);
  }
  const starts = events.filter((event) => event.eventType === BUSINESS_RULE_CHANGE_EVENT_TYPES.started);
  const completedByRunId = new Map(events
    .filter((event) => event.eventType === BUSINESS_RULE_CHANGE_EVENT_TYPES.completed)
    .map((event) => [event.runId, event]));
  const decisionsByRunId = new Map<string, AuditEvent[]>();
  for (const event of decisionEvents) {
    const bucket = decisionsByRunId.get(event.runId ?? '') ?? [];
    bucket.push(event);
    decisionsByRunId.set(event.runId ?? '', bucket);
  }
  const runs = starts.map((event) => {
    const details = event.details as BusinessRuleEvaluationRunDetails;
    const runDecisions = decisionsByRunId.get(event.runId ?? '') ?? [];
    return {
      runId: event.runId ?? event.eventId,
      occurredAt: event.occurredAt,
      runType: details.runType,
      evaluationStatus: details.evaluationStatus,
      sourceArtifacts: [...(details.sourceArtifacts ?? [])].sort(),
      evaluatedRuleIds: [...(details.evaluatedRuleIds ?? [])].sort(),
      decisionCounts: countDecisionEvents(runDecisions),
      terminalOutcome: completedByRunId.get(event.runId)?.outcome ?? null,
    };
  }).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.runId.localeCompare(right.runId));
  const currentRuns = runs.filter((run) => run.evaluationStatus === 'current').length;
  const historicalRuns = runs.filter((run) => run.evaluationStatus === 'historical-import').length;
  const unresolvedHistoricalRuleScopeRuns = runs.filter((run) => (
    run.evaluationStatus === 'historical-import' && run.evaluatedRuleIds.length === 0
  )).length;
  const decisionCounts = countDecisionEvents(decisionEvents);
  const generatedAt = events.length === 0
    ? null
    : events.map((event) => event.occurredAt).sort().at(-1)!;
  return {
    schemaVersion: '1.0.0',
    reportId: 'product-center-business-rule-event-ledger',
    generatedAt,
    status: events.length === 0
      ? 'empty'
      : unresolvedHistoricalRuleScopeRuns > 0 ? 'operational-with-historical-gaps' : 'operational',
    applicationId: PRODUCT_CENTER_RULE_EVENT_APPLICATION_ID,
    businessDomainId: PRODUCT_CENTER_RULE_EVENT_DOMAIN_ID,
    eventLogPath,
    integrity,
    diagnostics: [...new Set(diagnostics)].sort(),
    summary: {
      landingRuns: runs.length,
      currentRuns,
      historicalRuns,
      ruleDecisionEvents: decisionEvents.length,
      noChange: decisionCounts['no-change'],
      candidatesCreated: decisionCounts['candidate-created'],
      conflictsDetected: decisionCounts['conflict-detected'],
      revalidationRequired: decisionCounts['revalidation-required'],
      formalRuleUpdates: decisionCounts['formal-rule-updated'],
      unresolvedHistoricalRuleScopeRuns,
    },
    runs,
    guardrails: {
      eventLedgerMayChangeCaseState: false,
      eventLedgerMayAuthorizeExecution: false,
      formalUpdateRequiresApprovedCurrentFingerprints: true,
      formalUpdateRequiresPassedCompleteReceipt: true,
      historicalImportMayInferRuleChanges: false,
      noChangeMayTriggerRerun: false,
    },
    executionImpact: {
      existingPassedCasesInvalidated: false,
      rerunCaseIds: [],
      moduleDeliveryBlocked: false,
    },
  };
}

function validateManifest(manifest: HistoricalLandingManifest): void {
  if (manifest.schemaVersion !== '1.0.0'
    || manifest.applicationId !== PRODUCT_CENTER_RULE_EVENT_APPLICATION_ID
    || manifest.businessDomainId !== PRODUCT_CENTER_RULE_EVENT_DOMAIN_ID
    || !Array.isArray(manifest.landings)) {
    throw new Error('PRODUCT_CENTER_RULE_LANDING_MANIFEST_INVALID');
  }
  const runIds = manifest.landings.map((landing) => landing.runId);
  if (new Set(runIds).size !== runIds.length) throw new Error('PRODUCT_CENTER_RULE_LANDING_RUN_ID_DUPLICATE');
}

function validateHistoricalArtifact(projectRoot: string, landing: ProductCenterHistoricalRuleLanding): string | null {
  const artifact = inspectSourceArtifact(projectRoot, landing.sourceArtifactPath);
  // The existing manifest contains legacy landings that point at a mutable `latest`
  // path.  Never silently treat that file as an immutable historical artifact:
  // retain the historical event, but surface the unverifiable fingerprint/time as
  // a governance diagnostic.  Immutable paths continue to fail closed.
  const normalizedSourcePath = landing.sourceArtifactPath.replace(/\\/g, '/');
  const isMutableLatest = normalizedSourcePath.split('/').includes('latest')
    // Existing project landings all point into the generated output tree, which
    // is overwritten by later rebuilds. Treat those references as mutable too.
    || normalizedSourcePath.startsWith('output/');
  if (artifact.fingerprint !== landing.sourceArtifactFingerprint) {
    if (isMutableLatest) {
      return `历史落点使用可变 latest 产物，无法复核指纹：${landing.sourceArtifactPath}`;
    }
    throw new Error(`PRODUCT_CENTER_RULE_LANDING_FINGERPRINT_MISMATCH:${landing.sourceArtifactPath}`);
  }
  if (artifact.generatedAt !== landing.occurredAt) {
    if (isMutableLatest) {
      return `历史落点使用可变 latest 产物，无法复核生成时间：${landing.sourceArtifactPath}`;
    }
    throw new Error(`PRODUCT_CENTER_RULE_LANDING_TIME_MISMATCH:${landing.sourceArtifactPath}`);
  }
  return null;
}

function inspectSourceArtifact(projectRoot: string, sourceArtifactPath: string) {
  const absolutePath = path.resolve(projectRoot, sourceArtifactPath);
  const relativePath = relativeTo(projectRoot, absolutePath);
  if (relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
    throw new Error(`PRODUCT_CENTER_RULE_SOURCE_OUTSIDE_PROJECT:${sourceArtifactPath}`);
  }
  if (!fs.existsSync(absolutePath)) throw new Error(`PRODUCT_CENTER_RULE_SOURCE_NOT_FOUND:${sourceArtifactPath}`);
  const artifact = readJson<Record<string, unknown>>(absolutePath);
  const generatedAt = typeof artifact.generatedAt === 'string' ? artifact.generatedAt : '';
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new Error(`PRODUCT_CENTER_RULE_SOURCE_GENERATED_AT_INVALID:${sourceArtifactPath}`);
  }
  return {
    relativePath,
    fingerprint: sha256(fs.readFileSync(absolutePath)),
    generatedAt,
    metadata: {
      testPlanFingerprint: fingerprintOrNull(artifact.fingerprint)
        ?? fingerprintOrNull(artifact.testPlanFingerprint),
      implementationFingerprint: resolveBoundImplementationFingerprint(projectRoot, artifact),
      executionContextFingerprint: fingerprintOrNull(artifact.executionContextFingerprint),
    },
  };
}

function resolveBoundImplementationFingerprint(
  projectRoot: string,
  artifact: Record<string, unknown>,
): string | null {
  if (!Array.isArray(artifact.automationBindings)) return null;
  const scriptPaths = [...new Set(artifact.automationBindings
    .map((item) => (item && typeof item === 'object'
      ? (item as Record<string, unknown>).scriptPath
      : null))
    .filter((item): item is string => typeof item === 'string' && item !== 'N/A'))]
    .sort();
  if (scriptPaths.length === 0) return null;
  const implementations = scriptPaths.map((scriptPath) => {
    const absolutePath = path.resolve(projectRoot, scriptPath);
    const relativePath = relativeTo(projectRoot, absolutePath);
    if (relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
      throw new Error(`PRODUCT_CENTER_RULE_IMPLEMENTATION_OUTSIDE_PROJECT:${scriptPath}`);
    }
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`PRODUCT_CENTER_RULE_IMPLEMENTATION_NOT_FOUND:${scriptPath}`);
    }
    return { scriptPath: relativePath, fingerprint: sha256(fs.readFileSync(absolutePath)) };
  });
  return sha256(stableStringify(implementations));
}

function countDecisionEvents(events: readonly AuditEvent[]): Record<BusinessRuleDecision, number> {
  const result: Record<BusinessRuleDecision, number> = {
    'no-change': 0,
    'candidate-created': 0,
    'conflict-detected': 0,
    'revalidation-required': 0,
    'formal-rule-updated': 0,
    'historical-import': 0,
  };
  for (const event of events) {
    const decision = (event.details as BusinessRuleDecisionDetails).decision;
    if (decision in result) result[decision] += 1;
  }
  return result;
}

function renderMarkdown(report: ProductCenterBusinessRuleEventLedgerReport): string {
  const rows = report.runs.map((run) => (
    `| ${run.occurredAt} | ${run.runType} | ${run.evaluationStatus} | ${run.evaluatedRuleIds.length} | ${run.terminalOutcome ?? '-'} |`
  ));
  return [
    '# 商品中心业务规则评估事件账本',
    '',
    `- 状态：${report.status}`,
    `- 落地运行：${report.summary.landingRuns}`,
    `- 当前评估：${report.summary.currentRuns}`,
    `- 历史导入：${report.summary.historicalRuns}`,
    `- 历史规则范围待确认：${report.summary.unresolvedHistoricalRuleScopeRuns}`,
    `- 逐规则决策：${report.summary.ruleDecisionEvents}`,
    `- 正式规则更新：${report.summary.formalRuleUpdates}`,
    '',
    '| 时间 | 类型 | 评估状态 | 已评估规则数 | 终态 |',
    '| --- | --- | --- | ---: | --- |',
    ...(rows.length > 0 ? rows : ['| - | - | - | 0 | - |']),
    '',
    '> 历史导入只证明转换/发布产物存在，不反推当时哪些规则发生变化。无变化事件不会触发重跑，事件账本也不改变用例状态。',
    '',
  ].join('\n');
}

function compareLandings(left: ProductCenterHistoricalRuleLanding, right: ProductCenterHistoricalRuleLanding): number {
  return left.occurredAt.localeCompare(right.occurredAt) || left.runId.localeCompare(right.runId);
}

function fingerprintOrNull(value: unknown): string | null {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

function relativeTo(root: string, target: string): string {
  return path.relative(root, target).replace(/\\/g, '/');
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeTextAtomic(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseArgument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

if (require.main === module) {
  try {
    const result = buildProductCenterBusinessRuleEventLedger({
      currentSourceArtifactPath: parseArgument('source-artifact'),
      includeHistorical: !process.argv.includes('--current-only'),
    });
    process.stdout.write(`${JSON.stringify({
      status: result.report.status,
      appended: result.appended,
      duplicates: result.duplicates,
      summary: result.report.summary,
      reportPath: relativeTo(defaultProjectRoot, result.outputJsonPath),
    })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
