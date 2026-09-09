import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { classifyProductCenterFailure } from './product-center-failure-classifier';
import { classifyProductCenterItemResponsibility } from './product-center-item-practice-evidence';

type RemainingBinding = {
  caseId: string;
  title: string;
  expectedResults: string[];
  assertionIds: string[];
  requiredEvidence: string[];
  handlerId: string | null;
  blockClassification: 'observed-product-drift' | 'external-dependency-blocked' | 'automation-gap' | null;
  blockEvidencePaths: string[];
  blockedReasons: string[];
  capabilityIds: string[];
};

type ReceiptStatus = 'verified' | 'observed-conflict' | 'not-executable-under-observed-contract' | 'not-evaluated-after-conflict';

export type ProductCenterGroupRemainingLedger = {
  schemaVersion: '1.0.0';
  generatedAt: string;
  summary: {
    cohortTotal: number;
    remaining: number;
    automatedClosed: number;
    productFindings: number;
    productFindingsEvidenceComplete: number;
    strictReplayRequired: number;
    industryAuthorizationRequired: number;
    terminalCapabilityRequired: number;
    automationGap: number;
  };
  cases: Array<{
    caseId: string;
    title: string;
    classification: 'automated-pass' | 'product-finding' | 'external-dependency' | 'automation-gap';
    disposition: 'automated-closed' | 'evidence-complete' | 'strict-replay-required' | 'industry-authorization-required' | 'terminal-capability-required' | 'automation-implementation-required';
    handlerId: string | null;
    capabilityIds: string[];
    reason: string;
    evidence: Array<{ path: string; sha256: string; bytes: number }>;
    observationKind: 'normal-automation-runtime' | 'case-runtime-observation' | 'shared-ui-contract-observation' | 'external-preflight' | 'missing';
    expectationReceipts: Array<{
      receiptId: string;
      assertionId: string;
      expected: string;
      observed: string;
      status: ReceiptStatus;
      evidencePaths: string[];
    }>;
    cleanupEvidenceComplete: boolean;
    productFindingEstablished: boolean;
  }>;
};

const sharedUiContractArtifacts = new Set([
  'product-center-group-combo-row-menu-audit-v2.json',
  'product-center-group-detail-audit-v4.json',
  'product-center-group-empty-items-audit-v1.json',
  'product-center-group-form-contract-v2.json',
  'product-center-group-product-selection-audit-v4.json',
]);

const automatedClosureDefinitions: Record<string, { evidencePath: string; checkpointPath: string }> = {
  'TC-GRP-ADD-005': {
    evidencePath: 'Merchant Center UITest/output/product-center-group-add005-p0-fix-v8.json',
    checkpointPath: 'output/checkpoints/AUTO_AUDIT_RUN_7b0fbc56ec79ce82.json',
  },
  'TC-GRP-SPEC-018': {
    evidencePath: 'Merchant Center UITest/output/product-center-group-remaining58-current-20260815-r8.json',
    checkpointPath: 'output/checkpoints/group/remaining58-current-20260815-r8/mutation-03/AUTO_AUDIT_RUN_cd97b3152d9bbbd7.json',
  },
  'TC-GRP-MTH-018': {
    evidencePath: 'Merchant Center UITest/output/product-center-group-impact-20260815140132.json',
    checkpointPath: 'output/checkpoints/group/impact-20260815140132/mutation-01/AUTO_AUDIT_RUN_9bd67cadc6a8cae8.json',
  },
  'TC-GRP-SPEC-023': {
    evidencePath: 'Merchant Center UITest/output/product-center-group-impact-20260815142055.json',
    checkpointPath: 'output/checkpoints/group/impact-20260815142055/mutation-01/AUTO_AUDIT_RUN_be223f5b1261c883.json',
  },
  'TC-GRP-SPEC-028': {
    evidencePath: 'Merchant Center UITest/output/product-center-group-impact-20260815142055.json',
    checkpointPath: 'output/checkpoints/group/impact-20260815142055/mutation-01/AUTO_AUDIT_RUN_9e735309b61a5139.json',
  },
  'TC-GRP-TASTE-019': {
    evidencePath: 'Merchant Center UITest/output/product-center-group-impact-20260815142055.json',
    checkpointPath: 'output/checkpoints/group/impact-20260815142055/mutation-01/AUTO_AUDIT_RUN_579bff80d344b1f2.json',
  },
};

