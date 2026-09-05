import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type Verdict = 'accepted' | 'canonical-conflict' | 'environment-blocked';
type CaseEvidence = { verdict: Verdict; evidence: Record<string, unknown> };
type RuntimeReport = {
  runId: string;
  batchId: string;
  status: string;
  acceptedCaseIds: string[];
  canonicalConflictCaseIds: string[];
  environmentBlockedCaseIds: string[];
  caseEvidence: Record<string, CaseEvidence>;
  summary: { total: number; accepted: number; canonicalConflicts: number; environmentBlocked: number; executorErrors: number };
  cleanupEvidence: {
    apiItemResidue: Record<string, number>;
    apiCategoryResidue: Record<string, number>;
    uiItemResidue: Record<string, number>;
    preferenceResidueFree: boolean;
    residueFree: boolean;
    ledgerEntries: number;
    residueVerified: number;
    cleanupDiagnostic?: string;
  };
  executionDiagnostic?: string;
  mutationIntents: Array<{ identity: string; phase: string }>;
  security: Record<string, boolean>;
};

const acceptedCaseIds = [
  'TC-ITEM-STD-006',
  'TC-ITEM-STD-042',
  'TC-ITEM-STD-053',
  'TC-ITEM-STD-055',
  'TC-ITEM-STD-063',
  'TC-ITEM-STD-065',
  'TC-ITEM-STD-100',
];
const canonicalConflictCaseIds = [
  'TC-ITEM-STD-003',
  'TC-ITEM-STD-004',
  'TC-ITEM-STD-009',
  'TC-ITEM-STD-052',
  'TC-ITEM-STD-072',
  'TC-ITEM-STD-073',
  'TC-ITEM-STD-099',
];
const environmentBlockedCaseIds = [
  'TC-ITEM-STD-033',
  'TC-ITEM-STD-034',
  'TC-ITEM-STD-056',
];
const evidenceReclassifiedCaseIds = [
  'TC-ITEM-STD-003',
  'TC-ITEM-STD-004',
  'TC-ITEM-STD-052',
  'TC-ITEM-STD-072',
  'TC-ITEM-STD-073',
];

export function buildProductCenterItemGreenStandardMegaRuntimeAcceptance(options: {
  projectRoot?: string;
  reportPath?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const reportPath = path.resolve(options.reportPath ?? findLatestReport(projectRoot));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as RuntimeReport;
  const residues = [report.cleanupEvidence.apiItemResidue, report.cleanupEvidence.apiCategoryResidue, report.cleanupEvidence.uiItemResidue];
  if (!report.runId.startsWith('AUTO_AUDIT_')
    || report.batchId !== 'GREEN-STANDARD-MEGA'
    || report.status !== 'accepted-with-dispositions'
    || report.summary.total !== 17
    || report.summary.accepted !== 7
    || report.summary.canonicalConflicts !== 2
    || report.summary.environmentBlocked !== 8
    || report.summary.executorErrors !== 0
    || Boolean(report.executionDiagnostic)
    || !report.cleanupEvidence.residueFree
    || !report.cleanupEvidence.preferenceResidueFree
    || report.cleanupEvidence.ledgerEntries !== 18
    || report.cleanupEvidence.residueVerified !== 18
    || residues.some((residue) => Object.values(residue).some((count) => count !== 0))
    || Boolean(report.cleanupEvidence.cleanupDiagnostic)
    || report.mutationIntents.length !== 13
    || report.mutationIntents.some((intent) => intent.phase !== 'cleanup-complete' || !intent.identity.startsWith('AUTO_AUDIT_'))
    || Object.values(report.security).some(Boolean)
    || !acceptedEvidenceValid(report)
    || !conflictEvidenceValid(report)
    || !blockedEvidenceValid(report)) {
    throw new Error('GREEN-STANDARD-MEGA runtime 证据、重分类或零残留门禁不满足');
  }

  const normalizedEvidence = Object.fromEntries([
    ...acceptedCaseIds.map((caseId) => [caseId, report.caseEvidence[caseId]] as const),
    ...canonicalConflictCaseIds.map((caseId) => [caseId, {
      ...report.caseEvidence[caseId],
      verdict: 'canonical-conflict' as const,
      evidence: {
        ...report.caseEvidence[caseId].evidence,
        ...(evidenceReclassifiedCaseIds.includes(caseId) ? { runtimeDispositionReclassifiedFrom: 'environment-blocked' } : {}),
      },
    }] as const),
    ...environmentBlockedCaseIds.map((caseId) => [caseId, report.caseEvidence[caseId]] as const),
  ]);
  const semanticValue = {
    runId: report.runId,
    batchId: report.batchId,
    source: { reportPath: relativePath(projectRoot, reportPath), reportSha256: sha256File(reportPath) },
    summary: {
      total: 17,
      runtimeEvidenceAccepted: 17,
      generationPromotable: 7,
      canonicalRepairRequired: 7,
      environmentAdapterRequired: 3,
      humanReviewRequired: 0,
      executorErrors: 0,
      mutationIntents: 13,
      ledgerResidueVerified: 18,
    },
    acceptedCaseIds,
    canonicalConflictCaseIds,
    environmentBlockedCaseIds,
    evidenceReclassifiedCaseIds,
    caseEvidence: normalizedEvidence,
    policy: {
      runtimeEvidenceAccepted: true as const,
      evidenceInheritanceAllowed: false as const,
      nonIdempotentReplayPerformedForReclassification: false as const,
      canonicalRepairBeforeGenerationRequired: true as const,
      blockedPromotionForbidden: true as const,
      humanCaseReviewRequired: false as const,
      uiApiAndPreferenceResidueVerificationRequired: true as const,
    },
  };
  const artifact = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-green-standard-mega-runtime-acceptance' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: 'accepted-with-dispositions' as const,
    ...semanticValue,
    fingerprint: createHash('sha256').update(JSON.stringify(semanticValue)).digest('hex'),
  };
  const outputPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/runtime/product-center-item-green-standard-mega-runtime-acceptance.json',
  );
  writeJson(outputPath, artifact);
  return { artifact, outputPath };
}

