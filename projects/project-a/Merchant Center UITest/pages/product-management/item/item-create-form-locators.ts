import type { Locator, Page } from '@playwright/test';
import { itemCreateFormDom } from '../../../test-data/item-list';

export class ItemCreateFormLocators {
  private readonly commonPage: Page;
  readonly saveButton: Locator;
  readonly saveAndNewButton: Locator;
  readonly itemNameInput: Locator;
  readonly itemAltNameInput: Locator;
  readonly standardPriceInput: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;
  readonly visibleValidationErrors: Locator;
  readonly otherSection: Locator;
  readonly attributeSection: Locator;
  readonly otherSettingsExpandButton: Locator;
  readonly descriptionLabelsAddButton: Locator;
  readonly badgesAddButton: Locator;
  readonly statsAddButton: Locator;
  readonly ingredientInfoAddButton: Locator;
  readonly detailImageUploadButton: Locator;
  readonly detailImageFileInput: Locator;
  readonly detailImagePreviews: Locator;
  readonly detailImageCards: Locator;
  readonly detailImageDeleteActions: Locator;
  readonly commonAddAttributeMenuButton: Locator;
  readonly commonFlavorMenuItem: Locator;
  readonly commonRecipeMenuItem: Locator;
  readonly commonAdditivesMenuItem: Locator;
  readonly mainImageCards: Locator;
  readonly mainImagePreviews: Locator;
  readonly mainImageDeleteActions: Locator;
  readonly mainImageUploadArea: Locator;
  readonly mainImageFileInputs: Locator;
  readonly mainImageInteractiveElements: Locator;
  readonly mainImageLoadingIndicators: Locator;
  readonly localImageUploadButton: Locator;
  readonly visibleDialogs: Locator;

  constructor(page: Page) {
    this.commonPage = page;
    this.saveButton = page.getByRole('button', { name: itemCreateFormDom.saveButton });
    this.saveAndNewButton = page.getByRole('button', { name: itemCreateFormDom.saveAndNewButton });
    // The edit route can keep a hidden copy while the form hydrates. Bind to
    // the visible control so the value typed is the value submitted.
    this.itemNameInput = page
      .locator('.ant-form-item')
      .filter({ hasText: itemCreateFormDom.itemNameFieldMarker })
      .locator('input:visible,textarea:visible')
      .first();
    this.itemAltNameInput = page
      .locator('.ant-form-item')
      .filter({ hasText: itemCreateFormDom.itemAltNameFieldMarker })
      .getByRole('textbox')
      .first();
    this.standardPriceInput = page.getByRole('spinbutton', { name: itemCreateFormDom.standardPriceLabel });
    this.successMessage = page.locator('.ant-message-notice-success:visible');
    this.errorMessage = page.locator('.ant-message-notice-error:visible');
    this.visibleValidationErrors = page.locator('.ant-form-item-explain-error:visible');
    this.otherSection = page.locator('#section-others');
    this.attributeSection = page.locator('#section-attributes');
    this.otherSettingsExpandButton = this.otherSection.getByRole('button', { name: /Expand$/ });
    this.descriptionLabelsAddButton = this.commonOtherSettingsAddButton('Description Labels');
    this.badgesAddButton = this.commonOtherSettingsAddButton('Badges');
    this.statsAddButton = this.commonOtherSettingsAddButton('Stats');
    this.ingredientInfoAddButton = this.commonOtherSettingsAddButton('Ingredient Info');
    this.detailImageUploadButton = this.otherSection.locator('div[class^="uploadButton___"]');
    this.detailImageFileInput = this.detailImageUploadButton.locator('input[type="file"]');
    this.detailImagePreviews = this.otherSection.locator(
      'div[class^="detailImageListContainer___"] > :not([class^="uploadButton___"])',
    );
    this.detailImageCards = this.otherSection.locator(
      'div[class^="detailImageListContainer___"] > div[class^="imageCard___"]',
    );
    this.detailImageDeleteActions = this.detailImageCards.getByRole('img', { name: 'delete', exact: true });
    this.commonAddAttributeMenuButton = this.attributeSection
      .locator('span', { hasText: /^Attribute$/ })
      .locator('../..')
      .getByRole('button', { name: /Add$/ });
    this.commonFlavorMenuItem = this.commonPage.locator('.ant-dropdown-menu')
      .getByRole('menuitem', { name: 'Flavor', exact: true });
    this.commonRecipeMenuItem = this.commonPage.locator('.ant-dropdown-menu')
      .getByRole('menuitem', { name: 'Recipe', exact: true });
    this.commonAdditivesMenuItem = this.commonPage.locator('.ant-dropdown-menu')
      .getByRole('menuitem', { name: 'Additives', exact: true });
    const baseSection = page.locator('#section-base');
    this.mainImageCards = baseSection.locator('div[class^="imageCard___"]');
    this.mainImagePreviews = this.mainImageCards.locator('img[src], [style*="background-image"]');
    this.mainImageDeleteActions = this.mainImageCards.getByRole('img', { name: 'delete' });
    this.mainImageUploadArea = baseSection.locator('div[class^="uploadButton___"]');
    this.mainImageFileInputs = baseSection.locator('input[type="file"]');
    this.mainImageInteractiveElements = baseSection.locator([
      'button',
      '[role="button"]',
      'input[type="file"]',
      'div[class^="uploadButton___"]',
      'div[class^="imageCard___"]',
    ].join(','));
    this.mainImageLoadingIndicators = this.mainImageCards.getByText('Loading...', { exact: true });
    this.localImageUploadButton = page.getByRole('button', { name: 'Local', exact: true });
    this.visibleDialogs = page.locator('[role="dialog"]:visible');
  }

