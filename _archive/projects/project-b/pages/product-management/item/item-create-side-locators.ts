import type { Locator, Page } from '@playwright/test';
import { itemCreateSideFormDom, itemCreateStandardFormDom } from '../../../test-data/item-list';
import { ItemCreateFormLocators } from './item-create-form-locators';

export class ItemCreateSideLocators extends ItemCreateFormLocators {
  private readonly page: Page;
  readonly basicInfoHeading: Locator;
  readonly priceHeading: Locator;
  readonly moreSettingsHeading: Locator;
  readonly categoryCascader: Locator;
  readonly categorySelectedValue: Locator;
  readonly visibleCategoryMenus: Locator;
  readonly packagingFeeInput: Locator;
  readonly costInput: Locator;
  readonly baseSection: Locator;
  readonly advancedSettingsButton: Locator;
  readonly posNameInput: Locator;
  readonly kitchenNameInput: Locator;
  readonly mainImageDeleteAction: Locator;
  readonly mainImagePreviewDialog: Locator;
  readonly mainImagePreviewCloseButton: Locator;
  readonly mainImageLibraryButton: Locator;
  readonly imageLibraryDialog: Locator;
  readonly imageLibrarySearchInput: Locator;
  readonly imageLibraryConfirmButton: Locator;

  constructor(page: Page) {
    super(page);
    this.page = page;
    this.basicInfoHeading = page.getByRole('heading', { name: itemCreateSideFormDom.sections.basicInfo, level: 2 });
    this.priceHeading = page.getByRole('heading', { name: itemCreateSideFormDom.sections.itemPrice, level: 2 });
    this.moreSettingsHeading = page.getByRole('heading', { name: itemCreateSideFormDom.sections.otherSettings, level: 2 });
    this.categoryCascader = page.locator('#category .custom-cascader');
    this.categorySelectedValue = page.locator('#category [class^="cascaderText___"]');
    this.visibleCategoryMenus = page.locator('ul.ant-cascader-menu:visible');
    const priceSection = page.locator('#section-price-specs');
    this.packagingFeeInput = priceSection.getByRole('spinbutton', { name: 'Packaging Fee' });
    this.costInput = priceSection.getByRole('spinbutton', { name: 'Cost' });
    this.baseSection = page.locator(itemCreateStandardFormDom.sectionIds.basicInfo);
    this.advancedSettingsButton = this.baseSection.getByRole('button', {
      name: itemCreateStandardFormDom.advancedSettingsButton,
    });
    this.posNameInput = this.formItemTextbox(this.baseSection, itemCreateStandardFormDom.fields.posName);
    this.kitchenNameInput = this.formItemTextbox(this.baseSection, itemCreateStandardFormDom.fields.kitchenName);
    this.mainImageDeleteAction = this.mainImageCards
      .getByRole('img', { name: 'delete', exact: true })
      .locator('..');
    this.mainImagePreviewDialog = page.getByRole('dialog').filter({
      has: page.getByText('Main Product Image', { exact: true }),
    });
    this.mainImagePreviewCloseButton = this.mainImagePreviewDialog
      .getByRole('button', { name: 'close', exact: true });
    this.mainImageLibraryButton = this.baseSection.getByRole('button', { name: 'Library', exact: true });
    this.imageLibraryDialog = page.getByRole('dialog').filter({
      has: page.getByRole('heading', { name: 'Select Image', level: 2, exact: true }),
    });
    this.imageLibrarySearchInput = this.imageLibraryDialog.getByRole('textbox', { name: 'Image Name', exact: true });
    this.imageLibraryConfirmButton = this.imageLibraryDialog.getByRole('button', { name: 'Confirm', exact: true });
  }

  categoryNode(name: string): Locator {
    return this.page.getByRole('menuitemcheckbox').filter({ hasText: name });
  }

  imageLibraryImage(name: string): Locator {
    return this.imageLibraryDialog.getByRole('img', { name, exact: true });
  }

  private formItemTextbox(section: Locator, labelMarker: string | RegExp): Locator {
    return section.locator('.ant-form-item').filter({ hasText: labelMarker }).getByRole('textbox').first();
  }
}
