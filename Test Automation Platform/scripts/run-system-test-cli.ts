import path from 'node:path';
import {
  resolveSystemTestCaseIds,
  runSystemTest,
} from './run-system-test';

export function applySystemTestAdditionalReporterArguments(
  env: NodeJS.ProcessEnv,
  args: readonly string[],
): void {
  const requested = args
    .filter((item) => item.startsWith('--additional-reporter='))
    .map((item) => item.slice('--additional-reporter='.length).trim())
    .filter(Boolean)
    .map((item) => path.resolve(item).replaceAll('\\', '/'));
  if (requested.length === 0) return;
  const configured = (env.SYSTEM_TEST_ADDITIONAL_REPORTERS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  env.SYSTEM_TEST_ADDITIONAL_REPORTERS = [...new Set([...configured, ...requested])].join(',');
}

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

export function resolveSystemTestOptimizationArguments(args: readonly string[]): {
  optimizationPlanPath?: string;
  optimizationStage?: 'canary' | 'batch';
} {
  const optimizationPlanPath = args.find((item) => item.startsWith('--optimization-plan='))?.slice('--optimization-plan='.length);
  const optimizationStageValue = args.find((item) => item.startsWith('--optimization-stage='))?.slice('--optimization-stage='.length);
  if (optimizationStageValue && optimizationStageValue !== 'canary' && optimizationStageValue !== 'batch') {
    throw new Error(`无效优化阶段：${optimizationStageValue}；请使用 canary 或 batch`);
  }
  return {
    optimizationPlanPath,
    optimizationStage: optimizationStageValue as 'canary' | 'batch' | undefined,
  };
}

if (require.main === module) {
  applySystemTestAdditionalReporterArguments(process.env, process.argv.slice(2));
  if (process.argv.slice(2).some((item) => item === '--help' || item === '-h')) {
    process.stdout.write([
      '用法：npm run run -- --manifest=<path> [选项]',
      '',
      '选项：',
      '  --full-regression                 执行全量回归（与整改参数互斥）',
      '  --case-ids=<id1,id2>              限定执行用例',
      '  --optimization-plan=<path>        整改优化计划',
      '  --optimization-stage=canary|batch 整改阶段',
      '  --repair-diagnosis=<path>         修复诊断文件',
      '  --audit-event-log=<path>          审计事件日志',
      '  --additional-reporter=<path>      追加报告器',
      '  --help                            显示帮助',
      '',
    ].join('\n'));
    process.exit(0);
  }
  const manifestPath = argument('manifest');
  if (!manifestPath) throw new Error('缺少 --manifest=<path>');
  const fullRegression = process.argv.includes('--full-regression');
  const auditEventLogPath = argument('audit-event-log');
  const { optimizationPlanPath, optimizationStage } = resolveSystemTestOptimizationArguments(process.argv.slice(2));
  runSystemTest({
    manifestPath,
    caseIds: resolveSystemTestCaseIds(process.env, process.argv.slice(2)),
    repairDiagnosisPath: argument('repair-diagnosis'),
    executionIntent: fullRegression ? 'full-regression' : 'repair',
    fullRegressionAuthorized: fullRegression,
    optimizationPlanPath,
    optimizationStage,
    auditEventLogPath,
  }).then((exitCode) => { process.exitCode = exitCode; }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
