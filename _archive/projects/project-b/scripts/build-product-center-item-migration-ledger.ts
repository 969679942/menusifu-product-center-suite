import fs from 'node:fs';
import path from 'node:path';

export type ProductCenterItemMigrationStatus =
  | 'strict-passed'
  | 'product-finding'
  | 'legacy-passed'
  | 'deferred'
  | 'not-applicable'
  | 'supplemental-reviewed'
  | 'unresolved';

type ReleaseCase = {
  caseId: string;
  title: string;
  priority: string;
  scope: string;
  automation: { bound: boolean; runtimeReadiness: string; blockingReasons?: string[] };
  runtime: { status: string; evidenceRefs?: string[] };
};

type Release = {
  releaseFingerprint?: string;
  executableFingerprint?: string;
  fingerprint?: string;
  executableCases?: number;
  summary?: { formalCases?: number; executableCases?: number };
  cases: ReleaseCase[];
};

type StrictCaseEvidence = {
  caseId: string;
  status: string;
  evidenceComplete: boolean;
  cleanupReceipt?: { apiZeroResidue?: boolean; uiZeroResidue?: boolean };
  expectationReceipts?: Array<{ status: string }>;
};

type EvidenceLedger = {
  contractFingerprint: string;
  runStatus: string;
  summary: {
    selected: number;
    executed: number;
    passed: number;
    failed: number;
    evidenceComplete: number;
    evidenceIncomplete: number;
  };
  cases: StrictCaseEvidence[];
};

type PracticeContract = {
  source: { releaseFingerprint: string; executableFingerprint: string };
};

export type ProductCenterItemMigrationLedger = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-migration-ledger';
  generatedAt: string;
  source: {
    releasePath: string;
    releaseFingerprint: string;
    executableFingerprint: string;
  };
  policy: {
    strictEvidenceRequires: string[];
    legacyRuntimeEvidenceIsNotStrict: true;
    deferredCasesAreExcluded: true;
  };
  summary: {
    formalCases: number;
    executableCases: number;
    strictPassed: number;
    productFinding: number;
    legacyPassed: number;
    deferred: number;
    notApplicable: number;
    supplementalReviewed: number;
    unresolved: number;
    strictRevalidationRemaining: number;
  };
  cases: Array<{
    caseId: string;
    title: string;
    family: 'standard' | 'package' | 'addon' | 'other';
    priority: string;
    sourceRuntimeStatus: string;
    runtimeReadiness: string;
    automationBound: boolean;
    status: ProductCenterItemMigrationStatus;
    blockingReasons: string[];
    latestStrictEvidence?: { runId: string; ledgerPath: string };
    latestProductFinding?: { runId: string; ledgerPath: string };
  }>;
};

