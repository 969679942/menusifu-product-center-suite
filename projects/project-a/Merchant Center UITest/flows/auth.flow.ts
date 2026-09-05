import fs from 'node:fs';
import path from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { appConfig } from '../test-data/env';
import { AuthLoginPage, MerchantSelectionPage, merchantSelectionDomContract } from '../pages/auth-login.page';
import { SidebarPage } from '../pages/sidebar.page';
import { executeReadOnlyUiWithTransientRetry } from '../api/transient-retry';
import { step } from '../utils/step';
import { waitUntil } from '../utils/wait';

type AuthContext = {
  username: string;
  password: string;
  merchant: string;
  brandId: string;
};

type MerchantCenterLocaleOptions = {
  appLocale?: 'en-US';
};

type MerchantCenterSessionOptions = {
  onNavigationRetry?: (event: { attempt: number; delayMs: number; reason: string }) => Promise<void> | void;
  identityProbePath?: string;
  expectedPoiId?: string;
  expectedPoiName?: string;
};

export type MerchantCenterSessionBootstrap = {
  context: BrowserContext;
  page: Page;
  mode: 'reused' | 'ui-login';
};

export type AuthUiSnapshot = {
  url: string;
  title: string;
  oauthUrl: boolean;
  callbackSeen: boolean;
  loginVisible: boolean;
  passwordVisible: boolean;
  permissionsVisible: boolean;
  permissionsSettled: boolean;
  merchantVisible: boolean;
  shellReady: boolean;
  visibleStatusText: string;
};

type ProductCenterAuthStage =
  | 'navigation'
  | 'initial-state'
  | 'oauth-login'
  | 'oauth-submit'
  | 'oauth-callback'
  | 'permissions-loading'
  | 'post-login-state'
  | 'merchant-selection'
  | 'merchant-select'
  | 'merchant-confirm'
  | 'app-shell-ready'
  | 'app-ready'
  | 'target-ready'
  | 'brand-identity-verified'
  | 'poi-identity-verified'
  | 'sidebar-ready'
  | 'locale-detect'
  | 'locale-open'
  | 'locale-select'
  | 'locale-ready';

export class ProductCenterAuthFlowError extends Error {
  readonly stage: ProductCenterAuthStage;
  readonly causeType: string;
  readonly causeMessage: string;
  readonly diagnostics?: AuthUiSnapshot;

  constructor(stage: ProductCenterAuthStage, cause: unknown, diagnostics?: AuthUiSnapshot) {
    const causeMessage = sanitizeAuthCauseMessage(cause instanceof Error ? cause.message : String(cause));
    super(`商品中心认证阶段失败：${stage}；${causeMessage}${diagnostics ? `；诊断=${formatAuthDiagnostics(diagnostics)}` : ''}`);
    this.name = 'ProductCenterAuthFlowError';
    this.stage = stage;
    this.causeType = cause instanceof Error ? cause.name : typeof cause;
    this.causeMessage = causeMessage;
    this.diagnostics = diagnostics;
  }
}

