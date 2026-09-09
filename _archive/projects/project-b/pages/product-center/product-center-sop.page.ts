import type { Locator, Page, Response } from '@playwright/test';
import type { ProductCenterSopCase } from '../../sop/product-center/product-center-sop.types';
import type { ProductCenterSopSeedRecord } from '../../test-data/product-center/sop/product-center-sop-data.factory';
import { executeReadOnlyUiWithTransientRetry } from '../../api/transient-retry';
import { step } from '../../utils/step';
import { waitUntil } from '../../utils/wait';

export class ProductCenterSopPage {
  readonly main: Locator;

  constructor(private readonly page: Page) {
    this.main = page.locator('main:visible');
  }

  @step('打开商品中心实体页面并等待业务列表终态')
  async open(sopCase: ProductCenterSopCase, record: ProductCenterSopSeedRecord): Promise<void> {
    await this.openRoute(sopCase);
    await this.recordOwner(sopCase, record);
  }

  @step('打开商品中心路由并等待列表接口终态')
  async openRoute(sopCase: ProductCenterSopCase): Promise<void> {
    await executeReadOnlyUiWithTransientRetry(async () => {
      const responsePromise = this.page.waitForResponse(
        (response) => sopCase.listResponse.test(response.url()) && response.status() === 200,
        { timeout: 60_000 },
      );
      await this.page.goto(sopCase.route, { waitUntil: 'domcontentloaded' });
      await responsePromise;
    });
    await waitUntil(
      async () => this.main.count(),
      (count) => count === 1,
      { timeout: 30_000, message: `${sopCase.entityName}页面 main 容器不唯一` },
    );
  }

  @step((_sopCase: ProductCenterSopCase, record: ProductCenterSopSeedRecord, identity?: string) => `构造审计记录所有者定位器：${identity ?? record.originalIdentity}`)
  async recordCandidate(
    sopCase: ProductCenterSopCase,
    record: ProductCenterSopSeedRecord,
    identity = record.originalIdentity,
  ): Promise<Locator> {
    return sopCase.entityKey === 'seasoning'
      ? this.main.locator('div[class*=groupItemContainer]').filter({ hasText: identity })
      : sopCase.entityKey === 'category'
        ? this.main.locator('tr:visible').filter({ hasText: identity })
        : this.main.locator(`tr[data-row-key="${record.id}"]:visible`);
  }

  @step((_sopCase: ProductCenterSopCase, record: ProductCenterSopSeedRecord, identity?: string) => `精确定位唯一审计记录：${identity ?? record.originalIdentity}`)
  async recordOwner(
    sopCase: ProductCenterSopCase,
    record: ProductCenterSopSeedRecord,
    identity = record.originalIdentity,
  ): Promise<Locator> {
    const owner = await this.recordCandidate(sopCase, record, identity);
    await waitUntil(
      async () => owner.count(),
      (count) => count === 1,
      { timeout: 60_000, message: `${sopCase.entityName}审计记录发生 locator drift：${identity}` },
    );
    return owner;
  }

  @step('重新打开页面并验证编辑后的 UI 终态')
  async verifyEditedUi(sopCase: ProductCenterSopCase, record: ProductCenterSopSeedRecord): Promise<void> {
    await this.openRoute(sopCase);
    const owner = await this.recordOwner(sopCase, record, record.editedIdentity);
    await waitUntil(
      async () => ({
        edited: await owner.getByText(record.editedIdentity, { exact: true }).count(),
        original: await this.main.getByText(record.originalIdentity, { exact: true }).count(),
      }),
      (state) => state.edited > 0 && state.original === 0,
      { timeout: 60_000, message: `${sopCase.entityName}编辑后 UI 终态不正确` },
    );
  }

