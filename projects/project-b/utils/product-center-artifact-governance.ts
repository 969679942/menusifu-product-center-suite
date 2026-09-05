export type ProductCenterArtifactKind = 'acceptance' | 'audit' | 'checkpoint' | 'evidence' | 'performance';

const retentionDays: Record<ProductCenterArtifactKind, number> = {
  acceptance: 90,
  audit: 90,
  checkpoint: 7,
  evidence: 30,
  performance: 14,
};

export function auditUtf8Artifact(path: string, content: Buffer) {
  let validUtf8 = true;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    validUtf8 = false;
  }
  const text = content.toString('utf8');
  return {
    path,
    validUtf8,
    hasBom: content.length >= 3 && content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf,
    replacementCharacters: [...text].filter((character) => character === '\uFFFD').length,
  };
}

export function buildProductCenterArtifactRetentionAudit(input: {
  now: string;
  artifacts: ReadonlyArray<{
    path: string;
    kind: ProductCenterArtifactKind;
    generatedAt: string;
    checkpointPhase?: string;
  }>;
}) {
  const now = parseDate(input.now, '治理审计时间无效');
  const cleanupAlerts: string[] = [];
  const expiredCandidates: string[] = [];
  const records = input.artifacts.map((artifact) => {
    const generatedAt = parseDate(artifact.generatedAt, `产物时间无效：${artifact.path}`);
    const ageDays = Math.floor((now.getTime() - generatedAt.getTime()) / 86_400_000);
    const completedCheckpointPhases = new Set([
      'no-resources',
      'residue-verified',
      'workflow-complete',
    ]);
    const incompleteCheckpoint = artifact.kind === 'checkpoint'
      && artifact.checkpointPhase !== undefined
      && !completedCheckpointPhases.has(artifact.checkpointPhase);
    if (incompleteCheckpoint) cleanupAlerts.push(artifact.path);
    const expired = ageDays > retentionDays[artifact.kind] && !incompleteCheckpoint;
    if (expired) expiredCandidates.push(artifact.path);
    return {
      ...artifact,
      ageDays,
      retentionDays: retentionDays[artifact.kind],
      expired,
      protectedFromDeletion: incompleteCheckpoint,
    };
  });
  return {
    deletionMode: 'report-only' as const,
    policy: { ...retentionDays, incompleteCheckpointAutoDeleteAllowed: false },
    summary: {
      total: records.length,
      expiredCandidates: expiredCandidates.length,
      cleanupAlerts: cleanupAlerts.length,
    },
    expiredCandidates: expiredCandidates.sort(),
    cleanupAlerts: cleanupAlerts.sort(),
    records,
  };
}

function parseDate(value: string, message: string): Date {
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new Error(message);
  return result;
}
