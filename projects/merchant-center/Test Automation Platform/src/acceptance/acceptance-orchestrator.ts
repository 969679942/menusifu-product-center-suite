import fs from 'node:fs';
import path from 'node:path';
import type { AcceptanceProjectManifest } from './acceptance-manifest';
import { redactAcceptanceDiagnostic } from './redaction';

export type AcceptanceSafetySnapshot = {
  incompleteCheckpoints: number;
  sensitiveArtifacts: number;
  savedAuthStates: number;
};

export type AcceptanceCommand = {
  id: string;
  command: string;
  args: readonly string[];
};

export type AcceptanceCommandResult = {
  exitCode: number;
  diagnostic?: string;
};

export type RouteScanSummary = {
  status: 'passed' | 'failed';
  summary: {
    total: number;
    passed: number;
    failed: number;
    uiMatches: number;
    apiMatches: number;
  };
};

export type AcceptanceOrchestratorInput = {
  manifest: AcceptanceProjectManifest;
  commands: readonly AcceptanceCommand[];
  outputPath: string;
  runCommand: (command: AcceptanceCommand) => Promise<AcceptanceCommandResult>;
  scanRoutes: () => Promise<RouteScanSummary>;
  inspectSafety: () => Promise<AcceptanceSafetySnapshot>;
};

export type AcceptanceStage = {
  id: string;
  status: 'passed' | 'failed';
  durationMs: number;
  diagnostic?: string;
};

export type AcceptanceRunReport = {
  schemaVersion: '1.0.0';
  generatedAt: string;
  projectId: string;
  status: 'running' | 'passed' | 'failed';
  failedStage: string | null;
  stages: AcceptanceStage[];
  safety: {
    preflight?: AcceptanceSafetySnapshot;
    postflight?: AcceptanceSafetySnapshot;
  };
  routeScan?: RouteScanSummary['summary'];
};

export async function runAcceptanceOrchestrator(
  input: AcceptanceOrchestratorInput,
): Promise<AcceptanceRunReport> {
  const report: AcceptanceRunReport = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    projectId: input.manifest.projectId,
    status: 'running',
    failedStage: null,
    stages: [],
    safety: {},
  };
  const persist = () => writeJsonAtomic(input.outputPath, report);
  persist();

  const preflight = await input.inspectSafety();
  report.safety.preflight = preflight;
  if (!isSafetyClean(preflight)) {
    fail(report, 'preflight-safety');
    persist();
    return report;
  }
  persist();

  for (const command of input.commands) {
    const startedAt = Date.now();
    const result = await input.runCommand(command);
    report.stages.push({
      id: command.id,
      status: result.exitCode === 0 ? 'passed' : 'failed',
      durationMs: Date.now() - startedAt,
      ...(result.diagnostic ? { diagnostic: redactAcceptanceDiagnostic(result.diagnostic) } : {}),
    });
    if (result.exitCode !== 0) {
      fail(report, command.id);
      persist();
      return report;
    }
    persist();
  }

  const scanStartedAt = Date.now();
  try {
    const scan = await input.scanRoutes();
    report.routeScan = scan.summary;
    report.stages.push({
      id: 'route-scan',
      status: scan.status,
      durationMs: Date.now() - scanStartedAt,
    });
    if (scan.status === 'failed') fail(report, 'route-scan');
  } catch (error) {
    report.stages.push({
      id: 'route-scan',
      status: 'failed',
      durationMs: Date.now() - scanStartedAt,
      diagnostic: redactAcceptanceDiagnostic(String(error)),
    });
    fail(report, 'route-scan');
  }
  persist();

  const postflight = await input.inspectSafety();
  report.safety.postflight = postflight;
  if (!isSafetyClean(postflight)) fail(report, 'postflight-safety');
  if (!report.failedStage) report.status = 'passed';
  persist();
  return report;
}

function isSafetyClean(snapshot: AcceptanceSafetySnapshot): boolean {
  return Object.values(snapshot).every((count) => count === 0);
}

function fail(report: AcceptanceRunReport, stage: string): void {
  report.status = 'failed';
  report.failedStage ??= stage;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
