type JsonRecord = Record<string, unknown>;

/** Map only the declared intake-v1 identity/source aliases. Missing claim or
 * execution evidence stays missing so the downstream draft validator rejects it.
 * A case-wide source citation is never evidence for an individual claim. */
export function adaptIntakeV1ToDraft(input: unknown): unknown {
  if (!isRecord(input) || input.schemaVersion !== '1.0.0'
    || input.collectionId !== 'product-center-test-plan-intake-v1'
    || !Array.isArray(input.cases)) return input;
  return {
    ...input,
    cases: input.cases.map((item) => {
      if (!isRecord(item)) return item;
      return {
        ...item,
        id: item.canonicalId,
        sourceRefs: item.sourceRefs !== undefined ? item.sourceRefs
          : Array.isArray(item.sourceTrace)
            ? item.sourceTrace.flatMap((trace) => isRecord(trace) && Array.isArray(trace.sourceRefs)
              ? trace.sourceRefs : [])
            : undefined,
      };
    }),
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
