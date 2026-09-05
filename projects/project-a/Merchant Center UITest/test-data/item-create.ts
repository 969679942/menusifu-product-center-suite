export type ItemProductType = 'standard' | 'combo' | 'side';

export type StandardItemVariant = 'single' | 'multi' | 'weight';

export type ItemCreateInput = {
  name?: string;
  price?: string;
};

export type StandardItemCreateInput = ItemCreateInput & {
  multiSpecPrice?: string;
};

export type StandardBasicInfoInput = {
  name?: string;
  altName?: string;
  description?: string;
};

export type StandardAdvancedSettingsInput = {
  posName?: string;
  kitchenName?: string;
  mnemonicCode?: string;
  industryGoods?: string;
  itemCode?: string;
  unit?: string;
  deviceCode?: string;
  minimumOrderQuantity?: string;
};

export type StandardPriceInput = {
  price?: string;
  packagingFee?: string;
  cost?: string;
};

export const standardFormSamples = {
  altName: 'AUTO-ALT',
  description: 'AUTO description for standard item',
  posName: 'AUTO-POS',
  kitchenName: 'AUTO-KITCHEN',
  mnemonicCode: 'AUTO-MN',
  industryGoods: 'AUTO-IND',
  itemCode: 'AUTO-CODE',
  unit: 'EA',
  deviceCode: 'AUTO-DEV',
  minimumOrderQuantity: '1',
  packagingFee: '0.50',
  cost: '1.00',
} as const;

export type CreatedItem = {
  name: string;
  type: ItemProductType;
  price: string;
  variant?: StandardItemVariant;
};

export function buildAutoItemName(type: ItemProductType): string {
  return `AUTO-${type}-${Date.now()}`;
}

export function buildAutoStandardFormBrowseName(): string {
  return `AUTO-standard-form-${Date.now()}`;
}

export function buildItemCreateInput(type: ItemProductType, overrides: ItemCreateInput = {}): Required<ItemCreateInput> {
  return {
    name: overrides.name ?? buildAutoItemName(type),
    price: overrides.price ?? '9.99',
  };
}

export function buildStandardItemCreateInput(
  variant: StandardItemVariant,
  overrides: StandardItemCreateInput = {},
): Required<StandardItemCreateInput> {
  const base = buildItemCreateInput('standard', overrides);
  return {
    ...base,
    multiSpecPrice: overrides.multiSpecPrice ?? base.price,
  };
}

export const itemEditSamples = {
  standard: {
    type: 'standard' as const,
    name: 'MIXUE Fresh Lemonade',
  },
  combo: {
    type: 'combo' as const,
    name: 'combo-group',
  },
  side: {
    type: 'side' as const,
    name: 'Pearl',
  },
} as const;

export const standardMultiSpecExpectations = {
  listSpecMarker: 'Regular Size',
} as const;
