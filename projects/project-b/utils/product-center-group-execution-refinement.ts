import { createHash } from 'node:crypto';

export type ProductCenterGroupExecutionRefinementBinding = {
  caseId: string;
  title: string;
  route: string;
  bindingFingerprint: string;
  recipeId: string;
  capabilityIds: string[];
  assertionIds: string[];
  factoryId: string | null;
  cleanupId: string | null;
  generationAllowed: boolean;
  executionProfile: string;
};

export type ProductCenterGroupExecutionRefinementRuntimeCase = {
  caseId: string;
  status: string;
  classification: string;
  bindingFingerprint: string;
  finalRunId: string | null;
  observedEvidence: string[];
  observedAssertionIds: string[];
  missingEvidence: string[];
  missingAssertions: string[];
  applicationVersionFingerprint: string | null;
  cleanupStatus: string;
  claimCoverageComplete: boolean;
  caseExecutionFingerprint: string | null;
  observedSteps?: Array<{
    title: string;
    durationMs: number;
    depth: number;
  }>;
  evidencePaths: string[];
};

export type ProductCenterGroupExecutionRefinementFingerprint = {
  caseId: string;
  fingerprint: string;
};

export type ProductCenterGroupExecutionRefinementInput = {
  generatedAt?: string;
  bindings: ProductCenterGroupExecutionRefinementBinding[];
  runtimeCases: ProductCenterGroupExecutionRefinementRuntimeCase[];
  currentExecutionCases: ProductCenterGroupExecutionRefinementFingerprint[];
};

export function buildProductCenterGroupExecutionRefinementLedger(
  input: ProductCenterGroupExecutionRefinementInput,
) {
  const runtimeByCaseId = new Map(input.runtimeCases.map((item) => [item.caseId, item]));
  const executionByCaseId = new Map(input.currentExecutionCases.map((item) => [item.caseId, item.fingerprint]));
  const candidates: Array<Record<string, unknown>> = [];
  const rerunRequired: Array<Record<string, unknown>> = [];
  const blocked: Array<Record<string, unknown>> = [];

  for (const binding of [...input.bindings].sort((left, right) => left.caseId.localeCompare(right.caseId))) {
    if (!binding.generationAllowed) {
      blocked.push({
        caseId: binding.caseId,
        disposition: 'not-executable',
        reason: '当前正式绑定未获得自动化生成资格。',
      });
      continue;
    }

    const runtimeCase = runtimeByCaseId.get(binding.caseId);
    const currentExecutionFingerprint = executionByCaseId.get(binding.caseId) ?? null;
    const reasons = refinementBlockReasons(binding, runtimeCase, currentExecutionFingerprint);
    if (reasons.length > 0) {
      rerunRequired.push({
        caseId: binding.caseId,
        recipeId: binding.recipeId,
        disposition: 'rerun-required',
        reasons,
        previousRunId: runtimeCase?.finalRunId ?? null,
        previousBindingFingerprint: runtimeCase?.bindingFingerprint ?? null,
        currentBindingFingerprint: binding.bindingFingerprint,
        previousExecutionFingerprint: runtimeCase?.caseExecutionFingerprint ?? null,
        currentExecutionFingerprint,
      });
      continue;
    }

    const observedSteps = sanitizeObservedSteps(runtimeCase?.observedSteps ?? []);
    const proposedExecutionRecipe = {
      route: binding.route,
      capabilityIds: [...binding.capabilityIds],
      dataProfile: {
        factoryId: binding.factoryId,
        executionProfile: binding.executionProfile,
      },
      assertionSurface: {
        assertionIds: [...binding.assertionIds],
        observedEvidence: [...(runtimeCase?.observedEvidence ?? [])],
      },
      cleanupProfile: {
        cleanupId: binding.cleanupId,
        observedStatus: runtimeCase?.cleanupStatus,
      },
      observedSteps,
    };
    candidates.push({
      candidateId: `execution-refinement:${binding.caseId}`,
      candidateFingerprint: sha256(stableJson({
        caseId: binding.caseId,
        applicationVersionFingerprint: runtimeCase?.applicationVersionFingerprint,
        bindingFingerprint: binding.bindingFingerprint,
        executionFingerprint: currentExecutionFingerprint,
        proposedExecutionRecipe,
      })),
      status: 'provisional',
      disposition: 'ready-for-human-review',
      caseId: binding.caseId,
      title: binding.title,
      recipeId: binding.recipeId,
      evidence: {
        runId: runtimeCase?.finalRunId,
        applicationVersionFingerprint: runtimeCase?.applicationVersionFingerprint,
        bindingFingerprint: binding.bindingFingerprint,
        executionFingerprint: currentExecutionFingerprint,
        evidencePaths: [...(runtimeCase?.evidencePaths ?? [])],
      },
      proposedExecutionRecipe,
      governance: {
        formalCaseMutationAllowed: false,
        allowedTargets: [
          'route',
          'capabilityIds',
          'dataProfile',
          'assertionSurface',
          'cleanupProfile',
          'observedSteps',
        ],
        forbiddenTargets: [
          'businessExpectation',
          'businessRule',
          'fieldValidationRange',
          'propagationRule',
          'testIntent',
        ],
        promotionRequirement: '人工审核候选指纹后，仅更新执行配方；不得自动覆盖正式业务用例。',
      },
    });
  }

  const currentCaseIds = new Set(input.bindings.map((item) => item.caseId));
  const obsoleteRuntime = input.runtimeCases
    .filter((item) => !currentCaseIds.has(item.caseId))
    .map((item) => ({
      caseId: item.caseId,
      finalRunId: item.finalRunId,
      disposition: 'obsolete-runtime-evidence',
    }))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));

  return {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-group-execution-refinement-ledger',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status: rerunRequired.length === 0 && obsoleteRuntime.length === 0 ? 'ready-for-review' : 'review-required',
    policy: {
      runtimePassDoesNotChangeBusinessTruth: true,
      formalCaseAutoMutationAllowed: false,
      recipeRefinementRequiresCurrentFingerprints: true,
      recipeRefinementRequiresClaimReceipts: true,
      recipeRefinementRequiresCleanupProof: true,
    },
    summary: {
      currentBindings: input.bindings.length,
      executableBindings: input.bindings.filter((item) => item.generationAllowed).length,
      candidates: candidates.length,
      rerunRequired: rerunRequired.length,
      blocked: blocked.length,
      obsoleteRuntime: obsoleteRuntime.length,
    },
    candidates,
    rerunRequired,
    blocked,
    obsoleteRuntime,
  };
}

