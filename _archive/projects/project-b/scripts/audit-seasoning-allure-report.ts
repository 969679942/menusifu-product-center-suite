import fs from 'node:fs';
import path from 'node:path';
import {
  auditAllureBusinessReport,
  isBusinessOperationStepTitle,
  type AllureBusinessReportResult,
  type AllureReportIntegrityFindingCode,
  type AllureReportStep,
} from '../../../Test Automation Platform/src/reporters/allure-report-integrity';
import { createMerchantCenterAllureIntegrityPolicy } from '../adapters/test-automation-platform/allure-reporting';
import { describesMutation, type Recipe, auditSeasoningCaseCoverage } from './audit-seasoning-case-coverage';

export type AllureReportResult = AllureBusinessReportResult & {
  name?: string;
  status?: string;
  labels?: Array<{ name?: string; value?: string }>;
  steps?: AllureReportStep[];
};

export type SeasoningAllureReportAudit = {
  schemaVersion: '1.0.0';
  reportId: 'merchant-center-product-center-seasoning-allure-integrity';
  generatedAt: string;
  status: 'pass' | 'incomplete';
  summary: {
    expectedCases: number;
    resultCases: number;
    passedCases: number;
    incompletePassedCases: number;
    findings: number;
  };
  findings: Array<{
    caseId: string;
    title: string;
    code: 'PASSED_WITH_INCOMPLETE_BINDING' | 'MISSING_BUSINESS_OPERATION_STEP' | 'RESULT_CASE_NOT_FOUND' | AllureReportIntegrityFindingCode;
    message: string;
  }>;
};

export function auditSeasoningAllureResults(
  recipes: readonly Recipe[],
  results: readonly AllureReportResult[],
): SeasoningAllureReportAudit['findings'] {
  const findings: SeasoningAllureReportAudit['findings'] = [];
  const resultsByCaseId = new Map<string, AllureReportResult>();
  for (const result of results) {
    const caseId = result.labels?.find((label) => label.name === 'tag' && label.value?.startsWith('case-'))?.value?.slice(5);
    if (caseId) resultsByCaseId.set(caseId, result);
  }

  for (const recipe of recipes) {
    const result = resultsByCaseId.get(recipe.caseId);
    if (!result) {
      findings.push({
        caseId: recipe.caseId,
        title: recipe.title,
        code: 'RESULT_CASE_NOT_FOUND',
        message: 'Allure 结果缺少当前正式用例，不能以历史结果补齐执行收据。',
      });
      continue;
    }
    for (const finding of auditAllureBusinessReport(result, createMerchantCenterAllureIntegrityPolicy())) {
      findings.push({
        caseId: recipe.caseId,
        title: recipe.title,
        code: finding.code,
        message: `${finding.message} 位置：${finding.path}`,
      });
    }
    if (result.status !== 'passed') continue;
    const coverageFinding = auditSeasoningCaseCoverage([recipe]).length > 0;
    if (coverageFinding) {
      findings.push({
        caseId: recipe.caseId,
        title: recipe.title,
        code: 'PASSED_WITH_INCOMPLETE_BINDING',
        message: 'Allure 显示通过，但当前用例绑定审计不完整；该结果只能作为历史证据。',
      });
    }
    if (describesMutation(recipe.title) && !flattenStepNames(result.steps).some(isBusinessOperationStepTitle)) {
      findings.push({
        caseId: recipe.caseId,
        title: recipe.title,
        code: 'MISSING_BUSINESS_OPERATION_STEP',
        message: '变更语义用例的 Test body 缺少业务操作步骤，不能证明执行了真实业务动作。',
      });
    }
  }
  return findings.sort((left, right) => left.caseId.localeCompare(right.caseId) || left.code.localeCompare(right.code));
}

function main(): void {
  const resultsDir = path.resolve(readArg('--results'));
  const recipesPath = path.resolve(readArg('--recipes'));
  const outputPath = path.resolve(readArg('--output'));
  const selectedCaseIds = new Set(readOptionalCsvArg('--case-ids'));
  const results = fs.readdirSync(resultsDir)
    .filter((name) => name.endsWith('-result.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(resultsDir, name), 'utf8')) as AllureReportResult);
  const recipes = (JSON.parse(fs.readFileSync(recipesPath, 'utf8')) as { recipes: Recipe[] }).recipes
    .filter((recipe) => selectedCaseIds.size === 0 || selectedCaseIds.has(recipe.caseId));
  const findings = auditSeasoningAllureResults(recipes, results);
  const passedCases = results.filter((result) => result.status === 'passed').length;
  const report: SeasoningAllureReportAudit = {
    schemaVersion: '1.0.0',
    reportId: 'merchant-center-product-center-seasoning-allure-integrity',
    generatedAt: new Date().toISOString(),
    status: findings.length === 0 ? 'pass' : 'incomplete',
    summary: {
      expectedCases: recipes.length,
      resultCases: results.length,
      passedCases,
      incompletePassedCases: findings.filter((finding) => finding.code === 'PASSED_WITH_INCOMPLETE_BINDING').length,
      findings: findings.length,
    },
    findings,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`调味 Allure 完整性审计：${outputPath}\n`);
  if (findings.length > 0 && process.argv.includes('--strict')) process.exitCode = 1;
}

function flattenStepNames(steps: readonly AllureReportStep[] = [], output: string[] = []): string[] {
  for (const step of steps) {
    if (step.name) output.push(step.name);
    flattenStepNames(step.steps, output);
  }
  return output;
}

function readArg(name: string): string {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`缺少参数：${name}=...`);
  return value;
}

function readOptionalCsvArg(name: string): string[] {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  return value ? [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))] : [];
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) main();
