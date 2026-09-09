import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { findOperation, type Operation } from '../../../api/operation-client';
import { filterActiveApiOperations } from '../../../utils/api-lifecycle';

type DocumentedOperation = Operation & {
  summary?: string | null;
  parameters?: Array<{ name?: string; in?: string; required?: boolean }>;
  requestBody?: unknown;
  responses?: Record<string, unknown>;
};

const catalogPath = path.resolve(process.cwd(), '..', 'contracts/api/operations/brand-menu.operations.json');
const brandOperations = filterActiveApiOperations(JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as DocumentedOperation[]);

test.describe('品牌商品和菜单 API 全量契约', () => {
  test('只纳入品牌商品和菜单 API，不得混入行业商品 API', () => {
    expect(brandOperations).toHaveLength(586);
    expect(brandOperations.every((operation) => operation.runtimeBaseEnv === 'MC_ITEM_API_BASE_URL')).toBe(true);
    expect(brandOperations.some((operation) => operation.operationKey.includes('industry'))).toBe(false);
    expect(new Set(brandOperations.map((operation) => operation.operationKey)).size).toBe(brandOperations.length);
  });

  test('活动品牌 operation 都必须能被运行时客户端解析', async () => {
    for (const [index, operation] of brandOperations.entries()) {
      await test.step(`第 ${index + 1} 步：校验 ${operation.method} ${operation.path} 的运行时接口映射`, async () => {
        const resolved = await findOperation(operation.operationKey);
        expect(resolved).toMatchObject({
          operationKey: operation.operationKey,
          method: operation.method,
          path: operation.path,
          service: 'brand-menu',
          runtimeBaseEnv: 'MC_ITEM_API_BASE_URL',
        });
      });
    }
  });

  test('每个品牌 operation 都具备可执行请求和成功响应定义', async () => {
    for (const [index, operation] of brandOperations.entries()) {
      await test.step(`第 ${index + 1} 步：校验 ${operation.method} ${operation.path} 的请求和响应合同`, async () => {
        expect(operation.method, operation.operationKey).toMatch(/^(GET|POST|PUT|DELETE)$/);
        expect(operation.path, operation.operationKey).toMatch(/^\//);
        expect(operation.responses, operation.operationKey).toBeDefined();
        expect(
          Object.keys(operation.responses ?? {}).some((status) => /^(2|3)\d\d$/.test(status)),
          `${operation.operationKey} 缺少 2xx/3xx 响应定义`,
        ).toBe(true);
        const parameterNames = (operation.parameters ?? []).map((parameter) => parameter.name).filter(Boolean);
        expect(new Set(parameterNames).size, `${operation.operationKey} 参数名重复`).toBe(parameterNames.length);
      });
    }
  });

  test('缺少接口摘要的文档项必须显式保留为文档治理缺口', () => {
    const missingSummary = brandOperations
      .filter((operation) => !operation.summary?.trim())
      .map((operation) => operation.operationKey);

    expect(missingSummary).toEqual([
      'brand-menu:GET /ops-brand/brand-sections/fresh/{brandId}',
      'brand-menu:GET /ops-brand/brand-categories/test-stackoverflow',
      'brand-menu:GET /ops-poi/brand-categories/test-stackoverflow',
      'brand-menu:GET /ops-poi/brand-categories/search',
      'brand-menu:GET /ops-brand/brand-categories/search',
      'brand-menu:GET /ops-brand/brand-allergens/list',
      'brand-menu:GET /ops-brand/brand-allergens/all',
    ]);
  });
});
