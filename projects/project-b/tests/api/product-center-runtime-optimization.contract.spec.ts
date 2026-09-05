import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { extractCreatedRecord } from '../../api/product-center/created-record';
import { nextAuditTimestamp } from '../../test-data/product-center/audit-identity';
import { resolveAccessToken, resetAccessTokenCache } from '../../api/auth-client';

test.describe('商品中心运行时优化合同', () => {
  test('创建响应应优先直接提取服务端 ID 并保留身份', async () => {
    expect(extractCreatedRecord({ data: { id: 101 } }, 'AUTO_AUDIT_ITEM_1')).toEqual({ id: 101, name: 'AUTO_AUDIT_ITEM_1' });
    expect(extractCreatedRecord({ data: 102 }, 'AUTO_AUDIT_ITEM_2')).toEqual({ id: 102, name: 'AUTO_AUDIT_ITEM_2' });
    expect(extractCreatedRecord({ id: '103' }, 'AUTO_AUDIT_ITEM_3')).toEqual({ id: 103, name: 'AUTO_AUDIT_ITEM_3' });
    expect(extractCreatedRecord({ data: {} }, 'AUTO_AUDIT_ITEM_4')).toBeUndefined();
  });

  test('同一毫秒不同 worker 与连续调用必须生成不同时间戳', async () => {
    const worker0First = nextAuditTimestamp(1_784_800_000_000, 0);
    const worker0Second = nextAuditTimestamp(1_784_800_000_000, 0);
    const worker1First = nextAuditTimestamp(1_784_800_000_000, 1);

    expect(new Set([worker0First, worker0Second, worker1First]).size).toBe(3);
  });

  test('并发用例不得共享固定规格与做法选项身份', async () => {
    const sources = [
      'test-data/product-center/sop/product-center-sop-data.factory.ts',
      'test-data/product-center/sop/product-center-low-dependency-data.factory.ts',
    ].map((file) => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8')).join('\n');
    expect(sources).not.toContain("optionName: '规格项'");
    expect(sources).not.toContain("optionName: '口味项'");
    expect(sources).not.toContain("optionName: '做法项'");
  });


  test('同一 worker 并发 API 调用应共享一次登录 Token', async () => {
    resetAccessTokenCache();
    let postCalls = 0;
    const request = {
      post: async () => {
        postCalls += 1;
        return ({
        ok: () => true,
        status: () => 200,
        headers: () => ({}),
        dispose: async () => undefined,
        json: async () => ({ data: { accessToken: 'A'.repeat(32) } }),
        });
      },
    } as any;

    const [first, second, third] = await Promise.all([
      resolveAccessToken(request),
      resolveAccessToken(request),
      resolveAccessToken(request),
    ]);

    expect(new Set([first, second, third]).size).toBe(1);
    expect(postCalls).toBe(1);
  });
});
