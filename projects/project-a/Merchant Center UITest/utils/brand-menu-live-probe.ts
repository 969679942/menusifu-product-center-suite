import fs from 'node:fs';
import path from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { callOperation } from '../api/operation-client';
import { runtimeConfig } from '../api/runtime-config';
import { redactAcceptanceDiagnostic } from './acceptance/redaction';

type Schema = {
  type?: string;
  format?: string;
  example?: unknown;
  default?: unknown;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  ref?: string;
};

export type BrandMenuDocumentedOperation = {
  operationKey: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  parameters?: Array<{
    name?: string;
    in?: 'path' | 'query' | 'header';
    required?: boolean;
    schema?: Schema;
  }>;
  requestBody?: {
    required?: boolean;
    content?: {
      'application/json'?: { schema?: Schema };
      'multipart/form-data'?: { schema?: Schema };
    };
  };
  responses?: Record<string, unknown>;
};

export type BrandMenuProbeResult = {
  executionOrder?: number;
  stepTitle?: string;
  operationKey: string;
  method: string;
  path: string;
  probeType: 'read' | 'validation';
  status?: number;
  outcome: 'responded' | 'blocked-before-request' | 'transport-error';
  classification?:
    | 'success'
    | 'business-rejection'
    | 'validation-response'
    | 'authorization-required'
    | 'route-unavailable'
    | 'entity-fixture-required'
    | 'request-fixture-required'
    | 'unexpected-server-error';
  businessCode?: string | number;
  businessSuccess?: boolean;
  responseKind?: 'json-object' | 'json-array' | 'text' | 'empty';
  responseSummary?: string;
  documentedStatus?: boolean;
  observedState?: string;
  finalStatus?: 'passed' | 'negative-passed' | 'blocked' | 'transport-error' | 'failed';
  diagnostic?: string;
  error?: string;
};

const operationCatalogPath = path.resolve(process.cwd(), '..', 'contracts/api/operations/brand-menu.operations.json');
const schemaCatalogPath = path.resolve(process.cwd(), '..', 'contracts/api/schemas/brand-menu.schemas.json');
const operationCatalog = JSON.parse(fs.readFileSync(operationCatalogPath, 'utf8')) as BrandMenuDocumentedOperation[];
const schemaCatalog = JSON.parse(fs.readFileSync(schemaCatalogPath, 'utf8')) as { schemas: Record<string, Schema> };

export function readBrandMenuOperations(): BrandMenuDocumentedOperation[] {
  return operationCatalog;
}

function resolveSchema(schema: Schema | undefined): Schema | undefined {
  if (!schema?.ref) return schema;
  const name = schema.ref.split('/').pop();
  return name ? schemaCatalog.schemas[name] : undefined;
}

function sampleForName(name: string, schema: Schema | undefined): unknown {
  if (/brand.?id/i.test(name)) return runtimeConfig.brandId;
  if (/poi|location/i.test(name)) return runtimeConfig.poiId || '0';
  if (/page.?size|size|limit/i.test(name)) return 1;
  if (/page.?number|page|current|offset/i.test(name)) return 1;
  if (/status/i.test(name)) return 1;
  if (/type/i.test(name)) return 1;
  if (/enabled|enable|default|multiple|required/i.test(name)) return false;
  if (/id$/i.test(name)) return 0;
  if (/ids$/i.test(name)) return [0];
  return sampleForSchema(schema, name);
}

function sampleForSchema(schema: Schema | undefined, name = 'value'): unknown {
  const resolved = resolveSchema(schema);
  if (!resolved) return `AUTO_AUDIT_NON_EXISTENT_${name}`;
  if (resolved.example !== undefined) return resolved.example;
  if (resolved.default !== undefined) return resolved.default;
  if (resolved.enum?.length) return resolved.enum[0];
  if (resolved.type === 'array') return [sampleForSchema(resolved.items, name)];
  if (resolved.type === 'object' || resolved.properties) {
    const result: Record<string, unknown> = {};
    for (const [propertyName, propertySchema] of Object.entries(resolved.properties ?? {})) {
      if (resolved.required?.includes(propertyName)) result[propertyName] = sampleForName(propertyName, propertySchema);
    }
    return result;
  }
  if (resolved.type === 'integer' || resolved.type === 'number') return 0;
  if (resolved.type === 'boolean') return false;
  return `AUTO_AUDIT_NON_EXISTENT_${name}`;
}

function pathParams(operation: BrandMenuDocumentedOperation): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const parameter of operation.parameters ?? []) {
    if (parameter.in !== 'path' || !parameter.name) continue;
    params[parameter.name] = sampleForName(parameter.name, parameter.schema) as string | number;
  }
  return params;
}

function queryParams(operation: BrandMenuDocumentedOperation): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = {};
  for (const parameter of operation.parameters ?? []) {
    if (parameter.in !== 'query' || !parameter.required || !parameter.name) continue;
    query[parameter.name] = sampleForName(parameter.name, parameter.schema) as string | number | boolean;
  }
  return query;
}