export function buildProductCenterItemMigrationLedger(rootDir = path.resolve(__dirname, '..')): ProductCenterItemMigrationLedger {
  const releasePath = path.resolve(rootDir, '..', 'deliverables/product-center-item/final-status.json');
  const release = readJson<{ releaseFingerprint?: string; executableFingerprint?: string; summary?: { formalCases?: number; executableCases?: number }; cases: ReleaseCase[] }>(releasePath);
  const authoritativePath = path.resolve(rootDir, 'contracts/product-center/test-cases/canonical/product-center-item-authoritative-release.json');
  const authoritative = readJson<Release>(authoritativePath);
  const currentReleaseFingerprint = authoritative.fingerprint ?? release.releaseFingerprint ?? '';
  const currentExecutableFingerprint = authoritative.executableFingerprint ?? release.executableFingerprint ?? '';
  const strictEvidence = collectStrictEvidence(rootDir, currentReleaseFingerprint, currentExecutableFingerprint);
  const productFindings = collectProductFindings(rootDir, currentReleaseFingerprint, currentExecutableFingerprint);
  const cases = release.cases.map((item) => {
    const strict = strictEvidence.byCaseId.get(item.caseId);
    const finding = productFindings.byCaseId.get(item.caseId);
    const status: ProductCenterItemMigrationStatus = strict
      ? 'strict-passed'
      : finding
        ? 'product-finding'
      : item.scope === 'supplemental'
        ? 'supplemental-reviewed'
      : item.scope !== 'executable'
        ? 'not-applicable'
        : item.runtime.status === 'deferred'
          ? 'deferred'
          : item.runtime.status === 'runtime-passed'
            ? 'legacy-passed'
            : 'unresolved';
    return {
      caseId: item.caseId,
      title: item.title,
      family: familyOf(item.caseId),
      priority: item.priority,
      sourceRuntimeStatus: item.runtime.status,
      runtimeReadiness: item.automation.runtimeReadiness,
      automationBound: item.automation.bound,
      status,
      blockingReasons: item.automation.blockingReasons ?? [],
      ...(strict ? { latestStrictEvidence: strict } : {}),
      ...(finding ? { latestProductFinding: finding } : {}),
    };
  });
  const count = (status: ProductCenterItemMigrationStatus) => cases.filter((item) => item.status === status).length;
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-migration-ledger',
    generatedAt: new Date().toISOString(),
    source: {
      releasePath: path.relative(rootDir, releasePath).replaceAll(path.sep, '/'),
      releaseFingerprint: currentReleaseFingerprint,
      executableFingerprint: currentExecutableFingerprint,
    },
    policy: {
      strictEvidenceRequires: [
        '当前权威发布指纹匹配',
        '单条用例 status passed 且拥有完整运行证据',
        '每条用例均有独立 expectation receipt',
        'API/UI 零残留',
        '批次未被 blocked/circuit-broken 且无安全或未完成检查点',
      ],
      legacyRuntimeEvidenceIsNotStrict: true,
      deferredCasesAreExcluded: true,
    },
    summary: {
      formalCases: release.summary?.formalCases ?? 0,
      executableCases: release.summary?.executableCases ?? cases.filter((item) => item.status !== 'not-applicable').length,
      strictPassed: count('strict-passed'),
      productFinding: count('product-finding'),
      legacyPassed: count('legacy-passed'),
      deferred: count('deferred'),
      notApplicable: count('not-applicable'),
      supplementalReviewed: count('supplemental-reviewed'),
      unresolved: count('unresolved'),
      strictRevalidationRemaining: count('legacy-passed'),
    },
    cases: cases.sort((left, right) => left.caseId.localeCompare(right.caseId)),
  };
}

function collectStrictEvidence(rootDir: string, releaseFingerprint: string, executableFingerprint: string): {
  byCaseId: Map<string, { runId: string; ledgerPath: string }>;
} {
  const outputRoot = path.join(rootDir, 'output/product-center-item-practice');
  const byCaseId = new Map<string, { runId: string; ledgerPath: string }>();
  if (!fs.existsSync(outputRoot)) return { byCaseId };
  const runs = fs.readdirSync(outputRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const runId of runs) {
    const runRoot = path.join(outputRoot, runId);
    const report = readJsonOptional<{
      status: string;
      exitCode: number;
      securityFindings?: number;
      incompleteCheckpoints?: number;
    }>(path.join(runRoot, 'run-report.json'));
    const ledger = readJsonOptional<EvidenceLedger>(path.join(runRoot, 'evidence-ledger.json'));
    const contract = readJsonOptional<PracticeContract>(path.join(runRoot, 'contract.json'));
    if (!report || !ledger || !contract) continue;
    if (!['passed', 'failed'].includes(report.status)
      || report.securityFindings !== 0
      || report.incompleteCheckpoints !== 0
      || !['passed', 'failed'].includes(ledger.runStatus)) continue;
    if (ledger.summary.selected !== ledger.summary.executed) continue;
    if (contract.source.releaseFingerprint !== releaseFingerprint || contract.source.executableFingerprint !== executableFingerprint) continue;
    for (const item of ledger.cases) {
      if (item.status !== 'passed' || !item.evidenceComplete) continue;
      if (!item.expectationReceipts?.length || item.expectationReceipts.some((receipt) => receipt.status !== 'verified')) continue;
      if (!item.cleanupReceipt?.apiZeroResidue || !item.cleanupReceipt.uiZeroResidue) continue;
      byCaseId.set(item.caseId, {
        runId,
        ledgerPath: path.relative(rootDir, path.join(runRoot, 'evidence-ledger.json')).replaceAll(path.sep, '/'),
      });
    }
  }
  return { byCaseId };
}

