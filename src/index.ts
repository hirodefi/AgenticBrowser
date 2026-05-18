/**
 * AgenticBrowser — fully autonomous browser runtime for AI agents.
 */

export { openUrl } from './commands/open.js';
export { observePage } from './commands/observe.js';
export { readContent } from './commands/read.js';
export { actOnPage } from './commands/act.js';
export { extractData } from './commands/extract.js';
export { verifyGoal } from './commands/verify.js';
export { recoverAccess } from './commands/recover.js';
export { debugPage } from './commands/debug.js';
export { navigate } from './commands/navigate.js';

export {
  launchBrowser,
  closeBrowser,
  getPage,
  newPage,
  getFingerprint,
  getBehavior,
  getContext,
} from './core/browser.js';

export { getConfig, updateConfig } from './core/config.js';

export { selectBackend, chromeBackend, patchedBackend } from './runtime/index.js';
export type { BackendName, RuntimeBackend, RuntimeLaunchOptions } from './runtime/index.js';

export { buildProfile, getProfile, resetProfile } from './fingerprint/profile.js';
export type { FingerprintProfile, FpPlatform } from './fingerprint/profile.js';

export { resolvePreset, RELAXED, CAREFUL } from './behavior/config.js';
export type { BehaviorConfig, BehaviorPreset } from './behavior/config.js';

export { AccessState } from './state-machine/types.js';
export type {
  AccessResult, PageObservation, ReadResult, ActionResult, VerifyResult, ExtractResult, DebugBundle,
} from './state-machine/types.js';
