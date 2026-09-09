import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  probeBrandMenuOperation,
  readBrandMenuOperations,
  type BrandMenuProbeResult,
} from '../../../../utils/brand-menu-live-probe';

test.describe('品牌商品和菜单 API 全量真实接口探针', () => {
  test('活动品牌接口均应完成一次真实请求并保留响应记录', async ({ request }) => {
    test.setTimeout(900_000);
    const operations = await test.step('前置：读取品牌商品和菜单 API 文档，排除行业商品接口', async () => {
      const documentedOperations = readBrandMenuOperations();
      expect(documentedOperations.length).toBeGreaterThan(0);
      return documentedOperations;
    });

    const results: BrandMenuProbeResult[] = [];
    const concurrency = 8;
    for (let index = 0; index < operations.length; index += concurrency) {
      const batch = operations.slice(index, index + concurrency);
      results.push(...await Promise.all(batch.map((operation, batchIndex) => test.step(
        `第 ${index + batchIndex + 1} 步：请求 ${operation.method} ${operation.path}，记录响应分类`,
        async () => {
          const result = await probeBrandMenuOperation(request, operation);
          expect(result.status, `${operation.operationKey} 未获得 HTTP 响应`).toBeDefined();
          return {
            ...result,
            executionOrder: index + batchIndex + 1,
            stepTitle: `第 ${index + batchIndex + 1} 步：请求 ${operation.method} ${operation.path}，记录响应分类`,
            observedState: `${result.status ?? '无 HTTP 响应'} / ${result.classification ?? '未分类'}`,
            finalStatus: (result.outcome === 'transport-error'
              ? 'transport-error'
              : result.classification === 'success'
                ? 'passed'
                : result.classification === 'validation-response' || result.classification === 'business-rejection'
                  ? 'negative-passed'
                : 'blocked') as BrandMenuProbeResult['finalStatus'],
          };
        },
      ))));
    }

    await test.step('收尾：写入活动品牌接口的执行结果和阻断分类报告', async () => {
      const reportPath = path.resolve(process.cwd(), 'output/brand-menu-api-live-probe.json');
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify({
        generatedAt: new Date().toISOString(),
        total: results.length,
        readProbes: results.filter((result) => result.probeType === 'read').length,
        validationProbes: results.filter((result) => result.probeType === 'validation').length,
        responded: results.filter((result) => result.outcome === 'responded').length,
        transportErrors: results.filter((result) => result.outcome === 'transport-error'),
        classifications: results.reduce<Record<string, number>>((counts, result) => {
          const classification = result.classification ?? 'unknown';
          counts[classification] = (counts[classification] ?? 0) + 1;
          return counts;
        }, {}),
        statusCounts: results.reduce<Record<string, number>>((counts, result) => {
          const status = String(result.status ?? 'transport-error');
          counts[status] = (counts[status] ?? 0) + 1;
          return counts;
        }, {}),
        results,
      }, null, 2), 'utf8');
    });

    expect(results).toHaveLength(operations.length);
    expect(results.filter((result) => result.outcome === 'transport-error'), '存在未完成真实请求的接口').toEqual([]);
    expect(results.filter((result) => result.classification === 'unexpected-server-error'), '存在未归类的服务端错误').toEqual([]);
  });
});
