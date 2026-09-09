import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { AllureReporter } from 'allure-playwright';
import { createBusinessStepAllureOptions } from '../../../../Test Automation Platform/src/reporters/allure-step-policy';
import {
  bindDetachedAllureAttachments,
  createBusinessOperationReceiptDetail,
  createAllureReportIntegrityPolicy,
  parseStepBoundAttachmentName,
  sanitizePlaywrightTraceText,
  type AllureBusinessReportResult,
  type AllureReportStep,
} from '../../../../Test Automation Platform/src/reporters/allure-report-integrity';
import {
  buildSeasoningOperationTechnicalDetails,
  describeSeasoningOperation,
} from '../product-center/seasoning-reporting';
import {
  parseProductCenterMarkdownTestCase,
  type ProductCenterParsedMarkdownTestCase,
} from '../../utils/product-center-test-plan-markdown';

const failureAttachmentPattern = /失败|错误|截图|失败上下文|追踪|trace|screenshot|error|failure/i;

export function createMerchantCenterAllureOptions() {
  return createBusinessStepAllureOptions({
    outputFolder: process.env.ALLURE_RESULTS_DIR ?? 'allure-results',
    suiteTitle: false,
  });
}

export function createMerchantCenterAllurePlaywrightV3Options() {
  const { outputFolder, ...businessStepOptions } = createMerchantCenterAllureOptions();
  return {
    ...businessStepOptions,
    resultsDir: path.resolve(outputFolder),
  };
}

export function createMerchantCenterAllureIntegrityPolicy() {
  return createAllureReportIntegrityPolicy({
    localizedTextPattern: /[\u3400-\u9fff]/,
    attachmentGroupTitle: (attachmentName) => failureAttachmentPattern.test(attachmentName)
      ? '失败诊断：保留失败分类、截图、上下文和执行追踪'
      : '证据：保留业务结果、断言和执行收据',
  });
}

export class MerchantCenterAllureReporter extends AllureReporter {
  constructor() {
    super(createMerchantCenterAllurePlaywrightV3Options());
  }

  override async onEnd(): Promise<void> {
    await super.onEnd();
    const resultsDir = this.options.resultsDir;
    if (resultsDir) normalizeMerchantCenterAllureResults(resultsDir);
  }
}

export function normalizeMerchantCenterAllureResults(resultsDir: string): number {
  if (!fs.existsSync(resultsDir)) return 0;
  let changedFiles = 0;
  for (const entry of fs.readdirSync(resultsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('-result.json')) continue;
    const filePath = path.join(resultsDir, entry.name);
    const document = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    const before = JSON.stringify(document);
    normalizeAllureResult(document, resultsDir);
    if (before === JSON.stringify(document)) continue;
    fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    changedFiles += 1;
  }
  return changedFiles;
}

export function assertAllureAttachmentSourcesExist(resultsDir: string): void {
  const root = path.resolve(resultsDir);
  if (!fs.existsSync(root)) throw new Error(`Allure 结果目录不存在：${root}`);
  const missing: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('-result.json')) continue;
    const filePath = path.join(root, entry.name);
    const document = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    for (const attachment of collectAttachments(document)) {
      if (typeof attachment.source !== 'string' || !attachment.source.trim()) continue;
      const sourcePath = path.resolve(root, attachment.source);
      if (!sourcePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(sourcePath)) {
        missing.push(`${entry.name}:${attachment.name ?? '未命名附件'}:${attachment.source}`);
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(`Allure 附件引用缺失，已阻断报告生成：\n${missing.slice(0, 20).join('\n')}${missing.length > 20 ? `\n...另有 ${missing.length - 20} 条` : ''}`);
  }
}

function normalizeAllureResult(value: unknown, resultsDir: string): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return normalizeAllureValue(value);
  const document = value as Record<string, unknown>;
  const runtimeEvidence = readRuntimeEvidence(document, resultsDir);
  const caseId = findCaseId(document);
  let changed = sanitizeAllureTraceArchives(document, resultsDir);
  changed += normalizeAllureValue(document);
  changed += removeTechnicalSuiteLabels(document);
  changed += bindDetachedAllureAttachments(
    document as AllureBusinessReportResult,
    createMerchantCenterAllureIntegrityPolicy(),
  );
  changed += rebindPassedContextAttachments(document as AllureBusinessReportResult);
  changed += normalizeAllureValue(document);
  if (caseId?.startsWith('TC-FLV-')) {
    changed += rebindSeasoningEvidenceContainers(document as AllureBusinessReportResult, resultsDir);
    changed += normalizeSeasoningBusinessDetails(document as AllureBusinessReportResult, resultsDir);
  }
  changed += removeFrameworkMetadataSteps(document as AllureBusinessReportResult);
  if (caseId?.startsWith('TC-FLV-')) {
    changed += ensureSeasoningBusinessHierarchy(
      document as AllureBusinessReportResult & Record<string, unknown>,
      caseId,
      runtimeEvidence,
    );
  }
  if (caseId && !caseId.startsWith('TC-FLV-')) {
    changed += normalizeProductCenterBusinessHierarchy(
      document as AllureBusinessReportResult & Record<string, unknown>,
      resultsDir,
      caseId,
      runtimeEvidence,
    );
  }
  if (caseId) {
    changed += applyBusinessLabels(document, caseId, readCanonicalBusinessCase(caseId));
    changed += normalizeExecutionConclusion(document as AllureBusinessReportResult, caseId, runtimeEvidence);
  }
  if (runtimeEvidence && hasUnacceptedEvidence(runtimeEvidence)) {
    if (document.status !== 'failed') {
      document.status = 'failed';
      changed += 1;
    }
    const statusDetails = (document.statusDetails && typeof document.statusDetails === 'object'
      ? document.statusDetails
      : {}) as Record<string, unknown>;
    const message = buildEvidenceFailureMessage(runtimeEvidence);
    if (statusDetails.message !== message) {
      statusDetails.message = message;
      document.statusDetails = statusDetails;
      changed += 1;
    }
  }
  return changed;
}

function removeTechnicalSuiteLabels(document: Record<string, unknown>): number {
  if (!Array.isArray(document.labels)) return 0;
  const labels = document.labels as Array<Record<string, unknown>>;
  const retained = labels.filter((label) => label.name !== 'subSuite');
  if (retained.length === labels.length) return 0;
  document.labels = retained;
  return labels.length - retained.length;
}

function removeFrameworkMetadataSteps(document: AllureBusinessReportResult): number {
  const infrastructureTitle = /^(?:Before Hooks|After Hooks|canonical-case-id|recipe-case-id|group-case-id|group-generation|group-execution-profile|group-key|group-report-contract|runtime-readiness|conversion-status|manual-decision):?/i;
  let changed = 0;
  const visit = (steps: readonly AllureReportStep[]): AllureReportStep[] => {
    const retained: AllureReportStep[] = [];
    for (const step of steps) {
      const children = visit(step.steps ?? []);
      if (infrastructureTitle.test(step.name?.trim() ?? '')) {
        retained.push(...children);
        changed += 1;
        continue;
      }
      if (children.length !== (step.steps ?? []).length) {
        step.steps = children;
        changed += 1;
      }
      retained.push(step);
    }
    return retained;
  };
  document.steps = visit(document.steps ?? []);
  return changed;
}

function ensureSeasoningBusinessHierarchy(
  document: AllureBusinessReportResult & Record<string, unknown>,
  caseId: string,
  runtimeEvidence: Record<string, unknown> | undefined,
): number {
  let changed = 0;
  const steps = document.steps ?? [];
  let assertion = steps.find((step) => step.name?.startsWith('[断言]'));
  if (!assertion) {
    const operation = steps.find((step) => step.name?.startsWith('[业务操作]'));
    const failure = describeFailureForBusinessReport(readStatusMessage(document));
    assertion = {
      name: '[断言] 前序业务操作失败，本次未进入业务结果核对',
      status: 'skipped',
      stage: 'finished',
      steps: [businessLeaf(
        `校验1：期望：业务操作成功后执行权威业务断言｜实际：业务操作${operation?.status === 'failed' ? '失败' : '未完成'}，未产生断言结果；${failure}｜结果：未执行`,
        'skipped',
      )],
      attachments: [], parameters: [], statusDetails: {},
    };
    insertBeforeConclusion(steps, assertion);
    changed += 1;
  }
  const assertionNames = flattenAllureSteps([assertion]).map((step) => step.name ?? '');
  if (!assertionNames.some((name) => name.includes('期望：') && name.includes('实际：'))) {
    const canonical = readCanonicalBusinessCase(caseId);
    const receipts = Array.isArray(runtimeEvidence?.assertionReceipts)
      ? runtimeEvidence.assertionReceipts.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      : [];
    const expectedResults = canonical?.expectedResults ?? [];
    if (expectedResults.length > 0) {
      assertion.steps = [
        ...(assertion.steps ?? []),
        ...expectedResults.map((expected, index) => {
          const receipt = receipts[index];
          const verified = receipt?.status === 'verified';
          return businessLeaf(
            `校验${index + 1}：期望：${renderCanonicalBusinessText(expected)}｜实际：${receipt ? `断言收据状态为“${verified ? '已验证' : formatInlineReportValue(receipt.status)}”` : '断言收据未生成'}｜结果：${verified ? '通过' : '证据不完整'}`,
            verified ? 'passed' : 'skipped',
          );
        }),
      ];
      changed += 1;
    }
  }
  if (!steps.some((step) => step.name?.startsWith('[清理]'))) {
    const mutationObserved = runtimeEvidence?.mutationObserved;
    const noMutation = mutationObserved === false;
    const cleanup = {
      name: noMutation
        ? '[清理] 本用例未产生持久化业务变更，无需清理'
        : '[清理] 运行收据未声明可核验的清理结果',
      status: noMutation ? 'passed' : 'skipped',
      stage: 'finished',
      steps: [businessLeaf(
        `清理校验：期望：执行后无测试数据残留｜实际：${noMutation ? '运行收据确认未观察到持久化变更' : '运行收据中不存在 mutationObserved=false 或清理结果字段'}｜结果：${noMutation ? '通过' : '证据不完整'}`,
        noMutation ? 'passed' : 'skipped',
      )],
      attachments: [], parameters: [], statusDetails: {},
    } satisfies AllureReportStep;
    insertBeforeConclusion(steps, cleanup);
    changed += 1;
  }
  document.steps = steps;
  return changed;
}

