import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterBusinessRuleLifecycleSnapshot,
  type ProductCenterAutomationBinding,
  type ProductCenterBusinessRuleLifecycleSnapshot,
  type ProductCenterFormalRuleBinding,
  type ProductCenterRuleConfirmation,
  type ProductCenterCanonicalCaseForRuleAudit,
} from '../adapters/product-center/product-center-business-rule-lifecycle-adapter';
import { createHash } from 'node:crypto';
import type { BusinessRuleScope, BusinessRuleSemantics, BusinessRuleVerificationStatus } from '../automation/system-test/business-rule-lifecycle';

const projectRoot = path.resolve(__dirname, '..');
const formalBindingsPath = 'contracts/product-center/business-rules/product-center-item-formal-rule-bindings.json';
const confirmationsPath = 'contracts/product-center/reviews/product-center-item-rule-confirmations.json';
const automationBindingsPath = 'contracts/product-center/test-cases/canonical/product-center-item-authoritative-automation-bindings.json';
const supplementalAutomationBindingsPath = 'contracts/product-center/test-plan-additional-automation-bindings.json';
const groupImplementationManifestPath = 'contracts/product-center/group/product-center-group-case-fingerprints.json';
const conflictAssessmentPath = 'contracts/product-center/business-rules/product-center-business-rule-conflict-assessment.json';
const promotionDecisionPath = path.resolve(
  projectRoot,
  '../deliverables/test-plan-governance/product-center-document-rule-promotion-decisions.json',
);
const authoritativeRuleDocumentPath = path.resolve(projectRoot, '../Merchant Center Info/商品中心业务规则.md');
const outputPath = path.join(
  projectRoot,
  'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
);

export function buildProductCenterBusinessRuleLifecycleSnapshotArtifact(): string {
  const snapshot = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
  writeJsonAtomic(outputPath, {
    ...snapshot,
    generatedAt: new Date().toISOString(),
    sourceArtifacts: {
      formalBindingsPath,
      confirmationsPath,
      automationBindingsPath,
      supplementalAutomationBindingsPath,
      groupImplementationManifestPath,
      promotionDecisionPath: path.relative(projectRoot, promotionDecisionPath).replace(/\\/g, '/'),
      authoritativeRuleDocumentPath: path.relative(projectRoot, authoritativeRuleDocumentPath).replace(/\\/g, '/'),
    },
  });
  return outputPath;
}

export function loadCurrentProductCenterBusinessRuleLifecycleSnapshot(): ProductCenterBusinessRuleLifecycleSnapshot {
  const formalBindings = readJson<{
    schemaVersion: string;
    collectionId: string;
    bindings: ProductCenterFormalRuleBinding[];
  }>(formalBindingsPath);
  const confirmations = readJson<{
    schemaVersion: string;
    collectionId: string;
    sourceRole?: string;
    confirmations: ProductCenterRuleConfirmation[];
  }>(confirmationsPath);
  const automationBindings = readJson<{
    schemaVersion: string;
    collectionId: string;
    releaseFingerprint?: string;
    bindings: ProductCenterAutomationBinding[];
  }>(automationBindingsPath);
  const supplementalAutomationBindings = readJson<{ bindings?: ProductCenterAutomationBinding[] }>(supplementalAutomationBindingsPath);
  const groupImplementationManifest = readJson<{
    cases?: Array<{ caseId: string; implementationFingerprint?: string; dependencyFiles?: string[] }>;
  }>(groupImplementationManifestPath);
  const groupAutomationBindings: ProductCenterAutomationBinding[] = (groupImplementationManifest.cases ?? []).map((item) => ({
    caseId: item.caseId,
    scriptPath: item.dependencyFiles?.find((filePath) => filePath.endsWith('.spec.ts')),
    runtimeReadiness: item.implementationFingerprint ? 'ready' : 'blocked',
  }));
  const conflictAssessments = readJson<{
    assessedAt: string;
    source: string;
    rules: Array<{
      ruleId: string;
      status: 'assessed-no-conflict' | 'assessed-conflict' | 'not-assessed';
      conflictsWithRuleIds: string[];
      precedence: number | null;
    }>;
  }>(conflictAssessmentPath);
  const canonicalCaseSections = loadCanonicalCaseSections(path.resolve(
    projectRoot,
    '../Merchant Center Info/00-待转换测试方案/用例库',
  ));
  const canonicalCases = loadCanonicalCasesForRuleAudit(canonicalCaseSections);
  const approvedProjection = loadApprovedDocumentRuleProjection(canonicalCaseSections);
  return buildProductCenterBusinessRuleLifecycleSnapshot({
    formalBindings: {
      ...formalBindings,
      sourcePath: formalBindingsPath,
      bindings: mergeByRuleId(formalBindings.bindings, approvedProjection.bindings),
    },
    confirmations: {
      ...confirmations,
      sourcePath: confirmationsPath,
      confirmations: mergeByRuleId(confirmations.confirmations, approvedProjection.confirmations),
    },
    automationBindings: {
      ...automationBindings,
      sourcePath: automationBindingsPath,
      bindings: [
        ...automationBindings.bindings,
        ...(supplementalAutomationBindings.bindings ?? []),
        ...groupAutomationBindings,
      ],
    },
    conflictAssessments,
    canonicalCases,
  });
}

