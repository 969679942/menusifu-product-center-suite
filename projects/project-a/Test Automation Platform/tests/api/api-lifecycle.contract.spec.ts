import { expect, test } from '@playwright/test';
import {
  assertApiLifecycleRegistryIntegrity,
  filterActiveApiOperations,
  type ApiLifecycleRegistry,
} from '../../src/governance/api-lifecycle';

test.describe('公共 API 生命周期治理', () => {
  test('废弃接口从活动目录排除且重复执行结果一致', () => {
    const registry: ApiLifecycleRegistry = {
      schemaVersion: '1.0.0',
      entries: [{
        operationKey: 'sample:POST /legacy-upload',
        status: 'deprecated',
        replacementOperationKey: 'sample:POST /upload-tasks',
        automationPolicy: 'exclude-from-active-catalog',
      }],
    };
    const source = [
      { operationKey: 'sample:POST /legacy-upload' },
      { operationKey: 'sample:POST /upload-tasks' },
    ];

    assertApiLifecycleRegistryIntegrity(source, registry);
    const first = filterActiveApiOperations(source, registry);
    assertApiLifecycleRegistryIntegrity(first, registry);
    const second = filterActiveApiOperations(first, registry);

    expect(first).toEqual([{ operationKey: 'sample:POST /upload-tasks' }]);
    expect(second).toEqual(first);
  });
});
