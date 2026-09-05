import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

type Readiness = {
  manifest: {
    promotionBatchId: string;
    manifestFingerprint: string;
    candidateSnapshotFingerprint: string;
    summary: Record<string, number>;
    clusters: Array<{
      clusterId: string;
      clusterKey: string;
      candidateIds: string[];
      greenCandidateIds: string[];
      yellowCandidateIds: string[];
      redCandidateIds: string[];
      exceptionCandidateIds: string[];
      semanticVariants: boolean;
    }>;
    candidates: Array<{
      candidateId: string;
      ruleId: string;
      status: 'green' | 'yellow' | 'red';
      formalPromotionEligible: boolean;
      testGenerationEligible: boolean;
      executionVerified: boolean;
      blockers: string[];
      reviewQuestions: string[];
      clusterKey: string;
    }>;
  };
};

type CandidateRegistry = {
  candidates: Array<{
    ruleId: string;
    caseId?: string;
    currentStatus: string;
    ruleKind: string;
    formalRuleBindingIds?: string[];
  }>;
};

type PromotionBatchPlan = {
  schemaVersion: '1.0.0';
  planId: 'product-center-business-rule-promotion-batch-plan';
  scope: 'generated-evidence';
  generatedAt: string;
  source: {
    readinessPath: string;
    readinessFingerprint: string;
    candidateSnapshotFingerprint: string;
  };
  objective: string;
  policy: {
    sourceAndSemanticEvidenceMustBeVerified: true;
    noAutomaticFormalPromotion: true;
    batchDecisionUnit: 'semantic-cluster';
    semanticVariantOrConflictRequiresIndividualReview: true;
    executionReceiptIsSeparateFromFormalApproval: true;
    metadataDoesNotRequireHumanReconfirmation: true;
  };
  stages: Array<{
    stageId: string;
    mode: 'automated' | 'human-exception-only';
    purpose: string;
    input: string[];
    output: string[];
    stopCondition: string;
  }>;
  summary: {
    totalCandidates: number;
    totalClusters: number;
    currentlyGreen: number;
    currentlyYellow: number;
    currentlyRed: number;
    evidenceRepairCandidates: number;
    sourceRepairCandidates: number;
    deferredHoldCandidates: number;
    formalCoveredCandidates: number;
    contractTriageCandidates: number;
    automatedEnrichmentCandidates: number;
    individualReviewCandidates: number;
    batchReviewCandidates: number;
    currentReceiptVerifiedCandidates: number;
    semanticVariantClusters: number;
    conflictClusters: number;
    batchReviewEligibleNow: number;
    individualReviewRequiredNow: number;
    humanDecisionsRequiredNow: 0;
    businessExecutionStarted: false;
    formalRulesModified: false;
  };
  clusters: Array<{
    clusterId: string;
    clusterKey: string;
    candidateIds: string[];
    lane: 'source-repair' | 'deferred-hold' | 'formal-covered' | 'contract-triage' | 'automated-enrichment' | 'batch-review' | 'individual-review' | 'mixed';
    reasonCodes: string[];
    automatedActions: string[];
    humanAction: 'none-now' | 'decide-cluster-after-evidence' | 'decide-each-candidate';
  }>;
  candidateWorkItems: Array<{
    candidateId: string;
    caseId: string | null;
    lane: 'source-repair' | 'deferred-hold' | 'formal-covered' | 'contract-triage' | 'automated-enrichment' | 'batch-review' | 'individual-review';
    reasonCodes: string[];
    humanActionRequiredNow: false;
  }>;
  guardrails: {
    generatedArtifactsReadOnly: true;
    reportMayNotModifyFormalRules: true;
    reportMayNotAuthorizeExecution: true;
    screenshotsOrAggregateCountsMayNotApprove: true;
    staleManifestMustBeRejected: true;
  };
  fingerprint: string;
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const readinessPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-business-rule-promotion-readiness.json');
const registryPath = path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-item-rule-registry.json');
const outputRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const outputPath = path.join(outputRoot, 'product-center-business-rule-promotion-batch-plan.json');
const outputMarkdownPath = path.join(outputRoot, 'product-center-business-rule-promotion-batch-plan.md');

export function buildProductCenterBusinessRulePromotionBatchPlan(): PromotionBatchPlan {
  const readiness = readJson<Readiness>(readinessPath);
  const registry = readJson<CandidateRegistry>(registryPath);
  const manifest = readiness.manifest;
  const candidatesById = new Map(manifest.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const registryById = new Map(registry.candidates.map((candidate) => [candidate.ruleId, candidate]));
  const candidateWorkItems: PromotionBatchPlan['candidateWorkItems'] = manifest.candidates.map((candidate) => {
    const source = registryById.get(candidate.candidateId);
    const lane: PromotionBatchPlan['candidateWorkItems'][number]['lane'] = source?.currentStatus === 'blocked'
      ? 'deferred-hold'
      : candidate.blockers.includes('SOURCE_NOT_VERIFIED') ? 'source-repair'
        : (source?.formalRuleBindingIds?.length ?? 0) > 0 ? 'formal-covered'
          : source?.ruleKind === 'ui-contract' ? 'contract-triage'
            : candidate.status === 'yellow' ? 'automated-enrichment'
              : candidate.status === 'green' && (candidate.blockers.length > 0 || candidate.reviewQuestions.length > 0)
                ? 'individual-review' : 'batch-review';
    return {
      candidateId: candidate.candidateId,
      caseId: source?.caseId ?? null,
      lane,
      reasonCodes: [
        ...(source?.currentStatus === 'blocked' ? ['DEFERRED_CAPABILITY_BLOCK'] : []),
        ...(candidate.blockers.includes('SOURCE_NOT_VERIFIED') ? ['SOURCE_EVIDENCE_REQUIRED'] : []),
        ...((source?.formalRuleBindingIds?.length ?? 0) > 0 ? ['ALREADY_COVERED_BY_FORMAL_RULE'] : []),
        ...(source?.ruleKind === 'ui-contract' ? ['TEST_CONTRACT_CLASSIFICATION_REQUIRED'] : []),
        ...(candidate.status === 'yellow' ? ['AUTOMATED_METADATA_OR_EVIDENCE_ENRICHMENT'] : []),
      ],
      humanActionRequiredNow: false,
    };
  });
  const workItemById = new Map(candidateWorkItems.map((item) => [item.candidateId, item]));
  const clusters = manifest.clusters.map((cluster) => {
    const members = cluster.candidateIds.map((id) => candidatesById.get(id)).filter(Boolean) as Readiness['manifest']['candidates'];
    const hasSourceBlock = members.some((candidate) => candidate.blockers.some((blocker) => blocker.includes('SOURCE_')));
    const hasEvidenceBlock = members.some((candidate) => candidate.reviewQuestions.some((question) => /版本|上下文|收据|断言|清理|义务/.test(question)));
    const hasConflict = cluster.exceptionCandidateIds.length > 0;
    const semanticVariant = cluster.semanticVariants;
    const registryMembers = cluster.candidateIds.map((id) => registryById.get(id)).filter(Boolean) as CandidateRegistry['candidates'];
    const allFormalCovered = registryMembers.length > 0 && registryMembers.every((candidate) => (candidate.formalRuleBindingIds?.length ?? 0) > 0);
    const allDeferred = registryMembers.length > 0 && registryMembers.every((candidate) => candidate.currentStatus === 'blocked');
    const allUiContract = registryMembers.length > 0 && registryMembers.every((candidate) => candidate.ruleKind === 'ui-contract');
    const memberLanes = [...new Set(cluster.candidateIds.map((id) => workItemById.get(id)?.lane).filter(Boolean))];
    const lane: PromotionBatchPlan['clusters'][number]['lane'] = memberLanes.length > 1
      ? 'mixed'
      : memberLanes[0] ?? (hasSourceBlock
        ? 'source-repair'
        : allDeferred ? 'deferred-hold'
          : allFormalCovered ? 'formal-covered'
            : allUiContract ? 'contract-triage'
              : hasEvidenceBlock ? 'automated-enrichment'
                : semanticVariant || hasConflict ? 'individual-review' : 'batch-review');
    const reasonCodes = [
      ...(hasSourceBlock ? ['SOURCE_EVIDENCE_REQUIRED'] : []),
      ...(hasEvidenceBlock ? ['SEMANTIC_OR_EXECUTION_EVIDENCE_REQUIRED'] : []),
      ...(allDeferred ? ['DEFERRED_CAPABILITY_BLOCK'] : []),
      ...(allFormalCovered ? ['ALREADY_COVERED_BY_FORMAL_RULE'] : []),
      ...(allUiContract ? ['TEST_CONTRACT_CLASSIFICATION_REQUIRED'] : []),
      ...(semanticVariant ? ['SEMANTIC_VARIANTS_PRESENT'] : []),
      ...(hasConflict ? ['CONFLICT_OR_EXCEPTION_PRESENT'] : []),
    ];
    const humanAction: PromotionBatchPlan['clusters'][number]['humanAction'] = lane === 'batch-review'
      ? 'decide-cluster-after-evidence'
      : lane === 'individual-review' ? 'decide-each-candidate' : 'none-now';
    return {
      clusterId: cluster.clusterId,
      clusterKey: cluster.clusterKey,
      candidateIds: [...cluster.candidateIds].sort(),
      lane,
      reasonCodes: [...new Set(reasonCodes)],
      automatedActions: lane === 'mixed'
        ? ['先按候选级工作队列分流', '各候选完成前不得整簇审批']
        : lane === 'source-repair'
        ? ['核对缺失规则 ID 的权威来源', '禁止用候选文本自证来源', '来源恢复后重新计算准备度']
        : lane === 'automated-enrichment'
          ? ['关联规范用例与当前完整收据', '从已验证断言补齐观察面', '采集上下文/清理证据', '重新计算候选准备度']
          : lane === 'formal-covered'
            ? ['合并为正式规则覆盖证据', '禁止重复创建正式规则']
            : lane === 'deferred-hold'
              ? ['保持延期状态', '仅在恢复条件满足后重新评估']
              : lane === 'contract-triage'
                ? ['按业务结果与纯 UI 结构拆分', '纯测试合同保留但不晋升业务规则']
                : ['按语义指纹聚类并验证候选快照', '生成不带执行授权的审批草案'],
      humanAction,
    };
  });
  const summary = {
    totalCandidates: manifest.summary.total,
    totalClusters: manifest.summary.clusters,
    currentlyGreen: manifest.summary.green,
    currentlyYellow: manifest.summary.yellow,
    currentlyRed: manifest.summary.red,
    evidenceRepairCandidates: candidateWorkItems.filter((item) => ['source-repair', 'automated-enrichment'].includes(item.lane)).length,
    sourceRepairCandidates: candidateWorkItems.filter((item) => item.lane === 'source-repair').length,
    deferredHoldCandidates: candidateWorkItems.filter((item) => item.lane === 'deferred-hold').length,
    formalCoveredCandidates: candidateWorkItems.filter((item) => item.lane === 'formal-covered').length,
    contractTriageCandidates: candidateWorkItems.filter((item) => item.lane === 'contract-triage').length,
    automatedEnrichmentCandidates: candidateWorkItems.filter((item) => item.lane === 'automated-enrichment').length,
    individualReviewCandidates: candidateWorkItems.filter((item) => item.lane === 'individual-review').length,
    batchReviewCandidates: candidateWorkItems.filter((item) => item.lane === 'batch-review').length,
    currentReceiptVerifiedCandidates: manifest.candidates.filter((candidate) => candidate.executionVerified).length,
    semanticVariantClusters: manifest.clusters.filter((cluster) => cluster.semanticVariants).length,
    conflictClusters: manifest.clusters.filter((cluster) => cluster.exceptionCandidateIds.length > 0).length,
    batchReviewEligibleNow: clusters.filter((cluster) => cluster.lane === 'batch-review').length,
    individualReviewRequiredNow: clusters.filter((cluster) => cluster.lane === 'individual-review').flatMap((cluster) => cluster.candidateIds).length,
    humanDecisionsRequiredNow: 0 as const,
    businessExecutionStarted: false as const,
    formalRulesModified: false as const,
  };
  const unsigned = {
    schemaVersion: '1.0.0' as const,
    planId: 'product-center-business-rule-promotion-batch-plan' as const,
    scope: 'generated-evidence' as const,
    generatedAt: new Date().toISOString(),
    source: {
      readinessPath: 'deliverables/test-plan-governance/product-center-business-rule-promotion-readiness.json',
      readinessFingerprint: sha256(fs.readFileSync(readinessPath)),
      candidateSnapshotFingerprint: manifest.candidateSnapshotFingerprint,
    },
    objective: '将候选规则先自动完成来源、语义、收据和上下文预审，再按语义簇批量审批；只把冲突和语义变体交给人工，避免逐条搬运。',
    policy: {
      sourceAndSemanticEvidenceMustBeVerified: true as const,
      noAutomaticFormalPromotion: true as const,
      batchDecisionUnit: 'semantic-cluster' as const,
      semanticVariantOrConflictRequiresIndividualReview: true as const,
      executionReceiptIsSeparateFromFormalApproval: true as const,
      metadataDoesNotRequireHumanReconfirmation: true as const,
    },
    stages: [
      { stageId: 'source-normalization', mode: 'automated' as const, purpose: '验证候选来源路径、定位和指纹，拒绝不可追溯来源。', input: ['candidate registry', 'canonical test-plan assets'], output: ['verified source registry', 'source diagnostics'], stopCondition: '来源缺失或指纹不匹配则停留在 evidence-repair。' },
      { stageId: 'semantic-compilation', mode: 'automated' as const, purpose: '从已验证用例编译前置条件、动作、预期、断言面和清理契约。', input: ['verified source registry', 'canonical case body'], output: ['semantic fingerprint', 'obligation coverage'], stopCondition: '语义冲突或断言/清理缺失不得进入批量审批。' },
      { stageId: 'receipt-and-context-join', mode: 'automated' as const, purpose: '按 caseId、用例/实现/上下文指纹关联当前标准收据。', input: ['execution index', 'standard receipts', 'time-context evidence'], output: ['execution verification', 'context evidence'], stopCondition: '无完整收据只生成候选，不得判定正式。' },
      { stageId: 'cluster-and-preflight', mode: 'automated' as const, purpose: '按语义指纹和作用域聚类，识别可批量审批簇与例外。', input: ['candidate snapshot', 'semantic fingerprints'], output: ['batch-review plan', 'individual-review queue'], stopCondition: '语义变体/冲突簇必须拆成逐候选决定。' },
      { stageId: 'formal-decision', mode: 'human-exception-only' as const, purpose: '仅对证据齐全的批次或例外执行审批决定。', input: ['batch-review plan', 'candidate/source fingerprints'], output: ['append-only decision events'], stopCondition: '没有显式决定、指纹过期或证据不完整时保持 hold。' },
    ],
    summary,
    clusters,
    candidateWorkItems,
    guardrails: {
      generatedArtifactsReadOnly: true as const,
      reportMayNotModifyFormalRules: true as const,
      reportMayNotAuthorizeExecution: true as const,
      screenshotsOrAggregateCountsMayNotApprove: true as const,
      staleManifestMustBeRejected: true as const,
    },
  };
  const artifact = { ...unsigned, fingerprint: sha256(stableStringify(unsigned)) };
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputMarkdownPath, renderMarkdown(artifact), 'utf8');
  return artifact;
}

function renderMarkdown(artifact: PromotionBatchPlan): string {
  return [
    '# 商品中心业务规则候选批量晋升预审计划', '',
    `- 候选：${artifact.summary.totalCandidates}；语义簇：${artifact.summary.totalClusters}`,
    `- 当前绿/黄/红：${artifact.summary.currentlyGreen}/${artifact.summary.currentlyYellow}/${artifact.summary.currentlyRed}`,
    `- 来源修复：${artifact.summary.sourceRepairCandidates}；自动补证据：${artifact.summary.automatedEnrichmentCandidates}；当前完整收据：${artifact.summary.currentReceiptVerifiedCandidates}`,
    `- 已由正式规则覆盖：${artifact.summary.formalCoveredCandidates}；延期保持：${artifact.summary.deferredHoldCandidates}；UI/测试合同分流：${artifact.summary.contractTriageCandidates}`,
    `- 语义变体簇：${artifact.summary.semanticVariantClusters}；冲突簇：${artifact.summary.conflictClusters}`,
    `- 当前可批量审批簇：${artifact.summary.batchReviewEligibleNow}；当前人工决定：${artifact.summary.humanDecisionsRequiredNow}`,
    '',
    '## 执行原则', '',
    '- 先自动校验来源、语义、收据、上下文、断言和清理，再生成审批草案。',
    '- 语义变体或冲突必须逐候选处理；不存在完整证据时不要求人工重复确认，也不晋升。',
    '- 正式规则审批与业务用例执行是两个独立事实；本计划不启动执行。',
    '',
    '## 候选级工作队列（执行权威）', '',
    '| 候选 | 用例 | 当前通道 | 原因 | 当前人工动作 |',
    '|---|---|---|---|---|',
    ...artifact.candidateWorkItems.map((item) => `| ${item.candidateId} | ${item.caseId ?? '无'} | ${item.lane} | ${item.reasonCodes.join('、') || '无'} | 无 |`),
    '',
    '## 规则簇处理', '',
    '| 规则簇 | 候选数 | 后续聚类通道 | 原因 | 人工动作 |',
    '|---|---:|---|---|---|',
    ...artifact.clusters.map((cluster) => `| ${cluster.clusterId} | ${cluster.candidateIds.length} | ${cluster.lane} | ${cluster.reasonCodes.join('、') || '无'} | ${cluster.humanAction} |`),
    '',
    '## 阶段', '',
    ...artifact.stages.map((stage) => `- ${stage.stageId}（${stage.mode}）：${stage.purpose}；停止条件：${stage.stopCondition}`),
    '',
  ].join('\n');
}

function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

if (require.main === module) {
  const artifact = buildProductCenterBusinessRulePromotionBatchPlan();
  process.stdout.write(`${JSON.stringify({ output: outputPath, summary: artifact.summary })}\n`);
}
