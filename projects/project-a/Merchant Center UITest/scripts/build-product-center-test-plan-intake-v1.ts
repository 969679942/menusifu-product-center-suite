import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterTestPlanIntake,
  type ProductCenterTestPlanAutomationBinding,
} from '../utils/product-center-test-plan-intake';
import {
  reconcileProductCenterRuntimeAudit,
  type ProductCenterRuntimeAuditCorrectionDocument,
} from '../utils/product-center-runtime-audit-correction';

type JsonRecord = Record<string, any>;

export function buildProductCenterTestPlanIntakeV1Artifacts(options: {
  projectRoot?: string;
  outputRoot?: string;
  inputPath?: string;
  bindingsPath?: string;
  runtimeAuditPath?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const inputPath = path.resolve(options.inputPath ?? path.join(
    projectRoot,
    'contracts/product-center/test-cases/generated/product-center-test-plan-generation-v1.md',
  ));
  const releasePath = path.join(
    outputRoot,
    'contracts/product-center/test-cases/generated/product-center-test-plan-intake-v1.json',
  );
  const bindingsPath = path.join(
    outputRoot,
    'contracts/product-center/test-cases/generated/product-center-test-plan-intake-v1-bindings.json',
  );
  const reportPath = path.join(
    outputRoot,
    'output/test-case-audit/product-center/test-plan-intake-v1-latest.json',
  );
  const defaultRuntimeAuditPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-test-plan-intake-v1-runtime-audit.json',
  );
  const runtimeAuditPath = options.runtimeAuditPath
    ? path.resolve(projectRoot, options.runtimeAuditPath)
    : fs.existsSync(defaultRuntimeAuditPath) ? defaultRuntimeAuditPath : undefined;
  const markdown = fs.readFileSync(inputPath, 'utf8');
  const decisions = readJson<JsonRecord>(path.join(
    projectRoot,
    'contracts/product-center/reviews/unsupported-source-format-decisions.json',
  ));
  const bindings = options.bindingsPath
    ? readJson<{ bindings: ProductCenterTestPlanAutomationBinding[] }>(
      path.resolve(options.bindingsPath),
    ).bindings
    : buildDefaultBindings(projectRoot);
  const blockedSources = Number(decisions.summary?.blockedCases ?? 0);
  const intake = buildProductCenterTestPlanIntake({ markdown, bindings, blockedSources });
  const runtimeAudit = runtimeAuditPath
    ? readJson<ProductCenterRuntimeAuditCorrectionDocument>(runtimeAuditPath)
    : undefined;
  const runtimeReconciliation = runtimeAudit
    ? reconcileProductCenterRuntimeAudit(intake.cases, runtimeAudit, {
      rootDir: projectRoot,
      expectedPlanId: runtimeAudit.schemaVersion === '2.0.0'
        ? 'product-center-test-plan-intake-v1'
        : undefined,
    })
    : {
      status: 'passed' as const,
      cases: intake.cases,
      corrections: [],
      businessRuleChanges: [],
      technicalBindingChanges: [],
      coverageChanges: [],
      issues: [],
      evidence: { registered: 0, consumed: 0, unregistered: [], invalid: [] },
    };
  const runtimeReviewRequired = runtimeReconciliation.issues.map((item) => ({
    canonicalId: item.caseId,
    issueCodes: [item.code],
    issues: [item.message],
  }));
  const reconciledCaseIds = new Set(runtimeReviewRequired.map((item) => item.canonicalId));
  const reconciledCases = runtimeReconciliation.cases.filter((item) => !reconciledCaseIds.has(item.canonicalId));
  const combinedReviewRequired = [...intake.reviewRequired, ...runtimeReviewRequired]
    .sort((left, right) => left.canonicalId.localeCompare(right.canonicalId));
  const negativeEvaluation = evaluateIntakeNegativeFixtures(markdown, bindings);
  const metadata = summarizeMetadata(reconciledCases);
  const correct = reconciledCases.length + negativeEvaluation.correct;
  const evaluation = {
    total: intake.summary.inputCases + negativeEvaluation.total,
    correct,
    accuracy: correct / Math.max(1, intake.summary.inputCases + negativeEvaluation.total),
    falsePromotions: negativeEvaluation.falsePromotions,
    negativeFixtures: negativeEvaluation.samples,
  };
  const qualityPassed = reconciledCases.length === intake.summary.inputCases
    && combinedReviewRequired.length === 0
    && evaluation.accuracy === 1
    && evaluation.falsePromotions === 0
    && metadata.complete === reconciledCases.length
    && metadata.incomplete === 0;
  const status = qualityPassed ? intake.status : 'review-required' as const;
  const fingerprint = createHash('sha256')
    .update(markdown)
    .update(JSON.stringify(bindings))
    .digest('hex');
  const bindingArtifact = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-test-plan-intake-v1-bindings',
    fingerprint,
    input: path.relative(projectRoot, inputPath).replace(/\\/g, '/'),
    bindings,
  };
  const release = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-test-plan-intake-v1',
    fingerprint,
    status,
    summary: {
      ...intake.summary,
      generated: reconciledCases.length,
      reviewRequired: combinedReviewRequired.length,
    },
    cases: reconciledCases,
    reviewRequired: combinedReviewRequired,
  };
  const report = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    collectionId: 'product-center-test-plan-intake-v1',
    fingerprint,
    status,
    input: bindingArtifact.input,
    summary: {
      ...intake.summary,
      generated: reconciledCases.length,
      reviewRequired: combinedReviewRequired.length,
    },
    diagnostics: intake.diagnostics,
    evaluation,
    metadata,
    reviewRequired: combinedReviewRequired,
    runtimeAudit: {
      path: runtimeAuditPath ? path.relative(projectRoot, runtimeAuditPath).replace(/\\/g, '/') : null,
      status: runtimeReconciliation.status,
      corrections: runtimeReconciliation.corrections,
      businessRuleChanges: runtimeReconciliation.businessRuleChanges,
      technicalBindingChanges: runtimeReconciliation.technicalBindingChanges,
      coverageChanges: runtimeReconciliation.coverageChanges,
      evidence: runtimeReconciliation.evidence,
      issues: runtimeReconciliation.issues,
    },
    guardrails: {
      sourceInferenceAllowed: false,
      technicalBindingInferenceAllowed: false,
      automationAsBusinessSourceAllowed: false,
      missingBindingDisposition: 'review-required',
    },
  };

  writeJson(bindingsPath, bindingArtifact);
  writeJson(releasePath, release);
  writeJson(reportPath, report);
  return { releasePath, bindingsPath, reportPath, inputPath, status };
}

