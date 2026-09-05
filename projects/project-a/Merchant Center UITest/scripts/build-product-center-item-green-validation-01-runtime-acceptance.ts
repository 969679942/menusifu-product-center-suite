import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type CaseEvidence = { verdict: 'accepted' | 'canonical-conflict'; evidence: Record<string, unknown> };
type RuntimeReport = {
  runId: string;
  batchId: string;
  status: string;
  acceptedCaseIds: string[];
  canonicalConflictCaseIds: string[];
  caseEvidence: Record<string, CaseEvidence>;
  summary: { total: number; accepted: number; canonicalConflicts: number; executorErrors: number };
  cleanupEvidence: {
    apiItemResidue: Record<string, number>;
    apiCategoryResidue: Record<string, number>;
    apiTasteResidue: Record<string, number>;
    uiItemResidue: Record<string, number>;
    residueFree: boolean;
    ledgerEntries: number;
    residueVerified: number;
    cleanupDiagnostic?: string;
  };
  executionDiagnostic?: string;
  mutationIntents: Array<{
    entity: string;
    identity: string;
    phase: string;
    reconciliation?: string;
    serverId?: number | string;
  }>;
  security: Record<string, boolean>;
};

const expectedAccepted = [
  'TC-ITEM-STD-035',
  'TC-ITEM-STD-049',
  'TC-ITEM-STD-059',
  'TC-ITEM-STD-095',
];
const expectedConflicts = [
  'TC-ITEM-ADD-017',
  'TC-ITEM-STD-045',
  'TC-ITEM-STD-046',
  'TC-ITEM-STD-051',
  'TC-ITEM-STD-054',
  'TC-ITEM-STD-094',
  'TC-ITEM-STD-101',
];

export function buildProductCenterItemGreenValidation01RuntimeAcceptance(options: {
  projectRoot?: string;
  reportPath?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const reportPath = path.resolve(options.reportPath ?? findLatestReport(projectRoot));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as RuntimeReport;
  const residues = [
    report.cleanupEvidence.apiItemResidue,
    report.cleanupEvidence.apiCategoryResidue,
    report.cleanupEvidence.apiTasteResidue,
    report.cleanupEvidence.uiItemResidue,
  ];
  const accepted = [...report.acceptedCaseIds].sort();
  const conflicts = [...report.canonicalConflictCaseIds].sort();
  if (!report.runId.startsWith('AUTO_AUDIT_')
    || report.batchId !== 'GREEN-VALIDATION-01'
    || report.status !== 'accepted-with-canonical-conflicts'
    || JSON.stringify(accepted) !== JSON.stringify(expectedAccepted)
    || JSON.stringify(conflicts) !== JSON.stringify(expectedConflicts)
    || report.summary.total !== 11
    || report.summary.accepted !== 4
    || report.summary.canonicalConflicts !== 7
    || report.summary.executorErrors !== 0
    || Boolean(report.executionDiagnostic)
    || report.cleanupEvidence.residueFree !== true
    || report.cleanupEvidence.ledgerEntries !== report.cleanupEvidence.residueVerified
    || residues.some((residue) => Object.values(residue).some((count) => count !== 0))
    || Boolean(report.cleanupEvidence.cleanupDiagnostic)
    || report.mutationIntents.length !== 10
    || report.mutationIntents.some((intent) => intent.phase !== 'cleanup-complete'
      || !intent.identity.startsWith('AUTO_AUDIT_'))
    || Object.values(report.security).some(Boolean)
    || !acceptedEvidenceValid(report)
    || !conflictEvidenceValid(report)) {
    throw new Error('GREEN-VALIDATION-01 runtime 证据、冲突分类或零残留门禁不满足');
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
      runtimeEvidenceAccepted: 11,
      generationPromotable: 4,
      canonicalRepairRequired: 7,
      humanReviewRequired: 0,
      executorErrors: 0,
      mutationIntents: report.mutationIntents.length,
      ledgerResidueVerified: report.cleanupEvidence.residueVerified,
    },
    acceptedCaseIds: expectedAccepted,
    canonicalConflictCaseIds: expectedConflicts,
    caseEvidence: Object.fromEntries([...expectedAccepted, ...expectedConflicts].map((caseId) => [
      caseId,
      report.caseEvidence[caseId],
    ])),
    policy: {
      runtimeEvidenceAccepted: true as const,
      evidenceInheritanceAllowed: false as const,
      checkpointResumeAccepted: true as const,
      interruptedMutationReconciliationRequired: true as const,
      controlledMutationRequired: true as const,
      uiAndApiResidueVerificationRequired: true as const,
      canonicalRepairBeforeGenerationRequired: true as const,
      humanCaseReviewRequired: false as const,
    },
  };
  const artifact = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-green-validation-01-runtime-acceptance' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: 'accepted-with-canonical-conflicts' as const,
    ...semanticValue,
    fingerprint: createHash('sha256').update(JSON.stringify(semanticValue)).digest('hex'),
  };
  const outputPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/runtime/product-center-item-green-validation-01-runtime-acceptance.json',
  );
  writeJson(outputPath, artifact);
  return { artifact, outputPath };
}

