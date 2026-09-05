import { expect, test } from '@playwright/test';
import { auditSeasoningCaseCoverage } from '../../scripts/audit-seasoning-case-coverage';
import { auditSeasoningAllureResults } from '../../scripts/audit-seasoning-allure-report';

test.describe('调味用例绑定覆盖门禁', () => {
  test('写入语义绑定只读能力时必须被识别为阻断', () => {
    const findings = auditSeasoningCaseCoverage([{
      caseId: 'TC-FLV-SEA-CONTRACT-001',
      title: '编辑调味组信息保存成功',
      action: 'read',
      capabilities: [{ id: 'merchant-center.seasoning.static-contract' }],
      assertions: [{ adapterId: 'merchant-center.seasoning.assert-static-contract' }],
    }]);
    expect(findings.map((item) => item.code)).toEqual([
      'MUTATION_ACTION_DECLARED_READ',
      'MUTATION_BOUND_TO_STATIC',
    ]);
  });

  test('完整字段和边界场景不得复用最小创建能力', () => {
    const findings = auditSeasoningCaseCoverage([{
      caseId: 'TC-FLV-SEA-CONTRACT-002',
      title: '新增调味组填写全部字段保存成功',
      action: 'create',
      capabilities: [{ id: 'merchant-center.seasoning.create-minimal' }],
    }]);
    expect(findings).toMatchObject([{
      code: 'SCENARIO_REUSES_MINIMAL_CREATE',
      severity: 'P1',
    }]);
  });

  test('只读页面、列表和查询观察不得被误判为写入场景', () => {
    const findings = auditSeasoningCaseCoverage([
      {
        caseId: 'TC-FLV-SEA-CONTRACT-003',
        title: '新增调味页面字段展示正确',
        action: 'read',
        capabilities: [{ id: 'merchant-center.seasoning.static-contract' }],
      },
      {
        caseId: 'TC-FLV-REC-CONTRACT-004',
        title: '按任务名称模糊或精确查询下发记录正确',
        action: 'read',
        capabilities: [{ id: 'merchant-center.seasoning.static-contract' }],
      },
      {
        caseId: 'TC-FLV-SEA-CONTRACT-005',
        title: '多门店品牌调味页不展示直接下发按钮',
        action: 'read',
        capabilities: [{ id: 'merchant-center.seasoning.static-contract' }],
      },
    ]);
    expect(findings).toEqual([]);
  });

  test('真实保存、删除和下发语义仍必须被识别为阻断', () => {
    const findings = auditSeasoningCaseCoverage([
      {
        caseId: 'TC-FLV-SEA-CONTRACT-006',
        title: '编辑调味项信息保存成功',
        action: 'read',
        capabilities: [{ id: 'merchant-center.seasoning.static-contract' }],
      },
      {
        caseId: 'TC-FLV-TPL-CONTRACT-007',
        title: '调味模板再次下发覆盖门店已有调味',
        action: 'boundary',
        capabilities: [{ id: 'merchant-center.seasoning.static-contract' }],
      },
    ]);
    expect(findings.map((item) => item.code)).toEqual([
      'MUTATION_ACTION_DECLARED_READ',
      'MUTATION_BOUND_TO_STATIC',
      'MUTATION_BOUND_TO_STATIC',
    ]);
  });

  test('Allure 全绿但绑定不完整时必须标记为历史证据', () => {
    const findings = auditSeasoningAllureResults([
      {
        caseId: 'TC-FLV-SEA-CONTRACT-008',
        title: '编辑调味项信息保存成功',
        action: 'read',
        capabilities: [{ id: 'merchant-center.seasoning.static-contract' }],
      },
    ], [{
      name: '编辑调味项信息保存成功',
      status: 'passed',
      labels: [{ name: 'tag', value: 'case-TC-FLV-SEA-CONTRACT-008' }],
      steps: [{ name: '页面读取：读取当前调味页面的字段、列表和操作入口', status: 'passed' }],
    }]);
    expect(findings.map((item) => item.code)).toEqual([
      'MISSING_BUSINESS_OPERATION_STEP',
      'PASSED_WITH_INCOMPLETE_BINDING',
    ]);
  });

  test('Allure 缺少正式用例结果时不得补判通过', () => {
    const findings = auditSeasoningAllureResults([{
      caseId: 'TC-FLV-SEA-CONTRACT-009',
      title: '调味列表字段展示正确',
      action: 'read',
      capabilities: [{ id: 'merchant-center.seasoning.static-contract' }],
    }], []);
    expect(findings).toEqual([expect.objectContaining({
      code: 'RESULT_CASE_NOT_FOUND',
    })]);
  });
});
