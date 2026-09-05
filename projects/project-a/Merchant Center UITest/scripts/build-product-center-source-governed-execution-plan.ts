import fs from 'node:fs';
import path from 'node:path';
import {
  loadProductCenterSourceGovernance,
  sourceDecisionBlocksExecution,
} from '../utils/product-center-source-governance';
import {
  formatProductCenterExecutionDecisionReason,
  loadProductCenterExecutionDecisions,
} from '../utils/product-center-execution-decisions';
import { auditSemanticDuplicateCandidates } from '../utils/product-center-semantic-duplicate-gate';
import { fingerprintProductCenterItemImplementation } from '../adapters/product-center/product-center-item-implementation';
import { matchesCurrentCaseAndImplementationFingerprints } from '../automation/system-test/system-test-case-state-arbiter';
import { fingerprintSystemTestArtifact } from '../automation/system-test/system-test-artifact-lineage';

type GroupBinding = {
  caseId: string;
  title: string;
  generationAllowed: boolean;
  handlerId: string | null;
  bindingFingerprint: string;
  blockedReasons: string[];
  blockClassification: 'observed-product-drift' | 'external-dependency-blocked' | 'automation-gap' | 'case-spec-conflict' | 'assertion-surface-mismatch' | 'source-evidence-blocked' | 'not-applicable' | null;
};

type ItemAutomationEntry = {
  canonicalCaseId: string;
  title: string;
  classification: 'strict-generatable' | 'blocked' | 'not-applicable';
  recipeId: string | null;
  blockingReasons: string[];
};

type ItemAuthoritativeBinding = {
  caseId: string;
  title: string;
  scriptPath: string;
  runtimeReadiness: 'ready' | 'environment-blocked' | string;
  blockingReasons: string[];
};

type RemainingBinding = {
  caseId: string;
  title: string;
  handlerId: string;
  scriptPath: string;
};

type AdditionalBinding = RemainingBinding & {
  module: string;
  bindingFingerprint: string;
  runnerId: 'group' | 'item' | 'remaining';
  runtimeReadiness: 'ready' | 'blocked';
  blockedReasons?: string[];
};

type SourceAutoResolution = {
  caseId: string;
  module: string;
  disposition: string;
  humanRequired: boolean;
  sourceRecovery?: {
    disposition: string;
    executionAllowed: boolean;
    promotionAllowed: boolean;
    humanRequired: boolean;
    reasonCodes: string[];
  } | null;
};

type ProductCenterRuleConfirmation = {
  linkedCanonicalIds?: string[];
};

type ExecutionRepairQueue = {
  items: Array<{
    caseId: string;
    classification: string;
    diagnostic: string;
    evidencePath: string | null;
    caseFingerprintAtObservation?: string | null;
    implementationFingerprintAtObservation?: string | null;
  }>;
};

const ITEM_EXTERNAL_ENVIRONMENT_CASE_IDS = new Set([
  'TC-ITEM-PKG-070',
  'TC-ITEM-STD-080',
  'TC-ITEM-STD-083',
]);

type ExecutionTask = {
  caseId: string;
  module: string;
  title: string | null;
  sourceStatus: 'verified' | 'blocked' | 'not-applicable';
  action: 'execute' | 'source-recovery' | 'handled' | 'deferred' | 'blocked-source' | 'blocked-technical' | 'product-defect' | 'not-applicable';
  reason: string;
  handlerId: string | null;
  bindingFingerprint: string | null;
  blockCode: string | null;
  runnerId: 'group' | 'item' | 'remaining' | null;
};

