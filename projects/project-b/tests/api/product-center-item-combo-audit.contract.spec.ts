import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { AutomationRecipe } from '../../automation/recipe/automation-recipe';
import { buildProductCenterRuntimeEvidenceBundle } from '../../automation/recipe/product-center-runtime-evidence';
import { productCenterRecipeCapabilityContracts } from '../../adapters/product-center/product-center-recipe-capabilities';
import { validateAutomationRecipe } from '../../automation/recipe/recipe-validator';

test.describe('商品中心套餐规则页面审计 Probe 合同', () => {
  const document = readJson<{ recipes: AutomationRecipe[] }>(
    'contracts/product-center/recipes/product-center-item-combo-audit-probe-recipes.json',
  );

  test('两条正式 Recipe 应保持侧边栏入口、规则来源和完整 Claim', async () => {
    expect(document.recipes.map((recipe) => recipe.caseId).sort()).toEqual([
      'TC-ITEM-PKG-046',
      'TC-ITEM-PKG-059',
    ]);
    expect(document.recipes.every((recipe) => recipe.capabilities[0].id === 'navigation.sidebar.open')).toBe(true);
    expect(document.recipes.flatMap((recipe) => (
      validateAutomationRecipe(recipe, productCenterRecipeCapabilityContracts)
    ))).toEqual([]);
    expect(document.recipes.find((recipe) => recipe.caseId === 'TC-ITEM-PKG-046')?.claimIds).toHaveLength(11);
    expect(document.recipes.find((recipe) => recipe.caseId === 'TC-ITEM-PKG-059')?.claimIds).toHaveLength(10);
  });

  test('负向保存 Probe 证据应包含双触发错误码网络请求和零创建', async () => {
    const attempt = (trigger: string) => ({
      trigger,
      route: '/pp/brand/create/combo',
      errorMessageCount: 1,
      errorMessage: 'BITEM-6003: Combo section not found',
      successMessageCount: 0,
      responseMethod: 'POST',
      responsePath: '/ops-brand/brand-items/combo',
      responseStatus: 400,
      responseErrorCode: 'BITEM-6003',
      mutationCount: 1,
    });
    const evidence = buildProductCenterRuntimeEvidenceBundle({
      recipeId: 'product-center:item-combo-audit:TC-ITEM-PKG-046',
      caseId: 'TC-ITEM-PKG-046',
      results: {
        navigation: { mode: 'sidebar', targetPath: '/pp/brand/list', arrivedPath: '/pp/brand/list' },
        itemComboGroupValidation: {
          beforeRecordCount: 0,
          afterRecordCount: 0,
          attempts: [attempt('save'), attempt('save-and-new')],
        },
      },
      environmentId: 'qa',
      brandId: 'redacted',
      screenshotAttachmentName: 'combo-group-required',
      cleanupRequired: true,
    });

    expect(evidence.visibleUi).toMatchObject({ errorCode: 'BITEM-6003', successMessageCount: 0 });
    expect(evidence.locatorUniqueness).toEqual({ saveErrorCount: 1, saveAndNewErrorCount: 1 });
    expect(evidence.network).toMatchObject({ method: 'POST', requestCount: 2 });
    expect(evidence.api).toMatchObject({ beforeEqualsAfter: true, afterRecordCount: 0 });
    expect(evidence.cleanup).toEqual({ required: true, completed: true, residueCount: 0 });
  });

  test('可选搭配边界 Probe 证据应包含弹窗字段组级操作和商品行无操作', async () => {
    const evidence = buildProductCenterRuntimeEvidenceBundle({
      recipeId: 'product-center:item-combo-audit:TC-ITEM-PKG-059',
      caseId: 'TC-ITEM-PKG-059',
      results: {
        navigation: { mode: 'sidebar', targetPath: '/pp/brand/list', arrivedPath: '/pp/brand/list' },
        itemComboOptionalBoundary: {
          customGroupName: 'AUTO_AUDIT_OPTIONAL',
          itemCreateResponsePath: '/ops-brand/brand-items/combo',
          responseMethod: 'POST',
          responsePath: '/ops-brand/brand-sections',
          responseStatus: 200,
          mutationCount: 2,
          itemRecordCount: 1,
          customGroupRecordCount: 1,
          dialog: {
            dialogCount: 1,
            groupNameInputCount: 1,
            altNameInputCount: 1,
            selectionQuantityInputCount: 1,
            mergeSwitchCount: 1,
            repeatSwitchCount: 1,
            itemSearchInputCount: 1,
            categoryFilterCount: 1,
          },
          boundary: {
            route: '/pp/brand/edit/combo',
            cardCount: 1,
            groupEditButtonCount: 1,
            groupDeleteButtonCount: 1,
            repeatRuleCount: 1,
            selectionQuantityRuleCount: 1,
            productRowCount: 1,
            productRowButtonCount: 0,
          },
        },
      },
      environmentId: 'qa',
      brandId: 'redacted',
      screenshotAttachmentName: 'combo-optional-boundary',
      cleanupRequired: true,
    });

    expect(evidence.visibleUi).toMatchObject({
      route: '/pp/brand/edit/combo',
      groupActions: { edit: 1, delete: 1 },
      productRowSingleItemActions: 0,
    });
    expect(evidence.locatorUniqueness).toMatchObject({ dialogCount: 1, cardCount: 1, productRowCount: 1 });
    expect(evidence.network).toMatchObject({ requestCount: 2 });
    expect(evidence.api).toMatchObject({ itemRecordCount: 1, customGroupRecordCount: 1 });
  });

  test('实现不得使用固定等待或绕过唯一定位', async () => {
    const flowSource = fs.readFileSync(path.join(
      process.cwd(),
      'flows/product-center/product-center-item-combo-audit.flow.ts',
    ), 'utf8');
    const locatorSource = fs.readFileSync(path.join(
      process.cwd(),
      'pages/product-management/item/item-create-combo-locators.ts',
    ), 'utf8');
    const pageSource = fs.readFileSync(path.join(
      process.cwd(),
      'pages/product-management/item/item-create-combo.page.ts',
    ), 'utf8');
    expect(`${flowSource}\n${locatorSource}\n${pageSource}`).not.toMatch(/waitForTimeout|xpath/i);
    expect(locatorSource).not.toMatch(/\.last\(|\.nth\(/);
    expect(pageSource).toContain('customComboCreateProductCheckbox(productName)');
    expect(locatorSource).toContain("page.locator('[role=\"dialog\"]:visible')");
  });
});

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')) as T;
}
