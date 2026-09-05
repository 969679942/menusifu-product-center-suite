import type { CleanupRegistry } from '../../../api/product-center/cleanup-registry';
import { extractCreatedRecord } from '../../../api/product-center/created-record';
import type { ProductCenterApi } from '../../../api/product-center/product-center-api';
import type { LowDependencyEntityKey } from '../../../sop/product-center/product-center-low-dependency-sop.catalog';
import { createAuditIdentity, nextAuditTimestamp, type AuditEntity } from '../audit-identity';

export type LowDependencySeedRecord = {
  entityKey: LowDependencyEntityKey;
  id: number;
  originalIdentity: string;
  editedIdentity: string;
  checkpointEntryId: string;
  metadata: Readonly<Record<string, number | string>>;
};

export type DescriptionTagBoundarySeed = {
  groupId: number;
  groupName: string;
  tags: Array<{ id: number; name: string; checkpointEntryId: string }>;
};

export type CornerMarkBoundarySeed = {
  marks: Array<{ id: number; name: string; checkpointEntryId: string }>;
};

export type UpdateIsolationRuleSeed = {
  kind: 'flavor' | 'recipe' | 'additives';
  id: number;
  name: string;
  optionNames: string[];
  checkpointEntryId: string;
};

export type UpdateIsolationSeed = {
  flavor: UpdateIsolationRuleSeed;
  recipe: UpdateIsolationRuleSeed;
  additives: UpdateIsolationRuleSeed;
  dependencyProducts: Array<{ id: number; name: string; checkpointEntryId: string }>;
};

type NamedRecord = { id: number; name: string } & Record<string, unknown>;

const auditEntityByKey: Record<LowDependencyEntityKey, AuditEntity> = {
  'material-category': 'MATERIAL_CATEGORY', taste: 'TASTE', spec: 'SPEC', addon: 'ADDITIONAL',
  'print-stall': 'STALL', tax: 'TAX', 'description-tag': 'DESCRIPTION_TAG', 'statistic-tag': 'STAT_TAG',
};

export class ProductCenterLowDependencyDataFactory {
  constructor(private readonly api: ProductCenterApi) {}

  async seedSpecWithOptions(
    cleanupRegistry: CleanupRegistry,
    optionNames: readonly string[],
  ): Promise<LowDependencySeedRecord> {
    if (optionNames.length < 2) throw new Error('多规格审计至少需要两个规格项');
    const identity = createAuditIdentity('SPEC');
    const response = await this.api.createSpec({
      name: identity.marker,
      secondName: '多规格审计',
      optionName: optionNames[0],
      optionNames,
    });
    const record = extractCreatedRecord(response, identity.marker) ?? await this.find('spec', identity.marker);
    return this.register(
      'spec',
      requireRecord(record, identity.marker),
      identity.marker,
      identity.editedMarker,
      cleanupRegistry,
      { optionNames: optionNames.join('|') },
    );
  }

