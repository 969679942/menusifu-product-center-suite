import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const systemRoot = path.resolve(__dirname, '../../systems/merchant-center-product-center-seasoning');
const buildPath = path.join(systemRoot, 'build.ts');

test.describe('调味管理执行选择合同', () => {
  test('执行选择必须由绑定注册表和实现 builder 交集产生，禁止固定首批白名单', () => {
    const source = fs.readFileSync(buildPath, 'utf8');
    expect(source).not.toContain('const initialCaseIds');
    expect(source).not.toContain('initialExecutionCaseIds');
    expect(source).not.toContain("readRecipeIndex(recipeCollectionPath)");
    expect(source).toContain('buildExecutionRegistry');
    expect(source).toContain('generationAllowed');
    expect(source).toContain('new-or-changed-executable-bindings');
    expect(source).toContain('BINDING_REGISTRY_IMPLEMENTATION_BUILDER_NOT_FOUND');
    expect(source).toContain("'ASSERTION_ADAPTER'");
    expect(source).toContain('BINDING_REGISTRY_${surface}_MISMATCH');
  });

  test('正式计划、执行选择和绑定注册表必须保持总数守恒', () => {
    const plan = JSON.parse(fs.readFileSync(path.join(systemRoot, 'test-plan.json'), 'utf8')) as {
      cases: Array<{ caseId: string }>;
      classifiedExclusions: Array<{ caseId: string }>;
      executionSelection: { strategy: string };
    };
    const selection = JSON.parse(fs.readFileSync(path.join(systemRoot, 'execution-selection.json'), 'utf8')) as {
      reason: string;
      strategy: string;
      selectedCaseIds: string[];
    };
    const registry = JSON.parse(fs.readFileSync(path.join(systemRoot, 'binding-registry.json'), 'utf8')) as {
      bindings: Array<{ caseId: string; generationAllowed: boolean; executionAllowed?: boolean }>;
    };
    expect(plan.cases.length + plan.classifiedExclusions.length).toBe(102);
    expect(plan.executionSelection.strategy).toBe('new-or-changed-executable-bindings');
    expect(selection.strategy).toBe('new-or-changed-executable-bindings');
    expect([
      'no-new-or-changed-executable-bindings',
      'evidence-driven-new-or-changed-bindings',
      'runtime-audit-semantic-change',
      'evidence-driven-binding-change-and-runtime-audit-change',
    ]).toContain(selection.reason);
    expect(new Set(selection.selectedCaseIds).size).toBe(selection.selectedCaseIds.length);
    for (const caseId of selection.selectedCaseIds) {
      expect(registry.bindings.find((binding) => (
        binding.caseId === caseId
        && binding.generationAllowed === true
        && binding.executionAllowed !== false
      ))).toBeTruthy();
    }
    expect(registry.bindings.find((binding) => binding.caseId === 'TC-FLV-SEA-001')).toMatchObject({
      generationAllowed: true,
      executionAllowed: false,
    });
    expect(selection.selectedCaseIds).not.toContain('TC-FLV-SEA-001');
    expect(plan.classifiedExclusions).toContainEqual(expect.objectContaining({
      caseId: 'TC-FLV-SEA-001',
      disposition: 'deferred',
    }));
  });

  test('来源阻断必须进入自动审计队列，不得要求人工提供页面能力', () => {
    const queue = JSON.parse(fs.readFileSync(path.join(systemRoot, 'blocked-source-audit-queue.json'), 'utf8')) as {
      policy: { queueStatus: string; humanActionRequired: boolean };
      summary: { total: number };
      cases: Array<{ caseId: string; queueStatus: string; owner: string; humanActionRequired: boolean }>;
    };
    expect(queue.policy).toMatchObject({
      queueStatus: 'pending-auto-audit',
      humanActionRequired: false,
    });
    expect(queue.summary.total).toBe(0);
    expect(queue.cases).toHaveLength(0);
  });
});
