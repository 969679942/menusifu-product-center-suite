import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { diagnoseProductCenterMarkdownTestPlan } from '../utils/product-center-test-plan-markdown';
import {
  productCenterCanonicalTestCaseRoot,
  productCenterSourceMaterialRoot,
  productCenterTestPlanModuleDirectories,
} from '../utils/product-center-test-plan-source';
import { loadProductCenterExecutionDecisions } from '../utils/product-center-execution-decisions';

type CitationKind = 'prd-explicit' | 'xmind-existing' | 'business-rule-explicit' | 'governance-release' | 'governance-audit' | 'runtime-audit';

type SourceCitation = {
  kind: CitationKind;
  citation: string;
  sourceFile: string;
  location: string;
  matchedText: string;
};

type ParsedCase = {
  caseId: string;
  title: string;
  sourceRaw: string;
};

type Topic = {
  title?: string;
  children?: Record<string, Topic[] | undefined>;
};

type SourceDefinition = {
  module: string;
  sourceDirectory: string;
  fileName: string;
  xmindFileName: string;
  ownerRole: string;
};

type AuthoritativeReleaseCase = {
  caseId: string;
  title: string;
  source: string;
  scope: 'executable' | 'not-applicable' | 'supplemental';
  reviewDecision: 'approved' | 'deprecated';
  runtime: {
    status: 'runtime-passed' | 'deferred' | 'not-applicable' | 'supplemental-reviewed';
    evidenceRefs?: string[];
  };
};

type SourceAutoResolution = {
  policy: { policyId: string };
  cases: Array<{
    caseId: string;
    disposition: string;
    reasons: string[];
    evidence: null | {
      path: string;
      sha256: string;
      startedAt: string;
      status: string;
      applicationVersionFingerprint: string | null;
    };
    sourceRecovery?: {
      disposition: string;
      promotionAllowed: boolean;
      sourceAuthority: string;
    } | null;
    recoveredRule?: null | {
      ruleId: string;
      caseId: string;
      authority: string;
      originalRequirementRecovered: boolean;
      source: { kind: string; path: string; title: string };
      semantics: { preconditions: string[]; actions: string[]; outcomes: string[]; assertionIds: string[] };
      runtimeEvidence: { path: string; sha256: string };
    };
  }>;
};

type GroupAuditResolution = {
  status: 'verified' | 'not-applicable';
  citation: SourceCitation;
};

const SOURCE_DEFINITIONS: readonly SourceDefinition[] = [
  {
    module: 'brand-item',
    sourceDirectory: productCenterTestPlanModuleDirectories.item,
    fileName: '1.商品中心-商品管理-商品-正式测试用例.md',
    xmindFileName: '1.商品中心-商品管理-商品.xmind',
    ownerRole: '商品中心商品产品负责人',
  },
  {
    module: 'brand-group',
    sourceDirectory: productCenterTestPlanModuleDirectories.group,
    fileName: '2.商品中心-商品管理-组-正式测试用例.md',
    xmindFileName: '2.商品中心-商品管理-组.xmind',
    ownerRole: '商品中心组产品负责人',
  },
  {
    module: 'brand-seasoning',
    sourceDirectory: productCenterTestPlanModuleDirectories.seasoning,
    fileName: '3.商品中心-商品管理-调味管理-正式测试用例.md',
    xmindFileName: '3.商品中心-商品管理-调味管理.xmind',
    ownerRole: '商品中心调味产品负责人',
  },
  {
    module: 'brand-tag',
    sourceDirectory: productCenterTestPlanModuleDirectories.tag,
    fileName: '4.商品中心-商品管理-标签管理-正式测试用例.md',
    xmindFileName: '4.商品中心-商品管理-标签管理.xmind',
    ownerRole: '商品中心标签产品负责人',
  },
  {
    module: 'brand-item',
    sourceDirectory: productCenterTestPlanModuleDirectories.image,
    fileName: '5.商品中心-商品管理-图片管理-正式测试用例.md',
    xmindFileName: '5.商品中心-商品管理-图片管理.xmind',
    ownerRole: '商品中心图片产品负责人',
  },
] as const;

const DEPRECATED_CASE_IDS = new Set(['TC-ITEM-STD-060', 'TC-ITEM-PKG-066']);
const GROUP_AUDIT_RESOLUTION_CASE_IDS = new Set([
  'TC-GRP-ATTR-001',
  'TC-GRP-ATTR-002',
  'TC-GRP-PKG-001',
  'TC-GRP-PKG-011',
  'TC-GRP-PKG-017',
  'TC-GRP-PKG-018',
  'TC-GRP-PKG-019',
  'TC-GRP-PKG-024',
  'TC-GRP-PKG-025',
  'TC-GRP-PKG-026',
  'TC-GRP-PKG-033',
  'TC-GRP-PKG-034',
  'TC-GRP-PKG-035',
  'TC-GRP-PKG-037',
  'TC-GRP-PKG-038',
  'TC-GRP-PKG-039',
  'TC-GRP-PKG-040',
  'TC-GRP-PKG-044',
  'TC-GRP-PKG-046',
]);
const AUTOMATION_SOURCE_PATTERN = /自动化测试用例/i;