type PromotionDecisionRule = {
  ruleId: string;
  statement: string;
  moduleSection: string;
  linkedCaseIds: string[];
  verificationStatus: Extract<BusinessRuleVerificationStatus, 'verified' | 'pending-review' | 'revalidation-required'>;
  sourceRuleFingerprint: string;
  scope?: BusinessRuleScope;
  semantics?: BusinessRuleSemantics;
};

type DocumentRulePromotionDecision = {
  schemaVersion: '1.0.0';
  decisionId: string;
  sourcePreflightFingerprint: string;
  status: 'approved' | 'partial' | 'rejected';
  approvedBy: string;
  approvedAt: string;
  effectiveVersion: string;
  approvedPackageIds: string[];
  approvedRuleIds: string[];
  revokedRuleIds?: string[];
  approvedRules: PromotionDecisionRule[];
};

type CanonicalCaseSection = {
  caseId: string;
  section: string;
  sourceRuleIds: string[];
  preconditions: string[];
  actions: string[];
  outcomes: string[];
};

function loadApprovedDocumentRuleProjection(canonicalCases: Map<string, CanonicalCaseSection>): {
  bindings: ProductCenterFormalRuleBinding[];
  confirmations: ProductCenterRuleConfirmation[];
} {
  if (!fs.existsSync(promotionDecisionPath)) return { bindings: [], confirmations: [] };
  const decision = JSON.parse(fs.readFileSync(promotionDecisionPath, 'utf8')) as DocumentRulePromotionDecision;
  if (decision.schemaVersion !== '1.0.0' || decision.status === 'rejected') return { bindings: [], confirmations: [] };
  if (!decision.approvedBy?.trim() || !Number.isFinite(Date.parse(decision.approvedAt)) || !decision.effectiveVersion?.trim()) {
    throw new Error('DOCUMENT_RULE_PROMOTION_DECISION_INCOMPLETE');
  }
  const revoked = new Set(decision.revokedRuleIds ?? []);
  const approvedRuleIds = unique(decision.approvedRuleIds).filter((ruleId) => !revoked.has(ruleId));
  const approvedRules = decision.approvedRules.filter((rule) => approvedRuleIds.includes(rule.ruleId));
  if (approvedRules.length !== approvedRuleIds.length
    || unique(approvedRules.map((rule) => rule.ruleId)).length !== approvedRules.length) {
    throw new Error('DOCUMENT_RULE_PROMOTION_RULE_SET_MISMATCH');
  }
  const formalTable = readFormalRuleTable(authoritativeRuleDocumentPath);
  const bindings: ProductCenterFormalRuleBinding[] = [];
  const confirmations: ProductCenterRuleConfirmation[] = [];
  for (const rule of approvedRules) {
    const current = formalTable.get(rule.ruleId);
    const sourceValue = {
      ruleId: rule.ruleId,
      statement: rule.statement,
      linkedCaseIds: unique(rule.linkedCaseIds),
      effectiveVersion: decision.effectiveVersion,
    };
    if (sha256(stableJson(sourceValue)) !== rule.sourceRuleFingerprint) {
      throw new Error(`DOCUMENT_RULE_PROMOTION_SOURCE_FINGERPRINT_INVALID:${rule.ruleId}`);
    }
    if (!current || current.statement !== rule.statement || current.effectiveVersion !== decision.effectiveVersion) {
      throw new Error(`DOCUMENT_RULE_PROMOTION_SOURCE_STALE:${rule.ruleId}`);
    }
    if (!current.linkedCaseIds.every((caseId) => rule.linkedCaseIds.includes(caseId))) {
      throw new Error(`DOCUMENT_RULE_PROMOTION_CASE_LINK_STALE:${rule.ruleId}`);
    }
    const semantics = rule.semantics ?? buildSemanticsFromCanonicalCases(rule, canonicalCases);
    const scope = rule.scope ?? defaultScopeForRule(rule);
    const sourcePath = path.relative(projectRoot, promotionDecisionPath).replace(/\\/g, '/');
    const confirmationId = `document-rule-promotion:${decision.decisionId}:${rule.ruleId}`;
    bindings.push({
      bindingId: `formal-binding:${rule.ruleId}`,
      ruleId: rule.ruleId,
      module: scope.entityTypes[0],
      statement: rule.statement,
      confirmationId,
      effectiveVersion: decision.effectiveVersion,
      scope,
      sourcePath,
      governance: {
        changedAt: decision.approvedAt,
        effectiveFrom: decision.effectiveVersion,
        changeReason: decision.decisionId,
        timeEvidenceStatus: 'partial',
      },
    });
    confirmations.push({
      confirmationId,
      ruleId: rule.ruleId,
      confirmedBy: decision.approvedBy,
      confirmedAt: decision.approvedAt,
      sourceType: 'direct-user-confirmation',
      statement: rule.statement,
      effectiveVersion: decision.effectiveVersion,
      linkedCanonicalIds: unique(rule.linkedCaseIds),
      semantics,
      verificationStatus: rule.verificationStatus,
      sourcePath,
      revision: 1,
      previousRuleFingerprint: null,
      semanticChangeRequiresRerun: rule.verificationStatus !== 'verified',
      governance: {
        changedAt: decision.approvedAt,
        effectiveFrom: decision.effectiveVersion,
        lastVerifiedAt: rule.verificationStatus === 'verified' ? decision.approvedAt : null,
        changeReason: decision.decisionId,
        timeEvidenceStatus: rule.verificationStatus === 'verified' ? 'complete' : 'partial',
      },
    });
  }
  return { bindings, confirmations };
}

