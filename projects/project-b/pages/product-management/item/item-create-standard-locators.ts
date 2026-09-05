import type { Locator, Page } from '@playwright/test';
import { itemCreateStandardFormDom } from '../../../test-data/item-list';
import { ItemCreateFormLocators } from './item-create-form-locators';

export class ItemCreateStandardLocators extends ItemCreateFormLocators {
  readonly baseSection: Locator;
  readonly priceSection: Locator;
  readonly printSection: Locator;
  readonly attributeSection: Locator;
  readonly attributeInputs: Locator;
  readonly otherSection: Locator;
  readonly basicInfoHeading: Locator;
  readonly priceHeading: Locator;
  readonly printHeading: Locator;
  readonly attributeHeading: Locator;
  readonly otherSettingsHeading: Locator;
  readonly sortRulesHeading: Locator;
  readonly itemAltNameInput: Locator;
  readonly descriptionInput: Locator;
  readonly descriptionCounter: Locator;
  readonly categoryCascader: Locator;
  readonly advancedSettingsButton: Locator;
  readonly posNameInput: Locator;
  readonly kitchenNameInput: Locator;
  readonly mnemonicCodeInput: Locator;
  readonly industryGoodsInput: Locator;
  readonly itemCodeInput: Locator;
  readonly unitInput: Locator;
  readonly unitSelect: Locator;
  readonly visibleUnitOptions: Locator;
  readonly deviceCodeInput: Locator;
  readonly minimumOrderQuantityInput: Locator;
  readonly singleSpecRadio: Locator;
  readonly multiSpecRadio: Locator;
  readonly weightBasedYesRadio: Locator;
  readonly packagingFeeInput: Locator;
  readonly costInput: Locator;
  readonly addSpecGroupButton: Locator;
  readonly specGroupDialog: Locator;
  readonly specGroupCreateEntry: Locator;
  readonly specGroupDialogButtons: Locator;
  readonly specGroupDialogLinks: Locator;
  readonly specGroupDialogTabs: Locator;
  readonly specGroupDialogInputs: Locator;
  readonly specGroupConfirmButton: Locator;
  readonly multiSpecPriceInputs: Locator;
  readonly multiSpecRows: Locator;
  readonly printStallSearchInput: Locator;
  readonly selectedStallsText: Locator;
  readonly standardPriceError: Locator;
  readonly sortRuleSelectButton: Locator;
  readonly sortRuleDialog: Locator;
  readonly addAttributeMenuButton: Locator;
  readonly addAttributeFlavorMenuItem: Locator;
  readonly addAttributeRecipeMenuItem: Locator;
  readonly addAttributeAdditivesMenuItem: Locator;
  readonly additionalPriceWarningDialog: Locator;
  readonly additionalPriceConfirmButton: Locator;
  readonly mutuallyExclusiveExpandButton: Locator;
  readonly mutuallyExclusiveRulesAddButton: Locator;
  readonly visibleDialog: Locator;
  readonly mutuallyExclusiveRulesContainer: Locator;
  readonly mutuallyExclusiveRuleTitles: Locator;
  readonly mutuallyExclusiveRuleEditButtons: Locator;
  readonly otherSettingsExpandButton: Locator;
  readonly descriptionLabelsAddButton: Locator;
  readonly badgesAddButton: Locator;
  readonly statsAddButton: Locator;
  readonly ingredientInfoAddButton: Locator;
  readonly detailImageUploadButton: Locator;
  readonly categorySelectedValue: Locator;
  readonly visibleCategoryMenus: Locator;
  readonly mainImageFileInput: Locator;
  readonly mainImageCards: Locator;
  readonly mainImageDeleteIcons: Locator;
  readonly mainImageUploadArea: Locator;
  readonly mainImageLibraryButton: Locator;
  readonly localImageUploadButton: Locator;

