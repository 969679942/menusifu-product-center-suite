import { expect, test } from '@playwright/test';
import { LIFECYCLE_TELEMETRY_FIELDS, validateLifecycleTelemetry } from '../../src/governance/lifecycle-telemetry-validation';

const valid = () => ({ startedAt: '2026-09-08T00:00:00Z', completedAt: '2026-09-08T00:00:01Z', durationMs: 1000,
  inputFingerprint: 'input-hash', outputFingerprint: 'output-hash', waitMs: 100, retryCount: 0,
  blockedReason: null, businessExecutionStarted: false, artifactPath: 'isolated/result.json' });

test('有效阶段遥测可以通过结构校验，缺失或空值不得通过', () => {
  expect(validateLifecycleTelemetry(valid()).status).toBe('complete');
  expect(validateLifecycleTelemetry({}).missingTelemetry).toEqual([...LIFECYCLE_TELEMETRY_FIELDS]);
  const empty = Object.fromEntries(LIFECYCLE_TELEMETRY_FIELDS.map((field) => [field, null]));
  expect(validateLifecycleTelemetry(empty).status).toBe('incomplete');
  expect(validateLifecycleTelemetry(empty).invalidTelemetry).toHaveLength(9);
});

test('错误类型、时间倒置、负耗时和等待超时必须显式登记', () => {
  const result = validateLifecycleTelemetry({ ...valid(), completedAt: '2026-09-07T00:00:00Z', waitMs: 2000, retryCount: 1.5, businessExecutionStarted: 'false', outputFingerprint: '' });
  expect(result.invalidTelemetry).toEqual(['completedAt', 'outputFingerprint', 'waitMs', 'retryCount', 'businessExecutionStarted']);
  expect(validateLifecycleTelemetry({ ...valid(), durationMs: -1 }).invalidTelemetry).toContain('durationMs');
  expect(validateLifecycleTelemetry({ ...valid(), startedAt: 'yesterday' }).invalidTelemetry).toContain('startedAt');
});