  async seedDescriptionTagBoundaryScenario(
    cleanupRegistry: CleanupRegistry,
  ): Promise<DescriptionTagBoundarySeed> {
    const timestamp = nextAuditTimestamp();
    const groupName = `AUTO_AUDIT_TAG_GROUP_BOUNDARY_${timestamp}`;
    const groupResponse = await this.api.createTagGroup({ name: groupName, type: 1 });
    const group = normalizeRecord(groupResponse, groupName)
      ?? findNamed(await this.api.tagGroupList(1), groupName);
    const requiredGroup = requireRecord(group, groupName);
    cleanupRegistry.register({
      entity: 'description-tag标签组',
      identity: groupName,
      checkpoint: {
        entryId: `tag-group-${requiredGroup.id}`,
        entityKind: 'tag-group',
        serverId: requiredGroup.id,
        identityVariants: [groupName],
        cleanupOrder: 10,
      },
      execute: async () => {
        const residue = findNamed(await this.api.tagGroupList(1), groupName);
        if (residue) await this.api.deleteTagGroup(residue.id);
      },
      verify: async () => !findNamed(await this.api.tagGroupList(1), groupName),
    });

    const tags: DescriptionTagBoundarySeed['tags'] = [];
    for (let index = 1; index <= 6; index += 1) {
      const name = `AUTO_AUDIT_DESCRIPTION_TAG_BOUNDARY_${timestamp}_${index}`;
      const response = await this.api.createDescriptionTag({ name, groupId: requiredGroup.id });
      const record = normalizeRecord(response, name) ?? await this.find('description-tag', name);
      const requiredTag = requireRecord(record, name);
      const checkpointEntryId = `description-tag-${requiredTag.id}`;
      cleanupRegistry.register({
        entity: 'description-tag',
        identity: name,
        checkpoint: {
          entryId: checkpointEntryId,
          entityKind: 'description-tag',
          serverId: requiredTag.id,
          identityVariants: [name],
          cleanupOrder: 20,
          dependencyOf: `tag-group-${requiredGroup.id}`,
        },
        execute: async () => {
          const residue = await this.find('description-tag', name);
          if (residue) await this.api.deleteTag(residue.id);
        },
        verify: async () => !(await this.find('description-tag', name)),
      });
      tags.push({ id: requiredTag.id, name, checkpointEntryId });
    }
    return { groupId: requiredGroup.id, groupName, tags };
  }

  async seedCornerMarkBoundaryScenario(
    cleanupRegistry: CleanupRegistry,
  ): Promise<CornerMarkBoundarySeed> {
    const timestamp = nextAuditTimestamp();
    const marks: CornerMarkBoundarySeed['marks'] = [];
    for (let index = 1; index <= 2; index += 1) {
      const name = `AUTO_AUDIT_CORNER_MARK_BOUNDARY_${timestamp}_${index}`;
      const response = await this.api.createCornerMark({ name, sortOrder: index });
      const record = normalizeRecord(response, name)
        ?? findNamed(await this.api.cornerMarkPage(name), name);
      const requiredMark = requireRecord(record, name);
      const checkpointEntryId = `corner-mark-${requiredMark.id}`;
      cleanupRegistry.register({
        entity: 'corner-mark',
        identity: name,
        checkpoint: {
          entryId: checkpointEntryId,
          entityKind: 'corner-mark',
          serverId: requiredMark.id,
          identityVariants: [name],
          cleanupOrder: 20,
        },
        execute: async () => {
          const residue = findNamed(await this.api.cornerMarkPage(name), name);
          if (residue) await this.api.deleteCornerMark(residue.id);
        },
        verify: async () => !findNamed(await this.api.cornerMarkPage(name), name),
      });
      marks.push({ id: requiredMark.id, name, checkpointEntryId });
    }
    return { marks };
  }

  async seedMultiOptionRuleGroupScenario(
    cleanupRegistry: CleanupRegistry,
  ): Promise<LowDependencySeedRecord> {
    const identity = createAuditIdentity('TASTE');
    const optionNames = [
      `AUTO_AUDIT_TASTE_OPTION_${identity.timestamp}_A`,
      `AUTO_AUDIT_TASTE_OPTION_${identity.timestamp}_B`,
    ];
    const response = await this.api.createTaste({
      name: identity.marker,
      secondName: '双选项口味审计',
      optionName: optionNames[0],
      optionNames,
    });
    const record = extractCreatedRecord(response, identity.marker)
      ?? await this.find('taste', identity.marker);
    return this.register(
      'taste',
      requireRecord(record, identity.marker),
      identity.marker,
      identity.editedMarker,
      cleanupRegistry,
      { optionNames: optionNames.join('|') },
    );
  }

  async seedTasteWithOptions(
    cleanupRegistry: CleanupRegistry,
    optionNames: readonly string[],
  ): Promise<LowDependencySeedRecord> {
    if (optionNames.length < 2) throw new Error('多选项口味审计至少需要两个口味项');
    const identity = createAuditIdentity('TASTE');
    const response = await this.api.createTaste({
      name: identity.marker,
      secondName: '多选项口味审计',
      optionName: optionNames[0],
      optionNames,
    });
    const record = extractCreatedRecord(response, identity.marker) ?? await this.find('taste', identity.marker);
    return this.register(
      'taste',
      requireRecord(record, identity.marker),
      identity.marker,
      identity.editedMarker,
      cleanupRegistry,
      { optionNames: optionNames.join('|') },
    );
  }

