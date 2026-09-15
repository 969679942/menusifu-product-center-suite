import fs from 'node:fs';
import path from 'node:path';
import { buildSystemTestPlatformReadiness } from './build-platform-readiness';
import { buildPlatformReviewQueue, type GovernanceFileReference } from './build-platform-review-queue';
import {
  assertSystemTestFinalGoal,
  evaluateSystemTestFinalGoal,
  type SystemTestFinalGoalVerdict,
} from '../src/automation/system-test/system-test-final-goal-gate';
import type { SystemTestPlatformReadiness } from '../src/automation/system-test/system-test-platform-readiness';
import { reconcileSystemTestExternalDependency } from '../src/automation/system-test/system-test-external-dependency';
import {
  loadProjectAdapterDescriptor,
  resolveLifecycleReference,
  type ResolvedProjectAdapter,
} from '../src/governance/project-adapter';
import {
  auditMigrationClosureFile,
  loadMigrationClosureManifest,
  writeMigrationClosureReport,
} from '../src/governance/migration-closure';
import {
  assertSystemTestArtifactIdentity,
  resolveSystemTestPlatformArtifact,
} from '../src/platform-paths';

export type ProjectLifecycleAction = 'readiness' | 'review' | 'verdict' | 'strict' | 'close';

export type ProjectLifecycleResult = {
  action: ProjectLifecycleAction;
  projectRoot: string;
  readinessStatus?: string;
  readinessPath?: string;
  reviewQueuePath?: string;
  verdictPath?: string;
  externalDependencyPath?: string;
  migrationStatus?: string;
  migrationReportPath?: string;
};

const platformRoot = path.resolve(__dirname, '..');

export function runProjectLifecycle(input: {
  projectRoot: string;
  action: ProjectLifecycleAction;
}): ProjectLifecycleResult {
  const adapter = loadProjectAdapterDescriptor(input.projectRoot, platformRoot);
  const lifecycle = adapter.descriptor.lifecycle;
  if (!lifecycle || adapter.descriptor.status !== 'initialized') {
    throw new Error(`项目生命周期尚未配置：${adapter.descriptorPath}`);
  }
  assertSystemTestArtifactIdentity(adapter.artifactRoot, {
    applicationId: adapter.descriptor.applicationId,
    projectId: adapter.descriptor.projectId,
    artifactRoot: adapter.descriptor.artifactRoot,
  });
  const migrationManifest = loadMigrationClosureManifest(adapter.migrationManifestPath);
  if (migrationManifest.applicationId !== adapter.descriptor.applicationId) {
    throw new Error(`迁移清单 applicationId 与项目适配描述不一致：${migrationManifest.applicationId}`);
  }
  const result: ProjectLifecycleResult = {
    action: input.action,
    projectRoot: adapter.projectRoot,
  };
  const preflightMigrationReport = auditMigrationClosureFile(adapter.migrationManifestPath);
  const preflightOutputs = writeMigrationClosureReport(adapter.migrationManifestPath, preflightMigrationReport);
  if (preflightMigrationReport.status !== 'complete') {
    if (input.action === 'close') {
      return {
        ...result,
        migrationStatus: preflightMigrationReport.status,
        migrationReportPath: preflightOutputs.jsonPath,
      };
    }
    throw new Error(`PROJECT_MIGRATION_NOT_COMPLETE:${preflightMigrationReport.inputFingerprint}`);
  }
  const readiness = buildReadiness(adapter);
  if (input.action === 'readiness') return { ...result, ...readiness };
  if (input.action === 'review') return { ...result, ...readiness, reviewQueuePath: buildReviewQueue(adapter) };
  if (input.action === 'verdict') return { ...result, ...readiness, verdictPath: writeVerdict(adapter) };
  if (input.action === 'strict') {
    const verdictPath = writeVerdict(adapter);
    assertSystemTestFinalGoal(readReadiness(adapter));
    return { ...result, ...readiness, verdictPath };
  }

  const reviewQueuePath = buildReviewQueue(adapter);
  const verdictPath = writeVerdict(adapter);
  const externalDependencyPath = reconcileExternalDependency(adapter, verdictPath);
  const migrationReport = auditMigrationClosureFile(adapter.migrationManifestPath);
  const outputs = writeMigrationClosureReport(adapter.migrationManifestPath, migrationReport);
  return {
    ...result,
    ...readiness,
    reviewQueuePath,
    verdictPath,
    externalDependencyPath,
    migrationStatus: migrationReport.status,
    migrationReportPath: outputs.jsonPath,
  };
}

function buildReadiness(adapter: ResolvedProjectAdapter): {
  readinessStatus: string;
  readinessPath: string;
} {
  const lifecycle = adapter.descriptor.lifecycle!;
  const readinessPath = artifactPath(adapter, 'readiness.json');
  const result = buildSystemTestPlatformReadiness({
    projectRoot: adapter.projectRoot,
    workspaceRoot: adapter.workspaceRoot,
    referenceClosureAuditPath: lifecycle.referenceClosureAuditPath,
    referenceModule: lifecycle.referenceModule,
    applicationId: adapter.descriptor.applicationId,
    businessDomainId: lifecycle.businessDomainId,
    outputPath: readinessPath,
    executionIndexPath: artifactPath(adapter, 'execution-index.json'),
    systemsRoot: lifecycle.systemsRoot,
    systemOutputRoot: lifecycle.systemOutputRoot,
  });
  return { readinessStatus: result.status, readinessPath };
}

