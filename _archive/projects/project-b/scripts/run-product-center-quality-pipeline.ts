import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { appConfig } from '../test-data/env';
import { redactAcceptanceDiagnostic } from '../utils/acceptance/redaction';
import {
  fingerprintPipelinePlan,
  runCheckpointedPipeline,
  type CheckpointedPipelineStage,
  type PipelineRetryMode,
} from '../utils/pipeline/checkpointed-pipeline';
import { classifyProductCenterFailure } from '../utils/product-center-failure-classifier';
import { summarizeFailureAnalysisForPipeline } from '../utils/product-center-failure-analysis';
import { readProductCenterGoldContractSummary } from '../utils/product-center-gold-contract';
import {
  evaluateProductCenterControlledRepairPipeline,
  resolveControlledRepairPipelineOption,
  type ProductCenterControlledRepairPipelineEvaluation,
} from '../utils/product-center-controlled-repair-pipeline';
import {
  evaluateProductCenterTechnicalReadiness,
  type ProductCenterTechnicalReadiness,
} from '../utils/product-center-quality-pipeline';
import {
  findIncompleteCheckpointFiles,
  scanGeneratedArtifacts,
} from '../utils/product-center-run-safety';
import {
  evaluateProductCenterStageReuse,
  type ProductCenterUiStageId,
} from '../utils/product-center-runtime-reuse';
import {
  buildProductCenterPipelineArtifactRetentionAudit,
  publishProductCenterPipelineArtifacts,
  type ProductCenterQualityPipelineReportArtifact,
} from '../utils/product-center-pipeline-artifacts';

type PipelineMode = 'static' | 'live' | 'full';
type ReadinessInput = Parameters<typeof evaluateProductCenterTechnicalReadiness>[0];

const pipelineId = 'product-center-quality';

async function main(): Promise<void> {
  const projectRoot = path.resolve(__dirname, '..');
  const args = process.argv.slice(2);
  const mode = readMode(args);
  const controlledRepair = resolveControlledRepairPipelineOption(
    args,
    mode === 'full' ? 'full' : 'verify',
  );
  const resume = args.includes('--resume');
  const stateVerifiedStageIds = readRepeatedOption(args, '--state-verified');
  if (stateVerifiedStageIds.length > 0 && !resume) {
    throw new Error('--state-verified 只能与 --resume 一起使用');
  }
  const outputDirectory = path.join(projectRoot, 'output/pipeline');
  const pipelineVariant = controlledRepair.enabled ? `${mode}:controlled-repair` : mode;
  const checkpointSuffix = controlledRepair.enabled ? `${mode}-repair` : mode;
  const checkpointPath = path.join(
    outputDirectory,
    `product-center-quality-${checkpointSuffix}-checkpoint.json`,
  );
  const stages = buildStages(projectRoot, mode, controlledRepair.enabled);
  const planFingerprint = fingerprintPipelineInputs(
    projectRoot,
    fingerprintPipelinePlan(`${pipelineId}:${pipelineVariant}`, stages),
  );

  const pipeline = await runCheckpointedPipeline({
    pipelineId: `${pipelineId}:${pipelineVariant}`,
    planFingerprint,
    checkpointPath,
    resume,
    stateVerifiedStageIds,
    stages,
    onRunStart: (report) => {
      if (mode === 'live' || mode === 'full') {
        process.env.PC_QUALITY_PIPELINE_RUN_ID = report.runId;
      } else {
        delete process.env.PC_QUALITY_PIPELINE_RUN_ID;
      }
    },
  });
  const readiness = pipeline.status === 'passed' ? readTechnicalReadiness(projectRoot) : undefined;
  const controlledRepairResult = controlledRepair.enabled
    ? readControlledRepairEvaluation(projectRoot)
    : { enabled: false as const, status: 'disabled' as const };
  const status = pipeline.status === 'failed'
    ? 'failed' as const
    : readiness?.status === 'ready'
      ? 'passed' as const
      : 'passed-with-actions' as const;
  const report: ProductCenterQualityPipelineReportArtifact = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    pipelineId,
    mode,
    controlledRepair: controlledRepairResult,
    status,
    checkpoint: path.relative(projectRoot, checkpointPath).replace(/\\/g, '/'),
    planFingerprint,
    pipeline,
    technicalReadiness: readiness ?? null,
  };
  const published = publishProductCenterPipelineArtifacts({
    rootDir: projectRoot,
    checkpointPath,
    report,
  });
  const retention = buildProductCenterPipelineArtifactRetentionAudit({ rootDir: projectRoot });
  writeJsonAtomic(path.join(
    outputDirectory,
    'product-center-quality-pipeline-retention-latest.json',
  ), retention);

  process.stdout.write(
    `商品中心质量流水线指针：${published.pointerPath}\n不可变报告：${published.reportPath}\n状态：${status}\n`,
  );
  if (pipeline.status === 'failed' || readiness?.technicalReady === false) process.exitCode = 1;
}

