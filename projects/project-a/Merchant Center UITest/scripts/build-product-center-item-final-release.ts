import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterItemTestPlanRuleLedger,
  renderProductCenterItemTestPlanRuleMarkdown,
  type ProductCenterItemCuratedCandidateRule,
  type ProductCenterItemTestPlanCase,
  type ProductCenterItemTestPlanRuleLedger,
} from '../utils/product-center-item-test-plan-rules';

type RuntimeStatus = 'runtime-passed' | 'deferred' | 'not-applicable' | 'supplemental-reviewed' | 'unresolved';

type ConversionCase = {
  caseId: string;
  title: string;
  family?: string;
  scriptStatus: string;
  runtimeReadiness: 'ready' | 'environment-blocked';
  blockingReasons: string[];
};

type ConversionDocument = {
  denominator: { formal: number; notApplicable: number; executable: number };
  notApplicable: string[];
  cases: ConversionCase[];
};

type FullReviewEntry = {
  caseId: string;
  title: string;
  priority: string;
  source: string;
  origin: string;
  decision: string;
  reviewedAt: string;
  automationDisposition: string;
  automationReasons: string[];
};

type ManualDecision = {
  caseId: string;
  disposition: string;
  directive: string;
  updatedTitle?: string;
  sourceType: string;
  confirmedBy?: string;
  canonicalActions?: string[];
  canonicalExpectedResults?: string[];
};

type ItemFinalReleaseCase = {
  caseId: string;
  title: string;
  priority: string;
  source: string;
  scope: 'executable' | 'not-applicable' | 'supplemental';
  reviewDecision: string;
  automation: {
    bound: boolean;
    scriptPath: string | 'N/A';
    runtimeReadiness: 'ready' | 'environment-blocked' | 'N/A';
    blockingReasons: string[];
  };
  runtime: {
    status: RuntimeStatus;
    evidenceRefs: string[];
  };
  ruleDecision?: {
    disposition: string;
    directive: string;
    sourceType: string;
    confirmedBy?: string;
    actions?: string[];
    expectedResults?: string[];
  };
};

export type ProductCenterItemFinalRelease = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-authoritative-release';
  generatedAt: string;
  status: 'released';
  fingerprint: string;
  executableFingerprint: string;
  summary: {
    formalCases: number;
    canonicalCases: number;
    executableCases: number;
    notApplicable: number;
    supplementalReviewed: number;
    automationBound: number;
    runtimePassed: number;
    deferred: number;
    failed: number;
    unresolved: number;
  };
  sourceArtifacts: Record<string, { path: string; sha256: string }>;
  cases: ItemFinalReleaseCase[];
  automationBindings: Array<{
    caseId: string;
    title: string;
    family: string;
    scriptPath: string;
    runtimeReadiness: 'ready' | 'environment-blocked';
    runtimeStatus: 'runtime-passed' | 'deferred' | 'unresolved';
    blockingReasons: string[];
  }>;
  guardrails: {
    runtimePassedCannotIncludeDeferred: true;
    unresolvedMustBeZeroForRelease: true;
    generatedCaseIdCoverageRequired: true;
    staleProjectionRejectedByExecutableFingerprint: true;
  };
};

type ProductCenterItemAuthoritativeBusinessRules = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-authoritative-business-rules';
  generatedAt: string;
  status: 'released';
  releaseFingerprint: string;
  sourceArtifact: { path: string; sha256: string };
  authorityPolicy: {
    formalAuthority: false;
    formalRegistryPath: string;
    runtimeMayPromoteToFormal: false;
    runtimeMayGenerateCandidates: true;
    runtimeMayTriggerHumanReview: true;
    humanApprovalRequired: true;
    formalReviewQueuePath: string;
    reviewedFormalRulesPath: string;
  };
  summary: {
    confirmedRules: number;
    runtimeObservations: number;
    deferredDecisions: number;
    totalDecisions: number;
  };
  rules: Array<{
    ruleId: string;
    caseId: string;
    title: string;
    statement: string;
    disposition: string;
    sourceType: string;
    confirmedBy?: string;
    actions: string[];
    expectedResults: string[];
    runtimeStatus: 'runtime-passed';
  }>;
  deferredCases: Array<{
    caseId: string;
    title: string;
    reason: string;
    confirmedBy?: string;
    runtimeStatus: 'deferred';
  }>;
  runtimeObservations: Array<{
    caseId: string;
    title: string;
    disposition: string;
    sourceType: 'runtime-analysis';
    runtimeStatus: 'runtime-passed';
    formalPromotionAllowed: false;
  }>;
  testPlanRuleLedger: {
    path: string;
    fingerprint: string;
    summary: ProductCenterItemTestPlanRuleLedger['summary'];
  };
  candidateRules: ProductCenterItemTestPlanRuleLedger['candidates'];
  excludedTestPlanCases: ProductCenterItemTestPlanRuleLedger['excluded'];
};

