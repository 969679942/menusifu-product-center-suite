import { expect, test } from '@playwright/test';
import { validateRequirementsChangeEvent } from '../../src/automation/system-test/requirements-change-event';

const event = {
  schemaVersion: '1.0.0' as const,
  eventId: 'evt-inventory-001',
  eventType: 'prd.published' as const,
  applicationId: 'inventory-app',
  businessDomainId: 'inventory',
  sourceId: 'prd:inventory:2026-08',
  sourcePath: 'requirements/inventory-v2.md',
  sourceVersion: '2.0.0',
  sourceFingerprint: 'a'.repeat(64),
  publishedAt: '2026-08-23T00:00:00.000Z',
  correlationId: 'release-inventory-v2',
};

test.describe('通用PRD变化事件合同', () => {
  test('来源身份与实际文件指纹匹配时才接受事件', () => {
    expect(validateRequirementsChangeEvent({
      event, expectedApplicationId: 'inventory-app', expectedBusinessDomainId: 'inventory', sourceFingerprint: 'a'.repeat(64),
    })).toMatchObject({ status: 'accepted', diagnostics: [] });
  });

  test('跨应用、越界路径或来源指纹不匹配必须拒绝', () => {
    const result = validateRequirementsChangeEvent({
      event: { ...event, applicationId: 'foreign-app', sourcePath: '../secrets.txt' },
      expectedApplicationId: 'inventory-app', expectedBusinessDomainId: 'inventory', sourceFingerprint: 'b'.repeat(64),
    });
    expect(result.status).toBe('rejected');
    expect(result.diagnostics).toEqual([
      'PRD_EVENT_APPLICATION_MISMATCH',
      'PRD_EVENT_SOURCE_FINGERPRINT_MISMATCH',
      'PRD_EVENT_SOURCE_PATH_INVALID',
    ]);
  });
});
