import { expect, test } from '../../../../../fixtures/product-center-api.fixture';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildProbeRequest, probeBrandMenuOperation, readBrandMenuOperations, type BrandMenuProbeResult } from '../../../../../utils/brand-menu-live-probe';

const results: BrandMenuProbeResult[] = [];
let authEvidence: Record<string, unknown> | undefined;

test.describe("品牌商品和菜单 API：规格", () => {
  test(
    "第 088 条品牌接口测试：GET /ops-brand/brand-specs/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[87];
      await test.step("前置：读取第 88 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-specs/{id}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-specs/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-specs/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-specs/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-specs/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-specs/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-specs/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 88,
          stepTitle: "第 88 步：GET /ops-brand/brand-specs/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-specs/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-specs/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 089 条品牌接口测试：PUT /ops-brand/brand-specs/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[88];
      await test.step("前置：读取第 89 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/brand-specs/{id}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/brand-specs/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/brand-specs/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/brand-specs/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/brand-specs/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/brand-specs/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-specs/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 89,
          stepTitle: "第 89 步：PUT /ops-brand/brand-specs/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/brand-specs/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-specs/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 090 条品牌接口测试：DELETE /ops-brand/brand-specs/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[89];
      await test.step("前置：读取第 90 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-brand/brand-specs/{id}");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-brand/brand-specs/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-brand/brand-specs/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-brand/brand-specs/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-brand/brand-specs/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-brand/brand-specs/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-specs/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 90,
          stepTitle: "第 90 步：DELETE /ops-brand/brand-specs/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:DELETE /ops-brand/brand-specs/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-specs/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 091 条品牌接口测试：GET /ops-brand/brand-spec-options/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[90];
      await test.step("前置：读取第 91 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-spec-options/{id}");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-spec-options/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-spec-options/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-spec-options/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-spec-options/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-spec-options/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-spec-options/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 91,
          stepTitle: "第 91 步：GET /ops-brand/brand-spec-options/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-spec-options/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-spec-options/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 092 条品牌接口测试：PUT /ops-brand/brand-spec-options/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[91];
      await test.step("前置：读取第 92 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/brand-spec-options/{id}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/brand-spec-options/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/brand-spec-options/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/brand-spec-options/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/brand-spec-options/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/brand-spec-options/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-spec-options/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 92,
          stepTitle: "第 92 步：PUT /ops-brand/brand-spec-options/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/brand-spec-options/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-spec-options/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 093 条品牌接口测试：DELETE /ops-brand/brand-spec-options/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[92];
      await test.step("前置：读取第 93 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-brand/brand-spec-options/{id}");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-brand/brand-spec-options/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-brand/brand-spec-options/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-brand/brand-spec-options/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-brand/brand-spec-options/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-brand/brand-spec-options/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-spec-options/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 93,
          stepTitle: "第 93 步：DELETE /ops-brand/brand-spec-options/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:DELETE /ops-brand/brand-spec-options/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-spec-options/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 140 条品牌接口测试：PUT /ops-brand/brand-item-specs",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[139];
      await test.step("前置：读取第 140 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/brand-item-specs");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/brand-item-specs");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/brand-item-specs", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/brand-item-specs 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/brand-item-specs 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/brand-item-specs 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-item-specs 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 140,
          stepTitle: "第 140 步：PUT /ops-brand/brand-item-specs 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/brand-item-specs 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-item-specs 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 141 条品牌接口测试：POST /ops-brand/brand-item-specs",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[140];
      await test.step("前置：读取第 141 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-item-specs");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-item-specs");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-item-specs", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-item-specs 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-item-specs 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-item-specs 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-item-specs 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 141,
          stepTitle: "第 141 步：POST /ops-brand/brand-item-specs 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-item-specs 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-item-specs 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 142 条品牌接口测试：PUT /ops-brand/brand-item-spec-options/{id}",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[141];
      await test.step("前置：读取第 142 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:PUT /ops-brand/brand-item-spec-options/{id}");
        expect(operation.method).toBe("PUT");
        expect(operation.path).toBe("/ops-brand/brand-item-spec-options/{id}");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 PUT /ops-brand/brand-item-spec-options/{id}", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:PUT /ops-brand/brand-item-spec-options/{id} 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:PUT /ops-brand/brand-item-spec-options/{id} 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 PUT /ops-brand/brand-item-spec-options/{id} 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-item-spec-options/{id} 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 142,
          stepTitle: "第 142 步：PUT /ops-brand/brand-item-spec-options/{id} 接口测试",
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
        expect(result.outcome, "brand-menu:PUT /ops-brand/brand-item-spec-options/{id} 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:PUT /ops-brand/brand-item-spec-options/{id} 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 317 条品牌接口测试：POST /ops-brand/brand-specs",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[316];
      await test.step("前置：读取第 317 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-specs");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-specs");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-specs", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-specs 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-specs 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-specs 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-specs 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 317,
          stepTitle: "第 317 步：POST /ops-brand/brand-specs 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-specs 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-specs 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 318 条品牌接口测试：POST /ops-brand/brand-spec-options",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[317];
      await test.step("前置：读取第 318 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-spec-options");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-spec-options");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-spec-options", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-spec-options 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-spec-options 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-spec-options 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-spec-options 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 318,
          stepTitle: "第 318 步：POST /ops-brand/brand-spec-options 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-spec-options 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-spec-options 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 364 条品牌接口测试：POST /ops-brand/brand-item-spec-options",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[363];
      await test.step("前置：读取第 364 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:POST /ops-brand/brand-item-spec-options");
        expect(operation.method).toBe("POST");
        expect(operation.path).toBe("/ops-brand/brand-item-spec-options");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 POST /ops-brand/brand-item-spec-options", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:POST /ops-brand/brand-item-spec-options 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:POST /ops-brand/brand-item-spec-options 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 POST /ops-brand/brand-item-spec-options 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:POST /ops-brand/brand-item-spec-options 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 364,
          stepTitle: "第 364 步：POST /ops-brand/brand-item-spec-options 接口测试",
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
        expect(result.outcome, "brand-menu:POST /ops-brand/brand-item-spec-options 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:POST /ops-brand/brand-item-spec-options 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 491 条品牌接口测试：GET /ops-brand/brand-specs/page",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[490];
      await test.step("前置：读取第 491 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-specs/page");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-specs/page");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-specs/page", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-specs/page 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-specs/page 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-specs/page 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-specs/page 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 491,
          stepTitle: "第 491 步：GET /ops-brand/brand-specs/page 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-specs/page 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-specs/page 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 492 条品牌接口测试：GET /ops-brand/brand-specs/list",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[491];
      await test.step("前置：读取第 492 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-specs/list");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-specs/list");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-specs/list", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-specs/list 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-specs/list 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-specs/list 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-specs/list 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 492,
          stepTitle: "第 492 步：GET /ops-brand/brand-specs/list 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-specs/list 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-specs/list 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 493 条品牌接口测试：GET /ops-brand/brand-spec-options/list",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[492];
      await test.step("前置：读取第 493 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-spec-options/list");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-spec-options/list");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-spec-options/list", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-spec-options/list 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-spec-options/list 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-spec-options/list 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-spec-options/list 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 493,
          stepTitle: "第 493 步：GET /ops-brand/brand-spec-options/list 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-spec-options/list 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-spec-options/list 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 529 条品牌接口测试：GET /ops-brand/brand-item-specs/list",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[528];
      await test.step("前置：读取第 529 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-item-specs/list");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-item-specs/list");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-item-specs/list", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-item-specs/list 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-item-specs/list 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-item-specs/list 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-item-specs/list 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 529,
          stepTitle: "第 529 步：GET /ops-brand/brand-item-specs/list 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-item-specs/list 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-item-specs/list 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 530 条品牌接口测试：GET /ops-brand/brand-item-spec-options/list",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[529];
      await test.step("前置：读取第 530 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:GET /ops-brand/brand-item-spec-options/list");
        expect(operation.method).toBe("GET");
        expect(operation.path).toBe("/ops-brand/brand-item-spec-options/list");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 GET /ops-brand/brand-item-spec-options/list", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:GET /ops-brand/brand-item-spec-options/list 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:GET /ops-brand/brand-item-spec-options/list 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 GET /ops-brand/brand-item-spec-options/list 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:GET /ops-brand/brand-item-spec-options/list 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 530,
          stepTitle: "第 530 步：GET /ops-brand/brand-item-spec-options/list 接口测试",
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
        expect(result.outcome, "brand-menu:GET /ops-brand/brand-item-spec-options/list 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:GET /ops-brand/brand-item-spec-options/list 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 577 条品牌接口测试：DELETE /ops-brand/brand-item-specs/spec/batchDelete",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[576];
      await test.step("前置：读取第 577 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-brand/brand-item-specs/spec/batchDelete");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-brand/brand-item-specs/spec/batchDelete");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-brand/brand-item-specs/spec/batchDelete", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-brand/brand-item-specs/spec/batchDelete 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-brand/brand-item-specs/spec/batchDelete 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-brand/brand-item-specs/spec/batchDelete 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-item-specs/spec/batchDelete 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 577,
          stepTitle: "第 577 步：DELETE /ops-brand/brand-item-specs/spec/batchDelete 接口测试",
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
        expect(result.outcome, "brand-menu:DELETE /ops-brand/brand-item-specs/spec/batchDelete 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-item-specs/spec/batchDelete 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );

  test(
    "第 578 条品牌接口测试：DELETE /ops-brand/brand-item-spec-options/spec-option/batchDelete",
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[577];
      await test.step("前置：读取第 578 条接口的文档参数和品牌上下文", async () => {
        expect(operation.operationKey).toBe("brand-menu:DELETE /ops-brand/brand-item-spec-options/spec-option/batchDelete");
        expect(operation.method).toBe("DELETE");
        expect(operation.path).toBe("/ops-brand/brand-item-spec-options/spec-option/batchDelete");
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step("请求：真实调用 DELETE /ops-brand/brand-item-spec-options/spec-option/batchDelete", async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], "brand-menu:DELETE /ops-brand/brand-item-spec-options/spec-option/batchDelete 未完成请求或前置门禁").toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, "brand-menu:DELETE /ops-brand/brand-item-spec-options/spec-option/batchDelete 未获得 HTTP 状态").toBeDefined();
        }
        return observed;
      });
      await test.step("断言：记录 DELETE /ops-brand/brand-item-spec-options/spec-option/batchDelete 的响应状态和分类", async () => {
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-item-spec-options/spec-option/batchDelete 响应未分类").toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: 578,
          stepTitle: "第 578 步：DELETE /ops-brand/brand-item-spec-options/spec-option/batchDelete 接口测试",
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
        expect(result.outcome, "brand-menu:DELETE /ops-brand/brand-item-spec-options/spec-option/batchDelete 发生传输错误").not.toBe('transport-error');
        expect(result.classification, "brand-menu:DELETE /ops-brand/brand-item-spec-options/spec-option/batchDelete 返回未归类的服务端错误").not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );
  test.afterAll(async () => {
    const reportPath = path.resolve(process.cwd(), 'output/brand-menu-api-shards/group-10.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({
      generatedAt: new Date().toISOString(), scope: 'brand-menu', shardId: "group-10", shardName: "规格",
      industryExcluded: true, authentication: authEvidence, total: 19, executed: results.length, results,
    }, null, 2), 'utf8');
  });
});