function buildStages(
  projectRoot: string,
  mode: PipelineMode,
  controlledRepairEnabled: boolean,
): CheckpointedPipelineStage[] {
  const stages: CheckpointedPipelineStage[] = [
    {
      id: 'preflight-safety',
      retryMode: 'idempotent',
      execute: async () => {
        const snapshot = inspectSafety(projectRoot);
        const success = Object.values(snapshot).every((count) => count === 0);
        return {
          success,
          diagnostic: success
            ? undefined
            : `安全前置门禁未通过：checkpoints=${snapshot.incompleteCheckpoints};sensitive=${snapshot.sensitiveArtifacts};auth=${snapshot.savedAuthStates}`,
        };
      },
    },
    npmStage(projectRoot, 'recipe-build', 'build:product-center:recipes'),
    npmStage(
      projectRoot,
      'test-plan-generation-v1',
      'build:product-center:test-plan-generation-v1',
    ),
    npmStage(
      projectRoot,
      'test-plan-intake-v1',
      'build:product-center:test-plan-intake-v1',
    ),
    npmStage(projectRoot, 'group-runtime-audit', 'build:product-center:group-test-cases'),
    npmStage(projectRoot, 'group-automation-bindings', 'build:product-center:group-automation'),
    npmStage(projectRoot, 'maintainability-audit', 'audit:product-center:maintainability'),
    npmStage(projectRoot, 'typecheck', 'typecheck'),
    npmStage(projectRoot, 'contract-tests', 'test:product-center:contract'),
    npmStage(projectRoot, 'recipe-contract-tests', 'test:product-center:recipes:contracts'),
  ];

  if (mode === 'live' || mode === 'full') {
    stages.push(
      npmStage(
        projectRoot,
        'page-contract-probe',
        'build:product-center:page-contract-probe',
        'state-verification-required',
      ),
      npmStage(
        projectRoot,
        'page-api-observation',
        'observe:product-center:api',
        'state-verification-required',
      ),
      npmStage(
        projectRoot,
        'api-observation-proposal',
        'build:product-center:api-observation-proposal',
      ),
      npmStage(
        projectRoot,
        'page-contract-observation',
        'build:product-center:page-contract-observation',
      ),
    );
  }

  if (mode === 'full') {
    stages.push(
      npmStage(
        projectRoot,
        'main-ui',
        'test:product-center:recipes',
        'state-verification-required',
        {
          stage: 'main-ui',
          collectionId: 'product-center-pilot',
          recipesPath: 'contracts/product-center/recipes/product-center-pilot-recipes.json',
          specPath: 'tests/generated/product-center-recipe-pilot.generated.spec.ts',
          acceptancePath: 'output/recipes/product-center-pilot-acceptance.json',
          evidencePath: 'output/recipes/product-center-pilot-evidence.json',
        },
      ),
      npmStage(projectRoot, 'main-runtime-acceptance', 'build:product-center:runtime-acceptance'),
      npmStage(
        projectRoot,
        'gold-ui',
        'test:product-center:test-plan-gold-set',
        'state-verification-required',
        {
          stage: 'gold-ui',
          collectionId: 'product-center-test-plan-gold-set',
          recipesPath: 'contracts/product-center/recipes/product-center-test-plan-gold-set-recipes.json',
          specPath: 'tests/generated/product-center-test-plan-gold-set.generated.spec.ts',
          acceptancePath: 'output/recipes/product-center-test-plan-gold-set-acceptance.json',
          evidencePath: 'output/recipes/product-center-test-plan-gold-set-evidence.json',
        },
      ),
      npmStage(projectRoot, 'gold-runtime-acceptance', 'build:product-center:test-plan-gold-set:acceptance'),
    );
  } else {
    stages.push(
      npmStage(projectRoot, 'main-runtime-acceptance', 'build:product-center:runtime-acceptance'),
      npmStage(
        projectRoot,
        'gold-runtime-acceptance',
        'build:product-center:test-plan-gold-set:acceptance',
      ),
    );
  }

  stages.push(
    npmStage(projectRoot, 'drift-lab', 'build:product-center:drift-lab'),
    npmStage(
      projectRoot,
      'technical-binding-candidates',
      'build:product-center:technical-binding-candidates',
    ),
  );
  if (mode === 'full') {
    stages.push(npmStage(
      projectRoot,
      'approved-technical-bindings-ui',
      'test:product-center:approved-technical-bindings',
      'state-verification-required',
      {
        stage: 'approved-technical-bindings-ui',
        collectionId: 'product-center-approved-technical-bindings',
        recipesPath: 'contracts/product-center/recipes/product-center-approved-technical-bindings-recipes.json',
        specPath: 'tests/generated/product-center-approved-technical-bindings.generated.spec.ts',
        acceptancePath: 'output/recipes/product-center-approved-technical-bindings-acceptance.json',
        evidencePath: 'output/recipes/product-center-approved-technical-bindings-evidence.json',
      },
    ));
  }
  stages.push(
    npmStage(
      projectRoot,
      'approved-technical-bindings-runtime-acceptance',
      'build:product-center:approved-technical-bindings:acceptance',
    ),
    npmStage(projectRoot, 'failure-analysis', 'build:product-center:failure-analysis'),
    npmStage(projectRoot, 'quality-build', 'build:product-center:quality-program'),
  );
  if (controlledRepairEnabled) {
    stages.push(...buildControlledRepairStages(projectRoot));
  }
  stages.push(
    {
      id: 'technical-readiness',
      retryMode: 'idempotent',
      execute: async () => {
        const readiness = readTechnicalReadiness(projectRoot);
        const failedGates = readiness.gates.filter((gate) => !gate.pass).map((gate) => gate.id);
        return {
          success: readiness.technicalReady,
          diagnostic: readiness.technicalReady
            ? undefined
            : `技术就绪门禁未通过：${failedGates.join(',')}`,
        };
      },
    },
  );
  return stages;
}

