import fs from 'node:fs';
import path from 'node:path';
import { buildSystemTestArtifacts } from '../../../Test Automation Platform/scripts/build-system-test-contract';
import { fingerprintSystemTestValue } from '../../../Test Automation Platform/src/automation/system-test/system-test-contract';
import {
  buildSystemTestCaseImplementationFingerprint,
  collectSystemTestRecipeAdapterIds,
} from '../../../Test Automation Platform/scripts/run-system-test';
import { arbitrateCaseState } from '../../../Test Automation Platform/src/automation/system-test/system-test-case-state-arbiter';
import {
  assertDeliveryCompletion,
  evaluateDeliveryCompletion,
} from '../../../Test Automation Platform/src/utils/test-plan-landing-gate';

type Disposition = 'deferred' | 'not-applicable' | 'blocked-source' | 'blocked-technical' | 'product-defect';
type EvidenceCase = {
  caseId: string;
  caseFingerprint: string;
  implementationFingerprint: string;
  playwrightStatus: 'passed' | 'failed' | 'skipped';
  evidence?: { status?: string; apiZeroResidue?: boolean; uiZeroResidue?: boolean };
  failureCategory?: string;
  runtimeEvidence?: {
    assertionReceipts?: Array<{ status: 'verified' | 'observed-mismatch' }>;
  };
};
type EvidenceLedger = {
  generatedAt: string;
  implementationFingerprint: string;
  cases: EvidenceCase[];
};

const root = path.resolve(__dirname, '..');
const systemId = 'merchant-center-product-center-seasoning';
const systemRoot = path.join(root, 'systems', systemId);
const deliverableRoot = path.join(root, 'deliverables/system-test-platform');
const outputRoot = path.join(root, 'output/system-test', systemId);
const manifestPath = path.join(systemRoot, 'manifest.json');
const ledger = readJson<{
  summary: { planned: number };
  cases: Array<{ caseId: string; title: string; disposition: 'ready' | Disposition }>;
}>(path.join(systemRoot, 'classification-ledger.json'));
const artifacts = buildSystemTestArtifacts({
  rootDir: root,
  manifestPath,
  outputDir: path.join(outputRoot, 'reconcile-current'),
});
if (artifacts.errors.length > 0) throw new Error(`调味当前合同不可仲裁：${artifacts.errors.join(';')}`);

const runnerPath = path.resolve(root, '../../Test Automation Platform/scripts/run-system-test.ts');
const currentImplementationFingerprints = Object.fromEntries(artifacts.contract.cases.map((item) => {
  const recipe = artifacts.recipes.recipes.find((candidate) => candidate.caseId === item.caseId);
  const profile = recipe && 'dataProfileId' in recipe
    ? artifacts.manifest.dataProfiles[String(recipe.dataProfileId)]
    : undefined;
  const adapterIds = collectSystemTestRecipeAdapterIds(recipe, profile, {
    authAdapterId: artifacts.manifest.execution.authAdapterId,
  });
  return [item.caseId, buildSystemTestCaseImplementationFingerprint({
    adapters: artifacts.adapters.adapters,
    adapterIds,
    evidenceRuntime: artifacts.contract.sourceFingerprints.evidenceRuntime,
    execution: artifacts.contract.execution,
    runnerPath,
  })];
}));
const currentImplementationFingerprint = fingerprintSystemTestValue(currentImplementationFingerprints);
const currentContractCases = new Map(artifacts.contract.cases.map((item) => [item.caseId, {
  caseFingerprint: fingerprintSystemTestValue(item),
  implementationFingerprint: currentImplementationFingerprints[item.caseId],
}]));
const formalPlan = readJson<{ cases: Array<{ caseId: string; title: string }> }>(path.join(systemRoot, 'test-plan.json'));
const receipts = readEvidenceLedgers(outputRoot);
const currentReceiptByCase = new Map<string, { ledger: EvidenceLedger; item: EvidenceCase; path: string }>();
for (const receipt of receipts) {
  for (const item of receipt.ledger.cases) {
    const current = currentContractCases.get(item.caseId);
    if (!current
      || item.caseFingerprint !== current.caseFingerprint
      || item.implementationFingerprint !== current.implementationFingerprint) continue;
    const previous = currentReceiptByCase.get(item.caseId);
    if (!previous || previous.ledger.generatedAt < receipt.ledger.generatedAt) {
      currentReceiptByCase.set(item.caseId, { ...receipt, item });
    }
  }
}

