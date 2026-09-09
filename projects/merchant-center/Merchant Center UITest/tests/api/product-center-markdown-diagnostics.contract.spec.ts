import { expect, test } from '@playwright/test';
import {
  diagnoseProductCenterMarkdownTestPlan,
  parseProductCenterMarkdownTestCase,
} from '../../utils/product-center-test-plan-markdown';

test.describe('商品中心测试方案格式漂移诊断', () => {
  test('应输出结构化诊断且禁止自动改写业务内容', async () => {
    const result = diagnoseProductCenterMarkdownTestPlan(`
### 用例编号：TC-FORMAT-001
用例标题：格式漂移样本
所属模块：商品管理
优先级：P1
来源：XMind已有 ← 节点
前置条件：
1. 已登录
测试步骤：
点击保存
预期结果：
1. 保存成功
`);

    expect(result.status).toBe('invalid');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'NON_NUMBERED_STEP', caseId: 'TC-FORMAT-001' }),
    ]));
    expect(result.guardrails).toEqual({ businessContentMutationAllowed: false, structuralSuggestionOnly: true });
  });

  test('重复用例编号应阻断解析并给出定位', async () => {
    const block = `
### 用例编号：TC-DUPLICATE
用例标题：重复样本
所属模块：商品管理
优先级：P1
来源：XMind已有 ← 节点
前置条件：
1. 已登录
测试步骤：
1. 点击保存
预期结果：
1. 保存成功
`;
    const result = diagnoseProductCenterMarkdownTestPlan(`${block}\n${block}`);

    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_CASE_ID' }));
  });

  test('编号步骤后的缩进字段明细应作为同一步骤续行解析', async () => {
    const parsed = parseProductCenterMarkdownTestCase(`
### 用例编号：TC-CONTINUATION-001
用例标题：缩进续行样本
所属模块：商品管理
优先级：P1
来源：XMind已有 ← 标准商品 / 新增
前置条件：
1. 已登录
测试步骤：
1. 填写商品信息：
   商品名称：AUTO_AUDIT_ITEM_SAMPLE
   标准价：0
2. 点击保存
预期结果：
1. 保存成功
`, 'TC-CONTINUATION-001');

    expect(parsed.actions).toEqual([
      '填写商品信息： 商品名称：AUTO_AUDIT_ITEM_SAMPLE 标准价：0',
      '点击保存',
    ]);
  });

  test('应独立解析权威 BR 来源以及 XMind 节点后的 BR 引用', async () => {
    const parsed = parseProductCenterMarkdownTestCase(`
### 用例编号：TC-BR-001
用例标题：规格组保存规则
所属模块：商品管理
优先级：P0
来源：XMind已有 ← 规格组 / 新增 / 仅填必填项保存成功 ← BR-GRP-002 / BR-GRP-SPEC-001；BR-FMT-001、BR-ITEM-010
前置条件：
1. 已登录并进入规格组
测试步骤：
1. 填写规格组和规格明细
预期结果：
1. 规格组保存成功
`, 'TC-BR-001');

    expect(parsed.sourceCitations).toEqual([
      { kind: 'xmind-existing', citation: '规格组 / 新增 / 仅填必填项保存成功' },
      { kind: 'business-rule-explicit', citation: 'BR-GRP-002' },
      { kind: 'business-rule-explicit', citation: 'BR-GRP-SPEC-001' },
      { kind: 'business-rule-explicit', citation: 'BR-FMT-001' },
      { kind: 'business-rule-explicit', citation: 'BR-ITEM-010' },
    ]);
  });

  test('人工确认来源必须带日期或证据说明并回链权威 BR', async () => {
    const parsed = parseProductCenterMarkdownTestCase(`
### 用例编号：TC-HUMAN-001
用例标题：人工确认规则样本
所属模块：商品管理
优先级：P0
来源：人工确认 ← 2026-08-19 图01 / 做法名称必填 ← BR-GRP-005
前置条件：
1. 已进入新增页
测试步骤：
1. 保持做法名称为空并保存
预期结果：
1. 页面阻止保存
`, 'TC-HUMAN-001');

    expect(parsed.sourceCitations).toEqual([
      { kind: 'business-rule-explicit', citation: 'BR-GRP-005' },
    ]);
  });

  test('产品确认来源应支持非数字结尾的语义型规则编号', async () => {
    const parsed = parseProductCenterMarkdownTestCase(`
### 用例编号：TC-SEMANTIC-BR-001
用例标题：语义型规则编号样本
所属模块：商品管理
优先级：P0
来源：产品确认明确 ← BR-ITEM-COMBO-OPTIONAL-EDIT-BOUNDARY
前置条件：
1. 已进入套餐编辑页
测试步骤：
1. 编辑可选搭配组
预期结果：
1. 组级配置保存成功
`, 'TC-SEMANTIC-BR-001');

    expect(parsed.sourceCitations).toEqual([
      { kind: 'business-rule-explicit', citation: 'BR-ITEM-COMBO-OPTIONAL-EDIT-BOUNDARY' },
    ]);
  });

  test('正式 BR 来源允许保留带日期的确认溯源注记', async () => {
    const parsed = parseProductCenterMarkdownTestCase(`
### 用例编号：TC-BR-PROVENANCE-001
用例标题：带确认溯源的规则样本
所属模块：商品管理
优先级：P0
来源：业务规则明确 ← BR-IMG-001（2026-09-05 人工确认）
前置条件：
1. 已进入图片库
测试步骤：
1. 保存同名图片
预期结果：
1. 页面按正式规则处理
`, 'TC-BR-PROVENANCE-001');

    expect(parsed.sourceCitations).toEqual([
      { kind: 'business-rule-explicit', citation: 'BR-IMG-001' },
    ]);
  });
});
