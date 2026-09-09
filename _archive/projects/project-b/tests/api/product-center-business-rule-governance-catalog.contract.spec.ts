import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { extractProductCenterDocumentRuleLedger } from '../../adapters/product-center/product-center-business-rule-document-coverage-adapter';
import { buildProductCenterBusinessRuleGovernanceCatalog } from '../../scripts/build-product-center-business-rule-governance-catalog';

const projectRoot = path.resolve(__dirname, '../..');
const workspaceRoot = path.resolve(projectRoot, '..');
const authorityPath = path.join(workspaceRoot, 'Merchant Center Info/商品中心业务规则.md');
const catalogRoot = path.join(workspaceRoot, 'Merchant Center Info/业务规则治理');
const derivedFiles = [
  'README.md',
  '01-当前正式规则.md',
  '02-待生命周期核验规则.md',
  '03-冲突规则.md',
  '04-历史与废弃规则.md',
  '05-覆盖缺口与执行证据.md',
];

test.describe('商品中心业务规则人工可读治理目录合同', () => {
  test('错误码参数冲突和同行其他规则不得造成冲突误判', () => {
    const ledger = extractProductCenterDocumentRuleLedger({
      formalRuleIds: [],
      documentText: [
        '## 组规则',
        '**BR-GRP-002** [B端] 重复提示 `SYSTEM-0002:参数冲突`。',
        '## 图片规则',
        '**BR-IMG-001** [PRD] 图片名称同渠道不可重复（裁剪见 `BR-IMG-003`）。**现网冲突**：允许同名。',
        '**BR-IMG-003** [PRD] 图片超限后进入裁剪流程。',
        '商品第二名称规则见 `BR-ITEM-021`。',
      ].join('\n'),
    });
    expect(ledger.find((item) => item.ruleId === 'BR-GRP-002')?.status).toBe('document-registered-pending-lifecycle');
    expect(ledger.find((item) => item.ruleId === 'BR-IMG-001')?.status).toBe('conflicted');
    expect(ledger.find((item) => item.ruleId === 'BR-IMG-003')?.status).toBe('document-registered-pending-lifecycle');
    expect(ledger.find((item) => item.ruleId === 'BR-ITEM-021')?.statement).toBe('未提取到独立规则正文，仅保留原文引用位置');
  });

  test('当前160条文档规则分类守恒且二十八条正式规则唯一完整', () => {
    const report = buildProductCenterBusinessRuleGovernanceCatalog();
    expect(report.summary).toMatchObject({
      documentRules: 160,
      formalRules: 28,
      pendingLifecycleRules: 126,
      conflictedRules: 0,
      historicalRules: 5,
      deprecatedRules: 1,
      candidateRules: 225,
      candidateRulesIncludedInDocumentDenominator: false,
    });
    expect(report.classificationConservation).toEqual({ expected: 160, actual: 160, valid: true });
    const formalDocument = fs.readFileSync(path.join(catalogRoot, '01-当前正式规则.md'), 'utf8');
    const formalHeadings = [...formalDocument.matchAll(/^## (BR-[A-Z0-9-]+)$/gm)].map((match) => match[1]);
    expect(formalHeadings).toHaveLength(28);
    expect(new Set(formalHeadings).size).toBe(28);
  });

  test('待核验规则按模块可定位且候选不混入文档规则清单', () => {
    const report = buildProductCenterBusinessRuleGovernanceCatalog();
    const pendingDocument = fs.readFileSync(path.join(catalogRoot, '02-待生命周期核验规则.md'), 'utf8');
    expect(pendingDocument).toContain('## ');
    const coverage = JSON.parse(fs.readFileSync(path.join(projectRoot, 'output/governance/product-center-business-rule-document-coverage.json'), 'utf8'));
    const pendingRuleIds = coverage.documentRuleLedger
      .filter((item: { status: string }) => item.status === 'document-registered-pending-lifecycle')
      .map((item: { ruleId: string }) => item.ruleId);
    expect(pendingRuleIds).toHaveLength(126);
    for (const ruleId of pendingRuleIds) expect(pendingDocument).toContain(`| ${ruleId} |`);
    expect(report.summary.candidateRules).toBe(225);
    expect(pendingDocument).not.toContain('225 条候选规则明细');
  });

  test('所有派生文档声明权威边界且连续构建哈希稳定', () => {
    const authorityBefore = sha256(fs.readFileSync(authorityPath));
    const first = buildProductCenterBusinessRuleGovernanceCatalog();
    const firstContents = derivedFiles.map((file) => fs.readFileSync(path.join(catalogRoot, file), 'utf8'));
    const second = buildProductCenterBusinessRuleGovernanceCatalog();
    const secondContents = derivedFiles.map((file) => fs.readFileSync(path.join(catalogRoot, file), 'utf8'));
    expect(second.inputFingerprint).toBe(first.inputFingerprint);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.generatedAt).toBe(first.generatedAt);
    expect(secondContents).toEqual(firstContents);
    for (const content of secondContents) {
      expect(content).toContain('本目录由程序从 `../商品中心业务规则.md` 及治理台账生成');
      expect(content).toContain('不是第二业务事实源');
    }
    expect(sha256(fs.readFileSync(authorityPath))).toBe(authorityBefore);
    expect(second.executionImpact).toEqual({
      businessCasesExecuted: false,
      existingPassedCasesInvalidated: false,
      rerunCaseIds: [],
      moduleDeliveryBlocked: false,
    });
  });

  test('治理总览必须把快速晋级工作台作为旧规则升级入口', () => {
    const overview = fs.readFileSync(path.join(catalogRoot, 'README.md'), 'utf8');
    expect(overview).toContain('[00-快速晋级工作台.md](00-快速晋级工作台.md)');
    expect(overview).toContain('不再作为默认逐条人工入口');
  });
});

function sha256(value: Buffer): string {
  return require('node:crypto').createHash('sha256').update(value).digest('hex');
}
