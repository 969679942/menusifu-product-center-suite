const prefixes:Record<string,string>={
 'TC-ITEM-ADD-008':'加料商品-标准价缺失创建-',
 'TC-ITEM-ADD-009':'加料商品-标准价为 0 创建-',
 'TC-ITEM-ADD-010':'加料商品-价格输入负数或非数字创建-',
 'TC-ITEM-ADD-011':'加料商品-包装费与成本合法输入保存-',
};
export function buildAddonPriceSourceName(caseId:string,timestamp:number){if(!prefixes[caseId]||!Number.isSafeInteger(timestamp)||timestamp<0)throw Error('ADDON_PRICE_SOURCE_IDENTITY_INVALID');return prefixes[caseId]+timestamp;}
// Formal source amount 0.00; current list receipts in addon-price-owned-repair-20260909-01 show $0.00.
export const addonZeroPricePresentations=['0.00','$0.00'] as const;
export function matchesAddonZeroPrice(value:string){return addonZeroPricePresentations.some(allowed=>value===allowed);}
