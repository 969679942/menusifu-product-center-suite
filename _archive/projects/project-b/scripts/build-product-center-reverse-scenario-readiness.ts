import path from 'node:path';
import { fingerprintJsonInput, verifyJsonInputCurrentness } from '../../Test Automation Platform/src/governance/json-input-currentness';
import { validateReverseScenarioCatalog, type ReverseScenarioCatalog } from '../../Test Automation Platform/src/utils/reverse-scenario-catalog';
import { readJsonEvidence } from '../utils/json-evidence';
import { publishImmutableArtifact } from '../utils/immutable-artifact';

type ScenarioMap = { catalogId: string; mappings: Array<{ scenarioId: string; caseIds: string[]; status: string; evidenceRefs: string[]; reason: string }> };
type RuntimeAudit = {
  evidenceInventory: Array<{ evidenceId: string; path?: string; sha256?: string; disposition: string }>;
  corrections: Array<{ caseId: string; evidenceIds?: string[] }>;
};
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const key = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const keys = (value: unknown): value is string[] => Array.isArray(value) && value.every(key) && new Set(value).size === value.length;
const isCatalog = (value: unknown): value is ReverseScenarioCatalog => object(value) && key(value.catalogId)
  && Array.isArray(value.scenarios) && value.scenarios.length > 0 && validateReverseScenarioCatalog(value).length === 0;
const isMap = (value: unknown): value is ScenarioMap => object(value) && value.schemaVersion === '1.0.0' && key(value.catalogId)
  && Array.isArray(value.mappings) && value.mappings.every((item) => object(item) && key(item.scenarioId)
    && keys(item.caseIds) && key(item.status) && keys(item.evidenceRefs) && typeof item.reason === 'string')
  && new Set(value.mappings.map((item) => item.scenarioId)).size === value.mappings.length;
const isAudit = (value: unknown): value is RuntimeAudit => object(value) && value.schemaVersion === '2.0.0'
  && Array.isArray(value.evidenceInventory) && value.evidenceInventory.every((item) => object(item) && key(item.evidenceId) && key(item.disposition)
    && (item.path === undefined || typeof item.path === 'string') && (item.sha256 === undefined || typeof item.sha256 === 'string')
    && (item.disposition !== 'consumed' || key(item.path) && typeof item.sha256 === 'string' && /^[a-f0-9]{64}$/.test(item.sha256)))
  && new Set(value.evidenceInventory.map((item) => item.evidenceId)).size === value.evidenceInventory.length
  && Array.isArray(value.corrections) && value.corrections.every((item) => object(item) && key(item.caseId)
    && (item.evidenceIds === undefined || keys(item.evidenceIds)))
  && new Set(value.corrections.map((item) => item.caseId)).size === value.corrections.length;

function readReverseScenarioInputs(projectRoot: string) {
  const workspaceRoot = path.resolve(projectRoot, '..');
  const catalogPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/process-reverse-scenario-catalog-v1.json');
  const mapPath = path.join(projectRoot, 'adapters/test-automation-platform/product-center-reverse-scenario-map-v1.json');
  const auditPath = path.join(workspaceRoot, 'deliverables/product-center-group/runtime-audit-v2.json');
  return { catalogPath, mapPath, auditPath, catalogInput: readJsonEvidence(catalogPath, isCatalog),
    mapInput: readJsonEvidence(mapPath, isMap), auditInput: readJsonEvidence(auditPath, isAudit) };
}

export function verifyProductCenterReverseScenarioSources(projectRoot: string, readiness: unknown) {
  const workspaceRoot = path.resolve(projectRoot, '..');
  const inputs = readReverseScenarioInputs(projectRoot);
  return verifyJsonInputCurrentness(object(readiness) ? readiness.inputFingerprints : undefined, [
    { path: path.relative(workspaceRoot, inputs.catalogPath), evidence: inputs.catalogInput },
    { path: path.relative(workspaceRoot, inputs.mapPath), evidence: inputs.mapInput },
    { path: path.relative(workspaceRoot, inputs.auditPath), evidence: inputs.auditInput },
  ]);
}

