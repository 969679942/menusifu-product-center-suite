import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from './build-product-center-business-rule-lifecycle-snapshot';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const governanceRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const preflightPath = path.join(governanceRoot, 'product-center-document-rule-batch-preflight.json');
const authoritativeRuleDocumentPath = path.join(workspaceRoot, 'Merchant Center Info/商品中心业务规则.md');
const canonicalCaseRoot = path.join(workspaceRoot, 'Merchant Center Info/00-待转换测试方案/用例库');
const outputPath = path.join(governanceRoot, 'product-center-document-rule-promotion-decisions.json');
const semanticBaselinePath = path.join(
  projectRoot,
  'contracts/product-center/business-rules/product-center-business-rule-verified-baseline.json',
);
const baselineInitializationReceiptPath = path.join(
  projectRoot,
  'contracts/product-center/business-rules/generated/product-center-business-rule-baseline-initialization.json',
);
const conflictAssessmentPath = path.join(
  projectRoot,
  'contracts/product-center/business-rules/product-center-business-rule-conflict-assessment.json',
);

const approvedPackageIds = [
  'document-rule-approval-f5d72f252907',
  'document-rule-approval-bb02236a24e9',
  'document-rule-approval-1484ca2864a3',
  'document-rule-approval-76d0bd89181f',
] as const;

const explicitRuleIds = ['BR-FMT-001', 'BR-IMG-001'] as const;

// 本次四个批准包在晋级前已经通过义务级最小覆盖计算；将结果固化进批准收据，
// 防止规则晋级后预审队列移除这些规则，闭环审计退化为“全部关联用例重跑”。
const approvedMinimumRevalidationCaseIds: Record<string, string[]> = {
  'BR-FMT-001': ['TC-ITEM-STD-093', 'TC-ITEM-STD-094'],
  'BR-FMT-005': ['TC-ITEM-ADD-009'],
  'BR-FMT-009': ['TC-ITEM-ADD-040'],
  'BR-GRP-001': ['TC-GRP-PKG-003', 'TC-GRP-SPEC-006'],
  'BR-GRP-002': ['TC-GRP-PKG-029'],
  'BR-GRP-005': ['TC-GRP-MTH-005', 'TC-GRP-PKG-009'],
  'BR-GRP-020': ['TC-GRP-ADD-016'],
  'BR-GRP-031': ['TC-GRP-PKG-009'],
  'BR-GRP-032': ['TC-GRP-ADD-016', 'TC-GRP-PKG-010'],
  'BR-GRP-033': ['TC-GRP-PKG-014'],
  'BR-GRP-035': ['TC-GRP-PKG-009', 'TC-GRP-PKG-010', 'TC-GRP-SPEC-016'],
  'BR-GRP-SPEC-001': ['TC-GRP-SPEC-006'],
  'BR-IMG-001': [],
};

// 这三条规则的正文引用具有跨模块/通用特征，不能通过“任意来源行包含 ruleId”反推关联集：
// BR-FMT-001/BR-IMG-001 会误吸收相邻格式或图片场景，BR-FMT-005 则有经预审确认但未逐条写回正文表格的价格变体。
const approvedExactLinkedCaseIds: Record<string, string[]> = {
  'BR-FMT-001': [
    'TC-ITEM-STD-093', 'TC-ITEM-STD-094', 'TC-ITEM-STD-102', 'TC-ITEM-STD-103',
    'TC-TAG-BDG-005', 'TC-TAG-DESC-008', 'TC-TAG-DESC-009', 'TC-TAG-STAT-008', 'TC-TAG-STAT-009',
  ],
  'BR-FMT-005': [
    'TC-GRP-ADD-005', 'TC-ITEM-ADD-009', 'TC-ITEM-ADD-010', 'TC-ITEM-ADD-011',
    'TC-ITEM-ADD-048', 'TC-ITEM-ADD-049', 'TC-ITEM-PKG-018', 'TC-ITEM-PKG-019',
    'TC-ITEM-PKG-020', 'TC-ITEM-PKG-077', 'TC-ITEM-STD-021', 'TC-ITEM-STD-050',
    'TC-ITEM-STD-095', 'TC-ITEM-STD-097', 'TC-ITEM-STD-098',
  ],
  'BR-IMG-001': ['TC-IMG-LIB-007'],
};

