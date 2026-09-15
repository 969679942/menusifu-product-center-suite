import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { publishImmutableArtifact, resolveContainedArtifactPath } from '../utils/immutable-artifact';
import { containsSystemTestSensitiveContent } from '../automation/system-test/system-test-safety';
import { fingerprintExecutionSelection } from './execution-intent';
import { verifyExecutionAttemptLedger } from './execution-attempt-accounting';

export type EvidenceInvocationIdentity = {
  runId: string; selectedCaseIds: string[]; contractFingerprint: string;
  implementationFingerprint: string; executionCandidateFingerprint: string;
};
type Declaration = EvidenceInvocationIdentity & {
  schemaVersion: '1.0.0'; invocationId: string; ordinal: number; previousDeclarationHash: string | null; registeredAt: string;
};
type Entry = { invocationId: string; declarationHash: string };
type PreIndexHistory = { status: 'none' } | { status: 'unindexed-evidence'; ledgerHash: string; ledgerSnapshot: string };
type InvocationIndex = { schemaVersion: '1.0.0'; runId: string; entries: Entry[]; preIndexHistory?: PreIndexHistory };
export type IndexedEvidenceInvocation = {
  invocationId: string; ledgerHash: string | null; final: boolean | null;
  selectedCaseIds: string[]; ledger: Record<string, unknown> | null;
};
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const encode = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const indexPath = 'evidence-invocations/index.json';
const invocationPath = (id: string, file: string) => {
  if (!uuid(id)) throw new Error('EVIDENCE_INVOCATION_ID_INVALID');
  return `evidence-invocations/${id}/${file}`;
};
const read = (root: string, relative: string) => fs.readFileSync(resolveContainedArtifactPath(root, relative));
const json = (root: string, relative: string): any => JSON.parse(read(root, relative).toString('utf8'));
function validateIdentity(value: EvidenceInvocationIdentity) {
  if (!value.runId?.trim() || !Array.isArray(value.selectedCaseIds) || !value.selectedCaseIds.length
    || !value.selectedCaseIds.every((id) => typeof id === 'string' && id.trim())
    || new Set(value.selectedCaseIds).size !== value.selectedCaseIds.length
    || !sha(value.contractFingerprint) || !sha(value.implementationFingerprint) || !sha(value.executionCandidateFingerprint)) throw new Error('EVIDENCE_INVOCATION_IDENTITY_INVALID');
}
function publish(root: string, relativePath: string, value: unknown) {
  const content = encode(value);
  if (containsSystemTestSensitiveContent(content)) throw new Error('EVIDENCE_SENSITIVE_CONTENT_REJECTED');
  const destination = resolveContainedArtifactPath(root, relativePath);
  if (fs.existsSync(destination) && containsSystemTestSensitiveContent(fs.readFileSync(destination, 'utf8'))) throw new Error('EVIDENCE_SENSITIVE_CONTENT_REJECTED');
  return publishImmutableArtifact({ outputRoot: root, relativePath, content, reason: 'publish-indexed-run-evidence' });
}
function readIndex(root: string, runId: string, verifyHistoricalSnapshot = true): { index: InvocationIndex; declarations: Declaration[] } {
  const index = json(root, indexPath) as InvocationIndex;
  if (index.schemaVersion !== '1.0.0' || index.runId !== runId || !Array.isArray(index.entries) || !index.entries.length
    || new Set(index.entries.map((entry) => entry.invocationId)).size !== index.entries.length) throw new Error('EVIDENCE_INVOCATION_INDEX_INVALID');
  if (verifyHistoricalSnapshot && index.preIndexHistory !== undefined) {
    const prior = index.preIndexHistory;
    if (!object(prior) || !['none', 'unindexed-evidence'].includes(prior.status)) throw new Error('PRE_INDEX_HISTORY_INVALID');
    if (prior.status === 'none' && fs.existsSync(resolveContainedArtifactPath(root, 'evidence-invocations/unindexed-ledger.json'))) throw new Error('PRE_INDEX_HISTORY_INVALID');
    if (prior.status === 'unindexed-evidence' && (!sha(prior.ledgerHash)
      || prior.ledgerSnapshot !== `.artifact-history/objects/${prior.ledgerHash}.bin`
      || hash(read(root, prior.ledgerSnapshot)) !== prior.ledgerHash)) throw new Error('UNINDEXED_EVIDENCE_HASH_MISMATCH');
  }
  const declarations = index.entries.map((entry, ordinal) => {
    if (!sha(entry.declarationHash)) throw new Error('EVIDENCE_DECLARATION_HASH_INVALID');
    const bytes = read(root, invocationPath(entry.invocationId, 'declaration.json'));
    if (hash(bytes) !== entry.declarationHash) throw new Error('EVIDENCE_DECLARATION_HASH_MISMATCH');
    const declaration = JSON.parse(bytes.toString('utf8')) as Declaration;
    validateIdentity(declaration);
    if (declaration.schemaVersion !== '1.0.0' || declaration.runId !== runId || declaration.invocationId !== entry.invocationId
      || declaration.ordinal !== ordinal + 1 || declaration.previousDeclarationHash !== (index.entries[ordinal - 1]?.declarationHash ?? null)) throw new Error('EVIDENCE_DECLARATION_CHAIN_INVALID');
    return declaration;
  });
  return { index, declarations };
}

