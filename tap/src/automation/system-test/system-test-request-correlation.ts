export interface SystemTestRequestObservation {
  method: string;
  url: string;
  postData?: unknown;
}

export interface SystemTestRequestCorrelation {
  method: string;
  pathSuffix: string;
  expectedValue?: string;
  queryParameter?: string;
  bodyPath?: string;
}

/**
 * Matches a network request to the exact UI input transition that initiated it.
 * Path-only matching is intentionally insufficient for debounced list queries,
 * because the previous request can finish after the next input has been filled.
 */
export function matchesSystemTestRequest(
  observation: SystemTestRequestObservation,
  contract: SystemTestRequestCorrelation,
): boolean {
  if (observation.method.toUpperCase() !== contract.method.toUpperCase()) return false;
  const url = new URL(observation.url);
  if (!url.pathname.endsWith(contract.pathSuffix)) return false;
  if (contract.queryParameter) {
    return (url.searchParams.get(contract.queryParameter) ?? '') === (contract.expectedValue ?? '');
  }
  if (contract.bodyPath) {
    return String(readPath(observation.postData, contract.bodyPath) ?? '') === (contract.expectedValue ?? '');
  }
  return true;
}

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}
