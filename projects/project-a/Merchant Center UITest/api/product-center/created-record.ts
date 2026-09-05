export type CreatedRecord = {
  id: number;
  name: string;
};

export function extractCreatedRecord(value: unknown, identity: string): CreatedRecord | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const response = value as Record<string, unknown>;
  const data = response.data;
  const candidate = typeof data === 'number' || typeof data === 'string'
    ? data
    : data && typeof data === 'object'
      ? (data as Record<string, unknown>).id
      : response.id;
  const id = Number(candidate);
  return Number.isFinite(id) ? { id, name: identity } : undefined;
}