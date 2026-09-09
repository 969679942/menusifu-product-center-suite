import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  buildBusinessRulePromotionManifest,
  fingerprintBusinessRulePromotionCandidate,
  fingerprintBusinessRulePromotionSources,
  type BusinessRulePromotionCandidate,
  type BusinessRulePromotionManifest,
} from '../automation/system-test/business-rule-promotion';

type CandidateRegistry = {
  schemaVersion: string;
  candidates: Array<Record<string, any>>;
  summary?: Record<string, number>;
};

type PromotionSourceVerificationContext = {
  testPlanPath: string;
  testPlanFingerprint: string;
  testPlanCases: Map<string, Record<string, any>>;
  testPlanCaseFingerprints: Map<string, string>;
  businessRulesPath: string;
  businessRulesFingerprint: string;
  businessRulesText: string;
  formalBindingsPath: string;
  formalBindingsFingerprint: string;
  formalBindingsText: string;
  xmindPath: string;
  xmindFingerprint: string;
  canonicalCasesByNodeId: Map<string, { canonicalId: string }>;
  automationBindingsByCaseId: Map<string, { runtimeReadiness?: string }>;
  landingCasesByCaseId: Map<string, {
    status?: string;
    executionReceipt?: {
      evidenceStatus?: string;
      cleanupEvidence?: { apiZeroResidue?: boolean; uiZeroResidue?: boolean };
    } | null;
  }>;
};

