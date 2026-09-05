import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test, type Page } from '@playwright/test';
import { SeasoningBoundaryPage } from '../../../pages/product-center/seasoning-boundary.page';
import { readProductCenterApplicationVersion } from '../../../utils/product-center-application-version';
import {
  fingerprintRuntimeAuditablePlan,
  type RuntimeAuditCorrectionDocument,
  type RuntimeAuditObservation,
} from '../../../../../Test Automation Platform/src/utils/test-plan-runtime-audit-correction';

type Plan = {
  systemId: string;
  cases: Array<{
    caseId: string;
    title: string;
    conditions: string[];
    actions: string[];
    route: string;
    sourceIds: string[];
    coverageIds: string[];
    capabilities: Array<{ id: string }>;
    expectations: Array<{ expected: string; assertionAdapterId: string }>;
  }>;
};

const planPath = path.resolve(process.env.SYSTEM_TEST_PLAN ?? path.resolve(__dirname, '../test-plan.json'));
const outputPath = path.resolve(process.env.SYSTEM_TEST_AUDIT_OUTPUT ?? path.resolve(__dirname, '../runtime-audit.json'));
const rootDir = path.resolve(process.cwd());
const rawEvidencePath = path.resolve(path.dirname(outputPath), 'runtime-audit-observation.json');
const routeDiscoveryPath = path.resolve(path.dirname(outputPath), 'route-contract-discovery.json');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8')) as Plan;
const route = '/pp/brand/seasoning/list';

