import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeProductCenterFailures,
  evaluateFailureClassificationBaseline,
  type ProductCenterFailureAnalysisInput,
  type ProductCenterFailureEvidenceEntry,
  type ProductCenterFailureFeedbackEntry,
  type ProductCenterFailureTimingCase,
} from '../utils/product-center-failure-analysis';
import { findIncompleteCheckpointFiles, scanGeneratedArtifacts } from '../utils/product-center-run-safety';

type FeedbackDocument = {
  fingerprint?: string;
  runId?: string;
  entries?: ProductCenterFailureFeedbackEntry[];
};
type EvidenceDocument = {
  runId?: string;
  entries?: Array<ProductCenterFailureEvidenceEntry & {
    context?: { environmentId?: string };
    release?: { runId?: string; environmentFingerprint?: string; applicationFingerprint?: string };
    api?: Record<string, unknown>;
    cleanup?: { required?: boolean; completed?: boolean; residueCount?: number };
    execution?: { phaseDurationsMs?: { seed?: number; cleanup?: number } };
  }>;
};
type TimingDocument = { generatedAt?: string; cases?: ProductCenterFailureTimingCase[] };
type BaselineDocument = { samples: ProductCenterFailureAnalysisInput[] };
type PageContractDiff = {
  status?: 'clean' | 'review-required';
  pipelineRunId?: string;
  probeRunId?: string;
  evidenceRunId?: string;
};
type AcceptanceDocument = { fingerprint?: string; accepted?: boolean; issues?: unknown[] };

const projectRoot = path.resolve(__dirname, '..');

function main(): void {
  const feedbackPaths = [
    'output/recipes/product-center-pilot-feedback.json',
    'output/recipes/product-center-test-plan-gold-set-feedback.json',
    'output/recipes/product-center-item-intake-pilot-feedback.json',
  ];
  const evidencePaths = [
    'output/recipes/product-center-pilot-evidence.json',
    'output/recipes/product-center-test-plan-gold-set-evidence.json',
    'output/recipes/product-center-item-intake-pilot-evidence.json',
  ];
  const checkpointDirectory = path.join(projectRoot, 'output/checkpoints');
  const checkpointPaths = listJsonFiles(checkpointDirectory);
  const incompleteCheckpoints = findIncompleteCheckpointFiles(checkpointDirectory);
  const timingSources = listTimingReports(path.join(projectRoot, 'output/performance'));
  const pageContractPath = 'output/page-contract/product-center-page-contract-diff.json';
  const pageContract = readJson<PageContractDiff>(absolutePath(pageContractPath));
  const expectedPipelineRunId = process.env.PC_QUALITY_PIPELINE_RUN_ID;
  if (expectedPipelineRunId && pageContract.pipelineRunId !== expectedPipelineRunId) {
    throw new Error(
      `失败分析拒绝复用旧页面 diff：expected=${expectedPipelineRunId};actual=${pageContract.pipelineRunId ?? 'missing'}`,
    );
  }
  const baselinePath = absolutePath(
    'contracts/product-center/failure-analysis/product-center-failure-classification-baseline.json',
  );
  const baseline = evaluateFailureClassificationBaseline(
    readJson<BaselineDocument>(baselinePath).samples,
  );

  const feedbackSources = feedbackPaths.map((filePath, index) => ({
      collectionId: ['core', 'test-plan-gold-set', 'item-intake'][index],
      path: filePath,
      document: readJson<FeedbackDocument>(absolutePath(filePath)),
    }));
  const evidenceSources = evidencePaths.map((filePath) => ({
      path: filePath,
      document: readJson<EvidenceDocument>(absolutePath(filePath)),
    }));
  const runEvidenceVerification = deriveFailureRunEvidenceVerification({
    feedbackSources,
    evidenceSources,
  });
  const analysis = analyzeProductCenterFailures({
    feedbackSources,
    evidenceSources,
    timingSources,
    acceptanceSources: [
      {
        collectionId: 'core',
        path: 'output/recipes/product-center-pilot-acceptance.json',
      },
      {
        collectionId: 'test-plan-gold-set',
        path: 'output/recipes/product-center-test-plan-gold-set-acceptance.json',
      },
    ].map((source) => ({
      ...source,
      document: readJson<AcceptanceDocument>(absolutePath(source.path)),
    })),
    cleanup: {
      status: checkpointPaths.length === 0
        ? 'not-applicable'
        : incompleteCheckpoints.length === 0 ? 'verified-clean' : 'residue-detected',
      evidenceRefs: checkpointPaths.length === 0 ? [] : ['output/checkpoints'],
    },
    environmentVerified: runEvidenceVerification.environmentVerified,
    testDataVerified: runEvidenceVerification.testDataVerified,
    pageContract: {
      status: pageContract.status ?? 'unknown',
      evidenceRef: pageContractPath,
    },
  });
  const outputPath = absolutePath('output/failure-analysis/product-center-failure-analysis.json');
  writeJsonAtomic(outputPath, {
    ...analysis,
    baseline,
    runEvidenceVerification,
    pageContractRun: {
      pipelineRunId: pageContract.pipelineRunId ?? null,
      probeRunId: pageContract.probeRunId ?? null,
      evidenceRunId: pageContract.evidenceRunId ?? null,
    },
  });
  const sensitiveFindings = scanGeneratedArtifacts(path.dirname(outputPath));
  if (sensitiveFindings.length > 0) {
    throw new Error(`失败分析产物敏感扫描未通过：${sensitiveFindings.length}`);
  }
  process.stdout.write(
    `商品中心失败分析：${outputPath}\n失败=${analysis.summary.failedCases}；未决=${analysis.summary.unresolvedFailures}；产品失败=${analysis.summary.productFailures}\n`,
  );
  if (baseline.accuracy !== 1 || baseline.falseProductPromotions !== 0) process.exitCode = 1;
}

