import type { Page } from '@playwright/test';
import { ItemCreateComboPage } from '../../pages/product-management/item/item-create-combo.page';
import { ItemCreateStandardPage } from '../../pages/product-management/item/item-create-standard.page';
import { ItemListPage } from '../../pages/product-management/item/item-list.page';
import { step } from '../../utils/step';

export type ProductCenterSecondLanguageSearchEvidence = Awaited<
  ReturnType<ItemListPage['searchAndReadSecondLanguageEvidence']>
>;

export type ProductCenterOptionalComboDialogEvidence = Awaited<
  ReturnType<ItemCreateComboPage['readCustomComboDialogEvidence']>
> & { route: string };

export type ProductCenterMainImagePreviewEvidence = {
  typeLabel: string;
  candidateCount: number;
  rowIndex: number | null;
  source: string;
  previewCount: number;
  previewSource: string;
  sameImage: boolean;
  candidateContract?: {
    className: string;
    role: string;
    ancestorRole: string;
    tabIndex: number;
    cursor: string;
  };
  beforePageCount: number;
  afterPageCount: number;
  beforeUrl: string;
  afterUrl: string;
  dialogCount: number;
  modalCount: number;
};

export class ProductCenterItemGreenReadonlyFlow {
  constructor(private readonly page: Page) {}

  @step('探测商品第二语言名称模糊查询')
  async searchSecondLanguage(keyword: string): Promise<ProductCenterSecondLanguageSearchEvidence> {
    const listPage = new ItemListPage(this.page);
    await listPage.open();
    return listPage.searchAndReadSecondLanguageEvidence(keyword);
  }

  @step('探测添加可选搭配弹窗当前字段')
  async readOptionalComboDialog(): Promise<ProductCenterOptionalComboDialogEvidence> {
    const comboPage = new ItemCreateComboPage(this.page);
    await comboPage.open();
    await comboPage.openCustomComboCreateDialog();
    try {
      return {
        route: new URL(this.page.url()).pathname,
        ...(await comboPage.readCustomComboDialogEvidence()),
      };
    } finally {
      await comboPage.closeCustomComboCreateDialog();
    }
  }

  @step('探测商品列表指定类型主图预览：{typeLabel}')
  async probeImagePreview(typeLabel: string): Promise<ProductCenterMainImagePreviewEvidence> {
    const listPage = new ItemListPage(this.page);
    await listPage.open();
    const beforePageCount = this.page.context().pages().length;
    const beforeUrl = this.page.url();
    const candidateCount = await listPage.readMainImageCandidateCount(typeLabel);
    const clicked = await listPage.clickFirstMainImageByType(typeLabel);
    if (!clicked) {
      return {
        typeLabel,
        candidateCount,
        rowIndex: null,
        source: '',
        previewCount: 0,
        previewSource: '',
        sameImage: false,
        beforePageCount,
        afterPageCount: this.page.context().pages().length,
        beforeUrl,
        afterUrl: this.page.url(),
        dialogCount: 0,
        modalCount: 0,
      };
    }
    try {
      const preview = await listPage.readImagePreviewEvidence();
      const surfaces = await listPage.readImageInteractionSurfaceEvidence();
      return {
        typeLabel,
        candidateCount,
        rowIndex: clicked.rowIndex,
        source: sanitizeUrl(clicked.source),
        previewCount: preview.previewCount,
        previewSource: sanitizeUrl(preview.previewSource),
        sameImage: preview.previewCount === 1
          && comparableImageSource(clicked.source) === comparableImageSource(preview.previewSource),
        candidateContract: {
          className: clicked.className,
          role: clicked.role,
          ancestorRole: clicked.ancestorRole,
          tabIndex: clicked.tabIndex,
          cursor: clicked.cursor,
        },
        beforePageCount,
        afterPageCount: this.page.context().pages().length,
        beforeUrl,
        afterUrl: this.page.url(),
        ...surfaces,
      };
    } finally {
      await listPage.closeImagePreviewIfVisible();
    }
  }

  @step('探测标准商品主图第二次上传覆盖')
  async probeMainImageReplacement(firstImagePath: string, secondImagePath: string) {
    const form = new ItemCreateStandardPage(this.page);
    await form.open();
    const firstUpload = await form.uploadCommonMainImageWithEvidence(firstImagePath);
    const replacement = await form.replaceCommonMainImage(secondImagePath);
    return {
      firstUpload,
      replacement,
      currentState: await form.readCommonMainImageState(),
    };
  }

  @step('探测多规格商品规格组去创建跳转')
  async probeSpecGroupCreateNavigation() {
    const form = new ItemCreateStandardPage(this.page);
    await form.open();
    await form.selectMultiSpec();
    return form.probeSpecGroupCreateNavigation();
  }
}

function comparableImageSource(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split('?')[0];
  }
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.replace(/[?#].*$/, '');
  }
}
