import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type RuntimeReport = {
  runId: string;
  batchId: string;
  status: string;
  acceptedCaseIds: string[];
  canonicalConflictCaseIds: string[];
  caseEvidence: Record<string, { verdict: string; evidence: unknown }>;
  summary: { total: number; accepted: number; canonicalConflicts: number; executorErrors: number };
  cleanupEvidence: {
    apiResidue: Record<string, number>;
    uiResidue: Record<string, number>;
    residueFree: boolean;
    cleanupDiagnostic?: string;
  };
  mutationIntents: Array<{ identity: string; phase: string; reconciliation?: string; serverId?: number | string }>;
};

const expectedAccepted = [
  'TC-ITEM-UI-004',
  'TC-ITEM-UI-005',
  'TC-ITEM-UI-006',
  'TC-ITEM-UI-007',
  'TC-ITEM-UI-008',
];

const expectedConflicts = [
  'TC-ITEM-ADD-002',
  'TC-ITEM-ADD-041',
  'TC-ITEM-PKG-048',
  'TC-ITEM-STD-030',
];

export function buildProductCenterItemYellowY3RuntimeAcceptance(options: {
  projectRoot?: string;
  reportPath?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const reportPath = path.resolve(options.reportPath ?? findLatestReport(projectRoot));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as RuntimeReport;
  if (!report.runId.startsWith('AUTO_AUDIT_')) throw new Error('Y3 runtime runId 不符合审计身份门禁');
  const apiResidueVerified = Object.values(report.cleanupEvidence.apiResidue).every((count) => count === 0);
  const uiResidueVerified = Object.values(report.cleanupEvidence.uiResidue).every((count) => count === 0);
  if (report.batchId !== 'Y3-B1'
    || report.status !== 'accepted-with-canonical-conflicts'
    || JSON.stringify([...report.acceptedCaseIds].sort()) !== JSON.stringify([...expectedAccepted].sort())
    || JSON.stringify([...report.canonicalConflictCaseIds].sort()) !== JSON.stringify([...expectedConflicts].sort())
    || report.summary.total !== 9
    || report.summary.accepted !== 5
    || report.summary.canonicalConflicts !== 4
    || report.summary.executorErrors !== 0
    || report.cleanupEvidence.residueFree !== true
    || !apiResidueVerified
    || !uiResidueVerified
    || Boolean(report.cleanupEvidence.cleanupDiagnostic)
    || report.mutationIntents.length < 1
    || report.mutationIntents.some((entry) => (
      !entry.identity.startsWith('AUTO_AUDIT_')
      || entry.phase !== 'cleanup-complete'
      || entry.reconciliation !== 'present'
      || entry.serverId === undefined
    ))) {
    throw new Error('Y3-B1 runtime 证据、冲突分类或跨断点零残留门禁不满足');
  }
  const semanticValue = {
    runId: report.runId,
    batchId: report.batchId,
    source: {
      reportPath: relativePath(projectRoot, reportPath),
      reportSha256: sha256File(reportPath),
    },
    summary: {
      total: 9,
      accepted: 5,
      canonicalConflicts: 4,
      executorErrors: 0,
      generationPromotable: 5,
      canonicalRepairRequired: 4,
      humanReviewRequired: 0,
      mutationIntents: report.mutationIntents.length,
      apiResidueVerified: Object.keys(report.cleanupEvidence.apiResidue).length,
      uiResidueVerified: Object.keys(report.cleanupEvidence.uiResidue).length,
    },
    acceptedCaseIds: [...report.acceptedCaseIds].sort(),
    canonicalConflicts: expectedConflicts.map((caseId) => ({
      caseId,
      evidence: report.caseEvidence[caseId]?.evidence,
    })),
    policy: {
      runtimeEvidenceAccepted: true as const,
      canonicalConflictsDoNotFailHarness: true as const,
      evidenceInheritanceAllowed: false as const,
      checkpointResumeAccepted: true as const,
      controlledMutationRequired: true as const,
      crossCheckpointResidueVerificationRequired: true as const,
    },
  };
  const artifact = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-yellow-y3-b1-runtime-acceptance' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: 'accepted-with-canonical-conflicts' as const,
    ...semanticValue,
    fingerprint: createHash('sha256').update(JSON.stringify(semanticValue)).digest('hex'),
  };
  const outputPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/runtime/product-center-item-yellow-y3-b1-runtime-acceptance.json',
  );
  writeJson(outputPath, artifact);
  return { artifact, outputPath };
}

function findLatestReport(projectRoot: string): string {
  const directory = path.join(projectRoot, 'output/audit');
  const match = fs.readdirSync(directory)
    .filter((name) => /^product-center-item-yellow-y3-runtime-AUTO_AUDIT_.*\.json$/.test(name))
    .map((name) => path.join(directory, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
  if (!match) throw new Error('未找到 Y3 runtime 报告');
  return match;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function relativePath(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).replace(/\\/g, '/');
}

if (require.main === module) {
  try {
    const { artifact, outputPath } = buildProductCenterItemYellowY3RuntimeAcceptance();
    process.stdout.write(`Y3-B1 runtime acceptance 已生成：${outputPath}\n状态=${artifact.status}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
