export type RuntimeOperationReceipt = {
  operationKey: string;
  sequence?: number;
  observed: boolean;
  method: string;
  status: 'started' | 'passed' | 'failed' | 'skipped';
  startedAt?: string;
  finishedAt?: string;
};

export type RuntimeAssertionReceipt = {
  claimId: string;
  status: 'verified' | 'observed-mismatch';
  expectedValue: unknown;
  actualValue?: unknown;
  actualStatus: 'observed' | 'unobserved';
  unobservedReason?: string;
  observationChannel: 'ui' | 'api' | 'downstream' | 'cleanup';
  authority: 'user-visible' | 'persistence' | 'integration-terminal' | 'residue';
  comparison: 'matched' | 'mismatched';
};

export type SystemTestRuntimeContractFindingCode =
  | 'CASE_ID_MISMATCH'
  | 'OPERATION_RECEIPT_MISSING'
  | 'OPERATION_RECEIPT_DUPLICATE'
  | 'OPERATION_RECEIPT_INVALID'
  | 'OPERATION_RECEIPT_ORPHAN'
  | 'ASSERTION_RECEIPT_MISSING'
  | 'ASSERTION_RECEIPT_DUPLICATE'
  | 'ASSERTION_RECEIPT_ORPHAN'
  | 'ASSERTION_EXPECTED_MISSING'
  | 'ASSERTION_ACTUAL_MISSING'
  | 'ASSERTION_ACTUAL_UNOBSERVED'
  | 'ASSERTION_UNOBSERVED_REASON_MISSING'
  | 'ASSERTION_OBSERVATION_INVALID'
  | 'ASSERTION_COMPARISON_INVALID';

export type SystemTestRuntimeContractFinding = {
  code: SystemTestRuntimeContractFindingCode;
  key: string;
  message: string;
};

export type SystemTestRuntimeContractEvaluation = {
  status: 'complete' | 'incomplete';
  missingOperationKeys: string[];
  duplicateOperationKeys: string[];
  missingAssertionIds: string[];
  duplicateAssertionIds: string[];
  findings: SystemTestRuntimeContractFinding[];
};

