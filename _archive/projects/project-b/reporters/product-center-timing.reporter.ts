import type { FullResult, Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import fs from 'node:fs';
import path from 'node:path';
import {
  fingerprintFailureDiagnostic,
  sanitizeFailureDiagnostic,
} from '../utils/product-center-failure-analysis';
import {
  evaluateProductCenterPerformanceBudget,
  normalizeProductCenterPerformancePhases,
  summarizeProductCenterPerformancePhases,
  type ProductCenterPerformanceBudgetInput,
} from '../utils/product-center-performance-budget';

export { sanitizeFailureDiagnostic } from '../utils/product-center-failure-analysis';

type StepTiming = {
  title: string;
  category: string;
  durationMs: number;
  children: StepTiming[];
};

export type RuntimeLifecycleTiming = {
  phase: string;
  id: string;
  durationMs: number;
  status: 'passed' | 'failed';
};

export type RuntimeLifecycleCoverage = {
  observedDurationMs: number;
  unclassifiedDurationMs: number;
  coveragePercent: number;
};

type CaseTiming = {
  title: string;
  file: string;
  project: string;
  status: TestResult['status'];
  expectedStatus: string;
  durationMs: number;
  workerIndex: number;
  retry: number;
  startedAt: string;
  steps: StepTiming[];
  diagnostic?: string;
  diagnosticFingerprint?: string;
  runtimeEvidence?: Record<string, unknown>;
  lifecycleTimings?: RuntimeLifecycleTiming[];
  lifecycleCoverage?: RuntimeLifecycleCoverage;
  performanceBudget?: ReturnType<typeof evaluateProductCenterPerformanceBudget>;
};

export function sanitizeStepTitle(title: string): string {
  if (/^Fill\b/i.test(title)) return 'Fill <redacted>';
  return title
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<redacted-email>')
    .replace(/(authorization|password|cookie|token)\s*[:=]\s*[^,;\s]+/gi, '$1=<redacted>');
}

function serializeStep(step: TestStep): StepTiming {
  return {
    title: sanitizeStepTitle(step.title),
    category: step.category,
    durationMs: step.duration,
    children: step.steps.map(serializeStep),
  };
}

export default class ProductCenterTimingReporter implements Reporter {
  private readonly cases: CaseTiming[] = [];
  private startedAt = Date.now();

  onBegin(): void {
    this.startedAt = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (!test.location.file.includes('product-center') && !test.location.file.includes('auth.setup')) return;
    const runtimeEvidence = parseRuntimeEvidence(result);
    const phases = runtimeEvidencePhases(runtimeEvidence);
    const lifecycleTimings = extractRuntimeLifecycleTimings(runtimeEvidence);
    const diagnostic = result.error?.message ? sanitizeFailureDiagnostic(result.error.message) : undefined;
    this.cases.push({
      title: test.title,
      file: path.relative(process.cwd(), test.location.file),
      project: test.parent.project()?.name ?? '',
      status: result.status,
      expectedStatus: test.expectedStatus,
      durationMs: result.duration,
      workerIndex: result.workerIndex,
      retry: result.retry,
      startedAt: result.startTime.toISOString(),
      steps: result.steps.map(serializeStep),
      ...(diagnostic ? {
        diagnostic,
        diagnosticFingerprint: fingerprintFailureDiagnostic(diagnostic),
      } : {}),
      ...(runtimeEvidence ? { runtimeEvidence } : {}),
      ...(lifecycleTimings ? {
        lifecycleTimings,
        lifecycleCoverage: calculateRuntimeLifecycleCoverage(result.duration, lifecycleTimings),
      } : {}),
      ...(phases ? {
        performanceBudget: evaluateProductCenterPerformanceBudget({
          scope: 'case',
          totalDurationMs: result.duration,
          phases,
        }),
      } : {}),
    });
  }

  onEnd(result: FullResult): void {
    const outputDirectory = path.resolve('output/performance');
    fs.mkdirSync(outputDirectory, { recursive: true });
    const outputPath = process.env.PW_TIMING_OUTPUT
      ? path.resolve(process.env.PW_TIMING_OUTPUT)
      : path.join(outputDirectory, 'product-center-timing-' + Date.now() + '.json');
    const cases = [...this.cases].sort((left, right) => right.durationMs - left.durationMs);
    const durationMs = Date.now() - this.startedAt;
    const phases = summarizeProductCenterPerformancePhases(
      cases.flatMap((item) => {
        const itemPhases = runtimeEvidencePhases(item.runtimeEvidence);
        return itemPhases ? [itemPhases] : [];
      }),
    );
    phases.auth = cases
      .filter((item) => item.file.includes('auth.setup'))
      .reduce((total, item) => total + item.durationMs, 0);
    const performanceBudget = evaluateProductCenterPerformanceBudget({
      scope: process.env.PC_RECIPE_RUN_SCOPE ?? 'full',
      totalDurationMs: durationMs,
      phases,
    });
    fs.writeFileSync(outputPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      status: result.status,
      durationMs,
      caseCount: cases.length,
      passed: cases.filter((item) => item.status === 'passed').length,
      failed: cases.filter((item) => item.status === 'failed' || item.status === 'timedOut').length,
      performanceBudget,
      lifecycleCoverage: summarizeRuntimeLifecycleCoverage(cases),
      cases,
    }, null, 2));
    process.stdout.write('商品中心耗时报告：' + outputPath + '\n');
  }

  printsToStdio(): boolean {
    return false;
  }
}