  async seedUpdateIsolationScenario(
    cleanupRegistry: CleanupRegistry,
  ): Promise<UpdateIsolationSeed> {
    const timestamp = nextAuditTimestamp();
    const flavor = await this.createUpdateIsolationModifier('flavor', timestamp, cleanupRegistry);
    const recipe = await this.createUpdateIsolationModifier('recipe', timestamp, cleanupRegistry);
    const dependencyProducts: UpdateIsolationSeed['dependencyProducts'] = [];

    for (const suffix of ['A', 'B'] as const) {
      const name = `AUTO_AUDIT_W6_ADDON_OPTION_${timestamp}_${suffix}`;
      const response = await this.api.createBomProduct(name);
      const record = normalizeRecord(response, name)
        ?? findNamed(await this.api.productPage(name), name);
      const requiredRecord = requireRecord(record, name);
      const checkpointEntryId = `bom-product-${requiredRecord.id}`;
      cleanupRegistry.register({
        entity: 'W6加料组选项商品',
        identity: name,
        checkpoint: {
          entryId: checkpointEntryId,
          entityKind: 'bom-product',
          serverId: requiredRecord.id,
          identityVariants: [name],
          cleanupOrder: 10,
        },
        execute: async () => {
          const residue = findNamed(await this.api.productPage(name), name);
          if (residue) await this.api.deleteBomProduct(residue.id);
        },
        verify: async () => !findNamed(await this.api.productPage(name), name),
      });
      dependencyProducts.push({ id: requiredRecord.id, name, checkpointEntryId });
    }

    const addonName = `AUTO_AUDIT_W6_ADDON_GROUP_${timestamp}`;
    const addonResponse = await this.api.createAddonGroup({
      name: addonName,
      secondName: 'W6更新隔离加料组',
      itemIds: dependencyProducts.map((product) => product.id),
    });
    const addonRecord = normalizeRecord(addonResponse, addonName)
      ?? findNamed(await this.api.addonGroupList(addonName), addonName);
    const requiredAddon = requireRecord(addonRecord, addonName);
    const addonCheckpointEntryId = `addon-${requiredAddon.id}`;
    cleanupRegistry.register({
      entity: 'W6更新隔离加料组',
      identity: addonName,
      checkpoint: {
        entryId: addonCheckpointEntryId,
        entityKind: 'addon',
        serverId: requiredAddon.id,
        identityVariants: [addonName],
        cleanupOrder: 40,
        dependencyOf: dependencyProducts.map((product) => product.checkpointEntryId).join(','),
      },
      execute: async () => {
        const residue = findNamed(await this.api.addonGroupList(addonName), addonName);
        if (residue) await this.api.deleteAddonGroup(residue.id);
      },
      verify: async () => !findNamed(await this.api.addonGroupList(addonName), addonName),
    });

    return {
      flavor,
      recipe,
      additives: {
        kind: 'additives',
        id: requiredAddon.id,
        name: addonName,
        optionNames: dependencyProducts.map((product) => product.name),
        checkpointEntryId: addonCheckpointEntryId,
      },
      dependencyProducts,
    };
  }

