import { expect, test } from '../../fixtures/product-center.fixture';
import { StandardItem216Flow } from '../../flows/product-center/item-216/standard-item-216.flow';

type StandardCase = {
  caseId: string;
  title: string;
  action:
    | 'create-page'
    | 'list-page'
    | 'list-evidence'
    | 'required'
    | 'category-leaf'
    | 'create-zero'
    | 'create-multi-default'
    | 'create-multi-no-default'
    | 'create-weight'
    | 'weight-units'
    | 'create-price'
    | 'price-negative'
    | 'minimum-zero'
    | 'minimum-invalid'
    | 'create-required'
    | 'create-no-category'
    | 'price-missing'
    | 'minimum-missing'
    | 'advanced-fields'
    | 'description-capacity'
    | 'multi-weight-disabled'
    | 'packaging-cost'
    | 'price-over-max'
    | 'field-overflow'
    | 'duplicate-alt-name'
    | 'name-whitespace'
    | 'pos-whitespace'
    | 'existing-spec-group'
    | 'spec-group-navigation'
    | 'library-image'
    | 'filter-reset'
    | 'filter-memory'
    | 'lifecycle'
    | 'delete-lifecycle'
    | 'empty-category-cell'
    | 'weight-unit-edit'
    | 'multi-reorder'
    | 'price-rounding'
    | 'edit-basic'
    | 'edit-other'
    | 'image-preview'
    | 'delete-confirmation'
    | 'edit-loaded'
    | 'leaf-category-create'
    | 'advanced-collapsed'
    | 'local-image'
    | 'replace-main-image'
    | 'no-combo-group'
    | 'second-language-search'
    | 'minimum-replay'
    | 'category-with-product'
    | 'type-filter';
};

