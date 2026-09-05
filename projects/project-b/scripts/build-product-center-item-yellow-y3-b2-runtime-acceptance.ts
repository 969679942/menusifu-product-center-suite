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
    apiItemResidue: Record<string, number>;
    uiItemResidue: Record<string, number>;
    dependencyResidue: Record<string, number>;
    residueFree: boolean;
    ledgerEntries: number;
    residueVerified: number;
    cleanupDiagnostic?: string;
  };
  mutationIntents: Array<{
    identity: string;
    phase: string;
    reconciliation?: string;
    serverId?: number | string;
  }>;
};

const expectedAccepted = [
  'TC-ITEM-ADD-007',
  'TC-ITEM-ADD-009',
  'TC-ITEM-STD-019',
  'TC-ITEM-STD-084',
  'TC-ITEM-STD-085',
];

const expectedConflicts = [
  'TC-ITEM-ADD-011',
  'TC-ITEM-ADD-022',
  'TC-ITEM-ADD-025',
  'TC-ITEM-ADD-038',
  'TC-ITEM-ADD-049',
  'TC-ITEM-STD-086',
];

export function buildProductCenterItemYellowY3B2RuntimeAcceptance(options: {
  projectRoot?: string;
  reportPath?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const reportPath = path.resolve(options.reportPath ?? findLatestReport(projectRoot));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as RuntimeReport;
  const allResidueZero = [
    report.cleanupEvidence.apiItemResidue,
    report.cleanupEvidence.uiItemResidue,
    report.cleanupEvidence.dependencyResidue,
  ].every((residue) => Object.values(residue).every((count) => count === 0));
  if (!report.runId.startsWith('AUTO_AUDIT_')
    || report.batchId !== 'Y3-B2'
    || report.status !== 'accepted-with-canonical-conflicts'
    || JSON.stringify([...report.acceptedCaseIds].sort()) !== JSON.stringify(expectedAccepted)
    || JSON.stringify([...report.canonicalConflictCaseIds].sort()) !== JSON.stringify(expectedConflicts)
    || report.summary.total !== 11
    || report.summary.accepted !== 5
    || report.summary.canonicalConflicts !== 6
    || report.summary.executorErrors !== 0
    || report.cleanupEvidence.residueFree !== true
    || report.cleanupEvidence.ledgerEntries !== report.cleanupEvidence.residueVerified
    || !allResidueZero
    || Boolean(report.cleanupEvidence.cleanupDiagnostic)
    || report.mutationIntents.length < 1
    || report.mutationIntents.some((entry) => (
      !entry.identity.startsWith('AUTO_AUDIT_')
      || entry.phase !== 'cleanup-complete'
      || !['present', 'absent'].includes(entry.reconciliation ?? '')
      || entry.serverId === undefined
    ))) {
    throw new Error('Y3-B2 runtime 证据、冲突分类或跨断点零残留门禁不满足');
  }
  const semanticValue = {
    runId: report.runId,
    batchId: report.batchId,
    source: {
      reportPath: relativePath(projectRoot, reportPath),
      reportSha256: sha256File(reportPath),
    },
    summary: {
      total: 11,
      accepted: 5,
      canonicalConflicts: 6,
      executorErrors: 0,
      generationPromotable: 5,
      canonicalRepairRequired: 6,
      humanReviewRequired: 0,
      mutationIntents: report.mutationIntents.length,
      apiResidueVerified: Object.keys(report.cleanupEvidence.apiItemResidue).length,
      uiResidueVerified: Object.keys(report.cleanupEvidence.uiItemResidue).length,
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
      interruptedMutationReconciliationRequired: true as const,
      controlledMutationRequired: true as const,
      crossCheckpointResidueVerificationRequired: true as const,
    },
  };
  const artifact = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-yellow-y3-b2-runtime-acceptance' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: 'accepted-with-canonical-conflicts' as const,
    ...semanticValue,
    fingerprint: createHash('sha256').update(JSON.stringify(semanticValue)).digest('hex'),
  };
  const outputPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/runtime/product-center-item-yellow-y3-b2-runtime-acceptance.json',
  );
  writeJson(outputPath, artifact);
  return { artifact, outputPath };
}

function findLatestReport(projectRoot: string): string {
  const directory = path.join(projectRoot, 'output/audit');
  const match = fs.readdirSync(directory)
    .filter((name) => /^product-center-item-yellow-y3-b2-runtime-AUTO_AUDIT_.*\.json$/.test(name))
    .map((name) => path.join(directory, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
  if (!match) throw new Error('未找到 Y3-B2 runtime 报告');
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
    const { artifact, outputPath } = buildProductCenterItemYellowY3B2RuntimeAcceptance();
    process.stdout.write(`Y3-B2 runtime acceptance 已生成：${outputPath}\n状态=${artifact.status}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
