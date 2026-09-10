import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { redactAcceptanceDiagnostic } from '../utils/acceptance/redaction';
import { classifyProductCenterFailure } from '../utils/product-center-failure-classifier';

export default class ProductCenterLiveReleaseProbeReporter implements Reporter {
  private runId = process.env.PC_LIVE_RELEASE_PROBE_RUN_ID ?? '';
  private observedAt = '';
  private readonly entries: Array<Record<string, unknown>> = [];
  private readonly failures: Array<{
    route: string;
    status: string;
    diagnosticFingerprint: string;
    category: string;
    retryable: boolean;
    durationMs: number;
    attempt: number;
  }> = [];
  private readonly attempt = parseAttempt(process.env.PC_LIVE_RELEASE_PROBE_ATTEMPT);
  private failed = false;

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'passed') {
      this.failed = true;
      const route = routeFromTitle(test.title);
      const diagnostic = redactAcceptanceDiagnostic(
        result.error?.message ?? `status=${result.status}`,
      );
      const classification = classifyProductCenterFailure({
        message: diagnostic,
        assertion: Boolean(result.error && /expect\(|expected .* received/i.test(diagnostic)),
      });
      this.failures.push({
        route,
        status: result.status,
        diagnosticFingerprint: createHash('sha256').update(diagnostic).digest('hex'),
        category: classification.category,
        retryable: classification.retryable,
        durationMs: result.duration,
        attempt: this.attempt,
      });
    }
    const attachment = result.attachments.find(
      (item) => item.name === 'product-center-live-release-probe',
    );
    const body = attachment?.body?.toString('utf8');
    if (!body) return;
    try {
      const artifact = JSON.parse(body) as {
        runId?: string;
        observedAt?: string;
        entries?: Array<Record<string, unknown>>;
      };
      if (!artifact.runId || !Array.isArray(artifact.entries) || artifact.entries.length !== 1) {
        this.failed = true;
        return;
      }
      if (this.runId && this.runId !== artifact.runId) {
        this.failed = true;
        return;
      }
      this.runId = artifact.runId;
      this.observedAt = [this.observedAt, artifact.observedAt ?? ''].sort().at(-1) ?? '';
      this.entries.push({
        ...artifact.entries[0],
        durationMs: result.duration,
        attempt: this.attempt,
      });
    } catch {
      this.failed = true;
    }
  }

  async onEnd(result: FullResult): Promise<{ status: FullResult['status'] }> {
    const outputPath = process.env.PC_LIVE_RELEASE_PROBE_OUTPUT;
    if (!outputPath || !this.runId || (this.entries.length === 0 && this.failures.length === 0)) {
      return { status: 'failed' };
    }
    const artifact = {
      schemaVersion: '1.0.0',
      collectionId: 'product-center-live-release-probe',
      runId: this.runId,
      observedAt: this.observedAt,
      entries: [...this.entries].sort((left, right) => (
        String(left.route ?? '').localeCompare(String(right.route ?? ''))
      )),
      failures: expandAuthBlockedFailures({
        selectedRoutes: parseSelectedRoutes(process.env.PC_LIVE_RELEASE_PROBE_ROUTES),
        entries: this.entries,
        failures: this.failures,
        attempt: this.attempt,
      }).sort((left, right) => left.route.localeCompare(right.route)),
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, outputPath);
    return { status: this.failed || result.status !== 'passed' ? 'failed' : 'passed' };
  }
}

export function expandAuthBlockedFailures(input: {
  selectedRoutes: readonly string[];
  entries: ReadonlyArray<Record<string, unknown>>;
  failures: ReadonlyArray<{
    route: string;
    status: string;
    diagnosticFingerprint: string;
    category: string;
    retryable: boolean;
    durationMs: number;
    attempt: number;
  }>;
  attempt: number;
}) {
  const authFailures = input.failures.filter((failure) => failure.category === 'environment-auth');
  if (authFailures.length === 0) return [...input.failures];
  const source = authFailures[0];
  const hasUnknownAuthFailure = authFailures.some((failure) => failure.route === '/unknown');
  const retainedFailures = hasUnknownAuthFailure
    ? input.failures.filter((failure) => !(failure.category === 'environment-auth' && failure.route === '/unknown'))
    : [...input.failures];
  const reportedRoutes = new Set([
    ...input.entries.map((entry) => typeof entry.route === 'string' ? entry.route : '/unknown'),
    ...retainedFailures.map((failure) => failure.route),
  ]);
  const blocked = input.selectedRoutes
    .filter((route) => !reportedRoutes.has(route))
    .map((route) => ({
      route,
      status: 'blocked',
      diagnosticFingerprint: source.diagnosticFingerprint,
      category: 'environment-auth',
      retryable: false,
      durationMs: source.durationMs,
      attempt: input.attempt,
    }));
  return [...retainedFailures, ...blocked];
}

function routeFromTitle(title: string): string {
  const separator = title.lastIndexOf('：');
  const route = separator >= 0 ? title.slice(separator + 1).trim() : '';
  if (route.startsWith('/')) return route;
  const match = title.match(/\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+/);
  return match?.[0] ?? '/unknown';
}

function parseSelectedRoutes(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((route): route is string => typeof route === 'string')
      : [];
  } catch {
    return [];
  }
}

function parseAttempt(value: string | undefined): number {
  const attempt = Number(value ?? 0);
  return Number.isInteger(attempt) && attempt >= 0 ? attempt : 0;
}
