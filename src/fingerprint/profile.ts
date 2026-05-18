/**
 * Coherent fingerprint profile.
 *
 * Every value here is derived from the launch seed and stays internally
 * consistent: the GPU string matches the platform, sec-ch-ua matches the UA,
 * hardware concurrency matches the device class, screen dims match the
 * available work area, languages match the locale. Detection sites that
 * cross-check fields against each other find no mismatches.
 */

import { rng, type SeedRng } from './seed.js';

export type FpPlatform = 'mac' | 'win' | 'linux';

export interface ScreenProfile {
  width: number;
  height: number;
  availWidth: number;
  availHeight: number;
  colorDepth: number;
  pixelDepth: number;
  pixelRatio: number;
}

export interface UaProfile {
  ua: string;
  platform: string;
  acceptLanguage: string;
  brands: { brand: string; version: string }[];
  fullVersion: string;
  uaPlatform: string;
  uaPlatformVersion: string;
  architecture: string;
  bitness: string;
  model: string;
  mobile: boolean;
}

export interface GpuProfile {
  vendor: string;
  renderer: string;
  unmaskedVendor: string;
  unmaskedRenderer: string;
}

export interface FingerprintProfile {
  platform: FpPlatform;
  ua: UaProfile;
  screen: ScreenProfile;
  viewport: { width: number; height: number };
  gpu: GpuProfile;
  hardwareConcurrency: number;
  deviceMemory: number;
  maxTouchPoints: number;
  timezone: string;
  locale: string;
  languages: string[];
  audioNoise: number;
  canvasNoise: number;
  fontSeed: number;
}

const CHROME_MAJOR = 138;
const CHROME_FULL = `${CHROME_MAJOR}.0.0.0`;

const GPU_PROFILES = {
  win: [
    {
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      unmaskedVendor: 'Google Inc. (NVIDIA)',
      unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    },
    {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      unmaskedVendor: 'Google Inc. (Intel)',
      unmaskedRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    },
    {
      vendor: 'Google Inc. (AMD)',
      renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
      unmaskedVendor: 'Google Inc. (AMD)',
      unmaskedRenderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
    },
  ],
  mac: [
    {
      vendor: 'Google Inc. (Apple)',
      renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
      unmaskedVendor: 'Google Inc. (Apple)',
      unmaskedRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
    },
    {
      vendor: 'Google Inc. (Apple)',
      renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)',
      unmaskedVendor: 'Google Inc. (Apple)',
      unmaskedRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)',
    },
  ],
  linux: [
    {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)',
      unmaskedVendor: 'Google Inc. (Intel)',
      unmaskedRenderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)',
    },
  ],
} as const;

const SCREEN_PROFILES: Record<FpPlatform, ScreenProfile[]> = {
  win: [
    { width: 1920, height: 1080, availWidth: 1920, availHeight: 1032, colorDepth: 24, pixelDepth: 24, pixelRatio: 1 },
    { width: 2560, height: 1440, availWidth: 2560, availHeight: 1392, colorDepth: 24, pixelDepth: 24, pixelRatio: 1 },
    { width: 1536, height: 864, availWidth: 1536, availHeight: 816, colorDepth: 24, pixelDepth: 24, pixelRatio: 1.25 },
  ],
  mac: [
    { width: 1728, height: 1117, availWidth: 1728, availHeight: 1080, colorDepth: 30, pixelDepth: 30, pixelRatio: 2 },
    { width: 1512, height: 982, availWidth: 1512, availHeight: 945, colorDepth: 30, pixelDepth: 30, pixelRatio: 2 },
  ],
  linux: [
    { width: 1920, height: 1080, availWidth: 1920, availHeight: 1053, colorDepth: 24, pixelDepth: 24, pixelRatio: 1 },
  ],
};

const HW_CONCURRENCY: Record<FpPlatform, number[]> = {
  win: [8, 12, 16],
  mac: [8, 10, 12],
  linux: [4, 8, 16],
};

const DEVICE_MEMORY: Record<FpPlatform, number[]> = {
  win: [8, 16, 32],
  mac: [8, 16],
  linux: [4, 8, 16],
};

