import fs from 'node:fs';
import path from 'node:path';
import { productCenterRecipeCapabilityContracts } from '../adapters/product-center/product-center-recipe-capabilities';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import { recipeCollectionFingerprint, validateAutomationRecipe } from '../automation/recipe/recipe-validator';
import { sidebarNavigationCapability } from '../automation/recipe/sidebar-navigation-capability';
import { renderProductCenterRecipeSpec } from './generate-product-center-recipe-spec';
import { scanGeneratedArtifacts } from '../utils/product-center-run-safety';

type CanonicalCase = {
  id: string;
  title: string;
  priority: string;
  source: string;
  preconditions: string[];
  actions: string[];
  expectedResults: string[];
};

const collectionId = 'product-center-item-combo-audit-probe';
const recipesRelativePath = 'contracts/product-center/recipes/product-center-item-combo-audit-probe-recipes.json';
const specRelativePath = 'tests/generated/product-center-item-combo-audit-probe.generated.spec.ts';

export function buildProductCenterItemComboAuditProbeArtifacts(
  rootDir = process.cwd(),
): { recipesPath: string; specPath: string; recipes: AutomationRecipe[] } {
  const canonical = readJson<{ cases: CanonicalCase[] }>(path.join(
    rootDir,
    'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json',
  ));
  const groupRequired = requireCanonicalCase(canonical.cases, 'TC-ITEM-PKG-046');
  const optionalBoundary = requireCanonicalCase(canonical.cases, 'TC-ITEM-PKG-059');
  assertCanonicalRule(groupRequired, 'BR-ITEM-COMBO-GROUP-REQUIRED', [4, 4, 3]);
  assertCanonicalRule(optionalBoundary, 'BR-ITEM-COMBO-OPTIONAL-EDIT-BOUNDARY', [3, 3, 4]);

  const recipes = [
    buildGroupRequiredRecipe(groupRequired),
    buildOptionalBoundaryRecipe(optionalBoundary),
  ];
  for (const recipe of recipes) {
    const issues = validateAutomationRecipe(recipe, productCenterRecipeCapabilityContracts);
    if (issues.length > 0) {
      throw new Error(`${recipe.caseId} Recipe 合同失败：${issues.map((item) => item.code).join(',')}`);
    }
  }

  const recipesPath = path.join(rootDir, recipesRelativePath);
  const specPath = path.join(rootDir, specRelativePath);
  writeJson(recipesPath, {
    schemaVersion: '1.0.0',
    collectionId,
    fingerprint: recipeCollectionFingerprint(recipes),
    sourceCanonicalPath: 'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json',
    recipes,
  });
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, renderProductCenterRecipeSpec({
    suiteTitle: '商品中心套餐规则受控页面审计 Probe',
    recipesImportPath: '../../contracts/product-center/recipes/product-center-item-combo-audit-probe-recipes.json',
    stepTitle: '执行套餐规则受控负向与编辑边界探测',
    attachRuntimeEvidence: true,
  }), 'utf8');
  const findings = scanGeneratedArtifacts(path.dirname(recipesPath));
  if (findings.length > 0) throw new Error(`套餐规则 Probe Recipe 敏感扫描失败：${findings.length}`);
  return { recipesPath, specPath, recipes };
}

