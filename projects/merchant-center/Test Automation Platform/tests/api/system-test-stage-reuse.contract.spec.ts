import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  evaluateSystemTestStageReceipt,
  writePassedSystemTestStageReceiptFromEnvironment,
} from '../../src/automation/system-test/system-test-stage-receipt';
import {
  buildSystemTestCaseImplementationFingerprint,
  collectSystemTestRecipeAdapterIds,
  resolveSystemTestExecutionContextProfile,
  shouldRetrySystemTestStageProcess,
} from '../../scripts/run-system-test';
import { partitionSystemTestCasesByExecutionContext } from '../../scripts/run-system-test-flow';
import { refreshSystemTestAdapterImplementationFingerprints } from '../../scripts/compile-system-test-plan';

test('相同上下文和未变化登录态应复用公共阶段收据', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-stage-'));
  const storageStatePath = path.join(directory, 'auth.json');
  const receiptPath = path.join(directory, 'setup.json');
  fs.writeFileSync(storageStatePath, JSON.stringify({ cookies: [{ expires: Date.now() / 1_000 + 3_600 }] }));
  const receipt = writePassedSystemTestStageReceiptFromEnvironment({
    env: {
      SYSTEM_TEST_STAGE: 'setup',
      SYSTEM_TEST_STAGE_RECEIPT: receiptPath,
      SYSTEM_TEST_STAGE_FINGERPRINT: 'stage-a',
      SYSTEM_TEST_CONTEXT_FINGERPRINT: 'context-a',
      SYSTEM_TEST_STAGE_IMPLEMENTATION_FINGERPRINT: 'implementation-a',
    },
    storageStatePath,
  });
  expect(evaluateSystemTestStageReceipt({
    receipt,
    expected: {
      stage: 'setup', fingerprint: 'stage-a', contextFingerprint: 'context-a',
      implementationFingerprint: 'implementation-a',
    },
  })).toEqual({ reusable: true, reason: 'same-stage-context-implementation-and-storage' });
});

test('上下文、路由或登录态变化必须在业务写入前拒绝复用', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-stage-negative-'));
  const storageStatePath = path.join(directory, 'auth.json');
  fs.writeFileSync(storageStatePath, JSON.stringify({ cookies: [] }));
  const receipt = writePassedSystemTestStageReceiptFromEnvironment({
    env: {
      SYSTEM_TEST_STAGE: 'preflight',
      SYSTEM_TEST_STAGE_ROUTE: '/module/a',
      SYSTEM_TEST_STAGE_RECEIPT: path.join(directory, 'preflight.json'),
      SYSTEM_TEST_STAGE_FINGERPRINT: 'stage-a',
      SYSTEM_TEST_CONTEXT_FINGERPRINT: 'context-a',
      SYSTEM_TEST_STAGE_IMPLEMENTATION_FINGERPRINT: 'implementation-a',
    },
    storageStatePath,
  });
  const expected = {
    stage: 'preflight' as const, fingerprint: 'stage-a', route: '/module/a',
    contextFingerprint: 'context-b', implementationFingerprint: 'implementation-a',
  };
  expect(evaluateSystemTestStageReceipt({ receipt, expected }).reason).toBe('context-mismatch');
  fs.writeFileSync(storageStatePath, JSON.stringify({ cookies: [], changed: true }));
  expect(evaluateSystemTestStageReceipt({
    receipt,
    expected: { ...expected, contextFingerprint: 'context-a' },
  }).reason).toBe('storage-state-changed');
});

test('混合执行上下文应提前分批且确定性失败不得盲重试', () => {
  expect(resolveSystemTestExecutionContextProfile([
    { executionContextProfile: 'tenant-a' },
    { executionContextProfile: 'tenant-b' },
  ])).toEqual({ ok: false, profiles: ['tenant-a', 'tenant-b'] });
  expect(shouldRetrySystemTestStageProcess(1, 0, 1)).toBe(false);
  expect(shouldRetrySystemTestStageProcess(124, 0, 1)).toBe(true);
  expect(shouldRetrySystemTestStageProcess(124, 1, 1)).toBe(false);
  expect(partitionSystemTestCasesByExecutionContext(['case-b', 'case-a', 'case-c'], [
    { caseId: 'case-a', executionContextProfile: 'tenant-a' },
    { caseId: 'case-b', executionContextProfile: 'tenant-b' },
    { caseId: 'case-c', executionContextProfile: 'tenant-a' },
  ])).toEqual([
    { profile: 'tenant-a', caseIds: ['case-a', 'case-c'] },
    { profile: 'tenant-b', caseIds: ['case-b'] },
  ]);
});