  @step('重新打开页面并验证删除后的 UI 终态')
  async verifyDeletedUi(sopCase: ProductCenterSopCase, record: ProductCenterSopSeedRecord): Promise<void> {
    await this.openRoute(sopCase);
    const originalOwner = await this.recordCandidate(sopCase, record, record.originalIdentity);
    const editedOwner = await this.recordCandidate(sopCase, record, record.editedIdentity);
    await waitUntil(
      async () => ({
        originalOwner: await originalOwner.count(),
        editedOwner: await editedOwner.count(),
        originalText: await this.main.getByText(record.originalIdentity, { exact: true }).count(),
        editedText: await this.main.getByText(record.editedIdentity, { exact: true }).count(),
      }),
      (state) =>
        state.originalOwner === 0 &&
        state.editedOwner === 0 &&
        state.originalText === 0 &&
        state.editedText === 0,
      { timeout: 60_000, message: `${sopCase.entityName}删除后 UI 仍存在审计身份` },
    );
  }
  @step('打开唯一审计记录操作菜单')
  async openActionMenu(sopCase: ProductCenterSopCase, record: ProductCenterSopSeedRecord): Promise<void> {
    const owner = await this.recordOwner(sopCase, record);
    const trigger = sopCase.entityKey === 'seasoning'
      ? owner
          .locator(':scope > div[class*=header]')
          .filter({ hasText: record.originalIdentity })
          .locator('.ant-dropdown-trigger:visible')
      : owner.locator('.ant-dropdown-trigger:visible');
    await waitUntil(
      async () => ({ count: await trigger.count(), visible: await trigger.isVisible().catch(() => false), enabled: await trigger.isEnabled().catch(() => false) }),
      (state) => state.count === 1 && state.visible && state.enabled,
      { timeout: 10_000, message: `${sopCase.entityName}唯一操作按钮不可用` },
    );
    await trigger.click();
  }

  @step((action: 'Edit' | 'Delete') => action === 'Edit' ? '选择编辑菜单动作' : '选择删除菜单动作')
  async chooseMenuAction(action: 'Edit' | 'Delete'): Promise<void> {
    const actionText = action === 'Edit' ? /^(Edit|编辑)$/ : /^(Delete|删除)$/;
    const item = this.page
      .locator('.ant-dropdown:visible [role=menuitem]:visible')
      .filter({ hasText: actionText });
    await waitUntil(
      async () => item.count(),
      (count) => count === 1,
      { timeout: 10_000, message: `菜单动作 ${action} 未唯一显示` },
    );
    await item.click();
  }

  @step('进入唯一审计记录编辑页面')
  async enterEdit(sopCase: ProductCenterSopCase, record: ProductCenterSopSeedRecord): Promise<void> {
    const owner = await this.recordOwner(sopCase, record);
    if (sopCase.entityKey === 'material') {
      const nameLink = owner.locator('a').filter({ hasText: record.originalIdentity });
      await waitUntil(
        async () => nameLink.count(),
        (count) => count === 1,
        { timeout: 10_000, message: '原料名称编辑链接未唯一显示' },
      );
      await nameLink.click();
      return;
    }
    await this.openActionMenu(sopCase, record);
    await this.chooseMenuAction('Edit');
    if (sopCase.entityKey === 'seasoning') {
      await waitUntil(
        () => this.page.url(),
        (url) => /\/pp\/brand\/seasoning\/edit(?:\?|$)/.test(url),
        { timeout: 30_000, interval: 100, message: '调味编辑菜单点击后未进入编辑路由' },
      );
    }
  }

  @step('修改审计名称并提交保存')
  async editIdentity(sopCase: ProductCenterSopCase, record: ProductCenterSopSeedRecord): Promise<Response> {
    await this.enterEdit(sopCase, record);
    const nameInput = this.page.locator(`input[value="${record.originalIdentity}"]:visible`);
    await waitUntil(
      async () => nameInput.count(),
      (count) => count === 1,
      { timeout: 60_000, message: `${sopCase.entityName}名称输入框发生 locator drift` },
    );
    await nameInput.fill(record.editedIdentity);
    const filledAt = Date.now();
    await waitUntil(
      () => Date.now() - filledAt,
      (elapsed) => elapsed >= 200,
      { timeout: 1_000, interval: 25, message: '输入状态未完成 200ms 稳定等待' },
    );

    const responsePromise = this.waitForEditResponse(sopCase, record);
    const submitName = sopCase.entityKey === 'category' || sopCase.entityKey === 'bom'
      ? /^(Save|保\s*存)$/
      : /^(Confirm|确\s*定)$/;
    const submit = this.page.getByRole('button', { name: submitName, exact: true });
    await waitUntil(
      async () => submit.count(),
      (count) => count === 1,
      { timeout: 10_000, message: `${sopCase.entityName}双语提交按钮未唯一显示` },
    );
    await submit.click();

    if (sopCase.entityKey === 'method') {
      const confirmDialog = this.page.locator('[role=dialog]:visible');
      await waitUntil(
        async () => confirmDialog.count(),
        (count) => count === 1,
        { timeout: 30_000, message: '做法组二次确认弹窗未唯一显示' },
      );
      const confirmButton = confirmDialog.locator('button.ant-btn-primary:visible');
      await waitUntil(
        async () => confirmButton.count(),
        (count) => count === 1,
        { timeout: 10_000, message: '做法组二次确认按钮未唯一显示' },
      );
      await confirmButton.click();
    }

    return responsePromise;
  }

