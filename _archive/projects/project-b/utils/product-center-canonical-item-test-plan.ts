import { createHash } from 'node:crypto';
import fs from 'node:fs';
import AdmZip from 'adm-zip';
import type {
  ProductCenterRuleExecutionChannel,
  ProductCenterRuleRegistry,
} from './product-center-rule-evidence-ledger';

type XmindTopic = {
  id?: string;
  title?: string;
  children?: Record<string, XmindTopic[] | XmindTopic | undefined>;
};

type XmindSheet = { rootTopic?: XmindTopic };

export type ProductCenterCanonicalSource = {
  kind: 'xmind' | 'prd' | 'business-rule' | 'page-observation';
  sourceId: string;
  sourceRole: 'test-plan-skeleton' | 'prd-functional-scope' | 'legacy-rule-baseline' | 'product-confirmed-rule' | 'current-page-fact';
  acceptanceEligible: boolean;
  citation: string;
  verified: boolean;
  sourcePath?: string;
  fingerprint?: string;
  matchedText?: string;
};

export type ProductCenterClaimEvidenceBinding = {
  sourceId: string;
  sourceRole: ProductCenterCanonicalSource['sourceRole'];
  contribution: 'scenario-skeleton' | 'functional-scope' | 'rule-clue' | 'rule-authority' | 'technical-fact';
  acceptanceEligible: boolean;
  verified: boolean;
};

export type ProductCenterXmindItemCandidate = {
  nodeId: string;
  title: string;
  modulePath: string[];
  path: string[];
  precondition: string;
  steps: string;
  expected: string;
  diagnostics: string[];
};

export type ProductCenterXmindItemPlan = {
  schemaVersion: '1.0.0';
  sourceKind: 'xmind';
  summary: {
    nodes: number;
    leaves: number;
    detailedCandidates: number;
    incompleteCandidates: number;
  };
  candidates: ProductCenterXmindItemCandidate[];
  blocked: ProductCenterXmindItemCandidate[];
};

export type ProductCenterCanonicalClaim = {
  id: string;
  kind: 'precondition' | 'action' | 'expectation';
  text: string;
  sourceIds: string[];
  candidateRuleIds: string[];
  formalRuleBindingIds: string[];
  legacyRuleBindingIds: string[];
  evidenceBindings: ProductCenterClaimEvidenceBinding[];
  executionEvidenceIds: string[];
};

export type ProductCenterCanonicalCase = {
  canonicalId: string;
  nodeId: string;
  title: string;
  modulePath: string[];
  route: string;
  status: 'review-required' | 'ready-for-technical-binding';
  priority: 'unassigned' | 'P0' | 'P1' | 'P2';
  preconditions: string[];
  actions: string[];
  expectedResults: string[];
  claims: ProductCenterCanonicalClaim[];
  claimIds: string[];
  ruleIds: string[];
  executionChannel: ProductCenterRuleExecutionChannel;
  sources: ProductCenterCanonicalSource[];
  businessRuleAssessment: {
    disposition: 'legacy-aligned' | 'legacy-partial' | 'legacy-discrepancy' | 'unmapped';
    note: string;
  };
  reviewRequired: string[];
  diagnostics: string[];
  supersededDiagnostics: string[];
  capabilityIds: ['navigation.sidebar.open'];
  assertionAdapterIds: ['canonical.manual-review'];
};

export type ProductCenterCanonicalBusinessRuleAssessment = {
  nodeId: string;
  disposition: 'legacy-aligned' | 'legacy-partial' | 'legacy-discrepancy';
  note: string;
  sources: ProductCenterCanonicalSource[];
};

export type ProductCenterCanonicalCaseOverride = {
  canonicalId: string;
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  actions: string[];
  expectedResults: string[];
  supersededDiagnostics: string[];
};

export type ProductCenterCanonicalBlockedCase = {
  canonicalId: string;
  nodeId: string;
  title: string;
  path: string[];
  status: 'blocked';
  reason: 'INCOMPLETE_EXECUTION_CHAIN';
  diagnostics: string[];
};

