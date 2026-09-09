import { test, expect } from '@playwright/test';
import { filterActiveApiOperations } from '../../utils/api-lifecycle';
import fs from 'node:fs/promises';
import path from 'node:path';

test.describe('商品中心 API 契约', () => {
  test('品牌商品和行业商品接口数量应分别可解释，operationKey 应唯一且可解析', async () => {
    const brandFile = path.resolve(process.cwd(), '..', 'contracts', 'api', 'operations', 'brand-menu.operations.json');
    const industryFile = path.resolve(process.cwd(), '..', 'contracts', 'api', 'operations', 'industry-item.operations.json');
    const brandOperations = filterActiveApiOperations(JSON.parse(await fs.readFile(brandFile, 'utf8')) as Array<{ operationKey: string; method: string; path: string }>);
    const industryOperations = JSON.parse(await fs.readFile(industryFile, 'utf8')) as Array<{ operationKey: string; method: string; path: string }>;
    const operations = [...brandOperations, ...industryOperations];
    const keys = operations.map(operation => operation.operationKey);
    expect(brandOperations).toHaveLength(586);
    expect(industryOperations).toHaveLength(99);
    expect(operations).toHaveLength(685);
    expect(new Set(keys).size).toBe(keys.length);
    expect(operations.every(operation => operation.method && operation.path.startsWith('/'))).toBe(true);
  });
});
