import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterBlockerSummary } from '../../scripts/build-product-center-blocker-summary';

type Report = { blockerCount: number; businessExecutionStarted: boolean; blockers: Array<{ id: string; status: string; problem: string }>; evidence: Array<{ id: string; status: string }> };
function fixture() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-blocker-summary-'));
  const projectRoot = path.join(workspaceRoot, 'project');
  const write = (relative: string, value: unknown, workspace = false) => {
    const file = path.join(workspace ? workspaceRoot : projectRoot, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
    return file;
  };
  const build = (): Report => JSON.parse(fs.readFileSync(buildProductCenterBlockerSummary({ projectRoot, workspaceRoot }).output, 'utf8'));
  const cleanup = () => fs.rmSync(workspaceRoot, { recursive: true, force: true });
  return { workspaceRoot, projectRoot, write, build, cleanup };
}

const efficiencyPath = 'deliverables/system-test-platform/product-center-lifecycle-efficiency-audit.json';

test('缺失证据必须逐项显式登记且不触发业务执行', () => {
  const f = fixture();
  try {
    const result = f.build();
    expect(result.blockerCount).toBe(result.blockers.length);
    expect(result.businessExecutionStarted).toBe(false);
    expect(result.evidence).toHaveLength(6);
    expect(result.evidence.every((item) => item.status === 'missing')).toBe(true);
    expect(result.blockers.every((item) => item.status === 'evidence-incomplete')).toBe(true);
  } finally { f.cleanup(); }
});

test('同一进程重复构建必须消费最新效率、维护性和公共门禁证据', () => {
  const f = fixture();
  try {
    f.write(efficiencyPath, { status: 'incomplete', summary: { telemetryGapCount: 9, artifactMissingStageCount: 2 } }, true);
    f.write('output/quality/product-center-maintainability-report.json', { status: 'blocked', summary: { highPriorityFiles: 8 }, baseline: { maxHighPriorityFiles: 3 } });
    f.write('deliverables/system-test-platform/final-goal-verdict.json', { status: 'incomplete', blockers: ['CROSS_APPLICATION_PILOT_REQUIRED', 'CROSS_DOMAIN_PILOT_REQUIRED', 'REFERENCE_BASELINE_NOT_READY'] });
    const first = f.build();
    expect(first.blockers.find((item) => item.id === 'EFFICIENCY_TELEMETRY')?.problem).toContain('9');
    expect(first.blockers.find((item) => item.id === 'MAINTAINABILITY')?.problem).toContain('8');
    expect(first.blockers.some((item) => item.id === 'CROSS_DOMAIN_PILOT')).toBe(true);
    f.write(efficiencyPath, { status: 'complete', summary: { telemetryGapCount: 0, artifactMissingStageCount: 0 } }, true);
    f.write('output/quality/product-center-maintainability-report.json', { status: 'passed', summary: { highPriorityFiles: 2 }, baseline: { maxHighPriorityFiles: 3 } });
    f.write('deliverables/system-test-platform/final-goal-verdict.json', { status: 'complete', blockers: [] });
    const second = f.build();
    expect(second.blockers.some((item) => ['EFFICIENCY_TELEMETRY', 'MAINTAINABILITY', 'CROSS_DOMAIN_PILOT', 'REFERENCE_BASELINE'].includes(item.id))).toBe(false);
  } finally { f.cleanup(); }
});

test('损坏、结构错误和不可读取的输入不能隐藏阻断或泄露原始内容', () => {
  const f = fixture();
  try {
    f.write(efficiencyPath, '{"synthetic-secret":"must-not-appear"', true);
    f.write('contracts/product-center/test-cases/canonical/product-center-item-current-receipt-contract.json', { cases: 'must-not-appear' });
    const auth = path.join(f.projectRoot, 'output/governance/product-center-jenkins-auth-preflight.json');
    fs.mkdirSync(auth, { recursive: true });
    const report = f.build();
    expect(report.evidence.find((item) => item.id === 'EFFICIENCY_TELEMETRY')?.status).toBe('invalid');
    expect(report.evidence.find((item) => item.id === 'MC_AUTHORIZATION')?.status).toBe('unreadable');
    expect(report.evidence.find((item) => item.id === 'ITEM_FINAL_RELEASE_CONTRACT')?.status).toBe('invalid');
    expect(JSON.stringify(report)).not.toContain('must-not-appear');
  } finally { f.cleanup(); }
});

test('最近调度器损坏不得回退旧成功，阻断不得自动归因为认证失败', () => {
  const f = fixture();
  try {
    const old = f.write('deliverables/product-center-item/old-scheduler.json', { status: 'passed' }, true);
    fs.utimesSync(old, new Date(1000), new Date(1000));
    const latest = f.write('deliverables/product-center-item/new-scheduler.json', '{broken', true);
    expect(f.build().blockers.some((item) => item.id === 'ITEM_STRICT_REVALIDATION_EVIDENCE')).toBe(true);
    fs.writeFileSync(latest, JSON.stringify({ status: 'blocked' }));
    expect(f.build().blockers.find((item) => item.id === 'ITEM_STRICT_REVALIDATION')?.status).toBe('blocked');
    fs.writeFileSync(latest, JSON.stringify({ status: 'passed' }));
    expect(f.build().blockers.some((item) => item.id.startsWith('ITEM_STRICT_REVALIDATION'))).toBe(false);
  } finally { f.cleanup(); }
});

test('认证配置就绪只投影为只读探针前置条件，不能宣布认证成功', () => {
  const f = fixture();
  try {
    const file = 'output/governance/product-center-jenkins-auth-preflight.json';
    f.write(file, { status: 'external-authorization-blocked' });
    expect(f.build().blockers.find((item) => item.id === 'MC_AUTHORIZATION')?.status).toBe('external-authorization-blocked');
    f.write(file, { status: 'ready-for-readonly-probe' });
    expect(f.build().blockers.find((item) => item.id === 'MC_AUTHORIZATION')?.status).toBe('ready-for-readonly-probe');
  } finally { f.cleanup(); }
});
