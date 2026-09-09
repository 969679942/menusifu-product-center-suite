import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildProductCenterBusinessRuleCoverage } from './build-product-center-business-rule-coverage';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const authorityPath = path.join(workspaceRoot, 'Merchant Center Info/商品中心业务规则.md');
const lifecyclePath = path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json');
const candidatePath = path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-item-test-plan-rule-candidates.json');
const catalogRoot = path.join(workspaceRoot, 'Merchant Center Info/业务规则治理');
const manifestPath = path.join(projectRoot, 'output/governance/product-center-business-rule-governance-catalog.json');

const catalogFiles = {
  overview: path.join(catalogRoot, 'README.md'),
  formal: path.join(catalogRoot, '01-当前正式规则.md'),
  pending: path.join(catalogRoot, '02-待生命周期核验规则.md'),
  conflicted: path.join(catalogRoot, '03-冲突规则.md'),
  historical: path.join(catalogRoot, '04-历史与废弃规则.md'),
  coverage: path.join(catalogRoot, '05-覆盖缺口与执行证据.md'),
} as const;

const authorityWarning = '> **权威边界**：本目录由程序从 `../商品中心业务规则.md` 及治理台账生成，仅用于人工阅读和审计，不是第二业务事实源。请勿手工维护本目录；业务语义变更必须先修改唯一权威文件并经过正式治理。';

type LifecycleRule = {
  ruleId: string;
  ruleType: string;
  statement: string;
  sourceRegistry: Array<{ sourceId: string; kind?: string }>;
  effectiveVersion: string;
  effectiveContext: Record<string, string[]>;
  linkedCaseIds: string[];
  linkedBindingIds: string[];
  verificationStatus: string;
  ruleFingerprint: string;
  approval?: { decision?: string; approvedBy?: string; approvedAt?: string };
  governance?: {
    changedAt?: string | null;
    effectiveFrom?: string | null;
    lastVerifiedAt?: string | null;
    timeEvidenceStatus?: string;
    effectiveContextStatus?: string;
  };
};

type DocumentLedgerItem = ReturnType<typeof buildProductCenterBusinessRuleCoverage>['documentRuleLedger'][number];
type RuleCoverageItem = ReturnType<typeof buildProductCenterBusinessRuleCoverage>['ruleCoverage'][number];

