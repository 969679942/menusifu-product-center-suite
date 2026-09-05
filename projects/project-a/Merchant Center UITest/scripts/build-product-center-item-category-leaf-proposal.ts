import fs from 'node:fs';
import path from 'node:path';
import type { ProductCenterCanonicalCase } from '../utils/product-center-canonical-item-test-plan';
import {
  buildProductCenterItemCategoryLeafProposal,
  closeProductCenterItemCategoryLeafProposal,
  type ProductCenterItemCategoryLeafProbeApproval,
} from '../utils/product-center-item-category-leaf-proposal';
import type { ProductCenterPageContractObservation } from '../utils/product-center-page-contract-observation';
import { scanGeneratedArtifacts } from '../utils/product-center-run-safety';

export function buildProductCenterItemCategoryLeafProposalArtifacts(options: {
  projectRoot?: string;
  outputRoot?: string;
  now?: string;
  maxAgeMs?: number;
} = {}): { proposalPath: string; markdownPath: string } {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const outputCanonicalPath = path.join(
    outputRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-canonical-release.json',
  );
  const projectCanonicalPath = path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-canonical-release.json',
  );
  const canonicalRelease = readJson<{ cases: ProductCenterCanonicalCase[] }>(
    fs.existsSync(outputCanonicalPath) ? outputCanonicalPath : projectCanonicalPath,
  );
  const canonicalCase = canonicalRelease.cases.find((item) => (
    item.canonicalId === 'TC-ITEM-STD-007'
  ));
  if (!canonicalCase) throw new Error('缺少 TC-ITEM-STD-007 canonical 用例');

  const pageObservation = readJson<ProductCenterPageContractObservation>(path.join(
    projectRoot,
    'output/page-contract/product-center-page-contract-observation.json',
  ));
  if (pageObservation.status !== 'clean') throw new Error('当前页面合同不是 clean');
  const routeObservations = pageObservation.observations.filter((item) => (
    item.route === canonicalCase.route
    && item.capabilityIds.includes('item.createStandard')
    && item.runtimeAccepted
    && item.sidebarEntryVerified
  ));
  if (routeObservations.length !== 1) {
    throw new Error(`标准商品列表入口证据必须唯一：${routeObservations.length}`);
  }
  const proposal = buildProductCenterItemCategoryLeafProposal({
    canonicalCase,
    routeObservation: routeObservations[0],
    approval: readJson<ProductCenterItemCategoryLeafProbeApproval>(path.join(
      projectRoot,
      'contracts/product-center/reviews/product-center-item-category-leaf-probe-approval.json',
    )),
    now: options.now ?? new Date().toISOString(),
    maxAgeMs: options.maxAgeMs,
  });
  const recipePath = path.join(
    outputRoot,
    'contracts/product-center/recipes/product-center-item-category-leaf-probe-recipes.json',
  );
  const acceptancePath = path.join(
    outputRoot,
    'output/recipes/product-center-item-category-leaf-probe-acceptance.json',
  );
  const evidencePath = path.join(
    outputRoot,
    'output/recipes/product-center-item-category-leaf-probe-evidence.json',
  );
  let finalProposal: ReturnType<typeof buildProductCenterItemCategoryLeafProposal>
    | ReturnType<typeof closeProductCenterItemCategoryLeafProposal> = proposal;
  if ([recipePath, acceptancePath, evidencePath].every((filePath) => fs.existsSync(filePath))) {
    const recipe = readJson<{ fingerprint: string }>(recipePath);
    try {
      type ClosureInput = Parameters<typeof closeProductCenterItemCategoryLeafProposal>[0];
      finalProposal = closeProductCenterItemCategoryLeafProposal({
        proposal,
        recipeFingerprint: recipe.fingerprint,
        acceptance: readJson<ClosureInput['acceptance']>(acceptancePath),
        evidence: readJson<ClosureInput['evidence']>(evidencePath),
      });
    } catch {
      finalProposal = proposal;
    }
  }
  const proposalPath = path.join(
    outputRoot,
    'output/test-case-audit/product-center/item-category-leaf-technical-proposal-latest.json',
  );
  const markdownPath = path.join(
    outputRoot,
    'output/test-case-audit/product-center/item-category-leaf-technical-proposal-latest.md',
  );
  writeJson(proposalPath, finalProposal);
  writeText(markdownPath, renderProposalMarkdown(finalProposal));
  const findings = scanGeneratedArtifacts(path.dirname(proposalPath));
  if (findings.length > 0) throw new Error(`分类叶子选择 proposal 敏感扫描失败：${findings.length}`);
  return { proposalPath, markdownPath };
}

function renderProposalMarkdown(
  proposal: ReturnType<typeof buildProductCenterItemCategoryLeafProposal>
    | ReturnType<typeof closeProductCenterItemCategoryLeafProposal>,
): string {
  return [
    '# TC-ITEM-STD-007 技术绑定 Proposal',
    '',
    `- 优先级：${proposal.canonical.priority}`,
    `- 状态：${proposal.status}`,
    `- 路由：${proposal.canonical.route}`,
    `- 当前证据范围：${proposal.routeEntryEvidence.scope}`,
    '- 数据策略：只进入标准商品创建页并完成分类选择观察，不得点击保存。',
    '',
    '## Proposed Capabilities',
    '',
    ...proposal.proposedCapabilities.map((item) => `- ${item.id}：${item.status}`),
    '',
    '## Proposed Assertions',
    '',
    ...proposal.proposedAssertions.map((item) => `- ${item.id}：${item.status}`),
    '',
    '## Required Evidence',
    '',
    ...proposal.requiredEvidence.map((item) => `- ${item.kind}：${item.target}`),
    '',
    '## Blocking Reasons',
    '',
    ...proposal.blockingReasons.map((item) => `- ${item}`),
    '',
    '## Approval',
    '',
    `- 当前决定：${proposal.approval.decision}`,
    `- 审核人：${proposal.approval.reviewedBy ?? '未审核'}`,
    '- 执行边界：已批准仅执行只读 UI Probe；不得点击保存或触发数据写入。',
    '',
  ].join('\n');
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const paths = buildProductCenterItemCategoryLeafProposalArtifacts();
    process.stdout.write(`商品分类叶子选择技术 Proposal：\n${paths.proposalPath}\n${paths.markdownPath}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
