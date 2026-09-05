import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterFormalReviewQueue,
  buildProductCenterRuleRegistry,
  compileProductCenterReviewedFormalRules,
  type ProductCenterCandidateRule,
  type ProductCenterFormalReviewDecision,
  type ProductCenterFormalRuleBinding,
  type ProductCenterLegacyRuleBinding,
  type ProductCenterRuleExecutionEvidence,
  validateProductCenterRuleRegistry,
} from '../utils/product-center-rule-evidence-ledger';
import { scanGeneratedArtifacts } from '../utils/product-center-run-safety';
import {
  verifyProductCenterBusinessRuleCitation,
  verifyProductCenterBusinessRuleStatement,
} from '../utils/product-center-source-citation';
import {
  buildProductCenterItemTestPlanRuleLedger,
  renderProductCenterItemTestPlanRuleMarkdown,
  type ProductCenterItemReleaseCase,
  type ProductCenterItemTestPlanCase,
} from '../utils/product-center-item-test-plan-rules';

type FormalBindingSource = Omit<ProductCenterFormalRuleBinding, 'authority'> & {
  confirmationId: string;
};

type ProductConfirmedRule = {
  confirmationId: string;
  ruleId: string;
  confirmedBy: string;
  sourceType: 'direct-user-confirmation';
  statement: string;
  linkedCanonicalIds: string[];
};

type LegacyBindingSource = Omit<ProductCenterLegacyRuleBinding, 'authority' | 'sourceRole'> & {
  citationKind: 'rule' | 'statement';
  citation: string;
  sectionHeading: string;
  expectedText: string;
};

type CandidateRuleSource = Omit<
  ProductCenterCandidateRule,
  'conditionClaims' | 'actionClaims' | 'outcomeClaims'
> & {
  canonicalId: string;
  nodeId: string;
};

type CanonicalReleaseSource = {
  cases: Array<{
    canonicalId: string;
    nodeId: string;
    claims: Array<{ id: string; kind: 'precondition' | 'action' | 'expectation' }>;
  }>;
};

