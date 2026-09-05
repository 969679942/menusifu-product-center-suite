import { expect, type Page } from '@playwright/test';
import { waitUntil } from './wait';

export async function expectPathname(page: Page, expectedPath: string): Promise<void> {
  const actualPath = await waitUntil(
    () => new URL(page.url()).pathname,
    (pathname) => pathname === expectedPath,
    {
      message: `Expected pathname to be ${expectedPath}.`,
    },
  );

  expect(actualPath).toBe(expectedPath);
}
