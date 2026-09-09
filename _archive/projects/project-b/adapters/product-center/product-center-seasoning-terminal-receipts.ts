import fs from 'node:fs';
import path from 'node:path';
import { resolveEvidenceLedgerTerminalCaseIds } from '../../../../Test Automation Platform/src/governance/execution-terminal-receipts';

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
      return [readJson<{ cases?: Array<{
        caseId?: string;
        caseFingerprint?: string;
        implementationFingerprint?: string;
        playwrightStatus?: string;
      }> }>(ledgerPath)];
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