  descriptionLabelsDialog(): Locator {
    return this.commonPage.getByRole('dialog').filter({
      has: this.commonPage.getByRole('heading', { name: 'Description Labels', level: 2, exact: true }),
    });
  }

  badgesDialog(): Locator {
    return this.commonPage.getByRole('dialog').filter({
      has: this.commonPage.getByRole('heading', { name: 'Badges', level: 2, exact: true }),
    });
  }

  statisticsDialog(tagName: string): Locator {
    return this.commonPage.getByRole('dialog').filter({ hasText: tagName });
  }

  getOtherSettingsAddButton(sectionLabel: 'Description Labels' | 'Badges' | 'Stats' | 'Ingredient Info'): Locator {
    const buttonName = sectionLabel === 'Ingredient Info' ? 'down Add' : 'Add';
    return this.otherSection
      .getByText(sectionLabel, { exact: true })
      .locator('../..')
      .getByRole('button', { name: buttonName, exact: true });
  }

  commonSelectedAttributeGroup(groupName: string): Locator {
    const escapedGroupName = groupName.replace(/_/g, '\\_');
    const groupNameLocator = escapedGroupName === groupName
      ? this.commonPage.getByText(groupName, { exact: true })
      : this.commonPage.getByText(groupName, { exact: true }).or(
          this.commonPage.getByText(escapedGroupName, { exact: true }),
        );
    return this.attributeSection.locator('[role="button"][aria-roledescription="sortable"]').filter({
      has: groupNameLocator,
    }).first();
  }

  commonSelectionDialog(kind: 'flavor' | 'recipe' | 'additives'): Locator {
    const title = kind === 'flavor'
      ? 'Select Flavor Group'
      : kind === 'recipe'
        ? 'Select Cooking Method Group'
        : 'Select Additive Group';
    return this.commonPage.getByRole('dialog').filter({
      has: this.commonPage.getByRole('heading', { name: title, level: 2, exact: true }),
    });
  }

  commonSelectionSearchInput(kind: 'flavor' | 'recipe' | 'additives'): Locator {
    const placeholder = kind === 'flavor'
      ? 'Flavor Group Name'
      : kind === 'recipe'
        ? 'Preparation Group Name'
        : 'Add-On Group Name';
    return this.commonSelectionDialog(kind).getByRole('textbox', { name: placeholder, exact: true });
  }

  commonSelectionRows(kind: 'flavor' | 'recipe' | 'additives'): Locator {
    return this.commonSelectionDialog(kind).locator('tbody tr.ant-table-row:visible');
  }

  commonSelectionTarget(kind: 'flavor' | 'recipe' | 'additives', groupName: string): Locator {
    return this.commonSelectionRows(kind)
      .filter({ has: this.commonPage.getByText(groupName, { exact: true }) })
      .getByRole('checkbox');
  }

  private commonOtherSettingsAddButton(label: string): Locator {
    return this.otherSection
      .getByText(label, { exact: true })
      .locator('../..')
      .getByRole('button', { name: /Add$/ });
  }
}
