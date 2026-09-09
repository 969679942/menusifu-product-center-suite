import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterBusinessRulePromotionReadiness,
  renderProductCenterBusinessRulePromotionReadinessMarkdown,
} from '../utils/product-center-business-rule-promotion';

const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, '..', 'deliverables/test-plan-governance');
const jsonPath = path.join(outputRoot, 'product-center-business-rule-promotion-readiness.json');
const markdownPath = path.join(outputRoot, 'product-center-business-rule-promotion-readiness.md');

const report = buildProductCenterBusinessRulePromotionReadiness();
fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(markdownPath, renderProductCenterBusinessRulePromotionReadinessMarkdown(report), 'utf8');
process.stdout.write(`${JSON.stringify({
  status: 'static-report-generated',
  summary: report.manifest.summary,
  jsonPath,
  markdownPath,
})}\n`);
