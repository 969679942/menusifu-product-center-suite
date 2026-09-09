import { expect, test } from '../../../../../fixtures/product-center-api.fixture';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildProbeRequest, probeBrandMenuOperation, readBrandMenuOperations, type BrandMenuProbeResult } from '../../../../../utils/brand-menu-live-probe';

const results: BrandMenuProbeResult[] = [];
let authEvidence: Record<string, unknown> | undefined;

test.describe("品牌商品和菜单 API：图片与文件", () => {
  test(
    "第 148 条品牌接口测试：GET /ops-brand/brand-images/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[147];
      await test.step("前置：读取第 148 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-images/{id}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-images/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-images/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-images/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-images/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-images/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-images/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 148,
          stepTitle: "第 148 步：GET /ops-brand/brand-images/{id} 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-images/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-images/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 149 条品牌接口测试：PUT /ops-brand/brand-images/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[148];
      await test.step("前置：读取第 149 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/brand-images/{id}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/brand-images/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/brand-images/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/brand-images/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/brand-images/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/brand-images/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-images/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 149,
          stepTitle: "第 149 步：PUT /ops-brand/brand-images/{id} 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:PUT /ops-brand/brand-images/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-images/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 150 条品牌接口测试：DELETE /ops-brand/brand-images/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[149];
      await test.step("前置：读取第 150 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-brand/brand-images/{id}");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-brand/brand-images/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-brand/brand-images/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-brand/brand-images/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-brand/brand-images/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-brand/brand-images/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-images/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 150,
          stepTitle: "第 150 步：DELETE /ops-brand/brand-images/{id} 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:DELETE /ops-brand/brand-images/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-images/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 151 条品牌接口测试：GET /ops-brand/brand-image-display-channels/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[150];
      await test.step("前置：读取第 151 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-image-display-channels/{id}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-image-display-channels/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-image-display-channels/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-image-display-channels/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-image-display-channels/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-image-display-channels/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-image-display-channels/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 151,
          stepTitle: "第 151 步：GET /ops-brand/brand-image-display-channels/{id} 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-image-display-channels/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-image-display-channels/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 152 条品牌接口测试：PUT /ops-brand/brand-image-display-channels/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[151];
      await test.step("前置：读取第 152 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/brand-image-display-channels/{id}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/brand-image-display-channels/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/brand-image-display-channels/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/brand-image-display-channels/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/brand-image-display-channels/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/brand-image-display-channels/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-image-display-channels/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 152,
          stepTitle: "第 152 步：PUT /ops-brand/brand-image-display-channels/{id} 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:PUT /ops-brand/brand-image-display-channels/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-image-display-channels/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 153 条品牌接口测试：DELETE /ops-brand/brand-image-display-channels/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[152];
      await test.step("前置：读取第 153 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-brand/brand-image-display-channels/{id}");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-brand/brand-image-display-channels/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-brand/brand-image-display-channels/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-brand/brand-image-display-channels/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-brand/brand-image-display-channels/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-brand/brand-image-display-channels/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-image-display-channels/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 153,
          stepTitle: "第 153 步：DELETE /ops-brand/brand-image-display-channels/{id} 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:DELETE /ops-brand/brand-image-display-channels/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-image-display-channels/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 184 条品牌接口测试：POST /pub/brand-image-display-channel-batch",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[183];
      await test.step("前置：读取第 184 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /pub/brand-image-display-channel-batch");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/pub/brand-image-display-channel-batch");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /pub/brand-image-display-channel-batch", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /pub/brand-image-display-channel-batch 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /pub/brand-image-display-channel-batch 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /pub/brand-image-display-channel-batch 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /pub/brand-image-display-channel-batch 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 184,
          stepTitle: "第 184 步：POST /pub/brand-image-display-channel-batch 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:POST /pub/brand-image-display-channel-batch 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /pub/brand-image-display-channel-batch 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 263 条品牌接口测试：POST /ops-brand/multipart-upload/parts",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[262];
      await test.step("前置：读取第 263 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/multipart-upload/parts");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/multipart-upload/parts");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/multipart-upload/parts", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/multipart-upload/parts 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/multipart-upload/parts 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/multipart-upload/parts 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/multipart-upload/parts 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 263,
          stepTitle: "第 263 步：POST /ops-brand/multipart-upload/parts 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:POST /ops-brand/multipart-upload/parts 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/multipart-upload/parts 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 264 条品牌接口测试：POST /ops-brand/multipart-upload/part-urls/refresh",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[263];
      await test.step("前置：读取第 264 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/multipart-upload/part-urls/refresh");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/multipart-upload/part-urls/refresh");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/multipart-upload/part-urls/refresh", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/multipart-upload/part-urls/refresh 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/multipart-upload/part-urls/refresh 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/multipart-upload/part-urls/refresh 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/multipart-upload/part-urls/refresh 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 264,
          stepTitle: "第 264 步：POST /ops-brand/multipart-upload/part-urls/refresh 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:POST /ops-brand/multipart-upload/part-urls/refresh 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/multipart-upload/part-urls/refresh 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 265 条品牌接口测试：POST /ops-brand/multipart-upload/init",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[264];
      await test.step("前置：读取第 265 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/multipart-upload/init");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/multipart-upload/init");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/multipart-upload/init", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/multipart-upload/init 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/multipart-upload/init 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/multipart-upload/init 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/multipart-upload/init 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 265,
          stepTitle: "第 265 步：POST /ops-brand/multipart-upload/init 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:POST /ops-brand/multipart-upload/init 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/multipart-upload/init 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 266 条品牌接口测试：POST /ops-brand/multipart-upload/complete",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[265];
      await test.step("前置：读取第 266 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/multipart-upload/complete");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/multipart-upload/complete");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/multipart-upload/complete", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/multipart-upload/complete 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/multipart-upload/complete 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/multipart-upload/complete 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/multipart-upload/complete 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 266,
          stepTitle: "第 266 步：POST /ops-brand/multipart-upload/complete 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:POST /ops-brand/multipart-upload/complete 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/multipart-upload/complete 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 267 条品牌接口测试：POST /ops-brand/multipart-upload/abort",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[266];
      await test.step("前置：读取第 267 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/multipart-upload/abort");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/multipart-upload/abort");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/multipart-upload/abort", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/multipart-upload/abort 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/multipart-upload/abort 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/multipart-upload/abort 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/multipart-upload/abort 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 267,
          stepTitle: "第 267 步：POST /ops-brand/multipart-upload/abort 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:POST /ops-brand/multipart-upload/abort 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/multipart-upload/abort 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 367 条品牌接口测试：POST /ops-brand/brand-images",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[366];
      await test.step("前置：读取第 367 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-images");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-images");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-images", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-images 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-images 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-images 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-images 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 367,
          stepTitle: "第 367 步：POST /ops-brand/brand-images 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-images 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-images 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 368 条品牌接口测试：POST /ops-brand/brand-images/list",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[367];
      await test.step("前置：读取第 368 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-images/list");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-images/list");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-images/list", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-images/list 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-images/list 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-images/list 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-images/list 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 368,
          stepTitle: "第 368 步：POST /ops-brand/brand-images/list 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-images/list 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-images/list 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 369 条品牌接口测试：POST /ops-brand/brand-images/image-path-copying",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[368];
      await test.step("前置：读取第 369 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-images/image-path-copying");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-images/image-path-copying");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-images/image-path-copying", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-images/image-path-copying 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-images/image-path-copying 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-images/image-path-copying 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-images/image-path-copying 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 369,
          stepTitle: "第 369 步：POST /ops-brand/brand-images/image-path-copying 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-images/image-path-copying 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-images/image-path-copying 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 370 条品牌接口测试：POST /ops-brand/brand-image-files",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[369];
      await test.step("前置：读取第 370 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-image-files");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-image-files");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-image-files", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-image-files 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-image-files 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-image-files 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-image-files 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 370,
          stepTitle: "第 370 步：POST /ops-brand/brand-image-files 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-image-files 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-image-files 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 371 条品牌接口测试：GET /ops-brand/brand-image-display-channels",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[370];
      await test.step("前置：读取第 371 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-image-display-channels");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-image-display-channels");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-image-display-channels", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-image-display-channels 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-image-display-channels 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-image-display-channels 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-image-display-channels 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 371,
          stepTitle: "第 371 步：GET /ops-brand/brand-image-display-channels 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-image-display-channels 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-image-display-channels 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 372 条品牌接口测试：POST /ops-brand/brand-image-display-channels",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[371];
      await test.step("前置：读取第 372 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-image-display-channels");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-image-display-channels");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-image-display-channels", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-image-display-channels 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-image-display-channels 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-image-display-channels 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-image-display-channels 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 372,
          stepTitle: "第 372 步：POST /ops-brand/brand-image-display-channels 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-image-display-channels 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-image-display-channels 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 431 条品牌接口测试：GET /ops-poi/templates",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[430];
      await test.step("前置：读取第 431 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-poi/templates");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-poi/templates");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-poi/templates", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-poi/templates 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-poi/templates 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-poi/templates 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-poi/templates 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 431,
          stepTitle: "第 431 步：GET /ops-poi/templates 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:GET /ops-poi/templates 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-poi/templates 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 432 条品牌接口测试：GET /ops-brand/templates",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[431];
      await test.step("前置：读取第 432 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/templates");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/templates");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/templates", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/templates 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/templates 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/templates 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/templates 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 432,
          stepTitle: "第 432 步：GET /ops-brand/templates 接口测试",
          observedState: `${result.status ?? 'preflight'} / ${result.classification}`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: `${result.status ?? 'preflight'} / ${result.classification}` });
        if (blocked) test.skip(true, result.diagnostic ?? `${operation.operationKey} 缺少可恢复的接口测试能力`);
        expect(result.outcome, "brand-menu:GET /ops-brand/templates 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/templates 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );
  test.afterAll(async () => {
    const reportPath = path.resolve(process.cwd(), 'output/brand-menu-api-shards/group-14.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({
      generatedAt: new Date().toISOString(), scope: 'brand-menu', shardId: "group-14", shardName: "图片与文件",
      industryExcluded: true, authentication: authEvidence, total: 20, executed: results.length, results,
    }, null, 2), 'utf8');
  });
});