export function renderProductCenterGroupExecutionRefinementMarkdown(
  ledger: ReturnType<typeof buildProductCenterGroupExecutionRefinementLedger>,
): string {
  const lines = [
    '# 商品中心商品管理组执行配方精化候选',
    '',
    `- 状态：${ledger.status}`,
    `- 当前绑定：${ledger.summary.currentBindings}`,
    `- 可审核候选：${ledger.summary.candidates}`,
    `- 需重跑：${ledger.summary.rerunRequired}`,
    `- 当前不可执行：${ledger.summary.blocked}`,
    `- 已过期运行证据：${ledger.summary.obsoleteRuntime}`,
    '',
    '> 运行通过只允许生成执行配方候选，不允许自动覆盖业务预期、正式规则或测试意图。',
    '',
    '## 需重跑',
    '',
    ...ledger.rerunRequired.map((item) => `- \`${item.caseId}\`：${(item.reasons as string[]).join('；')}`),
    '',
    '## 可审核候选',
    '',
    ...ledger.candidates.map((item) => {
      const recipe = item.proposedExecutionRecipe as { observedSteps: Array<{ title: string }> };
      return `- \`${item.caseId}\`：${recipe.observedSteps.map((step) => step.title).join(' → ')}`;
    }),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function refinementBlockReasons(
  binding: ProductCenterGroupExecutionRefinementBinding,
  runtimeCase: ProductCenterGroupExecutionRefinementRuntimeCase | undefined,
  currentExecutionFingerprint: string | null,
): string[] {
  const reasons: string[] = [];
  if (!runtimeCase) return ['缺少当前用例运行证据。'];
  if (runtimeCase.status !== 'passed' || runtimeCase.classification !== 'passed') reasons.push('运行未严格通过。');
  if (runtimeCase.bindingFingerprint !== binding.bindingFingerprint) reasons.push('绑定指纹已变化。');
  if (!currentExecutionFingerprint || runtimeCase.caseExecutionFingerprint !== currentExecutionFingerprint) {
    reasons.push('执行实现指纹已变化。');
  }
  if (!runtimeCase.claimCoverageComplete
    || runtimeCase.missingEvidence.length > 0
    || runtimeCase.missingAssertions.length > 0
    || binding.assertionIds.some((item) => !runtimeCase.observedAssertionIds.includes(item))) {
    reasons.push('逐 Claim 断言收据不完整。');
  }
  if (binding.cleanupId
    && runtimeCase.cleanupStatus !== 'verified-current-run-api-zero-and-ui-zero') {
    reasons.push('缺少 API/UI 零残留证据。');
  }
  if ((runtimeCase.observedSteps ?? []).length === 0) reasons.push('缺少可用于精化步骤的运行轨迹。');
  return reasons;
}

function sanitizeObservedSteps(
  steps: Array<{ title: string; durationMs: number; depth: number }>,
): Array<{ title: string; durationMs: number; depth: number }> {
  return steps.map((step) => ({
    title: step.title
      .replace(/(authorization|password|cookie|token)\s*[:=]\s*(?:bearer\s+)?[^,;\s]+/gi, '$1=<redacted>')
      .replace(/bearer\s+[^,;\s]+/gi, 'Bearer <redacted>')
      .replace(/AUTO_AUDIT_[A-Z0-9_-]+/gi, '<audit-identity>')
      .slice(0, 240),
    durationMs: Math.max(0, Math.round(step.durationMs)),
    depth: Math.max(0, Math.round(step.depth)),
  }));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