  async seed(entityKey: LowDependencyEntityKey, cleanupRegistry: CleanupRegistry): Promise<LowDependencySeedRecord> {
    const identity = createAuditIdentity(auditEntityByKey[entityKey]);
    if (entityKey === 'material-category') {
      const response = await this.api.createMaterialCategory({ name: identity.marker, secondName: '原料分类审计' });
      const record = extractCreatedRecord(response, identity.marker) ?? await this.find(entityKey, identity.marker);
      return this.register(entityKey, requireRecord(record, identity.marker), identity.marker, identity.editedMarker, cleanupRegistry);
    }
    if (entityKey === 'taste') {
      const response = await this.api.createTaste({ name: identity.marker, secondName: '口味审计', optionName: `AUTO_AUDIT_TASTE_OPTION_${identity.timestamp}` });
      const record = extractCreatedRecord(response, identity.marker) ?? await this.find(entityKey, identity.marker);
      return this.register(entityKey, requireRecord(record, identity.marker), identity.marker, identity.editedMarker, cleanupRegistry);
    }
    if (entityKey === 'spec') {
      const response = await this.api.createSpec({ name: identity.marker, secondName: '规格审计', optionName: `AUTO_AUDIT_SPEC_OPTION_${identity.timestamp}` });
      const record = extractCreatedRecord(response, identity.marker) ?? await this.find(entityKey, identity.marker);
      return this.register(entityKey, requireRecord(record, identity.marker), identity.marker, identity.editedMarker, cleanupRegistry);
    }
    if (entityKey === 'addon') {
      const productIdentity = `AUTO_AUDIT_ADDON_ITEM_${identity.timestamp}`;
      const productResponse = await this.api.createBomProduct(productIdentity);
      const product = normalizeRecord(productResponse, productIdentity) ?? findNamed(await this.api.productPage(productIdentity), productIdentity);
      const requiredProduct = requireRecord(product, productIdentity);
      cleanupRegistry.register({
        entity: '加料组商品依赖', identity: productIdentity,
        checkpoint: { entryId: `bom-product-${requiredProduct.id}`, entityKind: 'bom-product', serverId: requiredProduct.id, identityVariants: [productIdentity], cleanupOrder: 10 },
        execute: async () => { const residue = findNamed(await this.api.productPage(productIdentity), productIdentity); if (residue) await this.api.deleteBomProduct(residue.id); },
        verify: async () => !findNamed(await this.api.productPage(productIdentity), productIdentity),
      });
      const response = await this.api.createAddonGroup({ name: identity.marker, secondName: '加料审计', itemId: requiredProduct.id });
      const record = extractCreatedRecord(response, identity.marker) ?? await this.find(entityKey, identity.marker);
      return this.register(entityKey, requireRecord(record, identity.marker), identity.marker, identity.editedMarker, cleanupRegistry, { productId: requiredProduct.id, productIdentity });
    }
    if (entityKey === 'print-stall') {
      const response = await this.api.createPrintStall({ name: identity.marker, remark: 'AUTO_AUDIT 品牌打印档口' });
      const record = normalizeRecord(response, identity.marker) ?? await this.find(entityKey, identity.marker);
      return this.register(entityKey, requireRecord(record, identity.marker), identity.marker, identity.editedMarker, cleanupRegistry);
    }
    if (entityKey === 'tax') {
      const response = await this.api.createTax({ name: identity.marker, rate: 5 });
      const record = extractCreatedRecord(response, identity.marker) ?? await this.find(entityKey, identity.marker);
      return this.register(entityKey, requireRecord(record, identity.marker), identity.marker, identity.editedMarker, cleanupRegistry, { rate: 5 });
    }
    return this.seedTag(entityKey, identity.marker, identity.editedMarker, cleanupRegistry);
  }

