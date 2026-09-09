import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { readCaseOutcome } from '../../scripts/run-product-center-source-governed';
import { classifyProductCenterExecutionDiagnostic } from '../../scripts/build-product-center-execution-repair-queue';
import { evaluateUnsupportedAddonMainImagePreview } from '../../flows/product-center/item-216/addon-main-image-evidence';

const workspaceRoot = path.resolve(__dirname, '../..');

function readWorkspaceSource(relativePath: string): string {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
}

test('TC-IMG-ITEM-030 emits a current standard execution receipt', () => {
  const source = readWorkspaceSource('tests/generated/product-center-legacy-remaining.generated.spec.ts');
  const caseBlock = source.slice(
    source.indexOf("registerSelectedTest('TC-IMG-ITEM-030"),
    source.indexOf("registerSelectedTest('图片库点击缩略图可查看大图'"),
  );

  expect(caseBlock).toContain('}, testInfo) =>');
  expect(caseBlock).toContain("handlerId: 'legacy-remaining:item-detail-image-delete-middle'");
  expect(caseBlock).toContain('await cleanupRegistry.cleanupAll()');
  expect(caseBlock).toContain('await attachRuntimeEvidence(testInfo');
});

test('duplicate tag-group cases emit three operations and observed UI cleanup evidence', () => {
  const source = readWorkspaceSource('tests/generated/product-center-legacy-remaining.generated.spec.ts');
  const pageSource = readWorkspaceSource('pages/product-center/tag-management.page.ts');
  const runnerSource = readWorkspaceSource('scripts/run-product-center-source-governed.ts');
  const caseBlock = source.slice(
    source.indexOf('const duplicateGroupCases'),
    source.indexOf('const duplicateTagCases'),
  );

  expect(caseBlock.match(/await executeLegacyOperation\(testInfo/g)).toHaveLength(3);
  expect(caseBlock).toContain(':create-tag-group`');
  expect(caseBlock).toContain(':reject-duplicate-tag-group`');
  expect(caseBlock).toContain(':read-tag-groups`');
  expect(caseBlock).toContain('await new TagManagementPage(page).verifyTagGroupAbsent(');
  expect(caseBlock).toContain('uiCleanupVerification,');
  expect(caseBlock).toContain("requiredEvidence: ['navigation', 'mutation', 'api-read', 'ui-assertion', 'cleanup']");
  expect(pageSource).toContain("@step('核验标签分组选择器不再显示：{groupName}')");
  expect(pageSource).toContain("dropdown.getByText(groupName, { exact: true }).count()");
  expect(runnerSource).toContain("'TC-TAG-DESC-013'");
  expect(runnerSource).toContain("'TC-TAG-STAT-012'");
  expect(runnerSource).toContain("sources.push('pages/sidebar.page.ts', 'pages/product-center/tag-management.page.ts')");
});

test('shared authentication failure leaves unstarted business cases interrupted', () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-auth-interrupted-'));
  const reportPath = path.join(temporaryDirectory, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    suites: [{
      specs: [{
        title: '保存商户中心登录态',
        tests: [{
          status: 'unexpected',
          annotations: [],
          results: [{ error: { message: 'ProductCenterAuthFlowError: oauth-submit' } }],
        }],
      }],
    }],
  }), 'utf8');
  try {
    expect(readCaseOutcome([reportPath], 'TC-TAG-DESC-013')).toEqual({ status: 'interrupted' });
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('TC-ITEM-ADD-035 distinguishes a raw image click from a business-clickable control', () => {
  const source = readWorkspaceSource('flows/product-center/item-216/addon-item-216.flow.ts');
  const evidenceSource = readWorkspaceSource('flows/product-center/item-216/addon-main-image-evidence.ts');
  const method = source.slice(
    source.indexOf("@step('验证加料商品主图列表大图预览')"),
    source.indexOf("@step('验证第二张主图覆盖第一张')"),
  );

  expect(method).toContain('evaluateUnsupportedAddonMainImagePreview');
  expect(evidenceSource).toContain('input.clicked.tabIndex >= 0');
  expect(evidenceSource).toContain('cursorIsVisualHintOnly: true');
  expect(evidenceSource).not.toContain("input.clicked.cursor === 'pointer'");
  expect(evidenceSource).toContain("classification: matchesExpected ? 'accepted-observed' : 'product-defect'");
  expect(evidenceSource).toContain("status: matchesExpected ? 'verified' : 'observed-mismatch'");
  expect(method).not.toContain('expect(outcome.businessClickable');
  expect(method).not.toContain('expect(preview.previewCount');
  expect(method).not.toContain('MAIN_IMAGE_PREVIEW_OVERLAY_NOT_OBSERVED');
});

test('TC-ITEM-ADD-035 不把单独的手型光标误判为大图预览能力', () => {
  const outcome = evaluateUnsupportedAddonMainImagePreview({
    created: {},
    sources: ['https://example.invalid/addon.png'],
    clicked: {
      source: 'https://example.invalid/addon.png',
      rowIndex: 0,
      className: 'item-image',
      role: '',
      ancestorRole: '',
      tabIndex: -1,
      cursor: 'pointer',
    },
    preview: { previewCount: 0, previewSource: '' },
    surface: { dialogCount: 0, modalCount: 0 },
  });

  expect(outcome.businessClickable).toBe(false);
  expect(outcome.evidence).toMatchObject({
    classification: 'accepted-observed',
    clickabilityEvidence: {
      semanticClickable: false,
      previewObserved: false,
      cursor: 'pointer',
      cursorIsVisualHintOnly: true,
    },
    assertionReceipts: [{
      status: 'verified',
      comparison: 'matched',
    }],
  });
});

test('TC-ITEM-ADD-035 将可操作语义或实际预览判定为预期不匹配', () => {
  const baseInput = {
    created: {},
    sources: ['https://example.invalid/addon.png'],
    clicked: {
      source: 'https://example.invalid/addon.png',
      rowIndex: 0,
      className: 'item-image',
      role: '',
      ancestorRole: '',
      tabIndex: -1,
      cursor: 'default',
    },
    preview: { previewCount: 0, previewSource: '' },
    surface: { dialogCount: 0, modalCount: 0 },
  };
  const semanticOutcome = evaluateUnsupportedAddonMainImagePreview({
    ...baseInput,
    clicked: { ...baseInput.clicked, role: 'button' },
  });
  const previewOutcome = evaluateUnsupportedAddonMainImagePreview({
    ...baseInput,
    preview: { previewCount: 1, previewSource: 'https://example.invalid/addon.png' },
  });

  for (const outcome of [semanticOutcome, previewOutcome]) {
    expect(outcome.businessClickable).toBe(true);
    expect(outcome.evidence).toMatchObject({
      classification: 'product-defect',
      assertionReceipts: [{
        status: 'observed-mismatch',
        comparison: 'mismatched',
      }],
    });
  }
});

test('standard item rule-group search explicitly submits the filtered query', () => {
  const source = readWorkspaceSource('pages/product-management/item/item-create-standard.page.ts');
  const method = source.slice(
    source.indexOf('private async selectRuleGroup('),
    source.indexOf('private readStandardMainImageSources'),
  );

  expect(method).toContain('await searchInput.fill(groupName)');
  expect(method).toContain('await settleInput()');
  expect(method).toContain("await searchInput.press('Enter')");
  expect(method).toContain('requestCompleted: () => listRequestCompleted');
});

test('item create page distinguishes a 403 terminal from a Save locator timeout', () => {
  const source = readWorkspaceSource('pages/product-management/item/item-create-form.page.ts');

  expect(source).toContain("getByText('403 无权限', { exact: true })");
  expect(source).toContain('MERCHANT_PAGE_ACCESS_FORBIDDEN');
  expect(source).toContain('业务操作尚未开始');
  expect(source).not.toContain("saveButton.waitFor({ state: 'visible', timeout: 30_000 })");
});

test('TC-ITEM-ADD-027 and TC-ITEM-ADD-034 require fresh reference receipts before delete classification', () => {
  const flow = readWorkspaceSource('flows/product-center/item-216/addon-item-216.flow.ts');
  const factory = readWorkspaceSource('test-data/product-center/item-216/addon-item-216.factory.ts');
  const method = flow.slice(
    flow.indexOf("@step('验证加料组引用阻断删除')"),
    flow.indexOf("@step('验证菜单引用阻断加料商品删除')"),
  );

  expect(method).toContain('readAddonGroupReferenceEvidence');
  expect(method).toContain('readAddonOwnerReferenceEvidence');
  expect(method).toContain('TEST_DATA_REFERENCE_NOT_PERSISTED');
  expect(method).toContain("classification = deletionBlocked && feedbackMatched ? 'accepted-observed' : 'product-defect'");
  expect(method).toContain('assertionReceipts');
  expect(method).toContain("observationChannel: 'api'");
  expect(method).toContain("observationChannel: 'ui'");
  expect(factory).toContain('findAddonGroupItemRecords(await this.api.addonGroupDetail(groupId), groupId, itemId)');
  expect(factory).toContain('hasAddonOwnerReference(');
});

test('source result arbitration recognizes complete mismatched standard receipts as product evidence', () => {
  const source = readWorkspaceSource('scripts/run-product-center-source-governed.ts');

  expect(source).toContain("'test-execution-receipt'");
  expect(source).toContain("item.status === 'observed-mismatch'");
  expect(source).toContain('cleanup.apiZeroResidue === true');
  expect(source).toContain('cleanup.uiVerificationObserved === true');
  expect(source).toContain('cleanup.uiZeroResidue === true');
  expect(source).toContain('productMismatchConfirmed: true');
});

test('structured product-difference evidence survives repair-queue classification', () => {
  const queueSource = readWorkspaceSource('scripts/build-product-center-execution-repair-queue.ts');

  expect(queueSource).toContain('readProductDifferenceEvidence');
  expect(queueSource).toContain("candidate.name === 'product-center-group-product-difference-evidence'");
  expect(queueSource).toContain("attachment.name === 'test-execution-receipt'");
  expect(queueSource).toContain('payload.cleanup?.apiZeroResidue === true');
  expect(queueSource).toContain('evidence.evidenceComplete === true');
  expect(queueSource).toContain('evidence.productMismatchConfirmed === true');
  expect(queueSource).toContain('evidence.executionPathEquivalent === true');
  expect(classifyProductCenterExecutionDiagnostic('TC-ITEM-PKG-078 PRODUCT-BEHAVIOR', {
    evidenceComplete: true,
    productMismatchConfirmed: true,
    executionPathEquivalent: true,
  })).toBe('product-behavior');
  expect(classifyProductCenterExecutionDiagnostic('TC-ITEM-PKG-078 PRODUCT-BEHAVIOR', {
    evidenceComplete: false,
    productMismatchConfirmed: false,
    executionPathEquivalent: false,
  })).toBe('needs-diagnostic');
});

test('project optimization impact types stay limited to explicitly impacted cases', () => {
  const source = readWorkspaceSource('scripts/build-product-center-optimization-plan.ts');

  expect(source).toContain('impactedCaseIdSet.has(item.caseId)');
  expect(source).toContain(": 'platform-only'");
});

test('420 Allure merge accepts newly executed cases without exceeding canonical coverage', () => {
  const source = readWorkspaceSource('scripts/build-product-center-420-allure-merge.ts');

  expect(source).toContain('const expectedResultCases = Number(coverage.summary.actualResultCases');
  expect(source).toContain('- new Set(removed).size');
  expect(source).toContain('+ copied.length');
  expect(source).toContain('合并结果数超过覆盖总数');
  expect(source).not.toContain('!= 覆盖审计结果数');
});

test('product differences cannot be signed as verified or manual-accepted', () => {
  const source = readWorkspaceSource('tests/generated/product-center-item-216.generated.spec.ts');

  expect(source).toContain("if (runtimeStatusFromEvidence(evidence) === 'product-defect') return false;");
  expect(source).toContain('verified: verifiedAssertionIds');
  expect(source).toContain('assertionReceipts,');
  expect(source).toContain("testInfo.attach('product-center-product-difference-evidence'");
  const runner = readWorkspaceSource('scripts/run-product-center-source-governed.ts');
  expect(runner).toContain("'product-center-product-difference-evidence'");
});

test('seasoning attachment rebinding cannot delete non-seasoning receipts', () => {
  const source = readWorkspaceSource('adapters/test-automation-platform/allure-reporting.ts');
  const normalization = source.slice(
    source.indexOf('function normalizeAllureResult'),
    source.indexOf('function removeFrameworkMetadataSteps'),
  );

  expect(normalization).toContain("if (caseId?.startsWith('TC-FLV-'))");
  expect(normalization).toContain('rebindSeasoningEvidenceContainers');
  expect(normalization).toContain('normalizeSeasoningBusinessDetails');
});

test('fixed combo confirmation waits for selected and stable UI state', () => {
  const source = readWorkspaceSource('pages/product-management/item/item-create-combo.page.ts');
  const helperSource = readWorkspaceSource('utils/async-table-unique-selection.ts');

  expect(source).toContain('clickStableAsyncSelectionConfirm({');
  expect(source).toContain("label: 'Select Fixed Combo'");
  expect(source).toContain('clickStableLocator({ locator: menuItem');
  expect(source).not.toContain('menuItem.scrollIntoViewIfNeeded');
  expect(helperSource).toContain('selected: await input.selectedControl.isChecked()');
  expect(helperSource).toContain('state.stableForMs >= 300');
});

test('Chinese locale detection is anchored to the translated item navigation link', () => {
  const source = readWorkspaceSource('pages/sidebar.page.ts');

  expect(source).toContain("page.locator('a[href=\"/pp/brand/list\"]')");
  expect(source).toContain('.filter({ hasText: /^商品$/ })');
  expect(source).not.toContain('page.getByText(/商品|调味|标签/).first()');
});

test('residue retries do not emit swallowed decorated search failures', () => {
  const source = readWorkspaceSource('pages/product-management/item/item-list.page.ts');
  const residueMethod = source.slice(
    source.indexOf("@step('按商品名称执行残留搜索：{keyword}')"),
    source.indexOf("@step('进入新增商品类型选择页')"),
  );

  expect(source).toContain('private async performSearchAndWait(keyword: string)');
  expect(residueMethod).toContain('await this.performSearchAndWait(keyword)');
  expect(residueMethod).not.toContain('await this.fillSearchAndWait(keyword)');
});

test('targeted incremental execution does not reopen full evidence governance without finalize', () => {
  const source = readWorkspaceSource('scripts/run-product-center-approved-incremental.ts');

  expect(source).toContain('options.finalize ? runProductCenterEvidenceClosureFlow() : 0');
  expect(source).toContain("finalize: process.argv.includes('--finalize')");
  expect(source.indexOf('assertIncrementalPreflight')).toBeLessThan(source.indexOf('runProductCenterSourceGoverned({'));
});

test('source-governed batch authenticates once and item runner reuses the shared state', () => {
  const source = readWorkspaceSource('scripts/run-product-center-source-governed.ts');
  const itemRunner = readWorkspaceSource('scripts/run-product-center-item-213.ts');

  expect(source).toContain('authSetupExitCode = runBatchAuthSetup(governedEnv)');
  expect(source).toContain("PC_BATCH_AUTH_VERIFIED: '1'");
  expect(source).toContain('authSetupCount: 1');
  expect(itemRunner).toContain("process.env.PC_BATCH_AUTH_VERIFIED === '1'");
  expect(itemRunner).toContain("status: 'reused'");
  expect(itemRunner).toContain('session?.cleanup()');
});

test('type-filter completion accepts an empty result only after filter state is confirmed', () => {
  const source = readWorkspaceSource('pages/product-management/item/item-list.page.ts');
  const method = source.slice(
    source.indexOf('private async waitForTypeFilterApplied'),
    source.indexOf("@step('进入图片导入页')"),
  );

  expect(method).toContain('readTypeFilterApplicationState');
  expect(method).toContain('state.selectionApplied && (state.rowCount === 0');
  expect(method).toContain('checkedTypeFilters()');
  expect(method).not.toContain('typeTexts.length > 0 && typeTexts.every');
});
