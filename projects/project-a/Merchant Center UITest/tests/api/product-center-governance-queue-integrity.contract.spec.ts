import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const queuePath = path.resolve(__dirname, '../../../deliverables/test-plan-governance/product-center-governance-execution-task-queue-v1.json');

test('治理队列必须引用维护性拆分前置证据并保持未执行边界', () => {
  expect(fs.existsSync(queuePath)).toBe(true);
  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8')) as {
    policy: { businessExecutionStarted: boolean; existingPassedCasesInvalidated: boolean };
    tasks: Array<{ taskId: string; staticEvidenceRefs: string[]; staticEvidencePresent: boolean; staticExecutionCompleted: boolean; executionAllowed: string; closureStatus: string; disposition: string }>;
  };
  expect(queue.policy).toMatchObject({ businessExecutionStarted: false, existingPassedCasesInvalidated: false });
  const releaseReceipt = queue.tasks.find((item) => item.taskId === 'PC-ITEM-RELEASE-RECEIPT');
  expect(releaseReceipt?.closureStatus).toBe('open');
  expect(releaseReceipt?.executionAllowed).toBe('static-only');
  expect(releaseReceipt?.staticEvidenceRefs).toContain('Merchant Center UITest/deliverables/system-test-platform/product-center-item-release-readiness.json');
  const task = queue.tasks.find((item) => item.taskId === 'PC-MAINTAINABILITY');
  expect(task).toBeDefined();
  expect(task?.staticEvidenceRefs).toEqual(expect.arrayContaining([
    'Merchant Center UITest/output/quality/product-center-maintainability-responsibility-plan.json',
    'Merchant Center UITest/output/quality/product-center-maintainability-isolation-snapshot.json',
  ]));
  expect(task?.staticEvidencePresent).toBe(true);
  expect(task?.executionAllowed).toBe('static-only');

  const historical = queue.tasks.find((item) => item.taskId === 'PC-HIST-LINEAGE');
  expect(historical).toBeDefined();
  expect(historical?.staticEvidencePresent).toBe(false);
  expect(historical?.closureStatus).toBe('open');
  expect(historical?.disposition).toBe('static-executed-awaiting-precondition');

  const pageContract = queue.tasks.find((item) => item.taskId === 'PC-PAGE-CONTRACT');
  expect(pageContract).toBeDefined();
  expect(pageContract?.staticEvidencePresent).toBe(false);
  expect(pageContract?.closureStatus).toBe('open');

  const reverseReadiness = queue.tasks.find((item) => item.taskId === 'PC-REV-READINESS');
  expect(reverseReadiness).toBeDefined();
  expect(reverseReadiness?.staticEvidenceRefs).toEqual(expect.arrayContaining([
    'deliverables/test-plan-governance/product-center-reverse-scenario-readiness-v1.json',
    'deliverables/test-plan-governance/product-center-reverse-scenario-evidence-queue-v1.json',
  ]));
  expect(reverseReadiness?.staticEvidencePresent).toBe(true);
  expect(reverseReadiness?.executionAllowed).toBe('static-only');
  expect(reverseReadiness?.closureStatus).toBe('open');

  for (const [taskId, evidence, disposition] of [
    ['BRG-OPT-020', 'deliverables/test-plan-governance/product-center-document-rule-promotion-plan.json', 'static-executed-awaiting-evidence'],
    ['BRG-OPT-021', 'deliverables/test-plan-governance/product-center-business-rule-promotion-batch-plan.json', 'static-executed-awaiting-downstream'],
    ['BRG-OPT-023', 'Merchant Center UITest/output/governance/product-center-business-rule-coverage.json', 'static-executed-awaiting-evidence'],
    ['BRG-OPT-025', 'deliverables/test-plan-governance/product-center-business-rule-confirmation-queue.json', 'closed-static'],
    ['BRG-OPT-026', 'deliverables/test-plan-governance/product-center-business-rule-optimization-completion.json', 'static-executed-awaiting-execution-grant'],
  ] as const) {
    const item = queue.tasks.find((candidate) => candidate.taskId === taskId);
    expect(item).toBeDefined();
    expect(item?.staticEvidenceRefs).toContain(evidence);
    expect(item?.staticEvidencePresent).toBe(true);
    expect(item?.staticExecutionCompleted).toBe(true);
    expect(item?.disposition).toBe(disposition);
  }
  expect(queue.tasks.find((item) => item.taskId === 'BRG-OPT-025')?.closureStatus).toBe('closed');
});