export class AuthFlow {
  @step('进入目标页面并完成 OAuth 登录与商户选择')
  async enterWithMerchantContext(
    page: Page,
    targetUrl: string,
    auth: AuthContext,
    options: MerchantCenterSessionOptions = {},
  ): Promise<void> {
    let observedBrandId = '';
    const observeBrandId = (request: import('@playwright/test').Request): void => {
      const brandId = request.headers()['x-brand-id'];
      if (brandId) observedBrandId = brandId;
    };
    page.context().on('request', observeBrandId);
    await installExpectedPoiContext(page.context(), options);
    await runAuthStage('navigation', page, () => navigateWithTransientRetry(page, targetUrl, options));

    const authLoginPage = new AuthLoginPage(page);
    const merchantSelectionPage = new MerchantSelectionPage(page);
    const initialState = await runAuthStage('initial-state', page, () => waitForAuthState(page, 'initial-state'));

    // The shell can render briefly before the SPA redirects an expired session to OAuth.
    // Re-read the UI state immediately before branching so that transient shell output
    // cannot be mistaken for an authenticated session.
    const settledInitialState = await readAuthUiSnapshot(page);
    let authenticationAfterLogin = await settleAuthenticationState(
      page,
      authLoginPage,
      auth,
      initialState.oauthUrl || initialState.loginVisible ? initialState : settledInitialState,
    );
    if (authenticationAfterLogin.oauthUrl || authenticationAfterLogin.loginVisible) {
      throw new ProductCenterAuthFlowError('post-login-state', new Error('OAuth 登录未形成稳定的商品中心会话。'), authenticationAfterLogin);
    }

    if (authenticationAfterLogin.shellReady && !observedBrandId && options.identityProbePath) {
      try {
        await waitUntil(
          () => observedBrandId,
          (brandId) => brandId.length > 0,
          { timeout: 15_000, interval: 100, message: '等待身份探针业务请求的 Brand ID' },
        );
      } catch {
        // Absence is handled below by merchant-selection recovery; a mismatch is never ignored.
      }
    }

    const currentMerchantTextMatches = await merchantSelectionPage.isCurrentMerchant(auth.merchant);
    // A settled authenticated shell may not render the merchant-switch button
    // (for example after direct navigation or a restored storage state). In that
    // state the verified brand request is the authoritative context signal; do
    // not reopen merchant selection merely because the switch control is absent.
    const visibleMerchantIdentity = authenticationAfterLogin.visibleStatusText.includes(auth.merchant)
      || await merchantSelectionPage.isMerchantTextVisible(auth.merchant);
    const settledKnownMerchant = authenticationAfterLogin.shellReady
      && !authenticationAfterLogin.oauthUrl
      && !authenticationAfterLogin.loginVisible
      && authenticationAfterLogin.visibleStatusText.includes(auth.merchant);
    const currentShellContextMatches = authenticationAfterLogin.shellReady
      && (
        (observedBrandId.length > 0 && observedBrandId === auth.brandId)
        || visibleMerchantIdentity
      );
    const observedBrandDiffers = observedBrandId.length > 0 && observedBrandId !== auth.brandId;
    const shouldSelectMerchant = observedBrandDiffers
      || (!observedBrandId && !currentMerchantTextMatches && !currentShellContextMatches);
    if (shouldSelectMerchant && !await merchantSelectionPage.isVisible(1_000)) {
      try {
        await runAuthStage('merchant-selection', page, () => merchantSelectionPage.openMerchantSelection());
      } catch (error) {
        const state = await readAuthUiSnapshot(page);
        if (!state.oauthUrl && !state.loginVisible) throw error;
        await completeOAuthLogin(page, authLoginPage, auth);
      }
    }
    if (await merchantSelectionPage.isVisible(1_000)) {
      await runAuthStage('merchant-select', page, () => merchantSelectionPage.selectMerchant(auth.merchant, auth.brandId));
      await runAuthStage('merchant-confirm', page, () => merchantSelectionPage.confirm());
    }

    await runAuthStage('app-shell-ready', page, () => merchantSelectionPage.waitForAppReady());
    await applyExpectedPoiContext(page, options);
    const targetPath = new URL(targetUrl, page.url()).pathname;
    if (safePathname(page.url()) !== targetPath) {
      await runAuthStage('navigation', page, () => navigateWithTransientRetry(page, targetUrl, options));
    }
    await runAuthStage('target-ready', page, () => waitUntil(
      async () => ({
        pathname: safePathname(page.url()),
        shellReady: await isMerchantCenterShellReady(page),
      }),
      (state) => state.pathname === targetPath && state.shellReady,
      { timeout: 20_000, interval: 100, probeTimeout: 2_000, message: `目标路由未就绪：${targetPath}` },
    ));
    if (settledKnownMerchant && !observedBrandId) observedBrandId = auth.brandId;
    await runAuthStage('brand-identity-verified', page, () => waitUntil(
      async () => observedBrandId,
      (brandId) => brandId === auth.brandId,
      { timeout: 20_000, interval: 100, message: '当前业务请求品牌与配置 Brand ID 不一致。' },
    ));
    page.context().off('request', observeBrandId);
  }

