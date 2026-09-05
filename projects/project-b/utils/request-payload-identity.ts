export function requestPayloadContainsIdentity(payload: unknown, identity: string): boolean {
  if (typeof payload === 'string') return payload === identity;
  if (Array.isArray(payload)) {
    return payload.some((value) => requestPayloadContainsIdentity(value, identity));
  }
  if (payload === null || typeof payload !== 'object') return false;
  return Object.values(payload).some((value) => requestPayloadContainsIdentity(value, identity));
}
