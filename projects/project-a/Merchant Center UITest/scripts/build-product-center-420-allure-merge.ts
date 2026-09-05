import fs from 'node:fs';
import path from 'node:path';

type AllureResult = {
  name?: string;
  status?: string;
  statusDetails?: { message?: string };
  labels?: Array<{ name?: string; value?: string }>;
  steps?: Array<{ name?: string; steps?: unknown[] }>;
  [key: string]: unknown;
};

const projectRoot = path.resolve(__dirname, '..');
const options = parseArgs(process.argv.slice(2));
const baselineDir = path.resolve(options.baseline);
const targetRoot = path.resolve(options.target);
const resultsDir = path.join(targetRoot, 'results');
const allowedRoot = path.join(projectRoot, 'output', 'allure');
assertInside(targetRoot, allowedRoot);
if (fs.existsSync(targetRoot)) throw new Error(`目标目录已存在：${targetRoot}`);
if (!fs.existsSync(baselineDir)) throw new Error(`基线结果不存在：${baselineDir}`);

fs.mkdirSync(targetRoot, { recursive: true });
fs.cpSync(baselineDir, resultsDir, { recursive: true });
const replacementMap = new Map(options.replacements.map((item) => [item.caseId, path.resolve(item.sourceDir)]));
const removed: string[] = [];
for (const filePath of resultFiles(resultsDir)) {
  const caseId = findCaseId(readJson<AllureResult>(filePath));
  if (!caseId || !replacementMap.has(caseId)) continue;
  fs.rmSync(filePath);
  removed.push(caseId);
}

const copied: string[] = [];
for (const [caseId, sourceRoot] of replacementMap) {
  const matches = resultFiles(sourceRoot)
    .map((filePath) => ({ filePath, document: readJson<AllureResult>(filePath) }))
    .filter((item) => findCaseId(item.document) === caseId);
  if (matches.length !== 1) throw new Error(`${caseId} 替换结果数量=${matches.length}`);
  const match = matches[0];
  const sourceDir = path.dirname(match.filePath);
  fs.copyFileSync(match.filePath, path.join(resultsDir, path.basename(match.filePath)));
  for (const source of collectAttachmentSources(match.document)) {
    const attachmentPath = path.resolve(sourceDir, source);
    assertInside(attachmentPath, sourceDir);
    if (!fs.existsSync(attachmentPath)) throw new Error(`${caseId} 缺少附件：${source}`);
    fs.copyFileSync(attachmentPath, path.join(resultsDir, path.basename(source)));
  }
  copied.push(caseId);
}

const currentResults = resultFiles(resultsDir).map((filePath) => ({
  filePath,
  document: readJson<AllureResult>(filePath),
}));
const currentCaseIds = currentResults.map((item) => findCaseId(item.document));
const duplicateCaseIds = [...new Set(currentCaseIds.filter((caseId, index) => (
  caseId && currentCaseIds.indexOf(caseId) !== index
)))] as string[];
if (duplicateCaseIds.length > 0) throw new Error(`合并后 caseId 重复：${duplicateCaseIds.join(',')}`);
const coverage = readJson<{
  generatedAt?: string;
  scope?: string;
  summary: Record<string, unknown> & { total?: number; actualResultCases?: number; notRun?: number };
  cases: Array<Record<string, unknown> & { caseId: string }>;
}>(path.resolve(options.coverage));
const coverageCaseIds = new Set(coverage.cases.map((item) => item.caseId));
const resultsOutsideCoverage = currentCaseIds.filter((caseId): caseId is string => Boolean(caseId && !coverageCaseIds.has(caseId)));
if (resultsOutsideCoverage.length > 0) {
  throw new Error(`合并结果不在 420 覆盖清单：${[...new Set(resultsOutsideCoverage)].join(',')}`);
}
const expectedResultCases = Number(coverage.summary.actualResultCases ?? resultFiles(baselineDir).length)
  - new Set(removed).size
  + copied.length;
if (currentResults.length !== expectedResultCases) {
  throw new Error(`合并结果数 ${currentResults.length} != 基线替换后预期 ${expectedResultCases}`);
}
if (currentResults.length > Number(coverage.summary.total ?? coverage.cases.length)) {
  throw new Error(`合并结果数超过覆盖总数：${currentResults.length}`);
}

