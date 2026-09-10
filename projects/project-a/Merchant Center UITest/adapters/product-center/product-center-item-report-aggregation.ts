import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { publishImmutableArtifact } from '../../../Test Automation Platform/src/utils/immutable-artifact';

export type ItemReportUnit = {
  reportPath: string;
  unitId: string;
  selectedCaseIds: readonly string[];
  shardIndex: number;
  shardCount: number;
};

/** Preserve each runner's real result tree; this view never invents a case result or pass. */
export function publishItemReportAggregate(
  rootDir: string,
  outputPath: string,
  reportUnits: readonly (string | ItemReportUnit)[],
) {
  const units = reportUnits.map((item, index): ItemReportUnit => typeof item === 'string'
    ? { reportPath: item, unitId: `legacy-${index + 1}`, selectedCaseIds: [], shardIndex: 1, shardCount: 1 }
    : item);
  const inputs=units.map(unit=>{
    const reportPath = unit.reportPath;
    const absolute=path.resolve(rootDir,reportPath);
    if(!fs.existsSync(absolute))throw Error('ITEM_PROFILE_REPORT_MISSING:'+reportPath);
    const bytes=fs.readFileSync(absolute),report=JSON.parse(bytes.toString('utf8'));
    if(!Array.isArray(report.suites))throw Error('ITEM_PROFILE_REPORT_INVALID:'+reportPath);
    const relative=path.relative(rootDir,absolute).replaceAll(path.sep,'/');
    publishImmutableArtifact({outputRoot:rootDir,relativePath:relative,content:bytes,reason:'preserve-item-profile-result-before-aggregate'});
    return { ...unit, reportPath:relative,sha256:createHash('sha256').update(bytes).digest('hex'),report,
      terminalCaseIds: readTerminalCaseIds(report) };
  });
  const expectedCaseIds = [...new Set(units.flatMap((item) => [...item.selectedCaseIds]))].sort();
  const terminalCaseIds = [...new Set(inputs.flatMap((item) => item.terminalCaseIds))].sort();
  const missingCaseIds = expectedCaseIds.filter((caseId) => !terminalCaseIds.includes(caseId));
  const unexpectedCaseIds = terminalCaseIds.filter((caseId) => !expectedCaseIds.includes(caseId));
  if (expectedCaseIds.length > 0 && missingCaseIds.length > 0) {
    throw Error(`ITEM_PROFILE_TERMINAL_CASE_MISSING:${missingCaseIds.join(',')}`);
  }
  if (expectedCaseIds.length > 0 && unexpectedCaseIds.length > 0) {
    throw Error(`ITEM_PROFILE_UNEXPECTED_CASE:${unexpectedCaseIds.join(',')}`);
  }
  const aggregate={
    suites:inputs.flatMap(input=>input.report.suites),
    errors:inputs.flatMap(input=>input.report.errors??[]),
    summary:{selected:expectedCaseIds.length,terminal:terminalCaseIds.length,missingCaseIds,unexpectedCaseIds},
    sourceReports:inputs.map(({report,...reference})=>reference),
  };
  if (expectedCaseIds.length > 0 && aggregate.suites.length === 0) throw Error('ITEM_PROFILE_REPORT_EMPTY');
  publishImmutableArtifact({outputRoot:rootDir,relativePath:path.relative(rootDir,path.resolve(rootDir,outputPath)).replaceAll(path.sep,'/'),content:JSON.stringify(aggregate,null,2),reason:'index-distinct-item-profile-result-trees-with-original-hashes'});
  return aggregate;
}

function readTerminalCaseIds(report: { suites?: unknown[] }): string[] {
  const caseIds: string[] = [];
  const visit = (suites: unknown[]): void => {
    for (const rawSuite of suites) {
      const suite = rawSuite as { suites?: unknown[]; specs?: Array<{ title?: string; tests?: Array<{ status?: string; annotations?: Array<{ type?: string; description?: string }>; results?: Array<{ status?: string }> }> }> };
      visit(suite.suites ?? []);
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const terminal = (test.results ?? []).some((result) => (
            ['passed', 'failed', 'timedOut', 'interrupted', 'skipped'].includes(result.status ?? '')
          ));
          if (!terminal) continue;
          const annotated = (test.annotations ?? []).find((annotation) => (
            ['canonical-case-id', 'group-case-id', 'case-id'].includes(annotation.type ?? '')
          ))?.description;
          const caseId = annotated ?? spec.title?.match(/TC-[A-Z0-9-]+/)?.[0];
          if (caseId) caseIds.push(caseId);
        }
      }
    }
  };
  visit(report.suites ?? []);
  return [...new Set(caseIds)].sort();
}