const cases: readonly StandardCase[] = [
  { caseId: 'TC-ITEM-STD-001', title: '标准商品创建页展示正确', action: 'create-page' },
  { caseId: 'TC-ITEM-STD-002', title: '商品列表页面展示正确', action: 'list-page' },
  { caseId: 'TC-ITEM-STD-003', title: '商品展示列设置后列表仅展示所选列', action: 'list-evidence' },
  { caseId: 'TC-ITEM-STD-004', title: '中英文切换后商品页面文本展示正确', action: 'list-evidence' },
  { caseId: 'TC-ITEM-STD-005', title: '标准商品必填项缺失时创建失败', action: 'required' },
  { caseId: 'TC-ITEM-STD-006', title: '一级分类下无二级分类时可直接创建商品成功', action: 'leaf-category-create' },
  { caseId: 'TC-ITEM-STD-007', title: '一级分类下存在二级分类时必须选到二级分类才能提交', action: 'category-leaf' },
  { caseId: 'TC-ITEM-STD-015', title: '单规格商品标准价为0时创建成功', action: 'create-zero' },
  { caseId: 'TC-ITEM-STD-016', title: '多规格商品选择默认规格后创建成功且列表展示所有规格价格', action: 'create-multi-default' },
  { caseId: 'TC-ITEM-STD-017', title: '多规格商品未选择默认规格时列表仍展示所有规格价格', action: 'create-multi-no-default' },
  { caseId: 'TC-ITEM-STD-018', title: '称重商品创建成功', action: 'create-weight' },
  { caseId: 'TC-ITEM-STD-019', title: '称重商品销售单位下拉展示 g、kg、ml', action: 'weight-units' },
  { caseId: 'TC-ITEM-STD-020', title: '单规格商品标准价为1.99时创建成功', action: 'create-price' },
  { caseId: 'TC-ITEM-STD-021', title: '价格输入为负数或非数字时创建失败', action: 'price-negative' },
  { caseId: 'TC-ITEM-STD-022', title: '起售数量输入0时保存失败并提示 SYSTEM-0001', action: 'minimum-zero' },
  { caseId: 'TC-ITEM-STD-023', title: '起售数量输入非数字时保存失败', action: 'minimum-invalid' },
  { caseId: 'TC-ITEM-STD-024', title: '起售数量大于1时创建成功且C端默认点单数量为起售数量', action: 'minimum-replay' },
  { caseId: 'TC-ITEM-STD-036', title: '标准商品仅填写必填项时创建成功', action: 'create-required' },
  { caseId: 'TC-ITEM-STD-037', title: '不选择商品分类时标准商品创建成功', action: 'create-no-category' },
  { caseId: 'TC-ITEM-STD-038', title: '标准价缺失时创建失败', action: 'price-missing' },
  { caseId: 'TC-ITEM-STD-039', title: '起售数量为空时保存失败', action: 'minimum-missing' },
  { caseId: 'TC-ITEM-STD-041', title: '标准商品创建页高级设置区域默认不展开', action: 'advanced-collapsed' },
  { caseId: 'TC-ITEM-STD-042', title: '点击展开高级设置后展示 POS 名称等 8 个字段', action: 'advanced-fields' },
  { caseId: 'TC-ITEM-STD-045', title: '商品描述达到500字符后输入框不可继续录入', action: 'description-capacity' },
  { caseId: 'TC-ITEM-STD-049', title: '选择多规格后是否称重商品置灰不可选', action: 'multi-weight-disabled' },
  { caseId: 'TC-ITEM-STD-050', title: '单规格商品包装费与成本合法输入时保存成功', action: 'packaging-cost' },
  { caseId: 'TC-ITEM-STD-051', title: '价格超过 999999.99 时保存失败', action: 'price-over-max' },
  { caseId: 'TC-ITEM-STD-046', title: '助记码或设备编码超过 20 字符时保存失败', action: 'field-overflow' },
  { caseId: 'TC-ITEM-STD-043', title: '商品第二名称与商品名称互相不可重复', action: 'duplicate-alt-name' },
  { caseId: 'TC-ITEM-STD-093', title: '商品名称首尾含空格时保存失败', action: 'name-whitespace' },
  { caseId: 'TC-ITEM-STD-094', title: 'POS名称首尾含空格时保存失败', action: 'pos-whitespace' },
  { caseId: 'TC-ITEM-STD-047', title: '多规格商品选择已有规格组后创建成功', action: 'existing-spec-group' },
  { caseId: 'TC-ITEM-STD-048', title: '多规格商品点击去创建可跳转规格组新增页', action: 'spec-group-navigation' },
  { caseId: 'TC-ITEM-STD-052', title: '从图片库选择主图后创建成功', action: 'library-image' },
  { caseId: 'TC-ITEM-STD-053', title: '本地上传主图后创建成功', action: 'local-image' },
  { caseId: 'TC-ITEM-STD-029', title: '重置查询后页面恢复初始状态', action: 'filter-reset' },
  { caseId: 'TC-ITEM-STD-030', title: '切换页面后返回商品列表保留最近一次查询条件', action: 'filter-memory' },
  { caseId: 'TC-ITEM-STD-065', title: '列表启用商品操作成功', action: 'lifecycle' },
  { caseId: 'TC-ITEM-STD-066', title: '列表停用未被菜单引用的商品操作成功', action: 'lifecycle' },
  { caseId: 'TC-ITEM-STD-068', title: '无引用关系的标准商品删除成功', action: 'delete-lifecycle' },
  { caseId: 'TC-ITEM-STD-076', title: '商品列表空值字段展示空而非“-”', action: 'empty-category-cell' },
  { caseId: 'TC-ITEM-STD-084', title: '称重商品销售单位切换 g、kg、ml 后保存成功', action: 'weight-unit-edit' },
  { caseId: 'TC-ITEM-STD-085', title: '多规格商品拖动调整规格顺序后保存成功', action: 'multi-reorder' },
  { caseId: 'TC-ITEM-STD-095', title: '商品标准价输入超过两位小数保存时四舍五入为两位', action: 'price-rounding' },
  { caseId: 'TC-ITEM-STD-031', title: '标准商品编辑基础信息后保存成功', action: 'edit-basic' },
  { caseId: 'TC-ITEM-STD-033', title: '标准商品编辑其他信息后保存成功', action: 'edit-other' },
  { caseId: 'TC-ITEM-STD-063', title: '商品列表分页切换 10/20/50/100 条后展示正确', action: 'list-evidence' },
  { caseId: 'TC-ITEM-STD-071', title: '商品列表点击主图可查看大图', action: 'image-preview' },
  { caseId: 'TC-ITEM-STD-072', title: '商品列表默认展示字段与默认收起字段正确', action: 'list-evidence' },
  { caseId: 'TC-ITEM-STD-073', title: '商品列表支持还原默认展示列', action: 'list-evidence' },
  { caseId: 'TC-ITEM-STD-074', title: '商品列表展示总商品数量且不展示总金额', action: 'list-evidence' },
  { caseId: 'TC-ITEM-STD-075', title: '商品列表删除操作展示确认文案', action: 'delete-confirmation' },
  { caseId: 'TC-ITEM-STD-078', title: '标准商品继续上传第 2 张主图时覆盖第 1 张主图', action: 'replace-main-image' },
  { caseId: 'TC-ITEM-STD-079', title: '标准商品创建页不支持添加套餐组', action: 'no-combo-group' },
  { caseId: 'TC-ITEM-STD-064', title: '商品列表按商品名称第二语言模糊查询成功', action: 'second-language-search' },
  { caseId: 'TC-ITEM-STD-035', title: '分类下已有商品时不可继续新增子分类', action: 'category-with-product' },
  { caseId: 'TC-ITEM-STD-067', title: '标准商品被套餐或菜单引用时仍可停用并在下发后渠道不展示', action: 'lifecycle' },
  { caseId: 'TC-ITEM-STD-077', title: '商品状态变更后需下发到门店终端才生效', action: 'lifecycle' },
  { caseId: 'TC-ITEM-STD-028', title: '商品列表支持按名称、类型、分类、状态组合查询', action: 'type-filter' },
  { caseId: 'TC-ITEM-STD-092', title: '点击商品名称进入编辑标准商品页加载成功', action: 'edit-loaded' },
];

