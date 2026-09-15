import fs from 'node:fs';
import path from 'node:path';
import { ITEM_CURRENT_RECEIPT_CONTRACT_PATH, qualifyProductCenterItemReleaseReceipts } from './product-center-item-release-receipts';

type BindingDisposition = {
  status: 'landed' | 'unlanded' | 'not-applicable';
  runtimeStatus?: string;
  bindingRuntimeStatus?: string;
  currentReceiptQualification?: { status: 'qualified' | 'incomplete'; reasons: string[] };
};

/** The public receipt qualifier owns acceptance; the asset index only renders its decision. */
export function projectItemAssetReceiptQualification<T extends BindingDisposition>(input: {
  dispositions: Map<string, T>;
  qualification: ReturnType<typeof qualifyProductCenterItemReleaseReceipts>;
}): void {
  for (const [caseId, evidence] of input.qualification.accepted) {
    const binding = input.dispositions.get(caseId);
    if (!binding || binding.status !== 'landed') continue;
    input.dispositions.set(caseId, { ...binding,
      ...(binding.runtimeStatus ? { bindingRuntimeStatus: binding.runtimeStatus } : {}),
      runtimeStatus: 'current-receipt-qualified',
      currentReceiptQualification: { status: 'qualified', reasons: [] },
      currentReceiptEvidence: evidence,
    });
  }
  for (const finding of input.qualification.findings) {
    const binding = input.dispositions.get(finding.caseId);
    if (!binding || binding.status !== 'landed') continue;
    input.dispositions.set(finding.caseId, { ...binding,
      ...(binding.runtimeStatus ? { bindingRuntimeStatus: binding.runtimeStatus } : {}),
      runtimeStatus: 'current-receipt-incomplete',
      currentReceiptQualification: { status: 'incomplete', reasons: finding.reasons },
    });
  }
}

export function refreshItemAssetReceiptQualification<T extends BindingDisposition>(projectRoot: string, dispositions: Map<string, T>): void {
  if (!fs.existsSync(path.join(projectRoot, ITEM_CURRENT_RECEIPT_CONTRACT_PATH))) return;
  const conversion = JSON.parse(fs.readFileSync(path.join(projectRoot, 'output/product-center-item-213-conversion.json'), 'utf8')) as {
    cases: Array<{ caseId: string; bindingFingerprint: string }>;
  };
  const cases = conversion.cases.filter(item => dispositions.get(item.caseId)?.status === 'landed');
  projectItemAssetReceiptQualification({ dispositions, qualification: qualifyProductCenterItemReleaseReceipts({ projectRoot, cases }) });
}
