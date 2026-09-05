import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SystemTestFailureCategory } from './system-test-progress';

export type SystemTestRepairAttemptStatus = 'running' | 'passed' | 'failed' | 'interrupted';

export type SystemTestRepairAttempt = {
  attemptId: string;
  runId: string;
  implementationFingerprint: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  status: SystemTestRepairAttemptStatus;
  failureCategory?: SystemTestFailureCategory;
  diagnosticFingerprint?: string;
  invalidated?: boolean;
  invalidationReason?: string;
};

export type SystemTestRepairCycle = {
  cycleId: string;
  diagnosisFingerprint: string | null;
  startedAt: string;
  attempts: SystemTestRepairAttempt[];
};

export type SystemTestRepairLedger = {
  schemaVersion: '1.0.0';
  entries: Array<{
    applicationId: string;
    caseId: string;
    caseFingerprint: string;
    cycles: SystemTestRepairCycle[];
  }>;
};

export type SystemTestRepairPolicy = {
  maxAttemptsPerCycle: number;
  maxCyclesPerCase: number;
  maxCycleElapsedMs: number;
  maxTransientAttemptsPerImplementation: number;
};

export const DEFAULT_SYSTEM_TEST_REPAIR_POLICY: SystemTestRepairPolicy = {
  maxAttemptsPerCycle: 2,
  maxCyclesPerCase: 2,
  maxCycleElapsedMs: 15 * 60_000,
  maxTransientAttemptsPerImplementation: 2,
};

export type SystemTestRepairGuardDecision = {
  allowed: boolean;
  code?:
    | 'CURRENT_IMPLEMENTATION_ALREADY_PASSED'
    | 'IMPLEMENTATION_UNCHANGED_AFTER_DETERMINISTIC_FAILURE'
    | 'REPAIR_ATTEMPT_ALREADY_RUNNING'
    | 'DIAGNOSIS_REQUIRED'
    | 'REPAIR_BUDGET_EXHAUSTED';
  detail?: string;
  attempt?: SystemTestRepairAttempt;
};

export type SystemTestRepairAttemptState = {
  currentImplementationPassed: boolean;
  currentImplementationDeterministicFailure: boolean;
  latestCurrentAttemptStatus?: SystemTestRepairAttemptStatus;
  latestCurrentFailureCategory?: SystemTestFailureCategory;
};

export function inspectSystemTestRepairAttemptState(input: {
  ledgerPath: string;
  applicationId: string;
  caseId: string;
  caseFingerprint: string;
  implementationFingerprint: string;
}): SystemTestRepairAttemptState {
  const entry = readSystemTestRepairLedger(input.ledgerPath).entries.find((candidate) => (
    candidate.applicationId === input.applicationId
      && candidate.caseId === input.caseId
      && candidate.caseFingerprint === input.caseFingerprint
  ));
  const attempts = entry?.cycles.flatMap((cycle) => cycle.attempts)
    .filter((attempt) => !attempt.invalidated && attempt.implementationFingerprint === input.implementationFingerprint) ?? [];
  const latest = attempts.at(-1);
  return {
    currentImplementationPassed: attempts.some((attempt) => attempt.status === 'passed'),
    currentImplementationDeterministicFailure: attempts.some((attempt) => (
      attempt.status === 'failed' && attempt.failureCategory !== 'transient-platform'
    )),
    latestCurrentAttemptStatus: latest?.status,
    latestCurrentFailureCategory: latest?.failureCategory,
  };
}