function insertBeforeConclusion(steps: AllureReportStep[], step: AllureReportStep): void {
  const index = steps.findIndex((item) => item.name?.startsWith('执行结论：'));
  if (index < 0) steps.push(step);
  else steps.splice(index, 0, step);
}

type CanonicalCaseIndex = {
  cases: Array<{ caseId: string; canonicalPath: string }>;
};

type BusinessCasePresentation = Pick<
  ProductCenterParsedMarkdownTestCase,
  'id' | 'title' | 'module' | 'preconditions' | 'actions' | 'expectedResults'
>;

const canonicalCaseCache = new Map<string, BusinessCasePresentation | null>();

function readCanonicalBusinessCase(caseId: string): BusinessCasePresentation | null {
  if (canonicalCaseCache.has(caseId)) return canonicalCaseCache.get(caseId) ?? null;
  const projectRoot = path.resolve(__dirname, '../..');
  const workspaceRoot = path.resolve(projectRoot, '..');
  const indexPath = path.join(
    workspaceRoot,
    'Merchant Center Info/00-待转换测试方案/已完成/index.json',
  );
  if (!fs.existsSync(indexPath)) {
    canonicalCaseCache.set(caseId, null);
    return null;
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as CanonicalCaseIndex;
  const entry = index.cases.find((item) => item.caseId === caseId);
  if (!entry) {
    canonicalCaseCache.set(caseId, null);
    return null;
  }
  const relativePath = entry.canonicalPath.split('#', 1)[0];
  const filePath = path.resolve(workspaceRoot, relativePath);
  if (!filePath.startsWith(`${workspaceRoot}${path.sep}`) || !fs.existsSync(filePath)) {
    canonicalCaseCache.set(caseId, null);
    return null;
  }
  const markdown = fs.readFileSync(filePath, 'utf8');
  try {
    const parsed = parseProductCenterMarkdownTestCase(markdown, caseId);
    canonicalCaseCache.set(caseId, parsed);
    return parsed;
  } catch {
    const parsed = parseBusinessCasePresentation(markdown, caseId);
    canonicalCaseCache.set(caseId, parsed);
    return parsed;
  }
}

function parseBusinessCasePresentation(markdown: string, caseId: string): BusinessCasePresentation | null {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => line.trim() === `### 用例编号：${caseId}`);
  if (start < 0) return null;
  const next = lines.findIndex((line, index) => index > start && line.startsWith('### 用例编号：'));
  const block = lines.slice(start + 1, next < 0 ? lines.length : next);
  const title = readPresentationField(block, '用例标题：');
  const module = readPresentationField(block, '所属模块：');
  const actions = readPresentationSection(block, '测试步骤：', '预期结果：');
  const expectedResults = readPresentationSection(block, '预期结果：');
  if (!title || !module || actions.length === 0 || expectedResults.length === 0) return null;
  return {
    id: caseId,
    title,
    module,
    preconditions: readPresentationSection(block, '前置条件：', '测试步骤：'),
    actions,
    expectedResults,
  };
}

function readPresentationField(lines: readonly string[], label: string): string | undefined {
  const line = lines.find((item) => item.trim().startsWith(label));
  const value = line?.trim().slice(label.length).trim();
  return value || undefined;
}

function readPresentationSection(
  lines: readonly string[],
  startLabel: string,
  endLabel?: string,
): string[] {
  const start = lines.findIndex((line) => line.trim() === startLabel);
  if (start < 0) return [];
  const end = endLabel
    ? lines.findIndex((line, index) => index > start && line.trim() === endLabel)
    : -1;
  const values: string[] = [];
  for (const rawLine of lines.slice(start + 1, end < 0 ? lines.length : end)) {
    if (!rawLine.trim()) continue;
    const numbered = rawLine.trim().match(/^\d+\.\s+(.+)$/);
    if (numbered) {
      values.push(numbered[1].trim());
      continue;
    }
    if (/^\s+\S/.test(rawLine) && values.length > 0) {
      values[values.length - 1] = `${values[values.length - 1]} ${rawLine.trim()}`;
    }
  }
  return values;
}

