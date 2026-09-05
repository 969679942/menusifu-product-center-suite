import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileAuditEventStore } from '../../src/audit/event-log';
import type { SystemTestManifest } from '../../src/automation/system-test/system-test-contract';
import type { SystemTestPlan } from '../../src/automation/system-test/system-test-plan-compiler';
import {
  appendFlowAuditEvent,
  resolveFlowExecutionSelection,
  resolveProjectAuditEventLogPath,
} from '../../scripts/run-system-test-flow';
import {
  applySystemTestAdditionalReporterArguments,
  resolveSystemTestOptimizationArguments,
} from '../../scripts/run-system-test-cli';

test('统一流程审计按应用和业务域记录阶段，并把重复运行记为重试', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-flow-audit-'));
  try {
    const filePath = path.join(directory, 'events.jsonl');
    const manifest = {
      system: {
        systemId: 'inventory-system',
        portabilityScope: {
          applicationId: 'inventory-application',
          businessDomainId: 'inventory',
        },
      },
    } as unknown as SystemTestManifest;
    const plan = { systemId: 'inventory-plan' } as SystemTestPlan;
    const input = {
      eventType: 'plan.compiled' as const,
      manifest,
      plan,
      flowId: 'inventory-flow-001',
      outcome: 'success' as const,
      checkpointId: 'inventory-flow-001',
    };

    appendFlowAuditEvent(filePath, input);
    appendFlowAuditEvent(filePath, input);

    const events = new FileAuditEventStore({ filePath }).readAll();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      applicationId: 'inventory-application',
      businessDomainId: 'inventory',
      planId: 'inventory-plan',
      attempt: 1,
      retryOfEventId: null,
    });
    expect(events[1]).toMatchObject({
      attempt: 2,
      retryOfEventId: events[0].eventId,
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('项目未显式配置事件日志路径时不写入公共平台目录', () => {
  const manifest = { system: { systemId: 'reference-system' } } as unknown as SystemTestManifest;
  const plan = { systemId: 'reference-plan' } as SystemTestPlan;
  expect(() => appendFlowAuditEvent(null, {
    eventType: 'flow.started',
    manifest,
    plan,
    flowId: 'reference-flow',
    outcome: 'success',
    checkpointId: 'reference-flow',
  })).not.toThrow();
});

test('项目审计日志路径必须显式位于项目目录内', () => {
  const root = path.resolve('project-fixture');
  expect(resolveProjectAuditEventLogPath(root, 'output/audit/events.jsonl'))
    .toBe(path.join(root, 'output/audit/events.jsonl'));
  expect(() => resolveProjectAuditEventLogPath(root, '../platform/events.jsonl'))
    .toThrow('AUDIT_EVENT_LOG_PATH_INVALID');
  expect(() => resolveProjectAuditEventLogPath(root, path.resolve('outside-events.jsonl')))
    .toThrow('AUDIT_EVENT_LOG_PATH_INVALID');
});

test('项目可通过公共命令追加报告器而不复制运行器实现', () => {
  const env: NodeJS.ProcessEnv = { SYSTEM_TEST_ADDITIONAL_REPORTERS: 'existing-reporter.ts' };
  applySystemTestAdditionalReporterArguments(env, ['--additional-reporter=adapters/system.reporter.ts']);
  expect(env.SYSTEM_TEST_ADDITIONAL_REPORTERS?.split(',')).toEqual([
    'existing-reporter.ts',
    path.resolve('adapters/system.reporter.ts').replaceAll('\\', '/'),
  ]);
});

test('公共系统测试命令必须透传优化计划和阶段门禁参数', () => {
  expect(resolveSystemTestOptimizationArguments([
    '--optimization-plan=output/system-test-optimization/plan.json',
    '--optimization-stage=canary',
  ])).toEqual({
    optimizationPlanPath: 'output/system-test-optimization/plan.json',
    optimizationStage: 'canary',
  });
  expect(() => resolveSystemTestOptimizationArguments(['--optimization-stage=unknown']))
    .toThrow('无效优化阶段');
  const flowSource = fs.readFileSync(
    path.resolve(__dirname, '../../scripts/run-system-test-flow.ts'),
    'utf8',
  );
  expect(flowSource).toContain('resolveSystemTestOptimizationArguments(process.argv.slice(2))');
  expect(flowSource).toContain('optimizationPlanPath,');
  expect(flowSource).toContain('optimizationStage,');
});

test('canary 阶段使用优化计划的定向选择，不被编译后的全量选择覆盖', () => {
  expect(resolveFlowExecutionSelection({
    fullRegression: false,
    selectedCaseIds: ['CASE-001', 'CASE-002', 'CASE-003'],
    availableCaseIds: ['CASE-001', 'CASE-002', 'CASE-003'],
    optimizationPlan: { canaryCaseIds: ['CASE-002'] },
    optimizationStage: 'canary',
  })).toEqual(['CASE-002']);
  expect(resolveFlowExecutionSelection({
    fullRegression: false,
    selectedCaseIds: ['CASE-001', 'CASE-002'],
    availableCaseIds: ['CASE-001', 'CASE-002'],
    optimizationPlan: { canaryCaseIds: ['CASE-002'] },
    optimizationStage: 'batch',
  })).toEqual(['CASE-001', 'CASE-002']);
});
