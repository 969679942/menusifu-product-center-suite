import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AcceptanceProjectManifest } from '../../src/acceptance/acceptance-manifest';
import { scanRouteResidue, type RouteProbe } from '../../src/acceptance/route-residue-scanner';
import { RouteScanCheckpoint } from '../../src/acceptance/route-scan-checkpoint';

const manifest: AcceptanceProjectManifest = {
  schemaVersion: '1.0.0',
  projectId: 'scanner-contract',
  displayName: '扫描合同',
  baseURL: 'https://example.test',
  markerPrefix: 'AUTO_AUDIT_',
  routes: [
    { path: '/alpha', name: '页面甲' },
    { path: '/beta', name: '页面乙' },
    { path: '/gamma', name: '页面丙' },
  ],
};

function createCheckpoint(): RouteScanCheckpoint {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-scanner-'));
  return new RouteScanCheckpoint(path.join(rootDir, 'routes.json'), manifest);
}

test.describe('通用只读路由残留扫描器', () => {
  test('全部路由零命中时通过且不保存响应体', async () => {
    const probe: RouteProbe = async () => ({ uiMarkers: [], apiMarkers: [] });
    const report = await scanRouteResidue({ manifest, checkpoint: createCheckpoint(), probe });

    expect(report.status).toBe('passed');
    expect(report.summary).toEqual({ total: 3, passed: 3, failed: 0, uiMatches: 0, apiMatches: 0 });
    expect(JSON.stringify(report)).not.toContain('responseBody');
  });

  test('单路由失败不得阻断后续扫描', async () => {
    const visited: string[] = [];
    const report = await scanRouteResidue({
      manifest,
      checkpoint: createCheckpoint(),
      probe: async (route) => {
        visited.push(route.path);
        if (route.path === '/alpha') return { uiMarkers: ['AUTO_AUDIT_ALPHA'], apiMarkers: [] };
        if (route.path === '/beta') throw new Error('selector drift');
        return { uiMarkers: [], apiMarkers: ['AUTO_AUDIT_GAMMA'] };
      },
      retry: { delaysMs: [], sleep: async () => undefined },
    });

    expect(visited).toEqual(['/alpha', '/beta', '/gamma']);
    expect(report.summary).toEqual({ total: 3, passed: 0, failed: 3, uiMatches: 1, apiMatches: 1 });
  });

  test('恢复执行应跳过同指纹下已通过路由', async () => {
    const checkpoint = createCheckpoint();
    checkpoint.markRunning('/alpha');
    checkpoint.markPassed('/alpha', { uiMatches: 0, apiMatches: 0 });
    const visited: string[] = [];
    const report = await scanRouteResidue({
      manifest,
      checkpoint,
      probe: async (route) => {
        visited.push(route.path);
        return { uiMarkers: [], apiMarkers: [] };
      },
    });

    expect(visited).toEqual(['/beta', '/gamma']);
    expect(report.summary.passed).toBe(3);
  });
});
