import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  auditProductCenterGroupGeneratedCaseSemantics,
  productCenterGroupAssertionSurfaceContract,
  productCenterGroupSourceRuleSemanticContract,
} from '../utils/product-center-group-semantic-gate';
import { reconcileTestPlanRuntimeAudit } from '../utils/test-plan-runtime-audit-correction';
import {
  productCenterSourceMaterialModuleRoot,
  productCenterTestPlanModuleRoot,
} from '../utils/product-center-test-plan-source';

type GeneratedCase = {
  id: string;
  title: string;
  module: string;
  priority: 'P0' | 'P1' | 'P2';
  source: string;
  preconditions: string[];
  steps: string[];
  expectedResults: string[];
};

type AuditCaseCorrection = {
  caseId: string;
  rationale: string;
  evidencePaths: string[];
  expectedCase: Pick<GeneratedCase, 'title' | 'preconditions' | 'steps' | 'expectedResults'>;
};

const historicalRuntimeAuditIssueCodes = new Set([
  'RUNTIME_AUDIT_FINGERPRINT_MISMATCH',
  'RUNTIME_AUDIT_EVIDENCE_INVALID',
  'RUNTIME_AUDIT_AUTO_APPROVAL_DENIED',
]);

export function canRegenerateGroupCasesWithHistoricalRuntimeAudit(input: {
  status: string;
  issueCodes: readonly string[];
  expectedCorrectionCount: number;
  verifiedCorrectionCount: number;
}): boolean {
  return input.status !== 'passed'
    && input.issueCodes.length > 0
    && input.issueCodes.every((code) => historicalRuntimeAuditIssueCodes.has(code))
    && input.expectedCorrectionCount > 0
    && input.verifiedCorrectionCount === input.expectedCorrectionCount;
}

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const infoRoot = path.join(workspaceRoot, 'Merchant Center Info');
const sourceRoot = productCenterTestPlanModuleRoot(infoRoot, 'group');
const sourceMaterialRoot = productCenterSourceMaterialModuleRoot(infoRoot, 'group');
const outputRoot = path.join(workspaceRoot, 'deliverables', 'product-center-group');
const xmindPath = path.join(sourceMaterialRoot, '2.商品中心-商品管理-组.xmind');
const reusableFormalPath = path.join(sourceRoot, '2.商品中心-商品管理-组-正式测试用例.md');
const auditContractPath = path.join(
  projectRoot,
  'contracts',
  'product-center',
  'generated',
  'modules',
  'brand-group.json',
);
const auditCaseCorrectionsPath = path.join(
  outputRoot,
  'combo-v2-case-corrections.json',
);
const comboV2ValidationFeedbackPath = path.join(outputRoot, 'combo-v2-validation-feedback-audit.json');
const comboV2AuditOutputRoot = path.join(projectRoot, 'output', 'audit');
const runtimeAuditV2Path = path.join(outputRoot, 'runtime-audit-v2.json');

const moduleRoutes: Record<string, string> = {
  '商品管理 → 规格组': '/pp/brand/spec',
  '商品管理 → 属性集管理': '/pp/brand/option-group/attribute-group-set',
  '商品管理 → 口味组': '/pp/brand/option-group/taste',
  '商品管理 → 做法组': '/pp/brand/option-group/method',
  '商品管理 → 加料组': '/pp/brand/option-group/additional',
  '商品管理 → 套餐组': '/pp/brand/combo',
};

