import { expect, test } from '@playwright/test';
import {
  buildProductCenterApiObservationProposal,
  normalizeProductCenterObservedApiExchange,
} from '../../utils/product-center-api-observation';

test.describe('页面 API 观测提案', () => {
  test('应把真实路径匹配到现有 operationKey，并脱敏请求体', () => {
    const exchange = normalizeProductCenterObservedApiExchange({
      caseId: 'CASE-API-001', route: '/items', method: 'post', url: 'https://qa.example/item/v1/ops/items/123',
      status: 200, evidencePath: 'output/page-contract/api.json', observedAt: '2026-08-17T00:00:00.000Z',
      requestBody: { name: '审计商品', token: 'do-not-persist', nested: { password: 'secret' } },
      responseBody: { data: { id: 123, name: '审计商品' } },
    });
    const proposal = buildProductCenterApiObservationProposal({
      exchanges: [exchange],
      catalog: [{ operationKey: 'brand-menu:POST /ops/items/{id}', method: 'POST', path: '/ops/items/{id}' }],
    });
    expect(proposal.status).toBe('no-change');
    expect(proposal.entries[0]).toMatchObject({
      disposition: 'matched', matchedOperationKey: 'brand-menu:POST /ops/items/{id}',
      requestShape: ['name'], responseShape: ['data.id', 'data.name'],
    });
    expect(JSON.stringify(exchange)).not.toContain('do-not-persist');
    expect(JSON.stringify(exchange)).not.toContain('secret');
    expect(JSON.stringify(exchange)).not.toContain('审计商品');
  });

  test('新路径只生成提案，operationKey 冲突或信息不足进入审核', () => {
    const base = {
      caseId: 'CASE-API-002', route: '/groups', method: 'GET', evidencePath: 'api.json',
      observedAt: '2026-08-17T00:00:00.000Z', status: 200,
    };
    const proposal = buildProductCenterApiObservationProposal({
      exchanges: [
        { ...base, url: 'https://qa.example/ops/groups', responseBody: { data: [] } },
        { ...base, url: 'https://qa.example/ops/groups-v2', operationKey: 'old:key', responseBody: { data: [] } },
        { ...base, url: '', method: '' },
      ],
      catalog: [],
    });
    expect(proposal.status).toBe('review-required');
    expect(proposal.summary.newOperations).toBe(1);
    expect(proposal.summary.conflicts).toBe(1);
    expect(proposal.summary.insufficientEvidence).toBe(1);
    expect(proposal.contractMutationAllowed).toBe(false);
  });
});
