import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  buildDocumentRuleBatchPreflight,
  type DocumentRuleBatchPreflight,
  type DocumentRuleImplementationIdentity,
  type DocumentRuleObligationMapping,
} from '../utils/product-center-document-rule-preflight';
import { fingerprintProductCenterItemImplementation } from '../adapters/product-center/product-center-item-implementation';
import { parseProductCenterItemCaseSemanticFingerprints } from '../utils/product-center-item-case-semantic-fingerprint';

type DocumentRule = {
  ruleId: string;
  status: string;
  primaryLineNumber: number;
  moduleSection: string;
  statement: string;
  sourceLabels: string[];
};

type RegistryCandidate = {
  ruleId: string;
  caseId: string;
  sourceIds: string[];
};

type WorkLane = 'source-repair' | 'case-design' | 'receipt-join' | 'batch-preflight';

export type DocumentRulePromotionPlan = {
  schemaVersion: '1.0.0';
  planId: 'product-center-document-rule-promotion-plan';
  scope: 'generated-evidence';
  generatedAt: string;
  objective: string;
  source: {
    authoritativeDocument: string;
    documentCoverage: string;
    ruleRegistry: string;
    landingAudit: string;
    canonicalCaseRoot: string;
    executionIndex: string;
    obligationMappings: string;
    inputFingerprint: string;
  };
  summary: {
    pendingLifecycleRules: number;
    sourceRepair: number;
    caseDesign: number;
    receiptJoin: number;
    batchPreflight: number;
    linkedToCanonicalCase: number;
    currentReceiptVerified: number;
    historicalCompleteReceiptAvailable: number;
    humanDecisionRequiredNow: 0;
    businessExecutionStarted: false;
    formalRulesModified: false;
  };
  workItems: Array<{
    ruleId: string;
    statement: string;
    moduleSection: string;
    sourceLabels: string[];
    sourceLine: number;
    linkedCandidateIds: string[];
    linkedCaseIds: string[];
    currentVerifiedCaseIds: string[];
    historicalCompleteReceiptCaseIds: string[];
    lane: WorkLane;
    reasonCodes: string[];
    automatedActions: string[];
    approvalEligibleNow: false;
    humanActionRequiredNow: false;
  }>;
  batches: Array<{
    batchId: string;
    moduleSection: string;
    lane: WorkLane;
    ruleIds: string[];
    stopCondition: string;
  }>;
  guardrails: {
    sourceDocumentRemainsSoleSemanticAuthority: true;
    noAutomaticFormalPromotion: true;
    noAutomaticBusinessExecution: true;
    missingEvidenceDoesNotBecomeHumanQuestion: true;
    conflictsRequireIndividualDecisionAfterEvidence: true;
    currentReceiptsMustMatchCaseAndImplementationFingerprints: true;
  };
  batchPreflight: DocumentRuleBatchPreflight;
  fingerprint: string;
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const documentCoveragePath = path.join(projectRoot, 'output/governance/product-center-business-rule-document-coverage.json');
const registryPath = path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-item-rule-registry.json');
const landingAuditPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-item-group-landing-audit.json');
const authoritativeDocumentPath = path.join(workspaceRoot, 'Merchant Center Info/商品中心业务规则.md');
const canonicalCaseRoot = path.join(workspaceRoot, 'Merchant Center Info/00-待转换测试方案/用例库');
const executionIndexPath = path.join(projectRoot, 'deliverables/system-test-platform/execution-index.json');
const lifecyclePath = path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json');
const implementationManifestPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-case-fingerprints.json');
const obligationMappingsPath = path.join(
  projectRoot,
  'contracts/product-center/business-rules/product-center-document-rule-obligation-mappings.json',
);
const itemCanonicalPath = path.join(
  workspaceRoot,
  'Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
);
const outputRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const outputJsonPath = path.join(outputRoot, 'product-center-document-rule-promotion-plan.json');
const outputMarkdownPath = path.join(outputRoot, 'product-center-document-rule-promotion-plan.md');
const preflightJsonPath = path.join(outputRoot, 'product-center-document-rule-batch-preflight.json');
const preflightMarkdownPath = path.join(outputRoot, 'product-center-document-rule-batch-preflight.md');

export function buildProductCenterDocumentRulePromotionPlan(): DocumentRulePromotionPlan {
  const coverage = readJson<{ documentRuleLedger: DocumentRule[] }>(documentCoveragePath);
  const registry = readJson<{ candidates: RegistryCandidate[] }>(registryPath);
  const lifecycle = readJson<{ rules?: Array<{ ruleId: string; statement: string }> }>(lifecyclePath);
  const obligationMappingContract = readJson<{
    schemaVersion: string;
    mappings: DocumentRuleObligationMapping[];
  }>(obligationMappingsPath);
  if (obligationMappingContract.schemaVersion !== '1.0.0' || !Array.isArray(obligationMappingContract.mappings)) {
    throw new Error('业务规则义务映射合同格式无效。');
  }
  const explicitlyMappedRuleIds = new Set(obligationMappingContract.mappings.map((item) => item.ruleId));
  const landing = readJson<{
    modules: Array<{ module: string; assessment?: { cases?: Array<{ caseId: string; status?: string; executionReceipt?: { evidenceStatus?: string } | null }> } }>;
  }>(landingAuditPath);
  const executionIndex = readJson<{ records: Array<{ caseId: string; status?: string; evidenceStatus?: string }> }>(executionIndexPath);
  const currentPassedCaseIds = new Set(
    landing.modules.flatMap((item) => item.assessment?.cases ?? [])
      .filter((item) => item.status === 'passed' && item.executionReceipt?.evidenceStatus === 'complete')
      .map((item) => item.caseId),
  );
  const historicalCompleteReceiptCaseIds = new Set(executionIndex.records
    .filter((item) => item.status === 'passed' && item.evidenceStatus === 'complete')
    .map((item) => item.caseId));
  const canonicalRuleLinks = scanCanonicalCaseRuleLinks(canonicalCaseRoot);
  const pendingRules = coverage.documentRuleLedger
    .filter((item) => item.status === 'document-registered-pending-lifecycle')
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  const workItems: DocumentRulePromotionPlan['workItems'] = pendingRules.map((rule) => {
    const linked = registry.candidates.filter((candidate) => candidate.sourceIds.includes(`declared-business-rule:${rule.ruleId}`));
    const linkedCaseIds = unique([
      ...linked.map((item) => item.caseId),
      ...(canonicalRuleLinks.get(rule.ruleId) ?? []),
    ]);
    const currentVerifiedCaseIds = linkedCaseIds.filter((caseId) => currentPassedCaseIds.has(caseId));
    const historicalReceiptCaseIds = linkedCaseIds.filter((caseId) => historicalCompleteReceiptCaseIds.has(caseId));
    const sourceIncomplete = rule.sourceLabels.length === 0 || /^未提取到独立规则正文/u.test(rule.statement);
    const lane: WorkLane = sourceIncomplete
      ? 'source-repair'
      : linkedCaseIds.length === 0 ? 'case-design'
        : explicitlyMappedRuleIds.has(rule.ruleId) ? 'batch-preflight' : 'receipt-join';
    return {
      ruleId: rule.ruleId,
      statement: rule.statement,
      moduleSection: rule.moduleSection,
      sourceLabels: rule.sourceLabels,
      sourceLine: rule.primaryLineNumber,
      linkedCandidateIds: unique(linked.map((item) => item.ruleId)),
      linkedCaseIds,
      currentVerifiedCaseIds,
      historicalCompleteReceiptCaseIds: historicalReceiptCaseIds,
      lane,
      reasonCodes: lane === 'source-repair'
        ? ['AUTHORITATIVE_SOURCE_OR_RULE_BODY_INCOMPLETE']
        : lane === 'case-design' ? ['NO_TRACEABLE_CANONICAL_CASE']
          : lane === 'receipt-join' ? ['CURRENT_STANDARD_RECEIPT_NOT_MAPPED']
            : ['EXPLICIT_OBLIGATION_MAPPING_AVAILABLE_FOR_BATCH_PREFLIGHT'],
      automatedActions: actionsForLane(lane),
      approvalEligibleNow: false,
      humanActionRequiredNow: false,
    };
  });
  const grouped = new Map<string, DocumentRulePromotionPlan['batches'][number]>();
  for (const item of workItems) {
    const key = `${item.lane}|${item.moduleSection}`;
    const batch = grouped.get(key) ?? {
      batchId: `document-rule-batch-${shortHash(key)}`,
      moduleSection: item.moduleSection,
      lane: item.lane,
      ruleIds: [],
      stopCondition: stopConditionForLane(item.lane),
    };
    batch.ruleIds.push(item.ruleId);
    grouped.set(key, batch);
  }
  const summary = {
    pendingLifecycleRules: workItems.length,
    sourceRepair: workItems.filter((item) => item.lane === 'source-repair').length,
    caseDesign: workItems.filter((item) => item.lane === 'case-design').length,
    receiptJoin: workItems.filter((item) => item.lane === 'receipt-join').length,
    batchPreflight: workItems.filter((item) => item.lane === 'batch-preflight').length,
    linkedToCanonicalCase: workItems.filter((item) => item.linkedCaseIds.length > 0).length,
    currentReceiptVerified: workItems.filter((item) => item.currentVerifiedCaseIds.length > 0).length,
    historicalCompleteReceiptAvailable: workItems.filter((item) => item.historicalCompleteReceiptCaseIds.length > 0).length,
    humanDecisionRequiredNow: 0 as const,
    businessExecutionStarted: false as const,
    formalRulesModified: false as const,
  };
  const implementationIdentities = buildCurrentImplementationIdentities(
    unique(workItems.flatMap((item) => item.linkedCaseIds)),
  );
  const inputFingerprint = sha256([
    fs.readFileSync(authoritativeDocumentPath),
    fs.readFileSync(documentCoveragePath),
    fs.readFileSync(registryPath),
    fs.readFileSync(landingAuditPath),
    fs.readFileSync(executionIndexPath),
    fs.readFileSync(lifecyclePath),
    fs.readFileSync(implementationManifestPath),
    fs.readFileSync(obligationMappingsPath),
    Buffer.from(stableJson(implementationIdentities)),
    ...listMarkdownFiles(canonicalCaseRoot).map((filePath) => fs.readFileSync(filePath)),
  ].map((item) => sha256(item)).join(':'));
  const generatedAt = new Date().toISOString();
  const batchPreflight = buildDocumentRuleBatchPreflight({
    projectRoot,
    workspaceRoot,
    rules: workItems.filter((item) => item.lane === 'batch-preflight').map((item) => ({
      ruleId: item.ruleId,
      statement: item.statement,
      moduleSection: item.moduleSection,
      sourceLabels: item.sourceLabels,
      sourceLine: item.sourceLine,
      linkedCaseIds: item.linkedCaseIds,
    })),
    canonicalCaseRoot,
    landingAuditPath,
    executionIndexPath,
    implementationIdentities,
    formalRules: lifecycle.rules ?? [],
    obligationMappings: obligationMappingContract.mappings,
    generatedAt,
  });
  const unsigned = {
    schemaVersion: '1.0.0' as const,
    planId: 'product-center-document-rule-promotion-plan' as const,
    scope: 'generated-evidence' as const,
    generatedAt,
    objective: '将权威业务规则文档中的待生命周期核验规则按来源、用例和当前收据自动分流，形成批量晋升前工作队列，避免逐条人工翻功能确认。',
    source: {
      authoritativeDocument: 'Merchant Center Info/商品中心业务规则.md',
      documentCoverage: 'Merchant Center UITest/output/governance/product-center-business-rule-document-coverage.json',
      ruleRegistry: 'Merchant Center UITest/contracts/product-center/business-rules/generated/product-center-item-rule-registry.json',
      landingAudit: 'deliverables/test-plan-governance/product-center-item-group-landing-audit.json',
      canonicalCaseRoot: 'Merchant Center Info/00-待转换测试方案/用例库',
      executionIndex: 'Merchant Center UITest/deliverables/system-test-platform/execution-index.json',
      obligationMappings: 'Merchant Center UITest/contracts/product-center/business-rules/product-center-document-rule-obligation-mappings.json',
      inputFingerprint,
    },
    summary,
    workItems,
    batches: [...grouped.values()].map((item) => ({ ...item, ruleIds: item.ruleIds.sort() }))
      .sort((left, right) => `${left.lane}|${left.moduleSection}`.localeCompare(`${right.lane}|${right.moduleSection}`)),
    guardrails: {
      sourceDocumentRemainsSoleSemanticAuthority: true as const,
      noAutomaticFormalPromotion: true as const,
      noAutomaticBusinessExecution: true as const,
      missingEvidenceDoesNotBecomeHumanQuestion: true as const,
      conflictsRequireIndividualDecisionAfterEvidence: true as const,
      currentReceiptsMustMatchCaseAndImplementationFingerprints: true as const,
    },
    batchPreflight,
  };
  const plan: DocumentRulePromotionPlan = { ...unsigned, fingerprint: sha256(stableJson(unsigned)) };
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputMarkdownPath, renderMarkdown(plan), 'utf8');
  fs.writeFileSync(preflightJsonPath, `${JSON.stringify(batchPreflight, null, 2)}\n`, 'utf8');
  fs.writeFileSync(preflightMarkdownPath, renderPreflightMarkdown(batchPreflight), 'utf8');
  return plan;
}

