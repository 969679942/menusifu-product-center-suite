import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { menuModule } from '../../contracts/product-center/modules/menu.module';

const formalRulePath = 'merchant-center:/Merchant Center Info/商品中心业务规则.md';
const formalRuleSection = '## 25. 菜单管理 / 菜单';

const confirmedSourceRuleIds = [
  'rule:menu-publish-generates-store-menu-and-products',
  'rule:menu-price-syncs-on-publish',
  'rule:pos-price-change-applies-after-publish',
  'rule:client-hidden-applies-after-publish',
  'rule:catalog-price-sync-respects-menu-price-override',
  'rule:channel-and-scenario-price-fallback',
  'rule:deleted-special-price-falls-back-after-publish',
  'rule:pos-price-change-disabled-after-publish',
  'rule:display-time-applies-after-republish',
] as const;

test.describe('商品中心菜单下发业务规则变更记录', () => {
  test('应保存产品已确认的变更方向并阻止未确认选项和字段生成断言', async () => {
    const filePath = path.resolve(
      'contracts/product-center/reviews/menu-publish-business-rule-change.json',
    );
    const source = await readFile(filePath, 'utf8');
    const document = JSON.parse(source);

    expect(document).toMatchObject({
      schemaVersion: '1.0.0',
      id: 'menu-publish-rule-change-2026-07-27',
      status: 'product-confirmed-change-request',
      generationAllowed: false,
      businessRuleMutationAllowed: false,
      formalRuleSource: {
        type: 'product-confirmed-business-rule',
        path: formalRulePath,
        locator: formalRuleSection,
        scope: 'section-only',
      },
      confirmedRequirements: [
        { id: 'new-product-distribution', status: 'confirmed-direction' },
        { id: 'extra-store-product-handling', status: 'confirmed-direction' },
        { id: 'field-distribution-scope', status: 'confirmed-direction' },
      ],
      confirmedSourceRules: confirmedSourceRuleIds.map((id) => ({ id, status: 'confirmed' })),
      unresolved: expect.arrayContaining([
        expect.objectContaining({ id: 'new-product-distribution-options', status: 'unresolved' }),
        expect.objectContaining({ id: 'extra-store-product-handling-options', status: 'unresolved' }),
        expect.objectContaining({ id: 'distributed-field-list', status: 'unresolved' }),
        expect.objectContaining({ id: 'excluded-field-list', status: 'unresolved' }),
      ]),
    });
    expect(document.confirmedSourceRules).toHaveLength(confirmedSourceRuleIds.length);
    expect(document.confirmedSourceRules.every((rule: { source: { path: string; locator: string } }) => (
      rule.source.path === formalRulePath
        && rule.source.locator.startsWith(`${formalRuleSection} / `)
    ))).toBe(true);
    expect(document.unresolved.every((item: { reason: string }) => item.reason.includes('§25'))).toBe(true);
    expect(source).not.toContain('## 26. 菜单管理 / 下发记录');
    expect(source).not.toMatch(/password|authorization|bearer\s+|cookie|access[_-]?token/i);
  });

  test('应仅将第25节原文可证明的规则加入菜单合同生成白名单', async () => {
    const additions = menuModule.curations?.additions ?? [];
    const confirmedRules = additions
      .filter((item) => confirmedSourceRuleIds.includes(item.record.id as typeof confirmedSourceRuleIds[number]));

    expect(confirmedRules.map((item) => item.record.id)).toEqual(confirmedSourceRuleIds);
    expect(confirmedRules).toHaveLength(confirmedSourceRuleIds.length);
    for (const item of confirmedRules) {
      expect(item.collection).toBe('businessRules');
      expect(item.record).toMatchObject({
        status: 'confirmed',
        sourceType: 'product-confirmed-business-rule',
        confidence: 1,
        generationAllowed: true,
        conflictStatus: 'none',
        module: '菜单管理 / 菜单',
        source: [{ path: formalRulePath }],
      });
      expect(item.record.source[0].locator).toMatch(/^## 25\. 菜单管理 \/ 菜单 \/ /);
    }
  });

  test('统一合同应接入逐条确认规则并保留第25节粗粒度评审门禁', async () => {
    const [contractSource, reviewSource] = await Promise.all([
      readFile(path.resolve('contracts/product-center/product-center-test-contract.json'), 'utf8'),
      readFile(path.resolve('contracts/product-center/product-center-rule-review.json'), 'utf8'),
    ]);
    const contract = JSON.parse(contractSource);
    const review = JSON.parse(reviewSource);
    const confirmedRules = contract.businessRules
      .filter((rule: { id: string }) => confirmedSourceRuleIds.includes(
        rule.id as typeof confirmedSourceRuleIds[number],
      ));
    const sectionRecord = contract.businessRules
      .find((rule: { id: string }) => rule.id === 'business-rule-section:25');

    expect(confirmedRules).toHaveLength(confirmedSourceRuleIds.length);
    expect(confirmedRules.every((rule: { status: string; generationAllowed: boolean }) => (
      rule.status === 'confirmed' && rule.generationAllowed
    ))).toBe(true);
    expect(sectionRecord).toMatchObject({ status: 'provisional', generationAllowed: false });
    expect(review.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'business-rule-section:25', status: 'review-required' }),
    ]));
    expect(review.items.some((item: { id: string }) => confirmedSourceRuleIds.includes(
      item.id as typeof confirmedSourceRuleIds[number],
    ))).toBe(false);
  });
});
