export type BusinessRuleDownstreamSyncContract = {
  contractId: string;
  changeAction: string;
  sourceSystem: string;
  intermediateSystems: string[];
  targetSystems: string[];
  trigger: string;
  storePrerequisites: string[];
  terminalPrerequisites: string[];
  forbiddenPaths: string[];
  verification: {
    beforeTrigger: string;
    afterStoreSync: string;
    afterTerminalSync: string;
    channels: Array<'ui' | 'api' | 'downstream' | 'cleanup'>;
  };
};

export const ambiguousDownstreamPhrases = [
  '同步下游',
  '下游同步',
  '按实际',
  '是否需要同步',
  '视情况',
  '等',
  '或其他方式',
] as const;

export function validateBusinessRuleDownstreamContract(
  contract: BusinessRuleDownstreamSyncContract,
): string[] {
  const errors: string[] = [];
  if (!contract.contractId.trim()) errors.push('DOWNSTREAM_CONTRACT_ID_REQUIRED');
  if (!contract.changeAction.trim()) errors.push('DOWNSTREAM_CHANGE_ACTION_REQUIRED');
  if (!contract.sourceSystem.trim()) errors.push('DOWNSTREAM_SOURCE_SYSTEM_REQUIRED');
  if (contract.intermediateSystems.length === 0) errors.push('DOWNSTREAM_INTERMEDIATE_SYSTEM_REQUIRED');
  if (contract.targetSystems.length === 0) errors.push('DOWNSTREAM_TARGET_SYSTEM_REQUIRED');
  if (!contract.trigger.trim()) errors.push('DOWNSTREAM_TRIGGER_REQUIRED');
  if (contract.storePrerequisites.length === 0) errors.push('DOWNSTREAM_STORE_PREREQUISITE_REQUIRED');
  if (contract.terminalPrerequisites.length === 0) errors.push('DOWNSTREAM_TERMINAL_PREREQUISITE_REQUIRED');
  if (contract.verification.channels.length === 0) errors.push('DOWNSTREAM_VERIFICATION_CHANNEL_REQUIRED');
  if (!contract.verification.beforeTrigger.trim()) errors.push('DOWNSTREAM_BEFORE_TRIGGER_REQUIRED');
  if (!contract.verification.afterStoreSync.trim()) errors.push('DOWNSTREAM_AFTER_STORE_SYNC_REQUIRED');
  if (!contract.verification.afterTerminalSync.trim()) errors.push('DOWNSTREAM_AFTER_TERMINAL_SYNC_REQUIRED');
  const text = JSON.stringify(contract);
  for (const phrase of ambiguousDownstreamPhrases) {
    if (containsAmbiguousPhrase(text, phrase)) errors.push(`DOWNSTREAM_AMBIGUOUS_PHRASE:${phrase}`);
  }
  return [...new Set(errors)];
}

export function findAmbiguousDownstreamPhrases(text: string): string[] {
  return ambiguousDownstreamPhrases.filter((phrase) => containsAmbiguousPhrase(text, phrase));
}

function containsAmbiguousPhrase(text: string, phrase: typeof ambiguousDownstreamPhrases[number]): boolean {
  if (phrase !== '等') return text.includes(phrase);
  // 本合同只治理“下游范围”歧义：枚举尾部还必须连接下游目标词。
  // “等于”“等待”以及“名称/编码等基础信息”属于非下游语义，不能触发本门禁。
  return /[、/][^，。；;\n]{1,24}等(?:下游|系统|终端|门店|渠道|客户端|页面)/u.test(text);
}
