import { expect, test } from '@playwright/test';
import { evaluateProductCenterRuntimeAcceptance } from '../../automation/recipe/product-center-runtime-acceptance';

const baseInput = {
  collectionId: 'item-intake',
  fingerprint: 'expected-fingerprint',
  recipes: [{ recipeId: 'recipe-1', claimIds: ['claim:case-1:action:1'] }],
  feedback: {
    fingerprint: 'expected-fingerprint',
    entries: [{ recipeId: 'recipe-1', caseId: 'TC-005', status: 'passed' }],
  },
  evidence: {
    fingerprint: 'expected-fingerprint',
    entries: [{
      recipeId: 'recipe-1',
      caseId: 'TC-005',
      expectedClaimIds: ['claim:case-1:action:1'],
      verifiedClaimIds: ['claim:case-1:action:1'],
      claimCoverageComplete: true,
      sidebarEntryVerified: true,
    }],
  },
  safety: {
    incompleteCheckpoints: 0,
    sensitiveFindings: 0,
    authStateArtifacts: 0,
    forbiddenPatterns: 0,
  },
} as const;

test.describe('商品中心 Recipe 原子运行验收合同', () => {
  test('全部运行证据和安全门禁同时通过才可验收', async () => {
    const result = evaluateProductCenterRuntimeAcceptance(baseInput);

    expect(result.accepted).toBe(true);
    expect(result.acceptedCaseIds).toEqual(['TC-005']);
    expect(result.issues).toEqual([]);
  });

  test('缺少侧边栏证据时不得以技术运行通过晋级', async () => {
    const result = evaluateProductCenterRuntimeAcceptance({
      ...baseInput,
      evidence: {
        ...baseInput.evidence,
        entries: [{ ...baseInput.evidence.entries[0], sidebarEntryVerified: false }],
      },
    });

    expect(result.accepted).toBe(false);
    expect(result.acceptedCaseIds).toEqual([]);
    expect(result.issues).toContain('SIDEBAR_ENTRY_NOT_VERIFIED:recipe-1');
  });

  test('任一安全门禁失败时整批不得原子验收', async () => {
    const result = evaluateProductCenterRuntimeAcceptance({
      ...baseInput,
      safety: { ...baseInput.safety, incompleteCheckpoints: 1 },
    });

    expect(result.accepted).toBe(false);
    expect(result.issues).toContain('INCOMPLETE_CHECKPOINTS:1');
  });

  test('静态完整标志不得绕过 Claim 集合不一致', async () => {
    const result = evaluateProductCenterRuntimeAcceptance({
      ...baseInput,
      evidence: {
        ...baseInput.evidence,
        entries: [{
          ...baseInput.evidence.entries[0],
          verifiedClaimIds: ['claim:unknown:action:1', 'claim:unknown:action:1'],
          claimCoverageComplete: true,
        }],
      },
    });

    expect(result.accepted).toBe(false);
    expect(result.issues).toContain('CLAIM_VERIFICATION_MISMATCH:recipe-1');
    expect(result.issues).toContain('DUPLICATE_VERIFIED_CLAIMS:recipe-1');
  });

  test('集合中其他用例失败时应保留已完整通过用例的独立验收结果', async () => {
    const result = evaluateProductCenterRuntimeAcceptance({
      ...baseInput,
      recipes: [
        ...baseInput.recipes,
        { recipeId: 'recipe-2', claimIds: ['claim:case-2:action:1'] },
      ],
      feedback: {
        ...baseInput.feedback,
        entries: [
          ...baseInput.feedback.entries,
          { recipeId: 'recipe-2', caseId: 'TC-006', status: 'timedOut' },
        ],
      },
      evidence: {
        ...baseInput.evidence,
        entries: [
          ...baseInput.evidence.entries,
          {
            recipeId: 'recipe-2',
            caseId: 'TC-006',
            expectedClaimIds: ['claim:case-2:action:1'],
            verifiedClaimIds: [],
            claimCoverageComplete: false,
            sidebarEntryVerified: false,
          },
        ],
      },
    });

    expect(result.accepted).toBe(false);
    expect(result.acceptedCaseIds).toEqual(['TC-005']);
    expect(result.caseAcceptance).toEqual([
      expect.objectContaining({ caseId: 'TC-005', accepted: true, issues: [] }),
      expect.objectContaining({ caseId: 'TC-006', accepted: false }),
    ]);
  });
});
