export function redactAcceptanceDiagnostic(value: string): string {
  return value
    .replace(/bearer\s+[^\s,;]+/gi, 'Bearer <redacted>')
    .replace(/(authorization|password|cookie|set-cookie|token|access[_-]?token|refresh[_-]?token)\s*[:=]\s*[^\s,;]+/gi, '$1=<redacted>')
    .replace(/eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}/gi, '<redacted>');
}
