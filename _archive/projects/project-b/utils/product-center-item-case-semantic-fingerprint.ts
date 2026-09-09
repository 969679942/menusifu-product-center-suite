import fs from 'node:fs';
import {
  fingerprintCaseSemantics,
  type CaseSemanticFingerprintInput,
} from './case-semantic-fingerprint';

export type ProductCenterItemCaseSemanticFingerprint = CaseSemanticFingerprintInput & {
  title: string;
  fingerprint: string;
};

export function parseProductCenterItemCaseSemanticFingerprints(
  filePath: string,
): ProductCenterItemCaseSemanticFingerprint[] {
  const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n?/g, '\n');
  const sections = content.split(/^### 用例编号：/m).slice(1);
  const cases = sections.flatMap((section) => {
    const caseId = section.match(/^(TC-ITEM-[A-Z0-9-]+)/)?.[1];
    if (!caseId) return [];
    const title = fieldLine(section, '用例标题');
    const source = fieldLine(section, '来源');
    const preconditions = numberedBlock(section, '前置条件', '测试步骤');
    const steps = numberedBlock(section, '测试步骤', '预期结果');
    const expectedResults = numberedBlock(section, '预期结果', null);
    const semantics = {
      caseId,
      preconditions,
      steps,
      expectedResults,
      sources: [source],
    };
    return [{
      ...semantics,
      title,
      fingerprint: fingerprintCaseSemantics(semantics),
    }];
  });
  const duplicate = cases.find((item, index) => (
    cases.findIndex((candidate) => candidate.caseId === item.caseId) !== index
  ));
  if (duplicate) throw new Error(`PRODUCT_CENTER_ITEM_CASE_DUPLICATE:${duplicate.caseId}`);
  return cases.sort((left, right) => left.caseId.localeCompare(right.caseId));
}

function fieldLine(section: string, label: string): string {
  const value = section.match(new RegExp(`^${label}：(.+)$`, 'm'))?.[1]?.trim();
  if (!value) throw new Error(`PRODUCT_CENTER_ITEM_CASE_FIELD_REQUIRED:${label}`);
  return value;
}

function numberedBlock(section: string, startLabel: string, endLabel: string | null): string[] {
  const pattern = endLabel
    ? `^${startLabel}：\\s*\\n([\\s\\S]*?)(?=^${endLabel}：)`
    : `^${startLabel}：\\s*\\n([\\s\\S]*)$`;
  const block = section.match(new RegExp(pattern, 'm'))?.[1] ?? '';
  const items: string[] = [];
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const numbered = line.match(/^\d+[.)、]\s*(.+)$/);
    if (numbered) items.push(numbered[1].trim());
    else if (items.length > 0) items[items.length - 1] = `${items.at(-1)}\n${line}`;
    else items.push(line);
  }
  if (items.length === 0) throw new Error(`PRODUCT_CENTER_ITEM_CASE_BLOCK_REQUIRED:${startLabel}`);
  return items;
}