function buildReviewQueue(adapter: ResolvedProjectAdapter): string {
  const lifecycle = adapter.descriptor.lifecycle!;
  const readiness = readReadiness(adapter) as Parameters<typeof buildPlatformReviewQueue>[0]['readiness'];
  const governanceFiles = deduplicateGovernanceFiles([
    ...collectPlatformGovernanceFiles(adapter.platformRoot).map((filePath) => ({
      path: filePath,
      identity: `platform/${path.relative(adapter.platformRoot, filePath).replaceAll(path.sep, '/')}`,
    })),
    { path: adapter.descriptorPath, identity: `project/${path.relative(adapter.projectRoot, adapter.descriptorPath).replaceAll(path.sep, '/')}` },
    { path: adapter.migrationManifestPath, identity: `project/${path.relative(adapter.projectRoot, adapter.migrationManifestPath).replaceAll(path.sep, '/')}` },
    { path: path.join(adapter.projectRoot, 'package.json'), identity: 'project/package.json' },
    ...lifecycle.governanceFiles.map((reference) => ({
      path: resolveLifecycleReference(adapter, reference),
      identity: `${reference.root}/${reference.path.replaceAll('\\', '/')}`,
    })),
  ]);
  for (const file of governanceFiles) {
    const filePath = file.path;
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`生命周期治理文件不存在：${filePath}`);
    }
  }
  return buildPlatformReviewQueue({
    readiness,
    outputPath: artifactPath(adapter, 'platform-review-queue.json'),
    releasePath: artifactPath(adapter, 'platform-release.json'),
    governanceFiles: governanceFiles.sort((left, right) => left.identity.localeCompare(right.identity)),
    workspaceRoot: adapter.governanceRoot,
  });
}

function deduplicateGovernanceFiles(files: GovernanceFileReference[]): Array<{ path: string; identity: string }> {
  const byIdentity = new Map<string, { path: string; identity: string }>();
  for (const file of files) {
    if (typeof file === 'string') throw new Error('生命周期治理文件必须使用逻辑身份');
    const existing = byIdentity.get(file.identity);
    if (existing && path.resolve(existing.path) !== path.resolve(file.path)) {
      throw new Error(`生命周期治理逻辑身份映射冲突：${file.identity}`);
    }
    byIdentity.set(file.identity, file);
  }
  return [...byIdentity.values()];
}

function writeVerdict(adapter: ResolvedProjectAdapter): string {
  const verdictPath = artifactPath(adapter, 'final-goal-verdict.json');
  const verdict = evaluateSystemTestFinalGoal(readReadiness(adapter));
  fs.writeFileSync(verdictPath, `${JSON.stringify({ ...verdict, generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  return verdictPath;
}

function reconcileExternalDependency(adapter: ResolvedProjectAdapter, verdictPath: string): string {
  const lifecycle = adapter.descriptor.lifecycle!;
  const outputPath = artifactPath(adapter, 'platform-external-dependency.json');
  const existing = fs.existsSync(outputPath)
    ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) as Record<string, unknown>
    : undefined;
  const verdict = JSON.parse(fs.readFileSync(verdictPath, 'utf8')) as SystemTestFinalGoalVerdict;
  const reconciled = reconcileSystemTestExternalDependency({
    existing,
    verdict,
    applicationId: adapter.descriptor.applicationId,
    businessDomainId: lifecycle.businessDomainId,
  });
  fs.writeFileSync(outputPath, `${JSON.stringify(reconciled, null, 2)}\n`, 'utf8');
  return outputPath;
}

function readReadiness(adapter: ResolvedProjectAdapter): SystemTestPlatformReadiness {
  const readinessPath = artifactPath(adapter, 'readiness.json');
  if (!fs.existsSync(readinessPath)) throw new Error(`平台 readiness 尚未生成：${readinessPath}`);
  return JSON.parse(fs.readFileSync(readinessPath, 'utf8')) as SystemTestPlatformReadiness;
}

function artifactPath(adapter: ResolvedProjectAdapter, fileName: string): string {
  return resolveSystemTestPlatformArtifact(fileName, adapter.artifactRoot, {
    expectedApplicationId: adapter.descriptor.applicationId,
    expectedProjectId: adapter.descriptor.projectId,
    expectedArtifactRoot: adapter.descriptor.artifactRoot,
    requireIdentity: true,
  });
}

function collectPlatformGovernanceFiles(root: string): string[] {
  const files: string[] = [];
  for (const relativeRoot of ['src', 'scripts']) {
    const directory = path.join(root, relativeRoot);
    visit(directory, files);
  }
  for (const fileName of ['package.json', 'ownership.json', 'README.md']) {
    const filePath = path.join(root, fileName);
    if (fs.existsSync(filePath)) files.push(filePath);
  }
  return files;
}

function visit(directory: string, files: string[]): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(target, files);
    else if (entry.isFile() && /\.(?:ts|json|md)$/.test(entry.name)) files.push(target);
  }
}

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

if (require.main === module) {
  const projectRoot = argument('project-root');
  const action = argument('action') as ProjectLifecycleAction | undefined;
  if (!projectRoot || !action || !['readiness', 'review', 'verdict', 'strict', 'close'].includes(action)) {
    throw new Error('用法：--project-root=<path> --action=<readiness|review|verdict|strict|close>');
  }
  const result = runProjectLifecycle({ projectRoot, action });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (action === 'close' && result.migrationStatus !== 'complete') process.exitCode = 1;
}
