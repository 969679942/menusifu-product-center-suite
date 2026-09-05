import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildProductCenterTechnicalBindingCandidates,
  compileApprovedProductCenterTechnicalBindings,
  type ProductCenterTechnicalBindingApprovalDocument,
} from '../../utils/product-center-technical-binding-candidates';
import {
  buildProductCenterTechnicalBindingCandidateArtifacts,
  resolveProductCenterTechnicalBindingApprovalPath,
} from '../../scripts/build-product-center-technical-binding-candidates';

test.describe('商品中心页面合同技术绑定候选', () => {
  test('只有 clean 且已验收的页面观测才能形成候选', async () => {
    const document = buildProductCenterTechnicalBindingCandidates(fixtureInput());

    expect(document).toMatchObject({
      status: 'approval-required',
      summary: { total: 1, ready: 1, blocked: 0 },
      approvalRequired: true,
      generationAllowed: false,
    });
    expect(document.candidates[0]).toMatchObject({
      canonicalId: 'TC-PC-STORE-PRODUCT-READ-001',
      internalCaseId: 'read:store-product-search',
      status: 'candidate-ready',
      issueCodes: [],
      binding: {
        route: '/poi/location/prod-list',
        capabilityIds: ['navigation.sidebar.open', 'storeProduct.searchByName'],
        assertionAdapterIds: ['productCenter.verifyStoreProductSearch'],
        mutatesData: false,
      },
      evidence: {
        pageObservationFingerprint: 'page-observation-fingerprint',
        runtimeAccepted: true,
        claimCoverageComplete: true,
        sidebarEntryVerified: true,
      },
    });
    expect(document.candidates[0].candidateHash).toMatch(/^[a-f0-9]{64}$/);

    const blocked = buildProductCenterTechnicalBindingCandidates({
      ...fixtureInput(),
      pageContract: {
        ...fixtureInput().pageContract,
        status: 'review-required',
        findings: [{
          code: 'LOCATOR_NOT_UNIQUE',
          caseId: 'read:store-product-search',
          route: '/poi/location/prod-list',
          sourceIds: ['route:store-product'],
          detail: 'nameInputCount=2',
          blocking: true,
        }],
        observations: [{
          ...fixtureInput().pageContract.observations[0],
          runtimeAccepted: false,
        }],
      },
    });
    expect(blocked).toMatchObject({
      status: 'review-required',
      summary: { ready: 0, blocked: 1 },
    });
    expect(blocked.candidates[0].issueCodes).toEqual(expect.arrayContaining([
      'PAGE_CONTRACT_NOT_CLEAN',
      'RUNTIME_ACCEPTANCE_REQUIRED',
    ]));
  });

  test('缺失、拒绝或过期审批必须阻断正式绑定与 Recipe 编译', async () => {
    const candidates = buildProductCenterTechnicalBindingCandidates(fixtureInput());
    const pending = approvalDocument(candidates.fingerprint, candidates.candidates[0].candidateHash, 'pending');
    const stale = approvalDocument('stale-fingerprint', candidates.candidates[0].candidateHash, 'approved');

    expect(() => compileApprovedProductCenterTechnicalBindings(candidates, pending))
      .toThrow(/尚未批准/);
    expect(() => compileApprovedProductCenterTechnicalBindings(candidates, stale))
      .toThrow(/过期/);
    expect(() => compileApprovedProductCenterTechnicalBindings(
      candidates,
      approvalDocument(candidates.fingerprint, 'stale-candidate-hash', 'approved'),
    )).toThrow(/候选指纹/);
  });

  test('页面证据刷新不应改变技术绑定语义指纹', async () => {
    const first = buildProductCenterTechnicalBindingCandidates(fixtureInput());
    const refreshedInput = fixtureInput();
    refreshedInput.pageContract = {
      ...refreshedInput.pageContract,
      fingerprint: 'refreshed-page-observation-fingerprint',
      evidenceFingerprint: 'refreshed-runtime-evidence-fingerprint',
    };
    const refreshed = buildProductCenterTechnicalBindingCandidates(refreshedInput);

    expect(refreshed.pageObservationFingerprint).not.toBe(first.pageObservationFingerprint);
    expect(refreshed.bindingSemanticFingerprint).toBe(first.bindingSemanticFingerprint);
    expect(refreshed.fingerprint).toBe(first.fingerprint);
    expect(refreshed.candidates[0].candidateHash).toBe(first.candidates[0].candidateHash);
    expect(refreshed.candidates[0].evidenceHash).not.toBe(first.candidates[0].evidenceHash);
  });

  test('旧审批仅在现有正式产物与当前语义完全一致且页面 clean 时受控复用', async () => {
    const first = buildProductCenterTechnicalBindingCandidates(fixtureInput());
    const refreshedInput = fixtureInput();
    refreshedInput.pageContract = {
      ...refreshedInput.pageContract,
      fingerprint: 'refreshed-page-observation-fingerprint',
      evidenceFingerprint: 'refreshed-runtime-evidence-fingerprint',
    };
    const refreshed = buildProductCenterTechnicalBindingCandidates(refreshedInput);
    const legacyApproval = approvalDocument(
      'legacy-candidate-fingerprint',
      'legacy-candidate-hash',
      'approved',
    );

    expect(() => compileApprovedProductCenterTechnicalBindings(refreshed, legacyApproval, {
      legacyApproved: {
        bindings: first.candidates.map((candidate) => candidate.binding!),
        recipes: first.candidates.map((candidate) => candidate.recipe!),
      },
    })).not.toThrow();
    expect(() => compileApprovedProductCenterTechnicalBindings(refreshed, legacyApproval, {
      legacyApproved: {
        bindings: first.candidates.map((candidate) => candidate.binding!),
        recipes: first.candidates.map((candidate) => ({
          ...candidate.recipe!,
          capabilities: [
            ...candidate.recipe!.capabilities,
            { id: 'storeProduct.unapprovedTechnicalChange' },
          ],
        })),
      },
    })).toThrow(/旧审批.*语义/);
  });

  test('审批与候选指纹一致时应生成绑定、Recipe 和侧边栏优先的 Spec', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-binding-candidates-'));
    try {
      const first = buildProductCenterTechnicalBindingCandidateArtifacts({ projectRoot, outputRoot });
      const candidates = readJson<any>(first.candidatesPath);
      const request = readJson<ProductCenterTechnicalBindingApprovalDocument>(first.approvalRequestPath);
      const expectedCount = readJson<any>(path.join(
        projectRoot,
        'contracts/product-center/test-cases/pilots/product-center-test-plan-gold-set.json',
      )).cases.length;

      expect(candidates).toMatchObject({
        status: 'approval-required',
        summary: { total: expectedCount, ready: expectedCount, blocked: 0 },
      });
      expect(request.summary).toEqual({ total: expectedCount, pending: expectedCount, approved: 0, rejected: 0 });
      expect(request.decisions.every((decision) => (
        decision.candidateSummary?.capabilityIds[0] === 'navigation.sidebar.open'
          && Boolean(decision.candidateSummary?.title)
          && Boolean(decision.candidateSummary?.route)
          && (decision.candidateSummary?.claimCount ?? 0) > 0
      ))).toBe(true);
      const approvalMarkdown = fs.readFileSync(first.approvalRequestMarkdownPath, 'utf8');
      expect(approvalMarkdown).toContain('# 商品中心技术绑定候选审批请求');
      expect(approvalMarkdown.match(/^## TC-PC-/gm)).toHaveLength(expectedCount);
      expect(approvalMarkdown).toContain('Capability：navigation.sidebar.open');
      expect(fs.existsSync(first.approvedBindingsPath)).toBe(false);
      expect(fs.existsSync(first.approvedRecipesPath)).toBe(false);
      expect(fs.existsSync(first.generatedSpecPath)).toBe(false);

      const approved: ProductCenterTechnicalBindingApprovalDocument = {
        ...request,
        status: 'approved',
        decisions: request.decisions.map((decision) => ({
          ...decision,
          decision: 'approved',
          reviewedBy: 'contract-test-reviewer',
          reviewedAt: '2026-07-28T00:00:00.000Z',
          reason: '合同测试显式批准候选',
        })),
        summary: { total: expectedCount, pending: 0, approved: expectedCount, rejected: 0 },
      };
      const approvalPath = path.join(outputRoot, 'approval.json');
      fs.writeFileSync(approvalPath, `${JSON.stringify(approved, null, 2)}\n`, 'utf8');
      const second = buildProductCenterTechnicalBindingCandidateArtifacts({
        projectRoot,
        outputRoot,
        approvalsPath: approvalPath,
      });
      const bindings = readJson<any>(second.approvedBindingsPath);
      const recipes = readJson<any>(second.approvedRecipesPath);
      const spec = fs.readFileSync(second.generatedSpecPath, 'utf8');

      expect(bindings).toMatchObject({ status: 'approved', summary: { total: expectedCount } });
      expect(recipes).toMatchObject({ status: 'approved', summary: { total: expectedCount } });
      expect(bindings.bindings.every((binding: any) => (
        binding.capabilityIds[0] === 'navigation.sidebar.open'
      ))).toBe(true);
      expect(recipes.recipes.every((recipe: any) => (
        recipe.capabilities[0].id === 'navigation.sidebar.open'
      ))).toBe(true);
      expect(spec).toContain('product-center-approved-technical-bindings-recipes.json');
      expect(spec).toContain('buildProductCenterRuntimeEvidenceBundle');
      expect(JSON.stringify({ candidates, request, bindings, recipes })).not.toMatch(
        /password|authorization|bearer\s+|cookie|access[_-]?token/i,
      );
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  test('候选构建应在页面观测后进入本地流水线并阻断 review-required', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const packageJson = readJson<any>(path.join(projectRoot, 'package.json'));
    const pipeline = fs.readFileSync(
      path.join(projectRoot, 'scripts/run-product-center-quality-pipeline.ts'),
      'utf8',
    );
    const builder = fs.readFileSync(
      path.join(projectRoot, 'scripts/build-product-center-technical-binding-candidates.ts'),
      'utf8',
    );

    expect(packageJson.scripts['build:product-center:technical-binding-candidates'])
      .toContain('build-product-center-technical-binding-candidates.ts');
    expect(pipeline).toContain("'technical-binding-candidates'");
    expect(pipeline.indexOf("'page-contract-observation'"))
      .toBeLessThan(pipeline.indexOf("'technical-binding-candidates'"));
    expect(pipeline.indexOf("'technical-binding-candidates'"))
      .toBeLessThan(pipeline.indexOf("'failure-analysis'"));
    expect(builder).toContain("'output/page-contract/product-center-page-contract-observation.json'");
    expect(builder).toContain("paths.status === 'review-required'");
  });

  test('正式审批文件存在时日常候选构建应自动启用审批指纹门禁', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const expectedPath = path.join(
      projectRoot,
      'contracts/product-center/reviews/product-center-technical-binding-approvals.json',
    );
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-no-binding-approval-'));
    try {
      expect(resolveProductCenterTechnicalBindingApprovalPath(projectRoot)).toBe(expectedPath);
      expect(resolveProductCenterTechnicalBindingApprovalPath(emptyRoot)).toBeUndefined();
      expect(resolveProductCenterTechnicalBindingApprovalPath(emptyRoot, expectedPath)).toBe(expectedPath);
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true });
    }
  });
});

