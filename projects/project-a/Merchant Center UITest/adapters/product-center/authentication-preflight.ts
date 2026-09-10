import { evaluateAuthenticationPreflight } from '../../../Test Automation Platform/src/governance/authentication-preflight';

export type ProductCenterAuthMode = 'ui' | 'api';
export function inspectProductCenterAuthentication(mode: ProductCenterAuthMode = 'ui') {
  if (mode !== 'ui' && mode !== 'api') throw new Error('PRODUCT_CENTER_AUTH_MODE_INVALID');
  // Load the same effective sources as the runner. Never return source values.
  const { resolveAuthCredentials } = require('../../test-data/auth') as typeof import('../../test-data/auth');
  const { appConfig } = require('../../test-data/env') as typeof import('../../test-data/env');
  const ui = resolveAuthCredentials();
  const present = (value: string | undefined) => Boolean(value?.trim());
  let api: { accessToken?: string; username?: string; password?: string; brandId?: string } = {};
  if (mode === 'api') {
    const { loadMerchantCenterAccountContext } = require('../../api/core/merchant-center-account-context') as typeof import('../../api/core/merchant-center-account-context');
    // The runtime resolver throws when credentials are absent. In that branch only,
    // retain presence metadata with the same nullish precedence and trimming rules.
    const { secretEnv } = require('../../config/secret-source') as typeof import('../../config/secret-source');
    const env = process.env;
    const read = (key: string) => (env[key] ?? secretEnv[key] ?? '').trim();
    if (read('MC_ACCESS_TOKEN') || (read('MC_USERNAME') && read('MC_PASSWORD'))) api = loadMerchantCenterAccountContext();
    else api = { username: read('MC_USERNAME'), password: read('MC_PASSWORD'), brandId: read('MC_BRAND_ID') || '000407' };
  }
  const effective = mode === 'ui' ? ui : api;
  const capabilities = [
    { id: 'username', configured: present(effective.username) },
    { id: 'password', configured: present(effective.password) },
    { id: 'access-token', configured: mode === 'api' && present(api.accessToken) },
    { id: 'merchant', configured: present(appConfig.merchantName) },
    { id: 'brand', configured: present(effective.brandId) },
  ];
  return { ...evaluateAuthenticationPreflight({ mode,
    credentialAlternatives: mode === 'ui' ? [['username', 'password']] : [['access-token'], ['username', 'password']],
    requiredContext: mode === 'ui' ? ['merchant', 'brand'] : ['brand'],
  }, capabilities), capabilities, configurationSources: ['process-environment', 'configured-or-default-secret-file', 'runner-context-defaults'] };
}
