import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type RuntimeReport = {
  waveId?: string;
  status: string;
  caseIds?: string[];
  acceptedCaseIds?: string[];
  canonicalConflictCaseIds?: string[];
  conflictCaseIds?: string[];
  executionDiagnostic?: string;
  summary?: { harnessError?: number };
  cleanupEvidence?: Record<string, unknown> & {
    ledgerEntries?: number;
    residueVerified?: number;
    incompleteLedgerEntries?: number;
    cleanupDiagnostic?: string;
  };
};

type W1Report = {
  status: string;
  caseEvidence: Array<{ caseId: string; verdict: 'accepted' | 'canonical-conflict' }>;
  summary: { failed: number; blocked: number };
  mutation: { residueVerified: boolean };
};

type W9Gate = {
  status: 'blocked-until-terminal-access';
  caseIds: string[];
  execution: { mutationCount: number; weightedProductCreated: boolean; terminalTransactionAttempted: boolean; orderCreated: boolean };
  residue: { newMerchantCenterEntities: number; newTerminalTransactions: number; newOrders: number };
};

export type RemainingWaveEvidence = {
  caseIds: string[];
  acceptedCaseIds: string[];
  canonicalConflictCaseIds: string[];
  blockedCaseIds: string[];
  harnessErrorCaseIds: string[];
  waves: Array<{
    waveId: string;
    evidencePath: string;
    sha256: string;
    status: string;
    caseIds: string[];
    acceptedCaseIds: string[];
    canonicalConflictCaseIds: string[];
    blockedCaseIds: string[];
    harnessErrorCaseIds: string[];
    cleanupVerified: boolean;
  }>;
};

const runtimeEvidencePaths = [
  ['W2', 'output/audit/product-center-item-p0-remaining-w2-AUTO_AUDIT_P0_REMAINING_W2_20260731_02.json'],
  ['W3', 'output/audit/product-center-item-p0-remaining-w3-AUTO_AUDIT_P0_REMAINING_W3_20260731_03.json'],
  ['W4', 'output/audit/product-center-item-p0-remaining-w4-AUTO_AUDIT_P0_REMAINING_W4_20260731_09.json'],
  ['W5', 'output/audit/product-center-item-p0-remaining-w5-AUTO_AUDIT_P0_REMAINING_W5_20260731_06.json'],
  ['W6', 'output/audit/product-center-item-p0-remaining-w6-AUTO_AUDIT_P0_REMAINING_W6_20260731_05.json'],
  ['W7', 'output/audit/product-center-item-p0-remaining-w7-AUTO_AUDIT_P0_REMAINING_W7_20260731_03.json'],
  ['W8', 'output/audit/product-center-item-p0-remaining-w8-AUTO_AUDIT_P0_REMAINING_W8_20260731_05.json'],
] as const;