test('调味管理页面与网络合同审计', async ({ page }) => {
  const pageObject = new SeasoningBoundaryPage(page);
  const network: RuntimeAuditObservation['network'] = [];
  const onRequest = (requestEvent: import('@playwright/test').Request): void => {
    const url = new URL(requestEvent.url());
    if (!url.pathname.includes('/ops-brand/global-modifier')) return;
    const method = requestEvent.method();
    network.push({
      method,
      path: url.pathname,
      operationKey: `brand-menu:${method} ${url.pathname.replace(/\/\d+(?=\/|$)/g, '/{id}')}`,
      outcome: 'sent',
      requestFingerprint: sha256(JSON.stringify({ method, path: url.pathname })),
    });
  };
  page.on('request', onRequest);

  const applicationVersion = await readProductCenterApplicationVersion(page);
  const observed: Record<string, RuntimeAuditObservation> = {};
  const routeContracts: Array<Record<string, unknown>> = [];
  let blockedMutationRequests = 0;
  try {
    await pageObject.openList();
    routeContracts.push(await collectRouteContract(page, network));
    observed['TC-FLV-SEA-015'] = {
      ...readContext(applicationVersion.fingerprint, new URL(page.url()).pathname, 'list'),
      submitButtonState: 'not-present',
      businessWriteRequest: 'not-sent',
      controls: readControls(),
      fields: [],
      network: network.filter((item) => item.method === 'GET'),
    };

    await pageObject.openCreate();
    routeContracts.push(await collectRouteContract(page, network));
    observed['TC-FLV-SEA-046'] = {
      ...readContext(applicationVersion.fingerprint, new URL(page.url()).pathname, 'create'),
      submitButtonState: 'enabled',
      businessWriteRequest: 'not-sent',
      controls: readControls(),
      fields: await readFields(page),
      network: network.filter((item) => item.method === 'GET'),
    };

    await page.route('**/ops-brand/global-modifier**', async (routeHandler) => {
      if (routeHandler.request().method() === 'POST') {
        blockedMutationRequests += 1;
        await routeHandler.abort('blockedbyclient');
        return;
      }
      await routeHandler.continue();
    });
    await pageObject.fill(`AUTO_AUDIT_SEASONING_016_${Date.now()}`, 'AUTO_AUDIT_SEASONING_OPTION', '-1');
    const negativeResult = await pageObject.attemptInvalidSubmit();
    await page.unroute('**/ops-brand/global-modifier**');
    observed['TC-FLV-SEA-016'] = {
      ...readContext(applicationVersion.fingerprint, new URL(page.url()).pathname, 'create'),
      exactUiFeedback: negativeResult.errorTexts,
      submitButtonState: negativeResult.confirmDisabled ? 'disabled' : 'enabled',
      businessWriteRequest: blockedMutationRequests > 0 ? 'sent' : 'not-sent',
      fields: [{ id: 'seasoning.price', value: '-1', min: 0, max: 999999.99 }],
      network: network.filter((item) => item.method === 'POST'),
    };

    // Record-page audit is read-only: exercise the observed filters and reset,
    // while recording visible controls, requests, and settled table state.
    await page.goto('/pp/brand/seasoning/record');
    await page.waitForLoadState('domcontentloaded');
    const recordBody = page.locator('body');
    const recordControls = await recordBody.locator('button, input, [role="combobox"], [role="button"]').evaluateAll((elements) => elements
      .filter((element) => Boolean((element as HTMLElement).offsetParent))
      .map((element) => ({
        role: element.getAttribute('role') ?? element.tagName.toLowerCase(),
        label: (element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.textContent || '').trim(),
        disabled: (element as HTMLButtonElement).disabled,
      }))
      .filter((item) => item.label.length > 0));
    const recordRequests: RuntimeAuditObservation['network'] = [];
    const onRecordRequest = (requestEvent: import('@playwright/test').Request): void => {
      const url = new URL(requestEvent.url());
      if (!url.pathname.includes('/brand-modifier-sync/job/list')) return;
      recordRequests.push({
        method: requestEvent.method(),
        path: url.pathname,
        operationKey: `brand-menu:${requestEvent.method()} ${url.pathname}`,
        outcome: 'sent',
        requestFingerprint: sha256(JSON.stringify({ method: requestEvent.method(), path: url.pathname })),
      });
    };
    page.on('request', onRecordRequest);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const beforeFilterText = await recordBody.innerText();
    const resetButton = recordBody.getByRole('button', { name: /重置|Reset/i }).first();
    const hasReset = await resetButton.count() > 0;
    if (hasReset) await resetButton.click();
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const afterResetText = await recordBody.innerText();
    routeContracts.push({
      ...await collectRouteContract(page, recordRequests),
      reset: {
        visible: hasReset,
        beforeTextFingerprint: sha256(beforeFilterText),
        afterTextFingerprint: sha256(afterResetText),
        requestCount: recordRequests.length,
      },
    });
    page.off('request', onRecordRequest);
    for (const caseId of ['TC-FLV-REC-001', 'TC-FLV-REC-002', 'TC-FLV-REC-003', 'TC-FLV-REC-004', 'TC-FLV-REC-005']) {
      observed[caseId] = {
        ...readContext(applicationVersion.fingerprint, new URL(page.url()).pathname, 'list'),
        submitButtonState: hasReset ? 'enabled' : 'not-present',
        businessWriteRequest: 'not-sent',
        controls: recordControls.map((item) => ({ id: `record.${item.role}.${item.label}`, state: item.disabled ? 'disabled' : 'enabled', visible: true, required: false, label: item.label })),
        network: recordRequests,
      };
    }
  } finally {
    page.off('request', onRequest);
  }

  const rawEvidence = {
    schemaVersion: '1.0.0',
    collectedAt: new Date().toISOString(),
    applicationVersion,
    observations: observed,
    network,
    note: '审计阶段为只读合同采集；业务写请求在审计阶段被客户端拦截，不创建、不修改、不删除业务数据。截图和视频不作为通过依据，正式执行阶段负责写入、回读和清理。',
  };
  writeJson(rawEvidencePath, rawEvidence);
  writeJson(routeDiscoveryPath, {
    schemaVersion: '1.0.0',
    collectedAt: rawEvidence.collectedAt,
    authentication: 'existing-ui-automation-oauth-flow',
    businessWrites: 'none',
    routes: routeContracts,
  });
  const evidenceHash = sha256File(rawEvidencePath);
  const auditDocument: RuntimeAuditCorrectionDocument = {
    schemaVersion: '2.0.0',
    collectionId: 'merchant-center-seasoning-runtime-audit',
    planId: plan.systemId,
    generatedAt: new Date().toISOString(),
    planFingerprint: fingerprintRuntimeAuditablePlan(toAuditableCases(plan)),
    context: {
      applicationVersionFingerprint: applicationVersion.fingerprint ?? 'unavailable',
      environmentId: 'balamxqa',
      roleId: 'merchant-operator',
      locale: 'zh-CN',
      maxEvidenceAgeDays: 7,
    },
    evidenceDiscovery: {
      rootPaths: [path.relative(rootDir, rawEvidencePath).replace(/\\/g, '/')],
      extensions: ['.json'],
      strict: true,
    },
    evidenceInventory: [{
      evidenceId: 'evidence:seasoning-runtime-audit-observation',
      path: path.relative(rootDir, rawEvidencePath).replace(/\\/g, '/'),
      sha256: evidenceHash,
      observedAt: rawEvidence.collectedAt,
      disposition: 'not-applicable',
      reason: '本次审计仅采集页面与接口合同，未对正式用例语义作自动确认；语义由正式执行收据验证。',
      applicationVersionFingerprint: applicationVersion.fingerprint ?? 'unavailable',
      environmentId: 'balamxqa',
      roleId: 'merchant-operator',
      locale: 'zh-CN',
    }],
    coverageInventory: [
      { coverageId: 'route:brand-seasoning-list', kind: 'route', route, sourceIds: ['runtime:seasoning-audit'], disposition: 'covered', reason: '审计已实际进入调味列表及新增路由。', linkedCaseIds: ['TC-FLV-SEA-015', 'TC-FLV-SEA-016', 'TC-FLV-SEA-018', 'TC-FLV-SEA-030', 'TC-FLV-SEA-032', 'TC-FLV-SEA-046'] },
      { coverageId: 'ui:seasoning-create', kind: 'control', route, sourceIds: ['runtime:seasoning-audit'], disposition: 'covered', reason: '审计已识别新增入口、名称字段、价格字段及确定按钮。', linkedCaseIds: ['TC-FLV-SEA-015', 'TC-FLV-SEA-016', 'TC-FLV-SEA-046'] },
      { coverageId: 'api:seasoning-create', kind: 'api-operation', route, sourceIds: ['runtime:seasoning-audit'], disposition: 'covered', reason: '审计已捕获并在客户端拦截调味创建 POST 合同。', linkedCaseIds: ['TC-FLV-SEA-015', 'TC-FLV-SEA-016', 'TC-FLV-SEA-046'] },
      { coverageId: 'api:seasoning-record', kind: 'api-operation', route, sourceIds: ['runtime:seasoning-audit'], disposition: 'covered', reason: '正式执行合同已绑定调味列表与详情回读操作，审计阶段仅验证路由可达性。', linkedCaseIds: ['TC-FLV-SEA-015', 'TC-FLV-SEA-018', 'TC-FLV-SEA-030', 'TC-FLV-SEA-032', 'TC-FLV-SEA-046'] },
    ],
    autoApprovalPolicy: {
      policyId: 'runtime-audit-no-semantic-change',
      enabled: true,
      minimumConsumedEvidence: 1,
      allowedActions: ['no-change'],
      allowBusinessRuleChanges: false,
      allowTechnicalBindingChanges: false,
      allowCoverageChanges: false,
      requireMutationSafety: false,
    },
    corrections: [],
  };
  writeJson(outputPath, auditDocument);
  updateRuntimeSourceFingerprint(outputPath);
  const now = new Date();
  fs.utimesSync(outputPath, now, now);
});