function buildControlledRepairStages(projectRoot: string): CheckpointedPipelineStage[] {
  return [
    {
      id: 'controlled-repair-gate',
      retryMode: 'idempotent',
      execute: async () => {
        const evaluation = readControlledRepairEvaluation(projectRoot);
        writeControlledRepairEvaluation(projectRoot, evaluation);
        return {
          success: evaluation.executionAllowed,
          diagnostic: evaluation.executionAllowed
            ? undefined
            : controlledRepairDiagnostic(evaluation),
        };
      },
    },
    {
      id: 'controlled-repair-incremental-ui',
      retryMode: 'state-verification-required',
      execute: async () => {
        const before = readControlledRepairEvaluation(projectRoot);
        writeControlledRepairEvaluation(projectRoot, before);
        if (before.status === 'already-closed' || before.status === 'ready-for-closure') {
          return { success: true };
        }
        if (!before.runIncrementalRegression) {
          return { success: false, diagnostic: controlledRepairDiagnostic(before) };
        }
        const execution = runNpmScript(projectRoot, 'run:product-center:incremental');
        if (execution.status !== 0) {
          const diagnostic = commandDiagnostic(execution);
          const classified = classifyProductCenterFailure({
            message: diagnostic,
            statusCode: readStatusCode(diagnostic),
          });
          return {
            success: false,
            transient: classified.retryable,
            diagnostic: classified.diagnostic,
          };
        }
        const after = readControlledRepairEvaluation(projectRoot);
        writeControlledRepairEvaluation(projectRoot, after);
        return {
          success: after.status === 'ready-for-closure' || after.status === 'already-closed',
          diagnostic: after.status === 'ready-for-closure' || after.status === 'already-closed'
            ? undefined
            : controlledRepairDiagnostic(after),
        };
      },
    },
    {
      id: 'controlled-repair-closure',
      retryMode: 'idempotent',
      execute: async () => {
        const before = readControlledRepairEvaluation(projectRoot);
        writeControlledRepairEvaluation(projectRoot, before);
        if (before.status === 'already-closed') return { success: true };
        if (!before.closeAllowed) {
          return { success: false, diagnostic: controlledRepairDiagnostic(before) };
        }
        const execution = runNpmScript(projectRoot, 'close:product-center:controlled-repair');
        if (execution.status !== 0) {
          return { success: false, diagnostic: commandDiagnostic(execution) };
        }
        const after = readControlledRepairEvaluation(projectRoot);
        writeControlledRepairEvaluation(projectRoot, after);
        return {
          success: after.status === 'already-closed',
          diagnostic: after.status === 'already-closed'
            ? undefined
            : controlledRepairDiagnostic(after),
        };
      },
    },
  ];
}