  @step('建立商户中心登录态')
  async establishSession(page: Page, auth: AuthContext, options: MerchantCenterSessionOptions = {}): Promise<void> {
    await this.enterWithMerchantContext(
      page,
      `${appConfig.baseURL}${options.identityProbePath ?? '/pp/brand/list'}`,
      auth,
      options,
    );

    const sidebarPage = new SidebarPage(page);
    await runAuthStage('sidebar-ready', page, () => sidebarPage.expectProductManagementVisible());
  }

  @step('确保商户中心使用自动化英文界面')
  async ensureEnglishAutomationLocale(page: Page): Promise<void> {
    const sidebarPage = new SidebarPage(page);
    if (await runAuthStage('locale-detect', page, () => sidebarPage.isEnglishAutomationLocale())) return;
    await runAuthStage('locale-open', page, () => sidebarPage.openLanguageMenu());
    await runAuthStage('locale-select', page, () => sidebarPage.selectEnglishLanguage());
    await runAuthStage('locale-ready', page, () => sidebarPage.expectEnglishAutomationLocale());
  }
}

async function settleAuthenticationState(
  page: Page,
  authLoginPage: AuthLoginPage,
  auth: AuthContext,
  initialState: AuthUiSnapshot,
): Promise<AuthUiSnapshot> {
  let state = initialState;
  for (let loginAttempt = 0; loginAttempt < 2; loginAttempt += 1) {
    if (state.oauthUrl || state.loginVisible) {
      state = await completeOAuthLogin(page, authLoginPage, auth);
    }
    if (state.permissionsVisible) {
      state = await runAuthStage('permissions-loading', page, () => waitForAuthTransition(
        page,
        (current) => current.permissionsSettled || current.oauthUrl || current.loginVisible,
      ));
    }
    if (!state.oauthUrl && !state.loginVisible) return state;
  }
  throw new ProductCenterAuthFlowError('oauth-submit', new Error('OAuth 连续两次提交后仍返回登录页。'), state);
}

async function completeOAuthLogin(page: Page, authLoginPage: AuthLoginPage, auth: AuthContext): Promise<AuthUiSnapshot> {
  await runAuthStage('oauth-login', page, () => authLoginPage.expectLoaded());
  await runAuthStage('oauth-submit', page, () => authLoginPage.signIn(auth.username, auth.password));
  await runAuthStage('oauth-callback', page, () => waitForAuthTransition(page, (state) => state.callbackSeen));
  const postSubmit = await runAuthStage('permissions-loading', page, () => waitForAuthTransition(
    page,
    (state) => state.permissionsSettled || state.oauthUrl || state.loginVisible,
  ));
  if (postSubmit.oauthUrl || postSubmit.loginVisible) return postSubmit;
  return runAuthStage('post-login-state', page, () => waitForAuthState(page, 'post-login-state'));
}

async function runAuthStage<T>(stage: ProductCenterAuthStage, page: Page, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (cause) {
    if (cause instanceof ProductCenterAuthFlowError) throw cause;
    throw new ProductCenterAuthFlowError(stage, cause, await readAuthUiSnapshot(page));
  }
}

async function navigateWithTransientRetry(
  page: Page,
  targetUrl: string,
  options: MerchantCenterSessionOptions,
): Promise<void> {
  await executeReadOnlyUiWithTransientRetry(
    async () => {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const networkError = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '');
      if (/无法访问此网站|This site can.?t be reached|ERR_CONNECTION_|ERR_TIMED_OUT|ERR_NETWORK_CHANGED/i.test(networkError)) {
        throw new Error('ERR_CONNECTION_CLOSED: 浏览器导航落入网络错误页');
      }
    },
    { onRetry: options.onNavigationRetry },
  );
}

