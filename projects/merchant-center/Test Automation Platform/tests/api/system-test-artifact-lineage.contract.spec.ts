import { expect, test } from '@playwright/test';
import {
  arbitrateSystemTestArtifactLineage,
  assertSystemTestArtifactLineage,
  fingerprintSystemTestArtifact,
} from '../../src/automation/system-test/system-test-artifact-lineage';

test.describe('系统测试产物血缘与新鲜度合同', () => {
  test('对象键顺序不影响稳定指纹，但数组顺序属于选择语义', () => {
    expect(fingerprintSystemTestArtifact({ b: 2, a: 1 }))
      .toBe(fingerprintSystemTestArtifact({ a: 1, b: 2 }));
    expect(fingerprintSystemTestArtifact(['CASE-001', 'CASE-002']))
      .not.toBe(fingerprintSystemTestArtifact(['CASE-002', 'CASE-001']));
  });

  test('计划内容变化时旧结果必须在暴露汇总前硬阻断', () => {
    const selectionFingerprint = fingerprintSystemTestArtifact(['CASE-001']);
    const result = arbitrateSystemTestArtifactLineage({
      expected: {
        upstreamFingerprint: fingerprintSystemTestArtifact({ handled: 9 }),
        selectionFingerprint,
      },
      actual: {
        upstreamFingerprint: fingerprintSystemTestArtifact({ handled: 3 }),
        selectionFingerprint,
      },
    });
    expect(result).toMatchObject({ status: 'stale' });
    expect(result.reasons).toContain('UPSTREAM_FINGERPRINT_MISMATCH');
    expect(() => assertSystemTestArtifactLineage({
      expected: {
        upstreamFingerprint: fingerprintSystemTestArtifact({ handled: 9 }),
        selectionFingerprint,
      },
      actual: {
        upstreamFingerprint: fingerprintSystemTestArtifact({ handled: 3 }),
        selectionFingerprint,
      },
    })).toThrow('SYSTEM_TEST_ARTIFACT_STALE:UPSTREAM_FINGERPRINT_MISMATCH');
  });

  test('选择集变化或缺少血缘字段时不得复用旧结果', () => {
    const planFingerprint = fingerprintSystemTestArtifact({ plan: 'current' });
    const currentSelection = fingerprintSystemTestArtifact(['CASE-001', 'CASE-002']);
    const priorSelection = fingerprintSystemTestArtifact(['CASE-001']);
    expect(arbitrateSystemTestArtifactLineage({
      expected: { upstreamFingerprint: planFingerprint, selectionFingerprint: currentSelection },
      actual: { upstreamFingerprint: planFingerprint, selectionFingerprint: priorSelection },
    })).toMatchObject({ status: 'stale', reasons: ['SELECTION_FINGERPRINT_MISMATCH'] });
    expect(arbitrateSystemTestArtifactLineage({
      expected: { upstreamFingerprint: planFingerprint, selectionFingerprint: currentSelection },
      actual: { upstreamFingerprint: null, selectionFingerprint: null },
    }).reasons).toEqual([
      'ACTUAL_SELECTION_FINGERPRINT_INVALID',
      'ACTUAL_UPSTREAM_FINGERPRINT_INVALID',
    ]);
  });

  test('计划、选择集和可选范围指纹完全一致时产物才是当前状态', () => {
    const upstreamFingerprint = fingerprintSystemTestArtifact({ plan: 'current' });
    const selectionFingerprint = fingerprintSystemTestArtifact(['CASE-001']);
    const scopeFingerprint = fingerprintSystemTestArtifact({ module: 'group' });
    expect(arbitrateSystemTestArtifactLineage({
      expected: { upstreamFingerprint, selectionFingerprint, scopeFingerprint },
      actual: { upstreamFingerprint, selectionFingerprint, scopeFingerprint },
    })).toEqual({ status: 'current', reasons: [] });
  });
});