export function deriveFailureRunEvidenceVerification(input: {
  feedbackSources: ReadonlyArray<{ path: string; document: FeedbackDocument }>;
  evidenceSources: ReadonlyArray<{ path: string; document: EvidenceDocument }>;
}) {
  const failedFeedbackSources = input.feedbackSources.filter((source) => (
    (source.document.entries ?? []).some((entry) => entry.status !== 'passed' && entry.status !== 'skipped')
  ));
  if (failedFeedbackSources.length === 0) {
    return {
      source: 'same-run-runtime-evidence' as const,
      status: 'not-applicable' as const,
      runIds: [],
      evidenceEntries: 0,
      environmentVerified: true,
      testDataVerified: true,
      issues: [],
    };
  }
  const evidenceByStem = new Map(input.evidenceSources.map((source) => [
    source.path.replace(/-evidence\.json$/, ''),
    source,
  ]));
  const issues: string[] = [];
  const runIds: string[] = [];
  let evidenceEntries = 0;
  for (const feedback of failedFeedbackSources) {
    const stem = feedback.path.replace(/-feedback\.json$/, '');
    const evidence = evidenceByStem.get(stem);
    const feedbackRunId = feedback.document.runId?.trim();
    const evidenceRunId = evidence?.document.runId?.trim();
    if (!evidence || !feedbackRunId || feedbackRunId !== evidenceRunId) {
      issues.push(`RUN_ID_MISMATCH:${feedback.path}`);
      continue;
    }
    runIds.push(feedbackRunId);
    for (const entry of evidence.document.entries ?? []) {
      evidenceEntries += 1;
      if (entry.release?.runId !== evidenceRunId
        || !entry.release.environmentFingerprint
        || !entry.release.applicationFingerprint
        || !entry.context?.environmentId) {
        issues.push(`ENVIRONMENT_EVIDENCE_INCOMPLETE:${evidence.path}:${entry.recipeId ?? 'unknown'}`);
      }
      if (!entry.api || !entry.execution?.phaseDurationsMs
        || !Number.isFinite(entry.execution.phaseDurationsMs.seed)
        || !Number.isFinite(entry.execution.phaseDurationsMs.cleanup)) {
        issues.push(`TEST_DATA_EVIDENCE_INCOMPLETE:${evidence.path}:${entry.recipeId ?? 'unknown'}`);
      }
      if (entry.cleanup?.required === true
        && (entry.cleanup.completed !== true || entry.cleanup.residueCount !== 0)) {
        issues.push(`CLEANUP_NOT_VERIFIED:${evidence.path}:${entry.recipeId ?? 'unknown'}`);
      }
    }
  }
  const environmentIssues = issues.filter((issue) => (
    issue.startsWith('RUN_ID_MISMATCH') || issue.startsWith('ENVIRONMENT_EVIDENCE_INCOMPLETE')
  ));
  const dataIssues = issues.filter((issue) => (
    issue.startsWith('RUN_ID_MISMATCH')
    || issue.startsWith('TEST_DATA_EVIDENCE_INCOMPLETE')
    || issue.startsWith('CLEANUP_NOT_VERIFIED')
  ));
  return {
    source: 'same-run-runtime-evidence' as const,
    status: issues.length === 0 ? 'verified' as const : 'review-required' as const,
    runIds: [...new Set(runIds)].sort(),
    evidenceEntries,
    environmentVerified: evidenceEntries > 0 && environmentIssues.length === 0,
    testDataVerified: evidenceEntries > 0 && dataIssues.length === 0,
    issues,
  };
}

function listTimingReports(directory: string) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => /^product-center-timing-\d+\.json$/.test(name))
    .map((name) => {
      const filePath = path.join(directory, name);
      return { filePath, document: readJson<TimingDocument>(filePath) };
    })
    .sort((left, right) => String(left.document.generatedAt).localeCompare(String(right.document.generatedAt)))
    .slice(-30)
    .map(({ filePath, document }) => ({ path: relativePath(filePath), document }));
}

function listJsonFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJsonFiles(filePath);
    return entry.isFile() && entry.name.endsWith('.json') ? [filePath] : [];
  });
}

function absolutePath(relative: string): string {
  return path.join(projectRoot, relative);
}

function relativePath(filePath: string): string {
  return path.relative(projectRoot, filePath).replace(/\\/g, '/');
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`失败分析输入不存在：${relativePath(filePath)}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) main();
