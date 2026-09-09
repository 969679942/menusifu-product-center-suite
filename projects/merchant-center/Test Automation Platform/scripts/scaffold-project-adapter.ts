import fs from 'node:fs';
import path from 'node:path';
import type { MigrationClosureManifest } from '../src/governance/migration-closure';
import type {
  ProjectAdapterDescriptor,
  ProjectLifecycleConfiguration,
} from '../src/governance/project-adapter';
import {
  assertSystemTestArtifactIdentity,
  initializeSystemTestArtifactIdentity,
} from '../src/platform-paths';

export function scaffoldProjectAdapter(input: {
  projectRoot: string;
  applicationId: string;
  projectId: string;
  artifactRoot?: string;
  lifecycle?: Omit<ProjectLifecycleConfiguration, 'schemaVersion'>;
}): { descriptorPath: string; artifactIdentityPath: string; descriptor: ProjectAdapterDescriptor } {
  validateId(input.applicationId, 'applicationId');
  validateId(input.projectId, 'projectId');
  const projectRoot = path.resolve(input.projectRoot);
  const artifactRoot = path.resolve(projectRoot, input.artifactRoot ?? 'deliverables/system-test-platform');
  if (!isInside(projectRoot, artifactRoot)) throw new Error(`项目产物根目录必须位于项目内：${artifactRoot}`);

  const adapterDirectory = path.join(projectRoot, 'adapters/test-automation-platform');
  const descriptorPath = path.join(adapterDirectory, 'project-adapter.json');
  const migrationManifestPath = path.join(adapterDirectory, 'migration-closure.manifest.json');
  const relativeArtifactRoot = path.relative(projectRoot, artifactRoot).replaceAll(path.sep, '/');
  const requestedDescriptor: ProjectAdapterDescriptor = {
    schemaVersion: '1.0.0',
    applicationId: input.applicationId,
    projectId: input.projectId,
    projectRoot: '.',
    artifactRoot: relativeArtifactRoot,
    migrationManifestPath: 'adapters/test-automation-platform/migration-closure.manifest.json',
    status: input.lifecycle ? 'initialized' : 'configuration-required',
    ...(input.lifecycle ? { lifecycle: { schemaVersion: '1.0.0' as const, ...input.lifecycle } } : {}),
  };

  const descriptor = resolveCompatibleDescriptor(descriptorPath, requestedDescriptor);
  const identity = {
    applicationId: input.applicationId,
    projectId: input.projectId,
    artifactRoot: relativeArtifactRoot,
  };
  const artifactIdentityPath = path.join(artifactRoot, 'artifact-manifest.json');
  if (fs.existsSync(artifactIdentityPath)) {
    assertSystemTestArtifactIdentity(artifactRoot, identity);
  }

  fs.mkdirSync(adapterDirectory, { recursive: true });
  if (!fs.existsSync(descriptorPath)
    || JSON.stringify(descriptor) !== fs.readFileSync(descriptorPath, 'utf8').trim()) {
    fs.writeFileSync(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, 'utf8');
  }
  if (!fs.existsSync(migrationManifestPath)) {
    fs.writeFileSync(migrationManifestPath, `${JSON.stringify(
      buildInitialMigrationManifest({
        applicationId: input.applicationId,
        projectRoot,
        adapterDirectory,
        platformRoot: path.resolve(__dirname, '..'),
      }),
      null,
      2,
    )}\n`, 'utf8');
  }
  const initializedArtifactIdentityPath = initializeSystemTestArtifactIdentity(artifactRoot, identity);
  return { descriptorPath, artifactIdentityPath: initializedArtifactIdentityPath, descriptor };
}

function resolveCompatibleDescriptor(
  descriptorPath: string,
  expected: ProjectAdapterDescriptor,
): ProjectAdapterDescriptor {
  if (!fs.existsSync(descriptorPath)) return expected;
  let existing: ProjectAdapterDescriptor;
  try {
    existing = JSON.parse(fs.readFileSync(descriptorPath, 'utf8')) as ProjectAdapterDescriptor;
  } catch (error) {
    throw new Error(`项目适配描述不可解析：${descriptorPath}：${errorMessage(error)}`);
  }
  const fields: Array<keyof Pick<ProjectAdapterDescriptor,
    'schemaVersion' | 'applicationId' | 'projectId' | 'projectRoot' | 'artifactRoot' | 'migrationManifestPath'>> = [
      'schemaVersion',
      'applicationId',
      'projectId',
      'projectRoot',
      'artifactRoot',
      'migrationManifestPath',
    ];
  const mismatch = fields.find((field) => existing[field] !== expected[field]);
  if (mismatch) {
    throw new Error(`项目适配描述已存在且 ${mismatch} 不匹配：${descriptorPath}`);
  }
  if (existing.status === 'initialized') {
    if (expected.lifecycle && stableJson(existing.lifecycle) !== stableJson(expected.lifecycle)) {
      throw new Error(`项目适配描述已存在且 lifecycle 不匹配：${descriptorPath}`);
    }
    return existing;
  }
  return expected.lifecycle ? expected : existing;
}

