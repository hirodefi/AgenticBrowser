/**
 * Open command.
 * Navigates to URL, auto-solves challenges, returns access state.
 */

import { type Page } from 'playwright';
import { getPage } from '../core/browser.js';
import { getConfig } from '../core/config.js';
import { autoSolveChallenges } from '../solver/solver.js';
import { classifyAccessState } from '../state-machine/classifier.js';
import { AccessState, type AccessResult } from '../state-machine/types.js';
import { extractMetadata } from '../reading/structured-data.js';

export interface OpenResult {
  status: 'opened' | 'error';
  url: string;
  finalUrl: string;
  title: string;
  accessState: AccessState;
  accessResult: AccessResult;
  challengesSolved: number;
  loadTime: number;
  metadata: Record<string, any>;
}

export async function openUrl(url: string, options?: { goal?: string }): Promise<OpenResult> {
  const start = Date.now();
  const config = getConfig();
  const page = await getPage();

  try {
    // Navigate to URL
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config.navigationTimeout,
    });

    // Wait for initial load
    await page.waitForTimeout(1000);

    // Auto-solve any challenges (this is the magic)
    const solveResult = await autoSolveChallenges(page);

    // Final classification
    const finalState = await classifyAccessState(page);
    const title = await page.title();
    const finalUrl = page.url();
    const metadata = await extractMetadata(page);

    return {
      status: finalState.state === AccessState.READABLE ||
              finalState.state === AccessState.INTERACTIVE
        ? 'opened'
        : 'error',
      url,
      finalUrl,
      title,
      accessState: finalState.state,
      accessResult: finalState,
      challengesSolved: solveResult.challengesSolved,
      loadTime: Date.now() - start,
      metadata: metadata as any,
    };
  } catch (error: any) {
    return {
      status: 'error',
      url,
      finalUrl: page.url(),
      title: '',
      accessState: AccessState.BROKEN,
      accessResult: {
        state: AccessState.BROKEN,
        confidence: 1,
        canRecover: true,
        recommendedAction: error.message,
      },
      challengesSolved: 0,
      loadTime: Date.now() - start,
      metadata: {},
    };
  }
}
