import {
  assessBusinessRuleCoverage,
  type BusinessRuleCoverageAssessment,
  type BusinessRuleCoverageCaseClaim,
  type BusinessRuleCoverageObligation,
} from '../../../../Test Automation Platform/src/automation/system-test/business-rule-coverage';

type RuleSemantics = {
  preconditions?: string[];
  actions?: string[];
  stateTransitions?: Array<{ from: string; action: string; to: string }>;
  constraints?: string[];
  outcomes?: string[];
  sideEffects?: string[];
  assertionSurfaces?: Array<{ assertionId: string; terminalCondition: string }>;
  cleanup?: {
    required: boolean;
    strategyId?: string;
    apiZeroResidueRequired: boolean;
    uiZeroResidueRequired: boolean;
  };
};

export type ProductCenterFormalRule = {
  ruleId: string;
  ruleFingerprint: string;
  statement: string;
  linkedCaseIds: string[];
  sourceRegistry: Array<{ sourceId: string }>;
  semantics: RuleSemantics;
};

export type ProductCenterDocumentRuleStatus =
  | 'formal'
  | 'document-registered-pending-lifecycle'
  | 'conflicted'
  | 'historical'
  | 'deprecated';

export type ProductCenterDocumentRuleLedgerItem = {
  ruleId: string;
  status: ProductCenterDocumentRuleStatus;
  primaryLineNumber: number;
  lineNumbers: number[];
  sections: string[];
  moduleSection: string;
  statement: string;
  sourceLabels: string[];
  classificationEvidence: string[];
  classificationConfidence: 'high' | 'medium' | 'low';
};

export type ProductCenterRuleCoverage = {
  ruleId: string;
  statement: string;
  linkedCaseIds: string[];
  obligations: BusinessRuleCoverageObligation[];
  testCaseClaims: BusinessRuleCoverageCaseClaim[];
  automationClaims: BusinessRuleCoverageCaseClaim[];
  businessAssessment: BusinessRuleCoverageAssessment;
  automationAssessment: BusinessRuleCoverageAssessment;
  combinedAssessment: BusinessRuleCoverageAssessment;
  missingObligations: Array<{ obligationId: string; dimension: string; statement: string }>;
  diagnostics: string[];
};

const DEPRECATED_RULE_IDS = new Set(['BR-ITEM-INDUSTRY-INHERITANCE']);

const SINGLE_CASE_FULL_COVERAGE: Record<string, string> = {
  'BR-ITEM-CATEGORY-OPTIONAL': 'TC-ITEM-STD-037',
  'BR-ITEM-CATEGORY-LEAF-SELECTION': 'TC-ITEM-STD-007',
  'BR-ITEM-CATEGORY-DIRECT-PARENT-CREATE': 'TC-ITEM-STD-006',
  'BR-ITEM-COMBO-GROUP-REQUIRED': 'TC-ITEM-PKG-046',
  'BR-ITEM-COMBO-OPTIONAL-EDIT-BOUNDARY': 'TC-ITEM-PKG-059',
};

