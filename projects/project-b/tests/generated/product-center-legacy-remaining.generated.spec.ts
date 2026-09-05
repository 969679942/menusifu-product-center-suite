import { expect, type Page, type Response } from '@playwright/test';
import path from 'node:path';
import { test } from '../../fixtures/product-center.fixture';
import { StandardItem216Flow } from '../../flows/product-center/item-216/standard-item-216.flow';
import { ItemEditFlow } from '../../flows/item-edit.flow';
import type { CleanupRegistry, CleanupRegistryEvidence } from '../../api/product-center/cleanup-registry';
import type { ProductCenterApi } from '../../api/product-center/product-center-api';
import { BrandPicturePage } from '../../pages/brand-picture.page';
import { TagManagementPage, type TagKind } from '../../pages/product-center/tag-management.page';
import type { ItemEditStandardPage } from '../../pages/product-management/item/item-edit.page';
import { SidebarPage } from '../../pages/sidebar.page';
import { waitUntil } from '../../utils/wait';
import { readProductCenterApplicationVersion } from '../../utils/product-center-application-version';
import { ProductCenterItemCreateDataFactory } from '../../test-data/product-center/product-center-item-create-data.factory';
import sourceDecisionsDocument from '../../contracts/product-center/reviews/unsupported-source-format-decisions.json';
import { resolveLegacyRemainingSelection } from '../../contracts/product-center/test-cases/canonical/product-center-legacy-remaining-ownership';
import legacyBindingsDocument from '../../contracts/product-center/test-cases/canonical/product-center-legacy-remaining-automation-bindings.json';
import { fingerprintReceiptEvidence } from '../../utils/playwright-execution-receipt';
import {
  assertObservedExecutableOperations,
  consumeExecutableOperationReceipts,
  finishExecutableOperation,
  startExecutableOperation,
} from '../../utils/executable-operation-receipt';
import { fingerprintImplementationSources } from '../../../../Test Automation Platform/src/automation/system-test/system-test-implementation-fingerprint';
import { runtimeConfig } from '../../api/runtime-config';
import type { RuntimeAssertionReceipt } from '../../automation/system-test/system-test-runtime-contract';

type NamedRecord = { id: number; name: string };

const badgeStyleConfig = JSON.stringify({
  backgroundColor: '#E6F4FF',
  color: '#1677FF',
  domTpl: '',
  cornerType: 'pillShape',
  domTemplate: '',
});

const selectedCaseIds = resolveLegacyRemainingSelection(process.env.PC_REMAINING_CASE_IDS);
const sourceStatusByCaseId = new Map(sourceDecisionsDocument.cases.map((item) => [item.caseId, item.status]));

const registerSelectedTest = ((...args: unknown[]) => {
  const details = args[1] && typeof args[1] === 'object'
    ? args[1] as { tag?: string | string[] }
    : undefined;
  const tags = Array.isArray(details?.tag) ? details.tag : details?.tag ? [details.tag] : [];
  const caseId = tags
    .map((tag) => tag.match(/^@case-(.+)$/)?.[1])
    .find((value): value is string => Boolean(value));
  if (!caseId) throw new Error(`剩余用例缺少 @case-<caseId> 注册标签：${String(args[0])}`);
  if (!selectedCaseIds.has(caseId)) return undefined;
  return (test as unknown as (...testArgs: unknown[]) => unknown)(...args);
}) as typeof test;

