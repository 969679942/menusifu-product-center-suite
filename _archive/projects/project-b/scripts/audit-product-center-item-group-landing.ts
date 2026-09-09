import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readPlaywrightExecutionReceipts } from '../utils/playwright-execution-receipt';
import { TestExecutionIndex } from '../utils/test-execution-index';
import { normalizeReleaseObservation } from '../utils/test-execution-state';
import {
  assessTestPlanLanding,
  type TestPlanDisposition,
  type TestPlanLandingCase,
} from '../utils/test-plan-landing-gate';
import { fingerprintProductCenterItemImplementation } from '../adapters/product-center/product-center-item-implementation';
import { resolveSystemTestPlatformArtifact } from '../utils/system-test-platform-paths';
import { parseProductCenterItemCaseSemanticFingerprints } from '../utils/product-center-item-case-semantic-fingerprint';

type AssetIndex = { cases: Array<{ caseId: string; module: string; status: string; reason?: string }> };
type ExecutionDecision = {
  caseId: string;
  status: 'deferred' | 'not-applicable';
  reason: string;
  resumeWhen?: string;
  replacementCaseIds?: string[];
};
type GroupBinding = {
  caseId: string;
  title: string;
  generationAllowed: boolean;
  bindingFingerprint: string;
  blockClassification: string | null;
  blockedReasons: string[];
};
type ItemCase = {
  caseId: string;
  title: string;
  scope: string;
  reviewDecision: string;
  automation: { bound: boolean; runtimeReadiness: string; blockingReasons: string[] };
  runtime?: { status: string; evidenceRefs?: string[] };
};
type ItemPlan = { fingerprint: string; summary: Record<string, number>; cases: ItemCase[] };
type AdditionalAutomationBinding = {
  caseId: string;
  module: string;
  handlerId: string;
  bindingFingerprint: string;
  scriptPath: string;
  runnerId: 'group' | 'item' | 'remaining' | 'system-test';
  runtimeReadiness: 'ready' | 'blocked' | 'environment-blocked' | string;
  status: string;
};
type CanonicalCase = { caseId: string; title: string; caseFingerprint: string };
type ExecutionPlan = {
  tasks: Array<{ caseId: string; bindingFingerprint?: string | null }>;
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const assetRoot = path.resolve(workspaceRoot, 'Merchant Center Info/00-待转换测试方案');
const outputRoot = path.resolve(workspaceRoot, 'deliverables/test-plan-governance');
const landingOutputBaseName = process.env.PC_LANDING_OUTPUT_BASENAME?.trim()
  || 'product-center-item-group-landing-audit';
const executionIndexPath = resolveSystemTestPlatformArtifact('execution-index.json');
const itemPlan = readJson<ItemPlan>(path.join(workspaceRoot, 'deliverables/product-center-item/test-cases.json'));
const additionalAutomationBindings = readJson<{ bindings?: AdditionalAutomationBinding[] }>(path.join(
  projectRoot,
  'contracts/product-center/test-plan-additional-automation-bindings.json',
)).bindings ?? [];
const additionalAutomationByCaseId = new Map(
  additionalAutomationBindings.map((binding) => [binding.caseId, binding]),
);
const executionPlan = readJson<ExecutionPlan>(path.join(
  workspaceRoot,
  'deliverables/product-center-source-governance/execution-plan.json',
));
const executionTaskById = new Map(executionPlan.tasks.map((item) => [item.caseId, item]));
const index = new TestExecutionIndex(executionIndexPath);
const indexedEvidencePaths = index.snapshot().records.flatMap((record) => record.evidencePath ? [record.evidencePath] : []);
const registeredEvidencePaths = itemPlan.cases.flatMap((item) => item.runtime?.evidenceRefs ?? []);

const configuredReceiptPaths = [
  'output/product-center-group-human-rule-rebaseline-20260819.json',
  'output/product-center-group-human-rule-rebaseline-20260819-v2.json',
  'output/product-center-group-human-rule-rebaseline-20260819-v3.json',
  'output/product-center-group-human-rule-rebaseline-20260819-v4.json',
  'output/product-center-group-human-rule-rebaseline-20260819-v5.json',
  'output/product-center-group-human-rule-rebaseline-20260819-v6.json',
  'output/product-center-group-human-rule-rebaseline-20260819-v7.json',
].map((item) => path.resolve(projectRoot, item));
const evidenceDiscovery = discoverExecutionEvidence([
  ...configuredReceiptPaths,
  ...registeredEvidencePaths.flatMap(resolveEvidenceReference),
  ...indexedEvidencePaths.flatMap(resolveEvidenceReference),
]);
const currentReceiptReports = evidenceDiscovery.playwrightReports;

const imported = currentReceiptReports.map((reportPath) => readPlaywrightExecutionReceipts({
  reportPath,
  workspaceRoot,
}));
const importedRecords = imported.flatMap((item) => item.records);
index.upsert(importedRecords);
const executionRecords = index.snapshot().records;
const latestImportedRecord = importedRecords
  .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
  .at(-1);
const currentReleaseObservation = normalizeReleaseObservation({
  releaseObservation: latestImportedRecord?.releaseObservation,
  applicationVersionFingerprint: latestImportedRecord?.applicationVersionFingerprint
    ?? process.env.PC_CURRENT_APPLICATION_VERSION,
  observedAt: latestImportedRecord?.recordedAt,
});

const decisions = readJson<{ decisions: ExecutionDecision[] }>(path.join(
  projectRoot,
  'contracts/product-center/reviews/product-center-execution-decisions.json',
)).decisions;
const decisionsById = new Map(decisions.map((item) => [item.caseId, item]));
const repairQueuePath = path.join(
  workspaceRoot,
  'deliverables/test-plan-governance/product-center-execution-repair-queue.json',
);
type RepairQueueItem = {
  caseId: string;
  classification: string;
  evidencePath?: string | null;
  evidenceRecordedAt?: string | null;
  caseFingerprintAtObservation?: string | null;
  implementationFingerprintAtObservation?: string | null;
  evidenceStatus?: 'complete' | 'incomplete';
};
const repairItems = fs.existsSync(repairQueuePath)
  ? readJson<{ items: RepairQueueItem[] }>(repairQueuePath).items
  : [];
const repairItemByCaseId = new Map(repairItems.map((item) => [item.caseId, item]));
const latestExecutionByCaseId = new Map<string, typeof executionRecords[number]>();
for (const record of executionRecords) {
  const current = latestExecutionByCaseId.get(record.caseId);
  if (!current || current.recordedAt < record.recordedAt) latestExecutionByCaseId.set(record.caseId, record);
}
const productDefectCaseIds = new Set(repairItems
  .filter((item) => item.classification === 'product-behavior')
  .map((item) => item.caseId));
const completed = readJson<AssetIndex>(path.join(assetRoot, '已完成/index.json'));
const unlanded = readJson<AssetIndex>(path.join(assetRoot, '未落地/index.json'));

const itemCanonical = parseCanonicalCases(path.join(
  assetRoot,
  '用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
), /^TC-ITEM-/);
const itemSemanticFingerprintById = new Map(parseProductCenterItemCaseSemanticFingerprints(path.join(
  assetRoot,
  '用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
)).map((item) => [item.caseId, item.fingerprint]));
const itemCasesById = new Map(itemPlan.cases.map((item) => [item.caseId, item]));
const itemCases: TestPlanLandingCase[] = itemCanonical.map((canonical) => {
  const item = itemCasesById.get(canonical.caseId);
  const additionalBinding = additionalAutomationByCaseId.get(canonical.caseId);
  const decision = decisionsById.get(canonical.caseId);
  const repairItem = repairItemByCaseId.get(canonical.caseId);
  const handledOutcome = resolveHandledOutcome(canonical.caseId, item?.runtime);
  const invalidRuntimeProjection = Boolean(item?.runtime?.status === 'runtime-passed' && !handledOutcome);
  const notApplicable = unlanded.cases.find((entry) => entry.caseId === canonical.caseId)?.status === 'not-applicable';
  return {
    caseId: canonical.caseId,
    title: item?.title ?? canonical.title,
    disposition: productDefectCaseIds.has(canonical.caseId)
      ? 'product-defect'
      : decision?.status ?? (notApplicable ? 'not-applicable' : 'ready'),
    automationBound: Boolean(item?.automation.bound)
      || Boolean(additionalBinding
        && additionalBinding.status === 'landed'
        && additionalBinding.runtimeReadiness === 'ready'
        && additionalBinding.handlerId
        && additionalBinding.scriptPath),
    caseFingerprint: item?.automation.bound
      ? executionTaskById.get(canonical.caseId)?.bindingFingerprint ?? itemPlan.fingerprint
      : additionalBinding?.status === 'landed'
        && additionalBinding.runtimeReadiness === 'ready'
        && additionalBinding.handlerId
        && additionalBinding.scriptPath
        ? executionTaskById.get(canonical.caseId)?.bindingFingerprint ?? additionalBinding.bindingFingerprint
        : null,
    semanticCaseFingerprint: itemSemanticFingerprintById.get(canonical.caseId) ?? null,
    // The semantic case fingerprint is the sole active identity. The former
    // binding/effective fingerprint is retained only as legacy provenance.
    fingerprintMatchMode: 'semantic',
    implementationFingerprint: item?.automation.bound
      ? fingerprintProductCenterItemImplementation(projectRoot, canonical.caseId)
      : additionalBinding?.status === 'landed'
        && additionalBinding.runtimeReadiness === 'ready'
        && additionalBinding.handlerId
        && additionalBinding.scriptPath
        ? fingerprintProductCenterItemImplementation(projectRoot, canonical.caseId)
        : null,
    implementationFingerprintRequired: !handledOutcome && (Boolean(repairItem)
      || latestExecutionByCaseId.get(canonical.caseId)?.status === 'failed'),
    productDefectEvidence: repairItem?.classification === 'product-behavior' ? {
      caseFingerprint: repairItem.caseFingerprintAtObservation ?? null,
      implementationFingerprint: repairItem.implementationFingerprintAtObservation ?? null,
      evidenceStatus: repairItem.evidenceStatus ?? 'legacy-unverified',
      recordedAt: repairItem.evidenceRecordedAt ?? null,
      evidencePath: repairItem.evidencePath ?? null,
    } : null,
    reason: productDefectCaseIds.has(canonical.caseId)
      ? '最新执行收据已确认产品行为偏差；保留自动化脚本，产品修复或预期确认后定向重跑。'
      : decision
      ? formatExecutionDecisionReason(decision)
      : invalidRuntimeProjection
      ? '历史 runtime-passed 引用未覆盖该 caseId，已阻断伪通过；需要补充该用例自己的处理证据。'
      : item?.automation.blockingReasons.join('；'),
    handledOutcome,
    historicalExecution: item?.runtime ? {
      status: item.runtime.status,
      evidenceRefs: item.runtime.evidenceRefs ?? [],
      handlingStatus: handledOutcome ? 'handled' : 'unhandled',
      verificationStatus: handledOutcome?.verificationStatus ?? (invalidRuntimeProjection ? 'invalid-reference' : 'not-verified'),
      handlingEvidence: handledOutcome?.evidencePath ?? null,
    } : null,
  };
});

const groupBindings = readJson<{ cases: GroupBinding[] }>(path.join(
  projectRoot,
  'contracts/product-center/group/product-center-group-bindings.json',
)).cases;
const groupBindingsById = new Map(groupBindings.map((item) => [item.caseId, item]));
const groupCanonical = parseCanonicalCases(path.join(
  assetRoot,
  '用例库/商品中心-商品管理-组/2.商品中心-商品管理-组-正式测试用例.md',
), /^TC-GRP-/);
const groupCases: TestPlanLandingCase[] = groupCanonical.map((canonical) => {
  const binding = groupBindingsById.get(canonical.caseId);
  const decision = decisionsById.get(canonical.caseId);
  return {
    caseId: canonical.caseId,
    title: binding?.title ?? canonical.title,
    disposition: resolveGroupDisposition(binding, decision),
    automationBound: Boolean(binding?.generationAllowed),
    caseFingerprint: binding?.generationAllowed ? binding.bindingFingerprint : null,
    reason: decision
      ? `${decision.reason}；恢复条件：${decision.resumeWhen}`
      : binding?.blockedReasons.join('；'),
  };
});

const assessments = [
  {
    module: '商品管理-商品',
    assessment: assessTestPlanLanding({
      planId: 'product-center-item',
      changeObservation: currentReleaseObservation,
      cases: itemCases,
      executionRecords,
    }),
    adapterWarnings: [
      '商品逐用例指纹由正式用例段与当前生成脚本内容共同计算；共享脚本变化会保守地使相关历史收据失效。',
      '商品历史 runtime-passed 状态尚未全部转换为包含执行上下文、断言覆盖和清理终态的标准执行收据。',
    ],
    legacyRuntimePassed: itemPlan.summary.runtimePassed ?? 0,
  },
  {
    module: '商品管理-组',
    assessment: assessTestPlanLanding({
      planId: 'product-center-group',
      changeObservation: currentReleaseObservation,
      cases: groupCases,
      executionRecords,
    }),
    adapterWarnings: [
      'TC-GRP-PKG-009 最新增量运行因商品列表上下文不可用而未形成通过收据。',
    ],
    legacyRuntimePassed: executionRecords.filter((record) => (
      record.status === 'passed' && record.caseId.startsWith('TC-GRP-')
    )).map((record) => record.caseId).filter((caseId, index, values) => values.indexOf(caseId) === index).length,
  },
];

const report = {
  schemaVersion: '1.0.0',
  collectionId: 'test-plan-landing-audit',
  generatedAt: new Date().toISOString(),
  currentApplicationVersionFingerprint: currentReleaseObservation.fingerprint,
  changeObservation: currentReleaseObservation,
  evidencePolicy: {
    screenshotsAuthorizePass: false,
    passRequiresMatchingExecutionReceipt: true,
    humanRuleChangesRequireRerun: true,
    releaseIdentityRequiredForExecutionPass: false,
    releaseIdentityControlsAutomaticReuseOnly: true,
  },
  receiptImport: {
    reports: currentReceiptReports.map((item) => relativeWorkspace(item)),
    imported: importedRecords.length,
    diagnostics: [...new Set(imported.flatMap((item) => item.diagnostics))].sort(),
    releaseObservationStatus: currentReleaseObservation.status,
    discoveredRegisteredEvidence: evidenceDiscovery.discovered.map(relativeWorkspace),
    legacyEvidenceArtifacts: evidenceDiscovery.legacyArtifacts.map(relativeWorkspace),
  },
  assetIndex: {
    completed: completed.cases.length,
    unlanded: unlanded.cases.length,
  },
  modules: assessments,
};

fs.mkdirSync(outputRoot, { recursive: true });
writeJson(path.join(outputRoot, `${landingOutputBaseName}.json`), report);
fs.writeFileSync(
  path.join(outputRoot, `${landingOutputBaseName}.md`),
  renderMarkdown(report),
  'utf8',
);
process.stdout.write(`${JSON.stringify(assessments.map((item) => ({
  module: item.module,
  status: item.assessment.status,
  summary: item.assessment.summary,
})), null, 2)}\n`);

function resolveGroupDisposition(
  binding: GroupBinding | undefined,
  decision: ExecutionDecision | undefined,
): TestPlanDisposition {
  if (decision) return decision.status;
  if (!binding) return 'blocked-source';
  if (binding.generationAllowed) return 'ready';
  if (binding.blockClassification === 'not-applicable') return 'not-applicable';
  if (binding.blockClassification === 'observed-product-drift') return 'product-defect';
  if (binding.blockClassification === 'source-evidence-blocked') return 'blocked-source';
  return 'blocked-technical';
}

function formatExecutionDecisionReason(decision: ExecutionDecision): string {
  if (decision.status === 'deferred') return `${decision.reason}；恢复条件：${decision.resumeWhen}`;
  if (decision.replacementCaseIds?.length) return `${decision.reason}；替代用例：${decision.replacementCaseIds.join('、')}`;
  return `${decision.reason}；替代用例：无；${decision.resumeWhen}`;
}

type RemediationReport = {
  batches?: Array<{
    caseIds?: string[];
    passed?: number;
    failed?: number;
  }>;
};

function resolveHandledOutcome(
  caseId: string,
  runtime: ItemCase['runtime'] | undefined,
) {
  if (!runtime?.evidenceRefs?.length) return null;
  for (const reference of runtime.evidenceRefs) {
    const evidencePath = resolveEvidenceReference(reference)
      .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!evidencePath) continue;
    try {
      const report = readJson<RemediationReport>(evidencePath);
      const batch = report.batches?.find((item) => item.caseIds?.includes(caseId));
      if (batch && (batch.passed ?? 0) > 0 && (batch.failed ?? 0) === 0) {
        return {
          status: 'handled' as const,
          source: 'remediation-batch',
          evidenceStatus: 'complete' as const,
          evidencePath: relativeWorkspace(evidencePath),
          recordedAt: null,
          verificationStatus: 'legacy-verified' as const,
          reason: `该用例已在整改批次 ${batch.caseIds?.join('、')} 中通过；旧执行失败仅保留为历史诊断，不重复执行。`,
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function parseCanonicalCases(filePath: string, idPattern: RegExp): CanonicalCase[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const sections = content.split(/^### 用例编号：/m).slice(1);
  const cases = sections.flatMap((section) => {
    const caseId = section.match(/^(TC-[A-Z0-9-]+)/)?.[1];
    const title = section.match(/^用例标题：(.+)$/m)?.[1]?.trim();
    return caseId && idPattern.test(caseId) ? [{
      caseId,
      title: title ?? caseId,
      caseFingerprint: sha256(section.replace(/\r\n/g, '\n').trim()),
    }] : [];
  });
  const duplicate = cases.find((item, index) => cases.findIndex((candidate) => candidate.caseId === item.caseId) !== index);
  if (duplicate) throw new Error(`CANONICAL_CASE_DUPLICATE:${duplicate.caseId}`);
  return cases;
}

function renderMarkdown(value: typeof report): string {
  return [
    '# 商品与组测试方案通用流程落地审计',
    '',
    `- 发布变化观测：${value.changeObservation.status}${value.changeObservation.fingerprint ? ` (${value.changeObservation.fingerprint})` : ''}`,
    `- 新增标准执行收据：${value.receiptImport.imported}`,
    '- 截图是否可直接判定通过：否',
    '',
    '| 测试方案 | 正式用例 | 历史通过状态（仅参考） | 证据完整通过 | 已处理无需动作 | 待证据闭环/变化重验 | 延期 | 不适用 | 产品缺陷 | 来源阻断 | 技术阻断 | 无效 | 结论 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...value.modules.map(({ module, assessment, legacyRuntimePassed }) => `| ${module} | ${assessment.summary.total} | ${legacyRuntimePassed} | ${assessment.summary.passed} | ${assessment.summary.handled} | ${assessment.summary.ready} | ${assessment.summary.deferred} | ${assessment.summary.notApplicable} | ${assessment.summary.productDefect} | ${assessment.summary.blockedSource} | ${assessment.summary.blockedTechnical} | ${assessment.summary.invalid} | ${assessment.status} |`),
    '',
    ...value.modules.flatMap(({ module, assessment, adapterWarnings }) => [
      `## ${module}`,
      '',
      ...adapterWarnings.map((item) => `- ${item}`),
      `- 待证据闭环或明确变化重验 ${assessment.summary.ready} 条；完整逐条状态见同目录 JSON。`,
      ...assessment.cases.filter((item) => ['invalid', 'product-defect', 'blocked-source', 'blocked-technical'].includes(item.status))
        .map((item) => `- ${item.caseId} | ${item.status} | ${item.reasons.join('；') || item.reason || ''}`),
      '',
    ]),
  ].join('\n');
}

function relativeWorkspace(filePath: string): string {
  return path.relative(workspaceRoot, filePath).replaceAll(path.sep, '/');
}

function discoverExecutionEvidence(candidates: readonly string[]): {
  discovered: string[];
  playwrightReports: string[];
  legacyArtifacts: string[];
} {
  const discovered = [...new Set(candidates.map((item) => path.resolve(item)))]
    .filter((item) => isWithinWorkspace(item) && fs.existsSync(item) && fs.statSync(item).isFile())
    .sort();
  const playwrightReports: string[] = [];
  const legacyArtifacts: string[] = [];
  for (const filePath of discovered) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { suites?: unknown };
      if (Array.isArray(parsed.suites)) playwrightReports.push(filePath);
      else legacyArtifacts.push(filePath);
    } catch {
      legacyArtifacts.push(filePath);
    }
  }
  return { discovered, playwrightReports, legacyArtifacts };
}

function isWithinWorkspace(filePath: string): boolean {
  const relative = path.relative(workspaceRoot, filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function resolveEvidenceReference(reference: string): string[] {
  if (path.isAbsolute(reference)) return [reference];
  return [path.resolve(projectRoot, reference), path.resolve(workspaceRoot, reference)];
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
