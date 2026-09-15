export function findExactNamedRecord(value: unknown, identity: string): { id: number; name: string } | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findExactNamedRecord(child, identity);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string' && record.name === identity && Number.isFinite(Number(record.id))) {
    return { id: Number(record.id), name: record.name };
  }
  for (const child of Object.values(record)) {
    const found = findExactNamedRecord(child, identity);
    if (found) return found;
  }
  return undefined;
}

export function findExactNamedStatus(value: unknown, identity: string): number | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findExactNamedStatus(child, identity);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.name === identity) {
    const basicInfo = record.basicInfo && typeof record.basicInfo === 'object'
      ? record.basicInfo as Record<string, unknown>
      : undefined;
    const status = Number(record.status ?? record.itemStatus ?? basicInfo?.status);
    if (Number.isFinite(status)) return status;
  }
  for (const child of Object.values(record)) {
    const found = findExactNamedStatus(child, identity);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function isBusinessFailure(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const code = record.code;
  return record.success === false
    || typeof code === 'string' && code !== '' && code !== '0' && code.toLowerCase() !== 'success'
    || typeof code === 'number' && code !== 0;
}

export function containsExactString(value: unknown, expected: string): boolean {
  if (typeof value === 'string') return value === expected;
  if (Array.isArray(value)) return value.some((item) => containsExactString(item, expected));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some((item) => containsExactString(item, expected));
}

export function collectExactStringPaths(value: unknown, expected: string, path = '$', output: string[] = []): string[] {
  if (value === expected) output.push(path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectExactStringPaths(item, expected, `${path}[${index}]`, output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    collectExactStringPaths(child, expected, `${path}.${key}`, output);
  }
  return output;
}

export type NamedOptionState = {
  found: boolean;
  defaultSelected: boolean;
  price: number | null;
  path: string;
};

export function readNamedOptionState(value: unknown, optionName: string): NamedOptionState {
  return readNamedOptionStates(value, optionName)[0]
    ?? { found: false, defaultSelected: false, price: null, path: '$' };
}

export function readNamedOptionStates(
  value: unknown,
  optionName: string,
  path = '$',
  output: NamedOptionState[] = [],
): NamedOptionState[] {
  if (Array.isArray(value)) {
    value.forEach((child, index) => readNamedOptionStates(child, optionName, `${path}[${index}]`, output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  const record = value as Record<string, unknown>;
  if (record.name === optionName) {
    const pricingRule = record.pricingRule && typeof record.pricingRule === 'object'
      ? record.pricingRule as Record<string, unknown>
      : undefined;
    const rawPrice = record.priceAdjustment ?? record.additionalPrice ?? pricingRule?.additionalPrice;
    const price = Number(rawPrice);
    output.push({
      found: true,
      defaultSelected: record.defaultSelected === true,
      price: Number.isFinite(price) ? price : null,
      path,
    });
  }
  for (const [key, child] of Object.entries(record)) {
    readNamedOptionStates(child, optionName, `${path}.${key}`, output);
  }
  return output;
}

export function findNamedRecord(value: unknown, name: string): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNamedRecord(item, name);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.name === name) return record;
  for (const child of Object.values(record)) {
    const found = findNamedRecord(child, name);
    if (found) return found;
  }
  return undefined;
}

export function readImageReferences(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.flatMap(readImageReferences))];
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const direct = ['imagePath', 'imageUrl', 'iconPath', 'iconUrl']
    .map((key) => record[key])
    .filter((item): item is string => typeof item === 'string' && item.length > 0);
  return [...new Set([...direct, ...Object.values(record).flatMap(readImageReferences)])];
}

export function readPriceSnapshot(value: unknown, path = '$'): Record<string, number | string> {
  const result: Record<string, number | string> = {};
  if (Array.isArray(value)) {
    value.forEach((item, index) => Object.assign(result, readPriceSnapshot(item, `${path}[${index}]`)));
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (/price|cost|fee/i.test(key) && (typeof child === 'number' || typeof child === 'string')) {
      result[childPath] = child;
    } else {
      Object.assign(result, readPriceSnapshot(child, childPath));
    }
  }
  return result;
}
