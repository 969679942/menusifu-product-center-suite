import fs from 'node:fs';
import path from 'node:path';

export type ProjectLifecyclePathReference = {
  root: 'project' | 'workspace' | 'platform';
  path: string;
};

export type ProjectLifecycleConfiguration = {
  schemaVersion: '1.0.0';
  businessDomainId: string;
  workspaceRoot: string;
  governanceRoot: string;
  referenceClosureAuditPath: string;
  referenceModule: string;
  systemsRoot?: string;
  systemOutputRoot?: string;
  governanceFiles: ProjectLifecyclePathReference[];
  remediationScope?: ProjectRemediationScopeConfiguration;
};

export type ProjectRemediationScopeModuleConfiguration = {
  expectedLanded: number;
  registrationSources: ProjectLifecyclePathReference[];
};

export type ProjectRemediationScopeConfiguration = {
  schemaVersion: '1.0.0';
  scopeId: string;
  landedIndex: ProjectLifecyclePathReference;
  exclusionIndex: ProjectLifecyclePathReference;
  modules: Record<string, ProjectRemediationScopeModuleConfiguration>;
  expectedExclusionsByStatus: Record<string, number>;
  outputPath: string;
};

export type ProjectAdapterDescriptor = {
  schemaVersion: '1.0.0';
  applicationId: string;
  projectId: string;
  projectRoot: string;
  artifactRoot: string;
  migrationManifestPath: string;
  status: 'configuration-required' | 'initialized';
  lifecycle?: ProjectLifecycleConfiguration;
};

export type ResolvedProjectAdapter = {
  descriptorPath: string;
  descriptor: ProjectAdapterDescriptor;
  projectRoot: string;
  workspaceRoot: string;
  governanceRoot: string;
  platformRoot: string;
  artifactRoot: string;
  migrationManifestPath: string;
};

export function loadProjectAdapterDescriptor(
  projectRootInput: string,
  platformRootInput: string,
): ResolvedProjectAdapter {
  const projectRoot = path.resolve(projectRootInput);
  const platformRoot = path.resolve(platformRootInput);
  const descriptorPath = path.join(projectRoot, 'adapters/test-automation-platform/project-adapter.json');
  if (!fs.existsSync(descriptorPath)) throw new Error(`缺少项目适配描述：${descriptorPath}`);
  let descriptor: ProjectAdapterDescriptor;
  try {
    descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8')) as ProjectAdapterDescriptor;
  } catch (error) {
    throw new Error(`项目适配描述不可解析：${descriptorPath}：${errorMessage(error)}`);
  }
  validateDescriptor(descriptor, descriptorPath);
  const artifactRoot = resolveInside(projectRoot, descriptor.artifactRoot, '项目产物根目录');
  const migrationManifestPath = resolveInside(projectRoot, descriptor.migrationManifestPath, '迁移清单');
  const workspaceRoot = path.resolve(projectRoot, descriptor.lifecycle?.workspaceRoot ?? '.');
  const governanceRoot = path.resolve(projectRoot, descriptor.lifecycle?.governanceRoot ?? '.');
  if (!isInside(workspaceRoot, projectRoot)) {
    throw new Error(`生命周期 workspaceRoot 必须包含项目目录：${workspaceRoot}`);
  }
  if (!isInside(governanceRoot, projectRoot)) {
    throw new Error(`生命周期 governanceRoot 必须包含项目目录：${governanceRoot}`);
  }
  for (const [label, configured] of [
    ['systemsRoot', descriptor.lifecycle?.systemsRoot],
    ['systemOutputRoot', descriptor.lifecycle?.systemOutputRoot],
  ] as const) {
    if (configured !== undefined) resolveInside(projectRoot, configured, `生命周期 ${label}`);
  }
  return {
    descriptorPath,
    descriptor,
    projectRoot,
    workspaceRoot,
    governanceRoot,
    platformRoot,
    artifactRoot,
    migrationManifestPath,
  };
}

export function resolveLifecycleReference(
  adapter: ResolvedProjectAdapter,
  reference: ProjectLifecyclePathReference,
): string {
  const root = reference.root === 'project'
    ? adapter.projectRoot
    : reference.root === 'workspace'
      ? adapter.workspaceRoot
      : adapter.platformRoot;
  return resolveInside(root, reference.path, `治理文件 ${reference.root}`);
}

function validateDescriptor(descriptor: ProjectAdapterDescriptor, descriptorPath: string): void {
  if (descriptor.schemaVersion !== '1.0.0') throw new Error(`不支持的项目适配描述版本：${descriptor.schemaVersion}`);
  validateId(descriptor.applicationId, 'applicationId');
  validateId(descriptor.projectId, 'projectId');
  if (!descriptor.artifactRoot || !descriptor.migrationManifestPath) {
    throw new Error(`项目适配描述字段不完整：${descriptorPath}`);
  }
  if (descriptor.projectRoot !== '.') throw new Error(`项目适配描述 projectRoot 必须为 .：${descriptorPath}`);
  if (!descriptor.lifecycle) return;
  if (descriptor.lifecycle.schemaVersion !== '1.0.0') {
    throw new Error(`不支持的项目生命周期版本：${descriptor.lifecycle.schemaVersion}`);
  }
  validateId(descriptor.lifecycle.businessDomainId, 'businessDomainId');
  if (!descriptor.lifecycle.referenceClosureAuditPath || !descriptor.lifecycle.referenceModule) {
    throw new Error(`项目生命周期参考基线字段不完整：${descriptorPath}`);
  }
  if (!Array.isArray(descriptor.lifecycle.governanceFiles)) {
    throw new Error(`项目生命周期 governanceFiles 无效：${descriptorPath}`);
  }
  if (descriptor.lifecycle.remediationScope) validateRemediationScope(descriptor.lifecycle.remediationScope, descriptorPath);
}

function validateRemediationScope(scope: ProjectRemediationScopeConfiguration, descriptorPath: string): void {
  if (scope.schemaVersion !== '1.0.0') throw new Error(`不支持的项目整改范围版本：${scope.schemaVersion}`);
  validateId(scope.scopeId, 'remediationScope.scopeId');
  if (Object.keys(scope.modules).length === 0) throw new Error(`项目整改范围缺少模块：${descriptorPath}`);
  for (const [module, configuration] of Object.entries(scope.modules)) {
    if (!module.trim() || !Number.isInteger(configuration.expectedLanded) || configuration.expectedLanded < 0) {
      throw new Error(`项目整改范围模块无效：${module}`);
    }
    if (!Array.isArray(configuration.registrationSources) || configuration.registrationSources.length === 0) {
      throw new Error(`项目整改范围模块缺少注册证据：${module}`);
    }
  }
  if (!scope.outputPath) throw new Error(`项目整改范围缺少输出路径：${descriptorPath}`);
  if (path.isAbsolute(scope.outputPath) || scope.outputPath.split(/[\\/]/).includes('..')) {
    throw new Error(`项目整改范围输出路径必须位于项目目录内：${scope.outputPath}`);
  }
}

function validateId(value: string, name: string): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) throw new Error(`${name} 无效：${value}`);
}

function resolveInside(root: string, relativePath: string, label: string): string {
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error(`${label} 必须是相对路径：${relativePath}`);
  const resolved = path.resolve(root, relativePath);
  if (!isInside(root, resolved)) throw new Error(`${label} 路径越界：${relativePath}`);
  return resolved;
}

function isInside(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
