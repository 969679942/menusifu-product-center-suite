import { expect, test } from '@playwright/test';
import {
  assertAuditFieldLength,
  createAuditFieldIdentity,
  createAuditFieldValue,
  createAuditIdentity,
} from '../../test-data/product-center/audit-identity';

test.describe('审计数据身份分配', () => {
  test('默认身份和字段身份应保留清理前缀并满足字段长度', () => {
    const identity = createAuditIdentity('COMBO', 1_786_000_000_000_000);
    const fieldValue = createAuditFieldValue('ADDITIONAL', 20, 1_786_000_000_000_001);
    const fieldIdentity = createAuditFieldIdentity('ITEM', 13, 1_786_000_000_000_002);

    expect(identity.marker).toMatch(/^AUTO_AUDIT_/);
    expect(identity.marker.length).toBeLessThanOrEqual(20);
    expect(identity.editedMarker.length).toBeLessThanOrEqual(20);
    expect(fieldValue.length).toBeLessThanOrEqual(20);
    expect(fieldIdentity.marker.length).toBe(13);
    expect(() => assertAuditFieldLength(fieldValue, 19)).toThrow();
  });
});
