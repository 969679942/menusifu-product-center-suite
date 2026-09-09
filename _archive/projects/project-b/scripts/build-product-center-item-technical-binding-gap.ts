import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterItemTechnicalBindingGap,
  renderProductCenterItemTechnicalBindingGapMarkdown,
  type ProductCenterItemTechnicalBindingGapDocument,
} from '../utils/product-center-item-technical-binding-gap';

type SourceFingerprintDocument = { fingerprint?: string };

export function buildProductCenterItemTechnicalBindingGapArtifacts(options: {
  projectRoot?: string;
  generatedAt?: string;
} = {}): {
  document: ProductCenterItemTechnicalBindingGapDocument;
  jsonPath: string;
  markdownPath: string;
} {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const canonicalRoot = path.join(projectRoot, 'contracts/product-center/test-cases/canonical');
  const recipesRoot = path.join(projectRoot, 'contracts/product-center/recipes');
  const outputRoot = path.join(projectRoot, 'contracts/product-center/test-cases/canonical');
  const canonical = readJson<any>(path.join(canonicalRoot, 'product-center-item-xmind-rebuild-pilot.json'));
  const directRecipeFiles = [
    'product-center-item-intake-pilot-recipes.json',
    'product-center-item-category-leaf-probe-recipes.json',
    'product-center-item-combo-audit-probe-recipes.json',
  ];
  const directRecipes = directRecipeFiles.flatMap((file) => readJson<{ recipes?: unknown[] }>(path.join(recipesRoot, file)).recipes ?? []) as any[];
  const intakeReport = readJson<{
    promotionGates?: Array<{ caseId: string; runtimeAccepted: boolean }>;
  }>(path.join(
    projectRoot,
    'output/test-case-audit/product-center/item-intake-pilot-latest.json',
  ));
  const directAcceptances = [
    {
      acceptedCaseIds: (intakeReport.promotionGates ?? [])
        .filter((gate) => gate.runtimeAccepted)
        .map((gate) => gate.caseId),
    },
    'product-center-item-category-leaf-probe-acceptance.json',
    'product-center-item-combo-audit-probe-acceptance.json',
  ].map((value) => typeof value === 'string'
    ? readJson<any>(path.join(projectRoot, 'output/recipes', value))
    : value);
  const approvedBindings = readJson<{ bindings?: unknown[] }>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/generated/product-center-approved-technical-bindings.json',
  )).bindings ?? [];
  const legacyItemBindings = readJson<{ bindings?: unknown[]; fingerprint?: string }>(path.join(
    canonicalRoot,
    'product-center-item-automation-bindings.json',
  ));
  const approvedRecipes = readJson<{ recipes?: unknown[] }>(path.join(
    recipesRoot,
    'product-center-approved-technical-bindings-recipes.json',
  )).recipes ?? [];
  const approvedAcceptance = readJson<any>(path.join(
    projectRoot,
    'output/recipes/product-center-approved-technical-bindings-acceptance.json',
  ));
  const pageGap = readJson<{ capabilities?: unknown[] }>(path.join(
    canonicalRoot,
    'product-center-item-page-gap.json',
  ));
  const document = buildProductCenterItemTechnicalBindingGap({
    canonical,
    recipes: directRecipes,
    directAcceptances,
    approvedBindings: [...approvedBindings, ...(legacyItemBindings.bindings ?? [])] as any,
    approvedRecipes: approvedRecipes as any,
    approvedAcceptance,
    pageCapabilities: pageGap.capabilities as any,
    sourceFingerprints: {
      canonical: canonical.fingerprint,
      approvedBindings: readJson<SourceFingerprintDocument>(path.join(
        projectRoot,
        'contracts/product-center/test-cases/generated/product-center-approved-technical-bindings.json',
      )).fingerprint ?? '',
      legacyItemBindings: legacyItemBindings.fingerprint ?? '',
      pageGap: readJson<SourceFingerprintDocument>(path.join(
        canonicalRoot,
        'product-center-item-page-gap.json',
      )).fingerprint ?? '',
      approvedAcceptance: approvedAcceptance.fingerprint ?? '',
    },
    generatedAt: options.generatedAt,
  });
  const jsonPath = path.join(outputRoot, 'product-center-item-technical-binding-gap.json');
  const markdownPath = path.join(outputRoot, 'product-center-item-technical-binding-gap.md');
  writeJson(jsonPath, document);
  writeText(markdownPath, renderProductCenterItemTechnicalBindingGapMarkdown(document));
  return { document, jsonPath, markdownPath };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const artifacts = buildProductCenterItemTechnicalBindingGapArtifacts();
    process.stdout.write(`商品技术绑定差距矩阵已生成：${artifacts.jsonPath}\n${artifacts.markdownPath}\n`);
    process.stdout.write(`活动=${artifacts.document.summary.activeTotal}；运行通过=${artifacts.document.summary.runtimeAccepted}；首批P0=${artifacts.document.summary.firstP0BatchEligible}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
