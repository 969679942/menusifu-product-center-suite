import { createHash } from 'node:crypto';

export type RequirementsChangeEvent = {
  schemaVersion: '1.0.0';
  eventId: string;
  eventType: 'prd.published' | 'prd.updated';
  applicationId: string;
  businessDomainId: string;
  sourceId: string;
  sourcePath: string;
  sourceVersion: string;
  sourceFingerprint: string;
  publishedAt: string;
  correlationId: string;
};

export function validateRequirementsChangeEvent(input: {
  event: RequirementsChangeEvent;
  expectedApplicationId: string;
  expectedBusinessDomainId: string;
  sourceFingerprint?: string | null;
}): {
  status: 'accepted' | 'rejected';
  diagnostics: string[];
  eventFingerprint: string;
} {
  const { event } = input;
  const diagnostics: string[] = [];
  if (event.schemaVersion !== '1.0.0') diagnostics.push('PRD_EVENT_SCHEMA_UNSUPPORTED');
  if (!['prd.published', 'prd.updated'].includes(event.eventType)) diagnostics.push('PRD_EVENT_TYPE_UNSUPPORTED');
  if (!event.eventId.trim()) diagnostics.push('PRD_EVENT_ID_REQUIRED');
  if (!event.correlationId.trim()) diagnostics.push('PRD_EVENT_CORRELATION_ID_REQUIRED');
  if (event.applicationId !== input.expectedApplicationId) diagnostics.push('PRD_EVENT_APPLICATION_MISMATCH');
  if (event.businessDomainId !== input.expectedBusinessDomainId) diagnostics.push('PRD_EVENT_BUSINESS_DOMAIN_MISMATCH');
  if (!event.sourceId.trim()) diagnostics.push('PRD_EVENT_SOURCE_ID_REQUIRED');
  if (!isSafeRelativePath(event.sourcePath)) diagnostics.push('PRD_EVENT_SOURCE_PATH_INVALID');
  if (!event.sourceVersion.trim()) diagnostics.push('PRD_EVENT_SOURCE_VERSION_REQUIRED');
  if (!/^[a-f0-9]{64}$/.test(event.sourceFingerprint)) diagnostics.push('PRD_EVENT_SOURCE_FINGERPRINT_INVALID');
  if (!Number.isFinite(Date.parse(event.publishedAt))) diagnostics.push('PRD_EVENT_PUBLISHED_AT_INVALID');
  if (input.sourceFingerprint !== undefined && input.sourceFingerprint !== event.sourceFingerprint) {
    diagnostics.push('PRD_EVENT_SOURCE_FINGERPRINT_MISMATCH');
  }
  return {
    status: diagnostics.length === 0 ? 'accepted' : 'rejected',
    diagnostics: [...new Set(diagnostics)].sort(),
    eventFingerprint: createHash('sha256').update(JSON.stringify(event)).digest('hex'),
  };
}

function isSafeRelativePath(value: string): boolean {
  const normalized = value.replaceAll('\\', '/');
  return Boolean(normalized.trim())
    && !normalized.startsWith('/')
    && !/^[a-zA-Z]:\//.test(normalized)
    && !normalized.split('/').includes('..');
}
