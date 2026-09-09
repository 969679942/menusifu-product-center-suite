import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { formatOperationTransportError } from '../../api/operation-client';
import {
  buildProductCenterItemPracticeContract,
  loadProductCenterItemPracticeContractInputs,
  type ProductCenterItemPracticeContract,
} from '../../utils/product-center-item-practice-contract';
import { evaluateProductCenterItemStaticPreflight } from '../../utils/product-center-item-practice-preflight';
import { evaluateProductCenterItemPracticeCircuit } from '../../utils/product-center-item-practice-circuit';
import {
  buildProductCenterItemExpectationReceipts,
  classifyProductCenterItemResponsibility,
  evaluateProductCenterItemCleanupEvidence,
} from '../../utils/product-center-item-practice-evidence';
import {
  readProductCenterItemProgressHistory,
  writeProductCenterItemProgress,
} from '../../utils/product-center-item-progress';
import { classifyProductCenterFailure } from '../../utils/product-center-failure-classifier';

type PracticeManifest = {
  sourceRelease: { path: string; fingerprint: string; executableFingerprint: string };
  selectionPolicy: { targetSize: number; familyQuota: Record<string, number> };
  families: Record<string, string[]>;
  circuitBreaker: {
    stallMs: number;
    pollMs: number;
    maxRunMs: number;
    maxConsecutiveFailures: number;
    maxDuplicateFailureFingerprint: number;
    minimumCompletedForFailureRate: number;
    maximumEnvironmentFailureRate: number;
  };
};

type AuthoritativeRelease = {
  fingerprint: string;
  executableFingerprint: string;
  cases: Array<{
    caseId: string;
    automation: { runtimeReadiness: string };
    runtime: { status: string };
  }>;
};

type DecisionFile = {
  decisions: Array<{ caseId: string; disposition: string }>;
};

const root = path.resolve(__dirname, '../..');
const manifest = readJson<PracticeManifest>(
  'contracts/product-center/test-manifests/product-center-item-practice-batch-v1.json',
);
const release = readJson<AuthoritativeRelease>(manifest.sourceRelease.path);
const decisions = readJson<DecisionFile>(
  'contracts/product-center/reviews/product-center-item-failure-manual-decisions.json',
);

