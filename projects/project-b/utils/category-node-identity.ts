export function matchesCategoryNodeIdentity(visibleText: string, identity: string): boolean {
  const normalizedText = visibleText.trim();
  return normalizedText === identity || normalizedText.startsWith(`${identity}(`);
}