function buildDefaultBindings(projectRoot: string): ProductCenterTestPlanAutomationBinding[] {
  const release = readJson<JsonRecord>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/generated/product-center-test-plan-generation-v1.json',
  ));
  const gold = readJson<JsonRecord>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/pilots/product-center-test-plan-gold-set.json',
  ));
  const recipes = readJson<JsonRecord>(path.join(
    projectRoot,
    'contracts/product-center/recipes/product-center-test-plan-gold-set-recipes.json',
  ));
  const sourceBindings = readJson<JsonRecord>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/pilots/product-center-test-plan-gold-set-source-bindings.json',
  ));
  const candidatesById = new Map<string, JsonRecord>(
    gold.cases.map((item: JsonRecord) => [item.id, item]),
  );
  const recipesById = new Map<string, JsonRecord>(
    recipes.recipes.map((item: JsonRecord) => [item.caseId, item]),
  );

  return release.cases.map((released: JsonRecord) => {
    const candidate = candidatesById.get(released.internalCaseId);
    const recipe = recipesById.get(released.internalCaseId);
    if (!candidate || !recipe) {
      throw new Error(`测试方案技术绑定缺少 Gold/Recipe：${released.internalCaseId}`);
    }
    const candidateRefs = new Set<string>(candidate.sourceRefs ?? []);
    const matchedSourceBindings = sourceBindings.bindings
      .filter((item: JsonRecord) => candidateRefs.has(item.ref))
      .map((item: JsonRecord) => ({ ref: item.ref, sourceIds: [...item.sourceIds] }));
    return {
      canonicalId: released.canonicalId,
      internalCaseId: released.internalCaseId,
      module: candidate.module,
      route: candidate.route,
      sourceBindings: matchedSourceBindings,
      capabilityIds: recipe.capabilities.map((item: JsonRecord) => item.id),
      assertionAdapterIds: recipe.assertions.map((item: JsonRecord) => item.adapterId),
      seedAdapterIds: [...(candidate.execution?.seedAdapterIds ?? [])],
      cleanupAdapterIds: [...(candidate.execution?.cleanupAdapterIds ?? [])],
      verificationSignals: [...(candidate.execution?.verificationSignals ?? [])],
      claimIds: [...(recipe.claimIds ?? [])],
      claims: (candidate.claims ?? []).map((claim: JsonRecord) => ({
        id: claim.id,
        kind: claim.kind,
        text: claim.text,
      })),
      mutatesData: candidate.mutatesData === true,
      cleanup: [...(candidate.cleanup ?? [])],
    } satisfies ProductCenterTestPlanAutomationBinding;
  }).sort((left: ProductCenterTestPlanAutomationBinding, right: ProductCenterTestPlanAutomationBinding) =>
    left.canonicalId.localeCompare(right.canonicalId));
}

