import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { redactAcceptanceDiagnostic } from '../utils/acceptance/redaction';
import {
  buildProductCenterLocalMaintenanceSummary,
  renderProductCenterLocalMaintenanceMarkdown,
} from '../utils/product-center-local-maintenance';
import {
  findIncompleteCheckpointFiles,
  scanGeneratedArtifacts,
} from '../utils/product-center-run-safety';
import { buildProductCenterOwnerSummaryArtifacts } from './build-product-center-owner-summary';
import {
  buildProductCenterPipelineArtifactRetentionAudit,
  readLatestProductCenterPipelineArtifact,
} from '../utils/product-center-pipeline-artifacts';

const projectRoot = path.resolve(__dirname, '..');
const outputDirectory = path.join(projectRoot, 'output/maintenance');
const jsonPath = path.join(outputDirectory, 'product-center-local-maintenance-latest.json');
const markdownPath = path.join(outputDirectory, 'product-center-local-maintenance-latest.md');

function main(): void {
  const summaryOnly = process.argv.includes('--summary-only');
  const existingPipelineArtifact = readOptionalPipelineArtifact();
  const existingPipelineReport = existingPipelineArtifact?.report ?? null;
  const existingAllureReport = readOptionalJson<any>(
    path.join(outputDirectory, 'allure-retention-latest.json'),
  );
  const pipelineExitCode = summaryOnly
    ? existingPipelineReport?.pipeline?.status === 'passed' ? 0 : 1
    : runNpmScript('pipeline:product-center');
  const allureExitCode = summaryOnly
    ? existingAllureReport?.limitSatisfied === true ? 0 : 1
    : runNpmScript('maintain:allure:apply');
  const allureReport = readOptionalJson<any>(
    path.join(outputDirectory, 'allure-retention-latest.json'),
  );
  const pipelineArtifact = readOptionalPipelineArtifact();
  const pipelineReport = pipelineArtifact?.report ?? null;
  const pipelineRetention = buildProductCenterPipelineArtifactRetentionAudit({
    rootDir: projectRoot,
  });

  let ownerResult: ReturnType<typeof buildProductCenterOwnerSummaryArtifacts> | null = null;
  try {
    ownerResult = buildProductCenterOwnerSummaryArtifacts({ projectRoot });
  } catch (error) {
    process.stderr.write(`负责人摘要刷新失败：${redactAcceptanceDiagnostic(String(error))}\n`);
  }

  const sensitiveFindings = scanGeneratedArtifacts(path.join(projectRoot, 'output'));
  const incompleteCheckpoints = findIncompleteCheckpointFiles(
    path.join(projectRoot, 'output/checkpoints'),
  );
  const authStateArtifacts = fs.existsSync(path.join(projectRoot, 'output/auth-state.json')) ? 1 : 0;
  const summary = buildProductCenterLocalMaintenanceSummary({
    allure: {
      status: allureExitCode === 0 && allureReport?.limitSatisfied === true ? 'passed' : 'failed',
      deletedFiles: Number(allureReport?.deleted?.files ?? 0),
      remainingFiles: Number(allureReport?.actualAfter?.files ?? 0),
    },
    pipeline: {
      status: pipelineExitCode === 0 && pipelineReport?.pipeline?.status === 'passed'
        ? 'passed'
        : 'failed',
      stages: Number(pipelineReport?.pipeline?.stages?.length ?? 0),
      technicalReady: pipelineReport?.technicalReadiness?.technicalReady === true,
      runId: pipelineArtifact?.pointer.runId,
      mode: pipelineArtifact?.pointer.mode,
      immutableReport: pipelineArtifact?.pointer.reportPath,
      retainedRevisions: pipelineRetention.summary.revisions,
      expiredCandidates: pipelineRetention.summary.expiredCandidates,
    },
    owner: {
      status: ownerResult?.summary.status ?? 'blocked',
      technicalReady: ownerResult?.summary.technicalReady === true,
      blockers: ownerResult?.summary.blockers.length ?? 1,
      actions: ownerResult?.summary.actions.length ?? 0,
    },
    safety: {
      sensitiveFindings: sensitiveFindings.length,
      incompleteCheckpoints: incompleteCheckpoints.length,
      authStateArtifacts,
    },
  });

  fs.mkdirSync(outputDirectory, { recursive: true });
  writeAtomic(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  writeAtomic(markdownPath, renderProductCenterLocalMaintenanceMarkdown(summary));
  process.stdout.write(`商品中心本地维护摘要：${jsonPath}\n状态：${summary.status}\n`);
  if (summary.status !== 'passed') process.exitCode = 1;
}

function runNpmScript(script: string): number {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('缺少 npm CLI 路径');
  const result = spawnSync(process.execPath, [npmCli, 'run', script], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });
  return result.status ?? 1;
}

function readOptionalJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function readOptionalPipelineArtifact() {
  const pointerPath = path.join(
    projectRoot,
    'output/pipeline/product-center-quality-pipeline-latest.json',
  );
  return fs.existsSync(pointerPath) ? readLatestProductCenterPipelineArtifact(projectRoot) : null;
}

function writeAtomic(filePath: string, content: string): void {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${redactAcceptanceDiagnostic(String(error))}\n`);
  process.exitCode = 1;
}
