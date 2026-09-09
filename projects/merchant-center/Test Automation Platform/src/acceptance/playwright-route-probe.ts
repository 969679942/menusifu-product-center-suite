import { waitUntil } from '../utils/wait';
import type { RouteProbe } from './route-residue-scanner';

export type PlaywrightRouteProbeOptions = {
  baseURL: string;
  apiHosts: readonly string[];
};

export function createPlaywrightRouteProbe(
  context: { newPage(): Promise<any> },
  options: PlaywrightRouteProbeOptions,
): RouteProbe {
  const base = new URL(options.baseURL);
  const expectedOrigin = base.origin;
  const expectedHost = base.host;
  const apiHosts = new Set(options.apiHosts);

  return async (route, markerPrefix) => {
    const page = await context.newPage();
    const payloads: Promise<unknown>[] = [];
    let responseCount = 0;
    let previousResponseCount = -1;
    let stablePolls = 0;

    const collectResponse = (response: {
      url(): string;
      status(): number;
      headers(): Record<string, string>;
      json(): Promise<unknown>;
    }) => {
      const url = new URL(response.url());
      if (!apiHosts.has(url.host) || response.status() < 200 || response.status() >= 300) return;
      if (!(response.headers()['content-type'] ?? '').includes('json')) return;
      responseCount += 1;
      payloads.push(response.json().catch(() => null));
    };
    page.on('response', collectResponse);

    try {
      if (!route.path.startsWith('/') || route.path.startsWith('//') || route.path.includes('\\')) {
        throw new Error(`路由不得访问外部地址：${route.path}`);
      }
      const target = new URL(route.path, base);
      if (target.origin !== expectedOrigin) throw new Error(`路由不得跨源：${route.path}`);
      await page.goto(target.href, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      await waitUntil(
        async () => {
          const bodyText = await page.locator('body').innerText().catch(() => '');
          stablePolls = responseCount === previousResponseCount ? stablePolls + 1 : 0;
          previousResponseCount = responseCount;
          return { bodyReady: bodyText.trim().length > 20, responseCount, stablePolls };
        },
        ({ bodyReady, responseCount: observedResponses, stablePolls: settledPolls }) => (
          bodyReady && ((observedResponses > 0 && settledPolls >= 3) || settledPolls >= 20)
        ),
        {
          timeout: 30_000,
          interval: 250,
          message: `路由未达到可扫描终态：${route.path}`,
        },
      );

      const finalURL = new URL(page.url());
      if (finalURL.host !== expectedHost || finalURL.origin !== expectedOrigin) {
        throw new Error(`认证上下文失效：route=${route.path}`);
      }

      const bodyText = await page.locator('body').innerText();
      const payloadResults = await Promise.all(payloads);
      return {
        uiMarkers: collectTextMarkers(bodyText, markerPrefix),
        apiMarkers: payloadResults.flatMap((payload) => collectValueMarkers(payload, markerPrefix)),
      };
    } finally {
      page.off('response', collectResponse);
      await page.close().catch(() => undefined);
    }
  };
}

function collectTextMarkers(value: string, markerPrefix: string): string[] {
  const pattern = new RegExp(`${escapeRegExp(markerPrefix)}[A-Za-z0-9_-]+`, 'g');
  return [...new Set(value.match(pattern) ?? [])];
}

function collectValueMarkers(value: unknown, markerPrefix: string): string[] {
  if (typeof value === 'string') return collectTextMarkers(value.replaceAll('\\', ''), markerPrefix);
  if (Array.isArray(value)) return value.flatMap((item) => collectValueMarkers(item, markerPrefix));
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap((item) => collectValueMarkers(item, markerPrefix));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
