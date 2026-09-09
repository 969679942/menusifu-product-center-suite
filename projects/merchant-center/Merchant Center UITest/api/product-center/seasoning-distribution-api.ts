import type { APIRequestContext } from '@playwright/test';
import { callOperation } from '../operation-client';
import { assertAuditIdentity } from '../../test-data/product-center/audit-identity';

export class SeasoningDistributionApi {
  constructor(private readonly request: APIRequestContext) {}

  async createTemplate(input: {
    name: string;
    secondName: string;
    description: string;
    modifierId: number;
    modifierName: string;
    optionId: number;
    optionName: string;
    additionalOptions?: ReadonlyArray<{ optionId: number; optionName: string }>;
  }): Promise<unknown> {
    assertAuditIdentity(input.name);
    return json(await callOperation(this.request, 'brand-menu:POST /ops-brand/modifier-template', {
      body: {
        name: input.name,
        secondName: input.secondName,
        description: input.description,
        sortOrder: 0,
        status: 1,
        modifierGroups: [{
          modifierId: input.modifierId,
          name: input.modifierName,
          groupSortOrder: 0,
          options: [{ optionId: input.optionId, optionName: input.optionName }, ...(input.additionalOptions ?? [])]
            .map((option, index) => ({
              modifierOptionId: option.optionId,
              name: option.optionName,
              priceAdjustment: 0,
              sortOrder: index,
            })),
        }],
      },
    }));
  }

  async brandMerchantPage(input: { merchantId?: string; merchantName?: string } = {}): Promise<unknown> {
    return json(await callOperation(this.request, 'brand-menu:POST /ops-brand/merchants/page', {
      body: { pageNumber: 1, pageSize: 100, ...input },
    }));
  }

  async syncAll(input: { jobName: string; targetPois: Array<{ poiId: string; poiName: string; region?: string }>; remark?: string }): Promise<unknown> {
    return json(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-modifier-sync/all', { body: input }));
  }

  async syncByTemplate(input: { jobName: string; modifierTemplateIds: number[]; targetPois: Array<{ poiId: string; poiName: string; region?: string }>; remark?: string }): Promise<unknown> {
    return json(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-modifier-sync/by-template', { body: input }));
  }

  async storeSeasoningList(): Promise<unknown> {
    return json(await callOperation(this.request, 'brand-menu:GET /ops-poi/global-modifier/list', { query: { status: 1 } }));
  }

  async distributionJobList(): Promise<unknown> {
    return json(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-modifier-sync/job/list', {
      body: { pageNumber: 1, pageSize: 100 },
    }));
  }

  async deleteStoreSeasoning(id: number): Promise<unknown> {
    return json(await callOperation(this.request, 'brand-menu:DELETE /ops-poi/global-modifier/{id}', { pathParams: { id } }));
  }

  async deleteStoreSeasoningOption(optionId: number): Promise<unknown> {
    return json(await callOperation(this.request, 'brand-menu:DELETE /ops-poi/global-modifier/option/{optionId}', {
      pathParams: { optionId },
    }));
  }

  async batchDeleteStoreSeasoning(input: { modifierIds?: number[]; optionIds?: number[] }): Promise<unknown> {
    const modifierIds = input.modifierIds ?? [];
    const optionIds = input.optionIds ?? [];
    if (modifierIds.length === 0 && optionIds.length === 0) throw new Error('门店调味批量删除至少需要一个组 ID 或调味项 ID');
    return json(await callOperation(this.request, 'brand-menu:POST /ops-poi/global-modifier/batch-delete', {
      body: { modifierIds, optionIds },
    }));
  }
}

async function json(response: Awaited<ReturnType<typeof callOperation>>): Promise<unknown> {
  const body = await response.json().catch(() => null);
  if (!response.ok() || (body as { success?: boolean } | null)?.success === false) {
    throw new Error(`调味下发 API 请求失败 HTTP ${response.status()}：${JSON.stringify(body)}`);
  }
  return body;
}
