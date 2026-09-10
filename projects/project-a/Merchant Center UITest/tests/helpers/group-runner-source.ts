import fs from 'node:fs';
import path from 'node:path';

// Source contracts inspect the implementation closure after facade extraction.
export function readGroupRunnerSource(projectRoot: string): string {
  return [
    'utils/product-center-group-runner.ts',
    'adapters/product-center/product-center-group-combo-v2-cases.ts',
    'adapters/product-center/product-center-group-combo-v2-support.ts',
  ].map((file) => fs.readFileSync(path.join(projectRoot, file), 'utf8')).join('\n');
}
