import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  buildProductCenterDriftRepairProposal,
  evaluateProductCenterDriftProposalApproval,
} from '../../utils/product-center-drift-repair-proposal';
import { verifyProductCenterDriftRepairApplication } from '../../utils/product-center-drift-repair-application';

test.describe('商品中心 finding 级漂移修复 Proposal', () => {
  test('clean diff 应直接 no-change 且不要求审批', async () => {
    const proposal = buildProductCenterDriftRepairProposal({
      diff: diff([]),
      impactedCases: [],
    });
    expect(proposal).toMatchObject({ status: 'no-change', summary: { findings: 0 } });
    expect(evaluateProductCenterDriftProposalApproval(proposal, [])).toEqual({
      approved: true,
      missing: [],
    });
  });

  test('技术 finding 只应映射对应影响用例并逐 finding 批准', async () => {
    const proposal = buildProductCenterDriftRepairProposal({
      diff: diff([finding('CAPABILITY_DRIFT', 'case-a', 'source:a')]),
      impactedCases: [
        { caseId: 'case-a', match: 'source-id', changeIds: ['source:a'] },
        { caseId: 'case-b', match: 'route-fallback', changeIds: ['source:b'] },
      ],
    });
    expect(proposal).toMatchObject({
      status: 'approval-required',
      summary: { findings: 1, technicalProposals: 1, impactedCases: 1 },
    });
    expect(proposal.entries[0]).toMatchObject({
      approvalKey: 'CAPABILITY_DRIFT:case-a',
      impactedCaseIds: ['case-a'],
      approvalRequired: true,
      businessRuleMutationAllowed: false,
    });
    expect(evaluateProductCenterDriftProposalApproval(proposal, [])).toEqual({
      approved: false,
      missing: ['CAPABILITY_DRIFT:case-a'],
    });
    expect(evaluateProductCenterDriftProposalApproval(
      proposal,
      ['CAPABILITY_DRIFT:case-a'],
    ).approved).toBe(true);
  });

  test('来源或 Claim 阻断必须优先 blocked，不能靠技术审批绕过', async () => {
    const proposal = buildProductCenterDriftRepairProposal({
      diff: diff([
        finding('CAPABILITY_DRIFT', 'case-a', 'source:a'),
        finding('CLAIM_EVIDENCE_INCOMPLETE', 'case-a', 'source:a'),
      ]),
      impactedCases: [{ caseId: 'case-a', match: 'source-id', changeIds: ['source:a'] }],
    });
    expect(proposal.status).toBe('blocked');
    expect(proposal.summary.blocked).toBe(1);
    expect(evaluateProductCenterDriftProposalApproval(
      proposal,
      ['CAPABILITY_DRIFT:case-a', 'CLAIM_EVIDENCE_INCOMPLETE:case-a'],
    ).approved).toBe(false);
  });

  test('技术修复必须用同 proposal 的 before 和 after 哈希证明已应用', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-drift-application-'));
    try {
      const changedPath = 'utils/fix.ts';
      const absolutePath = path.join(rootDir, changedPath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, 'export const repaired = true;\n');
      const proposal = buildProductCenterDriftRepairProposal({
        diff: diff([finding('CAPABILITY_DRIFT', 'case-a', 'source:a')]),
        impactedCases: [{ caseId: 'case-a', match: 'source-id', changeIds: ['source:a'] }],
      });
      const entry = proposal.entries[0];
      const afterSha256 = createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
      expect(() => verifyProductCenterDriftRepairApplication({
        rootDir,
        proposal,
        approvedFindings: [entry.approvalKey],
        applications: [],
      })).toThrow(/应用证明缺失/);
      expect(verifyProductCenterDriftRepairApplication({
        rootDir,
        proposal,
        approvedFindings: [entry.approvalKey],
        applications: [{
          findingId: entry.findingId,
          proposalFingerprint: proposal.fingerprint,
          status: 'applied',
          changedFiles: [{
            path: changedPath,
            beforeSha256: '0'.repeat(64),
            afterSha256,
          }],
        }],
      })).toEqual({
        status: 'applied',
        appliedFindingIds: [entry.findingId],
        changedFiles: [changedPath],
      });
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('Proposal 构建入口应接入 workflow 和合同 manifest', async () => {
    const projectRoot = process.cwd();
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    const workflow = fs.readFileSync(
      path.join(projectRoot, 'scripts/run-product-center-drift-workflow.ts'),
      'utf8',
    );
    expect(packageJson.scripts['build:product-center:drift-repair-proposal'])
      .toContain('build-product-center-drift-repair-proposal.ts');
    expect(packageJson.scripts['apply:product-center:drift-repair'])
      .toContain('apply-product-center-drift-repair.ts');
    expect(workflow).toContain('product-center-drift-repair-proposal.json');
    expect(workflow).toContain('evaluateProductCenterDriftProposalApproval');
    expect(workflow.indexOf("'technical-proposal'")).toBeLessThan(workflow.indexOf("'impacted-ui'"));
    expect(workflow.indexOf("'apply-technical-repair'")).toBeLessThan(workflow.indexOf("'impacted-ui'"));
    expect(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-manifests/product-center-contract-tests.json',
    ), 'utf8')).toContain('product-center-drift-repair-proposal.contract.spec.ts');
  });
});

function diff(findings: any[]) {
  return {
    schemaVersion: '1.0.0' as const,
    baselineFingerprint: 'baseline',
    currentFingerprint: 'current',
    changed: findings.length > 0,
    status: findings.length > 0 ? 'review-required' as const : 'clean' as const,
    summary: { baselineCases: 1, currentCases: 1, findings: findings.length },
    findings,
    contractMutationAllowed: false as const,
    businessRuleMutationAllowed: false as const,
  };
}

function finding(code: string, caseId: string, sourceId: string) {
  return {
    code,
    caseId,
    route: '/pp/example',
    sourceIds: [sourceId],
    detail: '脱敏 finding',
    blocking: true,
  };
}
