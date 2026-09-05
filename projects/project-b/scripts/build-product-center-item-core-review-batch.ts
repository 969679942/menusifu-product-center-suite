import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterItemCoreReviewBatch,
  renderProductCenterItemCoreReviewBatchMarkdown,
} from '../utils/product-center-item-core-review-batch';
import { scanGeneratedArtifacts } from '../utils/product-center-run-safety';

export function buildProductCenterItemCoreReviewBatchArtifacts(options: {
  projectRoot?: string;
  outputRoot?: string;
  generatedAt?: string;
} = {}): { jsonPath: string; markdownPath: string } {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const sourcePath = path.resolve(
    projectRoot,
    '..',
    'Merchant Center Info',
    '00-待转换测试方案',
    '用例库',
    '商品中心-商品管理-商品',
    '1.商品中心-商品管理-商品-正式测试用例.md',
  );
  const outputDirectory = path.join(
    outputRoot,
    'contracts/product-center/test-cases/canonical',
  );
  const jsonPath = path.join(outputDirectory, 'product-center-item-core-review-batch.json');
  const markdownPath = path.join(outputDirectory, 'product-center-item-core-review-batch.md');
  const sourceReference = path.relative(projectRoot, sourcePath).replace(/\\/g, '/');
  const batch = buildProductCenterItemCoreReviewBatch({
    markdown: fs.readFileSync(sourcePath, 'utf8'),
    sourcePath: sourceReference,
    generatedAt: options.generatedAt,
  });
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderProductCenterItemCoreReviewBatchMarkdown(batch), 'utf8');
  const sensitiveFindings = scanGeneratedArtifacts(outputDirectory);
  if (sensitiveFindings.length > 0) {
    throw new Error(`核心审核批次安全扫描未通过：${sensitiveFindings.length}`);
  }
  return { jsonPath, markdownPath };
}

function main(): void {
  const paths = buildProductCenterItemCoreReviewBatchArtifacts();
  const batch = JSON.parse(fs.readFileSync(paths.jsonPath, 'utf8')) as {
    summary: { eligibleCount: number; selectedCount: number; familyCoverage: Record<string, number> };
  };
  process.stdout.write(
    `商品核心审核批次已生成：${paths.jsonPath}\n`
    + `候选：${batch.summary.eligibleCount}，选中：${batch.summary.selectedCount}\n`
    + `场景覆盖：${JSON.stringify(batch.summary.familyCoverage)}\n`,
  );
}

if (require.main === module) main();
