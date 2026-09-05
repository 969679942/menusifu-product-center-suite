import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseProductCenterXmindItemPlan, type ProductCenterXmindItemCandidate } from './product-center-canonical-item-test-plan';
import { diagnoseProductCenterMarkdownTestPlan, parseProductCenterMarkdownTestPlan, type ProductCenterParsedMarkdownTestCase } from './product-center-test-plan-markdown';

export type ProductCenterAuditSourceKind = 'url' | 'local-file';
export type ProductCenterAuditSourceType = 'page' | 'test-plan' | 'api' | 'document' | 'unknown';
export type ProductCenterAuditSourceFormat = 'web-page' | 'markdown-test-plan' | 'json-test-plan' | 'xmind-test-plan' | 'unknown';
export type ProductCenterAuditContext = { environmentId: string | null; roleId: string | null; tenantScope: string | null; locale: string | null };

export type ProductCenterAuditCandidate = {
  candidateId: string;
  formalCaseId: string | null;
  title: string | null;
  module: string | null;
  preconditions: string[];
  actions: string[];
  expectedResults: string[];
  sourceRefs: string[];
  reviewRequired: string[];
};

export type ProductCenterUnifiedAuditReport = {
  schemaVersion: '1.1.0';
  generatedAt: string;
  freshUntil: string | null;
  freshnessBasis: 'page-observation-pending' | 'content-fingerprint';
  status: 'provisional' | 'review-required' | 'blocked-source';
  executionAllowed: false;
  mode: 'read-only-observation' | 'local-source-analysis' | 'mixed-source-analysis';
  sources: Array<{
    sourceId: string;
    kind: ProductCenterAuditSourceKind;
    sourceType: ProductCenterAuditSourceType;
    format: ProductCenterAuditSourceFormat;
    locator: string;
    fingerprint: string | null;
    observedAt: string;
    modifiedAt: string | null;
    available: boolean;
    changedDuringAudit: boolean;
  }>;
  executionContext: ProductCenterAuditContext;
  contextStatus: 'complete' | 'partial' | 'missing';
  candidates: ProductCenterAuditCandidate[];
  unresolved: Array<{ code: string; sourceId: string; message: string }>;
  guardrails: { canonicalCaseMutationAllowed: false; businessMutationAllowed: false; formalExecutionAllowed: false };
};

export type ProductCenterUnifiedAuditOptions = {
  source?: string;
  sources?: readonly string[];
  projectRoot?: string;
  generatedAt?: string;
  allowedRoots?: string[];
  allowedUrlHosts?: string[];
  sourceType?: ProductCenterAuditSourceType;
  executionContext?: Partial<ProductCenterAuditContext>;
};

