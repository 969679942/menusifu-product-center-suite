import fs from 'node:fs';
import path from 'node:path';
import { resolveEvidenceLedgerTerminalCaseIds } from '../../../Test Automation Platform/src/governance/execution-terminal-receipts';
import { verifyExecutionAttemptLedger } from '../../../Test Automation Platform/src/governance/execution-attempt-accounting';
import { readRunExecutionObservation } from '../../../Test Automation Platform/src/governance/run-evidence-index';

export function resolveProductCenterSeasoningTerminalCaseIds(input: {
  projectRoot: string;
  flowId: string;
  selectedCaseIds: readonly string[];
  currentCases: ReadonlyArray<{
    caseId: string;
    caseFingerprint: string;
    implementationFingerprint: string;
  }>;
}): string[] {
  const checkpointPath = path.join(
    input.projectRoot,
    'output/system-test-flow/merchant-center-product-center-seasoning/checkpoint.json',
  );
  if (!fs.existsSync(checkpointPath)) return [];
  const checkpoint = readJson<{
    flowId?: string;
    selectedCaseIds?: string[];
    runIds?: string[];
  }>(checkpointPath);
  if (checkpoint.flowId !== input.flowId || !sameSet(checkpoint.selectedCaseIds ?? [], input.selectedCaseIds)
    || !checkpoint.runIds?.length) return [];
  const ledgers = checkpoint.runIds.flatMap((runId) => {
    const ledgerPath = path.join(
      input.projectRoot,
      'output/system-test/merchant-center-product-center-seasoning',
      runId,
      'evidence-ledger.json',
    );
    if (!fs.existsSync(ledgerPath)) return [];
    try {
      const ledger = readRunExecutionObservation<{ schemaVersion?: string; runId?: string; selectedCaseIds?: string[]; attempts?: unknown[]; cases?: Array<{
        caseId?: string;
        caseFingerprint?: string;
        implementationFingerprint?: string;
        playwrightStatus?: string;
      }> }>(ledgerPath, runId).ledger;
      if (ledger.schemaVersion === '1.1.0' || ledger.attempts !== undefined) {
        const selected = ledger.selectedCaseIds;
        if (!Array.isArray(selected) || !selected.length || selected.some((id) => !input.selectedCaseIds.includes(id))
          || !verifyExecutionAttemptLedger(runId, selected, ledger).valid) return [];
      }
      return [ledger];
    } catch {
      return [];
    }
  });
  return resolveEvidenceLedgerTerminalCaseIds({
    selectedCaseIds: input.selectedCaseIds,
    currentCases: input.currentCases,
    ledgers,
  });
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length
    && left.every((item) => right.includes(item));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