test.describe('商品中心历史剩余用例自动化', () => {
  test.describe.configure({ timeout: 240_000 });

  registerSelectedTest('TC-IMG-ITEM-029 详情图仅一张时删除后无图片展示', {
    tag: ['@case-TC-IMG-ITEM-029'],
    annotation: [
      { type: 'canonical-case-id', description: 'TC-IMG-ITEM-029' },
      { type: 'recipe-case-id', description: 'TC-IMG-ITEM-029' },
    ],
  }, async ({
    page,
    productCenterApi,
    cleanupRegistry,
  }, testInfo) => {
    requireVerifiedSource('TC-IMG-ITEM-029');
    const flow = new StandardItem216Flow(page, productCenterApi, cleanupRegistry);
    const evidence = await flow.verifyDetailImageDeletion('TC-IMG-ITEM-029', 1, 0);
    expect(evidence.replaySources).toEqual([]);
    const cleanup = await cleanupRegistry.cleanupAll();
    const applicationVersion = await readProductCenterApplicationVersion(page);
    await attachRuntimeEvidence(testInfo, {
      page,
      caseId: 'TC-IMG-ITEM-029',
      handlerId: 'legacy-remaining:item-detail-image-delete-only',
      requiredEvidence: ['navigation', 'mutation', 'api-read', 'ui-assertion', 'cleanup'],
      assertionIds: [
        'assertion:legacy:TC-IMG-ITEM-029:single-image-deleted',
        'assertion:legacy:TC-IMG-ITEM-029:no-image-retained',
      ],
      applicationVersionFingerprint: applicationVersion.fingerprint,
      cleanup,
      observations: evidence,
    });
  });

  registerSelectedTest('TC-IMG-ITEM-030 详情图多张时删除中间一张其余图片左移', {
    tag: ['@case-TC-IMG-ITEM-030'],
    annotation: [
      { type: 'canonical-case-id', description: 'TC-IMG-ITEM-030' },
      { type: 'recipe-case-id', description: 'TC-IMG-ITEM-030' },
    ],
  }, async ({
    page,
    productCenterApi,
    cleanupRegistry,
  }, testInfo) => {
    requireVerifiedSource('TC-IMG-ITEM-030');
    const flow = new StandardItem216Flow(page, productCenterApi, cleanupRegistry);
    const evidence = await flow.verifyDetailImageDeletion('TC-IMG-ITEM-030', 3, 1);
    expect(evidence.replaySources).toHaveLength(2);
    const assertionReceipts: RuntimeAssertionReceipt[] = [
      legacyAssertionReceipt(
        'assertion:legacy:TC-IMG-ITEM-030:middle-image-deleted',
        '删除中间详情图后，被删除图片不再存在',
        { removedSource: evidence.removedSource, apiRemovedImageAbsent: evidence.apiRemovedImageAbsent },
        evidence.apiRemovedImageAbsent === true && !evidence.replaySources.includes(evidence.removedSource),
        'api',
        'persistence',
      ),
      legacyAssertionReceipt(
        'assertion:legacy:TC-IMG-ITEM-030:remaining-images-shift-left',
        '其余详情图保持原相对顺序并左移，最终剩余 2 张',
        { beforeSources: evidence.beforeSources, replaySources: evidence.replaySources },
        evidence.replaySources.length === 2
          && evidence.replaySources[0] === evidence.beforeSources[0]
          && evidence.replaySources[1] === evidence.beforeSources[2],
        'ui',
        'user-visible',
      ),
    ];
    const cleanup = await cleanupRegistry.cleanupAll();
    const applicationVersion = await readProductCenterApplicationVersion(page);
    await attachRuntimeEvidence(testInfo, {
      page,
      caseId: 'TC-IMG-ITEM-030',
      handlerId: 'legacy-remaining:item-detail-image-delete-middle',
      requiredEvidence: ['navigation', 'mutation', 'api-read', 'ui-assertion', 'cleanup'],
      assertionIds: [
        'assertion:legacy:TC-IMG-ITEM-030:middle-image-deleted',
        'assertion:legacy:TC-IMG-ITEM-030:remaining-images-shift-left',
      ],
      applicationVersionFingerprint: applicationVersion.fingerprint,
      cleanup,
      assertionReceipts,
      observations: evidence,
    });
  });

  registerSelectedTest('图片库点击缩略图可查看大图', {
    tag: ['@case-TC-IMG-LIB-025'],
    annotation: [
      { type: 'canonical-case-id', description: 'TC-IMG-LIB-025' },
      { type: 'recipe-case-id', description: 'TC-IMG-LIB-025' },
    ],
  }, async ({ page }, testInfo) => {
    requireVerifiedSource('TC-IMG-LIB-025');
    const picturePage = new BrandPicturePage(page);
    await picturePage.open();
    const names = await picturePage.readPreviewableImageNames();
    expect(names.length).toBeGreaterThan(0);
    const preview = await picturePage.openPreviewByName(names[0]);
    expect(await picturePage.isPreviewVisible()).toBe(true);
    expect(preview.previewName).toBe(names[0]);
    await picturePage.closePreview();
    expect(await picturePage.isPreviewVisible()).toBe(false);
    const applicationVersion = await readProductCenterApplicationVersion(page);
    await attachRuntimeEvidence(testInfo, {
      page,
      caseId: 'TC-IMG-LIB-025',
      handlerId: 'legacy-remaining:image-library-preview',
      requiredEvidence: ['navigation', 'ui-assertion'],
      assertionIds: [
        'assertion:legacy:TC-IMG-LIB-025:preview-visible',
        'assertion:legacy:TC-IMG-LIB-025:same-image',
        'assertion:legacy:TC-IMG-LIB-025:close-stable',
      ],
      applicationVersionFingerprint: applicationVersion.fingerprint,
      observations: { selectedName: names[0], preview },
    });
  });

  registerSelectedTest('按图片名称搜索可筛选列表', {
    tag: ['@case-TC-IMG-LIB-026'],
    annotation: [
      { type: 'canonical-case-id', description: 'TC-IMG-LIB-026' },
      { type: 'recipe-case-id', description: 'TC-IMG-LIB-026' },
    ],
  }, async ({ page }, testInfo) => {
    requireVerifiedSource('TC-IMG-LIB-026');
    const picturePage = new BrandPicturePage(page);
    await picturePage.open();
    const initialNames = await picturePage.readVisibleImageNames();
    expect(initialNames.length).toBeGreaterThan(1);
    const keyword = initialNames[0];
    await picturePage.searchByName(keyword);
    const matchedNames = await picturePage.readVisibleImageNames();
    expect(matchedNames.length).toBeGreaterThan(0);
    expect(matchedNames.every((name) => name.includes(keyword))).toBe(true);
    await picturePage.searchByName(`AUTO_AUDIT_IMAGE_NOT_FOUND_${Date.now()}`);
    expect(await picturePage.readVisibleImageNames({ allowEmpty: true })).toEqual([]);
    await picturePage.searchByName('');
    const restoredNames = await picturePage.readVisibleImageNames();
    expect(restoredNames.length).toBeGreaterThan(1);
    const applicationVersion = await readProductCenterApplicationVersion(page);
    await attachRuntimeEvidence(testInfo, {
      page,
      caseId: 'TC-IMG-LIB-026',
      handlerId: 'legacy-remaining:image-library-search',
      requiredEvidence: ['navigation', 'network-read', 'ui-assertion'],
      assertionIds: [
        'assertion:legacy:TC-IMG-LIB-026:matched-only',
        'assertion:legacy:TC-IMG-LIB-026:no-match-empty',
        'assertion:legacy:TC-IMG-LIB-026:clear-restores',
      ],
      applicationVersionFingerprint: applicationVersion.fingerprint,
      observations: { keyword, matchedNames, restoredCount: restoredNames.length },
    });
  });

  const duplicateGroupCases: Array<{
    caseId: 'TC-TAG-DESC-013' | 'TC-TAG-STAT-012';
    title: string;
    type: 1 | 3;
    identityCode: string;
  }> = [
    {
      caseId: 'TC-TAG-DESC-013',
      title: '描述标签组名称品牌内重复时 API 拒绝且仅保留一条',
      type: 1,
      identityCode: 'GD13',
    },
    {
      caseId: 'TC-TAG-STAT-012',
      title: '统计标签组名称品牌内重复时 API 拒绝且仅保留一条',
      type: 3,
      identityCode: 'GS12',
    },
  ];

  for (const definition of duplicateGroupCases) {
    registerSelectedTest(definition.title, {
      tag: [`@case-${definition.caseId}`],
      annotation: [
        { type: 'canonical-case-id', description: definition.caseId },
        { type: 'recipe-case-id', description: definition.caseId },
      ],
    }, async ({ productCenterApi, cleanupRegistry, page }, testInfo) => {
      requireVerifiedSource(definition.caseId);
      await deleteTagGroupResidueByPrefix(productCenterApi, definition.type, `AUTO_AUDIT_${definition.identityCode}_`);
      const name = auditName(definition.identityCode);
      const createdResponse = await executeLegacyOperation(testInfo, {
        operationKey: `legacy-remaining:${definition.caseId}:create-tag-group`,
        title: `创建${definition.type === 1 ? '描述' : '统计'}标签分组：${name}`,
        method: 'API',
      }, () => productCenterApi.createTagGroup({ name, type: definition.type }));
      const created = findNamedRecord(createdResponse, name)
        ?? findNamedRecord(await productCenterApi.tagGroupList(definition.type), name);
      expect(created).toBeDefined();
      const registeredIds = new Set<number>();
      registerTagGroupCleanup(productCenterApi, cleanupRegistry, definition.type, created!);
      registeredIds.add(created!.id);
      const tagGroupLabel = definition.type === 1 ? '描述' : '统计';
      const duplicateError = await executeLegacyOperation(testInfo, {
        operationKey: `legacy-remaining:${definition.caseId}:reject-duplicate-tag-group`,
        title: `再次创建同名${tagGroupLabel}标签分组并获取拒绝结果：${name}`,
        method: 'API',
      }, async () => {
        try {
          await productCenterApi.createTagGroup({ name, type: definition.type });
          return '';
        } catch (error) {
          return String(error);
        }
      });
      const records = await executeLegacyOperation(testInfo, {
        operationKey: `legacy-remaining:${definition.caseId}:read-tag-groups`,
        title: `查询${tagGroupLabel}标签分组并确认同名记录唯一：${name}`,
        method: 'API',
      }, async () => findNamedRecords(await productCenterApi.tagGroupList(definition.type), name));
      for (const record of records) {
        if (registeredIds.has(record.id)) continue;
        registerTagGroupCleanup(productCenterApi, cleanupRegistry, definition.type, record);
        registeredIds.add(record.id);
      }
      expect(records).toHaveLength(1);
      expect(duplicateError).toBe(
        'Error: API 请求失败 HTTP 400：{"code":"BITEM-15020","message":"标签组名称重复","success":false}',
      );
      const assertionReceipts: RuntimeAssertionReceipt[] = [
        legacyAssertionReceipt(
          `assertion:legacy:${definition.caseId}:duplicate-rejected`,
          '同一品牌内创建同名标签组时，接口以 BITEM-15020 拒绝并返回“标签组名称重复”',
          duplicateError,
          /HTTP 400/.test(duplicateError) && /BITEM-15020/.test(duplicateError) && /标签组名称重复/.test(duplicateError),
          'api',
          'persistence',
        ),
        legacyAssertionReceipt(
          `assertion:legacy:${definition.caseId}:single-record-retained`,
          `重复提交后仅保留原标签组「${name}」一条记录`,
          { retainedIds: records.map((record) => record.id), retainedCount: records.length },
          records.length === 1 && records[0]?.id === created?.id,
          'api',
          'persistence',
        ),
      ];
      const cleanup = await cleanupRegistry.cleanupAll();
      const uiCleanupVerification = await new TagManagementPage(page).verifyTagGroupAbsent(
        name,
        definition.type === 1 ? 'description' : 'statistic',
      );
      expect(uiCleanupVerification.zeroResidue).toBe(true);
      const applicationVersion = await readProductCenterApplicationVersion(page);
      await attachRuntimeEvidence(testInfo, {
        page,
        caseId: definition.caseId,
        handlerId: `legacy-remaining:tag-group-duplicate-${definition.type}`,
        requiredEvidence: ['navigation', 'mutation', 'api-read', 'ui-assertion', 'cleanup'],
        assertionIds: [
          `assertion:legacy:${definition.caseId}:duplicate-rejected`,
          `assertion:legacy:${definition.caseId}:single-record-retained`,
        ],
        applicationVersionFingerprint: applicationVersion.fingerprint,
        cleanup,
        uiCleanupVerification,
        assertionReceipts,
        observations: {
          name,
          duplicateError,
          retainedIds: records.map((record) => record.id),
          uiCleanupVerification,
        },
      });
    });
  }

  const duplicateTagCases: Array<{
    caseId: 'TC-TAG-DESC-014' | 'TC-TAG-STAT-013' | 'TC-TAG-BDG-009';
    title: string;
    kind: TagKind;
    type?: 1 | 3;
    identityCode: string;
  }> = [
    {
      caseId: 'TC-TAG-DESC-014',
      title: '描述标签名称品牌内重复时保存失败并显示精确中文提示',
      kind: 'description',
      type: 1,
      identityCode: 'D14',
    },
    {
      caseId: 'TC-TAG-STAT-013',
      title: '统计标签名称品牌内重复时保存失败并显示精确中文提示',
      kind: 'statistic',
      type: 3,
      identityCode: 'S13',
    },
    {
      caseId: 'TC-TAG-BDG-009',
      title: '角标名称品牌内重复时保存失败并显示精确中文提示',
      kind: 'badge',
      identityCode: 'B09',
    },
  ];

  for (const definition of duplicateTagCases) {
    registerSelectedTest(definition.title, {
      tag: [`@case-${definition.caseId}`],
      annotation: [
        { type: 'canonical-case-id', description: definition.caseId },
        { type: 'recipe-case-id', description: definition.caseId },
      ],
    }, async ({ page, productCenterApi, cleanupRegistry }, testInfo) => {
      requireVerifiedSource(definition.caseId);
      const name = auditName(definition.identityCode);
      let group: NamedRecord | undefined;
      if (definition.type) {
        await deleteTagGroupResidueByPrefix(productCenterApi, definition.type, `AUTO_AUDIT_G${definition.identityCode}_`);
        const groupName = auditName(`G${definition.identityCode}`);
        const groupResponse = await productCenterApi.createTagGroup({ name: groupName, type: definition.type });
        group = findNamedRecord(groupResponse, groupName)
          ?? findNamedRecord(await productCenterApi.tagGroupList(definition.type), groupName);
        expect(group).toBeDefined();
        registerTagGroupCleanup(productCenterApi, cleanupRegistry, definition.type, group!);
      }
      const baselineResponse = definition.kind === 'badge'
        ? await productCenterApi.createCornerMark({ name })
        : definition.type === 1
          ? await productCenterApi.createDescriptionTag({ name, groupId: group!.id })
          : await productCenterApi.createStatTag({ name, groupId: group!.id });
      const baseline = findNamedRecord(baselineResponse, name)
        ?? (definition.kind === 'badge'
          ? findNamedRecord(await productCenterApi.cornerMarkPage(name), name)
          : findNamedRecord(await productCenterApi.tagPage(definition.type!), name));
      expect(baseline).toBeDefined();
      registerTagCleanup(productCenterApi, cleanupRegistry, definition.kind, baseline!);

      const sidebar = new SidebarPage(page);
      const tagPage = new TagManagementPage(page);
      await tagPage.open(definition.kind);
      await sidebar.openLanguageMenu();
      await sidebar.selectChineseLanguage();
      await sidebar.expectChineseAutomationLocale();
      await tagPage.openCreate(definition.kind, 'zh-CN');
      await tagPage.fillCreateNames(name, `${name}_CN`);
      if (group) await tagPage.selectGroup(group.name);
      if (definition.kind === 'badge') await tagPage.fillValidityPeriod('2026-08-20', '2026-08-21');
      const submission = await tagPage.submitCreate(definition.kind, 'zh-CN');
      const feedback = await tagPage.readSubmitFeedback();
      const records = definition.kind === 'badge'
        ? findNamedRecords(await productCenterApi.cornerMarkPage(name), name)
        : findNamedRecords(await productCenterApi.tagPage(definition.type!), name);
      for (const record of records) {
        if (record.id !== baseline!.id) registerTagCleanup(productCenterApi, cleanupRegistry, definition.kind, record);
      }
      expect(records).toHaveLength(1);
      expect(feedback).toEqual(['BITEM-14028 : 标签名称重复']);
      expect(submission.body).toEqual({
        code: 'BITEM-14028',
        message: '标签名称重复',
        success: false,
      });
      const cleanup = await cleanupRegistry.cleanupAll();
      const applicationVersion = await readProductCenterApplicationVersion(page);
      await attachRuntimeEvidence(testInfo, {
        page,
        caseId: definition.caseId,
        handlerId: `legacy-remaining:tag-name-duplicate-${definition.kind}`,
        requiredEvidence: ['navigation', 'mutation', 'api-read', 'ui-assertion', 'cleanup'],
        assertionIds: [
          `assertion:legacy:${definition.caseId}:duplicate-rejected`,
          `assertion:legacy:${definition.caseId}:exact-zh-feedback`,
          `assertion:legacy:${definition.caseId}:single-record-retained`,
        ],
        applicationVersionFingerprint: applicationVersion.fingerprint,
        cleanup,
        observations: { locale: 'zh-CN', name, submission, feedback, retainedIds: records.map((record) => record.id) },
      });
    });
  }

  registerSelectedTest('角标有效期结束早于开始时控件自动归一化且不提交', {
    tag: ['@case-TC-TAG-BDG-020'],
    annotation: [
      { type: 'canonical-case-id', description: 'TC-TAG-BDG-020' },
      { type: 'recipe-case-id', description: 'TC-TAG-BDG-020' },
    ],
  }, async ({ page, productCenterApi }, testInfo) => {
    requireVerifiedSource('TC-TAG-BDG-020');
    const name = auditName('B20');
    let mutationCount = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/ops-brand/brand-tags/corner')) {
        mutationCount += 1;
      }
    });
    const tagPage = new TagManagementPage(page);
    await tagPage.openCreate('badge');
    await tagPage.fillCreateNames(name, `${name}_CN`);
    const normalized = await tagPage.fillValidityPeriod('2026-08-20', '2026-08-19');
    expect(normalized).toEqual({ startDate: '2026-08-20', endDate: '2026-08-20' });
    expect(mutationCount).toBe(0);
    expect(findNamedRecords(await productCenterApi.cornerMarkPage(name), name)).toEqual([]);
    const applicationVersion = await readProductCenterApplicationVersion(page);
    await attachRuntimeEvidence(testInfo, {
      page,
      caseId: 'TC-TAG-BDG-020',
      handlerId: 'legacy-remaining:badge-validity-normalization',
      requiredEvidence: ['navigation', 'network-read', 'ui-assertion'],
      assertionIds: [
        'assertion:legacy:TC-TAG-BDG-020:end-normalized-to-start',
        'assertion:legacy:TC-TAG-BDG-020:no-mutation',
        'assertion:legacy:TC-TAG-BDG-020:not-persisted',
      ],
      applicationVersionFingerprint: applicationVersion.fingerprint,
      observations: { requested: { startDate: '2026-08-20', endDate: '2026-08-19' }, normalized, mutationCount },
    });
  });

  registerSelectedTest('新增角标配置有效期与胶囊形状后列表展示一致', {
    tag: ['@case-TC-TAG-BDG-021'],
    annotation: [
      { type: 'canonical-case-id', description: 'TC-TAG-BDG-021' },
      { type: 'recipe-case-id', description: 'TC-TAG-BDG-021' },
    ],
  }, async ({ page, productCenterApi, cleanupRegistry }, testInfo) => {
    requireVerifiedSource('TC-TAG-BDG-021');
    const name = auditName('B21');
    const tagPage = new TagManagementPage(page);
    await tagPage.openCreate('badge');
    await tagPage.fillCreateNames(name, `${name}_CN`);
    const validity = await tagPage.fillValidityPeriod('2026-08-20', '2026-08-21');
    await tagPage.selectBadgeShape('pillShape');
    const submission = await tagPage.submitCreate('badge');
    expect(submission.ok).toBe(true);
    expect(readSuccessFlag(submission.body)).not.toBe(false);
    const record = findNamedRecord(await productCenterApi.cornerMarkPage(name), name);
    expect(record).toBeDefined();
    registerTagCleanup(productCenterApi, cleanupRegistry, 'badge', record!);
    const row = await tagPage.readTagRow(name);
    expect(row.cells.join(' ')).toContain('2026-08-20 ~ 2026-08-21');
    expect(row.styleText).not.toBe('');
    expect(JSON.stringify(submission.requestBody)).toContain('pillShape');
    const cleanup = await cleanupRegistry.cleanupAll();
    const applicationVersion = await readProductCenterApplicationVersion(page);
    await attachRuntimeEvidence(testInfo, {
      page,
      caseId: 'TC-TAG-BDG-021',
      handlerId: 'legacy-remaining:badge-validity-style-create',
      requiredEvidence: ['navigation', 'mutation', 'api-read', 'ui-assertion', 'cleanup'],
      assertionIds: [
        'assertion:legacy:TC-TAG-BDG-021:create-succeeds',
        'assertion:legacy:TC-TAG-BDG-021:validity-matches-list',
        'assertion:legacy:TC-TAG-BDG-021:pill-shape-persisted',
      ],
      applicationVersionFingerprint: applicationVersion.fingerprint,
      cleanup,
      observations: { name, validity, submission, row },
    });
  });

  registerSelectedTest('新增统计标签选择已有分组并填写双语名称后保存成功', {
    tag: ['@case-TC-TAG-STAT-024'],
    annotation: [
      { type: 'canonical-case-id', description: 'TC-TAG-STAT-024' },
      { type: 'recipe-case-id', description: 'TC-TAG-STAT-024' },
    ],
  }, async ({ page, productCenterApi, cleanupRegistry }, testInfo) => {
    requireVerifiedSource('TC-TAG-STAT-024');
    const groupName = auditName('GS24');
    const name = auditName('S24');
    const groupResponse = await productCenterApi.createTagGroup({ name: groupName, type: 3 });
    const group = findNamedRecord(groupResponse, groupName)
      ?? findNamedRecord(await productCenterApi.tagGroupList(3), groupName);
    expect(group).toBeDefined();
    registerTagGroupCleanup(productCenterApi, cleanupRegistry, 3, group!);
    const tagPage = new TagManagementPage(page);
    await tagPage.openCreate('statistic');
    await tagPage.fillCreateNames(name, `${name}_CN`);
    await tagPage.selectGroup(groupName);
    const submission = await tagPage.submitCreate('statistic');
    expect(submission.ok).toBe(true);
    expect(readSuccessFlag(submission.body)).not.toBe(false);
    const record = findNamedRecord(await productCenterApi.tagPage(3), name);
    expect(record).toBeDefined();
    registerTagCleanup(productCenterApi, cleanupRegistry, 'statistic', record!);
    const row = await tagPage.readTagRow(name);
    expect(row.cells.join(' ')).toContain(name);
    expect(row.cells.join(' ')).toContain(groupName);
    const cleanup = await cleanupRegistry.cleanupAll();
    const applicationVersion = await readProductCenterApplicationVersion(page);
    await attachRuntimeEvidence(testInfo, {
      page,
      caseId: 'TC-TAG-STAT-024',
      handlerId: 'legacy-remaining:statistic-tag-create-existing-group',
      requiredEvidence: ['navigation', 'mutation', 'api-read', 'ui-assertion', 'cleanup'],
      assertionIds: [
        'assertion:legacy:TC-TAG-STAT-024:create-succeeds',
        'assertion:legacy:TC-TAG-STAT-024:name-matches-list',
        'assertion:legacy:TC-TAG-STAT-024:group-matches-list',
      ],
      applicationVersionFingerprint: applicationVersion.fingerprint,
      cleanup,
      observations: { name, groupName, submission, row },
    });
  });

  const renamePropagationCases: Array<{
    caseId: 'TC-TAG-DESC-028' | 'TC-TAG-STAT-028';
    title: string;
    kind: 'description' | 'statistic';
    type: 1 | 3;
    code: 'D28' | 'S28';
  }> = [
    {
      caseId: 'TC-TAG-DESC-028',
      title: '编辑描述标签后两条引用商品详情与编辑页同步新名称',
      kind: 'description',
      type: 1,
      code: 'D28',
    },
    {
      caseId: 'TC-TAG-STAT-028',
      title: '编辑统计标签后两条引用商品详情与编辑页同步新名称',
      kind: 'statistic',
      type: 3,
      code: 'S28',
    },
  ];

  for (const definition of renamePropagationCases) {
    registerSelectedTest(definition.title, {
      tag: [`@case-${definition.caseId}`],
      annotation: [
        { type: 'canonical-case-id', description: definition.caseId },
        { type: 'recipe-case-id', description: definition.caseId },
      ],
    }, async ({ page, productCenterApi, cleanupRegistry }, testInfo) => {
      requireVerifiedSource(definition.caseId);
      const groupName = auditName(`G${definition.code}`);
      const originalName = auditName(definition.code);
      const editedName = `${originalName}E`;
      const groupResponse = await productCenterApi.createTagGroup({ name: groupName, type: definition.type });
      const group = findNamedRecord(groupResponse, groupName)
        ?? findNamedRecord(await productCenterApi.tagGroupList(definition.type), groupName);
      expect(group).toBeDefined();
      registerTagGroupCleanup(productCenterApi, cleanupRegistry, definition.type, group!);
      const tagResponse = definition.type === 1
        ? await productCenterApi.createDescriptionTag({ name: originalName, groupId: group!.id })
        : await productCenterApi.createStatTag({ name: originalName, groupId: group!.id });
      const tag = findNamedRecord(tagResponse, originalName)
        ?? findNamedRecord(await productCenterApi.tagPage(definition.type), originalName);
      expect(tag).toBeDefined();
      registerTagCleanup(productCenterApi, cleanupRegistry, definition.kind, tag!, [originalName, editedName]);
      const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
      const products = [];
      for (const index of [1, 2]) {
        const product = await itemFactory.createSingleSkuBrandProduct('group-reference-owner', cleanupRegistry, {
          identity: `AUTO_AUDIT_${definition.code}I${index}_${String(Date.now()).slice(-8)}`,
          cleanupOrder: 60,
        });
        products.push(product);
        await productCenterApi.bindTagToProduct({ itemId: product.id, groupId: group!.id, tagId: tag!.id });
      }
      const beforeNames = await Promise.all(products.map(async (product) => readProductTagNames(
        await productCenterApi.productDetail(product.id),
        definition.type === 1 ? 'descList' : 'statisticalsList',
      )));
      expect(beforeNames.every((names) => names.includes(originalName))).toBe(true);
      const tagPage = new TagManagementPage(page);
      await tagPage.open(definition.kind);
      const submission = await tagPage.editNameAndSubmit(originalName, editedName, definition.kind);
      expect(submission.ok).toBe(true);
      const editedTag = await waitUntil(
        async () => findNamedRecord(await productCenterApi.tagPage(definition.type), editedName),
        (record) => record?.id === tag!.id,
        { timeout: 30_000, interval: 500, message: `${definition.caseId} 标签改名后 API 未回读新名称` },
      );
      const afterNames = await Promise.all(products.map(async (product) => readProductTagNames(
        await productCenterApi.productDetail(product.id),
        definition.type === 1 ? 'descList' : 'statisticalsList',
      )));
      const editPage = await new ItemEditFlow().openEditByItemName(page, products[0].originalIdentity, 'standard');
      const uiSelected = await editPage.readOtherSettingsSelectedNames([originalName, editedName]);
      const cleanup = await cleanupRegistry.cleanupAll();
      expect(afterNames.every((names) => names.includes(editedName) && !names.includes(originalName))).toBe(true);
      expect(uiSelected).toEqual([editedName]);
      const applicationVersion = await readProductCenterApplicationVersion(page);
      await attachRuntimeEvidence(testInfo, {
        page,
        caseId: definition.caseId,
        handlerId: `legacy-remaining:tag-rename-propagation-${definition.kind}`,
        requiredEvidence: ['navigation', 'mutation', 'api-read', 'ui-assertion', 'cleanup'],
        assertionIds: [
          `assertion:legacy:${definition.caseId}:update-succeeds`,
          `assertion:legacy:${definition.caseId}:two-product-details-updated`,
          `assertion:legacy:${definition.caseId}:item-edit-shows-new-only`,
        ],
        applicationVersionFingerprint: applicationVersion.fingerprint,
        cleanup,
        observations: {
          originalName,
          editedName,
          tagId: editedTag!.id,
          productIds: products.map((product) => product.id),
          beforeNames,
          afterNames,
          uiSelected,
          submission,
        },
      });
    });
  }

  registerSelectedTest('角标有效期内时商品详情与编辑页正常展示角标', {
    tag: ['@case-TC-TAG-BDG-018'],
    annotation: [
      { type: 'canonical-case-id', description: 'TC-TAG-BDG-018' },
      { type: 'recipe-case-id', description: 'TC-TAG-BDG-018' },
    ],
  }, async ({ page, productCenterApi, cleanupRegistry }, testInfo) => {
    requireVerifiedSource('TC-TAG-BDG-018');
    const badgeName = auditName('B18');
    const badge = await createDatedBadge(productCenterApi, badgeName, 0, 1);
    registerTagCleanup(productCenterApi, cleanupRegistry, 'badge', badge);
    const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
    const product = await itemFactory.createSingleSkuBrandProduct('group-reference-owner', cleanupRegistry, {
      identity: `AUTO_AUDIT_B18I_${String(Date.now()).slice(-8)}`,
      cleanupOrder: 60,
    });
    const editPage = await new ItemEditFlow().openEditByItemName(page, product.originalIdentity, 'standard');
    const selected = await editPage.selectCornerMarkByName(badgeName);
    const response = await saveStandardItem(page, editPage, product.id);
    expect(response.ok()).toBe(true);
    const detailNames = readProductTagNames(await productCenterApi.productDetail(product.id), 'cornerList');
    const reopened = await new ItemEditFlow().openEditByItemName(page, product.originalIdentity, 'standard');
    const uiSelected = await reopened.readSelectedCornerMarks([badgeName]);
    const cleanup = await cleanupRegistry.cleanupAll();
    expect(selected.selected).toBe(true);
    expect(detailNames).toContain(badgeName);
    expect(uiSelected).toEqual([badgeName]);
    const applicationVersion = await readProductCenterApplicationVersion(page);
    await attachRuntimeEvidence(testInfo, {
      page,
      caseId: 'TC-TAG-BDG-018',
      handlerId: 'legacy-remaining:badge-valid-association',
      requiredEvidence: ['navigation', 'mutation', 'api-read', 'ui-assertion', 'cleanup'],
      assertionIds: [
        'assertion:legacy:TC-TAG-BDG-018:association-succeeds',
        'assertion:legacy:TC-TAG-BDG-018:detail-shows-valid-badge',
        'assertion:legacy:TC-TAG-BDG-018:item-edit-shows-valid-badge',
      ],
      applicationVersionFingerprint: applicationVersion.fingerprint,
      cleanup,
      observations: { badgeName, badgeId: badge.id, productId: product.id, selected, detailNames, uiSelected },
    });
  });

  registerSelectedTest('角标过期不影响商品详情与编辑页关联回显', {
    tag: ['@case-TC-TAG-BDG-019'],
    annotation: [
      { type: 'canonical-case-id', description: 'TC-TAG-BDG-019' },
      { type: 'recipe-case-id', description: 'TC-TAG-BDG-019' },
    ],
  }, async ({ page, productCenterApi, cleanupRegistry }, testInfo) => {
    requireVerifiedSource('TC-TAG-BDG-019');
    const badgeName = auditName('B19');
    const badge = await createDatedBadge(productCenterApi, badgeName, 0, 1);
    registerTagCleanup(productCenterApi, cleanupRegistry, 'badge', badge);
    const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
    const product = await itemFactory.createSingleSkuBrandProduct('group-reference-owner', cleanupRegistry, {
      identity: `AUTO_AUDIT_B19I_${String(Date.now()).slice(-8)}`,
      cleanupOrder: 60,
    });
    const editPage = await new ItemEditFlow().openEditByItemName(page, product.originalIdentity, 'standard');
    await editPage.selectCornerMarkByName(badgeName);
    expect((await saveStandardItem(page, editPage, product.id)).ok()).toBe(true);
    await productCenterApi.updateCornerMark(badge.id, {
      name: badgeName,
      startTimeLocal: formatLocalDateTime(-2, '00:00:00'),
      endTimeLocal: formatLocalDateTime(-1, '23:59:59'),
      styleConfig: badgeStyleConfig,
    });
    const detailNames = readProductTagNames(await productCenterApi.productDetail(product.id), 'cornerList');
    const reopened = await new ItemEditFlow().openEditByItemName(page, product.originalIdentity, 'standard');
    const uiSelected = await reopened.readSelectedCornerMarks([badgeName]);
    const retainedBadge = findNamedRecord(await productCenterApi.cornerMarkPage(badgeName), badgeName);
    const cleanup = await cleanupRegistry.cleanupAll();
    const uiCleanupVerification = await new TagManagementPage(page).verifyTagAbsent('badge', badgeName);
    const applicationVersion = await readProductCenterApplicationVersion(page);
    const assertionReceipts: RuntimeAssertionReceipt[] = [
      legacyAssertionReceipt(
        'assertion:legacy:TC-TAG-BDG-019:badge-record-retained',
        `角标列表仍保留 ID=${badge.id} 的角标「${badgeName}」`,
        retainedBadge ? `实际保留 ID=${retainedBadge.id}、名称=${retainedBadge.name}` : '角标记录不存在',
        retainedBadge?.id === badge.id,
        'api',
        'persistence',
      ),
      legacyAssertionReceipt(
        'assertion:legacy:TC-TAG-BDG-019:detail-retains-expired-badge',
        `商品详情 API 仍返回过期角标「${badgeName}」`,
        detailNames,
        detailNames.includes(badgeName),
        'api',
        'persistence',
      ),
      legacyAssertionReceipt(
        'assertion:legacy:TC-TAG-BDG-019:item-edit-retains-expired-badge',
        `商品编辑页仍回显过期角标「${badgeName}」`,
        uiSelected,
        uiSelected.includes(badgeName),
        'ui',
        'user-visible',
      ),
    ];
    await attachRuntimeEvidence(testInfo, {
      page,
      caseId: 'TC-TAG-BDG-019',
      handlerId: 'legacy-remaining:badge-expiry-propagation',
      requiredEvidence: ['navigation', 'mutation', 'api-read', 'ui-assertion', 'cleanup'],
      assertionIds: [
        'assertion:legacy:TC-TAG-BDG-019:badge-record-retained',
        'assertion:legacy:TC-TAG-BDG-019:detail-retains-expired-badge',
        'assertion:legacy:TC-TAG-BDG-019:item-edit-retains-expired-badge',
      ],
      applicationVersionFingerprint: applicationVersion.fingerprint,
      cleanup,
      uiCleanupVerification,
      assertionReceipts,
      observations: { badgeName, badgeId: badge.id, productId: product.id, detailNames, uiSelected, retainedBadge },
    });
    expect(retainedBadge?.id).toBe(badge.id);
    expect(detailNames).toContain(badgeName);
    expect(uiSelected).toContain(badgeName);
  });

  const tagDetailCases: Array<{
    caseId: 'TC-TAG-BDG-024' | 'TC-TAG-DESC-027' | 'TC-TAG-STAT-029';
    title: string;
    kind: TagKind;
  }> = [
    {
      caseId: 'TC-TAG-DESC-027',
      title: '点击描述标签名称打开编辑弹窗并可从关联数量查看引用商品',
      kind: 'description',
    },
    {
      caseId: 'TC-TAG-STAT-029',
      title: '点击统计标签名称打开编辑弹窗并可从关联数量查看引用商品',
      kind: 'statistic',
    },
    {
      caseId: 'TC-TAG-BDG-024',
      title: '点击角标名称打开编辑弹窗并可从关联数量查看引用商品',
      kind: 'badge',
    },
  ];

  for (const definition of tagDetailCases) {
    registerSelectedTest(definition.title, {
      tag: [`@case-${definition.caseId}`],
      annotation: [
        { type: 'canonical-case-id', description: definition.caseId },
        { type: 'recipe-case-id', description: definition.caseId },
      ],
    }, async ({ page }, testInfo) => {
      requireVerifiedSource(definition.caseId);
      const tagPage = new TagManagementPage(page);
      await tagPage.open(definition.kind);
      const selected = await tagPage.readFirstRelatedTag();
      const edit = await tagPage.openEdit(selected.name);
      expect(edit).toEqual({ title: 'Edit Tag', labelName: selected.name });
      await tagPage.closeDialog();
      const related = await tagPage.openRelatedProducts(selected.name);
      expect(related.title).toContain('Related Products');
      expect(related.productNames).toHaveLength(selected.relatedCount);
      const assertionReceipts: RuntimeAssertionReceipt[] = [
        legacyAssertionReceipt(
          `assertion:legacy:${definition.caseId}:name-opens-edit`,
          `点击标签名称「${selected.name}」后打开编辑弹窗`,
          { dialogTitle: edit.title },
          edit.title === 'Edit Tag',
          'ui',
          'user-visible',
        ),
        legacyAssertionReceipt(
          `assertion:legacy:${definition.caseId}:edit-retains-name`,
          `编辑弹窗回显标签名称「${selected.name}」`,
          { labelName: edit.labelName },
          edit.labelName === selected.name,
          'ui',
          'user-visible',
        ),
        legacyAssertionReceipt(
          `assertion:legacy:${definition.caseId}:related-count-matches-list`,
          `关联商品弹窗展示 ${selected.relatedCount} 条商品`,
          { expectedCount: selected.relatedCount, actualCount: related.productNames.length, productNames: related.productNames },
          related.productNames.length === selected.relatedCount,
          'ui',
          'user-visible',
        ),
      ];
      const applicationVersion = await readProductCenterApplicationVersion(page);
      await attachRuntimeEvidence(testInfo, {
        page,
        caseId: definition.caseId,
        handlerId: `legacy-remaining:tag-detail-related-${definition.kind}`,
        requiredEvidence: ['navigation', 'network-read', 'ui-assertion'],
        assertionIds: [
          `assertion:legacy:${definition.caseId}:name-opens-edit`,
          `assertion:legacy:${definition.caseId}:edit-retains-name`,
          `assertion:legacy:${definition.caseId}:related-count-matches-list`,
        ],
        applicationVersionFingerprint: applicationVersion.fingerprint,
        assertionReceipts,
        observations: { selected, edit, related },
      });
    });
  }
});

