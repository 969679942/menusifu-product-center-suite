export type ProductCenterFailureCategory =
  | 'transient-platform'
  | 'environment-auth'
  | 'environment-data'
  | 'locator-drift'
  | 'cleanup-residue'
  | 'product-behavior'
  | 'unknown';

export type ProductCenterFailureInput = {
  message: string;
  statusCode?: number;
  assertion?: boolean;
  evidenceComplete?: boolean;
  productMismatchConfirmed?: boolean;
  executionPathEquivalent?: boolean;
};

export function classifyProductCenterFailure(input: ProductCenterFailureInput): {
  category: ProductCenterFailureCategory;
  retryable: boolean;
  diagnostic: string;
} {
  const message = redact(input.message);
  const normalized = input.message.toLowerCase();
  if (/test timeout of .* exceeded|test timeout exceeded/.test(normalized)) {
    return result('unknown', false, message);
  }
  if (/cleanup|residue|残留/.test(normalized)) return result('cleanup-residue', false, message);
  if (input.evidenceComplete && input.productMismatchConfirmed && input.executionPathEquivalent) {
    return result('product-behavior', false, message);
  }
  if (/wait_until_condition_timeout/.test(normalized)) return result('unknown', false, message);
  if (/wait_until_probe_timeout/.test(normalized)) return result('transient-platform', true, message);
  if (/(?:system|server) error|系统异常|环境页面异常/.test(normalized)) {
    return result('environment-data', false, message);
  }
  if (/strict mode violation|resolved to \d+ elements|locator|selector|uniqueness|侧边栏未进入目标路径|目标路径.*未.*侧边栏/.test(normalized)) {
    return result('locator-drift', false, message);
  }
  if ([401, 403].includes(input.statusCode ?? 0) || /unauthorized|forbidden|login|auth/.test(normalized)) {
    return result('environment-auth', false, message);
  }
  if (input.statusCode === 429 || /too many requests|exceeded retry limit|connection reset|err_timed_out|timeout|timed out/.test(normalized)) {
    return result('transient-platform', true, message);
  }
  if (/seed|prerequisite|test data|前置数据/.test(normalized)) return result('environment-data', false, message);
  if (/typeerror|referenceerror|rangeerror|maximum call stack|not a function/.test(normalized)) {
    return result('unknown', false, message);
  }
  if (input.assertion || /expected .* received|expect\(/.test(normalized)) return result('unknown', false, message);
  return result('unknown', false, message);
}

function result(category: ProductCenterFailureCategory, retryable: boolean, diagnostic: string) {
  return { category, retryable, diagnostic };
}

function redact(message: string): string {
  return message
    .replace(/(token|password|cookie|authorization)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 500);
}
