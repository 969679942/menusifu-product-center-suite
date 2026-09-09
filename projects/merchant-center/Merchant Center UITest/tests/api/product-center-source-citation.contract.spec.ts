import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  verifyProductCenterBusinessRuleCitation,
  verifyProductCenterPrdCitation,
  verifyProductCenterXmindCitation,
} from '../../utils/product-center-source-citation';

const infoRoot = path.resolve('..', 'Merchant Center Info');
const prdPath = path.join(
  infoRoot,
  'PRD与对应测试用例',
  '1.需求品牌商品与分类.md',
);
const xmindPath = path.join(
  infoRoot,
  '00-待转换测试方案',
  '用例库',
  '商品中心-商品管理-商品',
  '1.商品中心-商品管理-商品.xmind',
);
const businessRulePath = path.join(infoRoot, '商品中心业务规则.md');
const bomXmindPath = path.resolve(
  '..',
  '..',
  'AIQA',
  '商品中心PRD',
  '测试方案',
  '商品中心_2',
  'BOM管理.xmind',
);

test.describe('商品中心原始来源引用合同', () => {
  test('应把 PRD 引用精确绑定到章节序号和原句', async () => {
    const markdown = await readFile(prdPath, 'utf8');
    const result = verifyProductCenterPrdCitation(markdown, {
      citation: '5.1.1 品牌商品 / 商品分类 3',
      sectionHeading: 'S04 分类',
      itemNumber: 3,
      itemIndent: 2,
      expectedText: '商品只能添加到叶子分类下，即分类下有商品不能再添加子分类。',
    });

    expect(result).toEqual({
      kind: 'prd-explicit',
      citation: '5.1.1 品牌商品 / 商品分类 3',
      verified: true,
      matchedLocation: 'S04 分类#3',
      matchedText: '商品只能添加到叶子分类下，即分类下有商品不能再添加子分类。',
    });
  });

  test('PRD 原句或序号漂移时必须阻断引用', async () => {
    const markdown = await readFile(prdPath, 'utf8');

    expect(() => verifyProductCenterPrdCitation(markdown, {
      citation: '5.1.1 品牌商品 / 商品分类 3',
      sectionHeading: 'S04 分类',
      itemNumber: 3,
      itemIndent: 2,
      expectedText: '分类下有商品仍可新增子分类。',
    })).toThrow(/PRD 引用原句不一致/);
  });

  test('应把 XMind 引用精确绑定到原始节点路径', async () => {
    const content = await readFile(xmindPath);
    const result = verifyProductCenterXmindCitation(content, {
      citation: '标准商品 / 新增 / 分类相关校验 / 一级分类下有商品，不可创建二级分类',
      expectedPath: [
        '标准商品',
        '新增',
        '分类相关校验（一级分类下有商品不可建二级分类/有二级分类不可建标准商品）',
        '一级分类下有商品，不可创建二级分类',
      ],
    });

    expect(result).toEqual({
      kind: 'xmind-existing',
      citation: '标准商品 / 新增 / 分类相关校验 / 一级分类下有商品，不可创建二级分类',
      verified: true,
      matchedLocation: '商品中心-商品管理测试用例 / 标准商品 / 新增 / 分类相关校验（一级分类下有商品不可建二级分类/有二级分类不可建标准商品） / 一级分类下有商品，不可创建二级分类',
      matchedText: '一级分类下有商品，不可创建二级分类',
    });
  });

  test('XMind 节点路径漂移时必须阻断引用', async () => {
    const content = await readFile(xmindPath);

    expect(() => verifyProductCenterXmindCitation(content, {
      citation: '标准商品 / 新增 / 分类相关校验 / 一级分类下有商品，不可创建二级分类',
      expectedPath: ['标准商品', '新增', '不存在的节点'],
    })).toThrow(/XMind 引用节点路径不存在/);
  });

  test('应从旧版 content.xml 精确验证 XMind 节点路径', async () => {
    const content = await readFile(bomXmindPath);
    const result = verifyProductCenterXmindCitation(content, {
      citation: 'BOM管理 / 功能 / 创建BOM / 新增BOM / 保存 / 除去失败的场景，都能成功',
      expectedPath: [
        'BOM管理',
        '功能',
        '创建BOM',
        '新增BOM',
        '保存',
        '除去失败的场景，都能成功',
      ],
    });

    expect(result).toEqual({
      kind: 'xmind-existing',
      citation: 'BOM管理 / 功能 / 创建BOM / 新增BOM / 保存 / 除去失败的场景，都能成功',
      verified: true,
      matchedLocation: 'BOM管理 / 功能 / 创建BOM / 新增BOM / 保存 / 除去失败的场景，都能成功',
      matchedText: '除去失败的场景，都能成功',
    });
  });

  test('应把 BR 引用精确绑定到附录章节、规则 ID 和原句', async () => {
    const markdown = await readFile(businessRulePath, 'utf8');
    const result = verifyProductCenterBusinessRuleCitation(markdown, {
      citation: 'BR-FMT-001',
      sectionHeading: '2.2 全局格式与输入（B 端规范）',
      ruleId: 'BR-FMT-001',
      expectedText: '[B端] 名称类字段（商品名、组名、菜单名等）：最长 **100** 字符；**首尾禁止空格**（输入含首尾空格时**保存失败**，页面拦截并提示格式校验，**不可**保存成功后自动去除）；字符间允许单空格；**禁止 emoji**；超限失去焦点飘红「内容超出限制，请重新输入」。',
    });

    expect(result).toEqual({
      kind: 'business-rule-explicit',
      citation: 'BR-FMT-001',
      verified: true,
      matchedLocation: '2.2 全局格式与输入（B 端规范）#BR-FMT-001',
      matchedText: '[B端] 名称类字段（商品名、组名、菜单名等）：最长 **100** 字符；**首尾禁止空格**（输入含首尾空格时**保存失败**，页面拦截并提示格式校验，**不可**保存成功后自动去除）；字符间允许单空格；**禁止 emoji**；超限失去焦点飘红「内容超出限制，请重新输入」。',
    });
  });

  test('BR 原句、章节或规则 ID 漂移时必须阻断引用', async () => {
    const markdown = await readFile(businessRulePath, 'utf8');
    const binding = {
      citation: 'BR-GRP-002',
      sectionHeading: '组共用规则（规格 / 口味 / 做法 / 加料 / 套餐）',
      ruleId: 'BR-GRP-002',
      expectedText: '[B端] 组名称：100 字符，**品牌内组名称不可重复**（**英文字母不区分大小写**），必填；重复提示 **`SYSTEM-0002:参数冲突`**。',
    };

    expect(() => verifyProductCenterBusinessRuleCitation(markdown, {
      ...binding,
      expectedText: '[B端] 组名称允许重复。',
    })).toThrow(/BR 引用原句不一致/);
    expect(() => verifyProductCenterBusinessRuleCitation(markdown, {
      ...binding,
      sectionHeading: '规格组专有',
    })).toThrow(/BR 引用规则不存在/);
    expect(() => verifyProductCenterBusinessRuleCitation(markdown, {
      ...binding,
      ruleId: 'BR-GRP-999',
    })).toThrow(/BR 引用规则不存在/);
  });
});
