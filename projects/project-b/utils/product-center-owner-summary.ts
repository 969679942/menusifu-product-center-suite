type Acceptance = {
  accepted: boolean;
  acceptedCaseIds: readonly string[];
  issues: readonly unknown[];
  safety: Record<string, number>;
};

export type ProductCenterOwnerSummaryInput = {
  generatedAt?: string;
  pipeline: {
    status: string;
    pipeline: { status: string; failedStage: string | null; stages: readonly unknown[] };
    technicalReadiness?: { technicalReady?: boolean } | null;
  };
  mainAcceptance: Acceptance;
  goldAcceptance: Acceptance;
  approvedAcceptance: Acceptance;
  trend: {
    summary: {
      runs: number;
      acceptedRuns: number;
      flakyCases: number;
      insufficientDataCases: number;
    };
  };
  failureAnalysis: {
    summary: {
      failedCases: number;
      unresolvedFailures: number;
      falseProductPromotions: number;
      categoryCounts: Record<string, number>;
    };
  };
  pageContractDiff: { status: string; summary: { findings: number } };
  pageContractImpact: { status: string; impactedCases: readonly string[] };
  driftLab: {
    status: string;
    summary: {
      mutationScenarios: number;
      historicalReplays: number;
      modules: number;
      interactionProbes: number;
    };
    metrics: {
      detectionRecall: number;
      findingPrecision: number;
      impactRecall: number;
      impactPrecision: number;
      repairDecisionAccuracy: number;
      historicalReplayAccuracy: number;
      falseProductPromotions: number;
      falseBusinessRuleMutations: number;
    };
  };
  approvalGate: {
    status: string;
    pendingProposalIds: readonly string[];
    rejectedProposalIds: readonly string[];
    deferredProposalIds: readonly string[];
    relevantProposalIds: readonly string[];
  };
  closure: { status: string; closedProposalIds: readonly string[] } | null;
  governance: {
    retention: { summary: { cleanupAlerts: number; expiredCandidates: number } };
    utf8: {
      summary: { invalid: number; withBom: number; withReplacementCharacters: number };
    };
  };
  quality: {
    legacyMigration: { summary: { legacyClaims: number } };
    markdownDiagnostics: {
      repairQueueSummary: { totalItems: number; byCode: Record<string, number> };
    };
    sourceDecisionSummary: {
      normalizedCases: number;
      verifiedCases: number;
      blockedCases: number;
      deferredCases: number;
      currentGoalBlockingCases: number;
    };
    testPlanGenerationWorkstream: {
      id: string;
      status: 'active' | 'deferred';
      currentGoalBlocking: boolean;
    };
  };
  sourceDecisions: {
    cases: ReadonlyArray<{ status: string; owner?: { role?: string } }>;
  };
};

type OwnerAction = {
  id: string;
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  owner: string;
  count: number;
  status: 'approval-required' | 'blocked' | 'open';
  evidence: string;
};

