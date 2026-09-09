import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SYSTEM_TEST_EXECUTION_GRANT_PATH = 'SYSTEM_TEST_EXECUTION_GRANT_PATH';
export const SYSTEM_TEST_EXECUTION_GRANT_TOKEN = 'SYSTEM_TEST_EXECUTION_GRANT_TOKEN';
export const SYSTEM_TEST_EXECUTION_APPLICATION_ID = 'SYSTEM_TEST_EXECUTION_APPLICATION_ID';
export const SYSTEM_TEST_EXECUTION_RUN_ID = 'SYSTEM_TEST_EXECUTION_RUN_ID';
export const SYSTEM_TEST_EXECUTION_CANDIDATE_FINGERPRINT = 'SYSTEM_TEST_EXECUTION_CANDIDATE_FINGERPRINT';

type SystemTestExecutionGrantDocument = {
  schemaVersion: '1.0.0';
  applicationId: string;
  runId: string;
  caseIds: string[];
  issuedAt: string;
  expiresAt: string;
  tokenSha256: string;
  candidateFingerprint: string;
};

export type IssuedSystemTestExecutionGrant = {
  grantPath: string;
  env: NodeJS.ProcessEnv;
};

export function issueSystemTestExecutionGrant(input: {
  rootDir: string;
  applicationId: string;
  runId: string;
  caseIds: readonly string[];
  ttlMs: number;
  candidateFingerprint: string;
  now?: Date;
}): IssuedSystemTestExecutionGrant {
  const caseIds = normalizeCaseIds(input.caseIds);
  if (caseIds.length === 0) throw new Error('EXECUTION_GRANT_CASE_IDS_REQUIRED');
  if (!input.applicationId.trim()) throw new Error('EXECUTION_GRANT_APPLICATION_ID_REQUIRED');
  if (!input.runId.trim()) throw new Error('EXECUTION_GRANT_RUN_ID_REQUIRED');
  if (!/^[a-f0-9]{64}$/.test(input.candidateFingerprint)) throw new Error('EXECUTION_GRANT_CANDIDATE_INVALID');
  if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0) throw new Error('EXECUTION_GRANT_TTL_INVALID');

  const now = input.now ?? new Date();
  const token = randomBytes(32).toString('hex');
  const grantRoot = path.resolve(input.rootDir, 'output/system-test-execution-grants');
  const grantPath = path.join(
    grantRoot,
    safeSegment(input.applicationId),
    `${safeSegment(input.runId)}-${randomBytes(8).toString('hex')}.json`,
  );
  const document: SystemTestExecutionGrantDocument = {
    schemaVersion: '1.0.0',
    applicationId: input.applicationId,
    runId: input.runId,
    caseIds,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.ttlMs).toISOString(),
    tokenSha256: sha256(token),
    candidateFingerprint: input.candidateFingerprint,
  };
  writeJsonAtomic(grantPath, document);
  return {
    grantPath,
    env: {
      [SYSTEM_TEST_EXECUTION_GRANT_PATH]: grantPath,
      [SYSTEM_TEST_EXECUTION_GRANT_TOKEN]: token,
      [SYSTEM_TEST_EXECUTION_APPLICATION_ID]: input.applicationId,
      [SYSTEM_TEST_EXECUTION_RUN_ID]: input.runId,
      [SYSTEM_TEST_EXECUTION_CANDIDATE_FINGERPRINT]: input.candidateFingerprint,
    },
  };
}

export function assertSystemTestExecutionGrant(input: {
  rootDir: string;
  applicationId: string;
  caseId: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}): void {
  const env = input.env ?? process.env;
  const grantPath = env[SYSTEM_TEST_EXECUTION_GRANT_PATH];
  const token = env[SYSTEM_TEST_EXECUTION_GRANT_TOKEN];
  if (!grantPath || !token) throw new Error(`GOVERNED_EXECUTION_REQUIRED:${input.caseId}`);

  const grantRoot = path.resolve(input.rootDir, 'output/system-test-execution-grants');
  const resolvedGrantPath = path.resolve(grantPath);
  if (!isWithin(grantRoot, resolvedGrantPath)) throw new Error(`EXECUTION_GRANT_PATH_REJECTED:${input.caseId}`);
  const document = readGrant(resolvedGrantPath);
  const now = input.now ?? new Date();
  if (document.applicationId !== input.applicationId
    || env[SYSTEM_TEST_EXECUTION_APPLICATION_ID] !== input.applicationId) {
    throw new Error(`EXECUTION_GRANT_APPLICATION_MISMATCH:${input.caseId}`);
  }
  if (env[SYSTEM_TEST_EXECUTION_RUN_ID] !== document.runId) {
    throw new Error(`EXECUTION_GRANT_RUN_MISMATCH:${input.caseId}`);
  }
  if (env[SYSTEM_TEST_EXECUTION_CANDIDATE_FINGERPRINT] !== document.candidateFingerprint) {
    throw new Error(`EXECUTION_GRANT_CANDIDATE_MISMATCH:${input.caseId}`);
  }
  if (now.getTime() > Date.parse(document.expiresAt)) throw new Error(`EXECUTION_GRANT_EXPIRED:${input.caseId}`);
  if (!document.caseIds.includes(input.caseId.trim().toUpperCase())) {
    throw new Error(`EXECUTION_GRANT_CASE_NOT_SELECTED:${input.caseId}`);
  }
  const expected = Buffer.from(document.tokenSha256, 'hex');
  const actual = Buffer.from(sha256(token), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error(`EXECUTION_GRANT_TOKEN_INVALID:${input.caseId}`);
  }
}

export function revokeSystemTestExecutionGrant(grant: IssuedSystemTestExecutionGrant | undefined): void {
  if (!grant) return;
  try {
    fs.rmSync(grant.grantPath, { force: true });
  } catch {
    return;
  }
}

function readGrant(filePath: string): SystemTestExecutionGrantDocument {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    throw new Error('EXECUTION_GRANT_UNREADABLE');
  }
  if (!value || typeof value !== 'object') throw new Error('EXECUTION_GRANT_INVALID');
  const document = value as Partial<SystemTestExecutionGrantDocument>;
  if (document.schemaVersion !== '1.0.0'
    || typeof document.applicationId !== 'string'
    || typeof document.runId !== 'string'
    || !Array.isArray(document.caseIds)
    || !document.caseIds.every((item) => typeof item === 'string')
    || typeof document.issuedAt !== 'string'
    || typeof document.expiresAt !== 'string'
    || typeof document.tokenSha256 !== 'string'
    || typeof document.candidateFingerprint !== 'string'
    || !/^[a-f0-9]{64}$/.test(document.candidateFingerprint)
    || !Number.isFinite(Date.parse(document.issuedAt))
    || !Number.isFinite(Date.parse(document.expiresAt))) {
    throw new Error('EXECUTION_GRANT_INVALID');
  }
  return document as SystemTestExecutionGrantDocument;
}

function normalizeCaseIds(caseIds: readonly string[]): string[] {
  return [...new Set(caseIds.map((item) => item.trim().toUpperCase()).filter(Boolean))].sort();
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}
