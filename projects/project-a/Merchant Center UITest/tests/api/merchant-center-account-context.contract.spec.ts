import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { MerchantCenterTokenProvider } from '../../api/core/merchant-center-token-provider';
import { loadMerchantCenterAccountContext } from '../../api/core/merchant-center-account-context';

test('商品中心 API 账号上下文应区分直接令牌和账号密码来源', () => {
  const tokenContext = loadMerchantCenterAccountContext({
    MC_ACCESS_TOKEN: 'test-access-token-value-1234567890',
    MC_BRAND_ID: 'brand-test',
    MC_POI_ID: 'poi-test',
    MC_ENVIRONMENT: 'qa',
  }, {});
  const credentialContext = loadMerchantCenterAccountContext({
    MC_USERNAME: 'api-user',
    MC_PASSWORD: 'api-password',
    MC_BRAND_ID: 'brand-test',
    MC_POI_ID: 'poi-test',
  }, {});

  expect(tokenContext.credentialSource).toBe('access-token');
  expect(credentialContext.credentialSource).toBe('username-password');
  expect(tokenContext.brandId).toBe('brand-test');
  expect(credentialContext.poiId).toBe('poi-test');
});

test('商品中心 API 认证证据不得包含令牌原文或密码', () => {
  const context = loadMerchantCenterAccountContext({
    MC_ACCESS_TOKEN: 'test-access-token-value-1234567890',
    MC_BRAND_ID: 'brand-test',
    MC_POI_ID: 'poi-test',
  }, {});
  const provider = new MerchantCenterTokenProvider(context);
  const evidence = provider.evidence();

  expect(JSON.stringify(evidence)).not.toContain('test-access-token-value-1234567890');
  expect(JSON.stringify(evidence)).not.toMatch(/password|secret/i);
  expect(evidence.tokenFingerprint).toHaveLength(16);
});

test('生成接口与既有 CRUD 应共用账号夹具且按需认证', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const apiFixture = fs.readFileSync(path.join(rootDir, 'fixtures/product-center-api.fixture.ts'), 'utf8');
  const productFixture = fs.readFileSync(path.join(rootDir, 'fixtures/product-center.fixture.ts'), 'utf8');

  expect(productFixture).toContain("import { test as base } from './product-center-api.fixture'");
  expect(productFixture).toContain('merchantCenterTokenProvider: _merchantCenterTokenProvider');
  expect(apiFixture).not.toContain('merchantCenterAuthEvidence: [async');
  expect(apiFixture).toContain('merchantCenterAuthEvidence: async');
});
