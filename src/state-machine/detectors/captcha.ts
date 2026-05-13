/**
 * CAPTCHA detection — reCAPTCHA, hCaptcha, simple click CAPTCHAs.
 */

import { type Page } from 'playwright';

export interface CaptchaDetection {
  detected: boolean;
  type: 'recaptcha_v2' | 'recaptcha_v3' | 'hcaptcha' | 'simple_click' | 'none';
  confidence: number;
  iframeSrc?: string;
}

export async function detectCaptcha(page: Page): Promise<CaptchaDetection> {
  try {
    const frames = page.frames();

    // Check for reCAPTCHA
    for (const frame of frames) {
      const src = frame.url();
      if (src.includes('google.com/recaptcha') || src.includes('recaptcha.net')) {
        // Determine v2 vs v3
        // v2 has a checkbox, v3 is invisible/score-based
        const hasCheckbox = await frame.$('.recaptcha-checkbox').catch(() => null);
        return {
          detected: true,
          type: hasCheckbox ? 'recaptcha_v2' : 'recaptcha_v3',
          confidence: 0.95,
          iframeSrc: src,
        };
      }

      // Check for hCaptcha
      if (src.includes('hcaptcha.com')) {
        return {
          detected: true,
          type: 'hcaptcha',
          confidence: 0.95,
          iframeSrc: src,
        };
      }
    }

    // Check for reCAPTCHA elements in main frame
    const recaptchaScript = await page.$('script[src*="recaptcha"]');
    if (recaptchaScript) {
      const src = await recaptchaScript.getAttribute('src') || '';
      const isV3 = src.includes('render=') && !src.includes('size=compact');
      return {
        detected: true,
        type: isV3 ? 'recaptcha_v3' : 'recaptcha_v2',
        confidence: 0.8,
      };
    }

    // Check for hCaptcha elements
    const hcaptchaScript = await page.$('script[src*="hcaptcha"]');
    if (hcaptchaScript) {
      return { detected: true, type: 'hcaptcha', confidence: 0.8 };
    }

    // Check for simple click CAPTCHAs (common patterns)
    const simpleClickPatterns = [
      'button:has-text("I\'m not a robot")',
      'button:has-text("Verify")',
      '.captcha-checkbox',
      '#captcha-response',
    ];
    for (const pattern of simpleClickPatterns) {
      const el = await page.$(pattern).catch(() => null);
      if (el) {
        return { detected: true, type: 'simple_click', confidence: 0.6 };
      }
    }

    return { detected: false, type: 'none', confidence: 0.8 };
  } catch {
    return { detected: false, type: 'none', confidence: 0.5 };
  }
}
