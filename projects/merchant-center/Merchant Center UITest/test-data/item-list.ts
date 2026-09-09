export const ITEM_LIST_PATH = '/pp/brand/list' as const;

export const ITEM_IMPORT_RECORD_PATH = '/pp/brand/file-import/record' as const;

export const ITEM_IMPORT_IMAGE_PATH = '/pp/brand/file-import/upload' as const;

export const ITEM_IMPORT_PRODUCT_PATH = '/pp/brand/create-upload' as const;

export const ITEM_CREATE_TYPE_PATH = '/pp/brand/create' as const;

export const ITEM_CREATE_PATHS = {
  standard: '/pp/brand/create/standard',
  combo: '/pp/brand/create/combo',
  side: '/pp/brand/create/side',
} as const;

export const ITEM_EDIT_PATHS = {
  standard: '/pp/brand/edit/standard',
  combo: '/pp/brand/edit/combo',
  side: '/pp/brand/edit/side',
} as const;

export const itemEditPageDom = {
  standardTitle: 'Edit Standard Product',
  comboTitle: 'Edit Combo Product',
  sideTitle: 'Edit Side Product',
} as const;

/** Playwright 测试运行时英文 DOM 契约 */
export const itemListDom = {
  searchPlaceholder: 'Item Name',
  addButton: 'Add Item',
  resetButton: 'Reset',
  actionButton: 'Action',
  importRecordsButton: '导入记录',
  batchActionPattern: /Bulk Operation\(\d+\)/,
  tableMarker: 'Item',
  filterType: 'Type',
  filterCategory: 'Category',
  filterStatus: 'Status',
  emptyResultsText: 'No search results found',
  paginationTotalPattern: /Total \d+ items/,
} as const;

export const itemListFilterOptionsDom = {
  typeStandard: 'Standard',
  typeCombo: 'Combo',
  typeSide: 'Add-On',
  statusEnabled: 'Enabled',
  statusDisabled: 'Disabled',
} as const;

export const itemListBatchMenuDom = {
  editProductInfo: 'Edit Product Info',
  modifySalesInfo: 'Modify Sales Info',
  modifyPrice: 'Modify Price',
  modifyAttributes: 'Modify Attributes',
  addToMenu: 'Add to Menu',
} as const;

export const itemImportRecordPageDom = {
  pageTitle: 'Import Records',
  tableMarker: 'Operation Type',
} as const;

export const itemImportImagePageDom = {
  pageTitle: 'Image Import Result Processing',
  uploadHeading: 'Upload files / images',
} as const;

export const itemImportProductPageDom = {
  pageTitle: 'Product Import',
  uploadHeading: 'Please upload product file',
} as const;

export const itemDeleteDialogDom = {
  title: 'Delete Confirmation',
  cancelButton: 'Cancel',
  confirmButton: 'Delete',
} as const;

export const itemAddToMenuDom = {
  heading: 'Add items to target menu',
  targetMenuHeading: 'Target menu',
  searchPlaceholder: 'Section name',
  loadingMenus: 'Loading menus…',
  saveButton: 'Save',
  closeButton: 'close',
} as const;

export const itemCreateTypeDom = {
  pageHeading: 'Select Product Type',
  typeCardClassPrefix: 'card___',
  standardCard: 'Standard Product',
  comboCard: 'Combo Product',
  sideCard: 'Side Product',
  createLink: 'Create',
} as const;

export const itemCreateFormDom = {
  saveButton: /^Save$/,
  saveAndNewButton: 'Save & New',
  itemNameFieldMarker: /^Item Name/,
  itemAltNameFieldMarker: /^Item Name\(Alt\.Language\)/,
  itemNameRequiredError: 'Please enter product name',
  standardPriceLabel: 'Price(Required)',
} as const;

