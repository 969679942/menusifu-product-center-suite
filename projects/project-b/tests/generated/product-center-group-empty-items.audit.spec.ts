import type { Locator } from '@playwright/test';
import { expect, test } from '../../fixtures/product-center.fixture';
import { createAddOnsPage, createCombosPage } from '../../pages/product-management/group-list.factory';

test.describe('商品中心组空商品负向控件审计', () => {
  test('加料组填写名称后空商品终态', async ({ page }, testInfo) => {
    const pageObject = createAddOnsPage(page);
    const mutations: string[] = [];
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && /\/brand-addon-group(?:\/|$)/.test(pathname)) {
        mutations.push(`${request.method()} ${pathname}`);
      }
    });
    await pageObject.open();
    const surface = await pageObject.openCreateSurface();
    const identity = `AUTO_AUDIT_ADDON_EMPTY_PROBE_${Date.now()}`;
    const groupName = surface.locator('input[aria-required="true"][type="text"]:visible');
    const submit = surface.getByRole('button', { name: 'Confirm', exact: true });
    await groupName.fill(identity);
    const evidence = {
      identity,
      submitEnabled: await submit.isEnabled(),
      requiredItemFields: await surface.locator('[placeholder="items"][aria-required="true"]:visible').count(),
      visibleErrors: (await surface.locator('.ant-form-item-explain-error:visible, [role=alert]:visible, .ant-message-error:visible').allTextContents())
        .map((value) => value.trim()).filter(Boolean),
      mutations,
    };
    expect(mutations).toEqual([]);
    await testInfo.attach('加料组-empty-items-contract', {
      body: Buffer.from(JSON.stringify(evidence, null, 2)),
      contentType: 'application/json',
    });
    await pageObject.cancelCurrentSurface();
  });

  test('套餐组填写名称后的类型选项与空商品终态', async ({ page }, testInfo) => {
    const pageObject = createCombosPage(page);
    const mutations: string[] = [];
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && /\/brand-sections(?:\/|$)/.test(pathname)) {
        mutations.push(`${request.method()} ${pathname}`);
      }
    });
    await pageObject.open();
    const surface = await pageObject.openCreateSurface();
    const identity = `AUTO_AUDIT_COMBO_EMPTY_PROBE_${Date.now()}`;
    const groupName = surface.locator('input[aria-required="true"][type="text"]:visible');
    const submit = surface.getByRole('button', { name: 'Confirm', exact: true });
    const comboType = surface.locator('.ant-select:visible');
    const comboTypeRadios = surface.getByRole('radio');
    const selectCount = await comboType.count();
    const radioCount = await comboTypeRadios.count();
    expect(selectCount <= 1, '套餐类型下拉控件不得出现多个实例').toBe(true);
    expect((selectCount === 1) !== (radioCount > 0), '套餐类型必须且只能使用一种选择机制').toBe(true);
    await groupName.fill(identity);
    const typeStates: Array<{ type: string; submitEnabled: boolean; visibleErrors: string[] }> = [];
    const optionTexts: string[] = [];
    if (selectCount === 1) {
      await comboType.click();
      const dropdown = page.locator('.ant-select-dropdown:visible');
      await expect(dropdown).toHaveCount(1);
      const options = dropdown.locator('.ant-select-item-option:visible');
      optionTexts.push(...(await options.allTextContents()).map((value) => value.trim()).filter(Boolean));
      for (const optionText of optionTexts) {
        const option = dropdown.locator('.ant-select-item-option:visible').filter({ hasText: optionText });
        await option.click();
        typeStates.push(await readTypeState(surface, submit, optionText));
        if (optionText !== optionTexts.at(-1)) {
          await comboType.click();
          await expect(dropdown).toHaveCount(1);
        }
      }
    } else {
      for (const radio of await comboTypeRadios.all()) {
        const optionText = (await radio.locator('xpath=ancestor::label[1]').innerText()).trim();
        optionTexts.push(optionText);
        await radio.check();
        typeStates.push(await readTypeState(surface, submit, optionText));
      }
    }
    const evidence = {
      identity,
      selectionMechanism: selectCount === 1 ? 'select' : 'radio',
      optionTexts,
      typeStates,
      mutations,
    };
    await testInfo.attach('套餐组-empty-items-contract', {
      body: Buffer.from(JSON.stringify(evidence, null, 2)),
      contentType: 'application/json',
    });
    expect(optionTexts.length).toBeGreaterThan(0);
    expect(mutations).toEqual([]);
    await pageObject.cancelCurrentSurface();
  });
});

async function readTypeState(
  surface: Locator,
  submit: Locator,
  type: string,
): Promise<{ type: string; submitEnabled: boolean; visibleErrors: string[] }> {
  return {
    type,
    submitEnabled: await submit.isEnabled(),
    visibleErrors: (await surface.locator('.ant-form-item-explain-error:visible, [role=alert]:visible, .ant-message-error:visible').allTextContents())
      .map((value) => value.trim()).filter(Boolean),
  };
}
