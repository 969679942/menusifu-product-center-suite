import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../fixtures/product-center.fixture';
import { SidebarPage } from '../../pages/sidebar.page';

const auditOutputRoot = path.resolve(__dirname, '../../output/audit');

test.describe('新版套餐组三类型只读审计', () => {
  test('固定搭配、可选搭配和随心配新增页合同', async ({ page, productCenterApi }, testInfo) => {
    fs.mkdirSync(auditOutputRoot, { recursive: true });
    const mutationRequests: Array<{ method: string; pathname: string }> = [];
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) return;
      if (!/\/ops-brand\/brand-sections(?:\/|$)/.test(pathname)) return;
      mutationRequests.push({ method: request.method(), pathname });
    });

    const comboList = await productCenterApi.comboGroupList();
    const existingGroups = collectComboGroups(comboList).map((record) => ({
      id: record.id ?? record.sectionId ?? null,
      name: String(record.name ?? record.sectionName ?? ''),
      sectionType: record.sectionType ?? record.type ?? null,
      selectionRule: sanitizeRule(record.selectionRule),
      pricingRule: sanitizeRule(record.pricingRule),
      itemCount: Array.isArray(record.sectionItemList)
        ? record.sectionItemList.length
        : Array.isArray(record.items)
          ? record.items.length
          : null,
    }));

    await page.goto('/pp/brand/combo/create', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/pp\/brand\/combo\/create$/);
    const main = page.locator('main:visible');
    await expect(main.getByText(/套餐组类型|Combo Group Type/i).first()).toBeVisible();

    const definitions = [
      { key: 'fixed', name: '固定搭配', label: /固定搭配|Fixed Combo/i },
      { key: 'optional', name: '可选搭配', label: /可选搭配|Optional Combo/i },
      { key: 'custom', name: '随心配', label: /随心配|Pick & Mix|Custom Combo|Free Combo/i },
    ] as const;
    const types: Array<Record<string, unknown>> = [];

    for (const definition of definitions) {
      const radioLabel = main.locator('label:visible').filter({ hasText: definition.label });
      await expect(radioLabel, `${definition.name}类型入口缺失`).toHaveCount(1);
      await radioLabel.click();
      const radio = radioLabel.locator('input[type="radio"]');
      await expect(radio, `${definition.name}类型未选中`).toBeChecked();

      const surface = await main.evaluate(snapshotSurface);
      const addButton = main.getByRole('button', { name: /^(添加|Add)$/i });
      const addButtonCount = await addButton.count();
      let selectionOverlay: Record<string, unknown> | null = null;
      if (addButtonCount === 1 && await addButton.isEnabled()) {
        await addButton.click();
        const overlay = page.locator('[role="dialog"]:visible, .ant-drawer:visible').last();
        await expect(overlay, `${definition.name}商品选择弹层未打开`).toBeVisible();
        selectionOverlay = await overlay.evaluate(snapshotSurface);
        const cancel = overlay.getByRole('button', { name: /^(取消|Cancel)$/i });
        if (await cancel.count() === 1) {
          await cancel.click();
        } else {
          const close = overlay.getByRole('button', { name: /^close$/i });
          await expect(close, `${definition.name}商品选择弹层缺少关闭控件`).toHaveCount(1);
          await close.click();
        }
        await expect(overlay).toBeHidden();
      }

      const screenshotPath = path.join(auditOutputRoot, `product-center-group-combo-v2-${definition.key}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      types.push({
        key: definition.key,
        name: definition.name,
        surface,
        addButtonCount,
        selectionOverlay,
        screenshotPath: path.relative(path.resolve(__dirname, '../..'), screenshotPath).replaceAll(path.sep, '/'),
      });
    }

    expect(mutationRequests, '只读审计不得发送业务写请求').toEqual([]);
    const artifact = {
      schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      route: '/pp/brand/combo/create',
      typeCount: types.length,
      types,
      existingData: {
        total: existingGroups.length,
        bySectionType: existingGroups.reduce<Record<string, number>>((summary, record) => {
          const key = String(record.sectionType ?? 'unknown');
          summary[key] = (summary[key] ?? 0) + 1;
          return summary;
        }, {}),
        sample: existingGroups.slice(0, 30),
      },
      mutationRequests,
    };
    const artifactPath = path.join(auditOutputRoot, 'product-center-group-combo-v2-audit.json');
    fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    await testInfo.attach('新版套餐组三类型审计', {
      body: Buffer.from(JSON.stringify(artifact, null, 2)),
      contentType: 'application/json',
    });
  });

  test('套餐组列表与现有类型行操作合同', async ({ page, productCenterApi }, testInfo) => {
    fs.mkdirSync(auditOutputRoot, { recursive: true });
    const mutationRequests: Array<{ method: string; pathname: string }> = [];
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) return;
      if (!/\/ops-brand\/brand-sections(?:\/|$)/.test(pathname)) return;
      mutationRequests.push({ method: request.method(), pathname });
    });

    const groups = collectComboGroups(await productCenterApi.comboGroupList());
    await page.goto('/pp/brand/combo', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/pp\/brand\/combo$/);
    const main = page.locator('main:visible');
    await expect(main.locator('tbody tr:visible').first()).toBeVisible();

    const listSurface = await main.evaluate(snapshotSurface);
    const links = await main.locator('a:visible').evaluateAll((elements) => elements.map((element) => ({
      text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
      href: (element as HTMLAnchorElement).href,
    })));
    const sampledRows: Array<Record<string, unknown>> = [];
    for (const sectionType of [1, 2]) {
      const record = groups.find((candidate) => Number(candidate.sectionType ?? candidate.type) === sectionType);
      const identity = String(record?.name ?? record?.sectionName ?? '');
      if (!identity) continue;
      const row = main.locator('tbody tr:visible').filter({ hasText: identity }).first();
      await expect(row, `类型 ${sectionType} 的套餐组行缺失`).toBeVisible();
      const rowContract = await row.evaluate((element) => ({
        text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
        html: element.outerHTML,
      }));
      const triggers = row.locator('button:visible, [role="button"]:visible, .ant-dropdown-trigger:visible, a:visible');
      const triggerContract = await triggers.evaluateAll((elements) => elements.map((element) => ({
        tag: element.tagName,
        text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
        role: element.getAttribute('role'),
        title: element.getAttribute('title'),
        ariaLabel: element.getAttribute('aria-label'),
        href: (element as HTMLAnchorElement).href || null,
      })));
      let menuText = '';
      if (await triggers.count()) {
        await triggers.last().click();
        const menu = page.locator('[role="menu"]:visible').last();
        if (await menu.count()) {
          menuText = (await menu.innerText()).replace(/\s+/g, ' ').trim();
          await page.keyboard.press('Escape');
        }
      }
      sampledRows.push({ sectionType, identity, rowContract, triggerContract, menuText });
    }

    expect(mutationRequests, '只读审计不得发送业务写请求').toEqual([]);
    const artifact = {
      schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      route: '/pp/brand/combo',
      listSurface,
      links,
      sampledRows,
      mutationRequests,
    };
    const artifactPath = path.join(auditOutputRoot, 'product-center-group-combo-v2-list-audit.json');
    fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    await page.screenshot({
      path: path.join(auditOutputRoot, 'product-center-group-combo-v2-list.png'),
      fullPage: true,
    });
    await testInfo.attach('新版套餐组列表审计', {
      body: Buffer.from(JSON.stringify(artifact, null, 2)),
      contentType: 'application/json',
    });
  });

  test('固定搭配与可选搭配名称入口详情合同', async ({ page, productCenterApi }, testInfo) => {
    fs.mkdirSync(auditOutputRoot, { recursive: true });
    const mutationRequests: Array<{ method: string; pathname: string }> = [];
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) return;
      if (!/\/ops-brand\/brand-sections(?:\/|$)/.test(pathname)) return;
      mutationRequests.push({ method: request.method(), pathname });
    });

    const groups = collectComboGroups(await productCenterApi.comboGroupList());
    const details: Array<Record<string, unknown>> = [];
    for (const sectionType of [1, 2]) {
      const record = groups.find((candidate) => Number(candidate.sectionType ?? candidate.type) === sectionType);
      const identity = String(record?.name ?? record?.sectionName ?? '');
      if (!identity) continue;
      await page.goto('/pp/brand/combo', { waitUntil: 'domcontentloaded' });
      const row = page.locator('main:visible tbody tr:visible').filter({ hasText: identity }).first();
      await expect(row, `类型 ${sectionType} 的套餐组行缺失`).toBeVisible();
      await row.locator('a:visible').first().click();
      await expect(page).toHaveURL(/\/pp\/brand\/combo\/(?:create|\d+)/);
      const main = page.locator('main:visible');
      await expect(main.getByText(/套餐组类型|Combo Group Type/i).first()).toBeVisible();
      await expect(main.locator('input[type="text"]:visible').first()).toHaveValue(identity);
      await expect(main.locator(`input[type="radio"][value="${sectionType}"]`)).toBeChecked();
      const surface = await main.evaluate(snapshotSurface);
      const screenshotPath = path.join(auditOutputRoot, `product-center-group-combo-v2-detail-${sectionType}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      details.push({
        sectionType,
        identity,
        url: page.url(),
        surface,
        screenshotPath: path.relative(path.resolve(__dirname, '../..'), screenshotPath).replaceAll(path.sep, '/'),
      });
    }

    expect(mutationRequests, '只读审计不得发送业务写请求').toEqual([]);
    const artifact = {
      schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      details,
      mutationRequests,
    };
    const artifactPath = path.join(auditOutputRoot, 'product-center-group-combo-v2-detail-audit.json');
    fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    await testInfo.attach('新版套餐组详情审计', {
      body: Buffer.from(JSON.stringify(artifact, null, 2)),
      contentType: 'application/json',
    });
  });

  test('可选搭配与随心配规则开关状态矩阵', async ({ page }, testInfo) => {
    fs.mkdirSync(auditOutputRoot, { recursive: true });
    const mutationRequests: Array<{ method: string; pathname: string }> = [];
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) return;
      if (!/\/ops-brand\/brand-sections(?:\/|$)/.test(pathname)) return;
      mutationRequests.push({ method: request.method(), pathname });
    });

    await page.goto('/pp/brand/combo/create', { waitUntil: 'domcontentloaded' });
    const main = page.locator('main:visible');
    await expect(main.getByText(/套餐组类型|Combo Group Type/i).first()).toBeVisible();
    const states: Array<Record<string, unknown>> = [];

    const optional = main.locator('label:visible').filter({ hasText: /可选搭配|Optional Combo/i });
    await optional.click();
    await expect(optional.locator('input[type="radio"]')).toBeChecked();
    states.push({ key: 'optional-default', surface: await main.evaluate(snapshotSurface) });
    const optionalSwitches = main.locator('[role="switch"]:visible, button.ant-switch:visible');
    await expect(optionalSwitches).toHaveCount(2);
    await optionalSwitches.nth(0).click();
    states.push({ key: 'optional-repeat-on', surface: await main.evaluate(snapshotSurface) });
    await optionalSwitches.nth(1).click();
    states.push({ key: 'optional-repeat-and-merge-on', surface: await main.evaluate(snapshotSurface) });

    const custom = main.locator('label:visible').filter({ hasText: /随心配|Pick & Mix|Custom Combo|Free Combo/i });
    await custom.click();
    await expect(custom.locator('input[type="radio"]')).toBeChecked();
    const customSwitches = main.locator('[role="switch"]:visible, button.ant-switch:visible');
    await expect(customSwitches).toHaveCount(1);
    if (await customSwitches.first().getAttribute('aria-checked') === 'true') {
      await customSwitches.first().click();
    }
    await expect(customSwitches.first()).toHaveAttribute('aria-checked', 'false');
    states.push({ key: 'custom-repeat-off', surface: await main.evaluate(snapshotSurface) });
    await customSwitches.first().click();
    await expect(customSwitches.first()).toHaveAttribute('aria-checked', 'true');
    states.push({ key: 'custom-repeat-on', surface: await main.evaluate(snapshotSurface) });

    expect(mutationRequests, '只读审计不得发送业务写请求').toEqual([]);
    const artifact = {
      schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      states,
      mutationRequests,
    };
    const artifactPath = path.join(auditOutputRoot, 'product-center-group-combo-v2-rule-state-audit.json');
    fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    await testInfo.attach('新版套餐组规则状态矩阵', {
      body: Buffer.from(JSON.stringify(artifact, null, 2)),
      contentType: 'application/json',
    });
  });

  test('三类型无商品提交拒绝反馈', async ({ page, productCenterApi }, testInfo) => {
    test.setTimeout(120_000);
    fs.mkdirSync(auditOutputRoot, { recursive: true });
    const sidebar = new SidebarPage(page);
    await sidebar.openLanguageMenu();
    await sidebar.selectChineseLanguage();
    await sidebar.expectChineseAutomationLocale();
    const definitions = [
      { key: 'fixed', sectionType: 1, label: /固定搭配|Fixed Combo/i },
      { key: 'optional', sectionType: 2, label: /可选搭配|Optional Combo/i },
      { key: 'custom', sectionType: 5, label: /随心配|Pick & Mix|Custom Combo|Free Combo/i },
    ] as const;
    const results: Array<Record<string, unknown>> = [];

    for (const definition of definitions) {
      const identity = `AUTO_AUDIT_COMBO_EMPTY_${definition.key.toUpperCase()}_${Date.now()}`;
      await page.goto('/pp/brand/combo/create', { waitUntil: 'domcontentloaded' });
      const main = page.locator('main:visible');
      const radioLabel = main.locator('label:visible').filter({ hasText: definition.label });
      await radioLabel.click();
      await expect(radioLabel.locator('input[type="radio"]')).toBeChecked();
      const name = main.locator('input[aria-required="true"][type="text"]:visible').first();
      await name.fill(identity);
      const submit = page.getByRole('button', { name: /^(确\s*定|Confirm)$/i }).last();
      await expect(submit).toBeEnabled();

      let responseStatus: number | null = null;
      let responseBody: unknown = null;
      const responsePromise = page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && /\/ops-brand\/brand-sections$/.test(new URL(response.url()).pathname)
      ), { timeout: 8_000 }).then(async (response) => {
        responseStatus = response.status();
        responseBody = await response.json().catch(() => null);
      }).catch(() => undefined);
      const errors = page.locator(
        '.ant-form-item-explain-error:visible, .ant-message-error:visible, .ant-notification-notice-error:visible, [role="alert"]:visible',
      );
      const errorPromise = errors.first().waitFor({ state: 'visible', timeout: 8_000 }).catch(() => undefined);
      await submit.click();
      await Promise.race([responsePromise, errorPromise]);
      const errorText = (await errors.allTextContents()).map((value) => value.trim()).filter(Boolean).join(' | ');
      const records = collectComboGroups(await productCenterApi.comboGroupList()).filter((record) => (
        String(record.name ?? record.sectionName ?? '') === identity
      ));
      for (const record of records) {
        const id = Number(record.id ?? record.sectionId);
        if (id > 0) await productCenterApi.deleteComboGroup(id);
      }
      results.push({
        key: definition.key,
        sectionType: definition.sectionType,
        identity,
        submitDisabledBeforeClick: await submit.isDisabled(),
        errorText,
        responseStatus,
        responseBody,
        persistedCount: records.length,
        pathname: new URL(page.url()).pathname,
      });
    }

    const artifact = {
      schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      locale: 'zh-CN',
      results,
    };
    const artifactPath = path.join(auditOutputRoot, 'product-center-group-combo-v2-empty-submit-audit.json');
    fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    await testInfo.attach('新版套餐组三类型无商品拒绝反馈', {
      body: Buffer.from(JSON.stringify(artifact, null, 2)),
      contentType: 'application/json',
    });
  });
});

