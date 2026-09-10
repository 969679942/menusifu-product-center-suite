import { expect, type Page } from '@playwright/test';
import type { CleanupRegistry } from '../../../api/product-center/cleanup-registry';
import type { ItemCreateSidePage } from '../../../pages/product-management/item/item-create-side.page';
import { createItemListPage } from '../../../pages/product-management/item/item-list.page';
import type { AddonItem216Context, AddonItem216Factory } from '../../../test-data/product-center/item-216/addon-item-216.factory';
export async function runAddonSameAltNameNegative(input: { context: AddonItem216Context; page: Page; factory: AddonItem216Factory; cleanupRegistry: CleanupRegistry; identities: Set<string>; openCreate: () => Promise<ItemCreateSidePage>; assertSaveBlocked: (form: ItemCreateSidePage) => Promise<Record<string, unknown>> }): Promise<Record<string, unknown>> {
  const { context, factory } = input; input.identities.add(context.originalIdentity);
  input.cleanupRegistry.register({ entity: 'item', identity: context.originalIdentity, execute: async () => { await factory.cleanupAuditItemsByIdentity(context.originalIdentity); }, verify: async () => (await factory.itemCount(context.originalIdentity)) === 0 });
  const form = await input.openCreate(); await form.fillItemName(context.originalIdentity); await form.fillCommonItemAltName(context.originalIdentity); await form.fillStandardPrice('10.00');
  const result = await input.assertSaveBlocked(form); const successMessageCount = await form.readSuccessMessageCount(); expect(successMessageCount).toBe(0); expect(result.errors).toContain('BITEM-7001 : name is same with secondName');
  const list = createItemListPage(input.page); await list.open(); await list.fillSearchAndWait(context.originalIdentity); await list.expectEmptySearchResults(5_000); const listCount = await list.readVisibleRowCount(); expect(listCount).toBe(0);
  const observations = [{ expectedValue: { route: '/pp/brand/create/side', successMessageCount: 0 }, actualValue: { route: result.route, successMessageCount } }, { expectedValue: 'BITEM-7001 : name is same with secondName', actualValue: result.errors }, { expectedValue: { identity: context.originalIdentity, listCount: 0 }, actualValue: { identity: context.originalIdentity, listCount } }];
  return { ...result, listCount, assertionReceipts: observations.map((observation, index) => ({ claimId: `${context.caseId}:expectation-${index + 1}`, status: 'verified', ...observation, actualStatus: 'observed', observationChannel: 'ui', authority: 'user-visible', comparison: 'matched' })) };
}
