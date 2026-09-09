import fs from 'node:fs';
import path from 'node:path';

export type ProductCenterGoldContractSummary = {
  contractPath: string;
  caseIds: string[];
  caseCount: number;
};

export type ProductCenterMainContractSummary = {
  contractPath: string;
  caseIds: string[];
  caseCount: number;
};

export function readProductCenterGoldContractSummary(
  rootDir = process.cwd(),
): ProductCenterGoldContractSummary {
  const contractPath = path.join(
    rootDir,
    'contracts/product-center/test-cases/pilots/product-center-test-plan-gold-set.json',
  );
  const document = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as {
    cases?: Array<{ id?: string }>;
  };
  const caseIds = (document.cases ?? []).map((item) => item.id?.trim() ?? '');
  if (caseIds.length === 0) throw new Error('Gold 权威合同分母为零');
  if (caseIds.some((caseId) => caseId === '')) throw new Error('Gold 权威合同存在空 caseId');
  if (new Set(caseIds).size !== caseIds.length) throw new Error('Gold 权威合同存在重复 caseId');
  return { contractPath, caseIds: [...caseIds].sort(), caseCount: caseIds.length };
}

export function readProductCenterMainContractSummary(
  rootDir = process.cwd(),
): ProductCenterMainContractSummary {
  const contractPath = path.join(
    rootDir,
    'contracts/product-center/test-cases/product-center-existing-sop-cases.json',
  );
  const document = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as {
    cases?: Array<{ id?: string; caseId?: string }>;
  };
  const caseIds = (document.cases ?? []).map((item) => (
    item.caseId?.trim() || item.id?.trim() || ''
  ));
  if (caseIds.length === 0) throw new Error('主 Recipe 权威合同分母为零');
  if (caseIds.some((caseId) => caseId === '')) throw new Error('主 Recipe 权威合同存在空 caseId');
  if (new Set(caseIds).size !== caseIds.length) throw new Error('主 Recipe 权威合同存在重复 caseId');
  return { contractPath, caseIds: [...caseIds].sort(), caseCount: caseIds.length };
}
