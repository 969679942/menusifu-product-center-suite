import path from 'node:path';
import {
  loadRecipeCollectionManifest as loadPublicRecipeCollectionManifest,
  type RecipeCollectionManifest,
} from '../../../../Test Automation Platform/src/automation/recipe/recipe-collection-manifest';

export * from '../../../../Test Automation Platform/src/automation/recipe/recipe-collection-manifest';

export function loadRecipeCollectionManifest(rootDir = process.cwd()): RecipeCollectionManifest {
  const manifestPath = path.join(rootDir, 'contracts/product-center/recipes/product-center-recipe-collections.json');
  return loadPublicRecipeCollectionManifest(manifestPath);
}
