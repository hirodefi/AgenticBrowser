/**
 * Stealth browser pool.
 * Launches real Chrome with full stealth patches.
 */

import { chromium, type Browser, type BrowserContext, type Page, type CDPSession } from 'playwright';
import { getConfig } from './config.js';
import { stealthInitScript, stealthArgs, ignoreDefaultArgs, defaultUserAgent, applyCDPStealth } from './stealth.js';
import { type Session, getDefaultSession } from './session.js';

let browserInstance: Browser | null = null;
let contextInstance: BrowserContext | null = null;
let activePage: Page | null = null;

/**
 * Launch a stealth browser instance.
 * Uses real Chrome binary if available, falls back to Chromium.
 */
export async function launchBrowser(session?: Session): Promise<BrowserContext> {
  const config = getConfig();
  const sess = session || getDefaultSession();

  if (contextInstance && browserInstance?.isConnected()) {
    return contextInstance;
  }

  // Determine if real Chrome is available
  let channel = config.channel;
  try {
    // Try launching with real Chrome first
    browserInstance = await chromium.launch({
      channel: 'chrome',
      headless: config.headless,
      args: stealthArgs,
      ignoreDefaultArgs,
    });
  } catch {
    // Fall back to Chromium
    channel = 'chromium';
    browserInstance = await chromium.launch({
      headless: config.headless,
      args: stealthArgs,
      ignoreDefaultArgs,
    });
  }

  // Create persistent context with profile
  contextInstance = await browserInstance.newContext({
    viewport: config.viewport,
    locale: config.locale,
    timezoneId: config.timezone,
    userAgent: defaultUserAgent,
    storageState: undefined, // Fresh start; profiles handle persistence
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
    bypassCSP: true,
    ignoreHTTPSErrors: true,
    javaScriptEnabled: true,
  });

  // Inject stealth script on every new page
  await contextInstance.addInitScript(stealthInitScript);

  // Apply CDP-level stealth
  contextInstance.on('page', async (page) => {
    try {
      const cdp = await page.context().newCDPSession(page);
      await applyCDPStealth(cdp);
    } catch {
      // CDP stealth is best-effort
    }
  });

  // Create the initial page
  activePage = await contextInstance.newPage();

  // Apply CDP stealth to initial page too
  try {
    const cdp = await contextInstance.newCDPSession(activePage);
    await applyCDPStealth(cdp);
  } catch {
    // best-effort
  }

  return contextInstance;
}

/**
 * Get the active page, launching browser if needed.
 */
export async function getPage(session?: Session): Promise<Page> {
  if (activePage && !activePage.isClosed()) {
    return activePage;
  }

  const ctx = await launchBrowser(session);
  activePage = ctx.pages()[0] || await ctx.newPage();
  return activePage;
}

/**
 * Set the active page.
 */
export function setActivePage(page: Page): void {
  activePage = page;
}

/**
 * Get the browser context.
 */
export function getContext(): BrowserContext | null {
  return contextInstance;
}

/**
 * Close everything.
 */
export async function closeBrowser(): Promise<void> {
  if (contextInstance) {
    await contextInstance.close().catch(() => {});
    contextInstance = null;
  }
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
  activePage = null;
}

/**
 * Get a CDP session for the active page.
 */
export async function getCDP(page?: Page): Promise<CDPSession> {
  const p = page || activePage;
  if (!p) throw new Error('No active page');
  return p.context().newCDPSession(p);
}

/**
 * Create a new page with stealth applied.
 */
export async function newPage(): Promise<Page> {
  const ctx = contextInstance || await launchBrowser();
  const page = await ctx.newPage();
  try {
    const cdp = await ctx.newCDPSession(page);
    await applyCDPStealth(cdp);
  } catch {}
  return page;
}