function runtimeEvidencePhases(
  evidence: Record<string, unknown> | undefined,
): ProductCenterPerformanceBudgetInput['phases'] | undefined {
  if (!evidence) return undefined;
  const execution = evidence.execution;
  if (!execution || typeof execution !== 'object' || Array.isArray(execution)) return undefined;
  const phases = (execution as Record<string, unknown>).phaseDurationsMs;
  if (!phases || typeof phases !== 'object' || Array.isArray(phases)) return undefined;
  return normalizeProductCenterPerformancePhases(
    phases as Partial<ProductCenterPerformanceBudgetInput['phases']>,
  );
}

export function extractRuntimeLifecycleTimings(
  evidence: Record<string, unknown> | undefined,
): RuntimeLifecycleTiming[] | undefined {
  const values = evidence?.executionTimings;
  if (!Array.isArray(values)) return undefined;
  const timings = values.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    if (typeof item.phase !== 'string'
      || typeof item.id !== 'string'
      || typeof item.durationMs !== 'number'
      || (item.status !== 'passed' && item.status !== 'failed')) return [];
    return [{
      phase: item.phase,
      id: item.id,
      durationMs: Math.max(0, item.durationMs),
      status: item.status as RuntimeLifecycleTiming['status'],
    }];
  });
  return timings.length > 0 ? timings : undefined;
}

export function calculateRuntimeLifecycleCoverage(
  totalDurationMs: number,
  timings: readonly RuntimeLifecycleTiming[],
): RuntimeLifecycleCoverage {
  const observedDurationMs = timings.reduce((total, item) => total + item.durationMs, 0);
  const boundedObservedDurationMs = Math.min(Math.max(0, totalDurationMs), observedDurationMs);
  const unclassifiedDurationMs = Math.max(0, totalDurationMs - boundedObservedDurationMs);
  return {
    observedDurationMs: boundedObservedDurationMs,
    unclassifiedDurationMs,
    coveragePercent: totalDurationMs > 0
      ? Math.round((boundedObservedDurationMs / totalDurationMs) * 10_000) / 100
      : 100,
  };
}

function summarizeRuntimeLifecycleCoverage(cases: readonly CaseTiming[]) {
  const coveredCases = cases.filter((item) => item.lifecycleCoverage);
  const totalDurationMs = coveredCases.reduce((total, item) => total + item.durationMs, 0);
  const observedDurationMs = coveredCases.reduce(
    (total, item) => total + (item.lifecycleCoverage?.observedDurationMs ?? 0),
    0,
  );
  return {
    coveredCaseCount: coveredCases.length,
    totalCaseCount: cases.length,
    observedDurationMs,
    unclassifiedDurationMs: Math.max(0, totalDurationMs - observedDurationMs),
    coveragePercent: totalDurationMs > 0
      ? Math.round((observedDurationMs / totalDurationMs) * 10_000) / 100
      : 0,
  };
}

function parseRuntimeEvidence(result: TestResult): Record<string, unknown> | undefined {
  const body = result.attachments
    .find((attachment) => attachment.name === 'product-center-runtime-evidence'
      || attachment.name === 'system-test-runtime-evidence')
    ?.body?.toString('utf8');
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}


