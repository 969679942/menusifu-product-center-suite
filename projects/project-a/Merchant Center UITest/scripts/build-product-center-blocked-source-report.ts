import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type BlockedSourceDecision = {
  caseId: string;
  module: string;
  owner: { role: string; status: string };
  sourceFile: string;
  sourceRaw: string;
  status: string;
  disposition: string;
  currentGoalBlocking: boolean;
  blockCode: string;
  blockReason: string;
};

export async function buildProductCenterBlockedSourceReport(options: {
  projectRoot?: string;
  infoRoot?: string;
  outputRoot?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const infoRoot = path.resolve(options.infoRoot ?? path.join(projectRoot, '..', 'Merchant Center Info'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const decisionPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/unsupported-source-format-decisions.json',
  );
  const decision = JSON.parse(await readFile(decisionPath, 'utf8'));
  const blocked = ((decision.cases ?? []) as BlockedSourceDecision[])
    .filter((item) => item.status === 'blocked' && item.currentGoalBlocking === true);
  if (blocked.some((item) => item.disposition !== 'blocked-source-review')) {
    throw new Error('blocked 来源集合包含非审核阻断项');
  }

  const fileLines = new Map<string, string[]>();
  const cases = [];
  for (const item of blocked) {
    const filePath = path.join(infoRoot, item.sourceFile);
    let lines = fileLines.get(filePath);
    if (!lines) {
      lines = (await readFile(filePath, 'utf8')).replace(/\r\n/g, '\n').split('\n');
      fileLines.set(filePath, lines);
    }
    const caseHeading = `### 用例编号：${item.caseId}`;
    const caseLine = lines.findIndex((line) => line.trim() === caseHeading) + 1;
    const sourceLine = lines.findIndex((line, index) =>
      index >= caseLine && line === `来源：${item.sourceRaw}`) + 1;
    if (caseLine <= 0 || sourceLine <= 0) {
      throw new Error(`无法定位 blocked 来源：${item.caseId}`);
    }
    cases.push({
      ...item,
      caseLine,
      sourceLine,
      address: `${item.sourceFile}:${caseLine}`,
    });
  }

  const summary = {
    cases: cases.length,
    files: new Set(cases.map((item) => item.sourceFile)).size,
    byOwner: countBy(cases, (item) => item.owner.role),
    byFile: countBy(cases, (item) => item.sourceFile),
    byBlockCode: countBy(cases, (item) => item.blockCode),
  };
  const document = {
    schemaVersion: '1.0.0',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    collectionId: 'product-center-blocked-source-cases',
    guardrails: decision.guardrails,
    workstream: decision.generationWorkstream,
    summary,
    cases,
  };
  const directory = path.join(outputRoot, 'output/test-case-audit/product-center');
  const jsonPath = path.join(directory, 'blocked-source-cases.json');
  const markdownPath = path.join(directory, 'blocked-source-cases.md');
  await mkdir(directory, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, renderMarkdown(document), 'utf8');
  return { jsonPath, markdownPath, document };
}

function renderMarkdown(document: {
  generatedAt: string;
  summary: { cases: number; files: number; byOwner: Record<string, number> };
  cases: Array<BlockedSourceDecision & { caseLine: number; sourceLine: number; address: string }>;
}): string {
  return [
    '# 商品中心 blocked 来源清单',
    '',
    `生成时间：${document.generatedAt}`,
    '',
    `总计：${document.summary.cases} 条，${document.summary.files} 个正式方案文件。`,
    '',
    '## 负责人分布',
    '',
    '| 负责人 | 数量 |',
    '| --- | ---: |',
    ...Object.entries(document.summary.byOwner).map(([owner, count]) => `| ${owner} | ${count} |`),
    '',
    '## 用例明细',
    '',
    '| 用例 | 负责人 | 正式方案地址 | 来源行 | 阻塞代码 | 当前来源 | 阻塞原因 |',
    '| --- | --- | --- | ---: | --- | --- | --- |',
    ...document.cases.map((item) => [
      item.caseId,
      item.owner.role,
      `${item.sourceFile}:${item.caseLine}`,
      item.sourceLine,
      item.blockCode,
      escapeCell(item.sourceRaw),
      escapeCell(item.blockReason),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |')),
    '',
  ].join('\n');
}

function countBy<T>(items: readonly T[], keyFor: (item: T) => string): Record<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFor(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

if (require.main === module) {
  buildProductCenterBlockedSourceReport()
    .then((result) => process.stdout.write(`blocked 来源清单：${result.markdownPath}\n`))
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