test.describe('商品实战批次合同', () => {
  test('批次应保持三类商品均衡且用例唯一', () => {
    const caseIds = Object.values(manifest.families).flat();
    expect(caseIds).toHaveLength(manifest.selectionPolicy.targetSize);
    expect(new Set(caseIds).size).toBe(caseIds.length);
    for (const [family, quota] of Object.entries(manifest.selectionPolicy.familyQuota)) {
      expect(manifest.families[family]).toHaveLength(quota);
    }
  });

  test('批次应绑定当前权威发布且不包含延期或人工兜底用例', () => {
    expect(release.fingerprint).toBe(manifest.sourceRelease.fingerprint);
    expect(release.executableFingerprint).toBe(manifest.sourceRelease.executableFingerprint);
    const releaseById = new Map(release.cases.map((item) => [item.caseId, item]));
    const acceptedObserved = new Set(
      decisions.decisions
        .filter((item) => item.disposition === 'accepted-observed')
        .map((item) => item.caseId),
    );
    for (const caseId of Object.values(manifest.families).flat()) {
      const item = releaseById.get(caseId);
      expect(item, caseId).toBeDefined();
      expect(item?.automation.runtimeReadiness, caseId).toBe('ready');
      expect(item?.runtime.status, caseId).toBe('runtime-passed');
      expect(acceptedObserved.has(caseId), caseId).toBe(false);
    }
  });

  test('生成执行器应提供独立清理预算和逐条进度心跳', () => {
    const source = fs.readFileSync(path.join(root, 'tests/generated/product-center-item-216.generated.spec.ts'), 'utf8');
    expect(source).toContain("import { writeProductCenterItemProgress } from '../../utils/product-center-item-progress';");
    expect(source).toContain("productCenterTest.describe.configure({ mode: 'parallel', timeout: 120_000 });");
    expect(source).toContain("phase: 'started'");
    expect(source).toContain("phase: testInfo.status === testInfo.expectedStatus ? 'completed' : 'failed'");
    expect(source).toContain('let cleanupCompleted = false;');
  });

  test('API 超时诊断不得持久化认证凭据', () => {
    const jwt = `eyJ${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(20)}`;
    const error = formatOperationTransportError(
      'brand-menu:POST /ops-brand/brand-items/pageQuery',
      15_000,
      new Error(`request failed\n- token: ${jwt}\n- cookie: session=secret`),
    );
    expect(error.message).toContain('token=<redacted>');
    expect(error.message).toContain('cookie=<redacted>');
    expect(error.message).not.toContain(jwt);
    expect(error.cause).toBeUndefined();
  });

  test('每条实战用例应统一绑定 caseId、ruleId 和 dataProfile', () => {
    const inputs = loadProductCenterItemPracticeContractInputs(root);
    const result = buildProductCenterItemPracticeContract({ ...inputs, rootDir: root });
    expect(result.errors).toEqual([]);
    expect(result.contract.cases).toHaveLength(24);
    expect(result.contract.summary).toMatchObject({ standard: 8, package: 8, addon: 8 });
    for (const item of result.contract.cases) {
      expect(item.ruleId).toMatch(/^CBR-ITEM-/);
      expect(item.dataProfile).toMatch(/^item-/);
      expect(item.expectationClaims.length, item.caseId).toBeGreaterThan(0);
      expect(item.formalPromotionAllowed, item.caseId).toBe(false);
      expect(item.ruleStatus, item.caseId).not.toBe('formal');
    }
  });

  test('静态预检应在浏览器启动前区分环境缺失与外部依赖', () => {
    const inputs = loadProductCenterItemPracticeContractInputs(root);
    const built = buildProductCenterItemPracticeContract({ ...inputs, rootDir: root });
    const contract = structuredClone(built.contract) as ProductCenterItemPracticeContract;
    contract.cases[0].externalCapabilities = ['terminal-sync'];
    const preflight = evaluateProductCenterItemStaticPreflight({
      contract,
      rootDir: root,
      credentials: { username: '', password: '', merchant: '', brandId: '' },
      env: {},
    });
    expect(preflight.status).toBe('blocked');
    expect(preflight.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'AUTH_CONTEXT_INCOMPLETE', category: 'environment-failure' }),
      expect.objectContaining({ code: 'EXTERNAL_CAPABILITY_MISSING', category: 'external-dependency' }),
    ]));
    expect(JSON.stringify(preflight)).not.toContain('passwordConfigured":"secret');
  });

  test('多条预期不得由单个整体通过结果伪造收据', () => {
    const inputs = loadProductCenterItemPracticeContractInputs(root);
    const built = buildProductCenterItemPracticeContract({ ...inputs, rootDir: root });
    const item = built.contract.cases.find((candidate) => candidate.expectationClaims.length >= 2)!;
    const receipts = buildProductCenterItemExpectationReceipts(item, [
      { stepId: '1', title: `${item.expectationClaims[0].claimId} expect.toBe`, passed: true },
      { stepId: '2', title: 'unrelated expect.toBe', passed: true },
    ], true);
    expect(receipts[0].status).toBe('verified');
    expect(receipts.slice(1).every((receipt) => receipt.status === 'missing')).toBe(true);
    expect(new Set(receipts.flatMap((receipt) => receipt.assertionStepId ?? [])).size).toBe(1);
  });

  test('写入用例缺少 API 或 UI 零残留时应归为自动化缺口', () => {
    const inputs = loadProductCenterItemPracticeContractInputs(root);
    const built = buildProductCenterItemPracticeContract({ ...inputs, rootDir: root });
    const item = built.contract.cases.find((candidate) => candidate.mutationMode !== 'none')!;
    const cleanup = evaluateProductCenterItemCleanupEvidence(item, {
      cleanupEvidence: {
        apiIdentityCounts: { AUTO_AUDIT_ONE: 0 },
        uiIdentityCounts: { AUTO_AUDIT_ONE: 'ui-verification-unavailable:403' },
      },
    });
    expect(cleanup.apiZeroResidue).toBe(true);
    expect(cleanup.uiZeroResidue).toBe(false);
    expect(classifyProductCenterItemResponsibility(undefined, false)).toBe('automation-gap');
    expect(classifyProductCenterItemResponsibility('product-behavior', false)).toBe('product-failure');
  });

  test('批次应按无进展、连续失败、重复失败和环境失败率熔断', () => {
    const policy = manifest.circuitBreaker;
    const startedAtMs = Date.now() - 1_000;
    const event = (caseId: string, phase: 'completed' | 'failed', offset: number, extra = {}) => ({
      runId: 'run', caseId, phase, status: phase === 'failed' ? 'failed' : 'passed',
      updatedAt: new Date(startedAtMs + offset).toISOString(), ...extra,
    });
    expect(evaluateProductCenterItemPracticeCircuit({
      events: [], policy, startedAtMs, nowMs: startedAtMs + policy.stallMs + 1,
    }).code).toBe('STALL');
    expect(evaluateProductCenterItemPracticeCircuit({
      events: [event('A', 'failed', 1), event('B', 'failed', 2), event('C', 'failed', 3)],
      policy, startedAtMs, nowMs: startedAtMs + 4,
    }).code).toBe('CONSECUTIVE_FAILURES');
    expect(evaluateProductCenterItemPracticeCircuit({
      events: [
        event('A', 'failed', 1, { diagnosticFingerprint: 'same' }),
        event('B', 'completed', 2),
        event('C', 'failed', 3, { diagnosticFingerprint: 'same' }),
      ], policy, startedAtMs, nowMs: startedAtMs + 4,
    }).code).toBe('DUPLICATE_FAILURE');
    expect(evaluateProductCenterItemPracticeCircuit({
      events: [
        event('A', 'failed', 1, { failureCategory: 'environment-auth' }),
        event('B', 'completed', 2),
        event('C', 'failed', 3, { failureCategory: 'environment-data' }),
        event('D', 'completed', 4),
      ], policy, startedAtMs, nowMs: startedAtMs + 5,
    }).code).toBe('ENVIRONMENT_FAILURE_RATE');
  });

  test('测试预算超时应归自动化缺口，网络传输超时才可归环境故障', () => {
    const testTimeout = classifyProductCenterFailure({ message: 'Test timeout of 120000ms exceeded.' });
    const transportTimeout = classifyProductCenterFailure({ message: 'connection reset after request timed out' });
    expect(testTimeout).toMatchObject({ category: 'unknown', retryable: false });
    expect(classifyProductCenterItemResponsibility(testTimeout.category, true)).toBe('automation-gap');
    expect(transportTimeout).toMatchObject({ category: 'transient-platform', retryable: true });
    expect(classifyProductCenterItemResponsibility(transportTimeout.category, true)).toBe('environment-failure');
  });

  test('逐条进度应同时保留最新状态和完整 JSONL 历史', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-item-progress-'));
    const progressPath = path.join(directory, 'latest.json');
    const historyPath = path.join(directory, 'history.jsonl');
    const oldProgress = process.env.PC_ITEM_PROGRESS_FILE;
    const oldHistory = process.env.PC_ITEM_PROGRESS_HISTORY_FILE;
    process.env.PC_ITEM_PROGRESS_FILE = progressPath;
    process.env.PC_ITEM_PROGRESS_HISTORY_FILE = historyPath;
    try {
      writeProductCenterItemProgress({ runId: 'run', caseId: 'TC-1', phase: 'started' });
      writeProductCenterItemProgress({ runId: 'run', caseId: 'TC-1', phase: 'completed', status: 'passed' });
      expect(readProductCenterItemProgressHistory(historyPath)).toHaveLength(2);
      expect(readJson<{ phase: string }>(progressPath).phase).toBe('completed');
    } finally {
      if (oldProgress === undefined) delete process.env.PC_ITEM_PROGRESS_FILE;
      else process.env.PC_ITEM_PROGRESS_FILE = oldProgress;
      if (oldHistory === undefined) delete process.env.PC_ITEM_PROGRESS_HISTORY_FILE;
      else process.env.PC_ITEM_PROGRESS_HISTORY_FILE = oldHistory;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath), 'utf8')) as T;
}
