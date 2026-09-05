import fs from 'node:fs';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import { classifyProductCenterFailure } from '../utils/product-center-failure-classifier';
import { fingerprintFailureDiagnostic, sanitizeFailureDiagnostic } from '../utils/product-center-failure-analysis';
import type {
  ProductCenterItemCompiledCase,
  ProductCenterItemPracticeContract,
} from '../utils/product-center-item-practice-contract';
import {
  buildProductCenterItemExpectationReceipts,
  classifyProductCenterItemResponsibility,
  evaluateProductCenterItemCleanupEvidence,
  type ProductCenterItemAssertionStep,
} from '../utils/product-center-item-practice-evidence';

type CaseEvidence = {
  caseId: string;
  ruleId: string;
  dataProfile: string;
  status: TestResult['status'];
  durationMs: number;
  runtimeEvidencePresent: boolean;
  expectationReceipts: ReturnType<typeof buildProductCenterItemExpectationReceipts>;
  cleanupReceipt: ReturnType<typeof evaluateProductCenterItemCleanupEvidence>;
  evidenceComplete: boolean;
  responsibility?: ReturnType<typeof classifyProductCenterItemResponsibility>;
  diagnostic?: string;
  diagnosticFingerprint?: string;
};

export default class ProductCenterItemPracticeReporter implements Reporter {
  private readonly contract: ProductCenterItemPracticeContract;
  private readonly byCaseId: Map<string, ProductCenterItemCompiledCase>;
  private readonly cases: CaseEvidence[] = [];
  private startedAt = Date.now();

  constructor() {
    const contractPath = path.resolve(
      process.env.PC_ITEM_PRACTICE_CONTRACT ?? 'output/product-center-item-practice-contract.json',
    );
    this.contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as ProductCenterItemPracticeContract;
    this.byCaseId = new Map(this.contract.cases.map((item) => [item.caseId, item]));
  }

  onBegin(): void {
    this.startedAt = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const caseId = test.annotations.find((item) => item.type === 'canonical-case-id')?.description;
    if (!caseId) return;
    const item = this.byCaseId.get(caseId);
    if (!item) return;
    const runtimeEvidence = parseJsonAttachment(result, `${caseId}-runtime-evidence`)
      ?? parseJsonAttachment(result, `${caseId}-cleanup-evidence`);
    const assertionSteps = flattenAssertionSteps(result.steps);
    const testPassed = result.status === 'passed' && test.expectedStatus === 'passed';
    const expectationReceipts = buildProductCenterItemExpectationReceipts(item, assertionSteps, testPassed);
    const cleanupReceipt = evaluateProductCenterItemCleanupEvidence(item, runtimeEvidence);
    const runtimeEvidencePresent = runtimeEvidence !== undefined;
    const evidenceComplete = runtimeEvidencePresent
      && expectationReceipts.every((receipt) => receipt.status === 'verified')
      && cleanupReceipt.evidencePresent
      && cleanupReceipt.apiZeroResidue
      && cleanupReceipt.uiZeroResidue;
    const diagnostic = result.error?.message ? sanitizeFailureDiagnostic(result.error.message) : undefined;
    const failure = diagnostic
      ? classifyProductCenterFailure({ message: diagnostic, assertion: result.steps.some(hasFailedExpectation) })
      : undefined;
    const responsibility = classifyProductCenterItemResponsibility(failure?.category, evidenceComplete);
    this.cases.push({
      caseId,
      ruleId: item.ruleId,
      dataProfile: item.dataProfile,
      status: result.status,
      durationMs: result.duration,
      runtimeEvidencePresent,
      expectationReceipts,
      cleanupReceipt,
      evidenceComplete,
      ...(responsibility ? { responsibility } : {}),
      ...(diagnostic ? { diagnostic, diagnosticFingerprint: fingerprintFailureDiagnostic(diagnostic) } : {}),
    });
  }

  onEnd(result: FullResult): void {
    const outputPath = path.resolve(
      process.env.PC_ITEM_PRACTICE_EVIDENCE_OUTPUT ?? 'output/product-center-item-practice-evidence.json',
    );
    const uniqueCases = deduplicateLatest(this.cases);
    const incomplete = uniqueCases.filter((item) => !item.evidenceComplete);
    const failed = uniqueCases.filter((item) => item.status !== 'passed');
    const ledger = {
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-practice-evidence-ledger',
      generatedAt: new Date().toISOString(),
      contractFingerprint: this.contract.fingerprint,
      runStatus: result.status,
      durationMs: Date.now() - this.startedAt,
      summary: {
        selected: this.contract.cases.length,
        executed: uniqueCases.length,
        passed: uniqueCases.filter((item) => item.status === 'passed').length,
        failed: failed.length,
        evidenceComplete: uniqueCases.length - incomplete.length,
        evidenceIncomplete: incomplete.length,
        productFailure: uniqueCases.filter((item) => item.responsibility === 'product-failure').length,
        automationGap: uniqueCases.filter((item) => item.responsibility === 'automation-gap').length,
        environmentFailure: uniqueCases.filter((item) => item.responsibility === 'environment-failure').length,
        externalDependency: uniqueCases.filter((item) => item.responsibility === 'external-dependency').length,
      },
      cases: uniqueCases.sort((left, right) => left.caseId.localeCompare(right.caseId)),
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, outputPath);
    process.stdout.write(`商品实战证据账本：${outputPath}\n`);
  }

  printsToStdio(): boolean {
    return false;
  }
}

function flattenAssertionSteps(steps: readonly TestStep[]): ProductCenterItemAssertionStep[] {
  const result: ProductCenterItemAssertionStep[] = [];
  const visit = (step: TestStep, indexPath: string): void => {
    if (step.category === 'expect') {
      result.push({ stepId: indexPath, title: step.title, passed: !step.error });
    }
    step.steps.forEach((child, index) => visit(child, `${indexPath}.${index}`));
  };
  steps.forEach((step, index) => visit(step, String(index)));
  return result;
}

function hasFailedExpectation(step: TestStep): boolean {
  return (step.category === 'expect' && Boolean(step.error)) || step.steps.some(hasFailedExpectation);
}

function parseJsonAttachment(result: TestResult, name: string): unknown | undefined {
  const attachment = result.attachments.find((item) => item.name === name);
  if (!attachment) return undefined;
  try {
    const body = attachment.body?.toString('utf8')
      ?? (attachment.path ? fs.readFileSync(attachment.path, 'utf8') : undefined);
    return body ? JSON.parse(body) as unknown : undefined;
  } catch {
    return undefined;
  }
}

function deduplicateLatest(items: readonly CaseEvidence[]): CaseEvidence[] {
  const latest = new Map<string, CaseEvidence>();
  for (const item of items) latest.set(item.caseId, item);
  return [...latest.values()];
}
