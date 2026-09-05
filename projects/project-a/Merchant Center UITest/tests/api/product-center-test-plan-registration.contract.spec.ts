import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildTestPlanAssetStatus, type AutomationDisposition } from '../../scripts/build-test-plan-asset-index';
import type { ProductCenterTestPlanRegistry } from '../../utils/product-center-test-plan-registry';

const projectRoot = path.resolve(__dirname, '../..');

test.describe('商品中心新增测试方案注册门禁', () => {
  test('新增方案无需修改索引代码即可进入统一资产流程', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-plan-registry-'));
    try {
      const projectRoot = path.join(workspaceRoot, 'Merchant Center UITest');
      const infoRoot = path.join(workspaceRoot, 'Merchant Center Info');
      const directory = '商品中心-商品管理-第六方案';
      const formalFileName = '6.商品中心-商品管理-第六方案-正式测试用例.md';
      const sourceMaterialFileName = '6.商品中心-商品管理-第六方案.xmind';
      const scriptPath = 'tests/generated/product-center-sixth-plan.generated.spec.ts';
      writeText(path.join(infoRoot, '00-待转换测试方案', '用例库', directory, formalFileName), [
        '### 用例编号：TC-PC-SIXTH-001',
        '用例标题：新增方案进入统一流程',
      ].join('\n'));
      writeText(path.join(infoRoot, '00-待转换测试方案', '来源资料', directory, sourceMaterialFileName), 'fixture');
      writeText(path.join(projectRoot, scriptPath), 'export {};\n');
      const registry: ProductCenterTestPlanRegistry = {
        schemaVersion: '1.0.0',
        applicationId: 'merchant-center-product-center',
        plans: [{
          planId: 'product-center-sixth',
          module: 'sixth',
          directory,
          formalFileName,
          sourceMaterialFileName,
          bindingProvider: 'additional-bindings',
          runnerId: 'remaining',
        }],
      };
      const dispositions = new Map<string, AutomationDisposition>([[
        'TC-PC-SIXTH-001',
        {
          status: 'landed',
          scriptPath: `Merchant Center UITest/${scriptPath}`,
          runnerId: 'remaining',
        },
      ]]);
      const result = buildTestPlanAssetStatus({
        projectRoot,
        infoRoot,
        registry,
        automationDispositions: dispositions,
        generatedAt: '2026-08-22T00:00:00.000Z',
        write: false,
      });
      expect(result.index.cases).toEqual([expect.objectContaining({
        caseId: 'TC-PC-SIXTH-001',
        module: 'sixth',
        status: 'landed',
        scriptPath: `Merchant Center UITest/${scriptPath}`,
      })]);
      expect(result.completedCases).toHaveLength(1);
      expect(result.unlandedCases).toHaveLength(0);
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('缺少来源资料或脚本时必须阻断新增方案落地', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-plan-invalid-'));
    try {
      const projectRoot = path.join(workspaceRoot, 'Merchant Center UITest');
      const infoRoot = path.join(workspaceRoot, 'Merchant Center Info');
      const registry: ProductCenterTestPlanRegistry = {
        schemaVersion: '1.0.0',
        applicationId: 'merchant-center-product-center',
        plans: [{
          planId: 'product-center-invalid',
          module: 'invalid',
          directory: '商品中心-无来源方案',
          formalFileName: '无来源方案-正式测试用例.md',
          sourceMaterialFileName: '无来源方案.xmind',
          bindingProvider: 'additional-bindings',
          runnerId: 'remaining',
        }],
      };
      writeText(
        path.join(infoRoot, '00-待转换测试方案', '用例库', '商品中心-无来源方案', '无来源方案-正式测试用例.md'),
        '### 用例编号：TC-PC-INVALID-001\n用例标题：缺少来源应阻断',
      );
      expect(() => buildTestPlanAssetStatus({
        projectRoot,
        infoRoot,
        registry,
        automationDispositions: new Map(),
        write: false,
      })).toThrow('测试方案来源资料不存在');
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('新增方案附加绑定必须进入来源治理执行计划', async () => {
    const source = fs.readFileSync(
      path.join(projectRoot, 'scripts/build-product-center-source-governed-execution-plan.ts'),
      'utf8',
    );
    expect(source).toContain('test-plan-additional-automation-bindings.json');
    expect(source).toContain("blockCode: 'ADDITIONAL_PLAN_BINDING_NOT_READY'");
    expect(source).toContain('runnerId: additionalBinding.runnerId');
  });
});

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}
