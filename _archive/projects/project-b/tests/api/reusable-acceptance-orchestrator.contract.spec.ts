import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test.describe('商品中心验收编排接入合同', () => {
  test('验收 CLI 应在当前 CJS 执行模式下正常加载', async () => {
    const execution = spawnSync(process.execPath, [
      path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs'),
      path.resolve(process.cwd(), 'scripts/run-project-acceptance.ts'),
      '--project',
      'unknown-project',
      '--scan-only',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    const output = `${execution.stdout}${execution.stderr}`;

    expect(execution.status).toBe(1);
    expect(output).toContain('未知验收项目：unknown-project');
    expect(output).not.toContain('Top-level await');
  });

  test('Windows 前置命令不得通过 cmd 包装器启动', async () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'scripts/run-project-acceptance.ts'), 'utf8');

    expect(source).not.toContain("command: 'npm.cmd'");
    expect(source).toContain('command: process.execPath');
    expect(source).toContain('process.env.npm_execpath');
  });

  test('商品中心合同命令必须包含公共验收合同和领域适配合同', async () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(String(packageJson.scripts['test:product-center:sop:all:contracts']))
      .toContain('Test Automation Platform');
    for (const file of [
      'reusable-acceptance-orchestrator.contract.spec.ts',
      'merchant-center-acceptance-manifest.contract.spec.ts',
      'product-center-review-batch.contract.spec.ts',
      'step-runtime.contract.spec.ts',
    ]) {
      expect(String(packageJson.scripts['test:product-center:sop:contracts'])).toContain(file);
    }
  });
});
