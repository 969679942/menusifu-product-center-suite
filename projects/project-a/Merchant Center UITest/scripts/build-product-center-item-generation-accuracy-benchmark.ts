import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { productCenterGenerationHoldout } from '../contracts/product-center/test-cases/product-center-generation-holdout';
import { evaluateProductCenterGenerationHoldout } from '../utils/product-center-test-case-generator';
import type { ProductCenterItemFullReviewDocument } from '../utils/product-center-item-full-review';
import type {
  ProductCenterItemRebuiltCase,
  ProductCenterItemXmindRebuildPlan,
} from '../utils/product-center-item-xmind-rebuild';

type BenchmarkMismatch = {
  caseId: string;
  reasons: string[];
};

export function buildProductCenterItemGenerationAccuracyBenchmark(options: {
  projectRoot?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const canonicalRoot = path.join(projectRoot, 'contracts/product-center/test-cases/canonical');
  const plan = readJson<ProductCenterItemXmindRebuildPlan>(path.join(
    canonicalRoot,
    'product-center-item-xmind-rebuild-pilot.json',
  ));
  const review = readJson<ProductCenterItemFullReviewDocument>(path.join(
    canonicalRoot,
    'product-center-item-full-review.json',
  ));
  const sourcePlanFingerprintMatched = review.sourcePlanFingerprint === plan.fingerprint;
  const planById = new Map(plan.cases.map((item) => [item.id, item]));
  const approvedEntries = review.entries.filter((item) => item.decision === 'approved');
  const deprecatedEntries = review.entries.filter((item) => item.decision === 'deprecated');
  const mismatches: BenchmarkMismatch[] = [];
  const cases = approvedEntries.map((entry) => {
    const candidate = planById.get(entry.caseId);
    const reasons = candidate ? conformanceReasons(candidate, entry) : ['CURRENT_PLAN_CASE_MISSING'];
    if (reasons.length > 0) mismatches.push({ caseId: entry.caseId, reasons });
    return {
      caseId: entry.caseId,
      priority: entry.priority,
      origin: entry.origin,
      productType: candidate?.productType ?? 'unknown',
      labelDecision: entry.decision,
      labelSource: entry.reviewMethod,
      dimensions: entry.dimensions,
      conformant: reasons.length === 0,
      mismatchReasons: reasons,
    };
  });
  const deprecatedMismatches = deprecatedEntries.flatMap((entry) => {
    const candidate = planById.get(entry.caseId);
    return candidate?.status === 'deprecated'
      ? []
      : [{ caseId: entry.caseId, reasons: ['DEPRECATED_CASE_STATE_MISMATCH'] }];
  });
  mismatches.push(...deprecatedMismatches);
  const holdout = evaluateProductCenterGenerationHoldout({
    samples: productCenterGenerationHoldout.samples,
  });
  const allDimensionsPassed = cases.every((item) =>
    Object.values(item.dimensions).every((value) => value === 'pass'));
  const activeCanonicalCount = plan.cases.filter((item) => item.status !== 'deprecated').length;
  const denominatorLocked = cases.length === activeCanonicalCount
    && deprecatedEntries.length === plan.cases.length - activeCanonicalCount
    && review.summary.total === plan.cases.length;
  const accepted = denominatorLocked
    && sourcePlanFingerprintMatched
    && allDimensionsPassed
    && mismatches.length === 0
    && holdout.summary.total >= productCenterGenerationHoldout.policy.minimumSamples
    && holdout.summary.correct === holdout.summary.total
    && holdout.summary.falsePromotions === 0
    && holdout.summary.falseRejections === 0;
  const semanticValue = {
    sourceFingerprints: {
      plan: plan.fingerprint,
      review: review.fingerprint,
    },
    releaseConformance: {
      total: cases.length,
      conformant: cases.filter((item) => item.conformant).length,
      mismatched: mismatches.length,
      conformanceRate: cases.length === 0
        ? 0
        : cases.filter((item) => item.conformant).length / cases.length,
      sourcePlanFingerprintMatched,
      allDimensionsPassed,
      byPriority: countBy(cases, (item) => item.priority),
      byOrigin: countBy(cases, (item) => item.origin),
      byProductType: countBy(cases, (item) => item.productType),
    },
    independentHoldout: {
      total: holdout.summary.total,
      correct: holdout.summary.correct,
      mismatched: holdout.summary.mismatched,
      decisionAccuracy: holdout.summary.decisionAccuracy,
      falsePromotions: holdout.summary.falsePromotions,
      falseRejections: holdout.summary.falseRejections,
      samples: holdout.samples,
    },
    claimBoundary: {
      releaseCasesAreIndependentHoldout: false as const,
      generalizationAccuracyClaimed: false as const,
      independentHoldoutCases: holdout.summary.total,
    },
    guardrails: {
      denominatorLocked,
      samplingAllowed: false as const,
      staleReviewAllowed: false as const,
      unlabeledReleaseAllowed: false as const,
    },
    cases,
    mismatches,
  };
  const benchmark = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-generation-accuracy-benchmark' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: accepted ? 'accepted-with-limitations' as const : 'blocked' as const,
    ...semanticValue,
    limitations: [
      `${cases.length} 条用于验证当前发布内容与冻结全审标签的一致性，不是独立盲测样本。`,
      `独立生成判定准确率当前由 ${holdout.summary.total} 条 human-reviewed holdout 样本证明。`,
      `不得用 ${cases.length}/${cases.length} 一致性结果声明未见场景的泛化准确率。`,
    ],
    fingerprint: createHash('sha256').update(JSON.stringify(semanticValue)).digest('hex'),
  };
  if (!accepted) {
    throw new Error(
      `当前准确性基准未通过：cases=${cases.length};deprecated=${deprecatedEntries.length};mismatches=${mismatches.length};holdout=${holdout.summary.correct}/${holdout.summary.total}`,
    );
  }
  const outputPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-item-generation-accuracy-benchmark.json',
  );
  writeJson(outputPath, benchmark);
  return { benchmark, outputPath };
}

function conformanceReasons(
  candidate: ProductCenterItemRebuiltCase,
  entry: ProductCenterItemFullReviewDocument['entries'][number],
): string[] {
  const reasons: string[] = [];
  if (candidate.status === 'deprecated') reasons.push('APPROVED_CASE_DEPRECATED_IN_CURRENT_PLAN');
  if (candidate.title !== entry.title) reasons.push('TITLE_MISMATCH');
  if (candidate.priority !== entry.priority) reasons.push('PRIORITY_MISMATCH');
  if (candidate.source !== entry.source) reasons.push('SOURCE_MISMATCH');
  if (entry.originalStatus !== candidate.status) reasons.push('ORIGINAL_STATUS_MISMATCH');
  if (entry.issues.length > 0) reasons.push('REVIEW_ISSUES_NOT_EMPTY');
  if (Object.values(entry.dimensions).some((value) => value !== 'pass')) {
    reasons.push('REVIEW_DIMENSION_NOT_PASSED');
  }
  return reasons;
}

function countBy<T>(items: readonly T[], keyOf: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((result, item) => {
    const key = keyOf(item);
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const { benchmark, outputPath } = buildProductCenterItemGenerationAccuracyBenchmark();
    process.stdout.write(
      `当前准确性基准已生成：${outputPath}\n发布一致性=${benchmark.releaseConformance.conformant}/${benchmark.releaseConformance.total}；独立 Holdout=${benchmark.independentHoldout.correct}/${benchmark.independentHoldout.total}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
