import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

test.describe('中文步骤运行时适配', () => {
  test('带步骤装饰器的方法应可在 Playwright Test 之外执行', async () => {
    const source = [
      "import { MerchantShellPage } from './pages/sidebar.page';",
      "async function main(){ const page={url:()=> 'https://example.test/alpha'}; await new MerchantShellPage(page as never).expectPathname('/alpha'); }",
      "void main().catch((error)=>{ console.error(String(error)); process.exitCode=1; });",
    ].join(' ');
    const execution = spawnSync(process.execPath, [
      path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs'),
      '-e',
      source,
    ], { cwd: process.cwd(), encoding: 'utf8' });

    expect(`${execution.stdout}${execution.stderr}`).not.toContain('test.step() can only be called from a test');
    expect(execution.status).toBe(0);
  });
});