export function buildProductCenterOwnerSummary(input: ProductCenterOwnerSummaryInput) {
  const blockers: Array<{ code: string; detail: string }> = [];
  const addBlocker = (code: string, detail: string) => blockers.push({ code, detail });

  const runtimeClean = acceptanceClean(input.mainAcceptance)
    && acceptanceClean(input.goldAcceptance)
    && acceptanceClean(input.approvedAcceptance);
  if (!runtimeClean || input.pipeline.pipeline.status !== 'passed') {
    addBlocker(
      'RUNTIME_ACCEPTANCE_BLOCKED',
      `pipeline=${input.pipeline.pipeline.status};main=${input.mainAcceptance.accepted};gold=${input.goldAcceptance.accepted};approved=${input.approvedAcceptance.accepted}`,
    );
  }
  if (input.failureAnalysis.summary.failedCases > 0
    || input.failureAnalysis.summary.unresolvedFailures > 0
    || input.failureAnalysis.summary.falseProductPromotions > 0) {
    addBlocker(
      'FAILURE_ANALYSIS_BLOCKED',
      `failed=${input.failureAnalysis.summary.failedCases};unresolved=${input.failureAnalysis.summary.unresolvedFailures};falsePromotions=${input.failureAnalysis.summary.falseProductPromotions}`,
    );
  }
  if (input.pageContractDiff.status !== 'clean' || input.pageContractDiff.summary.findings > 0) {
    addBlocker(
      'PAGE_CONTRACT_REVIEW_REQUIRED',
      `status=${input.pageContractDiff.status};findings=${input.pageContractDiff.summary.findings}`,
    );
  }
  if (input.driftLab.status !== 'accepted'
    || input.driftLab.metrics.detectionRecall !== 1
    || input.driftLab.metrics.findingPrecision !== 1
    || input.driftLab.metrics.impactRecall !== 1
    || input.driftLab.metrics.impactPrecision !== 1
    || input.driftLab.metrics.repairDecisionAccuracy !== 1
    || input.driftLab.metrics.historicalReplayAccuracy !== 1
    || input.driftLab.metrics.falseProductPromotions !== 0
    || input.driftLab.metrics.falseBusinessRuleMutations !== 0) {
    addBlocker(
      'DRIFT_LAB_REVIEW_REQUIRED',
      `status=${input.driftLab.status};mutations=${input.driftLab.summary.mutationScenarios};modules=${input.driftLab.summary.modules};probes=${input.driftLab.summary.interactionProbes}`,
    );
  }
  if (input.governance.retention.summary.cleanupAlerts > 0) {
    addBlocker(
      'CLEANUP_ALERTS_PRESENT',
      `alerts=${input.governance.retention.summary.cleanupAlerts}`,
    );
  }
  if (input.governance.utf8.summary.invalid > 0
    || input.governance.utf8.summary.withBom > 0
    || input.governance.utf8.summary.withReplacementCharacters > 0) {
    addBlocker('ARTIFACT_ENCODING_INVALID', '存在 UTF-8、BOM 或替换字符问题');
  }
  if (input.trend.summary.flakyCases > 0 || input.trend.summary.insufficientDataCases > 0) {
    addBlocker(
      'RUNTIME_STABILITY_BLOCKED',
      `flaky=${input.trend.summary.flakyCases};insufficient=${input.trend.summary.insufficientDataCases}`,
    );
  }

  const generationActive = input.quality.testPlanGenerationWorkstream.status === 'active';
  const sourceGovernance = {
    normalizedCases: input.quality.sourceDecisionSummary.normalizedCases,
    verifiedCases: input.quality.sourceDecisionSummary.verifiedCases,
    blockedCases: input.quality.sourceDecisionSummary.blockedCases,
    deferredCases: input.quality.sourceDecisionSummary.deferredCases,
    currentGoalBlockingCases: input.quality.sourceDecisionSummary.currentGoalBlockingCases,
    legacyClaims: input.quality.legacyMigration.summary.legacyClaims,
    activeLegacyClaims: generationActive ? input.quality.legacyMigration.summary.legacyClaims : 0,
    deferredLegacyClaims: generationActive ? 0 : input.quality.legacyMigration.summary.legacyClaims,
    diagnosticCases: input.quality.markdownDiagnostics.repairQueueSummary.totalItems,
    activeDiagnosticCases: generationActive
      ? input.quality.markdownDiagnostics.repairQueueSummary.totalItems
      : 0,
    deferredDiagnosticCases: generationActive
      ? 0
      : input.quality.markdownDiagnostics.repairQueueSummary.totalItems,
    blockedByOwner: blockedByOwner(input.sourceDecisions.cases),
  };
  const diagnostics = input.quality.markdownDiagnostics.repairQueueSummary.byCode;
  const actions: OwnerAction[] = [];
  appendAction(actions, sourceGovernance.verifiedCases, {
    id: 'normalize-verified-sources', priority: 'P0', title: '来源规范化',
    owner: '产品负责人（按来源决策）', status: 'approval-required',
    evidence: 'contracts/product-center/reviews/unsupported-source-format-decisions.json',
  });
  appendAction(actions, generationActive
    ? sourceGovernance.blockedCases
    : sourceGovernance.currentGoalBlockingCases, {
    id: 'resolve-blocked-sources', priority: 'P0', title: '补充 blocked source',
    owner: '产品负责人（详见负责人分布）', status: 'blocked',
    evidence: 'contracts/product-center/reviews/unsupported-source-format-decisions.json',
  });
  appendAction(actions, generationActive ? diagnostics.MISSING_SECTION ?? 0 : 0, {
    id: 'repair-missing-sections', priority: 'P1', title: '补充缺失章节',
    owner: '待指定', status: 'blocked',
    evidence: 'output/test-case-audit/product-center/test-plan-repair-queue.json',
  });
  appendAction(actions, generationActive ? diagnostics.NON_NUMBERED_STEP ?? 0 : 0, {
    id: 'repair-non-numbered-steps', priority: 'P2', title: '修复非编号步骤',
    owner: '待指定', status: 'approval-required',
    evidence: 'output/test-case-audit/product-center/test-plan-repair-queue.json',
  });
  appendAction(actions, sourceGovernance.activeLegacyClaims, {
    id: 'migrate-legacy-claims', priority: 'P1', title: '迁移 legacy Claim',
    owner: '待指定', status: 'approval-required',
    evidence: 'output/test-case-audit/product-center/quality-program-latest.json',
  });
  const pendingRepair = input.approvalGate.pendingProposalIds.length
    + input.approvalGate.rejectedProposalIds.length
    + input.approvalGate.deferredProposalIds.length;
  appendAction(actions, pendingRepair, {
    id: 'review-controlled-repair', priority: 'P0', title: '复核受控修复',
    owner: '自动化负责人', status: 'approval-required',
    evidence: 'output/maintenance/product-center-controlled-repair-approval-gate.json',
  });
  actions.sort((left, right) => {
    const rank = { P0: 0, P1: 1, P2: 2 } as const;
    return rank[left.priority] - rank[right.priority];
  });

  const technicalReady = blockers.length === 0
    && input.pipeline.technicalReadiness?.technicalReady === true;
  const testGenerationProductReady = technicalReady && actions.length === 0 && generationActive;
  const status = !technicalReady
    ? 'blocked' as const
    : actions.length > 0
      ? 'ready-with-actions' as const
      : 'ready' as const;
  return {
    schemaVersion: '1.0.0' as const,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status,
    technicalReady,
    automationPlatformReady: technicalReady,
    testGenerationProductReady,
    pipeline: {
      status: input.pipeline.status,
      executionStatus: input.pipeline.pipeline.status,
      stages: input.pipeline.pipeline.stages.length,
      failedStage: input.pipeline.pipeline.failedStage,
    },
    runtime: {
      main: runtimeSummary(input.mainAcceptance),
      gold: runtimeSummary(input.goldAcceptance),
      approvedTechnicalBindings: runtimeSummary(input.approvedAcceptance),
    },
    trend: { ...input.trend.summary },
    failure: {
      failedCases: input.failureAnalysis.summary.failedCases,
      unresolvedFailures: input.failureAnalysis.summary.unresolvedFailures,
      falseProductPromotions: input.failureAnalysis.summary.falseProductPromotions,
      categoryCounts: { ...input.failureAnalysis.summary.categoryCounts },
    },
    pageContract: {
      status: input.pageContractDiff.status,
      findings: input.pageContractDiff.summary.findings,
      impactStatus: input.pageContractImpact.status,
      impactedCases: input.pageContractImpact.impactedCases.length,
    },
    driftLab: {
      status: input.driftLab.status,
      mutationScenarios: input.driftLab.summary.mutationScenarios,
      historicalReplays: input.driftLab.summary.historicalReplays,
      modules: input.driftLab.summary.modules,
      interactionProbes: input.driftLab.summary.interactionProbes,
      detectionRecall: input.driftLab.metrics.detectionRecall,
      findingPrecision: input.driftLab.metrics.findingPrecision,
      impactRecall: input.driftLab.metrics.impactRecall,
      impactPrecision: input.driftLab.metrics.impactPrecision,
      repairDecisionAccuracy: input.driftLab.metrics.repairDecisionAccuracy,
      historicalReplayAccuracy: input.driftLab.metrics.historicalReplayAccuracy,
      falseBusinessRuleMutations: input.driftLab.metrics.falseBusinessRuleMutations,
    },
    repair: {
      approvalStatus: input.approvalGate.status,
      relevantProposals: input.approvalGate.relevantProposalIds.length,
      pendingProposals: pendingRepair,
      closureStatus: input.closure?.status ?? 'not-closed',
      closedProposals: input.closure?.closedProposalIds.length ?? 0,
    },
    governance: {
      cleanupAlerts: input.governance.retention.summary.cleanupAlerts,
      expiredCandidates: input.governance.retention.summary.expiredCandidates,
      encodingFindings: input.governance.utf8.summary.invalid
        + input.governance.utf8.summary.withBom
        + input.governance.utf8.summary.withReplacementCharacters,
    },
    sourceGovernance,
    blockers,
    actions,
    actionSummary: {
      total: actions.length,
      P0: actions.filter((item) => item.priority === 'P0').length,
      P1: actions.filter((item) => item.priority === 'P1').length,
      P2: actions.filter((item) => item.priority === 'P2').length,
    },
  };
}

