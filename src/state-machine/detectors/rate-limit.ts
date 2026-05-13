/**
 * Rate limit detection.
 */

import { type Page } from 'playwright';

export interface RateLimitDetection {
  detected: boolean;
  confidence: number;
  retryAfter?: number;
}

const RATE_LIMIT_PATTERNS = [
  /\b(rate limit|too many requests|slow down)\b/i,
  /\b(try again)\b.*\b(later|in \d|minutes?|seconds?)\b/i,
  /\b(429)\b/,
  /\b(requests? (per|\/) (second|minute|hour|day))\b/i,
  /\b(exceeded|quota|limit reached)\b/i,
];

export async function detectRateLimit(page: Page): Promise<RateLimitDetection> {
  try {
    const title = await page.title();
    const bodyText = await page.evaluate(() => {
      return document.body?.innerText?.substring(0, 3000) || '';
    });

    const combined = `${title} ${bodyText}`;

    let matchCount = 0;
    for (const pattern of RATE_LIMIT_PATTERNS) {
      if (pattern.test(combined)) matchCount++;
    }

    // Try to extract retry-after from text
    let retryAfter: number | undefined;
    const retryMatch = combined.match(/try again in (\d+)\s*(second|minute|hour)/i);
    if (retryMatch) {
      const num = parseInt(retryMatch[1]);
      const unit = retryMatch[2].toLowerCase();
      const multipliers: Record<string, number> = { second: 1, minute: 60, hour: 3600 };
      retryAfter = num * (multipliers[unit] || 1);
    }

    return {
      detected: matchCount >= 1,
      confidence: Math.min(0.5 + matchCount * 0.2, 0.9),
      retryAfter,
    };
  } catch {
    return { detected: false, confidence: 0.5 };
  }
}
