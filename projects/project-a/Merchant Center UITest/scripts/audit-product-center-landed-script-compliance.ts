import fs from 'node:fs';
import path from 'node:path';

type AssetCase = {
  caseId: string;
  title: string;
  module: string;
  canonicalPath: string;
  status: string;
  scriptPath: string;
  runnerId: string;
};

type AssetIndex = { cases: AssetCase[]; summary?: { landed?: number } };
type Binding = Record<string, unknown> & { caseId?: unknown };
type Finding = { code: string; severity: 'error' | 'warning'; message: string };
type CaseAudit = {
  caseId: string;
  module: string;
  scriptPath: string;
  checks: Record<string, boolean>;
  findings: Finding[];
};

type AuditReport = {
  schemaVersion: '1.0.0';
  auditId: 'product-center-landed-script-static-compliance';
  generatedAt: string;
  scope: { expected: number; actual: number; status: 'matched' | 'mismatch' };
  summary: {
    cases: number;
    passed: number;
    warningCases: number;
    errorCases: number;
    findings: number;
    status: 'passed' | 'passed-with-warnings' | 'blocked';
  };
  sources: Record<string, string>;
  cases: CaseAudit[];
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const assetRoot = path.join(workspaceRoot, 'Merchant Center Info', '00-待转换测试方案');
const outputPath = path.resolve(
  projectRoot,
  process.argv.find((argument) => argument.startsWith('--output='))?.slice('--output='.length)
    ?? 'deliverables/system-test-platform/product-center-landed-script-static-audit.json',
);

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function readCaseIds(relativePath: string, collection: string): Set<string> {
  const document = readJson<Record<string, unknown>>(path.join(projectRoot, relativePath));
  const values = Array.isArray(document[collection]) ? document[collection] : [];
  return new Set(values
    .map((value) => value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).caseId : undefined)
    .filter((value): value is string => typeof value === 'string'));
}

function sourceCaseIds(relativePath: string): Set<string> {
  const source = readSource(relativePath);
  const ids = new Set<string>();
  for (const match of source.matchAll(/"caseId"\s*:\s*"([^"]+)"/g)) ids.add(match[1]);
  return ids;
}

function canonicalFile(canonicalPath: string): string {
  return canonicalPath.split('#', 1)[0].replaceAll('/', path.sep);
}

function addFinding(findings: Finding[], code: string, message: string, severity: Finding['severity'] = 'error'): void {
  findings.push({ code, message, severity });
}

function requiredPatterns(module: string): string[] {
  if (module === 'item') return [
    'productCenterTest',
    'consumeExecutableOperationReceipts',
    'fingerprintProductCenterItemImplementation',
  ];
  if (module === 'group') return [
    'evaluateGroupEvidence',
    'consumeExecutableOperationReceipts',
    'bindingFingerprint',
  ];
  if (module === 'seasoning') return [
    'executeSystemTestRecipe',
    'consumeExecutableOperationReceipts',
    'createSeasoningSystemTestStepReporter',
  ];
  return ['consumeExecutableOperationReceipts', 'fingerprintReceiptEvidence'];
}

function ownerData(module: string): { ids: Set<string>; relativePath: string; collection: string } {
  if (module === 'item') {
    return {
      ids: sourceCaseIds('tests/generated/product-center-item-216.generated.spec.ts'),
      relativePath: 'tests/generated/product-center-item-216.generated.spec.ts',
      collection: 'formal case inventory',
    };
  }
  if (module === 'group') {
    return {
      ids: readCaseIds('contracts/product-center/group/product-center-group-bindings.json', 'cases'),
      relativePath: 'tests/generated/product-center-group.generated.spec.ts',
      collection: 'group bindings',
    };
  }
  if (module === 'seasoning') {
    return {
      ids: readCaseIds('systems/merchant-center-product-center-seasoning/binding-registry.json', 'bindings'),
      relativePath: 'systems/merchant-center-product-center-seasoning/tests/system.spec.ts',
      collection: 'seasoning bindings',
    };
  }
  return {
    ids: readCaseIds('contracts/product-center/test-cases/canonical/product-center-legacy-remaining-automation-bindings.json', 'bindings'),
    relativePath: 'tests/generated/product-center-legacy-remaining.generated.spec.ts',
    collection: 'legacy bindings',
  };
}

function moduleSourceId(module: string): string {
  if (module === 'item') return '用例库/商品中心-商品管理-商品';
  if (module === 'group') return '用例库/商品中心-商品管理-组';
  if (module === 'seasoning') return '用例库/商品中心-商品管理-调味管理';
  return '用例库/商品中心-商品管理-商品';
}

