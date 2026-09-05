import fs from 'node:fs';
import path from 'node:path';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import { renderProductCenterRecipeSpec } from './generate-product-center-recipe-spec';
import {
  buildProductCenterTechnicalBindingApprovalRequest,
  buildProductCenterTechnicalBindingCandidates,
  compileApprovedProductCenterTechnicalBindings,
  type ProductCenterTechnicalBindingApprovalDocument,
} from '../utils/product-center-technical-binding-candidates';
import type { ProductCenterPageContractObservation } from '../utils/product-center-page-contract-observation';
import {
  assertProductCenterItemFullReviewGate,
  type ProductCenterItemFullReviewDocument,
} from '../utils/product-center-item-full-review';

type JsonRecord = Record<string, any>;

const defaultApprovalRelativePath =
  'contracts/product-center/reviews/product-center-technical-binding-approvals.json';

export function resolveProductCenterTechnicalBindingApprovalPath(
  projectRoot: string,
  explicitApprovalsPath?: string,
): string | undefined {
  if (explicitApprovalsPath) return path.resolve(explicitApprovalsPath);
  const defaultPath = path.join(projectRoot, defaultApprovalRelativePath);
  return fs.existsSync(defaultPath) ? defaultPath : undefined;
}

export function buildProductCenterTechnicalBindingCandidateArtifacts(options: {
  projectRoot?: string;
  outputRoot?: string;
  approvalsPath?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const candidatesPath = path.join(
    outputRoot,
    'output/test-case-audit/product-center/technical-binding-candidates-latest.json',
  );
  const approvalRequestPath = path.join(
    outputRoot,
    'output/test-case-audit/product-center/technical-binding-approval-request-latest.json',
  );
  const approvalRequestMarkdownPath = path.join(
    outputRoot,
    'output/test-case-audit/product-center/technical-binding-approval-request-latest.md',
  );
  const approvedBindingsPath = path.join(
    outputRoot,
    'contracts/product-center/test-cases/generated/product-center-approved-technical-bindings.json',
  );
  const approvedRecipesPath = path.join(
    outputRoot,
    'contracts/product-center/recipes/product-center-approved-technical-bindings-recipes.json',
  );
  const generatedSpecPath = path.join(
    outputRoot,
    'tests/generated/product-center-approved-technical-bindings.generated.spec.ts',
  );
  const generation = readJson<JsonRecord>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/generated/product-center-test-plan-generation-v1.json',
  ));
  const itemCases = (generation.cases as Array<{ internalCaseId?: string }> | undefined)
    ?.filter((item) => item.internalCaseId?.startsWith('TC-ITEM-')) ?? [];
  if (itemCases.length > 0) {
    const fullReviewPath = path.join(
      projectRoot,
      'contracts/product-center/test-cases/canonical/product-center-item-full-review.json',
    );
    if (!fs.existsSync(fullReviewPath)) throw new Error('商品用例缺少逐条全审产物');
    const rebuildPlan = readJson<{ fingerprint: string }>(path.join(
      projectRoot,
      'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json',
    ));
    assertProductCenterItemFullReviewGate(readJson<ProductCenterItemFullReviewDocument>(fullReviewPath), {
      expectedSourcePlanFingerprint: rebuildPlan.fingerprint,
    });
  }
  const gold = readJson<JsonRecord>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/pilots/product-center-test-plan-gold-set.json',
  ));
  const sourceBindings = readJson<JsonRecord>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/pilots/product-center-test-plan-gold-set-source-bindings.json',
  ));
  const recipes = readJson<{ recipes: AutomationRecipe[] }>(path.join(
    projectRoot,
    'contracts/product-center/recipes/product-center-test-plan-gold-set-recipes.json',
  ));
  const pageContract = readJson<ProductCenterPageContractObservation>(path.join(
    projectRoot,
    'output/page-contract/product-center-page-contract-observation.json',
  ));
  const candidates = buildProductCenterTechnicalBindingCandidates({
    generatedCases: generation.cases,
    goldCases: gold.cases,
    sourceBindings: sourceBindings.bindings,
    recipes: recipes.recipes,
    pageContract,
  });
  const approvalRequest = buildProductCenterTechnicalBindingApprovalRequest(candidates);
  writeJson(candidatesPath, candidates);
  writeJson(approvalRequestPath, approvalRequest);
  writeText(approvalRequestMarkdownPath, renderApprovalRequest(approvalRequest));

  let status: 'approval-required' | 'review-required' | 'approved' = candidates.status;
  if (options.approvalsPath) {
    const approval = readJson<ProductCenterTechnicalBindingApprovalDocument>(
      path.resolve(options.approvalsPath),
    );
    const existingBindings = readOptionalJson<{
      bindings?: import('../utils/product-center-test-plan-intake').ProductCenterTestPlanAutomationBinding[];
    }>(approvedBindingsPath);
    const existingRecipes = readOptionalJson<{ recipes?: AutomationRecipe[] }>(approvedRecipesPath);
    const approved = compileApprovedProductCenterTechnicalBindings(candidates, approval, {
      ...(existingBindings?.bindings && existingRecipes?.recipes ? {
        legacyApproved: {
          bindings: existingBindings.bindings,
          recipes: existingRecipes.recipes,
        },
      } : {}),
    });
    writeJson(approvedBindingsPath, {
      schemaVersion: approved.schemaVersion,
      collectionId: approved.collectionId,
      status: approved.status,
      candidateFingerprint: approved.candidateFingerprint,
      bindingSemanticFingerprint: approved.bindingSemanticFingerprint,
      pageObservationFingerprint: approved.pageObservationFingerprint,
      fingerprint: approved.fingerprint,
      summary: approved.summary,
      approvals: approved.approvals,
      bindings: approved.bindings,
    });
    writeJson(approvedRecipesPath, {
      schemaVersion: approved.schemaVersion,
      collectionId: 'product-center-approved-technical-binding-recipes',
      status: approved.status,
      candidateFingerprint: approved.candidateFingerprint,
      bindingSemanticFingerprint: approved.bindingSemanticFingerprint,
      pageObservationFingerprint: approved.pageObservationFingerprint,
      fingerprint: approved.fingerprint,
      summary: approved.summary,
      recipes: approved.recipes,
    });
    writeText(generatedSpecPath, renderProductCenterRecipeSpec({
      suiteTitle: '商品中心已审批技术绑定套件',
      recipesImportPath: '../../contracts/product-center/recipes/product-center-approved-technical-bindings-recipes.json',
      stepTitle: '按已审批技术绑定执行真实 UI 与 API 验证',
      attachRuntimeEvidence: true,
    }));
    status = 'approved';
  }

  return {
    status,
    candidatesPath,
    approvalRequestPath,
    approvalRequestMarkdownPath,
    approvedBindingsPath,
    approvedRecipesPath,
    generatedSpecPath,
  };
}

