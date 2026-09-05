import { expect, test } from '@playwright/test';
import { validateRecipeCollectionManifest } from '../../automation/recipe/recipe-collection-manifest';

test.describe('商品中心 Recipe 集合清单合同', () => {
  test('清单应以路径声明 Recipe 及反馈证据输出', async () => {
    const result = validateRecipeCollectionManifest({
      schemaVersion: '1.0.0',
      collections: [{
        id: 'item-intake',
        recipePath: 'contracts/product-center/recipes/product-center-item-intake-pilot-recipes.json',
        feedbackPath: 'output/recipes/product-center-item-intake-pilot-feedback.json',
        evidencePath: 'output/recipes/product-center-item-intake-pilot-evidence.json',
      }],
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  test('重复集合或越界路径应被拒绝', async () => {
    const collection = {
      id: 'same',
      recipePath: '../recipes.json',
      feedbackPath: 'output/feedback.json',
      evidencePath: 'output/evidence.json',
    };
    const result = validateRecipeCollectionManifest({
      schemaVersion: '1.0.0',
      collections: [collection, collection],
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('重复'),
      expect.stringContaining('相对路径'),
    ]));
  });
});