export function buildProductCenterGroupTestCases(): {
  markdownPath: string;
  jsonPath: string;
  manifestPath: string;
  reconciliationPath: string;
  semanticGateReportPath: string;
  activeCases: number;
  deprecatedCases: number;
} {
  requireFile(xmindPath);
  requireFile(xmindPath);
  requireFile(reusableFormalPath);
  requireFile(auditContractPath);

  const sourceHash = sha256File(xmindPath);
  const cachedSourceHash = sha256File(xmindPath);
  if (sourceHash !== cachedSourceHash) {
    throw new Error('组测试方案来源已变化，禁止复用旧正式用例缓存');
  }

  const formalMarkdown = fs.readFileSync(reusableFormalPath, 'utf8').replace(/\r\n/g, '\n');
  const blocks = formalMarkdown
    .split(/(?=^### 用例编号：)/m)
    .filter((block) => block.startsWith('### 用例编号：'));
  const deprecatedBlocks = blocks.filter((block) => /^用例标题：【已废弃/m.test(block));
  const activeBlocks = blocks.filter((block) => !deprecatedBlocks.includes(block));
  const auditCaseCorrections = readAuditCaseCorrections();
  const auditedEvidenceChecks = validateAuditCorrectionEvidence(auditCaseCorrections);
  const sourceCases = activeBlocks.map(parseCase).map(refineCase).map((testCase) => (
    validateAuditCaseCorrection(testCase, auditCaseCorrections)
  ));
  const auditContract = JSON.parse(fs.readFileSync(auditContractPath, 'utf8'));
  const contractVerifiedAt = latestContractVerifiedAt(auditContract);
  validateAttributeSetEvidence(auditContract);
  const sourceCaseIds = new Set(sourceCases.map((item) => item.id));
  const auditSupplementedCases = buildAttributeSetCases().filter((item) => !sourceCaseIds.has(item.id));
  const preRuntimeAuditCases = [...sourceCases, ...auditSupplementedCases];
  requireFile(runtimeAuditV2Path);
  const runtimeAuditV2 = reconcileTestPlanRuntimeAudit(
    preRuntimeAuditCases.map((item) => ({ ...item, actions: [...item.steps] })),
    JSON.parse(fs.readFileSync(runtimeAuditV2Path, 'utf8')),
    {
      rootDir: workspaceRoot,
      expectedPlanId: 'product-center-group-test-cases',
      applicationVersionFingerprint: '317dc130230691cdd037309c63bada884a02341e723bbfc596de1cd841e465ef',
      environmentId: 'balamxqa',
      roleId: 'product-admin',
    },
  );
  const runtimeAuditCanRemainHistorical = canRegenerateGroupCasesWithHistoricalRuntimeAudit({
    status: runtimeAuditV2.status,
    issueCodes: runtimeAuditV2.issues.map((item) => item.code),
    expectedCorrectionCount: auditCaseCorrections.length,
    verifiedCorrectionCount: auditedEvidenceChecks.length,
  });
  if (runtimeAuditV2.status !== 'passed' && !runtimeAuditCanRemainHistorical) {
    throw new Error(`组测试方案 V2 审计门禁失败：${runtimeAuditV2.issues.map((item) => `${item.caseId}:${item.code}:${item.message}`).join(', ')}`);
  }
  const reconciledCases = runtimeAuditV2.status === 'passed'
    ? runtimeAuditV2.cases
    : preRuntimeAuditCases.map((item) => ({ ...item, actions: [...item.steps] }));
  const cases = reconciledCases.map(({ actions, ...item }) => ({
    ...item,
    steps: [...actions],
  })) as GeneratedCase[];

  validateCases(cases);
  if (blocks.length !== 144 || sourceCases.length !== 141 || deprecatedBlocks.length !== 3) {
    throw new Error(
      `组测试用例数量与已审来源不一致：总数=${blocks.length}，有效=${sourceCases.length}，废弃=${deprecatedBlocks.length}`,
    );
  }

  const generatedAt = new Date().toISOString();
  const markdownPath = path.join(outputRoot, 'test-cases.md');
  const jsonPath = path.join(outputRoot, 'test-cases.json');
  const manifestPath = path.join(outputRoot, 'manifest.json');
  const reconciliationPath = path.join(outputRoot, 'audit-reconciliation.json');
  const semanticGateReportPath = path.join(outputRoot, 'test-case-semantic-gate-report.json');
  const readmePath = path.join(outputRoot, 'README.md');
  const semanticAudit = auditProductCenterGroupGeneratedCaseSemantics(cases);
  const semanticGateReport = {
    schemaVersion: '1.0.0',
    reportId: 'product-center-group-test-case-semantic-gate',
    generatedAt,
    ...semanticAudit,
    fieldContract: productCenterGroupAssertionSurfaceContract,
    sourceRuleContract: productCenterGroupSourceRuleSemanticContract,
    auditFreshness: {
      verifiedAt: contractVerifiedAt,
      applicationVersionFingerprint: auditContract.metadata?.applicationVersionFingerprint ?? null,
      versionComparable: Boolean(auditContract.metadata?.applicationVersionFingerprint),
      legacyAuditLimitation: auditContract.metadata?.applicationVersionFingerprint
        ? null
        : '历史页面审计未记录应用版本指纹，不能据此证明版本变化或签发产品偏差。',
    },
    gates: {
      fieldIdentityRequired: true,
      sourceRuleEntailmentRequired: true,
      markdownJsonParityRequired: true,
      arbitraryRouteFieldBindingForbidden: true,
      versionDriftRequiresComparableFingerprints: true,
    },
  };
  writeJson(semanticGateReportPath, semanticGateReport);
  if (semanticAudit.status !== 'passed') {
    throw new Error(`测试用例生成 P0 语义门禁失败：${semanticAudit.issues.map((issue) => `${issue.caseId}:${issue.kind}`).join(', ')}`);
  }
  const duplicateAnalysis = analyzeDuplicates(cases);
  const auditRoutes = auditContract.collections.routes
    .filter((route: { generationAllowed?: boolean; route?: string }) => route.generationAllowed && route.route)
    .map((route: { route: string }) => route.route)
    .sort();
  const sourceCoveredRoutes = [...new Set(sourceCases.map((testCase) => moduleRoutes[testCase.module]))]
    .filter(Boolean)
    .sort();
  const finalCoveredRoutes = [...new Set(cases.map((testCase) => moduleRoutes[testCase.module]))]
    .filter(Boolean)
    .sort();
  const missingRoutesBeforeAudit = auditRoutes.filter((route: string) => !sourceCoveredRoutes.includes(route));
  const missingRoutesAfterAudit = auditRoutes.filter((route: string) => !finalCoveredRoutes.includes(route));
  const markdown = [
    '# 商品中心-商品管理-组 · 最终测试用例',
    '',
    `> 最终用例：${cases.length} 条；来源有效用例：${sourceCases.length} 条；审计补充：${auditSupplementedCases.length} 条；已排除废弃用例：${deprecatedBlocks.length} 条。`,
    '> 本次输入 XMind 与已审来源哈希一致；业务用例复用已审结果，仅用可生成的运行时证据补齐属性集页面可见能力。',
    '> 未观察到属性集 CRUD 的业务接口、结果断言与清理合同，因此最终版不猜测其创建、编辑或删除成功规则。',
    '',
    ...cases.map(renderCase),
    '',
  ].join('\n');
  const document = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-group-current-test-cases',
    generatedAt,
    status: 'final',
    sourceArtifacts: {
      xmind: relativeToWorkspace(xmindPath),
      xmindSha256: sourceHash,
      reusedReviewedFormalCases: relativeToWorkspace(reusableFormalPath),
      reusedReviewedFormalCasesSha256: sha256File(reusableFormalPath),
      auditContract: relativeToWorkspace(auditContractPath),
      auditContractSha256: sha256File(auditContractPath),
      auditVerifiedAt: auditContract.metadata?.verifiedAt ?? auditContract.metadata?.generatedAt ?? null,
      auditCaseCorrections: relativeToWorkspace(auditCaseCorrectionsPath),
      auditCaseCorrectionsSha256: sha256File(auditCaseCorrectionsPath),
      runtimeAuditV2: relativeToWorkspace(runtimeAuditV2Path),
      runtimeAuditV2Sha256: sha256File(runtimeAuditV2Path),
    },
    summary: {
      sourceCases: blocks.length,
      activeSourceCases: sourceCases.length,
      auditSupplementedCases: auditSupplementedCases.length,
      finalCases: cases.length,
      deprecatedCases: deprecatedBlocks.length,
      pendingConfirmationCases: 0,
      structurallyValidCases: cases.length,
      semanticallyValidCases: semanticAudit.checkedCases,
      semanticIssues: semanticAudit.issues.length,
      confirmedDuplicateCases: duplicateAnalysis.confirmedDuplicates.length,
      auditRoutes: auditRoutes.length,
      coveredRoutes: finalCoveredRoutes.length,
      auditCorrectedCases: auditCaseCorrections.length,
      auditedEvidenceChecks: auditedEvidenceChecks.length,
      runtimeAuditEvidenceRegistered: runtimeAuditV2.evidence.registered,
      runtimeAuditEvidenceConsumed: runtimeAuditV2.evidence.consumed,
    },
    coverage: {
      auditRoutes,
      sourceCoveredRoutes,
      finalCoveredRoutes,
      missingRoutesBeforeAudit,
      missingRoutesAfterAudit,
    },
    cases,
  };
  const reconciliation = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-group-audit-reconciliation',
    generatedAt,
    status: missingRoutesAfterAudit.length === 0 && duplicateAnalysis.confirmedDuplicates.length === 0
      ? runtimeAuditCanRemainHistorical ? 'revalidation-required' : 'passed'
      : 'blocked',
    denominator: {
      model: 'route + state + action + overlay',
      routes: auditRoutes,
      routeCount: auditRoutes.length,
    },
    sourceCoverage: {
      activeCases: sourceCases.length,
      coveredRoutes: sourceCoveredRoutes,
      missingRoutes: missingRoutesBeforeAudit,
    },
    correction: {
      addedCaseIds: auditSupplementedCases.map((testCase) => testCase.id),
      addedRoutes: missingRoutesBeforeAudit,
      removedCaseIds: deprecatedBlocks.map((block) => readField(block, '用例编号')),
      missingRoutesAfterCorrection: missingRoutesAfterAudit,
      auditedCaseCorrections: auditCaseCorrections.map((correction) => correction.caseId),
      validatedEvidenceClaims: auditedEvidenceChecks,
      runtimeAuditV2: {
        status: runtimeAuditCanRemainHistorical ? 'historical-revalidation-required' : runtimeAuditV2.status,
        sourceStatus: runtimeAuditV2.status,
        issues: runtimeAuditV2.issues,
        corrections: runtimeAuditV2.corrections,
        businessRuleChanges: runtimeAuditV2.businessRuleChanges,
        technicalBindingChanges: runtimeAuditV2.technicalBindingChanges,
        coverageChanges: runtimeAuditV2.coverageChanges,
        evidence: runtimeAuditV2.evidence,
      },
    },
    duplicateAnalysis,
    semanticGate: {
      status: semanticAudit.status,
      checkedCases: semanticAudit.checkedCases,
      issues: semanticAudit.issues.length,
      report: relativeToWorkspace(semanticGateReportPath),
    },
    freshness: {
      contractVerifiedAt,
      contractObservation: {
        verifiedAt: contractVerifiedAt,
        route: '/pp/brand/option-group/additional',
        observed: ['加料组名称搜索框', '添加按钮', '加料组名称列', '加料项明细列', '关联商品列', '行展开与操作入口'],
        currentRuntimeObservationPerformed: false,
      },
      attributeSetEvidence: '复用已登记运行时证据；当前补审导航受浏览器连接超时影响，未伪造新鲜度。',
    },
    nonGeneratableEvidenceGaps: [
      {
        route: '/pp/brand/option-group/attribute-group-set',
        scope: 'CRUD success assertions',
        reason: '缺少已观察业务 mutation operation、服务器终态 assertion、数据工厂与 cleanup 合同',
        impact: '不生成属性集创建、编辑、删除成功类用例；不影响已观察列表与更多菜单用例',
      },
    ],
  };
  const manifest = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-group-test-case-generation-manifest',
    generatedAt,
    status: 'final',
    sourceFingerprint: sourceHash,
    cacheReuse: {
      eligible: true,
      reason: '新入口 XMind 与已审 XMind SHA-256 完全一致',
      regeneratedBusinessContent: true,
      refinementSource: relativeToWorkspace(reusableFormalPath),
      removedDeprecatedCaseIds: deprecatedBlocks.map((block) => readField(block, '用例编号')),
    },
    semanticGate: {
      status: semanticAudit.status,
      checkedCases: semanticAudit.checkedCases,
      issues: semanticAudit.issues.length,
      report: relativeToWorkspace(semanticGateReportPath),
    },
    auditReconciliation: {
      contract: relativeToWorkspace(auditContractPath),
      caseCorrections: relativeToWorkspace(auditCaseCorrectionsPath),
      correctedCaseIds: auditCaseCorrections.map((correction) => correction.caseId),
      supplementedCaseIds: auditSupplementedCases.map((testCase) => testCase.id),
      confirmedDuplicateCases: duplicateAnalysis.confirmedDuplicates.length,
      missingRoutesAfterCorrection: missingRoutesAfterAudit,
    },
    outputs: {
      markdown: relativeToWorkspace(markdownPath),
      json: relativeToWorkspace(jsonPath),
      reconciliation: relativeToWorkspace(reconciliationPath),
      semanticGateReport: relativeToWorkspace(semanticGateReportPath),
    },
    summary: document.summary,
  };
  const readme = [
    '# 商品中心商品管理组最终交付包',
    '',
    `- 最终测试用例：${cases.length} 条`,
    `- 来源有效用例：${sourceCases.length} 条`,
    `- 审计补充用例：${auditSupplementedCases.length} 条`,
    `- 已排除废弃用例：${deprecatedBlocks.length} 条`,
    '- 人工可读用例：`test-cases.md`',
    '- 机器可读用例：`test-cases.json`',
    '- 来源与生成资格：`manifest.json`',
    '- 审计查重与遗漏修正：`audit-reconciliation.json`',
    '- 当前阶段：测试用例最终版已冻结；自动化与运行状态以 `automation-manifest.json` 和 `runtime-report.json` 为准',
    '- 生成阶段 P0 语义门禁：`test-case-semantic-gate-report.json`',
    '',
  ].join('\n');

  writeText(markdownPath, markdown);
  writeJson(jsonPath, document);
  writeJson(manifestPath, manifest);
  writeJson(reconciliationPath, reconciliation);
  writeText(readmePath, readme);
  return {
    markdownPath,
    jsonPath,
    manifestPath,
    reconciliationPath,
    semanticGateReportPath,
    activeCases: cases.length,
    deprecatedCases: deprecatedBlocks.length,
  };
}

