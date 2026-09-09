import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { waitUntil } from '../../utils/wait';

export type SystemTestResourceClaim = {
  key: string;
  mode: 'shared' | 'exclusive';
};

type LeaseMetadata = {
  ownerId: string;
  ownerScopeId?: string;
  pid: number;
  acquiredAt: string;
};

export async function withSystemTestResourceClaims<T>(
  claims: readonly SystemTestResourceClaim[],
  operation: () => Promise<T>,
  options: {
    rootDir: string;
    timeoutMs?: number;
    leaseTtlMs?: number;
    pollIntervalMs?: number;
    ownerScopeId?: string;
  },
): Promise<T> {
  const normalized = normalizeClaims(claims);
  if (normalized.length === 0) return operation();
  const ownerId = `${process.pid}-${randomUUID()}`;
  const leaseTtlMs = options.leaseTtlMs ?? 5 * 60_000;
  const acquired: Array<{ claim: SystemTestResourceClaim; leasePath: string }> = [];
  fs.mkdirSync(options.rootDir, { recursive: true });
  try {
    for (const claim of normalized) {
      const leasePath = await acquireClaim(claim, ownerId, options.rootDir, {
        timeoutMs: options.timeoutMs ?? 240_000,
        leaseTtlMs,
        pollIntervalMs: options.pollIntervalMs ?? 100,
        ownerScopeId: options.ownerScopeId,
      });
      acquired.push({ claim, leasePath });
    }
    const heartbeat = setInterval(() => refreshLeases(acquired.map((item) => item.leasePath)), Math.max(1_000, Math.floor(leaseTtlMs / 3)));
    heartbeat.unref?.();
    try {
      return await operation();
    } finally {
      clearInterval(heartbeat);
    }
  } finally {
    for (const item of acquired.reverse()) releaseLease(item.claim, item.leasePath, options.rootDir);
  }
}

export function findSystemTestResourceLeases(rootDir: string, ownerScopeId?: string): string[] {
  if (!fs.existsSync(rootDir)) return [];
  return walkFiles(rootDir)
    .filter((file) => !ownerScopeId || readLeaseMetadata(file)?.ownerScopeId === ownerScopeId)
    .map((file) => path.relative(rootDir, file).replaceAll(path.sep, '/'))
    .sort();
}

export function cleanupStaleSystemTestResourceLeases(
  rootDir: string,
  leaseTtlMs = 5 * 60_000,
): string[] {
  if (!fs.existsSync(rootDir)) return [];
  const removed: string[] = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const resourceDir = path.join(rootDir, entry.name);
    const before = new Set(walkFiles(resourceDir));
    cleanupStaleLeases(resourceDir, leaseTtlMs);
    for (const file of before) {
      if (!fs.existsSync(file)) removed.push(path.relative(rootDir, file).replaceAll(path.sep, '/'));
    }
  }
  return removed.sort();
}

function normalizeClaims(claims: readonly SystemTestResourceClaim[]): SystemTestResourceClaim[] {
  const byKey = new Map<string, SystemTestResourceClaim['mode']>();
  for (const claim of claims) {
    const key = claim.key.trim();
    if (!key) continue;
    const current = byKey.get(key);
    byKey.set(key, current === 'exclusive' || claim.mode === 'exclusive' ? 'exclusive' : 'shared');
  }
  return [...byKey.entries()].map(([key, mode]) => ({ key, mode })).sort((left, right) => left.key.localeCompare(right.key));
}

async function acquireClaim(
  claim: SystemTestResourceClaim,
  ownerId: string,
  rootDir: string,
  options: { timeoutMs: number; leaseTtlMs: number; pollIntervalMs: number; ownerScopeId?: string },
): Promise<string> {
  const resourceDir = path.join(rootDir, fingerprint(claim.key));
  const sharedDir = path.join(resourceDir, 'shared');
  const exclusivePath = path.join(resourceDir, 'exclusive.json');
  const sharedPath = path.join(sharedDir, `${ownerId}.json`);
  fs.mkdirSync(sharedDir, { recursive: true });
  return waitUntil(
    () => {
      fs.mkdirSync(sharedDir, { recursive: true });
      cleanupStaleLeases(resourceDir, options.leaseTtlMs);
      return claim.mode === 'shared'
        ? tryAcquireShared(sharedPath, exclusivePath, ownerId, options.ownerScopeId)
        : tryAcquireExclusive(exclusivePath, sharedDir, ownerId, options.ownerScopeId);
    },
    (leasePath) => Boolean(leasePath),
    {
      timeout: options.timeoutMs,
      interval: options.pollIntervalMs,
      message: `资源租约等待超时：${claim.key}:${claim.mode}`,
      observation: { channel: 'audit', operation: 'system-test-resource-lock' },
    },
  ) as Promise<string>;
}

function tryAcquireShared(sharedPath: string, exclusivePath: string, ownerId: string, ownerScopeId?: string): string {
  if (fs.existsSync(exclusivePath)) return '';
  if (!writeLeaseExclusive(sharedPath, ownerId, ownerScopeId)) return '';
  if (fs.existsSync(exclusivePath)) {
    fs.rmSync(sharedPath, { force: true });
    return '';
  }
  return sharedPath;
}

function tryAcquireExclusive(exclusivePath: string, sharedDir: string, ownerId: string, ownerScopeId?: string): string {
  if (!writeLeaseExclusive(exclusivePath, ownerId, ownerScopeId)) return '';
  const sharedLeases = fs.existsSync(sharedDir) ? fs.readdirSync(sharedDir).filter((name) => name.endsWith('.json')) : [];
  if (sharedLeases.length > 0) {
    fs.rmSync(exclusivePath, { force: true });
    return '';
  }
  return exclusivePath;
}

function writeLeaseExclusive(filePath: string, ownerId: string, ownerScopeId?: string): boolean {
  try {
    const metadata: LeaseMetadata = {
      ownerId,
      ...(ownerScopeId?.trim() ? { ownerScopeId: ownerScopeId.trim() } : {}),
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(metadata), { encoding: 'utf8', flag: 'wx' });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

function cleanupStaleLeases(resourceDir: string, leaseTtlMs: number): void {
  for (const leasePath of [
    path.join(resourceDir, 'exclusive.json'),
    ...listJsonFiles(path.join(resourceDir, 'shared')),
  ]) {
    if (!fs.existsSync(leasePath)) continue;
    const stat = fs.statSync(leasePath);
    const metadata = readLeaseMetadata(leasePath);
    if (Date.now() - stat.mtimeMs > leaseTtlMs || !metadata || !isProcessAlive(metadata.pid)) {
      fs.rmSync(leasePath, { force: true });
    }
  }
}

function readLeaseMetadata(filePath: string): LeaseMetadata | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<LeaseMetadata>;
    return typeof parsed.ownerId === 'string' && Number.isInteger(parsed.pid) && typeof parsed.acquiredAt === 'string'
      ? parsed as LeaseMetadata
      : undefined;
  } catch {
    return undefined;
  }
}

function isProcessAlive(pid: number): boolean {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function refreshLeases(leasePaths: readonly string[]): void {
  const now = new Date();
  for (const leasePath of leasePaths) {
    if (fs.existsSync(leasePath)) fs.utimesSync(leasePath, now, now);
  }
}

function releaseLease(_claim: SystemTestResourceClaim, leasePath: string, _rootDir: string): void {
  fs.rmSync(leasePath, { force: true });
}

function listJsonFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => name.endsWith('.json')).map((name) => path.join(directory, name));
}

function walkFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const current = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(current) : [current];
  });
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}
