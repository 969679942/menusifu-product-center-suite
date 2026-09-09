import os from 'node:os';

export type SystemTestMachineCapacity = {
  logicalCpuCount: number;
  totalMemoryMb: number;
  availableMemoryMb: number;
};

export type SystemTestConcurrencyDecision = {
  configuredMaxWorkers: number;
  requestedWorkers: number;
  selectedCaseCount: number;
  cpuWorkerLimit: number;
  memoryWorkerLimit: number;
  effectiveWorkers: number;
  machine: SystemTestMachineCapacity;
  policy: {
    cpuThreadsPerWorker: number;
    reserveMemoryMb: number;
    memoryPerWorkerMb: number;
  };
  limitingFactors: string[];
};

export function readSystemTestMachineCapacity(): SystemTestMachineCapacity {
  return {
    logicalCpuCount: Math.max(1, os.cpus().length),
    totalMemoryMb: Math.max(1, Math.floor(os.totalmem() / 1024 / 1024)),
    availableMemoryMb: Math.max(1, Math.floor(os.freemem() / 1024 / 1024)),
  };
}

export function resolveSystemTestConcurrency(input: {
  configuredMaxWorkers: number;
  selectedCaseCount: number;
  requestedWorkers?: number;
  machine?: SystemTestMachineCapacity;
  cpuThreadsPerWorker?: number;
  reserveMemoryMb?: number;
  memoryPerWorkerMb?: number;
}): SystemTestConcurrencyDecision {
  const configuredMaxWorkers = normalizePositiveInteger(input.configuredMaxWorkers, 1);
  const selectedCaseCount = normalizePositiveInteger(input.selectedCaseCount, 1);
  const requestedWorkers = normalizePositiveInteger(input.requestedWorkers, configuredMaxWorkers);
  const machine = input.machine ?? readSystemTestMachineCapacity();
  const cpuThreadsPerWorker = normalizePositiveInteger(input.cpuThreadsPerWorker, 3);
  const reserveMemoryMb = normalizeNonNegativeInteger(input.reserveMemoryMb, 1_024);
  const memoryPerWorkerMb = normalizePositiveInteger(input.memoryPerWorkerMb, 768);
  const cpuWorkerLimit = Math.max(1, Math.floor(machine.logicalCpuCount / cpuThreadsPerWorker));
  const memoryWorkerLimit = Math.max(
    1,
    Math.floor(Math.max(0, machine.availableMemoryMb - reserveMemoryMb) / memoryPerWorkerMb),
  );
  const effectiveWorkers = Math.max(1, Math.min(
    configuredMaxWorkers,
    requestedWorkers,
    selectedCaseCount,
    cpuWorkerLimit,
    memoryWorkerLimit,
  ));
  const limitingFactors: string[] = [];
  if (effectiveWorkers === configuredMaxWorkers) limitingFactors.push('project-cap');
  if (effectiveWorkers === requestedWorkers) limitingFactors.push('requested-cap');
  if (effectiveWorkers === selectedCaseCount) limitingFactors.push('selected-case-count');
  if (effectiveWorkers === cpuWorkerLimit) limitingFactors.push('cpu-capacity');
  if (effectiveWorkers === memoryWorkerLimit) limitingFactors.push('memory-capacity');
  return {
    configuredMaxWorkers,
    requestedWorkers,
    selectedCaseCount,
    cpuWorkerLimit,
    memoryWorkerLimit,
    effectiveWorkers,
    machine,
    policy: { cpuThreadsPerWorker, reserveMemoryMb, memoryPerWorkerMb },
    limitingFactors: [...new Set(limitingFactors)],
  };
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : fallback;
}

function normalizeNonNegativeInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}
