/**
 * Platform-neutral contract for user-visible validation/operation feedback.
 *
 * A message is only equivalent when the business contract explicitly registers
 * it.  This keeps locale differences harmless without turning arbitrary text
 * into a false positive.
 */
export type BusinessFeedbackContract = {
  /** Stable business-rule identity shared by locale or channel variants. */
  equivalenceKey?: string;
  exactMessage: string;
  allowedMessages?: string[];
  locale?: string;
  evidencePaths?: string[];
  semanticSignals?: {
    codes?: string[];
    statuses?: string[];
    states?: string[];
  };
};

export type BusinessFeedbackObservation = {
  uiMessage?: string;
  apiMessage?: string;
  apiCode?: string;
  status?: string;
  state?: string;
};

export function normalizeBusinessFeedbackText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function businessFeedbackMessages(
  contract: BusinessFeedbackContract | null | undefined,
): string[] {
  if (!contract) return [];
  return [...new Set([contract.exactMessage, ...(contract.allowedMessages ?? [])]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(normalizeBusinessFeedbackText))];
}

export function matchesBusinessFeedbackMessage(
  actualText: string,
  contract: BusinessFeedbackContract | null | undefined,
  mode: 'contains' | 'exact' = 'exact',
): boolean {
  const expected = businessFeedbackMessages(contract);
  if (expected.length === 0) return false;
  const actual = normalizeBusinessFeedbackText(actualText);
  if (!actual) return false;
  return mode === 'contains'
    ? expected.some((candidate) => actual.includes(candidate))
    : actual.split(' | ').some((candidate) => expected.includes(candidate));
}

/**
 * Prefer business code/state when the channel exposes it, while still requiring
 * a registered message if a message is present.  This is useful for UI/API
 * pairs where wording differs but the business result is identical.
 */
export function matchesBusinessFeedbackObservation(
  observation: BusinessFeedbackObservation,
  contract: BusinessFeedbackContract | null | undefined,
): boolean {
  if (!contract) return false;
  const signals = contract.semanticSignals;
  const hasSignalContract = Boolean(signals && (
    signals.codes?.length || signals.statuses?.length || signals.states?.length
  ));
  if (hasSignalContract) {
    if (signals?.codes?.length && (!observation.apiCode || !signals.codes.includes(observation.apiCode))) return false;
    if (signals?.statuses?.length && (!observation.status || !signals.statuses.includes(observation.status))) return false;
    if (signals?.states?.length && (!observation.state || !signals.states.includes(observation.state))) return false;
  }
  const messages = [observation.uiMessage, observation.apiMessage].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  return messages.length === 0 || messages.some((message) => matchesBusinessFeedbackMessage(message, contract));
}

export function validateBusinessFeedbackContract(
  contract: BusinessFeedbackContract,
): string[] {
  const errors: string[] = [];
  if (!contract.exactMessage?.trim()) errors.push('EXACT_MESSAGE_REQUIRED');
  if (contract.evidencePaths !== undefined
    && (!Array.isArray(contract.evidencePaths) || contract.evidencePaths.length === 0)) {
    errors.push('EVIDENCE_PATH_INVALID');
  }
  const exact = normalizeBusinessFeedbackText(contract.exactMessage ?? '');
  const allowed = (contract.allowedMessages ?? [])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(normalizeBusinessFeedbackText);
  const messages = [exact, ...allowed].filter(Boolean);
  if (contract.allowedMessages !== undefined && contract.allowedMessages.length === 0) {
    errors.push('ALLOWED_MESSAGES_NON_EMPTY');
  }
  if (contract.allowedMessages !== undefined && !allowed.includes(exact)) {
    errors.push('EXACT_MESSAGE_MUST_BE_ALLOWED');
  }
  if (new Set(allowed).size !== allowed.length) errors.push('FEEDBACK_MESSAGE_DUPLICATE');
  if (messages.length > 1 && !contract.equivalenceKey?.trim()) errors.push('EQUIVALENCE_KEY_REQUIRED_FOR_VARIANTS');
  if (contract.semanticSignals) {
    for (const [key, values] of Object.entries(contract.semanticSignals)) {
      if (!Array.isArray(values) || values.length === 0 || values.some((value) => !value.trim())) {
        errors.push(`SEMANTIC_SIGNAL_INVALID:${key}`);
      }
    }
  }
  return [...new Set(errors)].sort();
}
