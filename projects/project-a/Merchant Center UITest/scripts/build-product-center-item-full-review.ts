import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterItemFullReview,
  renderProductCenterItemFullReviewMarkdown,
  type ProductCenterItemFullReviewDocument,
} from '../utils/product-center-item-full-review';
import type { ProductCenterItemXmindRebuildPlan } from '../utils/product-center-item-xmind-rebuild';

type ConfirmationDocument = {
  confirmations: Array<{
    ruleId: string;
    statement: string;
    linkedCanonicalIds: string[];
  }>;
};

type AuthoritativeReleaseDocument = {
  status: 'released';
  cases: Array<{
    caseId: string;
    reviewDecision: 'approved';
    scope: 'executable';
    source: string;
  }>;
};

export function buildProductCenterItemFullReviewArtifacts(options: {
  projectRoot?: string;
  outputRoot?: string;
  reviewedAt?: string;
} = {}): {
  review: ProductCenterItemFullReviewDocument;
  jsonPath: string;
  markdownPath: string;
} {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const canonicalRoot = path.join(projectRoot, 'contracts/product-center/test-cases/canonical');
  const plan = readJson<ProductCenterItemXmindRebuildPlan>(path.join(
    canonicalRoot,
    'product-center-item-xmind-rebuild-pilot.json',
  ));
  const confirmationPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-item-rule-confirmations.json',
  );
  const confirmations = readJson<ConfirmationDocument>(confirmationPath);
  const authoritativeRelease = readJson<AuthoritativeReleaseDocument>(path.join(
    canonicalRoot,
    'product-center-item-authoritative-release.json',
  ));
  if (authoritativeRelease.status !== 'released') {
    throw new Error('商品全审缺少已发布的逐条权威来源');
  }
  const authoritativeReleaseByCaseId = Object.fromEntries(
    authoritativeRelease.cases.map((item) => [item.caseId, {
      reviewDecision: item.reviewDecision,
      scope: item.scope,
      source: item.source,
    }]),
  );
  const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info');
  const sourceCorpus = [
    fs.readFileSync(path.join(infoRoot, '商品中心业务规则.md'), 'utf8'),
    fs.readFileSync(path.join(
      infoRoot,
      '00-待转换测试方案',
      '用例库',
      '商品中心-商品管理-商品',
      '1.商品中心-商品管理-商品-正式测试用例.md',
    ), 'utf8'),
    fs.readFileSync(confirmationPath, 'utf8'),
  ].join('\n');
  const confirmedEvidenceByCaseId: Record<string, string[]> = {};
  for (const confirmation of confirmations.confirmations) {
    for (const caseId of confirmation.linkedCanonicalIds) {
      confirmedEvidenceByCaseId[caseId] = [
        ...(confirmedEvidenceByCaseId[caseId] ?? []),
        `${confirmation.ruleId} ${confirmation.statement}`,
      ];
    }
  }
  const review = buildProductCenterItemFullReview({
    plan,
    sourceCorpus,
    confirmedEvidenceByCaseId,
    authoritativeReleaseByCaseId,
    reviewedAt: options.reviewedAt,
  });
  const outputDirectory = path.join(outputRoot, 'contracts/product-center/test-cases/canonical');
  const jsonPath = path.join(outputDirectory, 'product-center-item-full-review.json');
  const markdownPath = path.join(outputDirectory, 'product-center-item-full-review.md');
  writeText(jsonPath, `${JSON.stringify(review, null, 2)}\n`);
  writeText(markdownPath, renderProductCenterItemFullReviewMarkdown(review));
  return { review, jsonPath, markdownPath };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const artifacts = buildProductCenterItemFullReviewArtifacts();
    process.stdout.write(
      `商品测试用例逐条全审完成：通过=${artifacts.review.summary.approved}；修订=${artifacts.review.summary.revisionRequired}；来源确认=${artifacts.review.summary.sourceConfirmationRequired}\n${artifacts.jsonPath}\n${artifacts.markdownPath}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
