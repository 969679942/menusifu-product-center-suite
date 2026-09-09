import { expect, test } from '@playwright/test';
import { resolveSystemTestConcurrency } from '../../src/automation/system-test/system-test-concurrency';

test.describe('跨系统测试运行时并发合同', () => {
  test('应同时受项目、请求、CPU、内存和用例数量约束', async () => {
    const decision = resolveSystemTestConcurrency({
      configuredMaxWorkers: 8,
      requestedWorkers: 6,
      selectedCaseCount: 5,
      machine: { logicalCpuCount: 12, totalMemoryMb: 16_384, availableMemoryMb: 8_192 },
    });

    expect(decision).toMatchObject({
      cpuWorkerLimit: 4,
      memoryWorkerLimit: 9,
      effectiveWorkers: 4,
      limitingFactors: ['cpu-capacity'],
    });
  });

  test('低可用内存时必须自动降级为单 worker', async () => {
    const decision = resolveSystemTestConcurrency({
      configuredMaxWorkers: 4,
      requestedWorkers: 4,
      selectedCaseCount: 20,
      machine: { logicalCpuCount: 12, totalMemoryMb: 16_384, availableMemoryMb: 1_500 },
    });

    expect(decision.effectiveWorkers).toBe(1);
    expect(decision.limitingFactors).toContain('memory-capacity');
  });

  test('运行时请求不得突破系统适配器声明的最大并发', async () => {
    const decision = resolveSystemTestConcurrency({
      configuredMaxWorkers: 2,
      requestedWorkers: 12,
      selectedCaseCount: 82,
      machine: { logicalCpuCount: 24, totalMemoryMb: 65_536, availableMemoryMb: 48_000 },
    });

    expect(decision.effectiveWorkers).toBe(2);
    expect(decision.limitingFactors).toContain('project-cap');
  });
});