export type ProductCenterBusinessRulePromotionReadinessReport = {
  schemaVersion: '1.0.0';
  reportId: 'product-center-business-rule-promotion-readiness';
  scope: 'generated-evidence';
  authorityBoundary: {
    canonicalSemanticAuthority: string;
    generatedArtifactsReadOnly: true;
    decisionLedgerIsFormalAuthority: false;
    runtimeMayPromoteToFormal: false;
  };
  sourceArtifacts: {
    candidateRegistryPath: string;
    candidateRegistryFingerprint: string;
    governanceOptimizationPath: string;
    governanceLifecycle: string;
  };
  manifest: BusinessRulePromotionManifest;
  limitations: string[];
  fingerprint: string;
  generatedAt: string;
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const candidateRegistryPath = path.join(
  projectRoot,
  'contracts/product-center/business-rules/generated/product-center-item-rule-registry.json',
);
const optimizationPath = path.join(
  projectRoot,
  'contracts/product-center/governance/product-center-business-rule-governance-optimization.json',
);

export function buildProductCenterBusinessRulePromotionReadiness(input?: {
  generatedAt?: string;
  maxCandidates?: number;
}): ProductCenterBusinessRulePromotionReadinessReport {
  const registry = readJson<CandidateRegistry>(candidateRegistryPath);
  const optimization = readJson<{ lifecycle?: { status?: string } }>(optimizationPath);
  const sourceText = fs.readFileSync(candidateRegistryPath, 'utf8');
  const sourceVerification = buildSourceVerificationContext(projectRoot);
  const candidates = registry.candidates
    .slice(0, input?.maxCandidates ?? registry.candidates.length)
    .map((candidate) => mapCandidate(candidate, sourceVerification));
  const manifest = buildBusinessRulePromotionManifest({
    promotionBatchId: 'merchant-center-item-candidate-readiness',
    policyFingerprint: sha256(JSON.stringify({
      policy: 'formal-review-separated-from-execution-verification',
      lifecycle: optimization.lifecycle?.status ?? 'unknown',
    })),
    candidates,
    generatedAt: input?.generatedAt ?? new Date().toISOString(),
  });
  const reportBase = {
    schemaVersion: '1.0.0' as const,
    reportId: 'product-center-business-rule-promotion-readiness' as const,
    scope: 'generated-evidence' as const,
    authorityBoundary: {
      canonicalSemanticAuthority: 'Merchant Center Info/商品中心业务规则.md',
      generatedArtifactsReadOnly: true as const,
      decisionLedgerIsFormalAuthority: false as const,
      runtimeMayPromoteToFormal: false as const,
    },
    sourceArtifacts: {
      candidateRegistryPath: 'contracts/product-center/business-rules/generated/product-center-item-rule-registry.json',
      candidateRegistryFingerprint: sha256(sourceText),
      governanceOptimizationPath: 'contracts/product-center/governance/product-center-business-rule-governance-optimization.json',
      governanceLifecycle: optimization.lifecycle?.status ?? 'unknown',
    },
    manifest,
    limitations: [
      '候选注册表来源以 candidate-ledger 和测试方案推导为主，未自动视为正式业务规则来源。',
      '当前不替代既有运行证据账本；formalPromotionEligible 不等于 execution-verified。',
      'Git、Jenkins、PRD 系统和跨 applicationId 试点未接入时，只生成静态预审，不启动业务执行。',
      '生成文件属于 generated-evidence，不能作为第二业务语义事实源。',
    ],
  };
  return {
    ...reportBase,
    fingerprint: sha256(stableJson(reportBase)),
    generatedAt: input?.generatedAt ?? new Date().toISOString(),
  };
}

export function renderProductCenterBusinessRulePromotionReadinessMarkdown(
  report: ProductCenterBusinessRulePromotionReadinessReport,
): string {
  const lines = [
    '# 商品中心业务规则候选晋级准备度（静态预审）',
    '',
    `- 规则候选总数：${report.manifest.summary.total}`,
    `- 绿色（可进入批次审批）：${report.manifest.summary.green}`,
    `- 黄色（需补充少量信息）：${report.manifest.summary.yellow}`,
    `- 红色（来源/冲突/状态阻断）：${report.manifest.summary.red}`,
    `- 规则族数量：${report.manifest.summary.clusters}`,
    `- 批次指纹：\`${report.manifest.manifestFingerprint}\``,
    '',
    '## 权威边界',
    '',
    '- 业务语义唯一权威：`Merchant Center Info/商品中心业务规则.md`。',
    '- 本报告、候选注册表和规则族结果均为 generated-evidence，只读消费。',
    '- 运行结果只能形成修订候选，不能直接覆盖正式规则。',
    '',
    '## 规则族预览',
    '',
  ];
  for (const cluster of report.manifest.clusters) {
    lines.push(
      `### ${cluster.clusterId}`,
      '',
      `- 聚类键：${cluster.clusterKey}`,
      `- 候选数：${cluster.candidateIds.length}`,
      `- 绿色：${cluster.greenCandidateIds.length}`,
      `- 黄色：${cluster.yellowCandidateIds.length}`,
      `- 红色：${cluster.redCandidateIds.length}`,
      `- 语义变体：${cluster.semanticVariants ? '是' : '否'}`,
      `- 例外候选：${cluster.exceptionCandidateIds.join('、') || '无'}`,
      '',
    );
  }
  lines.push('## 候选明细', '', '| 候选 | 状态 | 正式评审 | 测试生成 | 阻断 | 待确认问题 |', '|---|---|---|---|---|---|');
  for (const item of report.manifest.candidates) {
    lines.push(`| ${item.candidateId} | ${item.status} | ${item.formalPromotionEligible ? '是' : '否'} | ${item.testGenerationEligible ? '是' : '否'} | ${item.blockers.join('、') || '无'} | ${item.reviewQuestions.join('；') || '无'} |`);
  }
  lines.push('', '## 限制', '', ...report.limitations.map((item) => `- ${item}`), '');
  return lines.join('\n');
}

function mapCandidate(
  candidate: Record<string, any>,
  sourceVerification: PromotionSourceVerificationContext,
): BusinessRulePromotionCandidate {
  const sourceIds = asStrings(candidate.sourceIds);
  const sourceRegistry = sourceIds.map((sourceId) => buildSource(sourceId, candidate, sourceVerification));
  const caseId = String(candidate.caseId ?? '');
  const currentLanding = sourceVerification.landingCasesByCaseId.get(caseId);
  const cleanupEvidence = currentLanding?.executionReceipt?.cleanupEvidence;
  const cleanupVerified = currentLanding?.status === 'passed'
    && currentLanding.executionReceipt?.evidenceStatus === 'complete'
    && cleanupEvidence?.apiZeroResidue === true
    && cleanupEvidence?.uiZeroResidue === true;
  const outcomeClaims = asStrings(candidate.outcomeClaims);
  const semantics = {
    preconditions: asStrings(candidate.conditions),
    entities: ['商品'],
    actions: asStrings(candidate.actions),
    stateTransitions: [],
    constraints: [],
    outcomes: asStrings(candidate.outcomes),
    sideEffects: [],
    assertionSurfaces: asStrings(candidate.outcomes).map((outcome, index) => ({
      assertionId: outcomeClaims[index] ?? `${caseId}:expectation-${index + 1}`,
      fieldId: outcomeClaims[index] ?? `${caseId}:expectation-${index + 1}`,
      channel: inferAssertionChannel(outcome),
      authority: `test-plan-case:${caseId}`,
      terminalCondition: outcome,
    })),
    cleanup: {
      policyStatus: cleanupVerified ? 'verified' as const : 'unknown' as const,
      required: cleanupVerified,
      ...(cleanupVerified ? { strategyId: `standard-receipt-cleanup:${caseId}` } : {}),
      apiZeroResidueRequired: cleanupVerified,
      uiZeroResidueRequired: cleanupVerified,
    },
  };
  const mapped: BusinessRulePromotionCandidate = {
    candidateId: String(candidate.ruleId ?? ''),
    ruleId: String(candidate.ruleId ?? ''),
    ruleType: mapRuleType(candidate.ruleKind),
    statement: String(candidate.statement ?? ''),
    scope: {
      applicationId: 'merchant-center',
      businessDomainId: 'product-center-item',
      entityTypes: ['item'],
      operationKeys: [String(candidate.scenarioFamily ?? 'unknown')],
      channels: [String(candidate.productType ?? 'unknown')],
    },
    sourceRegistry,
    sourceFingerprint: fingerprintBusinessRulePromotionSources(sourceRegistry),
    ruleFingerprint: '',
    // SaaS has no source release SHA.  The promotion context is therefore the
    // current production observation date plus the adapter's known global
    // scope.  Runtime verification remains a separate status.
    effectiveVersion: `current-production-as-of-${new Date().toISOString().slice(0, 10)}`,
    effectiveContext: { environmentIds: ['production'], tenantIds: [], roleIds: [], locales: [], routes: [], featureFlags: [] },
    effectiveContextKind: 'global',
    supersedes: [],
    conflictsWith: asStrings(candidate.conflictsWithRuleIds),
    linkedCaseIds: candidate.caseId ? [String(candidate.caseId)] : [],
    linkedBindingIds: [
      ...asStrings(candidate.formalRuleBindingIds),
      ...asStrings(candidate.legacyRuleBindingIds),
      ...(sourceVerification.automationBindingsByCaseId.has(caseId) ? [`automation-binding:${caseId}`] : []),
    ],
    requiredObligationIds: asStrings(candidate.requiredValidationDimensions)
      .map((dimension) => `obligation:${String(candidate.ruleId)}:${dimension}`),
    semantics,
    currentStatus: mapCurrentStatus(candidate.currentStatus),
    candidateKind: mapCandidateKind(candidate.ruleKind),
    familyKey: `${String(candidate.ruleKind ?? 'unknown')}:${String(candidate.productType ?? 'unknown')}:${String(candidate.scenarioFamily ?? 'unknown')}`,
    sourceCandidateFingerprint: typeof candidate.candidateFingerprint === 'string' ? candidate.candidateFingerprint : undefined,
    executionVerified: currentLanding?.status === 'passed'
      && currentLanding.executionReceipt?.evidenceStatus === 'complete',
  };
  mapped.ruleFingerprint = fingerprintBusinessRulePromotionCandidate(mapped);
  return mapped;
}

function buildSource(
  sourceId: string,
  candidate: Record<string, any>,
  context: PromotionSourceVerificationContext,
) {
  const authoritative = sourceId.startsWith('formal-binding:') || sourceId.startsWith('declared-business-rule:');
  const [prefix, ...rest] = sourceId.split(':');
  const locatorValue = rest.join(':');
  if (prefix === 'test-plan-case') {
    const sourceCase = context.testPlanCases.get(locatorValue);
    const expectedFingerprint = context.testPlanCaseFingerprints.get(locatorValue);
    return {
      sourceId,
      kind: sourceKind(sourceId),
      path: context.testPlanPath,
      locator: `cases[${JSON.stringify(locatorValue)}]`,
      fingerprint: expectedFingerprint ?? context.testPlanFingerprint,
      verified: Boolean(sourceCase && expectedFingerprint === candidate.sourceCaseFingerprint),
    };
  }
  if (prefix === 'test-plan-fingerprint') {
    return {
      sourceId,
      kind: sourceKind(sourceId),
      path: context.testPlanPath,
      locator: 'document',
      fingerprint: context.testPlanFingerprint,
      verified: locatorValue === context.testPlanFingerprint,
    };
  }
  if (prefix === 'declared-business-rule') {
    const formalMatch = new RegExp(`(?:\\"ruleId\\"\\s*:\\s*\\"${escapeRegExp(locatorValue)}\\"|${escapeRegExp(locatorValue)})`).test(context.formalBindingsText);
    const documentMatch = context.businessRulesText.includes(locatorValue);
    const useFormal = formalMatch;
    return {
      sourceId,
      kind: sourceKind(sourceId),
      path: useFormal ? context.formalBindingsPath : context.businessRulesPath,
      locator: locatorValue,
      fingerprint: useFormal ? context.formalBindingsFingerprint : context.businessRulesFingerprint,
      verified: useFormal || documentMatch,
    };
  }
  if (prefix === 'xmind') {
    const canonical = context.canonicalCasesByNodeId.get(locatorValue);
    return {
      sourceId,
      kind: sourceKind(sourceId),
      path: context.xmindPath,
      locator: `nodeId=${locatorValue}`,
      fingerprint: context.xmindFingerprint,
      verified: Boolean(canonical && (!candidate.caseId || canonical.canonicalId === String(candidate.caseId))),
    };
  }
  const sourcePath = authoritative
    ? context.formalBindingsPath
    : `candidate://${sourceId}`;
  return {
    sourceId,
    kind: sourceKind(sourceId),
    path: sourcePath,
    locator: sourceId,
    fingerprint: sha256(`${sourceId}:${String(candidate.sourceCaseFingerprint ?? candidate.candidateFingerprint ?? '')}`),
    verified: false,
  };
}

function buildSourceVerificationContext(projectRoot: string): PromotionSourceVerificationContext {
  const workspaceRoot = path.resolve(projectRoot, '..');
  const testPlanAbsolutePath = path.join(projectRoot, 'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json');
  const businessRulesAbsolutePath = path.join(workspaceRoot, 'Merchant Center Info/商品中心业务规则.md');
  const formalBindingsAbsolutePath = path.join(projectRoot, 'contracts/product-center/business-rules/product-center-item-formal-rule-bindings.json');
  const xmindAbsolutePath = path.join(workspaceRoot, 'Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品.xmind');
  const testPlan = readJson<{ fingerprint?: string; cases: Array<Record<string, any>> }>(testPlanAbsolutePath);
  const testPlanText = fs.readFileSync(testPlanAbsolutePath, 'utf8');
  const businessRulesText = fs.readFileSync(businessRulesAbsolutePath, 'utf8');
  const formalBindingsText = fs.readFileSync(formalBindingsAbsolutePath, 'utf8');
  const canonicalPath = path.join(projectRoot, 'contracts/product-center/test-cases/canonical/product-center-item-canonical-release.json');
  const canonical = readJson<{ cases: Array<{ canonicalId: string; nodeId: string }> }>(canonicalPath);
  const automationBindingsPath = path.join(projectRoot, 'contracts/product-center/test-cases/canonical/product-center-item-authoritative-automation-bindings.json');
  const automationBindings = readJson<{ bindings: Array<{ caseId: string; runtimeReadiness?: string }> }>(automationBindingsPath);
  const landingAuditPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-item-group-landing-audit.json');
  const landingAudit = readJson<{
    modules: Array<{
      module: string;
      assessment?: { cases?: Array<{
        caseId: string;
        status?: string;
        executionReceipt?: {
          evidenceStatus?: string;
          cleanupEvidence?: { apiZeroResidue?: boolean; uiZeroResidue?: boolean };
        } | null;
      }> };
    }>;
  }>(landingAuditPath);
  const itemLandingCases = landingAudit.modules.find((item) => item.module === '商品管理-商品')?.assessment?.cases ?? [];
  const testPlanCases = new Map(testPlan.cases.map((item) => [String(item.id), item]));
  const testPlanCaseFingerprints = new Map(testPlan.cases.map((item) => [
    String(item.id),
    sha256(stableJson({
      id: item.id,
      title: item.title,
      source: item.source,
      preconditions: item.preconditions,
      actions: item.actions,
      expectedResults: item.expectedResults,
    })),
  ]));
  const relative = (absolutePath: string) => path.relative(projectRoot, absolutePath).replaceAll('\\', '/');
  return {
    testPlanPath: relative(testPlanAbsolutePath),
    testPlanFingerprint: typeof testPlan.fingerprint === 'string' && testPlan.fingerprint.trim()
      ? testPlan.fingerprint
      : sha256(testPlanText),
    testPlanCases,
    testPlanCaseFingerprints,
    businessRulesPath: relative(businessRulesAbsolutePath),
    businessRulesFingerprint: sha256(businessRulesText),
    businessRulesText,
    formalBindingsPath: relative(formalBindingsAbsolutePath),
    formalBindingsFingerprint: sha256(formalBindingsText),
    formalBindingsText,
    xmindPath: relative(xmindAbsolutePath),
    xmindFingerprint: fs.existsSync(xmindAbsolutePath) ? sha256(fs.readFileSync(xmindAbsolutePath)) : '',
    canonicalCasesByNodeId: new Map(canonical.cases.map((item) => [item.nodeId, item])),
    automationBindingsByCaseId: new Map(automationBindings.bindings.map((item) => [item.caseId, item])),
    landingCasesByCaseId: new Map(itemLandingCases.map((item) => [item.caseId, item])),
  };
}

function inferAssertionChannel(outcome: string): 'ui' | 'api' | 'downstream' | 'cleanup' {
  if (/清理|残留|删除后不存在|零残留/u.test(outcome)) return 'cleanup';
  if (/接口|API|请求|响应|错误码/u.test(outcome)) return 'api';
  if (/终端|POS|门店|菜单下发|同步到/u.test(outcome)) return 'downstream';
  return 'ui';
}

function sourceKind(sourceId: string): 'prd' | 'xmind' | 'business-rule' | 'human-confirmation' | 'ui-audit' | 'api-audit' | 'execution-receipt' {
  if (sourceId.startsWith('xmind:')) return 'xmind';
  if (sourceId.startsWith('declared-business-rule:') || sourceId.startsWith('formal-binding:')) return 'business-rule';
  if (sourceId.startsWith('execution-receipt:')) return 'execution-receipt';
  if (sourceId.startsWith('prd:')) return 'prd';
  return 'ui-audit';
}

function mapRuleType(ruleKind: unknown): BusinessRulePromotionCandidate['ruleType'] {
  if (ruleKind === 'api-contract') return 'api-contract';
  if (ruleKind === 'ui-contract') return 'ui-contract';
  if (ruleKind === 'technical') return 'technical';
  if (ruleKind === 'observed') return 'observed';
  return 'normative';
}

function mapCandidateKind(ruleKind: unknown): NonNullable<BusinessRulePromotionCandidate['candidateKind']> {
  if (ruleKind === 'api-contract') return 'api-contract';
  if (ruleKind === 'ui-contract') return 'ui-contract';
  if (ruleKind === 'technical') return 'technical';
  if (ruleKind === 'observed') return 'observed';
  if (ruleKind === 'field-validation') return 'normative';
  return 'unknown';
}

function mapCurrentStatus(value: unknown): BusinessRulePromotionCandidate['currentStatus'] {
  if (value === 'observed' || value === 'supported' || value === 'conflict' || value === 'blocked' || value === 'deprecated') return value;
  return value === 'candidate' ? 'candidate' : 'provisional';
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
