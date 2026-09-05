import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildRecipeFeedback,
  buildRecipeFeedbackCollections,
  classifyRecipeFailure,
  redactRecipeDiagnostic,
} from '../../automation/recipe/recipe-feedback';

test.describe('商品中心 Recipe 反馈闭环合同', () => {
  test('反馈应汇总状态和耗时', async () => {
    const feedback = buildRecipeFeedback('fingerprint-1', [
      { recipeId: 'recipe-1', caseId: 'edit:category', title: '商品分类编辑', status: 'passed', durationMs: 1200 },
      { recipeId: 'recipe-2', caseId: 'delete:method', title: '做法组删除', status: 'failed', durationMs: 800, error: 'API 断言失败' },
    ]);

    expect(feedback.summary).toEqual({ total: 2, passed: 1, failed: 1, skipped: 0, durationMs: 2000 });
    expect(feedback.entries[1]).toMatchObject({ classification: 'assertion', diagnostic: 'API 断言失败' });
  });

  test('同一 Recipe 重试后只应保留最终一次结果', async () => {
    const feedback = buildRecipeFeedback('fingerprint-1', [
      { recipeId: 'recipe-1', caseId: 'edit:category', title: '商品分类编辑', status: 'failed', durationMs: 1200, retry: 0, error: '超时' },
      { recipeId: 'recipe-1', caseId: 'edit:category', title: '商品分类编辑', status: 'passed', durationMs: 800, retry: 1 },
    ]);

    expect(feedback.summary).toEqual({ total: 1, passed: 1, failed: 0, skipped: 0, durationMs: 800 });
    expect(feedback.entries[0]).toMatchObject({ status: 'passed', retry: 1 });
  });

  test('反馈诊断必须脱敏', async () => {
    const fixtureSecrets = {
      bearer: ['fixture', 'bearer'].join('-'),
      password: ['fixture', 'password'].join('-'),
      session: ['fixture', 'session'].join('-'),
      token: ['fixture', 'token'].join('-'),
    };
    const diagnostic = redactRecipeDiagnostic(
      [
        'Authorization:',
        'Bearer',
        fixtureSecrets.bearer,
        ['pass', 'word'].join('') + '=' + fixtureSecrets.password,
        ['coo', 'kie'].join('') + '=' + fixtureSecrets.session,
        'token=' + fixtureSecrets.token,
      ].join(' '),
    );

    expect(diagnostic).not.toContain(fixtureSecrets.bearer);
    expect(diagnostic).not.toContain(fixtureSecrets.password);
    expect(diagnostic).not.toContain(fixtureSecrets.session);
    expect(diagnostic).not.toContain(fixtureSecrets.token);
  });

  test('失败应按能力断言清理超时和未知分类', async () => {
    expect(classifyRecipeFailure('能力执行失败')).toBe('capability');
    expect(classifyRecipeFailure('服务端终态断言失败')).toBe('assertion');
    expect(classifyRecipeFailure('清理失败：残留')).toBe('cleanup');
    expect(classifyRecipeFailure('Timeout 30000ms exceeded')).toBe('timeout');
    expect(classifyRecipeFailure('unexpected')).toBe('unknown');
  });

  test('反馈 Reporter 不得修改 Recipe 合同', async () => {
    const source = await readFile(path.resolve('reporters/product-center-recipe.reporter.ts'), 'utf8');
    const packageDocument = JSON.parse(await readFile(path.resolve('package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(source).toContain("output/recipes/product-center-pilot-feedback.json");
    expect(source).toContain("output/recipes/product-center-item-intake-pilot-feedback.json");
    expect(source).toContain("output/recipes/product-center-test-plan-gold-set-feedback.json");
    expect(source).toContain("output/recipes/product-center-test-plan-gold-set-evidence.json");
    expect(source).not.toMatch(/writeFile[^\n]+contracts|rename[^\n]+contracts|product-center-pilot-recipes\.json[^\n]+write/i);
    expect(packageDocument.scripts['test:product-center:test-plan-gold-set']).not.toContain('--reporter=');
  });

  test('不同 Recipe 集合的运行反馈必须按 recipe-id 隔离', async () => {
    const collections = buildRecipeFeedbackCollections([
      { id: 'core', fingerprint: 'core-fingerprint', recipeIds: ['core:edit'] },
      { id: 'item-intake', fingerprint: 'item-fingerprint', recipeIds: ['item:negative'] },
    ], [
      { recipeId: 'core:edit', caseId: 'edit:category', title: '分类编辑', status: 'passed', durationMs: 10 },
      { recipeId: 'item:negative', caseId: 'TC-ITEM-STD-005', title: '商品名称必填', status: 'passed', durationMs: 20 },
    ]);

    expect(collections.get('core')?.entries.map((entry) => entry.recipeId)).toEqual(['core:edit']);
    expect(collections.get('item-intake')?.entries.map((entry) => entry.recipeId)).toEqual(['item:negative']);
    expect(() => buildRecipeFeedbackCollections([
      { id: 'core', fingerprint: 'a', recipeIds: ['duplicate'] },
      { id: 'item', fingerprint: 'b', recipeIds: ['duplicate'] },
    ], [])).toThrow('重复');
    expect(() => buildRecipeFeedbackCollections(collectionsForUnknown(), [
      { recipeId: 'unknown', caseId: 'unknown', title: '未知', status: 'passed', durationMs: 1 },
    ])).toThrow('未注册');
  });
});

function collectionsForUnknown() {
  return [{ id: 'core', fingerprint: 'core-fingerprint', recipeIds: ['core:edit'] }];
}
