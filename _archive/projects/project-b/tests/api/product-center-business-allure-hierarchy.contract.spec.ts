import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  assertAllureAttachmentSourcesExist,
  normalizeMerchantCenterAllureResults,
} from '../../adapters/test-automation-platform/allure-reporting';
import type {
  AllureBusinessReportResult,
  AllureReportStep,
} from '../../../../Test Automation Platform/src/reporters/allure-report-integrity';

type NormalizedResult = AllureBusinessReportResult & {
  statusDetails?: { message?: string };
  labels?: Array<{ name: string; value: string }>;
};

const caseId = 'TC-GRP-ADD-001';

test.describe('商品中心非调味 Allure 五层业务报告', () => {
  test('嵌套业务步骤引用缺失附件时必须在报告生成前阻断', ({}, testInfo) => {
    const resultsDir = testInfo.outputPath('missing-nested-attachment');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(path.join(resultsDir, 'case-result.json'), JSON.stringify({
      status: 'passed',
      steps: [{
        name: '[业务操作] 创建商品',
        status: 'passed',
        steps: [{
          name: '操作收据',
          status: 'passed',
          attachments: [{ name: '业务操作执行收据', source: 'missing-receipt.json', type: 'application/json' }],
        }],
      }],
    }, null, 2));

    expect(() => assertAllureAttachmentSourcesExist(resultsDir)).toThrow('附件引用缺失');
  });

  test('当前标准收据必须生成五层中文步骤并把证据绑定到对应业务层', ({}, testInfo) => {
    const resultsDir = testInfo.outputPath('complete-receipt');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(path.join(resultsDir, 'receipt.json'), JSON.stringify({
      receiptVersion: '3.1.0',
      caseId,
      claims: {
        required: [`${caseId}:expectation-1`],
        observed: [`${caseId}:expectation-1`],
        verified: [`${caseId}:expectation-1`],
      },
      operationReceipts: [{
        operationKey: 'GroupListPage.open',
        title: '打开加料组列表页',
        sequence: 1,
        method: 'open',
        observed: true,
        status: 'passed',
      }],
      cleanup: { apiZeroResidue: true, uiZeroResidue: true, uiVerificationObserved: true },
      complete: true,
      missingEvidence: [],
      missingAssertions: [],
    }, null, 2));
    fs.writeFileSync(path.join(resultsDir, 'observation.json'), JSON.stringify({
      caseId,
      evidence: {
        查询区可见: true,
        列表区可见: true,
        新增入口可见: true,
      },
    }, null, 2));
    const resultPath = path.join(resultsDir, 'case-result.json');
    fs.writeFileSync(resultPath, JSON.stringify({
      name: '加料组列表页展示正确',
      status: 'passed',
      labels: [{ name: 'tag', value: `case-${caseId}` }],
      attachments: [],
      steps: [
        {
          name: 'Before Hooks',
          status: 'passed',
          steps: [{ name: '建立商户中心登录态', status: 'passed', steps: [], attachments: [] }],
          attachments: [],
        },
        { name: 'Fill locator("#name")', status: 'passed', steps: [], attachments: [] },
        {
          name: `执行结论：通过｜${caseId}`,
          status: 'passed',
          steps: [],
          attachments: [
            { name: 'test-execution-receipt', source: 'receipt.json', type: 'application/json' },
            { name: `${caseId}-runtime-evidence`, source: 'observation.json', type: 'application/json' },
          ],
        },
      ],
    }, null, 2));

    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(1);
    const normalized = readResult(resultPath);
    expect(normalized.status).toBe('passed');
    expect(normalized.attachments).toEqual([]);
    expect(normalized.steps?.map((step) => step.name)).toEqual([
      '[环境] 登录 → 商品中心 → 商品管理 → 加料组',
      '[业务操作] 加料组列表页展示正确',
      '[断言] 核对「加料组列表页展示正确」预期结果',
      '[清理] 清理测试数据并确认 UI/API 零残留',
      `执行结论：通过｜${caseId}`,
    ]);
    const operation = normalized.steps?.[1];
    expect(operation?.steps?.[0]?.name).toBe('操作1：进入 商品管理 → 加料组 列表页。');
    expect(operation?.attachments).toEqual([
      { name: '业务操作执行收据（点击查看）', source: 'receipt.json', type: 'application/json' },
    ]);
    const assertion = normalized.steps?.[2];
    expect(assertion?.steps?.[0]?.name).toContain('期望：查询区、列表区、新增入口展示正常。');
    expect(assertion?.steps?.[0]?.name).toContain('查询区可见：是');
    expect(assertion?.steps?.[0]?.name).toContain('结果：通过');
    expect(assertion?.attachments).toEqual([
      { name: '断言期望与实际观测（点击查看）', source: 'observation.json', type: 'application/json' },
    ]);
    expect(normalized.steps?.[4]?.steps?.[0]?.name).toBe('结论摘要：业务操作 1 项｜断言 1 项｜清理已声明｜证据完整');
    expect(flattenSteps(normalized.steps ?? []).join('\n')).not.toMatch(/Before Hooks|Fill locator|group-key|conversion-status/);
    expect(normalized.labels).toEqual(expect.arrayContaining([
      { name: 'caseId', value: caseId },
      { name: 'feature', value: '商品管理-组' },
      { name: 'story', value: '商品管理 → 加料组' },
      { name: 'parentSuite', value: '商品中心 / 商品管理-组' },
    ]));
    expect(normalized.labels?.some((label) => label.name === 'subSuite')).toBe(false);
    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(0);
  });

  test('缺少当前标准执行收据时通过结果必须降级为证据不完整', ({}, testInfo) => {
    const resultsDir = testInfo.outputPath('missing-receipt');
    fs.mkdirSync(resultsDir, { recursive: true });
    const resultPath = path.join(resultsDir, 'case-result.json');
    fs.writeFileSync(resultPath, JSON.stringify({
      name: '加料组列表页展示正确',
      status: 'passed',
      labels: [{ name: 'tag', value: `case-${caseId}` }],
      attachments: [],
      steps: [{ name: '打开加料组列表页', status: 'passed', steps: [], attachments: [] }],
    }, null, 2));

    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(1);
    const normalized = readResult(resultPath);
    expect(normalized.status).toBe('failed');
    expect(normalized.statusDetails?.message).toContain('缺少当前标准执行收据');
    expect(normalized.steps?.[4]?.name).toBe(`执行结论：失败（证据不完整）｜${caseId}`);
    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(0);
  });

  test('完整错配收据必须生成中文产品缺陷结论和结构化差异附件', ({}, testInfo) => {
    const resultsDir = testInfo.outputPath('product-difference');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(path.join(resultsDir, 'receipt.json'), JSON.stringify({
      caseId,
      executionContext: { route: '/pp/brand/add-ons' },
      claims: {
        required: [`${caseId}:expectation-1`],
        observed: [`${caseId}:expectation-1`],
        verified: [],
      },
      assertionReceipts: [{
        claimId: `${caseId}:expectation-1`,
        status: 'observed-mismatch',
        expectedValue: '列表展示查询区和新增入口',
        actualValue: '列表缺少新增入口',
        actualStatus: 'observed',
        observationChannel: 'ui',
        authority: 'user-visible',
        comparison: 'mismatched',
      }],
      operationReceipts: [{ operationKey: 'GroupListPage.open', observed: true, status: 'passed' }],
      cleanup: { apiZeroResidue: true, uiZeroResidue: true, uiVerificationObserved: true },
    }, null, 2));
    const resultPath = path.join(resultsDir, 'case-result.json');
    fs.writeFileSync(resultPath, JSON.stringify({
      name: '加料组列表页展示正确',
      status: 'failed',
      statusDetails: { message: 'expect received mismatch' },
      labels: [{ name: 'tag', value: `case-${caseId}` }],
      steps: [{
        name: '执行失败', status: 'failed', steps: [],
        attachments: [{ name: 'test-execution-receipt', source: 'receipt.json', type: 'application/json' }],
      }],
    }, null, 2));

    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(1);
    const normalized = readResult(resultPath);
    expect(normalized.statusDetails?.message).toContain(`${caseId} PRODUCT-DEFECT`);
    const assertion = normalized.steps?.find((step) => step.name?.startsWith('[断言]'));
    const difference = assertion?.attachments?.find((item) => item.name === '产品差异证据（点击查看）');
    expect(difference?.source).toBe('receipt-product-difference.json');
    expect(JSON.parse(fs.readFileSync(path.join(resultsDir, String(difference?.source)), 'utf8'))).toMatchObject({
      caseId,
      evidenceComplete: true,
      productMismatchConfirmed: true,
      executionPathEquivalent: true,
    });
    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(0);
  });

  test('缺少真实 UI 清理核验时不得签发产品缺陷结论', ({}, testInfo) => {
    const resultsDir = testInfo.outputPath('untrusted-ui-cleanup');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(path.join(resultsDir, 'receipt.json'), JSON.stringify({
      caseId,
      executionContext: { route: '/pp/brand/tag/badge' },
      claims: {
        required: [`${caseId}:expectation-1`],
        observed: [`${caseId}:expectation-1`],
      },
      assertionReceipts: [{
        claimId: `${caseId}:expectation-1`,
        status: 'observed-mismatch',
        expectedValue: '页面隐藏过期角标',
        actualValue: '页面仍显示过期角标',
        actualStatus: 'observed',
        comparison: 'mismatched',
      }],
      operationReceipts: [{ operationKey: 'TagManagementPage.open', observed: true, status: 'passed' }],
      cleanup: { apiZeroResidue: true, uiZeroResidue: true },
    }, null, 2));
    const resultPath = path.join(resultsDir, 'case-result.json');
    fs.writeFileSync(resultPath, JSON.stringify({
      name: '过期角标传播',
      status: 'failed',
      statusDetails: { message: 'expect received mismatch' },
      labels: [{ name: 'tag', value: `case-${caseId}` }],
      steps: [{
        name: '执行失败', status: 'failed', steps: [],
        attachments: [{ name: 'test-execution-receipt', source: 'receipt.json', type: 'application/json' }],
      }],
    }, null, 2));

    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(1);
    const normalized = readResult(resultPath);
    expect(normalized.statusDetails?.message).not.toContain('PRODUCT-DEFECT');
    const assertion = normalized.steps?.find((step) => step.name?.startsWith('[断言]'));
    expect(assertion?.attachments?.some((item) => item.name === '产品差异证据（点击查看）')).toBe(false);
  });

  test('严格解析器拒绝来源格式时仍必须只读提取权威业务步骤用于报告', ({}, testInfo) => {
    const fallbackCaseId = 'TC-GRP-PKG-001';
    const resultsDir = testInfo.outputPath('presentation-fallback');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(path.join(resultsDir, 'receipt.json'), JSON.stringify({
      caseId: fallbackCaseId,
      claims: {
        required: ['expectation-1', 'expectation-2', 'expectation-3'],
        verified: ['expectation-1', 'expectation-2', 'expectation-3'],
      },
      operationReceipts: [{ operationKey: 'GroupListPage.open', observed: true, status: 'passed' }],
      cleanup: { apiZeroResidue: true, uiZeroResidue: true, uiVerificationObserved: true },
    }));
    const resultPath = path.join(resultsDir, 'case-result.json');
    fs.writeFileSync(resultPath, JSON.stringify({
      name: '套餐组统一列表展示三种类型合同正确',
      status: 'passed',
      labels: [{ name: 'tag', value: `case-${fallbackCaseId}` }],
      steps: [{
        name: '执行结论：通过',
        status: 'passed',
        steps: [],
        attachments: [{ name: 'test-execution-receipt', source: 'receipt.json', type: 'application/json' }],
      }],
    }));

    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(1);
    const normalized = readResult(resultPath);
    expect(normalized.steps?.map((step) => step.name)).toEqual([
      '[环境] 登录 → 商品中心 → 商品管理 → 套餐组',
      '[业务操作] 套餐组统一列表展示三种类型合同正确',
      '[断言] 核对「套餐组统一列表展示三种类型合同正确」预期结果',
      '[清理] 清理测试数据并确认 UI/API 零残留',
      `执行结论：通过｜${fallbackCaseId}`,
    ]);
    expect(normalized.steps?.[1]?.steps?.map((step) => step.name)).toContain(
      '操作2：查看名称搜索框、套餐组类型筛选、列表字段、新增入口和行操作。',
    );
    expect(normalized.labels).toContainEqual({ name: 'story', value: '商品管理 → 套餐组' });
    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(0);
  });
});

