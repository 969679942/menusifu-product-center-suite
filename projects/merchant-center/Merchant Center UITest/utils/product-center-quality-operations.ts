export type ProductCenterAcceptanceRun = {
  runId: string;
  scope: string;
  generatedAt: string;
  accepted: boolean;
  entries: Array<{
    caseId: string;
    module: string;
    status: 'passed' | 'failed' | 'skipped';
  }>;
};

export function buildProductCenterAcceptanceTrend(input: readonly ProductCenterAcceptanceRun[]) {
  const runs = uniqueBy(input, (item) => item.runId, '验收趋势运行重复')
    .slice()
    .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
  const moduleIds = unique(runs.flatMap((run) => run.entries.map((entry) => entry.module))).sort();
  const caseIds = unique(runs.flatMap((run) => run.entries.map((entry) => entry.caseId))).sort();
  const modules = moduleIds.map((module) => {
    const moduleRuns = runs.flatMap((run) => {
      const entries = run.entries.filter((entry) => entry.module === module);
      return entries.length === 0 ? [] : [{ run, entries }];
    });
    return {
      module,
      runs: moduleRuns.length,
      acceptedRuns: moduleRuns.filter((item) => item.entries.every((entry) => entry.status === 'passed')).length,
      latestStatus: moduleRuns.at(-1)?.entries.every((entry) => entry.status === 'passed') ? 'accepted' : 'rejected',
      caseIds: unique(moduleRuns.flatMap((item) => item.entries.map((entry) => entry.caseId))).sort(),
    };
  });
  const cases = caseIds.map((caseId) => {
    const observations = runs.flatMap((run) => {
      const entry = run.entries.find((item) => item.caseId === caseId);
      return entry ? [{ runId: run.runId, generatedAt: run.generatedAt, status: entry.status }] : [];
    });
    const statusSet = new Set(observations.map((item) => item.status));
    const classification = observations.length < 3
      ? 'insufficient-data' as const
      : statusSet.size > 1
        ? 'flaky' as const
        : observations[0]?.status === 'passed'
          ? 'stable' as const
          : 'consistently-failing' as const;
    return { caseId, observations, classification };
  });
  return {
    summary: {
      runs: runs.length,
      acceptedRuns: runs.filter((run) => run.accepted).length,
      modules: modules.length,
      cases: cases.length,
      flakyCases: cases.filter((item) => item.classification === 'flaky').length,
      insufficientDataCases: cases.filter((item) => item.classification === 'insufficient-data').length,
    },
    modules,
    cases,
  };
}

export function mergeProductCenterAcceptanceRuns(
  previous: readonly ProductCenterAcceptanceRun[],
  current: readonly ProductCenterAcceptanceRun[],
): ProductCenterAcceptanceRun[] {
  const result = new Map(previous.map((item) => [item.runId, item]));
  for (const item of current) {
    const existing = result.get(item.runId);
    if (existing && !sameAcceptanceRunContent(existing, item)) {
      throw new Error(`同一验收运行标识内容不一致：${item.runId}`);
    }
    if (!existing) result.set(item.runId, item);
  }
  return [...result.values()].sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
}

function sameAcceptanceRunContent(
  left: ProductCenterAcceptanceRun,
  right: ProductCenterAcceptanceRun,
): boolean {
  const normalizeEntries = (entries: ProductCenterAcceptanceRun['entries']) => [...entries]
    .sort((first, second) => first.caseId.localeCompare(second.caseId)
      || first.module.localeCompare(second.module)
      || first.status.localeCompare(second.status));
  return JSON.stringify({
    runId: left.runId,
    scope: left.scope,
    accepted: left.accepted,
    entries: normalizeEntries(left.entries),
  }) === JSON.stringify({
    runId: right.runId,
    scope: right.scope,
    accepted: right.accepted,
    entries: normalizeEntries(right.entries),
  });
}