export function renderProductCenterOwnerSummaryMarkdown(
  summary: ReturnType<typeof buildProductCenterOwnerSummary>,
): string {
  const blockerRows = summary.blockers.length > 0
    ? summary.blockers.map((item) => `| ${item.code} | ${escapeCell(item.detail)} |`)
    : ['| 无 | 技术门禁通过 |'];
  const actionRows = summary.actions.length > 0
    ? summary.actions.map((item) =>
      `| ${item.priority} | ${escapeCell(item.title)} | ${escapeCell(item.owner)} | ${item.count} | ${item.status} |`)
    : ['| - | 无 | - | 0 | closed |'];
  const ownerRows = summary.sourceGovernance.blockedByOwner.length > 0
    ? summary.sourceGovernance.blockedByOwner.map((item) =>
      `| ${escapeCell(item.owner)} | ${item.cases} |`)
    : ['| 无 | 0 |'];
  return [
    '# 商品中心质量总览',
    '',
    `状态：${summary.status}  `,
    `技术就绪：${summary.technicalReady}`,
    '',
    '## 技术状态',
    '',
    '| 维度 | 状态 | 数量 |',
    '| --- | --- | ---: |',
    `| 主集合 | ${summary.runtime.main.accepted ? 'accepted' : 'blocked'} | ${summary.runtime.main.cases} |`,
    `| Gold | ${summary.runtime.gold.accepted ? 'accepted' : 'blocked'} | ${summary.runtime.gold.cases} |`,
    `| 已审批技术绑定 | ${summary.runtime.approvedTechnicalBindings.accepted ? 'accepted' : 'blocked'} | ${summary.runtime.approvedTechnicalBindings.cases} |`,
    `| 页面合同 | ${summary.pageContract.status} | ${summary.pageContract.findings} |`,
    `| 漂移实验室 | ${summary.driftLab.status} | ${summary.driftLab.mutationScenarios} |`,
    `| 失败分析 | ${summary.failure.failedCases === 0 ? 'clean' : 'blocked'} | ${summary.failure.failedCases} |`,
    `| 清理告警 | ${summary.governance.cleanupAlerts === 0 ? 'clean' : 'blocked'} | ${summary.governance.cleanupAlerts} |`,
    '',
    '## 阻断',
    '',
    '| 代码 | 详情 |',
    '| --- | --- |',
    ...blockerRows,
    '',
    '## 来源治理',
    '',
    `normalized=${summary.sourceGovernance.normalizedCases}，verified=${summary.sourceGovernance.verifiedCases}，blocked=${summary.sourceGovernance.blockedCases}，deferred=${summary.sourceGovernance.deferredCases}，当前目标阻断=${summary.sourceGovernance.currentGoalBlockingCases}，legacy Claim=${summary.sourceGovernance.legacyClaims}，诊断=${summary.sourceGovernance.diagnosticCases}，活动诊断=${summary.sourceGovernance.activeDiagnosticCases}，deferred legacy Claim=${summary.sourceGovernance.deferredLegacyClaims}，deferred 诊断=${summary.sourceGovernance.deferredDiagnosticCases}`,
    '',
    '| 负责人 | blocked 用例 |',
    '| --- | ---: |',
    ...ownerRows,
    '',
    '## 待办',
    '',
    '| 优先级 | 事项 | 负责人 | 数量 | 状态 |',
    '| --- | --- | --- | ---: | --- |',
    ...actionRows,
    '',
  ].join('\n');
}

function acceptanceClean(acceptance: Acceptance): boolean {
  return acceptance.accepted
    && acceptance.issues.length === 0
    && Object.values(acceptance.safety).every((count) => count === 0);
}

function runtimeSummary(acceptance: Acceptance) {
  return {
    accepted: acceptance.accepted,
    cases: acceptance.acceptedCaseIds.length,
    issues: acceptance.issues.length,
    safetyFindings: Object.values(acceptance.safety).reduce((sum, count) => sum + count, 0),
  };
}

function blockedByOwner(cases: ProductCenterOwnerSummaryInput['sourceDecisions']['cases']) {
  const counts = new Map<string, number>();
  for (const item of cases) {
    if (item.status !== 'blocked') continue;
    const owner = item.owner?.role?.trim() || '待指定';
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([owner, count]) => ({ owner, cases: count }))
    .sort((left, right) => left.owner < right.owner ? -1 : left.owner > right.owner ? 1 : 0);
}

function appendAction(
  actions: OwnerAction[],
  count: number,
  action: Omit<OwnerAction, 'count'>,
): void {
  if (count > 0) actions.push({ ...action, count });
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
