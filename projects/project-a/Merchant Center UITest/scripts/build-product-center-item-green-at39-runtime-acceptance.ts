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
    apiComboResidue: Record<string, number>;
    uiItemResidue: Record<string, number>;
    residueFree: boolean;
    ledgerEntries: number;
    residueVerified: number;
    cleanupDiagnostic?: string;
  };
  executionDiagnostic?: string;
  mutationIntents: Array<{ identity: string; phase: string; reconciliation?: string; serverId?: number | string }>;
  security: Record<string, boolean>;
};

const expectedCaseId = 'TC-ITEM-PKG-016';

export function buildProductCenterItemGreenAt39RuntimeAcceptance(options: {
  projectRoot?: string;
  reportPath?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const reportPath = path.resolve(options.reportPath ?? findLatestReport(projectRoot));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as RuntimeReport;
  const evidence = report.caseEvidence[expectedCaseId]?.evidence as {
    valueBeforeSave?: string;
    response?: { method?: string; path?: string; status?: number };
    successMessageCount?: number;
    locatorCount?: number;
    listPrice?: number;
    reopenedMinimumOrderQuantity?: string;
    expectedSatisfied?: boolean;
  } | undefined;
  const residues = [
    report.cleanupEvidence.apiItemResidue,
    report.cleanupEvidence.apiComboResidue,
    report.cleanupEvidence.uiItemResidue,
  ];
  if (!report.runId.startsWith('AUTO_AUDIT_')
    || report.batchId !== 'GREEN-AT39'
    || report.status !== 'accepted'
    || JSON.stringify(report.acceptedCaseIds) !== JSON.stringify([expectedCaseId])
    || report.canonicalConflictCaseIds.length !== 0
    || report.summary.total !== 1
    || report.summary.accepted !== 1
    || report.summary.canonicalConflicts !== 0
    || report.summary.executorErrors !== 0
    || report.executionDiagnostic
    || report.cleanupEvidence.residueFree !== true
    || report.cleanupEvidence.ledgerEntries !== 5
    || report.cleanupEvidence.residueVerified !== 5
    || residues.some((residue) => Object.values(residue).some((count) => count !== 0))
    || Boolean(report.cleanupEvidence.cleanupDiagnostic)
    || report.mutationIntents.length !== 1
    || report.mutationIntents[0]?.phase !== 'cleanup-complete'
    || report.mutationIntents[0]?.reconciliation !== 'present'
    || !report.mutationIntents[0]?.identity.startsWith('AUTO_AUDIT_')
    || evidence?.valueBeforeSave !== '2'
    || evidence.response?.method !== 'POST'
    || !evidence.response.path?.endsWith('/ops-brand/brand-items/combo')
    || evidence.response.status !== 200
    || evidence.successMessageCount !== 1
    || evidence.locatorCount !== 1
    || evidence.listPrice !== 10
    || evidence.reopenedMinimumOrderQuantity !== '2'
    || evidence.expectedSatisfied !== true
    || Object.values(report.security).some(Boolean)) {
    throw new Error('GREEN-AT39 runtime MOQ 证据或零残留门禁不满足');
  }
  const semanticValue = {
    runId: report.runId,
    batchId: report.batchId,
    source: {
      reportPath: relativePath(projectRoot, reportPath),
      reportSha256: sha256File(reportPath),
    },
    summary: {
      total: 1,
      accepted: 1,
      canonicalConflicts: 0,
      executorErrors: 0,
      generationPromotable: 1,
      canonicalRepairRequired: 0,
      humanReviewRequired: 0,
      mutationIntents: 1,
      ledgerResidueVerified: 5,
    },
    acceptedCaseIds: [expectedCaseId],
    acceptedEvidence: [{ caseId: expectedCaseId, evidence }],
    policy: {
      runtimeEvidenceAccepted: true as const,
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
    collectionId: 'product-center-item-green-at39-runtime-acceptance' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: 'accepted' as const,
    ...semanticValue,
    fingerprint: createHash('sha256').update(JSON.stringify(semanticValue)).digest('hex'),
  };
  const outputPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/runtime/product-center-item-green-at39-runtime-acceptance.json',
  );
  writeJson(outputPath, artifact);
  return { artifact, outputPath };
}

function findLatestReport(projectRoot: string): string {
  const directory = path.join(projectRoot, 'output/audit');
  const match = fs.readdirSync(directory)
    .filter((name) => /^product-center-item-green-at39-runtime-AUTO_AUDIT_.*\.json$/.test(name))
    .map((name) => path.join(directory, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
  if (!match) throw new Error('未找到 GREEN-AT39 runtime 报告');
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
    const { artifact, outputPath } = buildProductCenterItemGreenAt39RuntimeAcceptance();
    process.stdout.write(`GREEN-AT39 runtime acceptance 已生成：${outputPath}\n状态=${artifact.status}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
