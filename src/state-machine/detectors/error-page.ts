/**
 * Error page detection — 404, 500, broken pages.
 */

import { type Page } from 'playwright';

export interface ErrorDetection {
  detected: boolean;
  confidence: number;
  statusCode?: number;
  type: '404' | '500' | '403' | '503' | 'dns_error' | 'timeout' | 'other' | 'none';
}

const ERROR_PATTERNS: Array<{ pattern: RegExp; type: ErrorDetection['type'] }> = [
  { pattern: /\b404\b/, type: '404' },
  { pattern: /\bnot found\b/i, type: '404' },
  { pattern: /\bpage (doesn't exist|not found|could not be found)\b/i, type: '404' },
  { pattern: /\b500\b/, type: '500' },
  { pattern: /\binternal server error\b/i, type: '500' },
  { pattern: /\b503\b/, type: '503' },
  { pattern: /\bservice (unavailable|temporarily)\b/i, type: '503' },
  { pattern: /\b403\b/, type: '403' },
  { pattern: /\bforbidden\b/i, type: '403' },
  { pattern: /\baccess denied\b/i, type: '403' },
  { pattern: /\bdnserror|dns_probe|err_name_not_resolved\b/i, type: 'dns_error' },
  { pattern: /\bconnection (refused|reset|timed out|failed)\b/i, type: 'timeout' },
  { pattern: /\berr_connection\b/i, type: 'timeout' },
];

export async function detectErrorPage(page: Page): Promise<ErrorDetection> {
  try {
    const title = await page.title();
    const url = page.url();

    // Check for Chrome error pages
    if (url.startsWith('chrome-error://')) {
      if (url.includes('dnserror')) return { detected: true, confidence: 0.95, type: 'dns_error' };
      if (url.includes('connection')) return { detected: true, confidence: 0.95, type: 'timeout' };
      return { detected: true, confidence: 0.9, type: 'other' };
    }

    const bodyText = await page.evaluate(() => {
      return document.body?.innerText?.substring(0, 2000) || '';
    });

    const combined = `${title} ${bodyText}`;

    for (const { pattern, type } of ERROR_PATTERNS) {
      if (pattern.test(combined)) {
        return { detected: true, confidence: 0.8, type };
      }
    }

    // Check if page is suspiciously empty (might be broken)
    const isEmpty = bodyText.trim().length < 50 && title.trim().length < 5;
    if (isEmpty) {
      return { detected: true, confidence: 0.5, type: 'other' };
    }

    return { detected: false, confidence: 0.8, type: 'none' };
  } catch {
    return { detected: false, confidence: 0.5, type: 'none' };
  }
}
