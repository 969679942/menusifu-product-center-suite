import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';

export type ProductCenterApplicationVersion = {
  fingerprint: string | null;
  signals: string[];
  status: 'verified' | 'derived' | 'unavailable';
  source: string;
  stable: boolean;
};

export async function readProductCenterApplicationVersion(
  page: Page,
): Promise<ProductCenterApplicationVersion> {
  const configuredVersion = process.env.PC_APP_VERSION?.trim();
  const pageSignals = await page.evaluate(() => {
    const currentOrigin = window.location.origin;
    const assetUrls = [
      ...Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]')).map((item) => item.src),
      ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')).map((item) => item.href),
    ];
    const normalizedEntryAssets = assetUrls.flatMap((value) => {
      try {
        const url = new URL(value, window.location.href);
        const filename = url.pathname.split('/').at(-1) ?? '';
        return url.origin === currentOrigin
          && /(?:^|[._-])(main|runtime|app)(?:[._-]|$)/i.test(filename)
          ? [`entry-asset:${url.pathname}`]
          : [];
      } catch {
        return [];
      }
    });
    const versionedAssets = assetUrls.flatMap((value) => {
      try {
        const url = new URL(value, window.location.href);
        return url.origin === currentOrigin && /\.(?:js|css)$/i.test(url.pathname)
          ? [`asset:${url.pathname}`]
          : [];
      } catch {
        return [];
      }
    });
    const metadata = Array.from(document.querySelectorAll<HTMLMetaElement>(
      'meta[name="build-version"],meta[name="app-version"],meta[name="release"]',
    )).flatMap((item) => item.content.trim() ? [`meta:${item.name}:${item.content.trim()}`] : []);
    const documentVersion = document.documentElement.dataset.buildVersion?.trim()
      || document.documentElement.dataset.appVersion?.trim();
    const strongSignals = [...new Set([
      ...normalizedEntryAssets,
      ...metadata,
      ...(documentVersion ? [`document:${documentVersion}`] : []),
    ])].sort();
    return strongSignals.length > 0 ? strongSignals : [...new Set(versionedAssets)].sort();
  });
  const signals = [...new Set([
    ...(configuredVersion ? [`configured:${configuredVersion}`] : []),
    ...pageSignals,
  ])].sort();

  return {
    fingerprint: signals.length > 0
      ? createHash('sha256').update(JSON.stringify(signals)).digest('hex')
      : null,
    signals,
    status: configuredVersion ? 'verified' : pageSignals.length > 0 ? 'derived' : 'unavailable',
    source: configuredVersion ? 'configured-release-identity' : pageSignals.length > 0 ? 'browser-runtime' : 'unavailable',
    stable: Boolean(configuredVersion),
  };
}
