import fs from 'node:fs';
import path from 'node:path';

type Region = {
  filePath: string;
  facade: string;
  extractionOrder: number;
  sourceSha256: string;
  publicSurfaceCount: number;
};

const projectRoot = path.resolve(__dirname, '..');
const behaviorPath = path.join(projectRoot, 'output/quality/product-center-maintainability-behavior-contract.json');
const outputPath = path.join(projectRoot, 'output/quality/product-center-maintainability-targeted-revalidation.json');
const behavior = JSON.parse(fs.readFileSync(behaviorPath, 'utf8')) as { contractId: string; regions: Region[] };
const files = collectFiles(projectRoot);

const regions = behavior.regions.map((region) => {
  const normalized = region.filePath.replaceAll('\\', '/');
  const basename = path.posix.basename(normalized);
  const references = files.filter((filePath) => {
    if (filePath === normalized || filePath.endsWith(`/${basename}`)) return false;
    const source = fs.readFileSync(path.join(projectRoot, filePath), 'utf8');
    return source.includes(normalized) || source.includes(basename);
  });
  const testFiles = references.filter((filePath) => filePath.startsWith('tests/') || filePath.includes('/tests/'));
  return {
    filePath: region.filePath,
    facade: region.facade,
    extractionOrder: region.extractionOrder,
    sourceSha256: region.sourceSha256,
    publicSurfaceCount: region.publicSurfaceCount,
    references,
    testFiles,
    revalidationCommands: testFiles.map((filePath) => `npx playwright test "${filePath}" --project=api --workers=1 --reporter=line`),
    status: 'static-plan-ready',
    businessExecutionStarted: false,
    existingPassedCasesInvalidated: false,
  };
});

const report = {
  schemaVersion: '1.0.0',
  planId: 'product-center-maintainability-targeted-revalidation-v1',
  generatedAt: new Date().toISOString(),
  sourceBehaviorContractId: behavior.contractId,
  scope: 'static-reference-discovery-and-targeted-revalidation-plan',
  status: 'ready-for-engineering-review',
  summary: {
    regionCount: regions.length,
    referenceCount: regions.reduce((sum, region) => sum + region.references.length, 0),
    testFileCount: regions.reduce((sum, region) => sum + region.testFiles.length, 0),
    businessExecutionStarted: false,
    existingPassedCasesInvalidated: false,
  },
  regions,
  acceptance: [
    '实现移动后只重验实际引用该区域的测试文件',
    '重验前必须重新计算源码和区域接口指纹',
    '静态引用计划不代表业务执行或通过',
  ],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, regionCount: report.summary.regionCount, referenceCount: report.summary.referenceCount, testFileCount: report.summary.testFileCount }));

function collectFiles(root: string): string[] {
  const output: string[] = [];
  const ignored = new Set(['node_modules', 'output', 'allure-results', 'allure-report', 'test-results', '.git']);
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignored.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) output.push(path.relative(root, absolute).replaceAll('\\', '/'));
    }
  };
  visit(root);
  return output;
}
