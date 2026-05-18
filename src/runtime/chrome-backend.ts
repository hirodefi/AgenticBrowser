/**
 * Default backend: user's installed Chrome (real binary, authentic TLS,
 * authentic HTTP/2 and HTTP/3 stack) driven via Playwright.
 *
 * Tries `channel: 'chrome'` first, then 'msedge', then bundled Chromium.
 */

import { chromium, type BrowserContext } from 'playwright';
import type { RuntimeBackend, RuntimeLaunchOptions } from './types.js';
import { buildLaunchArgs, IGNORE_DEFAULT_ARGS } from '../network/args.js';
import { resolveProxy } from '../network/proxy.js';

const CHANNELS_IN_ORDER = ['chrome', 'msedge'] as const;

export const chromeBackend: RuntimeBackend = {
  name: 'chrome',
  async available() {
    return true;
  },
  async launch(opts: RuntimeLaunchOptions): Promise<BrowserContext> {
    const { proxy, profile, headless, extraArgs, userDataDir } = opts;
    const proxyR = resolveProxy(proxy);
    const args = buildLaunchArgs({
      profile,
      headless,
      extra: extraArgs,
      proxyArgs: proxyR.chromeArgs,
      webrtcIp: opts.webrtcIp,
    });

    // Persistent context (avoids incognito-detection penalty) when userDataDir supplied
    if (userDataDir) {
      for (const channel of CHANNELS_IN_ORDER) {
        try {
          return await chromium.launchPersistentContext(userDataDir, {
            channel,
            headless,
            args,
            ignoreDefaultArgs: IGNORE_DEFAULT_ARGS,
            proxy: proxyR.playwrightProxy,
            viewport: profile.viewport,
            screen: { width: profile.screen.width, height: profile.screen.height },
            deviceScaleFactor: profile.screen.pixelRatio,
            userAgent: profile.ua.ua,
            locale: profile.locale,
            timezoneId: profile.timezone,
            bypassCSP: true,
            ignoreHTTPSErrors: true,
            colorScheme: 'light',
            reducedMotion: 'no-preference',
            forcedColors: 'none',
          });
        } catch { /* fall through to next channel */ }
      }
      // Bundled Chromium fallback
      return await chromium.launchPersistentContext(userDataDir, {
        headless,
        args,
        ignoreDefaultArgs: IGNORE_DEFAULT_ARGS,
        proxy: proxyR.playwrightProxy,
        viewport: profile.viewport,
        userAgent: profile.ua.ua,
        locale: profile.locale,
        timezoneId: profile.timezone,
        bypassCSP: true,
        ignoreHTTPSErrors: true,
      });
    }

    // Non-persistent launch
    let browser;
    let usedChannel: string | undefined;
    for (const channel of CHANNELS_IN_ORDER) {
      try {
        browser = await chromium.launch({
          channel,
          headless,
          args,
          ignoreDefaultArgs: IGNORE_DEFAULT_ARGS,
          proxy: proxyR.playwrightProxy,
        });
        usedChannel = channel;
        break;
      } catch { /* try next */ }
    }
    if (!browser) {
      browser = await chromium.launch({
        headless,
        args,
        ignoreDefaultArgs: IGNORE_DEFAULT_ARGS,
        proxy: proxyR.playwrightProxy,
      });
    }

    return await browser.newContext({
      viewport: profile.viewport,
      screen: { width: profile.screen.width, height: profile.screen.height },
      deviceScaleFactor: profile.screen.pixelRatio,
      userAgent: profile.ua.ua,
      locale: profile.locale,
      timezoneId: profile.timezone,
      bypassCSP: true,
      ignoreHTTPSErrors: true,
      colorScheme: 'light',
      extraHTTPHeaders: { 'Accept-Language': profile.ua.acceptLanguage },
    });
  },
};