export const itemCreateStandardFormDom = {
  sections: {
    basicInfo: 'Basic Info',
    itemPrice: 'Price',
    printSettings: 'Print Settings',
    itemAttributes: 'Attribute',
    sortRules: 'Attribute sort rule',
    otherSettings: 'More Settings',
  },
  singleSpecRadio: 'Single Recommended for single item',
  multiSpecRadio: 'Multiple Recommended for variable item',
  weightBasedItemMarker: 'Weight-based Item',
  weightBasedYesRadio: 'Yes',
  weightBasedNoRadio: 'No',
  addSpecGroupButton: 'Add Group',
  selectSpecGroupDialogTitle: 'Select Specification Group',
  specGroupSearchPlaceholder: 'Specification Group Name',
  specGroupCreateEntry: 'Go Create',
  specGroupConfirmButton: 'Confirm',
  multiSpecPriceSpinbutton: 'Required',
  sectionIds: {
    basicInfo: '#section-base',
    price: '#section-price-specs',
    printSettings: '#section-print-settings',
    attributes: '#section-attributes',
    otherSettings: '#section-others',
  },
  fields: {
    itemAltName: /^Item Name\(Alt\.Language\)/,
    description: /^Description/,
    posName: /^POS Name/,
    kitchenName: /^Kitchen Name/,
    mnemonicCode: /^Mnemonic Code/,
    industryGoods: /^Industry Goods/,
    itemCode: /^Item Code/,
    unit: /^Unit/,
    deviceCode: /^Device Code/,
    minimumOrderQuantity: /^Minimum Order Quantity/,
  },
  advancedSettingsButton: /Advanced Settings$/,
  categoryFieldMarker: 'Category',
  descriptionCharCountMarker: /\/ 500$/,
  packagingFeeSpinbutton: 'Packaging Fee',
  costSpinbutton: 'Cost',
  sortRuleSelectButton: 'Select',
  sortRuleDialogTitle: 'Select attribute sort rule',
  sortRuleDialogCloseButton: 'close',
  addAttributeMenuButton: /Add$/,
  attributeMenuItems: {
    flavor: 'Flavor',
    recipe: 'Recipe',
    additives: 'Additives',
  },
    attributeDialogs: {
      flavor: { title: 'Select Flavor Group', searchPlaceholder: 'Flavor Group Name' },
      recipe: { title: 'Select Cooking Method Group', searchPlaceholder: 'Preparation Group Name' },
      additives: { title: 'Select Additive Group', searchPlaceholder: 'Add-On Group Name' },
    },
    additionalPriceWarning: 'Additional price cannot be empty or 0, confirm submit?',
    additionalPriceConfirmButton: 'Confirm',
  printStallSearchPlaceholder: 'Stall name',
  selectedStallsPattern: /^Selected stalls: \d+$/,
  mutuallyExclusiveRulesMarker: 'Rules',
  mutuallyExclusiveRulesAddButton: 'Add',
  expandButton: /Expand$/,
  addButton: 'Add',
  addDropdownButton: /Add$/,
  otherSettingsBlocks: {
    descriptionLabels: 'Description Labels',
    badges: 'Badges',
    stats: 'Stats',
    ingredientInfo: 'Ingredient Info',
    detailImageUpload: 'Upload Image',
  },
} as const;

export const itemCreateComboFormDom = {
  sectionIds: {
    basicInfo: '#section-base',
    attributes: '#section-attributes',
  },
  sections: {
    basicInfo: 'Basic Info',
    itemPrice: 'Price',
    itemAttributes: 'Attribute',
    otherSettings: 'More Settings',
  },
  addComboGroupLabel: 'Add Combo Group',
  advancedSettingsButton: /Advanced Settings$/,
  minimumOrderQuantity: /^Minimum Order Quantity/,
  addFixedComboMenuItem: 'Add Fixed Combo',
  addFixedComboDialogTitle: 'Add Fixed Combo',
  selectFixedComboMenuItem: 'Select Fixed Combo',
  fixedComboDialogTitle: 'Select Fixed Combo',
  fixedComboConfirmButton: 'Confirm',
  selectCustomComboMenuItem: 'Select Custom Combo',
  customComboDialogTitle: 'Select Custom Combo',
  customComboConfirmButton: 'Confirm',
  addCustomComboMenuItem: 'Add Custom Combo',
  addCustomComboDialogTitle: 'Add Custom Combo',
  customComboGroupNamePlaceholder: 'Please enter Group Name',
  customComboAltNamePlaceholder: 'Please enter Group Name (Alt.Language)',
  customComboItemSearchPlaceholder: 'Name',
  customComboCategoryFilter: 'Product Category',
  customComboRepeatRule: 'Allow duplicate item selection within group',
  customComboSelectionQuantityRule: 'Selection Quantity',
  customComboTypeLabel: 'Custom Combo',
  customComboEditButton: 'edit Edit',
  customComboDeleteButton: 'delete Delete',
  customComboRequiredErrorCode: 'BITEM-6003',
} as const;

export const itemCreateSideFormDom = {
  sections: {
    basicInfo: 'Basic Info',
    itemPrice: 'Price',
    otherSettings: 'More Settings',
  },
} as const;

export const itemActionMenuDom = {
  imageImport: 'Import Images',
  itemImport: 'Product Import',
} as const;

/** 启用状态商品行操作菜单（不含 Enable） */
export const itemRowActionMenuDom = {
  enable: 'Enable',
  disable: 'Disable',
  copy: 'Copy',
  delete: 'Delete',
} as const;

export const itemSamples = {
  existingName: 'Pearl',
  existingAltName: '黑珍珠',
  nonExistingName: 'AUTO-NOT-EXIST-99999',
} as const;

/** 中文 UI 下列表表头（手工测试参考） */
export const itemTableColumnsZh = [
  '商品',
  '第二语言名称',
  '助记码',
  '商品类型',
  '商品分类',
  '规格',
  '标准价($)',
  '口味',
  '做法',
  '描述标签',
  '商品角标',
  '统计标签',
  '过敏原',
  '设备编码',
  '商品状态',
  '更新时间',
  '操作',
] as const;

/** 英文 UI 下列表表头（自动化参考） */
export const itemTableColumnsEn = [
  'Item',
  'Item(Alt.Language)',
  'Mnemonic Code',
  'Type',
  'Category',
  'Specification',
  'Price($)',
  'Flavor',
  'Preparation',
  'Descriptions',
  'Badges',
  'Stats',
  'Allergens',
  'Device Code',
  'Status',
  'Action Time',
  'Action',
] as const;