function normalizeProductCenterBusinessHierarchy(
  document: AllureBusinessReportResult & Record<string, unknown>,
  resultsDir: string,
  caseId: string,
  runtimeEvidence: Record<string, unknown> | undefined,
): number {
  const canonicalCase = readCanonicalBusinessCase(caseId);
  if (!canonicalCase) return 0;
  const original = document.steps ?? [];
  const existingSerialized = JSON.stringify(original);
  const allAttachments = collectAttachments(document);
  const receiptAttachment = findReceiptAttachment(allAttachments, caseId);
  const observationAttachment = findObservationAttachment(allAttachments, caseId, receiptAttachment);
  const failureAttachments = allAttachments.filter((item) => isFailureAttachmentName(String(item.name ?? '')));
  const missingReceiptMessage = '用例执行完成，但缺少当前标准执行收据，报告按证据不完整处理。';
  const statusMessage = readStatusMessage(document);
  const evidenceIncomplete = /缺少当前标准执行收据|证据不完整/.test(statusMessage);
  const receipt = runtimeEvidence ?? readAttachmentJson(resultsDir, receiptAttachment);
  const assertionReceipts = Array.isArray(receipt?.assertionReceipts)
    ? receipt.assertionReceipts.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    : [];
  const claims = readReceiptClaims(receipt);
  const assertionPresentation = readAssertionPresentation(receipt, canonicalCase.expectedResults, claims.required);
  const operationReceipts = Array.isArray(receipt?.operationReceipts)
    ? receipt.operationReceipts.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    : [];
  const observation = readAttachmentJson(resultsDir, observationAttachment);
  const cleanup = readCleanupSummary(receipt, observation);
  const receiptEvidenceComplete = Boolean(
    receiptAttachment
      && claims.required.length > 0
      && claims.required.every((claimId) => claims.verified.includes(claimId))
      && operationReceipts.length > 0
      && operationReceipts.every((item) => item.observed === true && item.status === 'passed')
      && (!cleanup.declared || (cleanup.apiZeroResidue === true && cleanup.uiZeroResidue === true)),
  );
  const executionStatus = document.status === 'passed' && !evidenceIncomplete && receiptEvidenceComplete
    ? 'passed'
    : 'failed';
  const authFailed = executionStatus === 'failed' && /认证|AuthFlow|OAuth|403|permissions-loading/.test(statusMessage);
  const hasAssertionMismatch = assertionReceipts.some((item) => item.status === 'observed-mismatch');
  const assertionFailed = executionStatus === 'failed' && (hasAssertionMismatch
    || /expect\(|断言|ObservedProductDifference|PRODUCT-DEFECT|产品实际行为与权威预期不一致|观察不一致|期望=/.test(statusMessage));
  const operationStatus = executionStatus === 'passed'
    ? 'passed'
    : authFailed ? 'skipped' : assertionFailed ? 'passed' : 'failed';
  const assertionStatus = executionStatus === 'passed' ? 'passed' : assertionFailed ? 'failed' : 'skipped';
  const productDifferenceAttachment = hasAssertionMismatch
    ? ensureProductDifferenceAttachment({
        resultsDir,
        caseId,
        receiptAttachment,
        assertionReceipts,
        operationReceipts,
        cleanup,
        route: String((receipt?.executionContext as Record<string, unknown> | undefined)?.route ?? ''),
      })
    : undefined;
  const observedSummary = summarizeObservedBusinessValues(observation ?? receipt);
  const environmentStep: AllureReportStep = {
    name: `[环境] 登录 → 商品中心 → ${renderCanonicalBusinessText(canonicalCase.module)}`,
    status: authFailed ? 'failed' : 'passed',
    stage: 'finished',
    steps: canonicalCase.preconditions.length > 0
      ? canonicalCase.preconditions.map((item, index) => businessLeaf(
        `前置条件${index + 1}：${renderCanonicalBusinessText(item)}`,
        authFailed ? 'failed' : 'passed',
      ))
      : [businessLeaf(
        '前置条件：权威用例未单列独立前置条件；当前上下文以执行收据为准。',
        authFailed ? 'failed' : 'passed',
      )],
    attachments: [],
    parameters: [],
    statusDetails: {},
  };
  const operationStep: AllureReportStep = {
    name: `[业务操作] ${renderCanonicalBusinessText(canonicalCase.title)}`,
    status: operationStatus,
    stage: 'finished',
    steps: canonicalCase.actions.map((item, index) => businessLeaf(
      `操作${index + 1}：${renderCanonicalBusinessText(item)}`,
      operationStatus,
    )),
    attachments: receiptAttachment ? [renamedAttachment(receiptAttachment, '业务操作执行收据（点击查看）')] : [],
    parameters: [],
    statusDetails: {},
  };
  const assertionStep: AllureReportStep = {
    name: `[断言] 核对「${renderCanonicalBusinessText(canonicalCase.title)}」预期结果`,
    status: assertionStatus,
    stage: 'finished',
    steps: assertionPresentation.map(({ claimId, expectedValue }, index) => {
      const assertionReceipt = assertionReceipts.find((item) => String(item.claimId ?? '') === claimId);
      const verified = claims.verified.includes(claimId) || assertionReceipt?.status === 'verified';
      const mismatched = assertionReceipt?.status === 'observed-mismatch';
      const result = verified ? '通过' : mismatched || executionStatus === 'failed' ? '失败' : '证据不完整';
      const actual = mismatched && assertionReceipt?.actualValue !== undefined
        ? assertionReceipt.actualValue
        : verified
        ? observedSummary ? `执行收据已验证；运行观测：${observedSummary}` : `执行收据已验证（${claimId}）`
        : statusMessage
          ? evidenceIncomplete ? statusMessage : describeFailureForBusinessReport(statusMessage)
          : !receiptAttachment ? missingReceiptMessage : `执行收据未验证 ${claimId}`;
      return businessLeaf(
        `校验${index + 1}：期望：${renderCanonicalBusinessText(expectedValue)}｜实际：${inlineValue(actual)}｜结果：${result}`,
        verified ? 'passed' : mismatched || executionStatus === 'failed' ? 'failed' : 'skipped',
      );
    }),
    attachments: [
      ...(observationAttachment ? [renamedAttachment(observationAttachment, '断言期望与实际观测（点击查看）')] : []),
      ...(productDifferenceAttachment ? [productDifferenceAttachment] : []),
      ...(assertionFailed ? failureAttachments.map((item) => renamedAttachment(item, localizeFailureAttachmentName(String(item.name ?? '')))) : []),
    ],
    parameters: [],
    statusDetails: {},
  };
  const cleanupStep = buildCleanupBusinessStep(cleanup, executionStatus);
  const completedAssertionIds = new Set([
    ...claims.verified,
    ...assertionReceipts
      .filter((item) => item.status === 'verified' || item.status === 'observed-mismatch')
      .map((item) => String(item.claimId ?? '')),
  ]);
  const assertionEvidenceComplete = claims.required.length > 0
    && claims.required.every((claimId) => completedAssertionIds.has(claimId));
  const conclusion = businessConclusionStep({
    caseId,
    executionStatus,
    businessOperations: canonicalCase.actions.length,
    businessAssertions: assertionPresentation.length,
    cleanup,
    evidenceComplete: Boolean(receiptAttachment && assertionEvidenceComplete
      && (!cleanup.declared || (cleanup.apiZeroResidue === true && cleanup.uiZeroResidue === true))
      && (!hasAssertionMismatch || (cleanup.declared
        && cleanup.apiZeroResidue === true
        && cleanup.uiVerificationObserved === true
        && cleanup.uiZeroResidue === true))),
  });
  if (!assertionFailed && failureAttachments.length > 0) {
    const target = authFailed ? environmentStep : operationStep;
    target.attachments = [
      ...(target.attachments ?? []),
      ...failureAttachments.map((item) => renamedAttachment(item, localizeFailureAttachmentName(String(item.name ?? '')))),
    ];
  }
  document.steps = [environmentStep, operationStep, assertionStep, cleanupStep, conclusion];
  document.attachments = [];
  if (productDifferenceAttachment) {
    const statusDetails = (document.statusDetails && typeof document.statusDetails === 'object'
      ? document.statusDetails
      : {}) as Record<string, unknown>;
    statusDetails.message = `${caseId} PRODUCT-DEFECT：${assertionReceipts
      .filter((item) => item.status === 'observed-mismatch')
      .map((item) => `期望=${inlineValue(item.expectedValue)}；实际=${inlineValue(item.actualValue)}`)
      .join('；')}`;
    document.statusDetails = statusDetails;
  }
  if (executionStatus === 'failed' && document.status === 'passed') {
    const evidenceMessage = !receiptAttachment
      ? missingReceiptMessage
      : '用例执行完成，但当前标准执行收据的断言、操作或清理证据不完整，报告按证据不完整处理。';
    document.status = 'failed';
    document.statusDetails = {
      ...(document.statusDetails && typeof document.statusDetails === 'object' ? document.statusDetails : {}),
      message: evidenceMessage,
    };
    conclusion.name = `执行结论：失败（证据不完整）｜${caseId}`;
    conclusion.status = 'failed';
  }
  return existingSerialized === JSON.stringify(document.steps) ? 0 : 1;
}

function ensureProductDifferenceAttachment(input: {
  resultsDir: string;
  caseId: string;
  receiptAttachment: Record<string, unknown> | undefined;
  assertionReceipts: Record<string, unknown>[];
  operationReceipts: Record<string, unknown>[];
  cleanup: { declared: boolean; apiZeroResidue?: boolean; uiZeroResidue?: boolean; uiVerificationObserved?: boolean };
  route: string;
}): Record<string, unknown> | undefined {
  if (typeof input.receiptAttachment?.source !== 'string') return undefined;
  const mismatched = input.assertionReceipts.filter((item) => item.status === 'observed-mismatch');
  if (mismatched.length === 0) return undefined;
  const executionPathEquivalent = input.operationReceipts.length > 0
    && input.operationReceipts.every((item) => item.observed === true && item.status === 'passed');
  const evidenceComplete = input.cleanup.declared
    && input.cleanup.apiZeroResidue === true
    && input.cleanup.uiVerificationObserved === true
    && input.cleanup.uiZeroResidue === true
    && executionPathEquivalent
    && mismatched.every((item) => item.expectedValue !== undefined
      && item.actualValue !== undefined
      && item.actualStatus === 'observed'
      && item.comparison === 'mismatched');
  if (!evidenceComplete) return undefined;
  const source = `${path.parse(input.receiptAttachment.source).name}-product-difference.json`;
  const payload = {
    caseId: input.caseId,
    evidenceComplete,
    productMismatchConfirmed: true,
    executionPathEquivalent,
    route: input.route,
    assertionReceipts: mismatched,
    cleanup: {
      apiZeroResidue: input.cleanup.apiZeroResidue,
      uiZeroResidue: input.cleanup.uiZeroResidue,
      uiVerificationObserved: input.cleanup.uiVerificationObserved,
    },
  };
  const filePath = path.join(input.resultsDir, source);
  const content = `${JSON.stringify(payload, null, 2)}\n`;
  if (!fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== content) fs.writeFileSync(filePath, content, 'utf8');
  return { name: '产品差异证据（点击查看）', source, type: 'application/json' };
}

function buildCleanupBusinessStep(
  cleanup: { declared: boolean; apiZeroResidue?: boolean; uiZeroResidue?: boolean; uiVerificationObserved?: boolean },
  executionStatus: 'passed' | 'failed',
): AllureReportStep {
  if (!cleanup.declared) {
    return {
      name: '[清理] 执行收据未声明需清理的持久化对象',
      status: 'passed', stage: 'finished', steps: [businessLeaf(
        '清理结论：本次收据未登记清理对象，不将其解释为已执行删除。',
        'passed',
      )], attachments: [], parameters: [], statusDetails: {},
    };
  }
  const verified = cleanup.apiZeroResidue === true
    && cleanup.uiZeroResidue === true;
  return {
    name: '[清理] 清理测试数据并确认 UI/API 零残留',
    status: verified ? 'passed' : executionStatus === 'failed' ? 'failed' : 'skipped',
    stage: 'finished',
    steps: [businessLeaf(
      `清理校验：期望：API 与 UI 均无测试数据残留｜实际：API 零残留=${yesNo(cleanup.apiZeroResidue)}；UI 零残留=${yesNo(cleanup.uiZeroResidue)}｜结果：${verified ? '通过' : '证据不完整'}`,
      verified ? 'passed' : executionStatus === 'failed' ? 'failed' : 'skipped',
    )],
    attachments: [], parameters: [], statusDetails: {},
  };
}

function businessConclusionStep(input: {
  caseId: string;
  executionStatus: 'passed' | 'failed';
  businessOperations: number;
  businessAssertions: number;
  cleanup: { declared: boolean; apiZeroResidue?: boolean; uiZeroResidue?: boolean; uiVerificationObserved?: boolean };
  evidenceComplete: boolean;
}): AllureReportStep {
  return {
    name: `执行结论：${input.executionStatus === 'passed' ? '通过' : '失败'}｜${input.caseId}`,
    status: input.executionStatus,
    stage: 'finished',
    steps: [businessLeaf(
      `结论摘要：业务操作 ${input.businessOperations} 项｜断言 ${input.businessAssertions} 项｜清理${input.cleanup.declared ? '已声明' : '未声明'}｜证据${input.evidenceComplete ? '完整' : '不完整'}`,
      input.executionStatus,
    )],
    attachments: [], parameters: [], statusDetails: {},
  };
}

function businessLeaf(name: string, status: string): AllureReportStep {
  return { name, status, stage: 'finished', steps: [], attachments: [], parameters: [], statusDetails: {} };
}

function findReceiptAttachment(
  attachments: readonly Record<string, unknown>[],
  caseId: string,
): Record<string, unknown> | undefined {
  return attachments.find((item) => {
    const name = normalizedAttachmentName(item);
    return name === 'test-execution-receipt'
      || name === 'product-center-group-runtime-evidence'
      || name === 'system-test-runtime-evidence'
      || name === '运行证据附件'
      || name === '业务操作执行收据（点击查看）'
      || name === `${caseId}-runtime-evidence`;
  });
}

function findObservationAttachment(
  attachments: readonly Record<string, unknown>[],
  caseId: string,
  receiptAttachment: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  return attachments.find((item) => item !== receiptAttachment && (
    normalizedAttachmentName(item) === `${caseId}-runtime-evidence`
      || normalizedAttachmentName(item) === 'product-center-group-runtime-evidence'
      || normalizedAttachmentName(item) === '运行证据附件'
      || normalizedAttachmentName(item) === '断言期望与实际观测（点击查看）'
  ));
}

function normalizedAttachmentName(item: Record<string, unknown>): string {
  const rawName = String(item.name ?? '');
  return parseStepBoundAttachmentName(rawName)?.attachmentName ?? rawName;
}

function readAttachmentJson(
  resultsDir: string,
  attachment: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!attachment || typeof attachment.source !== 'string') return undefined;
  const filePath = path.resolve(resultsDir, attachment.source);
  const root = path.resolve(resultsDir);
  if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath)) return undefined;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>; } catch { return undefined; }
}

