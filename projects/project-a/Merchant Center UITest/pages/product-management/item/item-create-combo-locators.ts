import type { Locator, Page } from '@playwright/test';
import { itemCreateComboFormDom, itemCreateFormDom, itemCreateStandardFormDom } from '../../../test-data/item-list';
import { ItemCreateFormLocators } from './item-create-form-locators';

export class ItemCreateComboLocators extends ItemCreateFormLocators {
  private readonly page: Page;
  readonly baseSection: Locator;
  readonly attributeSection: Locator;
  readonly basicInfoHeading: Locator;
  readonly priceHeading: Locator;
  readonly attributeHeading: Locator;
  readonly otherSettingsHeading: Locator;
  readonly addComboGroupButton: Locator;
  readonly comboAttributeAddButton: Locator;
  readonly advancedSettingsButton: Locator;
  readonly minimumOrderQuantityInput: Locator;
  readonly packagingFeeInput: Locator;
  readonly categoryCascader: Locator;
  readonly categorySelectedValue: Locator;
  readonly visibleCategoryMenus: Locator;
  readonly addFixedComboMenuItem: Locator;
  readonly addFixedComboDialog: Locator;
  readonly addFixedComboGroupNameInput: Locator;
  readonly addFixedComboItemSearchInput: Locator;
  readonly addFixedComboLoading: Locator;
  readonly addFixedComboRows: Locator;
  readonly addFixedComboConfirmButton: Locator;
  readonly selectFixedComboMenuItem: Locator;
  readonly fixedComboDialog: Locator;
  readonly fixedComboLoading: Locator;
  readonly fixedComboRows: Locator;
  readonly fixedComboSearchInput: Locator;
  readonly fixedComboConfirmButton: Locator;
  readonly fixedComboCloseButton: Locator;
  readonly selectCustomComboMenuItem: Locator;
  readonly customComboDialog: Locator;
  readonly customComboLoading: Locator;
  readonly customComboRows: Locator;
  readonly customComboSearchInput: Locator;
  readonly customComboConfirmButton: Locator;
  readonly addCustomComboMenuItem: Locator;
  readonly addCustomComboDialog: Locator;
  readonly customComboGroupNameInput: Locator;
  readonly customComboAltNameInput: Locator;
  readonly customComboSelectionQuantityInput: Locator;
  readonly customComboMergeSwitch: Locator;
  readonly customComboRepeatSwitch: Locator;
  readonly customComboItemSearchInput: Locator;
  readonly customComboCategoryFilter: Locator;
  readonly customComboCreateLoading: Locator;
  readonly customComboCreateRows: Locator;
  readonly customComboCreateConfirmButton: Locator;
  readonly customComboCreateCloseButton: Locator;
  readonly comboGroupRequiredError: Locator;
  readonly itemNameRequiredError: Locator;
  readonly standardPriceRequiredError: Locator;
  readonly descriptionInput: Locator;
  readonly descriptionCharCount: Locator;
  readonly posNameInput: Locator;
  readonly kitchenNameInput: Locator;
  readonly mnemonicCodeInput: Locator;
  readonly mutuallyExclusiveExpandButton: Locator;
  readonly mutuallyExclusiveRulesAddButton: Locator;
  readonly mutuallyExclusiveRulesContainer: Locator;
  readonly mutuallyExclusiveRuleTitles: Locator;
  readonly mutuallyExclusiveRuleEditButtons: Locator;
  readonly mutuallyExclusiveVisibleDialog: Locator;