export function buildProductCenterGroupRemainingLedger(input: {
  projectRoot: string;
  bindings: RemainingBinding[];
}): ProductCenterGroupRemainingLedger {
  const remaining = input.bindings.filter((item) => item.blockClassification !== null);
  const automatedClosed = input.bindings
    .filter((item) => item.blockClassification === null && automatedClosureDefinitions[item.caseId])
    .map((binding) => buildAutomatedClosureCase(input.projectRoot, binding));
  const cases = [...remaining.map((binding) => buildCase(input.projectRoot, binding)), ...automatedClosed];
  const count = (predicate: (item: ProductCenterGroupRemainingLedger['cases'][number]) => boolean): number => cases.filter(predicate).length;
  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    summary: {
      cohortTotal: cases.length,
      remaining: count((item) => item.classification !== 'automated-pass'),
      automatedClosed: count((item) => item.classification === 'automated-pass'),
      productFindings: count((item) => item.classification === 'product-finding'),
      productFindingsEvidenceComplete: count((item) => item.classification === 'product-finding' && item.disposition === 'evidence-complete'),
      strictReplayRequired: count((item) => item.disposition === 'strict-replay-required'),
      industryAuthorizationRequired: count((item) => item.disposition === 'industry-authorization-required'),
      terminalCapabilityRequired: count((item) => item.disposition === 'terminal-capability-required'),
      automationGap: count((item) => item.classification === 'automation-gap'),
    },
    cases: cases.sort((left, right) => left.caseId.localeCompare(right.caseId)),
  };
}

function buildAutomatedClosureCase(
  projectRoot: string,
  binding: RemainingBinding,
): ProductCenterGroupRemainingLedger['cases'][number] {
  const definition = automatedClosureDefinitions[binding.caseId];
  const runtimeArtifact = readArtifact(projectRoot, definition.evidencePath);
  const passed = runtimeArtifact
    ? collectPlaywrightResults(runtimeArtifact.value)
      .some((item) => item.title === binding.title && item.status === 'passed')
    : false;
  const checkpointPath = path.join(projectRoot, definition.checkpointPath);
  const checkpointPaths = fs.existsSync(checkpointPath) ? [checkpointPath] : [];
  const cleanupEvidenceComplete = checkpointPaths.length > 0 && checkpointPaths.every(checkpointIsResidueVerified);
  if (!passed || !runtimeArtifact || !cleanupEvidenceComplete) {
    throw new Error(`${binding.caseId} 不满足自动化关闭条件：passed=${passed} runtime=${Boolean(runtimeArtifact)} cleanup=${cleanupEvidenceComplete}`);
  }
  const checkpointArtifacts = checkpointPaths
    .map((absolutePath) => readArtifact(projectRoot, path.relative(path.resolve(projectRoot, '..'), absolutePath)))
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const evidence = [runtimeArtifact, ...checkpointArtifacts];
  return {
    caseId: binding.caseId,
    title: binding.title,
    classification: 'automated-pass',
    disposition: 'automated-closed',
    handlerId: binding.handlerId,
    capabilityIds: binding.capabilityIds,
    reason: '历史产品偏差经脚本修复后已在正常自动化通道通过，且 API/UI 清理检查点均为 residue-verified。',
    evidence: evidence.map((item) => ({ path: item.relativePath, sha256: item.sha256, bytes: item.bytes })),
    observationKind: 'normal-automation-runtime',
    expectationReceipts: binding.assertionIds.map((assertionId, index) => ({
      receiptId: sha256(`${binding.caseId}:${assertionId}:${evidence.map((item) => item.sha256).join(':')}`),
      assertionId,
      expected: binding.expectedResults[index] ?? '',
      observed: `正常自动化运行已验证预期 ${index + 1}，运行证据与零残留检查点已固化。`,
      status: 'verified',
      evidencePaths: evidence.map((item) => item.relativePath),
    })),
    cleanupEvidenceComplete: true,
    productFindingEstablished: false,
  };
}

