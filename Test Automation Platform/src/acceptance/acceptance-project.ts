import type { AcceptanceProjectManifest } from './acceptance-manifest';

export type AcceptanceAuthAdapter<BrowserType, BrowserContextType> = {
  createContext(browser: BrowserType): Promise<BrowserContextType>;
};

export type AcceptanceProject<BrowserType, BrowserContextType> = {
  manifest: AcceptanceProjectManifest;
  apiHosts: readonly string[];
  auth: AcceptanceAuthAdapter<BrowserType, BrowserContextType>;
};