function readReceiptClaims(receipt: Record<string, unknown> | undefined): { required: string[]; verified: string[] } {
  const claims = receipt?.claims && typeof receipt.claims === 'object'
    ? receipt.claims as Record<string, unknown>
    : {};
  return {
    required: Array.isArray(claims.required) ? claims.required.map(String) : [],
    verified: Array.isArray(claims.verified) ? claims.verified.map(String) : [],
  };
}

function readAssertionPresentation(
  receipt: Record<string, unknown> | undefined,
  canonicalExpectedResults: readonly string[],
  requiredClaimIds: readonly string[],
): Array<{ claimId: string; expectedValue: string }> {
  const declared = Array.isArray(receipt?.declaredAssertions)
    ? receipt.declaredAssertions.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    : [];
  const declaredByClaimId = new Map(declared.flatMap((item) => {
    const claimId = String(item.assertionId ?? item.claimId ?? '').trim();
    const expectedValue = String(item.expectedValue ?? '').trim();
    return claimId && expectedValue ? [[claimId, expectedValue] as const] : [];
  }));
  const receiptAssertions = Array.isArray(receipt?.assertionReceipts)
    ? receipt.assertionReceipts.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    : [];
  const receiptByClaimId = new Map(receiptAssertions.flatMap((item) => {
    const claimId = String(item.claimId ?? '').trim();
    const expectedValue = String(item.expectedValue ?? '').trim();
    return claimId && expectedValue ? [[claimId, expectedValue] as const] : [];
  }));
  return requiredClaimIds.map((claimId, index) => ({
    claimId,
    expectedValue: declaredByClaimId.get(claimId)
      ?? receiptByClaimId.get(claimId)
      ?? (requiredClaimIds.length === canonicalExpectedResults.length ? canonicalExpectedResults[index] : undefined)
      ?? `运行时断言「${claimId}」满足已审核执行合同`,
  }));
}

function readCleanupSummary(
  receipt: Record<string, unknown> | undefined,
  observation: Record<string, unknown> | undefined,
): { declared: boolean; apiZeroResidue?: boolean; uiZeroResidue?: boolean; uiVerificationObserved?: boolean } {
  const cleanup = receipt?.cleanup && typeof receipt.cleanup === 'object'
    ? receipt.cleanup as Record<string, unknown>
    : undefined;
  if (cleanup) return {
    declared: true,
    apiZeroResidue: cleanup.apiZeroResidue === true,
    uiVerificationObserved: cleanup.uiVerificationObserved === true,
    uiZeroResidue: cleanup.uiZeroResidue === true,
  };
  const evidence = findNestedBusinessRecord(observation, 'cleanupEvidence');
  if (!evidence) return { declared: false };
  return {
    declared: true,
    apiZeroResidue: evidence.verifiedZero === true || numericRecordIsZero(evidence.apiIdentityCounts),
    uiVerificationObserved: evidence.uiVerificationObserved === true,
    uiZeroResidue: evidence.uiVerificationObserved === true
      ? evidence.uiZeroResidue === true || numericRecordIsZero(evidence.uiIdentityCounts)
      : undefined,
  };
}

function summarizeObservedBusinessValues(value: Record<string, unknown> | undefined): string {
  if (!value) return '';
  const observations = value.observations ?? value.evidence ?? value;
  const text = formatReadableReportValue(observations);
  return inlineValue(text);
}

