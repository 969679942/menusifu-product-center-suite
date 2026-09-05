import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { classifyProductCenterFailure } from '../utils/product-center-failure-classifier';
import {
  evaluateProductCenterDriftProposalApproval,
  type ProductCenterDriftRepairProposal,
} from '../utils/product-center-drift-repair-proposal';
import {
  fingerprintPipelinePlan,
  runCheckpointedPipeline,
  type CheckpointedPipelineStage,
} from '../utils/pipeline/checkpointed-pipeline';

export const productCenterDriftWorkflowStageIds = [
  'static-contract',
  'page-contract-probe',
  'page-contract-diff',
  'technical-proposal',
  'approval-gate',
  'apply-technical-repair',
  'impacted-ui',
  'final-full',
  'baseline-promotion',
] as const;

export async function runProductCenterDriftWorkflow(
  rootDir = process.cwd(),
  args = process.argv.slice(2),
) {
  const resume = args.includes('--resume');
  const approvedFindings = args
    .filter((argument) => argument.startsWith('--approved-finding='))
    .map((argument) => argument.slice('--approved-finding='.length));
  const stateVerifiedStageIds = args
    .filter((argument) => argument.startsWith('--state-verified='))
    .map((argument) => argument.slice('--state-verified='.length));
  const checkpointPath = path.join(
    rootDir,
    'output/checkpoints/product-center-drift-workflow.json',
  );
  const stages = buildStages(rootDir, approvedFindings);
  return runCheckpointedPipeline({
    pipelineId: 'product-center-drift-workflow',
    planFingerprint: fingerprintPipelinePlan('product-center-drift-workflow', stages),
    checkpointPath,
    stages,
    resume,
    stateVerifiedStageIds,
    onRunStart: (report) => {
      process.env.PC_QUALITY_PIPELINE_RUN_ID = report.runId;
    },
  });
}

function buildStages(rootDir: string, approvedFindings: readonly string[]): CheckpointedPipelineStage[] {
  return [
    commandStage(rootDir, 'static-contract', 'typecheck'),
    commandStage(
      rootDir,
      'page-contract-probe',
      'observe:product-center:page-contract',
      'state-verification-required',
    ),
    commandStage(rootDir, 'page-contract-diff', 'build:product-center:page-contract-observation'),
    commandStage(rootDir, 'technical-proposal', 'build:product-center:drift-repair-proposal'),
    {
      id: 'approval-gate',
      retryMode: 'idempotent',
      execute: async () => {
        const artifact = readOptionalJson<ProductCenterDriftRepairProposal>(path.join(
          rootDir,
          'output/page-contract/product-center-drift-repair-proposal.json',
        ));
        if (!artifact) return { success: false, diagnostic: '缺少技术修复 proposal' };
        const approval = evaluateProductCenterDriftProposalApproval(artifact, approvedFindings);
        return approval.approved
          ? { success: true }
          : { success: false, diagnostic: `技术修复 proposal 尚未逐 finding 批准：${approval.missing.join(',')}` };
      },
    },
    {
      id: 'apply-technical-repair',
      retryMode: 'idempotent',
      execute: async () => runCommand(rootDir, 'apply:product-center:drift-repair', [
        '--',
        ...approvedFindings.map((value) => `--approved-finding=${value}`),
      ]),
    },
    {
      id: 'impacted-ui',
      retryMode: 'state-verification-required',
      execute: async () => runImpactedGold(rootDir),
    },
    {
      id: 'final-full',
      retryMode: 'state-verification-required',
      execute: async () => runFinalFull(rootDir),
    },
    {
      id: 'baseline-promotion',
      retryMode: 'idempotent',
      execute: async () => {
        const proposal = readOptionalJson<ProductCenterDriftRepairProposal>(path.join(
          rootDir,
          'output/page-contract/product-center-drift-repair-proposal.json',
        ));
        if (proposal?.status === 'no-change') return { success: true };
        if (approvedFindings.length === 0) {
          return { success: false, diagnostic: 'baseline 晋级缺少逐 finding 正式批准' };
        }
        return runCommand(rootDir, 'build:product-center:page-contract-observation', [
          '--',
          '--promote-baseline',
          ...approvedFindings.map((value) => `--approved-finding=${value}`),
        ]);
      },
    },
  ];
}

function commandStage(
  rootDir: string,
  id: string,
  script: string,
  retryMode: CheckpointedPipelineStage['retryMode'] = 'idempotent',
): CheckpointedPipelineStage {
  return { id, retryMode, execute: async () => runCommand(rootDir, script) };
}

async function runImpactedGold(rootDir: string) {
  const impact = readOptionalJson<{ impactedCases?: Array<{ caseId?: string }> }>(path.join(
    rootDir,
    'output/page-contract/product-center-page-contract-impact.json',
  ));
  const gold = readOptionalJson<{ recipes?: Array<{ caseId?: string }> }>(path.join(
    rootDir,
    'contracts/product-center/recipes/product-center-test-plan-gold-set-recipes.json',
  ));
  const goldCaseIds = new Set((gold?.recipes ?? []).map((entry) => entry.caseId).filter(Boolean));
  const impactedGoldCaseIds = [...new Set((impact?.impactedCases ?? [])
    .map((entry) => entry.caseId)
    .filter((caseId): caseId is string => Boolean(caseId) && goldCaseIds.has(caseId)))];
  if (impactedGoldCaseIds.length === 0) return { success: true };
  for (const caseId of impactedGoldCaseIds) {
    const result = runCommand(rootDir, 'test:product-center:test-plan-gold-set:impacted', [
      '--',
      `--impacted-case-id=${caseId}`,
    ]);
    if (!result.success) return result;
  }
  return { success: true };
}

async function runFinalFull(rootDir: string) {
  const proposal = readOptionalJson<ProductCenterDriftRepairProposal>(path.join(
    rootDir,
    'output/page-contract/product-center-drift-repair-proposal.json',
  ));
  if (proposal?.status === 'no-change') return { success: true };
  for (const script of [
    'test:product-center:recipes',
    'build:product-center:runtime-acceptance',
    'test:product-center:test-plan-gold-set',
    'test:product-center:approved-technical-bindings',
  ]) {
    const result = runCommand(rootDir, script);
    if (!result.success) return result;
  }
  return { success: true };
}

function runCommand(rootDir: string, script: string, extraArgs: readonly string[] = []) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) return { success: false, diagnostic: '缺少 npm CLI 路径' };
  const result = spawnSync(process.execPath, [npmCli, 'run', script, ...extraArgs], {
    cwd: rootDir,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    shell: false,
  });
  if (result.status === 0) return { success: true };
  const diagnostic = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.slice(-4_000);
  const classification = classifyProductCenterFailure({ message: diagnostic });
  return {
    success: false,
    transient: classification.retryable,
    diagnostic,
  };
}

function readOptionalJson<T>(filePath: string): T | null {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) as T : null;
}

if (require.main === module) {
  void runProductCenterDriftWorkflow().then((report) => {
    process.stdout.write(`商品中心漂移 workflow：${report.status};failed=${report.failedStage ?? 'none'}\n`);
    if (report.status !== 'passed') process.exitCode = 1;
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
