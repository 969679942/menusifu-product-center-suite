import fs from 'node:fs';
import path from 'node:path';
import { buildProductCenterMaintainabilityReport } from '../utils/product-center-maintainability-audit';

const projectRoot = path.resolve(__dirname, '..');
const outputPath = path.join(projectRoot, 'output/quality/product-center-maintainability-report.json');
const baselinePath = path.join(projectRoot, 'contracts/product-center/quality/product-center-maintainability-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const report = buildProductCenterMaintainabilityReport(projectRoot, baseline);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`商品中心自动化维护性审计：${outputPath};状态=${report.status};文件=${report.files.length};直接身份模板=${report.directIdentityTemplates.length}\n`);
if (report.status === 'blocked') process.exitCode = 1;
