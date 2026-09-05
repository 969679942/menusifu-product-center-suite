import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import { stableStringify } from './product-center-test-contract';
import { waitUntil } from './wait';

export type ProductCenterReleaseEvidence = {
  schemaVersion: '1.0.0';
  source: 'browser-runtime';
  runId: string;
  observedAt: string;
  applicationFingerprint: string;
  environmentFingerprint: string;
  routeFingerprint?: string;
  signals: {
    titleFingerprint: string;
    language: string;
    metaFingerprints: string[];
    resourcePathFingerprints: string[];
  };
};

export type ProductCenterBrowserContractSignals = {
  schemaVersion: '1.0.0';
  documentTitleFingerprint: string;
  visibleHeadingFingerprints: string[];
  visibleTestIdFingerprints: string[];
  visibleRoleNameFingerprints: string[];
  visibleDialogCount: number;
  visibleLoadingCount: number;
  visibleRowCount: number;
  requiredFieldCount: number;
  inputTypes: string[];
  maxLengths: number[];
};

export type ProductCenterRuntimeReleaseEvidenceArtifact = {
  runId?: string;
  entries?: Array<Record<string, unknown> & { release?: ProductCenterReleaseEvidence }>;
};

export type ProductCenterReleaseFreshnessIssue =
  | 'RELEASE_EVIDENCE_MISSING'
  | 'RELEASE_EVIDENCE_INVALID'
  | 'RELEASE_FINGERPRINT_MISMATCH'
  | 'ENVIRONMENT_FINGERPRINT_MISMATCH'
  | 'RELEASE_EVIDENCE_FROM_FUTURE'
  | 'RELEASE_EVIDENCE_STALE';

type PageSignals = {
  title?: string;
  language?: string;
  meta?: Record<string, string>;
  resourcePaths?: readonly string[];
};

export function buildProductCenterReleaseEvidence(input: {
  environmentId: string;
  baseURL: string;
  runId: string;
  observedAt?: string;
  pageSignals: PageSignals;
}): ProductCenterReleaseEvidence {
  const origin = safeOrigin(input.baseURL);
  const normalized = normalizePageSignals(input.pageSignals);
  const environmentFingerprint = sha256(stableStringify({
    environmentId: input.environmentId.trim(),
    origin,
  }));
  const applicationFingerprint = sha256(stableStringify({
    language: normalized.language,
    meta: normalized.meta,
    resourcePaths: normalized.resourcePaths,
  }));
  return {
    schemaVersion: '1.0.0',
    source: 'browser-runtime',
    runId: requiredText(input.runId, 'runId'),
    observedAt: normalizeIso(input.observedAt ?? new Date().toISOString()),
    applicationFingerprint,
    environmentFingerprint,
    signals: {
      titleFingerprint: sha256(normalized.title),
      language: normalized.language,
      metaFingerprints: normalized.meta.map((entry) => sha256(entry)),
      resourcePathFingerprints: normalized.resourcePaths.map((entry) => sha256(entry)),
    },
  };
}

export async function collectProductCenterBrowserReleaseEvidence(
  page: Page,
  input: {
    environmentId: string;
    baseURL: string;
    runId: string;
    observedAt?: string;
  },
): Promise<ProductCenterReleaseEvidence> {
  const pageSignals = await page.evaluate(() => {
    const allowedMetaNames = new Set([
      'application-version',
      'app-version',
      'build',
      'build-id',
      'commit',
      'generator',
      'release',
      'version',
    ]);
    const meta = Object.fromEntries(Array.from(document.querySelectorAll('meta[name]'))
      .map((element) => ({
        name: (element.getAttribute('name') ?? '').trim().toLowerCase(),
        content: (element.getAttribute('content') ?? '').trim(),
      }))
      .filter((entry) => allowedMetaNames.has(entry.name) && entry.content.length > 0)
      .map((entry) => [entry.name, entry.content]));
    const resourcePaths = Array.from(document.querySelectorAll(
      'script[src],link[rel="stylesheet"][href]',
    )).map((element) => {
        const value = element.getAttribute('src') ?? element.getAttribute('href') ?? '';
        try {
          return new URL(value, window.location.origin).pathname;
        } catch {
          return '';
        }
      })
      .filter((value) => /\.(?:css|js|mjs)$/i.test(value));
    return {
      title: document.title,
      language: document.documentElement.lang,
      meta,
      resourcePaths,
    };
  });
  return buildProductCenterReleaseEvidence({ ...input, pageSignals });
}

