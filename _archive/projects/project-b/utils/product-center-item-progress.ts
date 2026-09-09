import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..');
const defaultProgressPath = path.join(projectRoot, 'output', 'product-center-item-progress.json');
const defaultHistoryPath = path.join(projectRoot, 'output', 'product-center-item-progress.jsonl');

export type ProductCenterItemProgress = {
  runId: string;
  caseId: string;
  phase: 'started' | 'completed' | 'failed' | 'interrupted';
  status?: string;
  failureCategory?: string;
  diagnosticFingerprint?: string;
  updatedAt: string;
};

export function writeProductCenterItemProgress(
  input: Omit<ProductCenterItemProgress, 'updatedAt'>,
): void {
  const filePath = path.resolve(process.env.PC_ITEM_PROGRESS_FILE ?? defaultProgressPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const value: ProductCenterItemProgress = { ...input, updatedAt: new Date().toISOString() };
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
  const historyPath = path.resolve(process.env.PC_ITEM_PROGRESS_HISTORY_FILE ?? defaultHistoryPath);
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.appendFileSync(historyPath, `${JSON.stringify(value)}\n`, 'utf8');
}

export function readProductCenterItemProgressHistory(filePath: string): ProductCenterItemProgress[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as ProductCenterItemProgress];
      } catch {
        return [];
      }
    });
}
