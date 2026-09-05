import {
  buildProductCenterRuntimeAcceptanceArtifactForCollection,
  type ProductCenterRuntimeAcceptanceBuildOptions,
} from './build-product-center-runtime-acceptance';

export async function buildProductCenterApprovedTechnicalBindingsRuntimeAcceptanceArtifact(
  rootDir = process.cwd(),
  options: ProductCenterRuntimeAcceptanceBuildOptions = {},
): Promise<string> {
  return buildProductCenterRuntimeAcceptanceArtifactForCollection(rootDir, {
    collectionId: 'product-center-approved-technical-bindings',
    recipesPath: 'contracts/product-center/recipes/product-center-approved-technical-bindings-recipes.json',
    feedbackPath: 'output/recipes/product-center-approved-technical-bindings-feedback.json',
    evidencePath: 'output/recipes/product-center-approved-technical-bindings-evidence.json',
    specPath: 'tests/generated/product-center-approved-technical-bindings.generated.spec.ts',
    outputPath: 'output/recipes/product-center-approved-technical-bindings-acceptance.json',
    stageId: 'approved-technical-bindings-ui',
  }, options);
}

async function main(): Promise<void> {
  const outputPath = await buildProductCenterApprovedTechnicalBindingsRuntimeAcceptanceArtifact();
  process.stdout.write(`商品中心已审批技术绑定运行验收产物已生成：${outputPath}\n`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
