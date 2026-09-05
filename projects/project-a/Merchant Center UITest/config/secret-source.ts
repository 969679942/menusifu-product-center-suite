import fs from 'node:fs';
import path from 'node:path';

type SecretEnv = Record<string, string>;

type ObservedRequestSamples = {
  requests?: Array<{
    url?: string;
    headers?: Record<string, unknown>;
  }>;
};

function resolveSecretFile(): string {
  const configuredPath = process.env.MC_SECRET_ENV_PATH;
  return configuredPath
    ? path.resolve(configuredPath)
    : path.resolve(process.cwd(), '..', '.secrets', 'runtime.env');
}

function resolveObservedRequestSamplesFile(): string {
  const configuredPath = process.env.MC_OBSERVED_REQUEST_SAMPLES_PATH;
  return configuredPath
    ? path.resolve(configuredPath)
    : path.resolve(__dirname, '..', '..', 'contracts', 'api', 'samples', 'observed-request-samples.json');
}

export function loadObservedPoiId(brandId: string, samplesFile = resolveObservedRequestSamplesFile()): string {
  if (!brandId || !fs.existsSync(samplesFile)) return '';
  const document = JSON.parse(fs.readFileSync(samplesFile, 'utf8')) as ObservedRequestSamples;
  const poiIds = new Set<string>();

  for (const request of document.requests ?? []) {
    if (!request.url?.includes('/ops-poi/')) continue;
    const headers = Object.fromEntries(
      Object.entries(request.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
    );
    if (String(headers['x-brand-id'] ?? '') !== brandId) continue;
    const poiId = String(headers['x-poi-id'] ?? '').trim();
    if (poiId) poiIds.add(poiId);
  }

  if (poiIds.size > 1) {
    throw new Error(`Brand ID ${brandId} 在已观测请求样本中存在多个门店 ID，禁止自动选择。`);
  }
  return [...poiIds][0] ?? '';
}

export function loadSecretEnv(): SecretEnv {
  const secretFile = resolveSecretFile();
  const values: SecretEnv = {};

  if (fs.existsSync(secretFile)) {
    const lines = fs.readFileSync(secretFile, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.trimStart().startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator <= 0) continue;
      values[line.slice(0, separator).trim()] = line.slice(separator + 1);
    }
  }

  const brandId = process.env.MC_BRAND_ID || values.MC_BRAND_ID || '';
  if (!process.env.MC_POI_ID && !values.MC_POI_ID) {
    const observedPoiId = loadObservedPoiId(brandId);
    if (observedPoiId) values.MC_POI_ID = observedPoiId;
  }

  return values;
}

export const secretEnv = loadSecretEnv();
