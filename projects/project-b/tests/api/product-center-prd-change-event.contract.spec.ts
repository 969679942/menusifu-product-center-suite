import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { validateProductCenterPrdChangeEvent } from '../../scripts/validate-product-center-prd-change-event';

test.describe('商品中心PRD发布事件适配合同', () => {
  test('只接受工作区内已同步且指纹匹配的商品中心PRD', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-prd-'));
    try {
      const sourcePath = 'requirements/item-v2.md';
      fs.mkdirSync(path.join(root, 'requirements'));
      fs.writeFileSync(path.join(root, sourcePath), '# item v2');
      const sourceFingerprint = createHash('sha256').update('# item v2').digest('hex');
      const result = validateProductCenterPrdChangeEvent({
        schemaVersion: '1.0.0', eventId: 'evt-item-v2', eventType: 'prd.published',
        applicationId: 'merchant-center', businessDomainId: 'product-center', sourceId: 'prd:item:v2',
        sourcePath, sourceVersion: '2.0.0', sourceFingerprint,
        publishedAt: '2026-08-23T00:00:00.000Z', correlationId: 'release-item-v2',
      }, root);
      expect(result).toMatchObject({ status: 'accepted', diagnostics: [], businessExecutionAuthorized: false });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('未同步来源不得触发编译，更不得授权业务执行', () => {
    const result = validateProductCenterPrdChangeEvent({
      schemaVersion: '1.0.0', eventId: 'evt-missing', eventType: 'prd.updated',
      applicationId: 'merchant-center', businessDomainId: 'product-center', sourceId: 'prd:item:missing',
      sourcePath: 'requirements/missing.md', sourceVersion: '2.0.1', sourceFingerprint: 'a'.repeat(64),
      publishedAt: '2026-08-23T00:00:00.000Z', correlationId: 'release-item-missing',
    }, os.tmpdir());
    expect(result.status).toBe('rejected');
    expect(result.diagnostics).toContain('PRD_EVENT_SOURCE_FILE_MISSING');
    expect(result.businessExecutionAuthorized).toBe(false);
  });
});
