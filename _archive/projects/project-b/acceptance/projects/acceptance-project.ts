import type { Browser, BrowserContext } from '@playwright/test';
import type {
  AcceptanceAuthAdapter as PlatformAcceptanceAuthAdapter,
  AcceptanceProject as PlatformAcceptanceProject,
} from '../../../../Test Automation Platform/src/acceptance/acceptance-project';

export type AcceptanceAuthAdapter = PlatformAcceptanceAuthAdapter<Browser, BrowserContext>;
export type AcceptanceProject = PlatformAcceptanceProject<Browser, BrowserContext>;