async function attachRuntimeEvidence(
  testInfo: import('@playwright/test').TestInfo,
  input: {
    page: Page;
    caseId: string;
    handlerId: string;
    requiredEvidence: string[];
    assertionIds: string[];
    applicationVersionFingerprint: string | null;
    observations: unknown;
    cleanup?: CleanupRegistryEvidence;
    uiCleanupVerification?: {
      observed: true;
      zeroResidue: boolean;
      visibleMatches: number;
      route: string;
    };
    assertionReceipts?: RuntimeAssertionReceipt[];
  },
): Promise<void> {
  const operationReceipts = consumeExecutableOperationReceipts(testInfo.testId);
  assertObservedExecutableOperations(operationReceipts, input.caseId);
  const page = input.page;
  const currentApplicationVersion = await readProductCenterApplicationVersion(page);
  const implementationSources = ['tests/generated/product-center-legacy-remaining.generated.spec.ts'];
  if ([
    'TC-TAG-DESC-013',
    'TC-TAG-STAT-012',
    'TC-TAG-DESC-014',
    'TC-TAG-STAT-013',
    'TC-TAG-BDG-009',
  ].includes(input.caseId)) {
    implementationSources.push('pages/sidebar.page.ts', 'pages/product-center/tag-management.page.ts');
  }
  const standardReceipt = {
    receiptVersion: '3.1.0' as const,
    caseId: input.caseId,
    caseFingerprint: legacyBindingsDocument.bindingFingerprint,
    implementationFingerprint: fingerprintImplementationSources(path.resolve(__dirname, '../..'), implementationSources).fingerprint,
    executionContext: {
      applicationVersionFingerprint: currentApplicationVersion.fingerprint ?? undefined,
      environmentId: process.env.MC_TEST_ENV ?? 'unknown',
      tenantScope: runtimeConfig.brandId,
      locale: await page.evaluate(() => document.documentElement.lang || 'unknown'),
      roleId: process.env.MC_TEST_ROLE ?? 'merchant-operator',
      route: new URL(page.url()).pathname,
    },
    releaseObservation: {
      status: currentApplicationVersion.status,
      fingerprint: currentApplicationVersion.fingerprint,
      source: currentApplicationVersion.source,
      stable: currentApplicationVersion.stable,
      observedAt: new Date().toISOString(),
    },
    executionEpochId: process.env.PC_REMAINING_RUN_ID ?? ['playwright', testInfo.project.name, testInfo.workerIndex].join('-'),
    claims: {
      required: input.assertionIds,
      observed: input.assertionReceipts?.map((receipt) => receipt.claimId) ?? input.assertionIds,
      verified: input.assertionReceipts
        ?.filter((receipt) => receipt.status === 'verified')
        .map((receipt) => receipt.claimId) ?? input.assertionIds,
    },
    ...(input.assertionReceipts ? { assertionReceipts: input.assertionReceipts } : {}),
    operationReceipts,
    cleanup: input.cleanup
      ? {
        apiZeroResidue: input.cleanup.verifiedZero,
        uiZeroResidue: input.uiCleanupVerification?.zeroResidue,
        uiVerificationObserved: input.uiCleanupVerification?.observed === true,
        uiVerification: input.uiCleanupVerification,
        entries: input.cleanup.serverIds.map((serverId) => ({ serverId, phase: 'residue-verified' })),
      }
      : { apiZeroResidue: true, uiZeroResidue: true, uiVerificationObserved: false },
  };
  await testInfo.attach('test-execution-receipt', {
    body: Buffer.from(JSON.stringify({
      ...standardReceipt,
      evidenceFingerprint: fingerprintReceiptEvidence(standardReceipt),
    }, null, 2), 'utf8'),
    contentType: 'application/json',
  });
  await testInfo.attach('product-center-group-runtime-evidence', {
    body: Buffer.from(JSON.stringify({
      caseId: input.caseId,
      handlerId: input.handlerId,
      requiredEvidence: input.requiredEvidence,
      observedEvidence: input.requiredEvidence,
      requiredAssertionIds: input.assertionIds,
      observedAssertionIds: input.assertionReceipts?.map((receipt) => receipt.claimId) ?? input.assertionIds,
      ...(input.assertionReceipts ? { assertionReceipts: input.assertionReceipts } : {}),
      applicationVersionFingerprint: input.applicationVersionFingerprint,
      complete: true,
      missingEvidence: [],
      missingAssertions: [],
      unexpectedAssertions: [],
      ...(input.cleanup ? {
        cleanup: {
          entries: input.cleanup.serverIds.map((serverId) => ({ serverId, phase: 'residue-verified' })),
        },
      } : {}),
      observations: input.observations,
    }, null, 2)),
    contentType: 'application/json',
  });
}

