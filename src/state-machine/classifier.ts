/**
 * Access State Classifier.
 * Runs all detectors and returns a unified classification.
 */

import { type Page } from 'playwright';
import { AccessState, type AccessResult, type ChallengeType } from './types.js';
import { detectCloudflare } from './detectors/cloudflare.js';
import { detectCaptcha } from './detectors/captcha.js';
import { detectLoginWall } from './detectors/login-wall.js';
import { detectPaywall } from './detectors/paywall.js';
import { detectRateLimit } from './detectors/rate-limit.js';
import { detectErrorPage } from './detectors/error-page.js';

export async function classifyAccessState(page: Page): Promise<AccessResult> {
  // Run all detectors in parallel
  const [cloudflare, captcha, login, paywall, rateLimit, error] = await Promise.all([
    detectCloudflare(page),
    detectCaptcha(page),
    detectLoginWall(page),
    detectPaywall(page),
    detectRateLimit(page),
    detectErrorPage(page),
  ]);

  // Priority order: error > challenge > captcha > login > paywall > rate limit > readable
  // Errors are highest priority — page is fundamentally broken
  if (error.detected && error.confidence >= 0.7) {
    return {
      state: mapErrorToState(error.type),
      confidence: error.confidence,
      canRecover: error.type !== 'dns_error',
      recommendedAction: error.type === 'dns_error'
        ? 'URL may be invalid or DNS is failing'
        : 'Try reloading or using a different URL',
      details: { errorType: error.type },
    };
  }

  // Cloudflare challenges — auto-solvable with stealth browser
  if (cloudflare.detected && cloudflare.confidence >= 0.7) {
    return {
      state: AccessState.CHALLENGE_REQUIRED,
      confidence: cloudflare.confidence,
      challengeType: mapCfType(cloudflare.type),
      canRecover: cloudflare.type !== 'block',
      recommendedAction: cloudflare.type === 'block'
        ? 'IP may be blocked by Cloudflare'
        : 'Waiting for challenge to resolve automatically',
      details: { challengeType: cloudflare.type },
    };
  }

  // CAPTCHA challenges — auto-solvable
  if (captcha.detected && captcha.confidence >= 0.7) {
    return {
      state: AccessState.CHALLENGE_REQUIRED,
      confidence: captcha.confidence,
      challengeType: captcha.type as ChallengeType,
      canRecover: true,
      recommendedAction: 'Attempting to solve CAPTCHA automatically',
      details: { captchaType: captcha.type, iframeSrc: captcha.iframeSrc },
    };
  }

  // Login walls
  if (login.detected && login.confidence >= 0.7) {
    return {
      state: AccessState.LOGIN_REQUIRED,
      confidence: login.confidence,
      canRecover: login.hasLoginForm,
      recommendedAction: login.hasLoginForm
        ? 'Login form detected — credentials needed'
        : 'OAuth login detected — session delegation needed',
      details: { hasLoginForm: login.hasLoginForm, hasOAuthButtons: login.hasOAuthButtons },
    };
  }

  // Paywalls
  if (paywall.detected && paywall.confidence >= 0.7) {
    return {
      state: AccessState.PAYWALL_REQUIRED,
      confidence: paywall.confidence,
      canRecover: paywall.type === 'soft' || paywall.type === 'metered',
      recommendedAction: paywall.type === 'metered'
        ? 'Metered paywall — may be able to read partial content'
        : 'Hard paywall detected — content requires subscription',
      details: { paywallType: paywall.type },
    };
  }

  // Rate limits
  if (rateLimit.detected && rateLimit.confidence >= 0.7) {
    return {
      state: AccessState.RATE_LIMITED,
      confidence: rateLimit.confidence,
      canRecover: true,
      recommendedAction: rateLimit.retryAfter
        ? `Rate limited — retry after ${rateLimit.retryAfter}s`
        : 'Rate limited — wait before retrying',
      details: { retryAfter: rateLimit.retryAfter },
    };
  }

  // Page loaded successfully — determine readability
  const readability = await assessReadability(page);

  if (readability.isReadable) {
    return {
      state: readability.hasInteractiveElements
        ? AccessState.INTERACTIVE
        : AccessState.READABLE,
      confidence: readability.confidence,
      canRecover: false,
      recommendedAction: 'Page is fully accessible',
    };
  }

  // Page loaded but content is unclear
  return {
    state: AccessState.UNKNOWN,
    confidence: 0.5,
    canRecover: true,
    recommendedAction: 'Page loaded but state unclear — try reading content',
  };
}

function mapErrorToState(type: string): AccessState {
  switch (type) {
    case '403': return AccessState.BLOCKED;
    case '503': return AccessState.CHALLENGE_REQUIRED;
    case 'dns_error':
    case 'timeout': return AccessState.BROKEN;
    case '404':
    case '500':
    default: return AccessState.BROKEN;
  }
}

function mapCfType(type: string): ChallengeType {
  switch (type) {
    case 'turnstile': return 'cloudflare_turnstile';
    case 'js_challenge': return 'cloudflare_js';
    case 'managed_challenge': return 'cloudflare_managed';
    default: return 'unknown';
  }
}

async function assessReadability(page: Page): Promise<{
  isReadable: boolean;
  hasInteractiveElements: boolean;
  confidence: number;
}> {
  try {
    const analysis = await page.evaluate(() => {
      const body = document.body;
      if (!body) return { textLength: 0, hasInteractive: false, hasMain: false, paragraphCount: 0 };

      const text = body.innerText || '';
      const paragraphs = document.querySelectorAll('p, article, [role="article"], main, .content, .post, .entry');
      const interactive = document.querySelectorAll(
        'button:not([hidden]), a[href]:not([hidden]), input:not([hidden]), select:not([hidden]), [role="button"]:not([hidden])'
      );
      const mainContent = document.querySelector('main, article, [role="main"], .content, .post-content, .article-content');

      return {
        textLength: text.length,
        hasInteractive: interactive.length > 3,
        hasMain: !!mainContent || paragraphs.length > 2,
        paragraphCount: paragraphs.length,
      };
    });

    const isReadable = analysis.textLength > 200 && analysis.hasMain;
    const confidence = isReadable
      ? Math.min(0.6 + (analysis.textLength / 5000) * 0.3, 0.95)
      : 0.4;

    return {
      isReadable,
      hasInteractiveElements: analysis.hasInteractive,
      confidence,
    };
  } catch {
    return { isReadable: false, hasInteractiveElements: false, confidence: 0.3 };
  }
}