export function beginSystemTestRepairAttempt(input: {
  ledgerPath: string;
  applicationId: string;
  caseId: string;
  caseFingerprint: string;
  implementationFingerprint: string;
  runId: string;
  diagnosisFingerprint?: string;
  invalidatedAttemptIds?: readonly string[];
  invalidationReason?: string;
  now?: string;
  policy?: Partial<SystemTestRepairPolicy>;
}): SystemTestRepairGuardDecision {
  const policy = { ...DEFAULT_SYSTEM_TEST_REPAIR_POLICY, ...input.policy };
  const now = input.now ?? new Date().toISOString();
  const ledger = readSystemTestRepairLedger(input.ledgerPath);
  const invalidatedAttemptIds = new Set(input.invalidatedAttemptIds ?? []);
  for (const attempt of ledger.entries.flatMap((entry) => entry.cycles).flatMap((cycle) => cycle.attempts)) {
    if (invalidatedAttemptIds.has(attempt.attemptId)) {
      attempt.invalidated = true;
      attempt.invalidationReason = input.invalidationReason ?? '平台执行中断，不代表业务用例失败。';
    }
  }
  let entry = ledger.entries.find((item) => item.applicationId === input.applicationId
    && item.caseId === input.caseId && item.caseFingerprint === input.caseFingerprint);
  if (!entry) {
    entry = { applicationId: input.applicationId, caseId: input.caseId, caseFingerprint: input.caseFingerprint, cycles: [] };
    ledger.entries.push(entry);
  }
  const attempts = entry.cycles.flatMap((cycle) => cycle.attempts).filter((attempt) => !attempt.invalidated);
  const runningAttempt = [...attempts].reverse().find((attempt) => attempt.status === 'running');
  if (runningAttempt) {
    const elapsedMs = Date.parse(now) - Date.parse(runningAttempt.startedAt);
    if (elapsedMs < policy.maxCycleElapsedMs) {
      return { allowed: false, code: 'REPAIR_ATTEMPT_ALREADY_RUNNING', detail: runningAttempt.attemptId };
    }
    runningAttempt.status = 'interrupted';
    runningAttempt.completedAt = now;
    runningAttempt.durationMs = Math.max(0, elapsedMs);
  }
  const sameImplementation = attempts.filter((attempt) => attempt.implementationFingerprint === input.implementationFingerprint);
  if (sameImplementation.some((attempt) => attempt.status === 'passed')) {
    return { allowed: false, code: 'CURRENT_IMPLEMENTATION_ALREADY_PASSED', detail: input.caseId };
  }
  const deterministicFailure = [...sameImplementation].reverse().find((attempt) => attempt.status === 'failed'
    && attempt.failureCategory !== 'transient-platform');
  if (deterministicFailure) {
    return {
      allowed: false,
      code: 'IMPLEMENTATION_UNCHANGED_AFTER_DETERMINISTIC_FAILURE',
      detail: deterministicFailure.attemptId,
    };
  }
  const transientAttempts = sameImplementation.filter((attempt) => attempt.status === 'failed'
    && attempt.failureCategory === 'transient-platform').length;
  if (transientAttempts >= policy.maxTransientAttemptsPerImplementation) {
    return { allowed: false, code: 'DIAGNOSIS_REQUIRED', detail: `transient-attempts=${transientAttempts}` };
  }
  let cycle = entry.cycles.at(-1);
  const implementationChanged = Boolean(cycle?.attempts.length
    && cycle.attempts.every((attempt) => attempt.implementationFingerprint !== input.implementationFingerprint));
  const cycleExpired = cycle
    ? Date.parse(now) - Date.parse(cycle.startedAt) >= policy.maxCycleElapsedMs
    : false;
  const cycleExhausted = Boolean(cycle
    && cycle.attempts.filter((attempt) => !attempt.invalidated
      && attempt.status !== 'interrupted'
      && attempt.failureCategory !== 'transient-platform').length >= policy.maxAttemptsPerCycle);
  if (!cycle || implementationChanged || cycleExpired || cycleExhausted) {
    const diagnosisFingerprint = normalizeFingerprint(input.diagnosisFingerprint);
    const cycleHasDeterministicFailure = Boolean(cycle?.attempts.some((attempt) => !attempt.invalidated
      && attempt.status === 'failed'
      && attempt.failureCategory !== 'transient-platform'));
    if (cycle && cycleHasDeterministicFailure && !diagnosisFingerprint
      && (cycleExpired || !implementationChanged)) {
      return {
        allowed: false,
        code: 'DIAGNOSIS_REQUIRED',
        detail: cycleExpired ? 'cycle-time-budget-exhausted' : 'cycle-attempt-budget-exhausted',
      };
    }
    // A changed implementation starts a fresh budget, but after the
    // historical deterministic-failure threshold is reached a structured
    // diagnosis is still required before opening another cycle. This keeps
    // repeated repairs bounded while allowing the first implementation
    // change (the normal v1 -> v2 path) to proceed without extra paperwork.
    const deterministicFailureCount = attempts.filter((attempt) => attempt.status === 'failed'
      && attempt.failureCategory !== 'transient-platform').length;
    if (implementationChanged && deterministicFailureCount >= policy.maxAttemptsPerCycle && !diagnosisFingerprint) {
      return {
        allowed: false,
        code: 'DIAGNOSIS_REQUIRED',
        detail: `deterministic-failures=${deterministicFailureCount}`,
      };
    }
    // Repair budget is scoped to the implementation fingerprint. A changed
    // implementation must be able to receive an isolated diagnosis cycle even
    // when older implementations exhausted their historical budgets; the same
    // implementation remains bounded exactly as before.
    // A cycle containing only interrupted or transient attempts is platform
    // execution noise and must not consume the implementation repair budget.
    // Count only cycles that contain a durable business outcome (passed or a
    // deterministic failure) for this implementation.
    const effectiveCycles = entry.cycles.filter((candidate) => candidate.attempts.some((attempt) => (
      !attempt.invalidated
      && attempt.implementationFingerprint === input.implementationFingerprint
      && (attempt.status === 'passed'
        || (attempt.status === 'failed' && attempt.failureCategory !== 'transient-platform')))
    ));
    if (effectiveCycles.length >= policy.maxCyclesPerCase) {
      return { allowed: false, code: 'REPAIR_BUDGET_EXHAUSTED', detail: `implementation-cycles=${effectiveCycles.length}` };
    }
    if (!implementationChanged && cycle && cycle.diagnosisFingerprint === diagnosisFingerprint) {
      return { allowed: false, code: 'DIAGNOSIS_REQUIRED', detail: 'diagnosis-must-change' };
    }
    const nextCycle: SystemTestRepairCycle = {
      cycleId: createHash('sha256').update(`${input.applicationId}:${input.caseId}:${now}:${diagnosisFingerprint ?? 'initial'}`).digest('hex').slice(0, 16),
      diagnosisFingerprint: diagnosisFingerprint ?? null,
      startedAt: now,
      attempts: [],
    };
    entry.cycles.push(nextCycle);
    cycle = nextCycle;
  }
  if (!cycle) throw new Error(`REPAIR_CYCLE_NOT_CREATED:${input.caseId}`);
  const attempt: SystemTestRepairAttempt = {
    attemptId: createHash('sha256').update(`${input.runId}:${input.caseId}:${input.implementationFingerprint}`).digest('hex').slice(0, 16),
    runId: input.runId,
    implementationFingerprint: input.implementationFingerprint,
    startedAt: now,
    completedAt: null,
    durationMs: null,
    status: 'running',
  };
  cycle.attempts.push(attempt);
  writeSystemTestRepairLedger(input.ledgerPath, ledger);
  return { allowed: true, attempt };
}