function buildCurrentImplementationIdentities(caseIds: readonly string[]): DocumentRuleImplementationIdentity[] {
  const selected = new Set(caseIds);
  const group = readJson<{ cases?: DocumentRuleImplementationIdentity[] }>(implementationManifestPath).cases ?? [];
  const itemSemantics = parseProductCenterItemCaseSemanticFingerprints(itemCanonicalPath);
  return [
    ...group.filter((item) => selected.has(item.caseId)),
    ...itemSemantics.filter((item) => selected.has(item.caseId)).map((item) => ({
      caseId: item.caseId,
      bindingFingerprint: `sha256:${item.fingerprint}`,
      implementationFingerprint: fingerprintProductCenterItemImplementation(projectRoot, item.caseId),
    })),
  ].sort((left, right) => left.caseId.localeCompare(right.caseId));
}

function actionsForLane(lane: WorkLane): string[] {
  if (lane === 'source-repair') return ['搜索权威来源登记和原始文档', '验证规则正文与来源指纹', '无法恢复时保持 hold，不要求业务人员猜测'];
  if (lane === 'case-design') return ['先跨模块匹配既有规范用例', '按规则语义拆分必选义务', '只对未覆盖义务生成用例草案'];
  if (lane === 'receipt-join') return ['按 caseId 与当前用例/实现指纹查找标准收据', '验证断言面与清理证据', '无完整收据时进入精确定向执行审批候选'];
  return ['校验规则冲突、适用范围和候选快照', '按同模块同语义批次生成审批草案', '审批后仅对缺少当前验证的义务生成增量执行候选'];
}

