import { expect, test } from '@playwright/test';
import {
  createBusinessStepAllureOptions,
  renderBusinessStepTitle,
  shouldIncludeAllureStep,
} from '../../src/reporters/allure-step-policy';
import {
  auditAllureBusinessReport,
  bindDetachedAllureAttachments,
  createAllureReportIntegrityPolicy,
  createStepBoundAttachmentName,
  parseStepBoundAttachmentName,
  sanitizePlaywrightTraceText,
} from '../../src/reporters/allure-report-integrity';
import { parseSystemTestRuntimeEvidenceAttachment } from '../../src/reporters/system-test-evidence.reporter';

const chineseReportPolicy = createAllureReportIntegrityPolicy({
  localizedTextPattern: /[\u3400-\u9fff]/,
  attachmentGroupTitle: (name) => name.includes('截图')
    ? '失败诊断：保留失败截图与执行上下文'
    : '证据：保留业务结果与执行收据',
});

test.describe('公共 Allure 业务步骤展示策略', () => {
  test('业务步骤策略必须关闭 Playwright 技术明细并保留报告输出配置', async () => {
    expect(createBusinessStepAllureOptions({
      outputFolder: 'allure-results',
      suiteTitle: false,
    })).toEqual({
      detail: false,
      outputFolder: 'allure-results',
      suiteTitle: false,
    });
  });

  test('公共步骤标题必须渲染命名参数和位置参数', async () => {
    expect(renderBusinessStepTitle('填写业务对象：{name} / {price}', [
      { name: 'AUTO_OBJECT', price: 23.57 },
    ])).toBe('填写业务对象：AUTO_OBJECT / 23.57');
    expect(renderBusinessStepTitle('读取第三个业务参数：{2}', [
      { ignored: true },
      11,
      'AUTO_OBJECT',
    ])).toBe('读取第三个业务参数：AUTO_OBJECT');
  });

  test('技术动作名称不能成为业务步骤展示合同', async () => {
    const options = createBusinessStepAllureOptions({ outputFolder: 'allure-results' });
    expect(options.detail).toBe(false);
    for (const category of ['pw:api', 'expect', 'fixture']) {
      expect(shouldIncludeAllureStep({ detail: options.detail, category })).toBe(false);
    }
    for (const category of ['test.step', 'attach', 'test.attach']) {
      expect(shouldIncludeAllureStep({ detail: options.detail, category })).toBe(true);
    }
  });

  test('逐步骤审计必须拒绝技术标题、未解析参数和缺失结果', async () => {
    const findings = auditAllureBusinessReport({
      status: 'passed',
      steps: [
        { name: 'Fill locator("#name")', status: 'passed' },
        { name: '页面操作：填写商品 {name}' },
      ],
    }, chineseReportPolicy);
    expect(findings.map((item) => item.code)).toEqual([
      'NON_LOCALIZED_STEP_TITLE',
      'TECHNICAL_STEP_TITLE',
      'UNRESOLVED_STEP_TITLE',
      'MISSING_STEP_STATUS',
    ]);
  });

  test('逐步骤审计必须拒绝主步骤暴露接口路径和请求方法', async () => {
    const findings = auditAllureBusinessReport({
      status: 'passed',
      steps: [{
        name: '执行1：brand-menu:PUT /objects/sort｜方法：PUT｜结果：passed',
        status: 'passed',
      }],
    }, chineseReportPolicy);
    expect(findings.map((item) => item.code)).toEqual(['TECHNICAL_STEP_TITLE']);
  });

  test('附件必须直接绑定到业务、证据或失败诊断步骤', async () => {
    const valid = auditAllureBusinessReport({
      status: 'passed',
      steps: [{
        name: '断言：核对保存后商品名称',
        status: 'passed',
        attachments: [{ name: '保存结果接口收据', source: 'receipt.json' }],
      }],
    }, chineseReportPolicy);
    expect(valid).toEqual([]);

    const detached = auditAllureBusinessReport({
      status: 'passed',
      steps: [{
        name: '运行证据附件',
        attachments: [{ name: '运行证据附件', source: 'receipt.json' }],
      }],
    }, chineseReportPolicy);
    expect(detached.map((item) => item.code)).toEqual(['ATTACHMENT_NOT_BOUND_TO_STEP']);
  });

  test('公共归一化必须把根级和独立附件归入明确步骤', async () => {
    const result = {
      status: 'failed',
      attachments: [{ name: '失败截图附件', source: 'failure.png' }],
      steps: [{
        name: '运行证据附件',
        attachments: [{ name: '运行证据附件', source: 'runtime.json' }],
      }],
    };
    expect(bindDetachedAllureAttachments(result, chineseReportPolicy)).toBe(2);
    expect(result.attachments).toEqual([]);
    expect(result.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: '失败诊断：保留失败截图与执行上下文',
        status: 'passed',
        attachments: [{ name: '失败截图附件', source: 'failure.png' }],
      }),
      expect.objectContaining({
        name: '证据：保留业务结果与执行收据',
        status: 'passed',
        attachments: [{ name: '运行证据附件', source: 'runtime.json' }],
      }),
    ]));
    expect(auditAllureBusinessReport(result, chineseReportPolicy)).toEqual([]);
  });

  test('公共归一化必须按内部绑定标记把附件还原到原业务步骤', async () => {
    const stepTitle = '断言：核对保存后商品名称';
    const boundName = createStepBoundAttachmentName(stepTitle, '保存结果接口收据');
    const result = {
      status: 'passed',
      steps: [
        { name: stepTitle, status: 'passed', attachments: [] },
        { name: boundName, attachments: [{ name: boundName, source: 'receipt.json' }] },
      ],
    };
    expect(bindDetachedAllureAttachments(result, chineseReportPolicy)).toBe(1);
    expect(result.steps).toEqual([expect.objectContaining({
      name: stepTitle,
      attachments: [{ name: '保存结果接口收据', source: 'receipt.json' }],
    })]);
    expect(auditAllureBusinessReport(result, chineseReportPolicy)).toEqual([]);
  });

  test('Allure v3 标记为通过的独立附件节点仍必须绑定到业务步骤', async () => {
    const stepTitle = '业务操作：保存调味模板';
    const boundName = createStepBoundAttachmentName(stepTitle, '模板保存接口收据');
    const result = {
      status: 'passed',
      steps: [
        { name: stepTitle, status: 'passed', attachments: [] },
        { name: boundName, status: 'passed', attachments: [{ name: boundName, source: 'receipt.json' }] },
      ],
    };
    expect(bindDetachedAllureAttachments(result, chineseReportPolicy)).toBe(1);
    expect(result.steps).toEqual([expect.objectContaining({
      name: stepTitle,
      attachments: [{ name: '模板保存接口收据', source: 'receipt.json' }],
    })]);
  });

  test('步骤绑定后的运行证据机器名必须被公共证据记者识别', () => {
    const name = createStepBoundAttachmentName('证据：保存运行收据', 'system-test-runtime-evidence');
    expect(parseStepBoundAttachmentName(name)).toEqual({
      stepTitle: '证据：保存运行收据',
      attachmentName: 'system-test-runtime-evidence',
    });
    expect(parseSystemTestRuntimeEvidenceAttachment([{
      name,
      body: Buffer.from(JSON.stringify({ caseId: 'CASE-001', assertionReceipts: [] })),
    }])).toEqual({ caseId: 'CASE-001', assertionReceipts: [] });
    expect(parseSystemTestRuntimeEvidenceAttachment([{
      name: createStepBoundAttachmentName('证据：保存运行收据', '业务证据附件'),
      body: Buffer.from('{}'),
    }])).toBeUndefined();
  });

  test('Playwright trace 文本必须脱敏认证头和令牌字段', async () => {
    const input = [
      JSON.stringify({ headers: [{ name: 'authorization', value: 'synthetic-credential' }] }),
      JSON.stringify({ token: 'synthetic-token', safe: 'retained' }),
      JSON.stringify({ storageState: {
        cookies: [
          { name: 'code-verifier', value: 'synthetic-code-verifier', domain: 'example.test' },
          { name: 'XSRF-TOKEN', value: 'synthetic-xsrf-token', domain: 'example.test' },
        ],
        origins: [{
          origin: 'https://example.test',
          localStorage: [{ name: 'userInfo', value: 'synthetic-user-info' }],
          sessionStorage: [{ name: 'runtime-session', value: 'synthetic-session-state' }],
        }],
      } }),
    ].join('\n');
    const result = sanitizePlaywrightTraceText(input);
    expect(result.redactedFields).toBe(6);
    expect(result.text).not.toContain('synthetic-credential');
    expect(result.text).not.toContain('synthetic-token');
    expect(result.text).not.toContain('synthetic-code-verifier');
    expect(result.text).not.toContain('synthetic-xsrf-token');
    expect(result.text).not.toContain('synthetic-user-info');
    expect(result.text).not.toContain('synthetic-session-state');
    expect(result.text).toContain('retained');
    expect(result.text).toContain('code-verifier');
    expect(result.text).toContain('example.test');
    expect(sanitizePlaywrightTraceText(result.text).redactedFields).toBe(0);
  });

  test('失败截图必须优先绑定到最深层失败断言步骤', async () => {
    const result = {
      status: 'failed',
      attachments: [{ name: '失败截图附件', source: 'failure.png' }],
      steps: [{
        name: '业务操作：保存商品',
        status: 'failed',
        steps: [{ name: '断言：核对保存结果', status: 'failed', attachments: [] }],
      }],
    };
    expect(bindDetachedAllureAttachments(result, chineseReportPolicy)).toBe(1);
    expect(result.attachments).toEqual([]);
    expect(result.steps[0]?.steps?.[0]).toEqual(expect.objectContaining({
      name: '断言：核对保存结果',
      attachments: [{ name: '失败截图附件', source: 'failure.png' }],
    }));
    expect(auditAllureBusinessReport(result, chineseReportPolicy)).toEqual([]);
  });

  test('重复的环境或前置上下文步骤必须被公共审计拒绝', () => {
    const findings = auditAllureBusinessReport({
      status: 'passed',
      steps: [
        { name: '[前置校验] 确认当前商户上下文有效', status: 'passed' },
        { name: '[业务操作] 保存业务对象', status: 'passed' },
        { name: '[前置校验] 确认当前商户上下文有效', status: 'passed' },
      ],
    }, chineseReportPolicy);
    expect(findings.map((item) => item.code)).toEqual(['DUPLICATE_CONTEXT_STEP']);
  });
});

