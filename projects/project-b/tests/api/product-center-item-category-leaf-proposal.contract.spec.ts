import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterItemCanonicalArtifacts } from '../../scripts/build-product-center-item-canonical-test-plan';
import { buildProductCenterItemCategoryLeafProposalArtifacts } from '../../scripts/build-product-center-item-category-leaf-proposal';
import {
  buildProductCenterItemCategoryLeafProposal,
  closeProductCenterItemCategoryLeafProposal,
} from '../../utils/product-center-item-category-leaf-proposal';

const approvedReadOnlyProbe = {
  schemaVersion: '1.0.0' as const,
  approvalId: 'product-center-item-category-leaf-read-only-probe',
  canonicalId: 'TC-ITEM-STD-007',
  decision: 'approved' as const,
  approvedScope: [
    'navigation.sidebar.open',
    'item.openStandardCreate',
    'item.category.openCascader',
    'item.category.selectParentWithChildren',
    'item.category.selectLeaf',
  ],
  reviewedBy: '金将军',
  reviewedAt: '2026-07-29T13:00:00.000Z',
  executionPolicy: {
    readOnly: true,
    saveAllowed: false,
    createAllowed: false,
    updateAllowed: false,
    deleteAllowed: false,
    stopAfterLeafSelectionEvidence: true,
  },
} as const;

