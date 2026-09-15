import { expect, test, type Page, type Request, type Response } from '@playwright/test';
import type { AddonItem216Context } from '../../../test-data/product-center/item-216/addon-item-216.factory';
import type { ItemCreateSidePage } from '../../../pages/product-management/item/item-create-side.page';
import { ItemCreateAcceptancePage } from '../../../pages/product-management/item/item-create-acceptance.page';
import { ItemListCreationEvidencePage } from '../../../pages/product-management/item/item-list-creation-evidence.page';
import { createItemListPage } from '../../../pages/product-management/item/item-list.page';
import { createProductCenterSidebarNavigationPage } from '../../../pages/product-center/product-center-sidebar-navigation.page';
import { step } from '../../../utils/step';
import { waitUntil } from '../../../utils/wait';
import { matchesBusinessFeedbackMessage } from '../../../utils/business-feedback-contract';
import type { RuntimeAssertionReceipt } from '../../../automation/system-test/system-test-runtime-contract';
import submitFeedback from '../../../contracts/product-center/feedback/item-create-submitted.json';

type Ports = {
  save: (form: ItemCreateSidePage, context: AddonItem216Context) => Promise<Record<string, unknown>>;
  count: (identity: string) => Promise<number>;
  registerUnexpected: (context: AddonItem216Context, responseBody: unknown) => Promise<void>;
};

export class AddonCreationAcceptanceFlow {
  constructor(private readonly page: Page, private readonly form: ItemCreateAcceptancePage,
    private readonly firstRows: ItemListCreationEvidencePage) {}

  @step('执行加料创建与名称必填正式验收')
  async execute(context: AddonItem216Context, ports: Ports): Promise<Record<string, unknown>> {
    if (!['TC-ITEM-ADD-005', 'TC-ITEM-ADD-006', 'TC-ITEM-ADD-007'].includes(context.caseId)) throw Error('ADDON_CREATION_CASE_UNSUPPORTED');
    await createProductCenterSidebarNavigationPage(this.page).openFromSidebar('/pp/brand/list');
    const list = createItemListPage(this.page);
    await list.expectLoaded();
    const types = await list.enterCreateTypePage();
    await types.enterSideCreate();
    return context.caseId === 'TC-ITEM-ADD-006' ? this.verifyRequiredName(this.form, context, ports) : this.createAndVerify(this.form, context, ports);
  }

  @step('填写加料必填信息并验证创建结果')
  private async createAndVerify(form: ItemCreateAcceptancePage, context: AddonItem216Context, ports: Ports): Promise<Record<string, unknown>> {
    const price = context.caseId === 'TC-ITEM-ADD-005' ? '5.00' : '10.00';
    await form.fillItemName(context.originalIdentity);
    await form.fillStandardPrice(price);
    const categorySelection = await form.readCategorySelection();
    expect(categorySelection, '本用例只填写必填信息，分类应为空').toBe('');
    const success = form.readSaveSuccessText().catch(() => '');
    const saved = await ports.save(form, context); // Registers the server ID before any business assertion below.
    const successText = await success;
    const list = createItemListPage(this.page);
    await list.expectLoaded();
    const assertions: RuntimeAssertionReceipt[] = [];
    if (context.caseId === 'TC-ITEM-ADD-005') {
      const first = await this.firstRows.readFirstRowIdentity(context.originalIdentity);
      const actual = { identityCount: first.firstRowIdentityCount, type: await list.readItemTypeText(context.originalIdentity),
        price: Number((await list.readItemPriceText(context.originalIdentity)).replace(/[^0-9.-]/g, '')),
        status: await list.readItemStatusText(context.originalIdentity) };
      assertions.push(this.assertEqual(context.caseId, 2, actual, { identityCount: 1, type: 'Add-On', price: 5, status: 'Enabled' }));
      assertions.push(this.assertEqual(context.caseId, 3, { firstRowIdentityCount: first.firstRowIdentityCount, search: first.search, currentPage: first.currentPage },
        { firstRowIdentityCount: 1, search: '', currentPage: 1 }));
    } else {
      await list.fillSearch(context.originalIdentity);
      await list.expectUniqueItemVisible(context.originalIdentity);
      assertions.push(this.assertEqual(context.caseId, 2, { identityCount: await list.readVisibleIdentityCount(context.originalIdentity),
        category: await list.readItemCategoryText(context.originalIdentity) }, { identityCount: 1, category: '' }));
    }
    await test.info().attach('创建成功提示实际观察', { body: JSON.stringify({ caseId: context.caseId, successText, saved }), contentType: 'application/json' });
    expect(matchesBusinessFeedbackMessage(successText, submitFeedback), `${context.caseId}:expectation-1 未登记的成功提示：${successText}`).toBe(true);
    assertions.unshift({ claimId: `${context.caseId}:expectation-1`, status: 'verified', expectedValue: submitFeedback.allowedMessages,
      actualValue: successText, actualStatus: 'observed', observationChannel: 'ui', authority: 'user-visible', comparison: 'matched' });
    return { saved, successText, assertionReceipts: assertions };
  }

