import fs from 'node:fs';
import path from 'node:path';

const textExtensions = new Set(['.json', '.jsonl', '.log', '.md', '.txt', '.xml', '.csv']);
const sensitivePatterns = [
  /(?<![a-z0-9_-])(?:authorization|password|cookie|set-cookie|token|access[_-]?token|refresh[_-]?token)(?![a-z0-9_-])["']?\s*[:=]\s*["']?(?!<redacted>|\*{3})[^"',;\s}]{4,}/i,
  /bearer\s+(?!<redacted>)[a-z0-9._-]{8,}/i,
  /eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}/i,
];

export type ArtifactFinding = {
  file: string;
};

export function removeAuthState(storageStatePath: string): boolean {
  const absolutePath = path.resolve(storageStatePath);
  const leasePath = `${absolutePath}.lease.json`;
  const existed = fs.existsSync(absolutePath) || fs.existsSync(leasePath);
  if (fs.existsSync(absolutePath)) fs.rmSync(absolutePath, { force: true });
  if (fs.existsSync(leasePath)) fs.rmSync(leasePath, { force: true });
  return existed;
}

export function scanGeneratedArtifacts(
  rootDir = 'output',
  options: { modifiedAfterMs?: number; ignoreActiveAuthState?: boolean } = {},
): ArtifactFinding[] {
  const absoluteRoot = path.resolve(rootDir);
  if (!fs.existsSync(absoluteRoot)) return [];

  const findings: ArtifactFinding[] = [];
  for (const filePath of walkFiles(absoluteRoot)) {
    if (!textExtensions.has(path.extname(filePath).toLowerCase())) continue;
    if (options.modifiedAfterMs !== undefined && fs.statSync(filePath).mtimeMs < options.modifiedAfterMs) continue;
    if (options.ignoreActiveAuthState && isActiveLeasedAuthArtifact(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    if (sensitivePatterns.some((pattern) => pattern.test(content))) {
      findings.push({ file: path.relative(process.cwd(), filePath) });
    }
  }
  return findings;
}

function isActiveLeasedAuthArtifact(filePath: string, nowMs = Date.now()): boolean {
  const leasePath = filePath.endsWith('.lease.json') ? filePath : `${filePath}.lease.json`;
  if (!fs.existsSync(leasePath)) return false;
  try {
    const lease = JSON.parse(fs.readFileSync(leasePath, 'utf8')) as { expiresAt?: string };
    const expiresAt = Date.parse(lease.expiresAt ?? '');
    return Number.isFinite(expiresAt) && expiresAt > nowMs;
  } catch {
    return false;
  }
}

export function findIncompleteCheckpointFiles(
  rootDir = 'output/checkpoints',
  options: { updatedAfterMs?: number } = {},
): string[] {
  const absoluteRoot = path.resolve(rootDir);
  if (!fs.existsSync(absoluteRoot)) return [];

  const incomplete: string[] = [];
  for (const filePath of walkFiles(absoluteRoot)) {
    if (path.extname(filePath).toLowerCase() !== '.json') continue;
    const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      runId?: string;
      updatedAt?: string;
      entries?: Array<{ phase?: string }>;
    };
    if (!isCanonicalRunArtifact(filePath, snapshot.runId)) continue;
    if (!isUpdatedAfter(snapshot.updatedAt, options.updatedAfterMs)) continue;
    if (snapshot.entries?.some((entry) => entry.phase !== 'residue-verified')) {
      incomplete.push(path.relative(process.cwd(), filePath));
    }
  }
  return incomplete;
}

function isUpdatedAfter(updatedAt: string | undefined, updatedAfterMs: number | undefined): boolean {
  if (updatedAfterMs === undefined) return true;
  const updatedAtMs = Date.parse(updatedAt ?? '');
  return Number.isFinite(updatedAtMs) && updatedAtMs >= updatedAfterMs;
}

export function isCanonicalRunArtifact(filePath: string, runId: string | undefined): boolean {
  if (typeof runId !== 'string' || runId.length === 0) return false;
  const safeRunId = runId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.basename(filePath) === `${safeRunId}.json`;
}

export function pruneCompletedCheckpoints(rootDir = 'output/checkpoints', retain = 200): string[] {
  const absoluteRoot = path.resolve(rootDir);
  if (!fs.existsSync(absoluteRoot)) return [];
  assertRetention(retain);

  const completedFiles = [...walkFiles(absoluteRoot)]
    .filter((filePath) => path.extname(filePath).toLowerCase() === '.json')
    .filter(isCompletedCheckpoint)
    .sort((left, right) => safeMtime(right) - safeMtime(left));

  return removeFiles(completedFiles.slice(retain));
}

function isCompletedCheckpoint(filePath: string): boolean {
  try {
    const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      runId?: string;
      entries?: Array<{ phase?: string }>;
    };
    return typeof snapshot.runId === 'string'
      && Array.isArray(snapshot.entries)
      && snapshot.entries.every((entry) => entry.phase === 'residue-verified');
  } catch (error) {
    // Parallel workers may finish and prune the same transient checkpoint
    // between directory enumeration and file reading. A disappeared file is
    // already pruned and must not fail an otherwise completed test run.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function safeMtime(filePath: string): number {
  try { return fs.statSync(filePath).mtimeMs; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Number.NEGATIVE_INFINITY;
    throw error;
  }
}

export function pruneTimingReports(rootDir = 'output/performance', retain = 30): string[] {
  const absoluteRoot = path.resolve(rootDir);
  if (!fs.existsSync(absoluteRoot)) return [];
  assertRetention(retain);

  const timingReports = [...walkFiles(absoluteRoot)]
    .filter((filePath) => /^product-center-timing-\d+\.json$/i.test(path.basename(filePath)))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

  return removeFiles(timingReports.slice(retain));
}

function removeFiles(filePaths: string[]): string[] {
  for (const filePath of filePaths) fs.rmSync(filePath, { force: true });
  return filePaths.map((filePath) => path.relative(process.cwd(), filePath));
}

function assertRetention(retain: number): void {
  if (!Number.isInteger(retain) || retain < 0) throw new Error(`保留数量无效：${retain}`);
}

function* walkFiles(rootDir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    const filePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(filePath);
    else yield filePath;
  }
}
