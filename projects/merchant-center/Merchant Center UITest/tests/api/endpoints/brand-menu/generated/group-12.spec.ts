import { expect, test } from '../../../../../fixtures/product-center-api.fixture';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildProbeRequest, probeBrandMenuOperation, readBrandMenuOperations, type BrandMenuProbeResult } from '../../../../../utils/brand-menu-live-probe';

const results: BrandMenuProbeResult[] = [];
let authEvidence: Record<string, unknown> | undefined;

test.describe("品牌商品和菜单 API：营养与过敏原", () => {
  test(
    "第 101 条品牌接口测试：GET /ops-brand/brand-nutritions/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[100];
      await test.step("前置：读取第 101 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-nutritions/{id}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-nutritions/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-nutritions/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-nutritions/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-nutritions/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-nutritions/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-nutritions/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 101,
          stepTitle: "第 101 步：GET /ops-brand/brand-nutritions/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-nutritions/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-nutritions/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 102 条品牌接口测试：PUT /ops-brand/brand-nutritions/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[101];
      await test.step("前置：读取第 102 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/brand-nutritions/{id}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/brand-nutritions/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/brand-nutritions/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/brand-nutritions/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/brand-nutritions/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/brand-nutritions/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-nutritions/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 102,
          stepTitle: "第 102 步：PUT /ops-brand/brand-nutritions/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/brand-nutritions/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-nutritions/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 103 条品牌接口测试：DELETE /ops-brand/brand-nutritions/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[102];
      await test.step("前置：读取第 103 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-brand/brand-nutritions/{id}");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-brand/brand-nutritions/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-brand/brand-nutritions/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-brand/brand-nutritions/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-brand/brand-nutritions/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-brand/brand-nutritions/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-nutritions/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 103,
          stepTitle: "第 103 步：DELETE /ops-brand/brand-nutritions/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:DELETE /ops-brand/brand-nutritions/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-nutritions/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 171 条品牌接口测试：GET /ops-brand/brand-allergens/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[170];
      await test.step("前置：读取第 171 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-allergens/{id}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-allergens/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-allergens/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-allergens/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-allergens/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-allergens/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-allergens/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 171,
          stepTitle: "第 171 步：GET /ops-brand/brand-allergens/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-allergens/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-allergens/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 172 条品牌接口测试：PUT /ops-brand/brand-allergens/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[171];
      await test.step("前置：读取第 172 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/brand-allergens/{id}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/brand-allergens/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/brand-allergens/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/brand-allergens/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/brand-allergens/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/brand-allergens/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-allergens/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 172,
          stepTitle: "第 172 步：PUT /ops-brand/brand-allergens/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/brand-allergens/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-allergens/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 173 条品牌接口测试：DELETE /ops-brand/brand-allergens/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[172];
      await test.step("前置：读取第 173 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-brand/brand-allergens/{id}");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-brand/brand-allergens/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-brand/brand-allergens/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-brand/brand-allergens/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-brand/brand-allergens/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-brand/brand-allergens/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-allergens/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 173,
          stepTitle: "第 173 步：DELETE /ops-brand/brand-allergens/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:DELETE /ops-brand/brand-allergens/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-allergens/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 323 条品牌接口测试：POST /ops-brand/brand-nutritions",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[322];
      await test.step("前置：读取第 323 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-nutritions");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-nutritions");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-nutritions", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-nutritions 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-nutritions 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-nutritions 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-nutritions 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 323,
          stepTitle: "第 323 步：POST /ops-brand/brand-nutritions 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-nutritions 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-nutritions 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 386 条品牌接口测试：POST /ops-brand/brand-allergens",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[385];
      await test.step("前置：读取第 386 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-allergens");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-allergens");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-allergens", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-allergens 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-allergens 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-allergens 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-allergens 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 386,
          stepTitle: "第 386 步：POST /ops-brand/brand-allergens 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-allergens 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-allergens 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 458 条品牌接口测试：GET /ops-brand/platform-nutrition/page",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[457];
      await test.step("前置：读取第 458 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/platform-nutrition/page");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/platform-nutrition/page");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/platform-nutrition/page", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/platform-nutrition/page 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/platform-nutrition/page 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/platform-nutrition/page 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/platform-nutrition/page 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 458,
          stepTitle: "第 458 步：GET /ops-brand/platform-nutrition/page 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/platform-nutrition/page 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/platform-nutrition/page 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 460 条品牌接口测试：GET /ops-brand/platform-allergen/page",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[459];
      await test.step("前置：读取第 460 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/platform-allergen/page");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/platform-allergen/page");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/platform-allergen/page", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/platform-allergen/page 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/platform-allergen/page 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/platform-allergen/page 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/platform-allergen/page 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 460,
          stepTitle: "第 460 步：GET /ops-brand/platform-allergen/page 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/platform-allergen/page 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/platform-allergen/page 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 498 条品牌接口测试：GET /ops-brand/brand-nutritions/search",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[497];
      await test.step("前置：读取第 498 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-nutritions/search");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-nutritions/search");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-nutritions/search", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-nutritions/search 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-nutritions/search 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-nutritions/search 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-nutritions/search 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 498,
          stepTitle: "第 498 步：GET /ops-brand/brand-nutritions/search 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-nutritions/search 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-nutritions/search 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 499 条品牌接口测试：GET /ops-brand/brand-nutritions/list",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[498];
      await test.step("前置：读取第 499 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-nutritions/list");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-nutritions/list");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-nutritions/list", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-nutritions/list 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-nutritions/list 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-nutritions/list 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-nutritions/list 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 499,
          stepTitle: "第 499 步：GET /ops-brand/brand-nutritions/list 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-nutritions/list 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-nutritions/list 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 500 条品牌接口测试：GET /ops-brand/brand-nutritions/all",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[499];
      await test.step("前置：读取第 500 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-nutritions/all");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-nutritions/all");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-nutritions/all", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-nutritions/all 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-nutritions/all 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-nutritions/all 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-nutritions/all 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 500,
          stepTitle: "第 500 步：GET /ops-brand/brand-nutritions/all 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-nutritions/all 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-nutritions/all 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 547 条品牌接口测试：GET /ops-brand/brand-allergens/search",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[546];
      await test.step("前置：读取第 547 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-allergens/search");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-allergens/search");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-allergens/search", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-allergens/search 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-allergens/search 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-allergens/search 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-allergens/search 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 547,
          stepTitle: "第 547 步：GET /ops-brand/brand-allergens/search 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-allergens/search 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-allergens/search 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 548 条品牌接口测试：GET /ops-brand/brand-allergens/list",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[547];
      await test.step("前置：读取第 548 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-allergens/list");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-allergens/list");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-allergens/list", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-allergens/list 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-allergens/list 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-allergens/list 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-allergens/list 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 548,
          stepTitle: "第 548 步：GET /ops-brand/brand-allergens/list 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-allergens/list 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-allergens/list 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 549 条品牌接口测试：GET /ops-brand/brand-allergens/all",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[548];
      await test.step("前置：读取第 549 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-allergens/all");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-allergens/all");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-allergens/all", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-allergens/all 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-allergens/all 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-allergens/all 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-allergens/all 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 549,
          stepTitle: "第 549 步：GET /ops-brand/brand-allergens/all 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-allergens/all 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-allergens/all 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );
  test.afterAll(async () => {
    const reportPath = path.resolve(process.cwd(), 'output/brand-menu-api-shards/group-12.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({
      generatedAt: new Date().toISOString(), scope: 'brand-menu', shardId: "group-12", shardName: "营养与过敏原",
      industryExcluded: true, authentication: authEvidence, total: 16, executed: results.length, results,
    }, null, 2), 'utf8');
  });
});
