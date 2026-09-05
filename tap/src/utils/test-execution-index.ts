import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeReleaseObservation,
  resolveReuseStatus,
  type ReleaseObservation,
  type TestEvidenceStatus,
  type TestReuseStatus,
} from './test-execution-state';

export type TestExecutionIndexRecord = {
  caseId: string;
  applicationVersionFingerprint: string | null;
  releaseObservation: ReleaseObservation;
  executionEpochId: string;
  executionContextFingerprint: string | null;
  caseFingerprint: string;
  semanticCaseFingerprint?: string | null;
  implementationFingerprint: string | null;
  status: 'passed' | 'failed' | 'skipped' | 'not-run';
  evidenceStatus: TestEvidenceStatus;
  assertionStatuses?: ReadonlyArray<'verified' | 'observed-mismatch'>;
  cleanupEvidence: {
    apiZeroResidue: boolean;
    uiZeroResidue: boolean;
  } | null;
  receiptEvidenceFingerprint: string | null;
  evidenceFileFingerprint: string | null;
  reuseStatus: TestReuseStatus;
  runId: string;
  evidencePath: string | null;
  durationMs: number;
  recordedAt: string;
};

export type TestExecutionIndexInputRecord = Omit<
  TestExecutionIndexRecord,
  'applicationVersionFingerprint' | 'releaseObservation' | 'executionEpochId'
  | 'executionContextFingerprint' | 'evidenceStatus' | 'cleanupEvidence'
  | 'implementationFingerprint' | 'receiptEvidenceFingerprint' | 'evidenceFileFingerprint' | 'reuseStatus'
> & {
  applicationVersionFingerprint?: string | null;
  releaseObservation?: Partial<ReleaseObservation> | null;
  executionEpochId?: string;
  executionContextFingerprint?: string | null;
  semanticCaseFingerprint?: string | null;
  implementationFingerprint?: string | null;
  evidenceStatus?: TestEvidenceStatus;
  cleanupEvidence?: TestExecutionIndexRecord['cleanupEvidence'];
  receiptEvidenceFingerprint?: string | null;
  evidenceFileFingerprint?: string | null;
  reuseStatus?: TestReuseStatus;
};

export type TestExecutionIndexDocument = {
  schemaVersion: '4.0.0';
  records: TestExecutionIndexRecord[];
};

export class TestExecutionIndex {
  private readonly filePath: string;
  private readonly document: TestExecutionIndexDocument;
  private migrationPending: boolean;

  constructor(filePath: string) {
    this.filePath = filePath;
    const stored = fs.existsSync(filePath)
      ? JSON.parse(fs.readFileSync(filePath, 'utf8')) as { schemaVersion?: string; records?: TestExecutionIndexInputRecord[] }
      : null;
    const records = stored?.records ?? [];
    const normalizedRecords = records.map(normalizeRecord);
    const compactedRecords = compactRecords(normalizedRecords);
    this.migrationPending = Boolean(stored
      && (stored.schemaVersion !== '4.0.0' || compactedRecords.length !== normalizedRecords.length));
    this.document = { schemaVersion: '4.0.0', records: compactedRecords };
  }

  find(caseId: string, applicationVersionFingerprint: string, caseFingerprint: string) {
    return this.document.records.find((record) => (
      record.caseId === caseId
      && record.releaseObservation.fingerprint === applicationVersionFingerprint
      && record.caseFingerprint === caseFingerprint
    ));
  }

  latestPassed(caseId: string, caseFingerprint: string, implementationFingerprint?: string | null): TestExecutionIndexRecord | undefined {
    return this.document.records
      .filter((record) => record.caseId === caseId
        && record.caseFingerprint === caseFingerprint
        && (!implementationFingerprint || record.implementationFingerprint === implementationFingerprint)
        && record.status === 'passed'
        && record.evidenceStatus === 'complete')
      .sort((left, right) => {
        const recordedAtOrder = left.recordedAt.localeCompare(right.recordedAt);
        if (recordedAtOrder !== 0) return recordedAtOrder;
        return executionRecordQuality(left) - executionRecordQuality(right);
      })
      .at(-1);
  }