function isReadProbe(operation: BrandMenuDocumentedOperation): boolean {
  return operation.method === 'GET'
    || (operation.method === 'POST' && /\/(?:list|page|pageQuery)$/i.test(operation.path));
}

function readProbeBody(operation: BrandMenuDocumentedOperation): unknown {
  const schema = operation.requestBody?.content?.['application/json']?.schema;
  return sampleForSchema(schema, 'body');
}

type ResponseObservation = Pick<BrandMenuProbeResult,
  'businessCode' | 'businessSuccess' | 'responseKind' | 'responseSummary'
>;

export function observeBrandMenuResponseBody(text: string): ResponseObservation {
  const normalized = text.trim();
  if (!normalized) return { responseKind: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    return {
      responseKind: 'text',
      responseSummary: redactAcceptanceDiagnostic(normalized).replace(/\s+/g, ' ').slice(0, 500),
    };
  }
  if (Array.isArray(parsed)) return { responseKind: 'json-array', responseSummary: `array(${parsed.length})` };
  if (!parsed || typeof parsed !== 'object') {
    return { responseKind: 'text', responseSummary: String(parsed).slice(0, 500) };
  }
  const body = parsed as Record<string, unknown>;
  const code = body.code ?? body.statusCode ?? body.errorCode;
  const explicitSuccess = typeof body.success === 'boolean' ? body.success : undefined;
  const normalizedCode = code === undefined ? undefined : String(code).toLowerCase();
  const successCodes = new Set(['0', '200', 'ok', 'success']);
  const businessSuccess = explicitSuccess !== undefined
    ? explicitSuccess
    : normalizedCode !== undefined
      ? successCodes.has(normalizedCode)
      : undefined;
  return {
    responseKind: 'json-object',
    ...(code !== undefined && (typeof code === 'string' || typeof code === 'number') ? { businessCode: code } : {}),
    ...(businessSuccess !== undefined ? { businessSuccess } : {}),
    responseSummary: redactAcceptanceDiagnostic(JSON.stringify({
      success: explicitSuccess,
      code,
      message: body.message ?? body.msg ?? body.error,
    })).slice(0, 500),
  };
}

export function classifyBrandMenuResponse(
  operation: BrandMenuDocumentedOperation,
  status: number,
  observation: ResponseObservation,
): BrandMenuProbeResult['classification'] {
  if (status >= 200 && status < 400) return observation.businessSuccess === false ? 'business-rejection' : 'success';
  if (status === 400) return 'validation-response';
  if (status === 401 || status === 403) return 'authorization-required';
  if (status === 404) {
    if (operation.path.includes('{') && !/\/sched\/jobs/i.test(operation.path)) return 'entity-fixture-required';
    return 'route-unavailable';
  }
  if (status === 500 && /(?:upload|file)/i.test(operation.path)) return 'request-fixture-required';
  if (status === 500 && operation.path.includes('{')) return 'entity-fixture-required';
  if (status >= 500) return 'unexpected-server-error';
  return 'validation-response';
}

export function buildProbeRequest(operation: BrandMenuDocumentedOperation) {
  return {
    pathParams: pathParams(operation),
    query: queryParams(operation),
    ...(isReadProbe(operation) && operation.requestBody ? { body: readProbeBody(operation) } : {}),
  };
}

function requiresMultipartFixture(operation: BrandMenuDocumentedOperation): boolean {
  return Boolean(operation.requestBody?.content?.['multipart/form-data']);
}

export async function probeBrandMenuOperation(
  request: APIRequestContext,
  operation: BrandMenuDocumentedOperation,
): Promise<BrandMenuProbeResult> {
  if (requiresMultipartFixture(operation)) {
    return {
      operationKey: operation.operationKey,
      method: operation.method,
      path: operation.path,
      probeType: 'validation',
      outcome: 'blocked-before-request',
      classification: 'request-fixture-required',
      documentedStatus: false,
      diagnostic: '接口需要 multipart/form-data 文件夹具，通用探测器已在请求前阻断。',
    };
  }
  try {
    const response = await callOperation(request, operation.operationKey, buildProbeRequest(operation));
    const responseText = await response.text().catch(() => '');
    const observation = observeBrandMenuResponseBody(responseText);
    const diagnostic = response.status() >= 400 ? observation.responseSummary : undefined;
    return {
      operationKey: operation.operationKey,
      method: operation.method,
      path: operation.path,
      probeType: isReadProbe(operation) ? 'read' : 'validation',
      status: response.status(),
      outcome: 'responded',
      classification: classifyBrandMenuResponse(operation, response.status(), observation),
      documentedStatus: Boolean(operation.responses?.[String(response.status())]),
      ...observation,
      ...(diagnostic ? { diagnostic } : {}),
    };
  } catch (error) {
    return {
      operationKey: operation.operationKey,
      method: operation.method,
      path: operation.path,
      probeType: isReadProbe(operation) ? 'read' : 'validation',
      outcome: 'transport-error',
      classification: 'unexpected-server-error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
