import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { test, expect } from '@playwright/test';
import { appendSystemTestRepairTelemetry, summarizeSystemTestRepairTelemetry } from '../../src/automation/system-test/system-test-repair-telemetry';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-metrics-'));
  const filePath = path.join(root, 'ledger.jsonl');
  return { filePath, summary: () => summarizeSystemTestRepairTelemetry(filePath),
    append: (payload: Record<string, unknown>, sessionId = 'session-1') => appendSystemTestRepairTelemetry({
      filePath, eventType: 'efficiency-observation', applicationId: 'synthetic', sessionId, payload }),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('缺日志、空日志和缺测指标不能伪装为零成本', () => {
  const f = fixture();
  try {
    expect(f.summary()).toMatchObject({ evidenceStatus: 'missing', eventCount: null, browserStarts: null, avoidableDurationMs: null });
    fs.writeFileSync(f.filePath, '');
    expect(f.summary()).toMatchObject({ evidenceStatus: 'available', eventCount: 0, browserStarts: null });
    f.append({ avoidableDurationMs: 0, avoidableBrowserStarts: 0 });
    expect(f.summary()).toMatchObject({ avoidableDurationMs: 0, avoidableBrowserStarts: 0, browserStarts: null, currentRunCountsAvailable: false });
    f.append({ browserStarts: 1 });
    expect(f.summary()).toMatchObject({ avoidableDurationMs: null, avoidableBrowserStarts: null, browserStarts: null });
  } finally { f.cleanup(); }
});

test('实测启动与可避免启动分别统计，混合会话不得冒充当前运行', () => {
  const f = fixture();
  try {
    f.append({ avoidableDurationMs: 2, browserStarts: 3, avoidableBrowserStarts: 1 });
    expect(f.summary()).toMatchObject({ avoidableDurationMs: 2, browserStarts: 3, avoidableBrowserStarts: 1, metricScope: 'single-session' });
    f.append({ avoidableDurationMs: 5, browserStarts: 5, avoidableBrowserStarts: 0 }, 'session-2');
    expect(f.summary()).toMatchObject({ eventCount: 2, browserStarts: null, avoidableDurationMs: null, metricScope: 'unavailable' });
  } finally { f.cleanup(); }
});

test('负数、小数启动次数和损坏证据保持不可用且不暴露源数据', () => {
  const f = fixture();
  try {
    f.append({ avoidableDurationMs: -1, browserStarts: 0.5 });
    expect(f.summary()).toMatchObject({ avoidableDurationMs: null, browserStarts: null });
    fs.writeFileSync(f.filePath, '{"password":"synthetic-secret",invalid');
    expect(f.summary().evidenceStatus).toBe('invalid');
    expect(JSON.stringify(f.summary())).not.toContain('synthetic-secret');
  } finally { f.cleanup(); }
});
