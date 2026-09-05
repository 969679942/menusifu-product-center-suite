import { request } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ProductCenterExecutionLedger, type ProductCenterLedgerSnapshot } from '../api/product-center/execution-ledger';
import { ProductCenterApi } from '../api/product-center/product-center-api';
import { ProductCenterApiRecoveryAdapter, ProductCenterRecoveryService } from '../api/product-center/recovery-service';

export function discoverIncompleteCheckpointRunIds(rootDir: string): string[] {
  return discoverIncompleteCheckpointFiles(rootDir).map((item) => item.runId);
}

export async function recoverProductCenterCheckpoints(
  rootDir = path.resolve('output/checkpoints'),
): Promise<{ recovered: number; alreadyAbsent: number; failed: number; runIds: string[] }> {
  const checkpoints = discoverIncompleteCheckpointFiles(rootDir);
  const runIds = checkpoints.map((item) => item.runId);
  if (!checkpoints.length) return { recovered: 0, alreadyAbsent: 0, failed: 0, runIds: [] };

  const requestContext = await request.newContext();
  const totals = { recovered: 0, alreadyAbsent: 0, failed: 0, runIds };
  try {
    const api = new ProductCenterApi(requestContext);
    for (const checkpoint of checkpoints) {
      const ledger = new ProductCenterExecutionLedger({ rootDir: checkpoint.directory, runId: checkpoint.runId });
      const result = await new ProductCenterRecoveryService(
        ledger,
        new ProductCenterApiRecoveryAdapter(api),
      ).recoverIncomplete();
      totals.recovered += result.recoveredEntryIds.length;
      totals.alreadyAbsent += result.alreadyAbsentEntryIds.length;
      totals.failed += result.failedEntryIds.length;
    }
    return totals;
  } finally {
    await requestContext.dispose();
  }
}

function discoverIncompleteCheckpointFiles(rootDir: string): Array<{ directory: string; runId: string }> {
  if (!fs.existsSync(rootDir)) return [];
  const result: Array<{ directory: string; runId: string }> = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(filePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ProductCenterLedgerSnapshot;
        if (typeof snapshot.runId !== 'string' || !Array.isArray(snapshot.entries)) continue;
        if (snapshot.entries.some((item) => item.phase !== 'residue-verified')) {
          result.push({ directory, runId: snapshot.runId });
        }
      } catch {
      }
    }
  };
  visit(rootDir);
  return result;
}

async function main(): Promise<void> {
  const result = await recoverProductCenterCheckpoints();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const safeMessage = String(error)
      .replace(/bearer\s+[^\s]+/gi, 'Bearer <redacted>')
      .replace(/(authorization|password|cookie|token)\s*[:=]\s*[^,;\s]+/gi, '$1=<redacted>');
    process.stderr.write(`${safeMessage}\n`);
    process.exitCode = 1;
  });
}
