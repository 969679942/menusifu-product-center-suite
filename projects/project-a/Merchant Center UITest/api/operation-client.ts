import type { APIRequestContext, APIResponse } from '@playwright/test';
import { runtimeConfig } from './runtime-config';
import { resolveAccessToken } from './auth-client';
import { executeWithTransientRetry, isReadOnlyOperation } from './transient-retry';
import { TransientRetryCheckpoint } from './transient-retry-checkpoint';
import { redactAcceptanceDiagnostic } from '../utils/acceptance/redaction';

export type Operation = {
  operationKey: string;
  method: string;
  path: string;
  service: string;
  runtimeBaseEnv: string;
  requestBody?: { content?: Record<string, unknown> };
};

export type OperationRequestOptions = {
  pathParams?: Record<string, string | number>;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
  multipart?: Record<string, string | number | boolean | OperationMultipartFile>;
};

export type OperationMultipartFile = {
  name: string;
  mimeType: string;
  buffer: Buffer;
};

const productCenterApiRequestTimeoutMs = 15_000;

let operationCache: Operation[] | undefined;
async function readOperations(): Promise<Operation[]> {
  if (operationCache) return operationCache;
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const file = path.resolve(process.cwd(), '..', 'contracts', 'api', 'operations', 'all.operations.json');
  operationCache = JSON.parse(await fs.readFile(file, 'utf8')) as Operation[];
  return operationCache;
}

export async function findOperation(operationKey: string): Promise<Operation> {
  const operation = (await readOperations()).find(item => item.operationKey === operationKey);
  if (!operation) throw new Error('未找到 operationKey: ' + operationKey);
  return operation;
}

export function resolveOperationBaseUrl(operation: Pick<Operation, 'runtimeBaseEnv'>): string {
  const configured = process.env[operation.runtimeBaseEnv];
  if (configured) return configured;
  if (operation.runtimeBaseEnv === 'MC_ITEM_API_BASE_URL') return runtimeConfig.apiBaseUrl;
  if (operation.runtimeBaseEnv === 'MC_PLATFORM_ITEM_API_BASE_URL') return runtimeConfig.platformItemApiBaseUrl;
  throw new Error(`API operation 缺少运行时服务地址：${operation.runtimeBaseEnv}`);
}

export function resolveOperationRequestMode(operation: Pick<Operation, 'requestBody'>): 'json' | 'multipart' | 'none' {
  const contentTypes = Object.keys(operation.requestBody?.content ?? {});
  if (contentTypes.includes('multipart/form-data')) return 'multipart';
  if (contentTypes.length > 0) return 'json';
  return 'none';
}

function fillPath(template: string, pathParams: Record<string, string | number> = {}): string {
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = pathParams[key];
    if (value === undefined) throw new Error('缺少路径参数: ' + key);
    return encodeURIComponent(String(value));
  });
}

export async function callOperation(request: APIRequestContext, operationKey: string, options: OperationRequestOptions = {}): Promise<APIResponse> {
  const operation = await findOperation(operationKey);
  const requestMode = resolveOperationRequestMode(operation);
  if (requestMode === 'multipart' && !options.multipart) {
    throw new Error(`API operation ${operation.operationKey} 需要 multipart/form-data 文件夹具，禁止按 JSON 请求。`);
  }
  if (requestMode !== 'multipart' && options.multipart) {
    throw new Error(`API operation ${operation.operationKey} 未声明 multipart/form-data。`);
  }
  const token = await resolveAccessToken(request);
  const path = fillPath(operation.path, options.pathParams);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query || {})) query.set(key, String(value));
  const url = resolveOperationBaseUrl(operation).replace(/\/$/, '') + path + (query.toString() ? '?' + query : '');
  const headers: Record<string, string> = { token, 'x-brand-id': runtimeConfig.brandId };
  if (requestMode !== 'multipart') headers['content-type'] = 'application/json';
  if (path.includes('/ops-poi/')) {
    if (!runtimeConfig.poiId) throw new Error('调用门店接口时缺少 MC_POI_ID');
    headers['x-poi-id'] = runtimeConfig.poiId;
  }
  const checkpoint = new TransientRetryCheckpoint(operation.operationKey);
  return executeWithTransientRetry(
    () => request.fetch(url, {
        method: operation.method,
        headers,
        ...(requestMode === 'multipart' ? { multipart: options.multipart } : { data: options.body }),
        timeout: productCenterApiRequestTimeoutMs,
      }).catch((error: unknown) => {
        throw formatOperationTransportError(operation.operationKey, productCenterApiRequestTimeoutMs, error);
      }),
    {
      safeToRetry: isReadOnlyOperation(operation),
      onRetry: (event) => checkpoint.recordRetry(event),
      onRecovered: (event) => checkpoint.recordRecovered(event),
    },
  );
}

export function formatOperationTransportError(
  operationKey: string,
  timeoutMs: number,
  error: unknown,
): Error {
  const diagnostic = redactAcceptanceDiagnostic(error instanceof Error ? error.message : String(error));
  return new Error(`API operation ${operationKey} 请求未在 ${timeoutMs}ms 内完成：${diagnostic}`);
}
