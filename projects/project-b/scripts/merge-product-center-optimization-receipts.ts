import fs from 'node:fs';
import path from 'node:path';
import type { SystemTestOptimizationReceipt } from '../../../Test Automation Platform/src/governance/system-test-optimization-gate';

const projectRoot = path.resolve(__dirname, '..');
const planArgument = argument('plan');
if (!planArgument) throw new Error('OPTIMIZATION_PLAN_REQUIRED_BEFORE_RECEIPT_MERGE');
const planPath = path.resolve(projectRoot, planArgument);
const inputPaths = (argument('inputs') ?? '').split(',').map((item) => item.trim()).filter(Boolean)
  .map((item) => path.resolve(projectRoot, item));
const replacementPaths = (argument('replacement-inputs') ?? '').split(',').map((item) => item.trim()).filter(Boolean)
  .map((item) => path.resolve(projectRoot, item));
const outputPath = path.resolve(projectRoot, argument('output') ?? 'output/system-test-optimization/product-center-canary-receipts-20260830-v3.json');
const allowPartial = process.argv.includes('--allow-partial');

if (inputPaths.length === 0) throw new Error('RECEIPT_MERGE_INPUTS_REQUIRED');
const plan = readJson<{ canaryCaseIds: string[]; changeId?: string; scopeTotal?: number; selectionFingerprint?: string }>(planPath);
if (!plan.changeId || !plan.scopeTotal || !plan.selectionFingerprint) throw new Error('OPTIMIZATION_PLAN_METADATA_REQUIRED');
const expected = new Set(plan.canaryCaseIds);
const merged = new Map<string, SystemTestOptimizationReceipt>();
for (const inputPath of inputPaths) {
  for (const receipt of readJson<SystemTestOptimizationReceipt[]>(inputPath)) {
    if (!expected.has(receipt.caseId)) continue;
    if (merged.has(receipt.caseId)) throw new Error(`RECEIPT_MERGE_DUPLICATE:${receipt.caseId}`);
    merged.set(receipt.caseId, receipt);
  }
}
const replaced = new Set<string>();
for (const replacementPath of replacementPaths) {
  for (const receipt of readJson<SystemTestOptimizationReceipt[]>(replacementPath)) {
    if (!expected.has(receipt.caseId)) continue;
    if (replaced.has(receipt.caseId)) throw new Error(`RECEIPT_MERGE_REPLACEMENT_DUPLICATE:${receipt.caseId}`);
    merged.set(receipt.caseId, receipt);
    replaced.add(receipt.caseId);
  }
}
const missing = [...expected].filter((caseId) => !merged.has(caseId)).sort();
if (missing.length > 0 && !allowPartial) throw new Error(`RECEIPT_MERGE_MISSING:${missing.join(',')}`);
const receipts = [...merged.values()].sort((left, right) => left.caseId.localeCompare(right.caseId));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(receipts, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ output: outputPath, receipts: receipts.length, replacements: replaced.size, missing: missing.length, passed: receipts.filter((item) => item.status === 'passed').length, failed: receipts.filter((item) => item.status === 'failed').length })}\n`);

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`RECEIPT_MERGE_INPUT_MISSING:${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
