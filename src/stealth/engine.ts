/**
 * Stealth engine.
 *
 * Wires every stealth layer together against a BrowserContext:
 *   1. Pre-doc init script injected into main world + worker contexts
 *   2. CDP UA / Client Hints override so headers and JS agree
 *   3. CDP locale + timezone override at the binary level (no JS detection)
 *   4. CDP auto-attach so workers, iframes, and service workers also get patched
 *   5. Real-Chrome-coherent extra HTTP headers (sec-ch-ua, Accept-Language)
 *
 * Designed so a future backend that supplies a patched binary can skip the
 * init-script work entirely while keeping the same public surface.
 */

import type { BrowserContext, Page, CDPSession } from 'playwright';
import { getProfile, type FingerprintProfile, type ProfileOverrides } from '../fingerprint/profile.js';
import { buildInitScript } from './init-script.js';

export interface StealthOptions extends ProfileOverrides {
  /** Run the init script even on existing pages (for retrofits). */
  retrofitOpenPages?: boolean;
}

export interface StealthHandle {
  profile: FingerprintProfile;
  applyToPage(page: Page): Promise<void>;
}

export async function installStealth(
  ctx: BrowserContext,
  options: StealthOptions = {},
): Promise<StealthHandle> {
  const profile = getProfile(options);
  const script = buildInitScript(profile);

  await ctx.addInitScript({ content: script });
  await ctx.setExtraHTTPHeaders(coherentHeaders(profile));

  const applyToPage = async (page: Page): Promise<void> => {
    let cdp: CDPSession;
    try {
      cdp = await ctx.newCDPSession(page);
    } catch {
      return;
    }
    await applyCDPLayer(cdp, profile);
  };

  ctx.on('page', (page) => {
    applyToPage(page).catch(() => {});
  });

  if (options.retrofitOpenPages) {
    for (const page of ctx.pages()) {
      await applyToPage(page);
    }
  }

  return { profile, applyToPage };
}

function coherentHeaders(p: FingerprintProfile): Record<string, string> {
  const chUa = p.ua.brands.map(b => `"${b.brand}";v="${b.version}"`).join(', ');
  const chPlatform = `"${p.ua.uaPlatform}"`;
  return {
    'Accept-Language': p.ua.acceptLanguage,
    'sec-ch-ua': chUa,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': chPlatform,
  };
}

async function applyCDPLayer(cdp: CDPSession, p: FingerprintProfile): Promise<void> {
  try {
    await cdp.send('Network.setUserAgentOverride', {
      userAgent: p.ua.ua,
      acceptLanguage: p.ua.acceptLanguage,
      platform: p.ua.platform,
      userAgentMetadata: {
        brands: p.ua.brands,
        fullVersion: p.ua.fullVersion,
        fullVersionList: p.ua.brands.map(b => ({ brand: b.brand, version: p.ua.fullVersion })),
        platform: p.ua.uaPlatform,
        platformVersion: p.ua.uaPlatformVersion,
        architecture: p.ua.architecture,
        model: p.ua.model,
        mobile: p.ua.mobile,
        bitness: p.ua.bitness,
        wow64: false,
      },
    });
  } catch {}

  try { await cdp.send('Emulation.setLocaleOverride', { locale: p.locale }); } catch {}
  try { await cdp.send('Emulation.setTimezoneOverride', { timezoneId: p.timezone }); } catch {}
  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: p.viewport.width,
      height: p.viewport.height,
      deviceScaleFactor: p.screen.pixelRatio,
      mobile: false,
      screenWidth: p.screen.width,
      screenHeight: p.screen.height,
      positionX: 0,
      positionY: 0,
      dontSetVisibleSize: true,
      screenOrientation: { type: 'landscapePrimary', angle: 0 },
    });
  } catch {}

  try {
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
  } catch {}
}

