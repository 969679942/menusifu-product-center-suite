import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterUnifiedAudit } from '../../utils/product-center-unified-audit-source';

test.describe('商品中心统一审计源入口合同', () => {
  test('没有用例时可接收业务 URL，但只生成只读临时审计状态', () => {
    const report = buildProductCenterUnifiedAudit({ source: 'https://example.test/pp/brand/list?access_token=secret', allowedUrlHosts: ['example.test'], generatedAt: '2026-09-04T00:00:00.000Z' });
    expect(report.status).toBe('provisional');
    expect(report.executionAllowed).toBe(false);
    expect(report.mode).toBe('read-only-observation');
    expect(report.sources[0].locator).not.toContain('access_token');
    expect(report.sources[0].locator).not.toContain('secret');
    expect(report.unresolved.map((item) => item.code)).toEqual(expect.arrayContaining(['PAGE_OBSERVATION_PENDING', 'CASE_SOURCE_MISSING', 'EXECUTION_CONTEXT_REQUIRED']));
  });

  test('本地 Markdown 用例文件可解析为候选且不修改正式文件', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-unified-audit-'));
    try {
      const filePath = path.join(root, 'plan.md');
      const content = [
        '### 用例编号：TC-LOCAL-001', '用例标题：本地来源候选', '所属模块：商品中心', '优先级：P1',
        '来源：PRD明确 ← local-prd', '前置条件：', '1. 已登录', '测试步骤：', '1. 打开商品列表',
        '预期结果：', '1. 商品列表可见', '---',
      ].join('\n');
      fs.writeFileSync(filePath, content, 'utf8');
      const report = buildProductCenterUnifiedAudit({ source: filePath, projectRoot: root, allowedRoots: [root], generatedAt: '2026-09-04T00:00:00.000Z' });
      expect(report.status).toBe('review-required');
      expect(report.candidates[0]).toEqual(expect.objectContaining({ formalCaseId: 'TC-LOCAL-001', title: '本地来源候选', actions: ['打开商品列表'] }));
      expect(report.candidates[0].reviewRequired).toEqual(expect.arrayContaining(['PAGE_OBSERVATION_REQUIRED', 'EXECUTION_CONTEXT_REQUIRED']));
      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('本地 XMind 可生成无正式 caseId 的候选并保留待确认门禁', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-unified-xmind-'));
    try {
      const xmindPath = path.resolve(__dirname, '../../../Merchant Center Info/00-待转换测试方案/来源资料/商品中心-商品管理-商品/1.商品中心-商品管理-商品-重建试点.xmind');
      const report = buildProductCenterUnifiedAudit({ source: xmindPath, projectRoot: path.resolve(__dirname, '../..'), allowedRoots: [path.resolve(__dirname, '../../../Merchant Center Info')], generatedAt: '2026-09-04T00:00:00.000Z' });
      expect(report.sources[0].format).toBe('xmind-test-plan');
      expect(report.candidates.length).toBeGreaterThan(0);
      expect(report.candidates[0].formalCaseId).toBeNull();
      expect(report.executionAllowed).toBe(false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('禁止从允许目录外读取本地源', () => {
    const report = buildProductCenterUnifiedAudit({ source: 'C:/outside/plan.md', projectRoot: 'C:/workspace', allowedRoots: ['C:/workspace'] });
    expect(report.status).toBe('blocked-source');
    expect(report.unresolved[0].code).toBe('SOURCE_RESOLUTION_FAILED');
  });

  test('多来源合并时按正式 caseId 去重并合并来源，而不增加正式用例', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-unified-merge-'));
    try {
      const content = JSON.stringify({ cases: [{ caseId: 'TC-MERGE-001', title: '合并候选', module: '商品中心', actions: ['打开列表'], expectedResults: ['列表可见'] }] });
      const first = path.join(root, 'first.json'); const second = path.join(root, 'second.json');
      fs.writeFileSync(first, content); fs.writeFileSync(second, content);
      const report = buildProductCenterUnifiedAudit({ sources: [first, second], projectRoot: root, allowedRoots: [root], generatedAt: '2026-09-04T00:00:00.000Z' });
      expect(report.candidates).toHaveLength(1);
      expect(report.candidates[0].sourceRefs).toHaveLength(2);
      expect(report.guardrails.canonicalCaseMutationAllowed).toBe(false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
