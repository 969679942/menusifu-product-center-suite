import fs from 'node:fs';
import path from 'node:path';
import { assertProductCenterGroupBindingsCurrent } from '../utils/product-center-group-automation';
import { buildProductCenterGroupCaseFingerprintManifest } from '../utils/product-center-group-case-fingerprint';
import { runProductCenterEvidenceClosureFlow } from './run-product-center-evidence-closure-flow';
import {
  buildProductCenterExecutionRepairQueue,
  writeProductCenterExecutionRepairQueue,
} from './build-product-center-execution-repair-queue';
import { runProductCenterSourceGoverned } from './run-product-center-source-governed';

type Selection = {
  status: string;
  closureAuditGeneratedAt: string;
  approvedCaseIds: string[];
  caseExecutionFingerprints?: Record<string, string>;
};

type ClosureAudit = {
  generatedAt: string;
  incrementalSelection: { recommendedCaseIds: string[] };
};

export function runApprovedProductCenterIncremental(options: {
  execute?: boolean;
  finalize?: boolean;
  repairDiagnosisPath?: string;
} = {}): number {
  const projectRoot = path.resolve(__dirname, '..');
  const workspaceRoot = path.resolve(projectRoot, '..');
  const governanceRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
  const selection = readJson<Selection>(path.join(governanceRoot, 'product-center-incremental-selection.json'));
  const closure = readJson<ClosureAudit>(path.join(governanceRoot, 'product-center-closure-audit.json'));
  if (selection.status !== 'approved' || selection.approvedCaseIds.length === 0) {
    throw new Error('没有已批准的增量执行名单；仅生成审计候选，不会自动运行。');
  }
  if (selection.closureAuditGeneratedAt !== closure.generatedAt) {
    throw new Error('增量批准名单已过期，请先重新生成闭环审计。');
  }
  assertIncrementalPreflight({ projectRoot, selection, closure });
  const recommended = new Set(closure.incrementalSelection.recommendedCaseIds);
  const stale = selection.approvedCaseIds.filter((caseId) => !recommended.has(caseId));
  if (stale.length > 0) throw new Error(`批准名单不再属于当前推荐增量：${stale.join(',')}`);
  const groupCaseIds = selection.approvedCaseIds.filter((caseId) => caseId.startsWith('TC-GRP-'));
  if (groupCaseIds.length > 0) {
    assertProductCenterGroupBindingsCurrent(projectRoot, groupCaseIds);
    const currentFingerprints = new Map(buildProductCenterGroupCaseFingerprintManifest(
      projectRoot,
      readJson<{ cases: Array<{ caseId: string; handlerId: string | null; bindingFingerprint: string; generationAllowed: boolean }> }>(
        path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json'),
      ).cases,
    ).cases.map((item) => [item.caseId, item.fingerprint]));
    const changed = groupCaseIds.filter((caseId) => (
      !selection.caseExecutionFingerprints?.[caseId]
      || selection.caseExecutionFingerprints[caseId] !== currentFingerprints.get(caseId)
    ));
    if (changed.length > 0) {
      throw new Error(`批准后组用例执行实现已变化：${changed.join(',')}；必须重新审计并批准，禁止使用旧批准运行新脚本。`);
    }
  }
  const executionExitCode = runProductCenterSourceGoverned({
    execute: options.execute,
    caseIds: selection.approvedCaseIds,
    ...(options.repairDiagnosisPath ? { repairDiagnosisPath: options.repairDiagnosisPath } : {}),
  });
  if (!options.execute) return executionExitCode;

  const repairQueue = buildProductCenterExecutionRepairQueue();
  writeProductCenterExecutionRepairQueue(repairQueue);
  // Evidence reconciliation is a full-plan governance operation.  It must
  // never be implicit in a targeted repair: a single case would otherwise
  // cause hundreds of historical reports to be reopened and re-read.  Keep
  // the expensive operation behind an explicit, auditable opt-in.
  const closureExitCode = options.finalize ? runProductCenterEvidenceClosureFlow() : 0;
  const refreshedClosure = options.finalize
    ? readJson<ClosureAudit>(path.join(governanceRoot, 'product-center-closure-audit.json'))
    : closure;
  const remainingRecommendations = options.finalize
    ? refreshedClosure.incrementalSelection.recommendedCaseIds
    : selection.approvedCaseIds;
  process.stdout.write(`${JSON.stringify({
    terminal: executionExitCode === 0 && closureExitCode === 0 && repairQueue.summary.failed === 0
      && (options.finalize ? remainingRecommendations.length === 0 : true),
    executionExitCode,
    closureExitCode,
    finalize: options.finalize === true,
    failed: repairQueue.summary.failed,
    remainingRecommendations,
    repairQueue: '../deliverables/test-plan-governance/product-center-execution-repair-queue.json',
  }, null, 2)}\n`);
  return executionExitCode !== 0 || closureExitCode !== 0 || repairQueue.summary.failed > 0
    || (options.finalize && remainingRecommendations.length > 0)
    ? (executionExitCode !== 0 ? executionExitCode : 1)
    : 0;
}

