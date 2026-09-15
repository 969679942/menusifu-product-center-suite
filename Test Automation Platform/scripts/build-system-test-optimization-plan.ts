import fs from 'node:fs';
import path from 'node:path';
import { buildSystemTestOptimizationPlan, type SystemTestOptimizationCase, type SystemTestOptimizationReceipt } from '../src/governance/system-test-optimization-gate';

type Input = {
  planId: string;
  contractFingerprint: string;
  changeId?: string;
  cases: SystemTestOptimizationCase[];
  maxBatchSize: number;
  canaryReceipts?: SystemTestOptimizationReceipt[];
};

const inputPath = argument('input');
const outputPath = argument('output');
if (!inputPath || !outputPath) throw new Error('用法：--input=<优化输入JSON> --output=<优化计划JSON>');
const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8')) as Input;
const plan = buildSystemTestOptimizationPlan(input);
const target = path.resolve(outputPath);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: plan.status, canaryCaseIds: plan.canaryCaseIds, executionEligibleCaseIds: plan.executionEligibleCaseIds, output: target })}\n`);

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
