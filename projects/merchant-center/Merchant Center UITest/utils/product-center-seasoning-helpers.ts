/** Pure response and locator helpers used by the seasoning page facade. */
export function exactTextPattern(value: string): RegExp {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

export function readDistributionTargetPois(body: unknown): Array<{ poiId: string; poiName: string }> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  const targetPois = (body as Record<string, unknown>).targetPois;
  if (!Array.isArray(targetPois)) return [];
  return targetPois.flatMap((target) => {
    if (!target || typeof target !== 'object' || Array.isArray(target)) return [];
    const record = target as Record<string, unknown>;
    return typeof record.poiId === 'string' && typeof record.poiName === 'string'
      ? [{ poiId: record.poiId, poiName: record.poiName }]
      : [];
  });
}
