import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');
function inspect(secretContent: string, mode = 'ui', envOverrides: Record<string, string> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-preflight-contract-'));
  const secrets = path.join(root, 'synthetic.env');
  fs.writeFileSync(secrets, secretContent);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('MC_') || key.startsWith('PLAYWRIGHT_')) delete env[key];
  Object.assign(env, envOverrides, { MC_SECRET_ENV_PATH: secrets, MC_OBSERVED_REQUEST_SAMPLES_PATH: path.join(root, 'absent-samples.json') });
  const script = `const {auditProductCenterJenkinsAuthPreflight}=require(${JSON.stringify(path.join(projectRoot, 'scripts/audit-product-center-jenkins-auth-preflight.ts'))});
    process.stdout.write(JSON.stringify(auditProductCenterJenkinsAuthPreflight({projectRoot:${JSON.stringify(root)},mode:${JSON.stringify(mode)}})));`;
  try {
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(require.resolve('tsx')).href, '-e', script], { cwd: projectRoot, env, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain('synthetic-password-value');
    expect(result.stdout).not.toContain('synthetic-token-value');
    const value = JSON.parse(result.stdout);
    const snapshot = fs.readFileSync(path.join(root, value.publication.current.snapshot), 'utf8');
    expect(snapshot).not.toContain('synthetic-password-value');
    expect(snapshot).not.toContain('synthetic-token-value');
    return value;
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('秘密文件凭据与运行器默认商户品牌能满足 UI 配置预检且不泄漏', () => {
  const { report } = inspect('MC_USERNAME=synthetic-user\nMC_PASSWORD=synthetic-password-value');
  expect(report.status).toBe('ready-for-readonly-probe');
  expect(report.assessment.missingContext).toEqual([]);
  expect(report.policy).toMatchObject({ loginAttempted: false, businessExecutionStarted: false, secretsPersisted: false });
});

test('仅 API token 不得使 UI 登录就绪，API 观察单独发布', () => {
  const input = 'MC_ACCESS_TOKEN=synthetic-token-value';
  expect(inspect(input).report.status).toBe('external-authorization-blocked');
  const api = inspect(input, 'api');
  expect(api.report.status).toBe('ready-for-readonly-probe');
  expect(api.outputJson).toContain('preflight.api.json');
});

test('空白上下文及缺失凭据保持阻断', () => {
  const invalid = inspect('MC_USERNAME=synthetic-user\nMC_PASSWORD=synthetic-password-value', 'ui', { MC_BRAND_ID: ' ' });
  expect(invalid.report.status).toBe('external-authorization-blocked');
  expect(invalid.report.assessment.missingContext).toContain('brand');
  expect(inspect('').report.status).toBe('external-authorization-blocked');
});
