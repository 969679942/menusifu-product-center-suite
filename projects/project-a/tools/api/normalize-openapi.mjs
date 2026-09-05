import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(process.argv[2] || '.');
const sourceDir = path.join(root, 'Merchant Center API');
const outputDir = path.join(root, 'contracts', 'api');
const lifecycleRegistry = JSON.parse(await fs.readFile(path.join(sourceDir, 'api-lifecycle-registry.json'), 'utf8'));
const lifecycleByOperationKey = new Map((lifecycleRegistry.entries || []).map(entry => [entry.operationKey, entry]));
const sources = [
  { file: '品牌商品和菜单API.json', service: 'brand-menu', runtimeBaseEnv: 'MC_ITEM_API_BASE_URL' },
  { file: '行业商品API.json', service: 'industry-item', runtimeBaseEnv: 'MC_PLATFORM_ITEM_API_BASE_URL' },
];
const methods = new Set(['get','post','put','patch','delete','head','options','trace']);

await Promise.all(['openapi','operations','schemas','auth','samples','generated'].map(dir => fs.mkdir(path.join(outputDir, dir), { recursive: true })));

function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function pointerGet(document, ref) {
  if (!ref.startsWith('#/')) return undefined;
  return ref.slice(2).split('/').reduce((value, token) => value?.[token.replaceAll('~1','/').replaceAll('~0','~')], document);
}
function collectRefs(value, refs = []) {
  if (Array.isArray(value)) for (const item of value) collectRefs(item, refs);
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) key === '$ref' && typeof item === 'string' ? refs.push(item) : collectRefs(item, refs);
  return refs;
}
function schemaDescriptor(schema) {
  if (!schema) return null;
  if (schema.$ref) return { ref: schema.$ref };
  const keys = ['type','format','title','description','nullable','default','example','enum','minimum','maximum','exclusiveMinimum','exclusiveMaximum','minLength','maxLength','pattern','minItems','maxItems','uniqueItems','minProperties','maxProperties','required','readOnly','writeOnly','deprecated'];
  const result = {};
  for (const key of keys) if (schema[key] !== undefined) result[key] = schema[key];
  if (schema.items) result.items = schemaDescriptor(schema.items);
  if (schema.oneOf) result.oneOf = schema.oneOf.map(schemaDescriptor);
  if (schema.anyOf) result.anyOf = schema.anyOf.map(schemaDescriptor);
  if (schema.allOf) result.allOf = schema.allOf.map(schemaDescriptor);
  return result;
}
function parameterDescriptor(parameter) {
  return parameter?.$ref ? { ref: parameter.$ref } : {
    name: parameter?.name,
    in: parameter?.in,
    required: !!parameter?.required,
    description: parameter?.description || null,
    schema: schemaDescriptor(parameter?.schema),
  };
}
function contentDescriptor(content = {}) {
  return Object.fromEntries(Object.entries(content).map(([mediaType, media]) => [mediaType, { schema: schemaDescriptor(media?.schema), hasExample: media?.example !== undefined || media?.examples !== undefined }]));
}
function requestBodyDescriptor(body) {
  if (!body) return null;
  if (body.$ref) return { ref: body.$ref };
  return { required: !!body.required, description: body.description || null, content: contentDescriptor(body.content) };
}
function responseDescriptor(response) {
  if (!response) return null;
  if (response.$ref) return { ref: response.$ref };
  return { description: response.description || null, headers: Object.keys(response.headers || {}), content: contentDescriptor(response.content) };
}
function safeUrl(url) {
  if (!url) return '';
  return String(url).replace(/https?:\/\/[^/]+/i, '{baseUrl}').replace(/([?&](?:token|access_token|refresh_token)=)[^&]+/gi, '$1{{MC_ACCESS_TOKEN}}');
}
function redact(value, key = '') {
  if (Array.isArray(value)) return value.map(item => redact(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]));
  if (typeof value !== 'string') return value;
  if (/password|passwd|pwd/i.test(key)) return '{{MC_PASSWORD}}';
  if (/authorization|cookie/i.test(key)) return '{{MC_ACCESS_TOKEN}}';
  if (/api.?key/i.test(key)) return '{{MC_API_KEY}}';
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '{{MC_USERNAME}}')
    .replace(/bearer\s+[A-Za-z0-9._~-]{20,}/gi, 'Bearer {{MC_ACCESS_TOKEN}}')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '{{MC_ACCESS_TOKEN}}');
}
function flattenPostman(items, group = [], output = []) {
  for (const item of items || []) {
    if (item.item) flattenPostman(item.item, [...group, item.name], output);
    else if (item.request) {
      let body = null;
      if (item.request.body?.raw) {
        try { body = redact(JSON.parse(item.request.body.raw)); }
        catch { body = redact(item.request.body.raw); }
      }
      output.push({
        group,
        name: item.name,
        method: item.request.method || null,
        url: safeUrl(typeof item.request.url === 'string' ? item.request.url : item.request.url?.raw),
        headers: Object.fromEntries((item.request.header || []).map(header => [header.key, /authorization/i.test(header.key) ? 'Bearer {{MC_ACCESS_TOKEN}}' : /x-api-key/i.test(header.key) ? '{{MC_API_KEY}}' : redact(header.value || '', header.key)])),
        bodyMode: item.request.body?.mode || null,
        body,
      });
    }
  }
  return output;
}