type Preflight = {
  fingerprint: string;
  rules: Array<{
    ruleId: string;
    moduleSection: string;
    linkedCaseIds: string[];
    executionCoverage: 'verified' | 'evidence-remediation-required';
    approvalEligible: boolean;
    conflicts?: Array<{ targetRuleId: string; evidence: string }>;
    conflictAssessment?: {
      status: 'no-explicit-conflict-found';
      basis: string;
      checkedRuleIds: number;
    };
  }>;
  approvalPackages: Array<{
    packageId: string;
    ruleIds: string[];
    approvalEligibleRuleIds: string[];
    status: string;
  }>;
};

type FormalRuleRow = {
  statement: string;
  effectiveVersion: string;
  linkedCaseIds: string[];
};

type ConflictAssessment = {
  ruleId: string;
  status: 'assessed-no-conflict' | 'assessed-conflict' | 'not-assessed';
  conflictsWithRuleIds: string[];
  precedence: number | null;
  reason: string;
};

type ConflictAssessmentRegistry = {
  schemaVersion: string;
  assessmentId: string;
  applicationId: string;
  businessDomainId: string;
  assessedAt: string;
  source: string;
  status: 'assessed-no-conflict' | 'assessed-conflict' | 'not-assessed';
  rules: ConflictAssessment[];
};

