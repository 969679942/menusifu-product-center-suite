/** Pure routing and query-restoration helpers used by the group runner facade. */
import type { GroupAutomationBinding } from './product-center-group-automation';

export type GroupEntity = 'spec' | 'taste' | 'method' | 'addon' | 'combo';

export function entityForBinding(binding: GroupAutomationBinding): GroupEntity {
  if (binding.module.includes('规格')) return 'spec';
  if (binding.module.includes('口味')) return 'taste';
  if (binding.module.includes('做法')) return 'method';
  if (binding.module.includes('加料')) return 'addon';
  return 'combo';
}

export function groupQueryResetRestorationFailure(input: {
  identity: string;
  keyword: string;
  beforeCount: number;
  matchedRows: string[];
  resetRows: string[];
}): string | null {
  if (input.resetRows.length < 1) return '重置后列表为空';
  if (!input.resetRows.some((text) => text.includes(input.identity))) return '重置后原始记录未恢复';

  const queryNarrowedResults = input.matchedRows.length < input.beforeCount;
  const resetRemovedKeywordConstraint = input.resetRows.length > input.matchedRows.length
    || input.resetRows.some((text) => !text.includes(input.keyword));
  if (queryNarrowedResults && !resetRemovedKeywordConstraint) return '重置后结果仍受原查询条件约束';
  return null;
}

export function extractArray(value: unknown, key: string): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractArray(item, key);
      if (nested.length) return nested;
    }
    return [];
  }
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record[key])) {
    return record[key].filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  }
  for (const item of Object.values(record)) {
    const nested = extractArray(item, key);
    if (nested.length) return nested;
  }
  return [];
}

export function requireGroupRecord(value: unknown, identity: string): { id: number; name: string } {
  if (!value || typeof value !== 'object') throw new Error(`组记录无效：${identity}`);
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'number' || record.name !== identity) throw new Error(`组记录身份不匹配：${identity}`);
  return { id: record.id, name: identity };
}

export function containsNamedValue(value: unknown, identity: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsNamedValue(item, identity));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.name === identity) return true;
  return Object.values(record).some((item) => containsNamedValue(item, identity));
}

export function findFirstFieldValue(value: unknown, fieldName: string): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstFieldValue(item, fieldName);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (fieldName in record) return record[fieldName];
  for (const nested of Object.values(record)) {
    const found = findFirstFieldValue(nested, fieldName);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function containsScalarValue(value: unknown, expected: string | number): boolean {
  if (value === expected) return true;
  if (Array.isArray(value)) return value.some((item) => containsScalarValue(item, expected));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some((item) => containsScalarValue(item, expected));
}

export function findNamedSelectionRule(value: unknown, identity: string): { quantity: number | null; maxQuantity: number | null } {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findNamedSelectionRule(child, identity);
      if (found.quantity !== null || found.maxQuantity !== null) return found;
    }
    return { quantity: null, maxQuantity: null };
  }
  if (!value || typeof value !== 'object') return { quantity: null, maxQuantity: null };
  const record = value as Record<string, unknown>;
  if (record.name === identity && record.selectionRule && typeof record.selectionRule === 'object') {
    const rule = record.selectionRule as Record<string, unknown>;
    const quantity = Number(rule.quantity);
    const maxQuantity = Number(rule.maxQuantity);
    return {
      quantity: Number.isFinite(quantity) ? quantity : null,
      maxQuantity: Number.isFinite(maxQuantity) ? maxQuantity : null,
    };
  }
  for (const child of Object.values(record)) {
    const found = findNamedSelectionRule(child, identity);
    if (found.quantity !== null || found.maxQuantity !== null) return found;
  }
  return { quantity: null, maxQuantity: null };
}

export function findNamedAdditionalPrice(value: unknown, identity: string): number | null {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findNamedAdditionalPrice(child, identity);
      if (found !== null) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.name === identity && record.pricingRule && typeof record.pricingRule === 'object') {
    const price = Number((record.pricingRule as Record<string, unknown>).additionalPrice);
    return Number.isFinite(price) ? price : null;
  }
  for (const child of Object.values(record)) {
    const found = findNamedAdditionalPrice(child, identity);
    if (found !== null) return found;
  }
  return null;
}

export function responseIndicatesBusinessRejection(status: number, body: unknown): boolean {
  if (status < 200 || status >= 300) return true;
  if (!body || typeof body !== 'object') return false;
  const record = body as Record<string, unknown>;
  return record.success === false
    || (typeof record.code === 'number' && ![0, 200].includes(record.code));
}

export function businessMutationForEntity(entity: GroupEntity, pathname: string): boolean {
  const patterns: Record<GroupEntity, RegExp> = {
    spec: /\/brand-specs(?:\/|$)/,
    taste: /\/brand-modifiers(?:\/|$)/,
    method: /\/brand-modifiers(?:\/|$)/,
    addon: /\/brand-addon-group(?:\/|$)/,
    combo: /\/brand-sections(?:\/|$)/,
  };
  return patterns[entity].test(pathname);
}

export function namedRecords(value: unknown, identity: string, output: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const item of value) namedRecords(item, identity, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  const record = value as Record<string, unknown>;
  if ((typeof record.id === 'number' || typeof record.id === 'string') && record.name === identity) output.push(record);
  for (const child of Object.values(record)) namedRecords(child, identity, output);
  return output;
}

export function addonGroupContainsItem(value: unknown, itemId: number): boolean {
  if (Array.isArray(value)) return value.some((item) => addonGroupContainsItem(item, itemId));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (Number(record.itemId ?? record.addonItemId) === itemId) return true;
  return Object.values(record).some((child) => addonGroupContainsItem(child, itemId));
}

export function findNameById(value: unknown, id: number): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = findNameById(item, id);
      if (name !== undefined) return name;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (Number(record.id) === id && typeof record.name === 'string') return record.name;
  for (const child of Object.values(record)) {
    const name = findNameById(child, id);
    if (name !== undefined) return name;
  }
  return undefined;
}

export function readFirstSkuId(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const skuId = readFirstSkuId(item);
      if (skuId !== undefined) return skuId;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.skuList)) {
    const sku = record.skuList.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined;
    const candidate = sku?.skuId ?? sku?.id;
    if (Number(candidate) > 0) return Number(candidate);
  }
  for (const child of Object.values(record)) {
    const skuId = readFirstSkuId(child);
    if (skuId !== undefined) return skuId;
  }
  return undefined;
}

export function normalizeUiText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function assertUiTextContains(caseId: string, text: string, patterns: RegExp[]): void {
  const missing = patterns.filter((pattern) => !pattern.test(text));
  if (missing.length > 0) throw new Error(`${caseId} 页面文本缺少：${missing.map(String).join(', ')}`);
}
