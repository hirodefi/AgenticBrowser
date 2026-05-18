/**
 * Runtime backend interface.
 *
 * A backend is anything that can launch a Chromium-protocol-speaking browser
 * context. The default backend (`chrome`) drives the user's installed Chrome
 * via Playwright. A future backend (`patched`) will drive a custom Chromium
 * build with source-level fingerprint patches — see ../../runtime-binary/.
 *
 * The TypeScript surface stays identical between backends. Choosing a backend
 * is a runtime switch, not an API change.
 */

import type { BrowserContext } from 'playwright';
import type { FingerprintProfile } from '../fingerprint/profile.js';
import type { ProxyInput } from '../network/proxy.js';

export type BackendName = 'chrome' | 'patched';

export interface RuntimeLaunchOptions {
  headless: boolean;
  profile: FingerprintProfile;
  proxy?: ProxyInput;
  userDataDir?: string;
  extraArgs?: string[];
  webrtcIp?: string;
}

export interface RuntimeBackend {
  name: BackendName;
  available(): Promise<boolean>;
  launch(opts: RuntimeLaunchOptions): Promise<BrowserContext>;
}
