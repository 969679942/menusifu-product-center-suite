import type { Page } from '@playwright/test';

const serverErrorMarkers = ['System Error', 'Server Error'] as const;

export function isProductCenterServerErrorText(value: string): boolean {
  return /(?:system|server) error|系统异常/i.test(value.trim());
}

export async function assertNoProductCenterServerError(page: Page): Promise<void> {
  for (const markerText of serverErrorMarkers) {
    const markers = await page.getByText(markerText, { exact: true }).all();
    const visibleStates = await Promise.all(
      markers.map((marker) => marker.isVisible().catch(() => false)),
    );
    if (visibleStates.some(Boolean)) {
      throw new Error('商品中心环境页面异常：Server Error');
    }
  }
}