export async function buildProductCenterUnsupportedSourceDecisions(options: {
  projectRoot?: string;
  infoRoot?: string;
  outputRoot?: string;
} = {}): Promise<string> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const infoRoot = path.resolve(options.infoRoot ?? path.join(projectRoot, '..', 'Merchant Center Info'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const canonicalPlanRoot = productCenterCanonicalTestCaseRoot(infoRoot);
  const sourceMaterialRoot = productCenterSourceMaterialRoot(infoRoot);
  const businessRulePath = path.join(infoRoot, '商品中心业务规则.md');
  const authoritativeReleasePath = path.join(projectRoot, 'output/product-center-item-final-status.json');
  const sourceAutoResolutionPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-source-auto-resolution.json',
  );
  const writebackManifest = JSON.parse(await readFile(path.join(
    projectRoot,
    'contracts/product-center/reviews/verified-source-writeback-manifest.json',
  ), 'utf8'));
  const normalizedCases = new Map<string, any>(
    (writebackManifest.cases ?? []).map((item: any) => [item.caseId, item]),
  );
  const verifiedNormalizedIds = new Set<string>();

  const [businessRuleContent, prdDocuments, authoritativeRelease, sourceAutoResolution, groupAuditResolutions] = await Promise.all([
    readFile(businessRulePath, 'utf8'),
    readFormalPrdDocuments(infoRoot),
    readAuthoritativeRelease(authoritativeReleasePath),
    readSourceAutoResolution(sourceAutoResolutionPath, path.resolve(projectRoot, '..')),
    readGroupAuditResolutions(projectRoot),
  ]);
  const businessRules = buildBusinessRuleCatalog(businessRuleContent, relative(infoRoot, businessRulePath));
  const authoritativeReleaseCases = new Map(authoritativeRelease.cases.map((item) => [item.caseId, item]));
  const runtimeApprovals = new Map(sourceAutoResolution.cases
    .filter((item) => item.disposition === 'auto-approved-runtime')
    .map((item) => [item.caseId, item]));
  const executionDecisions = loadProductCenterExecutionDecisions(projectRoot);
  const decisions: any[] = [];
  const auditedFiles: Array<{ path: string; fingerprint: string; unsupportedCases: number }> = [];

  for (const definition of SOURCE_DEFINITIONS) {
    const planPath = path.join(canonicalPlanRoot, definition.sourceDirectory, definition.fileName);
    const xmindPath = path.join(sourceMaterialRoot, definition.sourceDirectory, definition.xmindFileName);
    const [planContent, xmindContent] = await Promise.all([
      readFile(planPath, 'utf8'),
      readFile(xmindPath),
    ]);
    const parsedCases = parseCaseBlocks(planContent);
    const casesById = new Map(parsedCases.map((item) => [item.caseId, item]));
    const xmindPaths = readXmindTopicPaths(xmindContent);
    const unsupportedIds = diagnoseProductCenterMarkdownTestPlan(planContent).issues
      .filter((item) => item.code === 'UNSUPPORTED_SOURCE_FORMAT' && item.caseId)
      .map((item) => item.caseId as string);
    for (const manifestCase of normalizedCases.values()) {
      if (manifestCase.sourceFile !== relative(infoRoot, planPath)) continue;
      const currentCase = casesById.get(manifestCase.caseId);
      if (!currentCase) throw new Error(`来源回写用例已从正式方案丢失：${manifestCase.caseId}`);
      if (currentCase.sourceRaw !== manifestCase.normalizedSource) {
        throw new Error(`来源回写内容发生漂移：${manifestCase.caseId}`);
      }
      if (unsupportedIds.includes(manifestCase.caseId)) {
        throw new Error(`来源回写后仍无法审计：${manifestCase.caseId}`);
      }
      verifiedNormalizedIds.add(manifestCase.caseId);
    }
    auditedFiles.push({
      path: relative(infoRoot, planPath),
      fingerprint: sha256(Buffer.from(planContent, 'utf8')),
      unsupportedCases: unsupportedIds.length,
    });

    for (const caseId of unsupportedIds) {
      const testCase = casesById.get(caseId);
      if (!testCase) throw new Error(`来源审计缺少正式用例块：${caseId}`);
      const ownerRole = caseId.startsWith('TC-IMG-')
        ? '商品中心图片产品负责人'
        : definition.ownerRole;
      const deprecated = DEPRECATED_CASE_IDS.has(caseId)
        || (/~~/.test(testCase.sourceRaw) && /已废弃/.test(testCase.sourceRaw));
      const formalCitations = deprecated
        ? []
        : uniqueCitations([
          ...resolveBusinessRuleCitations(testCase.sourceRaw, businessRules),
          ...resolveXmindCitations(
            testCase.sourceRaw,
            testCase.title,
            xmindPaths,
            relative(infoRoot, xmindPath),
          ),
          ...resolvePrdCitations(testCase.sourceRaw, prdDocuments),
        ]);
      const releaseCase = authoritativeReleaseCases.get(caseId);
      const releaseNotApplicable = deprecated
        && releaseCase?.scope === 'not-applicable'
        && releaseCase.reviewDecision === 'deprecated'
        && releaseCase.runtime.status === 'not-applicable';
      const releaseEligible = releaseCase?.scope === 'executable'
        && releaseCase.reviewDecision === 'approved'
        && ['runtime-passed', 'deferred'].includes(releaseCase.runtime.status);
      const runtimeApproval = runtimeApprovals.get(caseId);
      const groupAuditResolution = groupAuditResolutions.get(caseId);
      const citations = formalCitations.length > 0
        ? formalCitations
        : releaseEligible && !releaseNotApplicable
          ? [governanceReleaseCitation(
            releaseCase,
            relative(infoRoot, authoritativeReleasePath),
          )]
          : groupAuditResolution?.status === 'verified'
            ? [groupAuditResolution.citation]
          : runtimeApproval
            ? [runtimeAuditCitation(runtimeApproval)]
            : [];
      const status = releaseNotApplicable
        ? 'not-applicable' as const
        : groupAuditResolution?.status === 'not-applicable'
          ? 'not-applicable' as const
        : citations.length > 0
          ? 'verified' as const
          : 'blocked' as const;
      const executionDecision = executionDecisions.get(caseId);
      const currentGoalBlocking = status === 'blocked' && !executionDecision;
      decisions.push({
        caseId,
        module: definition.module,
        owner: { type: 'role', role: ownerRole, status: 'assigned' },
        sourceFile: relative(infoRoot, planPath),
        sourceRaw: testCase.sourceRaw,
        status,
        disposition: status === 'verified'
          ? 'verified-source-evidence'
          : status === 'not-applicable'
            ? 'not-applicable'
            : 'blocked-source-review',
        currentGoalBlocking,
        executionDisposition: executionDecision?.status ?? null,
        executionDecisionReason: executionDecision?.reason ?? null,
        citations,
        evidenceFiles: [...new Set([
          ...citations.map((item) => item.sourceFile),
          ...(releaseNotApplicable ? [relative(infoRoot, authoritativeReleasePath)] : []),
          ...(groupAuditResolution?.status === 'not-applicable'
            ? [groupAuditResolution.citation.sourceFile]
            : []),
        ])].sort(),
        ...(status === 'blocked' ? blockedDisposition(testCase.sourceRaw, deprecated) : {}),
      });
    }
  }

  decisions.sort((left, right) => left.caseId.localeCompare(right.caseId));
  assertDecisionSet(decisions, normalizedCases, verifiedNormalizedIds, writebackManifest.summary);
  const verifiedCases = decisions.filter((item) => item.status === 'verified').length;
  const blockedCases = decisions.filter((item) => item.status === 'blocked').length;
  const notApplicableCases = decisions.filter((item) => item.status === 'not-applicable').length;
  const deferredCases = decisions.filter((item) => item.executionDisposition === 'deferred').length;
  const executionNotApplicableCases = decisions
    .filter((item) => item.executionDisposition === 'not-applicable').length;
  const currentGoalBlockingCases = decisions.filter((item) => item.currentGoalBlocking).length;
  const outputPath = path.join(
    outputRoot,
    'contracts/product-center/reviews/unsupported-source-format-decisions.json',
  );
  const document = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    collectionId: 'product-center-unsupported-source-format-decisions',
    guardrails: {
      automationAsBusinessSourceAllowed: false,
      inferenceAllowed: false,
      unmatchedDisposition: 'blocked',
    },
    summary: {
      baselineCases: decisions.length + verifiedNormalizedIds.size,
      normalizedCases: verifiedNormalizedIds.size,
      totalCases: decisions.length,
      originalRequestedCases: decisions.length - DEPRECATED_CASE_IDS.size,
      newlySurfacedDeprecatedCases: DEPRECATED_CASE_IDS.size,
      verifiedCases,
      blockedCases,
      notApplicableCases,
      deferredCases,
      executionNotApplicableCases,
      currentGoalBlockingCases,
      unassignedOwnerCases: decisions.filter((item) => item.owner.status !== 'assigned').length,
      byModule: countBy(decisions, (item) => item.module),
      byOwner: countBy(decisions, (item) => item.owner.role),
    },
    sourcePolicy: {
      acceptedCitationKinds: ['prd-explicit', 'xmind-existing', 'business-rule-explicit', 'governance-release', 'governance-audit', 'runtime-audit'],
      businessRuleScope: '商品中心业务规则.md / 正文、规则矩阵与附录 A（附录精确规则优先）',
      xmindMatch: 'unique-exact-node-path-or-exact-title',
      prdMatch: 'unique-exact-section-or-source-sentence',
      prohibitedSources: ['自动化测试用例', 'Page/Flow/Recipe/generated spec', '未结构化或证据不完整的 runtime evidence'],
      governanceReleasePolicy: '仅接受 released、approved、failed=0、unresolved=0 的权威发布记录',
      runtimeAuditPolicy: sourceAutoResolution.policy.policyId,
    },
    generationWorkstream: {
      id: 'test-plan-to-test-case-generation',
      status: 'active',
      currentGoalBlocking: currentGoalBlockingCases > 0,
    },
    auditedFiles,
    cases: decisions,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeStableDecisionDocument(outputPath, document);
  return outputPath;
}

