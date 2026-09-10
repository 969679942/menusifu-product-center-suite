import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { expect, test } from '@playwright/test';
import { buildProcessReverseScenarioCoverage } from '../../scripts/assess-process-reverse-scenario-coverage';

const catalog = {
  schemaVersion: '1.0.0', catalogId: 'isolated-process', ownerScope: 'public-process',
  scenarios: [{
    scenarioId: 'RS-TEST', requirementIds: ['REQ-1'], title: '来源校验',
    trigger: { event: 'source-updated', scope: 'project', requiredEvidence: ['source'] },
    sourceRefs: ['source.md#REQ-1'], expectedResolutionActions: ['block-case'],
    mandatoryContracts: ['contract-1'], humanEscalationReasons: ['正式业务来源冲突'],
  }],
};
const candidate = {
  caseId: 'CASE-1', scenarioId: 'RS-TEST', sourceRefs: ['source.md#REQ-1'],
  contractRefs: ['contract-1'], status: 'candidate', executionEligible: false,
};

function isolated(action: (directory: string, registryPath: string, outputPath: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reverse-input-'));
  try {
    const directory = path.join(root, 'deliverables/test-plan-governance');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'process-reverse-scenario-catalog-v1.json'), JSON.stringify(catalog));
    action(root, path.join(directory, 'process-reverse-scenario-case-registry-v1.json'),
      path.join(directory, 'process-reverse-scenario-coverage-v1.json'));
  } finally {
    // Only remove the unique directory created by this test.
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('合法候选登记只能产生部分覆盖，不能冒充完整运行证据', () => {
  isolated((root, registryPath, outputPath) => {
    fs.writeFileSync(registryPath, JSON.stringify({ cases: [candidate] }));
    buildProcessReverseScenarioCoverage(root);
    const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(report.summary).toMatchObject({ scenarioCount: 1, partial: 1, covered: 0, missing: 0 });
    expect(report.resultsImpact).toBe('unchanged');
    expect(report.executionScope).toBe('static-and-contract-only');
  });
});

for (const [label, fields, code] of [
  ['缺少来源', { sourceRefs: [] }, 'MISSING_SOURCE'],
  ['缺少合同', { contractRefs: [] }, 'MISSING_CONTRACT'],
  ['候选错误授予执行资格', { executionEligible: true }, 'MISSING_TRIGGER'],
  ['绑定未知场景', { scenarioId: 'RS-UNKNOWN' }, 'INVALID_ID'],
] as const) {
  test(`实际登记${label}时拒绝，禁止默认值掩盖且保留旧报告`, () => {
    isolated((root, registryPath, outputPath) => {
      fs.writeFileSync(registryPath, JSON.stringify({ cases: [{ ...candidate, ...fields }] }));
      const oldReport = '{"isolatedPriorReport":true}';
      fs.writeFileSync(outputPath, oldReport);
      expect(() => buildProcessReverseScenarioCoverage(root)).toThrow(code);
      expect(fs.readFileSync(outputPath, 'utf8')).toBe(oldReport);
    });
  });
}

test('损坏登记文件保持解析失败，不能生成新的覆盖报告', () => {
  isolated((root, registryPath, outputPath) => {
    fs.writeFileSync(registryPath, '{invalid');
    expect(() => buildProcessReverseScenarioCoverage(root)).toThrow(SyntaxError);
    expect(fs.existsSync(outputPath)).toBe(false);
  });
});
