import fs from 'node:fs';
import path from 'node:path';
import { resolvePipelineStageInputs, runIdempotentPipeline, type IdempotentPipelineStage } from '../utils/idempotent-pipeline';
import { resolveSystemTestPlatformArtifact } from '../utils/system-test-platform-paths';

const projectRoot = path.resolve(__dirname, '..');
const tsxCommand = process.execPath;
const tsxCli = path.join(projectRoot, 'node_modules/tsx/dist/cli.mjs');
const governanceRoot = path.resolve(projectRoot, '..', 'deliverables/test-plan-governance');
const executionIndexPath = resolveSystemTestPlatformArtifact('execution-index.json');

type EvidenceRegistry = {
  cases?: Array<{ runtime?: { evidenceRefs?: string[] } }>;
  records?: Array<{ evidencePath?: string | null }>;
  decisions?: Array<{ evidenceRefs?: string[] }>;
};

export type ProductCenterEvidenceClosurePreflight = {
  schemaVersion: '1.0.0';
  reportId: 'product-center-evidence-closure-preflight';
  generatedAt: string;
  status: 'ready' | 'blocked';
  code: 'EVIDENCE_CLOSURE_PREFLIGHT_READY' | 'EVIDENCE_CLOSURE_PREFLIGHT_INPUTS_MISSING';
  scope: 'report-only-static-preflight';
  stageCount: number;
  missingInputs: Array<{ path: string; stages: string[] }>;
  guardrails: {
    businessExecutionStarted: false;
    liveBusinessWritesEnabled: false;
    existingPassedCasesInvalidated: false;
    secretsPersisted: false;
  };
};

/**
 * Resolve every stage input before the long evidence pipeline starts. This
 * turns repeated first-failure discovery into one deterministic diagnostic.
 */
export function buildProductCenterEvidenceClosurePreflight(
  rootDir: string,
  stages: readonly Pick<IdempotentPipelineStage, 'id' | 'inputs' | 'outputs'>[],
  generatedAt = new Date().toISOString(),
): ProductCenterEvidenceClosurePreflight {
  const generatedOutputs = new Set(stages.flatMap((stage) => stage.outputs.map((output) =>
    path.resolve(rootDir, output),
  )));
  const missingByPath = new Map<string, Set<string>>();
  for (const stage of stages) {
    for (const input of resolvePipelineStageInputs(stage)) {
      const absolutePath = path.resolve(rootDir, input);
      // Inputs produced by an earlier stage are internal pipeline edges. They
      // must be validated by stage ordering/checkpoints, not reported as
      // external missing prerequisites before the pipeline has started.
      if (generatedOutputs.has(absolutePath)) continue;
      if (fs.existsSync(absolutePath)) continue;
      const relativePath = path.relative(rootDir, absolutePath).replaceAll('\\', '/');
      const stagesForInput = missingByPath.get(relativePath) ?? new Set<string>();
      stagesForInput.add(stage.id);
      missingByPath.set(relativePath, stagesForInput);
    }
  }
  const missingInputs = [...missingByPath.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([inputPath, stageIds]) => ({ path: inputPath, stages: [...stageIds].sort() }));
  const blocked = missingInputs.length > 0;
  return {
    schemaVersion: '1.0.0',
    reportId: 'product-center-evidence-closure-preflight',
    generatedAt,
    status: blocked ? 'blocked' : 'ready',
    code: blocked ? 'EVIDENCE_CLOSURE_PREFLIGHT_INPUTS_MISSING' : 'EVIDENCE_CLOSURE_PREFLIGHT_READY',
    scope: 'report-only-static-preflight',
    stageCount: stages.length,
    missingInputs,
    guardrails: {
      businessExecutionStarted: false,
      liveBusinessWritesEnabled: false,
      existingPassedCasesInvalidated: false,
      secretsPersisted: false,
    },
  };
}

function resolveRegisteredEvidenceInputs(): string[] {
  const itemPlanPath = path.join(projectRoot, '../deliverables/product-center-item/test-cases.json');
  const executionDecisionsPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-execution-decisions.json',
  );
  const itemPlan = readJsonIfExists<EvidenceRegistry>(itemPlanPath);
  const executionIndex = readJsonIfExists<EvidenceRegistry>(executionIndexPath);
  const executionDecisions = readJsonIfExists<EvidenceRegistry>(executionDecisionsPath);
  const configured = [
    'output/product-center-group-human-rule-rebaseline-20260819.json',
    'output/product-center-group-human-rule-rebaseline-20260819-v2.json',
    'output/product-center-group-human-rule-rebaseline-20260819-v3.json',
    'output/product-center-group-human-rule-rebaseline-20260819-v4.json',
    'output/product-center-group-human-rule-rebaseline-20260819-v5.json',
    'output/product-center-group-human-rule-rebaseline-20260819-v6.json',
    'output/product-center-group-human-rule-rebaseline-20260819-v7.json',
  ];
  const references = [
    ...configured,
    ...(itemPlan?.cases ?? []).flatMap((item) => item.runtime?.evidenceRefs ?? []),
    ...(executionIndex?.records ?? []).flatMap((item) => item.evidencePath ? [item.evidencePath] : []),
    ...(executionDecisions?.decisions ?? []).flatMap((item) => item.evidenceRefs ?? []),
  ];
  return [...new Set(references.flatMap(resolveEvidenceInput))].sort();
}

