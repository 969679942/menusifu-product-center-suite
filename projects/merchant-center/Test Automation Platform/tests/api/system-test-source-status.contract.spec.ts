import { expect, test } from '@playwright/test';
import {
  assertBlockedSourceClassification,
  classifySystemTestSourceStatus,
  validateBlockedSourceClassification,
  type SystemTestApiCatalog,
} from '../../src/automation/system-test/system-test-source-status';

const catalog: SystemTestApiCatalog = {
  checked: true,
  sourcePath: 'contracts/api/operations.json',
  fingerprint: 'a'.repeat(64),
  operationKeys: [
    'brand-menu:GET /ops-brand/global-modifier/list',
    'brand-menu:POST /ops-brand/global-modifier/batch',
  ],
};

test.describe('系统测试来源状态治理合同', () => {
  test('API 文档未检查时禁止生成 blocked-source', () => {
    const errors = validateBlockedSourceClassification({
      apiCatalog: { ...catalog, checked: false },
      sourceStatus: 'api-exists-but-unmapped',
    });

    expect(errors).toContain('API_CATALOG_CHECK_REQUIRED');
    expect(() => assertBlockedSourceClassification({
      apiCatalog: { ...catalog, checked: false },
      sourceStatus: 'api-exists-but-unmapped',
    })).toThrow('API_CATALOG_CHECK_REQUIRED');
  });

  test('五类来源状态必须按证据条件分类', () => {
    expect(classifySystemTestSourceStatus({
      apiCatalog: catalog,
      requiredOperationKeys: ['brand-menu:DELETE /ops-brand/global-modifier/{id}'],
    })).toBe('api-not-found');

    expect(classifySystemTestSourceStatus({
      apiCatalog: catalog,
      candidateOperationKeys: ['brand-menu:GET /ops-brand/global-modifier/list'],
      mappedOperationKeys: [],
    })).toBe('api-exists-but-unmapped');

    expect(classifySystemTestSourceStatus({
      apiCatalog: catalog,
      requiredObservationChannels: ['ui'],
      availableObservationChannels: ['api'],
    })).toBe('ui-evidence-missing');

    expect(classifySystemTestSourceStatus({
      apiCatalog: catalog,
      requiredObservationChannels: ['downstream'],
      availableObservationChannels: ['ui', 'api'],
    })).toBe('downstream-contract-missing');

    expect(classifySystemTestSourceStatus({
      apiCatalog: catalog,
      businessRuleConflict: true,
    })).toBe('business-rule-conflict');
  });

  test('接口映射和观察面齐全时不应阻断来源', () => {
    expect(classifySystemTestSourceStatus({
      apiCatalog: catalog,
      candidateOperationKeys: ['brand-menu:GET /ops-brand/global-modifier/list'],
      mappedOperationKeys: ['brand-menu:GET /ops-brand/global-modifier/list'],
      requiredObservationChannels: ['ui'],
      availableObservationChannels: ['ui', 'api'],
    })).toBeNull();
  });
});