function buildInitialMigrationManifest(input: {
  applicationId: string;
  projectRoot: string;
  adapterDirectory: string;
  platformRoot: string;
}): MigrationClosureManifest {
  const relative = (target: string) => path.relative(input.adapterDirectory, target).replaceAll(path.sep, '/');
  return {
    schemaVersion: '1.0.0',
    auditId: `${input.applicationId}-platform-extraction-closure`,
    applicationId: input.applicationId,
    roots: [
      { id: 'platform', path: relative(input.platformRoot) },
      { id: 'project', path: relative(input.projectRoot) },
    ],
    exclusions: [
      { id: 'third-party', rootId: 'platform', patterns: ['node_modules', 'node_modules/**'], reason: '第三方依赖' },
      { id: 'project-third-party', rootId: 'project', patterns: ['**/node_modules', '**/node_modules/**', '.git', '.git/**'], reason: '第三方依赖和源码元数据' },
      { id: 'self-output', rootId: 'project', patterns: ['adapters/test-automation-platform/reports/migration-closure.json', 'adapters/test-automation-platform/reports/migration-closure.md', 'adapters/test-automation-platform/reports/migration-inventory.baseline.json'], reason: '审计器自身输出' },
    ],
    ownershipRules: [
      { id: 'platform-generated', rootId: 'platform', category: 'generated-evidence', patterns: ['deliverables/**', 'output/**'], rationale: '公共平台生成物' },
      { id: 'platform-transient', rootId: 'platform', category: 'transient', patterns: ['test-results/**'], rationale: '公共平台瞬态文件' },
      { id: 'platform-core', rootId: 'platform', category: 'public-core', patterns: ['src/**', 'scripts/**', 'tests/**', 'docs/**', 'config/**', 'FINAL-GOAL.md', 'AGENTS.md', 'README.md', 'ownership.json', 'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json', '.gitignore'], rationale: '公共平台实现和治理契约' },
      { id: 'project-generated', rootId: 'project', category: 'generated-evidence', patterns: ['deliverables/**', 'output/**', 'allure-results/**', 'allure-report/**'], rationale: '项目生成物' },
      { id: 'project-transient', rootId: 'project', category: 'transient', patterns: ['test-results/**'], rationale: '项目瞬态文件' },
      { id: 'project-adapter', rootId: 'project', category: 'project-adapter', patterns: ['adapters/**', 'systems/**', 'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json', '.gitignore', 'AGENTS.md'], rationale: '项目适配器和执行配置' },
      { id: 'project-domain', rootId: 'project', category: 'domain-asset', patterns: ['src/**', 'tests/**', 'pages/**', 'flows/**', 'fixtures/**', 'test-data/**', 'api/**', 'contracts/**', 'docs/**'], rationale: '项目领域资产；其他目录必须显式登记' },
    ],
    bridgeGroups: [],
    importScans: [
      { rootId: 'platform', patterns: ['src/**/*.ts', 'scripts/**/*.ts', 'tests/**/*.ts'] },
      { rootId: 'project', patterns: ['src/**/*.ts', 'tests/**/*.ts', 'adapters/**/*.ts', 'systems/**/*.ts'] },
    ],
    packageScripts: [
      { rootId: 'platform', path: 'package.json' },
      { rootId: 'project', path: 'package.json' },
    ],
    structuredReferences: [],
    legacySources: [],
    transientPolicies: [
      { id: 'project-temporary-files', rootId: 'project', patterns: ['**/.last-run.json', '**/*.tmp'], allowedPatterns: ['test-results/**', 'output/**'] },
    ],
    publicBoundary: {
      rootId: 'platform',
      forbiddenPatterns: [],
      forbiddenPathPatterns: ['deliverables/system-test-platform/**'],
    },
    contentPolicies: [{
      id: 'project-docs-no-public-state',
      rootId: 'project',
      patterns: ['README.md', 'docs/**/*.md', 'adapters/**/*.md'],
      forbiddenPatterns: ['Test Automation Platform/deliverables/system-test-platform'],
    }],
    inventory: {
      rootId: 'project',
      baselinePath: 'adapters/test-automation-platform/reports/migration-inventory.baseline.json',
      acceptanceReceiptPath: 'deliverables/system-test-platform/migration-baseline-acceptance.jsonl',
      categories: ['public-core', 'project-adapter', 'history'],
    },
    outputs: {
      rootId: 'project',
      jsonPath: 'adapters/test-automation-platform/reports/migration-closure.json',
      markdownPath: 'adapters/test-automation-platform/reports/migration-closure.md',
    },
  };
}

function validateId(value: string, name: string): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) throw new Error(`${name} 无效：${value}`);
}

function isInside(parent: string, target: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

if (require.main === module) {
  const projectRoot = argument('project-root');
  const applicationId = argument('application-id');
  const projectId = argument('project-id');
  if (!projectRoot || !applicationId || !projectId) {
    throw new Error('用法：--project-root=<path> --application-id=<id> --project-id=<id> [--artifact-root=<relative-path>]');
  }
  const result = scaffoldProjectAdapter({
    projectRoot,
    applicationId,
    projectId,
    artifactRoot: argument('artifact-root'),
    lifecycle: lifecycleArguments(),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function lifecycleArguments(): Omit<ProjectLifecycleConfiguration, 'schemaVersion'> | undefined {
  const businessDomainId = argument('business-domain-id');
  const referenceClosureAuditPath = argument('reference-closure-audit');
  const referenceModule = argument('reference-module');
  const provided = [businessDomainId, referenceClosureAuditPath, referenceModule].filter(Boolean).length;
  if (provided === 0) return undefined;
  if (provided !== 3) {
    throw new Error('生命周期参数必须成组提供：--business-domain-id、--reference-closure-audit、--reference-module');
  }
  return {
    businessDomainId: businessDomainId!,
    workspaceRoot: argument('workspace-root') ?? '.',
    governanceRoot: argument('governance-root') ?? '.',
    referenceClosureAuditPath: referenceClosureAuditPath!,
    referenceModule: referenceModule!,
    systemsRoot: argument('systems-root'),
    systemOutputRoot: argument('system-output-root'),
    governanceFiles: [],
  };
}
