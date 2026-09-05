import fs from 'node:fs';
import path from 'node:path';
import { buildProductCenterControlledRepairClosure } from '../utils/product-center-quality-operations';

type RuntimeEvidence = {
  sidebarEntryVerified?: boolean;
  execution?: {
    capabilityIds?: string[];
    boundaryEvidence?: {
      maxLengthAttribute?: string;
      acceptedLength?: number;
      rejectedLength?: number;
      locatorCount?: number;
      visible?: boolean;
      enabled?: boolean;
    };
  };
};

const projectRoot = path.resolve(__dirname, '..');
const approvalGate = readJson(path.join(
  projectRoot,
  'output/maintenance/product-center-controlled-repair-approval-gate.json',
));
const incrementalPlan = readJson(path.join(
  projectRoot,
  'contracts/product-center/reviews/current-incremental-test-plan.json',
));
const incrementalResult = readJson(path.join(
  projectRoot,
  'contracts/product-center/reviews/current-incremental-test-result.json',
));

const expected = [
  {
    proposalId: 'repair:fields:/pp/brand/tag/description#action-1#primary-1#field-56',
    caseId: 'negative:description-tag-second-language-max',
    expectedMaxLength: 50,
  },
  {
    proposalId: 'repair:fields:/pp/brand/tag/description#action-1#primary-1#field-58',
    caseId: 'negative:description-tag-group-second-language-max',
    expectedMaxLength: 10,
  },
  {
    proposalId: 'repair:fields:/pp/brand/tag/statistic#action-1#primary-1#field-35',
    caseId: 'negative:statistic-tag-second-language-max',
    expectedMaxLength: 50,
  },
  {
    proposalId: 'repair:fields:/pp/brand/tag/statistic#action-1#primary-1#field-37',
    caseId: 'negative:statistic-tag-group-second-language-max',
    expectedMaxLength: 10,
  },
] as const;

const observations = expected.map((item) => {
  const result = incrementalResult.caseResults.find((candidate: any) => candidate.caseId === item.caseId);
  const runtimeEvidence = result?.runtimeEvidence as RuntimeEvidence | undefined;
  const boundary = runtimeEvidence?.execution?.boundaryEvidence;
  if (!boundary) throw new Error(`增量回归缺少边界运行证据：${item.caseId}`);
  return {
    ...item,
    observedMaxLength: Number(boundary.maxLengthAttribute),
    acceptedLength: Number(boundary.acceptedLength),
    rejectedLength: Number(boundary.rejectedLength),
    locatorCount: Number(boundary.locatorCount),
    visible: boundary.visible === true,
    enabled: boundary.enabled === true,
    sidebarEntryVerified: runtimeEvidence?.sidebarEntryVerified === true,
    firstCapabilityId: runtimeEvidence?.execution?.capabilityIds?.[0] ?? '',
  };
});

const closure = buildProductCenterControlledRepairClosure({
  approvalGate,
  incrementalPlan,
  incrementalResult,
  observations,
});
const outputPath = path.join(
  projectRoot,
  'output/maintenance/product-center-controlled-repair-closure.json',
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  ...closure,
  evidence: {
    approvalGate: 'output/maintenance/product-center-controlled-repair-approval-gate.json',
    incrementalPlan: 'contracts/product-center/reviews/current-incremental-test-plan.json',
    incrementalResult: 'contracts/product-center/reviews/current-incremental-test-result.json',
  },
}, null, 2)}\n`, 'utf8');
process.stdout.write(`商品中心受控修复已关闭：${outputPath}\n状态：${closure.status}\n`);

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
