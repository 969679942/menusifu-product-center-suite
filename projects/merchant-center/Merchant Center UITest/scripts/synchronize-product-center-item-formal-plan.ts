import fs from 'node:fs';
import path from 'node:path';

type Correction = {
  canonicalId: string;
  priority?: 'P0' | 'P1' | 'P2';
  title?: string;
  source?: string;
  actions?: string[];
  expectedResults?: string[];
};

type ConfirmationDocument = {
  confirmations?: Array<{ canonicalCorrections?: Correction[] }>;
};

const projectRoot = path.resolve(__dirname, '..');
const formalPath = path.resolve(
  projectRoot,
  '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
);
const confirmationPath = path.join(
  projectRoot,
  'contracts/product-center/reviews/product-center-item-rule-confirmations.json',
);
const checkOnly = process.argv.includes('--check');

const confirmationDocument = JSON.parse(fs.readFileSync(confirmationPath, 'utf8')) as ConfirmationDocument;
const corrections = (confirmationDocument.confirmations ?? [])
  .flatMap((confirmation) => confirmation.canonicalCorrections ?? []);
const duplicateIds = corrections
  .map((correction) => correction.canonicalId)
  .filter((caseId, index, all) => all.indexOf(caseId) !== index);
if (duplicateIds.length > 0) {
  throw new Error(`商品正式用例同步存在冲突规则：${[...new Set(duplicateIds)].join(', ')}`);
}

const original = fs.readFileSync(formalPath, 'utf8');
let synchronized = original;
const updatedCaseIds: string[] = [];

for (const correction of corrections) {
  const sectionPattern = new RegExp(
    `(### 用例编号：${escapeRegExp(correction.canonicalId)}\\r?\\n[\\s\\S]*?)(?=\\r?\\n### 用例编号：|$)`,
  );
  const match = synchronized.match(sectionPattern);
  if (!match) throw new Error(`正式商品方案缺少确认用例：${correction.canonicalId}`);
  const currentSection = match[1];
  let nextSection = currentSection;
  if (correction.title) nextSection = replaceLine(nextSection, '用例标题', correction.title);
  if (correction.priority) nextSection = replaceLine(nextSection, '优先级', correction.priority);
  if (correction.source) nextSection = replaceLine(nextSection, '来源', correction.source);
  if (correction.actions?.length) {
    nextSection = replaceNumberedBlock(nextSection, '测试步骤', '预期结果', correction.actions);
  }
  if (correction.expectedResults?.length) {
    nextSection = replaceExpectedResults(nextSection, correction.expectedResults);
  }
  if (nextSection !== currentSection) {
    synchronized = synchronized.replace(sectionPattern, nextSection);
    updatedCaseIds.push(correction.canonicalId);
  }
}

if (checkOnly && synchronized !== original) {
  throw new Error(`商品正式测试方案未同步最新确认规则：${updatedCaseIds.join(', ')}`);
}
if (!checkOnly && synchronized !== original) fs.writeFileSync(formalPath, synchronized, 'utf8');

process.stdout.write(`${JSON.stringify({
  mode: checkOnly ? 'check' : 'write',
  corrections: corrections.length,
  changed: updatedCaseIds.length,
  updatedCaseIds,
  formalPath,
})}\n`);

function replaceLine(section: string, label: string, value: string): string {
  const pattern = new RegExp(`^${escapeRegExp(label)}：.*$`, 'm');
  if (!pattern.test(section)) throw new Error(`正式用例字段缺失：${label}`);
  return section.replace(pattern, `${label}：${value}`);
}

function replaceNumberedBlock(section: string, label: string, nextLabel: string, values: readonly string[]): string {
  const pattern = new RegExp(`${escapeRegExp(label)}：\\r?\\n[\\s\\S]*?(?=\\r?\\n${escapeRegExp(nextLabel)}：)`);
  if (!pattern.test(section)) throw new Error(`正式用例区块缺失：${label}`);
  return section.replace(pattern, `${label}：\n${renderNumbered(values)}\n`);
}

function replaceExpectedResults(section: string, values: readonly string[]): string {
  // Replace only the expectation block and preserve any following section
  // (for example 清理要求) and its original blank-line formatting.
  const label = '预期结果：';
  const labelStart = section.indexOf(label);
  if (labelStart < 0) throw new Error('正式用例区块缺失：预期结果');
  const contentStart = labelStart + label.length;
  const tail = section.slice(contentStart);
  const nextSection = tail.match(/\r?\n(?:清理要求：|### 用例编号：)/);
  const contentEnd = nextSection ? contentStart + (nextSection.index ?? 0) : section.length;
  const originalBlock = section.slice(labelStart, contentEnd);
  const lineEnding = originalBlock.includes('\r\n') ? '\r\n' : '\n';
  const trailingLineEndings = originalBlock.match(/(?:\r?\n)+$/)?.[0] ?? lineEnding;
  const replacement = `${label}${lineEnding}${renderNumbered(values)}${trailingLineEndings}`;
  return section.slice(0, labelStart) + replacement + section.slice(contentEnd);
}

function renderNumbered(values: readonly string[]): string {
  return values.map((value, index) => `${index + 1}. ${value.trim()}`).join('\n');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
