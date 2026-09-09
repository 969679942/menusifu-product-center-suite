import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { IncrementalTestPlan } from '../utils/incremental-test-plan';

type PlanArtifact = IncrementalTestPlan & { generatedAt: string; command: string };
type TimingReport = {
  generatedAt: string;
  cases: Array<{
    title: string;
    file: string;
    project: string;
    status: string;
    durationMs: number;
    retry: number;
    runtimeEvidence?: Record<string, unknown>;
  }>;
};

const projectRoot = path.resolve(__dirname, '..');
const reviewDirectory = path.join(projectRoot, 'contracts/product-center/reviews');
const planPath = path.join(reviewDirectory, 'current-incremental-test-plan.json');
const resultPath = path.join(reviewDirectory, 'current-incremental-test-result.json');
const timingDirectory = path.join(projectRoot, 'output/performance');
const plan = readJson<PlanArtifact>(planPath);
const timingFilesBefore = new Set(listTimingFiles(timingDirectory));
const startedAt = Date.now();

const execution = plan.cases.length === 0
  ? { status: 0, signal: null, error: undefined }
  : spawnSync(
      process.execPath,
      [
        path.join(projectRoot, 'node_modules/@playwright/test/cli.js'),
        'test',
        ...plan.specFiles,
        '--project=chrome',
        '--grep',
        plan.grep,
        '--workers=4',
        '--reporter',
        path.join(projectRoot, 'reporters/product-center-timing.reporter.ts'),
      ],
      { cwd: projectRoot, env: process.env, stdio: 'inherit', shell: false },
    );
const newTimingFile = listTimingFiles(timingDirectory)
  .filter((filePath) => !timingFilesBefore.has(filePath))
  .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
const timing = newTimingFile ? readJson<TimingReport>(newTimingFile) : undefined;
const selectedTitles = new Set(plan.cases.map((item) => item.testTitle));
const caseResults = (timing?.cases ?? [])
  .filter((item) => selectedTitles.has(item.title))
  .map((item) => ({
    caseId: plan.cases.find((candidate) => candidate.testTitle === item.title)?.caseId,
    title: item.title,
    specFile: item.file.replace(/\\/g, '/'),
    project: item.project,
    status: item.status,
    durationMs: item.durationMs,
    retry: item.retry,
    ...(item.runtimeEvidence ? { runtimeEvidence: item.runtimeEvidence } : {}),
  }));
const passed = execution.status === 0
  && caseResults.length === plan.cases.length
  && caseResults.every((item) => item.status === 'passed');
const result = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  status: passed ? 'passed' : 'failed',
  durationMs: Date.now() - startedAt,
  planFingerprint: plan.planFingerprint,
  selectedCaseCount: plan.cases.length,
  caseResults,
  executionError: execution.error
    ? { code: execution.error.code ?? 'UNKNOWN', message: execution.error.message }
    : null,
  evidence: {
    plan: 'contracts/product-center/reviews/current-incremental-test-plan.json',
    diff: 'contracts/product-center/product-center-contract-diff.json',
    timing: newTimingFile ? path.relative(projectRoot, newTimingFile).replace(/\\/g, '/') : null,
  },
};

fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
process.stdout.write(`增量测试结果已生成：${resultPath}\n状态：${result.status}，用例：${caseResults.length}/${plan.cases.length}\n`);
if (!passed) process.exitCode = execution.status ?? 1;

function listTimingFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => /^product-center-timing-\d+\.json$/.test(name))
    .map((name) => path.join(directory, name));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