export async function collectProductCenterSettledBrowserReleaseEvidence(
  page: Page,
  input: {
    environmentId: string;
    baseURL: string;
    runId: string;
    observedAt?: string;
  },
  options: {
    timeout?: number;
    interval?: number;
    requiredStableSamples?: number;
  } = {},
): Promise<ProductCenterReleaseEvidence> {
  const requiredStableSamples = Math.max(2, options.requiredStableSamples ?? 2);
  let previousFingerprint = '';
  let stableSamples = 0;
  const result = await waitUntil(
    async () => {
      const release = await collectProductCenterBrowserReleaseEvidence(page, input);
      const fingerprint = sha256(stableStringify({
        applicationFingerprint: release.applicationFingerprint,
        environmentFingerprint: release.environmentFingerprint,
        signals: release.signals,
      }));
      stableSamples = fingerprint === previousFingerprint ? stableSamples + 1 : 1;
      previousFingerprint = fingerprint;
      return { release, stableSamples };
    },
    (value) => value.stableSamples >= requiredStableSamples,
    {
      timeout: options.timeout ?? 30_000,
      interval: options.interval ?? 250,
      message: '商品中心页面版本资源信号未稳定',
    },
  );
  return result.release;
}

export async function collectProductCenterBrowserContractSignals(
  page: Page,
): Promise<ProductCenterBrowserContractSignals> {
  const raw = await page.evaluate(() => {
    const isVisible = (element: Element) => {
      const node = element as HTMLElement;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0'
        && rect.width > 0
        && rect.height > 0;
    };
    const visible = (selector: string) => Array.from(document.querySelectorAll(selector)).filter(isVisible);
    const roleNames = visible('[role],button,input,select,textarea').flatMap((element) => {
      const role = element.getAttribute('role')
        ?? (element.tagName === 'BUTTON' ? 'button' : element.tagName.toLowerCase());
      if (['cell', 'gridcell', 'row', 'rowgroup'].includes(role)) return [];
      const explicitName = element.getAttribute('aria-label')
        ?? element.getAttribute('name')
        ?? element.getAttribute('placeholder')
        ?? '';
      const name = explicitName || (role === 'button' ? element.textContent ?? '' : '');
      const normalizedName = name.replace(/\s+/g, ' ').trim().slice(0, 120);
      return normalizedName ? [`${role}:${normalizedName}`] : [`${role}:<unnamed>`];
    });
    const inputs = visible('input,select,textarea');
    return {
      documentTitle: document.title,
      headings: visible(
        'h1,h2,h3,h4,[role="heading"],[role="tab"],.ant-page-header-heading-title,.ant-card-head-title,.ant-modal-title',
      ).map((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)),
      testIds: visible('[data-testid]').map((element) => element.getAttribute('data-testid') ?? ''),
      roleNames,
      visibleDialogCount: visible('[role="dialog"],.ant-modal:not(.ant-modal-hidden)').length,
      visibleLoadingCount: visible('[aria-busy="true"],.ant-spin-spinning').length,
      visibleRowCount: visible('[role="row"],tbody tr').length,
      requiredFieldCount: inputs.filter((element) => (
        element.hasAttribute('required') || element.getAttribute('aria-required') === 'true'
      )).length,
      inputTypes: inputs.map((element) => (
        element.getAttribute('type') ?? element.tagName.toLowerCase()
      )),
      maxLengths: inputs.map((element) => Number(element.getAttribute('maxlength')))
        .filter((value) => Number.isInteger(value) && value >= 0),
    };
  });
  return {
    schemaVersion: '1.0.0',
    documentTitleFingerprint: sha256(raw.documentTitle.trim()),
    visibleHeadingFingerprints: uniqueHashes(raw.headings),
    visibleTestIdFingerprints: uniqueHashes(raw.testIds),
    visibleRoleNameFingerprints: uniqueHashes(raw.roleNames),
    visibleDialogCount: raw.visibleDialogCount,
    visibleLoadingCount: raw.visibleLoadingCount,
    visibleRowCount: raw.visibleRowCount,
    requiredFieldCount: raw.requiredFieldCount,
    inputTypes: [...new Set(raw.inputTypes.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort(),
    maxLengths: [...new Set(raw.maxLengths)].sort((left, right) => left - right),
  };
}

export async function collectProductCenterSettledBrowserContractSignals(
  page: Page,
  options: {
    timeout?: number;
    interval?: number;
    requiredStableSamples?: number;
    minimumSettlingMs?: number;
  } = {},
): Promise<ProductCenterBrowserContractSignals> {
  const requiredStableSamples = Math.max(2, options.requiredStableSamples ?? 2);
  const minimumSettlingMs = Math.max(0, options.minimumSettlingMs ?? 1_000);
  let previousFingerprint = '';
  let stableSamples = 0;
  let loadingClearedAt: number | undefined;
  const result = await waitUntil(
    async () => {
      const signals = await collectProductCenterBrowserContractSignals(page);
      const fingerprint = sha256(stableStringify(signals));
      if (signals.visibleLoadingCount === 0) {
        loadingClearedAt ??= Date.now();
        stableSamples = fingerprint === previousFingerprint ? stableSamples + 1 : 1;
      } else {
        stableSamples = 0;
        loadingClearedAt = undefined;
      }
      previousFingerprint = fingerprint;
      return {
        signals,
        stableSamples,
        settlingMs: loadingClearedAt === undefined ? 0 : Date.now() - loadingClearedAt,
      };
    },
    (value) => value.stableSamples >= requiredStableSamples
      && value.settlingMs >= minimumSettlingMs,
    {
      timeout: options.timeout ?? 30_000,
      interval: options.interval ?? 250,
      message: '商品中心页面可见语义信号未在加载结束后稳定',
    },
  );
  return result.signals;
}

export function validateProductCenterReleaseEvidence(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ['release evidence 必须为对象'];
  if (value.schemaVersion !== '1.0.0') issues.push('release evidence schemaVersion 无效');
  if (value.source !== 'browser-runtime') issues.push('release evidence source 无效');
  for (const key of ['runId', 'observedAt', 'applicationFingerprint', 'environmentFingerprint']) {
    if (typeof value[key] !== 'string' || value[key].length === 0) issues.push(`release evidence ${key} 缺失`);
  }
  if (typeof value.observedAt === 'string' && !Number.isFinite(Date.parse(value.observedAt))) {
    issues.push('release evidence observedAt 无效');
  }
  for (const key of ['applicationFingerprint', 'environmentFingerprint']) {
    if (typeof value[key] === 'string' && !/^[a-f0-9]{64}$/.test(value[key])) {
      issues.push(`release evidence ${key} 格式无效`);
    }
  }
  if (value.routeFingerprint !== undefined
    && (typeof value.routeFingerprint !== 'string'
      || !/^[a-f0-9]{64}$/.test(value.routeFingerprint))) {
    issues.push('release evidence routeFingerprint 格式无效');
  }
  const signals = isRecord(value.signals) ? value.signals : undefined;
  if (!signals) issues.push('release evidence signals 缺失');
  else {
    if (typeof signals.titleFingerprint !== 'string') issues.push('release evidence titleFingerprint 缺失');
    if (!Array.isArray(signals.metaFingerprints)) issues.push('release evidence metaFingerprints 缺失');
    if (!Array.isArray(signals.resourcePathFingerprints)) {
      issues.push('release evidence resourcePathFingerprints 缺失');
    }
  }
  return issues;
}

export function evaluateProductCenterEvidenceFreshness(input: {
  evidence: ProductCenterReleaseEvidence | undefined;
  current: ProductCenterReleaseEvidence;
  now?: string;
  maxAgeMs: number;
}): { accepted: boolean; ageMs: number | null; issues: ProductCenterReleaseFreshnessIssue[] } {
  const issues: ProductCenterReleaseFreshnessIssue[] = [];
  if (!input.evidence) {
    return { accepted: false, ageMs: null, issues: ['RELEASE_EVIDENCE_MISSING'] };
  }
  if (validateProductCenterReleaseEvidence(input.evidence).length > 0) {
    issues.push('RELEASE_EVIDENCE_INVALID');
  }
  if (input.evidence.applicationFingerprint !== input.current.applicationFingerprint
    && !hasCompatibleProductCenterReleaseLineage(input.evidence, input.current)) {
    issues.push('RELEASE_FINGERPRINT_MISMATCH');
  }
  if (input.evidence.environmentFingerprint !== input.current.environmentFingerprint) {
    issues.push('ENVIRONMENT_FINGERPRINT_MISMATCH');
  }
  const nowMs = Date.parse(input.now ?? new Date().toISOString());
  const observedAtMs = Date.parse(input.evidence.observedAt);
  const ageMs = Number.isFinite(nowMs) && Number.isFinite(observedAtMs)
    ? nowMs - observedAtMs
    : null;
  if (ageMs === null) issues.push('RELEASE_EVIDENCE_INVALID');
  else if (ageMs < -60_000) issues.push('RELEASE_EVIDENCE_FROM_FUTURE');
  else if (ageMs > input.maxAgeMs) issues.push('RELEASE_EVIDENCE_STALE');
  return { accepted: issues.length === 0, ageMs, issues: [...new Set(issues)] };
}

function hasCompatibleProductCenterReleaseLineage(
  evidence: ProductCenterReleaseEvidence,
  current: ProductCenterReleaseEvidence,
): boolean {
  if (evidence.signals.language !== current.signals.language) return false;
  if (!sameStringSet(evidence.signals.metaFingerprints, current.signals.metaFingerprints)) {
    return false;
  }
  const evidenceResources = new Set(evidence.signals.resourcePathFingerprints);
  const currentResources = new Set(current.signals.resourcePathFingerprints);
  const intersectionSize = [...evidenceResources].filter((resource) => currentResources.has(resource)).length;
  const smallerSize = Math.min(evidenceResources.size, currentResources.size);
  return intersectionSize >= 3
    && smallerSize > 0
    && intersectionSize / smallerSize >= 0.75;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value) => right.includes(value));
}

