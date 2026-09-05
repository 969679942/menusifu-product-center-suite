import fs from 'node:fs';
import path from 'node:path';
import { buildRuntimeAuditCorrectionDocumentFromReceipts } from '../utils/product-center-runtime-audit-correction';
import type { RuntimeAuditReceiptDocumentInput } from '../utils/runtime-audit-correction-from-receipt';

export function buildProductCenterRuntimeAuditCorrectionFromReceipts(input: {
  casesPath: string;
  receiptsPath: string;
  outputPath: string;
  rootDir?: string;
}) {
  const casesDocument = readJson<{ cases: RuntimeAuditReceiptDocumentInput['cases'] }>(input.casesPath);
  const receiptDocument = readJson<Omit<RuntimeAuditReceiptDocumentInput, 'cases'>>(input.receiptsPath);
  const document = buildRuntimeAuditCorrectionDocumentFromReceipts({
    ...receiptDocument,
    cases: casesDocument.cases,
    rootDir: input.rootDir ?? path.dirname(path.resolve(input.receiptsPath)),
  });
  writeJson(input.outputPath, document);
  return { outputPath: path.resolve(input.outputPath), correctionCount: document.corrections.length };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, absolutePath);
}

function readOption(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`${name} 缺少路径`);
  return value;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const result = buildProductCenterRuntimeAuditCorrectionFromReceipts({
      casesPath: readOption(args, '--cases'),
      receiptsPath: readOption(args, '--receipts'),
      outputPath: readOption(args, '--output'),
      rootDir: args.includes('--root') ? args[args.indexOf('--root') + 1] : undefined,
    });
    process.stdout.write(`运行收据 V2 审计合同已生成：${result.outputPath};校正=${result.correctionCount}\n`);
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
