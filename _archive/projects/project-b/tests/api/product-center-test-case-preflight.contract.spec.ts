import { expect, test } from '@playwright/test';
import contractDocument from '../../contracts/product-center/product-center-test-contract.json';
import { productCenterCoverageCuration } from '../../contracts/product-center/test-cases/product-center-coverage-curation';
import type { ProductCenterTestContract } from '../../utils/product-center-test-contract';
import type { ProductCenterTestCaseInput } from '../../utils/product-center-test-case-ir';
import {
  auditProductCenterTestCaseSemantics,
} from '../../utils/product-center-test-case-semantics';
import {
  auditProductCenterCoverage,
  buildProductCenterCoverageDenominator,
  selectProductCenterCoverageDenominator,
  type ProductCenterCoverageItem,
} from '../../utils/product-center-coverage-denominator';
import {
  auditProductCenterTestCaseExecutability,
} from '../../utils/product-center-test-case-executability';
import { processProductCenterTestCaseIntake } from '../../utils/product-center-test-case-ir';
import { buildProductCenterTestCaseIrCatalog } from '../../sop/product-center/product-center-test-case-ir.catalog';

const completeCase: ProductCenterTestCaseInput = {
  id: 'TC-PC-PREFLIGHT-001',
  module: 'brand-item',
  route: '/pp/brand/category',
  title: '应能编辑商品分类',
  priority: 'P0',
  sourceIds: ['route:category', 'control:category-edit', 'mapping:category-update'],
  preconditions: ['存在可编辑的审计分类'],
  actions: ['打开编辑弹窗', '填写新的分类名称', '保存'],
  expectedResults: ['接口保存成功', '列表重新进入后显示新名称'],
  mutatesData: true,
  cleanup: ['按服务端 ID 删除审计分类'],
  claims: [
    claim('precondition', '存在可编辑的审计分类', ['route:category']),
    claim('action', '打开编辑弹窗', ['control:category-edit']),
    claim('action', '填写新的分类名称', ['control:category-edit']),
    claim('action', '保存', ['mapping:category-update']),
    claim('expectation', '接口保存成功', ['mapping:category-update']),
    claim('expectation', '列表重新进入后显示新名称', ['route:category']),
  ],
  coverageIds: ['coverage:route:category', 'coverage:control:category-edit'],
  execution: {
    roleIds: ['product-admin'],
    environmentIds: ['balamxqa'],
    capabilityIds: ['category.open', 'category.editIdentity'],
    mutationMode: 'api-seeded-ui-action',
    verificationSignals: ['api', 'ui'],
    seedAdapterIds: ['productCenter.seedCore'],
    cleanupAdapterIds: ['productCenter.cleanupCore'],
    asyncPolicy: 'none',
  },
};

