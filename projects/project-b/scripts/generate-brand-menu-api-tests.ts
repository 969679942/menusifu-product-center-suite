import fs from 'node:fs';
import path from 'node:path';

type Operation = {
  operationKey: string;
  method: string;
  path: string;
  tags?: string[];
};

type Group = {
  id: string;
  name: string;
  operations: Array<{ operation: Operation; index: number }>;
};

const projectRoot = process.cwd();
const catalogPath = path.resolve(projectRoot, '..', 'contracts/api/operations/brand-menu.operations.json');
const generatedDir = path.resolve(projectRoot, 'tests/api/endpoints/brand-menu/generated');
const legacyPath = path.resolve(projectRoot, 'tests/api/endpoints/brand-menu/brand-menu-api.generated.spec.ts');
const operations = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as Operation[];

function quote(value: string): string {
  return JSON.stringify(value);
}

function domainFor(operation: Operation): string {
  const tagValue = operation.tags?.join(' ') ?? '';
  const pathValue = operation.path;
  const tagRules: Array<[string, RegExp]> = [
    ['printing', /打印|档口|打印机/],
    ['localization', /多语言|翻译|可翻译/],
    ['modifiers', /调味|加料|口味|做法/],
    ['bom', /BOM|配方/],
    ['categories', /分类/],
    ['menus', /菜单|菜单页|菜序|导入|区块/],
    ['tags', /标签|角标/],
    ['specs', /规格/],
    ['combo-groups', /套餐/],
    ['nutrition', /营养|过敏/],
    ['ingredients', /原料|原材料/],
    ['media', /图片|文件|分片上传|image/],
    ['tax', /税/],
    ['stores', /门店|品牌门店/],
    ['sync', /同步|下发|推送|分发|调度/],
    ['items', /商品|SKU|库存|渠道|属性/],
    ['system', /系统|内部|Feign|错误/],
  ];
  const pathRules: Array<[string, RegExp]> = [
    ['printing', /print|printer|print-stall/i],
    ['localization', /i18n|language|translation/i],
    ['modifiers', /modifier|addon|global-modifier/i],
    ['combo-groups', /combo|package|section/i],
    ['menus', /menu|sub-menu|import/i],
    ['tags', /tag|corner/i],
    ['specs', /spec/i],
    ['bom', /bom|recipe/i],
    ['sync', /sync|dispatch|pull|push/i],
    ['items', /item|sku/i],
    ['stores', /poi|store|merchant/i],
    ['system', /health|error|internal/i],
  ];
  return tagRules.find(([, pattern]) => pattern.test(tagValue))?.[0]
    ?? pathRules.find(([, pattern]) => pattern.test(pathValue))?.[0]
    ?? 'other';
}

function displayName(domain: string): string {
  const names: Record<string, string> = {
    items: '商品与 SKU', specs: '规格', modifiers: '调味、加料与做法', menus: '菜单与菜单页',
    categories: '分类', tags: '标签与角标', 'combo-groups': '套餐组', bom: '配方与 BOM',
    printing: '打印与档口', sync: '同步与分发', localization: '多语言', nutrition: '营养与过敏原',
    media: '图片与文件', tax: '税务', stores: '门店与 POI', ingredients: '原料',
    system: '系统与内部接口', other: '其他接口',
  };
  return names[domain] ?? domain;
}

function buildGroups(): Group[] {
  const grouped = new Map<string, Group>();
  for (const [index, operation] of operations.entries()) {
    const domain = domainFor(operation);
    const existing = grouped.get(domain);
    if (existing) {
      existing.operations.push({ operation, index });
    } else {
      grouped.set(domain, {
        id: `group-${String(grouped.size + 1).padStart(2, '0')}`,
        name: displayName(domain),
        operations: [{ operation, index }],
      });
    }
  }
  return [...grouped.values()];
}