export function buildProductCenterControlledRepairPlan(input: {
  changes: ReadonlyArray<{ collection: string; id: string; route?: string; kind: string }>;
  impactedCases: ReadonlyArray<{ caseId: string; changeIds: readonly string[]; match: string }>;
  recipes: ReadonlyArray<{
    id: string;
    caseId: string;
    route: string;
    capabilityIds: readonly string[];
  }>;
}) {
  const impactedCaseIds = new Set(input.impactedCases.map((item) => item.caseId));
  const impactedRecipes = input.recipes
    .filter((recipe) => impactedCaseIds.has(recipe.caseId))
    .map((recipe) => ({
      recipeId: recipe.id,
      caseId: recipe.caseId,
      route: recipe.route,
      capabilityIds: [...recipe.capabilityIds],
    }));
  const proposals = input.changes.map((change) => {
    const businessRule = change.collection === 'businessRules';
    const traceability = change.collection === 'traceability';
    const unresolved = change.collection === 'unresolved';
    return {
      id: `repair:${change.collection}:${change.id}`,
      kind: businessRule
        ? 'product-confirmation' as const
        : traceability
          ? 'traceability-refresh' as const
          : unresolved
            ? 'unresolved-review' as const
            : 'page-contract-audit' as const,
      changeId: change.id,
      route: change.route,
      approvalRequired: true,
      autoApplyAllowed: false,
      allowedTargets: businessRule
        ? ['business-rule-review-record']
        : traceability
          ? ['source-citation', 'claim-rebinding']
          : unresolved
            ? ['unresolved-review-record', 'source-or-runtime-evidence']
            : ['page-object', 'capability-adapter', 'assertion-adapter'],
      requiredVerification: businessRule
        ? ['confirmed-product-decision', 'source-citation']
        : traceability
          ? ['exact-source-citation', 'claim-coverage-recheck']
          : unresolved
            ? ['explicit-resolution', 'source-or-runtime-evidence']
            : ['observable-page-contract', 'locator-uniqueness', 'impacted-recipe-rerun'],
    };
  });
  return {
    guardrails: {
      approvalRequired: true,
      autoApplyAllowed: false,
      businessRuleMutationAllowed: false,
    },
    impactedCases: [...impactedCaseIds].sort(),
    impactedCaseDetails: input.impactedCases.map((item) => ({
      caseId: item.caseId,
      changeIds: [...item.changeIds].sort(),
      match: item.match,
    })).sort((left, right) => left.caseId.localeCompare(right.caseId)),
    impactedRecipes,
    proposals,
  };
}

export function buildProductCenterControlledRepairApprovalGate(input: {
  repairPlan: {
    impactedCases: readonly string[];
    impactedCaseDetails: ReadonlyArray<{ caseId: string; changeIds: readonly string[] }>;
    proposals: ReadonlyArray<{ id: string; changeId: string; kind: string }>;
  };
  incrementalPlan: {
    planFingerprint: string;
    cases: ReadonlyArray<{ caseId: string }>;
    specFiles: readonly string[];
    grep: string;
  };
  decisions: ReadonlyArray<{
    proposalId: string;
    decision: 'approved' | 'rejected' | 'deferred';
    reviewedBy: string;
    reviewedAt: string;
    rationale: string;
  }>;
}) {
  const impactedCaseIds = unique(input.repairPlan.impactedCases).sort();
  const incrementalCaseIds = unique(input.incrementalPlan.cases.map((item) => item.caseId)).sort();
  if (JSON.stringify(impactedCaseIds) !== JSON.stringify(incrementalCaseIds)) {
    throw new Error(
      `增量回归用例与受控修复影响集合不一致：${impactedCaseIds.join(',')} != ${incrementalCaseIds.join(',')}`,
    );
  }
  const proposalById = new Map(input.repairPlan.proposals.map((proposal) => [proposal.id, proposal]));
  const decisions = uniqueBy(input.decisions, (item) => item.proposalId, '受控修复审批决定重复');
  for (const decision of decisions) {
    if (!proposalById.has(decision.proposalId)) {
      throw new Error(`受控修复审批引用未知 proposal：${decision.proposalId}`);
    }
    if (!decision.reviewedBy.trim()) throw new Error(`受控修复审批缺少审核人：${decision.proposalId}`);
    if (!decision.reviewedAt.trim()) throw new Error(`受控修复审批缺少审核时间：${decision.proposalId}`);
    if (!decision.rationale.trim()) throw new Error(`受控修复审批缺少理由：${decision.proposalId}`);
  }
  const impactedChangeIds = new Set(input.repairPlan.impactedCaseDetails
    .flatMap((item) => item.changeIds));
  const relevantProposals = input.repairPlan.proposals
    .filter((proposal) => impactedChangeIds.has(proposal.changeId))
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
  if (impactedCaseIds.length > 0 && relevantProposals.length === 0) {
    throw new Error('受控修复影响用例缺少对应 proposal');
  }
  const decisionByProposal = new Map(decisions.map((decision) => [decision.proposalId, decision]));
  const idsFor = (decision: 'approved' | 'rejected' | 'deferred') => relevantProposals
    .filter((proposal) => decisionByProposal.get(proposal.id)?.decision === decision)
    .map((proposal) => proposal.id);
  const approvedProposalIds = idsFor('approved');
  const rejectedProposalIds = idsFor('rejected');
  const deferredProposalIds = idsFor('deferred');
  const pendingProposalIds = relevantProposals
    .filter((proposal) => !decisionByProposal.has(proposal.id))
    .map((proposal) => proposal.id);
  const executionAllowed = rejectedProposalIds.length === 0
    && deferredProposalIds.length === 0
    && pendingProposalIds.length === 0;
  const status = rejectedProposalIds.length > 0 || deferredProposalIds.length > 0
    ? 'blocked' as const
    : pendingProposalIds.length > 0
      ? 'approval-required' as const
      : 'ready-for-incremental-regression' as const;

  return {
    status,
    executionAllowed,
    guardrails: {
      approvalRequired: true,
      autoApplyAllowed: false,
      businessRuleMutationAllowed: false,
    },
    relevantProposalIds: relevantProposals.map((proposal) => proposal.id),
    approvedProposalIds,
    rejectedProposalIds,
    deferredProposalIds,
    pendingProposalIds,
    incrementalRegression: {
      planFingerprint: input.incrementalPlan.planFingerprint,
      caseIds: incrementalCaseIds,
      specFiles: [...input.incrementalPlan.specFiles],
      grep: input.incrementalPlan.grep,
      executionAllowed,
    },
  };
}