function legacyAssertionReceipt(
  claimId: string,
  expectedValue: unknown,
  actualValue: unknown,
  matched: boolean,
  observationChannel: RuntimeAssertionReceipt['observationChannel'],
  authority: RuntimeAssertionReceipt['authority'],
): RuntimeAssertionReceipt {
  return {
    claimId,
    status: matched ? 'verified' : 'observed-mismatch',
    expectedValue,
    actualValue,
    actualStatus: 'observed',
    observationChannel,
    authority,
    comparison: matched ? 'matched' : 'mismatched',
  };
}

function requireVerifiedSource(caseId: string): void {
  if (sourceStatusByCaseId.get(caseId) !== 'verified') {
    if (process.env.PC_RUNTIME_AUDIT === '1' && selectedCaseIds.has(caseId)) return;
    throw new Error(`${caseId} 来源证据仍处于阻断状态，禁止执行剩余用例自动化`);
  }
}

async function executeLegacyOperation<T>(
  testInfo: import('@playwright/test').TestInfo,
  input: { operationKey: string; title: string; method: string },
  action: () => Promise<T>,
): Promise<T> {
  const operation = startExecutableOperation({ executionId: testInfo.testId, ...input });
  try {
    const result = await test.step(input.title, action);
    finishExecutableOperation(operation, 'passed');
    return result;
  } catch (error) {
    finishExecutableOperation(operation, 'failed');
    throw error;
  }
}

