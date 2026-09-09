import type { Locator, Page } from '@playwright/test';

type FileChooserHandle = { setFiles(filePath: string): Promise<void> };
type LegacyFileChooserPage = {
  waitForFileChooser(): Promise<FileChooserHandle>;
};
type LegacyRevealTarget = { hover(): Promise<unknown> };
type LegacyTrigger = { click(): Promise<unknown> };

export function selectFileThroughChooser(
  page: Page,
  trigger: Locator,
  directInput: Locator,
  filePath: string,
  localTrigger?: Locator,
): Promise<void>;
export function selectFileThroughChooser(
  page: LegacyFileChooserPage,
  revealTarget: LegacyRevealTarget,
  trigger: LegacyTrigger,
  filePath: string,
  timeout?: number,
): Promise<void>;

export async function selectFileThroughChooser(
  page: Page | LegacyFileChooserPage,
  triggerOrReveal: Locator | LegacyRevealTarget,
  directInputOrTrigger: Locator | LegacyTrigger,
  filePath: string,
  localTriggerOrTimeout?: Locator | number,
): Promise<void> {
  if ('waitForFileChooser' in page) {
    await triggerOrReveal.hover();
    const chooserPromise = page.waitForFileChooser();
    const clickPromise = directInputOrTrigger.click();
    const chooser = await chooserPromise;
    await chooser.setFiles(filePath);
    await clickPromise;
    return;
  }
  const trigger = triggerOrReveal as Locator;
  const directInput = directInputOrTrigger as Locator;
  const localTrigger = typeof localTriggerOrTimeout === 'number' ? undefined : localTriggerOrTimeout;
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 10_000 })
    .catch(() => undefined);
  await trigger.click();
  if (localTrigger && await localTrigger.isVisible().catch(() => false)) {
    await localTrigger.click();
    const chooser = await chooserPromise;
    if (chooser) {
      await chooser.setFiles(filePath);
      return;
    }
  }
  if (await directInput.count() > 0) {
    await directInput.first().setInputFiles(filePath);
    return;
  }
  const chooser = await chooserPromise;
  if (!chooser) throw new Error('本地上传未形成文件输入或 filechooser 终态。');
  await chooser.setFiles(filePath);
}