function npmStage(
  projectRoot: string,
  id: string,
  script: string,
  retryMode: PipelineRetryMode = 'idempotent',
  stageReuse?: {
    stage: Exclude<ProductCenterUiStageId, 'page-contract-probe'>;
    collectionId: string;
    recipesPath: string;
    specPath: string;
    acceptancePath: string;
    evidencePath: string;
  },
): CheckpointedPipelineStage {
  return {
    id,
    retryMode,
    execute: async () => {
      process.stdout.write(`执行流水线阶段：${id}\n`);
      if (stageReuse) {
        const reuse = evaluateProductCenterStageReuse({
          rootDir: projectRoot,
          ...stageReuse,
          currentReleaseProbePath: 'output/page-contract/product-center-current-release-probe.json',
          maxAgeMs: readProbeEvidenceMaxAgeMs(projectRoot),
        });
        writeStageReuseDecision(projectRoot, id, reuse);
        if (reuse.reusable) {
          process.stdout.write(`复用阶段运行证据：${id};sourceRunId=${reuse.sourceRunId ?? 'unknown'}\n`);
          return { success: true };
        }
        process.stdout.write(`阶段证据不可复用：${id};reason=${reuse.reason}\n`);
      }
      const result = runNpmScript(projectRoot, script);
      if (result.status === 0) {
        process.stdout.write(`流水线阶段通过：${id}\n`);
        return { success: true };
      }
      const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
      const analyzed = id === 'main-ui'
        || id === 'gold-ui'
        || id === 'approved-technical-bindings-ui'
        ? buildFailureAnalysisAfterUiFailure(projectRoot)
        : undefined;
      const diagnostic = redactAcceptanceDiagnostic(output).slice(-2_000)
        || redactAcceptanceDiagnostic(result.error?.message ?? `退出码 ${result.status ?? 'unknown'}`);
      const statusCode = readStatusCode(output);
      const classified = analyzed ?? classifyProductCenterFailure({ message: diagnostic, statusCode });
      process.stderr.write(`流水线阶段失败：${id}；分类：${classified.category}\n`);
      return {
        success: false,
        transient: classified.retryable,
        diagnostic: classified.diagnostic,
      };
    },
  };
}

function readProbeEvidenceMaxAgeMs(projectRoot: string): number {
  const policy = readJson<{ evidenceMaxAgeMs?: number }>(path.join(
    projectRoot,
    'contracts/product-center/drift/product-center-probe-policy.json',
  ));
  const value = Number(process.env.PC_PAGE_CONTRACT_EVIDENCE_MAX_AGE_MS ?? policy.evidenceMaxAgeMs);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Probe evidence 新鲜度策略无效');
  return value;
}