function buildCase(projectRoot: string, binding: RemainingBinding): ProductCenterGroupRemainingLedger['cases'][number] {
  const reason = binding.blockedReasons[0] ?? '未记录原因';
  if (binding.blockClassification === 'external-dependency-blocked') {
    const industry = /行业商品|继承/.test(`${binding.title} ${reason}`);
    return {
      caseId: binding.caseId,
      title: binding.title,
      classification: 'external-dependency',
      disposition: industry ? 'industry-authorization-required' : 'terminal-capability-required',
      handlerId: binding.handlerId,
      capabilityIds: binding.capabilityIds,
      reason,
      evidence: [],
      observationKind: 'external-preflight',
      expectationReceipts: binding.assertionIds.map((assertionId, index) => ({
        receiptId: sha256(`${binding.caseId}:${assertionId}:external-preflight`),
        assertionId,
        expected: binding.expectedResults[index] ?? '',
        observed: industry
          ? '行业商品服务地址可达，但当前品牌认证上下文访问行业 health 与分类接口均返回 HTTP 403；禁止发送创建请求。'
          : '仓库与环境均未配置可控 POS/C 端驱动，品牌或门店商品 API 不能替代终端点餐观测。',
        status: 'not-evaluated-after-conflict',
        evidencePaths: [],
      })),
      cleanupEvidenceComplete: true,
      productFindingEstablished: false,
    };
  }
  if (binding.blockClassification !== 'observed-product-drift') {
    return {
      caseId: binding.caseId,
      title: binding.title,
      classification: 'automation-gap',
      disposition: 'automation-implementation-required',
      handlerId: binding.handlerId,
      capabilityIds: binding.capabilityIds,
      reason,
      evidence: [],
      observationKind: 'missing',
      expectationReceipts: [],
      cleanupEvidenceComplete: false,
      productFindingEstablished: false,
    };
  }

  const replay = readFindingReplay(projectRoot, binding);
  const contractReplay = readSharedContractReplay(projectRoot, binding);
  const acceptedReplay = replay?.productFailure === true && replay.cleanupComplete === true;
  const evidencePaths = [
    ...binding.blockEvidencePaths,
    ...(acceptedReplay ? [replay.evidencePath] : []),
    ...(contractReplay?.accepted ? [contractReplay.evidencePath] : []),
  ];
  const artifacts = evidencePaths.map((relativePath) => readArtifact(projectRoot, relativePath));
  const validArtifacts = artifacts.filter((item): item is NonNullable<typeof item> => item !== null);
  const caseSpecific = acceptedReplay
    || validArtifacts.some((artifact) => artifact.serialized.includes(binding.caseId));
  const sharedContract = contractReplay?.accepted === true
    || validArtifacts.some((artifact) => sharedUiContractArtifacts.has(path.basename(artifact.absolutePath)));
  const observationKind = caseSpecific
    ? 'case-runtime-observation'
    : sharedContract
      ? 'shared-ui-contract-observation'
      : 'missing';
  const cleanupRequired = binding.requiredEvidence.includes('cleanup');
  const cleanupEvidenceComplete = !cleanupRequired
    || acceptedReplay
    || contractReplay?.cleanupComplete === true
    || validArtifacts.some((artifact) => hasZeroResidueEvidence(artifact.value));
  const firstStatus: ReceiptStatus = sharedContract
    ? 'not-executable-under-observed-contract'
    : 'observed-conflict';
  const expectationReceipts = binding.assertionIds.map((assertionId, index) => ({
    receiptId: sha256(`${binding.caseId}:${assertionId}:${validArtifacts.map((item) => item.sha256).join(':')}`),
    assertionId,
    expected: binding.expectedResults[index] ?? '',
    observed: reason,
    status: (sharedContract || index === 0 ? firstStatus : 'not-evaluated-after-conflict') as ReceiptStatus,
    evidencePaths,
  }));
  const productFindingEstablished = observationKind !== 'missing' && expectationReceipts.length > 0;
  const evidenceComplete = productFindingEstablished && cleanupEvidenceComplete && validArtifacts.length === evidencePaths.length;
  return {
    caseId: binding.caseId,
    title: binding.title,
    classification: 'product-finding',
    disposition: evidenceComplete ? 'evidence-complete' : 'strict-replay-required',
    handlerId: binding.handlerId,
    capabilityIds: binding.capabilityIds,
    reason,
    evidence: validArtifacts.map((item) => ({ path: item.relativePath, sha256: item.sha256, bytes: item.bytes })),
    observationKind,
    expectationReceipts,
    cleanupEvidenceComplete,
    productFindingEstablished,
  };
}

function readFindingReplay(projectRoot: string, binding: RemainingBinding): {
  productFailure: boolean;
  cleanupComplete: boolean;
  evidencePath: string;
} | null {
  const definitions = [
    {
      evidencePath: 'Merchant Center UITest/output/product-center-group-finding-replay-current.json',
      checkpointRoot: 'output/product-center-group-finding-replay-checkpoints-current',
    },
    {
      evidencePath: 'Merchant Center UITest/output/product-center-group-finding-replay-add022-r2.json',
      checkpointRoot: 'output/product-center-group-finding-replay-checkpoints-add022-r2',
    },
    {
      evidencePath: 'Merchant Center UITest/output/product-center-group-finding-replay-delete-r3.json',
      checkpointRoot: 'output/product-center-group-finding-replay-checkpoints-delete-r3',
    },
  ];
  const observations = definitions.flatMap((definition) => {
    const artifact = readArtifact(projectRoot, definition.evidencePath);
    if (!artifact) return [];
    const result = collectPlaywrightResults(artifact.value)
      .filter((item) => item.title === binding.title && item.status === 'failed')
      .at(-1);
    if (!result?.message) return [];
    const preliminary = classifyProductCenterFailure({ message: result.message });
    const classification = preliminary.category === 'unknown'
      ? classifyProductCenterFailure({ message: result.message, assertion: true })
      : preliminary;
    const responsibility = classifyProductCenterItemResponsibility(classification.category, true);
    const checkpointRoot = path.join(projectRoot, definition.checkpointRoot);
    const checkpoint = fs.existsSync(checkpointRoot)
      ? fs.readdirSync(checkpointRoot)
        .filter((name) => name.endsWith(`_${binding.caseId}.json`))
        .map((name) => path.join(checkpointRoot, name))
        .at(-1)
      : undefined;
    return [{
      productFailure: responsibility === 'product-failure',
      cleanupComplete: checkpoint ? checkpointIsResidueVerified(checkpoint) : false,
      evidencePath: definition.evidencePath,
    }];
  });
  return observations.slice().reverse().find((item) => item.productFailure && item.cleanupComplete)
    ?? observations.at(-1)
    ?? null;
}