export function extractProductCenterDocumentRuleLedger(input: {
  documentText: string;
  formalRuleIds: readonly string[];
}): ProductCenterDocumentRuleLedgerItem[] {
  const formalIds = new Set(input.formalRuleIds);
  const occurrences = new Map<string, Array<{ lineNumber: number; line: string; section: string }>>();
  let section = '';
  input.documentText.split(/\r?\n/).forEach((line, index) => {
    if (/^#{1,6}\s+/.test(line)) section = line.replace(/^#{1,6}\s+/, '').trim();
    for (const match of line.matchAll(/\bBR-[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g)) {
      const ruleId = match[0];
      if (!/\d{3}$/.test(ruleId) && !formalIds.has(ruleId) && !DEPRECATED_RULE_IDS.has(ruleId)) continue;
      const values = occurrences.get(ruleId) ?? [];
      values.push({ lineNumber: index + 1, line, section });
      occurrences.set(ruleId, values);
    }
  });

  return [...occurrences.entries()]
    .map(([ruleId, values]) => {
      let status: ProductCenterDocumentRuleStatus;
      let classificationEvidence: string[];
      let classificationConfidence: ProductCenterDocumentRuleLedgerItem['classificationConfidence'];
      const deprecatedEvidence = values.filter((item) => /已废弃|deprecated/i.test(item.line));
      const conflictEvidence = values.filter((item) => isExplicitRuleConflictEvidence(ruleId, item.line));
      const historicalEvidence = values.filter((item) => /历史|只读/.test(item.section) || /历史|只读/.test(item.line));
      if (formalIds.has(ruleId)) {
        status = 'formal';
        classificationEvidence = ['formal-lifecycle-registry-match'];
        classificationConfidence = 'high';
      } else if (DEPRECATED_RULE_IDS.has(ruleId) || deprecatedEvidence.length > 0) {
        status = 'deprecated';
        classificationEvidence = unique([
          ...(DEPRECATED_RULE_IDS.has(ruleId) ? ['explicit-deprecated-rule-registry'] : []),
          ...deprecatedEvidence.map((item) => `explicit-deprecated-marker:line-${item.lineNumber}`),
        ]);
        classificationConfidence = 'high';
      } else if (conflictEvidence.length > 0) {
        status = 'conflicted';
        classificationEvidence = conflictEvidence.map((item) => `explicit-rule-conflict:line-${item.lineNumber}`);
        classificationConfidence = 'high';
      } else if (historicalEvidence.length === values.length) {
        status = 'historical';
        classificationEvidence = historicalEvidence.map((item) => `historical-or-readonly-context:line-${item.lineNumber}`);
        classificationConfidence = 'high';
      } else {
        status = 'document-registered-pending-lifecycle';
        classificationEvidence = ['document-id-present-without-formal-lifecycle-or-explicit-conflict-evidence'];
        classificationConfidence = 'medium';
      }
      const primaryOccurrence = selectPrimaryOccurrence(ruleId, values, formalIds.has(ruleId));
      return {
        ruleId,
        status,
        primaryLineNumber: primaryOccurrence.lineNumber,
        lineNumbers: unique(values.map((item) => item.lineNumber)),
        sections: unique(values.map((item) => item.section).filter(Boolean)),
        moduleSection: primaryOccurrence.section || '未归属章节',
        statement: isDirectRuleDefinition(ruleId, primaryOccurrence.line)
          ? extractRuleStatement(ruleId, primaryOccurrence.line)
          : '未提取到独立规则正文，仅保留原文引用位置',
        sourceLabels: unique(values.flatMap((item) => extractSourceLabels(item.line))),
        classificationEvidence,
        classificationConfidence,
      };
    })
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));
}

function selectPrimaryOccurrence(
  ruleId: string,
  values: Array<{ lineNumber: number; line: string; section: string }>,
  formal: boolean,
): { lineNumber: number; line: string; section: string } {
  const definitions = values.filter((item) => isDirectRuleDefinition(ruleId, item.line));
  if (formal) {
    const formalTableDefinition = definitions.find((item) => item.section === '规则治理与覆盖口径');
    if (formalTableDefinition) return formalTableDefinition;
  }
  return definitions.find((item) => extractSourceLabels(item.line).length > 0)
    ?? definitions[0]
    ?? values[0];
}

function isDirectRuleDefinition(ruleId: string, line: string): boolean {
  const escapedRuleId = escapeRegExp(ruleId);
  if (new RegExp(`^\\s*(?:[-*+]\\s*)?(?:\\*\\*)?(?:\`${escapedRuleId}\`|${escapedRuleId})(?:\\*\\*)?(?:\\s|$)`).test(line)) {
    return true;
  }
  const cells = line.split('|').map((cell) => stripMarkdown(cell).trim()).filter(Boolean);
  return cells[0] === ruleId;
}