function stopConditionForLane(lane: WorkLane): string {
  if (lane === 'source-repair') return '没有可验证来源或独立规则正文时保持 hold。';
  if (lane === 'case-design') return '必选义务未拆分或无来源时不得生成正式用例。';
  if (lane === 'receipt-join') return '收据与当前用例/实现指纹不匹配时不得判定已验证。';
  return '存在冲突、语义变体、来源过期或未显式审批时不得晋升。';
}

function renderMarkdown(plan: DocumentRulePromotionPlan): string {
  return [
    '# 商品中心旧业务规则快速晋升工作台', '',
    `- 待生命周期核验：${plan.summary.pendingLifecycleRules}`,
    `- 来源修复：${plan.summary.sourceRepair}；缺用例设计：${plan.summary.caseDesign}；收据关联：${plan.summary.receiptJoin}；批量预审：${plan.summary.batchPreflight}`,
    `- 已关联规范用例：${plan.summary.linkedToCanonicalCase}；旧工作台声明至少一条当前收据：${plan.summary.currentReceiptVerified}；严格义务级当前验证：${plan.batchPreflight.summary.executionVerifiedRules}；可协调历史完整收据：${plan.summary.historicalCompleteReceiptAvailable}`,
    `- 20 条预审规则义务：${plan.batchPreflight.summary.obligations}；结构完整：${plan.batchPreflight.summary.structurallyCoveredRules}；可进入批量语义审批：${plan.batchPreflight.summary.approvalEligibleRules}；其中执行验证待补：${plan.batchPreflight.summary.approvalReadyButVerificationPendingRules}`,
    '- 当前人工决定：0；正式规则改动：0；业务执行：未启动。', '',
    '## 使用顺序', '',
    '1. 系统先完成来源修复、已有用例匹配、义务拆分和历史/当前收据关联。',
    '2. 来源与义务结构完整且无冲突的规则进入按模块批量语义审批；当前执行验证独立记录，不再阻塞规则审批。',
    '3. 人工一次审核一个语义批次；只有真正冲突或歧义才拆为单条。',
    '4. 审批与执行分离；缺当前执行证据只生成精确增量候选，不自动运行。', '',
    '## 规则工作队列', '',
    '| 规则 | 模块 | 通道 | 来源 | 已关联用例 | 当前收据 | 历史收据 | 自动动作 |',
    '|---|---|---|---|---|---|---|---|',
    ...plan.workItems.map((item) => `| ${item.ruleId} | ${item.moduleSection} | ${item.lane} | ${item.sourceLabels.join('、') || '缺失'} | ${item.linkedCaseIds.join('、') || '无'} | ${item.currentVerifiedCaseIds.join('、') || '无'} | ${item.historicalCompleteReceiptCaseIds.join('、') || '无'} | ${item.automatedActions.join('；')} |`),
    '', '## 批次', '',
    '| 批次 | 模块 | 通道 | 规则数 | 停止条件 |',
    '|---|---|---|---:|---|',
    ...plan.batches.map((batch) => `| ${batch.batchId} | ${batch.moduleSection} | ${batch.lane} | ${batch.ruleIds.length} | ${batch.stopCondition} |`),
    '',
  ].join('\n');
}