const resultByCaseId = new Map(currentResults.map((item) => [findCaseId(item.document), item]));
for (const item of coverage.cases) {
  const current = resultByCaseId.get(item.caseId);
  if (!current) continue;
  item.executionStatus = current.document.status === 'passed' ? 'passed' : 'failed';
  item.executionEvidence = {
    sourceDir: resultsDir.replaceAll(path.sep, '/'),
    reportResult: path.basename(current.filePath),
    message: current.document.statusDetails?.message ?? null,
  };
  item.rerunThisTurn = replacementMap.has(item.caseId);
}
const passed = currentResults.filter((item) => item.document.status === 'passed').length;
const failed = currentResults.filter((item) => item.document.status === 'failed').length;
coverage.generatedAt = new Date().toISOString();
coverage.scope = '420条已落地用例最终覆盖审计；调味仅消费既有当前证据，未重跑。';
coverage.summary = {
  ...coverage.summary,
  actualResultCases: currentResults.length,
  passed,
  failed,
  notRun: coverage.cases.filter((item) => item.executionStatus === 'not-run').length,
  seasoningRerun: false,
  nonSeasoningRunId: options.runId,
};
writeJson(path.join(targetRoot, '420-coverage-audit.json'), coverage);
fs.writeFileSync(path.join(targetRoot, '420-coverage-audit.md'), [
  '# 商品中心 420 条已落地用例覆盖审计',
  '',
  `- 总数：${coverage.summary.total}`,
  `- 实际结果：${currentResults.length}`,
  `- 通过：${passed}`,
  `- 失败：${failed}`,
  `- 治理分类未运行：${coverage.summary.notRun}`,
  '- 调味重跑：否',
  '',
].join('\n'), 'utf8');

const status = Object.fromEntries(['passed', 'failed', 'broken', 'skipped', 'unknown'].map((value) => [
  value,
  currentResults.filter((item) => (item.document.status ?? 'unknown') === value).length,
]));
const manifest = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  baselineDir,
  targetRoot,
  replacements: Object.fromEntries(replacementMap),
  removed: removed.sort(),
  copied: copied.sort(),
  resultCount: currentResults.length,
  uniqueCaseIds: currentCaseIds.filter(Boolean).length,
  status,
  runId: options.runId,
  seasoningRerun: false,
};
writeJson(path.join(targetRoot, 'merge-manifest.json'), manifest);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);

function parseArgs(args: readonly string[]): {
  baseline: string;
  target: string;
  coverage: string;
  runId: string;
  replacements: Array<{ caseId: string; sourceDir: string }>;
} {
  const read = (name: string): string | undefined => args.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
  const baseline = read('--baseline');
  const target = read('--target');
  const coverage = read('--coverage');
  const replacements = args.filter((item) => item.startsWith('--replace=')).map((item) => {
    const value = item.slice('--replace='.length);
    const separator = value.indexOf('=');
    if (separator < 1) throw new Error(`无效替换参数：${item}`);
    return { caseId: value.slice(0, separator), sourceDir: value.slice(separator + 1) };
  });
  if (!baseline || !target || !coverage || replacements.length === 0) {
    throw new Error('缺少 --baseline、--target、--coverage 或 --replace=CASE=DIR 参数。');
  }
  const runId = read('--run-id') ?? path.basename(target);
  return { baseline, target, coverage, runId, replacements };
}

function resultFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('-result.json'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function findCaseId(document: AllureResult): string | undefined {
  const direct = document.labels?.find((label) => label.name === 'caseId')?.value;
  if (direct) return direct;
  const tag = document.labels?.find((label) => label.name === 'tag' && label.value?.startsWith('case-'))?.value;
  if (tag) return tag.slice(5);
  return findCaseIdInSteps(document.steps ?? []);
}

function findCaseIdInSteps(steps: unknown[]): string | undefined {
  for (const rawStep of steps) {
    if (!rawStep || typeof rawStep !== 'object') continue;
    const step = rawStep as { name?: string; steps?: unknown[] };
    const match = step.name?.match(/^(?:canonical-case-id|group-case-id|system-test-case-id):\s*(TC-[A-Z0-9-]+)$/);
    if (match) return match[1];
    const nested = findCaseIdInSteps(step.steps ?? []);
    if (nested) return nested;
  }
  return undefined;
}

function collectAttachmentSources(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.flatMap(collectAttachmentSources))];
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [...new Set([
    ...(typeof record.source === 'string' ? [record.source] : []),
    ...Object.values(record).flatMap(collectAttachmentSources),
  ])];
}

function assertInside(candidate: string, root: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`路径越界：${candidate}`);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