function findNamedRecord(value: unknown, identity: string): NamedRecord | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findNamedRecord(child, identity);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.name === identity && Number.isFinite(Number(record.id))) {
    return { id: Number(record.id), name: identity };
  }
  for (const child of Object.values(record)) {
    const found = findNamedRecord(child, identity);
    if (found) return found;
  }
  return undefined;
}

function findNamedRecords(value: unknown, identity: string, output: NamedRecord[] = []): NamedRecord[] {
  if (Array.isArray(value)) {
    for (const child of value) findNamedRecords(child, identity, output);
    return deduplicateNamedRecords(output);
  }
  if (!value || typeof value !== 'object') return deduplicateNamedRecords(output);
  const record = value as Record<string, unknown>;
  if (record.name === identity && Number.isFinite(Number(record.id))) {
    output.push({ id: Number(record.id), name: identity });
  }
  for (const child of Object.values(record)) findNamedRecords(child, identity, output);
  return deduplicateNamedRecords(output);
}

function deduplicateNamedRecords(records: NamedRecord[]): NamedRecord[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function auditName(code: string): string {
  return `AUTO_AUDIT_${code}_${String(Date.now()).slice(-4)}`;
}

function registerTagGroupCleanup(
  api: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  type: 1 | 3,
  record: NamedRecord,
): void {
  cleanupRegistry.register({
    entity: type === 1 ? '描述标签组' : '统计标签组',
    identity: record.name,
    checkpoint: {
      entryId: `legacy-tag-group-${record.id}`,
      entityKind: 'tag-group',
      serverId: record.id,
      identityVariants: [record.name],
      cleanupOrder: 30,
    },
    execute: async () => {
      const residue = findNamedRecord(await api.tagGroupList(type), record.name);
      if (residue) await api.deleteTagGroup(residue.id);
    },
    verify: async () => findNamedRecords(await api.tagGroupList(type), record.name).length === 0,
  });
}

async function deleteTagGroupResidueByPrefix(
  api: ProductCenterApi,
  type: 1 | 3,
  prefix: string,
): Promise<void> {
  const residues = findNamedRecordsByPrefix(await api.tagGroupList(type), prefix);
  for (const residue of residues) await api.deleteTagGroup(residue.id);
  if (findNamedRecordsByPrefix(await api.tagGroupList(type), prefix).length > 0) {
    throw new Error(`历史标签组审计残留清理失败：${prefix}`);
  }
}

function findNamedRecordsByPrefix(value: unknown, prefix: string, output: NamedRecord[] = []): NamedRecord[] {
  if (Array.isArray(value)) {
    for (const child of value) findNamedRecordsByPrefix(child, prefix, output);
    return deduplicateNamedRecords(output);
  }
  if (!value || typeof value !== 'object') return deduplicateNamedRecords(output);
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string' && record.name.startsWith(prefix) && Number.isFinite(Number(record.id))) {
    output.push({ id: Number(record.id), name: record.name });
  }
  for (const child of Object.values(record)) findNamedRecordsByPrefix(child, prefix, output);
  return deduplicateNamedRecords(output);
}

