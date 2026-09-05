import {
  buildProductCenterAuditUnit,
  type ProductCenterAuditSafetyLevel,
  type ProductCenterAuditUnit,
  type ProductCenterAuditUnitDenominator,
} from './product-center-audit-unit';

const routes = ['/pp/brand/create/combo', '/pp/brand/edit/combo'] as const;

const menuActionDefinitions = [
  {
    actionId: 'combo:add-fixed',
    label: 'Add Fixed Combo',
    overlayId: 'add-fixed-combo-dialog',
    supportsSelection: true,
    supportsCreation: true,
  },
  {
    actionId: 'combo:select-fixed',
    label: 'Select Fixed Combo',
    overlayId: 'select-fixed-combo-dialog',
    supportsSelection: true,
    supportsCreation: false,
  },
  {
    actionId: 'combo:add-custom',
    label: 'Add Custom Combo',
    overlayId: 'add-custom-combo-dialog',
    supportsSelection: true,
    supportsCreation: true,
  },
  {
    actionId: 'combo:select-custom',
    label: 'Select Custom Combo',
    overlayId: 'select-custom-combo-dialog',
    supportsSelection: true,
    supportsCreation: false,
  },
] as const;

export type ProductCenterItemComboMenuAction = {
  actionId: string;
  label: string;
  overlayId: string;
};

export type ProductCenterItemComboAuditModel = {
  routes: string[];
  menuActions: ProductCenterItemComboMenuAction[];
  denominator: ProductCenterAuditUnitDenominator;
};

export function buildProductCenterItemComboAuditModel(): ProductCenterItemComboAuditModel {
  const units = menuActionDefinitions.flatMap((action) => (
    routes.flatMap((route) => buildActionUnits(route, action))
  ));
  return {
    routes: [...routes],
    menuActions: menuActionDefinitions.map(({ actionId, label, overlayId }) => ({
      actionId,
      label,
      overlayId,
    })),
    denominator: {
      schemaVersion: '1.0.0',
      auditVersion: 'item-combo-deep-audit-v1',
      scopeKey: 'product-center:item-combo:create-edit',
      terminal: true,
      units: units.sort((left, right) => left.id.localeCompare(right.id)),
    },
  };
}

function buildActionUnits(
  route: string,
  action: (typeof menuActionDefinitions)[number],
): ProductCenterAuditUnit[] {
  const dialogOverlayPath = ['add-combo-group-menu', action.overlayId];
  const sourceIds = [`observed-ui:${route}:${action.actionId}`];
  const units = [
    unit(route, `${action.actionId}:route-base`, `${action.actionId}:observe-base`, ['add-combo-group-menu'], 'L0-read-only', sourceIds),
    unit(route, `${action.actionId}:menu-open`, `${action.actionId}:open-menu`, ['add-combo-group-menu'], 'L0-read-only', sourceIds),
    unit(route, `${action.actionId}:dialog-loading`, `${action.actionId}:observe-loading`, dialogOverlayPath, 'L0-read-only', sourceIds),
    unit(route, `${action.actionId}:dialog-loaded`, `${action.actionId}:open`, dialogOverlayPath, 'L0-read-only', sourceIds),
    unit(route, `${action.actionId}:dialog-empty`, `${action.actionId}:observe-empty`, dialogOverlayPath, 'L0-read-only', sourceIds),
    unit(route, `${action.actionId}:dialog-populated`, `${action.actionId}:observe-populated`, dialogOverlayPath, 'L0-read-only', sourceIds),
    unit(route, `${action.actionId}:cancelled`, `${action.actionId}:cancel`, dialogOverlayPath, 'L1-reversible', sourceIds),
  ];
  if (action.supportsSelection) {
    units.push(unit(
      route,
      `${action.actionId}:selected`,
      `${action.actionId}:select-row`,
      [...dialogOverlayPath, 'selection-state'],
      'L1-reversible',
      sourceIds,
    ));
  }
  if (action.supportsCreation) {
    units.push(
      unit(
        route,
        `${action.actionId}:validation`,
        `${action.actionId}:submit-invalid`,
        [...dialogOverlayPath, 'validation-state'],
        'L2-controlled-negative',
        sourceIds,
      ),
      unit(
        route,
        `${action.actionId}:terminal-card`,
        `${action.actionId}:create`,
        [...dialogOverlayPath, 'terminal-card'],
        'L3-crud',
        sourceIds,
      ),
    );
  }
  return units;
}

function unit(
  route: string,
  stateId: string,
  actionId: string,
  overlayPath: readonly string[],
  safetyLevel: ProductCenterAuditSafetyLevel,
  sourceIds: readonly string[],
): ProductCenterAuditUnit {
  return buildProductCenterAuditUnit({
    route,
    stateId,
    actionId,
    overlayPath,
    safetyLevel,
    sourceIds,
    resourceKeys: ['product-center:item-combo'],
  });
}

