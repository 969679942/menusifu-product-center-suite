import fs from 'node:fs';
import path from 'node:path';
import {
  reconcileProductCenterRuntimeAudit,
  type ProductCenterRuntimeAuditableCase,
} from '../utils/product-center-runtime-audit-correction';

type CaseDocument = {
  cases: ProductCenterRuntimeAuditableCase[];
  [key: string]: unknown;
};

export function reconcileProductCenterRuntimeAuditFile(input: {
  casesPath: string;
  auditPath: string;
  outputPath: string;
  rootDir?: string;
}) {
  const casesPath = path.resolve(input.casesPath);
  const auditPath = path.resolve(input.auditPath);
  const outputPath = path.resolve(input.outputPath);
  const cases = readJson<CaseDocument>(casesPath);
  const audit = readJson(auditPath);
  const result = reconcileProductCenterRuntimeAudit(cases.cases, audit, {
    rootDir: path.resolve(input.rootDir ?? path.dirname(casesPath)),
  });
  const output = {
    ...cases,
    cases: result.cases,
    runtimeAudit: {
      source: path.basename(auditPath),
      status: result.status,
      corrections: result.corrections,
      businessRuleChanges: result.businessRuleChanges,
      technicalBindingChanges: result.technicalBindingChanges,
      coverageChanges: result.coverageChanges,
      evidence: result.evidence,
      issues: result.issues,
    },
  };
  writeJson(outputPath, output);
  if (result.status !== 'passed') {
    throw new Error(`运行时审计校正未通过：${result.issues.map((item) => `${item.caseId}:${item.message}`).join('；')}`);
  }
  return { outputPath, status: result.status, corrections: result.corrections };
}

function readJson<T = unknown>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function readOption(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`${name} 缺少路径`);
  return value;
}

function readOptional(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : undefined;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const result = reconcileProductCenterRuntimeAuditFile({
      casesPath: readOption(args, '--cases'),
      auditPath: readOption(args, '--audit'),
      outputPath: readOption(args, '--output'),
      rootDir: readOptional(args, '--root'),
    });
    process.stdout.write(`运行时审计校正已完成：${result.outputPath}\n校正数量：${result.corrections.length}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