function writeStageReuseDecision(
  projectRoot: string,
  stageId: string,
  decision: ReturnType<typeof evaluateProductCenterStageReuse>,
): void {
  const outputPath = path.join(projectRoot, 'output/pipeline/product-center-stage-reuse-latest.json');
  const previous = fs.existsSync(outputPath)
    ? readJson<Record<string, unknown>>(outputPath)
    : {};
  const stages = previous.stages && typeof previous.stages === 'object'
    ? previous.stages as Record<string, unknown>
    : {};
  const evaluatedAt = new Date().toISOString();
  writeJsonAtomic(outputPath, {
    schemaVersion: '1.0.0',
    generatedAt: evaluatedAt,
    stages: {
      ...stages,
      [stageId]: { ...decision, evaluatedAt },
    },
  });
}

function runNpmScript(projectRoot: string, script: string) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    return {
      status: 1,
      stdout: '',
      stderr: '缺少 npm CLI 路径',
      error: undefined,
    };
  }
  return spawnSync(process.execPath, [npmCli, 'run', script], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    shell: false,
  });
}

function commandDiagnostic(result: ReturnType<typeof runNpmScript>): string {
  return redactAcceptanceDiagnostic(`${result.stdout ?? ''}\n${result.stderr ?? ''}`).slice(-2_000)
    || redactAcceptanceDiagnostic(result.error?.message ?? `退出码 ${result.status ?? 'unknown'}`);
}

function readControlledRepairEvaluation(
  projectRoot: string,
): ProductCenterControlledRepairPipelineEvaluation & { enabled: true } {
  const result = evaluateProductCenterControlledRepairPipeline({
    repairPlan: readJson(path.join(
      projectRoot,
      'output/maintenance/product-center-controlled-repair-plan.json',
    )),
    approvalGate: readJson(path.join(
      projectRoot,
      'output/maintenance/product-center-controlled-repair-approval-gate.json',
    )),
    incrementalPlan: readJson(path.join(
      projectRoot,
      'contracts/product-center/reviews/current-incremental-test-plan.json',
    )),
    incrementalResult: readOptionalJson(path.join(
      projectRoot,
      'contracts/product-center/reviews/current-incremental-test-result.json',
    )),
    closure: readOptionalJson(path.join(
      projectRoot,
      'output/maintenance/product-center-controlled-repair-closure.json',
    )),
  });
  return { enabled: true, ...result };
}

function writeControlledRepairEvaluation(
  projectRoot: string,
  evaluation: ProductCenterControlledRepairPipelineEvaluation & { enabled: true },
): void {
  writeJsonAtomic(path.join(
    projectRoot,
    'output/pipeline/product-center-controlled-repair-branch-latest.json',
  ), {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    ...evaluation,
  });
}

function controlledRepairDiagnostic(
  evaluation: ProductCenterControlledRepairPipelineEvaluation,
): string {
  const detail = evaluation.issues.map((issue) => `${issue.code}:${issue.detail}`).join(';');
  return `受控修复分支阻断：status=${evaluation.status}${detail ? `;${detail}` : ''}`;
}

