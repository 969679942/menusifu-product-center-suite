import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseProductCenterXmindItemPlan,
} from '../utils/product-center-canonical-item-test-plan';
import type { ProductCenterItemPageGapReport } from '../utils/product-center-item-page-gap';
import {
  buildProductCenterItemRebuiltXmind,
  buildProductCenterItemXmindRebuildPlan,
  renderProductCenterItemXmindRebuildMarkdown,
  type ProductCenterItemRebuildCorrection,
} from '../utils/product-center-item-xmind-rebuild';
import { scanGeneratedArtifacts } from '../utils/product-center-run-safety';
import { buildProductCenterItemPageGapArtifacts } from './build-product-center-item-page-gap';

type ConfirmationDocument = {
  sourceRole: 'product-confirmed-rule';
  confirmations: Array<{
    ruleId: string;
    canonicalCorrections?: ProductCenterItemRebuildCorrection[];
  }>;
};

export function buildProductCenterItemXmindRebuildArtifacts(options: {
  projectRoot?: string;
  outputRoot?: string;
  generatedAt?: string;
} = {}): {
  planPath: string;
  markdownPath: string;
  xmindPath: string;
  manifestPath: string;
} {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info');
  const sourceDirectory = path.join(infoRoot, '00-待转换测试方案', '用例库', '商品中心-商品管理-商品');
  const formalPath = path.join(sourceDirectory, '1.商品中心-商品管理-商品-正式测试用例.md');
  const originalXmindPath = path.join(sourceDirectory, '1.商品中心-商品管理-商品.xmind');
  const confirmationPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-item-rule-confirmations.json',
  );
  const pageGapPaths = buildProductCenterItemPageGapArtifacts({
    projectRoot,
    outputRoot,
    generatedAt: options.generatedAt,
  });
  const pageGap = JSON.parse(fs.readFileSync(pageGapPaths.reportPath, 'utf8')) as ProductCenterItemPageGapReport;
  const confirmations = JSON.parse(fs.readFileSync(confirmationPath, 'utf8')) as ConfirmationDocument;
  if (confirmations.sourceRole !== 'product-confirmed-rule') {
    throw new Error('商品 XMind 重建缺少产品确认来源');
  }
  const rebuildCorrectionRuleIds = [
    'BR-ITEM-COMBO-GROUP-REQUIRED',
    'BR-ITEM-CATEGORY-DIRECT-PARENT-CREATE',
    'BR-TC-ITEM-PKG-057',
    'BR-TC-ITEM-PKG-058',
    'BR-ITEM-COMBO-OPTIONAL-EDIT-BOUNDARY',
    'BR-TC-ITEM-PKG-069',
    'BR-TC-ITEM-PKG-071',
    'BR-TC-ITEM-PKG-072',
    'BR-TC-ITEM-PKG-073',
    'BR-ITEM-LIST-CURRENT-STRUCTURE',
    'BR-ITEM-NAME-CURRENT-BOUNDARY',
    'BR-TC-ITEM-ADD-044',
    'BR-ITEM-MENU-REFERENCE-DISABLE-BLOCK',
  ];
  const correctionConfirmations = rebuildCorrectionRuleIds.map((ruleId) => {
    const confirmation = confirmations.confirmations.find((item) => item.ruleId === ruleId);
    if (!confirmation?.canonicalCorrections?.length) {
      throw new Error(`商品 XMind 重建缺少产品确认规则校正：${ruleId}`);
    }
    return confirmation;
  });
  const canonicalCorrections = correctionConfirmations.flatMap((item) => item.canonicalCorrections ?? []);
  if (new Set(canonicalCorrections.map((item) => item.canonicalId)).size !== canonicalCorrections.length) {
    throw new Error('商品 XMind 重建产品确认规则校正存在重复用例');
  }
  const originalXmind = fs.readFileSync(originalXmindPath);
  const originalPlan = parseProductCenterXmindItemPlan(originalXmind);
  const plan = buildProductCenterItemXmindRebuildPlan({
    formalMarkdown: fs.readFileSync(formalPath, 'utf8'),
    corrections: canonicalCorrections,
    supplementCases: pageGap.supplementCases,
    originalXmindLeaves: originalPlan.summary.leaves,
    originalXmindCompleteChains: originalPlan.summary.detailedCandidates,
    generatedAt: options.generatedAt,
  });
  const xmind = buildProductCenterItemRebuiltXmind(plan);
  const artifactRoot = path.join(
    outputRoot,
    'contracts/product-center/test-cases/canonical',
  );
  const planPath = path.join(artifactRoot, 'product-center-item-xmind-rebuild-pilot.json');
  const markdownPath = path.join(artifactRoot, 'product-center-item-xmind-rebuild-pilot.md');
  const xmindPath = path.join(artifactRoot, 'product-center-item-xmind-rebuild-pilot.xmind');
  const manifestPath = path.join(artifactRoot, 'product-center-item-xmind-rebuild-manifest.json');
  writeJson(planPath, plan);
  writeText(markdownPath, renderProductCenterItemXmindRebuildMarkdown(plan));
  writeBuffer(xmindPath, xmind);
  const originalHashAfter = sha256(fs.readFileSync(originalXmindPath));
  const originalHashBefore = sha256(originalXmind);
  if (originalHashAfter !== originalHashBefore) {
    throw new Error('原商品 XMind 在重建过程中发生变化');
  }
  writeJson(manifestPath, {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-xmind-rebuild-manifest',
    generatedAt: plan.generatedAt,
    planFingerprint: plan.fingerprint,
    sourceFiles: {
      formalMarkdown: { path: formalPath, sha256: sha256(fs.readFileSync(formalPath)) },
      originalXmind: { path: originalXmindPath, sha256: originalHashBefore, overwritten: false },
      productConfirmation: { path: confirmationPath, sha256: sha256(fs.readFileSync(confirmationPath)) },
      pageGap: { path: pageGapPaths.reportPath, fingerprint: pageGap.fingerprint },
    },
    outputs: {
      plan: { path: planPath, sha256: sha256(fs.readFileSync(planPath)) },
      markdown: { path: markdownPath, sha256: sha256(fs.readFileSync(markdownPath)) },
      xmind: { path: xmindPath, sha256: sha256(xmind), bytes: xmind.length },
    },
    guardrails: plan.guardrails,
  });
  const findings = scanGeneratedArtifacts(artifactRoot);
  if (findings.length > 0) {
    throw new Error(`商品 XMind 重建产物安全扫描未通过：${findings.length}`);
  }
  return { planPath, markdownPath, xmindPath, manifestPath };
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
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

function writeBuffer(filePath: string, value: Buffer): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value);
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const paths = buildProductCenterItemXmindRebuildArtifacts();
    process.stdout.write(`商品 XMind 全量重建试点已生成：\n${paths.xmindPath}\n${paths.planPath}\n${paths.markdownPath}\n${paths.manifestPath}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
