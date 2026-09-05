import type { ProductCenterApi } from '../../../api/product-center/product-center-api';

export type StoreProductSeedRecord = {
  id: number;
  identity: string;
  searchFragment: string;
  mutationAttempted: false;
};

type NamedRecord = { id: number; name: string };

export class ProductCenterStoreProductDataFactory {
  constructor(private readonly api: ProductCenterApi) {}

  async prepare(): Promise<StoreProductSeedRecord> {
    const initialPage = await this.api.storePoiProductPage();
    const candidates = findStoreProductRecords(initialPage);
    const candidatesToProbe = candidates.slice(0, 5);
    for (const candidate of candidatesToProbe) {
      const searchFragment = candidate.name.length > 4
        ? candidate.name.slice(0, -1)
        : candidate.name;
      const matches = findStoreProductRecords(await this.api.storePoiProductPage(searchFragment));
      if (
        matches.length === 1
        && matches[0].id === candidate.id
        && normalizeIdentity(matches[0].name) === normalizeIdentity(candidate.name)
      ) {
        return {
          id: candidate.id,
          identity: candidate.name,
          searchFragment,
          mutationAttempted: false,
        };
      }
    }
    throw new Error(
      `门店商品列表中没有可唯一模糊命中的既有商品，样本保持 blocked：候选 ${candidates.length}，已探测 ${candidatesToProbe.length}，结构 ${JSON.stringify(describeJsonShape(initialPage))}`,
    );
  }
}

function findStoreProductRecords(value: unknown): NamedRecord[] {
  if (!value || typeof value !== 'object') return [];
  const data = (value as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return [];
  const list = (data as Record<string, unknown>).list;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item): NamedRecord[] => {
    if (!item || typeof item !== 'object') return [];
    const itemBasic = (item as Record<string, unknown>).itemBasic;
    if (!itemBasic || typeof itemBasic !== 'object') return [];
    const basic = itemBasic as Record<string, unknown>;
    if (
      typeof basic.id !== 'number'
      || typeof basic.name !== 'string'
      || basic.name.trim().length < 4
    ) return [];
    return [{ id: basic.id, name: basic.name.trim() }];
  });
}

function normalizeIdentity(value: string): string {
  return value.replace(/\\_/g, '_');
}

function describeJsonShape(value: unknown, depth = 0): unknown {
  if (depth >= 4) return typeof value;
  if (Array.isArray(value)) {
    return { type: 'array', length: value.length, item: value.length > 0 ? describeJsonShape(value[0], depth + 1) : null };
  }
  if (!value || typeof value !== 'object') return typeof value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => [key, describeJsonShape(child, depth + 1)]),
  );
}
