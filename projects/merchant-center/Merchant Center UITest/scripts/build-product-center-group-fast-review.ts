import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterGroupFastReview,
  type ProductFindingReviewInput,
} from '../utils/product-center-group-fast-review';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const deliverableRoot = path.join(workspaceRoot, 'deliverables/product-center-group');
const ledger = JSON.parse(fs.readFileSync(path.join(deliverableRoot, 'remaining-58-ledger.json'), 'utf8')) as {
  cases: Array<ProductFindingReviewInput & { classification: string }>;
};
const review = buildProductCenterGroupFastReview(
  ledger.cases.filter((item) => item.classification === 'product-finding'),
);
fs.writeFileSync(path.join(deliverableRoot, 'product-finding-fast-review.json'), `${JSON.stringify(review, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(deliverableRoot, 'product-finding-fast-review.md'), renderMarkdown(review), 'utf8');
process.stdout.write(`${JSON.stringify(review.summary)}\n`);

function renderMarkdown(review: ReturnType<typeof buildProductCenterGroupFastReview>): string {
  const replyByDecisionId: Record<string, string> = {
    'GRP-DEC-UI': 'GRP-DEC-UI=批准/不批准',
    'GRP-DEC-DATA': 'GRP-DEC-DATA=按缺陷修复/接受当前行为',
    'GRP-DEC-PACKAGE': 'GRP-DEC-PACKAGE=当前不支持/应恢复支持',
  };
  const lines = [
    `# 商品管理组 ${review.summary.total} 条待确认产品差异快速审核`,
    '',
    '## 最快回复方式',
    '',
    `当前仅需回复以下 ${review.decisionPackages.length} 项：`,
    '',
    ...review.decisionPackages.map((decision) => `- \`${replyByDecisionId[decision.decisionId]}\``),
    '',
  ];
  for (const decision of review.decisionPackages) {
    lines.push(
      `## ${decision.decisionId} ${decision.title}（${decision.caseIds.length} 条）`,
      '',
      `- 建议：${decision.recommendation}`,
      `- 批准影响：${decision.approvalEffect}`,
      '',
      '| Case ID | 用例 | 原预期 | 当前观察 | 建议 |',
      '|---|---|---|---|---|',
    );
    for (const item of review.cases.filter((candidate) => candidate.decisionId === decision.decisionId)) {
      lines.push(`| ${item.caseId} | ${escapeCell(item.title)} | ${escapeCell(item.expected.join('；'))} | ${escapeCell(item.observed)} | ${escapeCell(item.recommendation)} |`);
    }
    lines.push('');
  }
  const passedCases = review.resolvedCases.filter((item) => item.result === 'passed');
  if (passedCases.length > 0) {
    lines.push(
      `## 已确认通过 前端阻断与末项保护（${passedCases.length} 条）`,
      '',
      '- 状态：已从待审批产品差异中移除。',
      '',
      '| Case ID | 用例 | 更新后预期 | 当前观察 | 结论 |',
      '|---|---|---|---|---|',
    );
    for (const item of passedCases) {
      lines.push(`| ${item.caseId} | ${escapeCell(item.title)} | ${escapeCell(item.expected.join('；'))} | ${escapeCell(item.observed)} | ${escapeCell(item.recommendation)} |`);
    }
    lines.push('');
  }
  const rebaselinedCases = review.resolvedCases.filter((item) => item.result === 'rebaselined');
  if (rebaselinedCases.length > 0) {
    lines.push(
      `## 套餐组新版合同已重基线（${rebaselinedCases.length} 条）`,
      '',
      '- 状态：已从 `GRP-DEC-PACKAGE` 待确认范围移除；按固定搭配/可选搭配/随心配新版合同执行。',
      '',
      '| Case ID | 用例 | 更新后预期 | 审计结论 | 处置 |',
      '|---|---|---|---|---|',
    );
    for (const item of rebaselinedCases) {
      lines.push(`| ${item.caseId} | ${escapeCell(item.title)} | ${escapeCell(item.expected.join('；'))} | ${escapeCell(item.observed)} | ${escapeCell(item.recommendation)} |`);
    }
    lines.push('');
  }
  lines.push('每条记录的完整证据路径与 SHA-256 位于 `product-finding-fast-review.json`。', '');
  return lines.join('\n');
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replace(/\r?\n/g, '<br>');
}