export function loadProductCenterItemRemainingWaveEvidence(projectRoot: string): RemainingWaveEvidence {
  const w1EvidencePath = 'output/audit/product-center-item-p0-w1-20260731/audit.json';
  const w1AbsolutePath = path.join(projectRoot, w1EvidencePath);
  const w1 = readJson<W1Report>(w1AbsolutePath);
  const w1CaseIds = w1.caseEvidence.map((item) => item.caseId);
  const w1AcceptedCaseIds = w1.caseEvidence.filter((item) => item.verdict === 'accepted').map((item) => item.caseId);
  const w1ConflictCaseIds = w1.caseEvidence
    .filter((item) => item.verdict === 'canonical-conflict')
    .map((item) => item.caseId);
  if (w1.status !== 'completed-with-canonical-conflicts'
    || w1.summary.failed !== 0
    || w1.summary.blocked !== 0
    || !w1.mutation.residueVerified) {
    throw new Error('W1 证据未达到可聚合终态');
  }
  const waves: RemainingWaveEvidence['waves'] = [{
    waveId: 'W1',
    evidencePath: w1EvidencePath,
    sha256: sha256File(w1AbsolutePath),
    status: w1.status,
    caseIds: w1CaseIds,
    acceptedCaseIds: w1AcceptedCaseIds,
    canonicalConflictCaseIds: w1ConflictCaseIds,
    blockedCaseIds: [],
    harnessErrorCaseIds: [],
    cleanupVerified: true,
  }];

  for (const [waveId, evidencePath] of runtimeEvidencePaths) {
    const absolutePath = path.join(projectRoot, evidencePath);
    const report = readJson<RuntimeReport>(absolutePath);
    const caseIds = report.caseIds ?? [];
    const acceptedCaseIds = report.acceptedCaseIds ?? [];
    const canonicalConflictCaseIds = report.canonicalConflictCaseIds ?? report.conflictCaseIds ?? [];
    if (report.waveId !== waveId) throw new Error(`${waveId} 证据 waveId 不一致`);
    if (report.executionDiagnostic || report.cleanupEvidence?.cleanupDiagnostic) {
      throw new Error(`${waveId} 证据包含未解决执行或清理诊断`);
    }
    if ((report.summary?.harnessError ?? 0) !== 0) throw new Error(`${waveId} 证据包含 harness error`);
    if (!sameSet(caseIds, [...acceptedCaseIds, ...canonicalConflictCaseIds])) {
      throw new Error(`${waveId} accepted/conflict 未完整覆盖波次用例`);
    }
    if (!cleanupVerified(report.cleanupEvidence)) throw new Error(`${waveId} 清理证据未闭环`);
    waves.push({
      waveId,
      evidencePath,
      sha256: sha256File(absolutePath),
      status: report.status,
      caseIds,
      acceptedCaseIds,
      canonicalConflictCaseIds,
      blockedCaseIds: [],
      harnessErrorCaseIds: [],
      cleanupVerified: true,
    });
  }

  const w9EvidencePath = 'output/audit/product-center-item-p0-remaining-w9-blocked.json';
  const w9AbsolutePath = path.join(projectRoot, w9EvidencePath);
  const w9 = readJson<W9Gate>(w9AbsolutePath);
  if (w9.status !== 'blocked-until-terminal-access'
    || w9.execution.mutationCount !== 0
    || w9.execution.weightedProductCreated
    || w9.execution.terminalTransactionAttempted
    || w9.execution.orderCreated
    || !allZero(w9.residue)) {
    throw new Error('W9 blocked 证据不满足零 mutation 门禁');
  }
  waves.push({
    waveId: 'W9',
    evidencePath: w9EvidencePath,
    sha256: sha256File(w9AbsolutePath),
    status: w9.status,
    caseIds: w9.caseIds,
    acceptedCaseIds: [],
    canonicalConflictCaseIds: [],
    blockedCaseIds: w9.caseIds,
    harnessErrorCaseIds: [],
    cleanupVerified: true,
  });

  const caseIds = waves.flatMap((wave) => wave.caseIds);
  const acceptedCaseIds = waves.flatMap((wave) => wave.acceptedCaseIds);
  const canonicalConflictCaseIds = waves.flatMap((wave) => wave.canonicalConflictCaseIds);
  const blockedCaseIds = waves.flatMap((wave) => wave.blockedCaseIds);
  const harnessErrorCaseIds = waves.flatMap((wave) => wave.harnessErrorCaseIds);
  assertUnique(caseIds, 'W1-W9 证据存在重复用例');
  if (!sameSet(caseIds, [
    ...acceptedCaseIds,
    ...canonicalConflictCaseIds,
    ...blockedCaseIds,
    ...harnessErrorCaseIds,
  ])) throw new Error('W1-W9 证据 disposition 未完整覆盖');
  return {
    caseIds: caseIds.sort(),
    acceptedCaseIds: acceptedCaseIds.sort(),
    canonicalConflictCaseIds: canonicalConflictCaseIds.sort(),
    blockedCaseIds: blockedCaseIds.sort(),
    harnessErrorCaseIds: harnessErrorCaseIds.sort(),
    waves,
  };
}

function cleanupVerified(cleanup: RuntimeReport['cleanupEvidence']): boolean {
  if (!cleanup) return false;
  if (cleanup.ledgerEntries !== cleanup.residueVerified) return false;
  if ((cleanup.incompleteLedgerEntries ?? 0) !== 0) return false;
  for (const [key, value] of Object.entries(cleanup)) {
    if (/ResidueFree$/.test(key) && value !== true) return false;
    if (/Residue$/.test(key) && value && typeof value === 'object' && !allZero(value)) return false;
  }
  return true;
}

function allZero(value: unknown): boolean {
  if (typeof value === 'number') return value === 0;
  if (Array.isArray(value)) return value.every(allZero);
  if (value && typeof value === 'object') return Object.values(value).every(allZero);
  return true;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) throw new Error(message);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join(',') === [...right].sort().join(',');
}