function readSharedContractReplay(projectRoot: string, binding: RemainingBinding): {
  accepted: boolean;
  cleanupComplete: boolean;
  evidencePath: string;
} | null {
  if (!binding.blockEvidencePaths.some((item) => path.basename(item) === 'product-center-group-combo-row-menu-audit-v2.json')) {
    return null;
  }
  const evidencePath = 'Merchant Center UITest/output/product-center-group-combo-menu-current-20260815.json';
  const artifact = readArtifact(projectRoot, evidencePath);
  if (!artifact) return null;
  const auditPassed = collectPlaywrightResults(artifact.value)
    .some((item) => item.title === '套餐组行操作菜单合同' && item.status === 'passed');
  const checkpointRoot = path.join(projectRoot, 'output/product-center-group-findings-checkpoints-20260815-r2');
  const checkpointFiles = fs.existsSync(checkpointRoot)
    ? fs.readdirSync(checkpointRoot).filter((name) => name.endsWith('.json')).map((name) => path.join(checkpointRoot, name))
    : [];
  const cleanupComplete = checkpointFiles.length > 0 && checkpointFiles.every(checkpointIsResidueVerified);
  return { accepted: auditPassed && cleanupComplete, cleanupComplete, evidencePath };
}

function collectPlaywrightResults(value: unknown): Array<{ title: string; status: string; message: string }> {
  const output: Array<{ title: string; status: string; message: string }> = [];
  const visit = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return;
    const record = candidate as Record<string, unknown>;
    if (typeof record.title === 'string' && Array.isArray(record.tests)) {
      for (const test of record.tests) {
        if (!test || typeof test !== 'object') continue;
        const results = (test as Record<string, unknown>).results;
        if (!Array.isArray(results)) continue;
        for (const result of results) {
          if (!result || typeof result !== 'object') continue;
          const resultRecord = result as Record<string, unknown>;
          const errors = Array.isArray(resultRecord.errors) ? resultRecord.errors : [];
          const firstError = errors[0] && typeof errors[0] === 'object' ? errors[0] as Record<string, unknown> : {};
          output.push({
            title: record.title,
            status: String(resultRecord.status ?? ''),
            message: String(firstError.message ?? ''),
          });
        }
      }
    }
    for (const nested of Object.values(record)) {
      if (Array.isArray(nested)) nested.forEach(visit);
    }
  };
  visit(value);
  return output;
}

function checkpointIsResidueVerified(filePath: string): boolean {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { entries?: Array<{ phase?: string }> };
    return Boolean(value.entries?.length && value.entries.every((entry) => entry.phase === 'residue-verified'));
  } catch {
    return false;
  }
}

function readArtifact(projectRoot: string, relativePath: string): {
  relativePath: string;
  absolutePath: string;
  value: unknown;
  serialized: string;
  sha256: string;
  bytes: number;
} | null {
  const workspaceRoot = path.resolve(projectRoot, '..');
  const absolutePath = path.resolve(workspaceRoot, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  const serialized = fs.readFileSync(absolutePath, 'utf8');
  try {
    return {
      relativePath,
      absolutePath,
      value: JSON.parse(serialized),
      serialized,
      sha256: sha256(serialized),
      bytes: Buffer.byteLength(serialized),
    };
  } catch {
    return null;
  }
}

function hasZeroResidueEvidence(value: unknown, depth = 0): boolean {
  if (depth > 12 || value === null || value === undefined) return false;
  if (typeof value === 'string') return /(?:API\/UI|api.*ui).*(?:零残留|zero)|residue-verified/i.test(value);
  if (Array.isArray(value)) return value.some((item) => hasZeroResidueEvidence(item, depth + 1));
  if (typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const residueEntries = Object.entries(record).filter(([key]) => /residue/i.test(key));
  if (residueEntries.length > 0 && residueEntries.every(([, candidate]) => candidate === 0 || candidate === '0')) return true;
  if (record.cleanup && hasZeroResidueEvidence(record.cleanup, depth + 1)) return true;
  return Object.values(record).some((item) => hasZeroResidueEvidence(item, depth + 1));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
