import fs from 'node:fs';
import path from 'node:path';
import {
  assertSystemTestArtifactIdentity,
  resolveSystemTestPlatformArtifact as resolvePublicArtifact,
} from '../../../Test Automation Platform/src/platform-paths';

const projectRoot = path.resolve(__dirname, '..');
const descriptorPath = path.join(projectRoot, 'adapters/test-automation-platform/project-adapter.json');
const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8')) as {
  schemaVersion: string;
  applicationId: string;
  projectId: string;
  artifactRoot: string;
};
if (descriptor.schemaVersion !== '1.0.0') throw new Error(`不支持的项目适配描述版本：${descriptor.schemaVersion}`);
const expectedIdentity = {
  applicationId: descriptor.applicationId,
  projectId: descriptor.projectId,
  artifactRoot: descriptor.artifactRoot,
};

export const SYSTEM_TEST_PLATFORM_ARTIFACT_ROOT = path.resolve(
  process.env.SYSTEM_TEST_ARTIFACT_ROOT ?? path.join(projectRoot, descriptor.artifactRoot),
);

if (!isInside(projectRoot, SYSTEM_TEST_PLATFORM_ARTIFACT_ROOT)) {
  throw new Error(`商品中心平台产物根目录必须位于项目内：${SYSTEM_TEST_PLATFORM_ARTIFACT_ROOT}`);
}
const configuredArtifactRoot = path.resolve(projectRoot, descriptor.artifactRoot);
if (!samePath(SYSTEM_TEST_PLATFORM_ARTIFACT_ROOT, configuredArtifactRoot)) {
  throw new Error(`SYSTEM_TEST_ARTIFACT_ROOT 与项目适配描述不一致：${SYSTEM_TEST_PLATFORM_ARTIFACT_ROOT}`);
}
export function resolveSystemTestPlatformArtifact(fileName: string): string {
  return resolvePublicArtifact(fileName, SYSTEM_TEST_PLATFORM_ARTIFACT_ROOT, {
    ...expectedIdentity,
    requireIdentity: true,
  });
}

export function assertSystemTestPlatformArtifactIdentity(): void {
  assertSystemTestArtifactIdentity(SYSTEM_TEST_PLATFORM_ARTIFACT_ROOT, expectedIdentity);
}

function isInside(parent: string, target: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => path.resolve(value).toLocaleLowerCase();
  return normalize(left) === normalize(right);
}
