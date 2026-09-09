import fs from 'node:fs';
import path from 'node:path';

type RemovedEntry = { path: string; files: number; bytes: number };

export function cleanProductCenterWorkspace(options: {
  projectRoot?: string;
  retainTimingReports?: number;
  generatedAt?: string;
} = {}): { removed: RemovedEntry[]; reclaimedBytes: number; reportPath: string } {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const retainTimingReports = options.retainTimingReports ?? 2;
  const removed: RemovedEntry[] = [];
  const removableDirectories = [
    'allure-results',
    'allure-report',
    'test-results',
    'playwright-report',
    'blob-report',
    'output/logs',
    'output/run-logs',
    'output/runtime-locks',
  ];
  const removableFiles = [
    'output/page-screenshot.png',
    'output/probe-list-debug.png',
    'output/brand-page.png',
    'output/login-page.png',
    'output/login-page2.png',
    'output/debug-after-merchant.png',
    'output/create-form-probe.log',
    'output/create-entry-probe.log',
    'output/exploration-report.md',
    'output/manual-test-cases.json',
    'output/manual-test-cases.md',
    'output/page-features.json',
  ];
  for (const relativePath of removableDirectories) removePath(projectRoot, relativePath, removed);
  for (const relativePath of removableFiles) removePath(projectRoot, relativePath, removed);

  const performanceRoot = safeResolve(projectRoot, 'output/performance');
  if (fs.existsSync(performanceRoot)) {
    const timingReports = fs.readdirSync(performanceRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^product-center-timing-\d+\.json$/.test(entry.name))
      .map((entry) => ({
        name: entry.name,
        path: path.join(performanceRoot, entry.name),
        modifiedAt: fs.statSync(path.join(performanceRoot, entry.name)).mtimeMs,
      }))
      .sort((left, right) => right.modifiedAt - left.modifiedAt);
    for (const report of timingReports.slice(retainTimingReports)) {
      removePath(projectRoot, normalize(path.relative(projectRoot, report.path)), removed);
    }
  }

  const reportPath = safeResolve(projectRoot, 'output/workspace-cleanup-latest.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const reclaimedBytes = removed.reduce((sum, item) => sum + item.bytes, 0);
  fs.writeFileSync(reportPath, `${JSON.stringify({
    schemaVersion: '1.0.0',
    collectionId: 'product-center-workspace-cleanup',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    policy: {
      retainTimingReports,
      preserveNodeModules: true,
      preserveContracts: true,
      preserveDeliverables: true,
      preserveCurrentProductCenterEvidence: true,
    },
    summary: { removedEntries: removed.length, reclaimedBytes },
    removed,
  }, null, 2)}\n`, 'utf8');
  return { removed, reclaimedBytes, reportPath };
}

function removePath(projectRoot: string, relativePath: string, removed: RemovedEntry[]): void {
  const targetPath = safeResolve(projectRoot, relativePath);
  if (!fs.existsSync(targetPath)) return;
  const measurement = measure(targetPath);
  fs.rmSync(targetPath, { recursive: true, force: true });
  removed.push({ path: normalize(relativePath), ...measurement });
}

function measure(targetPath: string): { files: number; bytes: number } {
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return { files: 1, bytes: stat.size };
  let files = 0;
  let bytes = 0;
  const queue = [targetPath];
  while (queue.length > 0) {
    const directory = required(queue.shift());
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) queue.push(entryPath);
      else if (entry.isFile()) {
        files += 1;
        bytes += fs.statSync(entryPath).size;
      }
    }
  }
  return { files, bytes };
}

function safeResolve(projectRoot: string, relativePath: string): string {
  const resolvedRoot = path.resolve(projectRoot);
  const targetPath = path.resolve(resolvedRoot, relativePath);
  if (!targetPath.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`清理路径越界：${relativePath}`);
  return targetPath;
}

function normalize(value: string): string {
  return value.replace(/\\/g, '/');
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('清理队列出现空值');
  return value;
}

if (require.main === module) {
  const result = cleanProductCenterWorkspace();
  process.stdout.write(`${JSON.stringify({
    removedEntries: result.removed.length,
    reclaimedMB: Number((result.reclaimedBytes / 1024 / 1024).toFixed(2)),
    reportPath: result.reportPath,
  }, null, 2)}\n`);
}
