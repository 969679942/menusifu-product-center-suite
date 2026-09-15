import { test, expect } from '@playwright/test';
import { fingerprintJsonInput, verifyJsonInputCurrentness, type CurrentJsonInput } from '../../src/governance/json-input-currentness';

const current = (): CurrentJsonInput[] => [{ path: 'catalog.json', evidence: { status: 'available', value: { id: 'scenario' } } },
  { path: 'adapter.json', evidence: { status: 'available', value: { route: 'configured-route' } } }];
const declared = () => current().map((item) => ({ path: item.path, fingerprint: fingerprintJsonInput(item.evidence.status === 'available' ? item.evidence.value : null) }));

test('独立当前输入与声明逐项匹配，重新读取内容变化后拒绝旧投影', () => {
  expect(verifyJsonInputCurrentness(declared(), current()).status).toBe('current');
  const changed = current(); changed[1].evidence = { status: 'available', value: { route: 'changed' } };
  expect(verifyJsonInputCurrentness(declared(), changed).reasons).toContain('INPUT_FINGERPRINT_MISMATCH');
  expect(fingerprintJsonInput(JSON.parse('{ "id": "scenario" }'))).toBe(declared()[0].fingerprint);
});

test('空集合、重复身份、删减和额外声明不得缩小独立输入合同', () => {
  expect(verifyJsonInputCurrentness([], []).status).toBe('incomplete');
  expect(verifyJsonInputCurrentness(declared(), [...current(), current()[0]]).reasons).toContain('CURRENT_INPUT_CONTRACT_INVALID');
  expect(verifyJsonInputCurrentness([...declared(), declared()[0]], current()).reasons).toContain('DECLARED_INPUT_FINGERPRINTS_INVALID');
  expect(verifyJsonInputCurrentness(declared().slice(0, 1), current()).reasons).toContain('INPUT_SET_MISMATCH');
  expect(verifyJsonInputCurrentness([...declared(), { path: '../other.json', fingerprint: declared()[0].fingerprint }], current()).reasons).toContain('INPUT_SET_MISMATCH');
});

test('缺失损坏或不可读源不借用旧指纹，诊断不包含敏感内容', () => {
  for (const evidence of [{ status: 'missing', reason: 'not-found' }, { status: 'invalid', reason: 'json-invalid' }, { status: 'unreadable', reason: 'read-failed' }] as const) {
    const values = current(); values[0].evidence = evidence;
    expect(verifyJsonInputCurrentness(declared(), values).reasons).toContain('CURRENT_INPUT_UNAVAILABLE');
  }
  const values = current(); values[0].evidence = { status: 'available', value: { password: 'contract-secret-marker' } };
  expect(JSON.stringify(verifyJsonInputCurrentness(declared(), values))).not.toContain('contract-secret-marker');
  values[0].evidence = { status: 'available', value: undefined };
  expect(verifyJsonInputCurrentness(declared(), values).reasons).toContain('CURRENT_INPUT_NOT_SERIALIZABLE');
});
