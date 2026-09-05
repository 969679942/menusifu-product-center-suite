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

  onEnd(result: FullResult): { status: FullResult['status'] } {
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
      failures: [...this.failures].sort((left, right) => left.route.localeCompare(right.route)),
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, outputPath);
    return { status: this.failed || result.status !== 'passed' ? 'failed' : 'passed' };
  }
}

function routeFromTitle(title: string): string {
  const separator = title.lastIndexOf('：');
  const route = separator >= 0 ? title.slice(separator + 1).trim() : '';
  return route.startsWith('/') ? route : '/unknown';
}

function parseAttempt(value: string | undefined): number {
  const attempt = Number(value ?? 0);
  return Number.isInteger(attempt) && attempt >= 0 ? attempt : 0;
}
