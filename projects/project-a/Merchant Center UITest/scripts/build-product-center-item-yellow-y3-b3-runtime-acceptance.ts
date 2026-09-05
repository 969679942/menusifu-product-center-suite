import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type RuntimeReport = {
  runId: string;
  batchId: string;
  status: string;
  acceptedCaseIds: string[];
  canonicalConflictCaseIds: string[];
  environmentBlockedCaseIds: string[];
  caseEvidence: Record<string, { verdict: string; evidence: unknown }>;
  summary: {
    total: number;
    accepted: number;
    canonicalConflicts: number;
    environmentBlocked: number;
    executorErrors: number;
  };
  cleanupEvidence: {
    apiItemResidue: Record<string, number>;
    uiItemResidue: Record<string, number>;
    lateUiResidueDeleted: Record<string, number[]>;
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
  'TC-ITEM-ADD-018',
  'TC-ITEM-ADD-019',
  'TC-ITEM-ADD-020',
  'TC-ITEM-ADD-045',
  'TC-ITEM-PKG-020',
  'TC-ITEM-PKG-036',
  'TC-ITEM-PKG-042',
  'TC-ITEM-PKG-043',
];

const expectedConflicts = ['TC-ITEM-UI-003'];

const expectedBlocks = [
  'TC-ITEM-ADD-021',
  'TC-ITEM-ADD-033',
  'TC-ITEM-ADD-039',
  'TC-ITEM-STD-025',
  'TC-ITEM-STD-026',
  'TC-ITEM-STD-027',
];

export function buildProductCenterItemYellowY3B3RuntimeAcceptance(options: {
  projectRoot?: string;
  reportPath?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const reportPath = path.resolve(options.reportPath ?? findLatestReport(projectRoot));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as RuntimeReport;
  const allResidueZero = [report.cleanupEvidence.apiItemResidue, report.cleanupEvidence.uiItemResidue]
    .every((residue) => Object.values(residue).every((count) => count === 0));
  if (!report.runId.startsWith('AUTO_AUDIT_')
    || report.batchId !== 'Y3-B3'
    || report.status !== 'accepted-with-blocks'
    || !sameIds(report.acceptedCaseIds, expectedAccepted)
    || !sameIds(report.canonicalConflictCaseIds, expectedConflicts)
    || !sameIds(report.environmentBlockedCaseIds, expectedBlocks)
    || report.summary.total !== 15
    || report.summary.accepted !== 8
    || report.summary.canonicalConflicts !== 1
    || report.summary.environmentBlocked !== 6
    || report.summary.executorErrors !== 0
    || report.cleanupEvidence.residueFree !== true
    || report.cleanupEvidence.ledgerEntries !== report.cleanupEvidence.residueVerified
    || !allResidueZero
    || Object.values(report.cleanupEvidence.lateUiResidueDeleted).flat().length !== 2
    || Boolean(report.cleanupEvidence.cleanupDiagnostic)
    || report.mutationIntents.length !== 7
    || report.mutationIntents.some((entry) => (
      !entry.identity.startsWith('AUTO_AUDIT_')
      || entry.phase !== 'cleanup-complete'
      || !['present', 'absent'].includes(entry.reconciliation ?? '')
      || entry.serverId === undefined
    ))) {
    throw new Error('Y3-B3 runtime 证据、阻断分类或零残留门禁不满足');
  }
  const semanticValue = {
    runId: report.runId,
    batchId: report.batchId,
    source: {
      reportPath: relativePath(projectRoot, reportPath),
      reportSha256: sha256File(reportPath),
    },
    summary: {
      total: 15,
      accepted: 8,
      canonicalConflicts: 1,
      environmentBlocked: 6,
      executorErrors: 0,
      generationPromotable: 8,
      canonicalRepairRequired: 1,
      environmentAdapterRequired: 6,
      humanReviewRequired: 0,
      mutationIntents: report.mutationIntents.length,
      ledgerResidueVerified: report.cleanupEvidence.residueVerified,
      lateUiResidueDeleted: Object.values(report.cleanupEvidence.lateUiResidueDeleted).flat().length,
    },
    acceptedCaseIds: [...report.acceptedCaseIds].sort(),
    canonicalConflicts: expectedConflicts.map((caseId) => ({
      caseId,
      evidence: report.caseEvidence[caseId]?.evidence,
    })),
    environmentBlocks: expectedBlocks.map((caseId) => ({
      caseId,
      evidence: report.caseEvidence[caseId]?.evidence,
    })),
    policy: {
      runtimeEvidenceAccepted: true as const,
      canonicalConflictsDoNotFailHarness: true as const,
      environmentBlocksDoNotPromote: true as const,
      evidenceInheritanceAllowed: false as const,
      checkpointResumeAccepted: true as const,
      interruptedMutationReconciliationRequired: true as const,
      controlledMutationRequired: true as const,
      uiIdentityResidueVerificationRequired: true as const,
    },
  };
  const artifact = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-yellow-y3-b3-runtime-acceptance' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: 'accepted-with-blocks' as const,
    ...semanticValue,
    fingerprint: createHash('sha256').update(JSON.stringify(semanticValue)).digest('hex'),
  };
  const outputPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/runtime/product-center-item-yellow-y3-b3-runtime-acceptance.json',
  );
  writeJson(outputPath, artifact);
  return { artifact, outputPath };
}

function sameIds(actual: string[], expected: string[]): boolean {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

function findLatestReport(projectRoot: string): string {
  const directory = path.join(projectRoot, 'output/audit');
  const match = fs.readdirSync(directory)
    .filter((name) => /^product-center-item-yellow-y3-b3-runtime-AUTO_AUDIT_.*\.json$/.test(name))
    .map((name) => path.join(directory, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
  if (!match) throw new Error('未找到 Y3-B3 runtime 报告');
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
    const { artifact, outputPath } = buildProductCenterItemYellowY3B3RuntimeAcceptance();
    process.stdout.write(`Y3-B3 runtime acceptance 已生成：${outputPath}\n状态=${artifact.status}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
