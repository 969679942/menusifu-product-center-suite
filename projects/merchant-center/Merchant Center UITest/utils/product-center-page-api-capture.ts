import type { Page, Request, Response } from '@playwright/test';
import {
  normalizeProductCenterObservedApiExchange,
  type ProductCenterObservedApiExchange,
} from './product-center-api-observation';

export type ProductCenterPageApiCapture = {
  exchanges: ProductCenterObservedApiExchange[];
  stop: () => Promise<ProductCenterObservedApiExchange[]>;
};

export function startProductCenterPageApiCapture(
  page: Page,
  input: {
    caseId: string;
    route: string;
    evidencePath: string;
    observedAt?: string;
    include?: (request: Request) => boolean;
  },
): ProductCenterPageApiCapture {
  const startedAt = input.observedAt ?? new Date().toISOString();
  const requests = new Map<string, { request: Request; body?: unknown }>();
  const exchanges: ProductCenterObservedApiExchange[] = [];
  const include = input.include ?? ((request: Request) => /\/(ops-|item\/v|platform-item\/)/i.test(request.url()));
  const onRequest = (request: Request) => {
    if (!include(request)) return;
    requests.set(requestKey(request), { request, body: parseJson(request.postData()) });
  };
  const onResponse = async (response: Response) => {
    // Capture only request/response evidence; authentication headers are never persisted.
    const request = response.request();
    const captured = requests.get(requestKey(request));
    if (!captured) return;
    exchanges.push(normalizeProductCenterObservedApiExchange({
      caseId: input.caseId,
      route: input.route,
      method: request.method(),
      url: request.url(),
      status: response.status(),
      requestBody: captured.body,
      responseBody: await readJson(response),
      evidencePath: input.evidencePath,
      observedAt: startedAt,
    }));
    requests.delete(requestKey(request));
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  return {
    exchanges,
    stop: async () => {
      page.off('request', onRequest);
      page.off('response', onResponse);
      await Promise.all([...requests.values()].map(async ({ request, body }) => {
        exchanges.push(normalizeProductCenterObservedApiExchange({
          caseId: input.caseId,
          route: input.route,
          method: request.method(),
          url: request.url(),
          requestBody: body,
          evidencePath: input.evidencePath,
          observedAt: startedAt,
        }));
      }));
      requests.clear();
      return [...exchanges];
    },
  };
}

function requestKey(request: Request): string {
  return `${request.method()} ${request.url()}`;
}

function parseJson(value: string | null): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
