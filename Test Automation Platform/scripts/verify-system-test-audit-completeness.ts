import fs from 'node:fs';
import path from 'node:path';

type AuditCompletenessDocument = {
  auditCompleteness?: {
    schemaVersion?: string;
    summary?: {
      planned?: number;
      auditEligible?: number;
      classifiedExclusions?: number;
      auditComplete?: number;
      auditIncomplete?: number;
      byMissingCode?: Record<string, number>;
      invariantSatisfied?: boolean;
    };
  };
};

export function verifySystemTestAuditCompleteness(filePath: string): {
  ok: boolean;
  exitCode: 0 | 2;
  status: 'audit-complete' | 'audit-incomplete';
  diagnostics: string[];
} {
  const document = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8')) as AuditCompletenessDocument;
  const summary = document.auditCompleteness?.summary;
  const diagnostics: string[] = [];
  if (document.auditCompleteness?.schemaVersion !== '1.1.0' || !summary) diagnostics.push('AUDIT_CONTRACT_1_1_REQUIRED');
  if (summary && summary.planned !== Number(summary.auditEligible) + Number(summary.classifiedExclusions)) diagnostics.push('AUDIT_PLANNED_INVARIANT_FAILED');
  if (summary && summary.auditEligible !== Number(summary.auditComplete) + Number(summary.auditIncomplete)) diagnostics.push('AUDIT_ELIGIBLE_INVARIANT_FAILED');
  if (summary?.invariantSatisfied !== true) diagnostics.push('AUDIT_INVARIANT_NOT_SATISFIED');
  if (Number(summary?.auditIncomplete ?? 0) > 0) {
    diagnostics.push(`AUDIT_INCOMPLETE:${JSON.stringify(summary?.byMissingCode ?? {})}`);
  }
  const ok = diagnostics.length === 0;
  return { ok, exitCode: ok ? 0 : 2, status: ok ? 'audit-complete' : 'audit-incomplete', diagnostics };
}

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

if (require.main === module) {
  const ledger = argument('ledger');
  if (!ledger) throw new Error('用法：--ledger=<evidence-ledger.json>');
  const result = verifySystemTestAuditCompleteness(ledger);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.exitCode;
}
