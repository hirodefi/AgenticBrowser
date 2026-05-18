/**
 * Patched-binary backend (forward-looking, not yet built).
 *
 * When the binary is present at the resolved path, this backend launches it
 * exactly the same way the chrome backend would — but no JS init scripts are
 * needed because the binary already has fingerprint surfaces patched at the
 * C++ / V8 binding level. See runtime-binary/ for build status and the patch
 * manifest.
 *
 * Selection is automatic: if available() returns true, this backend wins.
 */

import path from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { chromium, type BrowserContext } from 'playwright';
import type { RuntimeBackend, RuntimeLaunchOptions } from './types.js';
import { buildLaunchArgs, IGNORE_DEFAULT_ARGS } from '../network/args.js';
import { resolveProxy } from '../network/proxy.js';

function resolveBinaryPath(): string | undefined {
  const env = process.env.AGENTIC_BROWSER_BINARY;
  if (env && existsSync(env)) return env;

  const platform = process.platform;
  const candidates: string[] = [];
  const base = path.join(homedir(), '.agentic-browser', 'binary');
  if (platform === 'darwin') {
    candidates.push(path.join(base, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'));
  } else if (platform === 'win32') {
    candidates.push(path.join(base, 'chrome.exe'));
  } else {
    candidates.push(path.join(base, 'chrome'));
  }
  return candidates.find((c) => existsSync(c));
}

export const patchedBackend: RuntimeBackend = {
  name: 'patched',
  async available() {
    return Boolean(resolveBinaryPath());
  },
  async launch(opts: RuntimeLaunchOptions): Promise<BrowserContext> {
    const executablePath = resolveBinaryPath();
    if (!executablePath) {
      throw new Error('patched backend selected but binary not present');
    }
    const { profile, headless, extraArgs, userDataDir, proxy } = opts;
    const proxyR = resolveProxy(proxy);
    const args = buildLaunchArgs({
      profile,
      headless,
      extra: extraArgs,
      proxyArgs: proxyR.chromeArgs,
      webrtcIp: opts.webrtcIp,
    });

    if (userDataDir) {
      return await chromium.launchPersistentContext(userDataDir, {
        executablePath,
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
    const browser = await chromium.launch({
      executablePath,
      headless,
      args,
      ignoreDefaultArgs: IGNORE_DEFAULT_ARGS,
      proxy: proxyR.playwrightProxy,
    });
    return await browser.newContext({
      viewport: profile.viewport,
      userAgent: profile.ua.ua,
      locale: profile.locale,
      timezoneId: profile.timezone,
      bypassCSP: true,
      ignoreHTTPSErrors: true,
    });
  },
};
