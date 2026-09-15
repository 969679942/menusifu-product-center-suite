/** Reconcile the source decision denominator before using its summary to gate
 * generation. Counts do not prove that source evidence itself is still current. */
export function reconcileIntakeSourceSummary(document: {
  summary?: { blockedCases?: unknown; totalCases?: unknown };
  cases?: Array<{ caseId?: unknown; status?: unknown }>;
}) {
  if (!Array.isArray(document.cases) || !document.summary) {
    throw new Error('INTAKE_SOURCE_DECISIONS_REQUIRED');
  }
  const seen = new Set<string>();
  const blockedCaseIds: string[] = [];
  for (const item of document.cases) {
    if (!item || typeof item.caseId !== 'string' || !item.caseId.trim()
      || !['blocked', 'verified', 'not-applicable'].includes(String(item.status))) {
      throw new Error('INTAKE_SOURCE_DECISION_INVALID');
    }
    if (seen.has(item.caseId)) throw new Error(`INTAKE_SOURCE_DECISION_DUPLICATE:${item.caseId}`);
    seen.add(item.caseId);
    if (item.status === 'blocked') blockedCaseIds.push(item.caseId);
  }
  if (document.summary.totalCases !== seen.size
    || document.summary.blockedCases !== blockedCaseIds.length) {
    throw new Error('INTAKE_SOURCE_SUMMARY_DRIFT');
  }
  return { totalCases: seen.size, blockedCases: blockedCaseIds.length, blockedCaseIds: blockedCaseIds.sort() };
}
