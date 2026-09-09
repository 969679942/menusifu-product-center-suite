import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { CapabilityRegistry } from '../../src/automation/recipe/capability-registry';
import {
  loadRecipeCollectionManifest,
  validateRecipeCollectionManifest,
} from '../../src/automation/recipe/recipe-collection-manifest';
import {
  buildRecipeFeedback,
  buildRecipeFeedbackCollections,
  redactRecipeDiagnostic,
} from '../../src/automation/recipe/recipe-feedback';
import { sidebarNavigationCapability } from '../../src/automation/recipe/sidebar-navigation-capability';

test.describe('公共 Recipe 核心合同', () => {
  test('能力注册表应拒绝重复、非法动作和缺失输入', async () => {
    const registry = new CapabilityRegistry<{ calls: string[] }>();
    registry.register({
      id: 'record.edit', actions: ['edit'], requiredInputs: ['record'],
      execute: async (context) => { context.calls.push('edit'); },
    });
    expect(() => registry.register({
      id: 'record.edit', actions: ['edit'], requiredInputs: [], execute: async () => undefined,
    })).toThrow('能力已注册');
    await expect(registry.execute('record.edit', 'delete', { calls: [] }, { record: {} })).rejects.toThrow('不支持动作');
    await expect(registry.execute('record.edit', 'edit', { calls: [] })).rejects.toThrow('缺少输入');
  });

  test('反馈应保留最终重试、按集合隔离并脱敏', () => {
    const feedback = buildRecipeFeedback('fingerprint', [
      { recipeId: 'edit', caseId: 'CASE-1', title: '编辑', status: 'failed', durationMs: 10, retry: 0, error: 'token=secret timeout' },
      { recipeId: 'edit', caseId: 'CASE-1', title: '编辑', status: 'passed', durationMs: 5, retry: 1 },
    ]);
    expect(feedback.summary).toMatchObject({ total: 1, passed: 1, failed: 0, durationMs: 5 });
    expect(redactRecipeDiagnostic('Authorization: Bearer secret')).not.toContain('secret');
    expect(buildRecipeFeedbackCollections([
      { id: 'collection', fingerprint: 'fingerprint', recipeIds: ['edit'] },
    ], [{ recipeId: 'edit', caseId: 'CASE-1', title: '编辑', status: 'passed', durationMs: 1 }]).has('collection')).toBe(true);
  });

  test('集合清单必须使用唯一 ID 和工作区相对路径', () => {
    const valid = {
      schemaVersion: '1.0.0',
      collections: [{
        id: 'core', recipePath: 'contracts/recipes.json',
        feedbackPath: 'output/feedback.json', evidencePath: 'output/evidence.json',
      }],
    };
    expect(validateRecipeCollectionManifest(valid)).toMatchObject({ valid: true, issues: [] });
    expect(validateRecipeCollectionManifest({
      schemaVersion: '1.0.0', collections: [
        ...valid.collections,
        { ...valid.collections[0], recipePath: '../recipes.json' },
      ],
    })).toMatchObject({ valid: false });

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-manifest-'));
    const manifestPath = path.join(directory, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(valid), 'utf8');
    expect(loadRecipeCollectionManifest(manifestPath).collections[0]?.id).toBe('core');
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('侧栏导航能力只描述公共导航意图', () => {
    expect(sidebarNavigationCapability('/records')).toEqual({
      id: 'navigation.sidebar.open', saveAs: 'navigation', input: { targetPath: '/records' },
    });
  });
});