function evaluateIntakeNegativeFixtures(
  markdown: string,
  bindings: readonly ProductCenterTestPlanAutomationBinding[],
): {
  total: number;
  correct: number;
  falsePromotions: number;
  samples: Array<{ id: string; expectedIssueCode: string; passed: boolean }>;
} {
  const firstBinding = bindings[0];
  if (!firstBinding) return { total: 0, correct: 0, falsePromotions: 0, samples: [] };
  const firstCaseMarkdown = extractCase(markdown, firstBinding.canonicalId);
  const fixtures = [
    {
      id: 'missing-sidebar',
      expectedIssueCode: 'SIDEBAR_ENTRY_REQUIRED',
      binding: { ...firstBinding, capabilityIds: firstBinding.capabilityIds.slice(1) },
    },
    {
      id: 'claim-text-mismatch',
      expectedIssueCode: 'CLAIM_TEXT_MISMATCH',
      binding: {
        ...firstBinding,
        claims: (firstBinding.claims ?? []).map((claim, index) => (
          index === 0 ? { ...claim, text: `${claim.text}-changed` } : claim
        )),
      },
    },
    {
      id: 'missing-verification-signal',
      expectedIssueCode: 'EXPECTATION_NOT_OBSERVABLE',
      binding: { ...firstBinding, verificationSignals: [] },
    },
  ];
  const samples = fixtures.map((fixture) => {
    const result = buildProductCenterTestPlanIntake({
      markdown: firstCaseMarkdown,
      bindings: [fixture.binding],
    });
    const passed = result.summary.generated === 0
      && result.summary.reviewRequired === 1
      && (result.reviewRequired[0]?.issueCodes as readonly string[] | undefined)
        ?.includes(fixture.expectedIssueCode) === true;
    return { id: fixture.id, expectedIssueCode: fixture.expectedIssueCode, passed };
  });
  return {
    total: samples.length,
    correct: samples.filter((sample) => sample.passed).length,
    falsePromotions: samples.filter((sample) => !sample.passed).length,
    samples,
  };
}

function extractCase(markdown: string, caseId: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const heading = `### 用例编号：${caseId}`;
  const start = normalized.indexOf(heading);
  if (start < 0) throw new Error(`评测样本未找到：${caseId}`);
  const next = normalized.indexOf('\n### 用例编号：', start + heading.length);
  return `${normalized.slice(start, next < 0 ? normalized.length : next).trim()}\n`;
}

function summarizeMetadata(cases: readonly JsonRecord[]) {
  const isComplete = (item: JsonRecord) => item.capabilityIds[0] === 'navigation.sidebar.open'
    && item.assertionAdapterIds.length > 0
    && item.claimIds.length === item.preconditions.length + item.actions.length + item.expectedResults.length
    && item.claimIds.length === item.claims?.length
    && item.sourceTrace.length > 0
    && item.sourceTrace.every((trace: JsonRecord) => trace.sourceIds.length > 0)
    && item.dataPrerequisites.descriptions.length > 0
    && (!item.mutatesData || item.cleanupAdapterIds.length > 0);
  return {
    complete: cases.filter(isComplete).length,
    incomplete: cases.filter((item) => !isComplete(item)).length,
    sidebarComplete: cases.filter((item) => item.capabilityIds[0] === 'navigation.sidebar.open').length,
    sourceTraceComplete: cases.filter((item) =>
      item.sourceTrace.length > 0
      && item.sourceTrace.every((trace: JsonRecord) => trace.sourceIds.length > 0)).length,
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

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} 缺少路径`);
  return value;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const paths = buildProductCenterTestPlanIntakeV1Artifacts({
      inputPath: readOption(args, '--input'),
      bindingsPath: readOption(args, '--bindings'),
      runtimeAuditPath: readOption(args, '--runtime-audit'),
    });
    process.stdout.write(`商品中心真实测试方案输入：\n${paths.releasePath}\n${paths.bindingsPath}\n${paths.reportPath}\n`);
    if (paths.status === 'review-required') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