function renderPreflightMarkdown(report: DocumentRuleBatchPreflight): string {
  return [
    '# 商品中心 20 条旧规则批量预审', '',
    `- 规则：${report.summary.rules}；原文义务：${report.summary.obligations}`,
    `- 结构覆盖：完整 ${report.summary.structurallyCoveredRules}、部分 ${report.summary.partiallyCoveredRules}、未覆盖 ${report.summary.uncoveredRules}`,
    `- 当前执行义务完整：${report.summary.executionVerifiedRules}；需精确补证据：${report.summary.evidenceRemediationRules}`,
    `- 显式冲突：${report.summary.explicitConflicts}；真实语义人工决定：${report.summary.humanSemanticDecisionsRequired}`,
    `- 关系检查：${report.summary.rulesComparedForRelationship} 条规则；精确重复对 ${report.summary.exactDuplicatePairs}；显式引用对 ${report.summary.explicitReferencePairs}；同模块作用域重叠对 ${report.summary.sameScopePairs}`,
    `- 审批包：${report.summary.approvalPackages}；当前可批量语义审批规则：${report.summary.approvalEligibleRules}；其中执行验证待补：${report.summary.approvalReadyButVerificationPendingRules}`,
    '- 本报告不自动审批、不启动业务执行、不修改正式规则；发布身份不可用时保留 run-only。', '',
    '## 规则结论', '',
    '| 规则 | 义务 | 结构覆盖 | 当前执行覆盖 | 可审批 | 阻断 |',
    '|---|---:|---|---|---|---|',
    ...report.rules.map((item) => `| ${item.ruleId} | ${item.obligations.length} | ${item.structuralCoverage} | ${item.executionCoverage} | ${item.approvalEligible ? '是' : '否'} | ${item.blockerCodes.join('、') || '无'} |`),
    '', '## 义务级覆盖矩阵', '',
    '| 规则/义务 | 原文义务 | 高置信用例 | 候选用例 | 当前证据 |',
    '|---|---|---|---|---|',
    ...report.rules.flatMap((rule) => rule.obligations.map((item) => {
      const high = item.caseClaims.filter((claim) => claim.confidence === 'high').map((claim) => claim.caseId);
      const medium = item.caseClaims.filter((claim) => claim.confidence === 'medium').map((claim) => claim.caseId);
      return `| ${item.obligationId} | ${item.statement.replace(/\|/g, '\\|')} | ${high.join('、') || '无'} | ${medium.join('、') || '无'} | ${item.currentEvidenceCaseIds.join('、') || '缺失'} |`;
    })),
    '', '## 收据与当前身份核对', '',
    '| 规则 | 用例 | 结论 | 复用 | 阻断 |',
    '|---|---|---|---|---|',
    ...report.rules.flatMap((rule) => rule.receiptChecks.map((item) => `| ${rule.ruleId} | ${item.caseId} | ${item.status} | ${item.releaseReuseStatus ?? '-'} | ${item.blockers.join('、') || '无'} |`)),
    '', '## 批量审批包', '',
    ...report.approvalPackages.flatMap((item) => [
      `### ${item.packageId}`,
      '',
      `- 模块：${item.moduleSection}`,
      `- 通道：${item.lane}`,
      `- 状态：${item.status}`,
      `- 全部规则：${item.ruleIds.join('、')}`,
      `- 当前可审批：${item.approvalEligibleRuleIds.join('、') || '无'}`,
      `- 人工范围：${item.humanReviewScope}`,
      '',
    ]),
    '## 精确补证据队列', '',
    ...report.preciseEvidenceQueue.map((item) => `- ${item.ruleId}：义务 ${item.obligationIds.join('、') || '无'}；候选用例 ${item.caseIds.join('、') || '无'}；原因 ${item.reasonCodes.join('、')}`),
    '',
  ].join('\n');
}

