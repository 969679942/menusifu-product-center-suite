import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type ProductCenterGroupExecutionFingerprint = {
  schemaVersion: '2.0.0';
  fingerprint: string;
  files: string[];
  toolchain: Record<string, string>;
};

const executionInputs = [
  'playwright.config.ts',
  'api/product-center',
  'fixtures/product-center.fixture.ts',
  'flows/auth.flow.ts',
  'flows/product-center/item-216',
  'pages/product-management/group-list.page.ts',
  'pages/product-management/item',
  'scripts/build-product-center-group-automation.ts',
  'test-data/product-center/item-216',
  'test-data/product-center/product-center-item-create-data.factory.ts',
  'test-data/product-center/product-center-fixture-capabilities.ts',
  'tests/generated/product-center-group.generated.spec.ts',
  'tests/setup/global.teardown.ts',
  'utils/product-center-application-version.ts',
  'utils/product-center-group-automation.ts',
  'utils/product-center-group-handler-compiler.ts',
  'utils/product-center-group-runner.ts',
  'utils/product-center-resource-lock.ts',
] as const;

const toolchainPackages = [
  '@playwright/test',
  'playwright',
  'playwright-core',
  'tsx',
  'typescript',
] as const;

const orchestrationInputs = [
  'scripts/run-product-center-group-batches.ts',
  'scripts/run-product-center-group-with-watchdog.ts',
  'utils/product-center-auth-batch-session.ts',
  'utils/product-center-group-progress.ts',
] as const;

export function buildProductCenterGroupExecutionFingerprint(
  projectRoot: string,
): ProductCenterGroupExecutionFingerprint {
  const files = executionInputs
    .flatMap((relativePath) => collectFiles(projectRoot, relativePath))
    .filter((filePath, index, all) => all.indexOf(filePath) === index)
    .sort();
  const hash = createHash('sha256');
  const toolchain = resolveProductCenterGroupToolchain(projectRoot);
  hash.update(JSON.stringify({ schemaVersion: '2.0.0', scope: 'product-center-group-business-execution' }));
  hash.update(JSON.stringify(toolchain));
  for (const filePath of files) {
    hash.update(filePath);
    hash.update(fs.readFileSync(path.join(projectRoot, filePath)));
  }
  return { schemaVersion: '2.0.0', fingerprint: hash.digest('hex'), files, toolchain };
}

export function buildProductCenterGroupOrchestrationFingerprint(
  projectRoot: string,
): ProductCenterGroupExecutionFingerprint {
  const files = orchestrationInputs
    .flatMap((relativePath) => collectFiles(projectRoot, relativePath))
    .filter((filePath, index, all) => all.indexOf(filePath) === index)
    .sort();
  const hash = createHash('sha256');
  const toolchain = resolveProductCenterGroupToolchain(projectRoot);
  hash.update(JSON.stringify({ schemaVersion: '2.0.0', scope: 'product-center-group-orchestration' }));
  hash.update(JSON.stringify(toolchain));
  for (const filePath of files) {
    hash.update(filePath);
    hash.update(fs.readFileSync(path.join(projectRoot, filePath)));
  }
  return { schemaVersion: '2.0.0', fingerprint: hash.digest('hex'), files, toolchain };
}

export function resolveProductCenterGroupToolchain(projectRoot: string): Record<string, string> {
  const packageLockPath = path.join(projectRoot, 'package-lock.json');
  if (fs.existsSync(packageLockPath)) {
    const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8')) as {
      packages?: Record<string, { version?: string }>;
    };
    return Object.fromEntries(toolchainPackages.flatMap((packageName) => {
      const version = packageLock.packages?.[`node_modules/${packageName}`]?.version;
      return version ? [[packageName, version]] : [];
    }));
  }
  const packagePath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packagePath)) return {};
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return Object.fromEntries(toolchainPackages.flatMap((packageName) => {
    const version = packageJson.dependencies?.[packageName] ?? packageJson.devDependencies?.[packageName];
    return version ? [[packageName, version]] : [];
  }));
}

function collectFiles(projectRoot: string, relativePath: string): string[] {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\.\//, '');
  const absolutePath = path.join(projectRoot, normalized);
  if (!fs.existsSync(absolutePath)) return [];
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [normalized];
  if (!stat.isDirectory()) return [];
  return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const child = `${normalized}/${entry.name}`;
    if (entry.isDirectory()) return collectFiles(projectRoot, child);
    return entry.isFile() && !child.includes('/node_modules/') ? [child] : [];
  });
}
