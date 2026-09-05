import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..');
const defaultProgressPath = path.join(projectRoot, 'output', 'product-center-group-progress.json');

export type ProductCenterGroupProgress = {
  runId: string;
  caseId: string;
  phase: 'started' | 'auth-retrying' | 'read-retrying' | 'completed' | 'failed';
  updatedAt: string;
};

export function writeProductCenterGroupProgress(
  input: Omit<ProductCenterGroupProgress, 'updatedAt'>,
): void {
  const filePath = path.resolve(process.env.PC_GROUP_PROGRESS_FILE ?? defaultProgressPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const value: ProductCenterGroupProgress = { ...input, updatedAt: new Date().toISOString() };
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

export function updateCurrentProductCenterGroupProgressPhase(
  phase: ProductCenterGroupProgress['phase'],
): void {
  const filePath = path.resolve(process.env.PC_GROUP_PROGRESS_FILE ?? defaultProgressPath);
  if (!fs.existsSync(filePath)) return;
  try {
    const current = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ProductCenterGroupProgress;
    writeProductCenterGroupProgress({ runId: current.runId, caseId: current.caseId, phase });
  } catch {
    return;
  }
}
