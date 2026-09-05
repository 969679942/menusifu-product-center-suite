import { createHash } from 'node:crypto';
import type { ImpactedCase } from './contract-change-impact';

export type IncrementalTraceabilityRecord = {
  caseId: string;
  sourceIds: readonly string[];
  specFile: string;
  testTitle: string;
  rerunGrep: string;
};

export type IncrementalTestPlanInput = {
  contractVersion: string;
  diffFingerprint: string;
  changedRecords: ReadonlyArray<{ collection: string; id: string; route?: string }>;
  impactedCases: readonly ImpactedCase[];
  traceability: readonly IncrementalTraceabilityRecord[];
};

export type IncrementalTestPlan = {
  schemaVersion: '1.0.0';
  contractVersion: string;
  diffFingerprint: string;
  planFingerprint: string;
  changedRecords: IncrementalTestPlanInput['changedRecords'];
  cases: Array<IncrementalTraceabilityRecord & Pick<ImpactedCase, 'match' | 'changeIds'>>;
  specFiles: string[];
  grep: string;
};

export function buildIncrementalTestPlan(input: IncrementalTestPlanInput): IncrementalTestPlan {
  const traceability = new Map(input.traceability.map((record) => [record.caseId, record]));
  const cases = input.impactedCases.map((impact) => {
    const record = traceability.get(impact.caseId);
    if (!record) throw new Error(`增量用例缺少追溯记录：${impact.caseId}`);
    return {
      ...record,
      match: impact.match,
      changeIds: [...impact.changeIds].sort(),
    };
  }).sort((left, right) => left.caseId.localeCompare(right.caseId));
  const specFiles = [...new Set(cases.map((item) => item.specFile))].sort();
  const grep = `(?:${cases.map((item) => escapeRegExp(item.rerunGrep)).join('|')})`;
  const fingerprintInput = {
    schemaVersion: '1.0.0',
    contractVersion: input.contractVersion,
    diffFingerprint: input.diffFingerprint,
    changedRecords: [...input.changedRecords].sort((left, right) => `${left.collection}:${left.id}`.localeCompare(`${right.collection}:${right.id}`)),
    cases,
    specFiles,
    grep,
  } as const;

  return {
    ...fingerprintInput,
    planFingerprint: createHash('sha256').update(JSON.stringify(fingerprintInput)).digest('hex'),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
