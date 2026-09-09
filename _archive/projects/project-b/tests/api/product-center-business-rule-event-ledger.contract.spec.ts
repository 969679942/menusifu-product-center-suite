import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  BUSINESS_RULE_CHANGE_EVENT_TYPES,
  validateBusinessRuleDecisionEvent,
} from '../../../../Test Automation Platform/src/automation/system-test/business-rule-change-event';
import type { BusinessRuleSemanticBaseline, BusinessRuleChangeTriggerResult } from '../../automation/system-test/business-rule-change-trigger';
import {
  buildProductCenterCurrentRuleEvaluationEvents,
  buildProductCenterFormalRulePromotionEvents,
  buildProductCenterHistoricalRuleLandingEvents,
} from '../../adapters/product-center/product-center-business-rule-event-adapter';
import {
  buildProductCenterBusinessRuleEventLedger,
} from '../../scripts/build-product-center-business-rule-event-ledger';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from '../../scripts/build-product-center-business-rule-lifecycle-snapshot';

const projectRoot = path.resolve(__dirname, '../..');

test.describe('商品中心业务规则评估事件账本合同', () => {
  test('历史落地只登记运行事实，不反推当前正式规则变化', () => {
    const events = buildProductCenterHistoricalRuleLandingEvents({
      runId: 'product-center-item:historical:test',
      sourceArtifactPath: 'output/historical.json',
      sourceArtifactFingerprint: 'a'.repeat(64),
      occurredAt: '2026-08-14T13:55:54.823Z',
      sourceRole: 'test-plan-to-ui-script-conversion',
      ruleScopeStatus: 'unresolved',
      timeSource: 'artifactGeneratedAt',
      timePrecision: 'artifact-generated',
    });
    expect(events.map((event) => event.eventType)).toEqual([
      BUSINESS_RULE_CHANGE_EVENT_TYPES.started,
      BUSINESS_RULE_CHANGE_EVENT_TYPES.completed,
    ]);
    expect((events[0].details as { evaluatedRuleIds: string[] }).evaluatedRuleIds).toEqual([]);
  });

  test('完整基线未变化时逐规则记录 no-change 且不产生重跑影响', () => {
    const lifecycle = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
    const baseline: BusinessRuleSemanticBaseline = {
      schemaVersion: '1.0.0',
      baselineId: 'contract-complete-baseline',
      applicationId: lifecycle.applicationId,
      businessDomainId: lifecycle.businessDomainId,
      rules: lifecycle.rules.map((rule) => ({ ruleId: rule.ruleId, ruleFingerprint: rule.ruleFingerprint })),
    };
    const trigger: BusinessRuleChangeTriggerResult = {
      schemaVersion: '1.0.0', status: 'unchanged', baselineId: baseline.baselineId,
      changedRuleIds: [], affectedRuleIds: [], affectedCaseIds: [], rerunCaseIds: [],
      revalidatedCaseIds: [], verifiedRuleIds: [], preservedPassedCaseIds: [], diagnostics: [],
      fingerprint: 'c'.repeat(64),
    };
    const events = buildProductCenterCurrentRuleEvaluationEvents({
      runId: 'product-center-item:test-plan-to-ui-script:contract',
      occurredAt: '2026-08-29T04:28:31.627Z',
      sourceArtifactPath: 'output/product-center-item-213-conversion.json',
      sourceArtifactFingerprint: 'b'.repeat(64),
      lifecycle,
      baseline,
      trigger,
    });
    const decisions = events.filter((event) => event.eventType === BUSINESS_RULE_CHANGE_EVENT_TYPES.decision);
    expect(decisions).toHaveLength(lifecycle.rules.length);
    expect(decisions.every((event) => (event.details as { decision: string }).decision === 'no-change')).toBe(true);
    expect(decisions.every((event) => event.dataChanged === false)).toBe(true);
    expect(events.at(-1)?.outcome).toBe('success');
  });

  test('基线缺规则或触发器与实时比较不一致时拒绝生成结论', () => {
    const lifecycle = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
    const baseline = readJson<BusinessRuleSemanticBaseline>(
      'contracts/product-center/business-rules/product-center-business-rule-verified-baseline.json',
    );
    const trigger = readJson<BusinessRuleChangeTriggerResult>(
      'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
    );
    expect(() => buildProductCenterCurrentRuleEvaluationEvents({
      runId: 'product-center-item:test-plan-to-ui-script:invalid',
      occurredAt: '2026-08-29T04:28:31.627Z',
      sourceArtifactPath: 'output/source.json',
      sourceArtifactFingerprint: 'c'.repeat(64),
      lifecycle,
      baseline: { ...baseline, rules: baseline.rules.slice(1) },
      trigger,
    })).toThrow('PRODUCT_CENTER_RULE_BASELINE_INCOMPLETE');
  });

  test('正式更新必须同时带批准、语义变化和全部关联用例完整收据', () => {
    const lifecycle = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
    const current = lifecycle.rules[0];
    const beforeBaseline: BusinessRuleSemanticBaseline = {
      schemaVersion: '1.0.0',
      baselineId: 'contract-baseline',
      applicationId: 'merchant-center',
      businessDomainId: 'product-center-item',
      rules: lifecycle.rules.map((rule) => ({
        ruleId: rule.ruleId,
        ruleFingerprint: rule.ruleId === current.ruleId ? 'd'.repeat(64) : rule.ruleFingerprint,
      })),
    };
    const afterBaseline: BusinessRuleSemanticBaseline = {
      ...beforeBaseline,
      rules: lifecycle.rules.map((rule) => ({ ruleId: rule.ruleId, ruleFingerprint: rule.ruleFingerprint })),
    };
    const trigger = readJson<BusinessRuleChangeTriggerResult>(
      'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
    );
    const refs = new Map(current.linkedCaseIds.map((caseId) => [caseId, `evidence/${caseId}.json`]));
    const events = buildProductCenterFormalRulePromotionEvents({
      runId: 'product-center-item:rule-promotion:contract',
      occurredAt: '2026-08-29T05:00:00.000Z',
      lifecycle,
      beforeBaseline,
      afterBaseline,
      trigger: { ...trigger, baselineId: beforeBaseline.baselineId },
      promotedRuleIds: [current.ruleId],
      executionReceiptRefsByCaseId: refs,
    });
    const decision = events.find((event) => event.eventType === BUSINESS_RULE_CHANGE_EVENT_TYPES.decision)!;
    expect(validateBusinessRuleDecisionEvent(decision as never)).toEqual([]);
    expect((decision.details as { decision: string }).decision).toBe('formal-rule-updated');
    const missingRefs = new Map(refs);
    missingRefs.delete(current.linkedCaseIds[0]);
    expect(() => buildProductCenterFormalRulePromotionEvents({
      runId: 'product-center-item:rule-promotion:missing-receipt',
      occurredAt: '2026-08-29T05:00:00.000Z',
      lifecycle,
      beforeBaseline,
      afterBaseline,
      trigger: { ...trigger, baselineId: beforeBaseline.baselineId },
      promotedRuleIds: [current.ruleId],
      executionReceiptRefsByCaseId: missingRefs,
    })).toThrow('PRODUCT_CENTER_RULE_PROMOTION_RECEIPT_REQUIRED');
  });

  test('历史导入重复运行幂等且报告字节稳定', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-rule-ledger-'));
    try {
      const outputDir = path.join(tempRoot, 'output');
      fs.mkdirSync(outputDir, { recursive: true });
      const landings = [
        writeHistoricalArtifact(tempRoot, 'output/landing-a.json', '2026-08-14T13:55:54.823Z'),
        writeHistoricalArtifact(tempRoot, 'output/landing-b.json', '2026-08-23T12:40:37.452Z'),
      ];
      const manifestPath = path.join(tempRoot, 'landing-history.json');
      fs.writeFileSync(manifestPath, `${JSON.stringify({
        schemaVersion: '1.0.0',
        collectionId: 'contract-history',
        applicationId: 'merchant-center',
        businessDomainId: 'product-center-item',
        landings,
      }, null, 2)}\n`, 'utf8');
      const options = {
        projectRoot: tempRoot,
        manifestPath,
        eventLogPath: path.join(outputDir, 'events.jsonl'),
        outputJsonPath: path.join(outputDir, 'ledger.json'),
        outputMarkdownPath: path.join(outputDir, 'ledger.md'),
      };
      const first = buildProductCenterBusinessRuleEventLedger(options);
      const firstReportBytes = fs.readFileSync(options.outputJsonPath);
      const second = buildProductCenterBusinessRuleEventLedger(options);
      expect(first.appended).toBe(4);
      expect(first.duplicates).toBe(0);
      expect(second.appended).toBe(0);
      expect(second.duplicates).toBe(4);
      expect(second.report.summary).toMatchObject({
        historicalRuns: 2,
        unresolvedHistoricalRuleScopeRuns: 2,
        ruleDecisionEvents: 0,
        formalRuleUpdates: 0,
      });
      expect(fs.readFileSync(options.outputJsonPath)).toEqual(firstReportBytes);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

function writeHistoricalArtifact(root: string, relativePath: string, generatedAt: string) {
  const absolutePath = path.join(root, relativePath);
  const content = `${JSON.stringify({ schemaVersion: '1.0.0', generatedAt })}\n`;
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf8');
  return {
    runId: `historical:${path.basename(relativePath, '.json')}`,
    sourceArtifactPath: relativePath.replace(/\\/g, '/'),
    sourceArtifactFingerprint: createHash('sha256').update(content).digest('hex'),
    occurredAt: generatedAt,
    sourceRole: 'test-plan-to-ui-script-conversion',
    ruleScopeStatus: 'unresolved',
    timeSource: 'artifactGeneratedAt',
    timePrecision: 'artifact-generated',
  };
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')) as T;
}
