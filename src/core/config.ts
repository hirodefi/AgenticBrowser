import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import type { ProxyInput } from '../network/proxy.js';
import type { BehaviorPreset, BehaviorConfig } from '../behavior/config.js';
import type { BackendName } from '../runtime/index.js';

export interface BrowserConfig {
  headless: boolean;
  backend?: BackendName;
  proxy?: ProxyInput;
  geoFromProxy: boolean;
  viewport?: { width: number; height: number };
  locale?: string;
  timezone?: string;
  fingerprintPlatform?: 'mac' | 'win' | 'linux';
  userAgent?: string;
  dataDir: string;
  persistentProfile: boolean;
  profileName: string;
  maxPages: number;
  challengeTimeout: number;
  navigationTimeout: number;
  behaviorPreset: BehaviorPreset;
  behaviorOverrides?: Partial<BehaviorConfig>;
  extraArgs?: string[];
}

const DEFAULT_CONFIG: BrowserConfig = {
  headless: false,
  geoFromProxy: true,
  dataDir: join(homedir(), '.agentic-browser'),
  persistentProfile: true,
  profileName: 'default',
  maxPages: 10,
  challengeTimeout: 30000,
  navigationTimeout: 45000,
  behaviorPreset: 'relaxed',
};

let config: BrowserConfig = { ...DEFAULT_CONFIG };

export function getConfig(): BrowserConfig {
  return config;
}

export function updateConfig(partial: Partial<BrowserConfig>): BrowserConfig {
  config = { ...config, ...partial };
  return config;
}

export function initDataDir(): string {
  const dir = config.dataDir;
  for (const sub of ['profiles', 'cache', 'logs']) {
    const path = join(dir, sub);
    if (!existsSync(path)) mkdirSync(path, { recursive: true });
  }
  return dir;
}

export function profileDir(name = config.profileName): string {
  const dir = join(initDataDir(), 'profiles', name);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