const excludedById = new Map(ledger.cases.map((item) => [item.caseId, item]));
const completeFormalIndex = [
  ...formalPlan.cases,
  ...ledger.cases.filter((item) => !formalPlan.cases.some((formalCase) => formalCase.caseId === item.caseId)),
];
const cases = completeFormalIndex.map((formalCase) => {
  const exclusion = excludedById.get(formalCase.caseId);
  if (exclusion) return { caseId: exclusion.caseId, title: exclusion.title, status: exclusion.disposition };
  if (!currentContractCases.has(formalCase.caseId)) {
    return { caseId: formalCase.caseId, title: formalCase.title, status: 'ready' as const, reason: '正式用例既未进入当前合同，也未登记明确分类。' };
  }
  const receipt = currentReceiptByCase.get(formalCase.caseId);
  if (!receipt) return { caseId: formalCase.caseId, title: formalCase.title, status: 'ready' as const, reason: '缺少当前用例与实现指纹的标准执行收据。' };
  const assertionStatuses = receipt.item.runtimeEvidence?.assertionReceipts?.map((item) => item.status);
  const productDefect = receipt.item.failureCategory === 'product-failure'
    && receipt.item.evidence?.status === 'complete'
    ? {
        caseFingerprint: receipt.item.caseFingerprint,
        implementationFingerprint: receipt.item.implementationFingerprint,
        evidenceStatus: 'complete' as const,
        recordedAt: receipt.ledger.generatedAt,
        evidencePath: receipt.path,
      }
    : null;
  const arbitration = arbitrateCaseState({
    disposition: productDefect ? 'product-defect' : 'ready',
    currentCaseFingerprint: currentContractCases.get(formalCase.caseId)!.caseFingerprint,
    currentImplementationFingerprint: currentContractCases.get(formalCase.caseId)!.implementationFingerprint,
    implementationFingerprintRequired: true,
    receipts: [{
      caseFingerprint: receipt.item.caseFingerprint,
      implementationFingerprint: receipt.item.implementationFingerprint,
      status: receipt.item.playwrightStatus,
      evidenceStatus: receipt.item.evidence?.status as 'complete' | 'incomplete' | undefined,
      recordedAt: receipt.ledger.generatedAt,
      evidencePath: receipt.path,
      assertionStatuses,
    }],
    productDefect,
  });
  if (arbitration.status === 'passed') {
    return { caseId: formalCase.caseId, title: formalCase.title, status: 'passed' as const, receipt: receipt.path };
  }
  if (arbitration.status === 'product-defect') {
    return { caseId: formalCase.caseId, title: formalCase.title, status: 'product-defect' as const, receipt: receipt.path };
  }
  return {
    caseId: formalCase.caseId,
    title: formalCase.title,
    status: 'ready' as const,
    receipt: receipt.path,
    reason: `${arbitration.reason} 最近一次尝试分类：${receipt.item.failureCategory ?? '未形成可接受终态'}。`,
  };
});

const count = (status: string): number => cases.filter((item) => item.status === status).length;
const summary = {
  total: cases.length,
  bound: currentContractCases.size,
  executed: cases.filter((item) => ['passed', 'failed', 'product-defect'].includes(item.status)).length,
  passed: count('passed'),
  failed: count('failed'),
  ready: count('ready'),
  productDefect: count('product-defect'),
  deferred: count('deferred'),
  blockedSource: count('blocked-source'),
  blockedTechnical: count('blocked-technical'),
  notApplicable: count('not-applicable'),
};
const classified = summary.passed + summary.failed + summary.ready + summary.productDefect
  + summary.deferred + summary.blockedSource + summary.blockedTechnical + summary.notApplicable;
