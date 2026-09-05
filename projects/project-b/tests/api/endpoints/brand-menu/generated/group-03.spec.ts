import { expect, test } from '../../../../../fixtures/product-center-api.fixture';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildProbeRequest, probeBrandMenuOperation, readBrandMenuOperations, type BrandMenuProbeResult } from '../../../../../utils/brand-menu-live-probe';

const results: BrandMenuProbeResult[] = [];
let authEvidence: Record<string, unknown> | undefined;

test.describe("品牌商品和菜单 API：多语言", () => {
  test(
    "第 008 条品牌接口测试：GET /ops-poi/poi-i18n-config",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[7];
      await test.step("前置：读取第 8 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-poi/poi-i18n-config");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-poi/poi-i18n-config");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-poi/poi-i18n-config", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-poi/poi-i18n-config 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-poi/poi-i18n-config 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-poi/poi-i18n-config 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-poi/poi-i18n-config 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 8,
          stepTitle: "第 8 步：GET /ops-poi/poi-i18n-config 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-poi/poi-i18n-config 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-poi/poi-i18n-config 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 009 条品牌接口测试：PUT /ops-poi/poi-i18n-config",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[8];
      await test.step("前置：读取第 9 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-poi/poi-i18n-config");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-poi/poi-i18n-config");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-poi/poi-i18n-config", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-poi/poi-i18n-config 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-poi/poi-i18n-config 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-poi/poi-i18n-config 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-poi/poi-i18n-config 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 9,
          stepTitle: "第 9 步：PUT /ops-poi/poi-i18n-config 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-poi/poi-i18n-config 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-poi/poi-i18n-config 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 041 条品牌接口测试：PUT /ops-brand/item-i18n/batch-save",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[40];
      await test.step("前置：读取第 41 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/item-i18n/batch-save");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/item-i18n/batch-save");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/item-i18n/batch-save", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/item-i18n/batch-save 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/item-i18n/batch-save 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/item-i18n/batch-save 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/item-i18n/batch-save 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 41,
          stepTitle: "第 41 步：PUT /ops-brand/item-i18n/batch-save 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/item-i18n/batch-save 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/item-i18n/batch-save 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 044 条品牌接口测试：GET /ops-brand/i18n/brand-i18n",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[43];
      await test.step("前置：读取第 44 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/i18n/brand-i18n");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/i18n/brand-i18n");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/i18n/brand-i18n", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/i18n/brand-i18n 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/i18n/brand-i18n 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/i18n/brand-i18n 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/i18n/brand-i18n 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 44,
          stepTitle: "第 44 步：GET /ops-brand/i18n/brand-i18n 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/i18n/brand-i18n 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/i18n/brand-i18n 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 045 条品牌接口测试：PUT /ops-brand/i18n/brand-i18n",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[44];
      await test.step("前置：读取第 45 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/i18n/brand-i18n");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/i18n/brand-i18n");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/i18n/brand-i18n", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/i18n/brand-i18n 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/i18n/brand-i18n 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/i18n/brand-i18n 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/i18n/brand-i18n 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 45,
          stepTitle: "第 45 步：PUT /ops-brand/i18n/brand-i18n 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/i18n/brand-i18n 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/i18n/brand-i18n 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 046 条品牌接口测试：GET /pub/i18n/brand-i18n",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[45];
      await test.step("前置：读取第 46 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /pub/i18n/brand-i18n");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/pub/i18n/brand-i18n");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /pub/i18n/brand-i18n", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /pub/i18n/brand-i18n 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /pub/i18n/brand-i18n 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /pub/i18n/brand-i18n 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /pub/i18n/brand-i18n 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 46,
          stepTitle: "第 46 步：GET /pub/i18n/brand-i18n 接口测试",
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
        expect(result.outcome, "brand-menu:GET /pub/i18n/brand-i18n 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /pub/i18n/brand-i18n 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 047 条品牌接口测试：PUT /pub/i18n/brand-i18n",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[46];
      await test.step("前置：读取第 47 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /pub/i18n/brand-i18n");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/pub/i18n/brand-i18n");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /pub/i18n/brand-i18n", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /pub/i18n/brand-i18n 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /pub/i18n/brand-i18n 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /pub/i18n/brand-i18n 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /pub/i18n/brand-i18n 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 47,
          stepTitle: "第 47 步：PUT /pub/i18n/brand-i18n 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /pub/i18n/brand-i18n 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /pub/i18n/brand-i18n 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 048 条品牌接口测试：GET /ops-brand/i18n-field-config/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[47];
      await test.step("前置：读取第 48 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/i18n-field-config/{id}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/i18n-field-config/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/i18n-field-config/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/i18n-field-config/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/i18n-field-config/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/i18n-field-config/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/i18n-field-config/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 48,
          stepTitle: "第 48 步：GET /ops-brand/i18n-field-config/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/i18n-field-config/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/i18n-field-config/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 049 条品牌接口测试：PUT /ops-brand/i18n-field-config/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[48];
      await test.step("前置：读取第 49 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/i18n-field-config/{id}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/i18n-field-config/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/i18n-field-config/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/i18n-field-config/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/i18n-field-config/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/i18n-field-config/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/i18n-field-config/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 49,
          stepTitle: "第 49 步：PUT /ops-brand/i18n-field-config/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/i18n-field-config/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/i18n-field-config/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 050 条品牌接口测试：DELETE /ops-brand/i18n-field-config/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[49];
      await test.step("前置：读取第 50 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-brand/i18n-field-config/{id}");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-brand/i18n-field-config/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-brand/i18n-field-config/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-brand/i18n-field-config/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-brand/i18n-field-config/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-brand/i18n-field-config/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-brand/i18n-field-config/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 50,
          stepTitle: "第 50 步：DELETE /ops-brand/i18n-field-config/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:DELETE /ops-brand/i18n-field-config/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-brand/i18n-field-config/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 063 条品牌接口测试：PUT /ops-brand/entity-i18n/batch-save",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[62];
      await test.step("前置：读取第 63 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/entity-i18n/batch-save");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/entity-i18n/batch-save");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/entity-i18n/batch-save", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/entity-i18n/batch-save 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/entity-i18n/batch-save 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/entity-i18n/batch-save 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/entity-i18n/batch-save 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 63,
          stepTitle: "第 63 步：PUT /ops-brand/entity-i18n/batch-save 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/entity-i18n/batch-save 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/entity-i18n/batch-save 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 199 条品牌接口测试：POST /ops-poi/poi-i18n/push",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[198];
      await test.step("前置：读取第 199 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-poi/poi-i18n/push");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-poi/poi-i18n/push");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-poi/poi-i18n/push", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-poi/poi-i18n/push 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-poi/poi-i18n/push 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-poi/poi-i18n/push 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-poi/poi-i18n/push 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 199,
          stepTitle: "第 199 步：POST /ops-poi/poi-i18n/push 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-poi/poi-i18n/push 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-poi/poi-i18n/push 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 279 条品牌接口测试：POST /ops-brand/item-i18n/translate-sync",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[278];
      await test.step("前置：读取第 279 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/item-i18n/translate-sync");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/item-i18n/translate-sync");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/item-i18n/translate-sync", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/item-i18n/translate-sync 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/item-i18n/translate-sync 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/item-i18n/translate-sync 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/item-i18n/translate-sync 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 279,
          stepTitle: "第 279 步：POST /ops-brand/item-i18n/translate-sync 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/item-i18n/translate-sync 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/item-i18n/translate-sync 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 280 条品牌接口测试：POST /ops-brand/item-i18n/translate-batch",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[279];
      await test.step("前置：读取第 280 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/item-i18n/translate-batch");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/item-i18n/translate-batch");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/item-i18n/translate-batch", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/item-i18n/translate-batch 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/item-i18n/translate-batch 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/item-i18n/translate-batch 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/item-i18n/translate-batch 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 280,
          stepTitle: "第 280 步：POST /ops-brand/item-i18n/translate-batch 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/item-i18n/translate-batch 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/item-i18n/translate-batch 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 281 条品牌接口测试：POST /ops-brand/item-i18n/batch-query",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[280];
      await test.step("前置：读取第 281 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/item-i18n/batch-query");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/item-i18n/batch-query");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/item-i18n/batch-query", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/item-i18n/batch-query 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/item-i18n/batch-query 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/item-i18n/batch-query 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/item-i18n/batch-query 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 281,
          stepTitle: "第 281 步：POST /ops-brand/item-i18n/batch-query 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/item-i18n/batch-query 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/item-i18n/batch-query 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 283 条品牌接口测试：POST /ops-brand/i18n/trigger",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[282];
      await test.step("前置：读取第 283 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/i18n/trigger");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/i18n/trigger");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/i18n/trigger", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/i18n/trigger 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/i18n/trigger 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/i18n/trigger 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/i18n/trigger 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 283,
          stepTitle: "第 283 步：POST /ops-brand/i18n/trigger 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/i18n/trigger 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/i18n/trigger 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 284 条品牌接口测试：POST /pub/i18n/trigger",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[283];
      await test.step("前置：读取第 284 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /pub/i18n/trigger");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/pub/i18n/trigger");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /pub/i18n/trigger", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /pub/i18n/trigger 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /pub/i18n/trigger 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /pub/i18n/trigger 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /pub/i18n/trigger 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 284,
          stepTitle: "第 284 步：POST /pub/i18n/trigger 接口测试",
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
        expect(result.outcome, "brand-menu:POST /pub/i18n/trigger 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /pub/i18n/trigger 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 285 条品牌接口测试：POST /ops-brand/i18n/tasks/cleanup-soft-deleted",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[284];
      await test.step("前置：读取第 285 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/i18n/tasks/cleanup-soft-deleted");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/i18n/tasks/cleanup-soft-deleted");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/i18n/tasks/cleanup-soft-deleted", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/i18n/tasks/cleanup-soft-deleted 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/i18n/tasks/cleanup-soft-deleted 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/i18n/tasks/cleanup-soft-deleted 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/i18n/tasks/cleanup-soft-deleted 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 285,
          stepTitle: "第 285 步：POST /ops-brand/i18n/tasks/cleanup-soft-deleted 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/i18n/tasks/cleanup-soft-deleted 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/i18n/tasks/cleanup-soft-deleted 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 286 条品牌接口测试：POST /pub/i18n/tasks/cleanup-soft-deleted",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[285];
      await test.step("前置：读取第 286 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /pub/i18n/tasks/cleanup-soft-deleted");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/pub/i18n/tasks/cleanup-soft-deleted");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /pub/i18n/tasks/cleanup-soft-deleted", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /pub/i18n/tasks/cleanup-soft-deleted 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /pub/i18n/tasks/cleanup-soft-deleted 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /pub/i18n/tasks/cleanup-soft-deleted 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /pub/i18n/tasks/cleanup-soft-deleted 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 286,
          stepTitle: "第 286 步：POST /pub/i18n/tasks/cleanup-soft-deleted 接口测试",
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
        expect(result.outcome, "brand-menu:POST /pub/i18n/tasks/cleanup-soft-deleted 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /pub/i18n/tasks/cleanup-soft-deleted 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 287 条品牌接口测试：POST /ops-brand/i18n-field-config",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[286];
      await test.step("前置：读取第 287 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/i18n-field-config");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/i18n-field-config");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/i18n-field-config", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/i18n-field-config 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/i18n-field-config 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/i18n-field-config 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/i18n-field-config 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 287,
          stepTitle: "第 287 步：POST /ops-brand/i18n-field-config 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/i18n-field-config 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/i18n-field-config 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 288 条品牌接口测试：POST /ops-brand/i18n-field-config/{id}/trigger-backfill",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[287];
      await test.step("前置：读取第 288 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/i18n-field-config/{id}/trigger-backfill");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/i18n-field-config/{id}/trigger-backfill");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/i18n-field-config/{id}/trigger-backfill", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/i18n-field-config/{id}/trigger-backfill 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/i18n-field-config/{id}/trigger-backfill 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/i18n-field-config/{id}/trigger-backfill 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/i18n-field-config/{id}/trigger-backfill 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 288,
          stepTitle: "第 288 步：POST /ops-brand/i18n-field-config/{id}/trigger-backfill 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/i18n-field-config/{id}/trigger-backfill 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/i18n-field-config/{id}/trigger-backfill 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 289 条品牌接口测试：POST /ops-brand/i18n-field-config/trigger-backfill",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[288];
      await test.step("前置：读取第 289 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/i18n-field-config/trigger-backfill");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/i18n-field-config/trigger-backfill");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/i18n-field-config/trigger-backfill", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/i18n-field-config/trigger-backfill 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/i18n-field-config/trigger-backfill 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/i18n-field-config/trigger-backfill 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/i18n-field-config/trigger-backfill 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 289,
          stepTitle: "第 289 步：POST /ops-brand/i18n-field-config/trigger-backfill 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/i18n-field-config/trigger-backfill 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/i18n-field-config/trigger-backfill 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 297 条品牌接口测试：POST /ops-brand/entity-i18n/translate-sync",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[296];
      await test.step("前置：读取第 297 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/entity-i18n/translate-sync");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/entity-i18n/translate-sync");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/entity-i18n/translate-sync", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/entity-i18n/translate-sync 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/entity-i18n/translate-sync 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/entity-i18n/translate-sync 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/entity-i18n/translate-sync 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 297,
          stepTitle: "第 297 步：POST /ops-brand/entity-i18n/translate-sync 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/entity-i18n/translate-sync 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/entity-i18n/translate-sync 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 298 条品牌接口测试：POST /ops-brand/entity-i18n/translate-batch",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[297];
      await test.step("前置：读取第 298 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/entity-i18n/translate-batch");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/entity-i18n/translate-batch");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/entity-i18n/translate-batch", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/entity-i18n/translate-batch 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/entity-i18n/translate-batch 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/entity-i18n/translate-batch 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/entity-i18n/translate-batch 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 298,
          stepTitle: "第 298 步：POST /ops-brand/entity-i18n/translate-batch 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/entity-i18n/translate-batch 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/entity-i18n/translate-batch 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 299 条品牌接口测试：POST /ops-brand/entity-i18n/batch-query",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[298];
      await test.step("前置：读取第 299 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/entity-i18n/batch-query");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/entity-i18n/batch-query");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/entity-i18n/batch-query", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/entity-i18n/batch-query 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/entity-i18n/batch-query 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/entity-i18n/batch-query 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/entity-i18n/batch-query 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 299,
          stepTitle: "第 299 步：POST /ops-brand/entity-i18n/batch-query 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/entity-i18n/batch-query 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/entity-i18n/batch-query 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 464 条品牌接口测试：GET /ops-brand/item-i18n/{itemId}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[463];
      await test.step("前置：读取第 464 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/item-i18n/{itemId}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/item-i18n/{itemId}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/item-i18n/{itemId}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/item-i18n/{itemId} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/item-i18n/{itemId} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/item-i18n/{itemId} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/item-i18n/{itemId} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 464,
          stepTitle: "第 464 步：GET /ops-brand/item-i18n/{itemId} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/item-i18n/{itemId} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/item-i18n/{itemId} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 465 条品牌接口测试：GET /ops-brand/item-i18n/supported-locales",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[464];
      await test.step("前置：读取第 465 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/item-i18n/supported-locales");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/item-i18n/supported-locales");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/item-i18n/supported-locales", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/item-i18n/supported-locales 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/item-i18n/supported-locales 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/item-i18n/supported-locales 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/item-i18n/supported-locales 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 465,
          stepTitle: "第 465 步：GET /ops-brand/item-i18n/supported-locales 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/item-i18n/supported-locales 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/item-i18n/supported-locales 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 466 条品牌接口测试：GET /pub/i18n/tasks",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[465];
      await test.step("前置：读取第 466 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /pub/i18n/tasks");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/pub/i18n/tasks");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /pub/i18n/tasks", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /pub/i18n/tasks 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /pub/i18n/tasks 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /pub/i18n/tasks 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /pub/i18n/tasks 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 466,
          stepTitle: "第 466 步：GET /pub/i18n/tasks 接口测试",
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
        expect(result.outcome, "brand-menu:GET /pub/i18n/tasks 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /pub/i18n/tasks 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 467 条品牌接口测试：GET /ops-brand/i18n/tasks",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[466];
      await test.step("前置：读取第 467 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/i18n/tasks");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/i18n/tasks");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/i18n/tasks", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/i18n/tasks 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/i18n/tasks 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/i18n/tasks 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/i18n/tasks 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 467,
          stepTitle: "第 467 步：GET /ops-brand/i18n/tasks 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/i18n/tasks 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/i18n/tasks 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 468 条品牌接口测试：GET /ops-brand/i18n-field-config/page",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[467];
      await test.step("前置：读取第 468 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/i18n-field-config/page");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/i18n-field-config/page");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/i18n-field-config/page", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/i18n-field-config/page 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/i18n-field-config/page 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/i18n-field-config/page 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/i18n-field-config/page 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 468,
          stepTitle: "第 468 步：GET /ops-brand/i18n-field-config/page 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/i18n-field-config/page 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/i18n-field-config/page 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 474 条品牌接口测试：GET /ops-brand/entity-i18n/{entityType}/{entityId}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[473];
      await test.step("前置：读取第 474 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/entity-i18n/{entityType}/{entityId}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/entity-i18n/{entityType}/{entityId}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/entity-i18n/{entityType}/{entityId}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/entity-i18n/{entityType}/{entityId} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/entity-i18n/{entityType}/{entityId} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/entity-i18n/{entityType}/{entityId} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/entity-i18n/{entityType}/{entityId} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 474,
          stepTitle: "第 474 步：GET /ops-brand/entity-i18n/{entityType}/{entityId} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/entity-i18n/{entityType}/{entityId} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/entity-i18n/{entityType}/{entityId} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 475 条品牌接口测试：GET /ops-brand/entity-i18n/supported-locales",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[474];
      await test.step("前置：读取第 475 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/entity-i18n/supported-locales");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/entity-i18n/supported-locales");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/entity-i18n/supported-locales", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/entity-i18n/supported-locales 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/entity-i18n/supported-locales 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/entity-i18n/supported-locales 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/entity-i18n/supported-locales 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 475,
          stepTitle: "第 475 步：GET /ops-brand/entity-i18n/supported-locales 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/entity-i18n/supported-locales 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/entity-i18n/supported-locales 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 476 条品牌接口测试：GET /ops-brand/entity-i18n/list",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[475];
      await test.step("前置：读取第 476 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/entity-i18n/list");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/entity-i18n/list");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/entity-i18n/list", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/entity-i18n/list 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/entity-i18n/list 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/entity-i18n/list 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/entity-i18n/list 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 476,
          stepTitle: "第 476 步：GET /ops-brand/entity-i18n/list 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/entity-i18n/list 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/entity-i18n/list 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 477 条品牌接口测试：GET /ops-brand/entity-i18n/field-metas/{entityType}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[476];
      await test.step("前置：读取第 477 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/entity-i18n/field-metas/{entityType}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/entity-i18n/field-metas/{entityType}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/entity-i18n/field-metas/{entityType}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/entity-i18n/field-metas/{entityType} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/entity-i18n/field-metas/{entityType} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/entity-i18n/field-metas/{entityType} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/entity-i18n/field-metas/{entityType} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 477,
          stepTitle: "第 477 步：GET /ops-brand/entity-i18n/field-metas/{entityType} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/entity-i18n/field-metas/{entityType} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/entity-i18n/field-metas/{entityType} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 567 条品牌接口测试：GET /internal/pos/pull/i18n",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[566];
      await test.step("前置：读取第 567 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /internal/pos/pull/i18n");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/internal/pos/pull/i18n");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /internal/pos/pull/i18n", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /internal/pos/pull/i18n 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /internal/pos/pull/i18n 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /internal/pos/pull/i18n 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /internal/pos/pull/i18n 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 567,
          stepTitle: "第 567 步：GET /internal/pos/pull/i18n 接口测试",
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
        expect(result.outcome, "brand-menu:GET /internal/pos/pull/i18n 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /internal/pos/pull/i18n 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );
  test.afterAll(async () => {
    const reportPath = path.resolve(process.cwd(), 'output/brand-menu-api-shards/group-03.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({
      generatedAt: new Date().toISOString(), scope: 'brand-menu', shardId: "group-03", shardName: "多语言",
      industryExcluded: true, authentication: authEvidence, total: 35, executed: results.length, results,
    }, null, 2), 'utf8');
  });
});
