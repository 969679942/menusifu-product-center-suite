import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ProductCenterTestCaseInput } from '../utils/product-center-test-case-ir';
import { productCenterGenerationHoldout } from '../contracts/product-center/test-cases/product-center-generation-holdout';
import {
  buildProductCenterGeneratedCaseRelease,
  evaluateProductCenterGenerationHoldout,
  renderGeneratedProductCenterTestCases,
  type GeneratedProductCenterTestCase,
  type ProductCenterGenerationBlockedDecision,
} from '../utils/product-center-test-case-generator';
import { diagnoseProductCenterMarkdownTestPlan } from '../utils/product-center-test-plan-markdown';
import {
  reconcileProductCenterRuntimeAudit,
  type ProductCenterRuntimeAuditCorrectionDocument,
} from '../utils/product-center-runtime-audit-correction';

export function buildProductCenterTestPlanGenerationV1Artifacts(options: {
  projectRoot?: string;
  outputRoot?: string;
  runtimeAuditPath?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const goldPath = path.join(projectRoot, 'contracts/product-center/test-cases/pilots/product-center-test-plan-gold-set.json');
  const decisionsPath = path.join(projectRoot, 'contracts/product-center/reviews/unsupported-source-format-decisions.json');
  const releasePath = path.join(outputRoot, 'contracts/product-center/test-cases/generated/product-center-test-plan-generation-v1.json');
  const markdownPath = path.join(outputRoot, 'contracts/product-center/test-cases/generated/product-center-test-plan-generation-v1.md');
  const reportPath = path.join(outputRoot, 'output/test-case-audit/product-center/test-plan-generation-v1-latest.json');
  const blockedPath = path.join(outputRoot, 'output/test-case-audit/product-center/test-plan-generation-v1-blocked.json');
  const holdoutPath = path.join(outputRoot, 'output/test-case-audit/product-center/test-plan-generation-v1-holdout.json');
  const defaultRuntimeAuditPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-test-plan-generation-v1-runtime-audit.json',
  );
  const runtimeAuditPath = options.runtimeAuditPath
    ? path.resolve(projectRoot, options.runtimeAuditPath)
    : fs.existsSync(defaultRuntimeAuditPath) ? defaultRuntimeAuditPath : undefined;

  const gold = readJson<{ cases: ProductCenterTestCaseInput[] }>(goldPath);
  const decisions = readJson<{ cases: ProductCenterGenerationBlockedDecision[] }>(decisionsPath);
  const existing = readOptionalJson<{ cases: GeneratedProductCenterTestCase[] }>(releasePath);
  const runtimeAudit = runtimeAuditPath
    ? readJson<ProductCenterRuntimeAuditCorrectionDocument>(runtimeAuditPath)
    : undefined;
  const runtimeReconciliation = runtimeAudit
    ? reconcileProductCenterRuntimeAudit(gold.cases, runtimeAudit, {
      rootDir: projectRoot,
      expectedPlanId: runtimeAudit.schemaVersion === '2.0.0'
        ? 'product-center-test-plan-generation-v1'
        : undefined,
    })
    : {
      status: 'passed' as const,
      cases: gold.cases,
      corrections: [],
      businessRuleChanges: [],
      technicalBindingChanges: [],
      coverageChanges: [],
      issues: [],
      evidence: { registered: 0, consumed: 0, unregistered: [], invalid: [] },
    };
  if (runtimeReconciliation.status !== 'passed') {
    throw new Error(`运行时审计校正未通过：${runtimeReconciliation.issues.map((item) => `${item.caseId}:${item.message}`).join('；')}`);
  }
  const release = buildProductCenterGeneratedCaseRelease({
    candidates: runtimeReconciliation.cases,
    blockedDecisions: decisions.cases,
    existingCases: existing?.cases,
  });
  const holdoutEvaluation = evaluateProductCenterGenerationHoldout({
    samples: productCenterGenerationHoldout.samples,
  });
  const markdown = renderGeneratedProductCenterTestCases(release.cases);
  const diagnostics = diagnoseProductCenterMarkdownTestPlan(markdown);
  if (diagnostics.status !== 'valid') {
    throw new Error(`生成 Markdown 校验失败：issues=${diagnostics.issues.length}`);
  }
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ release, markdown }))
    .digest('hex');
  const releaseArtifact = {
    schemaVersion: release.schemaVersion,
    collectionId: release.collectionId,
    fingerprint,
    namingPolicy: release.namingPolicy,
    status: release.status,
    summary: {
      ...release.summary,
      falsePromotions: holdoutEvaluation.summary.falsePromotions,
    },
    cases: release.cases,
    reviewRequired: release.reviewRequired,
  };
  const blockedArtifact = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-test-plan-generation-v1-blocked',
    fingerprint,
    summary: {
      total: release.blockedCases.length,
      currentGoalBlocking: release.blockedCases.filter((item) => item.currentGoalBlocking).length,
    },
    cases: release.blockedCases,
  };
  const report = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    collectionId: release.collectionId,
    fingerprint,
    status: release.status,
    naming: {
      policy: release.namingPolicy,
      valid: release.cases.length,
      invalid: release.reviewRequired.filter((item) => item.issueCodes.includes('INVALID_TITLE')).length,
    },
    sourceGate: {
      generated: release.cases.length,
      blocked: release.blockedCases.length,
      falsePromotions: holdoutEvaluation.summary.falsePromotions,
    },
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
    holdoutEvaluation,
    markdownDiagnostics: diagnostics,
    reviewRequired: release.reviewRequired,
  };

  writeJson(releasePath, releaseArtifact);
  writeText(markdownPath, markdown);
  writeJson(blockedPath, blockedArtifact);
  writeJson(holdoutPath, {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-test-plan-generation-v1-holdout-evaluation',
    generatedAt: report.generatedAt,
    ...holdoutEvaluation,
  });
  writeJson(reportPath, report);
  return { releasePath, markdownPath, reportPath, blockedPath, holdoutPath };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function readOptionalJson<T>(filePath: string): T | null {
  return fs.existsSync(filePath) ? readJson<T>(filePath) : null;
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
  try {
    const runtimeAuditPath = process.argv.find((item) => item.startsWith('--runtime-audit='))?.slice('--runtime-audit='.length);
    const paths = buildProductCenterTestPlanGenerationV1Artifacts({ runtimeAuditPath });
    process.stdout.write(`商品中心测试方案生成第一版：\n${paths.releasePath}\n${paths.markdownPath}\n${paths.reportPath}\n${paths.blockedPath}\n${paths.holdoutPath}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
