import path from 'node:path';
import { recoverSystemTestEvidenceLedgerFromAllure } from '../src/utils/system-test-allure-evidence-recovery';

const args = parseArgs(process.argv.slice(2));
const runDir = requiredArg(args, 'run-dir');
const executionIndexPath = requiredArg(args, 'execution-index');
const workspaceRoot = args.get('workspace-root') ?? path.dirname(path.resolve(runDir));
const result = recoverSystemTestEvidenceLedgerFromAllure({
  runDir,
  executionIndexPath,
  workspaceRoot,
  overwrite: args.has('overwrite'),
});
process.stdout.write(`${JSON.stringify({
  ledgerPath: result.ledgerPath,
  recoveredCaseIds: result.recoveredCaseIds,
  skippedCaseIds: result.skippedCaseIds,
  importedRecords: result.receiptImport.records.length,
  indexChanged: result.receiptImport.indexChanged,
}, null, 2)}\n`);

function parseArgs(values: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (const value of values) {
    if (!value.startsWith('--')) continue;
    const [key, ...rest] = value.slice(2).split('=');
    parsed.set(key, rest.length > 0 ? rest.join('=') : 'true');
  }
  return parsed;
}

function requiredArg(args: Map<string, string>, name: string): string {
  const value = args.get(name);
  if (!value || value === 'true') throw new Error(`缺少 --${name}=<path>`);
  return path.resolve(value);
}