test.describe('商品分类叶子选择技术绑定 proposal', () => {
  test('P1 canonical 复用列表入口证据并仅按正式授权解锁只读 Probe', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'item-category-leaf-proposal-'));
    try {
      buildProductCenterItemCanonicalArtifacts({ projectRoot, outputRoot });
      const paths = buildProductCenterItemCategoryLeafProposalArtifacts({
        projectRoot,
        outputRoot,
        now: '2026-07-29T12:00:00.000Z',
      });
      const proposal = JSON.parse(fs.readFileSync(paths.proposalPath, 'utf8'));
      const markdown = fs.readFileSync(paths.markdownPath, 'utf8');

      expect(proposal).toMatchObject({
        collectionId: 'product-center-item-category-leaf-technical-proposal',
        status: 'probe-approved',
        canonical: {
          canonicalId: 'TC-ITEM-STD-007',
          priority: 'P1',
          status: 'ready-for-technical-binding',
          route: '/pp/brand/list',
        },
        routeEntryEvidence: {
          scope: 'route-entry-only',
          route: '/pp/brand/list',
          sidebarEntryVerified: true,
          runtimeAccepted: true,
          fresh: true,
        },
        executionPolicy: {
          uiExecutionAuthorized: true,
          mutatesData: false,
          saveAllowed: false,
          cleanupRequired: false,
        },
        approval: {
          approvalId: 'product-center-item-category-leaf-read-only-probe',
          decision: 'approved',
          reviewedBy: '金将军',
        },
      });
      expect(proposal.proposedCapabilities[0]).toMatchObject({
        id: 'navigation.sidebar.open',
        status: 'verified-route-entry',
      });
      expect(proposal.proposedCapabilities.slice(1).every((item: any) => (
        item.status === 'probe-required'
      ))).toBe(true);
      expect(proposal.proposedAssertions.every((item: any) => (
        item.status === 'probe-required'
      ))).toBe(true);
      expect(proposal.blockingReasons).toEqual([
        'ASSERTION_ADAPTER_REQUIRED',
        'CATEGORY_CASCADER_LOCATOR_UNIQUENESS_REQUIRED',
        'CATEGORY_HIERARCHY_DATA_REQUIRED',
        'CREATE_PAGE_OBSERVATION_REQUIRED',
      ]);
      expect(proposal.requiredEvidence.map((item: any) => item.kind).sort()).toEqual([
        'locator-uniqueness',
        'network',
        'observable-ui',
        'observable-ui',
        'visible-ui',
      ]);
      expect(JSON.stringify(proposal)).not.toContain('waitForTimeout');
      expect(JSON.stringify(proposal)).not.toContain('page.goto');
      expect(markdown).toContain('不得点击保存');
      expect(markdown).toContain('已批准仅执行只读 UI Probe');
      expect(fs.existsSync(path.join(outputRoot, 'tests/generated'))).toBe(false);
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  test('列表入口证据缺少版本信息时必须明确阻断', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const release = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-cases/canonical/product-center-item-canonical-release.json',
    ), 'utf8'));
    const canonicalCase = release.cases.find((item: any) => (
      item.canonicalId === 'TC-ITEM-STD-007'
    ));

    expect(() => buildProductCenterItemCategoryLeafProposal({
      canonicalCase,
      routeObservation: {
        caseId: 'missing-release',
        route: '/pp/brand/list',
        capabilityIds: ['navigation.sidebar.open', 'item.createStandard'],
        navigation: {
          mode: 'sidebar',
          targetPath: '/pp/brand/list',
          arrivedPath: '/pp/brand/list',
          verifiedPaths: ['/pp/brand/list'],
        },
        sidebarEntryVerified: true,
        runtimeAccepted: true,
      },
      now: '2026-07-29T12:00:00.000Z',
    })).toThrow('商品分类叶子选择列表入口证据缺少版本信息');
  });

  test('正式批准只能解锁精确的分类只读 Probe 范围', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const release = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-cases/canonical/product-center-item-canonical-release.json',
    ), 'utf8'));
    const canonicalCase = release.cases.find((item: any) => (
      item.canonicalId === 'TC-ITEM-STD-007'
    ));
    const observation = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'output/page-contract/product-center-page-contract-observation.json',
    ), 'utf8')).observations.find((item: any) => (
      item.route === '/pp/brand/list'
      && item.capabilityIds.includes('item.createStandard')
      && item.runtimeAccepted
      && item.sidebarEntryVerified
    ));

    const proposal = buildProductCenterItemCategoryLeafProposal({
      canonicalCase,
      routeObservation: observation,
      approval: approvedReadOnlyProbe,
      now: '2026-07-29T13:05:00.000Z',
    });

    expect(proposal).toMatchObject({
      status: 'probe-approved',
      executionPolicy: {
        uiExecutionAuthorized: true,
        mutatesData: false,
        saveAllowed: false,
        createAllowed: false,
        updateAllowed: false,
        deleteAllowed: false,
        stopAfterLeafSelectionEvidence: true,
      },
      approval: {
        approvalId: 'product-center-item-category-leaf-read-only-probe',
        decision: 'approved',
        reviewedBy: '金将军',
        reviewedAt: '2026-07-29T13:00:00.000Z',
      },
    });
    expect(proposal.blockingReasons).toEqual([
      'ASSERTION_ADAPTER_REQUIRED',
      'CATEGORY_CASCADER_LOCATOR_UNIQUENESS_REQUIRED',
      'CATEGORY_HIERARCHY_DATA_REQUIRED',
      'CREATE_PAGE_OBSERVATION_REQUIRED',
    ]);
  });

  test('包含保存或数据写入授权时必须拒绝执行', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const release = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-cases/canonical/product-center-item-canonical-release.json',
    ), 'utf8'));
    const canonicalCase = release.cases.find((item: any) => (
      item.canonicalId === 'TC-ITEM-STD-007'
    ));
    const observation = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'output/page-contract/product-center-page-contract-observation.json',
    ), 'utf8')).observations.find((item: any) => (
      item.route === '/pp/brand/list'
      && item.capabilityIds.includes('item.createStandard')
      && item.runtimeAccepted
      && item.sidebarEntryVerified
    ));

    expect(() => buildProductCenterItemCategoryLeafProposal({
      canonicalCase,
      routeObservation: observation,
      approval: {
        ...approvedReadOnlyProbe,
        executionPolicy: { ...approvedReadOnlyProbe.executionPolicy, saveAllowed: true },
      } as any,
      now: '2026-07-29T13:05:00.000Z',
    })).toThrow('商品分类叶子选择 Probe 授权不得允许保存或数据写入');
  });

  test('同一指纹的 accepted runtime evidence 应关闭全部技术阻塞并锁止重放', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const release = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-cases/canonical/product-center-item-canonical-release.json',
    ), 'utf8'));
    const canonicalCase = release.cases.find((item: any) => (
      item.canonicalId === 'TC-ITEM-STD-007'
    ));
    const observation = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'output/page-contract/product-center-page-contract-observation.json',
    ), 'utf8')).observations.find((item: any) => (
      item.route === '/pp/brand/list'
      && item.capabilityIds.includes('item.createStandard')
      && item.runtimeAccepted
      && item.sidebarEntryVerified
    ));
    const proposal = buildProductCenterItemCategoryLeafProposal({
      canonicalCase,
      routeObservation: observation,
      approval: approvedReadOnlyProbe,
      now: '2026-07-29T13:05:00.000Z',
    });

    const closed = closeProductCenterItemCategoryLeafProposal({
      proposal,
      recipeFingerprint: 'f'.repeat(64),
      acceptance: {
        fingerprint: 'f'.repeat(64),
        runId: 'RUN_ACCEPTED',
        accepted: true,
        acceptedCaseIds: ['TC-ITEM-STD-007'],
        safety: {
          incompleteCheckpoints: 0,
          sensitiveFindings: 0,
          authStateArtifacts: 0,
          forbiddenPatterns: 0,
        },
      },
      evidence: {
        fingerprint: 'f'.repeat(64),
        runId: 'RUN_ACCEPTED',
        entries: [{
          caseId: 'TC-ITEM-STD-007',
          claimCoverageComplete: true,
          sidebarEntryVerified: true,
          visibleUi: { categoryFieldVisible: true, parentNotCommitted: true, leafCommitted: true },
          locatorUniqueness: {
            categoryFieldCount: 1,
            categoryCascaderCount: 1,
            parentNodeCount: 1,
            leafNodeCount: 1,
          },
          network: { method: 'GET', operation: '/item/v1/ops-brand/brand-categories/treeList', status: 200 },
          api: { beforeEqualsAfter: true, mutationRequestCount: 0 },
          release: { applicationFingerprint: 'a'.repeat(64), observedAt: '2026-07-29T13:04:00.000Z' },
        }],
      },
    });

    expect(closed.status).toBe('runtime-accepted');
    expect(closed.blockingReasons).toEqual([]);
    expect(closed.proposedCapabilities.every((item) => item.status === 'runtime-verified')).toBe(true);
    expect(closed.proposedAssertions.every((item) => item.status === 'runtime-verified')).toBe(true);
    expect(closed.requiredEvidence.every((item) => item.status === 'observed')).toBe(true);
    expect(closed.executionPolicy).toMatchObject({
      uiExecutionAuthorized: false,
      executionCompleted: true,
      sourceRunId: 'RUN_ACCEPTED',
    });
  });

  test('runtime evidence 指纹与 Recipe 不一致时必须拒绝关闭 proposal', async () => {
    expect(() => closeProductCenterItemCategoryLeafProposal({
      proposal: {
        status: 'probe-approved',
        canonical: { canonicalId: 'TC-ITEM-STD-007' },
        proposedCapabilities: [],
        proposedAssertions: [],
        requiredEvidence: [],
        blockingReasons: ['CREATE_PAGE_OBSERVATION_REQUIRED'],
        executionPolicy: { uiExecutionAuthorized: true },
      } as any,
      recipeFingerprint: 'f'.repeat(64),
      acceptance: {
        fingerprint: 'e'.repeat(64),
        runId: 'RUN_STALE',
        accepted: true,
        acceptedCaseIds: ['TC-ITEM-STD-007'],
        safety: {
          incompleteCheckpoints: 0,
          sensitiveFindings: 0,
          authStateArtifacts: 0,
          forbiddenPatterns: 0,
        },
      },
      evidence: {
        fingerprint: 'e'.repeat(64),
        runId: 'RUN_STALE',
        entries: [],
      },
    })).toThrow('商品分类叶子选择运行证据与 Recipe 指纹不一致');
  });

  test('构建脚本应使用同一输出根中的 accepted 产物关闭 proposal', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'item-category-leaf-closure-'));
    try {
      buildProductCenterItemCanonicalArtifacts({ projectRoot, outputRoot });
      const relativeFiles = [
        'contracts/product-center/recipes/product-center-item-category-leaf-probe-recipes.json',
        'output/recipes/product-center-item-category-leaf-probe-acceptance.json',
        'output/recipes/product-center-item-category-leaf-probe-evidence.json',
      ];
      for (const relativeFile of relativeFiles) {
        const targetPath = path.join(outputRoot, relativeFile);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(path.join(projectRoot, relativeFile), targetPath);
      }

      const paths = buildProductCenterItemCategoryLeafProposalArtifacts({
        projectRoot,
        outputRoot,
        now: '2026-07-29T15:05:00.000Z',
      });
      const proposal = JSON.parse(fs.readFileSync(paths.proposalPath, 'utf8'));

      expect(proposal).toMatchObject({
        status: 'runtime-accepted',
        blockingReasons: [],
        executionPolicy: {
          uiExecutionAuthorized: false,
          executionCompleted: true,
          sourceRunId: 'AUTO_AUDIT_ITEM_CATEGORY_LEAF_1785337162204_full',
        },
      });
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });
});
