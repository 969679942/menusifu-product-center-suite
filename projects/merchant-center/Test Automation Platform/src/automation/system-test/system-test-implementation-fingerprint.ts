import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export type ImplementationSource = {
  path: string;
  sha256: string;
};

export type ImplementationCheckpointCategory =
  | 'flow'
  | 'page-object'
  | 'locator'
  | 'data-factory'
  | 'runner'
  | 'binding'
  | 'adapter'
  | 'cleanup';

export type ImplementationCheckpointEntry = {
  category: ImplementationCheckpointCategory;
  path: string;
};

export type ImplementationCheckpoint = {
  requiredCategories: readonly ImplementationCheckpointCategory[];
  entries: readonly ImplementationCheckpointEntry[];
};

export function fingerprintImplementationSources(rootDir: string, sourcePaths: readonly string[]): {
  fingerprint: string;
  sources: ImplementationSource[];
} {
  const sources = [...new Set(sourcePaths)].sort().map((sourcePath) => {
    const absolutePath = path.resolve(rootDir, sourcePath);
    if (!fs.existsSync(absolutePath)) throw new Error(`IMPLEMENTATION_SOURCE_MISSING:${sourcePath}`);
    return {
      path: path.relative(rootDir, absolutePath).replaceAll(path.sep, '/'),
      sha256: createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex'),
    };
  });
  const fingerprint = createHash('sha256').update(JSON.stringify(sources)).digest('hex');
  return { fingerprint, sources };
}

export function fingerprintImplementationCheckpoint(
  rootDir: string,
  checkpoint: ImplementationCheckpoint,
): {
  fingerprint: string;
  sources: Array<ImplementationSource & { category: ImplementationCheckpointCategory }>;
  diagnostics: string[];
} {
  const diagnostics: string[] = [];
  const categories = new Set(checkpoint.entries.map((entry) => entry.category));
  for (const category of [...new Set(checkpoint.requiredCategories)].sort()) {
    if (!categories.has(category)) diagnostics.push(`IMPLEMENTATION_CHECKPOINT_CATEGORY_MISSING:${category}`);
  }

  const seenPaths = new Set<string>();
  const sources = [...checkpoint.entries]
    .sort((left, right) => `${left.category}:${left.path}`.localeCompare(`${right.category}:${right.path}`))
    .flatMap((entry) => {
      const normalizedPath = entry.path.replaceAll('\\', '/');
      if (path.isAbsolute(entry.path) || normalizedPath.split('/').includes('..')) {
        diagnostics.push(`IMPLEMENTATION_CHECKPOINT_PATH_OUTSIDE_ROOT:${entry.path}`);
        return [];
      }
      const identity = `${entry.category}:${normalizedPath}`;
      if (seenPaths.has(identity)) {
        diagnostics.push(`IMPLEMENTATION_CHECKPOINT_DUPLICATE:${identity}`);
        return [];
      }
      seenPaths.add(identity);
      const absolutePath = path.resolve(rootDir, entry.path);
      if (!isInside(rootDir, absolutePath)) {
        diagnostics.push(`IMPLEMENTATION_CHECKPOINT_PATH_OUTSIDE_ROOT:${entry.path}`);
        return [];
      }
      if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
        diagnostics.push(`IMPLEMENTATION_CHECKPOINT_SOURCE_MISSING:${entry.path}`);
        return [];
      }
      return [{
        category: entry.category,
        path: path.relative(rootDir, absolutePath).replaceAll(path.sep, '/'),
        sha256: createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex'),
      }];
    });
  const fingerprint = createHash('sha256').update(JSON.stringify({
    requiredCategories: [...new Set(checkpoint.requiredCategories)].sort(),
    sources,
  })).digest('hex');
  return { fingerprint, sources, diagnostics: [...new Set(diagnostics)].sort() };
}

function isInside(rootDir: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(rootDir), path.resolve(targetPath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