function buildGroupRequiredRecipe(canonical: CanonicalCase): AutomationRecipe {
  return {
    schemaVersion: '1.0.0',
    id: 'product-center:item-combo-audit:TC-ITEM-PKG-046',
    caseId: canonical.id,
    title: canonical.title,
    tags: ['@recipe', '@generated', '@item', '@combo', '@negative', '@p0'],
    route: '/pp/brand/list',
    action: 'negative',
    traceabilityId: 'trace:sop:TC-ITEM-PKG-046',
    sourceIds: [
      'product-confirmation:BR-ITEM-COMBO-GROUP-REQUIRED',
      'canonical:product-center-item-xmind-rebuild-pilot.json#TC-ITEM-PKG-046',
    ],
    claimIds: claimIds(canonical),
    coverageIds: ['business-rule:BR-ITEM-COMBO-GROUP-REQUIRED'],
    generationAllowed: true,
    seed: { adapterId: 'productCenter.prepareItemComboGroupRequiredProbe' },
    capabilities: [
      sidebarNavigationCapability('/pp/brand/list'),
      {
        id: 'item.combo.probeGroupRequired',
        input: { record: { $ref: '$record' } },
        saveAs: 'itemComboGroupValidation',
      },
    ],
    assertions: [
      {
        adapterId: 'productCenter.verifyItemComboGroupRequiredUi',
        input: { result: { $ref: '$result.itemComboGroupValidation' } },
      },
      {
        adapterId: 'productCenter.verifyItemComboGroupRequiredApi',
        input: { result: { $ref: '$result.itemComboGroupValidation' } },
      },
    ],
    cleanup: { adapterId: 'productCenter.cleanupSeed' },
  };
}

function buildOptionalBoundaryRecipe(canonical: CanonicalCase): AutomationRecipe {
  return {
    schemaVersion: '1.0.0',
    id: 'product-center:item-combo-audit:TC-ITEM-PKG-059',
    caseId: canonical.id,
    title: canonical.title,
    tags: ['@recipe', '@generated', '@item', '@combo', '@create', '@p1'],
    route: '/pp/brand/list',
    action: 'create',
    traceabilityId: 'trace:sop:TC-ITEM-PKG-059',
    sourceIds: [
      'product-confirmation:BR-ITEM-COMBO-OPTIONAL-EDIT-BOUNDARY',
      'canonical:product-center-item-xmind-rebuild-pilot.json#TC-ITEM-PKG-059',
    ],
    claimIds: claimIds(canonical),
    coverageIds: ['business-rule:BR-ITEM-COMBO-OPTIONAL-EDIT-BOUNDARY'],
    generationAllowed: true,
    seed: { adapterId: 'productCenter.prepareItemComboOptionalBoundaryProbe' },
    capabilities: [
      sidebarNavigationCapability('/pp/brand/list'),
      {
        id: 'item.combo.probeOptionalEditBoundary',
        input: { record: { $ref: '$record' } },
        saveAs: 'itemComboOptionalBoundary',
      },
    ],
    mutation: {
      method: 'POST',
      operationKey: 'brand-menu:POST /ops-brand/brand-sections',
    },
    assertions: [
      {
        adapterId: 'productCenter.verifyItemComboOptionalBoundaryUi',
        input: { result: { $ref: '$result.itemComboOptionalBoundary' } },
      },
      {
        adapterId: 'productCenter.verifyItemComboOptionalBoundaryApi',
        input: { result: { $ref: '$result.itemComboOptionalBoundary' } },
      },
    ],
    cleanup: { adapterId: 'productCenter.cleanupSeed' },
  };
}

function claimIds(canonical: CanonicalCase): string[] {
  return [
    ...canonical.preconditions.map((_, index) => `${canonical.id}:precondition-${index + 1}`),
    ...canonical.actions.map((_, index) => `${canonical.id}:action-${index + 1}`),
    ...canonical.expectedResults.map((_, index) => `${canonical.id}:expectation-${index + 1}`),
  ];
}

function requireCanonicalCase(cases: readonly CanonicalCase[], caseId: string): CanonicalCase {
  const canonical = cases.find((item) => item.id === caseId);
  if (!canonical) throw new Error(`缺少 canonical 用例：${caseId}`);
  return canonical;
}

function assertCanonicalRule(
  canonical: CanonicalCase,
  ruleId: string,
  counts: readonly [number, number, number],
): void {
  if (!canonical.source.includes(ruleId)
    || canonical.preconditions.length !== counts[0]
    || canonical.actions.length !== counts[1]
    || canonical.expectedResults.length !== counts[2]) {
    throw new Error(`${canonical.id} canonical 与已确认规则不一致`);
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const result = buildProductCenterItemComboAuditProbeArtifacts();
    process.stdout.write(`套餐规则 Probe Recipe：${result.recipesPath}\n套餐规则 Probe Spec：${result.specPath}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