test.describe('商品中心用例前置三层门禁', () => {
  test('推导或冲突的语句证据必须生成纠正提案并阻断', async () => {
    const candidate = structuredClone(completeCase);
    candidate.claims![4].evidenceLevel = 'conflicting';

    const result = auditProductCenterTestCaseSemantics([candidate]);

    expect(result.summary).toEqual({ total: 1, passed: 0, reviewRequired: 1 });
    expect(result.cases[0].issues.map((item) => item.code)).toEqual(['CONFLICTING_CLAIM']);
    expect(result.corrections[0]).toMatchObject({
      caseId: candidate.id,
      claimId: candidate.claims![4].id,
      action: 'confirm-or-rewrite',
    });
  });

  test('每个前置操作和预期都必须有语句级证据', async () => {
    const candidate = structuredClone(completeCase);
    candidate.claims = candidate.claims!.filter((item) => item.text !== '保存');

    const result = auditProductCenterTestCaseSemantics([candidate]);

    expect(result.cases[0].issues.map((item) => item.code)).toEqual(['CLAIM_REQUIRED']);
  });

  test('页面合同应形成路由控件弹窗和校验四类稳定覆盖分母', async () => {
    const denominator = buildProductCenterCoverageDenominator(minimalContract());

    expect(denominator.items.map((item) => item.kind)).toEqual(['control', 'dialog', 'route', 'validation']);
    expect(new Set(denominator.items.map((item) => item.id)).size).toBe(4);
  });

  test('阻塞和不适用证据应保留在覆盖分母而不是从统计中消失', async () => {
    const contract = minimalContract();
    contract.controls![0] = {
      ...contract.controls![0],
      status: 'blocked',
      generationAllowed: false,
    };
    contract.dialogs![0] = {
      ...contract.dialogs![0],
      status: 'not-applicable',
      generationAllowed: false,
    };

    const denominator = buildProductCenterCoverageDenominator(contract);

    expect(denominator.items.map((item) => [item.kind, item.disposition])).toEqual([
      ['control', 'blocked'],
      ['dialog', 'not-applicable'],
      ['route', 'required'],
      ['validation', 'required'],
    ]);
  });

  test('覆盖分母的模块归属应以路由注册表为准', async () => {
    const denominator = buildProductCenterCoverageDenominator(minimalContract(), {
      moduleForRoute: () => 'brand-group',
    });

    expect(denominator.items.every((item) => item.module === 'brand-group')).toBe(true);
  });

  test('覆盖归并应消费重复 DOM 来源并生成单一稳定能力', async () => {
    const contract = minimalContract();
    contract.controls!.push({
      ...contract.controls![0],
      id: 'control:category-edit-child',
    });

    const denominator = buildProductCenterCoverageDenominator(contract, {
      coverageGroups: [{
        id: 'coverage:control:category-row-actions',
        kind: 'control',
        module: 'brand-item',
        route: '/pp/brand/category',
        sourceIds: ['control:category-edit', 'control:category-edit-child'],
        priority: 'P0',
        disposition: 'required',
      }],
    });

    expect(denominator.items.filter((item) => item.kind === 'control')).toEqual([{
      id: 'coverage:control:category-row-actions',
      kind: 'control',
      module: 'brand-item',
      route: '/pp/brand/category',
      sourceIds: ['control:category-edit', 'control:category-edit-child'],
      priority: 'P0',
      disposition: 'required',
    }]);
  });

  test('商品分类路由应归并为七个稳定覆盖能力', async () => {
    const denominator = buildProductCenterCoverageDenominator(
      contractDocument as unknown as ProductCenterTestContract,
      { coverageGroups: productCenterCoverageCuration },
    );
    const categoryItems = denominator.items.filter((item) => item.route === '/pp/brand/category');

    expect(categoryItems.map((item) => item.id)).toEqual([
      'coverage:control:category-add-child',
      'coverage:control:category-create',
      'coverage:control:category-expand',
      'coverage:control:category-row-actions',
      'coverage:dialog:category-row-actions',
      'coverage:route:route:b0de43a7ecd9',
      'coverage:validation:validation:0e0354674598',
    ]);
  });

  test('未被用例覆盖且没有阻塞结论的分母必须记为缺口', async () => {
    const denominator: ProductCenterCoverageItem[] = [
      coverage('coverage:route:category'),
      coverage('coverage:control:category-edit'),
      coverage('coverage:dialog:category-delete'),
    ];
    const result = auditProductCenterCoverage([completeCase], denominator);

    expect(result.summary).toEqual({ required: 3, covered: 2, missing: 1, blocked: 0, notApplicable: 0, coverageRate: 2 / 3 });
    expect(result.missing[0].id).toBe('coverage:dialog:category-delete');
  });

  test('全量范围只能由显式 coverageIds 覆盖而不能由宽泛来源代替', async () => {
    const candidate = structuredClone(completeCase);
    candidate.coverageIds = [];
    const denominator = [coverage('coverage:control:category-edit')];

    const result = auditProductCenterCoverage([candidate], denominator, { matchingMode: 'explicit-only' });

    expect(result.summary).toMatchObject({ required: 1, covered: 0, missing: 1 });
  });

  test('模块全量范围应只选择指定模块内的目标路由', async () => {
    const denominator = [
      coverage('coverage:control:category-edit'),
      coverage('coverage:dialog:category-delete'),
      { ...coverage('coverage:control:item-create'), module: 'brand-item', route: '/pp/brand/list' },
      { ...coverage('coverage:control:method-edit'), module: 'brand-group', route: '/pp/brand/option-group/method' },
    ];

    const selected = selectProductCenterCoverageDenominator(denominator, {
      moduleIds: new Set(['brand-item']),
      routes: new Set(['/pp/brand/category']),
    });

    expect(selected.map((item) => item.id)).toEqual([
      'coverage:control:category-edit',
      'coverage:dialog:category-delete',
    ]);
  });

  test('模块全量入口应只验收目标路由并要求覆盖缺口为零', async () => {
    const candidate = structuredClone(completeCase);
    candidate.coverageIds = ['coverage:control:category-edit'];
    const document = {
      schemaVersion: '1.0.0',
      cases: [{
        ...candidate,
        sourceRefs: ['fixture:category'],
        claims: candidate.claims!.map(({ sourceIds: _sourceIds, ...item }) => ({
          ...item,
          sourceRefs: ['fixture:category'],
        })),
      }],
    };
    const result = processProductCenterTestCaseIntake(document, [{
      ref: 'fixture:category',
      sourceIds: candidate.sourceIds,
    }], {
      scope: 'module-full',
      moduleIds: new Set(['brand-item']),
      routes: new Set(['/pp/brand/category']),
      knownSourceIds: new Set(candidate.sourceIds),
      denominator: [
        coverage('coverage:control:category-edit'),
        { ...coverage('coverage:control:item-create'), route: '/pp/brand/list' },
      ],
      knownRoleIds: new Set(candidate.execution!.roleIds),
      knownEnvironmentIds: new Set(candidate.execution!.environmentIds),
      knownCapabilityIds: new Set(candidate.execution!.capabilityIds),
    });

    expect(result.status).toBe('passed');
    expect(result.coverageAudit?.summary).toMatchObject({ required: 1, covered: 1, missing: 0 });
  });

  test('变更用例必须满足角色环境能力造数双终态和清理合同', async () => {
    const candidate = structuredClone(completeCase);
    candidate.execution = {
      ...candidate.execution!,
      roleIds: [],
      verificationSignals: ['ui'],
      cleanupAdapterIds: [],
    };
    const result = auditProductCenterTestCaseExecutability([candidate], {
      roleIds: new Set(['product-admin']),
      environmentIds: new Set(['balamxqa']),
      capabilityIds: new Set(['category.open', 'category.editIdentity']),
    });

    expect(result.cases[0].issues.map((item) => item.code)).toEqual([
      'ROLE_REQUIRED',
      'API_VERIFY_REQUIRED',
      'CLEANUP_ADAPTER_REQUIRED',
    ]);
  });

  test('现有四十六条 SOP 应具备语义证据和可执行性合同', async () => {
    const cases = buildProductCenterTestCaseIrCatalog();
    const semantic = auditProductCenterTestCaseSemantics(cases);
    const executable = auditProductCenterTestCaseExecutability(cases);

    expect(semantic.summary).toEqual({ total: 46, passed: 46, reviewRequired: 0 });
    expect(executable.summary).toEqual({ total: 46, executable: 46, reviewRequired: 0, manual: 0 });
  });

  test('测试方案生成门禁应区分正式生成复核阻断与刻意省略', async () => {
    const generated = structuredClone(completeCase);
    generated.coverageIds = ['coverage:control:category-edit'];
    const reviewRequired = structuredClone(completeCase);
    reviewRequired.id = 'TC-PC-PREFLIGHT-REVIEW-001';
    reviewRequired.title = '缺少可观测预期的候选用例必须进入复核';
    reviewRequired.expectedResults = [];
    reviewRequired.claims = [
      claim('precondition', '存在可编辑的审计分类', ['route:category']),
      claim('action', '打开编辑弹窗', ['control:category-edit']),
      claim('action', '填写新的分类名称', ['control:category-edit']),
      claim('action', '保存', ['control:category-edit']),
    ];
    reviewRequired.coverageIds = ['coverage:dialog:category-delete'];

    const document = {
      schemaVersion: '1.0.0',
      cases: [generated, reviewRequired].map((candidate, index) => ({
        ...candidate,
        sourceRefs: [index === 0 ? 'fixture:category-edit' : 'fixture:category-delete'],
        claims: candidate.claims!.map(({ sourceIds: _sourceIds, ...item }) => ({
          ...item,
          sourceRefs: [index === 0 ? 'fixture:category-edit' : 'fixture:category-delete'],
        })),
      })),
    };
    const result = processProductCenterTestCaseIntake(document, [
      { ref: 'fixture:category-edit', sourceIds: ['route:category', 'control:category-edit'] },
      { ref: 'fixture:category-delete', sourceIds: ['route:category', 'dialog:category-delete'] },
    ], {
      scope: 'full',
      knownSourceIds: new Set(['route:category', 'control:category-edit', 'dialog:category-delete']),
      denominator: [
        coverage('coverage:control:category-edit'),
        coverage('coverage:dialog:category-delete', 'dialog'),
        {
          ...coverage('coverage:validation:category-name-length', 'validation'),
          disposition: 'blocked',
          reason: '页面尚未暴露稳定校验信号',
        },
        {
          ...coverage('coverage:dialog:category-bulk', 'dialog'),
          disposition: 'not-applicable',
          reason: '当前模块不支持批量分类',
        },
      ],
      knownRoleIds: new Set(generated.execution!.roleIds),
      knownEnvironmentIds: new Set(generated.execution!.environmentIds),
      knownCapabilityIds: new Set(generated.execution!.capabilityIds),
    });

    expect(result.generationGate?.summary).toEqual({
      totalCases: 2,
      generated: 1,
      reviewRequired: 1,
      blocked: 1,
      intentionallyOmitted: 2,
    });
    expect(result.generationGate?.generated).toEqual([
      expect.objectContaining({ caseId: completeCase.id, coverageIds: ['coverage:control:category-edit'] }),
    ]);
    expect(result.generationGate?.reviewRequired).toEqual([
      expect.objectContaining({
        caseId: 'TC-PC-PREFLIGHT-REVIEW-001',
        issueCodes: ['EXPECTATION_REQUIRED'],
      }),
    ]);
    expect(result.generationGate?.blocked).toEqual([
      expect.objectContaining({
        coverageId: 'coverage:dialog:category-delete',
        route: '/pp/brand/category',
      }),
    ]);
    expect(result.generationGate?.intentionallyOmitted).toEqual([
      expect.objectContaining({
        coverageId: 'coverage:dialog:category-bulk',
        disposition: 'not-applicable',
      }),
      expect.objectContaining({
        coverageId: 'coverage:validation:category-name-length',
        disposition: 'blocked',
      }),
    ]);
    expect(result.generationGate?.modules).toEqual([
      expect.objectContaining({
        module: 'brand-item',
        generated: 1,
        reviewRequired: 1,
        blocked: 1,
        intentionallyOmitted: 2,
        generatedCaseIds: [completeCase.id],
        reviewRequiredCaseIds: ['TC-PC-PREFLIGHT-REVIEW-001'],
        blockedCoverageIds: ['coverage:dialog:category-delete'],
        intentionallyOmittedCoverageIds: [
          'coverage:dialog:category-bulk',
          'coverage:validation:category-name-length',
        ],
      }),
    ]);
  });

  test('case-only 范围下生成门禁不应用未覆盖分母阻断正式用例', async () => {
    const candidate = structuredClone(completeCase);
    candidate.coverageIds = ['coverage:control:category-edit'];
    const document = {
      schemaVersion: '1.0.0',
      cases: [{
        ...candidate,
        sourceRefs: ['fixture:category'],
        claims: candidate.claims!.map(({ sourceIds: _sourceIds, ...item }) => ({
          ...item,
          sourceRefs: ['fixture:category'],
        })),
      }],
    };
    const result = processProductCenterTestCaseIntake(document, [{
      ref: 'fixture:category',
      sourceIds: candidate.sourceIds,
    }], {
      scope: 'case-only',
      knownSourceIds: new Set(candidate.sourceIds),
      denominator: [
        coverage('coverage:control:category-edit'),
        coverage('coverage:dialog:category-delete', 'dialog'),
      ],
      knownRoleIds: new Set(candidate.execution!.roleIds),
      knownEnvironmentIds: new Set(candidate.execution!.environmentIds),
      knownCapabilityIds: new Set(candidate.execution!.capabilityIds),
    });

    expect(result.status).toBe('passed');
    expect(result.generationGate?.summary.blocked).toBe(0);
    expect(result.generationGate?.generated).toEqual([
      expect.objectContaining({ caseId: completeCase.id }),
    ]);
  });
});

