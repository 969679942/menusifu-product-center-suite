import {
  buildProductCenterRuntimeAcceptanceArtifactForCollection,
  type ProductCenterRuntimeAcceptanceBuildOptions,
} from './build-product-center-runtime-acceptance';

export async function buildProductCenterItemCategoryLeafRuntimeAcceptanceArtifact(
  rootDir = process.cwd(),
  options: ProductCenterRuntimeAcceptanceBuildOptions = {},
): Promise<string> {
  return buildProductCenterRuntimeAcceptanceArtifactForCollection(rootDir, {
    collectionId: 'product-center-item-category-leaf-probe',
    recipesPath: 'contracts/product-center/recipes/product-center-item-category-leaf-probe-recipes.json',
    feedbackPath: 'output/recipes/product-center-item-category-leaf-probe-feedback.json',
    evidencePath: 'output/recipes/product-center-item-category-leaf-probe-evidence.json',
    specPath: 'tests/generated/product-center-item-category-leaf-probe.generated.spec.ts',
    outputPath: 'output/recipes/product-center-item-category-leaf-probe-acceptance.json',
    stageId: 'item-category-leaf-read-only-probe',
  }, options);
}

if (require.main === module) {
  void buildProductCenterItemCategoryLeafRuntimeAcceptanceArtifact().then((outputPath) => {
    process.stdout.write(`TC-ITEM-STD-007 runtime acceptance：${outputPath}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
