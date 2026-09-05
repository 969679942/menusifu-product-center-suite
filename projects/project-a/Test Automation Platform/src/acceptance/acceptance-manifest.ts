import { createHash } from 'node:crypto';

export type AcceptanceRoute = {
  path: string;
  name: string;
};

export type AcceptanceProjectManifest = {
  schemaVersion: '1.0.0';
  projectId: string;
  displayName: string;
  baseURL: string;
  markerPrefix: string;
  routes: readonly AcceptanceRoute[];
};

export function validateAcceptanceManifest(manifest: AcceptanceProjectManifest): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.projectId)) errors.push(`项目 ID 无效：${manifest.projectId}`);
  if (!manifest.displayName.trim()) errors.push('项目名称为空');
  try {
    const url = new URL(manifest.baseURL);
    if (!['http:', 'https:'].includes(url.protocol)) errors.push(`基础地址协议无效：${url.protocol}`);
  } catch {
    errors.push(`基础地址无效：${manifest.baseURL}`);
  }
  if (!manifest.markerPrefix || /\s/.test(manifest.markerPrefix)) errors.push('审计标识前缀无效');

  const seen = new Set<string>();
  for (const route of manifest.routes) {
    if (!route.path.startsWith('/') || route.path.startsWith('//') || route.path.includes('\\')) {
      errors.push(`路由必须是站内绝对路径：${route.path}`);
    } else {
      try {
        const base = new URL(manifest.baseURL);
        const resolved = new URL(route.path, base);
        if (resolved.origin !== base.origin) errors.push(`路由不得跨源：${route.path}`);
      } catch {
        errors.push(`路由无效：${route.path}`);
      }
    }
    if (!route.name.trim()) errors.push(`路由名称为空：${route.path}`);
    if (seen.has(route.path)) errors.push(`路由重复：${route.path}`);
    seen.add(route.path);
  }
  if (manifest.routes.length === 0) errors.push('路由清单为空');
  return errors;
}

export function fingerprintAcceptanceManifest(manifest: AcceptanceProjectManifest): string {
  const normalized = {
    schemaVersion: manifest.schemaVersion,
    projectId: manifest.projectId,
    baseURL: manifest.baseURL,
    markerPrefix: manifest.markerPrefix,
    routes: [...manifest.routes]
      .map((route) => ({ path: route.path, name: route.name }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