function fixtureInput() {
  return {
    generatedCases: [{
      canonicalId: 'TC-PC-STORE-PRODUCT-READ-001',
      internalCaseId: 'read:store-product-search',
      module: 'store-product',
    }],
    goldCases: [{
      id: 'read:store-product-search',
      module: 'store-product',
      route: '/poi/location/prod-list',
      sourceRefs: ['XMIND:store-product-search'],
      claims: [
        { id: 'claim:read:store-product-search:precondition:1' },
        { id: 'claim:read:store-product-search:action:1' },
        { id: 'claim:read:store-product-search:expectation:1' },
      ],
      execution: {
        seedAdapterIds: [],
        cleanupAdapterIds: [],
        verificationSignals: ['ui'],
      },
      mutatesData: false,
      cleanup: [],
    }],
    sourceBindings: [{ ref: 'XMIND:store-product-search', sourceIds: ['route:store-product'] }],
    recipes: [{
      schemaVersion: '1.0.0' as const,
      id: 'product-center:test-plan-gold-set:read:store-product-search',
      caseId: 'read:store-product-search',
      title: '按商品名称查询门店商品',
      tags: ['@recipe'],
      route: '/poi/location/prod-list' as const,
      action: 'read' as const,
      traceabilityId: 'trace:sop:read:store-product-search' as const,
      sourceIds: ['route:store-product'],
      claimIds: [
        'claim:read:store-product-search:precondition:1',
        'claim:read:store-product-search:action:1',
        'claim:read:store-product-search:expectation:1',
      ],
      coverageIds: ['coverage:store-product-search'],
      generationAllowed: true,
      capabilities: [
        { id: 'navigation.sidebar.open' },
        { id: 'storeProduct.searchByName' },
      ],
      assertions: [{ adapterId: 'productCenter.verifyStoreProductSearch' }],
    }],
    pageContract: {
      schemaVersion: '1.0.0' as const,
      collectionId: 'product-center-page-contract-observation' as const,
      recipeFingerprint: 'recipe-fingerprint',
      evidenceFingerprint: 'evidence-fingerprint',
      fingerprint: 'page-observation-fingerprint',
      status: 'clean' as const,
      summary: { totalCases: 1, acceptedCases: 1, blockingFindings: 0 },
      observations: [{
        recipeId: 'product-center:test-plan-gold-set:read:store-product-search',
        caseId: 'read:store-product-search',
        route: '/poi/location/prod-list',
        sourceIds: ['route:store-product'],
        navigation: {
          mode: 'sidebar',
          targetPath: '/poi/location/prod-list',
          arrivedPath: '/poi/location/prod-list',
          verifiedPaths: ['/poi/location/prod-list'],
        },
        visibleUiRoute: '/poi/location/prod-list',
        locatorCounts: { nameInputCount: 1 },
        capabilityIds: ['navigation.sidebar.open', 'storeProduct.searchByName'],
        assertionAdapterIds: ['productCenter.verifyStoreProductSearch'],
        claimCoverageComplete: true,
        sidebarEntryVerified: true,
        runtimeAccepted: true,
      }],
      findings: [],
      contractMutationAllowed: false as const,
      businessRuleMutationAllowed: false as const,
    },
  };
}

function approvalDocument(
  candidateFingerprint: string,
  candidateHash: string,
  decision: 'pending' | 'approved' | 'rejected',
): ProductCenterTechnicalBindingApprovalDocument {
  const approved = decision === 'approved';
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-technical-binding-approvals',
    status: approved ? 'approved' : 'approval-required',
    candidateFingerprint,
    pageObservationFingerprint: 'page-observation-fingerprint',
    decisions: [{
      canonicalId: 'TC-PC-STORE-PRODUCT-READ-001',
      candidateHash,
      decision,
      reviewedBy: approved ? 'contract-test-reviewer' : null,
      reviewedAt: approved ? '2026-07-28T00:00:00.000Z' : null,
      reason: approved ? '合同测试批准' : null,
    }],
    summary: {
      total: 1,
      pending: decision === 'pending' ? 1 : 0,
      approved: decision === 'approved' ? 1 : 0,
      rejected: decision === 'rejected' ? 1 : 0,
    },
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
