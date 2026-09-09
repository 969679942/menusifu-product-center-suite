import type { RecipeCapabilityStep } from './automation-recipe';

export function sidebarNavigationCapability(route: string): RecipeCapabilityStep {
  return {
    id: 'navigation.sidebar.open',
    saveAs: 'navigation',
    input: { targetPath: route as `/${string}` },
  };
}