function snapshotSurface(element: Element): Record<string, unknown> {
  const isVisible = (candidate: Element): boolean => Boolean((candidate as HTMLElement).offsetParent);
  return {
    text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
    radios: Array.from(element.querySelectorAll('label'))
      .filter(isVisible)
      .filter((label) => label.querySelector('input[type="radio"]'))
      .map((label) => ({
        text: (label.textContent ?? '').replace(/\s+/g, ' ').trim(),
        checked: (label.querySelector('input[type="radio"]') as HTMLInputElement | null)?.checked ?? false,
        disabled: (label.querySelector('input[type="radio"]') as HTMLInputElement | null)?.disabled ?? false,
      })),
    inputs: Array.from(element.querySelectorAll('input, textarea'))
      .filter(isVisible)
      .map((input) => ({
        tag: input.tagName.toLowerCase(),
        type: input.getAttribute('type'),
        placeholder: input.getAttribute('placeholder'),
        ariaRequired: input.getAttribute('aria-required'),
        disabled: (input as HTMLInputElement).disabled,
        value: (input as HTMLInputElement).value,
        context: (input.closest('.ant-form-item, tr, section, .ant-card')?.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 240),
      })),
    buttons: Array.from(element.querySelectorAll('button'))
      .filter(isVisible)
      .map((button) => ({
        text: (button.textContent ?? '').replace(/\s+/g, ' ').trim(),
        ariaLabel: button.getAttribute('aria-label'),
        disabled: (button as HTMLButtonElement).disabled,
      })),
    tableHeaders: Array.from(element.querySelectorAll('th'))
      .filter(isVisible)
      .map((header) => (header.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean),
    switches: Array.from(element.querySelectorAll('[role="switch"], button.ant-switch'))
      .filter(isVisible)
      .map((toggle) => ({
        checked: toggle.getAttribute('aria-checked'),
        disabled: (toggle as HTMLButtonElement).disabled,
        context: (toggle.closest('tr, .ant-form-item, section, .ant-card')?.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 240),
      })),
  };
}

function collectComboGroups(value: unknown): Array<Record<string, any>> {
  const records: Array<Record<string, any>> = [];
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    if (!current || typeof current !== 'object') return;
    const record = current as Record<string, any>;
    if ((record.sectionType !== undefined || record.type !== undefined)
      && (record.name !== undefined || record.sectionName !== undefined)) {
      records.push(record);
      return;
    }
    for (const nested of Object.values(record)) visit(nested);
  };
  visit(value);
  return records;
}

function sanitizeRule(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value ?? null;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(record).filter(([, nested]) => (
    nested === null || ['string', 'number', 'boolean'].includes(typeof nested)
  )));
}





