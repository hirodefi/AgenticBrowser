/**
 * Paywall detection.
 */

import { type Page } from 'playwright';

export interface PaywallDetection {
  detected: boolean;
  confidence: number;
  type: 'hard' | 'soft' | 'metered' | 'none';
}

const PAYWALL_SELECTORS = [
  // Common paywall overlays
  '.paywall',
  '#paywall',
  '.paywall-overlay',
  '.premium-overlay',
  '.subscribe-overlay',
  '.subscription-wall',
  '.metered-wall',
  '.article-paywall',
  // Common membership walls
  '.membership-required',
  '.premium-content',
  '.subscriber-only',
  // Specific known paywalls
  '#gateway-content',
  '.css-gz5mcm', // NYT-style
  '.paywall__content',
];

const PAYWALL_TEXT_PATTERNS = [
  /\b(subscribe|subscription)\b.*\b(read|access|continue|unlock)\b/i,
  /\b(premium|paid)\b.*\b(content|article|membership)\b/i,
  /\b(become a member|join now)\b.*\b(read|access|unlock)\b/i,
  /\b(this article is for|reserved for)\b.*\b(subscribers|members|premium)\b/i,
  /\b(free articles? remaining|articles? left this month)\b/i,
];

export async function detectPaywall(page: Page): Promise<PaywallDetection> {
  try {
    // Check for paywall DOM elements
    for (const selector of PAYWALL_SELECTORS) {
      const el = await page.$(selector).catch(() => null);
      if (el) {
        const visible = await el.isVisible().catch(() => false);
        if (visible) {
          return { detected: true, confidence: 0.85, type: 'hard' };
        }
      }
    }

    // Check for paywall text patterns
    const bodyText = await page.evaluate(() => {
      return document.body?.innerText?.substring(0, 5000) || '';
    });

    for (const pattern of PAYWALL_TEXT_PATTERNS) {
      if (pattern.test(bodyText)) {
        // Determine type
        const isMetered = /remaining|left this month|free articles/i.test(bodyText);
        return {
          detected: true,
          confidence: 0.75,
          type: isMetered ? 'metered' : 'soft',
        };
      }
    }

    // Check for blurred/truncated content
    const hasBlurredContent = await page.evaluate(() => {
      const blurElements = document.querySelectorAll(
        '[style*="filter: blur"], [style*="filter:blur"], ' +
        '[style*="opacity: 0.1"], [style*="opacity:0.1"]'
      );
      return blurElements.length > 0;
    });

    if (hasBlurredContent) {
      return { detected: true, confidence: 0.6, type: 'soft' };
    }

    return { detected: false, confidence: 0.8, type: 'none' };
  } catch {
    return { detected: false, confidence: 0.5, type: 'none' };
  }
}
