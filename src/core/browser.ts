/**
 * Browser pool.
 *
 * Composes: runtime backend (real Chrome or patched binary) ▸ stealth engine
 * ▸ behavior layer ▸ session profile. Everything is lazy: first call to
 * getPage() launches; subsequent calls reuse.
 */

import type { Browser, BrowserContext, CDPSession, Page } from 'playwright';
import { getConfig, profileDir } from './config.js';
import { selectBackend } from '../runtime/index.js';
import { buildProfile, resetProfile, type FingerprintProfile } from '../fingerprint/profile.js';
import { setLaunchSeed, freshSeed } from '../fingerprint/seed.js';
import { installStealth, type StealthHandle } from '../stealth/engine.js';
import { resolvePreset, type BehaviorConfig } from '../behavior/config.js';
import { geoFromProxy } from '../network/geo.js';
import { type Session, getDefaultSession } from './session.js';

let browserInstance: Browser | null = null;
let contextInstance: BrowserContext | null = null;
let stealthHandle: StealthHandle | null = null;
let behaviorConfig: BehaviorConfig | null = null;
let fingerprintProfile: FingerprintProfile | null = null;
let activePage: Page | null = null;

export async function launchBrowser(session?: Session): Promise<BrowserContext> {
  if (contextInstance) {
    try {
      const pages = contextInstance.pages();
      if (pages.length >= 0) return contextInstance;
    } catch {}
  }

  const cfg = getConfig();
  const sess = session || getDefaultSession();

  // Resolve geo from proxy first (so profile builds with the right tz/locale)
  let timezone = cfg.timezone;
  let locale = cfg.locale;
  let webrtcIp: string | undefined;
  if (cfg.geoFromProxy && cfg.proxy) {
    const geo = await geoFromProxy(cfg.proxy);
    timezone ??= geo.timezone;
    locale ??= geo.locale;
    webrtcIp = geo.exitIp;
  }

  // Fresh seed per launch (deterministic for this process)
  setLaunchSeed(freshSeed());
  resetProfile();
  fingerprintProfile = buildProfile({
    platform: cfg.fingerprintPlatform,
    timezone,
    locale,
    viewport: cfg.viewport,
  });

  // Pick backend
  const backend = await selectBackend(cfg.backend);
  const userDataDir = cfg.persistentProfile ? profileDir(sess.id || cfg.profileName) : undefined;

  contextInstance = await backend.launch({
    headless: cfg.headless,
    profile: fingerprintProfile,
    proxy: cfg.proxy,
    userDataDir,
    extraArgs: cfg.extraArgs,
    webrtcIp,
  });

  // browser handle (may be undefined for persistent contexts)
  browserInstance = contextInstance.browser?.() ?? null;

  // Stealth (no-op on patched backend's already-clean fingerprint, but the
  // CDP coherence layer still applies — Client Hints, locale, timezone).
  stealthHandle = await installStealth(contextInstance, {
    platform: cfg.fingerprintPlatform,
    timezone,
    locale,
    viewport: cfg.viewport,
  });

  behaviorConfig = resolvePreset(cfg.behaviorPreset, cfg.behaviorOverrides);

  // Initial page
  const pages = contextInstance.pages();
  activePage = pages[0] ?? await contextInstance.newPage();
  await stealthHandle.applyToPage(activePage);

  return contextInstance;
}

export async function getPage(session?: Session): Promise<Page> {
  if (activePage && !activePage.isClosed()) return activePage;
  const ctx = await launchBrowser(session);
  activePage = ctx.pages()[0] || await ctx.newPage();
  return activePage;
}

export function setActivePage(page: Page): void {
  activePage = page;
}

export function getContext(): BrowserContext | null {
  return contextInstance;
}

export function getFingerprint(): FingerprintProfile | null {
  return fingerprintProfile;
}

export function getBehavior(): BehaviorConfig {
  if (!behaviorConfig) behaviorConfig = resolvePreset(getConfig().behaviorPreset, getConfig().behaviorOverrides);
  return behaviorConfig;
}

export async function closeBrowser(): Promise<void> {
  if (contextInstance) {
    await contextInstance.close().catch(() => {});
    contextInstance = null;
  }
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
  stealthHandle = null;
  fingerprintProfile = null;
  activePage = null;
}

export async function getCDP(page?: Page): Promise<CDPSession> {
  const p = page || activePage;
  if (!p) throw new Error('No active page');
  return p.context().newCDPSession(p);
}

export async function newPage(): Promise<Page> {
  const ctx = contextInstance || await launchBrowser();
  const page = await ctx.newPage();
  if (stealthHandle) await stealthHandle.applyToPage(page);
  return page;
}