  async seedDescriptionTagDeletionScenario(
    cleanupRegistry: CleanupRegistry,
  ): Promise<LowDependencySeedRecord> {
    const targetIdentity = createAuditIdentity('DESCRIPTION_TAG');
    const referencedTagIdentity = `AUTO_AUDIT_DESCRIPTION_TAG_REFERENCED_${nextAuditTimestamp()}`;
    const productIdentity = `AUTO_AUDIT_DESCRIPTION_TAG_PRODUCT_${nextAuditTimestamp()}`;
    const groupName = `AUTO_AUDIT_TAG_GROUP_${nextAuditTimestamp()}`;
    const groupResponse = await this.api.createTagGroup({ name: groupName, type: 1 });
    const group = normalizeRecord(groupResponse, groupName)
      ?? findNamed(await this.api.tagGroupList(1), groupName);
    const requiredGroup = requireRecord(group, groupName);
    cleanupRegistry.register({
      entity: 'description-tag标签组',
      identity: groupName,
      checkpoint: {
        entryId: `tag-group-${requiredGroup.id}`,
        entityKind: 'tag-group',
        serverId: requiredGroup.id,
        identityVariants: [groupName],
        cleanupOrder: 10,
      },
      execute: async () => {
        const residue = findNamed(await this.api.tagGroupList(1), groupName);
        if (residue) await this.api.deleteTagGroup(residue.id);
      },
      verify: async () => !findNamed(await this.api.tagGroupList(1), groupName),
    });

    const referencedTagResponse = await this.api.createDescriptionTag({
      name: referencedTagIdentity,
      groupId: requiredGroup.id,
    });
    const referencedTag = normalizeRecord(referencedTagResponse, referencedTagIdentity)
      ?? await this.find('description-tag', referencedTagIdentity);
    const requiredReferencedTag = requireRecord(referencedTag, referencedTagIdentity);
    cleanupRegistry.register({
      entity: 'description-tag引用标签',
      identity: referencedTagIdentity,
      checkpoint: {
        entryId: `description-tag-reference-${requiredReferencedTag.id}`,
        entityKind: 'description-tag',
        serverId: requiredReferencedTag.id,
        identityVariants: [referencedTagIdentity],
        cleanupOrder: 20,
      },
      execute: async () => {
        const residue = await this.find('description-tag', referencedTagIdentity);
        if (residue) await this.api.deleteTag(residue.id);
      },
      verify: async () => !(await this.find('description-tag', referencedTagIdentity)),
    });

    const productResponse = await this.api.createBomProduct(productIdentity);
    const product = normalizeRecord(productResponse, productIdentity)
      ?? findNamed(await this.api.productPage(productIdentity), productIdentity);
    const requiredProduct = requireRecord(product, productIdentity);
    cleanupRegistry.register({
      entity: '描述标签引用商品',
      identity: productIdentity,
      checkpoint: {
        entryId: `bom-product-${requiredProduct.id}`,
        entityKind: 'bom-product',
        serverId: requiredProduct.id,
        identityVariants: [productIdentity],
        cleanupOrder: 30,
      },
      execute: async () => {
        const residue = findNamed(await this.api.productPage(productIdentity), productIdentity);
        if (residue) await this.api.deleteBomProduct(residue.id);
      },
      verify: async () => !findNamed(await this.api.productPage(productIdentity), productIdentity),
    });
    await this.api.bindDescriptionTagToProduct({
      itemId: requiredProduct.id,
      groupId: requiredGroup.id,
      tagId: requiredReferencedTag.id,
    });
    const tagGroups = await this.api.brandItemTagGroupList({
      itemId: requiredProduct.id,
      groupId: requiredGroup.id,
    });
    if (!hasDescriptionTagReference(tagGroups, requiredGroup.id, requiredReferencedTag.id)) {
      throw new Error('描述标签删除前置准备失败：商品未关联同组引用标签');
    }

    const targetResponse = await this.api.createDescriptionTag({
      name: targetIdentity.marker,
      groupId: requiredGroup.id,
    });
    const target = normalizeRecord(targetResponse, targetIdentity.marker)
      ?? await this.find('description-tag', targetIdentity.marker);
    return this.register(
      'description-tag',
      requireRecord(target, targetIdentity.marker),
      targetIdentity.marker,
      targetIdentity.editedMarker,
      cleanupRegistry,
      {
        groupId: requiredGroup.id,
        referencedTagId: requiredReferencedTag.id,
        targetTagId: requireRecord(target, targetIdentity.marker).id,
        productId: requiredProduct.id,
        groupTagCount: 2,
        referencedTagCount: 1,
        targetReferenceCount: 0,
        productReferenceVerified: 1,
      },
    );
  }

  async find(entityKey: LowDependencyEntityKey, identity: string): Promise<NamedRecord | undefined> {
    if (entityKey === 'material-category') return findNamed(await this.api.materialCategoryTree(), identity);
    if (entityKey === 'taste') return findNamed(await this.api.tastePage(identity), identity);
    if (entityKey === 'spec') return findNamed(await this.api.specPage(identity), identity);
    if (entityKey === 'addon') return findNamed(await this.api.addonGroupList(identity), identity);
    if (entityKey === 'print-stall') return findNamed(await this.api.printStallPage(identity), identity);
    if (entityKey === 'tax') return findNamed(await this.api.taxPage(identity), identity);
    return findNamed(await this.api.tagPage(entityKey === 'description-tag' ? 1 : 3), identity);
  }