export function completeSystemTestRepairAttempt(input: {
  ledgerPath: string;
  attemptId: string;
  status: Exclude<SystemTestRepairAttemptStatus, 'running'>;
  failureCategory?: SystemTestFailureCategory;
  diagnosticFingerprint?: string;
  now?: string;
}): void {
  const ledger = readSystemTestRepairLedger(input.ledgerPath);
  const attempt = ledger.entries.flatMap((entry) => entry.cycles)
    .flatMap((cycle) => cycle.attempts).find((item) => item.attemptId === input.attemptId);
  if (!attempt) throw new Error(`REPAIR_ATTEMPT_NOT_FOUND:${input.attemptId}`);
  const completedAt = input.now ?? new Date().toISOString();
  attempt.status = input.status;
  attempt.completedAt = completedAt;
  attempt.durationMs = Math.max(0, Date.parse(completedAt) - Date.parse(attempt.startedAt));
  attempt.failureCategory = input.failureCategory;
  attempt.diagnosticFingerprint = normalizeFingerprint(input.diagnosticFingerprint);
  writeSystemTestRepairLedger(input.ledgerPath, ledger);
}

/**
 * Closes repair attempts orphaned by a terminated runner before a new run is
 * allowed to register work. The caller must pass the only authoritative active
 * run id, or omit it after the run-state guard has proved that no runner is
 * alive. Attempts owned by an active run are never modified.
 */
