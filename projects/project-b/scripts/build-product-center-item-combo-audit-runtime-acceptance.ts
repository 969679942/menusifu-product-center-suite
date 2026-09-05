import {
  buildProductCenterRuntimeAcceptanceArtifactForCollection,
  type ProductCenterRuntimeAcceptanceBuildOptions,
} from './build-product-center-runtime-acceptance';

export async function buildProductCenterItemComboAuditRuntimeAcceptanceArtifact(
  rootDir = process.cwd(),
  options: ProductCenterRuntimeAcceptanceBuildOptions = {},
): Promise<string> {
  return buildProductCenterRuntimeAcceptanceArtifactForCollection(rootDir, {
    collectionId: 'product-center-item-combo-audit-probe',
    recipesPath: 'contracts/product-center/recipes/product-center-item-combo-audit-probe-recipes.json',
    feedbackPath: 'output/recipes/product-center-item-combo-audit-probe-feedback.json',
    evidencePath: 'output/recipes/product-center-item-combo-audit-probe-evidence.json',
    specPath: 'tests/generated/product-center-item-combo-audit-probe.generated.spec.ts',
    outputPath: 'output/recipes/product-center-item-combo-audit-probe-acceptance.json',
    stageId: 'item-combo-audit-probe',
  }, options);
}

if (require.main === module) {
  void buildProductCenterItemComboAuditRuntimeAcceptanceArtifact().then((outputPath) => {
    process.stdout.write(`套餐规则 Probe runtime acceptance：${outputPath}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
