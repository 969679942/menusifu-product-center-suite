import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { publishImmutableArtifact } from '../utils/immutable-artifact';
import { parseProductCenterItemCaseSemanticFingerprints } from '../utils/product-center-item-case-semantic-fingerprint';
import { fingerprintExecutionContext } from '../../Test Automation Platform/src/utils/test-execution-state';
import { fingerprintProductCenterItemImplementation } from '../adapters/product-center/product-center-item-implementation';

const root = process.cwd();
const manifestPath = 'contracts/product-center/test-cases/canonical/product-center-item-current-receipt-contract.json';
const conversionPath = 'output/product-center-item-213-conversion.json';
const reportPath = 'output/product-center-item-source-governed-20260910T060614Z.json';
const sourcePath = '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md';
const ids = ['TC-ITEM-ADD-012', 'TC-ITEM-ADD-013'] as const;

const read = (relativePath: string) => JSON.parse(fs.readFileSync(path.resolve(root, relativePath), 'utf8').replace(/^\uFEFF/, '')) as any;
const sha256 = (relativePath: string) => createHash('sha256').update(fs.readFileSync(path.resolve(root, relativePath))).digest('hex');

function findReceipts(node: any, output: any[] = []): any[] {
  if (!node || typeof node !== 'object') return output;
  if (Array.isArray(node)) {
    for (const child of node) findReceipts(child, output);
    return output;
  }
  for (const attachment of node.attachments ?? []) {
    if (attachment?.name !== 'test-execution-receipt' || typeof attachment.body !== 'string') continue;
    try {
      const receipt = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
      if (ids.includes(receipt.caseId)) output.push(receipt);
    } catch { /* ignore unrelated malformed attachments */ }
  }
  for (const child of Object.values(node)) findReceipts(child, output);
  return output;
}

function occurrenceBindings(receipt: any, business: Array<{ operationKey: string; sourceStepId: string; executableOperationKey: string; occurrence: number }>) {
  const counts = new Map<string, number>();
  const indexed = receipt.operationReceipts
    .slice()
    .sort((left: any, right: any) => left.sequence - right.sequence)
    .map((item: any) => {
      const occurrence = (counts.get(item.operationKey) ?? 0) + 1;
      counts.set(item.operationKey, occurrence);
      return { item, occurrence };
    });
  const chosen = new Set(business.map((item) => JSON.stringify([item.executableOperationKey, item.occurrence])));
  const supporting = indexed
    .filter(({ item, occurrence }) => !chosen.has(JSON.stringify([item.operationKey, occurrence])))
    .map(({ item, occurrence }) => ({ executableOperationKey: item.operationKey, occurrence, required: true }));
  return { supporting, operationCount: indexed.length };
}

const manifest = read(manifestPath);
const conversion = read(conversionPath);
const source = parseProductCenterItemCaseSemanticFingerprints(path.resolve(root, sourcePath));
const receipts = findReceipts(read(reportPath));
const receiptById = new Map(receipts.map((receipt) => [receipt.caseId, receipt]));
const conversionById = new Map(conversion.cases.map((item: any) => [item.caseId, item]));
const sourceById = new Map(source.map((item) => [item.caseId, item]));

const businessById: Record<string, Array<{ operationKey: string; sourceStepId: string; executableOperationKey: string; occurrence: number }>> = {
  'TC-ITEM-ADD-012': [
    ['ItemCreateSidePage.fillItemName', 1],
    ['ItemCreateSidePage.fillStandardPrice', 1],
    ['ItemCreateSidePage.clickSave', 1],
    ['ItemListPage.clickItemName', 1],
    ['ItemListPage.fillSearch', 1],
  ].map(([executableOperationKey, occurrence], index) => ({
    operationKey: `TC-ITEM-ADD-012:action-${index + 1}`,
    sourceStepId: `TC-ITEM-ADD-012:action-${index + 1}`,
    executableOperationKey: executableOperationKey as string,
    occurrence: occurrence as number,
  })),
  'TC-ITEM-ADD-013': [
    ['ItemCreateSidePage.ensureAdvancedSettingsExpanded', 1],
    ['ItemCreateSidePage.fillItemName', 1],
    ['ItemCreateSidePage.fillPosName', 1],
    ['ItemCreateSidePage.fillKitchenName', 1],
    ['ItemCreateSidePage.fillStandardPrice', 1],
    ['ItemCreateSidePage.clickSave', 1],
    ['ItemListPage.clickItemName', 1],
  ].map(([executableOperationKey, occurrence], index) => ({
    operationKey: `TC-ITEM-ADD-013:action-${index + 1}`,
    sourceStepId: `TC-ITEM-ADD-013:action-${index + 1}`,
    executableOperationKey: executableOperationKey as string,
    occurrence: occurrence as number,
  })),
};

for (const caseId of ids) {
  const receipt = receiptById.get(caseId);
  const conversionCase = conversionById.get(caseId);
  const sourceCase = sourceById.get(caseId);
  if (!receipt || !conversionCase || !sourceCase) throw new Error(`ADDON_CONTRACT_INPUT_MISSING:${caseId}`);
  if (receipt.receiptVersion !== '4.0.0' || receipt.claims?.observed?.length !== 3) throw new Error(`ADDON_RECEIPT_NOT_FORMAL:${caseId}`);
  const business = businessById[caseId];
  const { supporting, operationCount } = occurrenceBindings(receipt, business);
  if (business.length !== sourceCase.steps.length || operationCount !== business.length + supporting.length) {
    throw new Error(`ADDON_OPERATION_MAPPING_INCOMPLETE:${caseId}`);
  }
  const entry = {
    caseId,
    caseFingerprint: conversionCase.bindingFingerprint,
    semanticCaseFingerprint: sourceCase.fingerprint,
    implementationFingerprint: fingerprintProductCenterItemImplementation(root, caseId),
    executionContextFingerprint: fingerprintExecutionContext(receipt.executionContext),
    requiredOperationKeys: sourceCase.steps.map((_, index) => `${caseId}:action-${index + 1}`),
    requiredAssertionIds: conversionCase.assertionIds,
    cleanupRequired: true,
    operationMapping: {
      schemaVersion: '1.0.0',
      sourceStepIds: sourceCase.steps.map((_, index) => `${caseId}:action-${index + 1}`),
      business,
      supporting,
    },
  };
  manifest.cases = manifest.cases.filter((item: any) => item.caseId !== caseId);
  manifest.cases.push(entry);
}
manifest.reportPaths = [...new Set([...manifest.reportPaths, reportPath])];
publishImmutableArtifact({ outputRoot: root, relativePath: manifestPath,
  content: `${JSON.stringify(manifest, null, 2)}\n`, reason: 'register-current-addon-012-013-receipt-contract-after-real-revalidation' });
console.log(JSON.stringify({
  manifestPath,
  reportPath,
  registered: ids,
  reportSha256: sha256(reportPath),
}));
