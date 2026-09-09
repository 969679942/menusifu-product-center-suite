import {
  resolveSystemTestConcurrency,
  type SystemTestConcurrencyDecision,
} from '../../../../Test Automation Platform/src/automation/system-test/system-test-concurrency';

export function resolveMerchantCenterPlaywrightConcurrency(input: {
  maxWorkers: number;
  requestedWorkers?: number;
  selectedCaseCount?: number;
  reserveMemoryMb?: number;
  memoryPerWorkerMb?: number;
}): SystemTestConcurrencyDecision {
  return resolveSystemTestConcurrency({
    configuredMaxWorkers: input.maxWorkers,
    requestedWorkers: input.requestedWorkers,
    selectedCaseCount: input.selectedCaseCount ?? Number.MAX_SAFE_INTEGER,
    reserveMemoryMb: input.reserveMemoryMb ?? 2_048,
    memoryPerWorkerMb: input.memoryPerWorkerMb ?? 1_536,
  });
}
