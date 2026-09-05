import { expect, test } from '../../fixtures/product-center.fixture';
import {
  createAddOnsPage,
  createCombosPage,
  createFlavorsPage,
  createPreparationsPage,
  createSpecificationsPage,
} from '../../pages/product-management/group-list.factory';
import { settleInput } from '../../utils/input-settle';

test.describe('商品中心组新增表单只读审计', () => {
  const definitions = [
    ['规格组', createSpecificationsPage],
    ['口味组', createFlavorsPage],
    ['做法组', createPreparationsPage],
    ['加料组', createAddOnsPage],
    ['套餐组', createCombosPage],
  ] as const;

  for (const [name, createPage] of definitions) {
    test(`${name}新增表单结构`, async ({ page }, testInfo) => {
      const pageObject = createPage(page);
      const mutationRequests: Array<{ method: string; pathname: string }> = [];
      page.on('request', (request) => {
        const pathname = new URL(request.url()).pathname;
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
          && /\/(brand-specs|brand-modifiers|brand-addon-group|brand-sections)(\/|$)/.test(pathname)) {
          mutationRequests.push({
            method: request.method(),
            pathname,
          });
        }
      });
      await pageObject.open();
      const surface = await pageObject.openCreateSurface();
      const submitControl = pageObject.groupFormSubmitControl(surface);
      const cancelControl = surface.getByRole('button', { name: /^(取消|Cancel|关闭|Close)$/i });
      const snapshot = await surface.evaluate((body) => ({
        url: window.location.href,
        inputs: Array.from(body.querySelectorAll('input'))
          .filter((element) => Boolean((element as HTMLElement).offsetParent))
          .map((element) => ({
          placeholder: element.getAttribute('placeholder'),
          name: element.getAttribute('name'),
          type: element.getAttribute('type'),
          maxLength: element.getAttribute('maxlength'),
          ariaRequired: element.getAttribute('aria-required'),
          })),
        buttons: Array.from(body.querySelectorAll('button'))
          .filter((element) => Boolean((element as HTMLElement).offsetParent))
          .map((element) => (
            element.getAttribute('aria-label')
            ?? element.getAttribute('title')
            ?? element.querySelector('img')?.getAttribute('alt')
            ?? (element.textContent ?? '').trim()
          ))
          .filter(Boolean),
        labels: Array.from(body.querySelectorAll('label'))
          .filter((element) => Boolean((element as HTMLElement).offsetParent))
          .map((element) => (element.textContent ?? '').trim())
          .filter(Boolean),
        selects: Array.from(body.querySelectorAll('.ant-select'))
          .filter((element) => Boolean((element as HTMLElement).offsetParent))
          .map((element) => ({
            text: (element.textContent ?? '').trim(),
            className: element.getAttribute('class'),
            ariaLabel: element.getAttribute('aria-label'),
            input: element.querySelector('input')?.outerHTML ?? null,
          })),
        radioLabels: Array.from(body.querySelectorAll('label.ant-radio-wrapper'))
          .filter((element) => Boolean((element as HTMLElement).offsetParent))
          .map((element) => (element.textContent ?? '').trim()),
        formItems: Array.from(body.querySelectorAll('.ant-form-item'))
          .filter((element) => Boolean((element as HTMLElement).offsetParent))
          .map((element) => ({
            text: (element.textContent ?? '').trim(),
            required: Boolean(element.querySelector('.ant-form-item-required, [aria-required="true"]')),
          })),
      }));
      const pathname = new URL(snapshot.url).pathname;
      expect(pathname, `${name}必须进入新增路由`).toMatch(/\/create$/);
      expect(snapshot.inputs.length, `${name}新增页面必须存在可见输入字段`).toBeGreaterThan(0);
      await expect(submitControl, `${name}缺少提交控件`).toHaveCount(1);
      await expect(cancelControl, `${name}缺少取消控件`).toHaveCount(1);
      expect(mutationRequests, `${name}只读表单审计不得发送写请求`).toEqual([]);
      const submitEnabled = await submitControl.isEnabled();
      if (submitEnabled) {
        await submitControl.click();
        await settleInput();
      }
      const validationSnapshot = await surface.evaluate((body) => ({
        inputs: Array.from(body.querySelectorAll('input'))
          .filter((element) => Boolean((element as HTMLElement).offsetParent))
          .map((element, index) => {
            const formItem = element.closest('.ant-form-item');
            return {
              index,
              type: element.getAttribute('type'),
              placeholder: element.getAttribute('placeholder'),
              ariaRequired: element.getAttribute('aria-required'),
              ariaInvalid: element.getAttribute('aria-invalid'),
              formItemHasError: formItem?.classList.contains('ant-form-item-has-error') ?? false,
              errorText: (formItem?.querySelector('.ant-form-item-explain-error')?.textContent ?? '').trim(),
            };
          }),
        visibleErrors: Array.from(body.querySelectorAll('.ant-form-item-explain-error, [role="alert"], .ant-message-error'))
          .filter((element) => Boolean((element as HTMLElement).offsetParent))
          .map((element) => (element.textContent ?? '').trim())
          .filter(Boolean),
      }));
      const groupNameValidation = validationSnapshot.inputs.find((input) => input.ariaRequired === 'true' && input.type === 'text');
      expect(groupNameValidation, `${name}缺少组名必填字段`).toBeDefined();
      if (submitEnabled) {
        expect(
          groupNameValidation?.ariaInvalid === 'true' || groupNameValidation?.formItemHasError,
          `${name}空提交后组名字段未进入错误状态`,
        ).toBe(true);
      } else {
        await expect(submitControl, `${name}依赖未满足时提交按钮应禁用`).toBeDisabled();
      }
      expect(mutationRequests, `${name}空提交不得发送业务写请求`).toEqual([]);
      await testInfo.attach(`${name}-form-contract`, {
        body: Buffer.from(JSON.stringify({ ...snapshot, submitEnabled, validationSnapshot, mutationRequests }, null, 2)),
        contentType: 'application/json',
      });
      try {
        await testInfo.attach(`${name}-form-screenshot`, {
          body: await page.screenshot({ fullPage: true, timeout: 5_000 }),
          contentType: 'image/png',
        });
      } catch (error) {
        await testInfo.attach(`${name}-form-screenshot-diagnostic`, {
          body: Buffer.from(JSON.stringify({
            status: 'unavailable',
            reason: error instanceof Error ? error.message : String(error),
          }, null, 2)),
          contentType: 'application/json',
        });
      }
      await pageObject.cancelCurrentSurface();
    });
  }
});
