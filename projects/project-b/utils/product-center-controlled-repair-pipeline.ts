export type ProductCenterControlledRepairPipelineStatus =
  | 'approval-required'
  | 'blocked'
  | 'ready-for-incremental-regression'
  | 'ready-for-closure'
  | 'already-closed';

type Guardrails = {
  approvalRequired: boolean;
  autoApplyAllowed: boolean;
  businessRuleMutationAllowed: boolean;
};

export type ControlledRepairPipelineInput = {
  repairPlan: {
    guardrails: Guardrails;
    impactedCases: readonly string[];
    impactedRecipes: ReadonlyArray<{ caseId: string; capabilityIds: readonly string[] }>;
    proposals: ReadonlyArray<{ id: string }>;
  };
  approvalGate: {
    status: string;
    executionAllowed: boolean;
    guardrails: Guardrails;
    relevantProposalIds: readonly string[];
    approvedProposalIds: readonly string[];
    rejectedProposalIds: readonly string[];
    deferredProposalIds: readonly string[];
    pendingProposalIds: readonly string[];
    incrementalRegression: {
      planFingerprint: string;
      caseIds: readonly string[];
    };
  };
  incrementalPlan: {
    planFingerprint: string;
    cases: ReadonlyArray<{ caseId: string }>;
  };
  incrementalResult: {
    status: string;
    planFingerprint: string;
    caseResults: ReadonlyArray<{ caseId?: string; status: string }>;
  } | null;
  closure: {
    status: string;
    planFingerprint: string;
    closedProposalIds: readonly string[];
    codeChanges: readonly string[];
    businessRuleMutation: boolean;
  } | null;
};

export type ProductCenterControlledRepairPipelineEvaluation = {
  status: ProductCenterControlledRepairPipelineStatus;
  executionAllowed: boolean;
  runIncrementalRegression: boolean;
  closeAllowed: boolean;
  planFingerprint: string;
  caseIds: string[];
  proposalIds: string[];
  issues: Array<{ code: string; detail: string }>;
};

export function resolveControlledRepairPipelineOption(
  args: readonly string[],
  mode: 'verify' | 'full',
): { enabled: boolean } {
  const enabled = args.includes('--controlled-repair');
  if (enabled && mode !== 'full') {
    throw new Error('受控修复分支只允许在 full 模式启用');
  }
  return { enabled };
}