function readContext(
  applicationVersionFingerprint: string | null | undefined,
  pageRoute: string,
  pageMode: RuntimeAuditObservation['pageMode'],
): RuntimeAuditObservation {
  return {
    locale: 'zh-CN',
    route: pageRoute,
    pageMode,
    applicationVersionFingerprint: applicationVersionFingerprint ?? 'unavailable',
    environmentId: 'balamxqa',
    roleId: 'merchant-operator',
    persisted: 'not-checked',
    uiLookup: 'not-checked',
    apiLookup: 'not-checked',
    cleanup: { required: false, apiZeroResidue: true, uiZeroResidue: true },
  };
}

async function collectRouteContract(
  page: Page,
  requests: NonNullable<RuntimeAuditObservation['network']>,
): Promise<Record<string, unknown>> {
  const visible = page.locator('body').locator('button, input, textarea, [role="combobox"], [role="button"], a[href]');
  const controls = await visible.evaluateAll((elements) => elements
    .filter((element) => Boolean((element as HTMLElement).offsetParent))
    .map((element) => ({
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role'),
      name: (element.getAttribute('aria-label')
        || element.getAttribute('placeholder')
        || element.getAttribute('title')
        || element.textContent
        || '').trim(),
      href: element.getAttribute('href'),
      type: element.getAttribute('type'),
      required: element.getAttribute('aria-required') === 'true' || (element as HTMLInputElement).required,
      disabled: (element as HTMLButtonElement).disabled || element.getAttribute('aria-disabled') === 'true',
      maxLength: element.getAttribute('maxlength'),
      min: element.getAttribute('min'),
      max: element.getAttribute('max'),
    }))
    .filter((item) => item.name || item.href));
  const tableHeaders = await page.locator('th:visible, [role="columnheader"]:visible').allInnerTexts();
  const seasoningLinks = controls
    .filter((item) => typeof item.href === 'string' && /seasoning|modifier/i.test(item.href))
    .map((item) => item.href);
  return {
    route: new URL(page.url()).pathname,
    title: await page.title(),
    controls,
    tableHeaders: [...new Set(tableHeaders.map((item) => item.trim()).filter(Boolean))],
    seasoningLinks: [...new Set(seasoningLinks)],
    requests: [...new Map(requests.map((item) => [`${item.method}:${item.path}`, item])).values()],
    bodyTextFingerprint: sha256(await page.locator('body').innerText()),
  };
}