function isExplicitRuleConflictEvidence(ruleId: string, line: string): boolean {
  const normalized = stripMarkdown(line);
  if (!/(?:现网冲突|规则(?:存在)?(?:冲突|矛盾)|来源结论不一致|待产品统一|冲突待产品统一)/.test(normalized)) {
    return false;
  }
  const primaryRuleId = extractPrimaryRuleId(line);
  if (primaryRuleId) return primaryRuleId === ruleId;
  const mentionedRuleIds = unique([...normalized.matchAll(/\bBR-[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g)].map((match) => match[0]));
  return mentionedRuleIds.length === 1 && mentionedRuleIds[0] === ruleId;
}

function extractPrimaryRuleId(line: string): string | null {
  const direct = line.match(/^\s*(?:[-*+]\s*)?(?:\*\*)?(?:`)?(BR-[A-Z0-9]+(?:-[A-Z0-9]+)+)(?:`)?(?:\*\*)?(?:\s|$)/);
  if (direct) return direct[1];
  const cells = line.split('|').map((cell) => stripMarkdown(cell).trim()).filter(Boolean);
  return /^BR-[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(cells[0] ?? '') ? cells[0] : null;
}

function extractRuleStatement(ruleId: string, line: string): string {
  const cells = line.split('|').map((cell) => stripMarkdown(cell).trim()).filter(Boolean);
  const tableRuleIndex = cells.indexOf(ruleId);
  if (tableRuleIndex >= 0 && cells[tableRuleIndex + 1]) return cells[tableRuleIndex + 1];
  const escapedRuleId = escapeRegExp(ruleId);
  const withoutPrefix = line.replace(
    new RegExp(`^\\s*(?:[-*+]\\s*)?(?:\\*\\*)?(?:\`${escapedRuleId}\`|${escapedRuleId})(?:\\*\\*)?\\s*`),
    '',
  );
  const statement = stripMarkdown(withoutPrefix)
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/\s{2,}$/g, '')
    .trim();
  return statement || '未提取到独立规则正文，仅保留原文引用位置';
}

function extractSourceLabels(line: string): string[] {
  return [...line.matchAll(/\[([^\]]+)\]/g)]
    .map((match) => match[1].trim())
    .filter((label) => /PRD|现网|B端|人工确认|产品确认|XMind|历史|未开发|非本期/.test(label));
}