  upsert(
    records: readonly TestExecutionIndexInputRecord[],
    options: { replaceEquivalentRecords?: boolean } = {},
  ): boolean {
    let changed = this.migrationPending;
    for (const inputRecord of records) {
      const record = normalizeRecord(inputRecord);
      const index = this.document.records.findIndex((candidate) => recordKey(candidate) === recordKey(record));
      if (index >= 0 && JSON.stringify(this.document.records[index]) === JSON.stringify(record)) continue;
      if (index >= 0 && compareExecutionRecords(this.document.records[index], record) > 0) continue;
      if (index >= 0
        && compareExecutionRecords(this.document.records[index], record) === 0
        && !options.replaceEquivalentRecords) continue;
      if (index >= 0) this.document.records[index] = record;
      else this.document.records.push(record);
      changed = true;
    }
    if (!changed) return false;
    this.document.records.sort((left, right) => recordKey(left).localeCompare(recordKey(right)));
    this.persist();
    this.migrationPending = false;
    return true;
  }

  snapshot(): TestExecutionIndexDocument {
    return structuredClone(this.document);
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(this.document, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }
}

function normalizeRecord(record: TestExecutionIndexInputRecord): TestExecutionIndexRecord {
  const releaseObservation = normalizeReleaseObservation({
    releaseObservation: record.releaseObservation,
    applicationVersionFingerprint: record.applicationVersionFingerprint,
    observedAt: record.recordedAt,
  });
  const evidenceStatus = record.evidenceStatus ?? 'legacy-unverified';
  return {
    ...record,
    applicationVersionFingerprint: releaseObservation.fingerprint,
    releaseObservation,
    executionEpochId: record.executionEpochId?.trim() || record.runId,
    executionContextFingerprint: record.executionContextFingerprint ?? null,
    semanticCaseFingerprint: normalizeSha256(record.semanticCaseFingerprint),
    implementationFingerprint: normalizeSha256(record.implementationFingerprint),
    evidenceStatus,
    cleanupEvidence: record.cleanupEvidence ?? null,
    receiptEvidenceFingerprint: normalizeSha256(record.receiptEvidenceFingerprint),
    evidenceFileFingerprint: normalizeSha256(record.evidenceFileFingerprint),
    reuseStatus: record.reuseStatus ?? resolveReuseStatus({
      executionStatus: record.status,
      evidenceStatus,
      releaseObservation,
    }),
  };
}

function normalizeSha256(value: unknown): string | null {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function recordKey(record: TestExecutionIndexRecord): string {
  return [record.caseId, record.caseFingerprint, record.executionEpochId].join('\u0000');
}

function compactRecords(records: readonly TestExecutionIndexRecord[]): TestExecutionIndexRecord[] {
  const compacted = new Map<string, TestExecutionIndexRecord>();
  for (const record of records) {
    const key = recordKey(record);
    const current = compacted.get(key);
    if (!current || compareExecutionRecords(current, record) < 0) compacted.set(key, record);
  }
  return [...compacted.values()].sort((left, right) => recordKey(left).localeCompare(recordKey(right)));
}

function compareExecutionRecords(left: TestExecutionIndexRecord, right: TestExecutionIndexRecord): number {
  const qualityOrder = executionRecordQuality(left) - executionRecordQuality(right);
  if (qualityOrder !== 0) return qualityOrder;
  return left.recordedAt.localeCompare(right.recordedAt);
}

function executionRecordQuality(record: TestExecutionIndexRecord): number {
  return Number(record.evidenceStatus === 'complete')
    + Number(Boolean(record.semanticCaseFingerprint))
    + Number(record.cleanupEvidence?.apiZeroResidue === true)
    + Number(record.cleanupEvidence?.uiZeroResidue === true)
    + Number(Boolean(record.receiptEvidenceFingerprint))
    + Number(Boolean(record.evidenceFileFingerprint))
    + Number(Array.isArray(record.assertionStatuses) && record.assertionStatuses.length > 0
      && record.assertionStatuses.every((status) => status === 'verified'));
}
