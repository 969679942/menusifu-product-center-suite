import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterGroupCaseFingerprintManifest,
  type ProductCenterGroupCaseFingerprint,
  type ProductCenterGroupCaseFingerprintBinding,
  type ProductCenterGroupCaseFingerprintManifest,
} from '../utils/product-center-group-case-fingerprint';

type RuntimeCase = {
  caseId: string;
  handlerId: string | null;
  bindingFingerprint: string;
  caseExecutionFingerprint: string | null;
};

type RuntimeReport = {
  caseExecutionManifest: ProductCenterGroupCaseFingerprintManifest;
  cases: RuntimeCase[];
  fingerprintMigration?: unknown;
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const reportPath = path.join(workspaceRoot, 'deliverables/product-center-group/runtime-report.json');
const bindingsPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json');

function main(): void {
  const impactedCaseIds = new Set(readRepeatedArgument('--impacted-case'));
  const changedSymbols = new Set(readRepeatedArgument('--changed-symbol'));
  if (impactedCaseIds.size === 0 || changedSymbols.size === 0) {
    throw new Error('指纹基线迁移必须显式提供 --impacted-case 和 --changed-symbol。');
  }

  const originalText = fs.readFileSync(reportPath, 'utf8');
  const report = JSON.parse(originalText) as RuntimeReport;
  if (report.fingerprintMigration) throw new Error('正式报告已执行过指纹基线迁移，禁止重复迁移。');
  const bindings = readJson<{ cases: ProductCenterGroupCaseFingerprintBinding[] }>(bindingsPath).cases;
  const current = buildProductCenterGroupCaseFingerprintManifest(projectRoot, bindings);
  const baselineByCaseId = new Map(report.caseExecutionManifest.cases.map((item) => [item.caseId, item]));
  const runtimeByCaseId = new Map(report.cases.map((item) => [item.caseId, item]));
  const migratedCases: ProductCenterGroupCaseFingerprint[] = [];
  const reusedCaseIds: string[] = [];

  for (const currentCase of current.cases) {
    if (impactedCaseIds.has(currentCase.caseId)) continue;
    const baselineCase = baselineByCaseId.get(currentCase.caseId);
    const runtimeCase = runtimeByCaseId.get(currentCase.caseId);
    if (!baselineCase || !runtimeCase) throw new Error(`迁移用例缺少正式基线证据：${currentCase.caseId}`);
    if (baselineCase.handlerId !== currentCase.handlerId || runtimeCase.handlerId !== currentCase.handlerId) {
      throw new Error(`迁移用例 handler 已变化：${currentCase.caseId}`);
    }
    if (baselineCase.bindingFingerprint !== currentCase.bindingFingerprint
      || runtimeCase.bindingFingerprint !== currentCase.bindingFingerprint) {
      throw new Error(`迁移用例绑定合同已变化：${currentCase.caseId}`);
    }
    const changedDependency = currentCase.dependencySymbols.find((item) => changedSymbols.has(item));
    if (changedDependency) {
      throw new Error(`迁移用例命中本次变更符号，必须重跑：${currentCase.caseId} -> ${changedDependency}`);
    }
    runtimeCase.caseExecutionFingerprint = currentCase.fingerprint;
    migratedCases.push(currentCase);
    reusedCaseIds.push(currentCase.caseId);
  }

  for (const caseId of impactedCaseIds) {
    if (!current.cases.some((item) => item.caseId === caseId)) throw new Error(`受影响用例不在当前可执行清单：${caseId}`);
  }

  const migratedAt = new Date().toISOString();
  const backupPath = path.join(
    path.dirname(reportPath),
    `runtime-report.pre-symbol-fingerprint-${migratedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}.json`,
  );
  fs.writeFileSync(backupPath, originalText, 'utf8');
  report.caseExecutionManifest = {
    ...current,
    generatedAt: migratedAt,
    cases: migratedCases.sort((left, right) => left.caseId.localeCompare(right.caseId)),
  };
  report.fingerprintMigration = {
    migratedAt,
    sourceReportSha256: createHash('sha256').update(originalText).digest('hex'),
    backupReport: path.relative(workspaceRoot, backupPath).replaceAll(path.sep, '/'),
    reason: 'coarse-class-fingerprint-to-symbol-runtime-fingerprint',
    impactedCaseIds: [...impactedCaseIds].sort(),
    changedSymbols: [...changedSymbols].sort(),
    reusedCaseCount: reusedCaseIds.length,
  };
  writeJson(reportPath, report);
  process.stdout.write(`${JSON.stringify(report.fingerprintMigration)}\n`);
}

function readRepeatedArgument(name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

main();
