import fs from 'node:fs';
import path from 'node:path';

export type RecipeCollectionManifestEntry = {
  id: string;
  recipePath: string;
  feedbackPath: string;
  evidencePath: string;
};

export type RecipeCollectionManifest = {
  schemaVersion: '1.0.0';
  collections: RecipeCollectionManifestEntry[];
};

export function validateRecipeCollectionManifest(input: unknown): {
  valid: boolean;
  issues: string[];
  manifest?: RecipeCollectionManifest;
} {
  const issues: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, issues: ['清单必须是对象'] };
  const value = input as Record<string, unknown>;
  if (value.schemaVersion !== '1.0.0') issues.push('schemaVersion 必须为 1.0.0');
  if (!Array.isArray(value.collections)) return { valid: false, issues: [...issues, 'collections 必须是数组'] };
  const ids = new Set<string>();
  for (const [index, item] of value.collections.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      issues.push(`collections[${index}] 必须是对象`);
      continue;
    }
    const entry = item as Record<string, unknown>;
    const id = typeof entry.id === 'string' ? entry.id : '';
    if (!id) issues.push(`collections[${index}].id 必须是非空字符串`);
    if (ids.has(id)) issues.push(`Recipe 集合 ID 重复：${id}`);
    ids.add(id);
    for (const key of ['recipePath', 'feedbackPath', 'evidencePath'] as const) {
      if (!isSafeRelativePath(entry[key])) issues.push(`collections[${index}].${key} 必须是工作区内相对路径`);
    }
  }
  return issues.length === 0
    ? { valid: true, issues, manifest: input as RecipeCollectionManifest }
    : { valid: false, issues };
}

export function loadRecipeCollectionManifest(manifestPath: string): RecipeCollectionManifest {
  const validation = validateRecipeCollectionManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
  if (!validation.valid || !validation.manifest) throw new Error(`Recipe 集合清单无效：${validation.issues.join('；')}`);
  return validation.manifest;
}

function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value)) return false;
  return !value.split(/[\\/]+/).includes('..');
}