function readTechnicalReadiness(projectRoot: string): ProductCenterTechnicalReadiness {
  const input: ReadinessInput = {
    expectedGoldCaseCount: readProductCenterGoldContractSummary(projectRoot).caseCount,
    expectedApprovedCaseCount: readJson<{ summary: { total: number } }>(path.join(
      projectRoot,
      'contracts/product-center/recipes/product-center-approved-technical-bindings-recipes.json',
    )).summary.total,
    mainAcceptance: readJson(path.join(
      projectRoot,
      'output/recipes/product-center-pilot-acceptance.json',
    )),
    goldAcceptance: readJson(path.join(
      projectRoot,
      'output/recipes/product-center-test-plan-gold-set-acceptance.json',
    )),
    approvedAcceptance: readJson(path.join(
      projectRoot,
      'output/recipes/product-center-approved-technical-bindings-acceptance.json',
    )),
    quality: readJson(path.join(
      projectRoot,
      'output/test-case-audit/product-center/quality-program-latest.json',
    )),
    trend: readJson(path.join(
      projectRoot,
      'output/recipes/product-center-acceptance-trend.json',
    )),
    pageContractDiff: readJson(path.join(
      projectRoot,
      'output/page-contract/product-center-page-contract-diff.json',
    )),
    driftLab: readJson(path.join(
      projectRoot,
      'output/page-contract/product-center-drift-lab.json',
    )),
    failureAnalysis: readJson(path.join(
      projectRoot,
      'output/failure-analysis/product-center-failure-analysis.json',
    )),
    testPlanIntake: readJson(path.join(
      projectRoot,
      'output/test-case-audit/product-center/test-plan-intake-v1-latest.json',
    )),
  };
  return evaluateProductCenterTechnicalReadiness(input);
}

function buildFailureAnalysisAfterUiFailure(
  projectRoot: string,
): ReturnType<typeof summarizeFailureAnalysisForPipeline> {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) return undefined;
  const result = spawnSync(process.execPath, [npmCli, 'run', 'build:product-center:failure-analysis'], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    shell: false,
  });
  if (result.status !== 0) {
    process.stderr.write('UI 失败后的只读失败分析构建未完成；已保留原始反馈与 pipeline 检查点。\n');
    return undefined;
  }
  return summarizeFailureAnalysisForPipeline(readJson(path.join(
    projectRoot,
    'output/failure-analysis/product-center-failure-analysis.json',
  )));
}

function inspectSafety(projectRoot: string) {
  return {
    incompleteCheckpoints: findIncompleteCheckpointFiles(
      path.join(projectRoot, 'output/checkpoints'),
    ).length,
    sensitiveArtifacts: scanGeneratedArtifacts(path.join(projectRoot, 'output')).length,
    savedAuthStates: fs.existsSync(path.resolve(projectRoot, appConfig.storageStatePath)) ? 1 : 0,
  };
}

function readMode(args: readonly string[]): PipelineMode {
  const index = args.indexOf('--mode');
  const raw = index >= 0 ? args[index + 1] : 'static';
  const mode = raw === 'verify' ? 'static' : raw;
  if (mode !== 'static' && mode !== 'live' && mode !== 'full') {
    throw new Error(`未知流水线模式：${mode ?? 'missing'}`);
  }
  return mode;
}

function readStatusCode(value: string): number | undefined {
  const match = value.match(/\b(408|429|502|503|504)\b/);
  return match ? Number(match[1]) : undefined;
}

function readRepeatedOption(args: readonly string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} 缺少阶段 ID`);
    values.push(value);
  }
  return [...new Set(values)];
}

function fingerprintPipelineInputs(projectRoot: string, planFingerprint: string): string {
  const hash = createHash('sha256').update(planFingerprint);
  const roots = [
    'api',
    'automation',
    'contracts',
    'flows',
    'pages',
    'reporters',
    'scripts',
    'sop',
    'test-data',
    'tests/api',
    'utils',
  ];
  const files = roots
    .flatMap((relativeRoot) => listTypeScriptFiles(path.join(projectRoot, relativeRoot)))
    .concat([
      path.join(projectRoot, 'package.json'),
      path.join(projectRoot, 'playwright.config.ts'),
      path.join(projectRoot, 'tsconfig.json'),
    ])
    .filter((filePath) => fs.existsSync(filePath))
    .sort();
  for (const filePath of files) {
    hash.update(path.relative(projectRoot, filePath).replace(/\\/g, '/'));
    hash.update(fs.readFileSync(filePath));
  }
  return hash.digest('hex');
}

function listTypeScriptFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(filePath);
    return entry.isFile() && entry.name.endsWith('.ts') ? [filePath] : [];
  });
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function readOptionalJson<T>(filePath: string): T | null {
  return fs.existsSync(filePath) ? readJson<T>(filePath) : null;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${redactAcceptanceDiagnostic(String(error))}\n`);
    process.exitCode = 1;
  });
}