  constructor(page: Page) {
    super(page);
    this.page = page;
    this.baseSection = page.locator(itemCreateComboFormDom.sectionIds.basicInfo);
    this.attributeSection = page.locator(itemCreateComboFormDom.sectionIds.attributes);
    this.basicInfoHeading = page.getByRole('heading', { name: itemCreateComboFormDom.sections.basicInfo, level: 2 });
    this.priceHeading = page.getByRole('heading', { name: itemCreateComboFormDom.sections.itemPrice, level: 2 });
    this.attributeHeading = page.getByRole('heading', { name: itemCreateComboFormDom.sections.itemAttributes, level: 2 });
    this.comboAttributeAddButton = this.attributeHeading.locator('..').getByRole('button', { name: /Add$/ });
    this.otherSettingsHeading = page.getByRole('heading', { name: itemCreateComboFormDom.sections.otherSettings, level: 2 });
    this.addComboGroupButton = this.attributeSection.getByRole('button', { name: /Add$/ });
    this.advancedSettingsButton = this.baseSection.getByRole('button', {
      name: itemCreateComboFormDom.advancedSettingsButton,
    });
    this.minimumOrderQuantityInput = this.baseSection
      .locator('.ant-form-item')
      .filter({ hasText: itemCreateComboFormDom.minimumOrderQuantity })
      .getByRole('spinbutton');
    this.packagingFeeInput = page.getByRole('spinbutton', { name: itemCreateStandardFormDom.packagingFeeSpinbutton });
    this.categoryCascader = page.locator('#category .custom-cascader');
    this.categorySelectedValue = page.locator('#category [class^="cascaderText___"]');
    this.visibleCategoryMenus = page.locator('ul.ant-cascader-menu:visible');
    this.addFixedComboMenuItem = page.getByRole('menuitem', {
      name: itemCreateComboFormDom.addFixedComboMenuItem,
      exact: true,
    });
    this.addFixedComboDialog = page.getByRole('dialog').filter({
      has: page.getByRole('heading', {
        name: itemCreateComboFormDom.addFixedComboDialogTitle,
        level: 2,
        exact: true,
      }),
    });
    this.addFixedComboGroupNameInput = this.addFixedComboDialog.getByPlaceholder(
      itemCreateComboFormDom.customComboGroupNamePlaceholder,
      { exact: true },
    );
    this.addFixedComboItemSearchInput = this.addFixedComboDialog.getByPlaceholder(
      itemCreateComboFormDom.customComboItemSearchPlaceholder,
      { exact: true },
    );
    this.addFixedComboLoading = this.addFixedComboDialog.locator('.ant-spin-spinning:visible');
    this.addFixedComboRows = this.addFixedComboDialog.locator('tbody tr.ant-table-row:visible');
    this.addFixedComboConfirmButton = this.addFixedComboDialog.getByRole('button', {
      name: itemCreateComboFormDom.fixedComboConfirmButton,
      exact: true,
    });
    this.selectFixedComboMenuItem = page.getByRole('menuitem', {
      name: itemCreateComboFormDom.selectFixedComboMenuItem,
      exact: true,
    });
    this.fixedComboDialog = page.getByRole('dialog').filter({
      has: page.getByRole('heading', {
        name: itemCreateComboFormDom.fixedComboDialogTitle,
        level: 2,
      }),
    });
    this.fixedComboLoading = this.fixedComboDialog.locator('.ant-spin-spinning:visible');
    this.fixedComboRows = this.fixedComboDialog.locator('tbody tr.ant-table-row:visible');
    this.fixedComboSearchInput = this.fixedComboDialog.getByRole('textbox', {
      name: 'Combo group name',
      exact: true,
    });
    this.fixedComboConfirmButton = this.fixedComboDialog.getByRole('button', {
      name: itemCreateComboFormDom.fixedComboConfirmButton,
      exact: true,
    });
    this.fixedComboCloseButton = this.fixedComboDialog.getByRole('button', {
      name: 'close',
      exact: true,
    });
    this.selectCustomComboMenuItem = page.getByRole('menuitem', {
      name: itemCreateComboFormDom.selectCustomComboMenuItem,
      exact: true,
    });
    this.customComboDialog = page.getByRole('dialog').filter({
      has: page.getByRole('heading', {
        name: itemCreateComboFormDom.customComboDialogTitle,
        level: 2,
        exact: true,
      }),
    });
    this.customComboLoading = this.customComboDialog.locator('.ant-spin-spinning:visible');
    this.customComboRows = this.customComboDialog.locator('tbody tr.ant-table-row:visible');
    this.customComboSearchInput = this.customComboDialog.getByRole('textbox', {
      name: 'Combo group name',
      exact: true,
    });
    this.customComboConfirmButton = this.customComboDialog.getByRole('button', {
      name: itemCreateComboFormDom.customComboConfirmButton,
      exact: true,
    });
    this.addCustomComboMenuItem = page.getByRole('menuitem', {
      name: itemCreateComboFormDom.addCustomComboMenuItem,
      exact: true,
    });
    this.addCustomComboDialog = page.getByRole('dialog').filter({
      has: page.getByRole('heading', {
        name: itemCreateComboFormDom.addCustomComboDialogTitle,
        level: 2,
        exact: true,
      }),
    });
    this.customComboGroupNameInput = this.addCustomComboDialog.getByPlaceholder(
      itemCreateComboFormDom.customComboGroupNamePlaceholder,
      { exact: true },
    );
    this.customComboAltNameInput = this.addCustomComboDialog.getByPlaceholder(
      itemCreateComboFormDom.customComboAltNamePlaceholder,
      { exact: true },
    );
    this.customComboSelectionQuantityInput = this.addCustomComboDialog
      .locator('#selectionRule_max');
    this.customComboMergeSwitch = this.addCustomComboDialog
      .locator('#selectionRule_mergeDisplay');
    this.customComboRepeatSwitch = this.addCustomComboDialog
      .locator('#selectionRule_repeatSelect');
    this.customComboItemSearchInput = this.addCustomComboDialog.getByPlaceholder(
      itemCreateComboFormDom.customComboItemSearchPlaceholder,
      { exact: true },
    );
    this.customComboCategoryFilter = this.addCustomComboDialog.getByText(
      itemCreateComboFormDom.customComboCategoryFilter,
      { exact: true },
    );
    this.customComboCreateLoading = this.addCustomComboDialog.locator('.ant-spin-spinning:visible');
    this.customComboCreateRows = this.addCustomComboDialog.locator('tbody tr.ant-table-row:visible');
    this.customComboCreateConfirmButton = this.addCustomComboDialog.getByRole('button', {
      name: itemCreateComboFormDom.customComboConfirmButton,
      exact: true,
    });
    this.customComboCreateCloseButton = this.addCustomComboDialog.getByRole('button', {
      name: 'close',
      exact: true,
    });
    this.comboGroupRequiredError = page.locator('.ant-message-notice-error:visible').filter({
      hasText: itemCreateComboFormDom.customComboRequiredErrorCode,
    });
    this.itemNameRequiredError = this.baseSection.getByText(
      itemCreateFormDom.itemNameRequiredError,
      { exact: true },
    );
    this.standardPriceRequiredError = page
      .locator('.ant-input-number-status-error:visible')
      .filter({ has: this.standardPriceInput });
    this.descriptionInput = this.baseSection.locator('div').filter({
      has: page.getByText(itemCreateStandardFormDom.fields.description, { exact: true }),
    }).getByRole('textbox').first();
    this.descriptionCharCount = this.baseSection.getByText(
      itemCreateStandardFormDom.descriptionCharCountMarker,
    );
    this.posNameInput = this.baseSection.locator('.ant-form-item').filter({
      has: page.getByText(itemCreateStandardFormDom.fields.posName, { exact: true }),
    }).getByRole('textbox').first();
    this.kitchenNameInput = this.baseSection.locator('.ant-form-item').filter({
      has: page.getByText(itemCreateStandardFormDom.fields.kitchenName, { exact: true }),
    }).getByRole('textbox').first();
    this.mnemonicCodeInput = this.baseSection.locator('.ant-form-item').filter({
      has: page.getByText(itemCreateStandardFormDom.fields.mnemonicCode, { exact: true }),
    }).getByRole('textbox').first();
    this.mutuallyExclusiveExpandButton = this.attributeSection.getByRole('button', { name: itemCreateStandardFormDom.expandButton });
    this.mutuallyExclusiveRulesAddButton = this.attributeSection
      .locator('div')
      .filter({ hasText: itemCreateStandardFormDom.mutuallyExclusiveRulesMarker })
      .getByRole('button', { name: itemCreateStandardFormDom.mutuallyExclusiveRulesAddButton, exact: true });
    this.mutuallyExclusiveRulesContainer = this.mutuallyExclusiveRulesAddButton.locator('../..');
    this.mutuallyExclusiveRuleTitles = this.mutuallyExclusiveRulesContainer.getByText(/^Rule\d+$/, { exact: true });
    this.mutuallyExclusiveRuleEditButtons = this.mutuallyExclusiveRulesContainer.getByRole('button', {
      name: 'edit Edit',
      exact: true,
    });
    this.mutuallyExclusiveVisibleDialog = page.locator('[role="dialog"]:visible');
  }

