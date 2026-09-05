import { createHash } from 'node:crypto';
import type { ProductCenterXmindItemPlan } from './product-center-canonical-item-test-plan';

export type ProductCenterItemCoverageBinding = {
  sectionId: string;
  sectionHeading: string;
  sourceRole: 'prd-functional-scope';
  route: string;
  xmindPathPrefixes: string[][];
};

export type ProductCenterItemSourceCoverage = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-source-coverage';
  status: 'review-required';
  fingerprint: string;
  summary: {
    xmindLeaves: number;
    canonicalCases: number;
    probeCases: number;
    acceptanceCases: 0;
    blockedXmindNodes: number;
    prdSections: number;
    probeSections: number;
    reviewRequiredSections: number;
    blockedSections: number;
    scenarioFamilies: number;
    probeFamilies: number;
    reviewRequiredFamilies: number;
    blockedFamilies: number;
    freshPageRoutes: number;
  };
  sections: Array<{
    sectionId: string;
    sectionHeading: string;
    sourceRole: 'prd-functional-scope';
    sourceVerified: boolean;
    disposition: 'probe' | 'review-required' | 'blocked';
    generationAllowed: false;
    families: Array<{
      familyId: string;
      pathPrefix: string[];
      disposition: 'probe' | 'review-required' | 'blocked';
      canonicalCaseIds: string[];
      reviewableXmindNodeIds: string[];
      blockedXmindNodeIds: string[];
      issues: string[];
    }>;
    canonicalCaseIds: string[];
    reviewableXmindNodeIds: string[];
    blockedXmindNodeIds: string[];
    pageEvidence: Array<{
      id: string;
      route: string;
      verified: boolean;
      observedAt: string;
      releaseFingerprint: string;
      contribution: 'technical-fact';
      businessAssertionEligible: false;
    }>;
    issues: string[];
  }>;
};

export function buildProductCenterItemSourceCoverage(input: {
  plan: ProductCenterXmindItemPlan;
  canonicalCaseIds: readonly string[];
  prdText: string;
  pageRoutes: readonly {
    id: string;
    route: string;
    verified: boolean;
    observedAt?: string;
    releaseFingerprint?: string;
  }[];
  bindings: readonly ProductCenterItemCoverageBinding[];
}): ProductCenterItemSourceCoverage {
  if (input.canonicalCaseIds.length !== input.plan.candidates.length) {
    throw new Error('canonical case 分母必须与 XMind 完整场景一一对应');
  }
  const sections = input.bindings.map((binding) => {
    const prefixes = binding.xmindPathPrefixes.length > 0
      ? binding.xmindPathPrefixes
      : [[]];
    const families = prefixes.map((pathPrefix, familyIndex) => {
      const sourceOnly = pathPrefix.length === 0;
      const canonicalIndexes = sourceOnly ? [] : input.plan.candidates.flatMap((candidate, index) => (
        matchesPrefix(candidate.path, pathPrefix) ? [index] : []
      ));
      const blockedMatches = sourceOnly ? [] : input.plan.blocked.filter((candidate) =>
        matchesPrefix(candidate.path, pathPrefix));
      const reviewable = blockedMatches.filter((candidate) =>
        hasActionAndExpectationFragments(candidate.path));
      const blocked = blockedMatches.filter((candidate) => !reviewable.includes(candidate));
      const disposition = canonicalIndexes.length > 0
        ? 'probe' as const
        : reviewable.length > 0
          ? 'review-required' as const
          : 'blocked' as const;
      return {
        familyId: sourceOnly ? `${binding.sectionId}-source-only` : `${binding.sectionId}-${familyIndex + 1}`,
        pathPrefix,
        disposition,
        canonicalCaseIds: canonicalIndexes.map((index) => input.canonicalCaseIds[index]),
        reviewableXmindNodeIds: reviewable.map((item) => item.nodeId),
        blockedXmindNodeIds: blocked.map((item) => item.nodeId),
        issues: [
          ...(disposition === 'review-required'
            ? ['EXPLICIT_PRECONDITION_OR_STRUCTURE_REVIEW_REQUIRED'] : []),
          ...(disposition === 'blocked' ? ['COMPLETE_EXECUTION_CHAIN_MISSING'] : []),
          ...(disposition === 'probe' ? ['FORMAL_SOURCE_AND_PRIORITY_REVIEW_REQUIRED'] : []),
        ],
      };
    });
    const canonicalCaseIds = unique(families.flatMap((family) => family.canonicalCaseIds));
    const reviewableXmindNodeIds = unique(families.flatMap((family) => family.reviewableXmindNodeIds));
    const blockedXmindNodeIds = unique(families.flatMap((family) => family.blockedXmindNodeIds));
    const sourceVerified = input.prdText.includes(binding.sectionHeading);
    const pageEvidence = input.pageRoutes
      .filter((route) => route.route === binding.route)
      .map((route) => ({
        id: route.id,
        route: route.route,
        verified: route.verified,
        observedAt: route.observedAt ?? '',
        releaseFingerprint: route.releaseFingerprint ?? '',
        contribution: 'technical-fact' as const,
        businessAssertionEligible: false as const,
      }));
    const disposition = families.some((family) => family.disposition === 'probe')
      ? 'probe' as const
      : families.some((family) => family.disposition === 'review-required')
        ? 'review-required' as const
        : 'blocked' as const;
    const issues = [
      ...(!sourceVerified ? ['PRD_SECTION_NOT_VERIFIED'] : []),
      ...(pageEvidence.some((item) => item.verified) ? [] : ['CURRENT_PAGE_ROUTE_NOT_VERIFIED']),
      ...(disposition === 'review-required' ? ['EXPLICIT_PRECONDITION_OR_STRUCTURE_REVIEW_REQUIRED'] : []),
      ...(disposition === 'blocked' ? ['COMPLETE_EXECUTION_CHAIN_MISSING'] : []),
      ...(disposition === 'probe' ? ['FORMAL_SOURCE_AND_PRIORITY_REVIEW_REQUIRED'] : []),
    ];
    return {
      sectionId: binding.sectionId,
      sectionHeading: binding.sectionHeading,
      sourceRole: binding.sourceRole,
      sourceVerified,
      disposition,
      generationAllowed: false as const,
      families,
      canonicalCaseIds,
      reviewableXmindNodeIds,
      blockedXmindNodeIds,
      pageEvidence,
      issues,
    };
  });
  const families = sections.flatMap((section) => section.families);
  const value = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-source-coverage' as const,
    status: 'review-required' as const,
    summary: {
      xmindLeaves: input.plan.summary.leaves,
      canonicalCases: input.canonicalCaseIds.length,
      probeCases: input.canonicalCaseIds.length,
      acceptanceCases: 0 as const,
      blockedXmindNodes: input.plan.blocked.length,
      prdSections: sections.length,
      probeSections: sections.filter((item) => item.disposition === 'probe').length,
      reviewRequiredSections: sections.filter((item) => item.disposition === 'review-required').length,
      blockedSections: sections.filter((item) => item.disposition === 'blocked').length,
      scenarioFamilies: families.length,
      probeFamilies: families.filter((item) => item.disposition === 'probe').length,
      reviewRequiredFamilies: families.filter((item) => item.disposition === 'review-required').length,
      blockedFamilies: families.filter((item) => item.disposition === 'blocked').length,
      freshPageRoutes: new Set(input.pageRoutes.filter((item) => item.verified)
        .map((item) => item.route)).size,
    },
    sections,
  };
  return {
    ...value,
    fingerprint: createHash('sha256').update(stableStringify(value)).digest('hex'),
  };
}

