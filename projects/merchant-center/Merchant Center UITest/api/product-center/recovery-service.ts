import type { ProductCenterApi } from './product-center-api';
import type {
  ProductCenterExecutionLedger,
  ProductCenterLedgerEntry,
  ProductCenterLedgerEntityKind,
} from './execution-ledger';

export type ProductCenterRecoveryRecord = {
  id: number | string;
  name: string;
};

export type ProductCenterRecoveryAdapter = {
  find: (entry: ProductCenterLedgerEntry) => Promise<ProductCenterRecoveryRecord | undefined>;
  delete: (entry: ProductCenterLedgerEntry, record: ProductCenterRecoveryRecord) => Promise<void>;
};

export type ProductCenterRecoveryResult = {
  recoveredEntryIds: string[];
  alreadyAbsentEntryIds: string[];
  failedEntryIds: string[];
};

export class ProductCenterRecoveryService {
  constructor(
    private readonly ledger: ProductCenterExecutionLedger,
    private readonly adapter: ProductCenterRecoveryAdapter,
  ) {}

  async recoverIncomplete(): Promise<ProductCenterRecoveryResult> {
    const result: ProductCenterRecoveryResult = {
      recoveredEntryIds: [],
      alreadyAbsentEntryIds: [],
      failedEntryIds: [],
    };

    const entries = [...this.ledger.incompleteEntries()].sort((left, right) => (
      right.cleanupOrder - left.cleanupOrder
    ));
    for (const entry of entries) {
      try {
        this.ledger.markPhase(entry.entryId, 'cleaning');
        const record = await this.adapter.find(entry);
        if (!record) {
          this.ledger.markPhase(entry.entryId, 'cleaned');
          this.ledger.markPhase(entry.entryId, 'residue-verified');
          result.alreadyAbsentEntryIds.push(entry.entryId);
          continue;
        }
        assertRecoveryIdentity(entry, record);
        await this.adapter.delete(entry, record);
        const residue = await this.adapter.find(entry);
        if (residue) throw new Error(`恢复清理后仍有残留：${entry.entryId}`);
        this.ledger.markPhase(entry.entryId, 'cleaned');
        this.ledger.markPhase(entry.entryId, 'residue-verified');
        result.recoveredEntryIds.push(entry.entryId);
      } catch (error) {
        this.ledger.markFailed(entry.entryId, {
          classification: 'recovery-error',
          message: safeDiagnostic(error),
        });
        result.failedEntryIds.push(entry.entryId);
      }
    }
    return result;
  }
}

export class ProductCenterApiRecoveryAdapter implements ProductCenterRecoveryAdapter {
  constructor(private readonly api: ProductCenterApi) {}

  async find(entry: ProductCenterLedgerEntry): Promise<ProductCenterRecoveryRecord | undefined> {
    if (entry.entityKind === 'item' || entry.entityKind === 'bom-product') {
      const id = Number(entry.serverId);
      if (Number.isFinite(id)) {
        const detail = await this.api.productDetail(id).catch((error: unknown) => {
          if (/item id not exist|HTTP 404/i.test(String(error))) return undefined;
          throw error;
        });
        if (detail && readProductDetailId(detail) === id) {
          return { id, name: entry.identity };
        }
      }
    }
    for (const identity of entry.identityVariants) {
      const record = await this.findByIdentity(entry.entityKind, identity);
      if (record && String(record.id) === String(entry.serverId)) return record;
    }
    return undefined;
  }

  async delete(entry: ProductCenterLedgerEntry, record: ProductCenterRecoveryRecord): Promise<void> {
    const id = Number(record.id);
    if (!Number.isFinite(id)) throw new Error(`恢复服务端 ID 无效：${entry.entryId}`);
    switch (entry.entityKind) {
      case 'category':
      case 'material-category': await this.api.deleteCategory(id); return;
      case 'method':
      case 'taste': await this.api.deleteMethod(id); return;
      case 'material': await this.api.deleteMaterial(id); return;
      case 'seasoning': await this.api.deleteSeasoning(id); return;
      case 'bom': await this.api.deleteBom(id); return;
      case 'bom-product': await this.api.deleteBomProduct(id); return;
      case 'item': await this.api.deleteBomProduct(id); return;
      case 'brand-image': await this.api.deleteBrandImage(id); return;
      case 'recipe-ingredient': await this.api.deleteRecipeIngredient(id); return;
      case 'spec': await this.api.deleteSpec(id); return;
      case 'addon': await this.api.deleteAddonGroup(id); return;
      case 'print-stall': await this.api.deletePrintStall(id); return;
      case 'tax': await this.api.deleteTax(id); return;
      case 'description-tag':
      case 'statistic-tag': await this.api.deleteTag(id); return;
      case 'tag-group': await this.api.deleteTagGroup(id); return;
      case 'corner-mark': await this.api.deleteCornerMark(id); return;
      case 'menu': await this.api.deleteMenu(id); return;
      case 'menu-block': await this.api.deleteMenuBlock(id); return;
      case 'printer': await this.api.deletePrinter(String(record.id)); return;
      case 'combo': await this.api.deleteComboGroup(id); return;
      default: throw new Error(`恢复适配器尚未支持实体：${entry.entityKind}`);
    }
  }