  categoryNode(name: string): Locator {
    return this.page.getByRole('menuitemcheckbox').filter({ hasText: name });
  }

  fixedComboRowCheckbox(comboGroupName: string): Locator {
    return this.fixedComboRows
      .filter({ has: this.page.getByText(comboGroupName, { exact: true }) })
      .getByRole('checkbox');
  }

  addFixedComboCreateProductCheckbox(productName: string): Locator {
    return this.addFixedComboRows
      .filter({ has: this.page.getByText(productName, { exact: true }) })
      .getByRole('checkbox');
  }

  customComboRowCheckbox(comboGroupName: string): Locator {
    return this.customComboDialog
      .locator('tbody tr.ant-table-row:visible')
      .filter({ has: this.page.getByText(comboGroupName, { exact: true }) })
      .getByRole('checkbox');
  }

  customComboCreateProductCheckbox(productName: string): Locator {
    return this.customComboCreateRows
      .filter({ has: this.page.getByText(productName, { exact: true }) })
      .getByRole('checkbox');
  }

  customComboGroupCard(groupName: string): Locator {
    return this.attributeSection
      .getByRole('button')
      .filter({ has: this.page.getByText(groupName, { exact: true }) });
  }

  selectedComboGroup(groupName: string): Locator {
    return this.attributeSection.locator('[role="button"][aria-roledescription="sortable"]').filter({
      has: this.page.getByText(groupName, { exact: true }),
    });
  }

  customComboGroupProductRow(groupName: string, productName: string): Locator {
    return this.customComboGroupCard(groupName)
      .locator('tbody tr.ant-table-row:visible')
      .filter({ has: this.page.getByText(productName, { exact: true }) });
  }
}
