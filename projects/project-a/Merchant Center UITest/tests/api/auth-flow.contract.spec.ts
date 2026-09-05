import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { isSettledAuthDestination } from '../../flows/auth.flow';

const flowPath = path.resolve(__dirname, '../../flows/auth.flow.ts');
const setupPath = path.resolve(__dirname, '../setup/auth.setup.ts');
const seasoningSetupPath = path.resolve(__dirname, '../../systems/merchant-center-product-center-seasoning/tests/setup.spec.ts');

test.describe('商品中心 UI 认证流合同', () => {
  test('授权域名上的加载中状态不能被当成登录失败而重复提交', () => {
    expect(isSettledAuthDestination({ permissionsSettled:false, loginVisible:false, passwordVisible:false })).toBe(false);
    expect(isSettledAuthDestination({ permissionsSettled:false, loginVisible:true, passwordVisible:false })).toBe(false);
    expect(isSettledAuthDestination({ permissionsSettled:false, loginVisible:true, passwordVisible:true })).toBe(true);
    expect(isSettledAuthDestination({ permissionsSettled:true, loginVisible:false, passwordVisible:false })).toBe(true);
  });
  test('必须以可观测状态机完成 OAuth 回跳、权限、商户和品牌身份确认', () => {
    const source = fs.readFileSync(flowPath, 'utf8');
    for (const stage of [
      'oauth-login',
      'oauth-submit',
      'oauth-callback',
      'permissions-loading',
      'merchant-selection',
      'merchant-confirm',
      'app-shell-ready',
      'target-ready',
      'brand-identity-verified',
    ]) {
      expect(source, `认证流缺少阶段 ${stage}`).toContain(`'${stage}'`);
    }
    expect(source).toContain('waitForAuthTransition');
    expect(source).toContain('requesting permissions');
    expect(source).toContain("headers()['x-brand-id']");
    expect(source).toContain('currentShellContextMatches');
    expect(source).toContain('authoritative context signal');
    expect(source).toContain("page.context().on('request', observeBrandId)");
    expect(source).toContain('sanitizeVisibleText');
    expect(source).not.toContain('waitForTimeout');
    expect(source).not.toContain('stableShellSamples >= 120');
    expect(source).toContain('loginAttempt < 2');
  });

  test('setup 与复用态校验必须共用认证入口，不能维护第二套短探针', () => {
    const setup = fs.readFileSync(setupPath, 'utf8');
    const seasoningSetup = fs.readFileSync(seasoningSetupPath, 'utf8');
    expect(setup).toContain('bootstrapMerchantCenterSession');
    expect(seasoningSetup).toContain('bootstrapMerchantCenterSession');
    expect(setup).toContain('persistMerchantCenterSessionState');
    expect(seasoningSetup).toContain('persistMerchantCenterSessionState');
    expect(setup).not.toContain('waitUntil(');
    expect(seasoningSetup).not.toContain('waitUntil(');
    expect(setup).not.toContain("getByRole('heading', { name: 'Selected Merchant' })");
    expect(seasoningSetup).not.toContain("getByRole('heading', { name: 'Selected Merchant' })");
  });

  test('公共认证入口必须隔离失效上下文并回退到 UI 登录', () => {
    const source = fs.readFileSync(flowPath, 'utf8');
    expect(source).toContain("mode: 'reused' | 'ui-login'");
    expect(source).toContain('await reusableContext.close()');
    expect(source).toContain('await establishMerchantCenterSession(page, input.auth, input.options)');
    expect(source).toContain('outcome.observedBrandId === expectedBrandId');
    expect(source).toContain('persistMerchantCenterSessionState');
  });

  test('调味认证 profile 必须使用独立状态文件和身份探针', () => {
    const contextSource = fs.readFileSync(path.resolve(__dirname, '../../test-data/seasoning-context.ts'), 'utf8');
    expect(contextSource).toContain('seasoning-single-store-000407.json');
    expect(contextSource).toContain('seasoning-multi-store-000420.json');
    expect(contextSource).toContain("identityProbePath: '/pp/brand/seasoning/list'");
    expect(contextSource).toContain("identityProbePath: '/pp/brand/seasoning/template'");
    expect(contextSource).not.toContain("storageStatePath: 'output/");
    const seasoningSetup = fs.readFileSync(seasoningSetupPath, 'utf8');
    expect(seasoningSetup).toContain('merchant: seasoningContext.merchant');
    expect(seasoningSetup).toContain('brandId: seasoningContext.brandId');
  });

  test('通用凭据解析必须允许领域 profile 覆盖商户身份且不复制密码来源', () => {
    const authSource = fs.readFileSync(path.resolve(__dirname, '../../test-data/auth.ts'), 'utf8');
    expect(authSource).toContain("identity: Partial<Pick<AuthCredentials, 'merchant' | 'brandId'>>");
    expect(authSource).toContain('merchant: identity.merchant ?? appConfig.merchantName');
    expect(authSource).toContain('brandId: identity.brandId ?? appConfig.brandId');
    expect(authSource).toContain('password: appConfig.password');
  });
});