export function buildProductCenterSourceGovernedExecutionPlan(options: {
  projectRoot?: string;
  generatedAt?: string;
  write?: boolean;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const workspaceRoot = path.resolve(projectRoot, '..');
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const governance = loadProductCenterSourceGovernance(projectRoot);
  const executionDecisions = loadProductCenterExecutionDecisions(projectRoot);
  const groupBindings = readJson<{ cases: GroupBinding[] }>(path.join(
    projectRoot,
    'contracts/product-center/group/product-center-group-bindings.json',
  )).cases;
  const groupByCaseId = new Map(groupBindings.map((item) => [item.caseId, item]));
  const itemAutomation = readJson<{ fingerprint: string; entries: ItemAutomationEntry[] }>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/generated/product-center-canonical-automation-contract-batch.json',
  ));
  const itemByCaseId = new Map(itemAutomation.entries.map((item) => [item.canonicalCaseId, item]));
  const itemAuthoritative = readJson<{ releaseFingerprint: string; bindings: ItemAuthoritativeBinding[] }>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-authoritative-automation-bindings.json',
  ));
  const itemBusinessRules = readJson<{ candidateRules?: unknown[] }>(path.join(
    projectRoot,
    'contracts/product-center/business-rules/product-center-item-authoritative-business-rules.json',
  ));
  const semanticDuplicateCandidates = auditSemanticDuplicateCandidates(
    (itemBusinessRules.candidateRules ?? []) as Array<{
      caseId: string;
      module?: string;
      productType?: string;
      scenarioFamily?: string;
      ruleKind?: string;
      sourceCitation?: string;
      sourceCaseFingerprint?: string;
      scope?: string[];
      sourceIds?: string[];
      conditionClaims?: string[];
      actionClaims?: string[];
      outcomeClaims?: string[];
    }>,
  );
  const authoritativeItemByCaseId = new Map(itemAuthoritative.bindings.map((item) => [item.caseId, item]));
  const remainingAutomation = readJson<{
    bindingFingerprint: string;
    bindings: RemainingBinding[];
  }>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-legacy-remaining-automation-bindings.json',
  ));
  const remainingByCaseId = new Map(remainingAutomation.bindings.map((item) => [item.caseId, item]));
  const additionalAutomation = readJson<{ bindings: AdditionalBinding[] }>(path.join(
    projectRoot,
    'contracts/product-center/test-plan-additional-automation-bindings.json',
  ));
  const additionalByCaseId = new Map(additionalAutomation.bindings.map((item) => [item.caseId, item]));
  const sourceDecisions = new Map(governance.decisions);
  // Supplemental bindings are deliberately kept outside the authoritative
  // release.  They still need a source decision when the case is explicitly
  // linked by a confirmed business rule; otherwise a ready, source-backed
  // supplemental case silently disappears from the public execution plan.
  // The confirmation registry is the source of truth here, never the
  // automation binding itself.
  const ruleConfirmations = readJson<{ confirmations?: ProductCenterRuleConfirmation[] }>(path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-item-rule-confirmations.json',
  ));
  const confirmedCaseIds = new Set(
    (ruleConfirmations.confirmations ?? []).flatMap((item) => item.linkedCanonicalIds ?? []),
  );
  for (const binding of additionalAutomation.bindings) {
    if (sourceDecisions.has(binding.caseId) || !confirmedCaseIds.has(binding.caseId)) continue;
    sourceDecisions.set(binding.caseId, {
      caseId: binding.caseId,
      module: binding.module,
      status: 'verified',
      disposition: 'verified-source-evidence',
      currentGoalBlocking: false,
    });
  }
  const sourceAutoResolution = readJson<{ cases: SourceAutoResolution[] }>(path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-source-auto-resolution.json',
  ));
  const sourceAutoResolutionById = new Map(sourceAutoResolution.cases.map((item) => [item.caseId, item]));
  const executionRepairQueuePath = path.join(
    workspaceRoot,
    'deliverables/test-plan-governance/product-center-execution-repair-queue.json',
  );
  const observedProductDefects = fs.existsSync(executionRepairQueuePath)
    ? new Map(
      readJson<ExecutionRepairQueue>(executionRepairQueuePath).items
        .filter((item) => item.classification === 'product-behavior')
        .map((item) => [
          item.caseId,
          item,
        ]),
    )
    : new Map<string, ExecutionRepairQueue['items'][number]>();
  for (const resolution of sourceAutoResolution.cases) {
    if (resolution.humanRequired || sourceDecisions.has(resolution.caseId)) continue;
    sourceDecisions.set(resolution.caseId, {
      caseId: resolution.caseId,
      module: resolution.module,
      status: 'verified',
      disposition: 'verified-source-evidence',
      currentGoalBlocking: false,
    });
  }
  for (const executionDecision of executionDecisions.values()) {
    if (!sourceDecisions.has(executionDecision.caseId)) {
      sourceDecisions.set(executionDecision.caseId, {
        caseId: executionDecision.caseId,
        module: executionDecision.module,
        status: 'verified',
        disposition: 'verified-source-evidence',
        currentGoalBlocking: false,
      });
    }
  }
  for (const binding of groupBindings) {
    if (sourceDecisions.has(binding.caseId)) continue;
    sourceDecisions.set(binding.caseId, {
      caseId: binding.caseId,
      module: 'brand-group',
      status: binding.blockClassification === 'not-applicable' ? 'not-applicable' : 'verified',
      disposition: binding.blockClassification === 'not-applicable'
        ? 'not-applicable'
        : 'verified-source-evidence',
      currentGoalBlocking: false,
    });
  }
  for (const binding of itemAuthoritative.bindings) {
    if (sourceDecisions.has(binding.caseId)) continue;
    sourceDecisions.set(binding.caseId, {
      caseId: binding.caseId,
      module: 'brand-item',
      status: 'verified',
      disposition: 'verified-source-evidence',
      currentGoalBlocking: false,
    });
  }
  for (const binding of itemAutomation.entries.filter((item) => item.classification === 'not-applicable')) {
    if (sourceDecisions.has(binding.canonicalCaseId)) continue;
    sourceDecisions.set(binding.canonicalCaseId, {
      caseId: binding.canonicalCaseId,
      module: 'brand-item',
      status: 'not-applicable',
      disposition: 'not-applicable',
      currentGoalBlocking: false,
    });
  }
  const tasks = [...sourceDecisions.values()]
    .map((decision): ExecutionTask => {
      const binding = groupByCaseId.get(decision.caseId);
      const itemBinding = itemByCaseId.get(decision.caseId);
      const authoritativeItemBinding = authoritativeItemByCaseId.get(decision.caseId);
      const remainingBinding = remainingByCaseId.get(decision.caseId);
      const additionalBinding = additionalByCaseId.get(decision.caseId);
      const executionDecision = executionDecisions.get(decision.caseId);
      if (executionDecision?.status === 'handled') {
        return {
          caseId: decision.caseId,
          module: decision.module,
          title: binding?.title ?? authoritativeItemBinding?.title ?? itemBinding?.title ?? additionalBinding?.title ?? null,
          sourceStatus: decision.status,
          action: 'handled',
          reason: `${executionDecision.reason}；证据：${executionDecision.evidenceRefs?.join('、')}`,
          handlerId: binding?.handlerId ?? itemBinding?.recipeId ?? additionalBinding?.handlerId ?? null,
          bindingFingerprint: binding?.bindingFingerprint ?? additionalBinding?.bindingFingerprint ?? itemAuthoritative.releaseFingerprint ?? itemAutomation.fingerprint,
          blockCode: 'HANDLED_NO_REPEAT_EXECUTION',
          runnerId: null,
        };
      }
      if (executionDecision?.status === 'deferred') {
        return {
          caseId: decision.caseId,
          module: decision.module,
          title: binding?.title ?? authoritativeItemBinding?.title ?? itemBinding?.title ?? additionalBinding?.title ?? null,
          sourceStatus: decision.status,
          action: 'deferred',
          reason: `${executionDecision.reason}；恢复条件：${executionDecision.resumeWhen}`,
          handlerId: binding?.handlerId ?? itemBinding?.recipeId ?? additionalBinding?.handlerId ?? null,
          bindingFingerprint: binding?.bindingFingerprint ?? additionalBinding?.bindingFingerprint ?? itemAuthoritative.releaseFingerprint ?? null,
          blockCode: 'BUSINESS_EXECUTION_DEFERRED',
          runnerId: null,
        };
      }
      if (executionDecision?.status === 'not-applicable') {
        return {
          caseId: decision.caseId,
          module: decision.module,
          title: binding?.title ?? authoritativeItemBinding?.title ?? itemBinding?.title ?? additionalBinding?.title ?? null,
          sourceStatus: 'not-applicable',
          action: 'not-applicable',
          reason: formatProductCenterExecutionDecisionReason(executionDecision),
          handlerId: null,
          bindingFingerprint: binding?.bindingFingerprint ?? additionalBinding?.bindingFingerprint ?? itemAuthoritative.releaseFingerprint ?? null,
          blockCode: 'CURRENT_VERSION_REPLACED',
          runnerId: null,
        };
      }
      if (decision.status === 'not-applicable') {
        return {
          caseId: decision.caseId,
          module: decision.module,
          title: binding?.title ?? additionalBinding?.title ?? null,
          sourceStatus: decision.status,
          action: 'not-applicable',
          reason: '权威发布已确认该历史用例不适用于当前版本',
          handlerId: null,
          bindingFingerprint: binding?.bindingFingerprint ?? additionalBinding?.bindingFingerprint ?? null,
          blockCode: null,
          runnerId: null,
        };
      }
      const sourceRecovery = sourceAutoResolutionById.get(decision.caseId)?.sourceRecovery;
      if (sourceRecovery?.promotionAllowed === true
        && sourceRecovery.disposition === 'reconstructed-current-baseline') {
        return {
          caseId: decision.caseId,
          module: decision.module,
          title: binding?.title ?? additionalBinding?.title ?? null,
          sourceStatus: 'verified',
          action: 'handled',
          reason: '原始需求来源不可恢复；现有完整用例已由当前标准收据验证，并以 reconstructed-current-baseline 权威登记',
          handlerId: binding?.handlerId ?? additionalBinding?.handlerId ?? null,
          bindingFingerprint: binding?.bindingFingerprint ?? additionalBinding?.bindingFingerprint ?? null,
          blockCode: 'SOURCE_RECOVERY_COMPLETED',
          runnerId: null,
        };
      }
      if (sourceDecisionBlocksExecution(decision) && sourceRecovery?.executionAllowed === true) {
        const recoveryErrors = [
          ...(decision.module === 'brand-group' ? [] : ['来源恢复运行当前仅由组适配器声明']),
          ...(binding ? [] : ['来源恢复缺少组绑定']),
          ...(binding?.handlerId ? [] : ['来源恢复缺少可执行 handler']),
          ...(binding?.blockClassification === 'source-evidence-blocked'
            ? [] : [`来源恢复绑定分类无效：${binding?.blockClassification ?? 'missing'}`]),
        ];
        if (recoveryErrors.length === 0) {
          return {
            caseId: decision.caseId,
            module: decision.module,
            title: binding!.title,
            sourceStatus: decision.status,
            action: 'source-recovery',
            reason: `现有用例定义完整，按公共来源恢复合同执行受控定向验证：${sourceRecovery.reasonCodes.join(',')}`,
            handlerId: binding!.handlerId,
            bindingFingerprint: binding!.bindingFingerprint,
            blockCode: 'SOURCE_RECOVERY_PENDING',
            runnerId: 'group',
          };
        }
        return {
          caseId: decision.caseId,
          module: decision.module,
          title: binding?.title ?? null,
          sourceStatus: decision.status,
          action: 'blocked-technical',
          reason: recoveryErrors.join(';'),
          handlerId: binding?.handlerId ?? null,
          bindingFingerprint: binding?.bindingFingerprint ?? null,
          blockCode: 'SOURCE_RECOVERY_ADAPTER_INVALID',
          runnerId: null,
        };
      }
      if (sourceDecisionBlocksExecution(decision)) {
        return {
          caseId: decision.caseId,
          module: decision.module,
          title: binding?.title ?? additionalBinding?.title ?? null,
          sourceStatus: decision.status,
          action: 'blocked-source',
          reason: `${decision.blockCode ?? 'FORMAL_SOURCE_REQUIRED'}:${decision.blockReason ?? '来源证据未验证'}`,
          handlerId: binding?.handlerId ?? additionalBinding?.handlerId ?? null,
          bindingFingerprint: binding?.bindingFingerprint ?? additionalBinding?.bindingFingerprint ?? null,
          blockCode: decision.blockCode ?? null,
          runnerId: null,
        };
      }
      const observedProductDefect = observedProductDefects.get(decision.caseId);
      const currentBindingFingerprint = binding?.bindingFingerprint
        ?? additionalBinding?.bindingFingerprint
        ?? (decision.module === 'brand-item' ? itemAuthoritative.releaseFingerprint : null)
        ?? itemAutomation.fingerprint;
      const currentImplementationFingerprint = decision.module === 'brand-item'
        ? fingerprintProductCenterItemImplementation(projectRoot, decision.caseId)
        : null;
      const productDefectMatchesCurrentImplementation = matchesCurrentCaseAndImplementationFingerprints(
        observedProductDefect ? {
          caseFingerprint: observedProductDefect.caseFingerprintAtObservation,
          implementationFingerprint: observedProductDefect.implementationFingerprintAtObservation,
        } : null,
        currentBindingFingerprint,
        currentImplementationFingerprint,
      );
      if (observedProductDefect && productDefectMatchesCurrentImplementation) {
        return {
          caseId: decision.caseId,
          module: decision.module,
          title: binding?.title ?? authoritativeItemBinding?.title ?? itemBinding?.title ?? null,
          sourceStatus: decision.status,
          action: 'product-defect',
          reason: `当前执行收据确认产品行为与正式预期不一致；诊断：${observedProductDefect.diagnostic}；证据：${observedProductDefect.evidencePath ?? '未提供'}`,
          handlerId: binding?.handlerId ?? itemBinding?.recipeId ?? `item-216:${decision.caseId}`,
          bindingFingerprint: binding?.bindingFingerprint ?? itemAuthoritative.releaseFingerprint ?? itemAutomation.fingerprint,
          blockCode: 'RUNTIME_PRODUCT_BEHAVIOR',
          runnerId: null,
        };
      }
      if (remainingBinding
        && remainingBinding.scriptPath === 'tests/generated/product-center-legacy-remaining.generated.spec.ts') {
        return {
          caseId: decision.caseId,
          module: decision.module,
          title: remainingBinding.title,
          sourceStatus: decision.status,
          action: 'execute',
          reason: '正式来源已验证且历史剩余用例已有独立严格自动化入口',
          handlerId: remainingBinding.handlerId,
          bindingFingerprint: remainingAutomation.bindingFingerprint,
          blockCode: null,
          runnerId: 'remaining',
        };
      }
      if (additionalBinding) {
        const expectedSpecs: Record<AdditionalBinding['runnerId'], string> = {
          group: 'tests/generated/product-center-group.generated.spec.ts',
          item: 'tests/generated/product-center-item-216.generated.spec.ts',
          remaining: 'tests/generated/product-center-legacy-remaining.generated.spec.ts',
        };
        const bindingErrors = [
          ...(additionalBinding.runtimeReadiness === 'ready' ? [] : ['附加自动化绑定尚未获得运行资格']),
          ...(additionalBinding.handlerId ? [] : ['附加自动化绑定缺少 handlerId']),
          ...(additionalBinding.scriptPath === expectedSpecs[additionalBinding.runnerId]
            ? []
            : [`附加自动化绑定脚本与执行通道不一致：${additionalBinding.scriptPath}`]),
          ...(fs.existsSync(path.join(projectRoot, additionalBinding.scriptPath)) ? [] : ['附加自动化绑定脚本不存在']),
        ];
        if (bindingErrors.length > 0) {
          return {
            caseId: decision.caseId,
            module: decision.module,
            title: additionalBinding.title,
            sourceStatus: decision.status,
            action: 'blocked-technical',
            reason: [...(additionalBinding.blockedReasons ?? []), ...bindingErrors].join(';'),
            handlerId: additionalBinding.handlerId,
            bindingFingerprint: additionalBinding.bindingFingerprint,
            blockCode: 'ADDITIONAL_PLAN_BINDING_NOT_READY',
            runnerId: null,
          };
        }
        return {
          caseId: decision.caseId,
          module: decision.module,
          title: additionalBinding.title,
          sourceStatus: decision.status,
          action: 'execute',
          reason: '新增商品中心方案已通过来源治理和附加自动化绑定门禁',
          handlerId: additionalBinding.handlerId,
          bindingFingerprint: additionalBinding.bindingFingerprint,
          blockCode: null,
          runnerId: additionalBinding.runnerId,
        };
      }
      if (decision.module === 'brand-item' && ITEM_EXTERNAL_ENVIRONMENT_CASE_IDS.has(decision.caseId)) {
        return {
          caseId: decision.caseId,
          module: decision.module,
          title: authoritativeItemBinding?.title ?? itemBinding?.title ?? null,
          sourceStatus: decision.status,
          action: 'blocked-technical',
          reason: authoritativeItemBinding?.blockingReasons.join(';') || '依赖可控门店终端或渠道终态环境',
          handlerId: null,
          bindingFingerprint: itemAuthoritative.releaseFingerprint,
          blockCode: null,
          runnerId: null,
        };
      }
      if (decision.module === 'brand-item'
        && authoritativeItemBinding?.runtimeReadiness === 'ready'
        && authoritativeItemBinding.scriptPath === 'tests/generated/product-center-item-216.generated.spec.ts') {
        return {
          caseId: decision.caseId,
          module: decision.module,
          title: authoritativeItemBinding.title,
          sourceStatus: decision.status,
          action: 'execute',
          reason: '正式来源已验证且商品 216 唯一入口已有可运行 flow 绑定',
          handlerId: itemBinding?.recipeId ?? `item-216:${decision.caseId}`,
          bindingFingerprint: itemAuthoritative.releaseFingerprint,
          blockCode: null,
          runnerId: 'item',
        };
      }
      if (decision.module === 'brand-item' && itemBinding) {
        if (itemBinding.classification !== 'strict-generatable' || !itemBinding.recipeId) {
          return {
            caseId: decision.caseId,
            module: decision.module,
            title: itemBinding.title,
            sourceStatus: decision.status,
            action: itemBinding.classification === 'not-applicable' ? 'not-applicable' : 'blocked-technical',
            reason: itemBinding.blockingReasons.join(';') || '商品标准自动化合同尚未达到严格生成条件',
            handlerId: itemBinding.recipeId,
            bindingFingerprint: itemAutomation.fingerprint,
            blockCode: null,
            runnerId: null,
          };
        }
        return {
          caseId: decision.caseId,
          module: decision.module,
          title: itemBinding.title,
          sourceStatus: decision.status,
          action: 'execute',
          reason: '正式来源已验证且商品标准自动化合同具备严格执行资格',
          handlerId: itemBinding.recipeId,
          bindingFingerprint: itemAutomation.fingerprint,
          blockCode: null,
          runnerId: 'item',
        };
      }
      if (!binding) {
        return {
          caseId: decision.caseId,
          module: decision.module,
          title: null,
          sourceStatus: decision.status,
          action: decision.module === 'brand-group' ? 'not-applicable' : 'blocked-technical',
          reason: decision.module === 'brand-group'
            ? '当前正式组自动化合同中已不存在该用例'
            : '当前执行计划仅接入组运行器，需生成对应模块自动化绑定与运行入口',
          handlerId: null,
          bindingFingerprint: null,
          blockCode: null,
          runnerId: null,
        };
      }
      if (binding.blockClassification === 'observed-product-drift') {
        return {
          caseId: decision.caseId,
          module: decision.module,
          title: binding.title,
          sourceStatus: decision.status,
          action: 'product-defect',
          reason: binding.blockedReasons.join(';') || '运行证据确认产品行为与正式用例预期不一致',
          handlerId: binding.handlerId,
          bindingFingerprint: binding.bindingFingerprint,
          blockCode: null,
          runnerId: null,
        };
      }
      if (binding.blockClassification === 'not-applicable') {
        return {
          caseId: decision.caseId,
          module: decision.module,
          title: binding.title,
          sourceStatus: decision.status,
          action: 'not-applicable',
          reason: binding.blockedReasons.join(';') || '当前版本不存在该用例依赖的业务字段或能力',
          handlerId: binding.handlerId,
          bindingFingerprint: binding.bindingFingerprint,
          blockCode: null,
          runnerId: null,
        };
      }
      if (!binding.generationAllowed || !binding.handlerId) {
        return {
          caseId: decision.caseId,
          module: decision.module,
          title: binding.title,
          sourceStatus: decision.status,
          action: 'blocked-technical',
          reason: binding.blockedReasons.join(';') || '当前自动化绑定未获得执行资格',
          handlerId: binding.handlerId,
          bindingFingerprint: binding.bindingFingerprint,
          blockCode: null,
          runnerId: null,
        };
      }
      return {
        caseId: decision.caseId,
        module: decision.module,
        title: binding.title,
        sourceStatus: decision.status,
        action: 'execute',
        reason: '正式来源已验证且当前绑定具备执行资格',
        handlerId: binding.handlerId,
        bindingFingerprint: binding.bindingFingerprint,
        blockCode: null,
        runnerId: 'group',
      };
    })
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  const runnableActions = new Set<ExecutionTask['action']>(['execute', 'source-recovery']);
  const executableCaseIds = tasks.filter((item) => runnableActions.has(item.action)).map((item) => item.caseId);
  const groupCaseIds = tasks.filter((item) => runnableActions.has(item.action) && item.runnerId === 'group').map((item) => item.caseId);
  const groupSourceRecoveryCaseIds = tasks.filter((item) => item.action === 'source-recovery' && item.runnerId === 'group')
    .map((item) => item.caseId);
  const itemCaseIds = tasks.filter((item) => item.action === 'execute' && item.runnerId === 'item').map((item) => item.caseId);
  const remainingCaseIds = tasks.filter((item) => item.action === 'execute' && item.runnerId === 'remaining').map((item) => item.caseId);
  const groupFindingCaseIds = tasks.filter((item) => {
    const binding = groupByCaseId.get(item.caseId);
    return item.action === 'product-defect'
      && binding?.blockClassification === 'observed-product-drift'
      && binding.handlerId !== null;
  }).map((item) => item.caseId);
  const handledItemCaseIds = tasks.filter((item) => (
    item.action === 'handled'
      && item.module === 'brand-item'
      && itemByCaseId.has(item.caseId)
      && authoritativeItemByCaseId.get(item.caseId)?.scriptPath === 'tests/generated/product-center-item-216.generated.spec.ts'
  )).map((item) => item.caseId);
  const revalidationItemCaseIds = [...new Set([...itemCaseIds, ...handledItemCaseIds])].sort();
  const revalidationCaseIds = [
    ...groupCaseIds,
    ...groupFindingCaseIds,
    ...revalidationItemCaseIds,
    ...remainingCaseIds,
  ].sort();
  const reportContent = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-source-governed-execution-plan',
    generatedAt,
    sourceDecisionGeneratedAt: governance.generatedAt,
    status: 'ready',
    summary: {
      total: tasks.length,
      execute: tasks.filter((item) => item.action === 'execute').length,
      sourceRecovery: groupSourceRecoveryCaseIds.length,
      blockedSource: tasks.filter((item) => item.action === 'blocked-source').length,
      deferred: tasks.filter((item) => item.action === 'deferred').length,
      blockedTechnical: tasks.filter((item) => item.action === 'blocked-technical').length,
      productDefect: tasks.filter((item) => item.action === 'product-defect').length,
      handled: tasks.filter((item) => item.action === 'handled').length,
      notApplicable: tasks.filter((item) => item.action === 'not-applicable').length,
    },
    execution: {
      runner: 'scripts/run-product-center-source-governed.ts',
      selectedCaseIds: executableCaseIds,
      workers: 1,
      sourceGateRequired: true,
      cleanupRequired: true,
      runners: [
        {
          runnerId: 'group',
          spec: 'tests/generated/product-center-group.generated.spec.ts',
          selectedCaseIds: groupCaseIds,
          sourceRecoveryCaseIds: groupSourceRecoveryCaseIds,
        },
        {
          runnerId: 'item',
          spec: 'tests/generated/product-center-item-216.generated.spec.ts',
          selectedCaseIds: itemCaseIds,
        },
        {
          runnerId: 'remaining',
          spec: 'tests/generated/product-center-legacy-remaining.generated.spec.ts',
          selectedCaseIds: remainingCaseIds,
        },
      ],
    },
    revalidation: {
      selectedCaseIds: revalidationCaseIds,
      runners: [
        {
          runnerId: 'group',
          spec: 'tests/generated/product-center-group.generated.spec.ts',
          selectedCaseIds: groupCaseIds,
          sourceRecoveryCaseIds: groupSourceRecoveryCaseIds,
        },
        {
          runnerId: 'group-finding',
          spec: 'tests/generated/product-center-group-finding-replay.generated.spec.ts',
          selectedCaseIds: groupFindingCaseIds,
        },
        {
          runnerId: 'item',
          spec: 'tests/generated/product-center-item-216.generated.spec.ts',
          selectedCaseIds: revalidationItemCaseIds,
        },
        {
          runnerId: 'remaining',
          spec: 'tests/generated/product-center-legacy-remaining.generated.spec.ts',
          selectedCaseIds: remainingCaseIds,
        },
      ],
    },
    semanticDuplicateCandidates,
    tasks,
  };
  const selectionFingerprint = fingerprintProductCenterSourceGovernedSelection(reportContent.execution);
  const planFingerprint = fingerprintProductCenterSourceGovernedPlan(reportContent);
  const report = {
    ...reportContent,
    planFingerprint,
    selectionFingerprint,
  };
  if (report.summary.total === 0) throw new Error('来源治理执行计划不得为空');
  if (new Set(report.tasks.map((item) => item.caseId)).size !== report.summary.total) {
    throw new Error('来源治理执行计划存在重复 caseId');
  }
  if (report.summary.execute
    + report.summary.sourceRecovery
    + report.summary.deferred
    + report.summary.blockedSource
    + report.summary.blockedTechnical
    + report.summary.productDefect
    + report.summary.handled
    + report.summary.notApplicable !== report.summary.total) {
    throw new Error('来源治理任务分类总数不守恒');
  }
  const outputRoot = path.join(workspaceRoot, 'deliverables/product-center-source-governance');
  const jsonPath = path.join(outputRoot, 'execution-plan.json');
  const markdownPath = path.join(outputRoot, 'execution-plan.md');
  if (options.write !== false) {
    writeJson(jsonPath, report);
    writeText(markdownPath, renderMarkdown(report));
  }
  return { report, jsonPath, markdownPath };
}

