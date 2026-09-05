import { expect, test } from '../../../../fixtures/product-center-endpoint-api.fixture';
import { findOperation } from '../../../../api/operation-client';
import { createAuditIdentity } from '../../../../test-data/product-center/audit-identity';

type NamedRecord = { id: number; name: string };

const SEASONING_CREATE = { method: 'POST', path: '/ops-brand/global-modifier/batch' } as const;
const SEASONING_LIST = { method: 'GET', path: '/ops-brand/global-modifier/list' } as const;
const SEASONING_DETAIL = { method: 'GET', path: '/ops-brand/global-modifier/{id}' } as const;
const SEASONING_UPDATE = { method: 'PUT', path: '/ops-brand/global-modifier/{id}' } as const;
const SEASONING_DELETE = { method: 'DELETE', path: '/ops-brand/global-modifier/{id}' } as const;

function endpointKey(identity: { method: string; path: string }): string {
  return `brand-menu:${identity.method} ${identity.path}`;
}

function endpointTitle(identity: { method: string; path: string }, title: string): string {
  return `${identity.method} ${identity.path} ${title}`;
}

function collectNamedRecords(value: unknown, records: NamedRecord[] = []): NamedRecord[] {
  if (Array.isArray(value)) {
    for (const item of value) collectNamedRecords(item, records);
    return records;
  }
  if (!value || typeof value !== 'object') return records;
  const record = value as Record<string, unknown>;
  if (typeof record.id === 'number' && typeof record.name === 'string') {
    records.push({ id: record.id, name: record.name });
  }
  for (const child of Object.values(record)) collectNamedRecords(child, records);
  return records;
}

test.describe('品牌调味 endpoint', () => {
  test(
    '接口合同应覆盖调味创建、列表、详情、编辑和删除 operation',
    async () => {
      for (const identity of [SEASONING_CREATE, SEASONING_LIST, SEASONING_DETAIL, SEASONING_UPDATE, SEASONING_DELETE]) {
        await test.step(endpointTitle(identity, '检查 operation 合同'), async () => {
          await expect(findOperation(endpointKey(identity))).resolves.toMatchObject({
            method: identity.method,
            path: identity.path,
          });
        });
      }
    },
  );

  test(
    endpointTitle(SEASONING_CREATE, '应完成创建、列表、详情、编辑、删除并保持零残留'),
    async ({ productCenterApi, cleanupRegistry }) => {
      const identity = createAuditIdentity('SEASONING');
      let seasoningId: number | undefined;

      const findByName = async (name: string): Promise<NamedRecord | undefined> => (
        collectNamedRecords(await productCenterApi.seasoningList()).find((record) => record.name === name)
      );

      await test.step(endpointTitle(SEASONING_CREATE, '创建并立即登记服务端 ID'), async () => {
        await productCenterApi.createSeasoning({ name: identity.marker, secondName: '调味 endpoint 审计' });
        const record = await findByName(identity.marker);
        expect(record).toBeDefined();
        seasoningId = record!.id;

        cleanupRegistry.register({
          entity: '品牌调味 endpoint',
          identity: identity.marker,
          resource: { entityKind: 'seasoning', serverId: seasoningId!, identityVariants: [identity.marker, identity.editedMarker] },
          execute: async () => {
            for (const name of [identity.editedMarker, identity.marker]) {
              const residue = await findByName(name);
              if (residue) await productCenterApi.deleteSeasoning(residue.id);
            }
          },
          verify: async () => !(await findByName(identity.marker)) && !(await findByName(identity.editedMarker)),
        });
      });

      await test.step(endpointTitle(SEASONING_LIST, '列表应返回新建调味组'), async () => {
        expect((await findByName(identity.marker))?.id).toBe(seasoningId);
      });

      await test.step(endpointTitle(SEASONING_DETAIL, '详情应返回服务端记录'), async () => {
        expect(seasoningId).toBeDefined();
        const response = await productCenterApi.seasoningDetail(seasoningId!);
        expect(response.data).toMatchObject({ id: seasoningId, name: identity.marker });
      });

      await test.step(endpointTitle(SEASONING_UPDATE, '编辑后列表和详情应使用新名称'), async () => {
        expect(seasoningId).toBeDefined();
        const detail = (await productCenterApi.seasoningDetail(seasoningId!)).data as Record<string, any>;
        await productCenterApi.updateSeasoning(seasoningId!, {
          name: identity.editedMarker,
          secondName: '调味 endpoint 编辑',
          posName: detail.posName ?? identity.editedMarker,
          options: (detail.options ?? []).map((option: Record<string, unknown>) => ({ ...option })),
        });
        expect((await findByName(identity.editedMarker))?.id).toBe(seasoningId);
        expect(await findByName(identity.marker)).toBeUndefined();
      });

      await test.step(endpointTitle(SEASONING_DELETE, '删除后列表不得保留原名称和编辑名称'), async () => {
        expect(seasoningId).toBeDefined();
        await productCenterApi.deleteSeasoning(seasoningId!);
        seasoningId = undefined;
        expect(await findByName(identity.marker)).toBeUndefined();
        expect(await findByName(identity.editedMarker)).toBeUndefined();
      });
    },
  );
});
