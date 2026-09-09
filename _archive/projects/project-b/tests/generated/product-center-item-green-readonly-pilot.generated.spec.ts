import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { test } from '../../fixtures/product-center.fixture';
import {
  ProductCenterItemGreenReadonlyFlow,
  type ProductCenterMainImagePreviewEvidence,
} from '../../flows/product-center/product-center-item-green-readonly.flow';

type CaseStatus = 'accepted' | 'canonical-conflict' | 'environment-blocked' | 'executor-error';

type CaseEvidence = {
  groupId: string;
  caseId: string;
  status: CaseStatus;
  evidence: Record<string, unknown>;
  reason?: string;
  recordedAt: string;
};

test('绿色首批3条与主图冲突2条应通过共享只读链逐条留证', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const runId = process.env.PC_RECIPE_RUN_ID?.startsWith('AUTO_AUDIT_')
    ? process.env.PC_RECIPE_RUN_ID
    : `AUTO_AUDIT_GREEN_READONLY_${Date.now()}`;
  const outputPath = path.resolve(`output/audit/product-center-item-green-readonly-runtime-${runId}.json`);
  const retryAfterHarnessFix = new Set([
    'TC-ITEM-STD-064',
    'TC-ITEM-PKG-057',
    'TC-ITEM-STD-071',
    'TC-ITEM-PKG-054',
  ]);
  const previousReport = readExistingReport(outputPath);
  const cases = (previousReport?.cases ?? []).filter((item) => (
    item.status !== 'executor-error' && !retryAfterHarnessFix.has(item.caseId)
  ));
  const mutationRequests: Array<{ method: string; path: string }> = [];
  const report: Record<string, unknown> = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-green-readonly-runtime',
    runId,
    generatedAt: new Date().toISOString(),
    status: 'running',
    policy: {
      mode: 'wave-shared-chain',
      greenCaseEvidenceRequired: 3,
      conflictRecheckEvidenceRequired: 2,
      evidenceInheritanceAllowed: false,
      readOnly: true,
    },
    cases,
  };
  const flow = new ProductCenterItemGreenReadonlyFlow(page);
  const captureMutation = (request: { method(): string; url(): string }) => {
    const method = request.method();
    const requestPath = new URL(request.url()).pathname;
    if (isMutationRequest(method, requestPath)) mutationRequests.push({ method, path: requestPath });
  };
  page.on('request', captureMutation);
  checkpoint();

  try {
    await recordCase('AT03', 'TC-ITEM-STD-064', async () => {
      const evidence = await flow.searchSecondLanguage('taco');
      if (evidence.visibleRowCount === 0 && evidence.matchingResponseTexts.length === 0) {
        return {
          status: 'environment-blocked' as const,
          evidence,
          reason: '当前商户没有第二语言名称包含 taco 的查询样本',
        };
      }
      const accepted = evidence.responseStatus >= 200
        && evidence.responseStatus < 300
        && evidence.responsePath.endsWith('/ops-brand/brand-items/pageQuery')
        && evidence.currentPage === 1
        && evidence.visibleRowCount > 0
        && evidence.matchingResponseTexts.length > 0;
      return decision(accepted, evidence, '第二语言模糊查询未返回包含 taco 的结果或未回到首页');
    });
    await recordCase('AT34', 'TC-ITEM-PKG-057', async () => {
      const evidence = await flow.readOptionalComboDialog();
      const accepted = evidence.dialogCount === 1
        && evidence.groupNameInputCount === 1
        && evidence.altNameInputCount === 1
        && evidence.selectionQuantityInputCount === 1
        && evidence.mergeSwitchCount === 1
        && evidence.repeatSwitchCount === 1
        && evidence.itemSearchInputCount === 1
        && evidence.categoryFilterCount >= 1;
      return decision(accepted, evidence, '可选搭配弹窗当前字段或筛选入口不完整');
    });
    await recordImageCase('AT18', 'TC-ITEM-STD-071', 'Standard');
    await recordImageCase('AT31', 'TC-ITEM-ADD-035', 'Add-On');
    await recordImageCase('AT46', 'TC-ITEM-PKG-054', 'Combo');
  } finally {
    page.off('request', captureMutation);
    const counts = countStatuses(cases);
    report.status = counts['executor-error'] > 0
      ? 'executor-error'
      : counts['canonical-conflict'] > 0
        ? 'accepted-with-canonical-conflicts'
        : counts['environment-blocked'] > 0
          ? 'completed-with-environment-blocks'
          : 'accepted';
    report.completedAt = new Date().toISOString();
    report.summary = { recordedCases: cases.length, ...counts, mutationCount: mutationRequests.length };
    report.mutationRequests = mutationRequests;
    checkpoint();
    await testInfo.attach('product-center-item-green-readonly-runtime', {
      body: Buffer.from(JSON.stringify(report, null, 2), 'utf8'),
      contentType: 'application/json',
    });
  }

  expect(cases).toHaveLength(5);
  expect(cases.filter((item) => item.status === 'executor-error')).toEqual([]);
  expect(mutationRequests).toEqual([]);

  async function recordImageCase(
    groupId: string,
    caseId: string,
    typeLabel: 'Standard' | 'Add-On' | 'Combo',
  ): Promise<void> {
    await recordCase(groupId, caseId, async () => {
      const evidence = await flow.probeImagePreview(typeLabel);
      if (evidence.candidateCount === 0 || evidence.rowIndex === null) {
        return {
          status: 'environment-blocked' as const,
          evidence,
          reason: `当前页没有带主图的 ${typeLabel} 商品`,
        };
      }
      return decision(
        isAcceptedImagePreview(evidence),
        evidence,
        '点击列表主图后未出现大图、新页面或其他可审计预览表面',
      );
    });
  }

  async function recordCase(
    groupId: string,
    caseId: string,
    probe: () => Promise<Omit<CaseEvidence, 'groupId' | 'caseId' | 'recordedAt'>>,
  ): Promise<void> {
    if (cases.some((item) => item.caseId === caseId)) return;
    try {
      cases.push({ groupId, caseId, ...(await probe()), recordedAt: new Date().toISOString() });
    } catch (error) {
      cases.push({
        groupId,
        caseId,
        status: 'executor-error',
        evidence: { route: new URL(page.url()).pathname },
        reason: error instanceof Error ? error.message : String(error),
        recordedAt: new Date().toISOString(),
      });
    }
    checkpoint();
  }

  function checkpoint(): void {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, outputPath);
  }
});

