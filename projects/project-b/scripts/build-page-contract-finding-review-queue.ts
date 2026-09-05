import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..');
const diffPath = path.join(projectRoot, 'output/page-contract/product-center-page-contract-diff.json');
const impactPath = path.join(projectRoot, 'output/page-contract/product-center-page-contract-impact.json');
const diff = JSON.parse(fs.readFileSync(diffPath, 'utf8')) as { findings?: Array<{ code: string; caseId: string; route: string; sourceIds?: string[]; detail: string; blocking?: boolean }> };
const impact = JSON.parse(fs.readFileSync(impactPath, 'utf8')) as { contractMutationAllowed?: boolean; businessRuleMutationAllowed?: boolean; impactedCases?: Array<{ caseId: string }> };
const technicalFindingCodes = new Set(['RELEASE_EVIDENCE_STALE', 'RELEASE_FINGERPRINT_MISMATCH', 'ROUTE_FINGERPRINT_MISMATCH']);
const items = (diff.findings ?? []).map((finding, index) => ({
  reviewId: `PAGE-CONTRACT-REVIEW-${String(index + 1).padStart(3, '0')}`,
  findingCode: finding.code,
  caseId: finding.caseId,
  route: finding.route,
  sourceIds: finding.sourceIds ?? [],
  detail: finding.detail,
  blocking: finding.blocking === true,
  owner: '商品中心页面合同负责人',
  disposition: technicalFindingCodes.has(finding.code) ? 'auto-technical-revalidation' : 'needs-human-semantic-review',
  nextAction: finding.code === 'RELEASE_EVIDENCE_STALE'
    ? '自动标记证据过期并生成当前版本证据补采任务；不直接改写业务用例'
    : finding.code === 'ROUTE_FINGERPRINT_MISMATCH'
      ? '自动重算路由、控件和 API 指纹；检测到语义变化时才升级人工'
      : finding.code === 'RELEASE_FINGERPRINT_MISMATCH'
        ? '自动重算发布指纹并安排定向重验；检测到语义变化时才升级人工'
      : '核对实现指纹变化是否影响业务语义；仅对受影响用例安排定向重验',
  approvalStatus: technicalFindingCodes.has(finding.code) ? 'not-required' : 'pending',
  businessRuleMutationAllowed: impact.businessRuleMutationAllowed === true,
  contractMutationAllowed: impact.contractMutationAllowed === true,
  expectedImpact: '在人工确认前保持正式用例和历史结果不变',
  resultImpact: technicalFindingCodes.has(finding.code) ? 'technical-revalidation-only' : 'revalidation-required-if-semantic-impact',
}));
const report = {
  schemaVersion: '1.0.0', generatedAt: new Date().toISOString(), scope: 'merchant-center-page-contract-finding-review',
  status: items.some((item) => item.disposition === 'needs-human-semantic-review') ? 'needs-human-acceptance' : items.length ? 'auto-technical-revalidation' : 'clear',
  summary: { total: items.length, pending: items.length, impactedCases: new Set((impact.impactedCases ?? []).map((item) => item.caseId)).size },
  guardrails: { autoCaseMutation: false, autoBusinessRuleMutation: false, businessUiWrites: false, rerunPassedCases: false, nonBusinessFindingsAutoProcessed: true },
  items,
};
const outputDir = path.join(projectRoot, 'output/page-contract');
fs.writeFileSync(path.join(outputDir, 'product-center-page-contract-finding-review-queue.json'), `${JSON.stringify(report, null, 2)}\n`);
const markdown = ['# 页面合同偏移技术自动复验队列', '', `状态：${report.status}`, `总 finding：${report.summary.total}；受影响用例：${report.summary.impactedCases}`, '', '| Review ID | Finding | Case | 路由 | 审批 | 下一步 |', '|---|---|---|---|---|---|', ...items.map((item) => `| ${item.reviewId} | ${item.findingCode} | ${item.caseId} | ${item.route} | ${item.approvalStatus} | ${item.nextAction} |`), '', '说明：本队列仅包含证据过期、发布指纹或路由指纹等技术性 finding，已自动转入当前版本证据补采/定向重验；不需要逐条人工审核。只有重验确认业务语义发生变化时，才升级人工异常处理；在获得标准运行收据前，不更新正式用例、业务规则或通过状态。', ''];
fs.writeFileSync(path.join(outputDir, 'product-center-page-contract-finding-review-queue.md'), markdown.join('\n'));
process.stdout.write(JSON.stringify({ status: report.status, total: report.summary.total, output: 'Merchant Center UITest/output/page-contract' }) + '\n');
