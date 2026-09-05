import { extractCreatedRecord } from '../../api/product-center/created-record';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '../../fixtures/product-center.fixture';
import { ProductCenterCreateSopPage } from '../../pages/product-center/product-center-create-sop.page';
import { ProductCenterSidebarNavigationPage } from '../../pages/product-center/product-center-sidebar-navigation.page';
import { productCenterCreateSopCatalog } from '../../sop/product-center/product-center-create-sop.catalog';
import { ProductCenterCreateDataFactory } from '../../test-data/product-center/sop/product-center-create-data.factory';
import { waitUntil } from '../../utils/wait';

const definition = productCenterCreateSopCatalog.find((item) => item.entityKey === 'method')!;

test.describe('商品中心做法明细名称边界审计', () => {
  test.describe.configure({ timeout: 180_000 });

  test('应从侧边栏创建审计做法组并核对做法明细名称的 API 终态', async ({
    page,
    productCenterApi,
    cleanupRegistry,
  }, testInfo) => {
    const factory = new ProductCenterCreateDataFactory(productCenterApi);
    const prepared = await factory.prepare('method', cleanupRegistry);
    const requestedDetailName = 'AUTO_AUDIT_METHOD_DETAIL_' + 'M'.repeat(101);
    const context = {
      ...prepared,
      metadata: { ...prepared.metadata, optionName: requestedDetailName },
    };
    let registered = false;
    let auditEvidence: Record<string, unknown> = {
      schemaVersion: '1.0.0',
      caseId: 'review:method-detail-max-length',
      route: definition.route,
      navigation: { mode: 'sidebar', capabilityId: 'navigation.sidebar.open' },
      status: 'incomplete',
    };

    try {
      await test.step('从侧边栏进入做法组列表', async () => {
        await new ProductCenterSidebarNavigationPage(page).openFromSidebar(definition.route);
      });

      const uiEvidence = await test.step('通过 UI 保存超长做法明细名称', async () => {
        return new ProductCenterCreateSopPage(page).createMethodDetailBoundary(
          definition,
          context,
          requestedDetailName,
        );
      });
      const responseBody = await uiEvidence.response.json();
      const created = extractCreatedRecord(responseBody, context.originalIdentity) ?? await waitUntil(
        () => factory.findPrimary(context),
        (record) => record?.name === context.originalIdentity,
        { timeout: 60_000, interval: 500, message: 'UI 保存后 API 未找到审计做法组' },
      );
      expect(created, 'UI 保存后必须立即取得服务端 ID').toBeDefined();
      const record = await factory.registerCreated(context, created!, cleanupRegistry);
      registered = true;
      const detail = await productCenterApi.methodDetail(record.id);
      const storedDetailName = findFirstOptionName(detail);
      auditEvidence = {
        ...auditEvidence,
        requestedLength: uiEvidence.requestedLength,
        inputLengthBeforeSubmit: uiEvidence.inputLengthBeforeSubmit,
        maxLengthAttribute: uiEvidence.maxLengthAttribute,
        responseStatus: uiEvidence.response.status(),
        responseMethod: uiEvidence.response.request().method(),
        responsePath: new URL(uiEvidence.response.url()).pathname,
        serverId: record.id,
        storedLength: storedDetailName?.length ?? null,
        storedMatchesFirst100: storedDetailName === requestedDetailName.slice(0, 100),
      };
      await testInfo.attach('做法明细名称边界审计证据', {
        body: Buffer.from(JSON.stringify(auditEvidence), 'utf8'),
        contentType: 'application/json',
      });

      expect(auditEvidence.responseStatus).toBeGreaterThanOrEqual(200);
      expect(auditEvidence.responseStatus).toBeLessThan(300);
      expect(storedDetailName).toBe(requestedDetailName.slice(0, 100));
    } finally {
      if (!registered) {
        const residue = await factory.findPrimary(context);
        if (residue) await productCenterApi.deleteMethod(residue.id);
      }
      await cleanupRegistry.cleanupAll();
      const residue = await factory.findPrimary(context);
      auditEvidence = {
        ...auditEvidence,
        status: auditEvidence.storedMatchesFirst100 === true && residue === undefined ? 'passed' : 'failed',
        cleanup: { apiResidueCount: residue ? 1 : 0, verified: residue === undefined },
        generatedAt: new Date().toISOString(),
      };
      const outputPath = path.resolve(
        'output/test-case-audit/product-center/method-detail-boundary-latest.json',
      );
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(auditEvidence, null, 2)}\n`, 'utf8');
      expect(residue, '做法明细边界审计数据必须零残留').toBeUndefined();
    }
  });
});

function findFirstOptionName(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findFirstOptionName(item);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.options)) {
    const option = record.options.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined;
    if (typeof option?.name === 'string') return option.name;
  }
  for (const child of Object.values(record)) {
    const match = findFirstOptionName(child);
    if (match) return match;
  }
  return undefined;
}