function decision(
  accepted: boolean,
  evidence: Record<string, unknown>,
  reason: string,
): Omit<CaseEvidence, 'groupId' | 'caseId' | 'recordedAt'> {
  return accepted ? { status: 'accepted', evidence } : { status: 'canonical-conflict', evidence, reason };
}

function isAcceptedImagePreview(evidence: ProductCenterMainImagePreviewEvidence): boolean {
  return evidence.previewCount === 1 && evidence.sameImage;
}

function isMutationRequest(method: string, requestPath: string): boolean {
  if (method === 'PUT' || method === 'PATCH' || method === 'DELETE') return true;
  if (method !== 'POST') return false;
  return /\/ops-brand\/(brand-items\/(standard|combo|side)|brand-sections)$/.test(requestPath);
}

function countStatuses(cases: CaseEvidence[]): Record<CaseStatus, number> {
  return {
    accepted: cases.filter((item) => item.status === 'accepted').length,
    'canonical-conflict': cases.filter((item) => item.status === 'canonical-conflict').length,
    'environment-blocked': cases.filter((item) => item.status === 'environment-blocked').length,
    'executor-error': cases.filter((item) => item.status === 'executor-error').length,
  };
}

function readExistingReport(filePath: string): { cases?: CaseEvidence[] } | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as { cases?: CaseEvidence[] };
  } catch {
    return undefined;
  }
}