export function aggregateProductCenterReleaseEvidence(
  releases: readonly ProductCenterReleaseEvidence[],
): ProductCenterReleaseEvidence {
  if (releases.length === 0) throw new Error('release evidence 分母为零');
  for (const release of releases) {
    const issues = validateProductCenterReleaseEvidence(release);
    if (issues.length > 0) throw new Error(`release evidence 无效：${issues.join(',')}`);
  }
  const environmentFingerprints = new Set(releases.map((entry) => entry.environmentFingerprint));
  if (environmentFingerprints.size !== 1) throw new Error('同一运行存在多个环境指纹');
  const commonResources = intersectStrings(
    releases.map((entry) => entry.signals.resourcePathFingerprints),
  );
  const commonMeta = intersectStrings(releases.map((entry) => entry.signals.metaFingerprints));
  if (commonResources.length === 0 && commonMeta.length === 0) {
    throw new Error('同一运行缺少公共应用版本信号');
  }
  const languages = [...new Set(releases.map((entry) => entry.signals.language).filter(Boolean))];
  const applicationFingerprint = sha256(stableStringify({
    commonMeta,
    commonResources,
    language: languages.length === 1 ? languages[0] : '',
  }));
  const latest = [...releases].sort((left, right) => (
    right.observedAt.localeCompare(left.observedAt)
  ))[0];
  return {
    ...latest,
    applicationFingerprint,
    signals: {
      titleFingerprint: sha256('multi-page-release'),
      language: languages.length === 1 ? languages[0] : '',
      metaFingerprints: commonMeta,
      resourcePathFingerprints: commonResources,
    },
  };
}

