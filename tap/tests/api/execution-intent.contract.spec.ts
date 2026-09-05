import { expect, test } from '@playwright/test';
import {
  assertExecutionIntentCheckpointState,
  assertExecutionIntentCompletion,
  assertExecutionIntentContract,
  assertExecutionIntentImpactScope,
  fingerprintExecutionIntent,
  fingerprintExecutionSelection,
  type ExecutionIntent,
} from '../../src/governance/execution-intent';
import { buildRunnerExecutionIntent } from '../../scripts/run-system-test';

function intent(overrides: Partial<ExecutionIntent> = {}): ExecutionIntent {
  return {
    intentId: 'intent-001',
    mode: 'incremental',
    stage: 'canary',
    scopeId: 'scope-001',
    scopeFingerprint: 'scope-fingerprint',
    plannedCaseIds: ['CASE-A', 'CASE-B'],
    classifiedExclusionCaseIds: [],
    partitionCaseIds: { moduleA: ['CASE-A'], moduleB: ['CASE-B'] },
    selectedCaseIds: ['CASE-A', 'CASE-B'],
    routes: { routeA: ['CASE-A'], routeB: ['CASE-B'] },
    ...overrides,
  };
}

test.describe('公共执行意图兜底合同', () => {
  test('system runner 从优化计划固化完整分区、选择集和路由', () => {
    const actual = buildRunnerExecutionIntent({
      runId: 'repair-001',
      stage: 'batch',
      plan: {
        planId: 'system:repair', contractFingerprint: 'contract', scopeFingerprint: 'scope',
        executionCaseIds: ['CASE-A', 'CASE-B'], excludedCaseIds: ['CASE-C'],
      } as never,
      selectedCaseIds: ['CASE-A'],
      contractCases: [
        { caseId: 'CASE-A', executionContextProfile: 'single' },
        { caseId: 'CASE-B', executionContextProfile: 'multi' },
      ],
      recipes: [
        { caseId: 'CASE-A', route: '/a' },
        { caseId: 'CASE-B', route: '/b' },
      ],
    });
    expect(actual).toMatchObject({
      plannedCaseIds: ['CASE-A', 'CASE-B'],
      classifiedExclusionCaseIds: ['CASE-C'],
      partitionCaseIds: { single: ['CASE-A'], multi: ['CASE-B'] },
      selectedCaseIds: ['CASE-A'], routes: { '/a': ['CASE-A'] },
    });
    expect(() => assertExecutionIntentContract({ intent: actual })).not.toThrow();
  });

  test('system runner 对缺路由的实际选择集硬阻断', () => {
    expect(() => buildRunnerExecutionIntent({
      runId: 'repair-route-missing', stage: 'batch',
      plan: {
        planId: 'system:repair', contractFingerprint: 'contract',
        executionCaseIds: ['CASE-A'], excludedCaseIds: [],
      } as never,
      selectedCaseIds: ['CASE-A'],
      contractCases: [{ caseId: 'CASE-A' }],
      recipes: [{ caseId: 'CASE-A', route: '' }],
    })).toThrow('EXECUTION_INTENT_ROUTE_REQUIRED:CASE-A');
  });

  test('拒绝缩成单模块的 canary 选择集', () => {
    expect(() => assertExecutionIntentContract({ intent: intent({ selectedCaseIds: ['CASE-A'], routes: { routeA: ['CASE-A'] } }) })).toThrow('EXECUTION_INTENT_CANARY_PARTITION_MISSING:moduleB');
  });

  test('允许显式声明模块级 canary 分区而不改变完整 planned 范围', () => {
    expect(() => assertExecutionIntentContract({
      intent: intent({
        canaryPartitionKeys: ['moduleA'],
        selectedCaseIds: ['CASE-A'],
        routes: { routeA: ['CASE-A'] },
      }),
    })).not.toThrow();
  });

  test('system runner 为按上下文拆批的 canary 只声明当前批次分区', () => {
    const actual = buildRunnerExecutionIntent({
      runId: 'repair-canary-single', stage: 'canary',
      plan: {
        planId: 'system:repair', contractFingerprint: 'contract',
        executionCaseIds: ['CASE-A', 'CASE-B'], excludedCaseIds: [],
      } as never,
      selectedCaseIds: ['CASE-A'],
      contractCases: [
        { caseId: 'CASE-A', executionContextProfile: 'single' },
        { caseId: 'CASE-B', executionContextProfile: 'multi' },
      ],
      recipes: [
        { caseId: 'CASE-A', route: '/a' },
        { caseId: 'CASE-B', route: '/b' },
      ],
    });
    expect(actual.canaryPartitionKeys).toEqual(['single']);
    expect(() => assertExecutionIntentContract({ intent: actual })).not.toThrow();
  });

  test('拒绝路由漏掉已选择用例', () => {
    expect(() => assertExecutionIntentContract({ intent: intent({ routes: { routeA: ['CASE-A'] } }) })).toThrow('EXECUTION_INTENT_ROUTE_SELECTION_MISMATCH');
  });

  test('拒绝分区遗漏范围内用例', () => {
    expect(() => assertExecutionIntentContract({ intent: intent({ partitionCaseIds: { moduleA: ['CASE-A'] } }) })).toThrow('EXECUTION_INTENT_PARTITION_INCOMPLETE:CASE-B');
  });

  test('增量影响范围由计划执行项与正式排除项守恒组成', () => {
    const value = intent({
      stage: 'batch',
      plannedCaseIds: ['CASE-A', 'CASE-B'],
      classifiedExclusionCaseIds: ['CASE-C'],
      partitionCaseIds: { moduleA: ['CASE-A'], moduleB: ['CASE-B'] },
      selectedCaseIds: ['CASE-A'],
      routes: { routeA: ['CASE-A'] },
    });
    expect(() => assertExecutionIntentImpactScope({
      intent: value,
      impactedCaseIds: ['CASE-A', 'CASE-B', 'CASE-C'],
    })).not.toThrow();
  });

  test('范围外复用项或遗漏影响项不能混入增量执行意图', () => {
    const value = intent({
      stage: 'batch',
      plannedCaseIds: ['CASE-A', 'UNRELATED-REUSED'],
      classifiedExclusionCaseIds: ['CASE-C'],
      partitionCaseIds: { moduleA: ['CASE-A', 'UNRELATED-REUSED'] },
      selectedCaseIds: ['CASE-A'],
      routes: { routeA: ['CASE-A'] },
    });
    expect(() => assertExecutionIntentImpactScope({
      intent: value,
      impactedCaseIds: ['CASE-A', 'CASE-B', 'CASE-C'],
    })).toThrow('EXECUTION_INTENT_IMPACT_SCOPE_MISMATCH:missing=CASE-B;unexpected=UNRELATED-REUSED');
    expect(() => assertExecutionIntentImpactScope({
      intent: value,
      impactedCaseIds: ['CASE-A', 'CASE-A', 'CASE-C'],
    })).toThrow('EXECUTION_INTENT_IMPACT_CASE_DUPLICATE');
  });

  test('拒绝旧检查点或选择集指纹复用', () => {
    const current = intent();
    expect(() => assertExecutionIntentContract({
      intent: current,
      checkpoint: { intentFingerprint: 'old-intent', selectedFingerprint: fingerprintExecutionSelection(current.selectedCaseIds) },
    })).toThrow('EXECUTION_INTENT_CHECKPOINT_FINGERPRINT_MISMATCH');
    expect(() => assertExecutionIntentContract({
      intent: current,
      checkpoint: { intentFingerprint: fingerprintExecutionIntent(current), selectedFingerprint: 'old-selection' },
    })).toThrow('EXECUTION_INTENT_CHECKPOINT_SELECTION_MISMATCH');
  });

  test('拒绝未完成却标记 completed-with-findings', () => {
    expect(() => assertExecutionIntentCompletion({
      intent: intent(), status: 'completed-with-findings', terminalCaseIds: ['CASE-A'],
    })).toThrow('EXECUTION_INTENT_COMPLETION_WITHOUT_ALL_TERMINAL_CASES');
  });

  test('允许全部选中用例执行完后带 findings 结束', () => {
    expect(() => assertExecutionIntentCompletion({
      intent: intent(), status: 'completed-with-findings', terminalCaseIds: ['CASE-A', 'CASE-B'],
    })).not.toThrow();
  });

  test('拒绝 checkpoint 中伪造或错配的终态集合', () => {
    expect(() => assertExecutionIntentCheckpointState({
      intent: intent(), terminalCaseIds: ['CASE-A'], incompleteCaseIds: [],
    })).toThrow('EXECUTION_INTENT_CHECKPOINT_INCOMPLETE_SET_MISMATCH');
    expect(() => assertExecutionIntentCheckpointState({
      intent: intent(), terminalCaseIds: ['CASE-A'], incompleteCaseIds: ['CASE-A', 'CASE-B'],
    })).toThrow('EXECUTION_INTENT_CHECKPOINT_TERMINAL_INCOMPLETE_OVERLAP');
  });
});
