import fs from 'node:fs';
import path from 'node:path';

export type Recipe = {
  caseId: string;
  title: string;
  action?: string;
  capabilities?: Array<{ id?: string }>;
  assertions?: Array<{ adapterId?: string }>;
};

export type SeasoningCoverageFinding = {
  caseId: string;
  title: string;
  severity: 'P0' | 'P1';
  code: 'MUTATION_BOUND_TO_STATIC' | 'SCENARIO_REUSES_MINIMAL_CREATE' | 'MUTATION_ACTION_DECLARED_READ';
  message: string;
};

const mutationWords = /新增|创建|编辑|删除|保存|移动|排序|下发|重复|边界|取消|批量|覆盖|替换|纠正|落库|上限/;
const readOnlyObservationWords = /页面|列表|字段|控件|入口|按钮|明细|展示|查询|筛选|搜索|重置|可见|置灰|高亮可用|查看|符合.*规则/;
const staticCapability = 'merchant-center.seasoning.static-contract';
const minimalCreateCapability = 'merchant-center.seasoning.create-minimal';

export function describesMutation(title: string): boolean {
  if (!mutationWords.test(title)) return false;
  if (readOnlyObservationWords.test(title) && !/保存|删除|编辑|创建|新增.*成功|失败|重复|排序.*保存|下发.*成功|覆盖|替换|纠正|落库|上限/.test(title)) {
    return false;
  }
  return true;
}

export function auditSeasoningCaseCoverage(recipes: readonly Recipe[]): SeasoningCoverageFinding[] {
  const findings: SeasoningCoverageFinding[] = [];
  for (const recipe of recipes) {
    const capabilities = new Set((recipe.capabilities ?? []).map((item) => item.id).filter(Boolean));
    const mutationTitle = describesMutation(recipe.title);
    if (mutationTitle && recipe.action === 'read') {
      findings.push({
        caseId: recipe.caseId,
        title: recipe.title,
        severity: 'P0',
        code: 'MUTATION_ACTION_DECLARED_READ',
        message: '标题描述写入、变更或负向操作，但 recipe action 仍为 read。',
      });
    }
    if (capabilities.has(staticCapability) && mutationTitle) {
      findings.push({
        caseId: recipe.caseId,
        title: recipe.title,
        severity: 'P0',
        code: 'MUTATION_BOUND_TO_STATIC',
        message: '写入、变更或负向场景绑定到只读静态页面合同，禁止作为业务覆盖。',
      });
    }
    if (capabilities.has(minimalCreateCapability)
      && /全部字段|已有调味组|不同调味组|100字符|边界/.test(recipe.title)) {
      findings.push({
        caseId: recipe.caseId,
        title: recipe.title,
        severity: 'P1',
        code: 'SCENARIO_REUSES_MINIMAL_CREATE',
        message: '场景要求完整字段、既有组、跨组同名或边界数据，却复用最小创建能力。',
      });
    }
  }
  return findings.sort((left, right) => left.caseId.localeCompare(right.caseId) || left.code.localeCompare(right.code));
}

function main(): void {
  const recipesPath = path.resolve(__dirname, '../systems/merchant-center-product-center-seasoning/recipes.json');
  const outputPath = path.resolve(__dirname, '../output/system-test/merchant-center-product-center-seasoning/seasoning-case-coverage-audit.json');
  const recipes = (JSON.parse(fs.readFileSync(recipesPath, 'utf8')) as { recipes: Recipe[] }).recipes;
  const findings = auditSeasoningCaseCoverage(recipes);
  const report = {
    schemaVersion: '1.0.0',
    reportId: 'merchant-center-product-center-seasoning-case-coverage',
    generatedAt: new Date().toISOString(),
    status: findings.length === 0 ? 'pass' : 'incomplete',
    summary: { totalRecipes: recipes.length, findings: findings.length },
    findings,
  };
  if (process.argv.includes('--write')) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`调味绑定覆盖审计：${outputPath}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
  if (findings.length > 0 && process.argv.includes('--strict')) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) main();
