import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { expect, test } from '@playwright/test';
import { fingerprintReceiptEvidence, readPlaywrightExecutionReceipts } from '../../utils/playwright-execution-receipt';
import { parseProductCenterItemCaseSemanticFingerprints } from '../../utils/product-center-item-case-semantic-fingerprint';

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'tests/generated/product-center-item-216.generated.spec.ts'), 'utf8');

test('原生生成结果必须保存逐案语义指纹，不依赖后处理补丁', () => {
  const cases = JSON.parse(source.match(/const allCases = (\[[\s\S]*?\]) as readonly GeneratedCase\[\];/)![1]) as Array<{ caseId: string; semanticCaseFingerprint: string }>;
  const expected = new Map(parseProductCenterItemCaseSemanticFingerprints(path.join(root, '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md')).map((item) => [item.caseId, item.fingerprint]));
  expect(cases.length).toBeGreaterThan(0);
  for (const item of cases) expect(item.semanticCaseFingerprint).toBe(expected.get(item.caseId));
  const command = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts['generate:product-center:item-216-spec'];
  expect(command).not.toContain('apply-product-center-item-dual-fingerprint-receipts');
});

for (const includeAssertion of [true, false]) {
  test(`实际生成的收据函数与公共读取器往返验证：${includeAssertion ? '完整证据通过' : '缺少断言不得回填通过'}`, async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'item-receipt-producer-'));
    try {
      const ast = ts.createSourceFile('generated.ts', source, ts.ScriptTarget.Latest, true);
      const names = ['attachStandardExecutionReceipt', 'findRuntimeAssertionReceipts', 'findRuntimeRoute'];
      const functions = ast.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''));
      expect(functions).toHaveLength(names.length);
      const compiled = ts.transpileModule(functions.map((node) => node.getText(ast)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
      const caseId = 'TC-ITEM-STD-TEST';
      const fingerprint = 'a'.repeat(64);
      const attachments: Array<{ name: string; contentType: string; body: string }> = [];
      const sandbox = {
        Buffer, URL, Date, process: { cwd: () => directory, env: {} },
        appConfig: { environmentId: 'isolated', brandId: 'synthetic-tenant' }, progressRunId: 'synthetic-run',
        consumeExecutableOperationReceipts: () => [{ operationKey: 'synthetic.operation', observed: true, method: 'Synthetic.perform', status: 'passed' }],
        assertObservedExecutableOperations: () => undefined,
        readProductCenterApplicationVersion: async () => ({ fingerprint, status: 'verified', source: 'synthetic', stable: true }),
        fingerprintProductCenterItemImplementation: () => fingerprint,
        fingerprintReceiptEvidence,
      };
      const attach = vm.runInNewContext(`${compiled}\nattachStandardExecutionReceipt`, sandbox) as (input: unknown) => Promise<void>;
      await attach({
        page: { evaluate: async () => 'en', url: () => 'https://synthetic.invalid/items' },
        testInfo: { testId: 'synthetic', project: { name: 'api' }, workerIndex: 0,
          attach: async (name: string, value: { body: Buffer; contentType: string }) => { attachments.push({ name, contentType: value.contentType, body: value.body.toString('base64') }); } },
        item: { caseId, bindingFingerprint: fingerprint, semanticCaseFingerprint: 'b'.repeat(64), implementationFingerprint: fingerprint, assertionIds: ['assertion-a'], handlerId: 'synthetic' },
        evidence: { route: '/items', assertionReceipts: includeAssertion ? [{ claimId: 'assertion-a', status: 'verified', expectedValue: 1, actualValue: 1, actualStatus: 'observed', observationChannel: 'ui', authority: 'user-visible', comparison: 'matched' }] : [] },
        cleanup: { apiIdentityCounts: { synthetic: 0 } }, uiResidue: { synthetic: 0 },
      });
      const payload = JSON.parse(Buffer.from(attachments[0].body, 'base64').toString('utf8'));
      expect(payload.semanticCaseFingerprint).toBe('b'.repeat(64));
      expect(payload.claims.verified).toEqual(includeAssertion ? ['assertion-a'] : []);
      expect(payload.claims.observed).toEqual(includeAssertion ? ['assertion-a'] : []);
      const reportPath = path.join(directory, 'report.json');
      fs.writeFileSync(reportPath, JSON.stringify({ suites: [{ specs: [{ tests: [{ annotations: [{ type: 'canonical-case-id', description: caseId }], results: [{ status: 'passed', startTime: '2026-09-08T00:00:00Z', attachments }] }] }] }] }));
      const parsed = readPlaywrightExecutionReceipts({ reportPath, workspaceRoot: directory });
      expect(parsed.records).toHaveLength(includeAssertion ? 1 : 0);
      if (includeAssertion) expect(parsed.diagnostics).toEqual([]);
      else expect(parsed.diagnostics).toContain(`${caseId}:RUNTIME_RECEIPT_ASSERTIONS_INCOMPLETE`);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
}