/** Runner-owned declaration before launching the reporter; existing invocations remain independently addressable. */
export function registerEvidenceInvocation(root: string, identity: EvidenceInvocationIdentity): Declaration {
  validateIdentity(identity);
  return withIndexLock(root, () => {
    const stored = fs.existsSync(resolveContainedArtifactPath(root, indexPath)) ? readIndex(root, identity.runId).index
      : { schemaVersion: '1.0.0' as const, runId: identity.runId, entries: [], preIndexHistory: preservePreIndexHistory(root) };
    const declaration: Declaration = { ...identity, schemaVersion: '1.0.0', invocationId: randomUUID(),
      ordinal: stored.entries.length + 1, previousDeclarationHash: stored.entries.at(-1)?.declarationHash ?? null, registeredAt: new Date().toISOString() };
    const declarationFile = resolveContainedArtifactPath(root, invocationPath(declaration.invocationId, 'declaration.json'));
    fs.mkdirSync(path.dirname(declarationFile), { recursive: true });
    const content = encode(declaration);
    if (containsSystemTestSensitiveContent(content)) throw new Error('EVIDENCE_SENSITIVE_CONTENT_REJECTED');
    fs.writeFileSync(declarationFile, content, { flag: 'wx' });
    publish(root, indexPath, { ...stored, entries: [...stored.entries, { invocationId: declaration.invocationId, declarationHash: hash(content) }] });
    return declaration;
  });
}

function preservePreIndexHistory(root: string): PreIndexHistory {
  const priorPath = resolveContainedArtifactPath(root, 'evidence-ledger.json');
  const destination = resolveContainedArtifactPath(root, 'evidence-invocations/unindexed-ledger.json');
  if (!fs.existsSync(priorPath) && !fs.existsSync(destination)) return { status: 'none' };
  const content = fs.readFileSync(fs.existsSync(priorPath) ? priorPath : destination);
  if (containsSystemTestSensitiveContent(content.toString('utf8'))) throw new Error('EVIDENCE_SENSITIVE_CONTENT_REJECTED');
  if (fs.existsSync(destination) && containsSystemTestSensitiveContent(fs.readFileSync(destination, 'utf8'))) throw new Error('EVIDENCE_SENSITIVE_CONTENT_REJECTED');
  const snapshot = publishImmutableArtifact({ outputRoot: root, relativePath: 'evidence-invocations/unindexed-ledger.json',
    content, reason: 'preserve-unindexed-evidence-before-invocation-registration' }).current;
  return { status: 'unindexed-evidence', ledgerHash: snapshot.sha256, ledgerSnapshot: snapshot.snapshot };
}

// Registration and latest-view publication must not race across reporter processes.
function withIndexLock<T>(root: string, action: () => T): T {
  const lock = resolveContainedArtifactPath(root, 'evidence-invocations/register.lock');
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  const handle = fs.openSync(lock, 'wx');
  try { return action(); } finally { fs.closeSync(handle); fs.unlinkSync(lock); }
}

/** One reporter process owns each invocation. Claims persist after exit and cannot be reused. */
export function claimEvidenceInvocation(root: string, invocationId: string, identity: EvidenceInvocationIdentity) {
  validateIdentity(identity);
  const registered = readIndex(root, identity.runId);
  const declaration = registered.declarations.find((item) => item.invocationId === invocationId);
  if (!declaration || registered.declarations.at(-1)?.invocationId !== invocationId
    || !Object.entries(identity).every(([key, value]) => JSON.stringify(declaration[key as keyof Declaration]) === JSON.stringify(value))) throw new Error('EVIDENCE_INVOCATION_IDENTITY_MISMATCH');
  const claim = resolveContainedArtifactPath(root, invocationPath(invocationId, 'owner.json'));
  fs.writeFileSync(claim, encode({ invocationId, processId: process.pid, claimedAt: new Date().toISOString() }), { flag: 'wx' });
  let finalized = false;
  return {
    publish(ledger: unknown, final: boolean) {
      return withIndexLock(root, () => {
        if (finalized) throw new Error('EVIDENCE_INVOCATION_ALREADY_FINAL');
        if (!object(ledger) || ledger.schemaVersion !== '1.2.0' || ledger.invocationId !== invocationId || ledger.runId !== identity.runId
          || JSON.stringify(ledger.selectedCaseIds) !== JSON.stringify(identity.selectedCaseIds)
          || ledger.selectedFingerprint !== fingerprintExecutionSelection(identity.selectedCaseIds)
          || ledger.contractFingerprint !== identity.contractFingerprint || ledger.implementationFingerprint !== identity.implementationFingerprint
          || ledger.executionCandidateFingerprint !== identity.executionCandidateFingerprint) throw new Error('INDEXED_LEDGER_IDENTITY_INVALID');
        const snapshot = publish(root, invocationPath(invocationId, 'ledger.json'), ledger).current;
        publish(root, invocationPath(invocationId, 'head.json'), { schemaVersion: '1.0.0', invocationId,
          ledgerHash: snapshot.sha256, ledgerSnapshot: snapshot.snapshot, final });
        // Compatibility view; consumers of current receipts must also validate its indexed snapshot.
        if (readIndex(root, identity.runId).declarations.at(-1)?.invocationId === invocationId) publish(root, 'evidence-ledger.json', ledger);
        finalized = final;
      });
    },
  };
}

