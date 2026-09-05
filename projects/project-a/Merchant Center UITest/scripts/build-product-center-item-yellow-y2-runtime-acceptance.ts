import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type RuntimeReport = {
  runId: string;
  caseId: string;
  status: 'accepted' | 'canonical-conflict' | 'executor-error';
  reason?: string;
  update?: { method: string; path: string; status: number };
  conflictState?: { checked: boolean; disabled: boolean; ariaDisabled: string };
  residueVerified: boolean;
  ledger: Array<{ entityKind: string; serverId: number | string; identity: string; phase: string }>;
};

export function buildProductCenterItemYellowY2RuntimeAcceptance(options: {
  projectRoot?: string;
  reportPath?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const reportPath = path.resolve(options.reportPath ?? findLatestReport(projectRoot));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as RuntimeReport;
  if (!report.runId.startsWith('AUTO_AUDIT_')) throw new Error('Y2 runtime runId 不符合审计身份门禁');
  if (report.caseId !== 'TC-ITEM-STD-061'
    || report.status !== 'canonical-conflict'
    || report.update?.method !== 'PUT'
    || !/\/ops-brand\/brand-items\/standard\/\d+$/.test(report.update.path)
    || report.update.status !== 200
    || report.conflictState?.disabled !== false
    || report.conflictState.ariaDisabled !== ''
    || report.residueVerified !== true
    || report.ledger.length !== 3
    || report.ledger.some((entry) => entry.phase !== 'residue-verified')) {
    throw new Error('Y2 runtime 证据、更新终态或零残留门禁不满足');
  }
  const semanticValue = {
    runId: report.runId,
    caseId: report.caseId,
    source: {
      reportPath: relativePath(projectRoot, reportPath),
      reportSha256: sha256File(reportPath),
    },
    summary: {
      total: 1,
      accepted: 0,
      canonicalConflicts: 1,
      executorErrors: 0,
      createdServerObjects: report.ledger.length,
      residueVerified: report.ledger.length,
      generationPromotable: 0,
      exactTechnicalBindingRequired: 1,
    },
    conflict: {
      reason: report.reason,
      update: report.update,
      conflictState: report.conflictState,
    },
    policy: {
      runtimeEvidenceAccepted: true as const,
      canonicalConflictsDoNotFailHarness: true as const,
      runtimeEvidenceDoesNotReplaceExactRecipeBinding: true as const,
      controlledMutationRequired: true as const,
      residueVerificationRequired: true as const,
    },
  };
  const artifact = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-yellow-y2-runtime-acceptance' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: 'accepted-with-canonical-conflict' as const,
    ...semanticValue,
    fingerprint: createHash('sha256').update(JSON.stringify(semanticValue)).digest('hex'),
  };
  const outputPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/runtime/product-center-item-yellow-y2-runtime-acceptance.json',
  );
  writeJson(outputPath, artifact);
  return { artifact, outputPath };
}

function findLatestReport(projectRoot: string): string {
  const directory = path.join(projectRoot, 'output/audit');
  const match = fs.readdirSync(directory)
    .filter((name) => /^product-center-item-yellow-y2-runtime-AUTO_AUDIT_.*\.json$/.test(name))
    .map((name) => path.join(directory, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
  if (!match) throw new Error('未找到 Y2 runtime 报告');
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
    const { artifact, outputPath } = buildProductCenterItemYellowY2RuntimeAcceptance();
    process.stdout.write(`Y2 runtime acceptance 已生成：${outputPath}\n状态=${artifact.status}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