if (summary.total !== ledger.summary.planned || classified !== summary.total) {
  throw new Error(`调味 102 条守恒失败：planned=${ledger.summary.planned}; total=${summary.total}; classified=${classified}`);
}
// Classification is not delivery evidence. Deferred and not-applicable cases
// remain unresolved until they have a current accepted execution outcome.
const unresolved = summary.failed + summary.ready + summary.deferred + summary.notApplicable
  + summary.productDefect + summary.blockedSource + summary.blockedTechnical;
const classifiedExclusions = summary.deferred + summary.blockedSource + summary.blockedTechnical + summary.notApplicable;
const completion = evaluateDeliveryCompletion({
  total: summary.total,
  acceptedComplete: summary.passed,
  unresolved,
  classifiedExclusions,
});
const moduleDeliveryStatus = completion.deliveryComplete ? 'completed' : 'incomplete';
assertDeliveryCompletion(completion, moduleDeliveryStatus);
const zeroResidueCases = cases.filter((item) => ['passed', 'failed', 'product-defect'].includes(item.status));
const zeroResidue = zeroResidueCases.every((item) => {
  const receipt = currentReceiptByCase.get(item.caseId)?.item;
  return receipt?.evidence?.apiZeroResidue === true && receipt?.evidence?.uiZeroResidue === true;
});

fs.mkdirSync(deliverableRoot, { recursive: true });
writeJson(path.join(deliverableRoot, 'seasoning-execution-result.json'), {
  schemaVersion: '2.0.0',
  collectionId: 'system-test-execution-result',
  generatedAt: new Date().toISOString(),
  systemId,
  currentImplementationFingerprint,
  summary,
  cases,
});
writeJson(path.join(deliverableRoot, 'seasoning-module-closure.json'), {
  schemaVersion: '2.0.0',
  collectionId: 'merchant-center-seasoning-module-closure',
  generatedAt: new Date().toISOString(),
  systemId,
  moduleDeliveryStatus,
  denominator: { total: 102, SEA: 46, TPL: 25, REC: 7, XMOD: 11, POS: 13 },
  conservation: { planned: summary.total, classified, conserved: classified === summary.total },
  landing: {
    bound: summary.bound,
    classified: classifiedExclusions,
    landed: summary.bound + summary.deferred + summary.blockedSource + summary.blockedTechnical + summary.notApplicable,
    unlanded: summary.ready + summary.blockedSource,
    classifiedExclusions,
    note: '落地表示已进入绑定或结构化处置链；分类守恒只证明 102 条未丢失；classifiedExclusions 永不计入模块完成量。',
  },
  runtime: summary,
  completionGate: {
    acceptedStatuses: ['passed'],
    blockingStatuses: ['ready', 'deferred', 'not-applicable', 'failed', 'product-defect', 'blocked-source', 'blocked-technical'],
    ...completion,
  },
  cleanup: { currentExecutedCases: zeroResidueCases.length, apiAndUiZeroResidue: zeroResidue },
  platformUniversalCompletion: {
    status: 'incomplete',
    moduleDeliveryBlocked: false,
    reason: '平台跨 applicationId 正式验证与调味模块交付门禁独立。',
  },
  sources: {
    formalCases: '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-调味管理/3.商品中心-商品管理-调味管理-正式测试用例.md',
    plan: `systems/${systemId}/test-plan.json`,
    classificationLedger: `systems/${systemId}/classification-ledger.json`,
    currentContract: `output/system-test/${systemId}/reconcile-current/contract.json`,
    executionResult: 'deliverables/system-test-platform/seasoning-execution-result.json',
  },
});

function readEvidenceLedgers(rootDir: string): Array<{ ledger: EvidenceLedger; path: string }> {
  if (!fs.existsSync(rootDir)) return [];
  const results: Array<{ ledger: EvidenceLedger; path: string }> = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const evidencePath = path.join(rootDir, entry.name, 'evidence-ledger.json');
    if (!fs.existsSync(evidencePath)) continue;
    try {
      const ledgerValue = readJson<EvidenceLedger>(evidencePath);
      if (Array.isArray(ledgerValue.cases)) results.push({ ledger: ledgerValue, path: path.relative(root, evidencePath).replace(/\\/g, '/') });
    } catch {
      // Interrupted writes are not execution receipts and remain outside arbitration.
    }
  }
  return results;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}
