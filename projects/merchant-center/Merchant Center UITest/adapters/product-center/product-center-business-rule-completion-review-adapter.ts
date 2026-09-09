import { createHash } from 'node:crypto';
import {
  buildBusinessRuleCompletionReviewQueue,
  type BusinessRuleCompletionField,
  type BusinessRuleCompletionReviewItem,
} from '../../automation/system-test/business-rule-lifecycle';
import type {
  ProductCenterBusinessRuleLifecycleSnapshot,
  ProductCenterRejectedRuleBinding,
} from './product-center-business-rule-lifecycle-adapter';

export type ProductCenterCompletionQuestion = BusinessRuleCompletionField & {
  owner: 'product-owner' | 'test-architecture';
  resolutionMode: 'human-confirmation' | 'evidence-backed-technical-mapping';
  question: string;
  expectedAnswer: string;
};

export type ProductCenterSupplementalCaseEvidence = {
  caseId: string;
  sourcePath: string;
  sourceFingerprint: string;
  reviewStatus: 'approved';
  preconditions: string[];
  actions: string[];
  expectedResults: string[];
};

export type ProductCenterMappedRuleReview = {
  kind: 'complete-mapped-rule';
  reviewId: string;
  ruleId: string;
  bindingId: string;
  statement: string;
  ruleFingerprint: string;
  sourceFingerprint: string;
  linkedCaseIds: string[];
  linkedBindingIds: string[];
  evidenceBackedValues: BusinessRuleCompletionReviewItem['evidenceBackedValues'];
  supplementalCaseEvidence: ProductCenterSupplementalCaseEvidence | null;
  assertionDrafts: Array<{
    outcome: string;
    fieldsRequiringConfirmation: ['fieldId', 'channel', 'authority', 'terminalCondition'];
  }>;
  questions: ProductCenterCompletionQuestion[];
  responseTemplate: {
    decision: null;
    rationale: null;
    values: Record<string, null>;
  };
  executionImpact: BusinessRuleCompletionReviewItem['executionImpact'];
};

export type ProductCenterInvalidBindingReview = {
  kind: 'resolve-invalid-binding';
  reviewId: string;
  ruleId: string;
  bindingId: string;
  statement: string;
  reasons: string[];
  question: string;
  options: Array<{
    decision: 'reconfirm-rule' | 'withdraw-formal-binding';
    requiredFields: string[];
    expectedResult: string;
    executionImpact: string;
  }>;
  responseTemplate: {
    decision: null;
    rationale: null;
    confirmation: null;
  };
};

export type ProductCenterBusinessRuleCompletionReviewQueue = {
  schemaVersion: '1.0.0';
  queueId: 'product-center-business-rule-completion-review';
  status: 'awaiting-human-decision' | 'technical-remediation-required' | 'complete';
  summary: {
    totalReviews: number;
    mappedRuleCompletionReviews: number;
    invalidBindingReviews: number;
    generationReadyRules: number;
    existingPassedCasesInvalidated: number;
    rerunCasesNow: number;
  };
  reviewPolicy: {
    evidenceOnlyPrefill: true;
    missingValuesMayBeInferred: false;
    humanDecisionChangesRuntimeStatus: false;
    semanticChangeRequiresIncrementalRerun: true;
  };
  sharedQuestions: Array<{
    questionId: 'shared-effective-version' | 'batch-rule-reconfirmation';
    owner: 'product-owner';
    appliesToRuleIds: string[];
    question: string;
    expectedAnswer: string;
    systemCapturedFields: string[];
  }>;
  sharedResponseTemplate: {
    effectiveVersion: null;
    reconfirmMappedRules: null;
    rationale: null;
  };
  items: Array<ProductCenterMappedRuleReview | ProductCenterInvalidBindingReview>;
  rerunCaseIds: string[];
  preservedPassedCaseIds: string[];
  associationAudits: Record<string, import('../../automation/system-test/business-rule-review-governance').BusinessRuleAssociationAudit>;
  technicalAssociationBlockers: Array<{ ruleId: string; caseId: string; reasons: string[] }>;
  fingerprint: string;
};