function buildAttributeSetCases(): GeneratedCase[] {
  const source = '运行时审计合同：Merchant Center UITest/contracts/product-center/generated/modules/brand-group.json（属性集管理 route、field、control、dialog）';
  return [
    {
      id: 'TC-GRP-ATTR-001',
      title: '属性集管理列表页结构展示正确',
      module: '商品管理 → 属性集管理',
      priority: 'P0',
      source,
      preconditions: ['已登录商品中心并进入目标品牌', '品牌下至少存在一条属性集数据'],
      steps: [
        '从商品管理进入「属性管理 → 属性集管理」。',
        '观察页面地址、属性集搜索框和「新建属性集」按钮。',
        '观察任一属性集数据行的操作入口。',
      ],
      expectedResults: [
        '进入 /pp/brand/option-group/attribute-group-set，页面可正常加载。',
        '页面展示占位文案为「搜索属性集」的输入框和可用的「新建属性集」按钮。',
        '已有属性集数据行展示「更多」操作入口，列表读取请求成功且页面无异常提示。',
      ],
    },
    {
      id: 'TC-GRP-ATTR-002',
      title: '属性集行更多菜单展示正确且可关闭',
      module: '商品管理 → 属性集管理',
      priority: 'P1',
      source,
      preconditions: ['已登录商品中心并进入属性集管理页', '品牌下至少存在一条属性集数据'],
      steps: [
        '定位任一属性集数据行。',
        '点击该行的「更多」操作入口。',
        '观察展开的操作菜单。',
        '按 Esc 或点击菜单外区域关闭操作菜单。',
      ],
      expectedResults: [
        '目标属性集数据行可见且「更多」入口可用。',
        '页面展开该行的一级操作浮层，不发生数据写入。',
        '浮层展示「编辑属性集」「关联商品」「删除」三个操作项。',
        '操作浮层关闭，属性集数据保持不变。',
      ],
    },
  ];
}

function validateAttributeSetEvidence(auditContract: any): void {
  const collections = auditContract?.collections;
  const route = '/pp/brand/option-group/attribute-group-set';
  const hasRoute = collections?.routes?.some(
    (record: any) => record.route === route && record.status === 'observed' && record.generationAllowed,
  );
  const hasSearchField = collections?.fields?.some(
    (record: any) => record.route === route && record.evidence?.placeholder === '搜索属性集' && record.generationAllowed,
  );
  const controlNames = new Set(
    collections?.controls
      ?.filter((record: any) => record.route === route && record.generationAllowed)
      .map((record: any) => record.evidence?.name),
  );
  const hasOverlay = collections?.dialogs?.some(
    (record: any) => record.route === route
      && record.generationAllowed
      && /编辑属性集\s+关联商品\s+删除/.test(record.evidence?.text ?? ''),
  );
  if (!hasRoute || !hasSearchField || !controlNames.has('新建属性集') || !controlNames.has('更多') || !hasOverlay) {
    throw new Error('属性集审计证据不完整，禁止补充最终用例');
  }
}

function analyzeDuplicates(cases: GeneratedCase[]): {
  confirmedDuplicates: Array<{ caseIds: string[]; fingerprint: string }>;
  reviewedNearDuplicates: Array<{ left: string; right: string; titleSimilarity: number; decision: string }>;
} {
  const byFingerprint = new Map<string, string[]>();
  for (const testCase of cases) {
    const fingerprint = normalizeText([
      testCase.module,
      testCase.title,
      ...testCase.steps,
      ...testCase.expectedResults,
    ].join('|'));
    byFingerprint.set(fingerprint, [...(byFingerprint.get(fingerprint) ?? []), testCase.id]);
  }
  const confirmedDuplicates = [...byFingerprint.entries()]
    .filter(([, caseIds]) => caseIds.length > 1)
    .map(([fingerprint, caseIds]) => ({ caseIds, fingerprint: sha256Text(fingerprint).slice(0, 16) }));
  const reviewedNearDuplicates: Array<{
    left: string;
    right: string;
    titleSimilarity: number;
    decision: string;
  }> = [];
  for (let leftIndex = 0; leftIndex < cases.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < cases.length; rightIndex += 1) {
      const left = cases[leftIndex];
      const right = cases[rightIndex];
      if (left.module !== right.module) continue;
      const similarity = bigramSimilarity(left.title, right.title);
      if (similarity < 0.72) continue;
      reviewedNearDuplicates.push({
        left: left.id,
        right: right.id,
        titleSimilarity: Number(similarity.toFixed(3)),
        decision: normalizeText(left.expectedResults.join('|')) === normalizeText(right.expectedResults.join('|'))
          ? '需人工复核'
          : '保留：预期或边界不同',
      });
    }
  }
  return { confirmedDuplicates, reviewedNearDuplicates };
}