function stripMarkdown(value: string): string {
  return value.replace(/\*\*/g, '').replace(/`/g, '').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildProductCenterRuleCoverage(input: {
  rule: ProductCenterFormalRule;
  canonicalCaseDocument: string;
  automationBindingCaseIds: ReadonlySet<string>;
  currentIdentities?: import('../../../../Test Automation Platform/src/automation/system-test/business-rule-coverage').BusinessRuleCoverageCurrentIdentity[];
  currentEvidence?: import('../../../../Test Automation Platform/src/automation/system-test/business-rule-coverage').BusinessRuleCoverageEvidence[];
}): ProductCenterRuleCoverage {
  const obligations = input.rule.ruleId === 'BR-ITEM-010'
    ? buildItemNameUniquenessObligations(input.rule)
    : buildAtomicObligations(input.rule);
  const diagnostics: string[] = [];
  const testCaseClaims = input.rule.ruleId === 'BR-ITEM-010'
    ? buildItemNameUniquenessClaims(input.rule, obligations, 'test-case', input.canonicalCaseDocument, undefined, diagnostics)
    : SINGLE_CASE_FULL_COVERAGE[input.rule.ruleId]
      ? buildSingleCaseClaims(input.rule, obligations, 'test-case', input.canonicalCaseDocument, undefined, diagnostics)
      : buildTraceableLinkedCaseClaims(input.rule, obligations, 'test-case', input.canonicalCaseDocument, undefined, diagnostics);
  const automationClaims = input.rule.ruleId === 'BR-ITEM-010'
    ? buildItemNameUniquenessClaims(input.rule, obligations, 'automation-binding', input.canonicalCaseDocument, input.automationBindingCaseIds, diagnostics)
    : SINGLE_CASE_FULL_COVERAGE[input.rule.ruleId]
      ? buildSingleCaseClaims(input.rule, obligations, 'automation-binding', input.canonicalCaseDocument, input.automationBindingCaseIds, diagnostics)
      : buildTraceableLinkedCaseClaims(input.rule, obligations, 'automation-binding', input.canonicalCaseDocument, input.automationBindingCaseIds, diagnostics);
  const businessObligations = obligations.filter((item) => item.layer === 'business-behavior');
  const allClaims = [...testCaseClaims, ...automationClaims];
  // Evidence producers may only know the case-level receipt.  Bind the
  // receipt to the exact obligations claimed by that case here; this keeps
  // execution verification obligation-scoped and prevents one case from
  // falsely satisfying another case's assertions.
  const evidence = (input.currentEvidence ?? []).map((item) => {
    const claimed = allClaims
      .filter((claim) => claim.caseId === item.caseId)
      .flatMap((claim) => claim.obligationIds);
    return { ...item, verifiedObligationIds: [...new Set(item.verifiedObligationIds.length > 0 ? item.verifiedObligationIds : claimed)] };
  });

  const businessAssessment = assessBusinessRuleCoverage({
    ruleId: input.rule.ruleId,
    obligations: businessObligations,
    claims: testCaseClaims,
    currentIdentities: input.currentIdentities,
    evidence,
  });
  const automationAssessment = assessBusinessRuleCoverage({
    ruleId: input.rule.ruleId,
    obligations,
    claims: automationClaims,
    currentIdentities: input.currentIdentities,
    evidence,
  });
  const combinedAssessment = assessBusinessRuleCoverage({
    ruleId: input.rule.ruleId,
    obligations,
    claims: [...testCaseClaims, ...automationClaims],
    currentIdentities: input.currentIdentities,
    evidence,
  });
  const missingIds = new Set(combinedAssessment.missingObligationIds);
  return {
    ruleId: input.rule.ruleId,
    statement: input.rule.statement,
    linkedCaseIds: [...input.rule.linkedCaseIds],
    obligations,
    testCaseClaims,
    automationClaims,
    businessAssessment,
    automationAssessment,
    combinedAssessment,
    missingObligations: obligations
      .filter((item) => missingIds.has(item.obligationId))
      .map((item) => ({ obligationId: item.obligationId, dimension: item.dimension, statement: item.statement })),
    diagnostics: unique([
      ...diagnostics,
      ...businessAssessment.diagnostics,
      ...automationAssessment.diagnostics,
      ...combinedAssessment.diagnostics,
    ]),
  };
}

function buildAtomicObligations(rule: ProductCenterFormalRule): BusinessRuleCoverageObligation[] {
  const sourceIds = rule.sourceRegistry.map((item) => item.sourceId);
  const result: BusinessRuleCoverageObligation[] = [];
  const add = (
    dimension: BusinessRuleCoverageObligation['dimension'],
    statement: string,
    index: number,
    assertionSurfaceIds: string[] = [],
    layer: BusinessRuleCoverageObligation['layer'] = 'business-behavior',
    applicability: BusinessRuleCoverageObligation['applicability'] = 'required',
  ) => result.push({
    obligationId: `${rule.ruleId}:${dimension}:${index}`,
    ruleId: rule.ruleId,
    dimension,
    layer,
    statement,
    applicability,
    sourceIds,
    assertionSurfaceIds,
    ...(applicability === 'not-applicable' ? {
      dispositionEvidence: { sourceIds, approvedBy: 'formal-rule-lifecycle', rationale: '正式规则明确 cleanup.required=false。' },
    } : {}),
  });
  (rule.semantics.preconditions ?? []).forEach((item, index) => add('precondition', item, index + 1));
  (rule.semantics.actions ?? []).forEach((item, index) => add('operation', item, index + 1));
  (rule.semantics.stateTransitions ?? []).forEach((item, index) => add(
    'state-transition', `${item.from} --${item.action}--> ${item.to}`, index + 1,
  ));
  (rule.semantics.constraints ?? []).forEach((item, index) => add('constraint', item, index + 1));
  (rule.semantics.outcomes ?? []).forEach((item, index) => add('outcome', item, index + 1));
  (rule.semantics.sideEffects ?? []).forEach((item, index) => add('side-effect', item, index + 1));
  (rule.semantics.assertionSurfaces ?? []).forEach((item, index) => add(
    'assertion-surface', item.terminalCondition, index + 1, [item.assertionId],
  ));
  if (rule.semantics.cleanup) {
    const cleanup = rule.semantics.cleanup;
    const statement = cleanup.required
      ? `执行 ${cleanup.strategyId ?? '已登记清理策略'}；API零残留=${cleanup.apiZeroResidueRequired}；UI零残留=${cleanup.uiZeroResidueRequired}`
      : '本规则不产生需清理的持久化测试数据。';
    add('cleanup', statement, 1, [], 'execution-safety', cleanup.required ? 'required' : 'not-applicable');
  }
  return result;
}

function buildItemNameUniquenessObligations(rule: ProductCenterFormalRule): BusinessRuleCoverageObligation[] {
  const sourceIds = rule.sourceRegistry.map((item) => item.sourceId);
  const definitions: Array<{
    key: string;
    dimension: BusinessRuleCoverageObligation['dimension'];
    statement: string;
    assertionSurfaceIds?: string[];
    layer?: BusinessRuleCoverageObligation['layer'];
  }> = [
    { key: 'merchant-context', dimension: 'precondition', statement: '所有判重场景固定在同一商户上下文。' },
    { key: 'standard-same-category', dimension: 'condition-partition', statement: '标准商品在相同分类下与既有标准商品同名时创建失败。', assertionSurfaceIds: ['item-name-duplicate:save-feedback'] },
    { key: 'standard-different-parent', dimension: 'scope-variant', statement: '标准商品改变一级分类后，同类型同名仍创建失败。', assertionSurfaceIds: ['item-name-duplicate:category-independence'] },
    { key: 'standard-different-child', dimension: 'scope-variant', statement: '标准商品改变二级分类后，同类型同名仍创建失败。', assertionSurfaceIds: ['item-name-duplicate:category-independence'] },
    { key: 'package-same-type', dimension: 'scope-variant', statement: '套餐商品在同一商户的套餐商品类型内同名时创建失败，分类不改变结论。', assertionSurfaceIds: ['item-name-duplicate:save-feedback'] },
    { key: 'addon-same-type', dimension: 'scope-variant', statement: '加料商品在同一商户的加料商品类型内同名时创建失败。', assertionSurfaceIds: ['item-name-duplicate:save-feedback'] },
    { key: 'standard-addon-cross-type', dimension: 'scope-variant', statement: '标准商品与加料商品可以同名并同时保留，创建和编辑改名均适用。', assertionSurfaceIds: ['item-name-duplicate:record-count', 'item-name-duplicate:cross-type-rename'] },
    { key: 'package-addon-cross-type', dimension: 'scope-variant', statement: '套餐商品与加料商品可以同名并同时保留，创建和编辑改名均适用。', assertionSurfaceIds: ['item-name-duplicate:record-count', 'item-name-duplicate:cross-type-rename'] },
    { key: 'standard-package-cross-type', dimension: 'scope-variant', statement: '标准商品与套餐商品属于共享名称空间，跨类型同名创建或编辑失败。', assertionSurfaceIds: ['item-name-duplicate:standard-package-cross-type'] },
    { key: 'cross-type-rename', dimension: 'outcome', statement: '标准商品或套餐商品改名为已有加料商品名称时允许保存，且新名称在 UI/API 和列表中持久化。', assertionSurfaceIds: ['item-name-duplicate:cross-type-rename'] },
    { key: 'duplicate-feedback', dimension: 'assertion-surface', statement: '同类型同名保存失败时展示名称重复反馈。', assertionSurfaceIds: ['item-name-duplicate:save-feedback'] },
    { key: 'duplicate-zero-record', dimension: 'side-effect', statement: '同类型同名失败场景不会新增重复记录。', assertionSurfaceIds: ['item-name-duplicate:record-count'] },
    { key: 'cross-type-records-preserved', dimension: 'outcome', statement: '允许跨类型同名时，两条不同类型商品均可查询。', assertionSurfaceIds: ['item-name-duplicate:record-count'] },
    { key: 'cleanup', dimension: 'cleanup', statement: '清理本规则场景创建的商品，并按 API/UI 要求验证零残留。', layer: 'execution-safety' },
  ];
  return definitions.map((item) => ({
    obligationId: `${rule.ruleId}:${item.key}`,
    ruleId: rule.ruleId,
    dimension: item.dimension,
    layer: item.layer ?? 'business-behavior',
    statement: item.statement,
    applicability: 'required',
    sourceIds,
    assertionSurfaceIds: item.assertionSurfaceIds ?? [],
  }));
}

function buildSingleCaseClaims(
  rule: ProductCenterFormalRule,
  obligations: BusinessRuleCoverageObligation[],
  kind: BusinessRuleCoverageCaseClaim['kind'],
  canonicalCaseDocument: string,
  automationBindingCaseIds: ReadonlySet<string> | undefined,
  diagnostics: string[],
): BusinessRuleCoverageCaseClaim[] {
  const caseId = SINGLE_CASE_FULL_COVERAGE[rule.ruleId];
  if (!caseId || !hasCanonicalCase(canonicalCaseDocument, caseId)) {
    diagnostics.push(`CANONICAL_CASE_NOT_FOUND:${rule.ruleId}:${caseId ?? 'unmapped'}`);
    return [];
  }
  if (kind === 'automation-binding' && !automationBindingCaseIds?.has(caseId)) {
    diagnostics.push(`AUTOMATION_BINDING_NOT_FOUND:${rule.ruleId}:${caseId}`);
    return [];
  }
  const coveredObligations = kind === 'test-case'
    ? obligations.filter((item) => item.layer === 'business-behavior')
    : obligations;
  return [coverageClaim(rule.ruleId, caseId, kind, coveredObligations.map((item) => item.obligationId))];
}

function buildTraceableLinkedCaseClaims(
  rule: ProductCenterFormalRule,
  obligations: BusinessRuleCoverageObligation[],
  kind: BusinessRuleCoverageCaseClaim['kind'],
  canonicalCaseDocument: string,
  automationBindingCaseIds: ReadonlySet<string> | undefined,
  diagnostics: string[],
): BusinessRuleCoverageCaseClaim[] {
  const caseSections = new Map(rule.linkedCaseIds.map((caseId) => [caseId, extractCanonicalCase(canonicalCaseDocument, caseId)]));
  const obligationIdsByCase = new Map<string, string[]>();
  for (const obligation of obligations) {
    if (obligation.applicability === 'not-applicable') continue;
    const matchingCaseIds = rule.linkedCaseIds.filter((caseId) => {
      if (kind === 'automation-binding' && !automationBindingCaseIds?.has(caseId)) return false;
      const section = caseSections.get(caseId);
      // linkedCaseIds already come from the approved lifecycle projection or
      // an explicit formal binding.  Older canonical cases may predate the
      // BR identifier, so exact obligation text is the semantic proof here.
      if (!section) return false;
      return normalizeCoverageText(section).includes(normalizeCoverageText(obligation.statement));
    });
    if (matchingCaseIds.length === 0) {
      diagnostics.push(`EXPLICIT_OBLIGATION_CASE_CLAIM_NOT_FOUND:${rule.ruleId}:${obligation.obligationId}:${kind}`);
      continue;
    }
    for (const caseId of matchingCaseIds) {
      obligationIdsByCase.set(caseId, [...(obligationIdsByCase.get(caseId) ?? []), obligation.obligationId]);
    }
  }
  return [...obligationIdsByCase.entries()].map(([caseId, obligationIds]) => (
    coverageClaim(rule.ruleId, caseId, kind, unique(obligationIds))
  ));
}

function extractCanonicalCase(document: string, caseId: string): string | null {
  const escaped = escapeRegExp(caseId);
  return document.match(new RegExp(`### 用例编号：${escaped}[\\s\\S]*?(?=\\n### 用例编号：|$)`, 'u'))?.[0] ?? null;
}

function normalizeCoverageText(value: string): string {
  return stripMarkdown(value).replace(/\s+/gu, '').replace(/[，。；：、“”‘’（）()]/gu, '');
}

function buildItemNameUniquenessClaims(
  rule: ProductCenterFormalRule,
  obligations: BusinessRuleCoverageObligation[],
  kind: BusinessRuleCoverageCaseClaim['kind'],
  canonicalCaseDocument: string,
  automationBindingCaseIds: ReadonlySet<string> | undefined,
  diagnostics: string[],
): BusinessRuleCoverageCaseClaim[] {
  const casesByKey: Record<string, string[]> = {
    'merchant-context': rule.linkedCaseIds,
    'standard-same-category': ['TC-ITEM-STD-013', 'TC-ITEM-STD-044'],
    'standard-different-parent': ['TC-ITEM-STD-014'],
    'standard-different-child': ['TC-ITEM-STD-011', 'TC-ITEM-STD-012'],
    'package-same-type': ['TC-ITEM-PKG-024', 'TC-ITEM-PKG-025'],
    'addon-same-type': ['TC-ITEM-ADD-014'],
    'standard-addon-cross-type': ['TC-ITEM-ADD-015'],
    'package-addon-cross-type': ['TC-ITEM-PKG-078'],
    'standard-package-cross-type': ['TC-ITEM-PKG-079'],
    'cross-type-rename': ['TC-ITEM-ADD-015', 'TC-ITEM-PKG-078'],
    'duplicate-feedback': ['TC-ITEM-STD-011', 'TC-ITEM-STD-012', 'TC-ITEM-STD-013', 'TC-ITEM-STD-014', 'TC-ITEM-STD-044', 'TC-ITEM-PKG-024', 'TC-ITEM-PKG-025', 'TC-ITEM-PKG-079', 'TC-ITEM-ADD-014'],
    'duplicate-zero-record': ['TC-ITEM-STD-012', 'TC-ITEM-PKG-079'],
    'cross-type-records-preserved': ['TC-ITEM-ADD-015'],
    cleanup: rule.linkedCaseIds,
  };
  const claims: BusinessRuleCoverageCaseClaim[] = [];
  for (const obligation of obligations) {
    if (kind === 'test-case' && obligation.layer !== 'business-behavior') continue;
    const key = obligation.obligationId.slice(`${rule.ruleId}:`.length);
    for (const caseId of casesByKey[key] ?? []) {
      if (!hasCanonicalCase(canonicalCaseDocument, caseId)) {
        diagnostics.push(`CANONICAL_CASE_NOT_FOUND:${rule.ruleId}:${caseId}`);
        continue;
      }
      if (kind === 'automation-binding' && !automationBindingCaseIds?.has(caseId)) {
        diagnostics.push(`AUTOMATION_BINDING_NOT_FOUND:${rule.ruleId}:${caseId}`);
        continue;
      }
      claims.push(coverageClaim(rule.ruleId, caseId, kind, [obligation.obligationId]));
    }
  }
  return claims;
}

function coverageClaim(
  ruleId: string,
  caseId: string,
  kind: BusinessRuleCoverageCaseClaim['kind'],
  obligationIds: string[],
): BusinessRuleCoverageCaseClaim {
  return {
    claimId: `${kind}:${ruleId}:${caseId}:${obligationIds.join('+')}`,
    ruleId,
    caseId,
    kind,
    obligationIds,
    sourceIds: [
      `canonical-case:${caseId}`,
      ...(kind === 'automation-binding' ? [`automation-binding:${caseId}`] : []),
      `coverage-mapping:${ruleId}:${caseId}`,
    ],
  };
}

function hasCanonicalCase(document: string, caseId: string): boolean {
  return document.includes(`### 用例编号：${caseId}`);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
