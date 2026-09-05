import type { Page } from '@playwright/test';
import { findProductMenuById } from '../../test-data/product-management';
import { GroupListPage } from './group-list.page';

export function createSpecificationsPage(page: Page): GroupListPage {
  return new GroupListPage(page, findProductMenuById('specifications'));
}

export function createFlavorsPage(page: Page): GroupListPage {
  return new GroupListPage(page, findProductMenuById('flavors'));
}

export function createPreparationsPage(page: Page): GroupListPage {
  return new GroupListPage(page, findProductMenuById('preparations'));
}

export function createAddOnsPage(page: Page): GroupListPage {
  return new GroupListPage(page, findProductMenuById('add-ons'));
}

export function createCombosPage(page: Page): GroupListPage {
  return new GroupListPage(page, findProductMenuById('combos'));
}

export { GroupListPage };
