import { test, expect } from '@playwright/test';
import { evaluateAuthenticationPreflight } from '../../src/governance/authentication-preflight';

test('不兼容凭据不可满足目标认证方式，配置就绪不可授权执行', () => {
  const capabilities = [{ id: 'interactive-id', configured: false }, { id: 'interactive-secret', configured: false },
    { id: 'service-token', configured: true }, { id: 'scope', configured: true }];
  const policy = { mode: 'interactive', credentialAlternatives: [['interactive-id', 'interactive-secret']], requiredContext: ['scope'] };
  expect(evaluateAuthenticationPreflight(policy, capabilities).status).toBe('external-authorization-blocked');
  const service = evaluateAuthenticationPreflight({ ...policy, mode: 'service', credentialAlternatives: [['service-token']] }, capabilities);
  expect(service).toMatchObject({ status: 'ready-for-readonly-probe', executionAuthorized: false, authenticationVerified: false });
  capabilities[3].configured = false;
  expect(evaluateAuthenticationPreflight({ ...policy, credentialAlternatives: [['service-token']] }, capabilities).missingContext).toEqual(['scope']);
});

test('空凭据组、缺失能力声明和重复能力必须拒绝', () => {
  const policy = { mode: 'synthetic', credentialAlternatives: [['credential']], requiredContext: [] };
  expect(() => evaluateAuthenticationPreflight(policy, [])).toThrow('AUTHENTICATION_PREFLIGHT_CONTRACT_INVALID');
  expect(() => evaluateAuthenticationPreflight({ ...policy, credentialAlternatives: [[]] }, [])).toThrow();
  expect(() => evaluateAuthenticationPreflight(policy, [{ id: 'credential', configured: true }, { id: 'credential', configured: false }])).toThrow();
});
