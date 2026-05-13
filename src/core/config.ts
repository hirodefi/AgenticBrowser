import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';

export interface BrowserConfig {
  headless: boolean;
  channel: 'chrome' | 'chromium';
  viewport: { width: number; height: number };
  locale: string;
  timezone: string;
  userAgent?: string;
  dataDir: string;
  maxPages: number;
  challengeTimeout: number;
  navigationTimeout: number;
  stealthLevel: 'normal' | 'aggressive';
}

const DEFAULT_CONFIG: BrowserConfig = {
  headless: false,
  channel: 'chrome',
  viewport: { width: 1920, height: 1080 },
  locale: 'en-US',
  timezone: 'America/New_York',
  dataDir: join(homedir(), '.agentic-browser'),
  maxPages: 10,
  challengeTimeout: 30000,
  navigationTimeout: 30000,
  stealthLevel: 'aggressive',
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
  const subdirs = ['profiles', 'cache', 'logs'];
  for (const sub of subdirs) {
    const path = join(dir, sub);
    if (!existsSync(path)) mkdirSync(path, { recursive: true });
  }
  return dir;
}
