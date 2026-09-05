import fs from 'node:fs';
import path from 'node:path';
import { parseProductCenterItemCaseSemanticFingerprints } from '../utils/product-center-item-case-semantic-fingerprint';

type GeneratedCase = {
  caseId: string;
  semanticCaseFingerprint?: string;
  [key: string]: unknown;
};

const projectRoot = process.cwd();
const generatedSpecPath = path.resolve(projectRoot, 'tests/generated/product-center-item-216.generated.spec.ts');
const canonicalPath = path.resolve(
  projectRoot,
  '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
);
const semanticByCaseId = new Map(
  parseProductCenterItemCaseSemanticFingerprints(canonicalPath)
    .map((item) => [item.caseId, item.fingerprint]),
);
let source = fs.readFileSync(generatedSpecPath, 'utf8');
const match = source.match(/const allCases = (\[[\s\S]*?\]) as readonly GeneratedCase\[\];\r?\nconst supplementalCaseIds/);
if (!match) throw new Error('PRODUCT_CENTER_ITEM_GENERATED_CASE_DATA_NOT_FOUND');
const cases = JSON.parse(match[1]) as GeneratedCase[];
for (const item of cases) {
  const semanticCaseFingerprint = semanticByCaseId.get(item.caseId);
  if (!semanticCaseFingerprint) throw new Error(`PRODUCT_CENTER_ITEM_SEMANTIC_FINGERPRINT_MISSING:${item.caseId}`);
  item.semanticCaseFingerprint = semanticCaseFingerprint;
}
if (new Set(cases.map((item) => item.semanticCaseFingerprint)).size !== cases.length) {
  throw new Error('PRODUCT_CENTER_ITEM_SEMANTIC_FINGERPRINT_COLLISION');
}
source = source.replace(
  match[1],
  JSON.stringify(cases, null, 2),
);
if (!source.includes('  semanticCaseFingerprint: string;')) {
  source = source.replace(
    '  bindingFingerprint: string;',
    '  bindingFingerprint: string;\n  semanticCaseFingerprint: string;',
  );
}
source = source.replace("receiptVersion: '3.1.0' as const", "receiptVersion: '4.0.0' as const");
if (!source.includes('semanticCaseFingerprint: input.item.semanticCaseFingerprint')) {
  source = source.replace(
    '    caseFingerprint: input.item.bindingFingerprint,',
    '    caseFingerprint: input.item.bindingFingerprint,\n    semanticCaseFingerprint: input.item.semanticCaseFingerprint,',
  );
}
if (!source.includes("receiptVersion: '4.0.0' as const")
  || !source.includes('semanticCaseFingerprint: input.item.semanticCaseFingerprint')) {
  throw new Error('PRODUCT_CENTER_ITEM_DUAL_FINGERPRINT_RECEIPT_INJECTION_FAILED');
}
fs.writeFileSync(generatedSpecPath, source, 'utf8');
process.stdout.write(`${JSON.stringify({
  generatedSpecPath,
  enhancedCases: cases.length,
  uniqueSemanticFingerprints: new Set(cases.map((item) => item.semanticCaseFingerprint)).size,
  receiptVersion: '4.0.0',
}, null, 2)}\n`);
