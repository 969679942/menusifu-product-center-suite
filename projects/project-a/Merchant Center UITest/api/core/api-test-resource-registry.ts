export type ApiTestResourceId = string | number;

export type ApiTestResource = {
  type: string;
  id: ApiTestResourceId;
  name?: string;
  cleanupPriority: number;
  cleanup: () => Promise<unknown> | unknown;
};

export type ApiTestResourceSnapshot = Pick<ApiTestResource, 'type' | 'id' | 'name'>;

export type ApiTestCleanupResult = {
  cleaned: ApiTestResourceSnapshot[];
  errors: Array<{ resource: ApiTestResourceSnapshot; message: string }>;
};

export class ApiTestResourceRegistry {
  private readonly resources: ApiTestResource[] = [];

  register(resource: ApiTestResource): void {
    if (this.has(resource.type, resource.id)) {
      throw new Error(`API 测试资源重复登记：${resource.type}#${String(resource.id)}。`);
    }
    this.resources.push(resource);
  }

  has(type: string, id: ApiTestResourceId): boolean {
    return this.resources.some((resource) => resource.type === type && resource.id === id);
  }

  markCleaned(type: string, id: ApiTestResourceId): boolean {
    const index = this.resources.findIndex((resource) => resource.type === type && resource.id === id);
    if (index < 0) return false;
    this.resources.splice(index, 1);
    return true;
  }

  async cleanupAll(): Promise<ApiTestCleanupResult> {
    const cleaned: ApiTestResourceSnapshot[] = [];
    const errors: ApiTestCleanupResult['errors'] = [];
    const groups = new Map<number, ApiTestResource[]>();
    for (const resource of this.resources.splice(0)) {
      groups.set(resource.cleanupPriority, [...(groups.get(resource.cleanupPriority) ?? []), resource]);
    }

    for (const [, resources] of [...groups.entries()].sort(([left], [right]) => right - left)) {
      const outcomes = await Promise.allSettled(resources.map(async (resource) => {
        await resource.cleanup();
        return resource;
      }));
      for (const [index, outcome] of outcomes.entries()) {
        const resource = resources[index];
        if (outcome.status === 'fulfilled') cleaned.push(snapshot(resource));
        else errors.push({ resource: snapshot(resource), message: safeMessage(outcome.reason) });
      }
    }
    return { cleaned, errors };
  }
}

export function assertApiTestCleanupSucceeded(result: ApiTestCleanupResult): void {
  if (result.errors.length === 0) return;
  throw new Error(`API 测试资源清理失败：${result.errors.map(({ resource, message }) => `${resource.type}#${String(resource.id)} ${message}`).join('; ')}`);
}

function snapshot(resource: ApiTestResource): ApiTestResourceSnapshot {
  return resource.name
    ? { type: resource.type, id: resource.id, name: resource.name }
    : { type: resource.type, id: resource.id };
}

function safeMessage(error: unknown): string {
  return String(error)
    .replace(/eyJ[a-z0-9_-]{10,}\.[a-z0-9._-]+/gi, '<redacted>')
    .replace(/bearer\s+[^\s,;]+/gi, '<redacted>')
    .replace(/(authorization|password|cookie|token)\s*[:=]\s*[^,;\s]+/gi, '$1=<redacted>');
}