export function buildProductCenterBusinessRuleGovernanceCatalog() {
  const coverage = buildProductCenterBusinessRuleCoverage();
  const lifecycle = readJson<{ rules: LifecycleRule[] }>(lifecyclePath);
  const candidates = readJson<{ candidates?: unknown[]; summary?: { total?: number } }>(candidatePath);
  const authorityLines = fs.readFileSync(authorityPath, 'utf8').split(/\r?\n/);
  const ledger = coverage.documentRuleLedger;
  const statusCounts = countBy(ledger, (item) => item.status);
  const formalRules = [...lifecycle.rules].sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  const formalRuleIds = new Set(formalRules.map((rule) => rule.ruleId));
  const formalLedger = ledger.filter((item) => item.status === 'formal');
  const pendingLedger = ledger.filter((item) => item.status === 'document-registered-pending-lifecycle');
  const conflictedLedger = ledger.filter((item) => item.status === 'conflicted');
  const historicalLedger = ledger.filter((item) => item.status === 'historical');
  const deprecatedLedger = ledger.filter((item) => item.status === 'deprecated');
  const candidateCount = candidates.candidates?.length ?? candidates.summary?.total ?? coverage.summary.candidateRules;

  assertCatalogInvariants({
    ledger,
    formalRules,
    formalLedger,
    formalRuleIds,
    candidateCount,
    expectedCandidateCount: coverage.summary.candidateRules,
    statusCounts,
  });

  const sourceFingerprints = {
    authority: fingerprintFile(authorityPath),
    lifecycle: fingerprintFile(lifecyclePath),
    candidates: fingerprintFile(candidatePath),
    coverage: coverage.fingerprint,
    generator: fingerprintFile(__filename),
  };
  const inputFingerprint = sha256(stableStringify(sourceFingerprints));
  const generatedAt = resolveStableGeneratedAt(inputFingerprint);
  const context = {
    generatedAt,
    coverage,
    formalRules,
    formalLedger,
    pendingLedger,
    conflictedLedger,
    historicalLedger,
    deprecatedLedger,
    candidateCount,
    authorityLines,
  };
  const artifacts = {
    overview: renderOverview(context),
    formal: renderFormalRules(context),
    pending: renderPendingRules(context),
    conflicted: renderConflictedRules(context),
    historical: renderHistoricalRules(context),
    coverage: renderCoverage(context),
  };

  for (const [key, content] of Object.entries(artifacts)) writeIfChanged(catalogFiles[key as keyof typeof catalogFiles], content);

  const manifestWithoutFingerprint = {
    schemaVersion: '1.0.0',
    reportId: 'product-center-business-rule-governance-catalog',
    generatedAt,
    inputFingerprint,
    authority: {
      businessRuleSourceOfTruth: authorityPath,
      catalogRoot,
      derivedArtifactsAreAuthority: false,
      manualMaintenanceAllowed: false,
    },
    sourceFingerprints,
    summary: {
      documentRules: ledger.length,
      formalRules: formalLedger.length,
      pendingLifecycleRules: pendingLedger.length,
      conflictedRules: conflictedLedger.length,
      historicalRules: historicalLedger.length,
      deprecatedRules: deprecatedLedger.length,
      candidateRules: candidateCount,
      candidateRulesIncludedInDocumentDenominator: false,
      mandatoryObligations: coverage.summary.mandatoryObligations,
      coveredMandatoryObligations: coverage.summary.coveredMandatoryObligations,
      executionVerifiedFormalRules: coverage.summary.formalExecutionVerifiedRules,
    },
    classificationConservation: {
      expected: ledger.length,
      actual: formalLedger.length + pendingLedger.length + conflictedLedger.length + historicalLedger.length + deprecatedLedger.length,
      valid: true,
    },
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([key, content]) => [key, {
      path: catalogFiles[key as keyof typeof catalogFiles],
      fingerprint: sha256(content),
    }])),
    executionImpact: {
      businessCasesExecuted: false,
      existingPassedCasesInvalidated: false,
      rerunCaseIds: [],
      moduleDeliveryBlocked: false,
    },
  };
  const manifest = { ...manifestWithoutFingerprint, fingerprint: sha256(stableStringify(manifestWithoutFingerprint)) };
  writeIfChanged(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function renderOverview(context: CatalogContext): string {
  const summary = context.coverage.summary;
  return [
    '# 商品中心业务规则治理总览', '', authorityWarning, '',
    `- 生成时间：${context.generatedAt}`,
    `- 文档显式规则：${summary.documentExplicitRules} 条`,
    `- 当前正式：${context.formalLedger.length} 条`,
    `- 待生命周期核验：${context.pendingLedger.length} 条`,
    `- 冲突：${context.conflictedLedger.length} 条`,
    `- 历史：${context.historicalLedger.length} 条；废弃：${context.deprecatedLedger.length} 条`,
    `- 测试方案规则候选：${context.candidateCount} 条（单独统计，不进入上述 ${summary.documentExplicitRules} 条或正式规则分母）`,
    '',
    '## 如何阅读', '',
    '1. 先看 [01-当前正式规则.md](01-当前正式规则.md)：这里是当前允许生成正式测试方案和用例的规则。',
    '2. 需要快速升级旧规则时先看 [00-快速晋级工作台.md](00-快速晋级工作台.md)：优先按语义包批量审核，只把真实业务冲突逐条交给人工；技术元数据和证据补齐由系统处理。',
    '3. 再看 [05-覆盖缺口与执行证据.md](05-覆盖缺口与执行证据.md)：区分“有用例绑定”“义务结构覆盖”和“当前执行验证”。',
    '4. [02-待生命周期核验规则.md](02-待生命周期核验规则.md) 是完整待核验清单，用于追溯，不再作为默认逐条人工入口。',
    '5. [03-冲突规则.md](03-冲突规则.md) 在冲突关闭前不得生成正式用例；[04-历史与废弃规则.md](04-历史与废弃规则.md) 只用于追溯。',
    '',
    '## 生命周期口径', '',
    '- **正式**：来源、规则指纹、生效版本、适用上下文、审批和语义合同均已进入正式生命周期。',
    '- **待生命周期核验**：文档中已有规则 ID，但旧口径不自动视为正确；核验完成前不能直接生成正式用例。',
    '- **冲突**：存在明确的来源不一致证据，关闭冲突前局部阻塞。',
    '- **历史 / 废弃**：不进入当前正式覆盖率分母，也不物理删除。',
    '- **候选**：来自 PRD、审计或执行观察，只能进入评审；执行结果不能自动覆盖正式规则。',
    '',
    '## 正式晋级最小流程', '',
    '```text',
    '权威来源或人工确认',
    '→ 规则候选（保留来源和指纹）',
    '→ 冲突、范围、版本与审批核验',
    '→ 正式规则',
    '→ 义务拆分与正式用例/自动化映射',
    '→ 当前指纹和上下文下执行',
    '→ 完整收据验证；若观察到语义变化，仅生成新候选，不自动改正式规则',
    '```',
    '',
    '## 字段简表', '',
    '| 字段 | 人工含义 |', '|---|---|',
    '| ruleId | 规则的唯一编号，跨文档、用例、脚本和证据追踪使用 |',
    '| statement | 规则正文，说明在什么范围内必须发生什么结果 |',
    '| 生命周期 | 正式、待核验、冲突、历史或废弃 |',
    '| 来源 | PRD、现网、人工确认或其他可校验来源及其指纹 |',
    '| 生效版本 / 上下文 | 规则在哪个版本、环境、租户、角色、语言和路由下适用 |',
    '| 关联用例 / 绑定 | 追溯关系；有绑定不等于完整覆盖或执行通过 |',
    '| 覆盖成熟度 | 未评估 → 未覆盖 → 部分覆盖 → 结构覆盖 → 当前执行验证 |',
    '| 审批 / 验证 | 谁批准规则，以及是否有当前用例、实现和上下文一致的完整执行证据 |',
    '',
    '刷新命令：`npm run build:product-center:business-rule-governance-catalog`。',
    '',
  ].join('\n');
}

function renderFormalRules(context: CatalogContext): string {
  const lines = [
    '# 当前正式规则', '', authorityWarning, '',
    `共 ${context.formalRules.length} 条。只有本文件列出的规则已进入正式生命周期；关联用例不自动等于完整覆盖或执行通过。`, '',
  ];
  for (const rule of context.formalRules) {
    const ledger = context.formalLedger.find((item) => item.ruleId === rule.ruleId);
    const coverage = context.coverage.ruleCoverage.find((item) => item.ruleId === rule.ruleId);
    if (!ledger || !coverage) throw new Error(`FORMAL_RULE_CATALOG_INPUT_MISSING:${rule.ruleId}`);
    lines.push(
      `## ${rule.ruleId}`, '',
      rule.statement, '',
      `- 生命周期：正式（${rule.ruleType}）`,
      '- 业务模块：商品中心 / 商品管理 / 商品',
      `- 权威文档章节：${ledger.moduleSection}`,
      `- 生效版本：${rule.effectiveVersion}`,
      `- 生效上下文：${renderEffectiveContext(rule)}`,
      `- 来源：${rule.sourceRegistry.map((source) => `${source.kind ?? 'source'}:${source.sourceId}`).join('；')}`,
      `- 权威原文位置：../商品中心业务规则.md，第 ${ledger.primaryLineNumber} 行；全部出现行：${ledger.lineNumbers.join('、')}`,
      `- 关联用例：${rule.linkedCaseIds.join('、') || '无'}`,
      `- 关联绑定：${rule.linkedBindingIds.join('、') || '无'}`,
      `- 生命周期校验：${rule.verificationStatus}；审批：${rule.approval?.decision ?? 'unknown'} / ${rule.approval?.approvedBy ?? '未登记'} / ${rule.approval?.approvedAt ?? '时间未登记'}`,
      `- 规则指纹：${rule.ruleFingerprint}`,
      `- 业务用例结构覆盖：${coverage.businessAssessment.maturity}；自动化结构覆盖：${coverage.automationAssessment.maturity}`,
      `- 必选义务：${coverage.combinedAssessment.coveredMandatoryObligations}/${coverage.combinedAssessment.mandatoryObligations}；缺口：${coverage.missingObligations.map((item) => item.statement).join('；') || '无'}`,
      `- 当前执行验证：${coverage.combinedAssessment.maturity === 'execution-verified' ? '已验证' : '未验证（不能用历史或指纹不匹配收据替代）'}`,
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}

function renderPendingRules(context: CatalogContext): string {
  const groups = groupBy(context.pendingLedger, (item) => item.moduleSection);
  const lines = [
    '# 待生命周期核验规则', '', authorityWarning, '',
    `共 ${context.pendingLedger.length} 条。它们已在权威文档登记，但旧口径不一定正确；在来源、冲突、生效范围和审批完成前，不得视为正式规则。`, '',
  ];
  for (const [section, rules] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, 'zh-CN'))) {
    lines.push(`## ${section}（${rules.length} 条）`, '', '| 规则 ID | 可读摘要 | 来源标签 | 权威位置 | 分类依据 |', '|---|---|---|---|---|');
    for (const rule of rules.sort((left, right) => left.ruleId.localeCompare(right.ruleId))) {
      lines.push(`| ${rule.ruleId} | ${escapeTable(rule.statement)} | ${escapeTable(rule.sourceLabels.join('、') || '未显式标注')} | 第 ${rule.primaryLineNumber} 行 | ${humanClassificationEvidence(rule)} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function renderConflictedRules(context: CatalogContext): string {
  const lines = [
    '# 冲突规则', '', authorityWarning, '',
    `共 ${context.conflictedLedger.length} 条。只有存在规则级明确冲突证据时才进入本清单；错误码或普通文案中的“参数冲突”不算治理冲突，同一行其他规则的冲突描述也不会连带污染。`, '',
  ];
  if (context.conflictedLedger.length === 0) lines.push('当前无明确冲突规则。', '');
  for (const rule of context.conflictedLedger) {
    const evidenceLines = rule.classificationEvidence
      .map((evidence) => Number(evidence.match(/line-(\d+)/)?.[1]))
      .filter((lineNumber) => Number.isInteger(lineNumber));
    lines.push(
      `## ${rule.ruleId}`, '',
      `- 规则摘要：${rule.statement}`,
      `- 模块 / 章节：${rule.moduleSection}`,
      `- 分类置信度：${rule.classificationConfidence}`,
      `- 权威位置：第 ${rule.primaryLineNumber} 行；全部出现行：${rule.lineNumbers.join('、')}`,
      `- 冲突证据：${rule.classificationEvidence.join('；')}`,
      '- 处理约束：冲突关闭前不得晋级为正式规则，也不得据此生成正式用例。',
      '', '证据原文：', '',
      ...evidenceLines.map((lineNumber) => `- 第 ${lineNumber} 行：${context.authorityLines[lineNumber - 1]?.trim() ?? '原文缺失'}`),
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}

function renderHistoricalRules(context: CatalogContext): string {
  const lines = [
    '# 历史与废弃规则', '', authorityWarning, '',
    `历史 ${context.historicalLedger.length} 条，废弃 ${context.deprecatedLedger.length} 条。两类均不进入当前正式规则和覆盖率分母，但保留追溯位置。`, '',
  ];
  lines.push('## 历史规则', '', '| 规则 ID | 摘要 | 章节 | 权威位置 |', '|---|---|---|---|');
  for (const rule of context.historicalLedger) lines.push(`| ${rule.ruleId} | ${escapeTable(rule.statement)} | ${escapeTable(rule.moduleSection)} | 第 ${rule.primaryLineNumber} 行 |`);
  lines.push('', '## 废弃规则', '', '| 规则 ID | 摘要 | 章节 | 权威位置 | 废弃依据 |', '|---|---|---|---|---|');
  for (const rule of context.deprecatedLedger) lines.push(`| ${rule.ruleId} | ${escapeTable(rule.statement)} | ${escapeTable(rule.moduleSection)} | 第 ${rule.primaryLineNumber} 行 | ${humanClassificationEvidence(rule)} |`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function renderCoverage(context: CatalogContext): string {
  const summary = context.coverage.summary;
  const lines = [
    '# 覆盖缺口与执行证据', '', authorityWarning, '',
    '- 覆盖单位：来源明确的必选规则义务，不是规则数、用例数或“至少绑定一条用例”。',
    `- 正式规则义务覆盖：${summary.coveredMandatoryObligations}/${summary.mandatoryObligations}（${formatPercent(summary.obligationCoverageRate)}）。`,
    `- 当前执行验证：${summary.formalExecutionVerifiedRules}/${summary.formalRules} 条正式规则。`,
    `- 历史完整收据映射：${summary.historicalCompleteReceiptsMapped}；当前用例/实现指纹不匹配用例：${summary.currentFingerprintMismatchCases}。`,
    `- 测试方案规则候选：${context.candidateCount} 条，单独评审，不进入正式规则或文档规则分母。`,
    '- 本次静态治理未运行任何业务用例，未使已有通过结果失效。',
    '',
    '| 正式规则 | 业务用例结构 | 自动化结构 | 当前执行 | 必选义务 | 缺口 |',
    '|---|---|---|---|---:|---|',
  ];
  for (const item of context.coverage.ruleCoverage) {
    lines.push(`| ${item.ruleId} | ${item.businessAssessment.maturity} | ${item.automationAssessment.maturity} | ${item.combinedAssessment.maturity === 'execution-verified' ? '已验证' : '未验证'} | ${item.combinedAssessment.coveredMandatoryObligations}/${item.combinedAssessment.mandatoryObligations} | ${escapeTable(item.missingObligations.map((gap) => gap.statement).join('；') || '无')} |`);
  }
  lines.push('', '## 当前覆盖缺口候选', '');
  if (context.coverage.coverageGapCandidates.length === 0) lines.push('无。');
  else for (const gap of context.coverage.coverageGapCandidates) lines.push(`- ${gap.obligationId}：${gap.statement}（尚未登记正式用例，执行未授权）`);
  lines.push(
    '', '## 判定说明', '',
    '- 一条规则需要多条用例时，只有全部必选义务都被逐项映射，才算结构覆盖完整。',
    '- 多条用例重复覆盖同一个义务，不能补足其他缺失义务。',
    '- 有用例或自动化绑定只证明可追溯，不证明已执行；只有当前规则、用例、实现和上下文指纹一致的完整收据才算 `execution-verified`。',
    '- 执行成功后若观察到与正式规则不同的系统行为，只能生成候选并进入人工评审，不允许自动覆盖正式规则。',
    '',
    `候选评审源：\`Merchant Center UITest/contracts/product-center/business-rules/generated/product-center-item-test-plan-rule-candidates.json\`。`,
    '',
  );
  return lines.join('\n');
}

type CatalogContext = {
  generatedAt: string;
  coverage: ReturnType<typeof buildProductCenterBusinessRuleCoverage>;
  formalRules: LifecycleRule[];
  formalLedger: DocumentLedgerItem[];
  pendingLedger: DocumentLedgerItem[];
  conflictedLedger: DocumentLedgerItem[];
  historicalLedger: DocumentLedgerItem[];
  deprecatedLedger: DocumentLedgerItem[];
  candidateCount: number;
  authorityLines: string[];
};

function assertCatalogInvariants(input: {
  ledger: DocumentLedgerItem[];
  formalRules: LifecycleRule[];
  formalLedger: DocumentLedgerItem[];
  formalRuleIds: Set<string>;
  candidateCount: number;
  expectedCandidateCount: number;
  statusCounts: Record<string, number>;
}): void {
  const classificationCount = Object.values(input.statusCounts).reduce((sum, count) => sum + count, 0);
  if (classificationCount !== input.ledger.length) throw new Error(`RULE_CLASSIFICATION_NOT_CONSERVED:${classificationCount}/${input.ledger.length}`);
  if (input.formalLedger.length !== input.formalRules.length) throw new Error(`FORMAL_RULE_COUNT_MISMATCH:${input.formalLedger.length}/${input.formalRules.length}`);
  if (input.formalRuleIds.size !== input.formalRules.length) throw new Error('FORMAL_RULE_IDS_NOT_UNIQUE');
  if (new Set(input.formalLedger.map((item) => item.ruleId)).size !== input.formalLedger.length) throw new Error('FORMAL_DOCUMENT_RULE_IDS_NOT_UNIQUE');
  for (const item of input.formalLedger) if (!input.formalRuleIds.has(item.ruleId)) throw new Error(`FORMAL_DOCUMENT_RULE_NOT_IN_LIFECYCLE:${item.ruleId}`);
  if (input.candidateCount !== input.expectedCandidateCount) throw new Error(`CANDIDATE_COUNT_MISMATCH:${input.candidateCount}/${input.expectedCandidateCount}`);
}

function renderEffectiveContext(rule: LifecycleRule): string {
  const status = rule.governance?.effectiveContextStatus ?? 'unknown';
  const populated = Object.entries(rule.effectiveContext ?? {})
    .filter(([, values]) => Array.isArray(values) && values.length > 0)
    .map(([key, values]) => `${key}=${values.join(',')}`);
  if (populated.length > 0) return `${status}（${populated.join('；')}）`;
  return status === 'explicit'
    ? 'explicit（未限定到具体环境、租户、角色、语言或路由）'
    : `${status}（具体环境、租户、角色、语言和路由尚未显式登记）`;
}

function humanClassificationEvidence(item: DocumentLedgerItem): string {
  return item.classificationEvidence.map((evidence) => {
    if (evidence === 'formal-lifecycle-registry-match') return '已匹配正式生命周期台账';
    if (evidence === 'explicit-deprecated-rule-registry') return '已登记废弃';
    if (evidence.startsWith('explicit-deprecated-marker:line-')) return `原文第 ${evidence.split('line-')[1]} 行明确废弃`;
    if (evidence.startsWith('explicit-rule-conflict:line-')) return `原文第 ${evidence.split('line-')[1]} 行明确冲突`;
    if (evidence.startsWith('historical-or-readonly-context:line-')) return `原文第 ${evidence.split('line-')[1]} 行为历史/只读上下文`;
    if (evidence === 'document-id-present-without-formal-lifecycle-or-explicit-conflict-evidence') return '仅有文档登记，缺少正式生命周期核验';
    return evidence;
  }).join('；');
}

function escapeTable(value: string): string { return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim(); }
function formatPercent(value: number | null): string { return value === null ? '-' : `${(value * 100).toFixed(2)}%`; }
function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function fingerprintFile(filePath: string): string { return sha256(fs.readFileSync(filePath)); }
function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((result, item) => {
    const value = key(item);
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
}
function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) result.set(key(item), [...(result.get(key(item)) ?? []), item]);
  return result;
}
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
function resolveStableGeneratedAt(inputFingerprint: string): string {
  if (fs.existsSync(manifestPath)) {
    try {
      const current = readJson<{ inputFingerprint?: string; generatedAt?: string }>(manifestPath);
      if (current.inputFingerprint === inputFingerprint && current.generatedAt) return current.generatedAt;
    } catch {
      // A malformed derived manifest is replaced from authoritative inputs.
    }
  }
  return new Date().toISOString();
}
function writeIfChanged(filePath: string, content: string): void {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const report = buildProductCenterBusinessRuleGovernanceCatalog();
    process.stdout.write(`${JSON.stringify({ status: 'generated', summary: report.summary, classificationConservation: report.classificationConservation })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
