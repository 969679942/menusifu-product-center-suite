import type { Locator } from '@playwright/test';
import { waitUntil } from '../../utils/wait';

export async function resolveFirstVisibleLocator(
  candidates: Locator[],
  message: string,
  timeout = 5_000,
): Promise<Locator> {
  const resolvedLocator = await waitUntil(
    async () => {
      for (const candidate of candidates) {
        if (await candidate.isVisible().catch(() => false)) {
          return candidate;
        }
      }

      return null;
    },
    (locator): locator is Locator => locator !== null,
    {
      timeout,
      message,
    },
  );

  if (!resolvedLocator) {
    throw new Error(message);
  }

  return resolvedLocator;
}

export async function findFirstVisibleLocator(candidates: Locator[]): Promise<Locator | null> {
  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      return candidate;
    }
  }

  return null;
}
