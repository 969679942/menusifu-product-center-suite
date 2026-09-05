import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { CapabilityRegistry } from '../../automation/recipe/capability-registry';
import { productCenterRecipeCapabilityContracts } from '../../adapters/product-center/product-center-recipe-capabilities';

test.describe('商品中心 Recipe 能力注册表合同', () => {
  test('注册表应拒绝重复能力 ID', async () => {
    const registry = new CapabilityRegistry<{ calls: string[] }>();
    registry.register({
      id: 'sample.open', actions: ['edit'], requiredInputs: [],
      execute: async (context) => { context.calls.push('open'); },
    });

    expect(() => registry.register({
      id: 'sample.open', actions: ['edit'], requiredInputs: [],
      execute: async () => undefined,
    })).toThrow('能力已注册：sample.open');
  });

  test('执行能力时应校验动作和必填输入', async () => {
    const registry = new CapabilityRegistry<{ calls: string[] }>();
    registry.register({
      id: 'sample.edit', actions: ['edit'], requiredInputs: ['record'],
      execute: async (context) => { context.calls.push('edit'); },
    });

    await expect(registry.execute('sample.edit', 'delete', { calls: [] }, { record: {} })).rejects.toThrow('不支持动作 delete');
    await expect(registry.execute('sample.edit', 'edit', { calls: [] }, {})).rejects.toThrow('缺少输入 record');
  });

  test('商品中心全量 Recipe 应注册九十三个稳定能力', async () => {
    expect(productCenterRecipeCapabilityContracts.map((item) => item.id)).toEqual([
      'navigation.sidebar.open',
      'coreCreate.execute',
      'category.open',
      'category.editIdentity',
      'category.deleteIdentity',
      'method.open',
      'method.editIdentity',
      'method.deleteIdentity',
      'material.open',
      'material.editIdentity',
      'material.deleteIdentity',
      'seasoning.open',
      'seasoning.editIdentity',
      'seasoning.deleteIdentity',
      'bom.open',
      'bom.editIdentity',
      'bom.deleteIdentity',
      'lowDependency.execute',
      'highDependency.execute',
      'negative.execute',
      'category.attemptAddChildBlockedByProduct',
      'methodDetail.enforceNameMaxLength',
      'statisticTag.openCreateDialog',
      'statisticTag.readSecondLanguageBoundary',
      'statisticTag.closeCreateDialog',
      'item.openList',
      'item.validateRequiredName',
      'item.openStandardCreate',
      'item.category.openCascader',
      'item.category.selectParentWithChildren',
      'item.category.selectLeaf',
      'item.createStandard',
      'item.createComboRequiredOnly',
      'item.combo.probeGroupRequired',
      'item.combo.probeOptionalEditBoundary',
      'storeProduct.searchByName',
      'item.list.searchSecondLanguage',
      'item.combo.readOptionalGroupDialog',
      'item.list.probeImagePreview',
      'item.standard.probeMainImageReplacement',
      'item.standard.probeSpecGroupCreateNavigation',
      'item.standard.probeFieldValidation',
      'item.standard.createRoundedPricePair',
      'item.standard.probeMultiSpecWeightDisabled',
      'item.standard.probeDescriptionLengthBoundary',
      'item.standard.probeDetailImageLimit',
      'item.standard.probeReferencedGroupChildControls',
      'item.side.createWithDetailImageLimit',
      'item.standard.mega.editOtherInformation',
      'item.standard.mega.createWithParentCategory',
      'item.standard.mega.createWithLibraryMainImage',
      'item.standard.mega.createWithLocalMainImage',
      'item.standard.mega.createFormattedNames',
      'item.standard.mega.editDescriptionTags',
      'item.standard.mega.editMaterialInformation',
      'item.standard.mega.editCornerMark',
      'item.standard.mega.editStatisticsTags',
      'item.list.mega.probeColumnSelection',
      'item.list.mega.probeLanguageSwitch',
      'item.standard.mega.probeTasteGroupSync',
      'item.standard.mega.probeAdvancedFields',
      'item.list.mega.probePageSizes',
      'item.list.mega.probeDefaultColumns',
      'item.list.mega.probeRestoreColumns',
      'item.list.mega.enableDisabledItem',
      'item.combo.mega.removeAllGroupItems',
      'item.combo.mega.probeDeleteConfirmation',
      'item.combo.mega.createWithoutCategory',
      'item.combo.mega.createWithParentCategory',
      'item.combo.mega.createWithZeroPrice',
      'item.combo.mega.createWithLibraryMainImage',
      'item.combo.mega.readOptionalGroupRules',
      'item.combo.mega.createWithLocalMainImage',
      'item.combo.mega.probeMainImageReplacement',
      'item.combo.mega.probeMnemonicMaximum',
      'item.combo.mega.probeDescriptionMaximum',
      'item.combo.mega.probeDetailImageLimit',
      'item.combo.mega.probeReferencedGroupChildControls',
      'item.combo.mega.readOtherSettings',
      'item.combo.mega.createFormattedName',
      'item.combo.mega.createFormattedNames',
      'item.combo.mega.editDescriptionTags',
      'item.combo.mega.editCornerMark',
      'item.combo.mega.editStatisticsTags',
      'item.combo.mega.editMaterialInformation',
      'item.combo.mega.createWithFixedAndCustomGroups',
      'item.combo.mega.editTasteGroup',
      'item.combo.mega.probeMutualExclusion',
      'item.combo.mega.editMethodGroup',
      'item.combo.mega.editAddonGroup',
      'item.combo.mega.searchByCombinedFilters',
      'item.combo.mega.enableDisabledItem',
      'item.combo.mega.disableEnabledItem',
    ]);
    expect(new Set(productCenterRecipeCapabilityContracts.map((item) => item.id)).size).toBe(93);
  });

  test('套餐商品仅必填创建能力应按固定搭配名称唯一选择并登记完整清理链', async () => {
    const [adapterSource, comboFlowSource, comboPageSource, comboLocatorSource, recipeFlowSource, factorySource] = await Promise.all([
      readFile(path.resolve('adapters/product-center/product-center-recipe-capabilities.ts'), 'utf8'),
      readFile(path.resolve('flows/product-center/product-center-item-combo-create.flow.ts'), 'utf8'),
      readFile(path.resolve('pages/product-management/item/item-create-combo.page.ts'), 'utf8'),
      readFile(path.resolve('pages/product-management/item/item-create-combo-locators.ts'), 'utf8'),
      readFile(path.resolve('flows/product-center/product-center-recipe.flow.ts'), 'utf8'),
      readFile(path.resolve('test-data/product-center/product-center-item-create-data.factory.ts'), 'utf8'),
    ]);

    expect(adapterSource).toContain("id: 'item.createComboRequiredOnly'");
    expect(adapterSource).toContain("requiredInputs: ['record', 'price', 'minimumOrderQuantity', 'comboGroupName']");
    expect(comboFlowSource).toContain('从当前商品列表仅填写必填项创建套餐商品');
    expect(comboFlowSource).toContain("'/ops-brand/brand-items/combo'");
    expect(comboFlowSource).not.toMatch(/waitForTimeout|page\.goto/);
    expect(comboPageSource).toContain('addFixedComboGroupByName');
    expect(comboLocatorSource).toContain('fixedComboRowCheckbox(comboGroupName');
    expect(comboLocatorSource).toContain("this.fixedComboRows\n      .filter({ has: this.page.getByText(comboGroupName, { exact: true }) })");
    expect(comboLocatorSource).toContain("page.getByRole('dialog').filter({");
    expect(comboLocatorSource).toContain('fixedComboDialogTitle');
    expect(comboPageSource).toContain('selectUniqueAsyncTableTarget');
    expect(comboPageSource).toContain("'/ops-brand/brand-sections/list'");
    expect(comboPageSource).not.toContain('waitForTimeout');
    expect(recipeFlowSource).toContain('productCenter.prepareItemComboRequiredOnly');
    expect(recipeFlowSource).toContain('productCenter.verifyItemComboRequiredOnlyApi');
    expect(recipeFlowSource).toContain('productCenter.verifyItemComboRequiredOnlyUi');
    expect(factorySource).toContain("entityKind: 'combo'");
    expect(factorySource).toContain("entityKind: 'bom-product'");
  });

  test('标准商品创建能力应参数化规格价格和起售数量并即时登记清理', async () => {
    const [adapterSource, itemFlowSource, recipeFlowSource, factorySource] = await Promise.all([
      readFile(path.resolve('adapters/product-center/product-center-recipe-capabilities.ts'), 'utf8'),
      readFile(path.resolve('flows/product-center/product-center-item-standard-create.flow.ts'), 'utf8'),
      readFile(path.resolve('flows/product-center/product-center-recipe.flow.ts'), 'utf8'),
      readFile(path.resolve('test-data/product-center/product-center-item-create-data.factory.ts'), 'utf8'),
    ]);

    expect(adapterSource).toContain("id: 'item.createStandard'");
    expect(adapterSource).toContain("requiredInputs: ['record', 'specification', 'price', 'minimumOrderQuantity']");
    expect(adapterSource).not.toContain("id: 'item.createStandardSingleZeroPrice'");
    expect(itemFlowSource).toContain('按参数从当前商品列表创建标准商品');
    expect(itemFlowSource).not.toMatch(/waitForTimeout|page\.goto/);
    expect(recipeFlowSource).toContain('productCenter.prepareItemStandardSingleZeroPrice');
    expect(recipeFlowSource).toContain('productCenter.verifyItemStandardSingleZeroPriceApi');
    expect(recipeFlowSource).toContain('productCenter.verifyItemStandardSingleZeroPriceUi');
    expect(factorySource).toContain('cleanupRegistry.register');
    expect(factorySource).toContain("entityKind: 'item'");
  });

  test('做法明细名称边界能力应使用独立 UI 动作和 API 终态断言', async () => {
    const [adapterSource, pageSource, flowSource] = await Promise.all([
      readFile(path.resolve('adapters/product-center/product-center-recipe-capabilities.ts'), 'utf8'),
      readFile(path.resolve('pages/product-center/product-center-create-sop.page.ts'), 'utf8'),
      readFile(path.resolve('flows/product-center/product-center-recipe.flow.ts'), 'utf8'),
    ]);

    expect(adapterSource).toContain("id: 'methodDetail.enforceNameMaxLength'");
    expect(adapterSource).toContain('createMethodDetailBoundary');
    expect(pageSource).toContain('创建做法组并采集做法明细名称边界证据');
    expect(flowSource).toContain('productCenter.verifyMethodDetailBoundary');
  });

  test('商品名称必填能力应使用独立 Page、真实可见证据且无禁止定位器', async () => {
    const [adapterSource, pageSource] = await Promise.all([
      readFile(path.resolve('adapters/product-center/product-center-recipe-capabilities.ts'), 'utf8'),
      readFile(path.resolve('pages/product-center/product-center-item-required-validation.page.ts'), 'utf8'),
    ]);

    expect(adapterSource).toContain('ProductCenterItemRequiredValidationPage');
    expect(pageSource).toContain("input[aria-required=\"true\"]:visible");
    expect(pageSource).toContain("Please enter product name");
    expect(pageSource).toContain('mutationCount');
    expect(pageSource).not.toMatch(/waitForTimeout|\.first\(|\.last\(|\.nth\(|\.or\(|xpath/i);
  });

  test('商品列表只读能力应使用独立 Page 且无禁止定位器', async () => {
    const [adapterSource, pageSource] = await Promise.all([
      readFile(path.resolve('adapters/product-center/product-center-recipe-capabilities.ts'), 'utf8'),
      readFile(path.resolve('pages/product-center/product-center-item-intake.page.ts'), 'utf8'),
    ]);

    expect(adapterSource).toContain('ProductCenterItemIntakePage');
    expect(pageSource).toContain('openItemList');
    expect(pageSource).toContain('expectListDisplay');
    expect(pageSource).toContain('expectPageSizeOptions');
    expect(pageSource).not.toContain('expectActionTimesDescending');
    expect(pageSource).not.toContain('Action Time');
    expect(pageSource).not.toMatch(/waitForTimeout|\.first\(|\.last\(|\.nth\(|\.or\(|xpath/i);
  });

  test('门店商品名称查询能力应通过专用 Flow 使用真实 allName 请求并清空查询状态', async () => {
    const [adapterSource, flowSource, pageSource, apiSource] = await Promise.all([
      readFile(path.resolve('adapters/product-center/product-center-recipe-capabilities.ts'), 'utf8'),
      readFile(path.resolve('flows/product-center/product-center-store-product-search.flow.ts'), 'utf8'),
      readFile(path.resolve('pages/product-center/product-center-store-product-audit.page.ts'), 'utf8'),
      readFile(path.resolve('api/product-center/product-center-api.ts'), 'utf8'),
    ]);

    expect(adapterSource).toContain("id: 'storeProduct.searchByName'");
    expect(adapterSource).toContain('ProductCenterStoreProductSearchFlow');
    expect(flowSource).toContain('按名称片段查询既有门店商品并恢复查询状态');
    expect(flowSource).toContain('finally');
    expect(flowSource).toContain('clearSearch');
    expect(pageSource).toContain("'/ops-poi/poi-items/pageQuery'");
    expect(apiSource).toContain('{ allName: name }');
    expect(flowSource).not.toMatch(/waitForTimeout|page\.goto|\.locator\(|getByRole\(|getByText\(|getByLabel\(/);
  });

  test('商品中心能力适配器不得定义原始 locator', async () => {
    const source = await readFile(
      path.resolve('adapters/product-center/product-center-recipe-capabilities.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/\.locator\(|getByRole\(|getByText\(|getByLabel\(|selector\s*:/);
    expect(source).toContain('ProductCenterSopPage');
    expect(source).toContain('ProductCenterNegativePage');
    expect(source).not.toContain('能力尚未接入执行后端');
  });

  test('商品分类关系阻断能力应复用精确 Page 动作且不得猜测 locator', async () => {
    const [adapterSource, pageSource] = await Promise.all([
      readFile(path.resolve('adapters/product-center/product-center-recipe-capabilities.ts'), 'utf8'),
      readFile(path.resolve('pages/product-center/product-center-negative.page.ts'), 'utf8'),
    ]);

    expect(adapterSource).toContain('attemptAddChildCategory');
    expect(pageSource).toContain('openCategoryTree');
    expect(pageSource).toContain('isChildCategoryVisible');
    expect(pageSource).toContain('div[class^="addRow___"]');
    expect(pageSource).toContain('hasText: parentCategoryName');
    expect(pageSource).toContain("getByRole('textbox', { name: 'Category Name', exact: true })");
    expect(pageSource).toContain('filterCategoryByName');
    expect(pageSource).toContain('.ant-spin-spinning:visible');
    expect(pageSource).not.toContain("getByRole('button', { name: 'plus', exact: true })");
    expect(pageSource).not.toContain('添加分类 到 ${parentCategoryName}');
    expect(pageSource).toContain('settleInput');
    expect(pageSource).not.toMatch(/waitForTimeout|\.first\(|\.last\(|\.nth\(|\.or\(|xpath/i);
  });

  test('标签边界复核应点击页面真实关闭按钮且保持五十和十字符规则', async () => {
    const [pageSource, catalogSource] = await Promise.all([
      readFile(path.resolve('pages/product-center/product-center-negative.page.ts'), 'utf8'),
      readFile(path.resolve('sop/product-center/product-center-negative-sop.catalog.ts'), 'utf8'),
    ]);

    expect(pageSource).toContain("getByRole('button', { name: 'close', exact: true })");
    expect(pageSource).toContain("this.clickUnique(this.createTagDialogCloseButton, '创建标签弹窗关闭按钮')");
    expect(pageSource).not.toContain("this.page.keyboard.press('Escape')");
    expect(catalogSource).toContain("locatorKey: 'tag-second-language', maxLength: 50");
    expect(catalogSource).toContain("locatorKey: 'tag-group-second-language', maxLength: 10");
  });

  test('税种应使用已观测的 Store Products 侧边栏组进入', async () => {
    const [navigationSource, sidebarSource] = await Promise.all([
      readFile(path.resolve('pages/product-center/product-center-sidebar-navigation.page.ts'), 'utf8'),
      readFile(path.resolve('pages/sidebar.page.ts'), 'utf8'),
    ]);

    expect(navigationSource).toContain(
      "'/poi/tax/tax-types': { submenuTitlePath: ['Store Products', 'Tax Type Management'], candidatePaths: ['/poi/tax/tax-types'], expectedPaths: ['/poi/tax/tax-types'] }",
    );
    expect(navigationSource).toContain('openNestedSubMenuByCandidates');
    expect(sidebarSource).toContain('async openNestedSubMenuByCandidates(');
    expect(sidebarSource).toContain('state.count === 1 && state.visible && state.enabled');
  });

  test('菜单应使用失败快照观测到的精确 Menu 侧边栏组进入', async () => {
    const navigationSource = await readFile(
      path.resolve('pages/product-center/product-center-sidebar-navigation.page.ts'),
      'utf8',
    );

    expect(navigationSource).toContain(
      "'/bm/menu/list': { submenuTitles: ['Menu'], candidatePaths: ['/bm/menu/list'], expectedPaths: ['/bm/menu/list'] }",
    );
  });
});