export function fingerprintProductCenterSourceGovernedSelection(selection: {
  selectedCaseIds: readonly string[];
  runners: ReadonlyArray<{
    runnerId: string;
    spec: string;
    selectedCaseIds: readonly string[];
    sourceRecoveryCaseIds?: readonly string[];
  }>;
}): string {
  return fingerprintSystemTestArtifact({
    selectedCaseIds: [...selection.selectedCaseIds],
    runners: selection.runners.map((runner) => ({
      runnerId: runner.runnerId,
      spec: runner.spec,
      selectedCaseIds: [...runner.selectedCaseIds],
      sourceRecoveryCaseIds: [...(runner.sourceRecoveryCaseIds ?? [])],
    })),
  });
}

export function fingerprintProductCenterSourceGovernedPlan(plan: Record<string, unknown> & {
  generatedAt?: string;
  planFingerprint?: string;
  selectionFingerprint?: string;
  execution: Parameters<typeof fingerprintProductCenterSourceGovernedSelection>[0];
}): string {
  const {
    generatedAt: _generatedAt,
    planFingerprint: _planFingerprint,
    selectionFingerprint: _selectionFingerprint,
    ...stablePlanContent
  } = plan;
  return fingerprintSystemTestArtifact({
    ...stablePlanContent,
    selectionFingerprint: fingerprintProductCenterSourceGovernedSelection(plan.execution),
  });
}

function renderMarkdown(report: ReturnType<typeof buildProductCenterSourceGovernedExecutionPlan>['report']): string {
  return [
    '# 商品中心来源治理执行任务',
    '',
    `- 生成时间：${report.generatedAt}`,
    `- 执行：${report.summary.execute}`,
    `- 来源恢复性重验：${report.summary.sourceRecovery}`,
    `- 延期跳过：${report.summary.deferred}`,
    `- 来源阻断：${report.summary.blockedSource}`,
    `- 技术阻断：${report.summary.blockedTechnical}`,
    `- 产品缺陷：${report.summary.productDefect}`,
    `- 已处理不重复执行：${report.summary.handled}`,
    `- 已替代：${report.summary.notApplicable}`,
    '',
    '| 用例 | 模块 | 动作 | 原因 |',
    '| --- | --- | --- | --- |',
    ...report.tasks.map((item) => `| ${item.caseId} | ${item.module} | ${item.action} | ${item.reason} |`),
    '',
  ].join('\n');
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  const result = buildProductCenterSourceGovernedExecutionPlan();
  process.stdout.write(`${JSON.stringify({ summary: result.report.summary, jsonPath: result.jsonPath })}\n`);
}