function findNestedBusinessRecord(
  value: unknown,
  key: string,
  depth = 0,
): Record<string, unknown> | undefined {
  if (depth > 5 || !value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const direct = record[key];
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) return direct as Record<string, unknown>;
  for (const child of Object.values(record)) {
    const found = findNestedBusinessRecord(child, key, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function numericRecordIsZero(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every((item) => typeof item === 'number' && item === 0));
}

function renamedAttachment(
  item: Record<string, unknown>,
  name: string,
): NonNullable<AllureReportStep['attachments']>[number] {
  return { name, source: typeof item.source === 'string' ? item.source : undefined, type: typeof item.type === 'string' ? item.type : undefined };
}

function isFailureAttachmentName(name: string): boolean {
  return failureAttachmentPattern.test(name);
}

function localizeFailureAttachmentName(name: string): string {
  if (/截图|screenshot|test-failed/i.test(name)) return '失败截图附件';
  if (/trace|追踪/i.test(name)) return '执行追踪附件';
  if (/context|上下文/i.test(name)) return '失败上下文附件';
  return '失败诊断附件';
}

function readStatusMessage(document: Record<string, unknown>): string {
  const details = document.statusDetails && typeof document.statusDetails === 'object'
    ? document.statusDetails as Record<string, unknown>
    : {};
  return String(details.message ?? details.trace ?? '');
}

function inlineValue(value: unknown): string {
  const text = formatReadableReportValue(value) || '未产生可展示的运行值';
  const readable = text.replace(/\{/g, '（').replace(/\}/g, '）');
  return readable.length > 320 ? `${readable.slice(0, 320)}…` : readable;
}

function renderCanonicalBusinessText(value: string): string {
  return value
    .replace(/\{([A-Za-z\u3400-\u9fff][A-Za-z0-9_.\-\u3400-\u9fff]*)\}/g, (_match, parameter: string) => `【运行时参数：${parameter}】`)
    .replace(/\{/g, '（')
    .replace(/\}/g, '）');
}

function describeFailureForBusinessReport(message: string): string {
  const compact = message.replace(/\r\n/g, '\n').trim();
  if (/认证|AuthFlow|OAuth|403|permissions-loading/i.test(compact)) {
    return '认证或权限上下文未建立成功；用例未进入稳定业务验证阶段。';
  }
  const timeoutMs = compact.match(/Timeout\s+(\d+)ms\s+exceeded/i)?.[1];
  if (/locator\.click|点击.*超时/i.test(compact)) {
    return `自动化点击操作超时${timeoutMs ? `（${timeoutMs} 毫秒）` : ''}：目标控件未在时限内完成点击。`;
  }
  if (/WAIT_UNTIL_CONDITION_TIMEOUT|WaitUntilError/i.test(compact)) {
    const reason = compact
      .replace(/^WaitUntilError:\s*/i, '')
      .replace(/^\[WAIT_UNTIL_CONDITION_TIMEOUT\]\s*/i, '')
      .replace(/\bdescription\b/gi, '描述')
      .replace(/\bstatistic\b/gi, '统计')
      .replace(/Last value:\s*/i, '最后观测值：');
    return `页面业务条件等待超时：${inlineValue(reason)}`;
  }
  if (/expect\(|Expected|Received|断言|观察不一致/i.test(compact)) {
    const expected = compact.match(/Expected(?: value)?:\s*(.+)/i)?.[1]?.trim();
    const received = compact.match(/Received(?: array| value)?:\s*(.+)/i)?.[1]?.trim();
    return expected || received
      ? `业务断言不一致：期望=${expected ?? '见失败附件'}；实际=${received ?? '见失败附件'}。`
      : '业务断言结果与期望不一致；详细差异见失败诊断附件。';
  }
  const firstLine = compact.split('\n').find(Boolean) ?? '未知执行错误';
  return `自动化执行失败：${inlineValue(firstLine.replace(/^Error:\s*/i, ''))}`;
}

function yesNo(value: boolean | undefined): string {
  return value === true ? '是' : value === false ? '否' : '未声明';
}

function rebindPassedContextAttachments(document: AllureBusinessReportResult): number {
  if (document.status !== 'passed') return 0;
  const steps = document.steps ?? [];
  const operationStep = steps.find((step) => step.name?.startsWith('[业务操作] '));
  const assertionStep = steps.find((step) => step.name?.startsWith('[断言] '));
  let changed = 0;
  document.steps = steps.filter((step) => {
    if (!step.name?.startsWith('失败诊断')) return true;
    const contextAttachments = (step.attachments ?? []).filter((item) => item.name === '业务上下文校验收据');
    if (contextAttachments.length === 0) return true;
    const targets = [operationStep, assertionStep].filter((item): item is AllureReportStep => Boolean(item));
    for (const [index, attachment] of contextAttachments.entries()) {
      const target = targets[Math.min(index, targets.length - 1)];
      if (!target) continue;
      const targetAttachments = target.attachments ?? [];
      if (!targetAttachments.some((item) => item.source === attachment.source && item.name === attachment.name)) {
        target.attachments = [...targetAttachments, attachment];
      }
    }
    step.attachments = (step.attachments ?? []).filter((item) => item.name !== '业务上下文校验收据');
    changed += 1;
    return (step.attachments?.length ?? 0) > 0 || (step.steps?.length ?? 0) > 0;
  });
  return changed;
}

function rebindSeasoningEvidenceContainers(
  document: AllureBusinessReportResult,
  resultsDir: string,
): number {
  const steps = document.steps ?? [];
  const containers = steps.filter((step) => step.name === '执行结论：保留业务结果、断言和执行收据');
  if (containers.length === 0) return 0;
  const preparation = steps.find((step) => step.name?.startsWith('[准备数据]'));
  const operation = steps.find((step) => step.name?.startsWith('[业务操作]'));
  const assertion = steps.find((step) => step.name?.startsWith('[断言]'));
  const conclusion = steps.find((step) => /^执行结论：(通过|失败)/.test(step.name ?? ''));
  const failed = flattenAllureSteps(steps).find((step) => step.status === 'failed');
  for (const container of containers) {
    for (const attachment of container.attachments ?? []) {
      const payload = attachment.source ? readAllureAttachmentJson(resultsDir, attachment.source) : undefined;
      const phase = String(payload?.phase ?? payload?.contextPhase ?? '');
      const target = attachment.name === '断言期望值与实际值'
        ? assertion ?? conclusion
        : attachment.name === '接口与业务数据执行收据'
          ? preparation ?? operation ?? conclusion
          : attachment.name === '业务操作执行收据'
            ? operation ?? conclusion
            : attachment.name === '业务上下文校验收据'
              ? /assertion/i.test(phase) ? assertion ?? operation ?? conclusion : operation ?? assertion ?? conclusion
              : isFailureAttachmentName(attachment.name ?? '')
                ? failed ?? conclusion
                : conclusion ?? assertion ?? operation;
      if (!target) continue;
      const current = target.attachments ?? [];
      if (!current.some((item) => item.source === attachment.source && item.name === attachment.name)) {
        target.attachments = [...current, attachment];
      }
    }
  }
  document.steps = steps.filter((step) => !containers.includes(step));
  return 1;
}

function flattenAllureSteps(steps: readonly AllureReportStep[]): AllureReportStep[] {
  return steps.flatMap((step) => [step, ...flattenAllureSteps(step.steps ?? [])]);
}

function normalizeExecutionConclusion(
  document: AllureBusinessReportResult,
  caseId: string,
  runtimeEvidence: Record<string, unknown> | undefined,
): number {
  const conclusion = (document.steps ?? []).find((step) => step.name?.startsWith('执行结论：'));
  if (!conclusion) return 0;
  const evidenceIncomplete = /缺少当前标准执行收据|证据不完整/.test(readStatusMessage(document));
  const title = `执行结论：${document.status === 'passed' ? '通过' : evidenceIncomplete ? '失败（证据不完整）' : '失败'}｜${caseId}`;
  let changed = 0;
  if (conclusion.name !== title) {
    conclusion.name = title;
    changed += 1;
  }
  if (conclusion.status !== document.status) {
    conclusion.status = document.status;
    changed += 1;
  }
  if (!(conclusion.steps ?? []).some((step) => step.name?.startsWith('结论摘要：'))) {
    const assertions = Array.isArray(runtimeEvidence?.assertionReceipts) ? runtimeEvidence.assertionReceipts : [];
    const operations = Array.isArray(runtimeEvidence?.operationReceipts) ? runtimeEvidence.operationReceipts : [];
    const cleanup = runtimeEvidence?.cleanup;
    conclusion.steps = [...(conclusion.steps ?? []), {
      name: `结论摘要：用例${document.status === 'passed' ? '通过' : '失败'}｜断言收据 ${assertions.length} 条｜操作收据 ${operations.length} 条｜清理收据${cleanup ? '已生成' : '未生成'}`,
      status: document.status,
      stage: 'finished',
      steps: [],
      attachments: [],
      parameters: [],
      statusDetails: {},
    }];
    changed += 1;
  }
  return changed;
}

function normalizeAllureValue(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((total, item) => total + normalizeAllureValue(item), 0);
  if (!value || typeof value !== 'object') return 0;
  let changed = 0;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'name' && typeof item === 'string') {
      const normalized = normalizeMerchantCenterAllureTitle(item);
      if (normalized !== item) {
        (value as Record<string, unknown>)[key] = normalized;
        changed += 1;
      }
      continue;
    }
    changed += normalizeAllureValue(item);
  }
  return changed;
}

function normalizeSeasoningBusinessDetails(
  document: AllureBusinessReportResult,
  resultsDir: string,
): number {
  const steps = document.steps ?? [];
  const caseId = findCaseId(document);
  const assertionObservations = readSeasoningAssertionObservations(document, resultsDir);
  let changed = 0;
  const retained: AllureReportStep[] = [];
  for (const [index, step] of steps.entries()) {
    if (step.name?.startsWith('前置断言：')) {
      step.name = step.name.replace(/^前置断言：/, '[环境] ');
      changed += 1;
    }
    if (step.name?.startsWith('前置：操作前')) {
      step.name = step.name.replace(/^前置：操作前/, '自动门禁：操作前');
      changed += 1;
    }
    if (step.name?.startsWith('前置：准备')) {
      step.name = step.name.replace(/^前置：准备本用例所需的调味业务数据（接口、对象和结果）$/, '执行准备：创建本用例业务数据并回读服务端身份');
      step.name = step.name.replace(/^前置：准备单门店调味模板下发数据（接口、对象和结果）$/, '执行准备：创建单门店调味模板下发数据并回读身份');
      step.name = step.name.replace(/^前置：准备多门店调味模板下发数据（接口、对象和结果）$/, '执行准备：创建多门店调味模板下发数据并回读身份');
      changed += 1;
    }
    if (step.name && /^(?:前置：断言前|\[前置校验\] 断言前)/.test(step.name)) {
      const assertionStep = steps.slice(index + 1).find((candidate) => candidate.name?.startsWith('[断言] ')
        || candidate.name?.startsWith('断言：'));
      if (assertionStep) {
        if ((step.attachments?.length ?? 0) > 0) {
          assertionStep.attachments = [...(assertionStep.attachments ?? []), ...(step.attachments ?? [])];
        }
        changed += 1;
        continue;
      }
    }
    if (step.name && /^(?:前置：操作前|\[前置校验\] 操作前)/.test(step.name)) {
      const capabilityStep = steps.slice(index + 1).find((candidate) => candidate.name?.startsWith('[业务操作] ')
        || candidate.name?.startsWith('业务操作：'));
      if (capabilityStep) {
        if ((step.attachments?.length ?? 0) > 0) {
          capabilityStep.attachments = [...(capabilityStep.attachments ?? []), ...(step.attachments ?? [])];
        }
        changed += 1;
        continue;
      }
    }
    changed += renameSeasoningOperationStep(step, caseId);
    changed += renameSeasoningAssertionStep(step, caseId);
    changed += backfillSeasoningStepDetails(step, resultsDir, caseId, assertionObservations);
    retained.push(step);
  }
  if (retained.length !== steps.length) {
    document.steps = retained;
    changed += 1;
  }
  return changed;
}

function renameSeasoningOperationStep(step: AllureReportStep, caseId?: string): number {
  if (caseId !== 'TC-FLV-SEA-041') return 0;
  const oldTitles = new Set([
    '业务操作：拖动调味组排序并确认列表状态',
    '[业务操作] 拖动调味组排序并确认列表状态',
  ]);
  if (!step.name || !oldTitles.has(step.name)) return 0;
  step.name = '[业务操作] 打开排序弹窗，拖动调味组并点击“确定”保存';
  return 1;
}

function renameSeasoningAssertionStep(step: AllureReportStep, caseId?: string): number {
  if (!caseId || !step.name?.startsWith('断言：核对业务操作的期望结果')) return 0;
  const titles: Record<string, string> = {
    'TC-FLV-SEA-010': '断言：调味项已加入品牌调味列表且业务身份正确',
    'TC-FLV-SEA-022': '断言：第51项提交被明确拒绝且服务端仍保留原50项',
    'TC-FLV-SEA-023': '断言：相同调味项覆盖去重、不同调味项累加且保存成功',
    'TC-FLV-SEA-024': '断言：第二名称重复被拦截并给出反馈',
    'TC-FLV-SEA-025': '断言：跨语言名称重复被拦截并给出反馈',
    'TC-FLV-SEA-026': '断言：调味组名称重复被拦截并给出反馈',
    'TC-FLV-SEA-027': '断言：同组重复调味项被拦截并给出反馈',
    'TC-FLV-SEA-028': '断言：删除调味项后保存结果符合预期',
    'TC-FLV-SEA-033': '断言：编辑后的调味项名称已保存并回读一致',
    'TC-FLV-SEA-034': '断言：取消新增后数据未保存',
    'TC-FLV-SEA-035': '断言：取消编辑后原调味组信息保持不变',
    'TC-FLV-SEA-036': '断言：取消删除后原调味组仍保留',
    'TC-FLV-SEA-037': '断言：调味项已移动到目标调味组且源组已移除',
    'TC-FLV-SEA-040': '断言：调味项排序保存成功且列表回读顺序一致',
    'TC-FLV-SEA-041': '断言：调味组排序保存成功且列表回读顺序一致',
    'TC-FLV-TPL-021': '断言：调味模板删除结果符合预期',
    'TC-FLV-TPL-023': '断言：后下发模板覆盖先下发模板',
    'TC-FLV-TPL-024': '断言：未再次下发保持原结果，再次下发后与编辑模板一致',
  };
  const title = titles[caseId];
  if (!title || step.name === title) return 0;
  step.name = title;
  return 1;
}

function backfillSeasoningStepDetails(
  step: AllureReportStep,
  resultsDir: string,
  caseId?: string,
  assertionObservations?: Record<string, unknown>,
): number {
  let changed = 0;
  const pageReadinessAttachment = (step.attachments ?? []).find((item) => item.name === '页面可用断言收据');
  if (pageReadinessAttachment?.source) {
    const payload = readAllureAttachmentJson(resultsDir, pageReadinessAttachment.source);
    if (payload) {
      const expected = payload.expected && typeof payload.expected === 'object' ? payload.expected as Record<string, unknown> : {};
      const actual = payload.actual && typeof payload.actual === 'object' ? payload.actual as Record<string, unknown> : {};
      changed += addStepDetail(step, `页面可用性：期望路径 ${expected.route ?? '未提供'} 且存在业务内容｜实际路径 ${actual.actualRoute ?? actual.route ?? '未提供'}｜结果：${payload.result ?? '未判定'}`);
    }
  }
  const attachment = (step.attachments ?? []).find((item) => item.name === '断言期望值与实际值'
    || item.name === '接口与业务数据执行收据'
    || item.name === '业务操作执行收据');
  if (!attachment?.source) return 0;
  const payload = readAllureAttachmentJson(resultsDir, attachment.source);
  if (!payload) return 0;
  const checkResults = Array.isArray(payload.checkResults) ? payload.checkResults : [];
  const assertionDetailTitles: string[] = [];
  for (const [index, item] of checkResults.entries()) {
    if (!item || typeof item !== 'object') continue;
    const result = item as Record<string, unknown>;
    const checkName = String(result.checkName ?? `检查项${index + 1}`);
    const label = seasoningAssertionLabel(caseId, checkName);
    const expected = seasoningAssertionExpectation(caseId, checkName) ?? readBusinessExpectation(result.expectedValue);
    const actual = readSeasoningInlineActual(caseId, checkName, result);
    const title = `校验${index + 1}：${label}｜期望：${formatInlineReportValue(expected)}｜实际：${formatInlineReportValue(actual)}｜结果：${result.result ?? '未判定'}`;
    assertionDetailTitles.push(title);
  }
  if (assertionDetailTitles.length === 0 && attachment.name === '断言期望值与实际值') {
    assertionDetailTitles.push(...buildSeasoningReceiptAssertionTitles(payload));
  }
  if (assertionDetailTitles.length > 0) changed += replaceAssertionStepDetails(step, assertionDetailTitles);
  const operations = Array.isArray(payload.operations) ? payload.operations : [];
  const writeOperations = operations.filter((item) => item && typeof item === 'object'
    && /:(?:POST|PUT|PATCH|DELETE)\s/.test(String((item as Record<string, unknown>).operationKey ?? '')));
  const observedResponseStatus = writeOperations.length === 1 && typeof assertionObservations?.status === 'number'
    ? assertionObservations.status
    : undefined;
  const operationDetails: AllureReportStep[] = [];
  for (const [index, item] of operations.entries()) {
    if (!item || typeof item !== 'object') continue;
    const operation = item as Record<string, unknown>;
    const operationKey = String(operation.operationKey ?? '');
    const presentation = describeSeasoningOperation(operationKey, { caseId, phase: String(payload.phase ?? '') });
    const success = operation.success === true || operation.status === 'passed';
    const currentResponseStatus = typeof operation.responseStatus === 'number'
      ? operation.responseStatus
      : String(operation.responseStatus ?? '').includes('未提供')
        ? undefined
        : operation.responseStatus;
    const responseStatus = currentResponseStatus ?? (/:(?:POST|PUT|PATCH|DELETE)\s/.test(operationKey)
      ? observedResponseStatus
      : undefined);
    const detail = createBusinessOperationReceiptDetail({
      purpose: presentation.purpose,
      triggerSource: presentation.triggerSource,
      result: success ? '成功' : '失败',
      attachmentName: presentation.attachmentName,
      technicalDetails: buildSeasoningOperationTechnicalDetails({
        operationKey,
        observed: success,
        responseStatus,
        durationMs: operation.durationMs,
        details: operation.details ?? (responseStatus === observedResponseStatus
          ? { 请求体: assertionObservations?.requestBody }
          : undefined),
        purpose: presentation.purpose,
        triggerSource: presentation.triggerSource,
      }),
    });
    const detailAttachment = detail.attachments?.[0];
    const source = detailAttachment
      ? writeSeasoningOperationDetailAttachment(resultsDir, attachment.source, index, detailAttachment.body)
      : undefined;
    operationDetails.push({
      name: detail.title,
      status: success ? 'passed' : 'failed',
      stage: 'finished',
      steps: [],
      attachments: source ? [{
        name: detailAttachment?.name,
        source,
        type: detailAttachment?.contentType,
      }] : [],
      parameters: [],
      statusDetails: {},
    });
  }
  if (operationDetails.length > 0) changed += replaceOperationStepDetails(step, operationDetails);
  const created = Array.isArray(payload.createdBusinessData) ? payload.createdBusinessData : [];
  for (const item of created) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    changed += addStepDetail(step, `造数：${record.objectType ?? '业务对象'}「${record.businessName ?? '未提供'}」｜服务端 ID：${record.serverId ?? '未提供'}｜结果：已创建`);
  }
  return changed;
}

