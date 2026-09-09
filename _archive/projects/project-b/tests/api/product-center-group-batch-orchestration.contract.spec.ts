import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildProductCenterGroupBatchPlan,
  evaluateProductCenterGroupBatchRetry,
  resolveProductCenterGroupStartedAt,
  resolveProductCenterGroupCaseIds,
  shouldBuildProductCenterGroupStrictReport,
  validateProductCenterGroupCompletedBatch,
} from '../../scripts/run-product-center-group-batches';
import { reconcileProductCenterGroupWatchdogFiles } from '../../scripts/run-product-center-group-with-watchdog';
import {
  buildProductCenterGroupExecutionFingerprint,
  buildProductCenterGroupOrchestrationFingerprint,
} from '../../utils/product-center-group-execution-fingerprint';

const bindings = [
  binding('TC-GRP-SPEC-001', 'read-only'),
  binding('TC-GRP-SPEC-002', 'query-reset'),
  binding('TC-GRP-SPEC-004', 'mutation-probe'),
  binding('TC-GRP-SPEC-020', 'crud-sop'),
];

test.describe('商品中心组批次调度与证据复用合同', () => {
  test('应把安全用例和写用例拆成两条独立通道并生成稳定批次指纹', () => {
    const first = buildProductCenterGroupBatchPlan({
      bindings,
      runLabel: 'contract',
      executionFingerprint: 'a'.repeat(64),
      safeBatchSize: 10,
      mutationBatchSize: 5,
    });
    const second = buildProductCenterGroupBatchPlan({
      bindings,
      runLabel: 'contract',
      executionFingerprint: 'a'.repeat(64),
      safeBatchSize: 10,
      mutationBatchSize: 5,
    });

    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({
      batchId: 'safe-01',
      lane: 'safe',
      caseIds: ['TC-GRP-SPEC-001'],
    });
    expect(first[1]).toMatchObject({
      batchId: 'mutation-01',
      lane: 'mutation',
      caseIds: ['TC-GRP-SPEC-002', 'TC-GRP-SPEC-004', 'TC-GRP-SPEC-020'],
    });
    expect(first.every((item) => /^[a-f0-9]{64}$/.test(item.batchFingerprint))).toBe(true);
  });

  test('声明造数或清理证据的校验用例必须进入写通道', () => {
    const plans = buildProductCenterGroupBatchPlan({
      bindings: [
        binding('TC-GRP-SPEC-005', 'form-validation'),
        binding('TC-GRP-SPEC-007', 'form-validation', ['api-read', 'api-mutation', 'cleanup']),
      ],
      runLabel: 'evidence-lane',
      executionFingerprint: 'a'.repeat(64),
      safeBatchSize: 10,
      mutationBatchSize: 5,
    });

    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({ lane: 'safe', caseIds: ['TC-GRP-SPEC-005'] });
    expect(plans[1]).toMatchObject({ lane: 'mutation', caseIds: ['TC-GRP-SPEC-007'] });
  });

  test('绑定或自动化实现变化必须改变批次指纹', () => {
    const baseline = buildProductCenterGroupBatchPlan({
      bindings,
      runLabel: 'contract',
      executionFingerprint: 'a'.repeat(64),
      safeBatchSize: 10,
      mutationBatchSize: 5,
    });
    const changedExecution = buildProductCenterGroupBatchPlan({
      bindings,
      runLabel: 'contract',
      executionFingerprint: 'b'.repeat(64),
      safeBatchSize: 10,
      mutationBatchSize: 5,
    });
    const changedBinding = buildProductCenterGroupBatchPlan({
      bindings: bindings.map((item) => item.caseId === 'TC-GRP-SPEC-001'
        ? { ...item, bindingFingerprint: 'sha256:changed' }
        : item),
      runLabel: 'contract',
      executionFingerprint: 'a'.repeat(64),
      safeBatchSize: 10,
      mutationBatchSize: 5,
    });

    expect(changedExecution.map((item) => item.batchFingerprint)).not.toEqual(
      baseline.map((item) => item.batchFingerprint),
    );
    expect(changedBinding[0].batchFingerprint).not.toBe(baseline[0].batchFingerprint);
  });

  test('恢复批次必须同时命中完整 case 集、批次指纹和 JSON 哈希', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-group-batch-'));
    try {
      const plan = buildProductCenterGroupBatchPlan({
        bindings: bindings.slice(1, 3),
        runLabel: 'contract',
        executionFingerprint: 'a'.repeat(64),
        safeBatchSize: 10,
        mutationBatchSize: 5,
      })[0];
      const jsonPath = path.join(root, plan.jsonFile);
      fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
      fs.writeFileSync(jsonPath, JSON.stringify(playwrightDocument(plan.caseIds)), 'utf8');
      const completed = {
        ...plan,
        jsonSha256: sha256File(jsonPath),
        completedAt: '2026-08-14T08:00:00.000Z',
      };

      expect(validateProductCenterGroupCompletedBatch(completed, plan, root)).toEqual([]);
      expect(validateProductCenterGroupCompletedBatch({
        ...completed,
        caseIds: [plan.caseIds[0]],
      }, plan, root)).toContain('BATCH_CASE_SET_MISMATCH');
      expect(validateProductCenterGroupCompletedBatch({
        ...completed,
        jsonSha256: 'b'.repeat(64),
      }, plan, root)).toContain('BATCH_JSON_HASH_MISMATCH');

      const findingsDocument = playwrightDocument(plan.caseIds) as any;
      findingsDocument.stats.unexpected = 1;
      fs.writeFileSync(jsonPath, JSON.stringify(findingsDocument), 'utf8');
      const findings = {
        ...completed,
        outcome: 'findings' as const,
        jsonSha256: sha256File(jsonPath),
      };
      expect(validateProductCenterGroupCompletedBatch(findings, plan, root)).toEqual([]);
      expect(validateProductCenterGroupCompletedBatch({ ...findings, outcome: 'passed' }, plan, root))
        .toContain('BATCH_JSON_CONTRACT_INVALID');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('自动化实现指纹必须覆盖 runner、页面、工厂和清理代码变化', () => {
    const current = buildProductCenterGroupExecutionFingerprint(path.resolve(__dirname, '../..'));
    expect(current.files).toContain('test-data/product-center/item-216/standard-item-216.factory.ts');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-group-fingerprint-'));
    try {
      const runnerPath = path.join(root, 'utils/product-center-group-runner.ts');
      fs.mkdirSync(path.dirname(runnerPath), { recursive: true });
      fs.writeFileSync(path.join(root, 'package.json'), '{"name":"contract"}', 'utf8');
      fs.writeFileSync(runnerPath, 'export const version = 1;', 'utf8');
      const first = buildProductCenterGroupExecutionFingerprint(root);
      fs.writeFileSync(runnerPath, 'export const version = 2;', 'utf8');
      const second = buildProductCenterGroupExecutionFingerprint(root);

      expect(first.files).toEqual(['utils/product-center-group-runner.ts']);
      expect(first.toolchain).toEqual({});
      expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(second.fingerprint).not.toBe(first.fingerprint);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('新增 npm 命令不得作废业务证据但执行工具链升级必须作废', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-group-toolchain-fingerprint-'));
    try {
      const runnerPath = path.join(root, 'utils/product-center-group-runner.ts');
      fs.mkdirSync(path.dirname(runnerPath), { recursive: true });
      fs.writeFileSync(runnerPath, 'export const runnerVersion = 1;', 'utf8');
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
        scripts: { test: 'playwright test' },
        devDependencies: { '@playwright/test': '1.60.0', playwright: '1.60.0', tsx: '4.23.1', typescript: '5.9.3' },
      }), 'utf8');
      const before = buildProductCenterGroupExecutionFingerprint(root);

      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
        scripts: { test: 'playwright test', 'test:another-system': 'tsx scripts/run-system-test.ts' },
        devDependencies: { '@playwright/test': '1.60.0', playwright: '1.60.0', tsx: '4.23.1', typescript: '5.9.3' },
      }), 'utf8');
      const afterScript = buildProductCenterGroupExecutionFingerprint(root);
      expect(afterScript.fingerprint).toBe(before.fingerprint);

      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
        scripts: { test: 'playwright test', 'test:another-system': 'tsx scripts/run-system-test.ts' },
        devDependencies: { '@playwright/test': '1.61.0', playwright: '1.61.0', tsx: '4.23.1', typescript: '5.9.3' },
      }), 'utf8');
      const afterToolchain = buildProductCenterGroupExecutionFingerprint(root);
      expect(afterToolchain.fingerprint).not.toBe(before.fingerprint);
      expect(afterToolchain.toolchain['@playwright/test']).toBe('1.61.0');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('仅瞬态导航失败且检查点零残留和无运行锁时允许批次自动重试', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-group-safe-retry-'));
    try {
      const jsonPath = path.join(root, 'batch.json');
      const checkpointRoot = path.join(root, 'checkpoints');
      const runtimeLockRoot = path.join(root, 'locks');
      fs.mkdirSync(checkpointRoot, { recursive: true });
      fs.writeFileSync(jsonPath, JSON.stringify(playwrightFailure([
        'TimeoutError: page.waitForResponse: Timeout 30000ms exceeded while waiting for event "response"',
        'Error: page.goto: Target page, context or browser has been closed',
      ])), 'utf8');
      fs.writeFileSync(path.join(checkpointRoot, 'ledger.json'), JSON.stringify({
        entries: [{ phase: 'residue-verified' }, { phase: 'residue-verified' }],
      }), 'utf8');
      expect(evaluateProductCenterGroupBatchRetry({ jsonPath, checkpointRoot, runtimeLockRoot }))
        .toEqual({ allowed: true, reasons: [] });

      fs.writeFileSync(jsonPath, JSON.stringify(playwrightFailure(['Expected value to be visible'])), 'utf8');
      expect(evaluateProductCenterGroupBatchRetry({ jsonPath, checkpointRoot, runtimeLockRoot }).reasons)
        .toContain('FAILURE_NOT_TRANSIENT_NAVIGATION');

      fs.writeFileSync(jsonPath, JSON.stringify(playwrightFailure([
        'TimeoutError: page.waitForResponse: Timeout 30000ms exceeded while waiting for event "response"',
      ])), 'utf8');
      fs.writeFileSync(path.join(checkpointRoot, 'ledger.json'), JSON.stringify({ entries: [{ phase: 'api-verified' }] }), 'utf8');
      expect(evaluateProductCenterGroupBatchRetry({ jsonPath, checkpointRoot, runtimeLockRoot }).reasons)
        .toContain('CHECKPOINT_RESIDUE_NOT_VERIFIED');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('调度与监控变更必须使用独立指纹且不得作废业务执行证据', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-group-orchestration-fingerprint-'));
    try {
      const schedulerPath = path.join(root, 'scripts/run-product-center-group-batches.ts');
      const runnerPath = path.join(root, 'utils/product-center-group-runner.ts');
      fs.mkdirSync(path.dirname(schedulerPath), { recursive: true });
      fs.mkdirSync(path.dirname(runnerPath), { recursive: true });
      fs.writeFileSync(schedulerPath, 'export const schedulerVersion = 1;', 'utf8');
      fs.writeFileSync(runnerPath, 'export const runnerVersion = 1;', 'utf8');
      const businessBefore = buildProductCenterGroupExecutionFingerprint(root);
      const orchestrationBefore = buildProductCenterGroupOrchestrationFingerprint(root);

      fs.writeFileSync(schedulerPath, 'export const schedulerVersion = 2;', 'utf8');
      const businessAfter = buildProductCenterGroupExecutionFingerprint(root);
      const orchestrationAfter = buildProductCenterGroupOrchestrationFingerprint(root);

      expect(businessAfter.fingerprint).toBe(businessBefore.fingerprint);
      expect(orchestrationAfter.fingerprint).not.toBe(orchestrationBefore.fingerprint);
      expect(businessAfter.files).toEqual(['utils/product-center-group-runner.ts']);
      expect(orchestrationAfter.files).toEqual(['scripts/run-product-center-group-batches.ts']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('总调度必须复用一次认证并为每批隔离进度、watchdog 与 checkpoint', () => {
    const scheduler = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/run-product-center-group-batches.ts'),
      'utf8',
    );
    const watchdog = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/run-product-center-group-with-watchdog.ts'),
      'utf8',
    );
    expect(scheduler).toContain("createProductCenterAuthBatchSession('pc-group-auth-')");
    expect(scheduler).toContain('Promise.all([');
    expect(scheduler).toContain("runLane(safePlans");
    expect(scheduler).toContain("runLane(mutationPlans");
    expect(scheduler).toContain("phase: 'authenticating' | 'executing' | 'merging' | 'reporting' | 'completed'");
    expect(scheduler).toContain("errorMessage: status === 'failed' ? failure?.message");
    expect(scheduler).toContain('all batches reusable; skipping authentication');
    expect(scheduler).toContain('PC_GROUP_AUTH_TIMEOUT_MS');
    expect(scheduler).toContain('orchestrationFingerprint: orchestrationVersion.fingerprint');
    expect(scheduler).toContain('terminateProcessTree(child.pid)');
    expect(scheduler).toContain('PC_GROUP_PROGRESS_FILE:');
    expect(scheduler).toContain('PC_GROUP_WATCHDOG_FILE:');
    expect(scheduler).toContain('PC_CHECKPOINT_ROOT:');
    expect(scheduler).toContain('PC_RUNTIME_LOCK_ROOT:');
    expect(scheduler).toContain("noDependencies: true");
    expect(watchdog).toContain("PC_AUTH_NO_DEPENDENCIES === '1'");
    expect(watchdog).toContain('process.env.PC_GROUP_WATCHDOG_FILE');
    expect(watchdog).toContain('process.env.PC_CHECKPOINT_ROOT');
    const teardown = fs.readFileSync(
      path.resolve(__dirname, '../../tests/setup/global.teardown.ts'),
      'utf8',
    );
    expect(teardown).toContain("process.env.PC_CHECKPOINT_ROOT || 'output/checkpoints'");
    expect(teardown).toContain('recoverProductCenterCheckpoints(checkpointRoot)');
    expect(teardown).toContain('findIncompleteCheckpointFiles(checkpointRoot)');
  });

  test('定向用例必须接受 CLI 或环境变量且禁止冲突后静默全量', () => {
    expect(resolveProductCenterGroupCaseIds({}, [
      '--case-ids=TC-GRP-ATTR-001,TC-GRP-SPEC-004',
    ])).toEqual(['TC-GRP-ATTR-001', 'TC-GRP-SPEC-004']);
    expect(resolveProductCenterGroupCaseIds({
      PC_GROUP_CASE_IDS: 'TC-GRP-SPEC-004',
    }, [])).toEqual(['TC-GRP-SPEC-004']);
    expect(() => resolveProductCenterGroupCaseIds({
      PC_GROUP_CASE_IDS: 'TC-GRP-SPEC-004',
    }, ['--case-ids=TC-GRP-ATTR-001'])).toThrow('组用例筛选冲突');
    expect(() => resolveProductCenterGroupCaseIds({}, [
      '--cases=TC-GRP-ATTR-001',
    ])).toThrow('请使用 --case-ids=');
  });

  test('定向运行只生成定向证据且不得错误触发全量严格报告', () => {
    expect(shouldBuildProductCenterGroupStrictReport([], undefined)).toBe(true);
    expect(shouldBuildProductCenterGroupStrictReport([], 'false')).toBe(false);
    expect(shouldBuildProductCenterGroupStrictReport(['TC-GRP-SPEC-002'], undefined)).toBe(false);
    expect(shouldBuildProductCenterGroupStrictReport(['TC-GRP-SPEC-002'], 'true')).toBe(false);

    const schedulerSource = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/run-product-center-group-batches.ts'),
      'utf8',
    );
    expect(schedulerSource).toContain("const runScope: SchedulerState['runScope'] = selectedCaseIds.length > 0 ? 'targeted' : 'full'");
    expect(schedulerSource).toContain('strictReportGenerated');
    expect(schedulerSource).toContain('product-center-group-scheduler-latest-${runScope}.json');
  });

  test('恢复运行必须继承首次启动时间而不是重置墙钟', () => {
    const initial = '2026-08-14T17:34:35.485Z';
    const resumed = '2026-08-14T18:08:41.750Z';
    expect(resolveProductCenterGroupStartedAt(initial, resumed, resumed)).toBe(initial);
    expect(resolveProductCenterGroupStartedAt(undefined, initial, resumed)).toBe(initial);
    expect(resolveProductCenterGroupStartedAt(undefined, undefined, resumed)).toBe(resumed);
  });

  test('下一次启动必须回收死亡进程留下的运行中 watchdog 状态', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-group-watchdog-'));
    const stalePath = path.join(root, 'product-center-group-stale-watchdog.json');
    const livePath = path.join(root, 'product-center-group-live-watchdog.json');
    const completedPath = path.join(root, 'product-center-group-completed-watchdog.json');
    const now = Date.parse('2026-08-14T09:10:00.000Z');
    try {
      fs.writeFileSync(stalePath, JSON.stringify(watchdogState({
        status: 'running', updatedAt: '2026-08-14T09:00:00.000Z', watchdogPid: null,
      })), 'utf8');
      fs.writeFileSync(livePath, JSON.stringify(watchdogState({
        status: 'running', updatedAt: '2026-08-14T09:00:00.000Z', watchdogPid: process.pid,
      })), 'utf8');
      fs.writeFileSync(completedPath, JSON.stringify(watchdogState({
        status: 'passed', updatedAt: '2026-08-14T09:00:00.000Z', watchdogPid: null,
      })), 'utf8');

      expect(reconcileProductCenterGroupWatchdogFiles(root, now)).toEqual([stalePath]);
      expect(JSON.parse(fs.readFileSync(stalePath, 'utf8'))).toMatchObject({
        status: 'interrupted', exitCode: 130, interruptionReason: 'legacy-running-state-stale',
      });
      expect(JSON.parse(fs.readFileSync(livePath, 'utf8'))).toMatchObject({ status: 'running' });
      expect(JSON.parse(fs.readFileSync(completedPath, 'utf8'))).toMatchObject({ status: 'passed' });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

function watchdogState(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    status: 'running', startedAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T09:00:00.000Z',
    attempt: 1, maxAttempts: 5, stallMs: 180_000, lastProgressAt: '2026-08-14T09:00:00.000Z',
    lastProgressSource: 'process-started', jsonPath: 'output/result.json', exitCode: null, signal: null,
    watchdogPid: null, childPid: null, interruptionReason: null, ...overrides,
  };
}

function binding(
  caseId: string,
  executionProfile: Parameters<typeof buildProductCenterGroupBatchPlan>[0]['bindings'][number]['executionProfile'],
  requiredEvidence: string[] = ['query-reset', 'crud-sop', 'mutation-probe', 'dependency-probe', 'terminal-probe']
    .includes(executionProfile) ? ['api-mutation', 'cleanup'] : [],
): Parameters<typeof buildProductCenterGroupBatchPlan>[0]['bindings'][number] {
  return {
    caseId,
    generationAllowed: true,
    executionProfile,
    bindingFingerprint: `sha256:${caseId}`,
    requiredEvidence,
  };
}

function playwrightDocument(caseIds: readonly string[]): object {
  return {
    stats: { startTime: '2026-08-14T08:00:00.000Z', duration: 1000, expected: caseIds.length, unexpected: 0, skipped: 0, flaky: 0 },
    errors: [],
    suites: [{ specs: caseIds.map((caseId) => ({ title: caseId, tags: [`@case-${caseId}`], tests: [] })) }],
  };
}

function playwrightFailure(messages: readonly string[]): object {
  return {
    stats: { unexpected: 1 },
    suites: [{
      specs: [{
        tests: [{ results: [{ status: 'failed', errors: messages.map((message) => ({ message })) }] }],
      }],
    }],
  };
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
