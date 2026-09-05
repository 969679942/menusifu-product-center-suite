import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { findOperation } from '../../../api/operation-client';
import { productCenterApiCases } from '../../../test-data/api/product-center-api-cases';

test.describe('商品中心 API 覆盖矩阵', () => {
  test('18 个商品中心实体必须有唯一 API 覆盖结论', () => {
    expect(productCenterApiCases).toHaveLength(18);
    expect(new Set(productCenterApiCases.map((item) => item.entity)).size).toBe(18);
    expect(productCenterApiCases.filter((item) => item.coverage === 'positive-crud')).toHaveLength(17);
    expect(productCenterApiCases.filter((item) => item.coverage === 'deferred-external')).toHaveLength(1);
  });

  test('每条 API 记录必须声明 operation、覆盖等级和现有测试入口', async () => {
    for (const [index, apiCase] of productCenterApiCases.entries()) {
      await test.step(`第 ${index + 1} 步：核对 ${apiCase.entity} 的接口覆盖和测试入口`, async () => {
        expect(apiCase.operationKeys.length, `${apiCase.entity} 不得没有 operation`).toBeGreaterThan(0);
        if (apiCase.coverage === 'positive-crud') {
          expect(apiCase.specFile).toBeDefined();
          expect(fs.existsSync(path.resolve(process.cwd(), apiCase.specFile!)), `${apiCase.entity} 测试入口不存在`).toBe(true);
        } else {
          expect(apiCase.reason).toBeTruthy();
          expect(apiCase.specFile).toBeUndefined();
        }

        for (const operationKey of apiCase.operationKeys) {
          await test.step(`核对 ${operationKey} 已绑定运行时客户端`, async () => {
            await expect(findOperation(operationKey), `${apiCase.entity}: ${operationKey}`).resolves.toMatchObject({ operationKey });
          });
        }
      });
    }
  });

  test('门店调味只能保持外部依赖阻断，禁止误报为已执行 CRUD', () => {
    const storeSeasoning = productCenterApiCases.find((item) => item.entity === '门店调味');
    expect(storeSeasoning).toMatchObject({ coverage: 'deferred-external' });
    expect(storeSeasoning?.reason).toContain('AUTO_AUDIT');
  });
});