function readInvocation(root: string, runId: string, declaration: Declaration): IndexedEvidenceInvocation {
  const base = { invocationId: declaration.invocationId, selectedCaseIds: declaration.selectedCaseIds };
  const headPath = invocationPath(declaration.invocationId, 'head.json');
  if (!fs.existsSync(resolveContainedArtifactPath(root, headPath))) return { ...base, ledgerHash: null, final: null, ledger: null };
  const head = json(root, headPath);
  if (!object(head) || head.invocationId !== declaration.invocationId || !sha(head.ledgerHash)
    || head.ledgerSnapshot !== `.artifact-history/objects/${head.ledgerHash}.bin` || typeof head.final !== 'boolean') throw new Error('EVIDENCE_HEAD_INVALID');
  const snapshot = read(root, head.ledgerSnapshot as string);
  if (hash(snapshot) !== head.ledgerHash) throw new Error('INDEXED_LEDGER_HASH_MISMATCH');
  const ledger = JSON.parse(snapshot.toString('utf8')) as Record<string, unknown>;
  if (ledger.invocationId !== declaration.invocationId || !verifyExecutionAttemptLedger(runId, declaration.selectedCaseIds, ledger).valid
    || ledger.contractFingerprint !== declaration.contractFingerprint || ledger.implementationFingerprint !== declaration.implementationFingerprint
    || ledger.executionCandidateFingerprint !== declaration.executionCandidateFingerprint) throw new Error('INDEXED_LEDGER_IDENTITY_INVALID');
  return { ...base, ledgerHash: head.ledgerHash, final: head.final, ledger };
}
function currentView(root: string, current: IndexedEvidenceInvocation) {
  if (!current.ledger || !current.ledgerHash || current.final === null) throw new Error('CURRENT_INVOCATION_REPORT_MISSING');
  if (hash(read(root, 'evidence-ledger.json')) !== current.ledgerHash) throw new Error('EVIDENCE_LATEST_VIEW_MISMATCH');
  return { ledger: current.ledger, ledgerHash: current.ledgerHash, final: current.final, invocationId: current.invocationId };
}
function evidenceError(error: unknown) {
  return error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'EVIDENCE_INDEX_UNAVAILABLE';
}

export function readIndexedRunEvidence(root: string, runId: string, expectedInvocationId?: string):
  | { status: 'available'; ledger: Record<string, unknown>; ledgerHash: string; invocationId: string; final: boolean;
      history: IndexedEvidenceInvocation[]; preIndexHistory: PreIndexHistory | { status: 'unknown' } }
  | { status: 'incomplete'; reason: string } {
  try {
    const { index, declarations } = readIndex(root, runId);
    if (expectedInvocationId && declarations.at(-1)!.invocationId !== expectedInvocationId) throw new Error('EVIDENCE_CURRENT_INVOCATION_MISMATCH');
    const history = declarations.map((declaration) => readInvocation(root, runId, declaration));
    return { status: 'available', ...currentView(root, history.at(-1)!), history, preIndexHistory: index.preIndexHistory ?? { status: 'unknown' } };
  } catch (error) { return { status: 'incomplete', reason: evidenceError(error) }; }
}