export function buildProductCenterControlledRepairClosure(input: {
  approvalGate: {
    status: string;
    executionAllowed: boolean;
    relevantProposalIds: readonly string[];
  };
  incrementalPlan: {
    planFingerprint: string;
    cases: ReadonlyArray<{ caseId: string }>;
  };
  incrementalResult: {
    status: string;
    planFingerprint: string;
    caseResults: ReadonlyArray<{ caseId?: string; status: string }>;
  };
  observations: ReadonlyArray<{
    proposalId: string;
    caseId: string;
    expectedMaxLength: number;
    observedMaxLength: number;
    acceptedLength: number;
    rejectedLength: number;
    locatorCount: number;
    visible: boolean;
    enabled: boolean;
    sidebarEntryVerified?: boolean;
    firstCapabilityId?: string;
  }>;
}) {
  if (input.approvalGate.status !== 'ready-for-incremental-regression'
    || !input.approvalGate.executionAllowed) {
    throw new Error('受控修复尚未完成审批，禁止关闭');
  }
  if (input.incrementalResult.status !== 'passed'
    || input.incrementalResult.planFingerprint !== input.incrementalPlan.planFingerprint) {
    throw new Error('受控修复增量回归未通过或计划指纹不一致');
  }
  const expectedCaseIds = unique(input.incrementalPlan.cases.map((item) => item.caseId)).sort();
  const passedCaseIds = unique(input.incrementalResult.caseResults
    .filter((item) => item.status === 'passed' && item.caseId)
    .map((item) => item.caseId as string)).sort();
  if (JSON.stringify(expectedCaseIds) !== JSON.stringify(passedCaseIds)) {
    throw new Error('受控修复增量回归用例未完整通过');
  }
  const proposalIds = unique(input.approvalGate.relevantProposalIds).sort();
  const observedProposalIds = unique(input.observations.map((item) => item.proposalId)).sort();
  if (JSON.stringify(proposalIds) !== JSON.stringify(observedProposalIds)) {
    throw new Error('受控修复页面合同观测未覆盖全部 proposal');
  }
  for (const observation of input.observations) {
    if (observation.observedMaxLength !== observation.expectedMaxLength
      || observation.acceptedLength !== observation.expectedMaxLength
      || observation.rejectedLength !== observation.expectedMaxLength) {
      throw new Error(`观察到新边界，必须另行提交产品确认：${observation.proposalId}`);
    }
    if (observation.locatorCount !== 1 || !observation.visible || !observation.enabled) {
      throw new Error(`页面合同或定位器唯一性复核未通过：${observation.proposalId}`);
    }
    if (observation.sidebarEntryVerified === false
      || (observation.firstCapabilityId && observation.firstCapabilityId !== 'navigation.sidebar.open')) {
      throw new Error(`增量回归未从侧边栏进入：${observation.proposalId}`);
    }
  }
  return {
    status: 'completed-no-code-change' as const,
    planFingerprint: input.incrementalPlan.planFingerprint,
    closedProposalIds: proposalIds,
    codeChanges: [] as string[],
    businessRuleMutation: false as const,
    observations: input.observations.map((item) => ({ ...item })),
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function uniqueBy<T>(items: readonly T[], keyFor: (item: T) => string, message: string): T[] {
  const result = new Map<string, T>();
  for (const item of items) {
    const key = keyFor(item);
    if (!key.trim()) throw new Error(`${message}：缺少标识`);
    if (result.has(key)) throw new Error(`${message}：${key}`);
    result.set(key, item);
  }
  return [...result.values()];
}
