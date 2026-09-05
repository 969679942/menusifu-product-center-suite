import fs from 'node:fs';
import path from 'node:path';

export type SystemTestArtifactIdentity = {
  schemaVersion: '1.0.0';
  applicationId: string;
  projectId: string;
  artifactRoot: string;
};

export type ResolveSystemTestArtifactOptions = {
  expectedApplicationId?: string;
  expectedProjectId?: string;
  expectedArtifactRoot?: string;
  requireIdentity?: boolean;
};

const identityFileName = 'artifact-manifest.json';

export function resolveSystemTestPlatformArtifact(
  fileName: string,
  artifactRoot?: string,
  options: ResolveSystemTestArtifactOptions = {},
): string {
  if (!fileName || path.isAbsolute(fileName)) throw new Error(`平台产物文件名无效：${fileName}`);
  const root = artifactRoot ?? process.env.SYSTEM_TEST_ARTIFACT_ROOT;
  if (!root) {
    throw new Error('缺少项目级 SYSTEM_TEST_ARTIFACT_ROOT；公共平台不得隐式写入自身目录');
  }
  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(absoluteRoot, fileName);
  const relative = path.relative(absoluteRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`项目产物路径越界：${fileName}`);
  }
  if (options.requireIdentity || options.expectedApplicationId || options.expectedProjectId) {
    assertSystemTestArtifactIdentity(absoluteRoot, {
      applicationId: options.expectedApplicationId,
      projectId: options.expectedProjectId,
      artifactRoot: options.expectedArtifactRoot,
    });
  }
  return resolved;
}

export function initializeSystemTestArtifactIdentity(
  artifactRoot: string,
  identity: Omit<SystemTestArtifactIdentity, 'schemaVersion'>,
): string {
  const absoluteRoot = path.resolve(artifactRoot);
  fs.mkdirSync(absoluteRoot, { recursive: true });
  const manifestPath = path.join(absoluteRoot, identityFileName);
  const normalized: SystemTestArtifactIdentity = {
    schemaVersion: '1.0.0',
    applicationId: identity.applicationId,
    projectId: identity.projectId,
    artifactRoot: identity.artifactRoot.replaceAll('\\', '/'),
  };
  if (fs.existsSync(manifestPath)) {
    assertSystemTestArtifactIdentity(absoluteRoot, normalized);
    return manifestPath;
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return manifestPath;
}

export function assertSystemTestArtifactIdentity(
  artifactRoot: string,
  expected: { applicationId?: string; projectId?: string; artifactRoot?: string } = {},
): SystemTestArtifactIdentity {
  const absoluteRoot = path.resolve(artifactRoot);
  const manifestPath = path.join(absoluteRoot, identityFileName);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`缺少项目产物身份清单：${manifestPath}`);
  }
  let identity: SystemTestArtifactIdentity;
  try {
    identity = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SystemTestArtifactIdentity;
  } catch (error) {
    throw new Error(`项目产物身份清单不可解析：${manifestPath}：${errorMessage(error)}`);
  }
  if (identity.schemaVersion !== '1.0.0'
    || !identity.applicationId
    || !identity.projectId
    || !identity.artifactRoot) {
    throw new Error(`项目产物身份清单字段不完整：${manifestPath}`);
  }
  if (expected.applicationId && identity.applicationId !== expected.applicationId) {
    throw new Error(`项目产物 applicationId 不匹配：期望 ${expected.applicationId}，实际 ${identity.applicationId}`);
  }
  if (expected.projectId && identity.projectId !== expected.projectId) {
    throw new Error(`项目产物 projectId 不匹配：期望 ${expected.projectId}，实际 ${identity.projectId}`);
  }
  if (expected.artifactRoot && identity.artifactRoot !== expected.artifactRoot.replaceAll('\\', '/')) {
    throw new Error(`项目产物 artifactRoot 不匹配：期望 ${expected.artifactRoot}，实际 ${identity.artifactRoot}`);
  }
  return identity;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