export function buildProductCenterItemFinalRelease(options: {
  projectRoot?: string;
  outputRoot?: string;
  updateConversionManifest?: boolean;
  generatedAt?: string;
} = {}): {
  releasePath: string;
  businessRulesPath: string;
  bindingsPath: string;
  reportPath: string;
  markdownPath: string;
  deliverablesRoot?: string;
  release: ProductCenterItemFinalRelease;
} {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const sourcePaths = {
    conversion: 'output/product-center-item-213-conversion.json',
    fullReview: 'contracts/product-center/test-cases/canonical/product-center-item-full-review.json',
    manualDecisions: 'contracts/product-center/reviews/product-center-item-failure-manual-decisions.json',
    remediation31: 'output/product-center-item-31-remediation-report.json',
    remediation19: 'output/product-center-item-19-remediation-report.json',
  } as const;
  const conversion = readJson<ConversionDocument>(projectRoot, sourcePaths.conversion);
  const fullReview = readJson<{ entries: FullReviewEntry[] }>(projectRoot, sourcePaths.fullReview);
  const manual = readJson<{ decisions: ManualDecision[] }>(projectRoot, sourcePaths.manualDecisions);
  const remediation31 = readJson<{ remainingFailedCaseIds: string[] }>(projectRoot, sourcePaths.remediation31);
  const remediation19 = readJson<{ cases: Array<{ caseId: string; status: string }> }>(projectRoot, sourcePaths.remediation19);
  const executableById = new Map(conversion.cases.map((item) => [item.caseId, item]));
  const reviewById = new Map(fullReview.entries.map((item) => [item.caseId, item]));
  const decisionById = new Map(manual.decisions.map((item) => [item.caseId, item]));
  const deferredIds = new Set(manual.decisions.filter((item) => item.disposition === 'skip-deferred').map((item) => item.caseId));
  const remainingIds = new Set(remediation31.remainingFailedCaseIds);
  const remediatedIds = new Set(remediation19.cases.filter((item) => item.status === 'runtime-passed').map((item) => item.caseId));
  const notApplicableIds = new Set(conversion.notApplicable);
  const executableFingerprint = sha256(JSON.stringify(
    [...executableById.values()].map((item) => ({ caseId: item.caseId, title: item.title })),
  ));
  const cases: ItemFinalReleaseCase[] = fullReview.entries.map((review) => {
    const executable = executableById.get(review.caseId);
    const decision = decisionById.get(review.caseId);
    const scope = executable ? 'executable' : notApplicableIds.has(review.caseId) ? 'not-applicable' : 'supplemental';
    const runtime = resolveRuntimeStatus(review.caseId, scope, deferredIds, remainingIds, remediatedIds);
    return {
      caseId: review.caseId,
      title: decision?.updatedTitle ?? review.title,
      priority: review.priority,
      source: review.source,
      scope,
      reviewDecision: review.decision,
      automation: executable
        ? {
            bound: executable.scriptStatus === 'flow-bound',
            scriptPath: 'tests/generated/product-center-item-216.generated.spec.ts',
            runtimeReadiness: executable.runtimeReadiness,
            blockingReasons: executable.blockingReasons,
          }
        : { bound: false, scriptPath: 'N/A', runtimeReadiness: 'N/A', blockingReasons: [] },
      runtime,
      ...(decision ? {
        ruleDecision: {
          disposition: decision.disposition,
          directive: decision.directive,
          sourceType: decision.sourceType,
          ...(decision.confirmedBy ? { confirmedBy: decision.confirmedBy } : {}),
          ...(decision.canonicalActions ? { actions: decision.canonicalActions } : {}),
          ...(decision.canonicalExpectedResults ? { expectedResults: decision.canonicalExpectedResults } : {}),
        },
      } : {}),
    };
  });
  const automationBindings = conversion.cases.map((item) => {
    const runtimeCase = requiredCase(cases, item.caseId);
    const runtimeStatus = runtimeCase.runtime.status;
    if (!['runtime-passed', 'deferred', 'unresolved'].includes(runtimeStatus)) {
      throw new Error(`可执行用例运行状态无效：${item.caseId}=${runtimeStatus}`);
    }
    return {
      caseId: item.caseId,
      title: runtimeCase.title,
      family: item.caseId.includes('-STD-') ? 'standard' : item.caseId.includes('-PKG-') ? 'package' : 'addon',
      scriptPath: 'tests/generated/product-center-item-216.generated.spec.ts',
      runtimeReadiness: item.runtimeReadiness,
      runtimeStatus: runtimeStatus as 'runtime-passed' | 'deferred' | 'unresolved',
      blockingReasons: item.blockingReasons,
    };
  });
  const summary = {
    formalCases: conversion.denominator.formal,
    canonicalCases: cases.length,
    executableCases: automationBindings.length,
    notApplicable: cases.filter((item) => item.runtime.status === 'not-applicable').length,
    supplementalReviewed: cases.filter((item) => item.runtime.status === 'supplemental-reviewed').length,
    automationBound: automationBindings.filter((item) => requiredCase(cases, item.caseId).automation.bound).length,
    runtimePassed: automationBindings.filter((item) => item.runtimeStatus === 'runtime-passed').length,
    deferred: automationBindings.filter((item) => item.runtimeStatus === 'deferred').length,
    failed: 0,
    unresolved: automationBindings.filter((item) => item.runtimeStatus === 'unresolved').length,
  };
  validateSummary(summary, conversion, fullReview.entries.length);
  const sourceArtifacts = Object.fromEntries(Object.entries(sourcePaths).map(([key, relativePath]) => [
    key,
    { path: relativePath, sha256: sha256(fs.readFileSync(path.join(projectRoot, relativePath))) },
  ]));
  const fingerprint = sha256(JSON.stringify({ executableFingerprint, summary, sourceArtifacts, cases, automationBindings }));
  const release: ProductCenterItemFinalRelease = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-authoritative-release',
    generatedAt,
    status: 'released',
    fingerprint,
    executableFingerprint,
    summary,
    sourceArtifacts,
    cases,
    automationBindings,
    guardrails: {
      runtimePassedCannotIncludeDeferred: true,
      unresolvedMustBeZeroForRelease: true,
      generatedCaseIdCoverageRequired: true,
      staleProjectionRejectedByExecutableFingerprint: true,
    },
  };
  const releasePath = path.join(outputRoot, 'contracts/product-center/test-cases/canonical/product-center-item-authoritative-release.json');
  const businessRulesPath = path.join(outputRoot, 'contracts/product-center/business-rules/product-center-item-authoritative-business-rules.json');
  const bindingsPath = path.join(outputRoot, 'contracts/product-center/test-cases/canonical/product-center-item-authoritative-automation-bindings.json');
  const reportPath = path.join(outputRoot, 'output/product-center-item-final-status.json');
  const markdownPath = path.join(outputRoot, 'output/product-center-item-final-status.md');
  const testPlanRuleLedgerPath = path.join(
    outputRoot,
    'contracts/product-center/business-rules/generated/product-center-item-test-plan-rule-candidates.json',
  );
  const testPlanRuleLedger = buildCurrentTestPlanRuleLedger(projectRoot, release);
  const businessRules = buildAuthoritativeBusinessRules(
    release,
    manual.decisions,
    sourceArtifacts.manualDecisions,
    testPlanRuleLedger,
  );
  const bindings = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-authoritative-automation-bindings',
    generatedAt,
    releaseFingerprint: fingerprint,
    executableFingerprint,
    summary: {
      total: automationBindings.length,
      runtimePassed: summary.runtimePassed,
      deferred: summary.deferred,
      unresolved: summary.unresolved,
    },
    bindings: automationBindings,
  };
  writeJson(releasePath, release);
  writeJson(testPlanRuleLedgerPath, testPlanRuleLedger);
  writeJson(businessRulesPath, businessRules);
  writeJson(bindingsPath, bindings);
  writeJson(reportPath, release);
  writeText(markdownPath, renderMarkdown(release));
  let deliverablesRoot: string | undefined;
  if (options.updateConversionManifest !== false && path.resolve(outputRoot) === projectRoot) {
    projectRuntimeIntoConversion(projectRoot, conversion, release);
    deliverablesRoot = publishCurrentDeliverables(projectRoot, release, businessRules, bindings, testPlanRuleLedger);
  }
  return { releasePath, businessRulesPath, bindingsPath, reportPath, markdownPath, deliverablesRoot, release };
}

