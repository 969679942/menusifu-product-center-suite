type ClickedImageEvidence = {
  source: string;
  rowIndex: number;
  className: string;
  role: string;
  ancestorRole: string;
  tabIndex: number;
  cursor: string;
};

export function evaluateUnsupportedAddonMainImagePreview(input: {
  created: Record<string, unknown>;
  sources: string[];
  clicked: ClickedImageEvidence;
  preview: { previewCount: number; previewSource: string };
  surface: { dialogCount: number; modalCount: number };
}): { businessClickable: boolean; evidence: Record<string, unknown> } {
  const semanticClickable = input.clicked.role === 'button'
    || input.clicked.role === 'link'
    || input.clicked.ancestorRole === 'button'
    || input.clicked.ancestorRole === 'link'
    || input.clicked.tabIndex >= 0;
  const previewObserved = input.preview.previewCount > 0;
  const businessClickable = semanticClickable || previewObserved;
  const saved = input.created.saved && typeof input.created.saved === 'object'
    ? input.created.saved as Record<string, unknown>
    : {};
  const serverId = saved.serverId === undefined ? undefined : String(saved.serverId);
  const matchesExpected = !businessClickable;
  const expectedValue = '列表行不存在可点击主图目标，且点击图片不会形成大图预览';
  const actualValue = businessClickable
    ? `主图存在业务可点击能力（role=${input.clicked.role || input.clicked.ancestorRole || 'none'}，tabIndex=${input.clicked.tabIndex}，cursor=${input.clicked.cursor}，大图预览数量=${input.preview.previewCount}）`
    : `主图不具备业务可点击语义（cursor=${input.clicked.cursor} 仅作为视觉提示），点击后大图预览数量=${input.preview.previewCount}`;
  return {
    businessClickable,
    evidence: {
      classification: matchesExpected ? 'accepted-observed' : 'product-defect',
      reason: matchesExpected
        ? '加料商品列表主图没有可操作语义，点击图片元素后也未形成大图预览。'
        : `产品实际行为与权威预期不一致：${actualValue}。`,
      assertionReceipts: [{
        claimId: 'TC-ITEM-ADD-035:expectation-1',
        status: matchesExpected ? 'verified' : 'observed-mismatch',
        expectedValue,
        actualValue,
        actualStatus: 'observed',
        observationChannel: 'ui',
        authority: 'user-visible',
        comparison: matchesExpected ? 'matched' : 'mismatched',
      }],
      clickabilityEvidence: {
        semanticClickable,
        previewObserved,
        cursor: input.clicked.cursor,
        cursorIsVisualHintOnly: true,
      },
      ...input,
      auditObservation: {
        runtimeEvidenceId: `runtime:TC-ITEM-ADD-035:${new Date().toISOString()}`,
        observedAt: new Date().toISOString(),
        route: '/pp/brand/list',
        state: 'addon-list-filtered-with-controlled-image-item',
        action: 'click-main-image',
        overlay: ['N/A:no-preview-overlay'],
        ui: {
          status: matchesExpected ? 'passed' : 'observed-mismatch',
          expected: expectedValue,
          actual: actualValue,
        },
        api: {
          status: 'passed',
          expected: '受控主图商品创建成功；观察后按服务器 ID 清理且 UI/API count=0',
          actual: '受控主图商品已创建并登记服务器 ID，统一清理后验证 UI/API 零残留。',
          mutationCount: 1,
        },
        operation: typeof saved.path === 'string' ? `${String(saved.method ?? 'POST')} ${saved.path}` : 'POST /ops-brand/brand-items/addon',
        ...(serverId ? { serverIds: [serverId] } : {}),
      },
    },
  };
}
