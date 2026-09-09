import { expect, test } from '../../fixtures/product-center.fixture';
import {
  createAddOnsPage,
  createCombosPage,
  createFlavorsPage,
  createPreparationsPage,
  createSpecificationsPage,
} from '../../pages/product-management/group-list.factory';
import { waitUntil } from '../../utils/wait';

const residueChecks = [
  {
    caseId: 'TC-GRP-SPEC-020',
    createPage: createSpecificationsPage,
    identities: ['AUTO_AUDIT_SPEC_1786445813784101', 'AUTO_AUDIT_SPEC_1786445813784101_EDIT'],
  },
  {
    caseId: 'TC-GRP-TASTE-012',
    createPage: createFlavorsPage,
    identities: ['AUTO_AUDIT_TASTE_1786445858528201', 'AUTO_AUDIT_TASTE_1786445858528201_EDIT'],
  },
  {
    caseId: 'TC-GRP-MTH-011',
    createPage: createPreparationsPage,
    identities: ['AUTO_AUDIT_METHOD_1786445903333301', 'AUTO_AUDIT_METHOD_1786445903333301_EDIT'],
  },
  {
    caseId: 'TC-GRP-ADD-016',
    createPage: createAddOnsPage,
    identities: ['AUTO_AUDIT_ADDITIONAL_1786445948096401', 'AUTO_AUDIT_ADDITIONAL_1786445948096401_EDIT'],
  },
  {
    caseId: 'TC-GRP-PKG-017',
    createPage: createCombosPage,
    identities: ['AUTO_AUDIT_COMBO_1786445993551402'],
  },
] as const;

test.describe('商品中心商品管理组零残留 UI 对账', () => {
  test.describe.configure({ mode: 'default', timeout: 60_000 });

  for (const check of residueChecks) {
    test(`${check.caseId} 原始及派生身份 UI count=0`, async ({ page }) => {
      const groupPage = check.createPage(page);
      await groupPage.open();
      for (const identity of check.identities) {
        await groupPage.search(identity);
        const visibleCount = await waitUntil(
          () => groupPage.readVisibleIdentityCount(identity),
          (count) => count === 0,
          { timeout: 15_000, interval: 250, message: `组身份仍存在：${identity}` },
        );
        expect(visibleCount, `组身份应为零残留：${identity}`).toBe(0);
      }
    });
  }
});