function buildSeasoningReceiptAssertionTitles(payload: Record<string, unknown>): string[] {
  const expectedRecord = payload.expected && typeof payload.expected === 'object' && !Array.isArray(payload.expected)
    ? payload.expected as Record<string, unknown>
    : {};
  const contracts = Array.isArray(expectedRecord.contracts)
    ? expectedRecord.contracts.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    : [];
  const receipts = Array.isArray(payload.assertionReceipts)
    ? payload.assertionReceipts.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    : [];
  return contracts.map((contract, index) => {
    const claimId = String(contract.claimId ?? '');
    const receipt = receipts.find((item) => String(item.claimId ?? '') === claimId);
    const verified = receipt?.status === 'verified';
    const channel = String(contract.observationChannel ?? '') === 'api' ? '服务端' : '页面';
    const actual = receipt
      ? `${channel}断言收据状态为“${verified ? '已验证' : formatInlineReportValue(receipt.status)}”`
      : `${channel}断言收据未生成`;
    return `校验${index + 1}：期望：${formatInlineReportValue(contract.expected)}｜实际：${actual}｜结果：${verified ? '通过' : '证据不完整'}`;
  });
}

function replaceAssertionStepDetails(step: AllureReportStep, titles: readonly string[]): number {
  const existing = step.steps ?? [];
  const retained = existing.filter((child) => !/^(?:上下文门禁：|校验\d+：)/.test(child.name ?? ''));
  const existingTitles = existing.filter((child) => /^(?:上下文门禁：|校验\d+：)/.test(child.name ?? '')).map((child) => child.name);
  if (existingTitles.length === titles.length && existingTitles.every((title, index) => title === titles[index])) return 0;
  step.steps = [...retained, ...titles.map((title) => ({
    name: title,
    status: title.includes('｜结果：失败') ? 'failed' : 'passed',
    stage: 'finished',
    steps: [],
    attachments: [],
    parameters: [],
    statusDetails: {},
  }))];
  return 1;
}