export function generateProductCenterReverseScenarioReadiness(projectRoot = path.resolve(__dirname, '..')) {
const workspaceRoot = path.resolve(projectRoot, '..');
const outputPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-reverse-scenario-readiness-v1.json');
const { catalogPath, mapPath, auditPath, catalogInput, mapInput, auditInput } = readReverseScenarioInputs(projectRoot);
const publish = (filePath: string, value: unknown) => publishImmutableArtifact({ outputRoot: workspaceRoot,
  relativePath: path.relative(workspaceRoot, filePath), content: `${JSON.stringify(value, null, 2)}\n`, reason: 'refresh-reverse-scenario-readiness' });
function publishBlocked(code: string, inputPath: string, inputReason: string) {
  const blockedPath = outputPath.replace(/\.json$/i, '.blocked.json');
  const blocked = {
    schemaVersion: '1.0.0',
    reportId: 'product-center-reverse-scenario-readiness-v1',
    generatedAt: new Date().toISOString(),
    status: 'blocked',
    code,
    inputPath: path.relative(workspaceRoot, inputPath),
    inputReason,
    summary: null,
    executionScope: 'static-and-contract-only',
    guardrails: { businessExecutionStarted: false, existingPassedCasesInvalidated: false },
  };
  publish(blockedPath, blocked);
  publish(outputPath, blocked);
  return { status: 'blocked' as const, outputPath, summary: null };
}
if (catalogInput.status !== 'available') return publishBlocked(`PROCESS_REVERSE_SCENARIO_CATALOG_${catalogInput.status.toUpperCase()}`, catalogPath, catalogInput.reason);
if (mapInput.status !== 'available') return publishBlocked(`PROCESS_REVERSE_SCENARIO_MAP_${mapInput.status.toUpperCase()}`, mapPath, mapInput.reason);
if (auditInput.status !== 'available') return publishBlocked(`PROCESS_REVERSE_SCENARIO_AUDIT_${auditInput.status.toUpperCase()}`, auditPath, auditInput.reason);
const catalog = catalogInput.value;
const map = mapInput.value;
const audit = auditInput.value;
if (map.catalogId !== catalog.catalogId || map.mappings.some((item) => !catalog.scenarios.some((row) => row.scenarioId === item.scenarioId))) {
  return publishBlocked('PROCESS_REVERSE_SCENARIO_MAP_INVALID', mapPath, 'catalog-identity-or-scenario-mismatch');
}
const migrationReportPath = path.join(projectRoot, 'adapters/test-automation-platform/reports/merchant-center-migration-closure.json');
const migration = readJsonEvidence(migrationReportPath, (value): value is { status: string } => object(value) && key(value.status));
const migrationStatus = migration.status === 'available' ? migration.value.status : migration.status;
const knownCaseIds = new Set((audit.corrections ?? []).map((item) => item.caseId));
const mappings = new Map((map.mappings ?? []).map((item) => [item.scenarioId, item]));
const evidenceById = new Map((audit.evidenceInventory ?? []).map((item) => [item.evidenceId, item]));
const evidenceIdsByCase = new Map<string, Set<string>>();
for (const correction of audit.corrections ?? []) {
  evidenceIdsByCase.set(correction.caseId, new Set(correction.evidenceIds ?? []));
}

const scenarios = catalog.scenarios.map((scenario) => {
  const mapping = mappings.get(scenario.scenarioId);
  const unknownCaseIds = (mapping?.caseIds ?? []).filter((caseId) => !knownCaseIds.has(caseId));
  const evidenceAvailable = (mapping?.evidenceRefs ?? []).length > 0;
  const declaredEvidenceRefs = mapping?.evidenceRefs ?? [];
  const linkedCaseEvidenceIds = new Set(
    (mapping?.caseIds ?? []).flatMap((caseId) => [...(evidenceIdsByCase.get(caseId) ?? [])]),
  );
  const evidenceItems = [...linkedCaseEvidenceIds].map((evidenceId) => {
    const item = evidenceById.get(evidenceId);
    return item
      ? { evidenceId, path: item.path ?? '', sha256: item.sha256 ?? '', disposition: item.disposition }
      : { evidenceId, path: '', sha256: '', disposition: 'missing' };
  });
  const consumedEvidenceItems = evidenceItems.filter((item) => item.disposition === 'consumed' && item.path.length > 0);
  const declaredAggregateRefs = declaredEvidenceRefs.filter((evidenceRef) => (
    !evidenceItems.some((item) => evidenceKey(item.path, projectRoot) === evidenceKey(evidenceRef, projectRoot))
  ));
  const unconsumedEvidenceRefs = declaredAggregateRefs;
  const status = mapping && unknownCaseIds.length === 0 && evidenceAvailable ? 'partial' : 'missing';
  return {
    scenarioId: scenario.scenarioId,
    requirementIds: scenario.requirementIds,
    status,
    linkedCaseIds: mapping?.caseIds ?? [],
    evidenceRefs: declaredEvidenceRefs,
    evidenceItems,
    consumedEvidenceCount: consumedEvidenceItems.length,
    declaredEvidenceCount: evidenceItems.length + declaredAggregateRefs.length,
    declaredAggregateRefs,
    unconsumedEvidenceRefs,
    reason: status === 'partial'
      ? unconsumedEvidenceRefs.length > 0 || consumedEvidenceItems.length === 0
        ? '已登记场景证据引用；共享汇总文件不作为逐项消费证据，当前只能计为 partial'
        : mapping?.reason ?? '已有关联证据，但未满足完整流程收据门禁'
      : '商品中心尚未提供该流程场景的项目适配器映射或证据',
    blockingConditions: status === 'partial'
      ? ['execution grant', '完整事件流收据', '标准操作/断言收据', 'API/UI 清理证据']
      : ['项目适配器映射', '来源与证据引用', '标准运行收据'],
  };
});
const summary = {
  scenarioCount: scenarios.length,
  mappedScenarioCount: scenarios.filter((item) => item.status !== 'missing').length,
  partial: scenarios.filter((item) => item.status === 'partial').length,
  missing: scenarios.filter((item) => item.status === 'missing').length,
  covered: 0,
  linkedCaseCount: new Set(scenarios.flatMap((item) => item.linkedCaseIds)).size,
};
const report = {
  schemaVersion: '1.0.0',
  reportId: 'product-center-reverse-scenario-readiness-v1',
  generatedAt: new Date().toISOString(),
  projectId: 'merchant-center-product-center',
  executionScope: 'static-and-contract-only',
  inputFingerprints: [catalogInput.value, mapInput.value, auditInput.value].map((value, index) => ({
    path: path.relative(workspaceRoot, [catalogPath, mapPath, auditPath][index]),
    fingerprint: fingerprintJsonInput(value),
  })),
  summary,
  scenarios,
  resolvedInThisRun: [
    '商品中心映射 caseId 存在性和证据引用校验',
    '流程场景到商品中心证据的 partial/missing 分层',
    '候选用例、完整收据和业务执行的状态隔离',
  ],
  deferredOrBlocked: [
    '真实页面/API 写入、清理和 execution grant',
    '跨 applicationId 试点',
    ...(migrationStatus === 'complete' ? [] : ['迁移基线接受（需明确批准人）']),
    '业务规则冲突和未知上下文的人工裁决',
  ],
  guardrails: {
    businessExecutionStarted: false,
    existingPassedCasesInvalidated: false,
    crossSystemPilot: 'deferred',
    candidateCasesExecutionEligible: false,
  },
};
publish(outputPath, report);
return { status: 'completed' as const, outputPath, summary };
}

function normalizeEvidencePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function evidenceKey(value: string, projectRoot: string): string {
  const normalized = normalizeEvidencePath(value);
  const projectPrefix = path.basename(projectRoot).replace(/\\/g, '/') + '/';
  return normalized.startsWith(projectPrefix)
    ? normalized.slice(projectPrefix.length)
    : normalized;
}

if (require.main === module) {
  const result = generateProductCenterReverseScenarioReadiness();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status === 'blocked') process.exitCode = 1;
}