export type ProductCenterCanonicalAutomationBinding = {
  canonicalId: string;
  nodeId: string;
  route: string;
  capabilityIds: string[];
  assertionAdapterIds: string[];
  sourceIds: string[];
  claimIds: string[];
  ruleIds: string[];
  executionChannel: ProductCenterRuleExecutionChannel;
  status: ProductCenterCanonicalCase['status'];
};

export type ProductCenterCanonicalRelease = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-canonical';
  status: 'review-required';
  fingerprint: string;
  namingPolicy: {
    format: 'TC-{MODULE}-{TYPE}-{SEQUENCE}';
    module: 'ITEM';
    allowedTypes: ['STD', 'PKG', 'ADD'];
    sequenceWidth: 3;
    xmindNodeIdInCanonicalId: false;
  };
  sourceFiles: Record<string, ProductCenterCanonicalSource>;
  summary: {
    nodes: number;
    leaves: number;
    candidates: number;
    generated: number;
    reviewRequired: number;
    blocked: number;
  };
  cases: ProductCenterCanonicalCase[];
  blocked: ProductCenterCanonicalBlockedCase[];
  automationBindings: ProductCenterCanonicalAutomationBinding[];
};

type TopicPathNode = { id: string; title: string };
type TopicRecord = {
  id: string;
  title: string;
  path: string[];
  pathNodes: TopicPathNode[];
};

export function parseProductCenterXmindItemPlan(content: Buffer): ProductCenterXmindItemPlan {
  const topics = readXmindTopics(content);
  const nodes: TopicRecord[] = [];
  const leaves: TopicRecord[] = [];

  function walk(topic: XmindTopic, parentPath: readonly TopicPathNode[]): void {
    const title = typeof topic.title === 'string' ? topic.title.trim() : '';
    const id = typeof topic.id === 'string' && topic.id.trim()
      ? topic.id.trim()
      : `anonymous-${nodes.length + 1}`;
    const currentPath = title ? [...parentPath, { id, title }] : [...parentPath];
    const children = topicChildren(topic);
    const path = currentPath.map((item) => item.title);
    nodes.push({ id, title, path, pathNodes: currentPath });
    if (children.length === 0) leaves.push({ id, title, path, pathNodes: currentPath });
    for (const child of children) walk(child, currentPath);
  }

  for (const sheet of topics) {
    if (sheet.rootTopic) walk(sheet.rootTopic, []);
  }

  const candidates: ProductCenterXmindItemCandidate[] = [];
  const blocked: ProductCenterXmindItemCandidate[] = [];
  for (const leaf of leaves) {
    const candidate = toCandidate(leaf);
    if (candidate) candidates.push(candidate);
    else blocked.push(incompleteCandidate(leaf));
  }

  return {
    schemaVersion: '1.0.0',
    sourceKind: 'xmind',
    summary: {
      nodes: nodes.length,
      leaves: leaves.length,
      detailedCandidates: candidates.length,
      incompleteCandidates: blocked.length,
    },
    candidates,
    blocked,
  };
}