export function evaluateSystemTestRuntimeContract(input: {
  caseId: string;
  requiredOperationKeys: readonly string[];
  requiredAssertionIds: readonly string[];
  operationReceipts?: readonly RuntimeOperationReceipt[];
  assertionReceipts?: readonly RuntimeAssertionReceipt[];
}): SystemTestRuntimeContractEvaluation {
  const findings: SystemTestRuntimeContractFinding[] = [];
  const requiredOperations = unique(input.requiredOperationKeys);
  const requiredAssertions = unique(input.requiredAssertionIds);
  const operations = input.operationReceipts ?? [];
  const assertions = input.assertionReceipts ?? [];
  const operationOccurrenceCounts = countBy(operations, operationOccurrenceKey);
  const assertionCounts = countBy(assertions, (receipt) => receipt.claimId);
  const observedOperations = new Set(operations.filter((receipt) => receipt.observed && receipt.status === 'passed')
    .map((receipt) => receipt.operationKey));
  const missingOperationKeys = requiredOperations.filter((key) => !observedOperations.has(key));
  const duplicateOperationKeys = unique(operations
    .filter((receipt) => requiredOperations.includes(receipt.operationKey)
      && (operationOccurrenceCounts.get(operationOccurrenceKey(receipt)) ?? 0) > 1)
    .map((receipt) => receipt.operationKey));
  const missingAssertionIds = requiredAssertions.filter((id) => !assertionCounts.has(id));
  const duplicateAssertionIds = requiredAssertions.filter((id) => (assertionCounts.get(id) ?? 0) > 1);
  const requiredOperationSet = new Set(requiredOperations);
  const requiredAssertionSet = new Set(requiredAssertions);

  if (!input.caseId.trim()) addFinding(findings, 'CASE_ID_MISMATCH', 'caseId', '运行时合同缺少 caseId。');
  for (const key of missingOperationKeys) addFinding(findings, 'OPERATION_RECEIPT_MISSING', key, `缺少业务操作收据：${key}`);
  for (const key of duplicateOperationKeys) addFinding(findings, 'OPERATION_RECEIPT_DUPLICATE', key, `业务操作收据重复：${key}`);
  for (const receipt of operations) {
    if (!requiredOperationSet.has(receipt.operationKey)) {
      addFinding(findings, 'OPERATION_RECEIPT_ORPHAN', receipt.operationKey, `存在未声明的业务操作收据：${receipt.operationKey}`);
    }
    if (!receipt.operationKey.trim() || !receipt.method.trim() || receipt.status === 'started'
      || (receipt.observed && receipt.status !== 'passed')) {
      addFinding(findings, 'OPERATION_RECEIPT_INVALID', receipt.operationKey || '<empty>', '业务操作收据缺少稳定方法、终态或成功观察结果。');
    }
  }
  for (const id of missingAssertionIds) addFinding(findings, 'ASSERTION_RECEIPT_MISSING', id, `缺少断言收据：${id}`);
  for (const id of duplicateAssertionIds) addFinding(findings, 'ASSERTION_RECEIPT_DUPLICATE', id, `断言收据重复：${id}`);
  for (const receipt of assertions) {
    if (!requiredAssertionSet.has(receipt.claimId)) {
      addFinding(findings, 'ASSERTION_RECEIPT_ORPHAN', receipt.claimId, `存在未声明的断言收据：${receipt.claimId}`);
    }
    if (receipt.expectedValue === undefined) addFinding(findings, 'ASSERTION_EXPECTED_MISSING', receipt.claimId, '断言缺少期望值。');
    if (receipt.actualStatus === 'observed' && receipt.actualValue === undefined) {
      addFinding(findings, 'ASSERTION_ACTUAL_MISSING', receipt.claimId, '断言标记为已观测但缺少实际值。');
    }
    if (receipt.actualStatus === 'unobserved') {
      addFinding(findings, 'ASSERTION_ACTUAL_UNOBSERVED', receipt.claimId, '断言实际值未观测，证据不完整。');
      if (!receipt.unobservedReason?.trim()) {
        addFinding(findings, 'ASSERTION_UNOBSERVED_REASON_MISSING', receipt.claimId, '实际值未观测但缺少原因。');
      }
    }
    if (!isObservationPairValid(receipt.observationChannel, receipt.authority)) {
      addFinding(findings, 'ASSERTION_OBSERVATION_INVALID', receipt.claimId, '断言观察通道与验证权威不匹配。');
    }
    if ((receipt.status === 'verified' && receipt.comparison !== 'matched')
      || (receipt.status === 'observed-mismatch' && receipt.comparison !== 'mismatched')) {
      addFinding(findings, 'ASSERTION_COMPARISON_INVALID', receipt.claimId, '断言状态与期望/实际比较结果不一致。');
    }
  }

  return {
    status: findings.length === 0 ? 'complete' : 'incomplete',
    missingOperationKeys,
    duplicateOperationKeys,
    missingAssertionIds,
    duplicateAssertionIds,
    findings: findings.sort((left, right) => `${left.code}:${left.key}`.localeCompare(`${right.code}:${right.key}`)),
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

function countBy<T>(values: readonly T[], keyOf: (value: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = keyOf(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function operationOccurrenceKey(receipt: RuntimeOperationReceipt): string {
  if (receipt.sequence !== undefined) return `${receipt.operationKey}:sequence:${receipt.sequence}`;
  if (receipt.startedAt || receipt.finishedAt) {
    return `${receipt.operationKey}:time:${receipt.startedAt ?? ''}:${receipt.finishedAt ?? ''}`;
  }
  return receipt.operationKey;
}

function isObservationPairValid(
  channel: RuntimeAssertionReceipt['observationChannel'],
  authority: RuntimeAssertionReceipt['authority'],
): boolean {
  return (channel === 'ui' && authority === 'user-visible')
    || (channel === 'api' && authority === 'persistence')
    || (channel === 'downstream' && authority === 'integration-terminal')
    || (channel === 'cleanup' && authority === 'residue');
}

function addFinding(
  findings: SystemTestRuntimeContractFinding[],
  code: SystemTestRuntimeContractFindingCode,
  key: string,
  message: string,
): void {
  findings.push({ code, key, message });
}