  constructor(private readonly page: Page) {
    super(page);
    const dom = itemCreateStandardFormDom;
    this.baseSection = page.locator(dom.sectionIds.basicInfo);
    this.priceSection = page.locator(dom.sectionIds.price);
    this.printSection = page.locator(dom.sectionIds.printSettings);
    this.attributeSection = page.locator(dom.sectionIds.attributes);
    this.attributeInputs = this.attributeSection.locator('input');
    this.otherSection = page.locator(dom.sectionIds.otherSettings);
    this.basicInfoHeading = page.getByRole('heading', { name: dom.sections.basicInfo, level: 2 });
    this.priceHeading = page.getByRole('heading', { name: dom.sections.itemPrice, level: 2 });
    this.printHeading = page.getByRole('heading', { name: dom.sections.printSettings, level: 2 });
    this.attributeHeading = page.getByRole('heading', { name: dom.sections.itemAttributes, level: 2 });
    this.otherSettingsHeading = page.getByRole('heading', { name: dom.sections.otherSettings, level: 2 });
    this.sortRulesHeading = page.getByRole('heading', { name: dom.sections.sortRules, level: 3 });
    this.itemAltNameInput = this.formItemTextbox(this.baseSection, dom.fields.itemAltName);
    this.descriptionInput = this.baseSection.locator('textarea');
    this.descriptionCounter = this.descriptionInput
      .locator('..')
      .getByText(/^\d+\s*\/\s*\d+$/);
    this.categoryCascader = page.locator('#category .custom-cascader');
    this.categorySelectedValue = page.locator('#category [class^="cascaderText___"]');
    this.visibleCategoryMenus = page.locator('ul.ant-cascader-menu:visible');
    this.mainImageFileInput = this.baseSection.locator('input[type="file"][name="file"]');
    this.mainImageCards = this.baseSection.locator('div[class^="imageCard___"]');
    this.mainImageDeleteIcons = this.mainImageCards.getByRole('img', { name: 'delete', exact: true });
    this.mainImageUploadArea = this.baseSection.locator('div[class^="uploadButton___"]');
    this.mainImageLibraryButton = this.baseSection.getByRole('button', { name: 'Library', exact: true });
    this.localImageUploadButton = page.getByRole('button', { name: 'Local', exact: true });
    this.advancedSettingsButton = this.baseSection.getByRole('button', {
      name: itemCreateStandardFormDom.advancedSettingsButton,
    });
    this.posNameInput = this.formItemTextbox(this.baseSection, dom.fields.posName);
    this.kitchenNameInput = this.formItemTextbox(this.baseSection, dom.fields.kitchenName);
    this.mnemonicCodeInput = this.formItemTextbox(this.baseSection, dom.fields.mnemonicCode);
    this.industryGoodsInput = this.formItemTextbox(this.baseSection, dom.fields.industryGoods);
    this.itemCodeInput = this.formItemTextbox(this.baseSection, dom.fields.itemCode);
    this.unitInput = this.formItemTextbox(this.baseSection, dom.fields.unit);
    this.unitSelect = this.priceSection.locator('tbody tr').first().locator('.ant-select-selector');
    this.visibleUnitOptions = page.locator('.ant-select-dropdown:visible .ant-select-item-option-content');
    this.deviceCodeInput = this.formItemTextbox(this.baseSection, dom.fields.deviceCode);
    this.minimumOrderQuantityInput = this.formItemSpinbutton(this.baseSection, dom.fields.minimumOrderQuantity);
    this.singleSpecRadio = page.getByRole('radio', { name: dom.singleSpecRadio });
    this.multiSpecRadio = page.getByRole('radio', { name: dom.multiSpecRadio });
    this.weightBasedYesRadio = page
      .locator('div')
      .filter({ has: page.getByText(dom.weightBasedItemMarker, { exact: true }) })
      .filter({ has: page.getByRole('radio', { name: dom.weightBasedNoRadio }) })
      .getByRole('radio', { name: dom.weightBasedYesRadio });
    this.packagingFeeInput = this.priceSection.getByRole('spinbutton', { name: dom.packagingFeeSpinbutton });
    this.costInput = this.priceSection.getByRole('spinbutton', { name: dom.costSpinbutton });
    this.addSpecGroupButton = page.getByRole('button', { name: dom.addSpecGroupButton });
    this.specGroupDialog = this.selectionDialog('spec');
    this.specGroupCreateEntry = this.specGroupDialog.getByText(dom.specGroupCreateEntry, { exact: true });
    this.specGroupDialogButtons = this.specGroupDialog.getByRole('button');
    this.specGroupDialogLinks = this.specGroupDialog.getByRole('link');
    this.specGroupDialogTabs = this.specGroupDialog.getByRole('tab');
    this.specGroupDialogInputs = this.specGroupDialog.locator('input:visible');
    this.specGroupConfirmButton = this.specGroupDialog.getByRole('button', { name: dom.specGroupConfirmButton });
    this.multiSpecPriceInputs = page.getByRole('spinbutton', { name: dom.multiSpecPriceSpinbutton });
    this.multiSpecRows = this.priceSection.locator('tbody tr:visible');
    this.printStallSearchInput = this.printSection.getByRole('textbox', { name: dom.printStallSearchPlaceholder });
    this.selectedStallsText = this.printSection.getByText(dom.selectedStallsPattern);
    this.standardPriceError = page.locator('.ant-form-item')
      .filter({ has: this.standardPriceInput })
      .locator('.ant-form-item-explain-error');
    this.sortRuleSelectButton = this.attributeSection.getByRole('button', { name: dom.sortRuleSelectButton });
    this.sortRuleDialog = page.getByRole('dialog');
    this.addAttributeMenuButton = this.attributeSection.getByRole('button', { name: dom.addDropdownButton });
    this.addAttributeFlavorMenuItem = page
      .locator('.ant-dropdown-menu')
      .getByRole('menuitem', { name: dom.attributeMenuItems.flavor, exact: true });
    this.addAttributeRecipeMenuItem = page
      .locator('.ant-dropdown-menu')
      .getByRole('menuitem', { name: dom.attributeMenuItems.recipe, exact: true });
    this.addAttributeAdditivesMenuItem = page
      .locator('.ant-dropdown-menu')
      .getByRole('menuitem', { name: dom.attributeMenuItems.additives, exact: true });
    this.additionalPriceWarningDialog = page.getByRole('dialog').filter({
      has: page.getByText(dom.additionalPriceWarning, { exact: true }),
    });
    this.additionalPriceConfirmButton = this.additionalPriceWarningDialog.getByRole('button', {
      name: dom.additionalPriceConfirmButton,
      exact: true,
    });
    this.mutuallyExclusiveExpandButton = this.attributeSection.getByRole('button', { name: dom.expandButton });
    this.mutuallyExclusiveRulesAddButton = this.attributeSection
      .locator('div')
      .filter({ hasText: dom.mutuallyExclusiveRulesMarker })
      .getByRole('button', { name: dom.mutuallyExclusiveRulesAddButton, exact: true });
    this.visibleDialog = page.locator('[role="dialog"]:visible').last();
    this.mutuallyExclusiveRulesContainer = this.mutuallyExclusiveRulesAddButton.locator('../..');
    this.mutuallyExclusiveRuleTitles = this.mutuallyExclusiveRulesContainer.getByText(/^Rule\d+$/, { exact: true });
    this.mutuallyExclusiveRuleEditButtons = this.mutuallyExclusiveRulesContainer.getByRole('button', {
      name: 'edit Edit',
      exact: true,
    });
    this.otherSettingsExpandButton = this.otherSection.getByRole('button', { name: dom.expandButton });
    this.descriptionLabelsAddButton = this.otherSettingsAddButton(dom.otherSettingsBlocks.descriptionLabels);
    this.badgesAddButton = this.otherSettingsAddButton(dom.otherSettingsBlocks.badges);
    this.statsAddButton = this.otherSettingsAddButton(dom.otherSettingsBlocks.stats);
    this.ingredientInfoAddButton = this.otherSection
      .getByText(dom.otherSettingsBlocks.ingredientInfo, { exact: true })
      .locator('../..')
      .getByRole('button', { name: dom.addDropdownButton });
    this.detailImageUploadButton = this.otherSection.getByText(dom.otherSettingsBlocks.detailImageUpload, { exact: true });
  }

