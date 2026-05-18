/**
 * Chromium launch arguments.
 *
 * Stealth-relevant defaults: kill automation-control flags, kill the
 * SwiftShader leak in headed mode, kill background-throttling that creates
 * detectable idle patterns, disable cross-origin tab discovery features
 * that allow third parties to fingerprint via cross-context timing.
 */

import type { FingerprintProfile } from '../fingerprint/profile.js';

export interface ArgBuildOptions {
  profile: FingerprintProfile;
  headless: boolean;
  extra?: string[];
  proxyArgs?: string[];
  webrtcIp?: string;
}

export const IGNORE_DEFAULT_ARGS = [
  '--enable-automation',
  '--enable-blink-features=IdleDetection',
  '--use-mock-keychain',
];

export function buildLaunchArgs(opts: ArgBuildOptions): string[] {
  const { profile: p, headless } = opts;
  const map = new Map<string, string>();
  const add = (flag: string) => map.set(flag.split('=')[0], flag);

  // Core anti-automation
  add('--disable-blink-features=AutomationControlled');
  add('--no-first-run');
  add('--no-default-browser-check');
  add('--no-service-autorun');
  add('--password-store=basic');
  add('--disable-features=IsolateOrigins,site-per-process,AutomationControlled,Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,CalculateNativeWinOcclusion,InterestFeedContentSuggestions,CertificateTransparencyComponentUpdater,AcceptCHFrame,AvoidUnnecessaryBeforeUnloadCheckSync,IsolateOriginsTrial,PrivacySandboxSettings4');
  add('--enable-features=NetworkServiceInProcess2,NetworkService');

  // Stability / noise reduction
  add('--disable-background-timer-throttling');
  add('--disable-backgrounding-occluded-windows');
  add('--disable-renderer-backgrounding');
  add('--disable-breakpad');
  add('--disable-component-update');
  add('--disable-domain-reliability');
  add('--disable-hang-monitor');
  add('--disable-infobars');
  add('--disable-prompt-on-repost');
  add('--disable-sync');
  add('--metrics-recording-only');
  add('--disable-client-side-phishing-detection');
  add('--disable-default-apps');
  add('--disable-popup-blocking');
  add('--disable-translate');

  // Coherent locale + viewport
  add(`--lang=${p.locale}`);
  add(`--window-size=${p.viewport.width},${p.viewport.height}`);

  // GPU: real GPU in headed mode (no SwiftShader leak)
  if (!headless) add('--ignore-gpu-blocklist');

  // WebRTC: scrub local IPs
  add('--force-webrtc-ip-handling-policy=default_public_interface_only');
  if (opts.webrtcIp) add(`--webrtc-ip-handling-policy=default_public_interface_only`);

  // Proxy
  for (const a of opts.proxyArgs ?? []) add(a);

  // User extras
  for (const a of opts.extra ?? []) add(a);

  return Array.from(map.values());
}