function buildSemanticsFromCanonicalCases(
  rule: PromotionDecisionRule,
  canonicalCases: Map<string, CanonicalCaseSection>,
): BusinessRuleSemantics {
  const cases = rule.linkedCaseIds.map((caseId) => canonicalCases.get(caseId)).filter((item): item is CanonicalCaseSection => Boolean(item));
  const outcomes = orderedUnique(cases.flatMap((item) => item.outcomes));
  return {
    preconditions: orderedUnique(cases.flatMap((item) => item.preconditions)),
    entities: defaultScopeForRule(rule).entityTypes,
    actions: orderedUnique(cases.flatMap((item) => item.actions)),
    stateTransitions: [],
    // The approval statement remains the authoritative rule.  Do not invent a
    // second case-level constraint unless a canonical case states it verbatim.
    constraints: [],
    outcomes,
    sideEffects: [],
    assertionSurfaces: outcomes.map((outcome, index) => ({
      assertionId: `${rule.ruleId.toLowerCase()}:canonical-outcome-${index + 1}`,
      fieldId: `canonical.expectedResult.${index + 1}`,
      channel: 'ui' as const,
      authority: 'canonical-formal-test-case',
      terminalCondition: outcome,
    })),
    cleanup: {
      policyStatus: rule.verificationStatus === 'verified' ? 'verified' : 'unknown',
      required: false,
      apiZeroResidueRequired: false,
      uiZeroResidueRequired: false,
    },
  };
}

