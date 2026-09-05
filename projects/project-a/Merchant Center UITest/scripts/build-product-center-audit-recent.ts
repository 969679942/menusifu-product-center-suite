import fs from 'node:fs';
import path from 'node:path';
import { buildProductCenterAuditReportFiles } from './build-product-center-audit-report';

// 增量刷新审计报告：只把指定时间窗内的新运行输入交给适配器，历史事件仍由事件账本完整保留。
// 这样可避免对数千条历史执行索引逐条重复幂等写入，同时不改变报告的历史汇总。
const projectRoot = path.resolve(__dirname, '..');
const from = process.env.AUDIT_FROM ?? '2026-09-02T00:00:00.000Z';
const to = process.env.AUDIT_TO ?? '2026-09-05T00:00:00.000Z';
const fromMs = Date.parse(from);
const toMs = Date.parse(to);
if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) throw new Error('审计时间窗无效');

const tempDir = path.join(projectRoot, 'tmp-audit');
const tempIndex = path.join(tempDir, `execution-index-${Date.now()}.json`);
const tempProgress = path.join(tempDir, `progress-${Date.now()}.jsonl`);

function inWindow(value: unknown): boolean {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) && time >= fromMs && time < toMs;
}

function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function writeAtomic(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, value, 'utf8');
  fs.renameSync(temporary, filePath);
}

try {
  const indexPath = path.join(projectRoot, 'deliverables/system-test-platform/execution-index.json');
  const index = readJson<{ records?: Array<Record<string, unknown>> }>(indexPath);
  const records = (index.records ?? []).filter((record) => inWindow(record.recordedAt));
  writeAtomic(tempIndex, `${JSON.stringify({ ...index, records }, null, 2)}\n`);

  const progressPath = path.join(projectRoot, 'output/product-center-item-progress.jsonl');
  const progress = fs.existsSync(progressPath)
    ? fs.readFileSync(progressPath, 'utf8').split(/\r?\n/).filter(Boolean)
      .filter((line) => { try { return inWindow((JSON.parse(line) as Record<string, unknown>).updatedAt); } catch { return false; } })
    : [];
  writeAtomic(tempProgress, progress.length ? `${progress.join('\n')}\n` : '');

  const result = buildProductCenterAuditReportFiles({
    executionIndexPath: tempIndex,
    progressPaths: [tempProgress],
  });
  process.stdout.write(JSON.stringify({ from, to, records: records.length, progress: progress.length, ...result }, null, 2) + '\n');
} finally {
  for (const filePath of [tempIndex, tempProgress]) {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* 保留诊断，不影响报告结果 */ }
  }
}