  async verifyEdited(record: LowDependencySeedRecord): Promise<boolean> {
    if (record.entityKey === 'addon') {
      const detail = findNamed(await this.api.addonGroupDetail(record.id), record.editedIdentity);
      return detail?.id === record.id;
    }
    return (await this.find(record.entityKey, record.editedIdentity))?.id === record.id &&
      !(await this.find(record.entityKey, record.originalIdentity));
  }

  async verifyAbsent(record: LowDependencySeedRecord): Promise<boolean> {
    return !(await this.find(record.entityKey, record.originalIdentity)) &&
      !(await this.find(record.entityKey, record.editedIdentity));
  }

  private async seedTag(
    entityKey: 'description-tag' | 'statistic-tag',
    originalIdentity: string,
    editedIdentity: string,
    cleanupRegistry: CleanupRegistry,
  ): Promise<LowDependencySeedRecord> {
    const type = entityKey === 'description-tag' ? 1 : 3;
    const groupName = `AUTO_AUDIT_TAG_GROUP_${nextAuditTimestamp()}`;
    const groupResponse = await this.api.createTagGroup({ name: groupName, type });
    const group = normalizeRecord(groupResponse, groupName) ?? findNamed(await this.api.tagGroupList(type), groupName);
    const requiredGroup = requireRecord(group, groupName);
    cleanupRegistry.register({
      entity: `${entityKey}标签组`, identity: groupName,
      checkpoint: { entryId: `tag-group-${requiredGroup.id}`, entityKind: 'tag-group', serverId: requiredGroup.id, identityVariants: [groupName], cleanupOrder: 10 },
      execute: async () => { const residue = findNamed(await this.api.tagGroupList(type), groupName); if (residue) await this.api.deleteTagGroup(residue.id); },
      verify: async () => !findNamed(await this.api.tagGroupList(type), groupName),
    });
    const response = entityKey === 'description-tag'
      ? await this.api.createDescriptionTag({ name: originalIdentity, groupId: requiredGroup.id })
      : await this.api.createStatTag({ name: originalIdentity, groupId: requiredGroup.id });
    const record = normalizeRecord(response, originalIdentity) ?? await this.find(entityKey, originalIdentity);
    return this.register(entityKey, requireRecord(record, originalIdentity), originalIdentity, editedIdentity, cleanupRegistry, { groupId: requiredGroup.id, groupName, type });
  }

  private async createUpdateIsolationModifier(
    kind: 'flavor' | 'recipe' | 'additives',
    timestamp: number,
    cleanupRegistry: CleanupRegistry,
  ): Promise<UpdateIsolationRuleSeed> {
    if (kind === 'additives') throw new Error('加料组由 seedUpdateIsolationScenario 单独创建。');
    const label = kind === 'flavor' ? 'FLAVOR' : 'METHOD';
    const name = `AUTO_AUDIT_W6_${label}_GROUP_${timestamp}`;
    const optionNames = [
      `AUTO_AUDIT_W6_${label}_OPTION_${timestamp}_A`,
      `AUTO_AUDIT_W6_${label}_OPTION_${timestamp}_B`,
    ];
    const response = kind === 'flavor'
      ? await this.api.createTaste({ name, secondName: 'W6更新隔离口味组', optionName: optionNames[0], optionNames })
      : await this.api.createMethod({ name, secondName: 'W6更新隔离做法组', optionName: optionNames[0], optionNames });
    const record = normalizeRecord(response, name)
      ?? findNamed(kind === 'flavor' ? await this.api.tastePage(name) : await this.api.methodPage(name), name);
    const requiredRecord = requireRecord(record, name);
    const checkpointEntryId = `${kind}-${requiredRecord.id}`;
    cleanupRegistry.register({
      entity: `W6更新隔离${kind}`,
      identity: name,
      checkpoint: {
        entryId: checkpointEntryId,
        entityKind: kind === 'flavor' ? 'taste' : 'method',
        serverId: requiredRecord.id,
        identityVariants: [name],
        cleanupOrder: 40,
      },
      execute: async () => {
        const residue = findNamed(
          kind === 'flavor' ? await this.api.tastePage(name) : await this.api.methodPage(name),
          name,
        );
        if (residue) await this.api.deleteMethod(residue.id);
      },
      verify: async () => !findNamed(
        kind === 'flavor' ? await this.api.tastePage(name) : await this.api.methodPage(name),
        name,
      ),
    });
    return { kind, id: requiredRecord.id, name, optionNames, checkpointEntryId };
  }

