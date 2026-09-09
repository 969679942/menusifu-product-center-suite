import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterItemGeneratedXmind,
  type ProductCenterItemRebuiltCase,
  type ProductCenterItemXmindRebuildPlan,
} from '../utils/product-center-item-xmind-rebuild';
import type { ProductCenterItemFullReviewDocument } from '../utils/product-center-item-full-review';
import { scanGeneratedArtifacts } from '../utils/product-center-run-safety';

type TechnicalStatusDocument = {
  fingerprint: string;
  summary: { total: number; baselineCompatibility: { accepted: number } };
  entries: Array<{
    caseId: string;
    currentStatus: string;
    runtimeSource: string;
    canonicalCompatibility: string;
    generationAllowed: boolean;
    remainingGapCodes: string[];
  }>;
};

export function buildProductCenterItemGenerationReadyArtifacts(options: {
  projectRoot?: string;
  outputRoot?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const canonicalRoot = path.join(projectRoot, 'contracts/product-center/test-cases/canonical');
  const planPath = path.join(canonicalRoot, 'product-center-item-xmind-rebuild-pilot.json');
  const reviewPath = path.join(canonicalRoot, 'product-center-item-full-review.json');
  const statusPath = path.join(canonicalRoot, 'product-center-item-current-technical-status.json');
  const plan = readJson<ProductCenterItemXmindRebuildPlan>(planPath);
  const review = readJson<ProductCenterItemFullReviewDocument>(reviewPath);
  const status = readJson<TechnicalStatusDocument>(statusPath);
  if (review.sourcePlanFingerprint !== plan.fingerprint) {
    throw new Error('准确生成拒绝使用与当前 canonical 不一致的全审结果');
  }
  const statusById = new Map(status.entries.map((item) => [item.caseId, item]));
  const reviewById = new Map(review.entries.map((item) => [item.caseId, item]));
  const eligibleIds = new Set(status.entries
    .filter((item) => item.generationAllowed)
    .map((item) => item.caseId));
  const cases = plan.cases
    .filter((item) => eligibleIds.has(item.id))
    .map((item) => {
      const technical = statusById.get(item.id);
      const fullReview = reviewById.get(item.id);
      if (!technical || !fullReview) throw new Error(`准确生成缺少状态或全审记录：${item.id}`);
      if (technical.currentStatus !== 'runtime-accepted'
        || technical.canonicalCompatibility !== 'baseline-compatible'
        || fullReview.decision !== 'approved'
        || fullReview.issues.length > 0) {
        throw new Error(`准确生成资格与门禁冲突：${item.id}`);
      }
      const generated = {
        caseId: item.id,
        title: item.title.trim(),
        module: `商品管理 → 商品 → ${item.productType} → ${item.scenarioFamily}`,
        priority: item.priority,
        productType: item.productType,
        scenarioFamily: item.scenarioFamily,
        source: normalizeSource(item.source),
        preconditions: normalizeList(item.preconditions),
        actions: normalizeList(item.actions),
        expectedResults: normalizeList(item.expectedResults),
        origin: item.origin,
        changeType: item.changeType,
        currentStatus: technical.currentStatus,
        runtimeSource: technical.runtimeSource,
        canonicalCompatibility: technical.canonicalCompatibility,
        fullReviewDecision: fullReview.decision,
        generationAllowed: technical.generationAllowed,
      };
      if (!generated.source
        || generated.preconditions.length === 0
        || generated.actions.length === 0
        || generated.expectedResults.length === 0) {
        throw new Error(`准确生成用例执行链不完整：${item.id}`);
      }
      return generated;
    });
  assertUnique(cases.map((item) => item.caseId), '准确生成包含重复 canonical ID');
  if (cases.length !== eligibleIds.size) {
    throw new Error(`准确生成未完整覆盖 generationAllowed：generated=${cases.length};eligible=${eligibleIds.size}`);
  }
  const excludedCases = status.entries
    .filter((item) => !item.generationAllowed)
    .map((item) => ({
      caseId: item.caseId,
      currentStatus: item.currentStatus,
      canonicalCompatibility: item.canonicalCompatibility,
      gapCodes: item.remainingGapCodes,
    }));
  const semanticValue = {
    sourceFingerprints: {
      canonicalPlan: plan.fingerprint,
      fullReview: review.fingerprint,
      technicalStatus: status.fingerprint,
      canonicalPlanFile: sha256File(planPath),
      fullReviewFile: sha256File(reviewPath),
      technicalStatusFile: sha256File(statusPath),
    },
    summary: {
      total: cases.length,
      byPriority: countPriority(cases),
      byProductType: {
        standard: cases.filter((item) => item.caseId.includes('-STD-')).length,
        addon: cases.filter((item) => item.caseId.includes('-ADD-')).length,
        combo: cases.filter((item) => item.caseId.includes('-PKG-')).length,
      },
      byRuntimeSource: {
        baselineRuntimeAcceptance: countRuntime(cases, 'baseline-runtime-acceptance'),
        p0WaveRuntimeAcceptance: countRuntime(cases, 'p0-wave-runtime-acceptance'),
        remainingWaveRuntimeEvidence: countRuntime(cases, 'p0-remaining-wave-runtime-evidence'),
        reconciledRuntimeEvidence: countRuntime(cases, 'p0-remaining-wave-reconciled-evidence'),
      },
      productCorrected: cases.filter((item) => item.changeType === 'product-corrected').length,
      excluded: excludedCases.length,
    },
    exclusionSummary: {
      notRuntimeAccepted: excludedCases.filter((item) => (
        item.currentStatus === 'capability-mapping-required'
        || item.currentStatus === 'page-observation-required'
      )).length,
      canonicalReconciliationRequired: excludedCases.filter((item) => (
        item.canonicalCompatibility === 'canonical-reconciliation-required'
      )).length,
      productDefectOpen: excludedCases.filter((item) => item.currentStatus === 'product-defect-open').length,
      productRuleConfirmationRequired: excludedCases.filter((item) => (
        item.currentStatus === 'product-rule-confirmation-required'
      )).length,
      externalTerminalBlocked: excludedCases.filter((item) => (
        item.currentStatus === 'blocked-until-terminal-access'
      )).length,
    },
    guardrails: {
      originalXmindOverwritten: false as const,
      sourceRequired: true as const,
      fullReviewApprovalRequired: true as const,
      runtimeAcceptanceRequired: true as const,
      baselineCompatibilityRequired: true as const,
      blockedCasesMayGenerate: false as const,
      canonicalIdsPreserved: true as const,
    },
    cases,
    excludedCases,
  };
  const activeCanonicalCount = plan.cases.filter((item) => item.status !== 'deprecated').length;
  if (status.summary.total !== activeCanonicalCount
    || status.summary.baselineCompatibility.accepted !== cases.length
    || semanticValue.summary.total !== 89
    || semanticValue.summary.byPriority.P0 !== 79
    || semanticValue.summary.byPriority.P1 !== 10
    || semanticValue.summary.byPriority.P2 !== 0
    || semanticValue.summary.excluded !== status.summary.total - semanticValue.summary.total) {
    throw new Error(`准确生成分母漂移：${JSON.stringify(semanticValue.summary)}`);
  }
  const fingerprint = hashValue(semanticValue);
  const release = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-generation-ready-v1' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: 'accepted' as const,
    ...semanticValue,
    fingerprint,
  };
  const markdown = renderMarkdown(release);
  if (/^={2,}$/m.test(markdown) || /^\d+\.\s+\d+\./m.test(markdown)) {
    throw new Error('准确生成 Markdown 含禁止分隔符或双重编号');
  }
  const generatedRoot = path.join(outputRoot, 'contracts/product-center/test-cases/generated');
  const releasePath = path.join(generatedRoot, 'product-center-item-generation-ready-v1.json');
  const markdownPath = path.join(generatedRoot, 'product-center-item-generation-ready-v1.md');
  const xmindPath = path.join(generatedRoot, 'product-center-item-generation-ready-v1.xmind');
  const manifestPath = path.join(generatedRoot, 'product-center-item-generation-ready-v1-manifest.json');
  const originalXmindPath = path.resolve(
    projectRoot,
    '..',
    'Merchant Center Info',
    '00-待转换测试方案',
    '用例库',
    '商品中心-商品管理-商品',
    '1.商品中心-商品管理-商品.xmind',
  );
  const originalHash = sha256File(originalXmindPath);
  const selectedPlanCases = plan.cases.filter((item) => eligibleIds.has(item.id));
  const xmind = buildProductCenterItemGeneratedXmind(selectedPlanCases, {
    title: `商品中心-商品管理-商品-准确生成${selectedPlanCases.length}条`,
    fingerprint,
  });
  writeJson(releasePath, release);
  writeText(markdownPath, markdown);
  writeBuffer(xmindPath, xmind);
  if (sha256File(originalXmindPath) !== originalHash) throw new Error('原商品 XMind 在准确生成过程中发生变化');
  writeJson(manifestPath, {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-generation-ready-v1-manifest',
    generatedAt: release.generatedAt,
    fingerprint,
    sourceFiles: {
      canonicalPlan: { path: relativePath(projectRoot, planPath), sha256: sha256File(planPath) },
      fullReview: { path: relativePath(projectRoot, reviewPath), sha256: sha256File(reviewPath) },
      technicalStatus: { path: relativePath(projectRoot, statusPath), sha256: sha256File(statusPath) },
      originalXmind: { path: originalXmindPath, sha256: originalHash, overwritten: false },
    },
    outputs: {
      release: { path: releasePath, sha256: sha256File(releasePath) },
      markdown: { path: markdownPath, sha256: sha256File(markdownPath) },
      xmind: { path: xmindPath, sha256: sha256(xmind), bytes: xmind.length },
    },
    guardrails: release.guardrails,
  });
  const findings = scanGeneratedArtifacts(generatedRoot);
  if (findings.length > 0) throw new Error(`准确生成产物安全扫描未通过：${findings.length}`);
  return { release, releasePath, markdownPath, xmindPath, manifestPath };
}