test('调味只读用例必须补齐断言实际值和无需清理结论且移除统一证据容器', ({}, testInfo) => {
  const seasoningCaseId = 'TC-FLV-REC-001';
  const resultsDir = testInfo.outputPath('seasoning-readonly-backfill');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, 'assertion.json'), JSON.stringify({
    caseId: seasoningCaseId,
    expected: {
      contracts: [{
        claimId: `${seasoningCaseId}:expectation-1`,
        expected: '目标业务请求完成，页面进入稳定可见终态，逐项断言均成立。',
        observationChannel: 'ui',
      }],
    },
    actual: { checks: {} },
    checkResults: [],
    assertionReceipts: [{ claimId: `${seasoningCaseId}:expectation-1`, status: 'verified' }],
  }));
  fs.writeFileSync(path.join(resultsDir, 'runtime.json'), JSON.stringify({
    caseId: seasoningCaseId,
    mutationObserved: false,
    assertionReceipts: [{ claimId: `${seasoningCaseId}:expectation-1`, status: 'verified' }],
    operationReceipts: [{ operationKey: 'ui:read', observed: true, status: 'passed' }],
  }));
  const resultPath = path.join(resultsDir, 'case-result.json');
  fs.writeFileSync(resultPath, JSON.stringify({
    name: '调味下发记录列表字段展示正确',
    status: 'passed',
    labels: [{ name: 'tag', value: `case-${seasoningCaseId}` }],
    steps: [
      { name: '[环境] 调味下发记录页并确认页面可用', status: 'passed', steps: [], attachments: [] },
      { name: '业务操作：读取调味下发记录列表', status: 'passed', steps: [], attachments: [] },
      { name: '断言：核对调味下发记录列表', status: 'passed', steps: [], attachments: [] },
      { name: `执行结论：通过｜${seasoningCaseId}`, status: 'passed', steps: [], attachments: [] },
      {
        name: '证据：保留业务结果、断言和执行收据',
        status: 'passed',
        steps: [],
        attachments: [
          { name: '断言期望值与实际值', source: 'assertion.json', type: 'application/json' },
          { name: 'system-test-runtime-evidence', source: 'runtime.json', type: 'application/json' },
        ],
      },
    ],
  }));

  expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(1);
  const normalized = readResult(resultPath);
  expect(normalized.steps?.some((step) => step.name === '执行结论：保留业务结果、断言和执行收据')).toBe(false);
  const assertion = normalized.steps?.find((step) => step.name?.startsWith('[断言]'));
  expect(assertion?.steps?.[0]?.name).toContain('期望：目标业务请求完成');
  expect(assertion?.steps?.[0]?.name).toContain('实际：页面断言收据状态为“已验证”');
  expect(assertion?.attachments).toContainEqual({
    name: '断言期望值与实际值', source: 'assertion.json', type: 'application/json',
  });
  expect(normalized.steps?.find((step) => step.name?.startsWith('[清理]'))?.name).toContain('无需清理');
  expect(normalized.steps?.map((step) => step.name)).toEqual(expect.arrayContaining([
    expect.stringMatching(/^\[环境\]/),
    expect.stringMatching(/^\[业务操作\]/),
    expect.stringMatching(/^\[断言\]/),
    expect.stringMatching(/^\[清理\]/),
    expect.stringMatching(/^执行结论：/),
  ]));
  expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(0);
});