function resolveEvidenceInput(reference: string): string[] {
  if (path.isAbsolute(reference)) return [reference];
  const candidates = [path.resolve(projectRoot, reference), path.resolve(projectRoot, '..', reference)];
  const existing = candidates.filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  return existing.length > 0 ? existing : candidates.slice(0, 1);
}

function readJsonIfExists<T>(filePath: string): T | null {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) as T : null;
}

export function runProductCenterEvidenceClosureFlow(): number {
  const stages: IdempotentPipelineStage[] = [
      {
        id: 'business-rule-audit',
        command: [tsxCommand, tsxCli, 'scripts/run-product-center-business-rule-audit.ts'],
        inputs: () => [
          'scripts/run-product-center-business-rule-audit.ts',
          'scripts/build-product-center-business-rule-lifecycle-snapshot.ts',
          'scripts/build-product-center-business-rule-change-trigger.ts',
          'scripts/promote-product-center-business-rule-verified-baseline.ts',
          'contracts/product-center/business-rules/product-center-item-formal-rule-bindings.json',
          'contracts/product-center/business-rules/product-center-business-rule-verified-baseline.json',
          'contracts/product-center/reviews/product-center-item-rule-confirmations.json',
          executionIndexPath,
        ],
        outputs: [
          'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
          '../deliverables/test-plan-governance/product-center-closure-audit.json',
        ],
      },
      {
        id: 'pre-landing-audit',
        command: [tsxCommand, tsxCli, 'scripts/audit-product-center-item-group-landing.ts'],
        inputs: () => [
          'scripts/audit-product-center-item-group-landing.ts',
          'scripts/build-product-center-closure-audit.ts',
          'utils/test-plan-landing-gate.ts',
          'contracts/product-center',
          '../deliverables/product-center-item/test-cases.json',
          executionIndexPath,
          '../Merchant Center Info/00-待转换测试方案',
          ...resolveRegisteredEvidenceInputs(),
        ],
        outputs: ['../deliverables/test-plan-governance/product-center-pre-landing-audit.json'],
        env: { PC_LANDING_OUTPUT_BASENAME: 'product-center-pre-landing-audit' },
      },
      {
        id: 'pre-closure-audit',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-closure-audit.ts'],
        inputs: [
          '../deliverables/test-plan-governance/product-center-pre-landing-audit.json',
          executionIndexPath,
          '../deliverables/product-center-source-governance/execution-plan.json',
          'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
          '../deliverables/test-plan-governance/product-center-document-rule-batch-preflight.json',
          '../deliverables/test-plan-governance/product-center-document-rule-evidence-recovery-plan.json',
          'scripts/build-product-center-closure-audit.ts',
        ],
        outputs: ['../deliverables/test-plan-governance/product-center-pre-closure-audit.json'],
        env: {
          PC_LANDING_INPUT_BASENAME: 'product-center-pre-landing-audit',
          PC_CLOSURE_OUTPUT_BASENAME: 'product-center-pre-closure-audit',
          PC_SELECTION_OUTPUT_BASENAME: 'product-center-pre-incremental-selection',
          PC_IGNORE_HISTORICAL_RECONCILIATION: 'true',
        },
      },
      {
        id: 'historical-evidence-reconciliation',
        command: [tsxCommand, tsxCli, 'scripts/reconcile-product-center-historical-evidence.ts'],
        inputs: () => [
          '../deliverables/test-plan-governance/product-center-pre-closure-audit.json',
          '../deliverables/product-center-item/test-cases.json',
          executionIndexPath,
          'scripts/reconcile-product-center-historical-evidence.ts',
          ...resolveRegisteredEvidenceInputs(),
        ],
        outputs: ['../deliverables/test-plan-governance/product-center-historical-evidence-reconciliation.json'],
        env: { PC_CLOSURE_AUDIT_PATH: '../deliverables/test-plan-governance/product-center-pre-closure-audit.json' },
      },
      {
        id: 'historical-receipt-current-compatibility',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-historical-receipt-compatibility.ts'],
        inputs: [
          '../deliverables/test-plan-governance/product-center-pre-closure-audit.json',
          '../deliverables/test-plan-governance/product-center-historical-evidence-reconciliation.json',
          executionIndexPath,
          'scripts/build-product-center-historical-receipt-compatibility.ts',
          'utils/historical-receipt-compatibility.ts',
          '../../Test Automation Platform/src/utils/historical-receipt-compatibility.ts',
        ],
        outputs: [
          '../deliverables/test-plan-governance/product-center-historical-receipt-compatibility.json',
          '../deliverables/test-plan-governance/product-center-historical-receipt-compatibility.md',
        ],
      },
      {
        id: 'post-landing-audit',
        command: [tsxCommand, tsxCli, 'scripts/audit-product-center-item-group-landing.ts'],
        inputs: [
          '../deliverables/test-plan-governance/product-center-historical-evidence-reconciliation.json',
          '../deliverables/test-plan-governance/product-center-historical-receipt-compatibility.json',
          'scripts/audit-product-center-item-group-landing.ts',
          'scripts/build-product-center-closure-audit.ts',
        ],
        outputs: ['../deliverables/test-plan-governance/product-center-item-group-landing-audit.json'],
        env: { PC_LANDING_OUTPUT_BASENAME: 'product-center-item-group-landing-audit' },
      },
      {
        id: 'item-case-fingerprint-shadow',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-item-case-fingerprint-shadow.ts'],
        inputs: [
          '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
          '../deliverables/test-plan-governance/product-center-item-group-landing-audit.json',
          '../deliverables/test-plan-governance/product-center-historical-receipt-compatibility.json',
          'scripts/build-product-center-item-case-fingerprint-shadow.ts',
          'utils/product-center-item-case-semantic-fingerprint.ts',
          'utils/case-semantic-fingerprint.ts',
          '../../Test Automation Platform/src/utils/case-semantic-fingerprint.ts',
        ],
        outputs: [
          '../deliverables/test-plan-governance/product-center-item-case-fingerprint-shadow.json',
          '../deliverables/test-plan-governance/product-center-item-case-fingerprint-shadow.md',
        ],
      },
      {
        id: 'item-dual-fingerprint-migration-progress',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-item-dual-fingerprint-migration.ts'],
        inputs: [
          '../deliverables/test-plan-governance/product-center-item-group-landing-audit.json',
          executionIndexPath,
          'scripts/build-product-center-item-dual-fingerprint-migration.ts',
          'utils/dual-case-fingerprint-transition.ts',
          '../../Test Automation Platform/src/utils/dual-case-fingerprint-transition.ts',
        ],
        outputs: [
          '../deliverables/test-plan-governance/product-center-item-dual-fingerprint-migration.json',
          '../deliverables/test-plan-governance/product-center-item-dual-fingerprint-migration.md',
        ],
      },
      {
        id: 'post-business-rule-change-trigger',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-change-trigger.ts'],
        inputs: [
          '../deliverables/test-plan-governance/product-center-item-group-landing-audit.json',
          'contracts/product-center/business-rules/product-center-business-rule-verified-baseline.json',
          'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
          executionIndexPath,
          'scripts/build-product-center-business-rule-change-trigger.ts',
          '../../Test Automation Platform/src/automation/system-test/business-rule-change-trigger.ts',
        ],
        outputs: ['contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json'],
      },
      {
        id: 'post-business-rule-baseline-promotion',
        command: [tsxCommand, tsxCli, 'scripts/promote-product-center-business-rule-verified-baseline.ts'],
        inputs: [
          'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
          'contracts/product-center/business-rules/product-center-business-rule-verified-baseline.json',
          'scripts/promote-product-center-business-rule-verified-baseline.ts',
        ],
        outputs: ['contracts/product-center/business-rules/generated/product-center-business-rule-baseline-promotion.json'],
      },
      {
        id: 'post-business-rule-trigger-after-promotion',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-change-trigger.ts'],
        inputs: [
          '../deliverables/test-plan-governance/product-center-item-group-landing-audit.json',
          'contracts/product-center/business-rules/product-center-business-rule-verified-baseline.json',
          'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
          'contracts/product-center/business-rules/generated/product-center-business-rule-baseline-promotion.json',
          executionIndexPath,
          'scripts/build-product-center-business-rule-change-trigger.ts',
        ],
        outputs: ['contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json'],
      },
      {
        id: 'post-closure-audit',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-closure-audit.ts'],
        inputs: [
          '../deliverables/test-plan-governance/product-center-item-group-landing-audit.json',
          executionIndexPath,
          '../deliverables/product-center-source-governance/execution-plan.json',
          'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
          '../deliverables/test-plan-governance/product-center-historical-evidence-reconciliation.json',
          '../deliverables/test-plan-governance/product-center-historical-receipt-compatibility.json',
          '../deliverables/test-plan-governance/product-center-document-rule-batch-preflight.json',
          '../deliverables/test-plan-governance/product-center-document-rule-evidence-recovery-plan.json',
          'scripts/build-product-center-closure-audit.ts',
        ],
        outputs: ['../deliverables/test-plan-governance/product-center-incremental-selection.json'],
      },
  ];
  const preflight = buildProductCenterEvidenceClosurePreflight(projectRoot, stages);
  const preflightPath = path.join(governanceRoot, 'product-center-evidence-closure-preflight.json');
  fs.mkdirSync(path.dirname(preflightPath), { recursive: true });
  fs.writeFileSync(preflightPath, `${JSON.stringify(preflight, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(preflight)}\n`);
  if (preflight.status === 'blocked') return 1;
  return runIdempotentPipeline({
    pipelineId: 'product-center-evidence-closure-flow',
    rootDir: projectRoot,
    checkpointPath: path.join(governanceRoot, 'product-center-evidence-closure-flow.checkpoint.json'),
    stages,
  });
}

if (require.main === module) process.exitCode = runProductCenterEvidenceClosureFlow();
