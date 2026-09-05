import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type RuntimeCase = {
  caseId: string;
  groupId: string;
  status: 'accepted' | 'canonical-conflict' | 'environment-blocked' | 'executor-error';
  reason?: string;
  evidence: Record<string, unknown>;
};

type RuntimeReport = {
  runId: string;
  status: string;
  cases: RuntimeCase[];
  summary: {
    recordedCases: number;
    accepted: number;
    'canonical-conflict': number;
    'environment-blocked': number;
    'executor-error': number;
    mutationCount: number;
  };
};

export function buildProductCenterItemYellowY1RuntimeAcceptance(options: {
  projectRoot?: string;
  reportPath?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const reportPath = path.resolve(options.reportPath ?? findLatestReport(projectRoot));
  const report = readJson<RuntimeReport>(reportPath);
  if (!report.runId.startsWith('AUTO_AUDIT_')) throw new Error('Y1 runtime runId 不符合审计身份门禁');
  if (report.summary.recordedCases !== 14
    || report.cases.length !== 14
    || report.summary['executor-error'] !== 0
    || report.summary.mutationCount !== 0) {
    throw new Error(`Y1 runtime 证据不完整或不安全：${JSON.stringify(report.summary)}`);
  }
  const acceptedCaseIds = report.cases.filter((item) => item.status === 'accepted').map((item) => item.caseId).sort();
  const canonicalConflictCases = report.cases.filter((item) => item.status === 'canonical-conflict')
    .map((item) => ({ caseId: item.caseId, groupId: item.groupId, reason: item.reason, evidence: item.evidence }));
  const environmentBlockedCaseIds = report.cases.filter((item) => item.status === 'environment-blocked')
    .map((item) => item.caseId)
    .sort();
  if (acceptedCaseIds.length !== 12
    || canonicalConflictCases.length !== 2
    || environmentBlockedCaseIds.length !== 0) {
    throw new Error('Y1 runtime 判定分母漂移');
  }
  const semanticValue = {
    runId: report.runId,
    source: {
      reportPath: relativePath(projectRoot, reportPath),
      reportSha256: sha256File(reportPath),
    },
    summary: {
      total: 14,
      accepted: acceptedCaseIds.length,
      canonicalConflicts: canonicalConflictCases.length,
      environmentBlocked: environmentBlockedCaseIds.length,
      executorErrors: 0,
      mutationCount: 0,
      generationPromotable: 0,
      exactTechnicalBindingRequired: 14,
    },
    acceptedCaseIds,
    canonicalConflictCases,
    environmentBlockedCaseIds,
    policy: {
      runtimeEvidenceAccepted: true as const,
      canonicalConflictsDoNotFailHarness: true as const,
      runtimeEvidenceDoesNotReplaceExactRecipeBinding: true as const,
      caseLevelEvidenceRequired: true as const,
      evidenceInheritanceAllowed: false as const,
    },
  };
  const artifact = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-yellow-y1-runtime-acceptance' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: 'accepted-with-canonical-conflicts' as const,
    ...semanticValue,
    fingerprint: hashValue(semanticValue),
  };
  const outputPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/runtime/product-center-item-yellow-y1-runtime-acceptance.json',
  );
  writeJson(outputPath, artifact);
  return { artifact, outputPath };
}

function findLatestReport(projectRoot: string): string {
  const directory = path.join(projectRoot, 'output/audit');
  const matches = fs.readdirSync(directory)
    .filter((name) => /^product-center-item-yellow-y1-runtime-AUTO_AUDIT_.*\.json$/.test(name))
    .map((name) => path.join(directory, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  if (!matches[0]) throw new Error('未找到 Y1 runtime 报告');
  return matches[0];
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
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

function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function relativePath(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).replace(/\\/g, '/');
}

if (require.main === module) {
  try {
    const { artifact, outputPath } = buildProductCenterItemYellowY1RuntimeAcceptance();
    process.stdout.write(`Y1 runtime acceptance 已生成：${outputPath}\n状态=${artifact.status}；accepted=${artifact.summary.accepted}/14\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