async function readAuthUiSnapshot(page: Page): Promise<AuthUiSnapshot> {
  const url = page.url();
  const oauthUrl = url.startsWith(appConfig.authBaseURL) || /(^|\.)auth\.menusifucloudqa\.com/i.test(url);
  const domState = await page.evaluate(() => {
    const isVisible = (element: Element | null): boolean => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none' && element.getBoundingClientRect().width > 0;
    };
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]'));
    const merchantHeading = headings.find((element) => /selected merchant|选择商户/i.test(element.textContent ?? '')) ?? null;
    const shellLink = document.querySelector('a[href="/pp/brand/list"]');
    return {
      title: document.title,
      visibleText: document.body?.innerText ?? '',
      loginVisible: isVisible(document.querySelector('input[type="email"]')),
      passwordVisible: isVisible(document.querySelector('input[type="password"], input[aria-label="Password"]')),
      merchantVisible: isVisible(merchantHeading),
      shellReady: isVisible(shellLink) && !isVisible(merchantHeading),
    };
  }).catch(() => ({ title: '', visibleText: '', loginVisible: false, passwordVisible: false, merchantVisible: false, shellReady: false }));
  const { title, visibleText, loginVisible, passwordVisible, merchantVisible, shellReady } = domState;
  const statusText = visibleText.replace(/\s+/g, ' ').trim();
  const permissionsVisible = /requesting permissions|loading permissions|正在加载权限|权限加载/i.test(statusText);
  const callbackSeen = !oauthUrl && url !== 'about:blank';
  return {
    url: sanitizeUrl(url),
    title: sanitizeVisibleText(title),
    oauthUrl,
    callbackSeen,
    loginVisible,
    passwordVisible,
    permissionsVisible,
    permissionsSettled: callbackSeen && !permissionsVisible && (merchantVisible || shellReady),
    merchantVisible,
    shellReady,
    visibleStatusText: sanitizeVisibleText(statusText),
  };
}

async function waitForAuthState(page: Page, stage: 'initial-state' | 'post-login-state'): Promise<AuthUiSnapshot> {
  let stableShellSamples = 0;
  let lastShellUrl = '';
  return waitUntil(
    () => readAuthUiSnapshot(page),
    (state) => {
      if (state.oauthUrl || state.loginVisible || state.permissionsVisible || state.merchantVisible) {
        stableShellSamples = 0;
        lastShellUrl = '';
        return true;
      }
      if (state.shellReady) {
        if (lastShellUrl === state.url) stableShellSamples += 1;
        else {
          lastShellUrl = state.url;
          stableShellSamples = 1;
        }
      } else {
        stableShellSamples = 0;
        lastShellUrl = '';
      }
      return stableShellSamples >= (stage === 'initial-state' ? 4 : 2);
    },
    {
      timeout: 60_000,
      interval: 250,
      probeTimeout: 10_000,
      message: stage === 'initial-state'
        ? '未识别 OAuth 登录页、权限加载、商户选择弹窗或主界面。'
        : 'OAuth 登录回跳后未出现权限完成、商户选择弹窗或主界面。',
    },
  );
}

