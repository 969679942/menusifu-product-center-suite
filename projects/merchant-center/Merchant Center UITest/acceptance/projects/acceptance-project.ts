import type { Browser, BrowserContext } from '@playwright/test';
import type {
  AcceptanceAuthAdapter as PlatformAcceptanceAuthAdapter,
  AcceptanceProject as PlatformAcceptanceProject,
} from '../../../../../tap/src/acceptance/acceptance-project';

export type AcceptanceAuthAdapter = PlatformAcceptanceAuthAdapter<Browser, BrowserContext>;
export type AcceptanceProject = PlatformAcceptanceProject<Browser, BrowserContext>;

