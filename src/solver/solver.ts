/**
 * Autonomous challenge solver orchestrator.
 * Detects and resolves page challenges automatically — no human needed.
 */

import { type Page } from 'playwright';
import { classifyAccessState } from '../state-machine/classifier.js';
import { AccessState, type AccessResult, type ChallengeType } from '../state-machine/types.js';
import { solveCloudflareChallenge, type SolveResult as CfSolveResult } from './cloudflare.js';
import { solveCaptcha, type CaptchaSolveResult } from './captcha.js';

export interface AutoSolveResult {
  originalState: AccessResult;
  finalState: AccessResult;
  challengesAttempted: number;
  challengesSolved: number;
  totalTime: number;
  methods: string[];
}

/**
 * Main entry point: classify page, solve any challenges, return result.
 * This runs automatically when a page loads — the agent never sees challenges.
 */
export async function autoSolveChallenges(page: Page, maxAttempts = 3): Promise<AutoSolveResult> {
  const start = Date.now();
  const methods: string[] = [];
  let challengesAttempted = 0;
  let challengesSolved = 0;

  // Initial classification
  let current = await classifyAccessState(page);
  const original = { ...current };

  // Loop: solve challenges until page is accessible or we exhaust attempts
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (current.state === AccessState.READABLE ||
        current.state === AccessState.INTERACTIVE) {
      break; // We're good
    }

    if (current.state === AccessState.CHALLENGE_REQUIRED) {
      challengesAttempted++;
      const solved = await handleChallenge(page, current.challengeType);
      if (solved.solved) {
        challengesSolved++;
        methods.push(solved.method);
      }
      // Re-classify after solving attempt
      await page.waitForTimeout(1500);
      current = await classifyAccessState(page);
      continue;
    }

    if (current.state === AccessState.RATE_LIMITED) {
      // Wait and retry
      const waitTime = current.details?.retryAfter || 5;
      const waitMs = Math.min(waitTime * 1000, 10000); // Cap at 10s
      await page.waitForTimeout(waitMs);
      await page.reload().catch(() => {});
      await page.waitForTimeout(2000);
      current = await classifyAccessState(page);
      methods.push(`rate_limit_wait_${waitTime}s`);
      continue;
    }

    // LOGIN_REQUIRED, PAYWALL_REQUIRED, BLOCKED, BROKEN — can't auto-solve
    break;
  }

  return {
    originalState: original,
    finalState: current,
    challengesAttempted,
    challengesSolved,
    totalTime: Date.now() - start,
    methods,
  };
}

async function handleChallenge(
  page: Page,
  challengeType?: ChallengeType,
): Promise<{ solved: boolean; method: string }> {
  if (!challengeType) {
    // Unknown challenge — try generic approaches
    const captchaResult = await solveCaptcha(page);
    if (captchaResult.solved) return captchaResult;

    const cfResult = await solveCloudflareChallenge(page);
    return { solved: cfResult.solved, method: cfResult.method };
  }

  switch (challengeType) {
    case 'cloudflare_turnstile':
    case 'cloudflare_js':
    case 'cloudflare_managed': {
      const result = await solveCloudflareChallenge(page);
      return { solved: result.solved, method: result.method };
    }

    case 'recaptcha_v2':
    case 'recaptcha_v3':
    case 'hcaptcha':
    case 'simple_click': {
      const result = await solveCaptcha(page);
      return { solved: result.solved, method: result.method };
    }

    default: {
      // Try both
      const cfResult = await solveCloudflareChallenge(page);
      if (cfResult.solved) return { solved: true, method: cfResult.method };

      const captchaResult = await solveCaptcha(page);
      return { solved: captchaResult.solved, method: captchaResult.method };
    }
  }
}
