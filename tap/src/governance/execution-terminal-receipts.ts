export type PlaywrightExecutionReportManifest = {
  selectedCaseIds?: readonly string[];
  blockedCaseIds?: readonly string[];
  reportPaths?: readonly string[];
  runnerReports?: ReadonlyArray<{
    reportPath?: string;
    selectedCaseIds?: readonly string[];
  }>;
  authSetupStatus?: string;
  interruptionReason?: string | null;
};

type PlaywrightReport = {
  suites?: readonly unknown[];
};

const terminalResultStatuses = new Set(['passed', 'failed', 'timedOut', 'interrupted']);

export function resolveEvidenceLedgerTerminalCaseIds(input: {
  selectedCaseIds: readonly string[];
  currentCases: ReadonlyArray<{
    caseId: string;
    caseFingerprint: string;
    implementationFingerprint: string;
  }>;
  ledgers: ReadonlyArray<{
    cases?: Array<{
      caseId?: string;
      caseFingerprint?: string;
      implementationFingerprint?: string;
      playwrightStatus?: string;
    }>;
  }>;
}): string[] {
  const selected = new Set(input.selectedCaseIds);
  const currentById = new Map(input.currentCases.map((item) => [item.caseId, item]));
  const terminal = new Set<string>();
  for (const item of input.ledgers.flatMap((ledger) => ledger.cases ?? [])) {
    if (!item.caseId || !selected.has(item.caseId)
      || !item.playwrightStatus || !terminalResultStatuses.has(item.playwrightStatus)) continue;
    const current = currentById.get(item.caseId);
    if (!current || item.caseFingerprint !== current.caseFingerprint
      || item.implementationFingerprint !== current.implementationFingerprint) continue;
    terminal.add(item.caseId);
  }
  return input.selectedCaseIds.filter((caseId) => terminal.has(caseId));
}

/**
 * Resolves only case IDs backed by a real, current batch report. A manifest is
 * routing metadata; neither its selected set nor the complement of its blocked
 * set is an execution receipt.
 */
export function resolvePlaywrightExecutionTerminalCaseIds(input: {
  selectedCaseIds: readonly string[];
  manifest: PlaywrightExecutionReportManifest;
  readReport: (reportPath: string) => PlaywrightReport | null;
}): string[] {
  if (input.manifest.authSetupStatus !== 'passed') return [];
  if (input.manifest.interruptionReason?.trim()) return [];
  if (!input.manifest.reportPaths?.length || !input.manifest.runnerReports?.length) return [];

  const selected = new Set(input.selectedCaseIds);
  const manifestSelected = new Set(input.manifest.selectedCaseIds ?? []);
  const blocked = new Set(input.manifest.blockedCaseIds ?? []);
  const declaredReportPaths = new Set(input.manifest.reportPaths);
  const terminal = new Set<string>();

  for (const runner of input.manifest.runnerReports) {
    const reportPath = runner.reportPath?.trim();
    if (!reportPath || !declaredReportPaths.has(reportPath)) continue;
    const runnerSelected = new Set(runner.selectedCaseIds ?? []);
    if (runnerSelected.size === 0) continue;
    const report = input.readReport(reportPath);
    if (!report) continue;
    visitPlaywrightTests(report.suites ?? [], (test) => {
      const caseId = test.annotations?.find((item) => (
        ['case-id', 'canonical-case-id', 'group-case-id'].includes(item.type ?? '')
      ))?.description;
      if (!caseId || !selected.has(caseId) || !manifestSelected.has(caseId)
        || !runnerSelected.has(caseId) || blocked.has(caseId)) return;
      const latest = [...(test.results ?? [])]
        .sort((left, right) => String(left.startTime ?? '').localeCompare(String(right.startTime ?? '')))
        .at(-1);
      if (latest?.status && terminalResultStatuses.has(latest.status)) terminal.add(caseId);
    });
  }

  return input.selectedCaseIds.filter((caseId) => terminal.has(caseId));
}

function visitPlaywrightTests(
  suites: readonly unknown[],
  visit: (test: {
    annotations?: Array<{ type?: string; description?: string }>;
    results?: Array<{ status?: string; startTime?: string }>;
  }) => void,
): void {
  for (const rawSuite of suites) {
    const suite = rawSuite as { specs?: Array<{ tests?: unknown[] }>; suites?: unknown[] };
    for (const spec of suite.specs ?? []) {
      for (const rawTest of spec.tests ?? []) visit(rawTest as Parameters<typeof visit>[0]);
    }
    visitPlaywrightTests(suite.suites ?? [], visit);
  }
}
