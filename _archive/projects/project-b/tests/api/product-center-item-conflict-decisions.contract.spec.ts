import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');

test.describe('商品中心 canonical conflict 批量决策合同', () => {
  test('C01-C09 应精确覆盖 19 条冲突且保持三种处置互斥', async () => {
    const decisionPath = path.join(
      projectRoot,
      'contracts/product-center/reviews/product-center-item-canonical-conflict-decisions.json',
    );
    expect(fs.existsSync(decisionPath)).toBe(true);
    if (!fs.existsSync(decisionPath)) return;
    const document = JSON.parse(fs.readFileSync(decisionPath, 'utf8')) as any;
    const caseIds = document.caseDecisions.map((item: any) => item.caseId);

    expect(document).toMatchObject({
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-canonical-conflict-decisions',
      confirmedBy: '金将军',
      summary: {
        groups: 9,
        cases: 19,
        updateCanonical: 9,
        retainCanonicalFileBug: 6,
        needsPrd: 4,
      },
    });
    expect(document.groups.map((item: any) => item.groupId)).toEqual([
      'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09',
    ]);
    expect(caseIds).toHaveLength(19);
    expect(new Set(caseIds).size).toBe(19);
    expect(document.caseDecisions.filter((item: any) => item.decision === 'update-canonical')).toHaveLength(9);
    expect(document.caseDecisions.filter((item: any) => item.decision === 'retain-canonical-file-bug')).toHaveLength(6);
    expect(document.caseDecisions.filter((item: any) => item.decision === 'needs-prd')).toHaveLength(4);
    expect(document.caseDecisions.find((item: any) => item.caseId === 'TC-ITEM-STD-067')).toMatchObject({
      groupId: 'C09',
      decision: 'update-canonical',
    });
    expect(document.caseDecisions.find((item: any) => item.caseId === 'TC-ITEM-STD-021')).toMatchObject({
      groupId: 'C03',
      decision: 'retain-canonical-file-bug',
    });
    expect(document.caseDecisions.find((item: any) => item.caseId === 'TC-ITEM-PKG-019')).toMatchObject({
      groupId: 'C03',
      decision: 'needs-prd',
    });
  });

  test('只有 update-canonical 的 9 条用例可以进入产品确认校正', async () => {
    const confirmations = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/reviews/product-center-item-rule-confirmations.json',
    ), 'utf8')) as any;
    const decisionIds = [
      'BR-ITEM-LIST-CURRENT-STRUCTURE',
      'BR-ITEM-NAME-CURRENT-BOUNDARY',
      'BR-ITEM-COMBO-GROUP-ONLY-MODEL',
      'BR-ITEM-MENU-REFERENCE-DISABLE-BLOCK',
    ];
    const selected = confirmations.confirmations.filter((item: any) => decisionIds.includes(item.ruleId));
    const corrections = selected.flatMap((item: any) => item.canonicalCorrections ?? []);

    expect(selected).toHaveLength(4);
    expect(corrections).toHaveLength(9);
    expect(new Set(corrections.map((item: any) => item.canonicalId)).size).toBe(9);
    expect(corrections.find((item: any) => item.canonicalId === 'TC-ITEM-STD-002')).toMatchObject({
      title: '商品列表展示当前筛选、核心字段和分页入口',
    });
    expect(corrections.find((item: any) => item.canonicalId === 'TC-ITEM-STD-008')).toMatchObject({
      title: '商品名称最多 100 字符且连续空格不可保存',
    });
    expect(corrections.find((item: any) => item.canonicalId === 'TC-ITEM-STD-067').expectedResults)
      .toEqual(expect.arrayContaining([expect.stringContaining('BITEM-2013')]));
    expect(corrections.some((item: any) => [
      'TC-ITEM-STD-021',
      'TC-ITEM-STD-023',
      'TC-ITEM-ADD-010',
      'TC-ITEM-PKG-019',
      'TC-ITEM-PKG-013',
      'TC-ITEM-ADD-001',
      'TC-ITEM-ADD-015',
      'TC-ITEM-STD-081',
      'TC-ITEM-ADD-024',
      'TC-ITEM-PKG-035',
    ].includes(item.canonicalId))).toBe(false);

    const allCorrections = confirmations.confirmations.flatMap(
      (item: any) => item.canonicalCorrections ?? [],
    );
    expect(new Set(allCorrections.map((item: any) => item.canonicalId)).size)
      .toBe(allCorrections.length);
  });
});
