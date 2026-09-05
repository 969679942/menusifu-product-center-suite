import type { Page } from '@playwright/test';
import { BrandPicturePage } from '../pages/brand-picture.page';
import { brandPictureUrl } from '../test-data/env';
import { step } from '../utils/step';

export class BrandPictureFlow {
  @step('打开图片管理页并验证加载完成')
  async openAndExpectLoaded(page: Page, path = brandPictureUrl()): Promise<void> {
    const brandPicturePage = new BrandPicturePage(page);
    await brandPicturePage.open(path);
  }
}