/** Execution observations only: historical payload errors cannot erase independently validated current terminal facts. */
export function readCurrentIndexedRunObservation(root: string, runId: string, expectedInvocationId?: string) {
  const policy = { businessPassAuthorized: false as const };
  try {
    const { declarations } = readIndex(root, runId, false);
    const latest = declarations.at(-1)!;
    if (expectedInvocationId && latest.invocationId !== expectedInvocationId) throw new Error('EVIDENCE_CURRENT_INVOCATION_MISMATCH');
    const current = currentView(root, readInvocation(root, runId, latest));
    const strict = readIndexedRunEvidence(root, runId, latest.invocationId);
    const freshLatest = readIndex(root, runId, false).declarations.at(-1)!;
    if (freshLatest.invocationId !== latest.invocationId) throw new Error('EVIDENCE_CURRENT_INVOCATION_MISMATCH');
    const fresh = currentView(root, readInvocation(root, runId, freshLatest));
    if (fresh.ledgerHash !== current.ledgerHash || fresh.final !== current.final) throw new Error('EVIDENCE_CURRENT_OBSERVATION_CHANGED');
    return { ...policy, status: 'available' as const, ...current,
      historicalEvidenceFinding: strict.status === 'incomplete' ? strict.reason : null };
  } catch (error) { return { ...policy, status: 'incomplete' as const, reason: evidenceError(error) }; }
}

/** For completion/checkpoint consumers only. Qualification and standard receipt import retain the strict reader. */
export function readRunExecutionObservation<T>(ledgerPath: string, runId: string, options: {
  requireFinal?: boolean; runReport?: unknown;
} = {}): { ledger: T; historicalEvidenceFinding: string | null; businessPassAuthorized: false } {
  let ledger: unknown;
  try { ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); }
  catch { throw new Error('EVIDENCE_LEDGER_UNAVAILABLE'); }
  if (!object(ledger)) throw new Error('EVIDENCE_LEDGER_INVALID');
  const root = path.dirname(ledgerPath);
  if (ledger.schemaVersion !== '1.2.0' && !fs.existsSync(path.join(root, indexPath))) {
    return { ledger: readRunEvidenceLedger<T>(ledgerPath, runId, options), historicalEvidenceFinding: null, businessPassAuthorized: false };
  }
  const observed = readCurrentIndexedRunObservation(root, runId);
  if (observed.status !== 'available') throw new Error(observed.reason);
  if (hash(fs.readFileSync(ledgerPath)) !== observed.ledgerHash) throw new Error('EVIDENCE_LATEST_VIEW_MISMATCH');
  if (options.requireFinal && !observed.final) throw new Error('EVIDENCE_INVOCATION_NOT_FINAL');
  if (options.runReport !== undefined) {
    const report = options.runReport;
    const binding = object(report) ? report.evidenceInvocation : undefined;
    if (!object(report) || report.runId !== runId || !object(binding)
      || binding.invocationId !== observed.invocationId || binding.snapshotHash !== observed.ledgerHash
      || (binding.indexStatus !== 'available' && binding.observationStatus !== 'available')) throw new Error('EVIDENCE_RUN_REPORT_BINDING_MISMATCH');
  }
  return { ledger: observed.ledger as T, historicalEvidenceFinding: observed.historicalEvidenceFinding, businessPassAuthorized: false };
}

/** Shared consumption boundary. Legacy ledgers remain readable only outside an indexed run. */
export function readRunEvidenceLedger<T>(ledgerPath: string, runId: string, options: {
  requireFinal?: boolean; runReport?: unknown;
} = {}): T {
  let ledger: unknown;
  try { ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); }
  catch { throw new Error('EVIDENCE_LEDGER_UNAVAILABLE'); }
  if (!object(ledger)) throw new Error('EVIDENCE_LEDGER_INVALID');
  const root = path.dirname(ledgerPath);
  if (ledger.schemaVersion === '1.2.0' || fs.existsSync(path.join(root, indexPath))) {
    const indexed = readIndexedRunEvidence(root, runId);
    if (indexed.status !== 'available') throw new Error(indexed.reason);
    if (hash(fs.readFileSync(ledgerPath)) !== indexed.ledgerHash) throw new Error('EVIDENCE_LATEST_VIEW_MISMATCH');
    if (options.requireFinal && !indexed.final) throw new Error('EVIDENCE_INVOCATION_NOT_FINAL');
    if (options.runReport !== undefined) {
      const report = options.runReport;
      const binding = object(report) ? report.evidenceInvocation : undefined;
      if (!object(report) || report.runId !== runId || !object(binding)
        || binding.invocationId !== indexed.invocationId || binding.snapshotHash !== indexed.ledgerHash
        || binding.indexStatus !== 'available') throw new Error('EVIDENCE_RUN_REPORT_BINDING_MISMATCH');
    }
    ledger = indexed.ledger;
  } else if (ledger.schemaVersion === '1.1.0' || ledger.attempts !== undefined) {
    if (!Array.isArray(ledger.selectedCaseIds)
      || !verifyExecutionAttemptLedger(runId, ledger.selectedCaseIds as string[], ledger).valid) throw new Error('EVIDENCE_ATTEMPT_PROJECTION_INVALID');
  }
  return ledger as T;
}