function testBlock(operation: Operation, index: number): string {
  const number = index + 1;
  return `
  test(
    ${quote(`第 ${String(number).padStart(3, '0')} 条品牌接口测试：${operation.method} ${operation.path}`)},
    async ({ request, merchantCenterAuthEvidence }, testInfo) => {
      const operation = readBrandMenuOperations()[${index}];
      await test.step(${quote(`前置：读取第 ${number} 条接口的文档参数和品牌上下文`)}, async () => {
        expect(operation.operationKey).toBe(${quote(operation.operationKey)});
        expect(operation.method).toBe(${quote(operation.method)});
        expect(operation.path).toBe(${quote(operation.path)});
        expect(buildProbeRequest(operation)).toBeDefined();
      });
      authEvidence ??= merchantCenterAuthEvidence;
      const result = await test.step(${quote(`请求：真实调用 ${operation.method} ${operation.path}`)}, async () => {
        const observed = await probeBrandMenuOperation(request, operation);
        expect(['responded', 'blocked-before-request'], ${quote(`${operation.operationKey} 未完成请求或前置门禁`)}).toContain(observed.outcome);
        if (observed.outcome === 'responded') {
          expect(observed.status, ${quote(`${operation.operationKey} 未获得 HTTP 状态`)}).toBeDefined();
        }
        return observed;
      });
      await test.step(${quote(`断言：记录 ${operation.method} ${operation.path} 的响应状态和分类`)}, async () => {
        expect(result.classification, ${quote(`${operation.operationKey} 响应未分类`)}).toBeDefined();
        const blocked = ['authorization-required', 'route-unavailable', 'entity-fixture-required', 'request-fixture-required'].includes(result.classification ?? '');
        const negativePassed = ['validation-response', 'business-rejection'].includes(result.classification ?? '');
        results.push({
          ...result,
          executionOrder: ${number},
          stepTitle: ${quote(`第 ${number} 步：${operation.method} ${operation.path} 接口测试`)},
          observedState: \`${'${result.status ?? \'preflight\'}'} / \${result.classification}\`,
          finalStatus: result.outcome === 'transport-error'
            ? 'transport-error'
            : blocked
              ? 'blocked'
              : result.classification === 'success'
                ? 'passed'
                : negativePassed
                  ? 'negative-passed'
                  : 'failed',
        });
        testInfo.annotations.push({ type: '接口结果', description: \`${'${result.status ?? \'preflight\'}'} / \${result.classification}\` });
        if (blocked) test.skip(true, result.diagnostic ?? \`\${operation.operationKey} 缺少可恢复的接口测试能力\`);
        expect(result.outcome, ${quote(`${operation.operationKey} 发生传输错误`)}).not.toBe('transport-error');
        expect(result.classification, ${quote(`${operation.operationKey} 返回未归类的服务端错误`)}).not.toBe('unexpected-server-error');
        if (result.classification === 'success') expect(result.businessSuccess).not.toBe(false);
      });
    },
  );`;
}

function shardSource(group: Group): string {
  const blocks = group.operations.map(({ operation, index }) => testBlock(operation, index)).join('\n');
  return `import { expect, test } from '../../../../../fixtures/product-center-api.fixture';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildProbeRequest, probeBrandMenuOperation, readBrandMenuOperations, type BrandMenuProbeResult } from '../../../../../utils/brand-menu-live-probe';

const results: BrandMenuProbeResult[] = [];
let authEvidence: Record<string, unknown> | undefined;

test.describe(${quote(`品牌商品和菜单 API：${group.name}`)}, () => {${blocks}
  test.afterAll(async () => {
    const reportPath = path.resolve(process.cwd(), 'output/brand-menu-api-shards/${group.id}.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({
      generatedAt: new Date().toISOString(), scope: 'brand-menu', shardId: ${quote(group.id)}, shardName: ${quote(group.name)},
      industryExcluded: true, authentication: authEvidence, total: ${group.operations.length}, executed: results.length, results,
    }, null, 2), 'utf8');
  });
});
`;
}

const groups = buildGroups();
fs.rmSync(generatedDir, { recursive: true, force: true });
fs.mkdirSync(generatedDir, { recursive: true });
fs.rmSync(legacyPath, { force: true });

const index = {
  generatedAt: new Date().toISOString(), scope: 'brand-menu', industryExcluded: true,
  total: operations.length, shardCount: groups.length,
  shards: groups.map((group) => ({ shardId: group.id, file: `${group.id}.spec.ts`, name: group.name, total: group.operations.length })),
  operations: operations.map((operation, index) => {
    const group = groups.find((candidate) => candidate.operations.some((item) => item.index === index));
    if (!group) throw new Error(`接口未分配分片: ${operation.operationKey}`);
    return { executionOrder: index + 1, operationKey: operation.operationKey, method: operation.method, path: operation.path, tags: operation.tags ?? [], shardId: group.id, file: `${group.id}.spec.ts` };
  }),
};

for (const group of groups) {
  fs.writeFileSync(path.join(generatedDir, `${group.id}.spec.ts`), shardSource(group), 'utf8');
}
fs.writeFileSync(path.join(generatedDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
console.log(`已生成 ${operations.length} 个静态品牌接口测试，分为 ${groups.length} 个业务域文件：${generatedDir}`);
