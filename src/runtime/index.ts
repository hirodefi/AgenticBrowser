/**
 * Runtime selector.
 *
 * Auto-picks the strongest available backend: `patched` when the custom
 * binary is installed, else `chrome` (real Chrome / Edge / bundled Chromium).
 * Override with AGENTIC_BROWSER_BACKEND=chrome|patched.
 */

import type { BackendName, RuntimeBackend } from './types.js';
import { chromeBackend } from './chrome-backend.js';
import { patchedBackend } from './patched-backend.js';

export type { BackendName, RuntimeBackend, RuntimeLaunchOptions } from './types.js';
export { chromeBackend, patchedBackend };

export async function selectBackend(forced?: BackendName): Promise<RuntimeBackend> {
  const want = forced ?? (process.env.AGENTIC_BROWSER_BACKEND as BackendName | undefined);
  if (want === 'chrome') return chromeBackend;
  if (want === 'patched') return patchedBackend;
  if (await patchedBackend.available()) return patchedBackend;
  return chromeBackend;
}
