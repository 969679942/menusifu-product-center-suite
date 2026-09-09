import type { Locator, Page, Response } from '@playwright/test';
import type { LowDependencySopDefinition } from '../../sop/product-center/product-center-low-dependency-sop.catalog';
import type { LowDependencySeedRecord } from '../../test-data/product-center/sop/product-center-low-dependency-data.factory';
import { step } from '../../utils/step';
import { waitUntil } from '../../utils/wait';

type LowDependencySopCase = LowDependencySopDefinition & { action: 'edit' | 'delete' };

export class ProductCenterLowDependencySopPage {
  readonly main: Locator;

  constructor(private readonly page: Page) {
    this.main = page.locator('main:visible');
  }

  @step('打开低依赖实体页面并等待审计记录显示')
  async open(sopCase: LowDependencySopCase, record: LowDependencySeedRecord): Promise<void> {
    await this.openRoute(sopCase);
    await this.recordOwner(sopCase, record);
  }

  @step('打开低依赖实体路由并等待列表接口终态')
  async openRoute(sopCase: LowDependencySopCase): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (response) => sopCase.listResponse.test(response.url()) && response.status() === 200,
      { timeout: 60_000 },
    );
    await this.page.goto(sopCase.route, { waitUntil: 'domcontentloaded' });
    await responsePromise;
    await waitUntil(() => this.main.count(), (count) => count === 1, {
      timeout: 30_000,
      message: `${sopCase.entityName}页面 main 容器不唯一`,
    });
  }

  @step('构造低依赖审计记录定位器：{2}')
  async recordCandidate(
    sopCase: LowDependencySopCase,
    record: LowDependencySeedRecord,
    identity = record.originalIdentity,
  ): Promise<Locator> {
    return sopCase.entityKey === 'material-category'
      ? this.main.locator('tr:visible').filter({ hasText: identity })
      : this.main.locator(`[data-row-key="${record.id}"]:visible`);
  }

  @step('精确定位唯一低依赖审计记录：{2}')
  async recordOwner(
    sopCase: LowDependencySopCase,
    record: LowDependencySeedRecord,
    identity = record.originalIdentity,
  ): Promise<Locator> {
    const owner = await this.recordCandidate(sopCase, record, identity);
    await waitUntil(() => owner.count(), (count) => count === 1, {
      timeout: 60_000,
      message: `${sopCase.entityName}审计记录发生 locator drift：${identity}`,
    });
    return owner;
  }

  @step('打开低依赖审计记录唯一操作菜单')
  async openActionMenu(sopCase: LowDependencySopCase, record: LowDependencySeedRecord): Promise<void> {
    const owner = await this.recordOwner(sopCase, record);
    const trigger = owner.locator('.ant-dropdown-trigger:visible');
    await waitUntil(
      async () => ({ count: await trigger.count(), visible: await trigger.isVisible().catch(() => false), enabled: await trigger.isEnabled().catch(() => false) }),
      (state) => state.count === 1 && state.visible && state.enabled,
      { timeout: 10_000, message: `${sopCase.entityName}唯一操作按钮不可用` },
    );
    await trigger.click();
  }

  @step('选择低依赖实体唯一菜单动作：{0}')
  async chooseMenuAction(action: 'Edit' | 'Delete'): Promise<void> {
    const item = this.page.locator('.ant-dropdown:visible [role=menuitem]:visible').filter({ hasText: action });
    await waitUntil(() => item.count(), (count) => count === 1, {
      timeout: 10_000,
      message: `菜单动作 ${action} 未唯一显示`,
    });
    await item.click();
  }

  @step('进入低依赖实体唯一编辑界面')
  async enterEdit(sopCase: LowDependencySopCase, record: LowDependencySeedRecord): Promise<void> {
    if (sopCase.entityKey === 'tax') {
      const owner = await this.recordOwner(sopCase, record);
      const nameLink = owner.locator('a:visible').filter({ hasText: record.originalIdentity });
      await waitUntil(() => nameLink.count(), (count) => count === 1, {
        timeout: 10_000,
        message: '税种名称编辑链接未唯一显示',
      });
      await nameLink.click();
      return;
    }
    await this.openActionMenu(sopCase, record);
    await this.chooseMenuAction('Edit');
  }

  @step('修改低依赖实体审计名称并提交')
  async editIdentity(sopCase: LowDependencySopCase, record: LowDependencySeedRecord): Promise<Response> {
    await this.enterEdit(sopCase, record);
    const nameInput = sopCase.entityKey === 'material-category'
      ? this.page.locator('input[placeholder="Required"]:visible')
      : sopCase.entityKey === 'taste' || sopCase.entityKey === 'spec'
        ? this.page.locator(`input[aria-required="true"][value="${record.originalIdentity}"]:visible`)
        : this.page.locator(`input[value="${record.originalIdentity}"]:visible`);
    await waitUntil(() => nameInput.count(), (count) => count === 1, {
      timeout: 60_000,
      message: `${sopCase.entityName}名称输入框发生 locator drift`,
    });
    await nameInput.fill(record.editedIdentity);
    const filledAt = Date.now();
    await waitUntil(() => Date.now() - filledAt, (elapsed) => elapsed >= 200, {
      timeout: 1_000,
      interval: 25,
      message: '输入状态未完成 200ms 稳定等待',
    });
    const responsePromise = this.waitForEditResponse(sopCase, record);
    const submitName = sopCase.entityKey === 'material-category' ? 'Save' : 'Confirm';
    const submit = this.page.getByRole('button', { name: submitName, exact: true });
    await waitUntil(() => submit.count(), (count) => count === 1, {
      timeout: 10_000,
      message: `${sopCase.entityName}提交按钮 ${submitName} 未唯一显示`,
    });
    await submit.click();
    if (sopCase.entityKey === 'taste' || sopCase.entityKey === 'addon') {
      const dialog = this.page.locator('[role=dialog]:visible');
      await waitUntil(() => dialog.count(), (count) => count === 1, {
        timeout: 30_000,
        message: `${sopCase.entityName}二次确认弹窗未唯一显示`,
      });
      const confirm = dialog.locator('button.ant-btn-primary:visible');
      await waitUntil(() => confirm.count(), (count) => count === 1, {
        timeout: 10_000,
        message: `${sopCase.entityName}二次确认按钮未唯一显示`,
      });
      await confirm.click();
      if (sopCase.entityKey === 'addon') {
        const modificationDialog = this.page.locator('[role=dialog]:visible');
        const confirmModification = modificationDialog.getByRole('button', { name: 'Confirm Modification', exact: true });
        await waitUntil(
          async () => ({ dialogCount: await modificationDialog.count(), buttonCount: await confirmModification.count(), enabled: await confirmModification.isEnabled().catch(() => false) }),
          (state) => state.dialogCount === 1 && state.buttonCount === 1 && state.enabled,
          { timeout: 30_000, message: '加料组变更预览确认按钮未唯一可用' },
        );
        await confirmModification.click();
      }
    }
    return responsePromise;
  }

  @step('删除低依赖实体唯一审计记录并确认')
  async deleteIdentity(sopCase: LowDependencySopCase, record: LowDependencySeedRecord): Promise<Response> {
    await this.openActionMenu(sopCase, record);
    const responsePromise = this.waitForDeleteResponse(sopCase, record);
    await this.chooseMenuAction('Delete');
    const dialog = this.page.locator('[role=dialog]:visible');
    await waitUntil(() => dialog.count(), (count) => count === 1, {
      timeout: 30_000,
      message: `${sopCase.entityName}删除确认弹窗未唯一显示`,
    });
    const confirm = dialog.getByRole('button', { name: 'Delete', exact: true });
    await waitUntil(
      async () => ({ count: await confirm.count(), enabled: await confirm.isEnabled().catch(() => false) }),
      (state) => state.count === 1 && state.enabled,
      { timeout: 30_000, message: `${sopCase.entityName}删除确认按钮未唯一可用` },
    );
    await confirm.click();
    return responsePromise;
  }

  @step('重新打开并验证低依赖实体编辑 UI 终态')
  async verifyEditedUi(sopCase: LowDependencySopCase, record: LowDependencySeedRecord): Promise<void> {
    await this.openRoute(sopCase);
    const owner = await this.recordOwner(sopCase, record, record.editedIdentity);
    const editedDisplayIdentity = displayIdentity(sopCase.entityKey, record.editedIdentity);
    const originalDisplayIdentity = displayIdentity(sopCase.entityKey, record.originalIdentity);
    await waitUntil(
      async () => ({ edited: await owner.getByText(editedDisplayIdentity, { exact: true }).count(), original: await this.main.getByText(originalDisplayIdentity, { exact: true }).count() }),
      (state) => state.edited > 0 && state.original === 0,
      { timeout: 60_000, message: `${sopCase.entityName}编辑后 UI 终态不正确` },
    );
  }

  @step('重新打开并验证低依赖实体删除 UI 终态')
  async verifyDeletedUi(sopCase: LowDependencySopCase, record: LowDependencySeedRecord): Promise<void> {
    await this.openRoute(sopCase);
    const originalOwner = await this.recordCandidate(sopCase, record, record.originalIdentity);
    const editedOwner = await this.recordCandidate(sopCase, record, record.editedIdentity);
    await waitUntil(
      async () => ({ originalOwner: await originalOwner.count(), editedOwner: await editedOwner.count(), originalText: await this.main.getByText(record.originalIdentity, { exact: true }).count(), editedText: await this.main.getByText(record.editedIdentity, { exact: true }).count() }),
      (state) => state.originalOwner === 0 && state.editedOwner === 0 && state.originalText === 0 && state.editedText === 0,
      { timeout: 60_000, message: `${sopCase.entityName}删除后 UI 仍存在审计身份` },
    );
  }

  @step('等待低依赖实体编辑接口终态')
  async waitForEditResponse(sopCase: LowDependencySopCase, record: LowDependencySeedRecord): Promise<Response> {
    return this.page.waitForResponse((response) => response.request().method() === 'PUT' && response.ok() && mutationUrlMatches(sopCase.entityKey, record.id, response.url()), { timeout: 60_000 });
  }

  @step('等待低依赖实体删除接口终态')
  async waitForDeleteResponse(sopCase: LowDependencySopCase, record: LowDependencySeedRecord): Promise<Response> {
    return this.page.waitForResponse((response) => response.request().method() === 'DELETE' && response.ok() && mutationUrlMatches(sopCase.entityKey, record.id, response.url()), { timeout: 60_000 });
  }
}

function displayIdentity(entityKey: LowDependencySeedRecord['entityKey'], identity: string): string {
  return entityKey === 'addon' ? identity.replace(/_/g, '\\_') : identity;
}

function mutationUrlMatches(entityKey: LowDependencySeedRecord['entityKey'], id: number, url: string): boolean {
  const pathByEntity: Record<LowDependencySeedRecord['entityKey'], string> = {
    'material-category': 'brand-categories',
    taste: 'brand-modifiers',
    spec: 'brand-specs',
    addon: 'brand-addon-group',
    'print-stall': 'print-stalls',
    tax: 'tax-types',
    'description-tag': 'brand-tags',
    'statistic-tag': 'brand-tags',
  };
  return url.includes(`/${pathByEntity[entityKey]}/${id}`);
}