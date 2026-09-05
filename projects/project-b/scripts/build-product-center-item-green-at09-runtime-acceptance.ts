import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type RuntimeReport = {
  runId: string;
  batchId: string;
  status: string;
  acceptedCaseIds: string[];
  canonicalConflictCaseIds: string[];
  caseEvidence: Record<string, { verdict: string; evidence: Record<string, unknown> }>;
  summary: { total: number; accepted: number; canonicalConflicts: number; executorErrors: number };
  cleanupEvidence: {
    apiItemResidue: Record<string, number>;
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

const expectedCaseIds = ['TC-ITEM-STD-020', 'TC-ITEM-STD-048', 'TC-ITEM-STD-050', 'TC-ITEM-STD-098'];

export function buildProductCenterItemGreenAt09RuntimeAcceptance(options: {
  projectRoot?: string;
  reportPath?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const reportPath = path.resolve(options.reportPath ?? findLatestReport(projectRoot));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as RuntimeReport;
  const evidence020 = report.caseEvidence['TC-ITEM-STD-020']?.evidence;
  const evidence048 = report.caseEvidence['TC-ITEM-STD-048']?.evidence;
  const evidence050 = report.caseEvidence['TC-ITEM-STD-050']?.evidence;
  const evidence098 = report.caseEvidence['TC-ITEM-STD-098']?.evidence;
  const residues = [report.cleanupEvidence.apiItemResidue, report.cleanupEvidence.uiItemResidue];
  const acceptedIds = [...report.acceptedCaseIds].sort();
  if (!report.runId.startsWith('AUTO_AUDIT_')
    || report.batchId !== 'GREEN-AT09'
    || report.status !== 'accepted'
    || JSON.stringify(acceptedIds) !== JSON.stringify(expectedCaseIds)
    || report.canonicalConflictCaseIds.length !== 0
    || report.summary.total !== 4
    || report.summary.accepted !== 4
    || report.summary.canonicalConflicts !== 0
    || report.summary.executorErrors !== 0
    || report.executionDiagnostic
    || report.cleanupEvidence.residueFree !== true
    || report.cleanupEvidence.ledgerEntries !== 3
    || report.cleanupEvidence.residueVerified !== 3
    || residues.some((residue) => Object.values(residue).some((count) => count !== 0))
    || Boolean(report.cleanupEvidence.cleanupDiagnostic)
    || report.mutationIntents.length !== 3
    || report.mutationIntents.some((intent) => intent.phase !== 'cleanup-complete'
      || intent.reconciliation !== 'present'
      || !intent.identity.startsWith('AUTO_AUDIT_'))
    || evidence020?.priceBeforeSave !== '1.99'
    || evidence020?.listPrice !== 1.99
    || !acceptedResponse(evidence020)
    || evidence048?.createEntryCount !== 1
    || evidence048?.newPagePath !== '/pp/brand/spec/create'
    || evidence048?.newPageClosed !== true
    || evidence048?.expectedSatisfied !== true
    || evidence050?.packagingFeeBeforeSave !== '1.00'
    || evidence050?.reopenedPackagingFee !== '1.00'
    || !acceptedResponse(evidence050)
    || evidence098?.costBeforeSave !== '5.00'
    || evidence098?.reopenedCost !== '5.00'
    || !acceptedResponse(evidence098)
    || Object.values(report.security).some(Boolean)) {
    throw new Error('GREEN-AT09 runtime 证据或零残留门禁不满足');
  }
  const acceptedEvidence = expectedCaseIds.map((caseId) => ({
    caseId,
    evidence: report.caseEvidence[caseId]!.evidence,
  }));
  const semanticValue = {
    runId: report.runId,
    batchId: report.batchId,
    source: {
      reportPath: relativePath(projectRoot, reportPath),
      reportSha256: sha256File(reportPath),
    },
    summary: {
      total: 4,
      accepted: 4,
      canonicalConflicts: 0,
      executorErrors: 0,
      generationPromotable: 4,
      canonicalRepairRequired: 0,
      humanReviewRequired: 0,
      mutationIntents: 3,
      ledgerResidueVerified: 3,
    },
    acceptedCaseIds: expectedCaseIds,
    acceptedEvidence,
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
    collectionId: 'product-center-item-green-at09-runtime-acceptance' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: 'accepted' as const,
    ...semanticValue,
    fingerprint: createHash('sha256').update(JSON.stringify(semanticValue)).digest('hex'),
  };
  const outputPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/runtime/product-center-item-green-at09-runtime-acceptance.json',
  );
  writeJson(outputPath, artifact);
  return { artifact, outputPath };
}

function acceptedResponse(evidence: Record<string, unknown> | undefined): boolean {
  if (!evidence || evidence.expectedSatisfied !== true) return false;
  const response = evidence.response as { method?: string; path?: string; status?: number } | undefined;
  return response?.method === 'POST'
    && response.path?.endsWith('/ops-brand/brand-items/standard') === true
    && response.status === 200;
}

function findLatestReport(projectRoot: string): string {
  const directory = path.join(projectRoot, 'output/audit');
  const match = fs.readdirSync(directory)
    .filter((name) => /^product-center-item-green-at09-runtime-AUTO_AUDIT_.*\.json$/.test(name))
    .map((name) => path.join(directory, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
  if (!match) throw new Error('未找到 GREEN-AT09 runtime 报告');
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
    const { artifact, outputPath } = buildProductCenterItemGreenAt09RuntimeAcceptance();
    process.stdout.write(`GREEN-AT09 runtime acceptance 已生成：${outputPath}\n状态=${artifact.status}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