function defaultScopeForRule(rule: Pick<PromotionDecisionRule, 'ruleId' | 'moduleSection'>): BusinessRuleScope {
  const entityType = rule.ruleId.startsWith('BR-IMG-') ? 'image'
    : rule.ruleId.startsWith('BR-GRP-') ? 'item-group'
      : rule.ruleId.startsWith('BR-FMT-') ? 'name-field' : 'item';
  return {
    applicationId: 'merchant-center',
    businessDomainId: 'product-center-item',
    entityTypes: [entityType],
    operationKeys: [`${entityType}.create`, `${entityType}.update`, `${entityType}.read`],
    channels: ['ui', 'api'],
  };
}

function readFormalRuleTable(filePath: string): Map<string, { statement: string; effectiveVersion: string; linkedCaseIds: string[] }> {
  const table = new Map<string, { statement: string; effectiveVersion: string; linkedCaseIds: string[] }>();
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
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

function extractCaseIdsFromTableCell(value: string): string[] {
  const result: string[] = [];
  for (const match of value.matchAll(/(TC-[A-Z0-9]+(?:-[A-Z0-9]+)*-)(\d{3}(?:\/\d{3})*)/g)) {
    result.push(...match[2].split('/').map((suffix) => `${match[1]}${suffix}`));
  }
  return unique(result);
}

function mergeByRuleId<T extends { ruleId: string }>(base: readonly T[], added: readonly T[]): T[] {
  const byRuleId = new Map(base.map((item) => [item.ruleId, item]));
  for (const item of added) byRuleId.set(item.ruleId, item);
  return [...byRuleId.values()];
}

/**
 * The formal Markdown plan is the canonical case text for this project.  The
 * audit input is intentionally small and immutable: it carries only a case
 * fingerprint, approval and a conservative semantic comparison.  Missing
 * correction rows can therefore be auto-validated without asking a person to
 * retype already-approved case metadata; a contradiction remains a real
 * semantic review item.
 */
function loadCanonicalCasesForRuleAudit(
  canonicalSections: Map<string, CanonicalCaseSection>,
): ProductCenterCanonicalCaseForRuleAudit[] {
  const fullReviewPath = path.join(projectRoot, 'contracts/product-center/test-cases/canonical/product-center-item-full-review.json');
  const approved = new Set<string>();
  if (fs.existsSync(fullReviewPath)) {
    const review = readJson<{ entries?: Array<{ caseId: string; decision: string }> }>(
      'contracts/product-center/test-cases/canonical/product-center-item-full-review.json',
    );
    for (const entry of review.entries ?? []) if (entry.decision === 'approved') approved.add(entry.caseId);
  }
  const results: ProductCenterCanonicalCaseForRuleAudit[] = [];
  for (const canonical of canonicalSections.values()) {
    results.push({
      caseId: canonical.caseId,
      caseFingerprint: sha256(canonical.section),
      sourceVerified: true,
      // A rule reference in the canonical source is an explicit semantic
      // association.  Older item cases may additionally inherit approval
      // from the historical full-review ledger.
      canonicalApproved: canonical.sourceRuleIds.length > 0 || approved.size === 0 || approved.has(canonical.caseId),
      sourceRuleIds: canonical.sourceRuleIds,
      semanticComparison: compareCanonicalSemantics(canonical.caseId, canonical.section),
    });
  }
  return results.sort((left, right) => left.caseId.localeCompare(right.caseId));
}

function loadCanonicalCaseSections(root: string): Map<string, CanonicalCaseSection> {
  const sections = new Map<string, CanonicalCaseSection>();
  const sectionPattern = /### 用例编号：([^\r\n]+)[\s\S]*?(?=\r?\n### 用例编号：|$)/g;
  for (const formalPath of listFormalCaseFiles(root)) {
    const text = fs.readFileSync(formalPath, 'utf8');
    for (const match of text.matchAll(sectionPattern)) {
      const caseId = match[1].trim();
      if (!/^TC-[A-Z0-9-]+-\d{3}$/.test(caseId)) continue;
      const section = match[0];
      const sourceRuleIds = unique(section.match(/BR-[A-Z0-9]+(?:-[A-Z0-9]+)*/g) ?? []);
      // Keep the first canonical occurrence, matching the coverage parser.
      // Duplicate IDs remain a separate asset-quality problem and must not
      // silently change the semantic source by last-write-wins ordering.
      if (sections.has(caseId)) continue;
      sections.set(caseId, {
        caseId,
        section,
        sourceRuleIds,
        preconditions: readNumberedSection(section, '前置条件'),
        actions: readNumberedSection(section, '测试步骤'),
        outcomes: readNumberedSection(section, '预期结果'),
      });
    }
  }
  return sections;
}

function readNumberedSection(section: string, heading: string): string[] {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = section.match(new RegExp(`(?:^|\\n)${escaped}：?\\s*\\n([\\s\\S]*?)(?=\\n(?:前置条件|测试步骤|预期结果|### )：?|$)`, 'u'));
  if (!match) return [];
  return match[1].split(/\r?\n/)
    .map((line) => line.match(/^\s*\d+(?:\.\d+)?\.\s*(.+)$/u)?.[1]?.trim() ?? '')
    .filter(Boolean);
}

function listFormalCaseFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listFormalCaseFiles(fullPath);
    return entry.isFile() && /正式测试用例\.md$/u.test(entry.name) ? [fullPath] : [];
  }).sort();
}