export function buildProductCenterUnifiedAudit(options: ProductCenterUnifiedAuditOptions): ProductCenterUnifiedAuditReport {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const inputs = [...(options.sources ?? []), ...(options.source ? [options.source] : [])].map((item) => item.trim()).filter(Boolean);
  if (inputs.length === 0) throw new Error('必须提供 source 或 sources');
  const candidates: ProductCenterAuditCandidate[] = [];
  const unresolved: ProductCenterUnifiedAuditReport['unresolved'] = [];
  const sourceReports: ProductCenterUnifiedAuditReport['sources'] = [];
  let hasUrl = false;
  let hasLocal = false;
  let blocking = false;

  for (const input of inputs) {
    const resolved = resolveSource(input, projectRoot, options);
    if (resolved.kind === 'invalid') { sourceReports.push(resolved.source); unresolved.push(resolved.issue); blocking = true; continue; }
    if (resolved.kind === 'url') {
      hasUrl = true;
      sourceReports.push({ sourceId: resolved.sourceId, kind: 'url', sourceType: resolved.sourceType, format: 'web-page', locator: resolved.locator, fingerprint: resolved.fingerprint, observedAt: generatedAt, modifiedAt: null, available: resolved.allowed, changedDuringAudit: false });
      if (!resolved.allowed) { unresolved.push({ code: 'URL_HOST_NOT_ALLOWED', sourceId: resolved.sourceId, message: 'URL 主机不在显式允许列表中，已阻断网络观测。' }); blocking = true; }
      else { unresolved.push({ code: 'PAGE_OBSERVATION_PENDING', sourceId: resolved.sourceId, message: '已登记业务地址；需要在认证上下文中执行只读页面/API观测。' }); unresolved.push({ code: 'CASE_SOURCE_MISSING', sourceId: resolved.sourceId, message: '地址本身不是正式测试方案，不能单独生成带稳定 caseId 的正式用例。' }); }
      continue;
    }
    hasLocal = true;
    const result = analyzeLocalSource(resolved, generatedAt);
    sourceReports.push(result.source); candidates.push(...result.candidates); unresolved.push(...result.unresolved); blocking ||= result.blocking;
  }

  const context = buildContext(options.executionContext);
  const contextStatus = contextStatusOf(context);
  if (contextStatus !== 'complete') unresolved.push({ code: 'EXECUTION_CONTEXT_REQUIRED', sourceId: 'audit-context', message: '正式执行需要真实 environmentId、roleId、tenantScope 和 locale。' });
  const mergedCandidates = mergeCandidates(candidates);
  for (const candidate of mergedCandidates) candidate.reviewRequired = [...new Set([...candidate.reviewRequired, ...(hasUrl ? [] : ['PAGE_OBSERVATION_REQUIRED']), ...(contextStatus === 'complete' ? [] : ['EXECUTION_CONTEXT_REQUIRED']), ...(candidate.formalCaseId === null ? ['STABLE_CASE_ID_REQUIRED'] : []), ...(candidate.expectedResults.length === 0 ? ['OBSERVABLE_EXPECTATION_REQUIRED'] : [])])];
  const mode = hasUrl && hasLocal ? 'mixed-source-analysis' : hasUrl ? 'read-only-observation' : 'local-source-analysis';
  return {
    schemaVersion: '1.1.0', generatedAt, freshUntil: hasUrl ? null : addHours(generatedAt, 24), freshnessBasis: hasUrl ? 'page-observation-pending' : 'content-fingerprint',
    status: blocking ? 'blocked-source' : hasUrl && !hasLocal && mergedCandidates.length === 0 ? 'provisional' : 'review-required', executionAllowed: false, mode,
    sources: sourceReports, executionContext: context, contextStatus, candidates: mergedCandidates, unresolved: uniqueIssues(unresolved), guardrails: guardrails(),
  };
}

type ResolvedSource =
  | { kind: 'url'; sourceId: string; sourceType: ProductCenterAuditSourceType; locator: string; fingerprint: string; allowed: boolean }
  | { kind: 'local-file'; source: { path: string; sourceId: string; fingerprint: string; modifiedAt: string; content: Buffer; changedDuringAudit: boolean } }
  | { kind: 'invalid'; source: ProductCenterUnifiedAuditReport['sources'][number]; issue: { code: string; sourceId: string; message: string } };

function resolveSource(input: string, projectRoot: string, options: ProductCenterUnifiedAuditOptions): ResolvedSource {
  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input); const locator = redactUrl(url); const sourceId = `url:${sha256(locator).slice(0, 16)}`;
    const allowedHosts = options.allowedUrlHosts ?? (process.env.PC_AUDIT_ALLOWED_HOSTS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
    return { kind: 'url', sourceId, sourceType: options.sourceType ?? 'page', locator, fingerprint: `sha256:${sha256(locator)}`, allowed: isSafeHostname(url.hostname) && allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)) };
  }
  const sourceId = `file:${sha256(input.replace(/\\/g, '/')).slice(0, 16)}`;
  try {
    const candidate = input.startsWith('file://') ? decodeURIComponent(new URL(input).pathname).replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)) : input;
    const filePath = fs.realpathSync(path.resolve(projectRoot, candidate));
    const roots = (options.allowedRoots ?? [projectRoot, path.resolve(projectRoot, '..', 'Merchant Center Info')]).map(realpathOrResolve);
    if (!roots.some((root) => filePath === root || filePath.startsWith(`${root}${path.sep}`))) throw new Error(`本地源不在允许目录内：${filePath}`);
    const first = fs.readFileSync(filePath); const before = fs.statSync(filePath); const second = fs.readFileSync(filePath);
    return { kind: 'local-file', source: { path: filePath, sourceId, fingerprint: `sha256:${sha256(first)}`, modifiedAt: before.mtime.toISOString(), content: first, changedDuringAudit: sha256(first) !== sha256(second) } };
  } catch (error) {
    return { kind: 'invalid', source: { sourceId, kind: 'local-file', sourceType: options.sourceType ?? 'test-plan', format: detectFormat(input), locator: input, fingerprint: null, observedAt: new Date().toISOString(), modifiedAt: null, available: false, changedDuringAudit: false }, issue: { code: 'SOURCE_RESOLUTION_FAILED', sourceId, message: error instanceof Error ? error.message : String(error) } };
  }
}