export function buildProductCenterItemCanonicalRelease(input: {
  plan: ProductCenterXmindItemPlan;
  sourceFiles: {
    xmind: string;
    prd: string;
    businessRules: string;
  };
  observedRoutes: string[];
  businessRuleAssessments?: readonly ProductCenterCanonicalBusinessRuleAssessment[];
  canonicalIdsByNodeId?: Readonly<Record<string, string>>;
  ruleRegistry?: ProductCenterRuleRegistry;
  caseOverrides?: readonly ProductCenterCanonicalCaseOverride[];
}): ProductCenterCanonicalRelease {
  if (input.observedRoutes.length === 0 || input.observedRoutes.some((route) => !route.trim())) {
    throw new Error('canonical 商品方案必须提供至少一个已观测路由');
  }
  for (const [kind, sourcePath] of Object.entries(input.sourceFiles)) {
    if (!fs.existsSync(sourcePath)) throw new Error(`canonical 来源不存在：${kind}=${sourcePath}`);
  }

  const sourceFiles: Record<string, ProductCenterCanonicalSource> = {
    xmind: sourceRecord(
      'xmind',
      'test-plan-skeleton',
      input.sourceFiles.xmind,
      'XMind 商品节点树',
      false,
    ),
    prd: sourceRecord(
      'prd',
      'prd-functional-scope',
      input.sourceFiles.prd,
      'PRD 功能范围，待逐 Claim 映射',
      false,
    ),
    businessRules: sourceRecord(
      'business-rule',
      'legacy-rule-baseline',
      input.sourceFiles.businessRules,
      '旧 AIQA 规则基线，仅作覆盖分析线索',
      false,
    ),
  };
  const assessmentsByNodeId = new Map(
    (input.businessRuleAssessments ?? []).map((item) => [item.nodeId, item]),
  );
  const candidateRulesByClaimId = new Map<string, string[]>();
  const candidateRulesById = new Map(
    (input.ruleRegistry?.candidates ?? []).map((item) => [item.ruleId, item]),
  );
  const formalRulesByCanonicalId = new Map<string, ProductCenterRuleRegistry['formalRules']>();
  for (const rule of input.ruleRegistry?.formalRules ?? []) {
    for (const canonicalId of rule.linkedCanonicalIds ?? []) {
      const current = formalRulesByCanonicalId.get(canonicalId) ?? [];
      current.push(rule);
      formalRulesByCanonicalId.set(canonicalId, current);
    }
  }
  const overridesByCanonicalId = new Map(
    (input.caseOverrides ?? []).map((item) => [item.canonicalId, item]),
  );
  for (const rule of input.ruleRegistry?.candidates ?? []) {
    for (const claimId of [...rule.conditionClaims, ...rule.actionClaims, ...rule.outcomeClaims]) {
      const current = candidateRulesByClaimId.get(claimId) ?? [];
      current.push(rule.ruleId);
      candidateRulesByClaimId.set(claimId, current);
    }
  }

  const cases = input.plan.candidates.map((candidate, index) => {
    const mappedCanonicalId = input.canonicalIdsByNodeId?.[candidate.nodeId];
    if (mappedCanonicalId && !/^TC-ITEM-(?:STD|PKG|ADD)-\d{3}$/.test(mappedCanonicalId)) {
      throw new Error(`canonical 用例编号不符合命名规范：${mappedCanonicalId}`);
    }
    const canonicalId = mappedCanonicalId
      ?? `TC-ITEM-XMIND-${String(index + 1).padStart(3, '0')}-${candidate.nodeId}`;
    const sourceId = `xmind:${candidate.nodeId}`;
    const caseOverride = overridesByCanonicalId.get(canonicalId);
    const formalRules = formalRulesByCanonicalId.get(canonicalId) ?? [];
    const formalBindingIds = formalRules.map((rule) => rule.bindingId);
    const supersededDiagnostics = caseOverride?.supersededDiagnostics ?? [];
    const activeDiagnostics = candidate.diagnostics.filter((diagnostic) => (
      !supersededDiagnostics.includes(diagnostic)
    ));
    const preconditions = cleanList(candidate.precondition);
    const actions = caseOverride?.actions ?? cleanList(candidate.steps);
    const expectedResults = caseOverride?.expectedResults ?? cleanList(candidate.expected);
    const sourceClaims = [
      ...preconditions.map((text, claimIndex) => claim(canonicalId, 'precondition', claimIndex, text, sourceId)),
      ...actions.map((text, claimIndex) => claim(canonicalId, 'action', claimIndex, text, sourceId)),
      ...expectedResults.map((text, claimIndex) => claim(canonicalId, 'expectation', claimIndex, text, sourceId)),
    ];
    const claims = sourceClaims.map((item) => ({
      ...item,
      sourceIds: [
        ...item.sourceIds,
        ...formalRules.map((rule) => `product-confirmed-rule:${rule.ruleId}`),
      ],
      candidateRuleIds: [...(candidateRulesByClaimId.get(item.id) ?? [])],
      formalRuleBindingIds: [...formalBindingIds],
      legacyRuleBindingIds: [...new Set(
        (candidateRulesByClaimId.get(item.id) ?? []).flatMap((ruleId) =>
          candidateRulesById.get(ruleId)?.legacyRuleBindingIds ?? []),
      )],
      evidenceBindings: [{
        sourceId,
        sourceRole: 'test-plan-skeleton' as const,
        contribution: 'scenario-skeleton' as const,
        acceptanceEligible: false,
        verified: true,
      }, ...formalRules.map((rule) => ({
        sourceId: `product-confirmed-rule:${rule.ruleId}`,
        sourceRole: 'product-confirmed-rule' as const,
        contribution: 'rule-authority' as const,
        acceptanceEligible: true,
        verified: rule.authority.verified,
      }))],
      executionEvidenceIds: [],
    }));
    const ruleIds = [...new Set(claims.flatMap((item) => item.candidateRuleIds))];
    const ruleChannels = ruleIds.map((ruleId) => candidateRulesById.get(ruleId)?.executionChannel ?? 'none');
    const executionChannel: ProductCenterRuleExecutionChannel = ruleChannels.includes('none')
      ? 'none'
      : formalBindingIds.length > 0
          ? 'acceptance'
          : ruleChannels.includes('probe')
            ? 'probe'
            : 'none';
    const reviewRequired = [
      ...(caseOverride?.priority ? [] : ['PRIORITY_UNASSIGNED']),
      ...(mappedCanonicalId ? [] : ['CANONICAL_ID_MAPPING_REQUIRED']),
      ...(formalBindingIds.length === 0 ? ['FORMAL_SOURCE_MAPPING_REQUIRED'] : []),
      ...(assessmentsByNodeId.has(candidate.nodeId) && formalBindingIds.length === 0
        ? ['LEGACY_RULE_REVIEW_REQUIRED']
        : []),
      ...(formalBindingIds.length === 0
        && assessmentsByNodeId.get(candidate.nodeId)?.disposition === 'legacy-partial'
        ? ['LEGACY_RULE_PARTIAL_SUPPORT']
        : []),
      ...(formalBindingIds.length === 0
        && assessmentsByNodeId.get(candidate.nodeId)?.disposition === 'legacy-discrepancy'
        ? ['LEGACY_RULE_DISCREPANCY']
        : []),
      ...activeDiagnostics,
    ];
    const assessment = assessmentsByNodeId.get(candidate.nodeId);
    return {
      canonicalId,
      nodeId: candidate.nodeId,
      title: caseOverride?.title ?? candidate.title,
      modulePath: candidate.modulePath,
      route: input.observedRoutes[0],
      status: reviewRequired.length === 0
        ? 'ready-for-technical-binding' as const
        : 'review-required' as const,
      priority: caseOverride?.priority ?? 'unassigned' as const,
      preconditions,
      actions,
      expectedResults,
      claims,
      claimIds: claims.map((item) => item.id),
      ruleIds,
      executionChannel,
      sources: [
        {
          kind: 'xmind' as const,
          sourceId,
          sourceRole: 'test-plan-skeleton' as const,
          acceptanceEligible: false,
          citation: `XMind已有 ← nodeId=${candidate.nodeId}；路径=${[
            ...candidate.modulePath,
            candidate.title,
          ].map(compactText).join(' / ')}`,
          verified: true as const,
          sourcePath: input.sourceFiles.xmind,
          fingerprint: sourceFiles.xmind.fingerprint,
          matchedText: candidate.title,
        },
        ...(assessment?.sources ?? []),
        ...formalRules.map((rule) => ({
          kind: 'business-rule' as const,
          sourceId: `product-confirmed-rule:${rule.ruleId}`,
          sourceRole: 'product-confirmed-rule' as const,
          acceptanceEligible: true,
          citation: `产品确认规则 ← ${rule.ruleId} @ ${rule.authority.section}`,
          verified: rule.authority.verified,
          sourcePath: rule.authority.sourcePath,
          fingerprint: rule.authority.fingerprint,
          matchedText: rule.authority.matchedText,
        })),
      ],
      businessRuleAssessment: assessment
        ? {
          disposition: assessment.disposition,
          note: formalBindingIds.length > 0
            ? `${assessment.note.replace(/；仍需当前正式来源复核。?$/, '')}；当前产品确认规则已完成正式校正。`
            : assessment.note,
        }
        : { disposition: 'unmapped' as const, note: '尚未建立逐条正式业务规则映射' },
      reviewRequired,
      diagnostics: activeDiagnostics,
      supersededDiagnostics,
      capabilityIds: ['navigation.sidebar.open'] as ['navigation.sidebar.open'],
      assertionAdapterIds: ['canonical.manual-review'] as ['canonical.manual-review'],
    } satisfies ProductCenterCanonicalCase;
  });

  const blocked = input.plan.blocked.map((candidate, index) => ({
    canonicalId: `TC-ITEM-XMIND-BLOCKED-${String(index + 1).padStart(3, '0')}-${candidate.nodeId}`,
    nodeId: candidate.nodeId,
    title: candidate.title,
    path: candidate.path,
    status: 'blocked' as const,
    reason: 'INCOMPLETE_EXECUTION_CHAIN' as const,
    diagnostics: candidate.diagnostics,
  }));

  const automationBindings = cases.map((item) => ({
    canonicalId: item.canonicalId,
    nodeId: item.nodeId,
    route: item.route,
    capabilityIds: [...item.capabilityIds],
    assertionAdapterIds: [...item.assertionAdapterIds],
    sourceIds: item.sources.map((source) => source.citation),
    claimIds: [...item.claimIds],
    ruleIds: [...item.ruleIds],
    executionChannel: item.executionChannel,
    status: item.status,
  }));
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ plan: input.plan, sourceFiles, observedRoutes: input.observedRoutes }))
    .digest('hex');

  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-canonical',
    status: 'review-required',
    fingerprint,
    namingPolicy: {
      format: 'TC-{MODULE}-{TYPE}-{SEQUENCE}',
      module: 'ITEM',
      allowedTypes: ['STD', 'PKG', 'ADD'],
      sequenceWidth: 3,
      xmindNodeIdInCanonicalId: false,
    },
    sourceFiles,
    summary: {
      nodes: input.plan.summary.nodes,
      leaves: input.plan.summary.leaves,
      candidates: cases.length,
      generated: cases.length,
      reviewRequired: cases.filter((item) => item.status === 'review-required').length,
      blocked: blocked.length,
    },
    cases,
    blocked,
    automationBindings,
  };
}

