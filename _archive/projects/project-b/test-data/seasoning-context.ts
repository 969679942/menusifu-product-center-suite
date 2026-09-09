import os from 'node:os';
import path from 'node:path';

export type SeasoningContextProfile = 'single-store-000407' | 'multi-store-000420';

export type SeasoningContext = {
  profile: SeasoningContextProfile;
  merchant: string;
  brandId: string;
  storageStatePath: string;
  requiresPoiSelection: boolean;
  poiId?: string;
  poiName?: string;
  identityProbePath: string;
};

const contexts: Record<SeasoningContextProfile, SeasoningContext> = {
  'single-store-000407': {
    profile: 'single-store-000407',
    merchant: 'Menusifu SCH Restaurant',
    brandId: '000407',
    storageStatePath: path.join(os.tmpdir(), 'menusifu-merchant-center-system-test-auth', 'seasoning-single-store-000407.json'),
    requiresPoiSelection: false,
    identityProbePath: '/pp/brand/seasoning/list',
  },
  'multi-store-000420': {
    profile: 'multi-store-000420',
    merchant: '23918',
    brandId: '000420',
    storageStatePath: path.join(os.tmpdir(), 'menusifu-merchant-center-system-test-auth', 'seasoning-multi-store-000420.json'),
    requiresPoiSelection: true,
    poiId: 'M000023918',
    poiName: 'Ces test',
    identityProbePath: '/pp/brand/seasoning/template',
  },
};

export function resolveSeasoningContext(
  profile = (process.env.SYSTEM_TEST_EXECUTION_CONTEXT_PROFILE || process.env.MC_SEASONING_CONTEXT) as SeasoningContextProfile | undefined,
): SeasoningContext {
  const selected = profile || (process.env.MC_BRAND_ID === '000420' ? 'multi-store-000420' : 'single-store-000407');
  const context = contexts[selected];
  if (!context) throw new Error(`未知调味执行上下文：${selected}`);
  if (process.env.MC_BRAND_ID && process.env.MC_BRAND_ID !== context.brandId) {
    throw new Error(`调味上下文 Brand ID 冲突：profile=${context.profile}; env=${process.env.MC_BRAND_ID}`);
  }
  return context;
}

export function contextForCase(caseId: string): SeasoningContext {
  if (/^TC-FLV-TPL-(?!006)/.test(caseId) || /^TC-FLV-XMOD-/.test(caseId) || caseId === 'TC-FLV-SEA-043') {
    return contexts['multi-store-000420'];
  }
  return contexts['single-store-000407'];
}