export function buildProductCenterItemRuleRegistryArtifacts(options: {
  projectRoot?: string;
  outputRoot?: string;
  canonicalRelease?: CanonicalReleaseSource;
  evidence?: ProductCenterRuleExecutionEvidence[];
} = {}): {
  registryPath: string;
  reportPath: string;
  reviewQueuePath: string;
  reviewedFormalRulesPath: string;
  testPlanRuleLedgerPath: string;
  testPlanRuleMarkdownPath: string;
} {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info');
  const businessRulesPath = path.join(infoRoot, '商品中心业务规则.md');
  const formalSourcePath = path.join(
    projectRoot,
    'contracts/product-center/business-rules/product-center-item-formal-rule-bindings.json',
  );
  const legacySourcePath = path.join(
    projectRoot,
    'contracts/product-center/business-rules/product-center-item-legacy-rule-baseline.json',
  );
  const candidateSourcePath = path.join(
    projectRoot,
    'contracts/product-center/business-rules/product-center-item-candidate-rules.json',
  );
  const confirmationSourcePath = path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-item-rule-confirmations.json',
  );
  const candidateReviewDecisionPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-item-candidate-rule-review-decisions.json',
  );
  const canonicalReleasePath = path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-canonical-release.json',
  );
  const testPlanSourcePath = path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json',
  );
  const authoritativeReleasePath = path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-authoritative-release.json',
  );
  const businessRules = fs.readFileSync(businessRulesPath, 'utf8');
  const businessRuleFingerprint = createHash('sha256').update(businessRules).digest('hex');
  const formalSource = readJson<{ bindings: FormalBindingSource[] }>(formalSourcePath);
  const confirmationSource = readJson<{
    sourceRole: 'product-confirmed-rule';
    confirmations: ProductConfirmedRule[];
  }>(confirmationSourcePath);
  const candidateReviewDecisions = readJson<{
    decisions: ProductCenterFormalReviewDecision[];
  }>(candidateReviewDecisionPath);
  const legacySource = readJson<{ bindings: LegacyBindingSource[] }>(legacySourcePath);
  const candidateSource = readJson<{ rules: CandidateRuleSource[] }>(candidateSourcePath);
  const canonicalRelease = options.canonicalRelease ?? readJson<CanonicalReleaseSource>(canonicalReleasePath);
  const canonicalById = new Map(canonicalRelease.cases.map((item) => [item.canonicalId, item]));
  const testPlanSource = readJson<{
    fingerprint: string;
    cases: ProductCenterItemTestPlanCase[];
  }>(testPlanSourcePath);
  const authoritativeRelease = readJson<{
    fingerprint: string;
    cases: ProductCenterItemReleaseCase[];
  }>(authoritativeReleasePath);
  const confirmationsById = new Map(
    confirmationSource.confirmations.map((item) => [item.confirmationId, item]),
  );
  const confirmationFingerprint = createHash('sha256')
    .update(fs.readFileSync(confirmationSourcePath))
    .digest('hex');

  const formalBindings = formalSource.bindings.map((binding): ProductCenterFormalRuleBinding => {
    const confirmation = confirmationsById.get(binding.confirmationId);
    if (!confirmation
      || confirmationSource.sourceRole !== 'product-confirmed-rule'
      || confirmation.sourceType !== 'direct-user-confirmation'
      || !confirmation.confirmedBy.trim()
      || confirmation.ruleId !== binding.ruleId
      || confirmation.statement !== binding.statement
      || confirmation.linkedCanonicalIds.length === 0) {
      throw new Error(`商品正式规则确认无效：${binding.bindingId}`);
    }
    return {
      bindingId: binding.bindingId,
      ruleId: binding.ruleId,
      module: binding.module,
      statement: binding.statement,
      linkedCanonicalIds: [...confirmation.linkedCanonicalIds],
      authority: {
        sourcePath: confirmationSourcePath,
        section: confirmation.confirmationId,
        matchedText: confirmation.statement,
        fingerprint: confirmationFingerprint,
        verified: true,
        sourceRole: 'product-confirmed-rule',
      },
    };
  });
  const legacyBindings = legacySource.bindings.map((binding): ProductCenterLegacyRuleBinding => {
    const verification = binding.citationKind === 'rule'
      ? verifyProductCenterBusinessRuleCitation(businessRules, {
        citation: binding.citation,
        sectionHeading: binding.sectionHeading,
        ruleId: binding.ruleId,
        expectedText: binding.expectedText,
      })
      : verifyProductCenterBusinessRuleStatement(businessRules, {
        citation: binding.citation,
        sectionHeading: binding.sectionHeading,
        expectedText: binding.expectedText,
      });
    return {
      bindingId: binding.bindingId,
      ruleId: binding.ruleId,
      module: binding.module,
      statement: binding.statement,
      sourceRole: 'legacy-rule-baseline',
      authority: {
        sourcePath: businessRulesPath,
        section: verification.matchedLocation,
        matchedText: verification.matchedText,
        fingerprint: businessRuleFingerprint,
        textVerified: verification.verified,
        formallyApproved: false,
      },
    };
  });
  for (const source of candidateSource.rules) {
    const canonical = canonicalById.get(source.canonicalId);
    if (!canonical || canonical.nodeId !== source.nodeId) {
      throw new Error(`候选规则未找到精确 canonical 用例：${source.ruleId} -> ${source.canonicalId}`);
    }
  }
  const formalBindingIdsByCaseId = new Map<string, string[]>();
  for (const binding of formalBindings) {
    for (const caseId of binding.linkedCanonicalIds ?? []) {
      const bindingIds = formalBindingIdsByCaseId.get(caseId) ?? [];
      bindingIds.push(binding.bindingId);
      formalBindingIdsByCaseId.set(caseId, bindingIds);
    }
  }
  const generatedAt = new Date().toISOString();
  const testPlanRuleLedger = buildProductCenterItemTestPlanRuleLedger({
    generatedAt,
    testPlanPath: path.relative(projectRoot, testPlanSourcePath).replaceAll('\\', '/'),
    testPlanFingerprint: testPlanSource.fingerprint,
    releasePath: path.relative(projectRoot, authoritativeReleasePath).replaceAll('\\', '/'),
    releaseFingerprint: authoritativeRelease.fingerprint,
    testPlanCases: testPlanSource.cases,
    releaseCases: authoritativeRelease.cases,
    curatedCandidates: candidateSource.rules,
    formalBindingIdsByCaseId,
    canonicalClaimsByCaseId: new Map(canonicalRelease.cases.map((item) => [
      item.canonicalId,
      item.claims,
    ])),
  });
  const candidates: ProductCenterCandidateRule[] = testPlanRuleLedger.candidates;
  const registry = buildProductCenterRuleRegistry({
    formalBindings,
    legacyBindings,
    candidates,
    evidence: options.evidence ?? [],
  });
  const errors = validateProductCenterRuleRegistry(registry);
  if (errors.length > 0) throw new Error(`商品规则 registry 校验失败：${errors.join(',')}`);
  const formalReviewQueue = buildProductCenterFormalReviewQueue(registry);
  const reviewedFormalRules = compileProductCenterReviewedFormalRules(
    registry,
    candidateReviewDecisions.decisions,
  );

  const registryPath = path.join(
    outputRoot,
    'contracts/product-center/business-rules/generated/product-center-item-rule-registry.json',
  );
  const reportPath = path.join(
    outputRoot,
    'output/test-case-audit/product-center/item-rule-review-latest.json',
  );
  const reviewQueuePath = path.join(
    outputRoot,
    'output/test-case-audit/product-center/item-formal-rule-review-queue.json',
  );
  const reviewedFormalRulesPath = path.join(
    outputRoot,
    'contracts/product-center/business-rules/generated/product-center-item-reviewed-formal-rules.json',
  );
  const testPlanRuleLedgerPath = path.join(
    outputRoot,
    'contracts/product-center/business-rules/generated/product-center-item-test-plan-rule-candidates.json',
  );
  const testPlanRuleMarkdownPath = path.join(
    outputRoot,
    'output/test-case-audit/product-center/item-test-plan-rule-candidates.md',
  );
  const fingerprint = createHash('sha256').update(JSON.stringify({
    businessRuleFingerprint,
    confirmationFingerprint,
    formalSource,
    legacySource,
    candidateSource,
    candidateReviewDecisions,
    testPlanRuleLedger,
    registry,
  })).digest('hex');
  writeJson(testPlanRuleLedgerPath, testPlanRuleLedger);
  writeText(testPlanRuleMarkdownPath, renderProductCenterItemTestPlanRuleMarkdown(testPlanRuleLedger));
  writeJson(registryPath, { ...registry, fingerprint });
  const safety = {
    sensitiveFindings: scanGeneratedArtifacts(path.dirname(registryPath)).length,
    authStateArtifacts: fs.existsSync(path.join(outputRoot, 'output/auth-state.json')) ? 1 : 0,
  };
  if (safety.sensitiveFindings > 0 || safety.authStateArtifacts > 0) {
    throw new Error(`商品规则 registry 安全扫描未通过：${JSON.stringify(safety)}`);
  }
  writeJson(reportPath, {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-rule-review',
    generatedAt,
    fingerprint,
    summary: registry.summary,
    testPlanRuleLedger: {
      path: path.relative(outputRoot, testPlanRuleLedgerPath).replaceAll('\\', '/'),
      fingerprint: testPlanRuleLedger.fingerprint,
      summary: testPlanRuleLedger.summary,
    },
    recommendations: registry.candidates.map((rule) => ({
      ruleId: rule.ruleId,
      currentStatus: rule.currentStatus,
      recommendedStatus: rule.recommendedStatus,
      executionChannel: rule.executionChannel,
      evidenceCoverage: rule.evidenceCoverage,
      candidateFingerprint: rule.candidateFingerprint,
      formalReview: rule.formalReview,
      conflictsWithRuleIds: rule.conflictsWithRuleIds,
    })),
    guardrails: {
      formalSourceIsReadOnly: true,
      legacySourceIsReadOnly: true,
      legacyMayEnterAcceptance: false,
      runtimeMayPromoteToFormal: false,
      runtimeMayGenerateCandidates: true,
      runtimeMayTriggerHumanReview: true,
      humanApprovalRequiresCurrentCandidateFingerprint: true,
      candidateAcceptanceAllowed: false,
      automationCodeMayInferFormalRules: false,
    },
    safety,
  });
  writeJson(reviewQueuePath, {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-formal-rule-review-queue',
    generatedAt,
    trigger: '证据门禁满足后自动入队；只有绑定当前候选指纹的人工 approve 决定可转正式规则。',
    summary: {
      candidates: registry.candidates.length,
      readyForHumanReview: formalReviewQueue.length,
      approved: reviewedFormalRules.length,
    },
    items: formalReviewQueue,
  });
  writeJson(reviewedFormalRulesPath, {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-reviewed-formal-rules',
    generatedAt,
    authorityPolicy: {
      runtimeMayPromoteToFormal: false,
      humanApprovalRequired: true,
      currentCandidateFingerprintRequired: true,
    },
    rules: reviewedFormalRules,
  });
  return {
    registryPath,
    reportPath,
    reviewQueuePath,
    reviewedFormalRulesPath,
    testPlanRuleLedgerPath,
    testPlanRuleMarkdownPath,
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const paths = buildProductCenterItemRuleRegistryArtifacts();
    process.stdout.write(`商品规则 registry 已生成：\n${paths.registryPath}\n${paths.testPlanRuleLedgerPath}\n${paths.testPlanRuleMarkdownPath}\n${paths.reportPath}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