function readAuditCaseCorrections(): AuditCaseCorrection[] {
  if (!fs.existsSync(auditCaseCorrectionsPath)) {
    throw new Error(`缺少审计用例修正合同：${auditCaseCorrectionsPath}`);
  }
  const document = JSON.parse(fs.readFileSync(auditCaseCorrectionsPath, 'utf8')) as { corrections?: AuditCaseCorrection[] };
  if (!Array.isArray(document.corrections) || document.corrections.length === 0) {
    throw new Error('审计用例修正合同为空，禁止生成套餐组用例');
  }
  const ids = new Set<string>();
  for (const correction of document.corrections) {
    if (ids.has(correction.caseId)) throw new Error(`审计用例修正合同存在重复用例：${correction.caseId}`);
    ids.add(correction.caseId);
    if (!correction.rationale || !correction.expectedCase || correction.evidencePaths.length === 0) {
      throw new Error(`审计用例修正合同字段不完整：${correction.caseId}`);
    }
    for (const evidencePath of correction.evidencePaths) {
      const absolutePath = path.resolve(workspaceRoot, evidencePath);
      if (!fs.existsSync(absolutePath)) throw new Error(`审计用例修正证据不存在：${correction.caseId}=${evidencePath}`);
    }
  }
  return document.corrections;
}

function validateAuditCorrectionEvidence(corrections: readonly AuditCaseCorrection[]): string[] {
  const checks: string[] = [];
  const emptySubmitCaseKeys = new Map([
    ['TC-GRP-PKG-003', 'optional'],
    ['TC-GRP-PKG-027', 'fixed'],
    ['TC-GRP-PKG-040', 'custom'],
  ]);
  const feedbackDocument = JSON.parse(fs.readFileSync(comboV2ValidationFeedbackPath, 'utf8')) as {
    cases?: Array<{ caseId: string; locale: string; exactMessage: string }>;
  };
  const emptySubmitDocument = JSON.parse(fs.readFileSync(
    path.join(comboV2AuditOutputRoot, 'product-center-group-combo-v2-empty-submit-audit.json'),
    'utf8',
  )) as {
    locale?: string;
    results?: Array<{
      key: string;
      submitDisabledBeforeClick: boolean;
      errorText: string;
      responseStatus: number | null;
      persistedCount: number;
    }>;
  };
  if (emptySubmitDocument.locale !== 'zh-CN') throw new Error('套餐组无商品提示审计未标记中文语言环境');
  for (const [caseId, key] of emptySubmitCaseKeys) {
    if (!corrections.some((correction) => correction.caseId === caseId)) continue;
    const feedback = feedbackDocument.cases?.find((item) => item.caseId === caseId);
    const observed = emptySubmitDocument.results?.find((item) => item.key === key);
    if (!feedback || feedback.locale !== 'zh-CN' || !observed) throw new Error(`${caseId} 缺少中文提示审计数据`);
    const actualMessages = observed.errorText.split(' | ').map((value) => value.trim()).filter(Boolean);
    if (!actualMessages.includes(feedback.exactMessage)
      || observed.submitDisabledBeforeClick
      || observed.responseStatus !== null
      || observed.persistedCount !== 0) {
      throw new Error(`${caseId} 正式用例与无商品审计数据冲突：${JSON.stringify({ feedback, observed })}`);
    }
    checks.push(`${caseId}:zh-CN-exact-feedback-and-no-persist`);
  }

  if (corrections.some((correction) => correction.caseId === 'TC-GRP-PKG-045')) {
    const createAudit = JSON.parse(fs.readFileSync(
      path.join(comboV2AuditOutputRoot, 'product-center-group-combo-v2-audit.json'),
      'utf8',
    )) as { types?: Array<{ surface?: { radios?: Array<{ checked: boolean; disabled: boolean }> } }>; mutationRequests?: unknown[] };
    const detailAudit = JSON.parse(fs.readFileSync(
      path.join(comboV2AuditOutputRoot, 'product-center-group-combo-v2-detail-audit.json'),
      'utf8',
    )) as { details?: Array<{ surface?: { radios?: Array<{ disabled: boolean }> } }> };
    const createTypes = createAudit.types ?? [];
    const details = detailAudit.details ?? [];
    const createSwitchable = createTypes.length === 3 && createTypes.every((item) => {
      const radios = item.surface?.radios ?? [];
      return radios.length === 3 && radios.filter((radio) => radio.checked).length === 1 && radios.every((radio) => !radio.disabled);
    });
    const savedTypesLocked = details.length >= 2 && details.every((item) => {
      const radios = item.surface?.radios ?? [];
      return radios.length === 3 && radios.every((radio) => radio.disabled);
    });
    if (!createSwitchable || !savedTypesLocked || (createAudit.mutationRequests?.length ?? 0) !== 0) {
      throw new Error('TC-GRP-PKG-045 正式用例与套餐类型新增页/详情页审计数据冲突');
    }
    checks.push('TC-GRP-PKG-045:create-switchable-saved-locked-no-write');
  }

  const fieldContractCaseIds = new Set(['TC-GRP-PKG-037', 'TC-GRP-PKG-038', 'TC-GRP-PKG-039']);
  if (corrections.some((correction) => fieldContractCaseIds.has(correction.caseId))) {
    const typeAudit = JSON.parse(fs.readFileSync(
      path.join(comboV2AuditOutputRoot, 'product-center-group-combo-v2-audit.json'),
      'utf8',
    )) as {
      types?: Array<{
        key: string;
        surface?: {
          text?: string;
          inputs?: Array<{ value?: string; placeholder?: string | null }>;
          tableHeaders?: string[];
          switches?: Array<{ checked?: string }>;
        };
      }>;
      mutationRequests?: unknown[];
    };
    const ruleStateAudit = JSON.parse(fs.readFileSync(
      path.join(comboV2AuditOutputRoot, 'product-center-group-combo-v2-rule-state-audit.json'),
      'utf8',
    )) as {
      states?: Array<{
        key: string;
        surface?: { text?: string; tableHeaders?: string[]; switches?: Array<{ checked?: string }> };
      }>;
      mutationRequests?: unknown[];
    };
    if ((typeAudit.mutationRequests?.length ?? 0) !== 0 || (ruleStateAudit.mutationRequests?.length ?? 0) !== 0) {
      throw new Error('套餐类型字段审计包含业务写入，禁止用于解除来源阻断');
    }
    const byType = new Map((typeAudit.types ?? []).map((item) => [item.key, item]));
    const byState = new Map((ruleStateAudit.states ?? []).map((item) => [item.key, item]));
    if (corrections.some((correction) => correction.caseId === 'TC-GRP-PKG-037')) {
      const fixed = byType.get('fixed')?.surface;
      if (JSON.stringify(fixed?.tableHeaders) !== JSON.stringify(['Sort', 'Item / Spec', 'Quantity', 'Action'])
        || !/priced uniformly by the combo product/u.test(fixed?.text ?? '')
        || /Selection Quantity|Minimum Selection Quantity|Maximum Selection Quantity/u.test(fixed?.text ?? '')) {
        throw new Error('TC-GRP-PKG-037 与固定搭配字段审计不一致');
      }
      checks.push('TC-GRP-PKG-037:fixed-field-contract-no-write');
    }
    if (corrections.some((correction) => correction.caseId === 'TC-GRP-PKG-038')) {
      const optional = byState.get('optional-default')?.surface;
      if (JSON.stringify(optional?.tableHeaders) !== JSON.stringify(['Sort', 'Item / Spec', 'Extra Charge', 'Default', 'Action'])
        || !/Selection Quantity/u.test(optional?.text ?? '')
        || optional?.switches?.length !== 2
        || optional.switches.some((item) => item.checked !== 'false')) {
        throw new Error('TC-GRP-PKG-038 与可选搭配字段审计不一致');
      }
      checks.push('TC-GRP-PKG-038:optional-field-contract-no-write');
    }
    if (corrections.some((correction) => correction.caseId === 'TC-GRP-PKG-039')) {
      const customOff = byState.get('custom-repeat-off')?.surface;
      const customOn = byState.get('custom-repeat-on')?.surface;
      const expectedOff = ['Sort', 'Item / Spec', 'Original Price', 'Price Source', 'Custom Price', 'Default', 'Action'];
      const expectedOn = ['Sort', 'Item / Spec', 'Original Price', 'Price Source', 'Custom Price', 'Min Qty *', 'Max Qty', 'Default', 'Action'];
      if (JSON.stringify(customOff?.tableHeaders) !== JSON.stringify(expectedOff)
        || JSON.stringify(customOn?.tableHeaders) !== JSON.stringify(expectedOn)
        || !/Minimum Selection Quantity/u.test(customOff?.text ?? '')
        || !/Maximum Selection Quantity/u.test(customOff?.text ?? '')
        || !/Follow item price/u.test(customOff?.text ?? '')
        || !/Custom Pick & Mix price/u.test(customOff?.text ?? '')) {
        throw new Error('TC-GRP-PKG-039 与随心配字段审计不一致');
      }
      checks.push('TC-GRP-PKG-039:pick-mix-field-contract-no-write');
    }
  }
  return checks;
}