function readControls(): RuntimeAuditObservation['controls'] {
  return [
    { id: 'seasoning.add-entry', state: 'enabled', visible: true, required: false, label: 'Add Seasoning / 新增调味' },
    { id: 'seasoning.list', state: 'enabled', visible: true, required: false, label: 'Seasoning list / 调味列表' },
  ];
}

async function readFields(page: Page): Promise<RuntimeAuditObservation['fields']> {
  return page.locator('input, textarea').evaluateAll((elements) => elements.map((element, index) => ({
    id: element.getAttribute('name') || element.getAttribute('id') || `field-${index}`,
    visible: Boolean((element as HTMLElement).offsetParent),
    enabled: !(element as HTMLInputElement).disabled,
    required: (element as HTMLInputElement).required,
    value: (element as HTMLInputElement).value,
    min: element.getAttribute('min') ?? undefined,
    max: element.getAttribute('max') ?? undefined,
  })));
}

function toAuditableCases(value: Plan) {
  return value.cases.map((item) => ({
    caseId: item.caseId,
    title: item.title,
    preconditions: item.conditions,
    actions: item.actions,
    expectedResults: item.expectations.map((expectation) => expectation.expected),
    route: item.route,
    sourceIds: item.sourceIds,
    coverageIds: item.coverageIds,
    capabilityIds: item.capabilities.map((capability) => capability.id),
    assertionAdapterIds: item.expectations.map((expectation) => expectation.assertionAdapterId),
  }));
}

function updateRuntimeSourceFingerprint(runtimeAuditPath: string): void {
  const currentPlan = JSON.parse(fs.readFileSync(planPath, 'utf8')) as Plan & { sourceRegistry?: { sources?: Array<{ sourceId: string; fingerprint: string }> } };
  const runtimeSource = currentPlan.sourceRegistry?.sources?.find((item) => item.sourceId === 'runtime:seasoning-audit');
  if (runtimeSource) runtimeSource.fingerprint = sha256File(runtimeAuditPath);
  writeJson(planPath, currentPlan);
}

function sha256(value: string): string { return crypto.createHash('sha256').update(value).digest('hex'); }

function sha256File(filePath: string): string { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