/**
 * Coherent region picks: timezone and locale always come from the same row,
 * so we never end up with Tokyo + en-CA or Berlin + en-US.
 */
const REGIONS: { locale: string; timezones: string[] }[] = [
  { locale: 'en-US', timezones: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'] },
  { locale: 'en-GB', timezones: ['Europe/London'] },
  { locale: 'en-CA', timezones: ['America/Toronto', 'America/Vancouver'] },
  { locale: 'en-AU', timezones: ['Australia/Sydney', 'Australia/Melbourne'] },
];

function uaFor(platform: FpPlatform, locale: string): UaProfile {
  if (platform === 'mac') {
    return {
      ua: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_FULL} Safari/537.36`,
      platform: 'MacIntel',
      acceptLanguage: `${locale},${locale.split('-')[0]};q=0.9`,
      brands: brandsFor(),
      fullVersion: CHROME_FULL,
      uaPlatform: 'macOS',
      uaPlatformVersion: '14.5.0',
      architecture: 'arm',
      bitness: '64',
      model: '',
      mobile: false,
    };
  }
  if (platform === 'linux') {
    return {
      ua: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_FULL} Safari/537.36`,
      platform: 'Linux x86_64',
      acceptLanguage: `${locale},${locale.split('-')[0]};q=0.9`,
      brands: brandsFor(),
      fullVersion: CHROME_FULL,
      uaPlatform: 'Linux',
      uaPlatformVersion: '6.5.0',
      architecture: 'x86',
      bitness: '64',
      model: '',
      mobile: false,
    };
  }
  return {
    ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_FULL} Safari/537.36`,
    platform: 'Win32',
    acceptLanguage: `${locale},${locale.split('-')[0]};q=0.9`,
    brands: brandsFor(),
    fullVersion: CHROME_FULL,
    uaPlatform: 'Windows',
    uaPlatformVersion: '15.0.0',
    architecture: 'x86',
    bitness: '64',
    model: '',
    mobile: false,
  };
}

function brandsFor(): { brand: string; version: string }[] {
  return [
    { brand: 'Not.A/Brand', version: '99' },
    { brand: 'Chromium', version: String(CHROME_MAJOR) },
    { brand: 'Google Chrome', version: String(CHROME_MAJOR) },
  ];
}

function detectHostPlatform(): FpPlatform {
  switch (process.platform) {
    case 'darwin': return 'mac';
    case 'win32': return 'win';
    default: return 'linux';
  }
}

export interface ProfileOverrides {
  platform?: FpPlatform;
  timezone?: string;
  locale?: string;
  viewport?: { width: number; height: number };
}

let cached: FingerprintProfile | null = null;

export function buildProfile(overrides: ProfileOverrides = {}): FingerprintProfile {
  const r: SeedRng = rng();
  const platform: FpPlatform = overrides.platform ?? detectHostPlatform();
  const region = r.pick(REGIONS);
  const locale = overrides.locale ?? region.locale;
  const timezone = overrides.timezone ?? r.pick(region.timezones);
  const screen = r.pick(SCREEN_PROFILES[platform]);
  const gpu = r.pick(GPU_PROFILES[platform] as readonly GpuProfile[]);
  const ua = uaFor(platform, locale);
  const viewport = overrides.viewport ?? {
    width: screen.availWidth,
    height: screen.availHeight - 85,
  };
  const languages = [locale, locale.split('-')[0]];
  return {
    platform,
    ua,
    screen,
    viewport,
    gpu,
    hardwareConcurrency: r.pick(HW_CONCURRENCY[platform]),
    deviceMemory: r.pick(DEVICE_MEMORY[platform]),
    maxTouchPoints: platform === 'mac' ? 0 : 0,
    timezone,
    locale,
    languages,
    audioNoise: r.floatRange(0.999_995, 1.000_005),
    canvasNoise: r.floatRange(0.000_001, 0.000_004),
    fontSeed: r.intRange(1, 1_000_000),
  };
}

export function getProfile(overrides?: ProfileOverrides): FingerprintProfile {
  if (!cached) cached = buildProfile(overrides);
  return cached;
}

export function resetProfile(): void {
  cached = null;
}