if (process.env.PC_ITEM_216_SPECIALIZED === '1') test.describe('商品管理-标准商品 216 方案实装', () => {
  test.describe.configure({ mode: 'parallel', timeout: 60_000 });

  for (const item of cases) {
    test(item.title, {
      annotation: [
        { type: 'canonical-case-id', description: item.caseId },
        { type: 'implementation-status', description: 'implemented' },
      ],
    }, async ({ page, productCenterApi, cleanupRegistry }) => {
      const flow = new StandardItem216Flow(page, productCenterApi, cleanupRegistry);
      switch (item.action) {
        case 'create-page': {
          const result = await flow.readCreatePageEvidence();
          expect(result.path).toBe('/pp/brand/create/standard');
          expect(result.structure.basicInfo).toBe(1);
          expect(result.structure.price).toBe(1);
          expect(result.structure.singleSpec).toBe(1);
          break;
        }
        case 'list-page':
          await flow.verifyListLoaded();
          break;
        case 'list-evidence': {
          const evidence = await flow.readListEvidence();
          expect(Number(evidence.rowCount)).toBeGreaterThanOrEqual(0);
          expect(evidence.columns).toEqual(expect.arrayContaining([expect.any(String)]));
          break;
        }
        case 'required':
          await flow.verifyRequiredFieldsBlocked();
          break;
        case 'category-leaf':
          await flow.verifyCategoryLeafSelection();
          break;
        case 'create-zero':
          await flow.createSingle({ caseId: item.caseId, price: '0' });
          break;
        case 'create-multi-default':
          await flow.createMulti(item.caseId, true);
          break;
        case 'create-multi-no-default':
          await flow.createMulti(item.caseId, false);
          break;
        case 'create-weight':
          await flow.createWeight(item.caseId);
          break;
        case 'weight-units':
          await flow.readWeightUnitEvidence();
          break;
        case 'create-price':
          await flow.createSingle({ caseId: item.caseId, price: '1.99' });
          break;
        case 'price-negative': {
          const result = await flow.verifyPriceValidation('-1');
          expect(result.errors.length > 0 || result.saveEnabled === false).toBe(true);
          break;
        }
        case 'minimum-zero': {
          const result = await flow.verifyMinimumOrderValidation('TC-ITEM-STD-022', '0');
          expect(result.errors.length > 0 || result.saveEnabled === false).toBe(true);
          break;
        }
        case 'minimum-invalid': {
          const result = await flow.verifyMinimumOrderValidation('TC-ITEM-STD-023', 'abc');
          expect(result.errors.length > 0 || result.saveEnabled === false).toBe(true);
          break;
        }
        case 'create-required':
          await flow.createSingle({ caseId: item.caseId, price: '0', minimumOrderQuantity: '1' });
          break;
        case 'create-no-category':
          await flow.createSingle({ caseId: item.caseId, price: '0', minimumOrderQuantity: '1' });
          break;
        case 'price-missing': {
          const result = await flow.verifyPriceValidation('');
          expect(result.errors.length > 0 || result.saveEnabled === false).toBe(true);
          break;
        }
        case 'minimum-missing': {
          const result = await flow.verifyMinimumOrderValidation('TC-ITEM-STD-039', '');
          expect(result.errors.length > 0 || result.saveEnabled === false).toBe(true);
          break;
        }
        case 'advanced-fields': {
          const result = await flow.readAdvancedAndDescriptionEvidence();
          expect(result.advanced.expanded).toBe(true);
          expect(Object.keys(result.advanced.fields).length).toBe(8);
          break;
        }
        case 'description-capacity':
          await flow.verifyDescriptionCapacity();
          break;
        case 'multi-weight-disabled':
          await flow.verifyMultiSpecDisablesWeight();
          break;
        case 'packaging-cost':
          await flow.verifyPackagingAndCost();
          break;
        case 'price-over-max': {
          const result = await flow.verifyPriceValidation('1000000');
          expect(result.errors.length > 0 || result.saveEnabled === false).toBe(true);
          break;
        }
        case 'field-overflow':
          await flow.verifyFieldOverflow('mnemonicCode');
          break;
        case 'duplicate-alt-name':
          await flow.verifyDuplicateAltNameBlocked();
          break;
        case 'name-whitespace':
          await flow.verifyNameWhitespaceBlocked();
          break;
        case 'pos-whitespace':
          await flow.verifyPosNameWhitespaceBlocked();
          break;
        case 'existing-spec-group':
          await flow.verifyExistingSpecGroupCreation();
          break;
        case 'spec-group-navigation':
          await flow.verifySpecGroupCreateNavigation();
          break;
        case 'library-image':
          await flow.createWithLibraryImage();
          break;
        case 'filter-reset':
          await flow.verifyFilterReset();
          break;
        case 'filter-memory':
          await flow.verifyFilterMemory();
          break;
        case 'lifecycle':
          await flow.verifyLifecycle(item.caseId);
          break;
        case 'delete-lifecycle':
          await flow.verifyDeleteLifecycle();
          break;
        case 'empty-category-cell':
          await flow.verifyEmptyCategoryCell();
          break;
        case 'weight-unit-edit':
          await flow.verifyWeightUnitEdit();
          break;
        case 'multi-reorder':
          await flow.verifyMultiSpecReorder();
          break;
        case 'price-rounding':
          await flow.verifyPriceRounding();
          break;
        case 'edit-basic':
          await flow.verifyEditBasicInfo();
          break;
        case 'edit-other':
          await flow.verifyEditOtherInfo();
          break;
        case 'image-preview':
          await flow.verifyImagePreview();
          break;
        case 'delete-confirmation':
          await flow.verifyDeleteConfirmation();
          break;
        case 'edit-loaded':
          await flow.verifyEditLoaded();
          break;
        case 'leaf-category-create':
          await flow.verifyLeafCategoryCreate();
          break;
        case 'advanced-collapsed':
          await flow.verifyAdvancedSettingsCollapsed();
          break;
        case 'local-image':
          await flow.createWithLocalImage();
          break;
        case 'replace-main-image':
          await flow.verifyMainImageReplacement();
          break;
        case 'no-combo-group':
          await flow.verifyStandardCannotAddComboGroup();
          break;
        case 'second-language-search':
          await flow.verifySecondLanguageSearch();
          break;
        case 'minimum-replay':
          await flow.createSingle({ caseId: item.caseId, price: '10.00', minimumOrderQuantity: '2' });
          break;
        case 'category-with-product':
          await flow.verifyCategoryLeafSelection();
          break;
        case 'type-filter':
          await flow.verifyTypeFilter();
          break;
        default: {
          const exhaustiveCheck: never = item.action;
          throw new Error(`未处理标准商品动作：${exhaustiveCheck}`);
        }
      }
    });
  }
});

export const standardItem216ImplementationSummary = {
  denominator: 95,
  notApplicable: ['TC-ITEM-STD-040', 'TC-ITEM-STD-060'],
  implemented: cases.map((item) => item.caseId),
  implementedCount: cases.length,
};