function publishCurrentDeliverables(
  projectRoot: string,
  release: ProductCenterItemFinalRelease,
  businessRules: ProductCenterItemAuthoritativeBusinessRules,
  bindings: Record<string, unknown>,
  testPlanRuleLedger: ProductCenterItemTestPlanRuleLedger,
): string {
  const root = path.resolve(projectRoot, '..', 'deliverables/product-center-item');
  const scriptPath = 'Merchant Center UITest/tests/generated/product-center-item-216.generated.spec.ts';
  const sourceScriptPath = path.join(projectRoot, 'tests/generated/product-center-item-216.generated.spec.ts');
  const archivedScriptPath = 'automation/product-center-item-216.generated.spec.ts';
  const manifest = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-current-deliverables',
    generatedAt: release.generatedAt,
    releaseFingerprint: release.fingerprint,
    executableFingerprint: release.executableFingerprint,
    summary: release.summary,
    canonicalPaths: {
      testCases: 'Merchant Center UITest/contracts/product-center/test-cases/canonical/product-center-item-authoritative-release.json',
      businessRules: 'Merchant Center UITest/contracts/product-center/business-rules/product-center-item-authoritative-business-rules.json',
      testPlanRuleCandidates: 'Merchant Center UITest/contracts/product-center/business-rules/generated/product-center-item-test-plan-rule-candidates.json',
      automationBindings: 'Merchant Center UITest/contracts/product-center/test-cases/canonical/product-center-item-authoritative-automation-bindings.json',
      automationEntry: scriptPath,
      archivedAutomationSnapshot: `deliverables/product-center-item/${archivedScriptPath}`,
      finalStatus: 'Merchant Center UITest/output/product-center-item-final-status.json',
    },
    archivedAutomationSha256: sha256(fs.readFileSync(sourceScriptPath)),
    commands: {
      rebuild: 'npm run deliver:product-center:item',
      resume: 'npm run deliver:product-center:item:resume',
      fullLive: 'npm run deliver:product-center:item:full',
    },
    policy: {
      singleCurrentState: true,
      historyOwnedByGit: true,
      archivedScriptIsReferenceOnly: true,
    },
  };
  writeJson(path.join(root, 'manifest.json'), manifest);
  writeJson(path.join(root, 'test-cases.json'), release);
  writeJson(path.join(root, 'business-rules.json'), businessRules);
  writeJson(path.join(root, 'rule-candidate-ledger.json'), testPlanRuleLedger);
  writeText(path.join(root, 'business-rules.md'), renderProductCenterItemTestPlanRuleMarkdown(testPlanRuleLedger));
  writeJson(path.join(root, 'automation-bindings.json'), bindings);
  writeJson(path.join(root, 'final-status.json'), release);
  writeText(path.join(root, 'final-status.md'), renderMarkdown(release));
  writeText(path.join(root, archivedScriptPath), fs.readFileSync(sourceScriptPath, 'utf8'));
  writeText(path.join(root, 'README.md'), [
    '# 商品中心商品管理当前交付包',
    '',
    '本目录只保存当前权威状态；历史变化由 Git 管理，不建立 SaaS 版本目录。',
    '',
    `- 规范用例：${release.summary.canonicalCases} 条`,
    `- 可执行用例：${release.summary.executableCases} 条`,
    `- 自动化绑定：${release.summary.automationBound} 条`,
    `- 实跑通过：${release.summary.runtimePassed} 条`,
    `- 测试方案候选规则：${testPlanRuleLedger.summary.activeCandidates} 条`,
    `- 废弃用例排除：${testPlanRuleLedger.summary.deprecatedExcluded} 条`,
    `- 延期：${release.summary.deferred} 条`,
    `- 失败/未处理：${release.summary.failed + release.summary.unresolved} 条`,
    `- 自动化入口：\`${scriptPath}\``,
    `- 自动化归档快照：\`deliverables/product-center-item/${archivedScriptPath}\`（只读，不作为直接运行入口）`,
    '- 默认重建：`cd "Merchant Center UITest" && npm run deliver:product-center:item`',
    '- 全量实跑：`cd "Merchant Center UITest" && npm run deliver:product-center:item:full`',
    '',
  ].join('\n'));
  return root;
}

