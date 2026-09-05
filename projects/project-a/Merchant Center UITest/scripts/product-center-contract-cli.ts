import fs from 'node:fs';
import path from 'node:path';
import { buildProductCenterReleaseRecord } from '../utils/product-center-contract-maintenance';
import { validateProductCenterTestContract, type EvidenceRecord, type ProductCenterTestContract } from '../utils/product-center-test-contract';

type RecordReference = {
  key: string;
  id: string;
  collection: string;
  moduleIds: string[];
  route?: string;
  entity?: string;
};

const projectRoot = path.resolve(__dirname, '..');
const contractDirectory = path.join(projectRoot, 'contracts/product-center');
const generatedDirectory = path.join(contractDirectory, 'generated');
const indexDirectory = path.join(generatedDirectory, 'indexes');
const moduleDirectory = path.join(generatedDirectory, 'modules');

main();

function main(): void {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'help' || !command) return printHelp();
  if (command === 'query') return runQuery(args);
  if (command === 'review') return runReview(args);
  if (command === 'impact') return runImpact(args);
  if (command === 'promote') return runPromote(args);
  throw new Error('用法：query|review|impact|promote，执行 npm run contract:help 查看示例');
}

function printHelp(): void {
  process.stdout.write([
    '商品中心合同命令：',
    '  npm run contract:query -- --route /pp/brand/category [--full]',
    '  npm run contract:query -- --module brand-seasoning',
    '  npm run contract:query -- --entity 商品分类',
    '  npm run contract:query -- --operation "brand-menu:GET /ops-brand/brand-categories/treeList"',
    '  npm run contract:review -- --priority P0',
    '  npm run contract:impact -- --route /pp/brand/category',
    '  npm run contract:promote -- --version 1.0.0 --reviewed-by 审核人 --note 说明',
    '',
  ].join('\n'));
}

function runQuery(args: string[]): void {
  const options = parseOptions(args);
  const query = selectQuery(options);
  const references = resolveReferences(query);
  const full = options.full === 'true';
  const result = full
    ? { query, count: references.length, records: loadRecords(references) }
    : { query, count: references.length, references };
  writeOutput(result, options.output);
}

function runReview(args: string[]): void {
  const options = parseOptions(args);
  const review = readJson<{ items: Array<Record<string, unknown>> }>(path.join(contractDirectory, 'product-center-rule-review.json'));
  const items = review.items.filter((item) =>
    (!options.priority || item.priority === options.priority)
    && (!options.category || item.category === options.category)
    && (!options.entity || item.entity === options.entity)
    && (!options.route || item.route === options.route),
  );
  writeOutput({ filters: options, count: items.length, items }, options.output);
}

function runImpact(args: string[]): void {
  const options = parseOptions(args);
  const diff = readJson<{
    summary: unknown;
    changes: Array<Record<string, unknown>>;
    impactedRoutes: string[];
    impactedCases: string[];
  }>(path.join(contractDirectory, 'product-center-contract-diff.json'));
  const changes = diff.changes.filter((change) =>
    (!options.route || change.route === options.route)
    && (!options.id || change.id === options.id),
  );
  writeOutput({ metadataChanged: diff.metadataChanged, summary: diff.summary, changes, impactedRoutes: diff.impactedRoutes, impactedCases: diff.impactedCases }, options.output);
}