export function validateProductCenterItemSourceCoverage(
  coverage: ProductCenterItemSourceCoverage,
): string[] {
  const issues: string[] = [];
  if (coverage.summary.prdSections !== coverage.sections.length) issues.push('PRD_SECTION_DENOMINATOR_MISMATCH');
  if (new Set(coverage.sections.map((item) => item.sectionId)).size !== coverage.sections.length) {
    issues.push('PRD_SECTION_ID_DUPLICATE');
  }
  for (const section of coverage.sections) {
    if (!section.sectionHeading.trim() || !section.sourceVerified) {
      issues.push(`${section.sectionId}:PRD_SOURCE_REQUIRED`);
    }
    if (section.sourceRole !== 'prd-functional-scope' || section.generationAllowed) {
      issues.push(`${section.sectionId}:SOURCE_ROLE_INVALID`);
    }
    if (section.pageEvidence.some((item) => item.businessAssertionEligible)) {
      issues.push(`${section.sectionId}:PAGE_FACT_BUSINESS_ASSERTION_FORBIDDEN`);
    }
    if (section.disposition === 'probe' && section.canonicalCaseIds.length === 0) {
      issues.push(`${section.sectionId}:PROBE_CANONICAL_REQUIRED`);
    }
    if (section.disposition === 'review-required' && section.reviewableXmindNodeIds.length === 0) {
      issues.push(`${section.sectionId}:REVIEWABLE_XMIND_SOURCE_REQUIRED`);
    }
    for (const family of section.families) {
      if (family.disposition === 'probe' && family.canonicalCaseIds.length === 0) {
        issues.push(`${family.familyId}:PROBE_CANONICAL_REQUIRED`);
      }
      if (family.disposition === 'review-required' && family.reviewableXmindNodeIds.length === 0) {
        issues.push(`${family.familyId}:REVIEWABLE_XMIND_SOURCE_REQUIRED`);
      }
    }
  }
  return issues;
}

function matchesPrefix(path: readonly string[], prefix: readonly string[]): boolean {
  return prefix.every((segment, index) => path[index] === segment);
}

function unique(items: readonly string[]): string[] {
  return [...new Set(items)];
}

function hasActionAndExpectationFragments(path: readonly string[]): boolean {
  if (path.length < 2) return false;
  const [actions, expected] = path.slice(-2);
  return hasNumberedLine(actions) && hasNumberedLine(expected);
}

function hasNumberedLine(value: string): boolean {
  return value.split(/\r?\n/).some((line) => /^\s*\d+(?:\.\d+)*[.、:]?\s*\S+/.test(line));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