export function renderProductCenterCanonicalMarkdown(
  release: ProductCenterCanonicalRelease,
): string {
  const lines = [
    '# 商品中心商品管理 canonical 测试用例',
    '',
    '> 唯一业务用例载体；JSON、Recipe、自动化绑定和运行证据均为派生产物。',
    '',
  ];
  for (const item of release.cases) {
    lines.push(
      `### 用例编号：${item.canonicalId}`,
      '',
      `用例标题：${item.title}`,
      `所属模块：${item.modulePath.map(compactText).join(' → ')}`,
      `优先级：${item.priority === 'unassigned' ? '待分配（PRIORITY_UNASSIGNED）' : item.priority}`,
      `状态：${item.status}`,
      `来源：${item.sources[0]?.citation ?? 'XMind来源缺失'}`,
      `旧规则线索复核：${item.businessRuleAssessment.disposition}；${item.businessRuleAssessment.note}`,
      '',
      '前置条件：',
      ...renderNumbered(item.preconditions),
      '',
      '测试步骤：',
      ...renderNumbered(item.actions),
      '',
      '预期结果：',
      ...renderNumbered(item.expectedResults),
      '',
      `待复核：${item.reviewRequired.join('、')}`,
      '',
    );
  }
  lines.push(
    '## 阻塞节点',
    '',
    ...release.blocked.map((item) => `- ${item.canonicalId}：${compactText(item.title)}（${item.reason}）`),
    '',
  );
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export function validateProductCenterCanonicalRelease(
  release: ProductCenterCanonicalRelease,
): string[] {
  const errors: string[] = [];
  const ids = release.cases.map((item) => item.canonicalId);
  if (new Set(ids).size !== ids.length) errors.push('CANONICAL_ID_DUPLICATE');
  if (release.summary.generated !== release.cases.length) errors.push('SUMMARY_GENERATED_MISMATCH');
  if (release.summary.blocked !== release.blocked.length) errors.push('SUMMARY_BLOCKED_MISMATCH');
  for (const item of release.cases) {
    if (item.capabilityIds[0] !== 'navigation.sidebar.open') {
      errors.push(`${item.canonicalId}:SIDEBAR_ENTRY_REQUIRED`);
    }
    if (!['review-required', 'ready-for-technical-binding'].includes(item.status)) {
      errors.push(`${item.canonicalId}:STATUS_INVALID`);
    }
    if (item.status === 'ready-for-technical-binding' && item.reviewRequired.length > 0) {
      errors.push(`${item.canonicalId}:READY_STATUS_HAS_REVIEW_ITEMS`);
    }
    if (item.status === 'review-required' && item.reviewRequired.length === 0) {
      errors.push(`${item.canonicalId}:REVIEW_STATUS_WITHOUT_REVIEW_ITEMS`);
    }
    if (item.claimIds.length !== item.claims.length) errors.push(`${item.canonicalId}:CLAIM_IDS_MISMATCH`);
    if (item.ruleIds.length > 0) {
      if (item.claims.some((itemClaim) => itemClaim.candidateRuleIds.length === 0)) {
        errors.push(`${item.canonicalId}:CANDIDATE_RULE_REQUIRED_FOR_EVERY_CLAIM`);
      }
      if (item.executionChannel === 'acceptance'
        && item.claims.every((itemClaim) => itemClaim.formalRuleBindingIds.length === 0)) {
        errors.push(`${item.canonicalId}:CANDIDATE_ACCEPTANCE_FORBIDDEN`);
      }
    }
    if (item.sources.every((source) => !source.verified)) errors.push(`${item.canonicalId}:SOURCE_REQUIRED`);
    if (item.actions.some((action) => /(?:selector|locator|xpath|css)/i.test(action))) {
      errors.push(`${item.canonicalId}:LOW_LEVEL_SELECTOR_IN_CANONICAL`);
    }
  }
  for (const binding of release.automationBindings) {
    if ('actions' in binding || 'expectedResults' in binding || 'preconditions' in binding) {
      errors.push(`${binding.canonicalId}:AUTOMATION_CONTENT_DUPLICATION`);
    }
    if (binding.capabilityIds[0] !== 'navigation.sidebar.open') {
      errors.push(`${binding.canonicalId}:AUTOMATION_SIDEBAR_ENTRY_REQUIRED`);
    }
    if ('statement' in binding || 'ruleStatement' in binding) {
      errors.push(`${binding.canonicalId}:AUTOMATION_RULE_CONTENT_DUPLICATION`);
    }
  }
  return errors;
}

function toCandidate(leaf: TopicRecord): ProductCenterXmindItemCandidate | null {
  if (leaf.path.length !== 8) return null;
  const titleNode = leaf.pathNodes.at(-4);
  const title = titleNode?.title ?? '';
  const precondition = leaf.path.at(-3) ?? '';
  const steps = leaf.path.at(-2) ?? '';
  const expected = leaf.path.at(-1) ?? '';
  if (!title || !precondition || !steps || !expected || !hasNumberedObservation(expected)) return null;
  const diagnostics = diagnoseSourceFragments([precondition, steps, expected]);
  return {
    nodeId: titleNode?.id ?? leaf.id,
    title,
    modulePath: leaf.path.slice(0, -4),
    path: leaf.path,
    precondition,
    steps,
    expected,
    diagnostics,
  };
}

function incompleteCandidate(leaf: TopicRecord): ProductCenterXmindItemCandidate {
  return {
    nodeId: leaf.id,
    title: leaf.title || '[无标题节点]',
    modulePath: leaf.path.slice(0, -1),
    path: leaf.path,
    precondition: '',
    steps: '',
    expected: '',
    diagnostics: ['INCOMPLETE_EXECUTION_CHAIN'],
  };
}

function sourceRecord(
  kind: ProductCenterCanonicalSource['kind'],
  sourceRole: ProductCenterCanonicalSource['sourceRole'],
  sourcePath: string,
  description: string,
  acceptanceEligible: boolean,
): ProductCenterCanonicalSource {
  return {
    kind,
    sourceId: `${sourceRole}:${createHash('sha256').update(sourcePath).digest('hex').slice(0, 16)}`,
    sourceRole,
    acceptanceEligible,
    citation: description,
    verified: true,
    sourcePath,
    fingerprint: createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'),
  };
}

function claim(
  canonicalId: string,
  kind: ProductCenterCanonicalClaim['kind'],
  index: number,
  text: string,
  sourceId: string,
): ProductCenterCanonicalClaim {
  return {
    id: `${canonicalId}:${kind}-${index + 1}`,
    kind,
    text,
    sourceIds: [sourceId],
    candidateRuleIds: [],
    formalRuleBindingIds: [],
    legacyRuleBindingIds: [],
    evidenceBindings: [],
    executionEvidenceIds: [],
  };
}

function cleanList(value: string): string[] {
  const items: string[] = [];
  for (const line of value.split(/\r?\n/)) {
    const normalized = line.trim();
    if (/={2,}/.test(normalized)) break;
    if (!normalized || normalized === '下发') continue;
    const withoutNumber = normalized
      .replace(/^(?:\d+(?:\.\d+)*[.、:]?\s*)+/, '')
      .replace(/^[-*]\s*/, '')
      .trim();
    if (!withoutNumber || /^={2,}/.test(withoutNumber) || /^下发(?:\b|$)/.test(withoutNumber)) {
      continue;
    }
    items.push(withoutNumber);
  }
  return items;
}

function renderNumbered(items: readonly string[]): string[] {
  return items.map((item, index) => `${index + 1}. ${item}`);
}

function diagnoseSourceFragments(values: readonly string[]): string[] {
  const text = values.join('\n');
  const diagnostics: string[] = [];
  if (/^\s*={2,}\s*$/m.test(text) || /下发/.test(text)) {
    diagnostics.push('CROSS_SCOPE_DOWNSTREAM_FRAGMENT');
  }
  if (/(?:数据库|入库|数据库中)/.test(text)) diagnostics.push('NON_UI_ASSERTION_FRAGMENT');
  return diagnostics;
}

function hasNumberedObservation(value: string): boolean {
  return value.split(/\r?\n/).some((line) => /^\s*\d+(?:\.\d+)*[.、:]?\s*\S+/.test(line));
}

function compactText(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/={2,}/g, '').replace(/\s+/g, ' ').trim();
}

function readXmindTopics(content: Buffer): XmindSheet[] {
  const archive = new AdmZip(content);
  const entry = archive.getEntry('content.json');
  if (!entry) throw new Error('XMind 缺少 content.json');
  let value: unknown;
  try {
    value = JSON.parse(entry.getData().toString('utf8'));
  } catch {
    throw new Error('XMind content.json 格式无效');
  }
  if (!Array.isArray(value)) throw new Error('XMind content.json 根节点必须是数组');
  return value as XmindSheet[];
}

function topicChildren(topic: XmindTopic): XmindTopic[] {
  return Object.values(topic.children ?? {}).flatMap((value) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  });
}
