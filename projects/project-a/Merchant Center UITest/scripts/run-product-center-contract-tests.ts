import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type ContractManifest = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-contract-tests';
  project: string;
  tests: string[];
};

export function readProductCenterContractManifest(rootDir = process.cwd()): ContractManifest {
  const manifestPath = path.join(
    rootDir,
    'contracts/product-center/test-manifests/product-center-contract-tests.json',
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ContractManifest;
  if (manifest.schemaVersion !== '1.0.0' || manifest.collectionId !== 'product-center-contract-tests') {
    throw new Error('商品中心合同 manifest 元数据无效');
  }
  if (!manifest.project || manifest.tests.length === 0) throw new Error('商品中心合同 manifest 分母为零');
  if (new Set(manifest.tests).size !== manifest.tests.length) throw new Error('商品中心合同 manifest 存在重复测试');
  for (const testPath of manifest.tests) {
    if (!/^tests\/api\/[a-z0-9-]+\.contract\.spec\.ts$/.test(testPath)) {
      throw new Error(`商品中心合同 manifest 路径无效：${testPath}`);
    }
    if (!fs.existsSync(path.join(rootDir, testPath))) throw new Error(`商品中心合同文件不存在：${testPath}`);
  }
  return manifest;
}

function main(): void {
  const rootDir = path.resolve(__dirname, '..');
  const manifest = readProductCenterContractManifest(rootDir);
  const cliPath = require.resolve('@playwright/test/cli');
  const result = spawnSync(process.execPath, [
    cliPath,
    'test',
    ...manifest.tests,
    `--project=${manifest.project}`,
  ], {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });
  if ((result.status ?? 1) !== 0) process.exitCode = result.status ?? 1;
}

if (require.main === module) main();
