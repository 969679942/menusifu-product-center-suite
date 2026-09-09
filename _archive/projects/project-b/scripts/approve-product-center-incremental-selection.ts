import fs from 'node:fs';
import path from 'node:path';
import { assertProductCenterGroupBindingsCurrent } from '../utils/product-center-group-automation';
import { buildProductCenterGroupCaseFingerprintManifest } from '../utils/product-center-group-case-fingerprint';

type ClosureAudit = {
  generatedAt: string;
  source: { changeObservation: { status: string; fingerprint?: string | null } };
  incrementalSelection: {
    status: string;
    recommendedCaseIds: string[];
    unavailableCaseIds: string[];
    handledCaseIds?: string[];
  };
};

export type IncrementalSelection = {
  schemaVersion: '1.0.0';
  status: 'approved';
  source: 'product-center-closure-audit';
  closureAuditGeneratedAt: string;
  changeObservation: { status: string; fingerprint?: string | null };
  approvedAt: string;
  approvedBy: string;
  approvedCaseIds: string[];
  recommendedCaseIds: string[];
  caseExecutionFingerprints: Record<string, string>;
};

export function approveProductCenterIncrementalSelection(input: {
  closureAudit: ClosureAudit;
  caseIds: readonly string[];
  approvedBy: string;
  approvedAt?: string;
  caseExecutionFingerprints?: Record<string, string>;
}): IncrementalSelection {
  const requested = [...new Set(input.caseIds.map((caseId) => caseId.trim().toUpperCase()).filter(Boolean))].sort();
  if (requested.length === 0) throw new Error('必须显式提供至少一个 caseId，已拒绝空执行名单。');
  const recommended = new Set(input.closureAudit.incrementalSelection.recommendedCaseIds);
  const unavailable = new Set(input.closureAudit.incrementalSelection.unavailableCaseIds);
  const rejected = requested.filter((caseId) => !recommended.has(caseId));
  if (rejected.length > 0) {
    const unavailableRequested = rejected.filter((caseId) => unavailable.has(caseId));
    const reason = unavailableRequested.length > 0 ? '未进入当前执行计划' : '不在闭环审计推荐名单';
    throw new Error(`${reason}：${rejected.join(',')}`);
  }
  return {
    schemaVersion: '1.0.0',
    status: 'approved',
    source: 'product-center-closure-audit',
    closureAuditGeneratedAt: input.closureAudit.generatedAt,
    changeObservation: input.closureAudit.source.changeObservation,
    approvedAt: input.approvedAt ?? new Date().toISOString(),
    approvedBy: input.approvedBy,
    approvedCaseIds: requested,
    recommendedCaseIds: [...recommended].sort(),
    caseExecutionFingerprints: input.caseExecutionFingerprints ?? {},
  };
}

function main(): void {
  const projectRoot = path.resolve(__dirname, '..');
  const workspaceRoot = path.resolve(projectRoot, '..');
  const governanceRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
  const closurePath = path.join(governanceRoot, 'product-center-closure-audit.json');
  const outputPath = path.join(governanceRoot, 'product-center-incremental-selection.json');
  const caseIds = process.argv.find((argument) => argument.startsWith('--case-ids='))
    ?.slice('--case-ids='.length).split(',') ?? [];
  const approvedBy = process.argv.find((argument) => argument.startsWith('--approved-by='))
    ?.slice('--approved-by='.length).trim()
    || process.env.USERNAME
    || process.env.USER
    || 'unknown-operator';
  const groupCaseIds = caseIds.map((caseId) => caseId.trim().toUpperCase()).filter((caseId) => caseId.startsWith('TC-GRP-'));
  if (groupCaseIds.length > 0) assertProductCenterGroupBindingsCurrent(projectRoot, groupCaseIds);
  const caseExecutionFingerprints = groupCaseIds.length === 0
    ? {}
    : Object.fromEntries(buildProductCenterGroupCaseFingerprintManifest(
      projectRoot,
      readJson<{ cases: Array<{ caseId: string; handlerId: string | null; bindingFingerprint: string; generationAllowed: boolean }> }>(
        path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json'),
      ).cases,
    ).cases
      .filter((item) => groupCaseIds.includes(item.caseId))
      .map((item) => [item.caseId, item.fingerprint]));
  const selection = approveProductCenterIncrementalSelection({
    closureAudit: readJson<ClosureAudit>(closurePath),
    caseIds,
    approvedBy,
    caseExecutionFingerprints,
  });
  writeJson(outputPath, selection);
  process.stdout.write(`${JSON.stringify(selection, null, 2)}\n`);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) main();
