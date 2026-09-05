import { expect, test } from '@playwright/test';
import {
  buildProductCenterTestContract,
  validateProductCenterTestContract,
  type EvidenceRecord,
} from '../../utils/product-center-test-contract';

const sourceRecord = (id: string, status: EvidenceRecord['status'] = 'observed'): EvidenceRecord => ({
  id,
  status,
  sourceType: status === 'confirmed' ? 'openapi' : 'ui-runtime',
  confidence: 1,
  generationAllowed: status === 'observed' || status === 'confirmed',
  source: [{ path: 'fixture://source.json', locator: id }],
  verifiedAt: '2026-07-24T00:00:00.000Z',
  version: '1.0.0',
  evidence: {},
});

test.describe('商品中心统一测试合同', () => {
  test('应生成版本化且字段完整的规范合同', async () => {
    const contract = buildProductCenterTestContract({
      upstream: {
        metadata: { contractVersion: '0.1.0', generatedAt: '2026-07-24T00:00:00.000Z' },
        routes: [sourceRecord('route:category')],
        controls: [sourceRecord('control:create')],
        fields: [sourceRecord('field:name')],
        dialogs: [sourceRecord('dialog:create')],
        validations: [sourceRecord('validation:required')],
        apiOperations: [sourceRecord('operation:create', 'confirmed')],
        uiApiMappings: [sourceRecord('mapping:create')],
        businessRules: [{ ...sourceRecord('rule:draft', 'provisional'), generationAllowed: false }],
        testDataFactories: [sourceRecord('factory:category', 'confirmed')],
        cleanupAdapters: [sourceRecord('cleanup:category', 'confirmed')],
        assertions: [sourceRecord('assertion:create')],
        traceability: [],
        unresolved: [],
      },
      descriptors: [{
        id: 'create:category', entityKey: 'category', entityName: '商品分类', route: '/pp/brand/category',
        action: 'create', seedMode: 'none', cleanupMode: 'api-finally', verifyModes: ['api', 'ui'],
        specFile: 'tests/e2e/category.spec.ts', testTitle: '商品分类应创建成功', rerunGrep: '商品分类应创建成功',
      }],
      version: '1.0.0',
      verifiedAt: '2026-07-24T00:00:00.000Z',
    });

    expect(contract.metadata.contractVersion).toBe('1.0.0');
    expect(contract.metadata.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(contract.traceability).toHaveLength(1);
    expect(validateProductCenterTestContract(contract)).toEqual([]);

    for (const collection of contract.metadata.collections) {
      for (const record of contract[collection] ?? []) {
        expect(record.source.length).toBeGreaterThan(0);
        expect(record.verifiedAt).toBe('2026-07-24T00:00:00.000Z');
        expect(record.version).toBe('1.0.0');
      }
    }
  });

  test('推断阻塞冲突和未解决记录不得生成自动化断言', async () => {
    const invalidStatuses: EvidenceRecord['status'][] = ['provisional', 'inferred', 'blocked', 'unresolved'];
    for (const status of invalidStatuses) {
      const record = { ...sourceRecord(`rule:${status}`, status), generationAllowed: true };
      const errors = validateProductCenterTestContract({
        metadata: {
          contractVersion: '1.0.0', generatedAt: '2026-07-24T00:00:00.000Z',
          sourceFingerprint: 'a'.repeat(64), sourcePriority: [], sourceArtifacts: [],
          collections: ['businessRules'], counts: { businessRules: 1 },
        },
        businessRules: [record],
      });
      expect(errors.some((error) => error.code === 'INVALID_GENERATION_FLAG')).toBe(true);
    }
  });

  test('相同输入必须生成字节级一致的合同', async () => {
    const input = {
      upstream: {
        metadata: { contractVersion: '0.1.0', generatedAt: '2026-07-24T00:00:00.000Z' },
        routes: [sourceRecord('route:category')],
      },
      descriptors: [],
      version: '1.0.0',
      verifiedAt: '2026-07-24T00:00:00.000Z',
    } as const;

    expect(JSON.stringify(buildProductCenterTestContract(input))).toBe(
      JSON.stringify(buildProductCenterTestContract(input)),
    );
  });
});