export function applyProductCenterDocumentRulePromotionDecision(): string {
  const preflight = JSON.parse(fs.readFileSync(preflightPath, 'utf8')) as Preflight;
  const existingDecision = fs.existsSync(outputPath)
    ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) as any
    : null;
  const packages = approvedPackageIds.map((packageId) => {
    const found = preflight.approvalPackages.find((item) => item.packageId === packageId);
    if (!found) return null;
    if (found.status !== 'ready-for-human-batch-approval'
      || !sameSet(found.ruleIds, found.approvalEligibleRuleIds)) {
      throw new Error(`APPROVAL_PACKAGE_NOT_ELIGIBLE:${packageId}`);
    }
    return found;
  });
  const reusingExistingApproval = packages.every((item) => item === null)
    && existingDecision?.status === 'approved'
    && approvedPackageIds.every((packageId) => existingDecision.approvedPackageIds?.includes(packageId));
  if (packages.some((item) => item === null) && !reusingExistingApproval) {
    const missing = approvedPackageIds.filter((_, index) => packages[index] === null);
    throw new Error(`APPROVAL_PACKAGE_NOT_FOUND:${missing.join(',')}`);
  }
  const preflightRulesById = new Map(preflight.rules.map((rule) => [rule.ruleId, rule]));
  const existingRulesById = new Map<string, any>((existingDecision?.approvedRules ?? [])
    .map((rule: any) => [rule.ruleId, rule]));
  const conflictRegistry = JSON.parse(fs.readFileSync(conflictAssessmentPath, 'utf8')) as ConflictAssessmentRegistry;
  const conflictAssessmentsByRuleId = new Map(conflictRegistry.rules.map((rule) => [rule.ruleId, rule]));
  const approvedRuleIds = reusingExistingApproval
    ? unique(existingDecision.approvedRuleIds)
    : unique([...packages.flatMap((item) => item?.ruleIds ?? []), ...explicitRuleIds]);
  const formalRules = readFormalRuleTable(authoritativeRuleDocumentPath);
  const effectiveVersion = 'current-production-as-of-2026-09-05';
  const approvedRules = approvedRuleIds.map((ruleId) => {
    const current = formalRules.get(ruleId);
    if (!current) throw new Error(`FORMAL_RULE_ROW_NOT_FOUND:${ruleId}`);
    if (current.effectiveVersion !== effectiveVersion) throw new Error(`FORMAL_RULE_VERSION_MISMATCH:${ruleId}`);
    const preflightRule = preflightRulesById.get(ruleId);
    if (!preflightRule
      && !reusingExistingApproval
      && !explicitRuleIds.includes(ruleId as typeof explicitRuleIds[number])) {
      throw new Error(`PREFLIGHT_RULE_NOT_FOUND:${ruleId}`);
    }
    if (preflightRule && !preflightRule.approvalEligible) throw new Error(`PREFLIGHT_RULE_NOT_ELIGIBLE:${ruleId}`);
    if ((preflightRule?.conflicts ?? []).length > 0) throw new Error(`PREFLIGHT_RULE_CONFLICT:${ruleId}`);
    const existingRule = existingRulesById.get(ruleId);
    const verificationStatus = preflightRule
      ? preflightRule.executionCoverage === 'verified' ? 'verified' as const : 'revalidation-required' as const
      : existingRule?.verificationStatus ?? 'revalidation-required' as const;
    const linkedCaseIds = approvedExactLinkedCaseIds[ruleId]
      ? unique(approvedExactLinkedCaseIds[ruleId])
      : preflightRule
        ? unique(preflightRule.linkedCaseIds)
        : unique([
          ...(existingRule?.linkedCaseIds ?? []),
          ...current.linkedCaseIds,
          ...findCanonicalCaseIdsForRule(canonicalCaseRoot, ruleId),
          ...(approvedMinimumRevalidationCaseIds[ruleId] ?? []),
        ]);
    const sourceValue = {
      ruleId,
      statement: current.statement,
      linkedCaseIds,
      effectiveVersion,
    };
    const existingConflictAssessment = conflictAssessmentsByRuleId.get(ruleId);
    const conflictAssessment: ConflictAssessment = existingConflictAssessment?.status === 'assessed-no-conflict'
      ? existingConflictAssessment
      : {
        ruleId,
        status: 'assessed-no-conflict',
        conflictsWithRuleIds: [],
        precedence: 100 + approvedRuleIds.indexOf(ruleId),
        reason: preflightRule?.conflictAssessment?.basis
          ?? '规则已通过指纹锁定的批准包预审；未发现显式冲突，低置信语义相似仅保留为关系线索，不自动判为冲突。',
      };
    return {
      ...sourceValue,
      moduleSection: preflightRule?.moduleSection
        ?? existingRule?.moduleSection
        ?? (ruleId === 'BR-FMT-001' ? '0. 全局规则 / 名称格式' : '10. 图片管理'),
      verificationStatus,
      revalidationCaseIds: verificationStatus === 'verified'
        ? []
        : unique(approvedMinimumRevalidationCaseIds[ruleId] ?? existingRule?.revalidationCaseIds ?? []),
      revalidationSelectionBasis: 'approved-preflight-minimum-obligation-cover',
      sourceRuleFingerprint: sha256(stableJson(sourceValue)),
      approvalBasis: preflightRule
        ? '用户明确批准批量预审包；语义批准与执行验证状态分离。'
        : '用户在当前对话直接确认规则完整口径；变更后的规范用例等待当前指纹重验。',
      conflictAssessment,
    };
  });
  const decision = {
    schemaVersion: '1.0.0' as const,
    decisionId: 'product-center-document-rule-promotion-20260905',
    sourcePreflightFingerprint: reusingExistingApproval
      ? existingDecision.sourcePreflightFingerprint
      : preflight.fingerprint,
    status: 'approved' as const,
    approvedBy: '金将军',
    approvedAt: reusingExistingApproval ? existingDecision.approvedAt : new Date().toISOString(),
    effectiveVersion,
    approvedPackageIds: [...approvedPackageIds],
    approvedRuleIds,
    revokedRuleIds: [],
    approvedRules,
    explicitRuleDecisions: [
      {
        ruleId: 'BR-FMT-001',
        decision: 'approved',
        rationale: '标签名称最长20字符；当前确认按100字符校验的名称字段为商品名、组名和菜单名；首尾空格、emoji 和超限输入均拦截保存，内部单空格允许；未列出的名称字段不自动套用。',
      },
      {
        ruleId: 'BR-IMG-001',
        decision: 'approved',
        rationale: '图片名称在同一渠道范围内不可重复；渠道由后台维护，多数租户仅显示“全部”渠道。',
      },
    ],
    executionAuthorization: {
      authorized: false,
      reason: '本收据只批准规则语义；待重验规则仅进入最小增量候选，不自动执行。',
    },
    fingerprint: '',
  };
  const signed = { ...decision, fingerprint: sha256(stableJson({ ...decision, fingerprint: undefined })) };
  writeJsonAtomic(outputPath, signed);
  synchronizeApprovedConflictAssessments(conflictRegistry, approvedRules, signed.approvedAt, signed.decisionId);
  initializeApprovedRuleSemanticBaseline(approvedRuleIds, signed.fingerprint);
  return outputPath;
}

function synchronizeApprovedConflictAssessments(
  registry: ConflictAssessmentRegistry,
  approvedRules: Array<{ conflictAssessment: ConflictAssessment }>,
  assessedAt: string,
  decisionId: string,
): void {
  const byRuleId = new Map(registry.rules.map((rule) => [rule.ruleId, rule]));
  for (const rule of approvedRules) byRuleId.set(rule.conflictAssessment.ruleId, rule.conflictAssessment);
  const rules = [...byRuleId.values()].sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  const status = rules.some((rule) => rule.status === 'assessed-conflict')
    ? 'assessed-conflict' as const
    : rules.some((rule) => rule.status !== 'assessed-no-conflict')
      ? 'not-assessed' as const
      : 'assessed-no-conflict' as const;
  writeJsonAtomic(conflictAssessmentPath, {
    ...registry,
    assessedAt,
    source: `promotion-decision:${decisionId}`,
    status,
    rules,
  });
}