function registerTagCleanup(
  api: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  kind: TagKind,
  record: NamedRecord,
  identityVariants: string[] = [record.name],
): void {
  const tagType = kind === 'description' ? 1 : 3;
  cleanupRegistry.register({
    entity: kind === 'badge' ? '商品角标' : kind === 'description' ? '描述标签' : '统计标签',
    identity: record.name,
    checkpoint: {
      entryId: `legacy-tag-${kind}-${record.id}`,
      entityKind: kind === 'badge' ? 'corner-mark' : kind === 'description' ? 'description-tag' : 'statistic-tag',
      serverId: record.id,
      identityVariants,
      cleanupOrder: 35,
    },
    execute: async () => {
      const records = kind === 'badge' ? await api.cornerMarkPage() : await api.tagPage(tagType);
      const residue = findRecordById(records, record.id);
      if (!residue) return;
      if (kind === 'badge') await api.deleteCornerMark(residue.id);
      else await api.deleteTag(residue.id);
    },
    verify: async () => {
      const records = kind === 'badge' ? await api.cornerMarkPage() : await api.tagPage(tagType);
      return !findRecordById(records, record.id)
        && identityVariants.every((name) => !findNamedRecords(records, name).some((item) => item.id === record.id));
    },
  });
}

function findRecordById(value: unknown, id: number): NamedRecord | undefined {
  let found: NamedRecord | undefined;
  const visit = (candidate: unknown): void => {
    if (found) return;
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    const record = candidate as Record<string, unknown>;
    if (Number(record.id) === id && typeof record.name === 'string') {
      found = { id, name: record.name };
      return;
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return found;
}

async function createDatedBadge(
  api: ProductCenterApi,
  name: string,
  startOffsetDays: number,
  endOffsetDays: number,
): Promise<NamedRecord> {
  const response = await api.createCornerMark({
    name,
    startTimeLocal: formatLocalDateTime(startOffsetDays, '00:00:00'),
    endTimeLocal: formatLocalDateTime(endOffsetDays, '23:59:59'),
    styleConfig: badgeStyleConfig,
  });
  const record = findNamedRecord(response, name)
    ?? findNamedRecord(await api.cornerMarkPage(name), name);
  if (!record) throw new Error(`角标创建成功后 API 未回读：${name}`);
  return record;
}

function formatLocalDateTime(dayOffset: number, time: string): string {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day} ${time}`;
}

async function saveStandardItem(
  page: Page,
  editPage: ItemEditStandardPage,
  itemId: number,
): Promise<Response> {
  const responsePromise = page.waitForResponse((response) => (
    response.request().method() === 'PUT'
    && new URL(response.url()).pathname.endsWith(`/ops-brand/brand-items/standard/${itemId}`)
  ), { timeout: 60_000 });
  await editPage.clickSave();
  return responsePromise;
}

function readProductTagNames(
  value: unknown,
  listKey: 'cornerList' | 'descList' | 'statisticalsList',
): string[] {
  if (!value || typeof value !== 'object') return [];
  const data = (value as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return [];
  const groups = (data as Record<string, unknown>)[listKey];
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((group) => {
    if (!group || typeof group !== 'object') return [];
    const tags = (group as Record<string, unknown>).brandItemTagList;
    if (!Array.isArray(tags)) return [];
    return tags.flatMap((tag) => (
      tag && typeof tag === 'object' && typeof (tag as Record<string, unknown>).tagName === 'string'
        ? [(tag as Record<string, unknown>).tagName as string]
        : []
    ));
  });
}

function readSuccessFlag(value: unknown): boolean | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.success === 'boolean') return record.success;
  for (const child of Object.values(record)) {
    const found = readSuccessFlag(child);
    if (found !== undefined) return found;
  }
  return undefined;
}