function auditCase(item: AssetCase, scripts: Map<string, string>, ownerCache: Map<string, ReturnType<typeof ownerData>>): CaseAudit {
  const findings: Finding[] = [];
  const checks: Record<string, boolean> = {};
  const sourceRelativePath = canonicalFile(item.canonicalPath);
  const sourcePath = path.join(workspaceRoot, sourceRelativePath);
  checks.canonicalFileExists = fs.existsSync(sourcePath);
  if (!checks.canonicalFileExists) addFinding(findings, 'CANONICAL_SOURCE_MISSING', `正式来源文件不存在：${sourceRelativePath}`);
  else {
    const canonicalSource = fs.readFileSync(sourcePath, 'utf8');
    checks.canonicalCasePresent = canonicalSource.includes(item.caseId);
    if (!checks.canonicalCasePresent) addFinding(findings, 'CANONICAL_CASE_MISSING', `正式来源文件未找到 ${item.caseId}`);
  }

  const script = scripts.get(item.scriptPath);
  checks.scriptExists = script !== undefined;
  if (!checks.scriptExists) addFinding(findings, 'OWNING_SCRIPT_MISSING', `归属脚本不存在：${item.scriptPath}`);
  if (script !== undefined) {
    checks.chineseReportContract = /[\u3400-\u9fff]/u.test(script)
      && /\b[A-Za-z_$][\w$]*\.describe(?:\.configure)?\s*\(/u.test(script);
    if (!checks.chineseReportContract) addFinding(findings, 'REPORT_STEP_CONTRACT_MISSING', '归属脚本缺少中文报告合同入口。');
    checks.noHardWait = !script.includes('waitForTimeout');
    if (!checks.noHardWait) addFinding(findings, 'FORBIDDEN_HARD_WAIT', '归属脚本包含 waitForTimeout。');
    checks.noLocatorGuessing = !script.includes('.or(') && !script.includes('xpath');
    if (!checks.noLocatorGuessing) addFinding(findings, 'FORBIDDEN_LOCATOR_GUESSING', '归属脚本包含 locator fallback 或 XPath。');
    for (const pattern of requiredPatterns(item.module)) {
      checks[`contract:${pattern}`] = script.includes(pattern);
      if (!checks[`contract:${pattern}`]) addFinding(findings, 'REPORT_OR_RECEIPT_CONTRACT_MISSING', `归属脚本缺少 ${pattern}。`);
    }
  }

  const owner = ownerCache.get(item.module) ?? ownerData(item.module);
  ownerCache.set(item.module, owner);
  checks.ownerRegistryContainsCase = owner.ids.has(item.caseId);
  if (!checks.ownerRegistryContainsCase) addFinding(findings, 'OWNER_REGISTRY_MISSING', `${owner.collection} 未登记 ${item.caseId}`);

  checks.moduleSourceExists = fs.existsSync(path.join(assetRoot, moduleSourceId(item.module)));
  if (!checks.moduleSourceExists) addFinding(findings, 'MODULE_SOURCE_ROOT_MISSING', `模块来源目录不存在：${moduleSourceId(item.module)}`);

  if (item.status !== 'landed') addFinding(findings, 'INDEX_STATUS_NOT_LANDED', `权威索引状态为 ${item.status}，不应进入 421 条已落地范围。`);
  if (!item.scriptPath || !item.runnerId) addFinding(findings, 'INDEX_BINDING_METADATA_INCOMPLETE', '权威索引缺少脚本归属或 runnerId。');

  return { caseId: item.caseId, module: item.module, scriptPath: item.scriptPath, checks, findings };
}

function main(): void {
  const indexPath = path.join(assetRoot, '已完成', 'index.json');
  const index = readJson<AssetIndex>(indexPath);
  const ids = index.cases.map((item) => item.caseId);
  const duplicateIds = ids.filter((caseId, indexPosition) => ids.indexOf(caseId) !== indexPosition);
  const scripts = new Map<string, string>();
  for (const scriptPath of new Set(index.cases.map((item) => item.scriptPath))) {
    const absolutePath = path.join(workspaceRoot, scriptPath);
    if (fs.existsSync(absolutePath)) scripts.set(scriptPath, fs.readFileSync(absolutePath, 'utf8'));
  }
  const ownerCache = new Map<string, ReturnType<typeof ownerData>>();
  const cases = index.cases.map((item) => auditCase(item, scripts, ownerCache));
  if (duplicateIds.length > 0) {
    for (const caseId of [...new Set(duplicateIds)]) {
      const match = cases.find((item) => item.caseId === caseId);
      match?.findings.push({ code: 'DUPLICATE_CASE_ID', severity: 'error', message: `权威索引重复 caseId：${caseId}` });
    }
  }
  const errorCases = cases.filter((item) => item.findings.some((finding) => finding.severity === 'error'));
  const warningCases = cases.filter((item) => item.findings.some((finding) => finding.severity === 'warning'));
  const expectedCaseCount = index.summary?.landed ?? index.cases.length;
  const scopeMatches = index.cases.length === expectedCaseCount;
  const report: AuditReport = {
    schemaVersion: '1.0.0',
    auditId: 'product-center-landed-script-static-compliance',
    generatedAt: new Date().toISOString(),
      scope: { expected: expectedCaseCount, actual: index.cases.length, status: scopeMatches ? 'matched' : 'mismatch' },
    summary: {
      cases: cases.length,
      passed: cases.length - errorCases.length - warningCases.length,
      warningCases: warningCases.length,
      errorCases: errorCases.length,
      findings: cases.reduce((total, item) => total + item.findings.length, 0),
      status: errorCases.length > 0 || !scopeMatches
        ? 'blocked'
        : warningCases.length > 0 ? 'passed-with-warnings' : 'passed',
    },
    sources: {
      completedIndex: path.relative(projectRoot, indexPath).replaceAll('\\', '/'),
      canonicalRoot: path.relative(projectRoot, assetRoot).replaceAll('\\', '/'),
      publicRules: '../../Test Automation Platform/AGENTS.md',
    },
    cases,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`商品中心脚本静态合规审计：${outputPath}\n范围：${report.scope.actual}/${report.scope.expected}\n状态：${report.summary.status}\n错误：${report.summary.errorCases}；警告：${report.summary.warningCases}\n`);
  if (report.summary.status === 'blocked') process.exitCode = 1;
}

main();
