import fs from 'node:fs';
import path from 'node:path';
import {
  planAllureResultRetention,
  type AllureResultFile,
  type AllureRetentionPolicy,
} from '../utils/allure-result-retention';

const projectRoot = path.resolve(__dirname, '..');
const allureRoot = path.resolve(projectRoot, 'allure-results');
const reportPath = path.resolve(projectRoot, 'output/maintenance/allure-retention-latest.json');

function main(): void {
  const options = parseArguments(process.argv.slice(2));
  assertManagedRoot(allureRoot);
  const files = collectFiles(allureRoot);
  const plan = planAllureResultRetention(files, new Date(), options.policy);
  let deletedFiles = 0;
  let deletedBytes = 0;

  if (options.apply) {
    for (const file of plan.deleteFiles) {
      const target = path.resolve(allureRoot, file.relativePath);
      assertManagedFile(target);
      fs.rmSync(target, { force: true });
      deletedFiles += 1;
      deletedBytes += file.sizeBytes;
    }
    pruneEmptyDirectories(allureRoot);
  }

  const remaining = collectFiles(allureRoot);
  const report = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    mode: options.apply ? 'apply' : 'dry-run',
    root: 'allure-results',
    policy: plan.policy,
    before: {
      files: plan.totalFiles,
      bytes: plan.totalBytes,
    },
    candidates: {
      days: plan.deleteDays,
      files: plan.deleteFiles.length,
      bytes: plan.deleteBytes,
    },
    deleted: {
      files: deletedFiles,
      bytes: deletedBytes,
    },
    plannedAfter: {
      files: plan.remainingFiles,
      bytes: plan.remainingBytes,
    },
    actualAfter: {
      files: remaining.length,
      bytes: remaining.reduce((sum, file) => sum + file.sizeBytes, 0),
    },
    plannedLimitSatisfied: plan.limitSatisfied,
    limitSatisfied: options.apply
      ? remaining.length <= plan.policy.maxFiles
        && remaining.reduce((sum, file) => sum + file.sizeBytes, 0) <= plan.policy.maxBytes
      : null,
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`Allure 保留治理：${report.mode};候选=${report.candidates.files};已删除=${deletedFiles};剩余=${report.actualAfter.files}\n`);
  process.stdout.write(`Allure 保留报告：${reportPath}\n`);
}

function parseArguments(args: readonly string[]): {
  apply: boolean;
  policy: Partial<AllureRetentionPolicy>;
} {
  const policy: Partial<AllureRetentionPolicy> = {};
  for (const argument of args) {
    if (argument === '--apply') continue;
    const [key, rawValue] = argument.split('=', 2);
    const value = Number(rawValue);
    if (key === '--retain-days') policy.retainDays = value;
    else if (key === '--max-files') policy.maxFiles = value;
    else if (key === '--max-bytes') policy.maxBytes = value;
    else throw new Error(`未知 Allure 治理参数：${argument}`);
  }
  return { apply: args.includes('--apply'), policy };
}

function collectFiles(rootDir: string): AllureResultFile[] {
  if (!fs.existsSync(rootDir)) return [];
  const files: AllureResultFile[] = [];
  for (const filePath of walkFiles(rootDir)) {
    const stat = fs.statSync(filePath);
    files.push({
      relativePath: path.relative(rootDir, filePath),
      modifiedAt: stat.mtime,
      sizeBytes: stat.size,
    });
  }
  return files;
}

function* walkFiles(rootDir: string): Generator<string> {
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const filePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(filePath);
    else if (entry.isFile()) yield filePath;
  }
}

function pruneEmptyDirectories(rootDir: string): boolean {
  if (!fs.existsSync(rootDir)) return true;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(rootDir, entry.name);
    if (pruneEmptyDirectories(directory)) fs.rmdirSync(directory);
  }
  return fs.readdirSync(rootDir).length === 0;
}

function assertManagedRoot(rootDir: string): void {
  const expected = path.resolve(projectRoot, 'allure-results');
  if (rootDir !== expected || path.dirname(rootDir) !== projectRoot) {
    throw new Error(`Allure 治理目录越界：${rootDir}`);
  }
}

function assertManagedFile(filePath: string): void {
  const rootPrefix = `${allureRoot}${path.sep}`;
  if (!filePath.startsWith(rootPrefix)) throw new Error(`Allure 删除目标越界：${filePath}`);
}

main();