function compareCanonicalSemantics(caseId: string, section: string): 'matched' | 'mismatch' | 'unknown' {
  const normalized = section
    .replace(/^用例标题：[^\r\n]*/m, '')
    .replace(/\s+/g, ' ');
  // A source that asserts both that the same-name operation succeeds and
  // that it is rejected is a semantic conflict.  It must be reviewed, not
  // silently normalised into a rule.
  if (/(?:同名|名称重复)/.test(normalized)
    && /(?:保存失败|创建失败|不允许|不可)/.test(normalized)
    && /(?:保存成功|创建成功|允许同名)/.test(normalized)) return 'mismatch';
  if (/(?:同名|名称重复|同名提示)/.test(normalized)
    && /(?:BITEM-7014|BITEM-7010|失败|不允许|不可|禁止|重复)/.test(normalized)) return 'matched';
  if (/(?:同名|名称重复|重复)/.test(normalized) && /(?:失败|不允许|不可|禁止)/.test(normalized)) return 'matched';
  if (/(?:同名|名称重复|重复)/.test(normalized) && /(?:成功|允许)/.test(normalized)) return 'matched';
  return 'unknown';
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }

function unique(items: readonly string[]): string[] { return [...new Set(items)].sort(); }

function orderedUnique(items: readonly string[]): string[] { return [...new Set(items.map((item) => item.trim()).filter(Boolean))]; }

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

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')) as T;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    process.stdout.write(`${buildProductCenterBusinessRuleLifecycleSnapshotArtifact()}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
