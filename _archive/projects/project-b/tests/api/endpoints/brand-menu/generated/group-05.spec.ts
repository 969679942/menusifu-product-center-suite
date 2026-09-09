import { expect, test } from '../../../../../fixtures/product-center-api.fixture';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildProbeRequest, probeBrandMenuOperation, readBrandMenuOperations, type BrandMenuProbeResult } from '../../../../../utils/brand-menu-live-probe';

const results: BrandMenuProbeResult[] = [];
let authEvidence: Record<string, unknown> | undefined;

test.describe("品牌商品和菜单 API：调味、加料与做法", () => {
  test(
    "第 014 条品牌接口测试：GET /ops-poi/global-modifier/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[13];
      await test.step("前置：读取第 14 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-poi/global-modifier/{id}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-poi/global-modifier/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-poi/global-modifier/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-poi/global-modifier/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-poi/global-modifier/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-poi/global-modifier/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-poi/global-modifier/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 14,
          stepTitle: "第 14 步：GET /ops-poi/global-modifier/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-poi/global-modifier/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-poi/global-modifier/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 015 条品牌接口测试：PUT /ops-poi/global-modifier/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[14];
      await test.step("前置：读取第 15 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-poi/global-modifier/{id}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-poi/global-modifier/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-poi/global-modifier/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-poi/global-modifier/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-poi/global-modifier/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-poi/global-modifier/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-poi/global-modifier/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 15,
          stepTitle: "第 15 步：PUT /ops-poi/global-modifier/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-poi/global-modifier/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-poi/global-modifier/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 016 条品牌接口测试：DELETE /ops-poi/global-modifier/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[15];
      await test.step("前置：读取第 16 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-poi/global-modifier/{id}");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-poi/global-modifier/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-poi/global-modifier/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-poi/global-modifier/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-poi/global-modifier/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-poi/global-modifier/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-poi/global-modifier/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 16,
          stepTitle: "第 16 步：DELETE /ops-poi/global-modifier/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:DELETE /ops-poi/global-modifier/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-poi/global-modifier/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 032 条品牌接口测试：GET /ops-brand/modifier-template/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[31];
      await test.step("前置：读取第 32 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/modifier-template/{id}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/modifier-template/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/modifier-template/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/modifier-template/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/modifier-template/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/modifier-template/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/modifier-template/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 32,
          stepTitle: "第 32 步：GET /ops-brand/modifier-template/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/modifier-template/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/modifier-template/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 033 条品牌接口测试：PUT /ops-brand/modifier-template/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[32];
      await test.step("前置：读取第 33 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/modifier-template/{id}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/modifier-template/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/modifier-template/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/modifier-template/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/modifier-template/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/modifier-template/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/modifier-template/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 33,
          stepTitle: "第 33 步：PUT /ops-brand/modifier-template/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/modifier-template/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/modifier-template/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 034 条品牌接口测试：DELETE /ops-brand/modifier-template/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[33];
      await test.step("前置：读取第 34 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-brand/modifier-template/{id}");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-brand/modifier-template/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-brand/modifier-template/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-brand/modifier-template/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-brand/modifier-template/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-brand/modifier-template/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-brand/modifier-template/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 34,
          stepTitle: "第 34 步：DELETE /ops-brand/modifier-template/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:DELETE /ops-brand/modifier-template/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-brand/modifier-template/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 051 条品牌接口测试：GET /ops-brand/global-modifier/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[50];
      await test.step("前置：读取第 51 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/global-modifier/{id}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/global-modifier/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/global-modifier/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/global-modifier/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/global-modifier/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/global-modifier/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/global-modifier/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 51,
          stepTitle: "第 51 步：GET /ops-brand/global-modifier/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/global-modifier/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/global-modifier/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 052 条品牌接口测试：PUT /ops-brand/global-modifier/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[51];
      await test.step("前置：读取第 52 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/global-modifier/{id}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/global-modifier/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/global-modifier/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/global-modifier/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/global-modifier/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/global-modifier/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/global-modifier/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 52,
          stepTitle: "第 52 步：PUT /ops-brand/global-modifier/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/global-modifier/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/global-modifier/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 053 条品牌接口测试：DELETE /ops-brand/global-modifier/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[52];
      await test.step("前置：读取第 53 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-brand/global-modifier/{id}");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-brand/global-modifier/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-brand/global-modifier/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-brand/global-modifier/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-brand/global-modifier/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-brand/global-modifier/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-brand/global-modifier/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 53,
          stepTitle: "第 53 步：DELETE /ops-brand/global-modifier/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:DELETE /ops-brand/global-modifier/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-brand/global-modifier/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 054 条品牌接口测试：PUT /ops-brand/global-modifier/sort",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[53];
      await test.step("前置：读取第 54 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/global-modifier/sort");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/global-modifier/sort");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/global-modifier/sort", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/global-modifier/sort 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/global-modifier/sort 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/global-modifier/sort 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/global-modifier/sort 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 54,
          stepTitle: "第 54 步：PUT /ops-brand/global-modifier/sort 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/global-modifier/sort 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/global-modifier/sort 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 055 条品牌接口测试：PUT /ops-brand/global-modifier/platform-types/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[54];
      await test.step("前置：读取第 55 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/global-modifier/platform-types/{id}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/global-modifier/platform-types/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/global-modifier/platform-types/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/global-modifier/platform-types/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/global-modifier/platform-types/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/global-modifier/platform-types/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/global-modifier/platform-types/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 55,
          stepTitle: "第 55 步：PUT /ops-brand/global-modifier/platform-types/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/global-modifier/platform-types/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/global-modifier/platform-types/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 056 条品牌接口测试：GET /ops-brand/global-modifier/platform-presets/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[55];
      await test.step("前置：读取第 56 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/global-modifier/platform-presets/{id}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/global-modifier/platform-presets/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/global-modifier/platform-presets/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/global-modifier/platform-presets/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/global-modifier/platform-presets/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/global-modifier/platform-presets/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/global-modifier/platform-presets/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 56,
          stepTitle: "第 56 步：GET /ops-brand/global-modifier/platform-presets/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/global-modifier/platform-presets/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/global-modifier/platform-presets/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 057 条品牌接口测试：PUT /ops-brand/global-modifier/platform-presets/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[56];
      await test.step("前置：读取第 57 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/global-modifier/platform-presets/{id}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/global-modifier/platform-presets/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/global-modifier/platform-presets/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/global-modifier/platform-presets/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/global-modifier/platform-presets/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/global-modifier/platform-presets/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/global-modifier/platform-presets/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 57,
          stepTitle: "第 57 步：PUT /ops-brand/global-modifier/platform-presets/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/global-modifier/platform-presets/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/global-modifier/platform-presets/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 058 条品牌接口测试：DELETE /ops-brand/global-modifier/platform-presets/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[57];
      await test.step("前置：读取第 58 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-brand/global-modifier/platform-presets/{id}");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-brand/global-modifier/platform-presets/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-brand/global-modifier/platform-presets/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-brand/global-modifier/platform-presets/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-brand/global-modifier/platform-presets/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-brand/global-modifier/platform-presets/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-brand/global-modifier/platform-presets/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 58,
          stepTitle: "第 58 步：DELETE /ops-brand/global-modifier/platform-presets/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:DELETE /ops-brand/global-modifier/platform-presets/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-brand/global-modifier/platform-presets/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 059 条品牌接口测试：PUT /ops-brand/global-modifier/options/{optionId}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[58];
      await test.step("前置：读取第 59 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/global-modifier/options/{optionId}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/global-modifier/options/{optionId}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/global-modifier/options/{optionId}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/global-modifier/options/{optionId} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/global-modifier/options/{optionId} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/global-modifier/options/{optionId} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/global-modifier/options/{optionId} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 59,
          stepTitle: "第 59 步：PUT /ops-brand/global-modifier/options/{optionId} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/global-modifier/options/{optionId} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/global-modifier/options/{optionId} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 060 条品牌接口测试：DELETE /ops-brand/global-modifier/options/{optionId}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[59];
      await test.step("前置：读取第 60 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-brand/global-modifier/options/{optionId}");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-brand/global-modifier/options/{optionId}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-brand/global-modifier/options/{optionId}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-brand/global-modifier/options/{optionId} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-brand/global-modifier/options/{optionId} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-brand/global-modifier/options/{optionId} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-brand/global-modifier/options/{optionId} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 60,
          stepTitle: "第 60 步：DELETE /ops-brand/global-modifier/options/{optionId} 接口测试",
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
        expect(result.outcome, "brand-menu:DELETE /ops-brand/global-modifier/options/{optionId} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-brand/global-modifier/options/{optionId} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 061 条品牌接口测试：PUT /ops-brand/global-modifier/options/batch-status",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[60];
      await test.step("前置：读取第 61 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/global-modifier/options/batch-status");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/global-modifier/options/batch-status");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/global-modifier/options/batch-status", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/global-modifier/options/batch-status 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/global-modifier/options/batch-status 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/global-modifier/options/batch-status 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/global-modifier/options/batch-status 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 61,
          stepTitle: "第 61 步：PUT /ops-brand/global-modifier/options/batch-status 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/global-modifier/options/batch-status 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/global-modifier/options/batch-status 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 062 条品牌接口测试：PUT /ops-brand/global-modifier/batch-status",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[61];
      await test.step("前置：读取第 62 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/global-modifier/batch-status");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/global-modifier/batch-status");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/global-modifier/batch-status", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/global-modifier/batch-status 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/global-modifier/batch-status 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/global-modifier/batch-status 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/global-modifier/batch-status 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 62,
          stepTitle: "第 62 步：PUT /ops-brand/global-modifier/batch-status 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/global-modifier/batch-status 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/global-modifier/batch-status 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 110 条品牌接口测试：PUT /ops-brand/brand-modifier-sync/task/resume/{taskId}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[109];
      await test.step("前置：读取第 110 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/brand-modifier-sync/task/resume/{taskId}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/brand-modifier-sync/task/resume/{taskId}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/brand-modifier-sync/task/resume/{taskId}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/brand-modifier-sync/task/resume/{taskId} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/brand-modifier-sync/task/resume/{taskId} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/brand-modifier-sync/task/resume/{taskId} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-modifier-sync/task/resume/{taskId} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 110,
          stepTitle: "第 110 步：PUT /ops-brand/brand-modifier-sync/task/resume/{taskId} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/brand-modifier-sync/task/resume/{taskId} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-modifier-sync/task/resume/{taskId} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 111 条品牌接口测试：PUT /ops-brand/brand-modifier-sync/job/resume/{jobId}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[110];
      await test.step("前置：读取第 111 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/brand-modifier-sync/job/resume/{jobId}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/brand-modifier-sync/job/resume/{jobId}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/brand-modifier-sync/job/resume/{jobId}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/brand-modifier-sync/job/resume/{jobId} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/brand-modifier-sync/job/resume/{jobId} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/brand-modifier-sync/job/resume/{jobId} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-modifier-sync/job/resume/{jobId} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 111,
          stepTitle: "第 111 步：PUT /ops-brand/brand-modifier-sync/job/resume/{jobId} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/brand-modifier-sync/job/resume/{jobId} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-modifier-sync/job/resume/{jobId} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 112 条品牌接口测试：GET /ops-brand/brand-modifier-options/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[111];
      await test.step("前置：读取第 112 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-modifier-options/{id}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-modifier-options/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-modifier-options/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-modifier-options/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-modifier-options/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-modifier-options/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-modifier-options/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 112,
          stepTitle: "第 112 步：GET /ops-brand/brand-modifier-options/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-modifier-options/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-modifier-options/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 113 条品牌接口测试：PUT /ops-brand/brand-modifier-options/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[112];
      await test.step("前置：读取第 113 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/brand-modifier-options/{id}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/brand-modifier-options/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/brand-modifier-options/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/brand-modifier-options/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/brand-modifier-options/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/brand-modifier-options/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-modifier-options/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 113,
          stepTitle: "第 113 步：PUT /ops-brand/brand-modifier-options/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/brand-modifier-options/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-modifier-options/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 114 条品牌接口测试：DELETE /ops-brand/brand-modifier-options/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[113];
      await test.step("前置：读取第 114 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-brand/brand-modifier-options/{id}");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-brand/brand-modifier-options/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-brand/brand-modifier-options/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-brand/brand-modifier-options/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-brand/brand-modifier-options/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-brand/brand-modifier-options/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-modifier-options/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 114,
          stepTitle: "第 114 步：DELETE /ops-brand/brand-modifier-options/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:DELETE /ops-brand/brand-modifier-options/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-modifier-options/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 174 条品牌接口测试：GET /ops-brand/brand-addon-group/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[173];
      await test.step("前置：读取第 174 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-addon-group/{id}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-addon-group/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-addon-group/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-addon-group/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-addon-group/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-addon-group/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 174,
          stepTitle: "第 174 步：GET /ops-brand/brand-addon-group/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-addon-group/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 175 条品牌接口测试：PUT /ops-brand/brand-addon-group/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[174];
      await test.step("前置：读取第 175 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/brand-addon-group/{id}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/brand-addon-group/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/brand-addon-group/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/brand-addon-group/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/brand-addon-group/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/brand-addon-group/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-addon-group/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 175,
          stepTitle: "第 175 步：PUT /ops-brand/brand-addon-group/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/brand-addon-group/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-addon-group/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 176 条品牌接口测试：DELETE /ops-brand/brand-addon-group/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[175];
      await test.step("前置：读取第 176 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-brand/brand-addon-group/{id}");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-brand/brand-addon-group/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-brand/brand-addon-group/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-brand/brand-addon-group/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-brand/brand-addon-group/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-brand/brand-addon-group/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-addon-group/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 176,
          stepTitle: "第 176 步：DELETE /ops-brand/brand-addon-group/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:DELETE /ops-brand/brand-addon-group/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-addon-group/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 177 条品牌接口测试：PUT /ops-brand/brand-addon-group/check/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[176];
      await test.step("前置：读取第 177 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/brand-addon-group/check/{id}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/brand-addon-group/check/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/brand-addon-group/check/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/brand-addon-group/check/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/brand-addon-group/check/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/brand-addon-group/check/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-addon-group/check/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 177,
          stepTitle: "第 177 步：PUT /ops-brand/brand-addon-group/check/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/brand-addon-group/check/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-addon-group/check/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 178 条品牌接口测试：GET /ops-brand/brand-addon-group-item/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[177];
      await test.step("前置：读取第 178 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-addon-group-item/{id}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-addon-group-item/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-addon-group-item/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-addon-group-item/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-addon-group-item/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-addon-group-item/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group-item/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 178,
          stepTitle: "第 178 步：GET /ops-brand/brand-addon-group-item/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-addon-group-item/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group-item/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 179 条品牌接口测试：PUT /ops-brand/brand-addon-group-item/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[178];
      await test.step("前置：读取第 179 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/brand-addon-group-item/{id}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/brand-addon-group-item/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/brand-addon-group-item/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/brand-addon-group-item/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/brand-addon-group-item/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/brand-addon-group-item/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-addon-group-item/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 179,
          stepTitle: "第 179 步：PUT /ops-brand/brand-addon-group-item/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/brand-addon-group-item/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-addon-group-item/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 180 条品牌接口测试：DELETE /ops-brand/brand-addon-group-item/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[179];
      await test.step("前置：读取第 180 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-brand/brand-addon-group-item/{id}");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-brand/brand-addon-group-item/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-brand/brand-addon-group-item/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-brand/brand-addon-group-item/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-brand/brand-addon-group-item/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-brand/brand-addon-group-item/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-addon-group-item/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 180,
          stepTitle: "第 180 步：DELETE /ops-brand/brand-addon-group-item/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:DELETE /ops-brand/brand-addon-group-item/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-addon-group-item/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 201 条品牌接口测试：POST /ops-poi/poi-addon-group/list",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[200];
      await test.step("前置：读取第 201 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-poi/poi-addon-group/list");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-poi/poi-addon-group/list");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-poi/poi-addon-group/list", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-poi/poi-addon-group/list 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-poi/poi-addon-group/list 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-poi/poi-addon-group/list 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-poi/poi-addon-group/list 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 201,
          stepTitle: "第 201 步：POST /ops-poi/poi-addon-group/list 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-poi/poi-addon-group/list 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-poi/poi-addon-group/list 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 219 条品牌接口测试：POST /ops-poi/global-modifier",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[218];
      await test.step("前置：读取第 219 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-poi/global-modifier");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-poi/global-modifier");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-poi/global-modifier", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-poi/global-modifier 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-poi/global-modifier 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-poi/global-modifier 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-poi/global-modifier 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 219,
          stepTitle: "第 219 步：POST /ops-poi/global-modifier 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-poi/global-modifier 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-poi/global-modifier 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 220 条品牌接口测试：POST /ops-poi/global-modifier/batch-delete",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[219];
      await test.step("前置：读取第 220 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-poi/global-modifier/batch-delete");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-poi/global-modifier/batch-delete");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-poi/global-modifier/batch-delete", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-poi/global-modifier/batch-delete 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-poi/global-modifier/batch-delete 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-poi/global-modifier/batch-delete 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-poi/global-modifier/batch-delete 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 220,
          stepTitle: "第 220 步：POST /ops-poi/global-modifier/batch-delete 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-poi/global-modifier/batch-delete 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-poi/global-modifier/batch-delete 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 268 条品牌接口测试：POST /ops-brand/modifier-template",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[267];
      await test.step("前置：读取第 268 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/modifier-template");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/modifier-template");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/modifier-template", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/modifier-template 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/modifier-template 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/modifier-template 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/modifier-template 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 268,
          stepTitle: "第 268 步：POST /ops-brand/modifier-template 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/modifier-template 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/modifier-template 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 290 条品牌接口测试：POST /ops-brand/global-modifier",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[289];
      await test.step("前置：读取第 290 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/global-modifier");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/global-modifier");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/global-modifier", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/global-modifier 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/global-modifier 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/global-modifier 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/global-modifier 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 290,
          stepTitle: "第 290 步：POST /ops-brand/global-modifier 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/global-modifier 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/global-modifier 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 291 条品牌接口测试：GET /ops-brand/global-modifier/platform-types",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[290];
      await test.step("前置：读取第 291 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/global-modifier/platform-types");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/global-modifier/platform-types");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/global-modifier/platform-types", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/global-modifier/platform-types 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/global-modifier/platform-types 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/global-modifier/platform-types 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/global-modifier/platform-types 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 291,
          stepTitle: "第 291 步：GET /ops-brand/global-modifier/platform-types 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/global-modifier/platform-types 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/global-modifier/platform-types 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 292 条品牌接口测试：POST /ops-brand/global-modifier/platform-types",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[291];
      await test.step("前置：读取第 292 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/global-modifier/platform-types");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/global-modifier/platform-types");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/global-modifier/platform-types", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/global-modifier/platform-types 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/global-modifier/platform-types 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/global-modifier/platform-types 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/global-modifier/platform-types 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 292,
          stepTitle: "第 292 步：POST /ops-brand/global-modifier/platform-types 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/global-modifier/platform-types 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/global-modifier/platform-types 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 293 条品牌接口测试：POST /ops-brand/global-modifier/platform-presets/save",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[292];
      await test.step("前置：读取第 293 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/global-modifier/platform-presets/save");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/global-modifier/platform-presets/save");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/global-modifier/platform-presets/save", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/global-modifier/platform-presets/save 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/global-modifier/platform-presets/save 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/global-modifier/platform-presets/save 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/global-modifier/platform-presets/save 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 293,
          stepTitle: "第 293 步：POST /ops-brand/global-modifier/platform-presets/save 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/global-modifier/platform-presets/save 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/global-modifier/platform-presets/save 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 294 条品牌接口测试：POST /ops-brand/global-modifier/options/batch-move",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[293];
      await test.step("前置：读取第 294 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/global-modifier/options/batch-move");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/global-modifier/options/batch-move");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/global-modifier/options/batch-move", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/global-modifier/options/batch-move 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/global-modifier/options/batch-move 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/global-modifier/options/batch-move 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/global-modifier/options/batch-move 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 294,
          stepTitle: "第 294 步：POST /ops-brand/global-modifier/options/batch-move 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/global-modifier/options/batch-move 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/global-modifier/options/batch-move 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 295 条品牌接口测试：POST /ops-brand/global-modifier/batch",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[294];
      await test.step("前置：读取第 295 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/global-modifier/batch");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/global-modifier/batch");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/global-modifier/batch", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/global-modifier/batch 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/global-modifier/batch 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/global-modifier/batch 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/global-modifier/batch 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 295,
          stepTitle: "第 295 步：POST /ops-brand/global-modifier/batch 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/global-modifier/batch 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/global-modifier/batch 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 296 条品牌接口测试：POST /ops-brand/global-modifier/batch-delete",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[295];
      await test.step("前置：读取第 296 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/global-modifier/batch-delete");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/global-modifier/batch-delete");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/global-modifier/batch-delete", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/global-modifier/batch-delete 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/global-modifier/batch-delete 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/global-modifier/batch-delete 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/global-modifier/batch-delete 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 296,
          stepTitle: "第 296 步：POST /ops-brand/global-modifier/batch-delete 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/global-modifier/batch-delete 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/global-modifier/batch-delete 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 326 条品牌接口测试：POST /ops-brand/brand-modifier-sync/task/list",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[325];
      await test.step("前置：读取第 326 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-modifier-sync/task/list");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-modifier-sync/task/list");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-modifier-sync/task/list", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-modifier-sync/task/list 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-modifier-sync/task/list 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-modifier-sync/task/list 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-modifier-sync/task/list 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 326,
          stepTitle: "第 326 步：POST /ops-brand/brand-modifier-sync/task/list 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-modifier-sync/task/list 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-modifier-sync/task/list 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 327 条品牌接口测试：POST /ops-brand/brand-modifier-sync/job/list",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[326];
      await test.step("前置：读取第 327 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-modifier-sync/job/list");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-modifier-sync/job/list");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-modifier-sync/job/list", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-modifier-sync/job/list 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-modifier-sync/job/list 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-modifier-sync/job/list 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-modifier-sync/job/list 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 327,
          stepTitle: "第 327 步：POST /ops-brand/brand-modifier-sync/job/list 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-modifier-sync/job/list 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-modifier-sync/job/list 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 328 条品牌接口测试：POST /ops-brand/brand-modifier-sync/by-template",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[327];
      await test.step("前置：读取第 328 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-modifier-sync/by-template");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-modifier-sync/by-template");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-modifier-sync/by-template", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-modifier-sync/by-template 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-modifier-sync/by-template 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-modifier-sync/by-template 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-modifier-sync/by-template 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 328,
          stepTitle: "第 328 步：POST /ops-brand/brand-modifier-sync/by-template 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-modifier-sync/by-template 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-modifier-sync/by-template 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 329 条品牌接口测试：POST /ops-brand/brand-modifier-sync/all",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[328];
      await test.step("前置：读取第 329 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-modifier-sync/all");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-modifier-sync/all");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-modifier-sync/all", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-modifier-sync/all 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-modifier-sync/all 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-modifier-sync/all 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-modifier-sync/all 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 329,
          stepTitle: "第 329 步：POST /ops-brand/brand-modifier-sync/all 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-modifier-sync/all 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-modifier-sync/all 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 330 条品牌接口测试：POST /ops-brand/brand-modifier-options",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[329];
      await test.step("前置：读取第 330 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-modifier-options");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-modifier-options");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-modifier-options", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-modifier-options 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-modifier-options 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-modifier-options 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-modifier-options 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 330,
          stepTitle: "第 330 步：POST /ops-brand/brand-modifier-options 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-modifier-options 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-modifier-options 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 387 条品牌接口测试：POST /ops-brand/brand-addon-group",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[386];
      await test.step("前置：读取第 387 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-addon-group");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-addon-group");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-addon-group", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-addon-group 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-addon-group 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-addon-group 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-addon-group 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 387,
          stepTitle: "第 387 步：POST /ops-brand/brand-addon-group 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-addon-group 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-addon-group 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 388 条品牌接口测试：POST /ops-brand/brand-addon-group-item",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[387];
      await test.step("前置：读取第 388 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-addon-group-item");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-addon-group-item");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-addon-group-item", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-addon-group-item 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-addon-group-item 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-addon-group-item 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-addon-group-item 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 388,
          stepTitle: "第 388 步：POST /ops-brand/brand-addon-group-item 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-addon-group-item 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-addon-group-item 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 389 条品牌接口测试：POST /ops-brand/brand-addon-group-item/batchCreate",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[388];
      await test.step("前置：读取第 389 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-addon-group-item/batchCreate");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-addon-group-item/batchCreate");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-addon-group-item/batchCreate", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-addon-group-item/batchCreate 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-addon-group-item/batchCreate 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-addon-group-item/batchCreate 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-addon-group-item/batchCreate 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 389,
          stepTitle: "第 389 步：POST /ops-brand/brand-addon-group-item/batchCreate 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-addon-group-item/batchCreate 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-addon-group-item/batchCreate 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 418 条品牌接口测试：GET /ops-poi/poi-modifiers/push",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[417];
      await test.step("前置：读取第 418 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-poi/poi-modifiers/push");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-poi/poi-modifiers/push");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-poi/poi-modifiers/push", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-poi/poi-modifiers/push 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-poi/poi-modifiers/push 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-poi/poi-modifiers/push 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-poi/poi-modifiers/push 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 418,
          stepTitle: "第 418 步：GET /ops-poi/poi-modifiers/push 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-poi/poi-modifiers/push 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-poi/poi-modifiers/push 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 426 条品牌接口测试：GET /ops-poi/global-modifier/page",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[425];
      await test.step("前置：读取第 426 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-poi/global-modifier/page");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-poi/global-modifier/page");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-poi/global-modifier/page", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-poi/global-modifier/page 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-poi/global-modifier/page 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-poi/global-modifier/page 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-poi/global-modifier/page 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 426,
          stepTitle: "第 426 步：GET /ops-poi/global-modifier/page 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-poi/global-modifier/page 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-poi/global-modifier/page 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 427 条品牌接口测试：GET /ops-poi/global-modifier/list",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[426];
      await test.step("前置：读取第 427 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-poi/global-modifier/list");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-poi/global-modifier/list");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-poi/global-modifier/list", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-poi/global-modifier/list 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-poi/global-modifier/list 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-poi/global-modifier/list 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-poi/global-modifier/list 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 427,
          stepTitle: "第 427 步：GET /ops-poi/global-modifier/list 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-poi/global-modifier/list 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-poi/global-modifier/list 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 461 条品牌接口测试：GET /ops-brand/modifier-template/page",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[460];
      await test.step("前置：读取第 461 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/modifier-template/page");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/modifier-template/page");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/modifier-template/page", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/modifier-template/page 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/modifier-template/page 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/modifier-template/page 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/modifier-template/page 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 461,
          stepTitle: "第 461 步：GET /ops-brand/modifier-template/page 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/modifier-template/page 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/modifier-template/page 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 462 条品牌接口测试：GET /ops-brand/modifier-template/list",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[461];
      await test.step("前置：读取第 462 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/modifier-template/list");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/modifier-template/list");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/modifier-template/list", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/modifier-template/list 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/modifier-template/list 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/modifier-template/list 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/modifier-template/list 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 462,
          stepTitle: "第 462 步：GET /ops-brand/modifier-template/list 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/modifier-template/list 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/modifier-template/list 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 469 条品牌接口测试：GET /ops-brand/global-modifier/platform-presets",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[468];
      await test.step("前置：读取第 469 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/global-modifier/platform-presets");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/global-modifier/platform-presets");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/global-modifier/platform-presets", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/global-modifier/platform-presets 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/global-modifier/platform-presets 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/global-modifier/platform-presets 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/global-modifier/platform-presets 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 469,
          stepTitle: "第 469 步：GET /ops-brand/global-modifier/platform-presets 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/global-modifier/platform-presets 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/global-modifier/platform-presets 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 470 条品牌接口测试：GET /ops-brand/global-modifier/page",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[469];
      await test.step("前置：读取第 470 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/global-modifier/page");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/global-modifier/page");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/global-modifier/page", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/global-modifier/page 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/global-modifier/page 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/global-modifier/page 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/global-modifier/page 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 470,
          stepTitle: "第 470 步：GET /ops-brand/global-modifier/page 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/global-modifier/page 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/global-modifier/page 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 471 条品牌接口测试：GET /ops-brand/global-modifier/list",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[470];
      await test.step("前置：读取第 471 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/global-modifier/list");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/global-modifier/list");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/global-modifier/list", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/global-modifier/list 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/global-modifier/list 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/global-modifier/list 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/global-modifier/list 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 471,
          stepTitle: "第 471 步：GET /ops-brand/global-modifier/list 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/global-modifier/list 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/global-modifier/list 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 505 条品牌接口测试：GET /ops-brand/brand-modifier-sync/execute/{jobId}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[504];
      await test.step("前置：读取第 505 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-modifier-sync/execute/{jobId}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-modifier-sync/execute/{jobId}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-modifier-sync/execute/{jobId}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-modifier-sync/execute/{jobId} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-modifier-sync/execute/{jobId} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-modifier-sync/execute/{jobId} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-modifier-sync/execute/{jobId} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 505,
          stepTitle: "第 505 步：GET /ops-brand/brand-modifier-sync/execute/{jobId} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-modifier-sync/execute/{jobId} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-modifier-sync/execute/{jobId} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 550 条品牌接口测试：GET /ops-brand/brand-addon-group/search",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[549];
      await test.step("前置：读取第 550 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-addon-group/search");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-addon-group/search");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-addon-group/search", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-addon-group/search 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-addon-group/search 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-addon-group/search 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group/search 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 550,
          stepTitle: "第 550 步：GET /ops-brand/brand-addon-group/search 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-addon-group/search 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group/search 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 551 条品牌接口测试：GET /ops-brand/brand-addon-group/list",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[550];
      await test.step("前置：读取第 551 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-addon-group/list");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-addon-group/list");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-addon-group/list", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-addon-group/list 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-addon-group/list 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-addon-group/list 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group/list 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 551,
          stepTitle: "第 551 步：GET /ops-brand/brand-addon-group/list 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-addon-group/list 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group/list 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 552 条品牌接口测试：GET /ops-brand/brand-addon-group/hasItems/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[551];
      await test.step("前置：读取第 552 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-addon-group/hasItems/{id}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-addon-group/hasItems/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-addon-group/hasItems/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-addon-group/hasItems/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-addon-group/hasItems/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-addon-group/hasItems/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group/hasItems/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 552,
          stepTitle: "第 552 步：GET /ops-brand/brand-addon-group/hasItems/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-addon-group/hasItems/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group/hasItems/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 553 条品牌接口测试：GET /ops-brand/brand-addon-group/copy/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[552];
      await test.step("前置：读取第 553 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-addon-group/copy/{id}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-addon-group/copy/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-addon-group/copy/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-addon-group/copy/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-addon-group/copy/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-addon-group/copy/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group/copy/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 553,
          stepTitle: "第 553 步：GET /ops-brand/brand-addon-group/copy/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-addon-group/copy/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group/copy/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 554 条品牌接口测试：GET /ops-brand/brand-addon-group/all",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[553];
      await test.step("前置：读取第 554 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-addon-group/all");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-addon-group/all");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-addon-group/all", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-addon-group/all 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-addon-group/all 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-addon-group/all 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group/all 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 554,
          stepTitle: "第 554 步：GET /ops-brand/brand-addon-group/all 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-addon-group/all 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group/all 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 555 条品牌接口测试：GET /ops-brand/brand-addon-group-item/search",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[554];
      await test.step("前置：读取第 555 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-addon-group-item/search");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-addon-group-item/search");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-addon-group-item/search", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-addon-group-item/search 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-addon-group-item/search 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-addon-group-item/search 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group-item/search 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 555,
          stepTitle: "第 555 步：GET /ops-brand/brand-addon-group-item/search 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-addon-group-item/search 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group-item/search 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 556 条品牌接口测试：GET /ops-brand/brand-addon-group-item/list",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[555];
      await test.step("前置：读取第 556 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-addon-group-item/list");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-addon-group-item/list");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-addon-group-item/list", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-addon-group-item/list 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-addon-group-item/list 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-addon-group-item/list 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group-item/list 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 556,
          stepTitle: "第 556 步：GET /ops-brand/brand-addon-group-item/list 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-addon-group-item/list 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group-item/list 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 557 条品牌接口测试：GET /ops-brand/brand-addon-group-item/hasItems/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[556];
      await test.step("前置：读取第 557 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-addon-group-item/hasItems/{id}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-addon-group-item/hasItems/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-addon-group-item/hasItems/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-addon-group-item/hasItems/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-addon-group-item/hasItems/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-addon-group-item/hasItems/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group-item/hasItems/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 557,
          stepTitle: "第 557 步：GET /ops-brand/brand-addon-group-item/hasItems/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-addon-group-item/hasItems/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group-item/hasItems/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 558 条品牌接口测试：GET /ops-brand/brand-addon-group-item/all",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[557];
      await test.step("前置：读取第 558 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-addon-group-item/all");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-addon-group-item/all");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-addon-group-item/all", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-addon-group-item/all 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-addon-group-item/all 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-addon-group-item/all 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group-item/all 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 558,
          stepTitle: "第 558 步：GET /ops-brand/brand-addon-group-item/all 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-addon-group-item/all 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-addon-group-item/all 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 568 条品牌接口测试：GET /internal/pos/pull/global-modifier",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[567];
      await test.step("前置：读取第 568 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /internal/pos/pull/global-modifier");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/internal/pos/pull/global-modifier");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /internal/pos/pull/global-modifier", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /internal/pos/pull/global-modifier 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /internal/pos/pull/global-modifier 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /internal/pos/pull/global-modifier 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /internal/pos/pull/global-modifier 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 568,
          stepTitle: "第 568 步：GET /internal/pos/pull/global-modifier 接口测试",
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
        expect(result.outcome, "brand-menu:GET /internal/pos/pull/global-modifier 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /internal/pos/pull/global-modifier 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 572 条品牌接口测试：DELETE /ops-poi/global-modifier/option/{optionId}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[571];
      await test.step("前置：读取第 572 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-poi/global-modifier/option/{optionId}");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-poi/global-modifier/option/{optionId}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-poi/global-modifier/option/{optionId}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-poi/global-modifier/option/{optionId} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-poi/global-modifier/option/{optionId} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-poi/global-modifier/option/{optionId} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-poi/global-modifier/option/{optionId} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 572,
          stepTitle: "第 572 步：DELETE /ops-poi/global-modifier/option/{optionId} 接口测试",
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
        expect(result.outcome, "brand-menu:DELETE /ops-poi/global-modifier/option/{optionId} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-poi/global-modifier/option/{optionId} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );
  test.afterAll(async () => {
    const reportPath = path.resolve(process.cwd(), 'output/brand-menu-api-shards/group-05.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({
      generatedAt: new Date().toISOString(), scope: 'brand-menu', shardId: "group-05", shardName: "调味、加料与做法",
      industryExcluded: true, authentication: authEvidence, total: 69, executed: results.length, results,
    }, null, 2), 'utf8');
  });
});
