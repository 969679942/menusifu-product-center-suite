export type AuditEntity = 'CATEGORY' | 'METHOD' | 'MATERIAL' | 'BOM' | 'SEASONING' | 'ITEM' | 'STALL' | 'SPEC' | 'TAX' | 'TASTE' | 'ADDITIONAL' | 'COMBO' | 'DESCRIPTION_TAG' | 'STAT_TAG' | 'MATERIAL_CATEGORY' | 'RECIPE_INGREDIENT' | 'MENU' | 'PRINTER' | 'STORE_SEASONING' | 'STORE_PRODUCT';

export type AuditIdentity = {
  marker: string;
  editedMarker: string;
  timestamp: number;
};

let auditSequence = 0;

export function nextAuditTimestamp(
  now = Date.now(),
  workerIndex = Number(process.env.TEST_WORKER_INDEX ?? 0),
): number {
  auditSequence = (auditSequence + 1) % 100;
  return now * 1_000 + workerIndex * 100 + auditSequence;
}

export function createAuditIdentity(entity: AuditEntity, timestamp = nextAuditTimestamp()): AuditIdentity {
  const marker = createAuditFieldValue(entity, 20, timestamp);
  return { marker, editedMarker: createEditedMarker(marker), timestamp };
}

export function createAuditFieldValue(
  entity: AuditEntity,
  maxLength: number,
  timestamp = nextAuditTimestamp(),
): string {
  if (!Number.isInteger(maxLength) || maxLength < 13) {
    throw new Error(`审计字段长度不足以容纳审计前缀：${entity}/${maxLength}`);
  }
  const code = entityCode(entity);
  const tokenLength = maxLength - `AUTO_AUDIT_${code}`.length;
  const compactTimestamp = Math.abs(timestamp).toString(36).slice(-tokenLength).toUpperCase();
  const value = `AUTO_AUDIT_${code}${compactTimestamp}`;
  if (value.length > maxLength) throw new Error(`审计身份超出字段长度：${entity}/${maxLength}`);
  return value;
}

export function createAuditFieldIdentity(
  entity: AuditEntity,
  maxLength: number,
  timestamp = nextAuditTimestamp(),
): AuditIdentity {
  const marker = createAuditFieldValue(entity, maxLength, timestamp);
  return { marker, editedMarker: createEditedMarker(marker), timestamp };
}

export function assertAuditIdentity(value: string): void {
  if (!value.startsWith('AUTO_AUDIT_')) throw new Error(`禁止操作非审计数据：${value}`);
}

export function assertAuditFieldLength(value: string, maxLength: number, fieldName = '审计字段'): void {
  if (value.length > maxLength) throw new Error(`${fieldName}超出长度限制：${value.length}/${maxLength}`);
}

function replaceLastCharacter(value: string, replacement: string): string {
  return `${value.slice(0, -1)}${replacement}`;
}

function createEditedMarker(value: string): string {
  return replaceLastCharacter(value, value.endsWith('E') ? 'F' : 'E');
}

function entityCode(entity: AuditEntity): string {
  return auditEntityCodes[entity];
}

const auditEntityCodes: Record<AuditEntity, string> = {
  CATEGORY: 'A',
  METHOD: 'B',
  MATERIAL: 'C',
  BOM: 'D',
  SEASONING: 'E',
  ITEM: 'F',
  STALL: 'G',
  SPEC: 'H',
  TAX: 'I',
  TASTE: 'J',
  ADDITIONAL: 'K',
  COMBO: 'L',
  DESCRIPTION_TAG: 'M',
  STAT_TAG: 'N',
  MATERIAL_CATEGORY: 'O',
  RECIPE_INGREDIENT: 'P',
  MENU: 'Q',
  PRINTER: 'R',
  STORE_SEASONING: 'S',
  STORE_PRODUCT: 'T',
};
