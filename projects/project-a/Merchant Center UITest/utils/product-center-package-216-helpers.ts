import type { Page, Response } from '@playwright/test';

export function referencesOverlap(expected: string[], actual: string[]): boolean {
  return expected.some((left) => actual.some((right) => (
    left === right || left.includes(right) || right.includes(left)
  )));
}

export function readRequestPayload(response: Response): unknown {
  try {
    return response.request().postDataJSON();
  } catch {
    const raw = response.request().postData();
    if (!raw) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
}

export function readItemBasicName(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = readItemBasicName(item);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const itemBasic = record.itemBasic;
  if (itemBasic && typeof itemBasic === 'object' && !Array.isArray(itemBasic)) {
    const name = (itemBasic as Record<string, unknown>).name;
    if (typeof name === 'string') return name;
  }
  for (const value of Object.values(record)) {
    const found = readItemBasicName(value);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function findImageReferences(value: unknown, output: string[] = [], key = ''): string[] {
  if (Array.isArray(value)) {
    for (const item of value) findImageReferences(item, output, key);
    return [...new Set(output)];
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'number' && /image.*id|brandImageId/i.test(key)) output.push(String(value));
    if (typeof value === 'string' && (
      /image|path|url/i.test(key)
      || /\.(?:png|jpe?g|webp|gif)(?:\?|$)/i.test(value)
      || /(?:^|\/)img\//i.test(value)
    )) output.push(value);
    return [...new Set(output)];
  }
  for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
    findImageReferences(child, output, childKey);
  }
  return [...new Set(output)];
}

export function containsExactString(value: unknown, expected: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsExactString(item, expected));
  if (!value || typeof value !== 'object') return value === expected;
  return Object.values(value as Record<string, unknown>).some((item) => containsExactString(item, expected));
}

export function containsKey(value: unknown, expected: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, expected));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(record, expected)
    || Object.values(record).some((item) => containsKey(item, expected));
}

export function findNamedResponseRecord(value: unknown, identity: string): { id: number } | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const record = findNamedResponseRecord(child, identity);
      if (record) return record;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.name === identity && Number(record.id) > 0) return { id: Number(record.id) };
  for (const child of Object.values(record)) {
    const found = findNamedResponseRecord(child, identity);
    if (found) return found;
  }
  return undefined;
}

export type CategoryNode = { name: string; depth: number; children: CategoryNode[] };

export function findCategoryNodes(value: unknown, depth = 0): CategoryNode[] {
  if (Array.isArray(value)) return value.flatMap((item) => findCategoryNodes(item, depth));
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string') {
    const children = Array.isArray(record.children)
      ? record.children.flatMap((item) => findCategoryNodes(item, depth + 1))
      : Array.isArray(record.childList) ? record.childList.flatMap((item) => findCategoryNodes(item, depth + 1)) : [];
    return [{ name: record.name, depth, children }, ...children.flatMap((child) => [child, ...child.children])];
  }
  return Object.values(record).flatMap((item) => findCategoryNodes(item, depth));
}

export async function captureResponse(
  page: Page,
  predicate: (response: Response) => boolean,
  trigger: () => Promise<void>,
  timeout: number,
  message: string,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      page.off('response', listener);
      clearTimeout(timer);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const listener = (response: Response) => {
      try {
        if (predicate(response)) finish(() => resolve(response));
      } catch (error) {
        finish(() => reject(error));
      }
    };
    const timer = setTimeout(() => finish(() => reject(new Error(`${message}，等待上限 ${timeout}ms`))), timeout);
    page.on('response', listener);
    void trigger().catch((error) => finish(() => reject(error)));
  });
}