function runPromote(args: string[]): void {
  const options = parseOptions(args);
  const reviewedBy = requiredOption(options, 'reviewed-by');
  const version = requiredOption(options, 'version');
  const contractPath = path.join(contractDirectory, 'product-center-test-contract.json');
  const contract = readJson<ProductCenterTestContract>(contractPath);
  const validationErrors = validateProductCenterTestContract(contract);
  if (validationErrors.length > 0) throw new Error(`合同校验失败：${JSON.stringify(validationErrors)}`);
  const traceability = readJson<{ complete: boolean; stageGaps: { requirement: number; apiMapping: number } }>(
    path.join(contractDirectory, 'product-center-traceability.json'),
  );
  if (!traceability.complete || traceability.stageGaps.requirement > 0 || traceability.stageGaps.apiMapping > 0) {
    throw new Error('追溯门禁未通过，禁止提升基线');
  }
  const release = buildProductCenterReleaseRecord(contract, {
    reviewedBy,
    version,
    note: options.note,
  });
  const reviewDirectory = path.join(contractDirectory, 'reviews');
  const historyPath = path.join(reviewDirectory, 'product-center-release-history.json');
  fs.mkdirSync(reviewDirectory, { recursive: true });
  const history = fs.existsSync(historyPath) ? readJson<unknown[]>(historyPath) : [];
  if (!history.some((item) => isSameRelease(item, release.version, release.sourceFingerprint))) history.push(release);
  writeJson(historyPath, history);
  fs.copyFileSync(contractPath, path.join(contractDirectory, 'snapshots/product-center-baseline.json'));
  writeOutput({ promoted: true, release }, options.output);
}

function selectQuery(options: Record<string, string>): { kind: string; value: string } {
  const candidates = [
    ['module', options.module],
    ['route', options.route],
    ['entity', options.entity],
    ['id', options.id],
    ['operation', options.operation],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (candidates.length !== 1) throw new Error('query 必须且只能指定 module、route、entity、id、operation 中的一项');
  return { kind: candidates[0][0], value: candidates[0][1] };
}

function resolveReferences(query: { kind: string; value: string }): RecordReference[] {
  if (query.kind === 'module') {
    const index = readJson<Record<string, RecordReference[]>>(path.join(indexDirectory, 'byModule.json'));
    return index[query.value] ?? [];
  }
  if (query.kind === 'route') {
    const index = readJson<Record<string, { records: RecordReference[] }>>(path.join(indexDirectory, 'byRoute.json'));
    return index[query.value]?.records ?? [];
  }
  if (query.kind === 'entity') {
    const index = readJson<Record<string, { records: RecordReference[] }>>(path.join(indexDirectory, 'byEntity.json'));
    return index[query.value]?.records ?? [];
  }
  if (query.kind === 'operation') {
    const index = readJson<Record<string, { record: RecordReference }>>(path.join(indexDirectory, 'byApiOperation.json'));
    return index[query.value] ? [index[query.value].record] : [];
  }
  const index = readJson<Record<string, RecordReference>>(path.join(indexDirectory, 'byId.json'));
  return Object.values(index).filter((reference) => reference.key === query.value || reference.id === query.value);
}

function loadRecords(references: RecordReference[]): EvidenceRecord[] {
  const moduleCache = new Map<string, Record<string, EvidenceRecord[]>>();
  return references.map((reference) => {
    const moduleId = reference.moduleIds[0] ?? 'shared';
    let collections = moduleCache.get(moduleId);
    if (!collections) {
      collections = readJson<{ collections: Record<string, EvidenceRecord[]> }>(path.join(moduleDirectory, `${moduleId}.json`)).collections;
      moduleCache.set(moduleId, collections);
    }
    const record = (collections[reference.collection] ?? []).find((item) => item.id === reference.id);
    if (!record) throw new Error(`模块视图缺少索引记录：${reference.key}`);
    return record;
  });
}

function parseOptions(args: string[]): Record<string, string> {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) throw new Error(`无法识别参数：${argument}`);
    const key = argument.slice(2);
    if (key === 'full') options.full = 'true';
    else {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`参数缺少值：${argument}`);
      options[key] = value;
      index += 1;
    }
  }
  return options;
}

function requiredOption(options: Record<string, string>, key: string): string {
  const value = options[key]?.trim();
  if (!value) throw new Error(`缺少参数：--${key}`);
  return value;
}

function isSameRelease(value: unknown, version: string, fingerprint: string): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.version === version && record.sourceFingerprint === fingerprint;
}

function writeOutput(value: unknown, outputPath?: string): void {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (outputPath) {
    const resolvedPath = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, serialized, 'utf8');
  } else process.stdout.write(serialized);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
