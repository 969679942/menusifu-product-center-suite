import { test } from '../../fixtures/test.fixture';
import { BrandPictureFlow } from '../../flows/brand-picture.flow';

test.describe('图片管理冒烟', () => {
  test(
    '图片管理页应成功加载并显示渠道区域',
    {
      tag: ['@smoke'],
    },
    async ({ page }) => {
      const brandPictureFlow = new BrandPictureFlow();
      await brandPictureFlow.openAndExpectLoaded(page);
    },
  );
});
