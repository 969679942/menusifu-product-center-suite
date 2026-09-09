import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadProjectAdapterDescriptor, resolveLifecycleReference } from '../src/governance/project-adapter';
import { buildProjectRemediationScope } from '../src/governance/project-remediation-scope';

type AssetIndex = {
  cases: Array<{
    caseId: string;
    module: string;
    canonicalPath: string;
    scriptPath?: string;
    runnerId?: string;
    status?: string;
    reason?: string;
  }>;
};

export function buildProjectRemediationScopeArtifact(input: {
  projectRoot: string;
  platformRoot?: string;
  generatedAt?: string;
}) {
  const platformRoot = path.resolve(input.platformRoot ?? path.resolve(__dirname, '..'));
  const adapter = loadProjectAdapterDescriptor(input.projectRoot, platformRoot);
  const configuration = adapter.descriptor.lifecycle?.remediationScope;
  if (!configuration) throw new Error('PROJECT_REMEDIATION_SCOPE_CONFIGURATION_REQUIRED');
  const landedPath = resolveLifecycleReference(adapter, configuration.landedIndex);
  const exclusionPath = resolveLifecycleReference(adapter, configuration.exclusionIndex);
  const landed = readIndex(landedPath);
  const excluded = readIndex(exclusionPath);
  // The adapter declaration is the authoritative expectation.  The indexes
  // are the observed values that must be compared against it; using observed
  // counts as both sides would make a truncated scope appear ready.
  const expectedLandedByModule = Object.fromEntries(
    Object.entries(configuration.modules).map(([module, item]) => [module, item.expectedLanded]),
  );
  const expectedExclusionsByStatus = configuration.expectedExclusionsByStatus;
  const registrationSources = Object.fromEntries(Object.entries(configuration.modules).map(([module, item]) => [
    module,
    item.registrationSources.map((reference) => {
      const sourcePath = resolveLifecycleReference(adapter, reference);
      if (!fs.existsSync(sourcePath)) throw new Error(`PROJECT_REMEDIATION_REGISTRATION_SOURCE_MISSING:${module}:${sourcePath}`);
      return fs.readFileSync(sourcePath, 'utf8');
    }),
  ]));
  const ownerRegistration = Object.fromEntries(landed.cases.map((item) => [
    item.caseId,
    (registrationSources[item.module] ?? []).some((source) => containsExactCaseId(source, item.caseId)),
  ]));
  const artifact = buildProjectRemediationScope({
    scopeId: configuration.scopeId,
    applicationId: adapter.descriptor.applicationId,
    projectId: adapter.descriptor.projectId,
    expectedLandedByModule,
    expectedExclusionsByStatus,
    cases: landed.cases.map((item) => ({
      caseId: item.caseId,
      module: item.module,
      canonicalPath: item.canonicalPath,
      ownerPath: item.scriptPath ?? '',
      runnerId: item.runnerId ?? '',
    })),
    exclusions: excluded.cases.map((item) => ({
      caseId: item.caseId,
      module: item.module,
      status: item.status ?? '',
      reason: item.reason ?? '',
    })),
    ownerRegistration,
    sourceFingerprints: {
      landedIndex: fingerprintFile(landedPath),
      exclusionIndex: fingerprintFile(exclusionPath),
      registrationSources: fingerprintValue(registrationSources),
    },
    generatedAt: input.generatedAt,
  });
  const outputPath = resolveProjectOutput(adapter.projectRoot, configuration.outputPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return { artifact, outputPath };
}

function countBy<T>(items: readonly T[], keyOf: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyOf(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function readIndex(filePath: string): AssetIndex {
  if (!fs.existsSync(filePath)) throw new Error(`PROJECT_REMEDIATION_INDEX_MISSING:${filePath}`);
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as AssetIndex;
  if (!Array.isArray(value.cases)) throw new Error(`PROJECT_REMEDIATION_INDEX_INVALID:${filePath}`);
  return value;
}

function resolveProjectOutput(projectRoot: string, relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error(`PROJECT_REMEDIATION_OUTPUT_PATH_INVALID:${relativePath}`);
  const resolved = path.resolve(projectRoot, relativePath);
  const relative = path.relative(projectRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`PROJECT_REMEDIATION_OUTPUT_PATH_OUTSIDE:${relativePath}`);
  return resolved;
}

function fingerprintFile(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fingerprintValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function containsExactCaseId(source: string, caseId: string): boolean {
  if (!caseId.trim()) return false;
  const escaped = caseId.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`).test(source);
}

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

if (require.main === module) {
  const projectRoot = path.resolve(argument('project-root') ?? process.cwd());
  const result = buildProjectRemediationScopeArtifact({ projectRoot });
  process.stdout.write(`${JSON.stringify({ status: result.artifact.status, landed: result.artifact.summary.actualLanded, exclusions: result.artifact.summary.actualExclusions, issues: result.artifact.issues.length, outputPath: result.outputPath })}\n`);
  if (result.artifact.status !== 'ready') process.exitCode = 1;
}