  private register(
    entityKey: LowDependencyEntityKey,
    record: NamedRecord,
    originalIdentity: string,
    editedIdentity: string,
    cleanupRegistry: CleanupRegistry,
    metadata: Readonly<Record<string, number | string>> = {},
  ): LowDependencySeedRecord {
    const checkpointEntryId = `${entityKey}-${record.id}`;
    cleanupRegistry.register({
      entity: entityKey, identity: originalIdentity,
      checkpoint: { entryId: checkpointEntryId, entityKind: entityKey, serverId: record.id, identityVariants: [originalIdentity, editedIdentity], cleanupOrder: 40 },
      execute: async () => { const residue = await this.find(entityKey, editedIdentity) ?? await this.find(entityKey, originalIdentity); if (residue) await this.delete(entityKey, residue.id); },
      verify: async () => !(await this.find(entityKey, originalIdentity)) && !(await this.find(entityKey, editedIdentity)),
    });
    return { entityKey, id: record.id, originalIdentity, editedIdentity, checkpointEntryId, metadata };
  }

  private async delete(entityKey: LowDependencyEntityKey, id: number): Promise<void> {
    if (entityKey === 'material-category') return void await this.api.deleteCategory(id);
    if (entityKey === 'taste') return void await this.api.deleteMethod(id);
    if (entityKey === 'spec') return void await this.api.deleteSpec(id);
    if (entityKey === 'addon') return void await this.api.deleteAddonGroup(id);
    if (entityKey === 'print-stall') return void await this.api.deletePrintStall(id);
    if (entityKey === 'tax') return void await this.api.deleteTax(id);
    await this.api.deleteTag(id);
  }
}

function findNamed(value: unknown, identity: string): NamedRecord | undefined {
  if (Array.isArray(value)) { for (const item of value) { const match = findNamed(item, identity); if (match) return match; } return undefined; }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.id === 'number' && typeof record.name === 'string' && normalizeIdentity(record.name) === normalizeIdentity(identity)) return record as NamedRecord;
  for (const child of Object.values(record)) { const match = findNamed(child, identity); if (match) return match; }
  return undefined;
}
function normalizeIdentity(value: string): string {
  return value.replace(/\\_/g, '_');
}function normalizeRecord(response: unknown, identity: string): NamedRecord | undefined {
  return extractCreatedRecord(response, identity);
}
function requireRecord(record: NamedRecord | undefined, identity: string): NamedRecord {
  if (!record) throw new Error(`未找到低依赖审计数据：${identity}`);
  return record;
}

function hasDescriptionTagReference(
  value: unknown,
  groupId: number,
  tagId: number,
): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasDescriptionTagReference(item, groupId, tagId));
  }
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.tagGroupId === groupId) {
    if (record.tagId === tagId) return true;
    if (Array.isArray(record.idList) && record.idList.includes(tagId)) return true;
    if (hasTagId(record.brandItemTagList, tagId)) return true;
  }
  return Object.values(record).some((child) => hasDescriptionTagReference(child, groupId, tagId));
}

function hasTagId(value: unknown, tagId: number): boolean {
  if (Array.isArray(value)) return value.some((item) => hasTagId(item, tagId));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.tagId === tagId || Object.values(record).some((child) => hasTagId(child, tagId));
}
