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
  security: {
    credentialsPersisted: boolean;
    authorizationArtifactsPersisted: boolean;
    storageStatePersisted: boolean;
  };
};

const expectedConflicts = ['TC-ITEM-ADD-012', 'TC-ITEM-ADD-013'];

export function buildProductCenterItemYellowY3B4RuntimeAcceptance(options: {
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
    || report.batchId !== 'Y3-B4'
    || report.status !== 'accepted-with-canonical-conflicts'
    || report.acceptedCaseIds.length !== 0
    || !sameIds(report.canonicalConflictCaseIds, expectedConflicts)
    || report.summary.total !== 2
    || report.summary.accepted !== 0
    || report.summary.canonicalConflicts !== 2
    || report.summary.executorErrors !== 0
    || report.cleanupEvidence.residueFree !== true
    || report.cleanupEvidence.ledgerEntries !== 2
    || report.cleanupEvidence.residueVerified !== 2
    || !allResidueZero
    || Boolean(report.cleanupEvidence.cleanupDiagnostic)
    || report.mutationIntents.length !== 3
    || report.mutationIntents.some((entry) => (
      !entry.identity.startsWith('AUTO_AUDIT_')
      || entry.phase !== 'cleanup-complete'
      || !['present', 'absent'].includes(entry.reconciliation ?? '')
    ))
    || Object.values(report.security).some(Boolean)) {
    throw new Error('Y3-B4 runtime 规则证据或零残留门禁不满足');
  }
  const semanticValue = {
    runId: report.runId,
    batchId: report.batchId,
    source: {
      reportPath: relativePath(projectRoot, reportPath),
      reportSha256: sha256File(reportPath),
    },
    summary: {
      total: 2,
      accepted: 0,
      canonicalConflicts: 2,
      executorErrors: 0,
      generationPromotable: 0,
      canonicalRepairRequired: 2,
      humanReviewRequired: 0,
      mutationIntents: report.mutationIntents.length,
      ledgerResidueVerified: report.cleanupEvidence.residueVerified,
    },
    acceptedCaseIds: [] as string[],
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
      uiAndApiResidueVerificationRequired: true as const,
      humanCaseReviewRequired: false as const,
    },
  };
  const artifact = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-yellow-y3-b4-runtime-acceptance' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: 'accepted-with-canonical-conflicts' as const,
    ...semanticValue,
    fingerprint: createHash('sha256').update(JSON.stringify(semanticValue)).digest('hex'),
  };
  const outputPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/runtime/product-center-item-yellow-y3-b4-runtime-acceptance.json',
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
    .filter((name) => /^product-center-item-yellow-y3-b4-runtime-AUTO_AUDIT_.*\.json$/.test(name))
    .map((name) => path.join(directory, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
  if (!match) throw new Error('未找到 Y3-B4 runtime 报告');
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
    const { artifact, outputPath } = buildProductCenterItemYellowY3B4RuntimeAcceptance();
    process.stdout.write(`Y3-B4 runtime acceptance 已生成：${outputPath}\n状态=${artifact.status}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
