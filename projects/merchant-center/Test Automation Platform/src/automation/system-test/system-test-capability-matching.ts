export type SystemTestCapabilityMatchCase = {
  caseId: string;
  requiredCapabilityIds: readonly string[];
  excluded?: boolean;
};

export type SystemTestCapabilityMatchResult = {
  caseId: string;
  requiredCapabilityIds: string[];
  missingCapabilityIds: string[];
  status: 'matched' | 'missing-declaration' | 'missing-environment' | 'excluded';
};

export type SystemTestCapabilityMatchReport = {
  schemaVersion: '1.0.0';
  applicationId: string;
  environmentId: string;
  registeredCapabilityIds: string[];
  cases: SystemTestCapabilityMatchResult[];
  summary: {
    total: number;
    matched: number;
    missingDeclaration: number;
    missingEnvironment: number;
    excluded: number;
  };
};

export function buildSystemTestCapabilityMatchReport(input: {
  applicationId: string;
  environmentId: string;
  registeredCapabilityIds: readonly string[];
  cases: readonly SystemTestCapabilityMatchCase[];
}): SystemTestCapabilityMatchReport {
  const registeredCapabilityIds = unique(input.registeredCapabilityIds);
  const registered = new Set(registeredCapabilityIds);
  const cases = input.cases.map((item) => {
    const requiredCapabilityIds = unique(item.requiredCapabilityIds);
    const missingCapabilityIds = requiredCapabilityIds.filter((id) => !registered.has(id));
    const status: SystemTestCapabilityMatchResult['status'] = item.excluded
      ? 'excluded'
      : requiredCapabilityIds.length === 0
        ? 'missing-declaration'
        : missingCapabilityIds.length > 0
          ? 'missing-environment'
          : 'matched';
    return { caseId: item.caseId, requiredCapabilityIds, missingCapabilityIds, status };
  }).sort((left, right) => left.caseId.localeCompare(right.caseId));
  return {
    schemaVersion: '1.0.0',
    applicationId: input.applicationId,
    environmentId: input.environmentId,
    registeredCapabilityIds,
    cases,
    summary: {
      total: cases.length,
      matched: cases.filter((item) => item.status === 'matched').length,
      missingDeclaration: cases.filter((item) => item.status === 'missing-declaration').length,
      missingEnvironment: cases.filter((item) => item.status === 'missing-environment').length,
      excluded: cases.filter((item) => item.status === 'excluded').length,
    },
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}