export function deriveProductCenterRuntimeEvidenceForRelease<
  T extends ProductCenterRuntimeReleaseEvidenceArtifact,
>(artifact: T): T & { release: ProductCenterReleaseEvidence; entries: NonNullable<T['entries']> } {
  const entries = artifact.entries ?? [];
  const releases = entries.flatMap((entry) => entry.release ? [entry.release] : []);
  const release = aggregateProductCenterReleaseEvidence(releases);
  return {
    ...artifact,
    release,
    entries: entries.map((entry) => ({
      ...entry,
      ...(entry.release ? {
        release: {
          ...entry.release,
          routeFingerprint: entry.release.routeFingerprint ?? entry.release.applicationFingerprint,
          applicationFingerprint: release.applicationFingerprint,
          environmentFingerprint: release.environmentFingerprint,
          signals: cloneReleaseSignals(release.signals),
        },
      } : {}),
    })) as NonNullable<T['entries']>,
  };
}

export function deduplicateProductCenterRouteProbeEntries<
  T extends {
    route: string;
    release: ProductCenterReleaseEvidence;
    browserSignals?: unknown;
  },
>(routes: readonly T[]): T[] {
  const uniqueRoutes = new Map<string, { entry: T; signature: string }>();
  for (const route of routes) {
    const normalizedRoute = normalizeRoute(route.route);
    if (!normalizedRoute) throw new Error('当前版本路由 Probe 缺少 route');
    const releaseIssues = validateProductCenterReleaseEvidence(route.release);
    if (releaseIssues.length > 0) {
      throw new Error(`当前版本路由 Probe release 无效：${normalizedRoute}:${releaseIssues.join(',')}`);
    }
    const signature = stableStringify({
      applicationFingerprint: route.release.applicationFingerprint,
      environmentFingerprint: route.release.environmentFingerprint,
      routeFingerprint: route.release.routeFingerprint ?? route.release.applicationFingerprint,
      browserSignals: route.browserSignals ?? null,
    });
    const existing = uniqueRoutes.get(normalizedRoute);
    if (existing && existing.signature !== signature) {
      throw new Error(`当前版本路由 Probe 冲突：${normalizedRoute}`);
    }
    if (!existing || route.release.observedAt > existing.entry.release.observedAt) {
      uniqueRoutes.set(normalizedRoute, {
        entry: { ...route, route: normalizedRoute },
        signature,
      });
    }
  }
  return [...uniqueRoutes.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value.entry);
}

