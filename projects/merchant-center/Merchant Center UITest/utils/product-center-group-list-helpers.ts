/** Pure configuration and string helpers for the group-list page facade. */
export { settleInput } from './input-settle';
export { updateCurrentProductCenterGroupProgressPhase } from './product-center-group-progress';
export { step } from './step';
export { waitUntil } from './wait';

export const listResponseByPath: Record<string, RegExp> = {
  '/pp/brand/spec': /brand-specs\/page/,
  '/pp/brand/option-group/taste': /brand-modifiers\/page/,
  '/pp/brand/option-group/method': /brand-modifiers\/page/,
  '/pp/brand/option-group/additional': /brand-addon-group\/list/,
  '/pp/brand/combo': /brand-sections\/list/,
};

export const localizedListLabels: Record<string, { search: RegExp; table: RegExp }> = {
  '/pp/brand/spec': { search: /Specification Group Name|规格组名称/i, table: /Specification Group Name|规格组名称/i },
  '/pp/brand/option-group/taste': { search: /Flavor Group Name|口味组名称/i, table: /Flavor Group Name|口味组名称/i },
  '/pp/brand/option-group/method': { search: /Preparation Group Name|做法组名称/i, table: /Preparation Group Name|做法组名称/i },
  '/pp/brand/option-group/additional': { search: /Add-On Group Name|加料组名称/i, table: /Add-On Group Name|加料组名称/i },
};

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function escapeCssAttribute(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