export function reconcileOrphanedSystemTestRepairAttempts(input: {
  ledgerPath: string;
  activeRunId?: string;
  now?: string;
}): { reconciledAttemptIds: string[] } {
  const ledger = readSystemTestRepairLedger(input.ledgerPath);
  const completedAt = input.now ?? new Date().toISOString();
  const reconciledAttemptIds: string[] = [];
  for (const attempt of ledger.entries.flatMap((entry) => entry.cycles).flatMap((cycle) => cycle.attempts)) {
    if (attempt.status !== 'running' || attempt.runId === input.activeRunId) continue;
    attempt.status = 'interrupted';
    attempt.completedAt = completedAt;
    attempt.durationMs = Math.max(0, Date.parse(completedAt) - Date.parse(attempt.startedAt));
    attempt.failureCategory = 'transient-platform';
    reconciledAttemptIds.push(attempt.attemptId);
  }
  if (reconciledAttemptIds.length > 0) writeSystemTestRepairLedger(input.ledgerPath, ledger);
  return { reconciledAttemptIds };
}

export function fingerprintSystemTestRepairDiagnosis(filePath: string, expected: {
  applicationId: string;
  caseIds: readonly string[];
}): string {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`REPAIR_DIAGNOSIS_MISSING:${filePath}`);
  const value = JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as {
    schemaVersion?: string;
    applicationId?: string;
    caseIds?: string[];
    rootCause?: string;
    correctiveAction?: string;
    evidenceRefs?: string[];
  };
  if (value.schemaVersion !== '1.0.0' || value.applicationId !== expected.applicationId
    || !Array.isArray(value.caseIds) || expected.caseIds.some((caseId) => !value.caseIds?.includes(caseId))
    || !value.rootCause?.trim() || !value.correctiveAction?.trim() || !value.evidenceRefs?.length) {
    throw new Error(`REPAIR_DIAGNOSIS_INVALID:${filePath}`);
  }
  return createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
}

export function readSystemTestRepairDiagnosis(filePath: string, expected: {
  applicationId: string;
  caseIds: readonly string[];
}): { fingerprint: string; supersedesAttemptIds: string[]; rootCause: string; correctiveAction: string; evidenceRefs: string[] } {
  const absolutePath = path.resolve(filePath);
  const value = JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as {
    supersedesAttemptIds?: unknown;
    rootCause?: string;
    correctiveAction?: string;
    evidenceRefs?: string[];
  };
  return {
    fingerprint: fingerprintSystemTestRepairDiagnosis(filePath, expected),
    supersedesAttemptIds: Array.isArray(value.supersedesAttemptIds)
      ? value.supersedesAttemptIds.filter((item): item is string => typeof item === 'string' && /^[a-f0-9]{16}$/.test(item))
      : [],
    rootCause: value.rootCause ?? '',
    correctiveAction: value.correctiveAction ?? '',
    evidenceRefs: value.evidenceRefs ?? [],
  };
}

export function readSystemTestRepairLedger(filePath: string): SystemTestRepairLedger {
  if (!fs.existsSync(filePath)) return { schemaVersion: '1.0.0', entries: [] };
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SystemTestRepairLedger;
  if (value.schemaVersion !== '1.0.0' || !Array.isArray(value.entries)) {
    throw new Error(`REPAIR_LEDGER_INVALID:${filePath}`);
  }
  return value;
}

function writeSystemTestRepairLedger(filePath: string, ledger: SystemTestRepairLedger): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function normalizeFingerprint(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
}
