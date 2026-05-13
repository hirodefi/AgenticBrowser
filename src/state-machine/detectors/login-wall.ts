/**
 * Login wall detection.
 */

import { type Page } from 'playwright';

export interface LoginDetection {
  detected: boolean;
  confidence: number;
  hasLoginForm: boolean;
  hasOAuthButtons: boolean;
}

const LOGIN_TITLE_PATTERNS = [
  /\b(log in|sign in|login|signin)\b/i,
  /\b(authenticate|authentication)\b/i,
  /\b(account)\b.*\b(required|needed)\b/i,
];

const LOGIN_FORM_SELECTORS = [
  'input[type="password"]',
  'form[action*="login"]',
  'form[action*="signin"]',
  'form[action*="auth"]',
  'form[action*="session"]',
  '#login-form',
  '.login-form',
  '#signin-form',
  '.signin-form',
];

const OAUTH_SELECTORS = [
  'a[href*="oauth"]',
  'a[href*="accounts.google.com"]',
  'button:has-text("Sign in with Google")',
  'button:has-text("Sign in with Apple")',
  'button:has-text("Sign in with Facebook")',
  'button:has-text("Continue with Google")',
  'a[href*="github.com/login"]',
  'a[href*="twitter.com/i/oauth"]',
];

export async function detectLoginWall(page: Page): Promise<LoginDetection> {
  try {
    const title = await page.title();
    const url = page.url();

    // URL-based detection
    const urlLoginPatterns = ['/login', '/signin', '/auth/login', '/session/new', '/account/login'];
    const urlMatch = urlLoginPatterns.some(p => url.toLowerCase().includes(p));

    // Title-based detection
    const titleMatch = LOGIN_TITLE_PATTERNS.some(p => p.test(title));

    // Form-based detection
    let hasLoginForm = false;
    for (const selector of LOGIN_FORM_SELECTORS) {
      const el = await page.$(selector).catch(() => null);
      if (el) {
        hasLoginForm = true;
        break;
      }
    }

    // OAuth button detection
    let hasOAuthButtons = false;
    for (const selector of OAUTH_SELECTORS) {
      const el = await page.$(selector).catch(() => null);
      if (el) {
        hasOAuthButtons = true;
        break;
      }
    }

    // Content analysis — check if page is mostly login form with little other content
    const contentAnalysis = await page.evaluate(() => {
      const body = document.body;
      if (!body) return { shortContent: false, hasLoginKeywords: false };

      const text = body.innerText || '';
      const shortContent = text.length < 2000;
      const hasLoginKeywords =
        (text.match(/\b(log in|sign in|login|password|username|email)\b/gi) || []).length >= 2;

      return { shortContent, hasLoginKeywords };
    });

    const signals = [urlMatch, titleMatch, hasLoginForm, hasOAuthButtons,
      contentAnalysis.shortContent && contentAnalysis.hasLoginKeywords];
    const signalCount = signals.filter(Boolean).length;

    return {
      detected: signalCount >= 2,
      confidence: Math.min(0.5 + signalCount * 0.15, 0.95),
      hasLoginForm,
      hasOAuthButtons,
    };
  } catch {
    return { detected: false, confidence: 0.3, hasLoginForm: false, hasOAuthButtons: false };
  }
}