function renderApprovalRequest(document: ProductCenterTechnicalBindingApprovalDocument): string {
  const lines = [
    '# 商品中心技术绑定候选审批请求',
    '',
    `- 状态：${document.status}`,
    `- 候选指纹：${document.candidateFingerprint}`,
    `- 技术语义指纹：${document.bindingSemanticFingerprint ?? document.candidateFingerprint}`,
    `- 页面观测指纹：${document.pageObservationFingerprint}`,
    `- 总数：${document.summary.total}`,
    `- 待审批：${document.summary.pending}`,
    '',
  ];
  for (const item of document.decisions) {
    const summary = item.candidateSummary;
    lines.push(
      `## ${item.canonicalId} ${summary?.title ?? ''}`.trim(),
      '',
      `- 内部用例：${summary?.internalCaseId ?? ''}`,
      `- 模块：${summary?.module ?? ''}`,
      `- 路由：${summary?.route ?? ''}`,
      `- Capability：${summary?.capabilityIds.join(', ') ?? ''}`,
      `- Assertion：${summary?.assertionAdapterIds.join(', ') ?? ''}`,
      `- Seed：${summary?.seedAdapterIds.join(', ') || '无'}`,
      `- Cleanup：${summary?.cleanupAdapterIds.join(', ') || '无'}`,
      `- Claim 数：${summary?.claimCount ?? 0}`,
      `- 写数据：${summary?.mutatesData === true ? '是' : '否'}`,
      `- 候选哈希：${item.candidateHash}`,
      `- 技术语义哈希：${item.bindingSemanticHash ?? item.candidateHash}`,
      `- 决定：${item.decision}`,
      '',
    );
  }
  return `${lines.join('\n').trim()}\n`;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function readOptionalJson<T>(filePath: string): T | undefined {
  return fs.existsSync(filePath) ? readJson<T>(filePath) : undefined;
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} 缺少路径`);
  return value;
}

if (require.main === module) {
  try {
    const projectRoot = path.resolve(__dirname, '..');
    const paths = buildProductCenterTechnicalBindingCandidateArtifacts({
      projectRoot,
      approvalsPath: resolveProductCenterTechnicalBindingApprovalPath(
        projectRoot,
        readOption(process.argv.slice(2), '--approvals'),
      ),
    });
    process.stdout.write(`商品中心技术绑定候选：${paths.candidatesPath}\n`);
    process.stdout.write(`商品中心技术绑定审批请求：${paths.approvalRequestPath}\n`);
    process.stdout.write(`商品中心技术绑定审批详情：${paths.approvalRequestMarkdownPath}\n`);
    process.stdout.write(`状态：${paths.status}\n`);
    if (paths.status === 'review-required') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
