/**
 * Cloudflare challenge detection.
 * Detects Turnstile, JS challenges, managed challenges, and block pages.
 */

import { type Page } from 'playwright';

export interface CloudflareDetection {
  detected: boolean;
  type: 'turnstile' | 'js_challenge' | 'managed_challenge' | 'block' | 'none';
  confidence: number;
}

const CF_TITLE_PATTERNS = [
  /just a moment/i,
  /checking your browser/i,
  /please wait/i,
  /attention required/i,
  /verify you are human/i,
  /enable javascript and cookies to continue/i,
];

const CF_DOM_SIGNALS = [
  '#challenge-running',
  '#challenge-stage',
  '#challenge-success',
  '.challenge-platform',
  '#cf-challenge-running',
  '.cf-browser-verification',
  'iframe[src*="challenges.cloudflare.com"]',
  '#turnstile-wrapper',
  '.cf-turnstile',
  '[data-sitekey]', // Turnstile widget
];

const CF_BODY_SIGNALS = [
  'cf-challenge',
  'cloudflare',
  'ray id',
  'cf-browser-verification',
  'challenges.cloudflare.com',
];

export async function detectCloudflare(page: Page): Promise<CloudflareDetection> {
  try {
    const title = await page.title();
    const url = page.url();

    // Check URL for Cloudflare challenge indicators
    if (url.includes('challenges.cloudflare.com')) {
      return { detected: true, type: 'turnstile', confidence: 0.95 };
    }

    // Check title patterns
    for (const pattern of CF_TITLE_PATTERNS) {
      if (pattern.test(title)) {
        // Determine specific type
        const type = await classifyCfType(page);
        return { detected: true, type, confidence: 0.9 };
      }
    }

    // Check DOM signals
    for (const selector of CF_DOM_SIGNALS) {
      const element = await page.$(selector);
      if (element) {
        const type = await classifyCfType(page);
        return { detected: true, type, confidence: 0.85 };
      }
    }

    // Check body text for CF signals (only in short pages — likely challenge pages)
    const bodyText = await page.evaluate(() => {
      return document.body?.innerText?.substring(0, 2000) || '';
    });

    if (bodyText.length < 1000) {
      for (const signal of CF_BODY_SIGNALS) {
        if (bodyText.toLowerCase().includes(signal)) {
          return { detected: true, type: 'js_challenge', confidence: 0.7 };
        }
      }
    }

    // Check for Turnstile iframe
    const turnstileIframe = await page.$('iframe[src*="challenges.cloudflare.com"]');
    if (turnstileIframe) {
      return { detected: true, type: 'turnstile', confidence: 0.9 };
    }

    return { detected: false, type: 'none', confidence: 0.8 };
  } catch {
    return { detected: false, type: 'none', confidence: 0.5 };
  }
}

async function classifyCfType(page: Page): Promise<CloudflareDetection['type']> {
  // Turnstile = iframe-based widget
  const turnstile = await page.$('iframe[src*="challenges.cloudflare.com"], .cf-turnstile, #turnstile-wrapper');
  if (turnstile) return 'turnstile';

  // Managed challenge = interactive (click/verify)
  const managed = await page.$('#challenge-stage .cf-turnstile-wrapper, .challenge-platform');
  if (managed) return 'managed_challenge';

  // Block page = access denied
  const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
  if (bodyText.toLowerCase().includes('access denied') || bodyText.toLowerCase().includes('error 1020')) {
    return 'block';
  }

  return 'js_challenge';
}
