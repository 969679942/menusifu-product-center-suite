import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ProductCenterDriftRepairProposal } from './product-center-drift-repair-proposal';

export type ProductCenterDriftRepairApplication = {
  findingId: string;
  proposalFingerprint: string;
  status: 'applied';
  changedFiles: Array<{
    path: string;
    beforeSha256: string;
    afterSha256: string;
  }>;
};

export function verifyProductCenterDriftRepairApplication(input: {
  rootDir: string;
  proposal: ProductCenterDriftRepairProposal;
  approvedFindings: readonly string[];
  applications: readonly ProductCenterDriftRepairApplication[];
}) {
  if (input.proposal.status === 'blocked') {
    throw new Error('阻断型漂移不可进入技术修复应用阶段');
  }
  if (input.proposal.status === 'no-change') {
    return { status: 'no-change' as const, appliedFindingIds: [], changedFiles: [] };
  }
  const approved = new Set(input.approvedFindings);
  const applicationByFinding = new Map(input.applications.map((item) => [item.findingId, item]));
  const appliedFindingIds: string[] = [];
  const changedFiles: string[] = [];
  for (const entry of input.proposal.entries) {
    if (!approved.has(entry.approvalKey) && !approved.has(entry.findingId)) {
      throw new Error(`技术修复应用缺少 finding 批准：${entry.approvalKey}`);
    }
    if (entry.disposition === 'baseline-promotion-review') continue;
    const application = applicationByFinding.get(entry.findingId);
    if (!application || application.proposalFingerprint !== input.proposal.fingerprint) {
      throw new Error(`技术修复应用证明缺失或 proposal 指纹不匹配：${entry.approvalKey}`);
    }
    if (application.changedFiles.length === 0) {
      throw new Error(`技术修复应用证明没有变更文件：${entry.approvalKey}`);
    }
    for (const changed of application.changedFiles) {
      const absolutePath = resolveAllowedTechnicalPath(input.rootDir, changed.path);
      if (changed.beforeSha256 === changed.afterSha256) {
        throw new Error(`技术修复 before/after 哈希相同：${changed.path}`);
      }
      if (sha256(fs.readFileSync(absolutePath)) !== changed.afterSha256) {
        throw new Error(`技术修复当前文件未命中 after 哈希：${changed.path}`);
      }
      changedFiles.push(normalizePath(path.relative(input.rootDir, absolutePath)));
    }
    appliedFindingIds.push(entry.findingId);
  }
  return {
    status: appliedFindingIds.length > 0 ? 'applied' as const : 'baseline-only' as const,
    appliedFindingIds: [...new Set(appliedFindingIds)].sort(),
    changedFiles: [...new Set(changedFiles)].sort(),
  };
}

function resolveAllowedTechnicalPath(rootDir: string, relativePath: string): string {
  const normalized = normalizePath(relativePath).replace(/^\.\//, '');
  const allowedRoots = ['adapters/', 'automation/', 'flows/', 'pages/', 'reporters/', 'scripts/', 'tests/', 'utils/'];
  if (!allowedRoots.some((root) => normalized.startsWith(root))) {
    throw new Error(`技术修复应用文件不在允许目录：${relativePath}`);
  }
  const absoluteRoot = path.resolve(rootDir);
  const absolutePath = path.resolve(absoluteRoot, normalized);
  if (!absolutePath.startsWith(`${absoluteRoot}${path.sep}`) || !fs.existsSync(absolutePath)) {
    throw new Error(`技术修复应用文件不存在或越界：${relativePath}`);
  }
  return absolutePath;
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}
