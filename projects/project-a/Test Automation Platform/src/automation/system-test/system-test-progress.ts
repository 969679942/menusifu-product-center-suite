import fs from 'node:fs';
import path from 'node:path';

export type SystemTestFailureCategory =
  | 'product-failure'
  | 'automation-gap'
  | 'environment-failure'
  | 'external-dependency'
  | 'transient-platform'
  | 'test-data'
  | 'locator-drift'
  | 'cleanup-residue'
  | 'unknown';

export type SystemTestProgressEvent = {
  runId: string;
  caseId: string;
  phase: 'started' | 'completed' | 'failed';
  status?: string;
  failureCategory?: SystemTestFailureCategory;
  diagnosticFingerprint?: string;
  updatedAt: string;
};

export function appendSystemTestProgress(
  paths: { latestPath: string; historyPath: string },
  event: Omit<SystemTestProgressEvent, 'updatedAt'>,
): SystemTestProgressEvent {
  const value = { ...event, updatedAt: new Date().toISOString() };
  writeJsonAtomic(paths.latestPath, value);
  fs.mkdirSync(path.dirname(paths.historyPath), { recursive: true });
  fs.appendFileSync(paths.historyPath, `${JSON.stringify(value)}\n`, 'utf8');
  return value;
}

export function readSystemTestProgress(historyPath: string): SystemTestProgressEvent[] {
  if (!fs.existsSync(historyPath)) return [];
  return fs.readFileSync(historyPath, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line) as SystemTestProgressEvent];
    } catch {
      return [];
    }
  });
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
