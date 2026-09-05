export type ContractChangeReference = {
  collection: string;
  id: string;
  route?: string;
};

export type ExecutableCaseReference = {
  caseId: string;
  route?: string;
  sourceIds: readonly string[];
};

export type ImpactedCase = {
  caseId: string;
  match: 'source-id' | 'route-fallback';
  changeIds: string[];
};

export function planContractChangeImpact(
  changes: readonly ContractChangeReference[],
  cases: readonly ExecutableCaseReference[],
  options: { nonExecutableCollections?: readonly string[] } = {},
): ImpactedCase[] {
  const nonExecutableCollections = new Set(options.nonExecutableCollections ?? ['unresolved', 'traceability']);
  const impacts = new Map<string, ImpactedCase>();

  for (const change of changes) {
    const exactMatches = cases.filter((item) => item.sourceIds.includes(change.id));
    const matches = exactMatches.length > 0
      ? exactMatches.map((item) => ({ item, match: 'source-id' as const }))
      : change.route && !nonExecutableCollections.has(change.collection)
        ? cases
            .filter((item) => item.route === change.route)
            .map((item) => ({ item, match: 'route-fallback' as const }))
        : [];

    for (const { item, match } of matches) {
      const current = impacts.get(item.caseId);
      if (!current) {
        impacts.set(item.caseId, { caseId: item.caseId, match, changeIds: [change.id] });
        continue;
      }
      current.changeIds.push(change.id);
      if (match === 'source-id') current.match = 'source-id';
    }
  }

  return [...impacts.values()]
    .map((item) => ({ ...item, changeIds: [...new Set(item.changeIds)].sort() }))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
}
