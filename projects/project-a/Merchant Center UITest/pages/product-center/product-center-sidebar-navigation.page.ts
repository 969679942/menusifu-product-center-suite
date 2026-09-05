import type { Page } from '@playwright/test';
import { appConfig } from '../../test-data/env';
import { SidebarPage } from '../sidebar.page';
import { step } from '../../utils/step';
import { waitUntil } from '../../utils/wait';

export type ProductCenterSidebarNavigationResult = {
  mode: 'sidebar';
  targetPath: string;
  arrivedPath: string;
  verifiedPaths: string[];
};

export class ProductCenterSidebarNavigationPage {
  private readonly sidebar: SidebarPage;

  constructor(private readonly page: Page) {
    this.sidebar = new SidebarPage(page);
  }

  @step('从商品中心侧边栏进入目标模块：{targetPath}')
  async openFromSidebar(targetPath: `/${string}`): Promise<ProductCenterSidebarNavigationResult> {
    const navigationTarget = resolveSidebarNavigationTarget(targetPath);
    await this.page.goto(appConfig.brandPicturePath, { waitUntil: 'domcontentloaded' });
    await this.sidebar.expectProductManagementVisible();
    if (navigationTarget.submenuTitlePath) {
      await this.sidebar.openNestedSubMenuByCandidates(
        navigationTarget.candidatePaths,
        navigationTarget.submenuTitlePath,
      );
    } else {
      await this.sidebar.openSubMenuByCandidates(
        navigationTarget.candidatePaths,
        navigationTarget.submenuTitles,
      );
    }
    const arrivedPath = await waitUntil(
      () => new URL(this.page.url()).pathname,
      (pathname) => navigationTarget.expectedPaths.includes(pathname),
      { timeout: 60_000, interval: 100, message: `侧边栏未进入目标路径：${targetPath}` },
    );
    return {
      mode: 'sidebar',
      targetPath,
      arrivedPath,
      verifiedPaths: [...navigationTarget.expectedPaths],
    };
  }
}

export function createProductCenterSidebarNavigationPage(page: Page): ProductCenterSidebarNavigationPage {
  return new ProductCenterSidebarNavigationPage(page);
}

type SidebarNavigationTarget = {
  submenuTitles?: string[];
  submenuTitlePath?: string[];
  candidatePaths: string[];
  expectedPaths: string[];
};

function resolveSidebarNavigationTarget(targetPath: `/${string}`): SidebarNavigationTarget {
  const aliases: Record<string, SidebarNavigationTarget> = {
    '/pp/bom/list': { submenuTitles: ['配方管理', 'Recipe Manager'], candidatePaths: ['/pp/bom/list', '/poi/bom/list'], expectedPaths: ['/pp/bom/list', '/poi/bom/list'] },
    '/pp/bom/ingredient': { submenuTitles: ['配方管理', 'Recipe Manager'], candidatePaths: ['/pp/bom/ingredient'], expectedPaths: ['/pp/bom/ingredient'] },
    '/pp/brand/spec': { submenuTitles: ['属性管理', 'Property Management'], candidatePaths: ['/pp/brand/spec'], expectedPaths: ['/pp/brand/spec'] },
    '/pp/brand/option-group/attribute-group-set': { submenuTitles: ['属性管理', 'Property Management'], candidatePaths: ['/pp/brand/option-group/attribute-group-set'], expectedPaths: ['/pp/brand/option-group/attribute-group-set'] },
    '/pp/brand/option-group/taste': { submenuTitles: ['属性管理', 'Property Management'], candidatePaths: ['/pp/brand/option-group/taste'], expectedPaths: ['/pp/brand/option-group/taste'] },
    '/pp/brand/option-group/method': { submenuTitles: ['属性管理', 'Property Management'], candidatePaths: ['/pp/brand/option-group/method'], expectedPaths: ['/pp/brand/option-group/method'] },
    '/pp/brand/option-group/additional': { submenuTitles: ['属性管理', 'Property Management'], candidatePaths: ['/pp/brand/option-group/additional'], expectedPaths: ['/pp/brand/option-group/additional'] },
    '/pp/brand/combo': { submenuTitles: ['属性管理', 'Property Management'], candidatePaths: ['/pp/brand/combo'], expectedPaths: ['/pp/brand/combo'] },
    '/pp/brand/seasoning/list': { submenuTitles: ['调味管理', 'Seasoning'], candidatePaths: ['/pp/brand/seasoning/list'], expectedPaths: ['/pp/brand/seasoning/list'] },
    '/pp/brand/seasoning/record': { submenuTitles: ['调味管理', 'Seasoning'], candidatePaths: ['/pp/brand/seasoning/record'], expectedPaths: ['/pp/brand/seasoning/record'] },
    '/pp/brand/tag/description': { submenuTitles: ['标签管理', 'Labels'], candidatePaths: ['/pp/brand/tag/description'], expectedPaths: ['/pp/brand/tag/description'] },
    '/pp/brand/tag/statistic': { submenuTitles: ['标签管理', 'Labels'], candidatePaths: ['/pp/brand/tag/statistic'], expectedPaths: ['/pp/brand/tag/statistic'] },
    '/bm/menu/list': { submenuTitles: ['Menu'], candidatePaths: ['/bm/menu/list'], expectedPaths: ['/bm/menu/list'] },
    '/poi/tax/tax-types': { submenuTitlePath: ['Store Products', 'Tax Type Management'], candidatePaths: ['/poi/tax/tax-types'], expectedPaths: ['/poi/tax/tax-types'] },
    '/poi/printer-stall/list': { submenuTitles: ['打印档口', 'Printer Stall'], candidatePaths: ['/poi/printer-stall/list', '/pp/printer-stall/list'], expectedPaths: ['/poi/printer-stall/list', '/pp/printer-stall/list'] },
    '/pp/printer-stall/list': { submenuTitles: ['打印档口', 'Printer Stall'], candidatePaths: ['/pp/printer-stall/list', '/poi/printer-stall/list'], expectedPaths: ['/pp/printer-stall/list', '/poi/printer-stall/list'] },
  };
  const aliased = aliases[targetPath];
  if (aliased) return {
    ...(aliased.submenuTitles ? { submenuTitles: [...aliased.submenuTitles] } : {}),
    ...(aliased.submenuTitlePath ? { submenuTitlePath: [...aliased.submenuTitlePath] } : {}),
    candidatePaths: [...aliased.candidatePaths],
    expectedPaths: [...aliased.expectedPaths],
  };
  return { candidatePaths: [targetPath], expectedPaths: [targetPath] };
}