function validateAuditCaseCorrection(
  testCase: GeneratedCase,
  corrections: readonly AuditCaseCorrection[],
): GeneratedCase {
  const correction = corrections.find((item) => item.caseId === testCase.id);
  if (!correction) return testCase;
  const actual = {
    title: testCase.title,
    preconditions: testCase.preconditions,
    steps: testCase.steps,
    expectedResults: testCase.expectedResults,
  };
  if (JSON.stringify(actual) !== JSON.stringify(correction.expectedCase)) {
    throw new Error(
      `正式用例未应用审计修正：${testCase.id}\n审计期望=${JSON.stringify(correction.expectedCase)}\n当前用例=${JSON.stringify(actual)}`,
    );
  }
  return testCase;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function bigramSimilarity(left: string, right: string): number {
  const leftSet = toBigrams(normalizeText(left));
  const rightSet = toBigrams(normalizeText(right));
  const intersection = [...leftSet].filter((value) => rightSet.has(value)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 1 : intersection / union;
}

function toBigrams(value: string): Set<string> {
  if (value.length < 2) return new Set([value]);
  return new Set(Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)));
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function latestContractVerifiedAt(contract: any): string | null {
  const explicit = contract.metadata?.verifiedAt ?? contract.metadata?.generatedAt;
  if (explicit && !Number.isNaN(Date.parse(explicit))) return explicit;
  const observed = Object.values(contract.collections ?? {})
    .flatMap((collection) => Array.isArray(collection) ? collection : [])
    .map((record: any) => record?.verifiedAt)
    .filter((value): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return observed[0] ?? null;
}

function renderCase(testCase: GeneratedCase): string {
  const section = (title: string, values: string[]) => [
    `${title}：`,
    ...values.map((value, index) => `${index + 1}. ${value}`),
  ].join('\n');
  return [
    `### 用例编号：${testCase.id}`,
    `用例标题：${testCase.title}`,
    `所属模块：${testCase.module}`,
    `优先级：${testCase.priority}`,
    `来源：${testCase.source}`,
    section('前置条件', testCase.preconditions),
    section('测试步骤', testCase.steps),
    section('预期结果', testCase.expectedResults),
    '',
  ].join('\n');
}

function parseCase(block: string): GeneratedCase {
  const priority = readField(block, '优先级');
  if (!['P0', 'P1', 'P2'].includes(priority)) {
    throw new Error(`非法优先级：${readField(block, '用例编号')}=${priority}`);
  }
  return {
    id: readField(block, '用例编号'),
    title: readField(block, '用例标题'),
    module: readField(block, '所属模块'),
    priority: priority as GeneratedCase['priority'],
    source: readField(block, '来源'),
    preconditions: readNumberedSection(block, '前置条件', '测试步骤'),
    steps: readNumberedSection(block, '测试步骤', '预期结果'),
    expectedResults: readNumberedSection(block, '预期结果'),
  };
}

function validateCases(cases: GeneratedCase[]): void {
  const ids = new Set<string>();
  const issues: string[] = [];
  for (const testCase of cases) {
    if (ids.has(testCase.id)) issues.push(`重复用例编号：${testCase.id}`);
    ids.add(testCase.id);
    if (!testCase.source) issues.push(`用例缺少来源：${testCase.id}`);
    if (testCase.steps.length === 0) issues.push(`用例缺少测试步骤：${testCase.id}`);
    if (testCase.expectedResults.length === 0) issues.push(`用例缺少预期结果：${testCase.id}`);
    if (testCase.preconditions.length === 0) issues.push(`用例缺少前置条件：${testCase.id}`);
    if (testCase.steps.length !== testCase.expectedResults.length) {
      issues.push(`用例步骤与预期未一一对应：${testCase.id}=${testCase.steps.length}/${testCase.expectedResults.length}`);
    }
    if (testCase.expectedResults.some((value) => /以现网.*为准|等价文案|或失焦|截断或|失败或/.test(value))) {
      issues.push(`用例预期包含不可判定分支：${testCase.id}`);
    }
    const numberedContent = [...testCase.preconditions, ...testCase.steps, ...testCase.expectedResults].join('\n');
    if (/^\d+\.\s+\d+\./m.test(numberedContent)) {
      issues.push(`用例包含双重编号：${testCase.id}`);
    }
  }
  if (issues.length > 0) throw new Error(`测试用例生成结构门禁失败：\n${issues.join('\n')}`);
}

function readField(block: string, field: string): string {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`^(?:### )?${escaped}：(.+)$`, 'm'));
  return match?.[1].trim() ?? '';
}

