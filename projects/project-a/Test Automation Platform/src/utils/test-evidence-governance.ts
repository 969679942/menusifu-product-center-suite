import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type TestEvidenceRole =
  | 'source-document'
  | 'human-rule-confirmation'
  | 'runtime-execution-receipt';

export type TestEvidenceAsset = {
  evidenceId: string;
  path: string;
  sha256: string;
  bytes: number;
  caseIds: string[];
  evidenceRole: TestEvidenceRole;
  runtimeProofEligible: boolean;
  captureContext: {
    applicationVersionFingerprint: string | null;
    capturedAt: string | null;
    route: string | null;
    locale: string | null;
  };
  limitations: string[];
};

export type TestEvidenceManifest = {
  schemaVersion: '1.0.0';
  generatedAt: string;
  evidencePolicy: typeof TEST_EVIDENCE_POLICY;
  assets: TestEvidenceAsset[];
};

export const TEST_EVIDENCE_POLICY = {
  humanRuleConfirmationAllowed: true,
  runtimePassRequiresExecutionReceipt: true,
  screenshotAloneCannotPass: true,
} as const;

export function buildHumanRuleEvidenceManifest(input: {
  workspaceRoot: string;
  evidenceRoot: string;
  relativeRoot: string;
  caseIdsByFile: Readonly<Record<string, readonly string[]>>;
  generatedAt?: string;
}): TestEvidenceManifest {
  const assets = Object.entries(input.caseIdsByFile).map(([fileName, caseIds]): TestEvidenceAsset => {
    const absolutePath = path.resolve(input.evidenceRoot, fileName);
    ensureInside(input.workspaceRoot, absolutePath);
    const buffer = fs.readFileSync(absolutePath);
    return {
      evidenceId: `human-rule-${fileName.replace(/\.[^.]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      path: `${input.relativeRoot.replaceAll('\\', '/')}/${fileName}`,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      bytes: buffer.length,
      caseIds: [...new Set(caseIds)].sort(),
      evidenceRole: 'human-rule-confirmation',
      runtimeProofEligible: false,
      captureContext: {
        applicationVersionFingerprint: null,
        capturedAt: null,
        route: null,
        locale: null,
      },
      limitations: [
        '截图或视频只能证明采集时的可见页面状态。',
        '人工确认证据可以修正规则和用例，但不能替代自动化重跑。',
        '人工确认证据不能单独证明写请求、服务端持久化、下游同步或清理终态。',
      ],
    };
  });
  return {
    schemaVersion: '1.0.0',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    evidencePolicy: TEST_EVIDENCE_POLICY,
    assets,
  };
}

export function validateTestEvidenceManifest(
  manifest: TestEvidenceManifest,
  workspaceRoot: string,
): string[] {
  const errors: string[] = [];
  if (!manifest.evidencePolicy.screenshotAloneCannotPass
    || !manifest.evidencePolicy.runtimePassRequiresExecutionReceipt) {
    errors.push('EVIDENCE_POLICY_RUNTIME_RECEIPT_REQUIRED');
  }
  const evidenceIds = new Set<string>();
  for (const asset of manifest.assets) {
    if (evidenceIds.has(asset.evidenceId)) errors.push(`EVIDENCE_ID_DUPLICATE:${asset.evidenceId}`);
    evidenceIds.add(asset.evidenceId);
    if (asset.caseIds.length === 0) errors.push(`EVIDENCE_CASE_REQUIRED:${asset.evidenceId}`);
    if (asset.evidenceRole === 'human-rule-confirmation' && asset.runtimeProofEligible) {
      errors.push(`HUMAN_EVIDENCE_RUNTIME_PROOF_FORBIDDEN:${asset.evidenceId}`);
    }
    const absolutePath = path.resolve(workspaceRoot, asset.path);
    try {
      ensureInside(workspaceRoot, absolutePath);
    } catch {
      errors.push(`EVIDENCE_PATH_OUTSIDE_WORKSPACE:${asset.evidenceId}`);
      continue;
    }
    if (!fs.existsSync(absolutePath)) {
      errors.push(`EVIDENCE_FILE_MISSING:${asset.evidenceId}`);
      continue;
    }
    const contents = fs.readFileSync(absolutePath);
    if (contents.length !== asset.bytes) errors.push(`EVIDENCE_SIZE_MISMATCH:${asset.evidenceId}`);
    if (createHash('sha256').update(contents).digest('hex') !== asset.sha256) {
      errors.push(`EVIDENCE_HASH_MISMATCH:${asset.evidenceId}`);
    }
  }
  return [...new Set(errors)].sort();
}

export function canEvidenceSetPassed(asset: TestEvidenceAsset): boolean {
  return asset.evidenceRole === 'runtime-execution-receipt'
    && asset.runtimeProofEligible
    && Boolean(asset.captureContext.applicationVersionFingerprint)
    && Boolean(asset.captureContext.capturedAt);
}

function ensureInside(rootDir: string, targetPath: string): void {
  const root = `${path.resolve(rootDir)}${path.sep}`.toLowerCase();
  const target = path.resolve(targetPath).toLowerCase();
  if (!target.startsWith(root)) throw new Error(`PATH_OUTSIDE_WORKSPACE:${targetPath}`);
}
