import path from 'node:path';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { runIdempotentPipeline, type IdempotentPipelineStage } from '../utils/idempotent-pipeline';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const execute = process.argv.includes('--execute');
const node = process.execPath;
const tsx = require.resolve('tsx/cli');
const planPath = '../deliverables/product-center-source-governance/execution-plan.json';
const checkpointPath = path.join(projectRoot, 'output/checkpoints/pipelines/product-center-source-governed.json');

const stages: IdempotentPipelineStage[] = [
  {
    id: 'audit',
    command: [node, tsx, 'scripts/audit-product-center-unsupported-sources.ts'],
    inputs: ['../Merchant Center Info/00-待转换测试方案/用例库', '../Merchant Center Info/00-待转换测试方案/来源资料', '../Merchant Center Info/商品中心业务规则.md', 'contracts/product-center/reviews/verified-source-writeback-manifest.json', 'contracts/product-center/reviews/product-center-source-auto-resolution.json'],
    outputs: ['contracts/product-center/reviews/unsupported-source-format-decisions.json'],
  },
  {
    id: 'case-update',
    command: [node, tsx, 'scripts/build-product-center-group-test-cases.ts'],
    inputs: ['../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-组', '../Merchant Center Info/00-待转换测试方案/来源资料/商品中心-商品管理-组', 'contracts/product-center/generated/modules/brand-group.json', '../deliverables/product-center-group/runtime-audit-v2.json'],
    outputs: ['../deliverables/product-center-group/test-cases.json', '../deliverables/product-center-group/test-cases.md'],
  },
  {
    id: 'script-generation',
    command: [node, tsx, 'scripts/build-product-center-group-automation.ts'],
    inputs: ['../deliverables/product-center-group/test-cases.json', 'contracts/product-center/generated/modules/brand-group.json'],
    outputs: ['contracts/product-center/group/product-center-group-bindings.json', 'tests/generated/product-center-group.generated.spec.ts'],
  },
  {
    id: 'asset-governance',
    command: [node, tsx, 'scripts/build-test-plan-asset-index.ts'],
    inputs: ['../Merchant Center Info/00-待转换测试方案/用例库', 'contracts/product-center/group/product-center-group-bindings.json', 'contracts/product-center/test-cases/canonical/product-center-legacy-remaining-automation-bindings.json', '../deliverables/product-center-item/test-cases.json'],
    outputs: ['../Merchant Center Info/00-待转换测试方案/已完成/index.json', '../Merchant Center Info/00-待转换测试方案/未落地/index.json'],
  },
  {
    id: 'execution-plan',
    command: [node, tsx, 'scripts/build-product-center-source-governed-execution-plan.ts'],
    inputs: ['contracts/product-center/reviews/unsupported-source-format-decisions.json', 'contracts/product-center/group/product-center-group-bindings.json', 'contracts/product-center/test-cases/canonical/product-center-legacy-remaining-automation-bindings.json', '../deliverables/product-center-item/test-cases.json'],
    outputs: [planPath],
  },
  {
    id: 'execute',
    command: [node, tsx, 'scripts/run-product-center-source-governed.ts', '--execute'],
    inputs: [planPath, 'tests/generated/product-center-group.generated.spec.ts', 'tests/generated/product-center-item-216.generated.spec.ts', 'tests/generated/product-center-legacy-remaining.generated.spec.ts'],
    outputs: ['../deliverables/product-center-source-governance/execution-result.json'],
    enabled: execute,
    env: () => ({
      PC_SOURCE_GOVERNED_RUN_ID: stableRunId(planPath),
    }),
  },
];

const exitCode = runIdempotentPipeline({
  pipelineId: 'product-center-source-governed-v1',
  rootDir: projectRoot,
  checkpointPath,
  stages,
});
process.exitCode = exitCode;

function stableRunId(relativePlanPath: string): string {
  const absolutePlanPath = path.resolve(projectRoot, relativePlanPath);
  const source = fs.existsSync(absolutePlanPath) ? fs.readFileSync(absolutePlanPath) : Buffer.from('pending-plan');
  return `pipeline-${createHash('sha256').update(source).digest('hex').slice(0, 16)}`;
}