async function writeStableDecisionDocument(
  outputPath: string,
  document: Record<string, unknown>,
): Promise<void> {
  try {
    const existing = JSON.parse(await readFile(outputPath, 'utf8')) as Record<string, unknown>;
    const { generatedAt: existingGeneratedAt, ...existingContent } = existing;
    const { generatedAt: _nextGeneratedAt, ...nextContent } = document;
    if (JSON.stringify(existingContent) === JSON.stringify(nextContent)) return;
    if (typeof existingGeneratedAt === 'string' && existingGeneratedAt.length > 0) {
      document.generatedAt = new Date().toISOString();
    }
  } catch {
    // A missing or invalid prior artifact is replaced by the freshly audited document.
  }
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

function parseCaseBlocks(markdown: string): ParsedCase[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const starts = lines.flatMap((line, index) => {
    const matched = line.match(/^### 用例编号：(.+)$/);
    return matched ? [{ caseId: matched[1].trim(), index }] : [];
  });
  return starts.map((start, index) => {
    const block = lines.slice(start.index + 1, starts[index + 1]?.index ?? lines.length);
    return {
      caseId: start.caseId,
      title: field(block, '用例标题：'),
      sourceRaw: field(block, '来源：'),
    };
  });
}

function field(lines: readonly string[], label: string): string {
  const value = lines.find((line) => line.startsWith(label))?.slice(label.length).trim();
  if (!value) throw new Error(`来源审计缺少字段：${label}`);
  return value;
}

function buildBusinessRuleCatalog(markdown: string, sourceFile: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const appendixStart = lines.findIndex((line) => normalize(line) === normalize('## 附录 A. BR 编号索引'));
  if (appendixStart < 0) throw new Error('正式业务规则缺少“附录 A. BR 编号索引”');
  let section = '文档正文';
  const catalog = new Map<string, SourceCitation[]>();
  const canonicalIds = new Set<string>();
  lines.forEach((line, index) => {
    const heading = line.match(/^#{2,6}\s+(.+)$/);
    if (heading) section = heading[1].trim();
    if (/~~/.test(line)) return;
    const matched = line.match(/^\s*(?:-\s*)?\*\*(BR-[A-Z0-9]+(?:-[A-Z0-9]+)*)\*\*\s+(.+?)\s*$/);
    if (!matched) return;
    const citation: SourceCitation = {
      kind: 'business-rule-explicit',
      citation: matched[1],
      sourceFile,
      location: `${section} / ${matched[1]} / line ${index + 1}`,
      matchedText: stripMarkdown(matched[2]),
    };
    const canonical = index > appendixStart;
    if (canonical && !canonicalIds.has(matched[1])) {
      catalog.set(matched[1], [citation]);
      canonicalIds.add(matched[1]);
    } else if (canonical || !catalog.has(matched[1])) {
      catalog.set(matched[1], [...(catalog.get(matched[1]) ?? []), citation]);
    }
  });
  section = '文档正文';
  lines.forEach((line, index) => {
    const heading = line.match(/^#{2,6}\s+(.+)$/);
    if (heading) section = heading[1].trim();
    if (!/^\s*\|.*\|\s*$/.test(line) || /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(line)) return;
    const ids = [...new Set(line.match(/BR-[A-Z0-9]+(?:-[A-Z0-9]+)*/g) ?? [])];
    for (const id of ids) {
      if (catalog.has(id)) continue;
      catalog.set(id, [{
        kind: 'business-rule-explicit',
        citation: id,
        sourceFile,
        location: `${section} / ${id} / line ${index + 1}`,
        matchedText: stripMarkdown(line),
      }]);
    }
  });
  return catalog;
}

function resolveBusinessRuleCitations(
  sourceRaw: string,
  catalog: Map<string, SourceCitation[]>,
): SourceCitation[] {
  const ids = [...new Set(sourceRaw.match(/BR-[A-Z0-9]+(?:-[A-Z0-9]+)*/g) ?? [])];
  return ids.flatMap((id) => {
    const matches = catalog.get(id) ?? [];
    return matches.length === 1 ? matches : [];
  });
}

async function readGroupAuditResolutions(projectRoot: string): Promise<Map<string, GroupAuditResolution>> {
  const workspaceRoot = path.resolve(projectRoot, '..');
  const fastReviewPath = path.join(workspaceRoot, 'deliverables/product-center-group/product-finding-fast-review.json');
  const runtimeReportPath = path.join(workspaceRoot, 'deliverables/product-center-group/runtime-report.json');
  const comboCorrectionsPath = path.join(workspaceRoot, 'deliverables/product-center-group/combo-v2-case-corrections.json');
  const comboManualReviewPath = path.join(
    workspaceRoot,
    'deliverables/product-center-source-governance/legacy-assets/商品中心-商品管理-组/2.商品中心-商品管理-组-套餐组V2-32条阻断用例审核.md',
  );
  const driftDecisionsPath = path.join(
    projectRoot,
    'contracts/product-center/group/product-center-group-drift-decisions.json',
  );
  const [fastReview, runtimeReport, comboCorrections, comboManualReview, driftDecisions] = await Promise.all([
    readJsonFile<{
      resolvedCases?: Array<{
        caseId: string;
        result: string;
        expected?: string[];
        recommendation?: string;
        evidencePaths?: string[];
        evidenceHashes?: string[];
      }>;
    }>(fastReviewPath),
    readJsonFile<{
      status?: string;
      applicationVersionFingerprint?: string;
      cases?: Array<{
        caseId: string;
        status: string;
        classification?: string;
        claimCoverageComplete?: boolean;
        evidencePaths?: string[];
      }>;
      remainingHumanItems?: Array<{
        caseId: string;
        classification?: string;
        reason?: string[];
        evidencePaths?: string[];
      }>;
      remainingBlockedCases?: Array<{
        caseId: string;
        classification?: string;
        reason?: string[];
        evidencePaths?: string[];
      }>;
    }>(runtimeReportPath),
    readJsonFile<{
      corrections?: Array<{
        caseId: string;
        rationale: string;
        evidencePaths?: string[];
      }>;
    }>(comboCorrectionsPath),
    readFile(comboManualReviewPath, 'utf8'),
    readJsonFile<{
      decisions?: Array<{
        caseId: string;
        decisionStatus: string;
        observedClaim: string;
        evidence?: Array<{ path: string; sha256: string }>;
      }>;
    }>(driftDecisionsPath),
  ]);
  const resolutions = new Map<string, GroupAuditResolution>();

  for (const item of fastReview.resolvedCases ?? []) {
    if (!GROUP_AUDIT_RESOLUTION_CASE_IDS.has(item.caseId)) continue;
    if (!['passed', 'rebaselined'].includes(item.result)) continue;
    await validateAuditEvidence(workspaceRoot, item.evidencePaths ?? [], item.evidenceHashes ?? []);
    const notApplicable = /已废弃/.test(item.recommendation ?? '');
    resolutions.set(item.caseId, {
      status: notApplicable ? 'not-applicable' : 'verified',
      citation: governanceAuditCitation(
        item.caseId,
        workspaceRoot,
        fastReviewPath,
        `${item.result}${notApplicable ? ' / deprecated' : ''}`,
        item.expected?.join('；') || item.recommendation || '结构化现网审计已完成。',
      ),
    });
  }

  if (!['passed', 'completed-with-findings'].includes(runtimeReport.status ?? '')
    || !/^[a-f0-9]{64}$/i.test(runtimeReport.applicationVersionFingerprint ?? '')) {
    throw new Error('组运行报告未达到治理审计复用条件');
  }
  for (const item of runtimeReport.cases ?? []) {
    if (!GROUP_AUDIT_RESOLUTION_CASE_IDS.has(item.caseId)) continue;
    if (item.status !== 'passed' || item.claimCoverageComplete !== true) continue;
    await validateAuditEvidence(workspaceRoot, item.evidencePaths ?? []);
    resolutions.set(item.caseId, {
      status: 'verified',
      citation: governanceAuditCitation(
        item.caseId,
        workspaceRoot,
        runtimeReportPath,
        'status=passed / claimCoverageComplete=true',
        '结构化运行报告确认全部声明已覆盖。',
      ),
    });
  }
  for (const item of [
    ...(runtimeReport.remainingHumanItems ?? []),
    ...(runtimeReport.remainingBlockedCases ?? []),
  ]) {
    if (!GROUP_AUDIT_RESOLUTION_CASE_IDS.has(item.caseId)) continue;
    if (item.classification !== 'external-dependency-blocked') continue;
    await validateAuditEvidence(workspaceRoot, item.evidencePaths ?? []);
    resolutions.set(item.caseId, {
      status: 'verified',
      citation: governanceAuditCitation(
        item.caseId,
        workspaceRoot,
        runtimeReportPath,
        'classification=external-dependency-blocked',
        item.reason?.join('；') || '当前业务合同已确认，执行依赖外部终端观测能力。',
      ),
    });
  }

  for (const item of comboCorrections.corrections ?? []) {
    if (!GROUP_AUDIT_RESOLUTION_CASE_IDS.has(item.caseId)) continue;
    await validateAuditEvidence(workspaceRoot, item.evidencePaths ?? []);
    resolutions.set(item.caseId, {
      status: 'verified',
      citation: governanceAuditCitation(
        item.caseId,
        workspaceRoot,
        comboCorrectionsPath,
        'approved combo-v2 correction',
        item.rationale,
      ),
    });
  }

  const pickAndMixApproval = comboManualReview.match(
    /### TC-GRP-PKG-046[^]*?- 人工审核：([^\r\n]+)[^]*?(?=\r?\n### |$)/,
  );
  if (pickAndMixApproval?.[1].trim() === '确定场景正确') {
    await validateAuditEvidence(workspaceRoot, [
      'Merchant Center UITest/output/audit/product-center-group-combo-v2-audit.json',
      'Merchant Center UITest/output/audit/product-center-group-combo-v2-rule-state-audit.json',
      'Merchant Center UITest/output/audit/product-center-group-combo-v2-detail-audit.json',
    ]);
    resolutions.set('TC-GRP-PKG-046', {
      status: 'verified',
      citation: governanceAuditCitation(
        'TC-GRP-PKG-046',
        workspaceRoot,
        comboManualReviewPath,
        '人工审核=确定场景正确 / 三份现网审计证据已校验',
        '随心配成功创建场景已由业务审核确认，运行结果仍须由自动化独立验证。',
      ),
    });
  }

  for (const item of driftDecisions.decisions ?? []) {
    if (!GROUP_AUDIT_RESOLUTION_CASE_IDS.has(item.caseId)) continue;
    if (item.decisionStatus !== 'evidence-confirmed') continue;
    const evidencePaths = (item.evidence ?? []).map((entry) => entry.path);
    const evidenceHashes = (item.evidence ?? []).map((entry) => entry.sha256.replace(/^sha256:/, ''));
    await validateAuditEvidence(workspaceRoot, evidencePaths, evidenceHashes);
    resolutions.set(item.caseId, {
      status: 'verified',
      citation: governanceAuditCitation(
        item.caseId,
        workspaceRoot,
        driftDecisionsPath,
        'decisionStatus=evidence-confirmed',
        item.observedClaim,
      ),
    });
  }
  return resolutions;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

async function validateAuditEvidence(
  workspaceRoot: string,
  evidencePaths: readonly string[],
  expectedHashes: readonly string[] = [],
): Promise<void> {
  if (evidencePaths.length === 0) throw new Error('治理审计缺少证据文件');
  const observedHashes = new Set<string>();
  for (const evidencePath of evidencePaths) {
    const absolutePath = path.resolve(workspaceRoot, evidencePath);
    if (path.relative(workspaceRoot, absolutePath).startsWith('..')) {
      throw new Error(`治理审计证据越出工作区：${evidencePath}`);
    }
    observedHashes.add(sha256(await readFile(absolutePath)));
  }
  for (const expectedHash of expectedHashes) {
    if (!observedHashes.has(expectedHash.toLowerCase())) {
      throw new Error(`治理审计证据哈希失效：${expectedHash}`);
    }
  }
}

function governanceAuditCitation(
  caseId: string,
  workspaceRoot: string,
  sourcePath: string,
  location: string,
  matchedText: string,
): SourceCitation {
  return {
    kind: 'governance-audit',
    citation: `governance-audit:${caseId}`,
    sourceFile: relative(workspaceRoot, sourcePath),
    location: `${caseId} / ${location}`,
    matchedText,
  };
}

async function readAuthoritativeRelease(filePath: string): Promise<{ cases: AuthoritativeReleaseCase[] }> {
  const release = JSON.parse(await readFile(filePath, 'utf8')) as {
    status?: string;
    fingerprint?: string;
    summary?: { failed?: number; unresolved?: number };
    cases?: AuthoritativeReleaseCase[];
  };
  if (release.status !== 'released'
    || !/^[a-f0-9]{64}$/i.test(release.fingerprint ?? '')
    || release.summary?.failed !== 0
    || release.summary?.unresolved !== 0
    || !Array.isArray(release.cases)) {
    throw new Error('商品权威发布未达到来源治理复用条件');
  }
  return { cases: release.cases };
}

async function readSourceAutoResolution(
  filePath: string,
  workspaceRoot: string,
): Promise<SourceAutoResolution> {
  try {
    const document = JSON.parse(await readFile(filePath, 'utf8')) as SourceAutoResolution;
    if (document.policy?.policyId !== 'runtime-source-auto-resolution-v1' || !Array.isArray(document.cases)) {
      throw new Error('AI 来源裁决清单格式无效');
    }
    for (const item of document.cases.filter((entry) => entry.disposition === 'auto-approved-runtime')) {
      const evidencePath = item.evidence?.path
        ? path.resolve(workspaceRoot, item.evidence.path)
        : '';
      const relativePath = evidencePath ? path.relative(workspaceRoot, evidencePath) : '..';
      if (!item.evidence
        || item.evidence.status !== 'passed'
        || item.reasons.length > 0
        || !/^[a-f0-9]{64}$/i.test(item.evidence.applicationVersionFingerprint ?? '')
        || relativePath.startsWith('..')
        || !await fileExists(evidencePath)
        || sha256(await readFile(evidencePath)) !== item.evidence.sha256) {
        throw new Error(`AI 来源裁决证据失效：${item.caseId}`);
      }
      if (item.sourceRecovery?.promotionAllowed === true && (
        item.sourceRecovery.disposition !== 'reconstructed-current-baseline'
        || item.sourceRecovery.sourceAuthority !== 'reconstructed-current-baseline'
        || item.recoveredRule?.caseId !== item.caseId
        || item.recoveredRule.authority !== 'reconstructed-current-baseline'
        || item.recoveredRule.originalRequirementRecovered !== false
        || item.recoveredRule.source.kind !== 'existing-test-case'
        || !item.recoveredRule.source.path
        || item.recoveredRule.semantics.preconditions.length === 0
        || item.recoveredRule.semantics.actions.length === 0
        || item.recoveredRule.semantics.outcomes.length === 0
        || item.recoveredRule.semantics.assertionIds.length === 0
        || item.recoveredRule.runtimeEvidence.path !== item.evidence.path
        || item.recoveredRule.runtimeEvidence.sha256 !== item.evidence.sha256
      )) {
        throw new Error(`来源恢复规则无效：${item.caseId}`);
      }
    }
    return document;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        policy: { policyId: 'runtime-source-auto-resolution-v1' },
        cases: [],
      };
    }
    throw error;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

function governanceReleaseCitation(
  releaseCase: AuthoritativeReleaseCase,
  sourceFile: string,
): SourceCitation {
  return {
    kind: 'governance-release',
    citation: `release:${releaseCase.caseId}`,
    sourceFile,
    location: `${releaseCase.caseId} / reviewDecision=approved / runtime=${releaseCase.runtime.status}`,
    matchedText: releaseCase.source,
  };
}

function runtimeAuditCitation(
  item: SourceAutoResolution['cases'][number],
): SourceCitation {
  return {
    kind: 'runtime-audit',
    citation: `runtime-audit:${item.caseId}`,
    sourceFile: item.evidence!.path,
    location: `${item.caseId} / ${item.evidence!.startedAt} / structured-runtime-evidence`,
    matchedText: item.recoveredRule
      ? `恢复基线（不代表原始需求）：${item.recoveredRule.semantics.outcomes.join('；')}`
      : '真实运行通过，断言、证据、执行上下文与写入清理门禁全部满足；发布身份只控制复用。',
  };
}

function readXmindTopicPaths(content: Buffer): string[][] {
  const archive = new AdmZip(content);
  const entry = archive.getEntry('content.json');
  if (!entry) throw new Error('XMind 缺少 content.json');
  const sheets = JSON.parse(entry.getData().toString('utf8')) as Array<{ rootTopic?: Topic }>;
  const paths: string[][] = [];
  for (const sheet of sheets) {
    if (sheet.rootTopic) collectTopicPaths(sheet.rootTopic, [], paths);
  }
  return paths;
}

function collectTopicPaths(topic: Topic, parent: readonly string[], paths: string[][]): void {
  const title = topic.title?.trim() ?? '';
  const current = title ? [...parent, title] : [...parent];
  if (title) paths.push(current);
  for (const group of Object.values(topic.children ?? {})) {
    for (const child of group ?? []) collectTopicPaths(child, current, paths);
  }
}

function resolveXmindCitations(
  sourceRaw: string,
  caseTitle: string,
  topicPaths: readonly string[][],
  sourceFile: string,
): SourceCitation[] {
  const fragments = sourceRaw.split('；').map((item) => item.trim()).filter(Boolean);
  const requestedPaths = fragments.flatMap((fragment) => {
    if (/~~/.test(fragment)) return [];
    const match = fragment.match(/^XMind(?:已有)?\s*←\s*(.+?)(?:\s*←\s*BR-[A-Z0-9]+(?:-[A-Z0-9]+)*.*)?$/i);
    if (!match) return [];
    const segments = match[1].split('/').map((item) => item.trim()).filter(Boolean);
    return segments.length > 0 ? [segments] : [];
  });
  const bareXmind = fragments.some((fragment) => /^XMind已有$/i.test(fragment));
  if (bareXmind) requestedPaths.push([caseTitle]);

  return requestedPaths.flatMap((requested) => {
    const normalizedRequested = requested.map(normalizePathSegment);
    const matches = [...new Map(topicPaths
      .filter((candidate) => {
        const normalizedCandidate = candidate.map(normalizePathSegment);
        return pathEndsWith(normalizedCandidate, normalizedRequested)
          || pathContainsOrdered(normalizedCandidate, normalizedRequested);
      })
      .map((candidate) => [candidate.map(normalizePathSegment).join(' / '), candidate])).values()];
    if (matches.length !== 1) return [];
    const matched = matches[0];
    return [{
      kind: 'xmind-existing' as const,
      citation: matched.join(' / '),
      sourceFile,
      location: matched.join(' / '),
      matchedText: matched.at(-1) ?? '',
    }];
  });
}

async function readFormalPrdDocuments(infoRoot: string) {
  const prdRoot = path.join(infoRoot, 'PRD与对应测试用例');
  const completedPlanRoot = productCenterSourceMaterialRoot(infoRoot);
  const moduleRoots = [...new Set(SOURCE_DEFINITIONS.map((definition) => (
    path.join(completedPlanRoot, definition.sourceDirectory)
  )))];
  const [prdEntries, moduleEntries] = await Promise.all([
    readdir(prdRoot),
    Promise.all(moduleRoots.map(async (moduleRoot) => ({
      moduleRoot,
      entries: await readdir(moduleRoot),
    }))),
  ]);
  const files = [
    ...prdEntries.filter((name) => /^\d+\.需求.+\.md$/.test(name) && !name.includes('测试用例'))
      .map((name) => path.join(prdRoot, name)),
    ...moduleEntries.flatMap(({ moduleRoot, entries }) => entries
      .filter((name) => /PRD\.md$/i.test(name))
      .map((name) => path.join(moduleRoot, name))),
  ];
  return Promise.all(files.map(async (filePath) => {
    if (AUTOMATION_SOURCE_PATTERN.test(filePath)) throw new Error(`禁止读取自动化业务来源：${filePath}`);
    const markdown = await readFile(filePath, 'utf8');
    return {
      sourceFile: relative(infoRoot, filePath),
      searchableLines: indexPrdLines(markdown),
    };
  }));
}

function indexPrdLines(markdown: string) {
  const headingPath: Array<{ level: number; text: string }> = [];
  return markdown.replace(/\r\n/g, '\n').split('\n').flatMap((line, index) => {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      const level = heading[1].length;
      while (headingPath.at(-1)?.level && headingPath.at(-1)!.level >= level) headingPath.pop();
      headingPath.push({ level, text: heading[2].trim() });
    }
    const text = stripMarkdown(line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, ''));
    return text ? [{ line: index + 1, text, headingPath: headingPath.map((item) => item.text) }] : [];
  });
}

function resolvePrdCitations(
  sourceRaw: string,
  documents: Awaited<ReturnType<typeof readFormalPrdDocuments>>,
): SourceCitation[] {
  const fragments = sourceRaw.split('；').map((item) => item.trim()).filter(Boolean);
  return fragments.flatMap((fragment) => {
    if (/~~/.test(fragment) || !/PRD/i.test(fragment)) return [];
    const explicit = fragment.match(/^PRD明确\s*←\s*(.+)$/i)?.[1]
      ?? fragment.match(/^PRD\s+(?:§?[\d.]+\s*)?(.+)$/i)?.[1];
    if (!explicit) return [];
    const probe = stripMarkdown(explicit
      .replace(/（[^）]*(?:产品确认|Q-[^)]+)[^）]*）/g, '')
      .replace(/\s+\d+(?:[、,，]\d+)*$/g, '')
      .trim());
    if (probe.length < 4 || /^(?:列表|查询条件|其他信息|新增|编辑|删除)$/.test(probe)) return [];
    const normalizedProbe = normalize(probe);
    const matches = documents.flatMap((document) => document.searchableLines.flatMap((line) => {
      const lineText = normalize(line.text);
      const headingMatch = line.headingPath.some((heading) => normalize(heading) === normalizedProbe);
      const sentenceMatch = lineText === normalizedProbe || lineText.includes(normalizedProbe);
      return headingMatch || sentenceMatch ? [{ document, line }] : [];
    }));
    if (matches.length !== 1) return [];
    const match = matches[0];
    return [{
      kind: 'prd-explicit' as const,
      citation: probe,
      sourceFile: match.document.sourceFile,
      location: `${match.line.headingPath.join(' / ')} / line ${match.line.line}`,
      matchedText: match.line.text,
    }];
  });
}

function blockedDisposition(sourceRaw: string, deprecated: boolean) {
  if (deprecated) {
    return {
      blockCode: 'DEPRECATED_SOURCE',
      blockReason: '来源已明确标记为废弃，禁止迁移为现行业务规则。',
    };
  }
  if (/^XMind已有(?:；|$)/i.test(sourceRaw) || /XMind(?:已有)?\s*←/i.test(sourceRaw)) {
    return {
      blockCode: 'XMIND_EXACT_NODE_NOT_FOUND',
      blockReason: '原始 XMind 中未找到唯一精确节点路径或与用例标题完全相同的唯一节点。',
    };
  }
  if (/PRD/i.test(sourceRaw)) {
    return {
      blockCode: 'PRD_EXACT_CITATION_NOT_FOUND',
      blockReason: '正式 PRD 中未找到唯一精确章节或原句，现有摘要不足以确认。',
    };
  }
  if (/BR-[A-Z0-9]+(?:-[A-Z0-9]+)*/.test(sourceRaw)) {
    return {
      blockCode: 'BUSINESS_RULE_NOT_FORMAL',
      blockReason: '引用未能唯一匹配正式 BR 索引，禁止按标题或现有自动化行为补写。',
    };
  }
  return {
    blockCode: 'FORMAL_SOURCE_REQUIRED',
    blockReason: '仅有 Q-*、会议口径、现网观察、手工用例或模糊摘要，缺少精确 PRD、XMind 或正式 BR 引用。',
  };
}

function uniqueCitations(citations: readonly SourceCitation[]): SourceCitation[] {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    if (AUTOMATION_SOURCE_PATTERN.test(citation.sourceFile)) {
      throw new Error(`禁止将自动化脚本作为业务来源：${citation.sourceFile}`);
    }
    const key = `${citation.kind}|${citation.sourceFile}|${citation.location}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => left.kind.localeCompare(right.kind) || left.location.localeCompare(right.location));
}

function assertDecisionSet(
  decisions: readonly any[],
  normalizedCases: ReadonlyMap<string, any>,
  verifiedNormalizedIds: ReadonlySet<string>,
  manifestSummary: any,
): void {
  const normalizedEntries = [...normalizedCases.values()];
  const citationCount = normalizedEntries.reduce(
    (total, item) => total + (Array.isArray(item.citations) ? item.citations.length : 0),
    0,
  );
  const casesByModule = countBy(normalizedEntries, (item) => item.module);
  if (
    manifestSummary?.cases !== normalizedCases.size
    || manifestSummary?.citations !== citationCount
    || JSON.stringify(manifestSummary?.byModule ?? {}) !== JSON.stringify(casesByModule)
  ) {
    throw new Error('来源规范化清单摘要与实际条目不一致');
  }
  if (verifiedNormalizedIds.size !== normalizedCases.size) {
    throw new Error(
      `来源规范化数量错误：manifest=${normalizedCases.size}，verified=${verifiedNormalizedIds.size}`,
    );
  }
  const ids = new Set(decisions.map((item) => item.caseId));
  if (ids.size !== decisions.length) throw new Error('来源审计存在重复用例编号');
  if (decisions.some((item) => (
    (item.status === 'verified' && item.citations.length === 0)
    || (item.status === 'blocked' && item.citations.length > 0)
    || (item.status === 'not-applicable' && item.citations.length > 0)
  ))) {
    throw new Error('来源审计状态与精确证据不一致');
  }
  if ([...verifiedNormalizedIds].some((caseId) => ids.has(caseId))) {
    throw new Error('已规范化来源不得继续出现在 blocked 决策中');
  }
  for (const caseId of DEPRECATED_CASE_IDS) {
    const item = decisions.find((decision) => decision.caseId === caseId);
    if (!item || item.status !== 'not-applicable' || item.disposition !== 'not-applicable') {
      throw new Error(`废弃来源必须标记为 not-applicable：${caseId}`);
    }
  }
}

function pathEndsWith(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length < expected.length) return false;
  return expected.every((segment, index) => actual[actual.length - expected.length + index] === segment);
}

function pathContainsOrdered(actual: readonly string[], expected: readonly string[]): boolean {
  let expectedIndex = 0;
  for (const [actualIndex, segment] of actual.entries()) {
    const expectedSegment = expected[expectedIndex];
    const finalSegment = expectedIndex === expected.length - 1;
    const matches = segment === expectedSegment
      || (finalSegment && expectedSegment.length >= 2 && segment.includes(expectedSegment));
    if (matches) expectedIndex += 1;
    if (expectedIndex === expected.length) return actualIndex === actual.length - 1;
  }
  return false;
}

function countBy<T>(items: readonly T[], keyFor: (item: T) => string): Record<string, number> {
  const values = new Map<string, number>();
  items.forEach((item) => {
    const key = keyFor(item);
    values.set(key, (values.get(key) ?? 0) + 1);
  });
  return Object.fromEntries([...values.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function stripMarkdown(value: string): string {
  return value.replace(/[`*_~]/g, '').replace(/\s+/g, ' ').trim();
}

function normalize(value: string): string {
  return stripMarkdown(value).normalize('NFKC').toLowerCase();
}

function normalizePathSegment(value: string): string {
  return normalize(value).replace(/^[-•]\s*/, '').replace(/[；;。]+$/, '').trim();
}

function relative(root: string, filePath: string): string {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

async function main(): Promise<void> {
  const outputPath = await buildProductCenterUnsupportedSourceDecisions();
  process.stdout.write(`商品中心不支持来源格式审计已生成：${outputPath}\n`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
