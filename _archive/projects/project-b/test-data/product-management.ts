export const PRODUCT_MANAGEMENT_ENTRY_PATH = '/pp/brand/list' as const;

export const PRODUCT_MANAGEMENT_MENU = [
  {
    id: 'item',
    menuLabel: 'Item',
    path: '/pp/brand/list',
    pageName: '商品',
    searchPlaceholder: 'Item Name',
    primaryAction: 'Add Item',
    resetAction: 'Reset',
    batchActionPattern: /^Bulk Operation\(\d+\)$/,
    tableMarker: 'Item',
  },
  {
    id: 'language-management',
    menuLabel: 'Language Management',
    path: '/pp/language-manage',
    pageName: '多语言管理',
    searchPlaceholder: 'Item',
    primaryAction: 'Edit',
    resetAction: 'Reset',
    batchActionPattern: /^Bulk Operation\(\d+\)$/,
    tableMarker: 'Field Information',
  },
  {
    id: 'category',
    menuLabel: 'Category',
    path: '/pp/brand/category',
    pageName: '分类',
    searchPlaceholder: 'Category Name',
    primaryAction: 'Add Category',
    resetAction: null,
    batchActionPattern: null,
    tableMarker: 'Category',
  },
  {
    id: 'specifications',
    menuLabel: 'Specifications',
    path: '/pp/brand/spec',
    pageName: '规格组',
    searchPlaceholder: 'Specification Group Name',
    primaryAction: 'Add',
    resetAction: null,
    batchActionPattern: null,
    tableMarker: 'Specification Group Name',
    identityColumnIndex: 1,
  },
  {
    id: 'sort-order',
    menuLabel: 'Sort order',
    path: '/pp/brand/modify-sort',
    pageName: '排序规则',
    searchPlaceholder: 'Rule name',
    primaryAction: 'Add sorting rule',
    resetAction: null,
    batchActionPattern: null,
    tableMarker: 'Sort order',
  },
  {
    id: 'flavors',
    menuLabel: 'Flavors',
    path: '/pp/brand/option-group/taste',
    pageName: '口味组',
    searchPlaceholder: 'Flavor Group Name',
    primaryAction: 'Add',
    resetAction: null,
    batchActionPattern: null,
    tableMarker: 'Flavor Group Name',
    identityColumnIndex: 1,
  },
  {
    id: 'preparations',
    menuLabel: 'Preparations',
    path: '/pp/brand/option-group/method',
    pageName: '做法组',
    searchPlaceholder: 'Preparation Group Name',
    primaryAction: 'Add',
    resetAction: null,
    batchActionPattern: null,
    tableMarker: 'Preparation Group Name',
    identityColumnIndex: 1,
  },
  {
    id: 'add-ons',
    menuLabel: 'Add-Ons',
    path: '/pp/brand/option-group/additional',
    pageName: '加料组',
    searchPlaceholder: 'Add-On Group Name',
    primaryAction: 'Add',
    resetAction: null,
    batchActionPattern: null,
    tableMarker: 'Add-On Group Name',
    identityColumnIndex: 1,
  },
  {
    id: 'combos',
    menuLabel: 'Combos',
    path: '/pp/brand/combo',
    pageName: '套餐组',
    searchPlaceholder: 'Combo group name',
    primaryAction: 'Add',
    resetAction: null,
    batchActionPattern: null,
    tableMarker: 'Combo Group',
    identityColumnIndex: 0,
  },
] as const;

export type ProductManagementMenuItem = (typeof PRODUCT_MANAGEMENT_MENU)[number];

export function findProductMenuById(id: ProductManagementMenuItem['id']): ProductManagementMenuItem {
  const item = PRODUCT_MANAGEMENT_MENU.find((entry) => entry.id === id);
  if (!item) {
    throw new Error(`Unknown product management menu id: ${id}`);
  }
  return item;
}
