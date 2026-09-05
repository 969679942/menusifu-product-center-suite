import fs from 'node:fs';
import path from 'node:path';
import { buildProductCenterUnifiedAudit } from '../utils/product-center-unified-audit-source';

const projectRoot = path.resolve(__dirname, '..');

export function runProductCenterUnifiedAudit(sources: readonly string[], outputDirectory = 'deliverables/product-center-audit/source-intake', options: { allowedUrlHosts?: string[]; sourceType?: 'page' | 'test-plan' | 'api' | 'document' | 'unknown' } = {}) {
  const report = buildProductCenterUnifiedAudit({ sources, projectRoot, ...options });
  const outputRoot = path.resolve(projectRoot, outputDirectory);
  fs.mkdirSync(outputRoot, { recursive: true });
  const safeName = `audit-${report.sources.map((item) => item.sourceId).join('-').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120) || 'source'}`;
  const jsonPath = path.join(outputRoot, `${safeName}.json`);
  const markdownPath = path.join(outputRoot, `${safeName}.md`);
  writeAtomic(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeAtomic(markdownPath, renderMarkdown(report));
  return { report, jsonPath, markdownPath };
}

function renderMarkdown(report: ReturnType<typeof buildProductCenterUnifiedAudit>): string {
  const candidates = report.candidates.length === 0
    ? '- 无候选用例'
    : report.candidates.map((item) => `- ${item.candidateId} | 正式 caseId=${item.formalCaseId ?? '待生成'} | ${item.title ?? '未命名'} | 待确认=${item.reviewRequired.join('、') || '无'}`).join('\n');
  const unresolved = report.unresolved.length === 0
    ? '- 无未决项'
    : report.unresolved.map((item) => `- ${item.code} | ${item.message}`).join('\n');
  return `# 商品中心统一审计源入口\n\n- 状态：${report.status}\n- 模式：${report.mode}\n- 执行允许：否\n- 生成时间：${report.generatedAt}\n- 有效至：${report.freshUntil ?? '待页面观测'}\n- 时效依据：${report.freshnessBasis}\n\n## 来源\n${report.sources.map((item) => `- ${item.sourceId} | ${item.kind} | ${item.format} | ${item.locator} | fingerprint=${item.fingerprint}`).join('\n')}\n\n## 候选用例\n${candidates}\n\n## 未决项\n${unresolved}\n\n## 门禁\n- 不修改正式用例：是\n- 不执行业务写操作：是\n- 不允许正式执行：是\n`;
}

if (require.main === module) {
  const sources = process.argv.filter((item) => item.startsWith('--source=')).map((item) => item.slice('--source='.length));
  if (sources.length === 0) throw new Error('必须提供至少一个 --source=<URL或本地文件路径>');
  const allowedUrlHosts = process.argv.filter((item) => item.startsWith('--allowed-host=')).map((item) => item.slice('--allowed-host='.length)).filter(Boolean);
  const sourceType = process.argv.find((item) => item.startsWith('--source-type='))?.slice('--source-type='.length) as 'page' | 'test-plan' | 'api' | 'document' | 'unknown' | undefined;
  const result = runProductCenterUnifiedAudit(sources, undefined, { ...(allowedUrlHosts.length > 0 ? { allowedUrlHosts } : {}), ...(sourceType ? { sourceType } : {}) });
  process.stdout.write(`统一审计源报告：${result.report.status}\nJSON：${result.jsonPath}\nMarkdown：${result.markdownPath}\n`);
}

function writeAtomic(filePath: string, content: string): void {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
