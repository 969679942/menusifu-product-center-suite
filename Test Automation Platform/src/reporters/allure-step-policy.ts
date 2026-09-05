export type BusinessStepAllureOptions = {
  detail: false;
  outputFolder: string;
  suiteTitle: boolean;
};

const BUSINESS_STEP_CATEGORIES = new Set(['test.step', 'attach', 'test.attach']);

export function createBusinessStepAllureOptions(input: {
  outputFolder: string;
  suiteTitle?: boolean;
}): BusinessStepAllureOptions {
  return {
    detail: false,
    outputFolder: input.outputFolder,
    suiteTitle: input.suiteTitle ?? false,
  };
}

export function shouldIncludeAllureStep(input: {
  detail: boolean;
  category: string;
}): boolean {
  return input.detail || BUSINESS_STEP_CATEGORIES.has(input.category);
}
export function renderBusinessStepTitle(template: string, args: readonly unknown[]): string {
  const namedValues = new Map<string, unknown>();
  const positionalValues: unknown[] = [];

  for (const argument of args) {
    if (isPlainRecord(argument)) {
      for (const [key, value] of Object.entries(argument)) namedValues.set(key, value);
      continue;
    }
    if (isBusinessStepValue(argument)) positionalValues.push(argument);
  }

  let positionalIndex = 0;
  return template.replace(/\{([^{}]+)\}/g, (_match, key: string) => {
    if (/^\d+$/.test(key)) {
      const indexedValue = args[Number(key)];
      return indexedValue === undefined ? `未提供第${Number(key) + 1}个参数` : formatBusinessStepValue(indexedValue);
    }
    const namedValue = namedValues.get(key);
    if (namedValue !== undefined) return formatBusinessStepValue(namedValue);
    const positionalValue = positionalValues[positionalIndex++];
    return positionalValue === undefined ? `未提供${key}` : formatBusinessStepValue(positionalValue);
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBusinessStepValue(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean', 'bigint'].includes(typeof value);
}

function formatBusinessStepValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatBusinessStepValue).join('、');
  if (value === null) return '空';
  return String(value);
}