function analyzeLocalSource(item: Extract<ResolvedSource, { kind: 'local-file' }>, generatedAt: string) {
  const source = item.source; const format = detectFormat(source.path); const unresolved: ProductCenterUnifiedAuditReport['unresolved'] = []; const candidates: ProductCenterAuditCandidate[] = [];
  if (source.changedDuringAudit) unresolved.push({ code: 'SOURCE_CHANGED_DURING_AUDIT', sourceId: source.sourceId, message: '读取前后文件指纹不一致，本次审计证据不稳定。' });
  try {
    if (format === 'markdown-test-plan') {
      const content = source.content.toString('utf8'); const diagnostics = diagnoseProductCenterMarkdownTestPlan(content);
      if (diagnostics.status !== 'valid') unresolved.push({ code: 'SOURCE_FORMAT_INVALID', sourceId: source.sourceId, message: `Markdown 存在待确认格式：${diagnostics.issues.length} 项。` });
      candidates.push(...(diagnostics.status === 'valid' ? parseProductCenterMarkdownTestPlan(content).map((entry) => markdownCandidate(entry, source.sourceId)) : parseMarkdownCandidatesForAudit(content, source.sourceId)));
      unresolved.push(...findMissingMarkdownAttachments(content, source.path, source.sourceId));
    } else if (format === 'json-test-plan') {
      candidates.push(...parseJsonCandidates(JSON.parse(source.content.toString('utf8')), source.sourceId));
      if (candidates.length === 0) unresolved.push({ code: 'NO_CASE_CANDIDATE', sourceId: source.sourceId, message: 'JSON 中没有找到可识别的用例数组。' });
    } else if (format === 'xmind-test-plan') {
      const plan = parseProductCenterXmindItemPlan(source.content); candidates.push(...plan.candidates.map((entry) => xmindCandidate(entry, source.sourceId))); candidates.push(...plan.blocked.map((entry) => xmindCandidate(entry, source.sourceId, ['XMIND_CANDIDATE_INCOMPLETE', ...entry.diagnostics])));
      if (plan.blocked.length > 0) unresolved.push({ code: 'XMIND_CANDIDATE_INCOMPLETE', sourceId: source.sourceId, message: `XMind 有 ${plan.blocked.length} 个节点缺少完整字段，已保留为待确认候选。` });
    } else unresolved.push({ code: 'UNSUPPORTED_SOURCE_FORMAT', sourceId: source.sourceId, message: `暂不支持本地文件格式：${path.extname(source.path) || '无扩展名'}` });
  } catch (error) { unresolved.push({ code: 'SOURCE_READ_FAILED', sourceId: source.sourceId, message: error instanceof Error ? error.message : String(error) }); }
  if (candidates.length > 0) unresolved.push({ code: 'TECHNICAL_BINDING_REQUIRED', sourceId: source.sourceId, message: '本地源只产生候选，正式执行前仍需页面、断言、数据和清理绑定。' });
  return { source: { sourceId: source.sourceId, kind: 'local-file' as const, sourceType: 'test-plan' as const, format, locator: source.path, fingerprint: source.fingerprint, observedAt: generatedAt, modifiedAt: source.modifiedAt, available: true, changedDuringAudit: source.changedDuringAudit }, candidates, unresolved, blocking: source.changedDuringAudit || unresolved.some((entry) => ['UNSUPPORTED_SOURCE_FORMAT', 'SOURCE_READ_FAILED'].includes(entry.code)) };
}

