import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  fingerprintAcceptanceManifest,
  validateAcceptanceManifest,
  type AcceptanceProjectManifest,
} from '../../src/acceptance/acceptance-manifest';
import { RouteScanCheckpoint } from '../../src/acceptance/route-scan-checkpoint';

const manifest: AcceptanceProjectManifest = {
  schemaVersion: '1.0.0',
  projectId: 'sample-project',
  displayName: '示例项目',
  baseURL: 'https://example.test',
  markerPrefix: 'AUTO_AUDIT_',
  routes: [
    { path: '/alpha', name: '页面甲' },
    { path: '/beta', name: '页面乙' },
  ],
};

test.describe('通用验收清单与路由检查点', () => {
  test('清单应校验唯一路由并生成稳定指纹', async () => {
    expect(validateAcceptanceManifest(manifest)).toEqual([]);
    expect(fingerprintAcceptanceManifest(manifest)).toBe(fingerprintAcceptanceManifest({
      ...manifest,
      routes: [...manifest.routes].reverse(),
    }));
    expect(validateAcceptanceManifest({
      ...manifest,
      routes: [...manifest.routes, { path: '/alpha', name: '重复页面' }],
    })).toContain('路由重复：/alpha');
  });

  test('清单必须拒绝协议相对路径、反斜杠和跨源路由', () => {
    for (const pathValue of ['//evil.example.com/admin', '/\\evil.example.com', 'https://evil.example.com/pwn']) {
      expect(validateAcceptanceManifest({ ...manifest, routes: [{ path: pathValue, name: '非法路由' }] })
        .some((item) => item.includes('路由'))).toBeTruthy();
    }
  });

  test('恢复时只跳过同一清单指纹下已通过路由', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-checkpoint-'));
    const filePath = path.join(rootDir, 'routes.json');
    const checkpoint = new RouteScanCheckpoint(filePath, manifest);
    checkpoint.markRunning('/alpha');
    checkpoint.markPassed('/alpha', { uiMatches: 0, apiMatches: 0 });

    expect(new RouteScanCheckpoint(filePath, manifest).pendingRoutes().map((route) => route.path)).toEqual(['/beta']);
    expect(new RouteScanCheckpoint(filePath, {
      ...manifest,
      routes: [...manifest.routes, { path: '/gamma', name: '页面丙' }],
    }).pendingRoutes().map((route) => route.path)).toEqual(['/alpha', '/beta', '/gamma']);
  });

  test('检查点诊断不得保存认证信息', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-redaction-'));
    const checkpoint = new RouteScanCheckpoint(path.join(rootDir, 'routes.json'), manifest);
    checkpoint.markRunning('/alpha');
    checkpoint.markFailed('/alpha', 'authorization=Bearer secret-token password=unsafe');

    const serialized = JSON.stringify(checkpoint.snapshot());
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('unsafe');
    expect(serialized).toContain('<redacted>');
  });
});
