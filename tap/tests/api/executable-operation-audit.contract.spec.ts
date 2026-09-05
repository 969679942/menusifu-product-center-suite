import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { startExecutableOperation, finishExecutableOperation } from '../../src/utils/executable-operation-receipt';
import { FileAuditEventStore } from '../../src/audit/event-log';

test('执行时 operation receipt 应实时追加 operation.called 审计事件', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'realtime-audit-'));
  const previous = {
    log: process.env.SYSTEM_TEST_AUDIT_EVENT_LOG,
    run: process.env.SYSTEM_TEST_RUN_ID,
    app: process.env.SYSTEM_TEST_APPLICATION_ID,
    domain: process.env.SYSTEM_TEST_BUSINESS_DOMAIN_ID,
    plan: process.env.SYSTEM_TEST_PLAN_ID,
  };
  const logPath = path.join(root, 'events.jsonl');
  process.env.SYSTEM_TEST_AUDIT_EVENT_LOG = logPath;
  process.env.SYSTEM_TEST_RUN_ID = 'jenkins-run-001';
  process.env.SYSTEM_TEST_APPLICATION_ID = 'target-app';
  process.env.SYSTEM_TEST_BUSINESS_DOMAIN_ID = 'demo-domain';
  process.env.SYSTEM_TEST_PLAN_ID = 'demo-plan';
  try {
    const operation = startExecutableOperation({ executionId: 'test-execution', operationKey: 'demo:POST /items', title: '创建商品', method: 'POST' });
    finishExecutableOperation(operation, 'passed');
    const store = new FileAuditEventStore({ filePath: logPath });
    const events = store.readAll();
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(expect.objectContaining({
      eventType: 'operation.started', applicationId: 'target-app', businessDomainId: 'demo-domain',
      planId: 'demo-plan', runId: 'jenkins-run-001',
      details: expect.objectContaining({ operationKey: 'demo:POST /items', realtime: true }),
    }));
    expect(events[1]).toEqual(expect.objectContaining({
      eventType: 'operation.called', applicationId: 'target-app', businessDomainId: 'demo-domain',
      planId: 'demo-plan', runId: 'jenkins-run-001', outcome: 'success',
      details: expect.objectContaining({ operationKey: 'demo:POST /items', realtime: true }),
    }));
  } finally {
    for (const [key, value] of Object.entries({
      SYSTEM_TEST_AUDIT_EVENT_LOG: previous.log,
      SYSTEM_TEST_RUN_ID: previous.run,
      SYSTEM_TEST_APPLICATION_ID: previous.app,
      SYSTEM_TEST_BUSINESS_DOMAIN_ID: previous.domain,
      SYSTEM_TEST_PLAN_ID: previous.plan,
    })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('项目适配器可配置正式 caseId 注解而无需修改公共操作合同', {
  annotation: [{ type: 'adapter-case-id', description: 'CASE-ADAPTER-001' }],
}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'realtime-audit-case-id-'));
  const previous = {
    log: process.env.SYSTEM_TEST_AUDIT_EVENT_LOG,
    run: process.env.SYSTEM_TEST_RUN_ID,
    app: process.env.SYSTEM_TEST_APPLICATION_ID,
    types: process.env.SYSTEM_TEST_CASE_ID_ANNOTATION_TYPES,
  };
  const logPath = path.join(root, 'events.jsonl');
  Object.assign(process.env, {
    SYSTEM_TEST_AUDIT_EVENT_LOG: logPath,
    SYSTEM_TEST_RUN_ID: 'run-adapter-001',
    SYSTEM_TEST_APPLICATION_ID: 'application-adapter',
    SYSTEM_TEST_CASE_ID_ANNOTATION_TYPES: 'system-test-case-id,adapter-case-id',
  });
  try {
    const operation = startExecutableOperation({
      executionId: 'test-execution-adapter', operationKey: 'object:update', title: '更新对象', method: 'PATCH',
    });
    finishExecutableOperation(operation, 'passed');
    expect(new FileAuditEventStore({ filePath: logPath }).readAll())
      .toEqual(expect.arrayContaining([expect.objectContaining({ caseId: 'CASE-ADAPTER-001' })]));
  } finally {
    for (const [key, value] of Object.entries({
      SYSTEM_TEST_AUDIT_EVENT_LOG: previous.log,
      SYSTEM_TEST_RUN_ID: previous.run,
      SYSTEM_TEST_APPLICATION_ID: previous.app,
      SYSTEM_TEST_CASE_ID_ANNOTATION_TYPES: previous.types,
    })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