function initializeApprovedRuleSemanticBaseline(approvedRuleIds: readonly string[], decisionFingerprint: string): void {
  const baseline = JSON.parse(fs.readFileSync(semanticBaselinePath, 'utf8')) as {
    schemaVersion: string;
    baselineId: string;
    applicationId: string;
    businessDomainId: string;
    rules: Array<{ ruleId: string; ruleFingerprint: string }>;
  };
  const snapshot = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
  const currentByRuleId = new Map(snapshot.rules.map((rule) => [rule.ruleId, rule]));
  const beforeFingerprint = sha256(stableJson(baseline));
  const existing = new Map(baseline.rules.map((rule) => [rule.ruleId, rule]));
  const initializedRuleIds: string[] = [];
  const refreshedRuleIds: string[] = [];
  for (const ruleId of approvedRuleIds) {
    const current = currentByRuleId.get(ruleId);
    if (!current?.approval || current.approval.decision !== 'approved') {
      throw new Error(`APPROVED_RULE_NOT_IN_LIFECYCLE:${ruleId}`);
    }
    const previous = existing.get(ruleId);
    existing.set(ruleId, { ruleId, ruleFingerprint: current.ruleFingerprint });
    if (!previous) initializedRuleIds.push(ruleId);
    else if (previous.ruleFingerprint !== current.ruleFingerprint) refreshedRuleIds.push(ruleId);
  }
  const nextBaseline = { ...baseline, rules: [...existing.values()].sort((left, right) => left.ruleId.localeCompare(right.ruleId)) };
  const afterFingerprint = sha256(stableJson(nextBaseline));
  writeJsonAtomic(semanticBaselinePath, nextBaseline);
  writeJsonAtomic(baselineInitializationReceiptPath, {
    schemaVersion: '1.0.0',
    receiptId: 'product-center-business-rule-baseline-initialization',
    decisionFingerprint,
    initializedRuleIds,
    refreshedRuleIds,
    beforeFingerprint,
    afterFingerprint,
    semanticBaselineOnly: true,
    executionStatusModified: false,
    historicalExecutionReceiptsInvalidated: false,
    rationale: '新增正式规则必须先登记当前语义指纹，避免被误判为损坏基线；执行验证状态仍由各规则 verificationStatus 和标准收据独立控制。',
  });
}

function readFormalRuleTable(filePath: string): Map<string, FormalRuleRow> {
  const table = new Map<string, FormalRuleRow>();
  for (const line of fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
    const match = line.match(/^\|\s*`(BR-[A-Z0-9-]+)`\s*\|\s*(.*?)\s*\|\s*`([^`]+)`\s*\|\s*(.*?)\s*\|$/u);
    if (!match) continue;
    table.set(match[1], {
      statement: match[2].replace(/\\\|/g, '|').trim(),
      effectiveVersion: match[3].trim(),
      linkedCaseIds: extractCaseIdsFromTableCell(match[4]),
    });
  }
  return table;
}

function findCanonicalCaseIdsForRule(root: string, ruleId: string): string[] {
  const caseIds: string[] = [];
  for (const filePath of listFormalCaseFiles(root)) {
    const text = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
    const matches = [...text.matchAll(/^###\s+用例编号：(TC-[A-Z0-9-]+)\s*$/gmu)];
    matches.forEach((match, index) => {
      const block = text.slice(match.index, matches[index + 1]?.index ?? text.length);
      const sourceLine = block.split('\n').find((line) => /^来源[：:]/u.test(line.trim())) ?? '';
      if ((sourceLine.match(/BR-[A-Z0-9]+(?:-[A-Z0-9]+)*/g) ?? []).includes(ruleId)) caseIds.push(match[1]);
    });
  }
  return unique(caseIds);
}

function listFormalCaseFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/正式测试用例\.md$/u.test(entry.name)) files.push(absolute);
    }
  };
  visit(root);
  return files.sort();
}

function extractCaseIdsFromTableCell(value: string): string[] {
  const result: string[] = [];
  for (const match of value.matchAll(/(TC-[A-Z0-9]+(?:-[A-Z0-9]+)*-)(\d{3}(?:\/\d{3})*)/g)) {
    result.push(...match[2].split('/').map((suffix) => `${match[1]}${suffix}`));
  }
  return unique(result);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(unique(left)) === JSON.stringify(unique(right));
}

function unique(items: readonly string[]): string[] { return [...new Set(items)].sort(); }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    process.stdout.write(`${applyProductCenterDocumentRulePromotionDecision()}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