export function deriveProductCenterRuntimeEvidenceForCurrentRoutes<
  T extends ProductCenterRuntimeReleaseEvidenceArtifact,
>(input: {
  artifact: T;
  currentRelease: ProductCenterReleaseEvidence;
  routes: ReadonlyArray<{
    route: string;
    release: ProductCenterReleaseEvidence;
    browserSignals: ProductCenterBrowserContractSignals;
  }>;
}): T & { release: ProductCenterReleaseEvidence; entries: NonNullable<T['entries']> } {
  const currentRoutes = deduplicateProductCenterRouteProbeEntries(input.routes);
  const releaseByRoute = new Map(currentRoutes.map((route) => [normalizeRoute(route.route), route.release]));
  return {
    ...input.artifact,
    release: { ...input.currentRelease },
    entries: (input.artifact.entries ?? []).map((entry) => {
      if (!entry.release) return { ...entry };
      const currentRouteRelease = releaseByRoute.get(evidenceRoute(entry));
      return {
        ...entry,
        release: currentRouteRelease
          ? { ...currentRouteRelease }
          : { ...entry.release },
      };
    }) as NonNullable<T['entries']>,
  };
}

function normalizePageSignals(input: PageSignals) {
  const resourcePaths = [...new Set((input.resourcePaths ?? [])
    .map(normalizeResourcePath)
    .filter(Boolean))].sort();
  const meta = Object.entries(input.meta ?? {})
    .filter(([key, value]) => key.trim().length > 0 && value.trim().length > 0)
    .map(([key, value]) => `${key.trim().toLowerCase()}=${value.trim()}`)
    .sort();
  return {
    title: (input.title ?? '').trim(),
    language: (input.language ?? '').trim().toLowerCase(),
    meta,
    resourcePaths,
  };
}

function normalizeResourcePath(value: string): string {
  try {
    return new URL(value, 'https://local.invalid').pathname;
  } catch {
    return value.split(/[?#]/, 1)[0].trim();
  }
}

function evidenceRoute(entry: Record<string, unknown>): string {
  const visibleUi = isRecord(entry.visibleUi) ? entry.visibleUi : undefined;
  const navigation = isRecord(entry.navigation) ? entry.navigation : undefined;
  return normalizeRoute(
    typeof visibleUi?.route === 'string'
      ? visibleUi.route
      : typeof navigation?.targetPath === 'string'
        ? navigation.targetPath
        : typeof navigation?.arrivedPath === 'string'
          ? navigation.arrivedPath
          : '',
  );
}

function normalizeRoute(value: string): string {
  try {
    return new URL(value, 'https://local.invalid').pathname;
  } catch {
    return value.split(/[?#]/, 1)[0].trim();
  }
}

function cloneBrowserSignals(
  value: ProductCenterBrowserContractSignals,
): ProductCenterBrowserContractSignals {
  return {
    ...value,
    visibleHeadingFingerprints: [...value.visibleHeadingFingerprints],
    visibleTestIdFingerprints: [...value.visibleTestIdFingerprints],
    visibleRoleNameFingerprints: [...value.visibleRoleNameFingerprints],
    inputTypes: [...value.inputTypes],
    maxLengths: [...value.maxLengths],
  };
}

function cloneReleaseSignals(
  value: ProductCenterReleaseEvidence['signals'],
): ProductCenterReleaseEvidence['signals'] {
  return {
    titleFingerprint: value.titleFingerprint,
    language: value.language,
    metaFingerprints: [...value.metaFingerprints],
    resourcePathFingerprints: [...value.resourcePathFingerprints],
  };
}

function safeOrigin(value: string): string {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    throw new Error('baseURL 无效');
  }
}

function normalizeIso(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error('observedAt 无效');
  return new Date(timestamp).toISOString();
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} 不能为空`);
  return normalized;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function uniqueHashes(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean).map(sha256))].sort();
}

function intersectStrings(groups: readonly (readonly string[])[]): string[] {
  if (groups.length === 0) return [];
  const remaining = new Set(groups[0]);
  for (const group of groups.slice(1)) {
    const current = new Set(group);
    for (const value of remaining) {
      if (!current.has(value)) remaining.delete(value);
    }
  }
  return [...remaining].sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