export function evaluateProductCenterControlledRepairPipeline(
  input: ControlledRepairPipelineInput,
): ProductCenterControlledRepairPipelineEvaluation {
  const issues: ProductCenterControlledRepairPipelineEvaluation['issues'] = [];
  const addIssue = (code: string, detail: string) => {
    if (!issues.some((issue) => issue.code === code && issue.detail === detail)) {
      issues.push({ code, detail });
    }
  };
  const planFingerprint = input.incrementalPlan.planFingerprint;
  const caseIds = sortedUnique(input.incrementalPlan.cases.map((item) => item.caseId));
  const proposalIds = sortedUnique(input.approvalGate.relevantProposalIds);

  assertGuardrails(input.repairPlan.guardrails, 'repair plan', addIssue);
  assertGuardrails(input.approvalGate.guardrails, 'approval gate', addIssue);

  const knownProposalIds = new Set(input.repairPlan.proposals.map((item) => item.id));
  const unknownProposalIds = proposalIds.filter((id) => !knownProposalIds.has(id));
  if (unknownProposalIds.length > 0) {
    addIssue('UNKNOWN_PROPOSAL', `审批门禁引用未知 proposal：${unknownProposalIds.join(',')}`);
  }
  const approvedProposalIds = sortedUnique(input.approvalGate.approvedProposalIds);
  if (input.approvalGate.executionAllowed && !sameSet(proposalIds, approvedProposalIds)) {
    addIssue('APPROVAL_SET_MISMATCH', '获批 proposal 未完整覆盖受控修复 proposal');
  }

  const planCaseIds = sortedUnique(input.repairPlan.impactedCases);
  const gateCaseIds = sortedUnique(input.approvalGate.incrementalRegression.caseIds);
  if (!sameSet(caseIds, planCaseIds) || !sameSet(caseIds, gateCaseIds)) {
    addIssue('INCREMENTAL_CASE_SET_MISMATCH', '受控修复、审批门禁与增量计划的用例集合不一致');
  }
  const recipeByCaseId = new Map(input.repairPlan.impactedRecipes.map((item) => [item.caseId, item]));
  for (const caseId of caseIds) {
    const recipe = recipeByCaseId.get(caseId);
    if (!recipe || recipe.capabilityIds[0] !== 'navigation.sidebar.open') {
      addIssue('SIDEBAR_ENTRY_REQUIRED', `增量 Recipe 第一 capability 不是 navigation.sidebar.open：${caseId}`);
    }
  }

  if (input.approvalGate.incrementalRegression.planFingerprint !== planFingerprint) {
    addIssue('PLAN_FINGERPRINT_MISMATCH', '审批门禁与增量计划指纹不一致');
  }

  const approvalPending = input.approvalGate.status === 'approval-required'
    || input.approvalGate.pendingProposalIds.length > 0;
  const approvalBlocked = input.approvalGate.status === 'blocked'
    || input.approvalGate.rejectedProposalIds.length > 0
    || input.approvalGate.deferredProposalIds.length > 0;
  if (approvalPending) addIssue('APPROVAL_REQUIRED', '受控修复 proposal 尚未全部审批');
  if (approvalBlocked) addIssue('APPROVAL_BLOCKED', '受控修复 proposal 已被拒绝或延期');
  if (input.approvalGate.status === 'ready-for-incremental-regression'
    && !input.approvalGate.executionAllowed) {
    addIssue('APPROVAL_GATE_INCONSISTENT', '审批状态已就绪但 executionAllowed=false');
  }

  let incrementalPassed = false;
  if (input.incrementalResult) {
    if (input.incrementalResult.planFingerprint !== planFingerprint) {
      addIssue('PLAN_FINGERPRINT_MISMATCH', '增量结果与增量计划指纹不一致');
    }
    const passedCaseIds = sortedUnique(input.incrementalResult.caseResults
      .filter((item) => item.status === 'passed' && item.caseId)
      .map((item) => item.caseId as string));
    incrementalPassed = input.incrementalResult.status === 'passed'
      && sameSet(caseIds, passedCaseIds)
      && input.incrementalResult.planFingerprint === planFingerprint;
    if (!incrementalPassed) {
      addIssue('INCREMENTAL_REGRESSION_FAILED', '增量回归失败、覆盖不完整或结果指纹不一致');
    }
  } else if (input.closure) {
    addIssue('INCREMENTAL_RESULT_MISSING', '已有 closure 但缺少对应增量回归结果');
  }

  let closureValid = false;
  if (input.closure) {
    if (input.closure.planFingerprint !== planFingerprint) {
      addIssue('PLAN_FINGERPRINT_MISMATCH', 'closure 与增量计划指纹不一致');
    }
    if (input.closure.businessRuleMutation || input.closure.codeChanges.length > 0) {
      addIssue('BUSINESS_RULE_MUTATION_FORBIDDEN', '受控修复 closure 不允许业务规则或代码修改');
    }
    if (input.closure.status !== 'completed-no-code-change') {
      addIssue('CLOSURE_STATUS_INVALID', `受控修复 closure 状态无效：${input.closure.status}`);
    }
    if (!sameSet(proposalIds, sortedUnique(input.closure.closedProposalIds))) {
      addIssue('CLOSURE_PROPOSAL_SET_MISMATCH', 'closure 未精确覆盖当前受控修复 proposal');
    }
    closureValid = input.closure.status === 'completed-no-code-change'
      && input.closure.planFingerprint === planFingerprint
      && input.closure.businessRuleMutation === false
      && input.closure.codeChanges.length === 0
      && sameSet(proposalIds, sortedUnique(input.closure.closedProposalIds));
  }

  if (approvalPending && issues.every((issue) => issue.code === 'APPROVAL_REQUIRED')) {
    return result('approval-required', false, false, false);
  }
  if (issues.length > 0) return result('blocked', false, false, false);
  if (!input.approvalGate.executionAllowed || approvalBlocked) {
    return result('blocked', false, false, false);
  }
  if (input.closure && closureValid && incrementalPassed) {
    return result('already-closed', true, false, false);
  }
  if (incrementalPassed) return result('ready-for-closure', true, false, true);
  return result('ready-for-incremental-regression', true, true, false);

  function result(
    status: ProductCenterControlledRepairPipelineStatus,
    executionAllowed: boolean,
    runIncrementalRegression: boolean,
    closeAllowed: boolean,
  ): ProductCenterControlledRepairPipelineEvaluation {
    return {
      status,
      executionAllowed,
      runIncrementalRegression,
      closeAllowed,
      planFingerprint,
      caseIds,
      proposalIds,
      issues,
    };
  }
}

function assertGuardrails(
  guardrails: Guardrails,
  owner: string,
  addIssue: (code: string, detail: string) => void,
): void {
  if (!guardrails.approvalRequired || guardrails.autoApplyAllowed) {
    addIssue('CONTROLLED_REPAIR_GUARDRAIL_INVALID', `${owner} 的审批或自动应用门禁无效`);
  }
  if (guardrails.businessRuleMutationAllowed) {
    addIssue('BUSINESS_RULE_MUTATION_FORBIDDEN', `${owner} 允许修改业务规则`);
  }
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