const report = { generatedAt: new Date().toISOString(), sourceFiles: [], rawOperationCount: 0, operationCount: 0, lifecycleExcluded: [], schemaCount: 0, unresolvedCount: 0, invalidRefCount: 0, duplicateOperationKeys: [] };
const allOperationKeys = [];
const allOperations = [];
const allSchemaNames = [];
const unresolved = [];

for (const source of sources) {
  const sourcePath = path.join(sourceDir, source.file);
  const raw = await fs.readFile(sourcePath, 'utf8');
  const document = JSON.parse(raw);
  const operations = [];
  let rawOperationCount = 0;
  const refs = [...new Set(collectRefs(document))];
  const invalidRefs = refs.filter(ref => ref.startsWith('#/') && pointerGet(document, ref) === undefined);
  for (const ref of invalidRefs) unresolved.push({ type: 'invalid-ref', service: source.service, ref });
  if (!(document.servers || []).length || (document.servers || []).some(server => /^\//.test(server.url || ''))) unresolved.push({ type: 'relative-server', service: source.service, runtimeBaseEnv: source.runtimeBaseEnv, servers: (document.servers || []).map(server => server.url) });
  if (!Object.keys(document.components?.securitySchemes || {}).length) unresolved.push({ type: 'missing-security-schemes', service: source.service });
  document['x-runtime-base-env'] = source.runtimeBaseEnv;
  document['x-source-sha256'] = sha256(raw);
  for (const [route, pathItem] of Object.entries(document.paths || {})) {
    for (const [method, operation] of Object.entries(pathItem || {})) {
      if (!methods.has(method)) continue;
      rawOperationCount += 1;
      const operationKey = source.service + ':' + method.toUpperCase() + ' ' + route;
      const lifecycleEntry = lifecycleByOperationKey.get(operationKey);
      if (lifecycleEntry && (['deprecated', 'superseded'].includes(lifecycleEntry.status) || lifecycleEntry.automationPolicy === 'exclude-from-active-catalog')) {
        report.lifecycleExcluded.push({ operationKey, status: lifecycleEntry.status });
        continue;
      }
      allOperationKeys.push(operationKey);
      if (!operation.summary) unresolved.push({ type: 'missing-summary', service: source.service, operationKey, operationId: operation.operationId || null });
      operations.push({
        service: source.service,
        runtimeBaseEnv: source.runtimeBaseEnv,
        operationKey,
        operationId: operation.operationId || null,
        method: method.toUpperCase(),
        path: route,
        summary: operation.summary || null,
        description: operation.description || null,
        tags: operation.tags || [],
        deprecated: !!operation.deprecated,
        security: operation.security ?? document.security ?? [],
        parameters: [...(pathItem.parameters || []), ...(operation.parameters || [])].map(parameterDescriptor),
        requestBody: requestBodyDescriptor(operation.requestBody),
        responses: Object.fromEntries(Object.entries(operation.responses || {}).map(([status, response]) => [status, responseDescriptor(response)])),
      });
    }
  }
  allOperations.push(...operations);
  const schemas = document.components?.schemas || {};
  for (const name of Object.keys(schemas)) allSchemaNames.push(source.service + ':' + name);
  await fs.writeFile(path.join(outputDir, 'openapi', source.service + '.openapi.json'), JSON.stringify(document, null, 2) + '\n');
  await fs.writeFile(path.join(outputDir, 'operations', source.service + '.operations.json'), JSON.stringify(operations, null, 2) + '\n');
  await fs.writeFile(path.join(outputDir, 'schemas', source.service + '.schemas.json'), JSON.stringify({ service: source.service, source: source.file, schemas }, null, 2) + '\n');
  report.sourceFiles.push({ ...source, sha256: sha256(raw), rawOperationCount, operationCount: operations.length, schemaCount: Object.keys(schemas).length, refCount: refs.length, invalidRefCount: invalidRefs.length });
  report.rawOperationCount += rawOperationCount;
  report.operationCount += operations.length;
  report.schemaCount += Object.keys(schemas).length;
  report.invalidRefCount += invalidRefs.length;
}

const duplicates = [...new Set(allOperationKeys.filter((key, index) => allOperationKeys.indexOf(key) !== index))];
report.duplicateOperationKeys = duplicates;
for (const key of duplicates) unresolved.push({ type: 'duplicate-operation-key', operationKey: key });
for (const entry of lifecycleRegistry.entries || []) {
  if (entry.replacementOperationKey && !allOperationKeys.includes(entry.replacementOperationKey)) {
    unresolved.push({ type: 'missing-lifecycle-replacement', operationKey: entry.operationKey, replacementOperationKey: entry.replacementOperationKey });
  }
}

const postmanPath = path.join(sourceDir, '商品中心.postman_collection.json');
const postman = JSON.parse(await fs.readFile(postmanPath, 'utf8'));
const postmanRequests = flattenPostman(postman.item);
const authRequests = postmanRequests.filter(request => /login|token|auth/i.test(request.name + ' ' + request.url));
const observedSamples = postmanRequests.filter(request => !authRequests.includes(request));
for (const request of postmanRequests) {
  if (!request.url || /^\?/.test(request.url)) unresolved.push({ type: 'incomplete-postman-url', request: request.name, method: request.method, url: request.url });
  if (/TEMPORARY|开通/i.test(request.name + ' ' + request.url)) unresolved.push({ type: 'privileged-or-temporary-request', request: request.name, method: request.method, url: request.url });
}
await fs.writeFile(path.join(outputDir, 'auth', 'auth-flow.json'), JSON.stringify({ source: '商品中心.postman_collection.json', requests: authRequests }, null, 2) + '\n');
await fs.writeFile(path.join(outputDir, 'samples', 'observed-request-samples.json'), JSON.stringify({ source: '商品中心.postman_collection.json', requests: observedSamples }, null, 2) + '\n');

await fs.writeFile(path.join(outputDir, 'operations', 'all.operations.json'), JSON.stringify(allOperations.sort((a, b) => a.operationKey.localeCompare(b.operationKey)), null, 2) + '\n');

const operationType = 'export type ApiOperationKey =\n' + [...new Set(allOperationKeys)].sort().map(key => '  | ' + JSON.stringify(key)).join('\n') + ';\n';
const schemaType = 'export type ApiSchemaKey =\n' + [...new Set(allSchemaNames)].sort().map(key => '  | ' + JSON.stringify(key)).join('\n') + ';\n';
await fs.writeFile(path.join(outputDir, 'generated', 'operation-keys.ts'), operationType);
await fs.writeFile(path.join(outputDir, 'generated', 'schema-keys.ts'), schemaType);
report.unresolvedCount = unresolved.length;
await fs.writeFile(path.join(outputDir, 'unresolved-api-contracts.json'), JSON.stringify(unresolved, null, 2) + '\n');
await fs.writeFile(path.join(outputDir, 'normalization-report.json'), JSON.stringify(report, null, 2) + '\n');

console.log(JSON.stringify(report, null, 2));
if (report.operationCount < 1 || report.rawOperationCount !== report.operationCount + report.lifecycleExcluded.length || duplicates.length || report.invalidRefCount || unresolved.some(item => item.type === 'missing-lifecycle-replacement')) process.exitCode = 1;