  firstSpecGroupRowRadio(): Locator {
    return this.specGroupDialog.locator('tbody tr').first().getByRole('radio');
  }

  multiSpecRow(optionName: string): Locator {
    return this.priceSection.locator('tbody tr').filter({
      has: this.page.getByText(optionName, { exact: true }),
    });
  }

  selectionDialog(kind: 'spec' | 'flavor' | 'recipe' | 'additives'): Locator {
    const title = kind === 'spec'
      ? itemCreateStandardFormDom.selectSpecGroupDialogTitle
      : itemCreateStandardFormDom.attributeDialogs[kind].title;
    return this.page.getByRole('dialog').filter({
      has: this.page.getByRole('heading', { name: title, level: 2 }),
    });
  }

  selectionSearchInput(kind: 'spec' | 'flavor' | 'recipe' | 'additives'): Locator {
    const placeholder = kind === 'spec'
      ? itemCreateStandardFormDom.specGroupSearchPlaceholder
      : itemCreateStandardFormDom.attributeDialogs[kind].searchPlaceholder;
    return this.selectionDialog(kind).getByRole('textbox', { name: placeholder });
  }

  selectionRows(kind: 'spec' | 'flavor' | 'recipe' | 'additives'): Locator {
    return this.selectionDialog(kind).locator('tbody tr.ant-table-row:visible');
  }

