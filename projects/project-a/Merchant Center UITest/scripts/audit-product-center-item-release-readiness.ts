import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { qualifyProductCenterItemReleaseReceipts, ITEM_CURRENT_RECEIPT_CONTRACT_PATH, isProductCenterItemReleaseReceiptManifest } from '../adapters/product-center/product-center-item-release-receipts';
import { productCenterItemImplementationCheckpointInputs } from '../adapters/product-center/product-center-item-implementation';
import { readJsonEvidence } from '../utils/json-evidence';
import { publishImmutableArtifact } from '../utils/immutable-artifact';
import { parseProductCenterItemCaseSemanticFingerprints } from '../utils/product-center-item-case-semantic-fingerprint';
import { parseProductCenterItemAssertionSurfaces } from '../utils/product-center-item-assertion-surfaces';
import { loadProductCenterExecutionDecisions } from '../utils/product-center-execution-decisions';

export function auditProductCenterItemReleaseReadiness(projectRoot = path.resolve(__dirname, '..')) {
  const startedAt = new Date().toISOString();
  const inputs = [
    'output/product-center-item-213-conversion.json',
    'contracts/product-center/reviews/product-center-item-failure-manual-decisions.json',
  ];
  const [conversion, manual] = inputs.map((file) => JSON.parse(fs.readFileSync(path.join(projectRoot, file), 'utf8'))) as [
    { denominator: { formal: number; notApplicable: number }; cases: Array<{ caseId: string; bindingFingerprint?: string; assertionIds?: string[] }> },
    { decisions: Array<{ caseId: string; disposition: string }> },
  ];
  const deferred = new Set(manual.decisions.filter((item) => item.disposition === 'skip-deferred').map((item) => item.caseId));
  const decisions = loadProductCenterExecutionDecisions(projectRoot);
  inputs.push('contracts/product-center/reviews/product-center-execution-decisions.json');
  const notApplicable = new Set<string>();
  for (const item of conversion.cases) {
    const decision = decisions.get(item.caseId);
    if (decision?.status === 'not-applicable') notApplicable.add(item.caseId);
    if (decision?.status === 'deferred') deferred.add(item.caseId);
  }
  const excluded = (caseId: string) => deferred.has(caseId) || notApplicable.has(caseId);
  const required = conversion.cases.filter((item) => !excluded(item.caseId));
  const qualification = qualifyProductCenterItemReleaseReceipts({ projectRoot, cases: required });
  const canonicalSource = '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md';
  const formalSurfaces = new Map(parseProductCenterItemCaseSemanticFingerprints(path.resolve(projectRoot, canonicalSource))
    .map((item) => [item.caseId, item]));
  const assertionSurfaces = new Map(parseProductCenterItemAssertionSurfaces(path.resolve(projectRoot, canonicalSource))
    .map((item) => [item.caseId, item]));
  const manifest = readJsonEvidence(path.join(projectRoot, ITEM_CURRENT_RECEIPT_CONTRACT_PATH), isProductCenterItemReleaseReceiptManifest);
  const reportInputs = manifest.status === 'available' ? manifest.value.reportPaths.filter((file) => {
    const relative = path.relative(projectRoot, path.resolve(projectRoot, file));
    return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
  }) : [];
  const fingerprintInputs = [...new Set([...inputs, ITEM_CURRENT_RECEIPT_CONTRACT_PATH,
    'scripts/audit-product-center-item-release-readiness.ts',
    'adapters/product-center/product-center-item-release-receipts.ts',
    'utils/product-center-item-assertion-surfaces.ts',
    'utils/product-center-execution-decisions.ts',
    '../Test Automation Platform/src/governance/implementation-format-equivalence.ts',
    '../Test Automation Platform/src/automation/system-test/system-test-implementation-fingerprint.ts',
    '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
    ...productCenterItemImplementationCheckpointInputs(), ...reportInputs])].sort();
  const inputFingerprint = createHash('sha256').update(JSON.stringify(fingerprintInputs.map((file) => {
    try { return { file, hash: createHash('sha256').update(fs.readFileSync(path.resolve(projectRoot, file))).digest('hex') }; }
    catch { return { file, hash: 'unavailable' }; }
  }))).digest('hex');
  const findings = new Map(qualification.findings.map((item) => [item.caseId, item.reasons]));
  const rows = conversion.cases.map((item) => {
    const source = formalSurfaces.get(item.caseId);
    const formalAssertions = assertionSurfaces.get(item.caseId);
    const requiredIds = formalAssertions?.assertionIds ?? [];
    const declared = item.assertionIds ?? [];
    const missing = requiredIds.filter((id) => !declared.includes(id));
    const unexpected = declared.filter((id) => !requiredIds.includes(id));
    const surfaceReasons = !source ? ['CURRENT_CANONICAL_CASE_MISSING'] : item.assertionIds === undefined
      ? ['GENERATED_ASSERTION_DECLARATIONS_MISSING'] : missing.length || unexpected.length || new Set(declared).size !== declared.length
        ? ['GENERATED_ASSERTION_SURFACE_DRIFT'] : [];
    surfaceReasons.push(...(formalAssertions?.reasons ?? ['CURRENT_ASSERTION_CONTRACT_MISSING']));
    return {
    caseId: item.caseId,
    qualificationStatus: notApplicable.has(item.caseId) ? 'classified-not-applicable' : deferred.has(item.caseId) ? 'classified-deferred'
      : qualification.accepted.has(item.caseId) && surfaceReasons.length === 0 ? 'current-receipt-qualified' : 'current-contract-or-evidence-incomplete',
    executionDecision: decisions.get(item.caseId) ?? null,
    reasons: [...(findings.get(item.caseId) ?? []), ...surfaceReasons],
    sourceSurface: { source: canonicalSource, semanticFingerprint: source?.fingerprint ?? null,
      sourceStepCount: source?.steps.length ?? null, requiredAssertionIds: requiredIds,
      generatedAssertionIds: declared, missingAssertionIds: missing, unexpectedAssertionIds: unexpected,
      duplicateSourceNumbers: formalAssertions?.duplicateNumbers ?? [],
      status: surfaceReasons.length ? 'incomplete' : 'aligned',
      note: '只证明当前正文和生成声明的ID集合一致性；不能证明方法、业务语义或运行收据完整。' },
    nextAction: notApplicable.has(item.caseId) ? '保留历史用例及当前不适用裁决，不进入收据要求或执行选择集'
      : deferred.has(item.caseId) ? '保留当前正式延期裁决' : qualification.accepted.has(item.caseId) && surfaceReasons.length === 0 ? '保留当前合格收据及报告内容哈希'
      : '执行代理补齐当前逐操作/上下文合同映射，再验收实际报告；禁止从历史通过名单或待验收收据反推当前合同',
  }; });
  const artifactPath = 'deliverables/system-test-platform/product-center-item-release-readiness.json';
  const sourceBlocking = rows.some((row) => !excluded(row.caseId) && row.sourceSurface.status !== 'aligned');
  const incomplete = qualification.findings.length > 0 || sourceBlocking;
  const completedAt = new Date().toISOString();
  const report = {
    schemaVersion: '1.0.0', status: incomplete ? 'incomplete' : 'ready', scope: 'report-only-release-qualification',
    source: { inputs, currentReceiptContract: ITEM_CURRENT_RECEIPT_CONTRACT_PATH },
    summary: { formal: conversion.denominator.formal, notApplicable: conversion.denominator.notApplicable + notApplicable.size,
      executable: rows.length - notApplicable.size, classifiedDeferred: rows.filter((item) => item.qualificationStatus === 'classified-deferred').length,
      receiptContractRequired: required.length, currentQualified: rows.filter((item) => item.qualificationStatus === 'current-receipt-qualified').length,
      incomplete: rows.filter((item) => item.qualificationStatus === 'current-contract-or-evidence-incomplete').length },
    generatedRegistration: { count: rows.length, classifiedNotApplicable: [...notApplicable].sort(),
      note: '生成注册数量与当前执行资格分别计数；已登记不适用裁决优先，保留原生成和历史证据。' },
    sourceSurfaceSummary: { aligned: rows.filter((row) => row.sourceSurface.status === 'aligned').length,
      incomplete: rows.filter((row) => row.sourceSurface.status === 'incomplete').length },
    cases: rows, startedAt, completedAt, durationMs: Date.parse(completedAt) - Date.parse(startedAt), waitMs: 0, retryCount: 0,
    inputFingerprint,
    outputFingerprint: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
    blockedReason: incomplete ? 'CURRENT_RELEASE_CONTRACT_RECEIPTS_OR_SOURCE_SURFACES_INCOMPLETE' : null,
    businessExecutionStarted: false, artifactPath,
    guardrails: { historicalPassedResultsPreserved: true, businessExecutionAuthorized: false, technicalMappingOwner: 'execution-agent', secretsPersisted: false },
  };
  const output = path.join(projectRoot, artifactPath);
  publishImmutableArtifact({ outputRoot: projectRoot, relativePath: artifactPath,
    content: `${JSON.stringify(report, null, 2)}\n`, reason: 'refresh-current-release-readiness' });
  return { output, status: report.status, summary: report.summary };
}

if (require.main === module) process.stdout.write(`${JSON.stringify(auditProductCenterItemReleaseReadiness())}\n`);
