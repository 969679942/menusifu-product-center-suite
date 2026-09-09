import { expect, test } from '@playwright/test';
import { auditBusinessRuleCaseAssociations } from '../../src/automation/system-test/business-rule-review-governance';
import { validateBusinessRuleDownstreamContract, findAmbiguousDownstreamPhrases } from '../../src/automation/system-test/business-rule-downstream-contract';

test.describe('business-rule governance review gate', () => {
  test('已批准且语义未变的缺少校正行自动通过，不产生人工任务', () => {
    const result = auditBusinessRuleCaseAssociations(
      { linkedCaseIds: ['TC-1', 'TC-2'] },
      [
        {
          caseId: 'TC-1', caseFingerprint: 'a'.repeat(64), implementationFingerprint: null,
          automationBindingId: 'binding:TC-1', sourceVerified: true, canonicalApproved: true,
          correctionPresent: true, semanticComparison: 'matched',
        },
        {
          caseId: 'TC-2', caseFingerprint: 'b'.repeat(64), implementationFingerprint: null,
          automationBindingId: 'binding:TC-2', sourceVerified: true, canonicalApproved: true,
          correctionPresent: false, semanticComparison: 'matched',
        },
      ],
    );
    expect(result.complete).toBe(true);
    expect(result.autoValidatedCaseIds).toEqual(['TC-2']);
    expect(result.humanSemanticReviewCaseIds).toEqual([]);
  });

  test('缺少来源或语义不一致时精确阻断/转人工，不允许静默通过', () => {
    const result = auditBusinessRuleCaseAssociations(
      { linkedCaseIds: ['TC-MISSING', 'TC-CONFLICT'] },
      [{
        caseId: 'TC-CONFLICT', caseFingerprint: null, implementationFingerprint: null,
        automationBindingId: 'binding:TC-CONFLICT', sourceVerified: true, canonicalApproved: true,
        correctionPresent: false, semanticComparison: 'mismatch',
      }],
    );
    expect(result.complete).toBe(false);
    expect(result.missingCaseIds).toEqual(['TC-MISSING']);
    expect(result.blockedCaseIds).toEqual(['TC-CONFLICT', 'TC-MISSING']);
  });

  test('结构化下游契约要求触发、前置、分阶段验证和禁止路径', () => {
    const errors = validateBusinessRuleDownstreamContract({
      contractId: 'c1', changeAction: 'edit-confirm', sourceSystem: 'brand',
      intermediateSystems: ['menu'], targetSystems: ['store', 'terminal'], trigger: 'confirm edit',
      storePrerequisites: ['publish menu'], terminalPrerequisites: ['sync from store'],
      forbiddenPaths: ['brand item page cannot sync terminal'],
      verification: {
        beforeTrigger: 'store and terminal old', afterStoreSync: 'store new, terminal old',
        afterTerminalSync: 'terminal new', channels: ['api', 'downstream'],
      },
    });
    expect(errors).toEqual([]);
    expect(findAmbiguousDownstreamPhrases('同步下游')).toEqual(['同步下游']);
    expect(findAmbiguousDownstreamPhrases('菜单、门店等下游系统')).toContain('等');
    expect(findAmbiguousDownstreamPhrases('最大数量等于最小数量，等待列表刷新')).not.toContain('等');
  });
});