test('公共编译器应自动刷新适配器及依赖指纹', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-adapter-refresh-'));
  fs.writeFileSync(path.join(directory, 'adapter.ts'), 'export const value = 1;');
  fs.writeFileSync(path.join(directory, 'dependency.ts'), 'export const dependency = 1;');
  const refreshed = refreshSystemTestAdapterImplementationFingerprints(directory, {
    schemaVersion: '1.0.0',
    systemId: 'neutral-system',
    operationKeys: [],
    externalCapabilities: [],
    adapters: [{
      id: 'neutral-probe',
      kind: 'probe',
      actions: ['read'],
      implementation: {
        path: 'adapter.ts', sha256: 'stale',
        dependencies: [{ path: 'dependency.ts', sha256: 'stale' }],
      },
    }],
  });
  expect(refreshed.adapters[0].implementation.sha256).not.toBe('stale');
  expect(refreshed.adapters[0].implementation.dependencies?.[0].sha256).not.toBe('stale');
});

test('适配器源码分段指纹只响应声明分段内的实现变化', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-adapter-section-'));
  const sourcePath = path.join(directory, 'adapter.ts');
  const writeSource = (selected: number, unrelated: number) => fs.writeFileSync(sourcePath, [
    `export const unrelated = ${unrelated};`,
    '// system-test-fingerprint:start selected-adapter',
    `export const selected = ${selected};`,
    '// system-test-fingerprint:end selected-adapter',
  ].join('\n'));
  const catalog = {
    schemaVersion: '1.0.0' as const,
    systemId: 'neutral-system',
    operationKeys: [],
    externalCapabilities: [],
    adapters: [{
      id: 'selected-adapter', kind: 'capability' as const, actions: ['read' as const],
      implementation: { path: 'adapter.ts', sha256: 'stale', sourceSection: 'selected-adapter' },
    }],
  };
  writeSource(1, 1);
  const first = refreshSystemTestAdapterImplementationFingerprints(directory, catalog);
  writeSource(1, 2);
  const unrelatedChanged = refreshSystemTestAdapterImplementationFingerprints(directory, catalog);
  writeSource(2, 2);
  const selectedChanged = refreshSystemTestAdapterImplementationFingerprints(directory, catalog);
  expect(unrelatedChanged.adapters[0].implementation.sha256).toBe(first.adapters[0].implementation.sha256);
  expect(selectedChanged.adapters[0].implementation.sha256).not.toBe(first.adapters[0].implementation.sha256);
});

test('用例实现指纹只包含该用例实际使用的适配器', () => {
  const adapters = [
    { id: 'adapter-a', kind: 'capability' as const, actions: ['read' as const], implementation: { path: 'a.ts', sha256: 'a1' } },
    { id: 'adapter-b', kind: 'capability' as const, actions: ['read' as const], implementation: { path: 'b.ts', sha256: 'b1' } },
  ];
  const adapterIds = collectSystemTestRecipeAdapterIds({
    capabilities: [{ id: 'adapter-a' }],
  });
  const fingerprint = (current: typeof adapters) => buildSystemTestCaseImplementationFingerprint({
    adapters: current,
    adapterIds,
    evidenceRuntime: 'runtime-v1',
    execution: { project: 'neutral' },
    runnerPath: __filename,
  });
  expect(fingerprint([{ ...adapters[0] }, { ...adapters[1], implementation: { path: 'b.ts', sha256: 'b2' } }]))
    .toBe(fingerprint(adapters));
  expect(fingerprint([{ ...adapters[0], implementation: { path: 'a.ts', sha256: 'a2' } }, adapters[1]]))
    .not.toBe(fingerprint(adapters));
});
