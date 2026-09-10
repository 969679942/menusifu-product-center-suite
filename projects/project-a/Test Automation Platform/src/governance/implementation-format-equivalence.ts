import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { fingerprintImplementationCheckpoint, fingerprintImplementationCheckpointContent,
  type ImplementationCheckpoint, type ImplementationCheckpointCategory } from '../automation/system-test/system-test-implementation-fingerprint';

export type ImplementationFormatBaseline = {
  schemaVersion: '1.0.0';
  sources: Array<{ category: ImplementationCheckpointCategory; path: string; sha256: string; snapshotPath?: string }>;
};

/** Verifies an unchanged grammar against hash-bound original bytes; never rewrites a receipt. */
export function verifyImplementationFormatEquivalence(input: {
  projectRoot: string; checkpoint: ImplementationCheckpoint; expectedFingerprint: string; baseline: unknown;
}): { accepted: boolean; reasons: string[]; currentFingerprint?: string; changedPaths?: string[] } {
  try {
    const current = fingerprintImplementationCheckpoint(input.projectRoot, input.checkpoint);
    if (current.diagnostics.length) throw Error('CURRENT_CHECKPOINT_INVALID');
    const baseline = input.baseline as ImplementationFormatBaseline;
    if (!baseline || baseline.schemaVersion !== '1.0.0' || !Array.isArray(baseline.sources)
      || baseline.sources.some(s => !s || typeof s.path !== 'string' || typeof s.category !== 'string'
        || typeof s.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(s.sha256))) throw Error('FORMAT_BASELINE_INVALID');
    const key = (s: {category:string;path:string}) => `${s.category}:${s.path}`;
    if (baseline.sources.length !== current.sources.length || new Set(baseline.sources.map(key)).size !== baseline.sources.length
      || JSON.stringify(baseline.sources.map(key).sort()) !== JSON.stringify(current.sources.map(key).sort())) throw Error('FORMAT_DEPENDENCY_SET_MISMATCH');
    const original = current.sources.map(source => {
      const previous = baseline.sources.find(s => key(s) === key(source))!;
      return {category:previous.category,path:previous.path,sha256:previous.sha256};
    });
    if (fingerprintImplementationCheckpointContent(input.checkpoint.requiredCategories, original) !== input.expectedFingerprint) throw Error('FORMAT_BASELINE_FINGERPRINT_MISMATCH');
    const changedPaths: string[] = [];
    for (const source of current.sources) {
      const previous = baseline.sources.find(s => key(s) === key(source))!;
      // Validate real paths for unchanged dependencies too; symlink escape cannot authorize equivalence.
      const livePath = inside(input.projectRoot, source.path);
      if (source.sha256 === previous.sha256) continue;
      if (!/\.(?:ts|tsx|mts|cts)$/.test(source.path)) throw Error('FORMAT_SOURCE_TYPE_UNSUPPORTED');
      if (typeof previous.snapshotPath !== 'string') throw Error('FORMAT_SNAPSHOT_REQUIRED');
      const before = fs.readFileSync(inside(input.projectRoot, previous.snapshotPath));
      const after = fs.readFileSync(livePath);
      if (hash(before) !== previous.sha256 || hash(after) !== source.sha256) throw Error('FORMAT_SOURCE_HASH_MISMATCH');
      if (syntax(before.toString('utf8'), source.path) !== syntax(after.toString('utf8'), source.path)) throw Error('FORMAT_SYNTAX_CHANGED');
      changedPaths.push(source.path);
    }
    if (!changedPaths.length) throw Error('FORMAT_CHANGE_REQUIRED');
    const after = fingerprintImplementationCheckpoint(input.projectRoot, input.checkpoint);
    if (after.diagnostics.length || after.fingerprint !== current.fingerprint) throw Error('FORMAT_CURRENT_CHECKPOINT_CHANGED');
    return {accepted:true,reasons:[],currentFingerprint:current.fingerprint,changedPaths};
  } catch (error) {
    const code = error instanceof Error && /^FORMAT_|^CURRENT_CHECKPOINT_INVALID$/.test(error.message) ? error.message : 'FORMAT_EVIDENCE_UNAVAILABLE';
    return {accepted:false,reasons:[code]};
  }
}

function inside(root:string, relative:string):string {
  if (!relative || path.isAbsolute(relative) || relative.replaceAll('\\','/').split('/').includes('..')) throw Error('FORMAT_PATH_OUTSIDE_ROOT');
  const actual=fs.realpathSync(path.resolve(root,relative));
  const fromRoot=path.relative(fs.realpathSync(root),actual);
  if (!fromRoot || fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) throw Error('FORMAT_PATH_OUTSIDE_ROOT');
  return actual;
}
function hash(bytes:Buffer):string { return createHash('sha256').update(bytes).digest('hex'); }
function syntax(source:string, file:string):string {
  const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  if ((parsed as ts.SourceFile & {parseDiagnostics:readonly ts.Diagnostic[]}).parseDiagnostics.length) throw Error('FORMAT_SOURCE_PARSE_ERROR');
  const tree=(node:ts.Node):unknown=>{
    const text=(ranges:readonly ts.CommentRange[]|undefined)=>(ranges??[]).map(range=>source.slice(range.pos,range.end));
    const leading=text(ts.getLeadingCommentRanges(source,node.pos));
    const trailing=text(ts.getTrailingCommentRanges(source,node.end));
    const children=node.getChildren(parsed);
    return [node.kind,children.length?children.map(tree):node.getText(parsed),leading,trailing];
  };
  const grammar=tree(parsed);
  return JSON.stringify({grammar,shebang:source.match(/^#![^\r\n]*/)?.[0]??null});
}