  @step('验证商品名称缺失时拦截保存及字段必填反馈')
  private async verifyRequiredName(form: ItemCreateAcceptancePage, context: AddonItem216Context, ports: Ports): Promise<Record<string, unknown>> {
    await form.fillItemName('');
    await form.fillStandardPrice('5.00');
    const beforeApiCount = await ports.count(context.originalIdentity);
    const writes = new Map<Request, { response?: Response; failed?: boolean }>();
    const requestListener = (request: Request) => {
      const route = new URL(request.url()).pathname;
      if (request.method() === 'POST' && route.includes('/ops-brand/brand-items/') && !route.endsWith('/pageQuery')) writes.set(request, {});
    };
    const responseListener = (response: Response) => { const write = writes.get(response.request()); if (write) write.response = response; };
    const failedListener = (request: Request) => { const write = writes.get(request); if (write) write.failed = true; };
    this.page.on('request', requestListener);
    this.page.on('response', responseListener);
    this.page.on('requestfailed', failedListener);
    try {
      await form.clickSave();
      const feedback = await waitUntil(() => form.readNameRequiredFeedback(), state => state.invalid || state.errors.length > 0 || writes.size > 0,
        { timeout: 8_000, interval: 100, message: '商品名称缺失后未观察到该字段的校验终态' });
      let settlementError: unknown;
      await waitUntil(() => [...writes.values()].every(write => write.response || write.failed), Boolean,
        { timeout: 8_000, interval: 100, message: '名称校验期间存在未完成写请求，不能确认保存被拦截' }).catch(error => { settlementError = error; });
      let serverAccepted = false;
      let unreadableResponses = 0;
      for (const { response } of writes.values()) {
        if (!response) continue;
        const body = await response.json().catch(() => null);
        if (body === null) unreadableResponses++;
        if (response.ok() && body?.success !== false) {
          serverAccepted = true;
          await ports.registerUnexpected(context, body);
        }
      }
      const network = { attempted: writes.size, responses: [...writes.values()].filter(write => write.response).length,
        failed: [...writes.values()].filter(write => write.failed).length,
        pending: [...writes.values()].filter(write => !write.response && !write.failed).length, unreadableResponses };
      await test.info().attach('名称必填写请求终态观察', { body: JSON.stringify(network), contentType: 'application/json' });
      if (settlementError) throw settlementError;
      if (network.failed || network.pending || unreadableResponses) throw Error('ADDON_NAME_WRITE_EVIDENCE_INCOMPLETE');
      const afterApiCount = await ports.count(context.originalIdentity);
      await form.expectStillOnCreatePage();
      const blocked = { route: new URL(this.page.url()).pathname, successCount: await form.readSuccessMessageCount(),
        serverAccepted, beforeApiCount, afterApiCount };
      const assertions = [this.assertEqual(context.caseId, 1, blocked,
        { route: '/pp/brand/create/side', successCount: 0, serverAccepted: false, beforeApiCount: 0, afterApiCount: 0 })];
      expect(feedback.value, '商品名称必须保持为空').toBe('');
      expect(feedback.invalid || feedback.errors.length > 0, `${context.caseId}:expectation-2`).toBe(true);
      assertions.push({ claimId: `${context.caseId}:expectation-2`, status: 'verified',
        expectedValue: '名称字段高亮或显示必填提示', actualValue: feedback, actualStatus: 'observed',
        observationChannel: 'ui', authority: 'user-visible', comparison: 'matched' });
      return { blocked, feedback, network, assertionReceipts: assertions };
    } finally {
      this.page.off('request', requestListener);
      this.page.off('response', responseListener);
      this.page.off('requestfailed', failedListener);
    }
  }

  private assertEqual(caseId: string, number: number, actualValue: unknown, expectedValue: unknown): RuntimeAssertionReceipt {
    expect(actualValue, `${caseId}:expectation-${number}`).toEqual(expectedValue);
    return { claimId: `${caseId}:expectation-${number}`, status: 'verified', expectedValue, actualValue,
      actualStatus: 'observed', observationChannel: 'ui', authority: 'user-visible', comparison: 'matched' };
  }
}
