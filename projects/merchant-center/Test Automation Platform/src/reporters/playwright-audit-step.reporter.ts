import type { FullConfig, Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import { appendAuditEvent } from '../audit/event-log';
import {
  isPassAuthorizingAuditStep,
  sanitizeAuditStepTitle,
  type PlaywrightAuditStepKind,
} from '../audit/playwright-step-audit';

export type PlaywrightAuditStepReporterOptions = {
  classifyStep?: (input: { title: string; category: string }) => PlaywrightAuditStepKind;
  includeCategories?: string[];
  caseIdAnnotationTypes?: string[];
};

export default class PlaywrightAuditStepReporter implements Reporter {
  private readonly classifyStep: NonNullable<PlaywrightAuditStepReporterOptions['classifyStep']>;
  private readonly includeCategories: Set<string>;
  private readonly caseIdAnnotationTypes: string[];
  private readonly stepIds = new WeakMap<TestStep, string>();
  private nextStepSequence = 0;

  /** Project adapters may add stable run metadata without reimplementing persistence. */
  protected contextDetails(): Record<string, unknown> { return {}; }

  constructor(options: PlaywrightAuditStepReporterOptions = {}) {
    this.classifyStep = options.classifyStep ?? (() => 'technical');
    this.includeCategories = new Set(options.includeCategories ?? ['test.step']);
    this.caseIdAnnotationTypes = options.caseIdAnnotationTypes ?? ['system-test-case-id'];
  }

  onBegin(_config: FullConfig): void {}

  onTestBegin(test: TestCase, result: TestResult): void {
    const context = this.testContext(test, result);
    if (!context) return;
    appendAuditEvent(context.logPath, {
      ...context.identity,
      eventId: `${context.eventBase}:case-started`,
      eventType: 'case.started',
      actorType: 'runner',
      occurredAt: result.startTime.toISOString(),
      startedAt: result.startTime.toISOString(),
      outcome: 'success',
      details: { sourceKind: 'playwright-case-lifecycle', caseStatus: 'started', realtime: true, ...this.contextDetails() },
    });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const context = this.testContext(test, result);
    if (!context) return;
    const failed = !['passed', 'skipped'].includes(result.status);
    const skipped = result.status === 'skipped';
    const outcome = skipped ? 'skipped' : failed ? 'failed' : 'success';
    appendAuditEvent(context.logPath, {
      ...context.identity,
      eventId: `${context.eventBase}:case-completed:${result.status}`,
      parentEventId: `${context.eventBase}:case-started`,
      eventType: 'case.completed',
      actorType: 'runner',
      occurredAt: new Date(result.startTime.getTime() + Math.max(0, result.duration)).toISOString(),
      startedAt: result.startTime.toISOString(),
      finishedAt: new Date(result.startTime.getTime() + Math.max(0, result.duration)).toISOString(),
      durationMs: Math.max(0, result.duration),
      outcome,
      effectiveSuccess: !failed && !skipped,
      details: {
        sourceKind: 'playwright-case-lifecycle',
        caseStatus: result.status,
        retry: result.retry,
        realtime: true,
        ...this.contextDetails(),
      },
    });
  }

  onStepBegin(test: TestCase, result: TestResult, step: TestStep): void {
    const context = this.context(test, result, step);
    if (!context) return;
    appendAuditEvent(context.logPath, {
      ...context.identity,
      eventId: `${context.eventBase}:started`,
      eventType: 'step.started',
      actorType: 'runner',
      occurredAt: step.startTime.toISOString(),
      startedAt: step.startTime.toISOString(),
      outcome: 'success',
      details: context.details,
    });
  }

  onStepEnd(test: TestCase, result: TestResult, step: TestStep): void {
    const context = this.context(test, result, step);
    if (!context) return;
    const interrupted = result.status === 'interrupted';
    const failed = Boolean(step.error);
    const eventType = interrupted ? 'step.interrupted' : failed ? 'step.failed' : 'step.completed';
    const outcome = interrupted ? 'cancelled' : failed ? 'failed' : 'success';
    const finishedAt = new Date(step.startTime.getTime() + Math.max(0, step.duration)).toISOString();
    appendAuditEvent(context.logPath, {
      ...context.identity,
      eventId: `${context.eventBase}:terminal`,
      parentEventId: `${context.eventBase}:started`,
      eventType,
      actorType: 'runner',
      occurredAt: finishedAt,
      startedAt: step.startTime.toISOString(),
      finishedAt,
      durationMs: Math.max(0, step.duration),
      outcome,
      effectiveSuccess: !failed && !interrupted,
      details: {
        ...context.details,
        terminalStatus: interrupted ? 'interrupted' : failed ? 'failed' : 'passed',
        errorName: step.error ? 'TestError' : undefined,
        errorMessage: sanitizeAuditStepTitle(step.error?.message ?? ''),
      },
    });
  }

  private context(test: TestCase, result: TestResult, step: TestStep): {
    logPath: string;
    eventBase: string;
    identity: { applicationId: string; businessDomainId?: string; planId?: string; runId: string; caseId: string; traceId: string };
    details: Record<string, unknown>;
  } | undefined {
    const logPath = process.env.SYSTEM_TEST_AUDIT_EVENT_LOG;
    if (!logPath || !this.includeCategories.has(step.category)) return undefined;
    const testContext = this.testContext(test, result);
    if (!testContext) return undefined;
    const runId = testContext.identity.runId;
    const caseId = testContext.identity.caseId;
    const title = sanitizeAuditStepTitle(step.title);
    const stepKind = this.classifyStep({ title, category: step.category });
    let stepId = this.stepIds.get(step);
    if (!stepId) {
      stepId = `${result.retry}:${++this.nextStepSequence}`;
      this.stepIds.set(step, stepId);
    }
    return {
      logPath,
      eventBase: `${runId}:${caseId}:playwright-step:${stepId}`,
      identity: testContext.identity,
      details: {
        sourceKind: 'playwright-visible-step',
        stepId,
        stepIndex: this.nextStepSequence,
        title,
        stepName: title,
        businessAction: title,
        category: step.category,
        stepKind,
        phase: stepKind,
        retry: result.retry,
        authorizesPass: isPassAuthorizingAuditStep(),
        realtime: true,
        ...this.contextDetails(),
      },
    };
  }

  private testContext(test: TestCase, result: TestResult): {
    logPath: string;
    eventBase: string;
    identity: { applicationId: string; businessDomainId?: string; planId?: string; runId: string; caseId: string; traceId: string };
  } | undefined {
    const logPath = process.env.SYSTEM_TEST_AUDIT_EVENT_LOG;
    const runId = process.env.SYSTEM_TEST_RUN_ID;
    const applicationId = process.env.SYSTEM_TEST_APPLICATION_ID ?? process.env.SYSTEM_TEST_SYSTEM_ID;
    const caseId = this.caseIdAnnotationTypes
      .map((type) => test.annotations.find((item) => item.type === type)?.description)
      .find((value): value is string => Boolean(value?.trim()));
    if (!logPath || !runId || !applicationId || !caseId) return undefined;
    const identity = {
      applicationId,
      businessDomainId: process.env.SYSTEM_TEST_BUSINESS_DOMAIN_ID,
      planId: process.env.SYSTEM_TEST_PLAN_ID,
      runId,
      caseId,
      traceId: runId,
    };
    return {
      logPath,
      eventBase: `${runId}:${caseId}:playwright-case:${result.retry}`,
      identity,
    };
  }
}
