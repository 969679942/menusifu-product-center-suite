import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type SystemTestStageReceipt = {
  schemaVersion: '1.0.0';
  stage: 'setup' | 'preflight';
  status: 'passed';
  fingerprint: string;
  route?: string;
  contextFingerprint: string;
  implementationFingerprint: string;
  storageStatePath?: string;
  storageStateFingerprint?: string;
  completedAt: string;
};

export type SystemTestStageReuseDecision = {
  reusable: boolean;
  reason:
    | 'receipt-missing'
    | 'receipt-invalid'
    | 'receipt-expired'
    | 'stage-mismatch'
    | 'fingerprint-mismatch'
    | 'context-mismatch'
    | 'implementation-mismatch'
    | 'route-mismatch'
    | 'storage-state-missing'
    | 'storage-state-changed'
    | 'storage-state-expired'
    | 'same-stage-context-implementation-and-storage';
};

export function readSystemTestStageReceipt(filePath: string): SystemTestStageReceipt | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as SystemTestStageReceipt;
  } catch {
    return undefined;
  }
}

export function evaluateSystemTestStageReceipt(input: {
  receipt: SystemTestStageReceipt | undefined;
  expected: {
    stage: 'setup' | 'preflight';
    fingerprint: string;
    route?: string;
    contextFingerprint: string;
    implementationFingerprint: string;
  };
  nowMs?: number;
  ttlMs?: number;
}): SystemTestStageReuseDecision {
  const receipt = input.receipt;
  if (!receipt) return { reusable: false, reason: 'receipt-missing' };
  if (receipt.schemaVersion !== '1.0.0' || receipt.status !== 'passed') return { reusable: false, reason: 'receipt-invalid' };
  if (receipt.stage !== input.expected.stage) return { reusable: false, reason: 'stage-mismatch' };
  const completedAt = Date.parse(receipt.completedAt);
  const ttlMs = input.ttlMs ?? 15 * 60_000;
  if (!Number.isFinite(completedAt) || (input.nowMs ?? Date.now()) - completedAt > ttlMs) {
    return { reusable: false, reason: 'receipt-expired' };
  }
  if (receipt.fingerprint !== input.expected.fingerprint) return { reusable: false, reason: 'fingerprint-mismatch' };
  if (receipt.contextFingerprint !== input.expected.contextFingerprint) return { reusable: false, reason: 'context-mismatch' };
  if (receipt.implementationFingerprint !== input.expected.implementationFingerprint) {
    return { reusable: false, reason: 'implementation-mismatch' };
  }
  if (input.expected.route !== undefined && receipt.route !== input.expected.route) {
    return { reusable: false, reason: 'route-mismatch' };
  }
  if (receipt.storageStatePath) {
    if (!fs.existsSync(receipt.storageStatePath)) return { reusable: false, reason: 'storage-state-missing' };
    if (!receipt.storageStateFingerprint || sha256File(receipt.storageStatePath) !== receipt.storageStateFingerprint) {
      return { reusable: false, reason: 'storage-state-changed' };
    }
    if (storageStateIsExpired(receipt.storageStatePath, input.nowMs ?? Date.now())) {
      return { reusable: false, reason: 'storage-state-expired' };
    }
  } else if (input.expected.stage === 'setup') {
    return { reusable: false, reason: 'storage-state-missing' };
  }
  return { reusable: true, reason: 'same-stage-context-implementation-and-storage' };
}

export function writePassedSystemTestStageReceiptFromEnvironment(input: {
  env?: NodeJS.ProcessEnv;
  storageStatePath?: string;
} = {}): SystemTestStageReceipt {
  const env = input.env ?? process.env;
  const outputPath = required(env.SYSTEM_TEST_STAGE_RECEIPT, 'SYSTEM_TEST_STAGE_RECEIPT');
  const stage = required(env.SYSTEM_TEST_STAGE, 'SYSTEM_TEST_STAGE');
  if (stage !== 'setup' && stage !== 'preflight') throw new Error(`SYSTEM_TEST_STAGE_INVALID:${stage}`);
  const storageStatePath = input.storageStatePath ? path.resolve(input.storageStatePath) : undefined;
  const receipt: SystemTestStageReceipt = {
    schemaVersion: '1.0.0',
    stage,
    status: 'passed',
    fingerprint: required(env.SYSTEM_TEST_STAGE_FINGERPRINT, 'SYSTEM_TEST_STAGE_FINGERPRINT'),
    ...(env.SYSTEM_TEST_STAGE_ROUTE ? { route: env.SYSTEM_TEST_STAGE_ROUTE } : {}),
    contextFingerprint: required(env.SYSTEM_TEST_CONTEXT_FINGERPRINT, 'SYSTEM_TEST_CONTEXT_FINGERPRINT'),
    implementationFingerprint: required(
      env.SYSTEM_TEST_STAGE_IMPLEMENTATION_FINGERPRINT,
      'SYSTEM_TEST_STAGE_IMPLEMENTATION_FINGERPRINT',
    ),
    ...(storageStatePath ? {
      storageStatePath,
      storageStateFingerprint: sha256File(storageStatePath),
    } : {}),
    completedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, outputPath);
  return receipt;
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function storageStateIsExpired(filePath: string, nowMs: number): boolean {
  try {
    const state = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { cookies?: Array<{ expires?: number }> };
    const expiries = (state.cookies ?? []).map((cookie) => Number(cookie.expires ?? 0)).filter((value) => value > 0);
    return expiries.length > 0 && Math.max(...expiries) <= nowMs / 1_000;
  } catch {
    return true;
  }
}
