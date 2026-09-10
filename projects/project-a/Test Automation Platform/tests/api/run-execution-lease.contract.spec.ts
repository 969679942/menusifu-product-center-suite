import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';
import { withSystemTestRunLease } from '../../src/governance/run-execution-lease';
import { reconcileSystemTestRunState } from '../../src/automation/system-test/system-test-run-state';

test('同系统同runId和不同runId都不能并发进入，其他系统可独立启动', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-lease-'));
  try {
    const input = { projectRoot: root, systemId: 'system-a', runId: 'run-1' };
    await withSystemTestRunLease(input, async () => {
      for (const runId of ['run-1', 'run-2']) {
        await expect(withSystemTestRunLease({ ...input, runId }, async () => { throw new Error('SHOULD_NOT_ENTER'); }))
          .rejects.toThrow('SYSTEM_TEST_RUN_ALREADY_ACTIVE');
      }
      await expect(withSystemTestRunLease({ ...input, systemId: 'system-b' }, async () => 7)).resolves.toBe(7);
    });
    let expired: Parameters<typeof withSystemTestRunLease>[0]['parentLease'];
    await withSystemTestRunLease(input, async (parentLease) => {
      expired = parentLease;
      await withSystemTestRunLease({ ...input, parentLease }, async () => {
        await expect(withSystemTestRunLease({ ...input, parentLease }, async () => 1)).rejects.toThrow('SYSTEM_TEST_RUN_ALREADY_ACTIVE');
      });
      await expect(withSystemTestRunLease({ ...input, parentLease, systemId: 'other' }, async () => 1)).rejects.toThrow('SYSTEM_TEST_RUN_PARENT_LEASE_INVALID');
    });
    await expect(withSystemTestRunLease({ ...input, parentLease: expired }, async () => 1)).rejects.toThrow('SYSTEM_TEST_RUN_PARENT_LEASE_INVALID');
    await expect(withSystemTestRunLease(input, async () => { throw new Error('synthetic-action-failure'); })).rejects.toThrow('synthetic-action-failure');
    await expect(withSystemTestRunLease(input, async () => 9)).resolves.toBe(9);
    await expect(withSystemTestRunLease({ ...input, runId: '../escape' }, async () => 1)).rejects.toThrow('SYSTEM_TEST_RUN_PATH_ID_INVALID');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('持有进程被强制终止后操作系统释放租约，无陈旧锁阻止恢复', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-lease-kill-'));
  const input = { projectRoot: root, systemId: 'system-a', runId: 'run-1' };
  const script = path.join(root, 'owner.ts');
  fs.writeFileSync(script, `import { withSystemTestRunLease } from ${JSON.stringify(path.resolve(__dirname, '../../src/governance/run-execution-lease.ts'))};
withSystemTestRunLease(${JSON.stringify(input)}, async () => { process.stdout.write('LEASE_READY'); await new Promise(() => {}); });`);
  const child = spawn(process.execPath, ['--import', pathToFileURL(require.resolve('tsx')).href, script], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('LEASE_FIXTURE_START_TIMEOUT')), 10_000);
      child.stdout.on('data', (data) => { if (data.toString().includes('LEASE_READY')) { clearTimeout(timer); resolve(); } });
      child.once('error', () => { clearTimeout(timer); reject(new Error('LEASE_FIXTURE_START_FAILED')); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('LEASE_FIXTURE_EXITED')); });
    });
    await expect(withSystemTestRunLease(input, async () => 1)).rejects.toThrow('SYSTEM_TEST_RUN_ALREADY_ACTIVE');
    const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
    await expect(withSystemTestRunLease(input, async () => 2)).resolves.toBe(2);
  } finally {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('父runner不在但子进程仍活跃时保留运行事实，拒绝误判为可恢复', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-state-child-'));
  try {
    const file = path.join(root, 'state.json');
    fs.writeFileSync(file, JSON.stringify({ status: 'running', runnerPid: null, childPid: process.pid, runId: 'run-1' }));
    const bytes = fs.readFileSync(file);
    expect(reconcileSystemTestRunState(file)?.status).toBe('running');
    expect(fs.readFileSync(file)).toEqual(bytes);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('实际runner在bootstrap写入前拒绝租约冲突及旧版活进程状态', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-startup-guard-'));
  try {
    const input = { projectRoot: root, systemId: 'fixture-system', runId: 'same-run' };
    const runRoot = path.join(root, 'output/system-test/fixture-system');
    const latest = path.join(runRoot, 'latest/contract.json');
    fs.mkdirSync(path.dirname(latest), { recursive: true }); fs.writeFileSync(latest, 'preserved-contract-bytes');
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ system: { systemId: input.systemId } }));
    const script = path.join(root, 'runner.ts');
    fs.writeFileSync(script, `import { runSystemTest } from ${JSON.stringify(path.resolve(__dirname, '../../scripts/run-system-test.ts'))};
runSystemTest({ manifestPath: 'manifest.json', runId: 'same-run', allowUnscopedSelection: true })
.then(() => { process.exitCode = 1; }).catch(error => { process.stdout.write(error.message); });`);
    const invoke = () => {
      const child = spawnSync(process.execPath, ['--import', pathToFileURL(require.resolve('tsx')).href, script], {
        env: { ...process.env, SYSTEM_TEST_PROJECT_ROOT: root }, windowsHide: true, encoding: 'utf8', timeout: 15_000,
      });
      expect(child.status).toBe(0);
      expect(child.stdout).toBe('SYSTEM_TEST_RUN_ALREADY_ACTIVE');
      expect(fs.readFileSync(latest, 'utf8')).toBe('preserved-contract-bytes');
      expect(fs.existsSync(path.join(runRoot, 'same-run/run-report.json'))).toBe(false);
    };
    await withSystemTestRunLease(input, async () => invoke());
    const statePath = path.join(runRoot, 'latest-run-state.json');
    fs.writeFileSync(statePath, JSON.stringify({ status: 'running', runId: 'same-run', runnerPid: process.pid, childPid: null }));
    const before = fs.readFileSync(statePath); invoke(); expect(fs.readFileSync(statePath)).toEqual(before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