function assertIncrementalPreflight(input: {
  projectRoot: string;
  selection: Selection;
  closure: ClosureAudit;
}): void {
  const planPath = path.join(input.projectRoot, '..', 'deliverables/product-center-source-governance/execution-plan.json');
  const plan = readJson<{
    revalidation?: { selectedCaseIds?: string[]; runners?: Array<{ selectedCaseIds?: string[]; spec?: string }> };
  }>(planPath);
  const planned = new Set(plan.revalidation?.selectedCaseIds ?? []);
  const selected = [...new Set(input.selection.approvedCaseIds)];
  const missing = selected.filter((caseId) => !planned.has(caseId));
  if (missing.length > 0) throw new Error(`增量执行前预检失败：用例未进入 revalidation 选择集：${missing.join(',')}`);
  const runnerCases = new Set((plan.revalidation?.runners ?? []).flatMap((runner) => runner.selectedCaseIds ?? []));
  const unrouted = selected.filter((caseId) => !runnerCases.has(caseId));
  if (unrouted.length > 0) throw new Error(`增量执行前预检失败：用例缺少 runner 路由：${unrouted.join(',')}`);
  const itemSpecPath = path.join(input.projectRoot, 'tests/generated/product-center-item-216.generated.spec.ts');
  if (selected.some((caseId) => caseId.startsWith('TC-ITEM-')) && !fs.existsSync(itemSpecPath)) {
    throw new Error('增量执行前预检失败：商品 216 生成用例入口不存在。');
  }
  if (selected.includes('TC-ITEM-PKG-078')) {
    const spec = fs.readFileSync(itemSpecPath, 'utf8');
    const flowPath = path.join(input.projectRoot, 'flows/product-center/item-216/package-item-216.flow.ts');
    const flow = fs.readFileSync(flowPath, 'utf8');
    if (!spec.includes('TC-ITEM-PKG-078') || !flow.includes('ensureAddonRenameTarget')) {
      throw new Error('TC-ITEM-PKG-078 执行前预检失败：用例注册或数据前置流程缺失。');
    }
  }
  if (!input.closure.incrementalSelection.recommendedCaseIds.some((caseId) => selected.includes(caseId))) {
    throw new Error('增量执行前预检失败：批准名单与当前审计推荐没有交集。');
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

if (require.main === module) {
  const repairDiagnosisOption = process.argv.find((argument) => argument.startsWith('--repair-diagnosis='));
  process.exitCode = runApprovedProductCenterIncremental({
    execute: process.argv.includes('--execute'),
    finalize: process.argv.includes('--finalize'),
    ...(repairDiagnosisOption ? { repairDiagnosisPath: repairDiagnosisOption.slice('--repair-diagnosis='.length) } : {}),
  });
}