function acceptedEvidenceValid(report: RuntimeReport): boolean {
  if (acceptedCaseIds.some((caseId) => report.caseEvidence[caseId]?.verdict !== 'accepted')) return false;
  return report.caseEvidence['TC-ITEM-STD-006'].evidence.persistedPath !== ''
    && report.caseEvidence['TC-ITEM-STD-042'].evidence.expanded === true
    && (report.caseEvidence['TC-ITEM-STD-053'].evidence.persistedImageCount as number) > 0
    && (report.caseEvidence['TC-ITEM-STD-055'].evidence.persisted as unknown[])?.length === 2
    && (report.caseEvidence['TC-ITEM-STD-063'].evidence.observations as unknown[])?.length === 4
    && (report.caseEvidence['TC-ITEM-STD-065'].evidence.enabled as Record<string, unknown>)?.uiStatus !== ''
    && (report.caseEvidence['TC-ITEM-STD-100'].evidence.persisted as unknown[])?.length === 2;
}

function conflictEvidenceValid(report: RuntimeReport): boolean {
  if (['TC-ITEM-STD-009', 'TC-ITEM-STD-099'].some((caseId) => report.caseEvidence[caseId]?.verdict !== 'canonical-conflict')) return false;
  if (evidenceReclassifiedCaseIds.some((caseId) => report.caseEvidence[caseId]?.verdict !== 'environment-blocked')) return false;
  const formatted = report.caseEvidence['TC-ITEM-STD-009'].evidence.persisted as Record<string, unknown>;
  const corner = report.caseEvidence['TC-ITEM-STD-099'].evidence;
  const headers = report.caseEvidence['TC-ITEM-STD-072'].evidence.visibleHeaders as unknown[];
  return String(formatted.posName).includes('!@#$')
    && String(formatted.kitchenName).includes('!@#$')
    && (corner.persisted as unknown[])?.length === 0
    && corner.responseStatus === 200
    && report.caseEvidence['TC-ITEM-STD-003'].evidence.available === false
    && report.caseEvidence['TC-ITEM-STD-004'].evidence.available === false
    && report.caseEvidence['TC-ITEM-STD-052'].evidence.available === false
    && headers?.length === 18
    && report.caseEvidence['TC-ITEM-STD-073'].evidence.available === false;
}

function blockedEvidenceValid(report: RuntimeReport): boolean {
  return environmentBlockedCaseIds.every((caseId) => (
    report.caseEvidence[caseId]?.verdict === 'environment-blocked'
      && typeof report.caseEvidence[caseId].evidence.blockReason === 'string'
      && String(report.caseEvidence[caseId].evidence.blockReason).length > 0
  ));
}

function findLatestReport(projectRoot: string): string {
  const directory = path.join(projectRoot, 'output/audit');
  const match = fs.readdirSync(directory)
    .filter((name) => /^product-center-item-green-standard-mega-runtime-AUTO_AUDIT_.*\.json$/.test(name))
    .map((name) => path.join(directory, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
  if (!match) throw new Error('未找到 GREEN-STANDARD-MEGA runtime 报告');
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
    const { artifact, outputPath } = buildProductCenterItemGreenStandardMegaRuntimeAcceptance();
    process.stdout.write(`GREEN-STANDARD-MEGA runtime acceptance 已生成：${outputPath}\n状态=${artifact.status}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
