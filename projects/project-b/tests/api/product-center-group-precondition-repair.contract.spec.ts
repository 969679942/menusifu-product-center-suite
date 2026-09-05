import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { diagnoseProductCenterMarkdownTestPlan } from '../../utils/product-center-test-plan-markdown';
import {
  verifyProductCenterBusinessRuleCitation,
  verifyProductCenterXmindCitation,
} from '../../utils/product-center-source-citation';

const projectRoot = path.resolve(__dirname, '../..');
const infoRoot = path.resolve(projectRoot, '../Merchant Center Info');
const sourceRoot = path.join(infoRoot, '00-待转换测试方案/用例库/商品中心-商品管理-组');
const decisionPath = path.join(
  projectRoot,
  'contracts/product-center/reviews/group-missing-precondition-decisions.json',
);

test.describe('商品中心组用例缺失前置条件受控修复', () => {
  test('应严格按负责人授权完成37条来源映射且无法证明的用例保持阻断', async () => {
    const [decision, markdown, xmind, businessRules] = await Promise.all([
      readJson(decisionPath),
      readFile(path.join(sourceRoot, '2.商品中心-商品管理-组-正式测试用例.md'), 'utf8'),
      readFile(path.join(sourceRoot, '2.商品中心-商品管理-组.xmind')),
      readFile(path.join(infoRoot, '商品中心业务规则.md'), 'utf8'),
    ]);

    expect(decision.guardrails).toEqual({
      businessRuleMutationAllowed: false,
      inferenceAllowed: false,
      unmatchedDisposition: 'blocked',
    });
    expect(decision.summary).toEqual({
      totalCases: 37,
      inheritedDisplayCases: 4,
      businessRuleVerifiedCases: 22,
      xmindRemappedCases: 15,
      repairedCases: 35,
      blockedCases: 2,
    });

    const caseIds = decision.cases.map((item: any) => item.caseId);
    expect(new Set(caseIds).size).toBe(37);
    expect(decision.cases.filter((item: any) => item.disposition === 'repaired')).toHaveLength(35);
    expect(decision.cases.filter((item: any) => item.disposition === 'blocked')).toHaveLength(2);
    expect(decision.cases.filter((item: any) => item.inheritsDocumentPrecondition)).toHaveLength(34);

    const diagnostics = diagnoseProductCenterMarkdownTestPlan(markdown);
    const missingCases = new Set(
      diagnostics.issues
        .filter((item) => item.code === 'MISSING_SECTION')
        .map((item) => item.caseId),
    );
    const blockedCaseIds = decision.cases
      .filter((item: any) => item.disposition === 'blocked')
      .map((item: any) => item.caseId)
      .sort();
    expect(blockedCaseIds).toEqual([
      'TC-GRP-ADD-002',
      'TC-GRP-MTH-002',
    ]);
    expect([...missingCases].filter((caseId): caseId is string => caseIds.includes(caseId)).sort())
      .toEqual(blockedCaseIds);

    for (const evidence of Object.values(decision.evidenceCatalog.businessRules) as any[]) {
      expect(verifyProductCenterBusinessRuleCitation(businessRules, evidence)).toMatchObject({
        verified: true,
        citation: evidence.citation,
      });
    }
    for (const evidence of Object.values(decision.evidenceCatalog.xmind) as any[]) {
      expect(verifyProductCenterXmindCitation(xmind, evidence)).toMatchObject({
        verified: true,
        citation: evidence.citation,
      });
    }

    for (const item of decision.cases.filter((entry: any) => entry.disposition === 'repaired') as any[]) {
      const block = caseBlock(markdown, item.caseId);
      expect(block).toContain(`来源：${item.canonicalSource}`);
      item.preconditions.forEach((precondition: string, index: number) => {
        expect(block).toContain(`${index + 1}. ${precondition}`);
      });
    }
    decision.cases
      .filter((item: any) => item.disposition === 'blocked')
      .forEach((item: any) => expect(item.blockReason).toMatch(/精确来源未定义查询数据前置/));
  });
});

function caseBlock(markdown: string, caseId: string): string {
  const escaped = caseId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matched = markdown.match(new RegExp(
    `^### 用例编号：${escaped}\\r?\\n([\\s\\S]*?)(?=^### 用例编号：|(?![\\s\\S]))`,
    'm',
  ));
  if (!matched) throw new Error(`正式测试方案缺少用例：${caseId}`);
  return matched[0];
}

async function readJson(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