function replaceOperationStepDetails(step: AllureReportStep, details: readonly AllureReportStep[]): number {
  const existing = step.steps ?? [];
  const isGeneratedOperationDetail = (child: AllureReportStep) => /^(?:执行\d+：)/.test(child.name ?? '')
    || (child.attachments ?? []).some((item) => item.name === '接口执行明细（点击查看）'
      || item.name === '页面操作明细（点击查看）');
  const retained = existing.filter((child) => !isGeneratedOperationDetail(child));
  const current = existing.filter(isGeneratedOperationDetail);
  if (JSON.stringify(current) === JSON.stringify(details)) return 0;
  step.steps = [...retained, ...details];
  return 1;
}

function writeSeasoningOperationDetailAttachment(
  resultsDir: string,
  aggregateSource: string,
  index: number,
  body: string | Buffer | undefined,
): string {
  const source = `${path.parse(aggregateSource).name}-operation-${index + 1}-detail.json`;
  const filePath = path.join(resultsDir, source);
  const content = Buffer.isBuffer(body) ? body : Buffer.from(body ?? '{}');
  if (!fs.existsSync(filePath) || !fs.readFileSync(filePath).equals(content)) fs.writeFileSync(filePath, content);
  return source;
}

function readSeasoningAssertionObservations(
  document: AllureBusinessReportResult,
  resultsDir: string,
): Record<string, unknown> | undefined {
  const attachment = collectAttachments(document).find((item) => item.name === '断言期望值与实际值');
  if (typeof attachment?.source !== 'string') return undefined;
  const payload = readAllureAttachmentJson(resultsDir, attachment.source);
  const actual = payload?.actual;
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return undefined;
  const observations = (actual as Record<string, unknown>).observations;
  return observations && typeof observations === 'object' && !Array.isArray(observations)
    ? observations as Record<string, unknown>
    : undefined;
}

function addStepDetail(step: AllureReportStep, title: string): number {
  if ((step.steps ?? []).some((child) => child.name === title)) return 0;
  step.steps = [...(step.steps ?? []), {
    name: title,
    status: title.includes('｜结果：失败') ? 'failed' : 'passed',
    stage: 'finished',
    steps: [],
    attachments: [],
    parameters: [],
    statusDetails: {},
  }];
  return 1;
}

function readAllureAttachmentJson(resultsDir: string, source: string): Record<string, unknown> | undefined {
  const root = path.resolve(resultsDir);
  const filePath = path.resolve(root, source);
  if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath)) return undefined;
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function readBusinessExpectation(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return (value as Record<string, unknown>).businessExpectation ?? value;
}

function readSeasoningInlineActual(caseId: string | undefined, checkName: string, result: Record<string, unknown>): unknown {
  if (result.observedValue !== undefined && (
    typeof result.observedValue !== 'object'
      || result.observedValue === null
      || Array.isArray(result.observedValue)
  )) return result.observedValue;
  const observation = result.observedValue && typeof result.observedValue === 'object' && !Array.isArray(result.observedValue)
    ? result.observedValue as Record<string, unknown>
    : {};
  if (caseId === 'TC-FLV-SEA-035') {
    const after = readNestedRecordField(observation, ['after', 'data', 'name']);
    switch (checkName) {
      case 'cancelReturned': return `返回路径：${observation.route ?? '未提供'}`;
      case 'originalValueCaptured': return `原名称：${observation.originalName ?? '未提供'}`;
      case 'transientValueEntered': return `临时名称：${observation.transientName ?? '未提供'}；页面确认输入：${observation.transientValueConfirmed === true ? '是' : '否'}`;
      case 'noMutation': return `保存写请求次数：${observation.mutationCount ?? '未提供'}`;
      case 'originalRetained': return `服务端回读名称：${after ?? '未提供'}`;
      case 'transientAbsent': return `服务端回读名称：${after ?? '未提供'}；临时名称：${observation.transientName ?? '未提供'}`;
    }
  }
  if (caseId === 'TC-FLV-SEA-037') {
    switch (checkName) {
      case 'batchMoveAccepted': return `HTTP ${observation.status ?? '未提供'}`;
      case 'requestContainsMovedOption': return `调味项 ID：${observation.movedOptionId ?? '未提供'}；目标调味组 ID：${readNestedRecordField(observation, ['requestBody', 'targetModifierId']) ?? '未提供'}`;
      case 'sourceNoLongerOwnsOption': return `源调味组剩余调味项：${formatReadableReportValue(observation.sourceOptionNames)}`;
      case 'targetOwnsOption': return `目标调味组调味项：${formatReadableReportValue(observation.targetOptionNames)}`;
    }
  }
  if (caseId !== 'TC-FLV-SEA-041') return result.observedValue ?? result.actualValue ?? '未产生该断言结果';
  switch (checkName) {
    case 'sortAccepted':
      return `HTTP ${observation.status ?? '未提供'}`;
    case 'uiOrderChanged':
      return { 调整前: observation.before, 调整后: observation.after };
    case 'dialogClosed':
      return `排序窗口关闭=${observation.dialogClosed ?? '未提供'}`;
    case 'apiOrderPersisted':
      return { 页面保存后顺序: observation.after, 服务端回读顺序: observation.persistedNames };
    default:
      return result.observedValue ?? result.actualValue ?? '未产生该断言结果';
  }
}

function formatInlineReportValue(value: unknown): string {
  const text = formatReadableReportValue(value);
  if (!text) return '无额外信息';
  return text.length > 260 ? `${text.slice(0, 260)}…` : text;
}

function formatReadableReportValue(value: unknown): string {
  if (isUnavailableReportValue(value)) return '';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(formatReadableReportValue).filter(Boolean).join(' → ') || '空列表';
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, formatReadableReportValue(item)] as const)
      .filter(([, item]) => Boolean(item))
      .map(([key, item]) => `${key}：${item}`)
      .join('；');
  }
  return String(value);
}

function isUnavailableReportValue(value: unknown): boolean {
  return value === null || value === undefined
    || (typeof value === 'string' && /^(?:未提供|本接口收据未提供)/.test(value.trim()));
}

function readNestedRecordField(value: unknown, pathParts: readonly string[]): unknown {
  return pathParts.reduce<unknown>((current, key) => current && typeof current === 'object' && !Array.isArray(current)
    ? (current as Record<string, unknown>)[key]
    : undefined, value);
}

function seasoningAssertionLabel(caseId: string | undefined, checkName: string): string {
  const labels: Record<string, Record<string, string>> = {
    'TC-FLV-SEA-035': {
      cancelReturned: '取消后返回调味列表', originalValueCaptured: '已记录编辑前名称', transientValueEntered: '已输入临时名称',
      noMutation: '取消操作未提交保存请求', originalRetained: '服务端保留原名称', transientAbsent: '服务端不存在临时名称',
    },
    'TC-FLV-SEA-037': {
      batchMoveAccepted: '批量变更请求', requestContainsMovedOption: '请求包含目标调味项和目标调味组',
      sourceNoLongerOwnsOption: '源调味组已移除目标调味项', targetOwnsOption: '目标调味组已包含目标调味项',
    },
    'TC-FLV-SEA-041': {
      sortAccepted: '排序保存请求', uiOrderChanged: '页面调味组顺序变化', dialogClosed: '排序操作窗口关闭', apiOrderPersisted: '服务端回读顺序',
    },
  };
  return caseId ? labels[caseId]?.[checkName] ?? checkName : checkName;
}

function seasoningAssertionExpectation(caseId: string | undefined, checkName: string): string | undefined {
  const expectations: Record<string, Record<string, string>> = {
    'TC-FLV-SEA-035': {
      cancelReturned: '点击取消后返回品牌调味列表页', originalValueCaptured: '编辑前已记录原调味组名称',
      transientValueEntered: '编辑页已输入不同于原名称的临时名称', noMutation: '取消操作不产生保存写请求',
      originalRetained: '服务端回读名称仍为编辑前原名称', transientAbsent: '服务端回读结果中不存在未保存的临时名称',
    },
    'TC-FLV-SEA-037': {
      batchMoveAccepted: '批量变更调味组请求返回 HTTP 200-299', requestContainsMovedOption: '请求包含目标调味项 ID 和目标调味组 ID',
      sourceNoLongerOwnsOption: '源调味组回读结果不再包含目标调味项', targetOwnsOption: '目标调味组回读结果包含目标调味项',
    },
    'TC-FLV-SEA-041': {
      sortAccepted: '排序保存请求返回 HTTP 200-299', uiOrderChanged: '页面调味组顺序在拖动保存前后发生变化',
      dialogClosed: '保存完成后排序操作窗口关闭', apiOrderPersisted: '服务端回读顺序与页面保存后的调味组顺序一致',
    },
  };
  return caseId ? expectations[caseId]?.[checkName] : undefined;
}

function findCaseId(document: Record<string, unknown>): string | undefined {
  const labels = Array.isArray(document.labels) ? document.labels : [];
  const label = labels.find((item) => item && typeof item === 'object'
    && (item as Record<string, unknown>).name === 'tag'
    && typeof (item as Record<string, unknown>).value === 'string'
    && String((item as Record<string, unknown>).value).startsWith('case-'));
  if (label) return String((label as Record<string, unknown>).value).slice('case-'.length);
  const text = JSON.stringify(document);
  return text.match(/TC-(?:FLV|GRP|ITEM|IMG|TAG)-[A-Z]+-\d+/)?.[0];
}

