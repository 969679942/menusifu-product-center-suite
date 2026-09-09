import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '../..');
const secretSourcePath = path.join(projectRoot, 'config', 'secret-source.ts');
const runtimeConfigPath = path.join(projectRoot, 'api', 'runtime-config.ts');
const testEnvPath = path.join(projectRoot, 'test-data', 'env.ts');
const authDataPath = path.join(projectRoot, 'test-data', 'auth.ts');

test.describe('商品中心安全凭据源合同', () => {
  test('API 与 UI 应共享脱离命令行的秘密源', async () => {
    expect(fs.existsSync(secretSourcePath)).toBe(true);
    const secretSource = fs.readFileSync(secretSourcePath, 'utf8');
    expect(secretSource).toContain(".secrets', 'runtime.env'");
    expect(secretSource).toContain('loadSecretEnv');
    expect(fs.readFileSync(runtimeConfigPath, 'utf8')).toContain("secretEnv");
    expect(fs.readFileSync(testEnvPath, 'utf8')).toContain("secretEnv");
  });

  test('认证数据不得回退到明文登录信息文件', async () => {
    const authData = fs.readFileSync(authDataPath, 'utf8');
    expect(authData).not.toContain('登录信息.txt');
    expect(authData).not.toContain("node:fs");
  });
});
