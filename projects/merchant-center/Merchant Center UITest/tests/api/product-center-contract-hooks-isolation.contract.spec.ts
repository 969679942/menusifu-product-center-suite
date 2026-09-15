import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      for (const [name, value] of Object.entries(snapshot(target))) files[`${entry.name}/${name}`] = value;
    } else if (entry.name !== 'hook-result.json') files[entry.name] = fs.readFileSync(target, 'base64');
  }
  return files;
}

for (const mode of ['contract', 'explicit-contract', 'mixed', 'business']) {
  test(`真实全局钩子应遵守隔离边界：${mode}`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-contract-hooks-'));
    try {
      for (const directory of ['output/checkpoints', 'output/runtime-locks', 'output/performance', 'allure-results']) {
        fs.mkdirSync(path.join(root, directory), { recursive: true });
      }
      fs.writeFileSync(path.join(root, 'output/auth-state.json'), '{"sentinel":true}');
      fs.writeFileSync(path.join(root, 'output/checkpoints/malformed.json'), '{broken');
      fs.writeFileSync(path.join(root, 'output/runtime-locks/sentinel.json'), '{broken');
      fs.writeFileSync(path.join(root, 'allure-results/sentinel.json'), '{"sentinel":true}');
      for (let index = 0; index < 110; index += 1) {
        fs.writeFileSync(path.join(root, `output/performance/product-center-timing-${index}.json`), '{}');
      }
      const before = snapshot(root);
      const child = spawnSync(process.execPath, ['--require', require.resolve('tsx/cjs'), path.resolve(__dirname, '../helpers/contract-hooks-child.ts'), mode], {
        cwd: root, encoding: 'utf8', timeout: 30_000,
        env: {
          ...process.env,
          TSX_TSCONFIG_PATH: path.resolve(__dirname, '../../tsconfig.json'),
          MC_STORAGE_STATE_PATH: path.join(root, 'output/auth-state.json'),
          PC_CHECKPOINT_ROOT: path.join(root, 'output/checkpoints'),
          PC_RUNTIME_LOCK_ROOT: path.join(root, 'output/runtime-locks'),
          PC_PRESERVE_AUTH_STATE: '0',
          PC_CONTRACT_ISOLATED: mode === 'explicit-contract' || mode === 'mixed' ? '1' : '0',
          SYSTEM_TEST_AUDIT_EVENT_LOG: path.join(root, 'audit.jsonl'),
          TEST_WAIT_TELEMETRY_PATH: 'synthetic-unchanged',
        },
      });
      expect(child.status, '隔离子进程必须正常结束（不输出可能含敏感字段的子进程日志）').toBe(0);
      const result = JSON.parse(fs.readFileSync(path.join(root, 'hook-result.json'), 'utf8'));
      if (mode === 'business') {
        expect(result.authExists).toBe(false);
        expect(result.teardownRejected).toBe(true);
        expect(result.telemetryUnchanged).toBe(false);
      } else {
        expect(result).toEqual({ setupRejected: mode === 'mixed', teardownRejected: mode === 'mixed', authExists: true, telemetryUnchanged: true });
        expect(snapshot(root)).toEqual(before);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
