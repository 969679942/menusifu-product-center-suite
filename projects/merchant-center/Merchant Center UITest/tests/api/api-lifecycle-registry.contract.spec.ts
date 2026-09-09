import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { assertLifecycleRegistryIntegrity, filterActiveApiOperations, readApiLifecycleRegistry } from '../../utils/api-lifecycle';

test.describe('API 生命周期登记合同', () => {
  test('废弃接口必须有证据、替代接口，并从活动目录排除', () => {
    const registry = readApiLifecycleRegistry();
    const sourcePath = path.resolve(process.cwd(), '..', 'contracts/api/operations/brand-menu.operations.json');
    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as Array<{ operationKey: string }>;
    assertLifecycleRegistryIntegrity(source);
    const active = filterActiveApiOperations(source);
    const deprecated = registry.entries.filter((entry) => entry.status === 'deprecated');
    const rawDocumentPath = path.resolve(process.cwd(), '..', 'Merchant Center API/品牌商品和菜单API.json');
    const rawDocument = JSON.parse(fs.readFileSync(rawDocumentPath, 'utf8')) as { paths: Record<string, unknown> };

    expect(deprecated).toHaveLength(1);
    expect(deprecated[0].operationKey).toBe('brand-menu:POST /ops-brand/menu-import/upload');
    expect(deprecated[0].replacementOperationKey).toBe('brand-menu:POST /ops-brand/menu-import-tasks-files');
    expect(rawDocument.paths['/ops-brand/menu-import/upload']).toBeDefined();
    expect(source.some((operation) => operation.operationKey === deprecated[0].operationKey)).toBe(false);
    expect(source.some((operation) => operation.operationKey === deprecated[0].replacementOperationKey)).toBe(true);
    expect(active.some((operation) => operation.operationKey === deprecated[0].operationKey)).toBe(false);
    expect(fs.existsSync(path.resolve(process.cwd(), 'output/brand-menu-product-import-request-contract-audit.json'))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), '..', 'Merchant Center API/API生命周期登记.md'))).toBe(true);
  });

  test('非适用接口必须从活动目录排除但保留范围决策', () => {
    const registry = readApiLifecycleRegistry();
    const sourcePath = path.resolve(process.cwd(), '..', 'contracts/api/operations/brand-menu.operations.json');
    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as Array<{ operationKey: string }>;
    const active = filterActiveApiOperations(source);
    const notApplicable = registry.entries.filter((entry) => entry.status === 'not-applicable');

    expect(notApplicable.map((entry) => entry.operationKey)).toEqual(expect.arrayContaining([
      'brand-menu:GET /ops-brand/sched/jobs',
      'brand-menu:POST /ops-brand/sched/jobs',
      'brand-menu:GET /ops-brand/sched/jobs/{jobId}',
      'brand-menu:GET /ops-brand/sched/jobs/{jobId}/tasks',
      'brand-menu:POST /ops-brand/sched/jobs/{jobId}/tasks',
    ]));
    expect(notApplicable.every((entry) => entry.automationPolicy === 'exclude-from-active-catalog')).toBe(true);
    expect(notApplicable.every((entry) => String(entry.reason ?? '').length > 0)).toBe(true);
    expect(notApplicable.every((entry) => String(entry.reopenCondition ?? '').length > 0)).toBe(true);
    expect(notApplicable.every((entry) => !active.some((operation) => operation.operationKey === entry.operationKey))).toBe(true);
  });
});
