import { expect, test } from '@playwright/test';
import {
  createAuditFieldIdentity,
  createAuditIdentity,
} from '../../test-data/product-center/audit-identity';

test.describe('商品中心审计数据身份合同', () => {
  test('编辑身份必须与原身份不同且保持字段长度', async () => {
    await test.step('构造末位已经为 E 的固定审计身份', async () => {
      const timestamp = Array.from({ length: 100_000 }, (_, index) => 1_786_000_000_000_000 + index)
        .find((candidate) => createAuditIdentity('CATEGORY', candidate).marker.endsWith('E'));
      expect(timestamp).toBeDefined();
      const identity = createAuditIdentity('CATEGORY', timestamp!);
      expect(identity.marker.endsWith('E')).toBe(true);
      expect(identity.editedMarker).not.toBe(identity.marker);
      expect(identity.editedMarker).toHaveLength(identity.marker.length);
    });

    await test.step('检查受长度约束的审计身份同样不会重复', async () => {
      const identity = createAuditFieldIdentity('ITEM', 16, 1_786_000_000_014_000);
      expect(identity.editedMarker).not.toBe(identity.marker);
      expect(identity.editedMarker).toHaveLength(identity.marker.length);
    });
  });
});