test('调味专项断言必须优先展示附件中的字符串型实际观测值', ({}, testInfo) => {
  const seasoningCaseId = 'TC-FLV-SEA-035';
  const resultsDir = testInfo.outputPath('seasoning-observed-value');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, 'assertion.json'), JSON.stringify({
    checkResults: [{
      checkName: 'cancelReturned',
      expectedValue: { businessExpectation: '点击取消后返回品牌调味列表页' },
      actualValue: true,
      observedValue: '返回路径：/pp/brand/seasoning/list',
      result: '通过',
    }],
  }));
  const resultPath = path.join(resultsDir, 'case-result.json');
  fs.writeFileSync(resultPath, JSON.stringify({
    name: '编辑调味组或调味项点击取消不保存变更',
    status: 'passed',
    labels: [{ name: 'tag', value: `case-${seasoningCaseId}` }],
    steps: [
      { name: '[环境] 品牌调味列表页并确认页面可用', status: 'passed', steps: [], attachments: [] },
      { name: '业务操作：修改调味组后取消并确认未保存', status: 'passed', steps: [], attachments: [] },
      {
        name: '断言：核对业务操作的期望结果、实际结果和服务端回读',
        status: 'passed', steps: [],
        attachments: [{ name: '断言期望值与实际值', source: 'assertion.json', type: 'application/json' }],
      },
      { name: '清理：删除测试调味数据', status: 'passed', steps: [], attachments: [] },
      { name: `执行结论：通过｜${seasoningCaseId}`, status: 'passed', steps: [], attachments: [] },
    ],
  }));

  expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(1);
  const normalized = readResult(resultPath);
  const detail = normalized.steps?.find((step) => step.name?.startsWith('[断言]'))?.steps?.[0]?.name;
  expect(detail).toContain('实际：返回路径：/pp/brand/seasoning/list');
  expect(detail).not.toContain('未提供');
  expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(0);
});

function readResult(filePath: string): NormalizedResult {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as NormalizedResult;
}

function flattenSteps(steps: readonly AllureReportStep[]): string[] {
  return steps.flatMap((step) => [step.name ?? '', ...flattenSteps(step.steps ?? [])]);
}