function claim(
  kind: 'precondition' | 'action' | 'expectation',
  text: string,
  sourceIds: string[],
) {
  return {
    id: `claim:${kind}:${text}`,
    kind,
    text,
    sourceIds,
    evidenceLevel: 'observed' as const,
  };
}

function coverage(
  id: string,
  kind: ProductCenterCoverageItem['kind'] = 'control',
): ProductCenterCoverageItem {
  return {
    id,
    kind,
    module: 'brand-item',
    route: '/pp/brand/category',
    sourceIds: [id.replace(/^coverage:[^:]+:/, '')],
    priority: 'P0',
    disposition: 'required',
  };
}

function minimalContract(): ProductCenterTestContract {
  const record = (id: string, route: string) => ({
    id,
    status: 'observed' as const,
    sourceType: 'ui-runtime',
    confidence: 1,
    generationAllowed: true,
    source: [{ path: 'fixture://audit' }],
    verifiedAt: '2026-07-25',
    version: '1.0.0',
    route,
    module: 'brand-item',
    evidence: {},
  });
  return {
    metadata: {
      contractVersion: '1.0.0',
      generatedAt: '2026-07-25',
      sourceFingerprint: 'fixture',
      sourcePriority: [],
      sourceArtifacts: [],
      collections: ['routes', 'controls', 'dialogs', 'validations'],
      counts: {},
    },
    routes: [record('route:category', '/pp/brand/category')],
    controls: [record('control:category-edit', '/pp/brand/category')],
    dialogs: [record('dialog:category-delete', '/pp/brand/category')],
    validations: [record('validation:category-required', '/pp/brand/category')],
  };
}
