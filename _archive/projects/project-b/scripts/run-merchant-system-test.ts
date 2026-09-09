import path from 'node:path';

const mode = process.argv[2];
if (mode !== 'run' && mode !== 'flow') throw new Error(`未知商品中心系统测试模式：${mode ?? 'missing'}`);
process.argv.splice(2, 1);

const allureReporter = path.resolve('reporters/product-center-system-allure.reporter.ts').replaceAll('\\', '/');
const configuredReporters = (process.env.SYSTEM_TEST_ADDITIONAL_REPORTERS ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
process.env.SYSTEM_TEST_ADDITIONAL_REPORTERS = [...new Set([...configuredReporters, allureReporter])].join(',');

(async () => {
  const argument = (name: string): string | undefined => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (mode === 'run') {
    const { runSystemTest, resolveSystemTestCaseIds } = await import('../../../Test Automation Platform/scripts/run-system-test');
    const manifestPath = argument('manifest');
    if (!manifestPath) throw new Error('缺少 --manifest=<path>');
    const optimizationPlanPath = argument('optimization-plan');
    const optimizationStage = argument('optimization-stage');
    const runId = argument('run-id');
    const fullRegression = process.argv.includes('--full-regression');
    if (fullRegression && (optimizationPlanPath || optimizationStage)) throw new Error('FULL_REGRESSION_OPTIMIZATION_MIXED');
    if (!fullRegression && !optimizationPlanPath) throw new Error('OPTIMIZATION_PLAN_REQUIRED');
    if (!fullRegression && optimizationStage !== 'canary' && optimizationStage !== 'batch') throw new Error('OPTIMIZATION_STAGE_REQUIRED');
    const selectedCaseIds = resolveSystemTestCaseIds(process.env, process.argv.slice(2));
    const exitCode = await runSystemTest({ runId, manifestPath, caseIds: selectedCaseIds, repairDiagnosisPath: argument('repair-diagnosis'), executionIntent: fullRegression ? 'full-regression' : 'repair', fullRegressionAuthorized: fullRegression, optimizationPlanPath, optimizationStage: optimizationStage as 'canary' | 'batch' });
    process.exitCode = exitCode;
    return;
  }
  const { runSystemTestFlow } = await import('../../../Test Automation Platform/scripts/run-system-test-flow');
  const planPath = argument('plan');
  const manifestPath = argument('manifest');
  if (!planPath || !manifestPath) throw new Error('用法：--plan=<path> --manifest=<path> [--execute]');
  const optimizationPlanPath = argument('optimization-plan');
  const optimizationStage = argument('optimization-stage');
  const fullRegression = process.argv.includes('--full-regression');
  if (fullRegression && (optimizationPlanPath || optimizationStage)) throw new Error('FULL_REGRESSION_OPTIMIZATION_MIXED');
  if (process.argv.includes('--execute') && !fullRegression) {
    if (!optimizationPlanPath) throw new Error('OPTIMIZATION_PLAN_REQUIRED');
    if (optimizationStage !== 'canary' && optimizationStage !== 'batch') throw new Error('OPTIMIZATION_STAGE_REQUIRED');
  }
  const result = await runSystemTestFlow({ planPath, manifestPath, execute: process.argv.includes('--execute'), optimizationPlanPath: fullRegression ? undefined : optimizationPlanPath, optimizationStage: fullRegression ? undefined : optimizationStage as 'canary' | 'batch' | undefined, repairDiagnosisPath: argument('repair-diagnosis'), fullRegression, fullRegressionBatchSize: argument('batch-size') ? Number(argument('batch-size')) : undefined });
  process.stdout.write(`系统测试流程检查点：${result.checkpointPath}\n`);
  process.exitCode = result.exitCode;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
