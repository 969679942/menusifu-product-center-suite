import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { redactAcceptanceDiagnostic } from '../utils/acceptance/redaction';
import { buildProductCenterOwnerSummaryArtifacts } from './build-product-center-owner-summary';
import {
  buildProductCenterCiSummary,
  renderProductCenterCiSummaryMarkdown,
  resolveProductCenterCiConfiguration,
  type ProductCenterCiMode,
  type ProductCenterCiTrigger,
} from '../utils/product-center-ci';
import { scanGeneratedArtifacts } from '../utils/product-center-run-safety';
import { readLatestProductCenterPipelineArtifact } from '../utils/product-center-pipeline-artifacts';

const projectRoot = path.resolve(__dirname, '..');
const outputDirectory = path.join(projectRoot, 'output/ci');
const jsonPath = path.join(outputDirectory, 'product-center-ci-summary.json');
const markdownPath = path.join(outputDirectory, 'product-center-ci-summary.md');

function main(): void {
  const args = process.argv.slice(2);
  const mode = readMode(readOption(args, '--mode') ?? process.env.PRODUCT_CENTER_CI_MODE ?? 'verify');
  const environmentId = readOption(args, '--environment') ?? process.env.MC_TEST_ENV ?? '';
  const trigger = readTrigger(process.env.GITHUB_EVENT_NAME);
  const controlledRepair = args.includes('--controlled-repair')
    || readBoolean(process.env.PRODUCT_CENTER_CONTROLLED_REPAIR);
  const config = resolveProductCenterCiConfiguration({
    mode,
    environmentId,
    controlledRepair,
    trigger,
    env: process.env,
  });

  if (!config.pass) {
    writeSummary(buildProductCenterCiSummary({
      config,
      pipelineExitCode: 1,
      pipelineReport: null,
    }));
    process.stderr.write(`商品中心 CI 配置门禁未通过：${config.issues.map((item) => item.code).join(',')}\n`);
    process.exitCode = 1;
    return;
  }

  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('缺少 npm CLI 路径');
  const startedAt = Date.now();
  const execution = spawnSync(process.execPath, [npmCli, 'run', config.pipelineScript], {
    cwd: projectRoot,
    env: { ...process.env, MC_TEST_ENV: config.environment.id },
    stdio: 'inherit',
    shell: false,
  });
  const exitCode = execution.status ?? 1;
  const pipelineReport = readFreshPipelineReport(startedAt);
  const summary = buildProductCenterCiSummary({ config, pipelineExitCode: exitCode, pipelineReport });
  writeSummary(summary);
  if (pipelineReport) buildProductCenterOwnerSummaryArtifacts({ projectRoot });
  const sensitiveFindings = scanGeneratedArtifacts(path.join(projectRoot, 'output'));
  if (sensitiveFindings.length > 0) {
    writeSummary(buildProductCenterCiSummary({
      config,
      pipelineExitCode: 1,
      pipelineReport,
    }));
    throw new Error(`CI 新增产物敏感扫描未通过：findings=${sensitiveFindings.length}`);
  }
  process.stdout.write(`商品中心 CI 摘要：${jsonPath}\n状态：${summary.status}\n`);
  if (exitCode !== 0 || summary.pipelineStatus !== 'passed') process.exitCode = exitCode || 1;
}

function readFreshPipelineReport(startedAt: number): any | null {
  const reportPath = path.join(
    projectRoot,
    'output/pipeline/product-center-quality-pipeline-latest.json',
  );
  if (!fs.existsSync(reportPath) || fs.statSync(reportPath).mtimeMs < startedAt) return null;
  return readLatestProductCenterPipelineArtifact(projectRoot).report;
}

function writeSummary(summary: ReturnType<typeof buildProductCenterCiSummary>): void {
  fs.mkdirSync(outputDirectory, { recursive: true });
  writeAtomic(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  writeAtomic(markdownPath, renderProductCenterCiSummaryMarkdown(summary));
}

function writeAtomic(filePath: string, content: string): void {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} 缺少值`);
  return value;
}

function readMode(value: string): ProductCenterCiMode {
  if (value !== 'verify' && value !== 'full') throw new Error(`未知 CI 模式：${value}`);
  return value;
}

function readTrigger(eventName: string | undefined): ProductCenterCiTrigger {
  if (eventName === 'schedule') return 'schedule';
  if (eventName === 'workflow_dispatch') return 'manual';
  return 'local';
}

function readBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${redactAcceptanceDiagnostic(String(error))}\n`);
    process.exitCode = 1;
  }
}
