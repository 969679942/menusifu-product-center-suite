import PlaywrightAuditStepReporter from '../../../Test Automation Platform/src/reporters/playwright-audit-step.reporter';
import {
  MERCHANT_CENTER_CASE_ID_ANNOTATION_TYPES,
  classifyMerchantCenterAuditStep,
} from '../adapters/test-automation-platform/audit-step-reporting';

/** Thin project adapter: public core owns persistence; Merchant Center owns business wording classification. */
export default class MerchantCenterAuditStepReporter extends PlaywrightAuditStepReporter {
  constructor() {
    super({
      classifyStep: classifyMerchantCenterAuditStep,
      includeCategories: ['test.step'],
      caseIdAnnotationTypes: [...MERCHANT_CENTER_CASE_ID_ANNOTATION_TYPES],
    });
  }

  /** 为每个实时步骤补充业务运行上下文，便于报告按阶段复盘。 */
  protected override contextDetails(): Record<string, unknown> {
    try {
      const metadata = JSON.parse(process.env.SYSTEM_TEST_AUDIT_RUN_METADATA ?? '{}') as Record<string, unknown>;
      return {
        logicalRunId: metadata.logicalRunId,
        runType: metadata.runType,
        triggerType: metadata.triggerType,
        triggerSource: metadata.triggerSource,
        scope: metadata.scope,
      };
    } catch {
      return {};
    }
  }
}
