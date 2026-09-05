import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseProductCenterXmindItemPlan } from '../utils/product-center-canonical-item-test-plan';
import {
  buildProductCenterItemSourceCoverage,
  type ProductCenterItemCoverageBinding,
  validateProductCenterItemSourceCoverage,
} from '../utils/product-center-item-source-coverage';
import { scanGeneratedArtifacts } from '../utils/product-center-run-safety';

export function buildProductCenterItemSourceCoverageArtifacts(options: {
  projectRoot?: string;
  outputRoot?: string;
  now?: string;
  maxAgeMs?: number;
  currentReleaseProbe?: CurrentReleaseProbe;
} = {}): { reportPath: string } {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info');
  const xmindPath = path.join(
    infoRoot,
    '00-待转换测试方案',
    '用例库',
    '商品中心-商品管理-商品',
    '1.商品中心-商品管理-商品.xmind',
  );
  const prdPath = path.join(infoRoot, 'PRD与对应测试用例', '1.需求品牌商品与分类.md');
  const projectCanonicalPath = path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-canonical-release.json',
  );
  const outputCanonicalPath = path.join(
    outputRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-canonical-release.json',
  );
  const canonicalPath = fs.existsSync(outputCanonicalPath) ? outputCanonicalPath : projectCanonicalPath;
  const pageContractPath = path.join(
    projectRoot,
    'contracts/product-center/generated/modules/brand-item.json',
  );
  const currentReleaseProbePath = path.join(
    projectRoot,
    'output/page-contract/product-center-current-release-probe.json',
  );
  const bindingPath = path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-source-coverage-bindings.json',
  );
  const canonical = readJson<{ cases: Array<{ canonicalId: string }> }>(canonicalPath);
  const pageContract = readJson<{
    collections: { routes: Array<{ id: string; route: string; status: string }> };
  }>(pageContractPath);
  const currentReleaseProbe = options.currentReleaseProbe
    ?? (fs.existsSync(currentReleaseProbePath)
      ? readJson<CurrentReleaseProbe>(currentReleaseProbePath)
      : undefined);
  const nowMs = Date.parse(options.now ?? new Date().toISOString());
  const maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000;
  const bindingSource = readJson<{ bindings: ProductCenterItemCoverageBinding[] }>(bindingPath);
  const coverage = buildProductCenterItemSourceCoverage({
    plan: parseProductCenterXmindItemPlan(fs.readFileSync(xmindPath)),
    canonicalCaseIds: canonical.cases.map((item) => item.canonicalId),
    prdText: fs.readFileSync(prdPath, 'utf8'),
    pageRoutes: currentReleaseProbe
      ? currentReleaseProbe.routes.map((item) => {
        const observedAt = item.release.observedAt;
        const ageMs = nowMs - Date.parse(observedAt);
        const navigationVerified = item.capabilityIds[0] === 'navigation.sidebar.open'
          && item.navigation.targetPath === item.route
          && item.navigation.verifiedPaths.includes(item.navigation.arrivedPath);
        return {
          id: item.evidenceId ?? `current-release:${item.route}`,
          route: item.route,
          verified: navigationVerified && ageMs >= 0 && ageMs <= maxAgeMs,
          observedAt,
          releaseFingerprint: currentReleaseProbe.release.applicationFingerprint,
        };
      })
      : pageContract.collections.routes.map((item) => ({
        id: item.id,
        route: item.route,
        verified: false,
        observedAt: '',
        releaseFingerprint: '',
      })),
    bindings: bindingSource.bindings,
  });
  const validationIssues = validateProductCenterItemSourceCoverage(coverage);
  if (validationIssues.length > 0) {
    throw new Error(`商品多源覆盖校验失败：${validationIssues.join(',')}`);
  }
  const reportPath = path.join(
    outputRoot,
    'output/test-case-audit/product-center/item-source-coverage-latest.json',
  );
  const safety = {
    sensitiveFindings: 0,
    authStateArtifacts: fs.existsSync(path.join(outputRoot, 'output/auth-state.json')) ? 1 : 0,
  };
  const report = {
    ...coverage,
    generatedAt: new Date().toISOString(),
    sources: {
      xmind: sourceRecord(xmindPath),
      prd: sourceRecord(prdPath),
      pageContract: sourceRecord(pageContractPath),
      currentReleaseProbe: currentReleaseProbe
        ? {
          path: options.currentReleaseProbe ? 'injected-current-release-probe' : currentReleaseProbePath,
          fingerprint: createHash('sha256').update(JSON.stringify(currentReleaseProbe)).digest('hex'),
        }
        : { path: '', fingerprint: '' },
      bindings: sourceRecord(bindingPath),
    },
    guardrails: {
      testPlanIsScenarioSkeleton: true,
      prdMayDefineFunctionalScope: true,
      legacyRuleMayAuthorizeAcceptance: false,
      pageFactMayInferBusinessRule: false,
      automationCodeMayInferBusinessRule: false,
      gapMayGenerateBusinessExpectation: false,
      canonicalBusinessMarkdownCount: 1,
    },
    safety,
  };
  writeJson(reportPath, report);
  safety.sensitiveFindings = scanGeneratedArtifacts(path.dirname(reportPath)).length;
  if (safety.sensitiveFindings > 0 || safety.authStateArtifacts > 0) {
    throw new Error(`商品多源覆盖安全扫描未通过：${JSON.stringify(safety)}`);
  }
  writeJson(reportPath, report);
  return { reportPath };
}

type CurrentReleaseProbe = {
  release: { observedAt: string; applicationFingerprint: string };
  routes: Array<{
    evidenceId?: string;
    route: string;
    capabilityIds: string[];
    navigation: { targetPath: string; arrivedPath: string; verifiedPaths: string[] };
    release: { observedAt: string; applicationFingerprint: string };
  }>;
};

function sourceRecord(filePath: string) {
  return {
    path: filePath,
    fingerprint: createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const { reportPath } = buildProductCenterItemSourceCoverageArtifacts();
    process.stdout.write(`商品多源覆盖报告已生成：${reportPath}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
