import fs from 'node:fs';

/** Preserve formal IDs even when numbering has gaps; cleanup is an independent surface. */
export function parseProductCenterItemAssertionSurfaces(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n?/g, '\n');
  return content.split(/^### 用例编号：/m).slice(1).flatMap((section) => {
    const caseId = section.match(/^(TC-ITEM-[A-Z0-9-]+)/)?.[1];
    if (!caseId) return [];
    const body = section.match(/^预期结果：\s*\n([\s\S]*?)(?=^[^\s\d#][^\n：]{0,30}：\s*$|^#{1,3}\s|$(?![\s\S]))/m)?.[1] ?? '';
    const numbers = [...body.matchAll(/^(\d+)[.)、]\s+(.+)$/gm)].map((match) => Number(match[1]));
    const assertions: Array<{ id: string; text: string }> = [];
    for (const line of body.split('\n').map((value) => value.trim()).filter(Boolean)) {
      const numbered = line.match(/^(\d+)[.)、]\s+(.+)$/);
      if (numbered) assertions.push({ id: `${caseId}:expectation-${Number(numbered[1])}`, text: numbered[2] });
      else if (assertions.length) assertions[assertions.length - 1].text += `\n${line}`;
    }
    const duplicateNumbers = [...new Set(numbers.filter((number, index) => numbers.indexOf(number) !== index))];
    const assertionIds = [...new Set(numbers)].map((number) => `${caseId}:expectation-${number}`);
    const reasons = numbers.length === 0 ? ['FORMAL_ASSERTION_SECTION_EMPTY'] : [];
    if (numbers.some((number) => !Number.isSafeInteger(number) || number <= 0)) reasons.push('FORMAL_ASSERTION_NUMBER_INVALID');
    if (duplicateNumbers.length) reasons.push('FORMAL_ASSERTION_NUMBERING_AMBIGUOUS');
    return [{ caseId, assertionIds, assertions, duplicateNumbers, reasons }];
  });
}