function applyBusinessLabels(
  document: Record<string, unknown>,
  caseId: string,
  canonicalCase: BusinessCasePresentation | null,
): number {
  const labels = Array.isArray(document.labels) ? document.labels as Array<Record<string, unknown>> : [];
  const seasoningPrefix = caseId.match(/^TC-FLV-([A-Z]+)/)?.[1];
  const seasoningFeature = seasoningPrefix === 'REC'
    ? '下发记录'
    : seasoningPrefix === 'TPL'
      ? '调味模板'
      : seasoningPrefix === 'XMOD'
        ? '门店调味'
        : '品牌调味';
  const feature = caseId.startsWith('TC-FLV-')
    ? '调味管理'
    : caseId.startsWith('TC-GRP-')
      ? '商品管理-组'
      : caseId.startsWith('TC-ITEM-')
        ? '商品管理-商品'
        : caseId.startsWith('TC-IMG-')
          ? '图片管理'
          : caseId.startsWith('TC-TAG-')
            ? '标签管理'
            : '商品中心';
  const story = canonicalCase?.module || seasoningFeature;
  const next = [
    ['caseId', caseId],
    ['epic', '商品中心'],
    ['feature', feature],
    ['story', story],
    ['parentSuite', `商品中心 / ${feature}`],
    ['suite', story],
  ];
  let changed = 0;
  for (const [name, value] of next) {
    const existing = labels.find((label) => label.name === name);
    if (existing) {
      if (existing.value !== value) { existing.value = value; changed += 1; }
    } else {
      labels.push({ name, value });
      changed += 1;
    }
  }
  document.labels = labels;
  return changed;
}

function sanitizeAllureTraceArchives(document: Record<string, unknown>, resultsDir: string): number {
  const root = path.resolve(resultsDir);
  let changed = 0;
  for (const attachment of collectAttachments(document)) {
    if (typeof attachment.name !== 'string'
      || !/^(?:trace|执行追踪附件)$/i.test(attachment.name)
      || typeof attachment.source !== 'string') continue;
    const filePath = path.resolve(root, attachment.source);
    if (!filePath.startsWith(`${root}${path.sep}`) || path.extname(filePath).toLowerCase() !== '.zip' || !fs.existsSync(filePath)) continue;
    if (sanitizeMerchantCenterPlaywrightTraceArchive(filePath) > 0) changed += 1;
  }
  return changed;
}

export function sanitizeMerchantCenterPlaywrightTraceArchive(filePath: string): number {
  const archive = new AdmZip(filePath);
  let redactedFields = 0;
  for (const entry of archive.getEntries()) {
    if (entry.isDirectory) continue;
    const original = entry.getData();
    const sanitized = sanitizePlaywrightTraceText(original.toString('utf8'));
    if (sanitized.redactedFields === 0) continue;
    archive.updateFile(entry.entryName, Buffer.from(sanitized.text, 'utf8'));
    redactedFields += sanitized.redactedFields;
  }
  if (redactedFields > 0) archive.writeZip(filePath);
  return redactedFields;
}

function readRuntimeEvidence(document: Record<string, unknown>, resultsDir: string): Record<string, unknown> | undefined {
  const attachments = collectAttachments(document);
  const attachment = attachments.find((item) => {
    if (typeof item.name !== 'string') return false;
    const name = normalizedAttachmentName(item);
    return name === 'test-execution-receipt'
      || name === 'product-center-group-runtime-evidence'
      || name === 'system-test-runtime-evidence'
      || name === '运行证据附件'
      || name === '业务操作执行收据（点击查看）'
      || /-runtime-evidence$/.test(name);
  });
  return readAttachmentJson(resultsDir, attachment);
}

function collectAttachments(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(collectAttachments);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const own = Array.isArray(record.attachments)
    ? (record.attachments as Array<Record<string, unknown>>)
    : [];
  return [...own, ...Object.values(record).flatMap(collectAttachments)];
}

function hasUnacceptedEvidence(evidence: Record<string, unknown>): boolean {
  const claims = evidence.claims && typeof evidence.claims === 'object'
    ? evidence.claims as Record<string, unknown>
    : {};
  const requiredClaims = Array.isArray(claims.required) ? claims.required.map(String) : [];
  const verifiedClaims = new Set(Array.isArray(claims.verified) ? claims.verified.map(String) : []);
  if (requiredClaims.length > 0 && requiredClaims.some((claimId) => !verifiedClaims.has(claimId))) return true;
  const assertions = Array.isArray(evidence.assertionReceipts) ? evidence.assertionReceipts : [];
  if (assertions.some((item) => item && typeof item === 'object' && (item as Record<string, unknown>).status !== 'verified')) return true;
  const operations = Array.isArray(evidence.operationReceipts) ? evidence.operationReceipts : [];
  return operations.length === 0 || operations.some((item) => !item || typeof item !== 'object'
    || (item as Record<string, unknown>).observed !== true
    || (item as Record<string, unknown>).status !== 'passed');
}

function buildEvidenceFailureMessage(evidence: Record<string, unknown>): string {
  const mismatched = (Array.isArray(evidence.assertionReceipts) ? evidence.assertionReceipts : [])
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'
      && (item as Record<string, unknown>).status === 'observed-mismatch'));
  const operations = Array.isArray(evidence.operationReceipts) ? evidence.operationReceipts : [];
  const cleanup = evidence.cleanup && typeof evidence.cleanup === 'object'
    ? evidence.cleanup as Record<string, unknown>
    : {};
  const productDifferenceComplete = mismatched.length > 0
    && cleanup.apiZeroResidue === true
    && cleanup.uiVerificationObserved === true
    && cleanup.uiZeroResidue === true
    && operations.length > 0
    && operations.every((item) => item && typeof item === 'object'
      && (item as Record<string, unknown>).observed === true
      && (item as Record<string, unknown>).status === 'passed');
  if (productDifferenceComplete) {
    return `${String(evidence.caseId ?? '当前用例')} PRODUCT-DEFECT：${mismatched
      .map((item) => `期望=${inlineValue(item.expectedValue)}；实际=${inlineValue(item.actualValue)}`)
      .join('；')}`;
  }
  return mismatched.length > 0
    ? `业务断言观察不一致：${mismatched.map((item) => String(item.claimId)).join('、')}`
    : '正式执行收据缺少可接受的真实业务操作证据。';
}

function normalizeMerchantCenterAllureTitle(title: string): string {
  title = title.replace(/；(?:responseStatus|responseBody)：未提供/g, '');
  const stepBinding = parseStepBoundAttachmentName(title);
  if (stepBinding) return normalizeMerchantCenterAllureTitle(stepBinding.attachmentName);
  const caseId = title.match(/^system-test-case-id:\s*(.+)$/);
  if (caseId) return `用例标识：${caseId[1]}`;
  const failureCategory = title.match(/^failure-category:\s*(.+)$/);
  if (failureCategory) return `失败分类：${failureCategory[1]}`;
  if (title.startsWith('执行准备：进入')) return normalizeMerchantCenterAllureTitle(`[环境] ${title.slice('执行准备：进入'.length)}`);
  if (title.startsWith('执行准备：创建')) return `[准备数据] ${title.slice('执行准备：创建'.length)}`;
  if (title.startsWith('业务操作：')) return `[业务操作] ${title.slice('业务操作：'.length)}`;
  if (title.startsWith('断言：')) return `[断言] ${title.slice('断言：'.length)}`;
  if (title.startsWith('清理：')) return `[清理] ${title.slice('清理：'.length)}`;
  if (title.startsWith('自动门禁：')) return `[前置校验] ${title.slice('自动门禁：'.length)}`;
  if (title.startsWith('证据：')) return `执行结论：${title.slice('证据：'.length)}`;
  const environmentTitles: Record<string, string> = {
    '[环境] 品牌调味列表页并确认页面可用': '[环境] 登录 → 商品中心 → 商品管理 → 调味管理 → 品牌调味列表页，确认页面加载完成',
    '[环境] 调味模板页并确认页面可用': '[环境] 登录 → 商品中心 → 商品管理 → 调味管理 → 调味模板页，确认页面加载完成',
    '[环境] 调味下发记录页并确认页面可用': '[环境] 登录 → 商品中心 → 商品管理 → 调味管理 → 调味下发记录页，确认页面加载完成',
    '[环境] 门店调味列表页并确认页面可用': '[环境] 登录 → 商品中心 → 商品管理 → 调味管理 → 门店调味列表页，确认页面加载完成',
  };
  if (environmentTitles[title]) return environmentTitles[title];
  const titles: Record<string, string> = {
    'system-test-runtime-evidence': '运行证据附件',
    'system-test-error': '失败诊断附件',
    screenshot: '失败截图附件',
    'error-context': '失败上下文附件',
    trace: '执行追踪附件',
  };
  if (/^test-failed(?:-\d+)?\.png$/i.test(title)) return '失败截图附件';
  if (/^error-context(?:\.md)?$/i.test(title)) return '失败上下文附件';
  if (/^trace(?:\.zip)?$/i.test(title)) return '执行追踪附件';
  return titles[title] ?? title;
}