function buildAuthoritativeBusinessRules(
  release: ProductCenterItemFinalRelease,
  decisions: ManualDecision[],
  sourceArtifact: { path: string; sha256: string },
  testPlanRuleLedger: ProductCenterItemTestPlanRuleLedger,
): ProductCenterItemAuthoritativeBusinessRules {
  const confirmedRules = decisions.filter((item) => (
    item.disposition !== 'skip-deferred'
    && item.sourceType === 'direct-user-confirmation'
    && Boolean(item.confirmedBy?.trim())
  )).map((item) => {
    const releaseCase = requiredCase(release.cases, item.caseId);
    if (releaseCase.runtime.status !== 'runtime-passed') {
      throw new Error(`已确认业务规则缺少通过证据：${item.caseId}=${releaseCase.runtime.status}`);
    }
    return {
      ruleId: `BR-${item.caseId}`,
      caseId: item.caseId,
      title: releaseCase.title,
      statement: item.directive,
      disposition: item.disposition,
      sourceType: item.sourceType,
      ...(item.confirmedBy ? { confirmedBy: item.confirmedBy } : {}),
      actions: item.canonicalActions ?? [],
      expectedResults: item.canonicalExpectedResults ?? [],
      runtimeStatus: 'runtime-passed' as const,
    };
  });
  const deferredCases = decisions.filter((item) => item.disposition === 'skip-deferred').map((item) => {
    const releaseCase = requiredCase(release.cases, item.caseId);
    if (releaseCase.runtime.status === 'not-applicable') return null;
    if (releaseCase.runtime.status !== 'deferred') {
      throw new Error(`延期决策状态不一致：${item.caseId}=${releaseCase.runtime.status}`);
    }
    return {
      caseId: item.caseId,
      title: releaseCase.title,
      reason: item.directive,
      ...(item.confirmedBy ? { confirmedBy: item.confirmedBy } : {}),
      runtimeStatus: 'deferred' as const,
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null);
  const runtimeObservations = decisions.filter((item) => item.sourceType === 'runtime-analysis').map((item) => {
    const releaseCase = requiredCase(release.cases, item.caseId);
    if (releaseCase.runtime.status !== 'runtime-passed') {
      throw new Error(`运行观测缺少通过证据：${item.caseId}=${releaseCase.runtime.status}`);
    }
    return {
      caseId: item.caseId,
      title: releaseCase.title,
      disposition: item.disposition,
      sourceType: 'runtime-analysis' as const,
      runtimeStatus: 'runtime-passed' as const,
      formalPromotionAllowed: false as const,
    };
  });
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-authoritative-business-rules',
    generatedAt: release.generatedAt,
    status: 'released',
    releaseFingerprint: release.fingerprint,
    sourceArtifact,
    authorityPolicy: {
      formalAuthority: false,
      formalRegistryPath: 'contracts/product-center/business-rules/generated/product-center-item-rule-registry.json',
      runtimeMayPromoteToFormal: false,
      runtimeMayGenerateCandidates: true,
      runtimeMayTriggerHumanReview: true,
      humanApprovalRequired: true,
      formalReviewQueuePath: 'output/test-case-audit/product-center/item-formal-rule-review-queue.json',
      reviewedFormalRulesPath: 'contracts/product-center/business-rules/generated/product-center-item-reviewed-formal-rules.json',
    },
    summary: {
      confirmedRules: confirmedRules.length,
      runtimeObservations: runtimeObservations.length,
      deferredDecisions: deferredCases.length,
      totalDecisions: decisions.length,
    },
    rules: confirmedRules,
    deferredCases,
    runtimeObservations,
    testPlanRuleLedger: {
      path: 'contracts/product-center/business-rules/generated/product-center-item-test-plan-rule-candidates.json',
      fingerprint: testPlanRuleLedger.fingerprint,
      summary: testPlanRuleLedger.summary,
    },
    candidateRules: testPlanRuleLedger.candidates,
    excludedTestPlanCases: testPlanRuleLedger.excluded,
  };
}

function buildCurrentTestPlanRuleLedger(
  projectRoot: string,
  release: ProductCenterItemFinalRelease,
): ProductCenterItemTestPlanRuleLedger {
  const testPlanPath = 'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json';
  const curatedCandidatePath = 'contracts/product-center/business-rules/product-center-item-candidate-rules.json';
  const formalBindingPath = 'contracts/product-center/business-rules/product-center-item-formal-rule-bindings.json';
  const confirmationPath = 'contracts/product-center/reviews/product-center-item-rule-confirmations.json';
  const testPlan = readJson<{ fingerprint: string; cases: ProductCenterItemTestPlanCase[] }>(projectRoot, testPlanPath);
  const curatedCandidates = readJson<{ rules: ProductCenterItemCuratedCandidateRule[] }>(
    projectRoot,
    curatedCandidatePath,
  ).rules;
  const formalBindings = readJson<{ bindings: Array<{ bindingId: string; confirmationId: string }> }>(
    projectRoot,
    formalBindingPath,
  ).bindings;
  const confirmations = readJson<{
    confirmations: Array<{ confirmationId: string; linkedCanonicalIds: string[] }>;
  }>(projectRoot, confirmationPath).confirmations;
  const confirmationsById = new Map(confirmations.map((item) => [item.confirmationId, item]));
  const formalBindingIdsByCaseId = new Map<string, string[]>();
  for (const binding of formalBindings) {
    const confirmation = confirmationsById.get(binding.confirmationId);
    if (!confirmation) throw new Error(`商品正式规则绑定缺少确认来源：${binding.bindingId}`);
    for (const caseId of confirmation.linkedCanonicalIds) {
      const bindingIds = formalBindingIdsByCaseId.get(caseId) ?? [];
      bindingIds.push(binding.bindingId);
      formalBindingIdsByCaseId.set(caseId, bindingIds);
    }
  }
  return buildProductCenterItemTestPlanRuleLedger({
    generatedAt: release.generatedAt,
    testPlanPath,
    testPlanFingerprint: testPlan.fingerprint,
    releasePath: 'contracts/product-center/test-cases/canonical/product-center-item-authoritative-release.json',
    releaseFingerprint: release.fingerprint,
    testPlanCases: testPlan.cases,
    releaseCases: release.cases,
    curatedCandidates,
    formalBindingIdsByCaseId,
  });
}

function resolveRuntimeStatus(
  caseId: string,
  scope: ItemFinalReleaseCase['scope'],
  deferredIds: Set<string>,
  remainingIds: Set<string>,
  remediatedIds: Set<string>,
): ItemFinalReleaseCase['runtime'] {
  if (scope === 'not-applicable') return { status: 'not-applicable', evidenceRefs: ['output/product-center-item-213-conversion.json'] };
  if (scope === 'supplemental') return { status: 'supplemental-reviewed', evidenceRefs: ['contracts/product-center/test-cases/canonical/product-center-item-full-review.json'] };
  if (deferredIds.has(caseId)) return { status: 'deferred', evidenceRefs: ['contracts/product-center/reviews/product-center-item-failure-manual-decisions.json'] };
  if (remediatedIds.has(caseId)) return { status: 'runtime-passed', evidenceRefs: ['output/product-center-item-19-remediation-report.json'] };
  if (!remainingIds.has(caseId)) return { status: 'runtime-passed', evidenceRefs: ['output/product-center-item-31-remediation-report.json'] };
  return { status: 'unresolved', evidenceRefs: ['output/product-center-item-31-remediation-report.json'] };
}

function validateSummary(
  summary: ProductCenterItemFinalRelease['summary'],
  conversion: ConversionDocument,
  reviewCount: number,
): void {
  if (summary.canonicalCases !== reviewCount) throw new Error('权威发布规范用例分母不一致');
  if (summary.executableCases !== conversion.denominator.executable) throw new Error('权威发布自动化分母不一致');
  if (summary.automationBound !== summary.executableCases) throw new Error('权威发布存在未绑定脚本用例');
  if (summary.runtimePassed + summary.deferred + summary.unresolved !== summary.executableCases) throw new Error('权威发布运行状态分母不守恒');
  if (summary.unresolved !== 0 || summary.failed !== 0) throw new Error('权威发布仍存在失败或未处理用例');
}

function projectRuntimeIntoConversion(
  projectRoot: string,
  conversion: ConversionDocument,
  release: ProductCenterItemFinalRelease,
): void {
  const sourcePath = path.join(projectRoot, 'output/product-center-item-213-conversion.json');
  const current = readJson<Record<string, unknown> & { summary: Record<string, unknown>; cases: Array<Record<string, unknown>> }>(projectRoot, 'output/product-center-item-213-conversion.json');
  const runtimeById = new Map(release.automationBindings.map((item) => [item.caseId, item]));
  current.runtimeProjection = {
    source: 'contracts/product-center/test-cases/canonical/product-center-item-authoritative-release.json',
    releaseFingerprint: release.fingerprint,
    executableFingerprint: release.executableFingerprint,
    projectedAt: release.generatedAt,
  };
  current.summary = {
    ...current.summary,
    runtimePassed: release.summary.runtimePassed,
    deferred: release.summary.deferred,
    runtimeFailed: release.summary.failed,
    runtimeUnresolved: release.summary.unresolved,
    runtimeNotRun: 0,
  };
  current.cases = current.cases.map((item) => {
    const binding = runtimeById.get(String(item.caseId));
    return binding ? {
      ...item,
      title: binding.title,
      runtimeStatus: binding.runtimeStatus,
      runtimeEvidenceRefs: requiredCase(release.cases, binding.caseId).runtime.evidenceRefs,
    } : item;
  });
  if (current.cases.length !== conversion.cases.length) throw new Error('运行状态回写改变了转换分母');
  writeJson(sourcePath, current);
}

function renderMarkdown(release: ProductCenterItemFinalRelease): string {
  const deferred = release.automationBindings.filter((item) => item.runtimeStatus === 'deferred');
  return [
    '# 商品管理 213 条唯一最终状态',
    '',
    `- 规范用例：${release.summary.canonicalCases} 条`,
    `- 可执行用例：${release.summary.executableCases} 条`,
    `- 自动化脚本已绑定：${release.summary.automationBound} 条`,
    `- 实跑通过：${release.summary.runtimePassed} 条`,
    `- 人工确认延期：${release.summary.deferred} 条`,
    `- 失败：${release.summary.failed} 条`,
    `- 未处理：${release.summary.unresolved} 条`,
    '',
    '## 延期清单',
    '',
    ...deferred.map((item) => `- ${item.caseId} ${item.title}`),
    '',
    `发布指纹：${release.fingerprint}`,
    '',
  ].join('\n');
}

function requiredCase(cases: ItemFinalReleaseCase[], caseId: string): ItemFinalReleaseCase {
  const item = cases.find((candidate) => candidate.caseId === caseId);
  if (!item) throw new Error(`全审产物缺少用例：${caseId}`);
  return item;
}

function readJson<T>(rootDir: string, relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8')) as T;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
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
  const paths = buildProductCenterItemFinalRelease();
  process.stdout.write(`${JSON.stringify({
    releasePath: paths.releasePath,
    bindingsPath: paths.bindingsPath,
    reportPath: paths.reportPath,
    markdownPath: paths.markdownPath,
    summary: paths.release.summary,
  }, null, 2)}\n`);
}
