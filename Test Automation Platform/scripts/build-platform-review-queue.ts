import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  assessSystemTestPlatformRelease,
  buildSystemTestPlatformReviewQueue,
  type SystemTestPlatformRelease,
  type SystemTestPlatformReviewQueue,
} from '../src/automation/system-test/system-test-platform-review';
import type {
  SystemTestPilotEvidence,
  SystemTestPlatformReadiness,
  SystemTestReferenceBaselineEvidence,
} from '../src/automation/system-test/system-test-platform-readiness';

type ReadinessDocument = SystemTestPlatformReadiness & {
  referenceBaseline: SystemTestReferenceBaselineEvidence;
  pilots: SystemTestPilotEvidence[];
};

export type PlatformReviewQueueInput = {
  readiness: ReadinessDocument;
  outputPath: string;
  releasePath?: string;
  governanceFiles: readonly GovernanceFileReference[];
  workspaceRoot: string;
};

export type GovernanceFileReference = string | {
  path: string;
  identity: string;
};

export function buildPlatformReviewQueue(input: PlatformReviewQueueInput): string {
  const queue = buildSystemTestPlatformReviewQueue({
    readiness: input.readiness,
    referenceBaseline: input.readiness.referenceBaseline,
    pilots: input.readiness.pilots,
    governanceFingerprint: fingerprintGovernance(input.governanceFiles, input.workspaceRoot),
  });
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  fs.writeFileSync(input.outputPath, `${JSON.stringify({ ...queue, generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  if (input.releasePath) reconcilePlatformReleaseFile(input.releasePath, queue);
  return input.outputPath;
}

export function reconcilePlatformReleaseFile(
  releasePath: string,
  currentQueue: SystemTestPlatformReviewQueue,
): SystemTestPlatformRelease | undefined {
  if (!fs.existsSync(releasePath)) return undefined;
  const release = JSON.parse(fs.readFileSync(releasePath, 'utf8')) as SystemTestPlatformRelease;
  const assessed = assessSystemTestPlatformRelease({ release, currentQueue });
  if (assessed === release) return assessed;
  fs.mkdirSync(path.dirname(releasePath), { recursive: true });
  fs.writeFileSync(releasePath, `${JSON.stringify({ ...assessed, generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  return assessed;
}

export function fingerprintGovernance(
  governanceFiles: readonly GovernanceFileReference[],
  workspaceRoot: string,
): string {
  const entries = governanceFiles.map((reference) => {
    const filePath = typeof reference === 'string' ? reference : reference.path;
    const relativePath = path.relative(workspaceRoot, filePath);
    if (typeof reference === 'string' && path.isAbsolute(relativePath)) {
      throw new Error(`跨治理根文件必须提供稳定逻辑身份：${filePath}`);
    }
    const identity = typeof reference === 'string'
      ? relativePath.replaceAll(path.sep, '/')
      : reference.identity.trim();
    if (!identity) throw new Error(`治理文件逻辑身份不能为空：${filePath}`);
    return {
      identity,
      sha256: createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
    };
  }).sort((left, right) => left.identity.localeCompare(right.identity));
  const identities = new Set<string>();
  for (const entry of entries) {
    if (identities.has(entry.identity)) throw new Error(`治理文件逻辑身份重复：${entry.identity}`);
    identities.add(entry.identity);
  }
  return createHash('sha256').update(entries.map((item) => JSON.stringify(item)).join('|')).digest('hex');
}