export function buildProductCenterBusinessRuleCompletionReviewQueue(
  snapshot: ProductCenterBusinessRuleLifecycleSnapshot,
  supplementalCases: readonly ProductCenterSupplementalCaseEvidence[] = [],
): ProductCenterBusinessRuleCompletionReviewQueue {
  const commonReviews = buildBusinessRuleCompletionReviewQueue(snapshot.rules);
  const registrationByRuleId = new Map(snapshot.registrations.map((item) => [item.ruleId, item]));
  const supplementalByCaseId = new Map(supplementalCases.map((item) => [item.caseId, item]));
  const mappedItems = commonReviews
    .filter((review) => review.status === 'review-required')
    .map((review): ProductCenterMappedRuleReview => {
    const registration = registrationByRuleId.get(review.ruleId);
    if (!registration) throw new Error(`BUSINESS_RULE_REGISTRATION_REQUIRED:${review.ruleId}`);
    return {
      kind: 'complete-mapped-rule',
      reviewId: `completion-review:${review.ruleId}`,
      ruleId: review.ruleId,
      bindingId: registration.bindingId,
      statement: review.statement,
      ruleFingerprint: review.ruleFingerprint,
      sourceFingerprint: review.sourceFingerprint,
      linkedCaseIds: [...review.evidenceBackedValues.linkedCaseIds],
      linkedBindingIds: [...review.evidenceBackedValues.linkedBindingIds],
      evidenceBackedValues: review.evidenceBackedValues,
      supplementalCaseEvidence: review.evidenceBackedValues.linkedCaseIds
        .map((caseId) => supplementalByCaseId.get(caseId))
        .find((item): item is ProductCenterSupplementalCaseEvidence => Boolean(item)) ?? null,
      assertionDrafts: review.evidenceBackedValues.outcomes.map((outcome) => ({
        outcome,
        fieldsRequiringConfirmation: ['fieldId', 'channel', 'authority', 'terminalCondition'],
      })),
      questions: review.requiredFields
        .filter((field) => !['effectiveVersion', 'approval.approvedAt'].includes(field.fieldPath))
        .map((field) => ({ ...field, ...questionForField(field.fieldPath) })),
      responseTemplate: {
        decision: null,
        rationale: null,
        values: Object.fromEntries(review.requiredFields
          .filter((field) => !['effectiveVersion', 'approval.approvedAt'].includes(field.fieldPath))
          .map((field) => [field.fieldPath, null])),
      },
      executionImpact: review.executionImpact,
    };
  });
  const rejectedItems = snapshot.rejectedBindings.map(buildInvalidBindingReview);
  const items = [...mappedItems, ...rejectedItems];
  const sharedEffectiveVersionRuleIds = commonReviews
    .filter((review) => review.status === 'review-required'
      && review.requiredFields.some((field) => field.fieldPath === 'effectiveVersion'))
    .map((review) => review.ruleId);
  const sharedReconfirmationRuleIds = commonReviews
    .filter((review) => review.status === 'review-required'
      && review.requiredFields.some((field) => field.fieldPath === 'approval'
        || field.fieldPath.startsWith('approval.')))
    .map((review) => review.ruleId);
  const sharedQuestions: ProductCenterBusinessRuleCompletionReviewQueue['sharedQuestions'] = [
    ...(sharedEffectiveVersionRuleIds.length > 0 ? [{
      questionId: 'shared-effective-version' as const,
      owner: 'product-owner' as const,
      appliesToRuleIds: sharedEffectiveVersionRuleIds,
      question: '这些规则从哪个产品或发布版本开始统一生效？',
      expectedAnswer: '可追溯的版本号或发布标识',
      systemCapturedFields: [] as string[],
    }] : []),
    ...(sharedReconfirmationRuleIds.length > 0 ? [{
      questionId: 'batch-rule-reconfirmation' as const,
      owner: 'product-owner' as const,
      appliesToRuleIds: sharedReconfirmationRuleIds,
      question: '是否确认这些规则陈述在当前版本仍然有效？',
      expectedAnswer: '确认或驳回，并说明理由',
      systemCapturedFields: ['approval.approvedAt', 'approval.candidateFingerprint', 'approval.candidateSourceFingerprint'],
    }] : []),
  ];
  const humanDecisionRequired = rejectedItems.length > 0
    || sharedQuestions.length > 0
    || mappedItems.some((item) => item.questions.some((question) => question.resolutionMode === 'human-confirmation'));
  const queueWithoutFingerprint = {
    schemaVersion: '1.0.0' as const,
    queueId: 'product-center-business-rule-completion-review' as const,
    status: (items.length === 0
      ? 'complete'
      : humanDecisionRequired
        ? 'awaiting-human-decision'
        : 'technical-remediation-required') as ProductCenterBusinessRuleCompletionReviewQueue['status'],
    summary: {
      totalReviews: items.length,
      mappedRuleCompletionReviews: mappedItems.length,
      invalidBindingReviews: rejectedItems.length,
      generationReadyRules: snapshot.summary.generationReadyRules,
      existingPassedCasesInvalidated: snapshot.executionImpact.invalidatedCaseIds.length,
      rerunCasesNow: snapshot.executionImpact.rerunCaseIds.length,
    },
    reviewPolicy: {
      evidenceOnlyPrefill: true as const,
      missingValuesMayBeInferred: false as const,
      humanDecisionChangesRuntimeStatus: false as const,
      semanticChangeRequiresIncrementalRerun: true as const,
    },
    sharedQuestions,
    sharedResponseTemplate: {
      effectiveVersion: null,
      reconfirmMappedRules: null,
      rationale: null,
    },
    items,
    rerunCaseIds: [...snapshot.executionImpact.rerunCaseIds],
    preservedPassedCaseIds: [...snapshot.executionImpact.preservedPassedCaseIds],
    associationAudits: snapshot.associationAudits,
    technicalAssociationBlockers: Object.entries(snapshot.associationAudits).flatMap(([ruleId, audit]) =>
      audit.blockedCaseIds.map((caseId) => ({
        ruleId,
        caseId,
        reasons: audit.results.find((item) => item.caseId === caseId)?.reasons ?? ['CASE_ASSOCIATION_BLOCKED'],
      })),
    ).sort((left, right) => `${left.ruleId}:${left.caseId}`.localeCompare(`${right.ruleId}:${right.caseId}`)),
  };
  return { ...queueWithoutFingerprint, fingerprint: fingerprint(queueWithoutFingerprint) };
}