function acceptedEvidenceValid(report: RuntimeReport): boolean {
  if (expectedAccepted.some((caseId) => report.caseEvidence[caseId]?.verdict !== 'accepted'
    || report.caseEvidence[caseId]?.evidence.expectedSatisfied !== true)) return false;
  const weight = report.caseEvidence['TC-ITEM-STD-049'].evidence.weight as Record<string, unknown>;
  const rounding = report.caseEvidence['TC-ITEM-STD-095'].evidence.values as Array<Record<string, unknown>>;
  const controls = report.caseEvidence['TC-ITEM-STD-059'].evidence.controls as Record<string, unknown>;
  return weight.disabled === true
    && rounding?.[0]?.listPrice === 10.24
    && rounding?.[1]?.listPrice === 10.23
    && controls.addChildControlCount === 0;
}

function conflictEvidenceValid(report: RuntimeReport): boolean {
  if (expectedConflicts.some((caseId) => report.caseEvidence[caseId]?.verdict !== 'canonical-conflict'
    || report.caseEvidence[caseId]?.evidence.expectedSatisfied !== false)) return false;
  const mnemonic = report.caseEvidence['TC-ITEM-STD-046'].evidence;
  const device = report.caseEvidence['TC-ITEM-STD-101'].evidence;
  const pos = report.caseEvidence['TC-ITEM-STD-094'].evidence;
  const price = report.caseEvidence['TC-ITEM-STD-051'].evidence;
  const description = report.caseEvidence['TC-ITEM-STD-045'].evidence;
  const standardImages = report.caseEvidence['TC-ITEM-STD-054'].evidence;
  const sideImages = report.caseEvidence['TC-ITEM-ADD-017'].evidence;
  const summaries = standardImages.uploadResponseSummaries as Array<Record<string, unknown>>;
  const eleventh = standardImages.eleventh as Record<string, unknown>;
  const sideSummaries = sideImages.uploadResponseSummaries as Array<Record<string, unknown>>;
  return readResponseStatus(mnemonic) === 200
    && readFieldValue(mnemonic).length === 20
    && readResponseStatus(device) === 200
    && readFieldValue(device).length === 20
    && readResponseStatus(pos) === 200
    && readResponseStatus(price) === 200
    && (description.boundary as Record<string, unknown>)?.maxLengthAttribute === 100
    && summaries?.length === 10
    && summaries.every((summary) => summary.businessCode === '0' && summary.imageReferenceCount === 1)
    && eleventh.requestObserved === true
    && eleventh.responseStatus === 200
    && standardImages.finalCount === 0
    && sideSummaries?.length === 10
    && sideImages.responseStatus === 200
    && sideImages.reopenedCount === 0;
}

function readResponseStatus(evidence: Record<string, unknown>): unknown {
  return (evidence.response as Record<string, unknown> | undefined)?.status;
}

function readFieldValue(evidence: Record<string, unknown>): string {
  return String((evidence.fieldBeforeSave as Record<string, unknown> | undefined)?.value ?? '');
}

function findLatestReport(projectRoot: string): string {
  const directory = path.join(projectRoot, 'output/audit');
  const match = fs.readdirSync(directory)
    .filter((name) => /^product-center-item-green-validation-01-runtime-AUTO_AUDIT_.*\.json$/.test(name))
    .map((name) => path.join(directory, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
  if (!match) throw new Error('未找到 GREEN-VALIDATION-01 runtime 报告');
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
    const { artifact, outputPath } = buildProductCenterItemGreenValidation01RuntimeAcceptance();
    process.stdout.write(`GREEN-VALIDATION-01 runtime acceptance 已生成：${outputPath}\n状态=${artifact.status}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