  private async findByIdentity(
    entityKind: ProductCenterLedgerEntityKind,
    identity: string,
  ): Promise<ProductCenterRecoveryRecord | undefined> {
    const value = await queryRecoverySource(this.api, entityKind, identity);
    return findRecoveryRecord(value, identity);
  }
}

function assertRecoveryIdentity(
  entry: ProductCenterLedgerEntry,
  record: ProductCenterRecoveryRecord,
): void {
  if (!record.name.startsWith('AUTO_AUDIT_')) {
    throw new Error(`禁止恢复非审计数据：${record.name}`);
  }
  if (!entry.identityVariants.includes(record.name)) {
    throw new Error(`恢复身份不匹配：${entry.entryId}`);
  }
}

async function queryRecoverySource(
  api: ProductCenterApi,
  entityKind: ProductCenterLedgerEntityKind,
  identity: string,
): Promise<unknown> {
  switch (entityKind) {
    case 'category': return api.categoryTree();
    case 'material-category': return api.materialCategoryTree();
    case 'method': return api.methodPage(identity);
    case 'taste': return api.tastePage(identity);
    case 'material': return api.materialPage(identity);
    case 'seasoning': return api.seasoningList();
    case 'bom': return api.bomPage(identity);
    case 'bom-product': return api.productPage(identity);
    case 'item': return api.productPage(identity);
    case 'brand-image': return api.brandImageList(identity);
    case 'recipe-ingredient': return api.recipeIngredientList();
    case 'spec': return api.specPage(identity);
    case 'addon': return api.addonGroupList(identity);
    case 'print-stall': return api.printStallPage(identity);
    case 'tax': return api.taxPage(identity);
    case 'description-tag': return api.tagPage(1);
    case 'statistic-tag': return api.tagPage(3);
    case 'tag-group': return [await api.tagGroupList(1), await api.tagGroupList(3)];
    case 'corner-mark': return api.cornerMarkPage(identity);
    case 'menu': return api.menuPage(identity);
    case 'menu-block': return api.menuBlockSearch(identity);
    case 'printer': return api.printerPage(identity);
    case 'combo': return api.comboGroupList();
    default: throw new Error(`恢复查询尚未支持实体：${entityKind}`);
  }
}

function findRecoveryRecord(value: unknown, identity: string): ProductCenterRecoveryRecord | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findRecoveryRecord(item, identity);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (
    (typeof record.id === 'number' || typeof record.id === 'string') &&
    ((typeof record.name === 'string' && normalizeIdentity(record.name) === normalizeIdentity(identity)) ||
      record.shortName === identity)
  ) {
    return { id: record.id, name: identity };
  }
  for (const child of Object.values(record)) {
    const match = findRecoveryRecord(child, identity);
    if (match) return match;
  }
  return undefined;
}

function normalizeIdentity(value: string): string {
  return value.replace(/\\_/g, '_');
}

function readProductDetailId(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const response = value as Record<string, unknown>;
  const data = response.data && typeof response.data === 'object'
    ? response.data as Record<string, unknown>
    : undefined;
  const itemBasic = data?.itemBasic && typeof data.itemBasic === 'object'
    ? data.itemBasic as Record<string, unknown>
    : undefined;
  const id = Number(itemBasic?.id ?? data?.id ?? response.id);
  return Number.isFinite(id) ? id : undefined;
}
function safeDiagnostic(error: unknown): string {
  return String(error)
    .replace(/bearer\s+[^\s]+/gi, 'Bearer <redacted>')
    .replace(/(authorization|password|cookie|token)\s*[:=]\s*[^,;\s]+/gi, '$1=<redacted>');
}
