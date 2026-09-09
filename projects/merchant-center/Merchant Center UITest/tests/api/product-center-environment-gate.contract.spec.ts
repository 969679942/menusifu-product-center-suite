import { expect, test } from '@playwright/test';
import { evaluateProductCenterEnvironment } from '../../utils/product-center-environment-gate';

test.describe('商品中心环境与数据治理门禁', () => {
  test('应检查环境身份合同检查点残留和密钥安全', async () => {
    const report = evaluateProductCenterEnvironment({
      environment: 'balamxqa', brandId: '000407', expectedBrandId: '000407',
      contractErrors: [], incompleteCheckpoints: [], residueIdentities: [], sensitiveFindings: [],
      secretMetadata: { source: 'runtime.env', tokenLength: 128, fingerprint: 'abc123' },
    });

    expect(report.pass).toBe(true);
    expect(report.gates.every((gate) => gate.pass)).toBe(true);
    expect(JSON.stringify(report)).not.toContain('token=');
  });

  test('任何检查点残留或商户漂移都必须阻断执行', async () => {
    const report = evaluateProductCenterEnvironment({
      environment: 'balamxqa', brandId: '999999', expectedBrandId: '000407',
      contractErrors: [], incompleteCheckpoints: ['output/checkpoints/run.json'],
      residueIdentities: ['AUTO_AUDIT_CATEGORY_X'], sensitiveFindings: [],
    });

    expect(report.pass).toBe(false);
    expect(report.gates.filter((gate) => !gate.pass).map((gate) => gate.id)).toEqual([
      'brand-context', 'checkpoint-clean', 'residue-zero',
    ]);
  });
});
