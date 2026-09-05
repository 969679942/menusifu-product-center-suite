import { expect, test } from '@playwright/test';
import {
  auditProductCenterTestCases,
  normalizeProductCenterTestCaseDrafts,
  processProductCenterTestCaseIntake,
  validateProductCenterTestCaseDraftDocument,
  type ProductCenterTestCaseInput,
} from '../../utils/product-center-test-case-ir';
import { buildProductCenterTestCaseIrCatalog } from '../../sop/product-center/product-center-test-case-ir.catalog';
import { auditProductCenterTestCaseSemantics } from '../../utils/product-center-test-case-semantics';

const completeMutationCase: ProductCenterTestCaseInput = {
  id: 'TC-PC-IR-001',
  module: 'brand-group',
  route: '/pp/brand/category',
  title: '应能编辑商品分类',
  priority: 'P0',
  sourceIds: ['route:brand-category', 'control:brand-category-edit'],
  preconditions: ['存在可编辑的审计分类'],
  actions: ['打开编辑弹窗', '填写新的分类名称', '保存'],
  expectedResults: ['列表显示新的分类名称', '查询接口返回新的分类名称'],
  mutatesData: true,
  cleanup: ['按服务端 ID 删除审计分类', '验证审计分类不存在'],
};

test.describe('商品中心测试用例 IR 合同', () => {
  test('证据完整且具备清理方案的变更用例应判定可自动化', async () => {
    const result = auditProductCenterTestCases([completeMutationCase]);

    expect(result.summary).toEqual({ total: 1, eligible: 1, reviewRequired: 0, manual: 0 });
    expect(result.cases[0]).toMatchObject({
      id: 'TC-PC-IR-001',
      automation: { decision: 'eligible', reasons: [] },
    });
  });

  test('缺少来源、预期或变更清理的用例必须进入审核队列', async () => {
    const result = auditProductCenterTestCases([{
      ...completeMutationCase,
      id: 'TC-PC-IR-002',
      sourceIds: [],
      expectedResults: [],
      cleanup: [],
    }]);

    expect(result.summary).toEqual({ total: 1, eligible: 0, reviewRequired: 1, manual: 0 });
    expect(result.cases[0].issues.map((item) => item.code)).toEqual([
      'SOURCE_REQUIRED',
      'EXPECTATION_REQUIRED',
      'CLEANUP_REQUIRED',
    ]);
  });

  test('现有四十六条 SOP 应回填为可追溯的测试用例 IR', async () => {
    const cases = buildProductCenterTestCaseIrCatalog();
    const result = auditProductCenterTestCases(cases);

    expect(cases).toHaveLength(46);
    expect(new Set(cases.map((item) => item.id)).size).toBe(46);
    expect(cases.every((item) => item.sourceIds.length > 0)).toBe(true);
    expect(cases.every((item) => item.module !== 'product-center')).toBe(true);
    expect(result.summary).toEqual({ total: 46, eligible: 46, reviewRequired: 0, manual: 0 });
  });

  test('已完成精确来源和运行验收的描述标签删除 Claim 应分批退出 legacy', async () => {
    const cases = buildProductCenterTestCaseIrCatalog();
    const target = cases.find((item) => item.id === 'delete:description-tag');

    expect(target?.claims?.map((claim) => ({
      kind: claim.kind,
      evidenceLevel: claim.evidenceLevel,
      businessBasis: claim.sourceTrace?.businessBasis,
    }))).toEqual([
      {
        kind: 'precondition',
        evidenceLevel: 'observed',
        businessBasis: {
          kind: 'legacy-baseline',
          refs: ['LEGACY-SOP:delete:description-tag'],
        },
      },
      {
        kind: 'action',
        evidenceLevel: 'confirmed',
        businessBasis: {
          kind: 'xmind-existing',
          refs: [
            'TEST-PLAN:4.商品中心-商品管理-标签管理-正式测试用例.md#TC-TAG-DESC-017',
            'XMIND:4.商品中心-商品管理-标签管理.xmind#描述标签 / 删除 / 标签删除 / 标签未被引用，未被引用的标签可删除成功',
          ],
        },
      },
      {
        kind: 'expectation',
        evidenceLevel: 'confirmed',
        businessBasis: {
          kind: 'xmind-existing',
          refs: [
            'TEST-PLAN:4.商品中心-商品管理-标签管理-正式测试用例.md#TC-TAG-DESC-017',
            'XMIND:4.商品中心-商品管理-标签管理.xmind#描述标签 / 删除 / 标签删除 / 标签未被引用，未被引用的标签可删除成功',
          ],
        },
      },
    ]);
  });

  test('Gold 与主集合交集仅迁移有正式来源的动作和预期 Claim', async () => {
    const cases = buildProductCenterTestCaseIrCatalog();
    const expectedBasisByCaseId = new Map([
      ['negative:category-child-blocked-by-product', {
        action: {
          kind: 'xmind-existing',
          refs: [
            'TEST-PLAN:1.需求品牌商品与分类-测试用例.md#TC-需求1-150',
            'XMIND:1.商品中心-商品管理-商品.xmind#标准商品 / 新增 / 分类相关校验 / 一级分类下有商品，不可创建二级分类',
          ],
        },
        expectation: {
          kind: 'prd-explicit',
          refs: [
            'TEST-PLAN:1.需求品牌商品与分类-测试用例.md#TC-需求1-150',
            'PRD:1.需求品牌商品与分类.md#5.1.1 品牌商品 / 商品分类 3',
          ],
        },
      }],
      ['create:seasoning', {
        action: {
          kind: 'xmind-existing',
          refs: [
            'TEST-PLAN:3.商品中心-商品管理-调味管理-正式测试用例.md#TC-FLV-SEA-018',
            'XMIND:3.商品中心-商品管理-调味管理.xmind#新增 / 新增 / 新增调味组，只填必填参数，能新增成功 / 新增调味组，只填必填参数，能新增成功',
          ],
        },
        expectation: {
          kind: 'xmind-existing',
          refs: [
            'TEST-PLAN:3.商品中心-商品管理-调味管理-正式测试用例.md#TC-FLV-SEA-018',
            'XMIND:3.商品中心-商品管理-调味管理.xmind#新增 / 新增 / 新增调味组，只填必填参数，能新增成功 / 新增调味组，只填必填参数，能新增成功',
          ],
        },
      }],
      ['create:bom', sameClaimBasis(
        'xmind-existing',
        'XMIND:BOM管理.xmind#BOM管理 / 功能 / 创建BOM / 新增BOM / 保存 / 除去失败的场景，都能成功',
      )],
      ['delete:print-stall', sameClaimBasis(
        'xmind-existing',
        'XMIND:打印档口.xmind#打印档口 / 打印档口管理 / 操作 / 删除 / 档口未关联商品',
      )],
      ['delete:menu', sameClaimBasis(
        'xmind-existing',
        'XMIND:商品中心-菜单管理-菜单.xmind#商品中心-菜单 / 菜单 / 菜单管理 / 删除 / 删除不在使用的菜单，删除成功 / 菜单1没有门店使用',
      )],
      ['delete:tax', {
        action: {
          kind: 'xmind-existing',
          refs: [
            'XMIND:商品中心-门店商品管理-税种管理.xmind#税种测试方案 / 功能 / 税种相关验证 / 未关联商品税种 / 税种删除 / 自定义税种删除',
          ],
        },
        expectation: {
          kind: 'business-rule-explicit',
          refs: ['BUSINESS-RULE:商品中心业务规则.md#BR-TAX-007'],
        },
      }],
    ]);

    for (const [caseId, expected] of expectedBasisByCaseId) {
      const target = cases.find((item) => item.id === caseId);
      expect(target, `缺少主集合用例 ${caseId}`).toBeDefined();
      expect(target?.claims?.find((claim) => claim.kind === 'precondition')?.sourceTrace?.businessBasis)
        .toEqual({ kind: 'legacy-baseline', refs: [`LEGACY-SOP:${caseId}`] });
      expect(target?.claims?.find((claim) => claim.kind === 'action')).toMatchObject({
        evidenceLevel: 'confirmed',
        sourceTrace: { businessBasis: expected.action },
      });
      expect(target?.claims?.find((claim) => claim.kind === 'expectation')).toMatchObject({
        evidenceLevel: 'confirmed',
        sourceTrace: { businessBasis: expected.expectation },
      });
    }

    const migratedClaims = cases.flatMap((item) => item.claims ?? [])
      .filter((claim) => claim.sourceTrace?.businessBasis.kind !== 'legacy-baseline');
    expect(migratedClaims).toHaveLength(14);
    expect(migratedClaims.every((claim) => claim.kind !== 'precondition')).toBe(true);
  });

  test('人工来源引用应归一化为稳定合同来源 ID', async () => {
    const result = normalizeProductCenterTestCaseDrafts([{
      ...completeMutationCase,
      sourceRefs: ['PRD:商品分类#编辑'],
      claims: [],
      coverageIds: [],
      execution: {
        roleIds: ['merchant-center-product-admin'],
        environmentIds: ['balamxqa'],
        capabilityIds: ['category.editIdentity'],
        mutationMode: 'api-seeded-ui-action',
        verificationSignals: ['api', 'ui'],
        seedAdapterIds: ['productCenter.seedCore'],
        cleanupAdapterIds: ['productCenter.cleanupSeed'],
        asyncPolicy: 'none',
      },
    }], [{ ref: 'PRD:商品分类#编辑', sourceIds: ['rule:category-edit', 'route:brand-category'] }]);

    expect(result.unresolvedSources).toEqual([]);
    expect(result.cases[0].sourceIds).toEqual(['route:brand-category', 'rule:category-edit']);
  });

  test('重复 ID 和未知合同来源必须阻断自动化生成', async () => {
    const firstCase = { ...completeMutationCase, sourceIds: ['route:brand-category', 'missing:edit'] };
    const result = auditProductCenterTestCases(
      [firstCase, { ...firstCase }],
      { knownSourceIds: new Set(['route:brand-category']) },
    );

    expect(result.summary).toEqual({ total: 2, eligible: 0, reviewRequired: 2, manual: 0 });
    expect(result.cases[0].issues.map((item) => item.code)).toEqual(['DUPLICATE_ID', 'UNKNOWN_SOURCE']);
  });

  test('明确要求人工执行且审计通过的用例应保留人工分类', async () => {
    const result = auditProductCenterTestCases([{
      ...completeMutationCase,
      automationPreference: 'manual',
    }]);

    expect(result.summary).toEqual({ total: 1, eligible: 0, reviewRequired: 0, manual: 1 });
    expect(result.cases[0].automation.decision).toBe('manual');
  });

  test('AI 转换后的用例文档缺少必要字段时必须在入口阻断', async () => {
    const result = validateProductCenterTestCaseDraftDocument({
      schemaVersion: '1.0.0',
      cases: [{ id: 'TC-PC-INVALID', title: '缺少执行信息的用例' }],
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((item) => item.path)).toEqual([
      'cases[0].module',
      'cases[0].route',
      'cases[0].priority',
      'cases[0].sourceRefs',
      'cases[0].preconditions',
      'cases[0].actions',
      'cases[0].expectedResults',
      'cases[0].mutatesData',
      'cases[0].cleanup',
      'cases[0].claims',
      'cases[0].coverageIds',
      'cases[0].execution',
    ]);
  });

  test('权威业务规则应作为独立业务依据类型通过 IR 来源校验', async () => {
    const result = validateProductCenterTestCaseDraftDocument({
      schemaVersion: '1.0.0',
      cases: [{
        id: 'TC-PC-BR-001',
        claims: [{
          id: 'claim:action:1',
          kind: 'action',
          text: '填写符合规则的商品名称',
          sourceRefs: ['BR-FMT-001'],
          evidenceLevel: 'confirmed',
          sourceTrace: {
            businessBasis: { kind: 'business-rule-explicit', refs: ['BR-FMT-001'] },
            executionEvidence: [],
          },
        }],
      }],
    });

    expect(result.issues).not.toContainEqual(expect.objectContaining({
      path: 'cases[0].claims[0].sourceTrace.businessBasis.kind',
    }));
  });

  test('完整输入文档应经过基础语义覆盖和可执行性统一门禁', async () => {
    const document = {
      schemaVersion: '1.0.0',
      cases: [{
        id: completeMutationCase.id,
        module: completeMutationCase.module,
        route: completeMutationCase.route,
        title: completeMutationCase.title,
        priority: completeMutationCase.priority,
        sourceRefs: ['PRD:商品分类#编辑'],
        preconditions: completeMutationCase.preconditions,
        actions: completeMutationCase.actions,
        expectedResults: completeMutationCase.expectedResults,
        mutatesData: completeMutationCase.mutatesData,
        cleanup: completeMutationCase.cleanup,
        automationPreference: 'candidate',
        claims: [
          { id: 'claim:precondition:1', kind: 'precondition', text: '存在可编辑的审计分类', sourceRefs: ['PRD:商品分类#编辑'], evidenceLevel: 'confirmed' },
          { id: 'claim:action:1', kind: 'action', text: '打开编辑弹窗', sourceRefs: ['PRD:商品分类#编辑'], evidenceLevel: 'confirmed' },
          { id: 'claim:action:2', kind: 'action', text: '填写新的分类名称', sourceRefs: ['PRD:商品分类#编辑'], evidenceLevel: 'confirmed' },
          { id: 'claim:action:3', kind: 'action', text: '保存', sourceRefs: ['PRD:商品分类#编辑'], evidenceLevel: 'confirmed' },
          { id: 'claim:expectation:1', kind: 'expectation', text: '列表显示新的分类名称', sourceRefs: ['PRD:商品分类#编辑'], evidenceLevel: 'confirmed' },
          { id: 'claim:expectation:2', kind: 'expectation', text: '查询接口返回新的分类名称', sourceRefs: ['PRD:商品分类#编辑'], evidenceLevel: 'confirmed' },
        ],
        coverageIds: ['coverage:control:rule:category-edit'],
        execution: {
          roleIds: ['merchant-center-product-admin'],
          environmentIds: ['balamxqa'],
          capabilityIds: ['category.editIdentity'],
          mutationMode: 'api-seeded-ui-action',
          verificationSignals: ['api', 'ui'],
          seedAdapterIds: ['productCenter.seedCore'],
          cleanupAdapterIds: ['productCenter.cleanupSeed'],
          asyncPolicy: 'none',
        },
      }],
    };

    const result = processProductCenterTestCaseIntake(
      document,
      [{ ref: 'PRD:商品分类#编辑', sourceIds: ['rule:category-edit'] }],
      {
        scope: 'case-only',
        knownSourceIds: new Set(['rule:category-edit']),
        denominator: [{
          id: 'coverage:control:rule:category-edit',
          kind: 'control',
          module: 'brand-group',
          route: '/pp/brand/category',
          sourceIds: ['rule:category-edit'],
          priority: 'P0',
          disposition: 'required',
        }],
        knownRoleIds: new Set(['merchant-center-product-admin']),
        knownEnvironmentIds: new Set(['balamxqa']),
        knownCapabilityIds: new Set(['category.editIdentity']),
      },
    );

    expect(result.status).toBe('passed');
    expect(result.baseAudit?.summary).toEqual({ total: 1, eligible: 1, reviewRequired: 0, manual: 0 });
    expect(result.semanticAudit?.summary).toEqual({ total: 1, passed: 1, reviewRequired: 0 });
    expect(result.coverageAudit?.summary).toMatchObject({ required: 1, covered: 1, missing: 0 });
    expect(result.executabilityAudit?.summary).toEqual({ total: 1, executable: 1, reviewRequired: 0, manual: 0 });
    expect(result.corrections).toEqual([]);
    expect(result.normalizedCases?.[0].claims?.every((claim) => claim.sourceIds[0] === 'rule:category-edit')).toBe(true);
  });

  test('严格一步可推导的语句在声明来源分级后可进入正式生成', async () => {
    const document = {
      schemaVersion: '1.0.0',
      cases: [{
        id: completeMutationCase.id,
        module: completeMutationCase.module,
        route: completeMutationCase.route,
        title: completeMutationCase.title,
        priority: completeMutationCase.priority,
        sourceRefs: ['PRD:商品分类#编辑', 'XMind:商品分类#编辑回归'],
        preconditions: completeMutationCase.preconditions,
        actions: completeMutationCase.actions,
        expectedResults: completeMutationCase.expectedResults,
        mutatesData: completeMutationCase.mutatesData,
        cleanup: completeMutationCase.cleanup,
        automationPreference: 'candidate',
        claims: [
          {
            id: 'claim:precondition:1',
            kind: 'precondition',
            text: '存在可编辑的审计分类',
            sourceRefs: ['PRD:商品分类#编辑'],
            evidenceLevel: 'confirmed',
            sourceTrace: explicitTrace('prd-explicit', 'PRD:商品分类#编辑', 'rule:category-edit'),
          },
          {
            id: 'claim:action:1',
            kind: 'action',
            text: '打开编辑弹窗',
            sourceRefs: ['XMind:商品分类#编辑回归'],
            evidenceLevel: 'confirmed',
            sourceTrace: explicitTrace('xmind-existing', 'XMind:商品分类#编辑回归', 'rule:category-edit'),
          },
          {
            id: 'claim:action:2',
            kind: 'action',
            text: '填写新的分类名称',
            sourceRefs: ['PRD:商品分类#编辑'],
            evidenceLevel: 'confirmed',
            sourceTrace: explicitTrace('prd-explicit', 'PRD:商品分类#编辑', 'rule:category-edit'),
          },
          {
            id: 'claim:action:3',
            kind: 'action',
            text: '保存',
            sourceRefs: ['PRD:商品分类#编辑'],
            evidenceLevel: 'confirmed',
            sourceTrace: explicitTrace('prd-explicit', 'PRD:商品分类#编辑', 'rule:category-edit'),
          },
          {
            id: 'claim:expectation:1',
            kind: 'expectation',
            text: '列表显示新的分类名称',
            sourceRefs: ['PRD:商品分类#编辑'],
            evidenceLevel: 'confirmed',
            sourceTrace: explicitTrace('prd-explicit', 'PRD:商品分类#编辑', 'rule:category-edit'),
          },
          {
            id: 'claim:expectation:2',
            kind: 'expectation',
            text: '查询接口返回新的分类名称',
            sourceRefs: ['PRD:商品分类#编辑'],
            evidenceLevel: 'inferred',
            sourceTrace: inferredTrace(
              'PRD:商品分类#编辑',
              'rule:category-edit',
              '保存成功后列表刷新会读取最新分类名称',
            ),
          },
        ],
        coverageIds: ['coverage:control:rule:category-edit'],
        execution: {
          roleIds: ['merchant-center-product-admin'],
          environmentIds: ['balamxqa'],
          capabilityIds: ['category.editIdentity'],
          mutationMode: 'api-seeded-ui-action',
          verificationSignals: ['api', 'ui'],
          seedAdapterIds: ['productCenter.seedCore'],
          cleanupAdapterIds: ['productCenter.cleanupSeed'],
          asyncPolicy: 'none',
        },
      }],
    };

    const result = processProductCenterTestCaseIntake(
      document,
      [
        { ref: 'PRD:商品分类#编辑', sourceIds: ['rule:category-edit'] },
        { ref: 'XMind:商品分类#编辑回归', sourceIds: ['rule:category-edit'] },
      ],
      {
        scope: 'case-only',
        knownSourceIds: new Set(['rule:category-edit']),
        denominator: [{
          id: 'coverage:control:rule:category-edit',
          kind: 'control',
          module: 'brand-group',
          route: '/pp/brand/category',
          sourceIds: ['rule:category-edit'],
          priority: 'P0',
          disposition: 'required',
        }],
        knownRoleIds: new Set(['merchant-center-product-admin']),
        knownEnvironmentIds: new Set(['balamxqa']),
        knownCapabilityIds: new Set(['category.editIdentity']),
      },
    );

    expect(result.status).toBe('passed');
    expect(result.semanticAudit?.summary).toEqual({ total: 1, passed: 1, reviewRequired: 0 });
    expect(result.normalizedCases?.[0].claims?.find((claim) => claim.id === 'claim:expectation:2'))
      .toMatchObject({
        evidenceLevel: 'inferred',
        sourceTrace: {
          businessBasis: {
            kind: 'single-step-inference',
            refs: ['PRD:商品分类#编辑'],
            rationale: '保存成功后列表刷新会读取最新分类名称',
            hopCount: 1,
          },
          executionEvidence: [{
            kind: 'contract-observed',
            sourceIds: ['rule:category-edit'],
          }],
        },
      });
  });

  test('推导语句缺少一步推导依据时必须进入审核队列', async () => {
    const document = {
      schemaVersion: '1.0.0',
      cases: [{
        id: completeMutationCase.id,
        module: completeMutationCase.module,
        route: completeMutationCase.route,
        title: completeMutationCase.title,
        priority: completeMutationCase.priority,
        sourceRefs: ['PRD:商品分类#编辑'],
        preconditions: completeMutationCase.preconditions,
        actions: completeMutationCase.actions,
        expectedResults: completeMutationCase.expectedResults,
        mutatesData: completeMutationCase.mutatesData,
        cleanup: completeMutationCase.cleanup,
        automationPreference: 'candidate',
        claims: [
          { id: 'claim:precondition:1', kind: 'precondition', text: '存在可编辑的审计分类', sourceRefs: ['PRD:商品分类#编辑'], evidenceLevel: 'confirmed', sourceTrace: explicitTrace('prd-explicit', 'PRD:商品分类#编辑', 'rule:category-edit') },
          { id: 'claim:action:1', kind: 'action', text: '打开编辑弹窗', sourceRefs: ['PRD:商品分类#编辑'], evidenceLevel: 'confirmed', sourceTrace: explicitTrace('prd-explicit', 'PRD:商品分类#编辑', 'rule:category-edit') },
          { id: 'claim:action:2', kind: 'action', text: '填写新的分类名称', sourceRefs: ['PRD:商品分类#编辑'], evidenceLevel: 'confirmed', sourceTrace: explicitTrace('prd-explicit', 'PRD:商品分类#编辑', 'rule:category-edit') },
          { id: 'claim:action:3', kind: 'action', text: '保存', sourceRefs: ['PRD:商品分类#编辑'], evidenceLevel: 'confirmed', sourceTrace: explicitTrace('prd-explicit', 'PRD:商品分类#编辑', 'rule:category-edit') },
          { id: 'claim:expectation:1', kind: 'expectation', text: '列表显示新的分类名称', sourceRefs: ['PRD:商品分类#编辑'], evidenceLevel: 'confirmed', sourceTrace: explicitTrace('prd-explicit', 'PRD:商品分类#编辑', 'rule:category-edit') },
          {
            id: 'claim:expectation:2',
            kind: 'expectation',
            text: '查询接口返回新的分类名称',
            sourceRefs: ['PRD:商品分类#编辑'],
            evidenceLevel: 'inferred',
          },
        ],
        coverageIds: ['coverage:control:rule:category-edit'],
        execution: {
          roleIds: ['merchant-center-product-admin'],
          environmentIds: ['balamxqa'],
          capabilityIds: ['category.editIdentity'],
          mutationMode: 'api-seeded-ui-action',
          verificationSignals: ['api', 'ui'],
          seedAdapterIds: ['productCenter.seedCore'],
          cleanupAdapterIds: ['productCenter.cleanupSeed'],
          asyncPolicy: 'none',
        },
      }],
    };

    const result = processProductCenterTestCaseIntake(
      document,
      [{ ref: 'PRD:商品分类#编辑', sourceIds: ['rule:category-edit'] }],
      {
        scope: 'case-only',
        knownSourceIds: new Set(['rule:category-edit']),
        denominator: [{
          id: 'coverage:control:rule:category-edit',
          kind: 'control',
          module: 'brand-group',
          route: '/pp/brand/category',
          sourceIds: ['rule:category-edit'],
          priority: 'P0',
          disposition: 'required',
        }],
        knownRoleIds: new Set(['merchant-center-product-admin']),
        knownEnvironmentIds: new Set(['balamxqa']),
        knownCapabilityIds: new Set(['category.editIdentity']),
      },
    );

    expect(result.status).toBe('review-required');
    expect(result.semanticAudit?.cases[0].issues.map((item) => item.code)).toContain('INFERENCE_TRACE_REQUIRED');
    expect(result.generationGate?.reviewRequired[0].issueCodes).toContain('INFERENCE_TRACE_REQUIRED');
  });

  test('模糊动作和不可观测预期必须进入审核队列', async () => {
    const sourceIds = ['rule:category-edit'];
    const vagueCase: ProductCenterTestCaseInput = {
      ...completeMutationCase,
      actions: ['按用例标题描述执行操作', '核对页面展示与业务规则'],
      expectedResults: ['页面展示正常'],
      claims: [
        {
          id: 'claim:vague:action:1',
          kind: 'action',
          text: '按用例标题描述执行操作',
          sourceIds,
          evidenceLevel: 'confirmed',
        },
        {
          id: 'claim:vague:action:2',
          kind: 'action',
          text: '核对页面展示与业务规则',
          sourceIds,
          evidenceLevel: 'confirmed',
        },
        {
          id: 'claim:vague:expectation:1',
          kind: 'expectation',
          text: '页面展示正常',
          sourceIds,
          evidenceLevel: 'confirmed',
        },
        ...completeMutationCase.preconditions.map((text, index) => ({
          id: `claim:vague:precondition:${index + 1}`,
          kind: 'precondition' as const,
          text,
          sourceIds,
          evidenceLevel: 'confirmed' as const,
        })),
      ],
    };

    const result = auditProductCenterTestCaseSemantics([vagueCase]);

    expect(result.summary).toEqual({ total: 1, passed: 0, reviewRequired: 1 });
    expect(result.cases[0].issues.map((item) => item.code)).toEqual([
      'VAGUE_ACTION',
      'VAGUE_ACTION',
      'VAGUE_EXPECTATION',
    ]);
    expect(result.corrections.map((item) => item.reason)).toEqual([
      'vague-action',
      'vague-action',
      'vague-expectation',
    ]);
  });

  test('全量范围存在未覆盖分母时必须进入审核队列', async () => {
    const document = {
      schemaVersion: '1.0.0',
      cases: [],
    };
    const result = processProductCenterTestCaseIntake(document, [], {
      scope: 'full',
      knownSourceIds: new Set<string>(),
      denominator: [{
        id: 'coverage:route:category',
        kind: 'route',
        module: 'brand-group',
        route: '/pp/brand/category',
        sourceIds: ['route:category'],
        priority: 'P0',
        disposition: 'required',
      }],
    });

    expect(result.status).toBe('review-required');
    expect(result.coverageAudit?.summary.missing).toBe(1);
  });
});

function explicitTrace(
  kind: 'prd-explicit' | 'xmind-existing',
  ref: string,
  sourceId: string,
) {
  return {
    businessBasis: { kind, refs: [ref] },
    executionEvidence: [{ kind: 'contract-observed' as const, sourceIds: [sourceId] }],
  };
}

function sameClaimBasis(kind: 'xmind-existing', ref: string) {
  const basis = { kind, refs: [ref] };
  return { action: basis, expectation: basis };
}

function inferredTrace(ref: string, sourceId: string, rationale: string) {
  return {
    businessBasis: {
      kind: 'single-step-inference' as const,
      refs: [ref],
      rationale,
      hopCount: 1 as const,
    },
    executionEvidence: [{
      kind: 'contract-observed' as const,
      sourceIds: [sourceId],
    }],
  };
}