export function renderProductCenterBusinessRuleCompletionReviewMarkdown(
  queue: ProductCenterBusinessRuleCompletionReviewQueue,
): string {
  const lines = [
    '# 商品中心业务规则补全评审清单',
    '',
    `- 待评审：${queue.summary.totalReviews} 条`,
    `- 结构化补全：${queue.summary.mappedRuleCompletionReviews} 条`,
    `- 无效绑定处置：${queue.summary.invalidBindingReviews} 条`,
    `- 当前可生成用例：${queue.summary.generationReadyRules} 条`,
    `- 当前增量重验：${queue.summary.rerunCasesNow} 条`,
    `- 增量重验用例：${queue.rerunCaseIds.length > 0 ? queue.rerunCaseIds.map((id) => `\`${id}\``).join('、') : '无'}`,
    `- 既有通过结果转为待重验：${queue.summary.existingPassedCasesInvalidated} 条`,
    '',
  ];
  if (queue.sharedQuestions.length > 0) {
    lines.push('## 共享产品确认', '');
    queue.sharedQuestions.forEach((question, index) => {
      lines.push(`${index + 1}. ${question.question}（填写：${question.expectedAnswer}）`);
    });
    lines.push('');
  }
  for (const item of queue.items) {
    lines.push(`## ${item.ruleId}`, '', `- 规则：${item.statement}`, `- 正式绑定：\`${item.bindingId}\``);
    if (item.kind === 'resolve-invalid-binding') {
      lines.push(
        `- 当前问题：${item.reasons.join('、')}`,
        '',
        `**需要确认：${item.question}**`,
        '',
        '1. `reconfirm-rule`：重新确认该规则并补齐正式来源、关联用例和结构化语义。',
        '2. `withdraw-formal-binding`：撤销当前无有效确认支撑的正式绑定；历史材料保留。',
        '',
      );
      continue;
    }
    lines.push(
      `- 关联用例：${item.linkedCaseIds.map((id) => `\`${id}\``).join('、')}`,
      `- 当前动作：${item.evidenceBackedValues.actions.length} 条`,
      `- 当前预期：${item.evidenceBackedValues.outcomes.length} 条`,
      '',
    );
    const supplemental = item.supplementalCaseEvidence;
    if (supplemental && item.evidenceBackedValues.preconditions.length === 0) {
      lines.push('### 规范用例候选前置条件（待产品确认）', '');
      supplemental.preconditions.forEach((condition, index) => lines.push(`${index + 1}. ${condition}`));
      lines.push('');
    }
    if (supplemental && item.evidenceBackedValues.actions.length === 0) {
      lines.push('### 规范用例候选动作（待产品确认）', '');
      supplemental.actions.forEach((action, index) => lines.push(`${index + 1}. ${action}`));
      lines.push('');
    }
    if (supplemental && item.evidenceBackedValues.outcomes.length === 0) {
      lines.push('### 规范用例候选预期（待产品确认）', '');
      supplemental.expectedResults.forEach((outcome, index) => lines.push(`${index + 1}. ${outcome}`));
      lines.push('');
    }
    if (item.evidenceBackedValues.actions.length > 0) {
      lines.push('### 已有动作证据', '');
      item.evidenceBackedValues.actions.forEach((action, index) => lines.push(`${index + 1}. ${action}`));
      lines.push('');
    }
    if (item.evidenceBackedValues.outcomes.length > 0) {
      lines.push('### 已有预期证据', '');
      item.evidenceBackedValues.outcomes.forEach((outcome, index) => lines.push(`${index + 1}. ${outcome}`));
      lines.push('');
    }
    const hasHumanQuestion = item.questions.some((question) => question.resolutionMode === 'human-confirmation');
    lines.push(hasHumanQuestion ? '### 待产品确认' : '### 待自动技术补全', '');
    item.questions.forEach((question, index) => {
      const owner = question.owner === 'product-owner' ? '产品确认' : '测试架构补全';
      lines.push(`${index + 1}. [${owner}] ${question.question}（填写：${question.expectedAnswer}）`);
    });
    lines.push('');
  }
  lines.push(
    '## 自动对账结果',
    '',
    `- 规则关联自动校验：${Object.values(queue.associationAudits).every((audit) => audit.complete) ? '通过' : '存在技术阻断（不转人工语义审核）'}`,
    `- 自动判定语义未变用例：${Object.values(queue.associationAudits).flatMap((audit) => audit.autoValidatedCaseIds).map((id) => `\`${id}\``).join('、') || '无'}`,
    `- 技术阻断用例：${queue.technicalAssociationBlockers.map((item) => `\`${item.caseId}\`（${item.reasons.join('、')}）`).join('、') || '无'}`,
    '',
    '## 执行影响',
    '',
    '- 评审未完成时不生成新用例、不修改正式规则、不触发重跑。',
    '- 仅补确认时间、生效版本等元数据时，既有通过结果保持不变。',
    '- 前置条件、动作、预期、断言面或清理语义变化时，只将关联用例置为 `ready` 并增量重跑。',
    '',
  );
  return `${lines.join('\n')}\n`;
}

function buildInvalidBindingReview(
  binding: ProductCenterRejectedRuleBinding,
): ProductCenterInvalidBindingReview {
  return {
    kind: 'resolve-invalid-binding',
    reviewId: `binding-review:${binding.ruleId}`,
    ruleId: binding.ruleId,
    bindingId: binding.bindingId,
    statement: binding.statement,
    reasons: [...binding.reasons],
    question: '该规则是否仍应作为正式业务规则？',
    options: [
      {
        decision: 'reconfirm-rule',
        requiredFields: [
          'confirmedBy', 'confirmedAt', 'effectiveVersion', 'linkedCaseIds',
          'semantics.preconditions', 'semantics.actions', 'semantics.outcomes',
          'semantics.assertionSurfaces', 'semantics.cleanup',
        ],
        expectedResult: '生成新的指纹绑定人工确认并重新进入正式规则校验。',
        executionImpact: '确认内容改变关联用例语义时，仅重跑受影响用例。',
      },
      {
        decision: 'withdraw-formal-binding',
        requiredFields: ['rationale'],
        expectedResult: '从当前正式规则集合撤销该绑定，保留历史来源和审计记录。',
        executionImpact: '不把历史用例改为通过或删除；只解除无来源的正式规则身份。',
      },
    ],
    responseTemplate: { decision: null, rationale: null, confirmation: null },
  };
}

function questionForField(fieldPath: string): Pick<
  ProductCenterCompletionQuestion,
  'owner' | 'resolutionMode' | 'question' | 'expectedAnswer'
> {
  const productOwner = {
    owner: 'product-owner' as const,
    resolutionMode: 'human-confirmation' as const,
  };
  const testArchitecture = {
    owner: 'test-architecture' as const,
    resolutionMode: 'evidence-backed-technical-mapping' as const,
  };
  const questions: Record<string, ReturnType<typeof questionForField>> = {
    effectiveVersion: {
      ...productOwner,
      question: '该规则从哪个产品或发布版本开始生效？',
      expectedAnswer: '可追溯的版本号或发布标识',
    },
    'approval.approvedAt': {
      ...productOwner,
      question: '请以本次复核时间重新确认该规则。',
      expectedAnswer: '确认后由系统自动记录时间',
    },
    'semantics.preconditions': {
      ...productOwner,
      question: '执行该规则前必须满足哪些业务状态、权限和数据条件？',
      expectedAnswer: '按执行顺序列出的前置条件',
    },
    'semantics.actions': {
      ...productOwner,
      question: '验证该规则需要按什么顺序执行操作？',
      expectedAnswer: '可执行且字段明确的操作步骤',
    },
    'semantics.outcomes': {
      ...productOwner,
      question: '每个操作完成后必须验证哪些业务结果？',
      expectedAnswer: '与操作对应的可观察预期',
    },
    'semantics.assertionSurfaces': {
      ...testArchitecture,
      question: '每条预期应验证哪个字段、通过哪个权威通道、达到什么终态？',
      expectedAnswer: '由测试架构根据页面/API/绑定证据映射',
    },
    'semantics.cleanup': {
      ...testArchitecture,
      question: '该场景是否创建或修改数据；需要怎样清理并验证 API/UI 零残留？',
      expectedAnswer: '由测试架构根据写入行为和清理能力补全',
    },
    'semantics.cleanup.strategyId': {
      ...testArchitecture,
      question: '该写入场景应使用哪个已验证的清理策略？',
      expectedAnswer: '由测试架构根据服务端身份和 UI/API 零残留能力补全',
    },
    linkedBindingIds: {
      ...testArchitecture,
      question: '哪些当前自动化绑定可以执行该规则的关联用例？',
      expectedAnswer: '由测试架构按 caseId、用例指纹和实现指纹登记',
    },
    verificationStatus: {
      ...testArchitecture,
      question: '哪些关联用例需要当前指纹下的标准执行收据才能恢复 verified？',
      expectedAnswer: '由运行账本和标准收据自动裁决，不要求产品再次确认规则',
    },
  };
  return questions[fieldPath] ?? {
    ...productOwner,
    question: `请补齐或修正字段 ${fieldPath}。`,
    expectedAnswer: '来源明确、可验证的结构化值',
  };
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