function renderMarkdown(release: ReturnType<typeof buildProductCenterItemGenerationReadyArtifacts>['release']): string {
  return `${release.cases.map((item) => [
    `### 用例编号：${item.caseId}`,
    `用例标题：${item.title}`,
    `所属模块：${item.module}`,
    `优先级：${item.priority}`,
    `来源：${item.source}`,
    `运行证据：${item.runtimeSource}`,
    '前置条件：',
    ...numbered(item.preconditions),
    '测试步骤：',
    ...numbered(item.actions),
    '预期结果：',
    ...numbered(item.expectedResults),
    '---',
  ].join('\n')).join('\n\n')}\n`;
}

function normalizeSource(value: string): string {
  const source = value.trim();
  return /^BR-[A-Z0-9]/.test(source) ? `业务规则明确 ← ${source}` : source;
}

function normalizeList(values: readonly string[]): string[] {
  return values
    .map((value) => value.trim().replace(/^\d+(?:\.\d+)?[.、]?\s*/, ''))
    .filter((value) => value.length > 0 && !/^=+$/.test(value));
}

function numbered(values: readonly string[]): string[] {
  return values.map((value, index) => `${index + 1}. ${value}`);
}

function countPriority(cases: Array<{ priority: 'P0' | 'P1' | 'P2' }>) {
  return {
    P0: cases.filter((item) => item.priority === 'P0').length,
    P1: cases.filter((item) => item.priority === 'P1').length,
    P2: cases.filter((item) => item.priority === 'P2').length,
  };
}

function countRuntime(cases: Array<{ runtimeSource: string }>, source: string): number {
  return cases.filter((item) => item.runtimeSource === source).length;
}

function assertUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) throw new Error(message);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function writeBuffer(filePath: string, value: Buffer): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, value);
  fs.renameSync(temporaryPath, filePath);
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function relativePath(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).replace(/\\/g, '/');
}

if (require.main === module) {
  try {
    const artifacts = buildProductCenterItemGenerationReadyArtifacts();
    process.stdout.write(
      `商品中心准确用例已生成：${artifacts.releasePath}\n${artifacts.markdownPath}\n${artifacts.xmindPath}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
