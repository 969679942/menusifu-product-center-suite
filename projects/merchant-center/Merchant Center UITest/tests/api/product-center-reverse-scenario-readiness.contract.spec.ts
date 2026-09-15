import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { generateProductCenterReverseScenarioReadiness } from '../../scripts/build-product-center-reverse-scenario-readiness';
import { generateReverseScenarioEvidenceQueue, hasCurrentReverseScenarioEvidenceQueue } from '../../scripts/build-product-center-reverse-scenario-evidence-queue';

const reportPath = path.resolve(__dirname, '../../../deliverables/test-plan-governance/product-center-reverse-scenario-readiness-v1.json');

test('反向场景证据投影必须逐项绑定，汇总文件不得授权 covered', () => {
  expect(fs.existsSync(reportPath)).toBe(true);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    scenarios: Array<{
      status: string;
      evidenceItems: Array<{ evidenceId: string; path: string; sha256: string; disposition: string }>;
      consumedEvidenceCount: number;
      declaredAggregateRefs: string[];
    }>;
  };
  for (const scenario of report.scenarios) {
    expect(scenario.status).not.toBe('covered');
    expect(scenario.consumedEvidenceCount).toBe(
      scenario.evidenceItems.filter((item) => item.disposition === 'consumed' && item.path.length > 0).length,
    );
    for (const item of scenario.evidenceItems) {
      expect(item.evidenceId).toMatch(/^audit:/);
      if (item.path.length > 0) expect(item.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(scenario.evidenceItems.some((item) => /runtime-audit-v2\.json$/.test(item.path))).toBe(false);
  }
});

test('上游输入损坏必须使当前就绪和下游队列失去静态完成资格并保留原观察', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'reverse-readiness-contract-'));
  const project = path.join(workspace, 'project');
  const catalogPath = path.join(workspace, 'deliverables/test-plan-governance/process-reverse-scenario-catalog-v1.json');
  const mapPath = path.join(project, 'adapters/test-automation-platform/product-center-reverse-scenario-map-v1.json');
  const auditPath = path.join(workspace, 'deliverables/product-center-group/runtime-audit-v2.json');
  const catalog = { schemaVersion: '1.0.0', catalogId: 'contract-catalog', ownerScope: 'public-process', scenarios: [{
    scenarioId: 'RS-TEST-001', requirementIds: ['FR-TEST'], title: '隔离合同场景', trigger: { event: 'contract-event', scope: 'case', requiredEvidence: ['receipt'] },
    sourceRefs: ['contract-source'], expectedResolutionActions: ['block-case'], mandatoryContracts: ['contract'], humanEscalationReasons: ['source-conflict'],
  }] };
  const mapping = { schemaVersion: '1.0.0', catalogId: 'contract-catalog', mappings: [] };
  const audit = { schemaVersion: '2.0.0', evidenceInventory: [], corrections: [] };
  const write = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
  try {
    write(catalogPath, catalog); write(mapPath, mapping); write(auditPath, audit);
    const first = generateProductCenterReverseScenarioReadiness(project);
    expect(first.status).toBe('completed');
    generateReverseScenarioEvidenceQueue(project);
    expect(hasCurrentReverseScenarioEvidenceQueue(project)).toBe(true);
    const original = fs.readFileSync(first.outputPath);
    const originalAudit = fs.readFileSync(auditPath, 'utf8');
    write(auditPath, { ...audit, observation: 'changed-without-upstream-rebuild' });
    expect(hasCurrentReverseScenarioEvidenceQueue(project)).toBe(false);
    expect(generateReverseScenarioEvidenceQueue(project).status).toBe('blocked');
    const staleQueue = JSON.parse(fs.readFileSync(path.join(workspace, 'deliverables/test-plan-governance/product-center-reverse-scenario-evidence-queue-v1.json'), 'utf8'));
    expect(staleQueue).toMatchObject({ inputStatus: 'stale', lineageReasons: ['INPUT_FINGERPRINT_MISMATCH'] });
    expect(fs.readFileSync(first.outputPath).equals(original)).toBe(true);
    fs.writeFileSync(auditPath, originalAudit);
    generateReverseScenarioEvidenceQueue(project);
    expect(hasCurrentReverseScenarioEvidenceQueue(project)).toBe(true);
    fs.writeFileSync(auditPath, '{"authorization":"contract-secret-marker",');
    expect(generateProductCenterReverseScenarioReadiness(project).status).toBe('blocked');
    expect(hasCurrentReverseScenarioEvidenceQueue(project)).toBe(false);
    expect(generateReverseScenarioEvidenceQueue(project).status).toBe('blocked');
    expect(JSON.parse(fs.readFileSync(first.outputPath, 'utf8'))).toMatchObject({ status: 'blocked', code: 'PROCESS_REVERSE_SCENARIO_AUDIT_INVALID', summary: null });
    const hash = createHash('sha256').update(original).digest('hex');
    expect(fs.readFileSync(path.join(workspace, '.artifact-history/objects', `${hash}.bin`)).equals(original)).toBe(true);
    for (const name of fs.readdirSync(path.join(workspace, '.artifact-history/objects'))) {
      expect(fs.readFileSync(path.join(workspace, '.artifact-history/objects', name), 'utf8')).not.toContain('contract-secret-marker');
    }
    write(auditPath, audit);
    write(catalogPath, { ...catalog, scenarios: [] });
    expect(generateProductCenterReverseScenarioReadiness(project).status).toBe('blocked');
    write(catalogPath, catalog);
    write(mapPath, { ...mapping, catalogId: 'wrong-catalog' });
    expect(generateProductCenterReverseScenarioReadiness(project).status).toBe('blocked');
    write(mapPath, mapping);
    fs.unlinkSync(auditPath);
    expect(generateProductCenterReverseScenarioReadiness(project).status).toBe('blocked');
    expect(JSON.parse(fs.readFileSync(first.outputPath, 'utf8')).code).toBe('PROCESS_REVERSE_SCENARIO_AUDIT_MISSING');
    fs.mkdirSync(auditPath);
    expect(generateProductCenterReverseScenarioReadiness(project).status).toBe('blocked');
    expect(JSON.parse(fs.readFileSync(first.outputPath, 'utf8')).code).toBe('PROCESS_REVERSE_SCENARIO_AUDIT_UNREADABLE');
    fs.rmdirSync(auditPath);
    write(auditPath, audit);
    expect(generateProductCenterReverseScenarioReadiness(project).status).toBe('completed');
    generateReverseScenarioEvidenceQueue(project);
    expect(hasCurrentReverseScenarioEvidenceQueue(project)).toBe(true);
  } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
});