  selectionLoading(kind: 'spec' | 'flavor' | 'recipe' | 'additives'): Locator {
    return this.selectionDialog(kind).locator('.ant-spin-spinning:visible');
  }

  selectionTarget(kind: 'spec' | 'flavor' | 'recipe' | 'additives', name: string): Locator {
    const row = this.selectionRows(kind).filter({ hasText: name });
    return kind === 'spec' ? row.getByRole('radio') : row.getByRole('checkbox');
  }

  selectionConfirmButton(kind: 'spec' | 'flavor' | 'recipe' | 'additives'): Locator {
    return this.selectionDialog(kind).getByRole('button', { name: itemCreateStandardFormDom.specGroupConfirmButton });
  }

  selectedAttributeGroup(name: string): Locator {
    return this.attributeSection.getByText(name, { exact: true });
  }

  printStallCheckbox(name: string): Locator {
    return this.printSection.getByRole('checkbox', { name, exact: true });
  }

  categoryMenu(): Locator {
    return this.visibleCategoryMenus;
  }

  categoryNode(name: string): Locator {
    return this.page.getByRole('menuitemcheckbox').filter({ hasText: name });
  }

  categoryLeafMenuItems(): Locator {
    return this.categoryMenu()
      .getByRole('menuitemcheckbox')
      .filter({ hasNot: this.page.getByRole('img', { name: 'right' }) });
  }

  ingredientInfoMenuItem(name: 'Ingredient' | 'Allergens' | 'Nutritional'): Locator {
    return this.page
      .locator('.ant-dropdown-menu:visible')
      .getByRole('menuitem', { name, exact: true });
  }

  imageLibraryDialog(): Locator {
    return this.page.getByRole('dialog').filter({
      has: this.page.getByRole('heading', { name: 'Select Image', level: 2, exact: true }),
    });
  }

  imageLibrarySearchInput(): Locator {
    return this.imageLibraryDialog().getByRole('textbox', { name: 'Image Name', exact: true });
  }

  imageLibraryImage(imageName: string): Locator {
    return this.imageLibraryDialog().locator(`[title=${JSON.stringify(imageName)}]`);
  }

  imageLibraryConfirmButton(): Locator {
    return this.imageLibraryDialog().getByRole('button', { name: 'Confirm', exact: true });
  }

  sortRuleDialogTitle(): Locator {
    return this.page.getByRole('heading', {
      name: itemCreateStandardFormDom.sortRuleDialogTitle,
      level: 2,
    });
  }

  sortRuleDialogCloseButton(): Locator {
    return this.page
      .getByRole('dialog')
      .filter({ has: this.sortRuleDialogTitle() })
      .getByRole('button', { name: itemCreateStandardFormDom.sortRuleDialogCloseButton });
  }

  protected formItemTextbox(section: Locator, labelMarker: string | RegExp): Locator {
    return section.locator('.ant-form-item').filter({ hasText: labelMarker }).getByRole('textbox').first();
  }

  protected formItemSpinbutton(section: Locator, labelMarker: string | RegExp): Locator {
    return section.locator('.ant-form-item').filter({ hasText: labelMarker }).getByRole('spinbutton').first();
  }

  private otherSettingsAddButton(blockLabel: string): Locator {
    return this.otherSection
      .getByText(blockLabel, { exact: true })
      .locator('../..')
      .getByRole('button', { name: itemCreateStandardFormDom.addButton, exact: true });
  }
}
