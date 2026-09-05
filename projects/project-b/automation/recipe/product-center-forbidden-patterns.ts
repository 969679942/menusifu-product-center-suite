import type { AutomationRecipe } from './automation-recipe';

export type ProductCenterForbiddenPatternFinding = {
  code:
    | 'RECIPE_FIRST_CAPABILITY_NOT_SIDEBAR'
    | 'RECIPE_RAW_SELECTOR'
    | 'GENERATED_SPEC_DIRECT_ROUTE'
    | 'GENERATED_SPEC_FIXED_WAIT'
    | 'GENERATED_SPEC_LOW_LEVEL_UI'
    | 'HIDDEN_UI_EVIDENCE'
    | 'EVIDENCE_SEMANTIC_MISMATCH'
    | 'LEGACY_SOURCE_ALIAS';
  recipeId?: string;
  caseId?: string;
  detail: string;
};

type RuntimeEvidenceEntry = {
  recipeId?: string;
  caseId?: string;
  visibleUi?: Record<string, unknown>;
};

export function scanProductCenterForbiddenPatterns(input: {
  recipes: readonly AutomationRecipe[];
  generatedSpecSources: readonly string[];
  runtimeEvidenceEntries: readonly RuntimeEvidenceEntry[];
  legacySourceAliases: readonly string[];
}): ProductCenterForbiddenPatternFinding[] {
  const findings: ProductCenterForbiddenPatternFinding[] = [];

  for (const recipe of input.recipes) {
    if (recipe.capabilities[0]?.id !== 'navigation.sidebar.open') {
      findings.push({
        code: 'RECIPE_FIRST_CAPABILITY_NOT_SIDEBAR',
        recipeId: recipe.id,
        caseId: recipe.caseId,
        detail: '第一项 capability 必须为 navigation.sidebar.open',
      });
    }
    if (containsRecipeRawSelector(recipe)) {
      findings.push({
        code: 'RECIPE_RAW_SELECTOR',
        recipeId: recipe.id,
        caseId: recipe.caseId,
        detail: 'Recipe 含 selector、locator、xpath 或 css 等原始定位信息',
      });
    }
  }

  for (const source of input.generatedSpecSources) {
    if (/page\.goto\(\s*['"]\/[^'"]+['"]\s*\)/.test(source)) {
      findings.push({ code: 'GENERATED_SPEC_DIRECT_ROUTE', detail: 'generated spec 直接访问业务路由' });
    }
    if (/waitForTimeout\s*\(/.test(source)) {
      findings.push({ code: 'GENERATED_SPEC_FIXED_WAIT', detail: 'generated spec 使用 waitForTimeout' });
    }
    if (/(\.locator\s*\(|getByRole\s*\(|\.click\s*\(|\.fill\s*\()/i.test(source)) {
      findings.push({ code: 'GENERATED_SPEC_LOW_LEVEL_UI', detail: 'generated spec 含低层 UI 语句' });
    }
  }

  for (const entry of input.runtimeEvidenceEntries) {
    const visibleUi = record(entry.visibleUi);
    const observableVisibility = stringValue(visibleUi.observableVisibility);
    if (observableVisibility === 'hidden') {
      findings.push({
        code: 'HIDDEN_UI_EVIDENCE',
        recipeId: entry.recipeId,
        caseId: entry.caseId,
        detail: 'visibleUi 使用 hidden DOM 作为可见证据',
      });
    }
    const semanticKey = stringValue(visibleUi.semanticKey);
    const observableSemanticKey = stringValue(visibleUi.observableSemanticKey);
    if (semanticKey && observableSemanticKey && semanticKey !== observableSemanticKey) {
      findings.push({
        code: 'EVIDENCE_SEMANTIC_MISMATCH',
        recipeId: entry.recipeId,
        caseId: entry.caseId,
        detail: 'semanticKey=' + semanticKey + ', observableSemanticKey=' + observableSemanticKey,
      });
    }
  }

  for (const alias of input.legacySourceAliases) {
    if (/^runtime-negative-contract:/i.test(alias)) {
      findings.push({
        code: 'LEGACY_SOURCE_ALIAS',
        detail: 'legacy alias: ' + alias,
      });
    }
  }

  return findings;
}

function containsRecipeRawSelector(recipe: AutomationRecipe): boolean {
  return scanValue(recipe);
}

function scanValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => scanValue(item));
  if (!value || typeof value !== 'object') return typeof value === 'string' && looksLikeSelectorValue(value);

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (/^(selector|locator|xpath|css)$/i.test(key)) return true;
    if (typeof nested === 'string' && looksLikeSelectorValue(nested)) return true;
    if (scanValue(nested)) return true;
  }
  return false;
}

function looksLikeSelectorValue(value: string): boolean {
  return /(^xpath=|^css=|^\/\/|^#[a-z0-9_-]+$|^\.[a-z0-9_-]+$)/i.test(value);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