function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function scanCanonicalCaseRuleLinks(root: string): Map<string, string[]> {
  const links = new Map<string, string[]>();
  for (const filePath of listMarkdownFiles(root).filter((item) => /正式测试用例\.md$/u.test(item))) {
    let currentCaseId: string | null = null;
    for (const line of fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
      const caseMatch = line.match(/(?:用例编号：|^#{1,6}\s+)(TC-[A-Z0-9-]+)/u);
      if (caseMatch) currentCaseId = caseMatch[1];
      if (!currentCaseId || !/^来源[：:]/u.test(line.trim())) continue;
      for (const ruleId of line.match(/BR-[A-Z0-9]+(?:-[A-Z0-9]+)*/gu) ?? []) {
        links.set(ruleId, unique([...(links.get(ruleId) ?? []), currentCaseId]));
      }
    }
  }
  return links;
}
function listMarkdownFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    return entry.isDirectory() ? listMarkdownFiles(fullPath) : entry.isFile() && entry.name.endsWith('.md') ? [fullPath] : [];
  }).sort();
}
function unique<T>(items: readonly T[]): T[] { return [...new Set(items)].sort(); }
function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function shortHash(value: string): string { return sha256(value).slice(0, 12); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

if (require.main === module) {
  const plan = buildProductCenterDocumentRulePromotionPlan();
  process.stdout.write(`${JSON.stringify({ output: outputJsonPath, summary: plan.summary })}\n`);
}