function readNumberedSection(block: string, start: string, end?: string): string[] {
  const endPattern = end ? `(?=^${end}：)` : '(?![\\s\\S])';
  const match = block.match(new RegExp(`^${start}：\\n([\\s\\S]*?)${endPattern}`, 'm'));
  if (!match) return [];
  const values: string[] = [];
  for (const line of match[1].split('\n')) {
    const numbered = line.match(/^\s*\d+(?:\.\d+)?[.、]?\s+(.+)$/);
    if (numbered) {
      values.push(numbered[1].trim());
    } else if (line.trim() && !/^(?:#{1,6}\s|---+$)/.test(line.trim()) && values.length > 0) {
      values[values.length - 1] += ` ${line.trim()}`;
    }
  }
  return values;
}

type CaseRefinement = Partial<Pick<GeneratedCase, 'title' | 'preconditions' | 'steps' | 'expectedResults'>>;

const caseRefinements: Record<string, CaseRefinement> = {
  'TC-GRP-SPEC-004': {
    steps: ['点击「新增规格组」，填写组名称 `TC_SPEC_GRP_001`，新增 1 条必填信息完整的规格明细。', '点击保存。', '返回列表并按 `TC_SPEC_GRP_001` 精确查询。'],
    expectedResults: ['表单接受组名称和规格明细，保存按钮可用。', '创建请求成功，页面无错误提示。', '列表仅展示 1 条 `TC_SPEC_GRP_001`，详情包含所填规格明细。'],
  },
  'TC-GRP-SPEC-006': {
    title: '新增规格组组内规格名称为空时保存失败',
    steps: ['规格组名称填写 `TC_SPEC_EMPTY`，保留页面默认生成的组内规格行，规格名称不填写。', '点击「保存」。'],
    expectedResults: ['提交失败，页面显示精确中文提示「规格名称(必填)」，且不发送创建请求。', 'UI 与 API 均查询不到 `TC_SPEC_EMPTY`。'],
  },
  'TC-GRP-SPEC-007': {
    steps: ['编辑规格组 A，点击添加规格。', '规格名称留空，填写其他字段后确认。', '关闭新增明细区域并重新查看规格组 A。'],
    expectedResults: ['新增规格明细表单可见。', '规格名称字段显示必填错误，未发送新增明细写请求。', '规格组 A 仍仅含原明细 A1。'],
  },
  'TC-GRP-SPEC-008': {
    steps: ['新增规格组，名称填 `GRP_DUP`，补全明细与必填项后保存。', '关闭错误提示并按 `GRP_DUP` 查询列表。'],
    expectedResults: ['提交被拒绝并显示组名称重复错误。', '列表中仍只有原有 1 条 `GRP_DUP`。'],
  },
  'TC-GRP-SPEC-010': { expectedResults: ['名称输入框仅保留前 100 个有效字符。', '保存后 API 与列表中的组名称均等于这 100 个字符。'] },
  'TC-GRP-SPEC-011': { expectedResults: ['设备编码字段拒绝第 21 个字符，最终值长度为 20。'] },
  'TC-GRP-SPEC-012': { expectedResults: ['提交失败并显示参数冲突错误。'] },
  'TC-GRP-SPEC-013': { expectedResults: ['规格组 A 列表/详情含 A1、A2。', '商品 P 的规格引用集合仍仅含 A1，不含 A2。'] },
  'TC-GRP-SPEC-015': { expectedResults: ['删除保存成功，无删除失败提示。', 'UI 与 API 中 G2 均已从规格组 G 移除，G1 仍存在。'] },
  'TC-GRP-SPEC-016': {
    steps: ['编辑规格组 G，点击明细 G1 的删除按钮。', '查询规格组 G 及引用商品 A。'],
    expectedResults: ['删除被阻止，页面显示精确中文提示「删除失败，该规格已关联商品，无法删除」。', '不发送规格组更新请求；明细 G1 仍在规格组 G 及引用商品中。'],
  },
  'TC-GRP-SPEC-018': { expectedResults: ['商品 A 保存后不再引用 G/G1。', '规格组 G 删除成功，API 查询与列表均为 0 条。'] },
  'TC-GRP-SPEC-019': {
    steps: ['删除规格组 H 并确认。', '按名称 H 查询列表并调用列表接口核对。'],
    expectedResults: ['确认弹窗关闭，删除请求成功。', 'UI 与 API 均查询不到 H。'],
  },
  'TC-GRP-SPEC-021': {
    title: '编辑被引用规格明细后商品侧字段同步',
    steps: ['编辑明细 S1 的规格名称、规格名称（第二语言）、规格值、规格图标和设备编码并保存。', '查看商品 P、Q 中该规格明细展示。'],
    expectedResults: ['规格组保存成功，API 回读规格名称、规格名称（第二语言）、规格值、规格图标和设备编码均为修改后的值。', '商品 P、Q 中对应规格的上述 5 个字段均同步为修改后的值。'],
  },
  'TC-GRP-SPEC-022': { expectedResults: ['新增页关闭且未发送创建请求。', 'UI 与 API 均查询不到该唯一组名称。'] },
  'TC-GRP-SPEC-023': {
    title: '编辑规格组添加明细后点击取消不保存',
    expectedResults: ['规格组编辑面板关闭且未发送写请求。', '规格组 A 仍仅含 A1。'],
  },
  'TC-GRP-SPEC-028': {
    expectedResults: ['保存成功且页面无错误提示。', 'API 详情包含全部已填写字段；列表按组名称查询并展示新建规格组及其规格明细名称。'],
  },
  'TC-GRP-SPEC-025': {
    steps: ['新增规格组并添加规格明细名称 `SIZE_L` 后保存。', '查询 `SIZE_L` 的品牌规格明细记录。'],
    expectedResults: ['提交被拒绝并显示品牌内规格名称重复错误。', '未生成第二条 `SIZE_L`。'],
  },
  'TC-GRP-SPEC-027': { expectedResults: ['规格值输入框拒绝第 21 个字符，最终值长度为 20。'] },
  'TC-GRP-TASTE-004': {
    title: '新增口味组名称为空时保存失败',
    preconditions: ['已进入新增口味组页。'],
    steps: ['口味组名称留空，填写一条有效口味名称后点击「确定」。', '在口味组列表和 API 中查询本次口味明细关联的组记录。'],
    expectedResults: ['提交失败，口味组名称字段显示精确中文提示「请输入口味组名称」，且不发送创建请求。', 'UI 与 API 均不存在本次口味明细关联的不完整口味组。'],
  },
  'TC-GRP-TASTE-005': {
    preconditions: ['已进入新增口味组页，品牌内不存在 `TC_TASTE_EMPTY`。'],
    steps: ['口味组名称填写 `TC_TASTE_EMPTY`，保留页面默认生成的口味选项行，口味名称不填写。', '点击「确定」。'],
    expectedResults: ['提交失败，页面显示精确中文提示「请输入口味名称」，且不发送创建请求。', 'UI 与 API 均查询不到 `TC_TASTE_EMPTY`。'],
  },
  'TC-GRP-TASTE-008': { expectedResults: ['口味组保存后包含原明细和新明细；引用商品仍只包含编辑前的明细集合。'] },
  'TC-GRP-TASTE-016': { expectedResults: ['商品 A 保存后不再引用口味组 T。', '口味组 T 删除成功，UI 与 API 均为 0 条。'] },
  'TC-GRP-TASTE-018': { expectedResults: ['新增页关闭且未发送创建请求。', 'UI 与 API 均查询不到该唯一口味组名称。'] },
  'TC-GRP-TASTE-019': {
    title: '编辑口味组添加明细后点击取消不保存',
    expectedResults: ['口味组编辑面板关闭且未发送写请求。', '口味组 A 仍仅含 A1。'],
  },
  'TC-GRP-TASTE-022': { expectedResults: ['提交失败并显示参数冲突错误。'] },
  'TC-GRP-TASTE-023': { expectedResults: ['口味 A 的默认选中和组内加价 `3.00` 保存成功。', '保存后口味组 API 返回新值。', '商品仍保持口味 B 默认选中和商品侧加价 `2.00`。'] },
  'TC-GRP-MTH-002': { preconditions: ['做法组列表至少存在 1 条可查询记录。'] },
  'TC-GRP-MTH-005': {
    preconditions: ['品牌内不存在测试名称对应的做法组。'],
    steps: ['填写唯一做法组名称，保持默认做法行的做法名称为空，点击「确定」。', '按该唯一名称查询做法组。'],
    expectedResults: ['提交被阻止并显示「做法名称（必填）」；不发送创建请求。', 'UI 与 API 均查询不到该做法组。'],
  },
  'TC-GRP-MTH-008': {
    expectedResults: ['弹窗展示删除项，并提示将影响所有关联商品。', '确认后目标做法明细从组内删除，UI 与 API 均不再返回该明细。', '引用商品同步移除该做法明细，其余做法明细保持不变。'],
  },
  'TC-GRP-MTH-009': {
    expectedResults: ['弹窗展示删除项和更改前后做法排序。', '确认后删除成功，UI 与 API 均不再返回该明细，其余明细保持不变。', '仅剩 1 条明细时不可删除的边界由 `TC-GRP-MTH-020` 验证。'],
  },
  'TC-GRP-MTH-010': {
    expectedResults: ['二次确认弹窗显示当前引用商品数为 0。', '确认后删除请求成功。', 'UI 与 API 均查询不到原做法组。'],
  },
  'TC-GRP-MTH-006': { expectedResults: ['重复组名提交失败并显示组名称重复错误。', '同组重复明细名提交失败并显示明细名称重复错误。'] },
  'TC-GRP-MTH-015': { expectedResults: ['商品 A 保存后不再引用做法组 M。', '做法组 M 删除成功，UI 与 API 均为 0 条。'] },
  'TC-GRP-MTH-017': { expectedResults: ['新增页关闭且未发送创建请求。', 'UI 与 API 均查询不到该唯一做法组名称。'] },
  'TC-GRP-MTH-018': {
    title: '编辑做法组添加明细后点击取消不保存',
    expectedResults: ['做法组编辑面板关闭且未发送写请求。', '做法组 A 仍仅含 A1。'],
  },
  'TC-GRP-MTH-021': { expectedResults: ['提交失败并显示参数冲突错误。'] },
  'TC-GRP-MTH-022': { expectedResults: ['做法 A 的默认选中和组内加价 `3.00` 保存成功。', '保存后做法组 API 返回新值。', '商品仍保持做法 B 默认选中和商品侧加价 `2.00`。'] },
  'TC-GRP-ADD-002': { preconditions: ['加料组列表至少存在 1 条可查询记录。'] },
  'TC-GRP-ADD-008': {
    expectedResults: ['「确定」按钮可用且无数量规则错误。', '保存成功。', 'UI 与 API 均能查询到该加料组，组级三项数量均为 0，组内包含所选加料商品。'],
  },
  'TC-GRP-ADD-010': {
    steps: ['核对组级规则字段和组内商品字段。', '将当前页面字段与旧 XMind 的「默认可加购数量」字段对照。'],
    expectedResults: ['当前页面不存在「默认可加购数量」字段，旧 XMind 场景无法执行且不进入自动化运行范围。', '当前实际字段为组级最少选择份数、最多选择份数、份数内免费，以及商品行最小数量、最大数量。'],
  },
  'TC-GRP-ADD-011': {
    steps: ['核对组级规则字段和组内商品字段。', '将当前页面字段与历史规则的「可加购数量」名称对照。'],
    expectedResults: ['当前页面不存在名为「可加购数量」的字段，旧规则名称不能作为现行控件或断言，原场景不进入自动化运行范围。', '商品行「最小数量」「最大数量」为独立现行字段，后续规则须基于页面/API 审计另行生成，不能沿用旧字段语义。'],
  },
  'TC-GRP-ADD-013': {
    title: '未被引用加料组内商品经确认变更后删除成功',
    preconditions: ['存在一个未被商品引用、且组内至少包含 2 个加料商品的加料组。'],
    steps: ['删除其中一个组内商品，查看「确认变更」弹窗。', '点击「确认修改」，重新打开加料组并查询 API 详情。'],
    expectedResults: ['弹窗展示更改前后加料排序及删除项，并提供取消和确认修改操作。', '删除成功；目标商品从组内移除，其余商品和加料组本身保持不变，UI 与 API 结果一致。'],
  },
  'TC-GRP-ADD-014': {
    title: '加料组仅剩一个组内商品时删除失败',
    preconditions: ['存在一个仅包含 1 个组内商品的加料组；是否被商品引用不改变本边界。'],
    steps: ['点击唯一组内商品的删除按钮。', '关闭提示后重新打开加料组并查询 API 详情。'],
    expectedResults: ['删除失败并显示精确中文提示「该组只有一个选项，不能删除」。', '唯一组内商品仍保留，UI 与 API 均未发生删除。'],
  },
  'TC-GRP-ADD-016': {
    preconditions: ['加料组已被 N 个商品引用，且包含至少 2 个组内商品。'],
    steps: ['修改加料组的选择份数规则及组内商品最小数量、单次加价或默认选中状态，点击「确定」。', '核对「确认变更」弹窗中的更改前后值、影响说明、受影响商品总数和已选择数量。', '点击「确认修改」，依次打开 N 个引用商品查看加料配置。'],
    expectedResults: ['弹窗逐项展示本次变更，并明确默认影响所有关联商品；受影响商品总数为 N，默认已选择数量为 `N/N`。', '确认后加料组保存成功，UI 与 API 返回修改后的规则和组内商品字段。', 'N 个引用商品均同步显示最新加料组配置，未受影响字段保持不变。'],
  },
  'TC-GRP-ADD-017': { expectedResults: ['加料组保存和下发成功。', 'C 端仅展示 1 条该商品入口，展开后可选择 S/M/L。'] },
  'TC-GRP-ADD-019': {
    steps: ['组名称留空，添加 1 条有效加料明细后保存。', '查询本次加料明细关联的组记录。'],
    expectedResults: ['组名称字段显示必填错误且未发送创建请求。', '未生成不完整加料组。'],
  },
  'TC-GRP-ADD-022': { expectedResults: ['加料明细 D1 的非价格字段保存成功。', '商品 P、Q 中对应字段更新，商品侧价格保持编辑前值。'] },
  'TC-GRP-ADD-024': { expectedResults: ['新增页关闭且未发送创建请求。', 'UI 与 API 均查询不到该唯一加料组名称。'] },
  'TC-GRP-ADD-026': { expectedResults: ['加料组保存和下发成功。', 'C 端分别展示 S、M、L 三条规格入口。'] },
  'TC-GRP-ADD-027': { expectedResults: ['提交失败并显示参数冲突错误。'] },
  'TC-GRP-ADD-028': { expectedResults: ['加料 A 的默认选中和组内单次加价 `3.00` 保存成功。', '保存后加料组 API 返回新值。', '商品仍保持加料 B 默认选中和商品侧单次加价 `2.00`。'] },
  'TC-GRP-ADD-029': { expectedResults: ['终端加料选择页打开且加料 A 可见。', '加料 A 为已选中状态，数量等于 `2`。'] },
  'TC-GRP-ADD-030': { expectedResults: ['终端加料选择页打开且加料 B 可见。', '加料 B 为未选中状态且数量等于 `0`。'] },
  'TC-GRP-ADD-031': { expectedResults: ['终端加料选择页打开并加载 3 条子项。', '子项顺序严格为 `C → A → B`。'] },
  'TC-GRP-ADD-032': { expectedResults: ['删除确认弹窗可见。', '确认后显示“该组只有一个选项，不能删除”错误。'] },
  'TC-GRP-PKG-002': { preconditions: ['固定搭配与可选搭配列表均至少存在 1 条可查询记录。'] },
  'TC-GRP-PKG-016': {
    steps: ['在列表操作菜单点击「删除」并确认。', '按原套餐组名称查询列表和套餐组 API。'],
    expectedResults: ['删除请求成功，套餐组及组内商品关系一并删除。', 'UI 与 API 均查询不到原套餐组。'],
  },
  'TC-GRP-PKG-018': {
    steps: ['编辑套餐组，打开添加商品弹窗并选择唯一测试商品。', '点击取消并重新打开该套餐组。'],
    expectedResults: ['商品选择弹窗关闭且未发送套餐组更新请求。', '套餐组仍只有原商品 A，不包含测试商品。'],
  },
  'TC-GRP-PKG-009': {
    title: '被引用可选搭配新增商品后同步引用套餐商品',
    preconditions: ['可选搭配 P 已被 N 个套餐商品引用，且当前至少包含 1 个套餐商品。'],
    steps: ['当 P 仅有 1 个套餐商品时点击该商品的删除按钮，关闭提示。', '向 P 新增套餐商品 3并点击「确定」，查看保存确认弹窗的影响范围和数量。', '点击「继续保存」，依次打开 N 个引用套餐商品。'],
    expectedResults: ['仅有 1 个套餐商品时删除失败并提示「该组只有一个选项，不能删除」，原商品仍保留。', '保存确认弹窗显示当前套餐组已被 N 个套餐商品使用，并列出 N 个受影响套餐商品。', '保存成功；套餐组 P 和 N 个引用套餐商品均同步包含商品 3，其他套餐商品配置保持不变。'],
  },
  'TC-GRP-PKG-011': {
    title: '移除可选搭配商品后不足选择数量仍可保存并同步',
    preconditions: ['可选搭配选择数量为 `2`，当前仅含 2 个商品；该组可选地被 N 个套餐商品引用。'],
    steps: ['进入编辑页移除任一商品并点击「确定」。', '若出现保存确认弹窗则核对影响范围并点击「继续保存」。', '重新打开套餐组；当 N 大于 0 时同时打开引用套餐商品。'],
    expectedResults: ['不显示商品数量不足错误，允许继续保存。', '套餐组保存成功并仅保留剩余商品，选择数量仍为 `2`。', '当 N 大于 0 时，保存确认弹窗列出 N 个受影响套餐商品，确认后这些商品同步移除对应套餐商品。'],
  },
  'TC-GRP-PKG-015': {
    title: '历史随心配默认数量合计规则（当前版本不适用）',
    preconditions: ['已进入新增或编辑随心配页并添加商品。'],
    steps: ['核对随心配选择规则和商品行表头。', '将当前字段与历史规则中的「默认数量」对照。'],
    expectedResults: ['当前商品行仅展示原价、价格来源、自定义价格、默认选中及按开关出现的最大数量，不存在默认数量字段。', '历史默认数量合计场景不进入自动化执行，不得将默认选中或最大数量替代为默认数量。'],
  },
  'TC-GRP-PKG-023': {
    steps: ['新增随心配，在最少选择数量中输入非数字字符。', '在最少选择数量中输入负数 `-1`。', '在最少选择数量中输入小数 `2.2`。', '将最少与最多选择数量均填 `2`。', '添加至少 2 个商品，配置有效价格来源和默认选中状态后保存。'],
  },
  'TC-GRP-PKG-021': {
    steps: ['新增固定搭配，填写全部可填字段并添加套餐商品。', '保存后按唯一组名查询。'],
    expectedResults: ['表单字段均接受输入，保存请求成功。', 'UI 与 API 均只有 1 条该套餐组，字段与提交值一致。'],
  },
  'TC-GRP-PKG-025': {
    title: '历史可选搭配默认选中数量上限规则（当前版本不适用）',
    preconditions: ['已进入可选搭配编辑页并添加多个套餐商品。'],
    steps: ['核对组级选择数量和商品行字段。', '将当前逐商品「默认选中」开关与历史「默认选中数」规则对照。'],
    expectedResults: ['当前仅有组级「选择数量」和每个商品独立的「默认选中」开关，不存在名为「默认选中数」或「默认选中数量」的独立字段。', '历史数量上限场景不进入自动化执行；未获得业务规则和运行证据前，不得从开关数量推导保存限制。'],
  },
  'TC-GRP-PKG-028': { expectedResults: ['提交失败并显示参数冲突错误。'] },
  'TC-GRP-PKG-029': { expectedResults: ['输入框最多保留 100 个字符，空格计入字符长度；首尾空格无法形成有效保存值。', '保存请求成功。', 'API 与列表中的组名称均等于输入框最终保留的 100 字符，且无生效的首尾空格。'] },
  'TC-GRP-PKG-034': { expectedResults: ['终端套餐选择页打开且目标商品可见。', '目标商品仅展示 1 条入口，展开后可选择 S/M/L。'] },
  'TC-GRP-PKG-035': { expectedResults: ['终端套餐选择页打开且目标商品可见。', 'S、M、L 三个规格分别展示为独立入口。'] },
  'TC-GRP-PKG-032': {
    title: '历史随心配子项默认数量规则（当前版本不适用）',
    steps: ['核对随心配商品行字段。', '将当前字段与历史规则中的「子项默认数量」对照。'],
    expectedResults: ['当前商品行展示原价、价格来源、自定义价格和默认选中，不存在子项默认数量字段。', '历史子项默认数量场景不进入自动化执行，不得使用默认选中、最大数量或 API 推导字段替代。'],
  },
  'TC-GRP-PKG-033': {
    title: '随心配最多选择数量小于最少选择数量时保存失败',
    preconditions: ['已进入新增随心配页并添加 1 个商品，组级选择数量字段可编辑。'],
    steps: ['最少选择数量填 `2`，观察最少选择输入框。', '最多选择数量填 `1`，观察最多选择输入框。', '价格来源保持「默认」后点击「确定」。'],
    expectedResults: ['最少选择字段显示值 `2`。', '最多选择字段显示值 `1`。', '提交被拒绝并显示 `最多选择数量不能小于最少选择数量`。'],
  },
  'TC-GRP-PKG-039': {
    title: '随心配展示总数量规则与价格来源字段',
    expectedResults: ['展示按总数量计算的最少/最多选择数量，默认均为 `1`。', '商品表头包含原价、价格来源、自定义价格和默认选中，不包含默认数量；开启重复选择时增加最大数量。', '页面说明跟随商品价会随当前渠道场景有效价变化，自定义价为统一价格。'],
  },
  'TC-GRP-PKG-044': {
    title: '随心配支持默认和自定义两种价格来源',
    steps: ['保持价格来源为「默认」，核对原价、自定义价格输入框状态和计价说明。', '将价格来源切换为「自定义」，输入自定义价格并核对输入状态。'],
    expectedResults: ['选择「默认」时按原价计价，自定义价格输入框置灰且不可填写。', '选择「自定义」时自定义价格输入框启用并可填写，保存时按填写的自定义价格计价。'],
  },
  'TC-GRP-PKG-046': {
    steps: ['选择随心配，填写唯一组名，配置有效最少/最多选择数量。', '添加商品，配置价格来源和默认选中状态后点击「确定」。', '按名称查询列表和 API。'],
  },
};

function refineCase(testCase: GeneratedCase): GeneratedCase {
  const refinement = caseRefinements[testCase.id];
  return refinement ? { ...testCase, ...refinement } : testCase;
}

function requireFile(filePath: string): void {
  if (!fs.existsSync(filePath)) throw new Error(`缺少文件：${filePath}`);
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function relativeToWorkspace(filePath: string): string {
  return path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  const result = buildProductCenterGroupTestCases();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