  @step('删除唯一审计记录并完成确认')
  async deleteIdentity(sopCase: ProductCenterSopCase, record: ProductCenterSopSeedRecord): Promise<Response> {
    await this.openActionMenu(sopCase, record);
    const responsePromise = this.waitForDeleteResponse(sopCase, record);
    await this.chooseMenuAction('Delete');
    const confirmDialog = this.page.locator('[role=dialog]:visible');
    await waitUntil(
      async () => confirmDialog.count(),
      (count) => count === 1,
      { timeout: 30_000, message: `${sopCase.entityName}删除确认弹窗未唯一显示` },
    );
    const confirmButton = confirmDialog.locator('button.ant-btn-primary:visible');
    await waitUntil(
      async () => confirmButton.count(),
      (count) => count === 1,
      { timeout: 10_000, message: `${sopCase.entityName}删除确认按钮未唯一显示` },
    );
    await confirmButton.click();
    return responsePromise;
  }

  @step((_sopCase: ProductCenterSopCase, record: ProductCenterSopSeedRecord) =>
    `打开调味组“${record.originalIdentity}”删除确认并取消`)
  async cancelDeleteIdentity(sopCase: ProductCenterSopCase, record: ProductCenterSopSeedRecord): Promise<{ confirmText: string; route: string }> {
    await this.openActionMenu(sopCase, record);
    await this.chooseMenuAction('Delete');
    const confirmDialog = this.page.locator('[role=dialog]:visible');
    await waitUntil(
      async () => confirmDialog.count(),
      (count) => count === 1,
      { timeout: 30_000, message: `${sopCase.entityName}删除确认弹窗未唯一显示` },
    );
    const confirmText = await confirmDialog.innerText();
    const cancelButton = confirmDialog.getByRole('button', { name: /^取\s*消$/ });
    await waitUntil(
      async () => cancelButton.count(),
      (count) => count === 1,
      { timeout: 10_000, message: `${sopCase.entityName}删除取消按钮未唯一显示` },
    );
    await cancelButton.click();
    await confirmDialog.waitFor({ state: 'hidden' });
    return { confirmText, route: new URL(this.page.url()).pathname };
  }

  @step('等待编辑接口终态')
  async waitForEditResponse(sopCase: ProductCenterSopCase, record: ProductCenterSopSeedRecord): Promise<Response> {
    return this.page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.status() >= 200 &&
        response.status() < 300 &&
        editResponseMatches(sopCase.entityKey, record, response.url()),
      { timeout: 60_000 },
    );
  }

  @step('等待删除接口终态')
  async waitForDeleteResponse(sopCase: ProductCenterSopCase, record: ProductCenterSopSeedRecord): Promise<Response> {
    return this.page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        response.status() >= 200 &&
        response.status() < 300 &&
        deleteResponseMatches(sopCase.entityKey, record, response.url()),
      { timeout: 60_000 },
    );
  }
}

function editResponseMatches(
  entityKey: ProductCenterSopCase['entityKey'],
  record: ProductCenterSopSeedRecord,
  url: string,
): boolean {
  if (entityKey === 'category') return url.includes(`/brand-categories/${record.id}`);
  if (entityKey === 'method') return url.endsWith(`/brand-modifiers/${record.id}`);
  if (entityKey === 'material') return url.includes(`/brand-ingredients/${record.id}`);
  if (entityKey === 'seasoning') return url.includes(`/global-modifier/${record.id}`);
  return url.includes('/bom/item/batch');
}

function deleteResponseMatches(
  entityKey: ProductCenterSopCase['entityKey'],
  record: ProductCenterSopSeedRecord,
  url: string,
): boolean {
  if (entityKey === 'category') return url.includes(`/brand-categories/${record.id}`);
  if (entityKey === 'method') return url.includes(`/brand-modifiers/${record.id}`);
  if (entityKey === 'material') return url.includes(`/brand-ingredients/${record.id}`);
  if (entityKey === 'seasoning') return url.includes(`/global-modifier/${record.id}`);
  return url.includes(`/bom/${record.id}`);
}



