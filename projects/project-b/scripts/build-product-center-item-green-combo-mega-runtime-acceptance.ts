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
    apiComboResidue: Record<string, number>;
    apiCategoryResidue: Record<string, number>;
    uiItemResidue: Record<string, number>;
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
  'TC-ITEM-PKG-011', 'TC-ITEM-PKG-018', 'TC-ITEM-PKG-029', 'TC-ITEM-PKG-031',
  'TC-ITEM-PKG-034', 'TC-ITEM-PKG-049', 'TC-ITEM-PKG-055', 'TC-ITEM-PKG-058',
  'TC-ITEM-PKG-061', 'TC-ITEM-PKG-062',
];
const canonicalConflictCaseIds = [
  'TC-ITEM-PKG-005', 'TC-ITEM-PKG-012', 'TC-ITEM-PKG-021', 'TC-ITEM-PKG-022',
  'TC-ITEM-PKG-023', 'TC-ITEM-PKG-027', 'TC-ITEM-PKG-030', 'TC-ITEM-PKG-033',
  'TC-ITEM-PKG-050', 'TC-ITEM-PKG-052', 'TC-ITEM-PKG-053', 'TC-ITEM-PKG-063',
  'TC-ITEM-PKG-064', 'TC-ITEM-PKG-065', 'TC-ITEM-PKG-067', 'TC-ITEM-PKG-068',
];
const environmentBlockedCaseIds = ['TC-ITEM-PKG-028', 'TC-ITEM-PKG-032'];

export function buildProductCenterItemGreenComboMegaRuntimeAcceptance(options: {
  projectRoot?: string;
  reportPath?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const reportPath = path.resolve(options.reportPath ?? findLatestReport(projectRoot));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as RuntimeReport;
  const residues = [
    report.cleanupEvidence.apiItemResidue,
    report.cleanupEvidence.apiComboResidue,
    report.cleanupEvidence.apiCategoryResidue,
    report.cleanupEvidence.uiItemResidue,
  ];
  if (!report.runId.startsWith('AUTO_AUDIT_')
    || report.batchId !== 'GREEN-COMBO-MEGA'
    || report.status !== 'accepted-with-dispositions'
    || report.summary.total !== 28
    || report.summary.accepted !== 10
    || report.summary.canonicalConflicts !== 16
    || report.summary.environmentBlocked !== 2
    || report.summary.executorErrors !== 0
    || Boolean(report.executionDiagnostic)
    || !report.cleanupEvidence.residueFree
    || report.cleanupEvidence.ledgerEntries !== 39
    || report.cleanupEvidence.residueVerified !== 39
    || residues.some((residue) => Object.values(residue).some((count) => count !== 0))
    || Boolean(report.cleanupEvidence.cleanupDiagnostic)
    || report.mutationIntents.length !== 12
    || report.mutationIntents.some((intent) => intent.phase !== 'cleanup-complete' || !intent.identity.startsWith('AUTO_AUDIT_'))
    || Object.values(report.security).some(Boolean)
    || !caseSetMatches(report.acceptedCaseIds, acceptedCaseIds)
    || !caseSetMatches(report.canonicalConflictCaseIds, canonicalConflictCaseIds)
    || !caseSetMatches(report.environmentBlockedCaseIds, environmentBlockedCaseIds)
    || !verdictsMatch(report, acceptedCaseIds, 'accepted')
    || !verdictsMatch(report, canonicalConflictCaseIds, 'canonical-conflict')
    || !blockedEvidenceValid(report)) {
    throw new Error('GREEN-COMBO-MEGA runtime 证据或零残留门禁不满足');
  }

  const semanticValue = {
    runId: report.runId,
    batchId: report.batchId,
    source: { reportPath: relativePath(projectRoot, reportPath), reportSha256: sha256File(reportPath) },
    summary: {
      total: 28,
      runtimeEvidenceAccepted: 28,
      generationPromotable: 10,
      canonicalRepairRequired: 16,
      environmentAdapterRequired: 2,
      humanReviewRequired: 0,
      executorErrors: 0,
      mutationIntents: 12,
      ledgerResidueVerified: 39,
    },
    acceptedCaseIds,
    canonicalConflictCaseIds,
    environmentBlockedCaseIds,
    caseEvidence: report.caseEvidence,
    policy: {
      runtimeEvidenceAccepted: true as const,
      evidenceInheritanceAllowed: false as const,
      nonIdempotentReplayPerformedForDisposition: false as const,
      canonicalRepairBeforeGenerationRequired: true as const,
      blockedPromotionForbidden: true as const,
      humanCaseReviewRequired: false as const,
      uiAndApiResidueVerificationRequired: true as const,
    },
  };
  const artifact = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-green-combo-mega-runtime-acceptance' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: 'accepted-with-dispositions' as const,
    ...semanticValue,
    fingerprint: createHash('sha256').update(JSON.stringify(semanticValue)).digest('hex'),
  };
  const outputPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/runtime/product-center-item-green-combo-mega-runtime-acceptance.json',
  );
  writeJson(outputPath, artifact);
  return { artifact, outputPath };
}

function caseSetMatches(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && [...actual].sort().every((caseId, index) => caseId === [...expected].sort()[index]);
}

function verdictsMatch(report: RuntimeReport, caseIds: string[], verdict: Verdict): boolean {
  return caseIds.every((caseId) => report.caseEvidence[caseId]?.verdict === verdict);
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
    .filter((name) => /^product-center-item-green-combo-mega-runtime-AUTO_AUDIT_.*\.json$/.test(name))
    .map((name) => path.join(directory, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
  if (!match) throw new Error('未找到 GREEN-COMBO-MEGA runtime 报告');
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
    const { artifact, outputPath } = buildProductCenterItemGreenComboMegaRuntimeAcceptance();
    process.stdout.write(`GREEN-COMBO-MEGA runtime acceptance 已生成：${outputPath}\n状态=${artifact.status}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