function markdownCandidate(item: ProductCenterParsedMarkdownTestCase, sourceId: string): ProductCenterAuditCandidate { return { candidateId: item.id, formalCaseId: item.id, title: item.title, module: item.module, preconditions: item.preconditions, actions: item.actions, expectedResults: item.expectedResults, sourceRefs: [sourceId, ...item.sourceCitations.map((entry) => entry.citation)], reviewRequired: [] }; }
function parseMarkdownCandidatesForAudit(markdown: string, sourceId: string): ProductCenterAuditCandidate[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n'); const headings = lines.flatMap((line, index) => { const match = line.match(/^### 用例编号：(.+)$/); return match ? [{ id: match[1].trim(), start: index }] : []; });
  return headings.map((heading, index) => { const block = lines.slice(heading.start + 1, headings[index + 1]?.start ?? lines.length); const title = fieldValue(block, '用例标题：'); const module = fieldValue(block, '所属模块：'); const sourceText = fieldValue(block, '来源：'); const preconditions = auditNumberedSection(block, '前置条件：', '测试步骤：'); const actions = auditNumberedSection(block, '测试步骤：', '预期结果：'); const expectedResults = auditNumberedSection(block, '预期结果：', '---'); const reviewRequired = sourceText ? ['SOURCE_CITATION_REVIEW_REQUIRED'] : ['SOURCE_CITATION_REQUIRED']; if (!title) reviewRequired.push('TITLE_REQUIRED'); if (!module) reviewRequired.push('MODULE_REQUIRED'); if (preconditions.length === 0) reviewRequired.push('PRECONDITION_REVIEW_REQUIRED'); if (actions.length === 0) reviewRequired.push('ACTION_REVIEW_REQUIRED'); if (expectedResults.length === 0) reviewRequired.push('OBSERVABLE_EXPECTATION_REQUIRED'); return { candidateId: heading.id, formalCaseId: heading.id, title, module, preconditions, actions, expectedResults, sourceRefs: [sourceId, ...(sourceText ? [`source-text:${sha256(sourceText).slice(0, 16)}`] : [])], reviewRequired }; });
}
function xmindCandidate(item: ProductCenterXmindItemCandidate, sourceId: string, reviewRequired: string[] = []): ProductCenterAuditCandidate { return { candidateId: `candidate:${sha256(`${sourceId}:${item.nodeId}`).slice(0, 16)}`, formalCaseId: null, title: item.title, module: item.modulePath.join(' / ') || null, preconditions: splitStatements(item.precondition), actions: splitStatements(item.steps), expectedResults: splitStatements(item.expected), sourceRefs: [sourceId, `xmind:${item.nodeId}`], reviewRequired }; }
function parseJsonCandidates(value: unknown, sourceId: string): ProductCenterAuditCandidate[] { const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}; const raw = Array.isArray(value) ? value : [record.cases, record.testCases, record.entries, (record.plan as Record<string, unknown> | undefined)?.cases].find(Array.isArray) ?? []; return (raw as unknown[]).flatMap((item, index) => { if (!item || typeof item !== 'object') return []; const entry = item as Record<string, unknown>; const formalCaseId = stringValue(entry.caseId ?? entry.canonicalId ?? entry.id); return [{ candidateId: formalCaseId ?? `candidate:${sha256(`${sourceId}:${index}`).slice(0, 16)}`, formalCaseId, title: stringValue(entry.title ?? entry.name), module: stringValue(entry.module), preconditions: stringArray(entry.preconditions), actions: stringArray(entry.actions ?? entry.steps), expectedResults: stringArray(entry.expectedResults ?? entry.expectations), sourceRefs: [sourceId], reviewRequired: [] }]; }); }
function mergeCandidates(candidates: readonly ProductCenterAuditCandidate[]): ProductCenterAuditCandidate[] { const merged = new Map<string, ProductCenterAuditCandidate>(); for (const candidate of candidates) { const key = candidate.formalCaseId ? `case:${candidate.formalCaseId}` : `semantic:${sha256(JSON.stringify([candidate.title, candidate.module, candidate.preconditions, candidate.actions, candidate.expectedResults]))}`; const previous = merged.get(key); if (!previous) { merged.set(key, { ...candidate, sourceRefs: [...candidate.sourceRefs], reviewRequired: [...candidate.reviewRequired] }); continue; } previous.sourceRefs = [...new Set([...previous.sourceRefs, ...candidate.sourceRefs])].sort(); previous.reviewRequired = [...new Set([...previous.reviewRequired, ...candidate.reviewRequired])].sort(); } return [...merged.values()].sort((left, right) => left.candidateId.localeCompare(right.candidateId)); }
function findMissingMarkdownAttachments(markdown: string, filePath: string, sourceId: string) { const findings: Array<{ code: string; sourceId: string; message: string }> = []; for (const match of markdown.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g)) { const reference = match[1].trim().split(/\s+/)[0]; if (!reference || /^(?:https?:|data:|#)/i.test(reference)) continue; if (!fs.existsSync(path.resolve(path.dirname(filePath), reference))) findings.push({ code: 'ATTACHMENT_MISSING', sourceId, message: `Markdown 附件不存在：${reference}` }); } return findings; }
function redactUrl(value: URL): string { const url = new URL(value.toString()); url.username = ''; url.password = ''; for (const key of [...url.searchParams.keys()]) if (/token|secret|password|passwd|auth|session|cookie|code/i.test(key)) url.searchParams.delete(key); return url.toString(); }
function isSafeHostname(hostname: string): boolean { const host = hostname.toLowerCase().replace(/[\[\]]/g, ''); if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host === '::1') return false; const octets = host.split('.').map(Number); if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true; return !(octets[0] === 10 || octets[0] === 127 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168)); }
function buildContext(value: Partial<ProductCenterAuditContext> | undefined): ProductCenterAuditContext { return { environmentId: value?.environmentId ?? null, roleId: value?.roleId ?? null, tenantScope: value?.tenantScope ?? null, locale: value?.locale ?? null }; }
function contextStatusOf(value: ProductCenterAuditContext): ProductCenterUnifiedAuditReport['contextStatus'] { const count = Object.values(value).filter(Boolean).length; return count === 4 ? 'complete' : count === 0 ? 'missing' : 'partial'; }
function realpathOrResolve(value: string): string { try { return fs.realpathSync(value); } catch { return path.resolve(value); } }
function detectFormat(filePath: string): ProductCenterAuditSourceFormat { switch (path.extname(filePath).toLowerCase()) { case '.md': case '.markdown': return 'markdown-test-plan'; case '.json': return 'json-test-plan'; case '.xmind': return 'xmind-test-plan'; default: return 'unknown'; } }
function splitStatements(value: string): string[] { return value.split(/\r?\n|；|;/).map((item) => item.trim()).filter(Boolean); }
function fieldValue(lines: readonly string[], label: string): string | null { const line = lines.find((item) => item.startsWith(label)); const value = line?.slice(label.length).trim(); return value || null; }
function auditNumberedSection(lines: readonly string[], startLabel: string, endLabel: string): string[] { const start = lines.findIndex((line) => line.trim() === startLabel); if (start < 0) return []; const end = lines.findIndex((line, index) => index > start && (line.trim() === endLabel || line.startsWith(endLabel) || /^#{1,6}\s+/.test(line.trim()))); const values: string[] = []; for (const rawLine of lines.slice(start + 1, end < 0 ? lines.length : end)) { const line = rawLine.trim(); const match = line.match(/^\d+\.\s+(.+)$/); if (match) values.push(match[1].trim()); else if (line && values.length > 0) values[values.length - 1] = `${values[values.length - 1]} ${line}`; } return values; }
function stringValue(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : []; }
function uniqueIssues(values: readonly { code: string; sourceId: string; message: string }[]) { const seen = new Set<string>(); return values.filter((item) => { const key = `${item.code}:${item.sourceId}:${item.message}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function addHours(value: string, hours: number): string | null { const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? new Date(timestamp + hours * 60 * 60 * 1000).toISOString() : null; }
function guardrails(): ProductCenterUnifiedAuditReport['guardrails'] { return { canonicalCaseMutationAllowed: false, businessMutationAllowed: false, formalExecutionAllowed: false }; }