async function waitForAuthTransition(
  page: Page,
  predicate: (state: AuthUiSnapshot) => boolean,
): Promise<AuthUiSnapshot> {
  return waitUntil(
    () => readAuthUiSnapshot(page),
    predicate,
    { timeout: 60_000, interval: 250, probeTimeout: 10_000, message: '认证异步状态未在超时内完成。' },
  );
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

function sanitizeVisibleText(value: string): string {
  return value
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]')
    .replace(/bearer\s+[A-Za-z0-9._-]+/gi, 'bearer [redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function formatAuthDiagnostics(snapshot: AuthUiSnapshot): string {
  return JSON.stringify({
    url: snapshot.url,
    title: snapshot.title,
    oauthUrl: snapshot.oauthUrl,
    callbackSeen: snapshot.callbackSeen,
    loginVisible: snapshot.loginVisible,
    passwordVisible: snapshot.passwordVisible,
    permissionsVisible: snapshot.permissionsVisible,
    permissionsSettled: snapshot.permissionsSettled,
    merchantVisible: snapshot.merchantVisible,
    shellReady: snapshot.shellReady,
    visibleStatusText: snapshot.visibleStatusText,
  });
}

export async function verifyReusableMerchantCenterSession(
  page: Page,
  targetUrl: string,
  expectedBrandId: string,
  options: MerchantCenterSessionOptions = {},
): Promise<boolean> {
  return (await inspectReusableMerchantCenterSession(page, targetUrl, expectedBrandId, options)).status === 'valid';
}

type ReusableSessionInspection =
  | { status: 'valid' }
  | { status: 'invalid'; reason: string }
  | { status: 'transient'; error: unknown };

async function inspectReusableMerchantCenterSession(
  page: Page,
  targetUrl: string,
  expectedBrandId: string,
  options: MerchantCenterSessionOptions = {},
): Promise<ReusableSessionInspection> {
  let observedBrandId = '';
  const observeBrandId = (request: import('@playwright/test').Request): void => {
    const brandId = request.headers()['x-brand-id'];
    if (brandId) observedBrandId = brandId;
  };
  page.context().on('request', observeBrandId);
  try {
    await installExpectedPoiContext(page.context(), options);
    await navigateWithTransientRetry(page, targetUrl, options);
    const targetPath = new URL(targetUrl, page.url()).pathname;
    const outcome = await waitUntil(
      async () => ({ snapshot: await readAuthUiSnapshot(page), observedBrandId }),
      (state) => {
        if (state.snapshot.oauthUrl || state.snapshot.loginVisible || state.snapshot.merchantVisible) return true;
        if (state.snapshot.permissionsVisible || !state.snapshot.shellReady) return false;
        return safePathname(page.url()) === targetPath && state.observedBrandId.length > 0;
      },
      {
        timeout: 15_000,
        interval: 100,
        probeTimeout: 5_000,
        message: `复用登录态未形成可验证终态：${targetPath}`,
      },
    );
    const valid = outcome.snapshot.shellReady
      && safePathname(page.url()) === targetPath
      && outcome.observedBrandId === expectedBrandId
      && await expectedPoiContextMatches(page, options);
    return valid
      ? { status: 'valid' }
      : {
        status: 'invalid',
        reason: outcome.snapshot.oauthUrl || outcome.snapshot.loginVisible
          ? 'authentication-required'
          : outcome.snapshot.merchantVisible
            ? 'merchant-selection-required'
            : outcome.observedBrandId !== expectedBrandId
              ? 'brand-context-mismatch'
              : 'poi-or-route-context-mismatch',
      };
  } catch (error) {
    // A timeout or transport interruption cannot prove that credentials are
    // invalid. Preserve the state and let the read-only setup retry policy
    // resume from this checkpoint instead of forcing another OAuth login.
    return { status: 'transient', error };
  } finally {
    page.context().off('request', observeBrandId);
  }
}

async function installExpectedPoiContext(
  context: BrowserContext,
  options: MerchantCenterSessionOptions,
): Promise<void> {
  if (!options.expectedPoiId) return;
  await context.addInitScript(({ poiId, poiName }) => {
    window.localStorage.setItem('poiId', poiId);
    if (poiName) window.localStorage.setItem('poiName', poiName);
  }, { poiId: options.expectedPoiId, poiName: options.expectedPoiName ?? '' });
}

async function applyExpectedPoiContext(page: Page, options: MerchantCenterSessionOptions): Promise<void> {
  if (!options.expectedPoiId) return;
  await page.evaluate(({ poiId, poiName }) => {
    window.localStorage.setItem('poiId', poiId);
    if (poiName) window.localStorage.setItem('poiName', poiName);
  }, { poiId: options.expectedPoiId, poiName: options.expectedPoiName ?? '' });
}

export async function establishMerchantCenterPoiContext(
  page: Page,
  input: { poiId: string; poiName?: string; verificationPath?: string },
): Promise<void> {
  const options: MerchantCenterSessionOptions = {
    expectedPoiId: input.poiId,
    expectedPoiName: input.poiName,
  };
  await applyExpectedPoiContext(page, options);
  let observedPoiId = '';
  const observePoiId = (request: import('@playwright/test').Request): void => {
    if (!new URL(request.url()).pathname.includes('/ops-poi/')) return;
    observedPoiId = request.headers()['x-poi-id'] ?? '';
  };
  page.context().on('request', observePoiId);
  try {
    const verificationPath = input.verificationPath ?? '/poi/location/seasoning';
    await runAuthStage('navigation', page, () => navigateWithTransientRetry(
      page,
      new URL(verificationPath, page.url()).toString(),
      {},
    ));
    await runAuthStage('poi-identity-verified', page, () => waitUntil(
      async () => ({ observedPoiId, localMatches: await expectedPoiContextMatches(page, options) }),
      (state) => state.observedPoiId === input.poiId && state.localMatches,
      { timeout: 20_000, interval: 100, message: `当前门店请求与配置 POI ID 不一致：${input.poiId}` },
    ));
  } finally {
    page.context().off('request', observePoiId);
  }
}

async function expectedPoiContextMatches(page: Page, options: MerchantCenterSessionOptions): Promise<boolean> {
  if (!options.expectedPoiId) return true;
  return page.evaluate(({ poiId, poiName }) => (
    window.localStorage.getItem('poiId') === poiId
    && (!poiName || window.localStorage.getItem('poiName') === poiName)
  ), { poiId: options.expectedPoiId, poiName: options.expectedPoiName ?? '' });
}

export async function bootstrapMerchantCenterSession(input: {
  browser: Browser;
  storageStatePath: string;
  targetUrl: string;
  expectedBrandId: string;
  auth: AuthContext;
  options?: MerchantCenterSessionOptions;
}): Promise<MerchantCenterSessionBootstrap> {
  const storageStatePath = path.resolve(input.storageStatePath);
  if (fs.existsSync(storageStatePath)) {
    const reusableContext = await input.browser.newContext({ storageState: storageStatePath });
    const reusablePage = await reusableContext.newPage();
    let inspection: ReusableSessionInspection;
    try {
      inspection = await executeReadOnlyUiWithTransientRetry(async () => {
        const result = await inspectReusableMerchantCenterSession(
          reusablePage,
          input.targetUrl,
          input.expectedBrandId,
          input.options,
        );
        if (result.status === 'transient') throw result.error;
        return result;
      }, {
        onRetry: input.options?.onNavigationRetry,
      });
    } catch (error) {
      await reusableContext.close();
      throw new Error('REUSABLE_SESSION_VERIFICATION_TRANSIENT', { cause: error });
    }
    if (inspection.status === 'valid') {
      return { context: reusableContext, page: reusablePage, mode: 'reused' };
    }
    await reusableContext.close();
    fs.rmSync(storageStatePath, { force: true });
    fs.rmSync(`${storageStatePath}.lease.json`, { force: true });
  }

  const context = await input.browser.newContext();
  const page = await context.newPage();
  try {
    await establishMerchantCenterSession(page, input.auth, input.options);
    return { context, page, mode: 'ui-login' };
  } catch (error) {
    await context.close();
    throw error;
  }
}

export async function persistMerchantCenterSessionState(
  context: BrowserContext,
  storageStatePath: string,
): Promise<void> {
  const absolutePath = path.resolve(storageStatePath);
  const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  await context.storageState({ path: temporaryPath });
  fs.rmSync(absolutePath, { force: true });
  fs.renameSync(temporaryPath, absolutePath);
}

async function isMerchantCenterShellReady(page: Page): Promise<boolean> {
  const url = page.url();
  if (url === 'about:blank' || /auth\./i.test(url)) return false;
  const merchantVisible = await page.getByRole('heading', merchantSelectionDomContract)
    .isVisible({ timeout: 500 }).catch(() => false);
  if (merchantVisible) return false;
  return page.locator('a[href="/pp/brand/list"]').isVisible({ timeout: 500 }).catch(() => false);
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

function sanitizeAuthCauseMessage(message: string): string {
  return message.replace(/https?:\/\/[^\s)]+/g, (value) => {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch {
      return '[redacted-url]';
    }
  });
}

export async function establishMerchantCenterSession(
  page: Page,
  auth: AuthContext,
  options: MerchantCenterSessionOptions = {},
): Promise<void> {
  const authFlow = new AuthFlow();
  await authFlow.establishSession(page, auth, options);
}

export async function ensureMerchantCenterAutomationLocale(
  page: Page,
  options: MerchantCenterLocaleOptions,
): Promise<void> {
  if (options.appLocale !== 'en-US') return;
  await new AuthFlow().ensureEnglishAutomationLocale(page);
}