function collectProductFindings(rootDir: string, releaseFingerprint: string, executableFingerprint: string): {
  byCaseId: Map<string, { runId: string; ledgerPath: string }>;
} {
  const outputRoot = path.join(rootDir, 'output/product-center-item-practice');
  const byCaseId = new Map<string, { runId: string; ledgerPath: string }>();
  if (!fs.existsSync(outputRoot)) return { byCaseId };
  const runs = fs.readdirSync(outputRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const runId of runs) {
    const runRoot = path.join(outputRoot, runId);
    const report = readJsonOptional<{
      status: string;
      securityFindings?: number;
      incompleteCheckpoints?: number;
    }>(path.join(runRoot, 'run-report.json'));
    const ledger = readJsonOptional<{
      cases: Array<{
        caseId: string;
        responsibility?: string;
        runtimeEvidencePresent?: boolean;
        cleanupReceipt?: { apiZeroResidue?: boolean; uiZeroResidue?: boolean };
      }>;
    }>(path.join(runRoot, 'evidence-ledger.json'));
    const contract = readJsonOptional<PracticeContract>(path.join(runRoot, 'contract.json'));
    if (!report || !ledger || !contract
      || !['passed', 'failed'].includes(report.status)
      || report.securityFindings !== 0
      || report.incompleteCheckpoints !== 0
      || contract.source.releaseFingerprint !== releaseFingerprint
      || contract.source.executableFingerprint !== executableFingerprint) continue;
    for (const item of ledger.cases) {
      if (item.responsibility !== 'product-failure'
        || item.runtimeEvidencePresent !== true
        || item.cleanupReceipt?.apiZeroResidue !== true
        || item.cleanupReceipt?.uiZeroResidue !== true) continue;
      byCaseId.set(item.caseId, {
        runId,
        ledgerPath: path.relative(rootDir, path.join(runRoot, 'evidence-ledger.json')).replaceAll(path.sep, '/'),
      });
    }
  }
  return { byCaseId };
}

function familyOf(caseId: string): 'standard' | 'package' | 'addon' | 'other' {
  if (caseId.startsWith('TC-ITEM-STD-')) return 'standard';
  if (caseId.startsWith('TC-ITEM-PKG-')) return 'package';
  if (caseId.startsWith('TC-ITEM-ADD-')) return 'addon';
  return 'other';
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function readJsonOptional<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  try { return readJson<T>(filePath); } catch { return undefined; }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function toMarkdown(ledger: ProductCenterItemMigrationLedger): string {
  return [
    '# 商品管理唯一迁移台账',
    '',
    `生成时间：${ledger.generatedAt}`,
    '',
    `- 正式分母：${ledger.summary.formalCases}`,
    `- 可执行分母：${ledger.summary.executableCases}`,
    `- 当前严格证据通过：${ledger.summary.strictPassed}`,
    `- 已确认产品偏差（不重复自动重跑）：${ledger.summary.productFinding}`,
    `- 仅有历史通过证据：${ledger.summary.legacyPassed}`,
    `- 延期/外部能力阻断：${ledger.summary.deferred}`,
    `- 补充观察（不进入执行分母）：${ledger.summary.supplementalReviewed}`,
    `- 未解析：${ledger.summary.unresolved}`,
    `- 严格重验证剩余：${ledger.summary.strictRevalidationRemaining}`,
    '',
    '状态定义：历史运行通过不等于严格证据通过；严格通过必须同时满足当前指纹、独立预期收据和 API/UI 零残留。',
    '',
  ].join('\n');
}

if (require.main === module) {
  const rootDir = path.resolve(__dirname, '..');
  const ledger = buildProductCenterItemMigrationLedger(rootDir);
  const jsonPath = path.resolve(rootDir, '..', 'deliverables/product-center-item/migration-ledger.json');
  const markdownPath = path.resolve(rootDir, '..', 'deliverables/product-center-item/migration-ledger.md');
  writeJson(jsonPath, ledger);
  fs.writeFileSync(markdownPath, toMarkdown(ledger), 'utf8');
  process.stdout.write(`商品迁移台账：${jsonPath}\n`);
  process.stdout.write(`严格重验证剩余：${ledger.summary.strictRevalidationRemaining}\n`);
}
